import type { AnswerSource, ChatConversationDetail, ChatMessage, ChatStreamEvent, MarkdownBlock } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { applyStreamEvent, type LiveReply, readChatEvents } from "./chat-data";
import { readAbout } from "./chat-home";
import { isMissing, modelFacts } from "./model-picker";
import { markersIn } from "./reply-body";
import { Transcript, type TranscriptActions, tookWords, whenWords } from "./transcript";

const paragraph = (text: string): MarkdownBlock => ({ t: "paragraph", c: [{ t: "text", v: text }] });

const base: ChatMessage = {
  id: "m",
  role: "assistant",
  text: "",
  blocks: [],
  state: "complete",
  failure: null,
  notice: null,
  model: "llama3.2:3b",
  grounded: false,
  sources: [],
  searchedFor: null,
  declined: false,
  used: [],
  unsupported: [],
  repointed: [],
  citesAll: false,
  omitted: 0,
  tookMs: 48_000,
  createdAt: Date.UTC(2026, 10, 16, 14, 2),
};
const said = (id: string, text: string): ChatMessage => ({ ...base, id, role: "user", text, model: null, tookMs: null });
const reply = (id: string, text: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  ...base,
  id,
  text,
  blocks: text ? [paragraph(text)] : [],
  ...over,
});

const sources: AnswerSource[] = [
  {
    marker: 1,
    kind: "document",
    entityId: "dwater",
    title: "Water treatment in the field",
    collection: "Medicine and first aid",
    url: "/library/documents/dwater?page=3",
    page: 3,
    heading: "Boiling",
    quote: "Bring the water to a rolling boil for one minute.",
    safetyCritical: true,
  },
  {
    marker: 2,
    kind: "note",
    entityId: "nkit",
    title: "Kit list",
    collection: null,
    url: "/notes/nkit",
    page: null,
    heading: "Stove",
    quote: "The small stove boils a litre in four minutes.",
    safetyCritical: false,
  },
];

const noActions = (): TranscriptActions => ({
  regenerate: vi.fn(),
  edit: vi.fn(),
  say: vi.fn(),
  askWithoutLibrary: vi.fn(),
  saveAsNote: vi.fn(),
  chooseModel: vi.fn(),
});

function show(
  messages: ChatMessage[],
  options: { live?: LiveReply | null; busy?: boolean; sentFrom?: string | null; actions?: TranscriptActions; scoped?: boolean } = {},
) {
  const detail: ChatConversationDetail = {
    conversation: {
      id: "c1",
      title: "Stoves",
      model: "",
      useLibrary: false,
      scope: options.scoped ? { kind: "note", entityId: "n1", title: "Stove log", url: "/notes/n1" } : null,
      createdAt: 0,
      updatedAt: 0,
    },
    messages,
    sentFrom: options.sentFrom ?? null,
  };
  const actions = options.actions ?? noActions();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Transcript detail={detail} live={options.live ?? null} busy={options.busy ?? false} actions={actions} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return actions;
}

describe("a conversation as it reads", () => {
  it("says who said what, with the model named beside its own words and how long it took", () => {
    show([said("u1", "How do I light the stove?"), reply("a1", "Prime it first.")]);
    const mine = screen.getByRole("article", { name: "You said" });
    expect(within(mine).getByText("How do I light the stove?")).toBeVisible();
    const theirs = screen.getByRole("article", { name: "Reply from llama3.2:3b" });
    expect(within(theirs).getByText("Prime it first.")).toBeVisible();
    expect(within(theirs).getByText("48 seconds")).toBeVisible();
    expect(within(theirs).queryByText("from your library")).toBeNull();
  });

  it("offers Copy, Regenerate and Save as a note on the newest reply; older replies cannot be regenerated", async () => {
    const actions = show([said("u1", "One"), reply("a1", "First reply."), said("u2", "Two"), reply("a2", "Second reply.")]);
    const [older, newest] = screen.getAllByRole("article", { name: /^Reply from/ });
    expect(within(older!).getByRole("button", { name: "Copy" })).toBeVisible();
    expect(within(older!).queryByRole("button", { name: "Regenerate" })).toBeNull();
    const user = userEvent.setup();
    await user.click(within(newest!).getByRole("button", { name: "Regenerate" }));
    expect(actions.regenerate).toHaveBeenCalledTimes(1);
    await user.click(within(older!).getByRole("button", { name: "Save as a note" }));
    expect(actions.saveAsNote).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    // Only the last thing the person said can be written again.
    const [first, second] = screen.getAllByRole("article", { name: "You said" });
    expect(within(first!).queryByRole("button", { name: "Edit" })).toBeNull();
    await user.click(within(second!).getByRole("button", { name: "Edit" }));
    expect(actions.edit).toHaveBeenCalledWith(expect.objectContaining({ id: "u2", text: "Two" }));
  });

  it("copies the reply as the model wrote it", async () => {
    const copy = vi.fn(async () => {});
    const user = userEvent.setup();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    show([said("u1", "One"), reply("a1", "**Prime** it first.")]);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(copy).toHaveBeenCalledWith("**Prime** it first.");
    expect(await screen.findByText("Copied")).toBeVisible();
  });

  it("draws a reply's Markdown with the app's own elements: a table, a code block that can be copied, and a link that is only words", () => {
    const blocks: MarkdownBlock[] = [
      { t: "heading", depth: 2, c: [{ t: "text", v: "Lighting the stove" }] },
      { t: "list", ordered: true, items: [{ c: [paragraph("Fill the tank.")] }, { c: [paragraph("Prime the burner.")] }] },
      {
        t: "table",
        rows: [
          [[{ t: "text", v: "Fuel" }], [{ t: "text", v: "Burn time" }]],
          [[{ t: "text", v: "Paraffin" }], [{ t: "text", v: "2 hours" }]],
        ],
      },
      { t: "code", lang: "sh", v: 'echo "<b>lit</b>"' },
      {
        t: "paragraph",
        c: [
          { t: "text", v: "More at " },
          { t: "link", href: "https://stoves.example/manual", c: [{ t: "text", v: "the maker's site" }] },
          { t: "text", v: " " },
          { t: "image", alt: "a stove" },
        ],
      },
    ];
    show([said("u1", "How?"), reply("a1", "…", { blocks })]);
    const body = screen.getByTestId("reply-text");
    expect(within(body).getByRole("heading", { level: 3, name: "Lighting the stove" })).toBeVisible();
    expect(within(body).getAllByRole("listitem")).toHaveLength(2);
    expect(within(body).getByRole("columnheader", { name: "Burn time" })).toBeVisible();
    expect(within(body).getByText('echo "<b>lit</b>"')).toBeVisible();
    expect(within(body).getByRole("button", { name: "Copy code" })).toBeVisible();
    // Nothing a model wrote can be followed or fetched.
    expect(within(body).queryByRole("link")).toBeNull();
    expect(body.querySelector("img, a, script, iframe")).toBeNull();
    expect(body).toHaveTextContent("the maker's site (https://stoves.example/manual)");
    expect(body).toHaveTextContent("a stove");
  });

  it("shows where a reply from the library came from: markers that open the passage, and links to each source", async () => {
    const user = userEvent.setup();
    show([
      said("u1", "How long to boil?"),
      // Stored as written, shown as the server settled it: the marker to a number never given is out of the blocks.
      reply("a1", "Boil it for one minute [1]. The stove takes four [2, 3].", {
        blocks: [paragraph("Boil it for one minute [1]. The stove takes four [2].")],
        grounded: true,
        sources,
        searchedFor: "boil",
        used: [1, 2],
        unsupported: [3],
      }),
    ]);
    const theirs = screen.getByRole("article", { name: "Reply from llama3.2:3b" });
    expect(within(theirs).getByText("from your library")).toBeVisible();
    // A source about first aid: the warning, and its passage open without being asked for.
    expect(within(theirs).getByText("Read the passages themselves before acting on this")).toBeVisible();
    const list = within(theirs).getByRole("region", { name: "Passages the model was given" });
    expect(within(list).getByText(/found by searching for “boil”/)).toBeVisible();
    expect(within(list).getByRole("link", { name: "Water treatment in the field, Boiling, page 3" })).toHaveAttribute(
      "href",
      "/library/documents/dwater?page=3",
    );
    expect(within(list).getByRole("link", { name: "Kit list, Stove" })).toHaveAttribute("href", "/notes/nkit");
    expect(within(list).getByText("Bring the water to a rolling boil for one minute.")).toBeVisible();
    expect(within(list).queryByText("The small stove boils a litre in four minutes.")).toBeNull();
    expect(within(list).getAllByText("Cited")).toHaveLength(2);

    await user.click(within(theirs).getByRole("button", { name: /^Source 2: Kit list, Stove/ }));
    expect(await screen.findByText("The small stove boils a litre in four minutes.")).toBeVisible();
    // A marker for a passage that was never given is taken out, and the reply says so.
    expect(within(theirs).queryByText(/refers to no source the model was given/)).toBeNull();
    expect(within(theirs).getByText("[3] taken out: no passage has that number")).toBeVisible();
    expect(within(theirs).getByText(/stands without a source/)).toBeVisible();
  });

  it("says where a stray marker was pointed, and why", () => {
    show([
      said("u1", "How long to boil?"),
      reply("a1", "Bring the water to a rolling boil for one minute [7].", {
        blocks: [paragraph("Bring the water to a rolling boil for one minute [1].")],
        grounded: true,
        sources,
        used: [1],
        unsupported: [7],
        repointed: [{ from: 7, to: 1 }],
      }),
    ]);
    const theirs = screen.getByRole("article", { name: "Reply from llama3.2:3b" });
    expect(within(theirs).getByText("[7] pointed at the passage that holds the words")).toBeVisible();
    expect(within(theirs).getByText(/The words marked \[7\] are, word for word, in passage \[1\]/)).toBeVisible();
    expect(within(theirs).getByRole("button", { name: /^Source 1:/ })).toBeVisible();
  });

  it("shows a reply that says the passages hold no answer as not covered, with nothing cited", () => {
    show([
      said("u1", "Who won the World Cup in 1966?"),
      reply("a1", "There is no information about the World Cup in the provided sources. [1][2]", {
        blocks: [paragraph("There is no information about the World Cup in the provided sources.")],
        grounded: true,
        sources,
        declined: true,
      }),
    ]);
    const theirs = screen.getByRole("article", { name: "Reply from llama3.2:3b" });
    expect(within(theirs).getByTestId("reply-declined")).toHaveTextContent("Your library does not seem to cover this.");
    expect(within(theirs).queryByRole("button", { name: /^Source \d/ })).toBeNull();
    // The passages are still there to be checked, and none is marked cited or not.
    expect(within(theirs).getByRole("button", { name: "The 2 passages the model read" })).toBeVisible();
    expect(within(theirs).queryByText("Cited")).toBeNull();
    expect(within(theirs).queryByText("Not cited")).toBeNull();
    // Not also called a reply that cites nothing.
    expect(within(theirs).queryByText(/This reply cites none of the passages/)).toBeNull();
  });

  it("says when a reply from the library cites nothing", () => {
    show([said("u1", "Q"), reply("a1", "It depends.", { grounded: true, sources })]);
    expect(screen.getByText(/This reply cites none of the passages/)).toBeVisible();
  });

  it("while the model has not started: says it is waiting, counts the seconds, and offers nothing to press", () => {
    const live: LiveReply = {
      messageId: "a1",
      phase: "waiting",
      model: "llama3.2:3b",
      grounded: false,
      sources: [],
      searchedFor: null,
      blocks: [],
      since: Date.now() - 12_000,
    };
    show([said("u1", "Hello"), reply("a1", "", { state: "writing", tookMs: null })], { live, busy: true });
    const theirs = screen.getByRole("article", { name: "Reply from llama3.2:3b" });
    expect(theirs).toHaveAttribute("aria-busy", "true");
    expect(within(theirs).getByTestId("reply-waiting")).toHaveTextContent("Waiting for the model to start writing, 12 seconds so far");
    // Nothing said the model was being loaded, so the screen does not say it is.
    expect(within(theirs).getByText(/On a small computer a model can take a minute or more/)).toBeVisible();
    expect(within(theirs).queryByText(/is loading the model/)).toBeNull();
    expect(within(theirs).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("says the model is being loaded when the model server said so", () => {
    const live: LiveReply = {
      messageId: "a1",
      phase: "loading",
      model: "llama3.2:1b",
      grounded: false,
      sources: [],
      searchedFor: null,
      blocks: [],
      since: Date.now() - 5_000,
    };
    show([said("u1", "Hello"), reply("a1", "", { state: "writing", tookMs: null, model: "llama3.2:1b" })], { live, busy: true });
    const theirs = screen.getByRole("article", { name: "Reply from llama3.2:1b" });
    expect(within(theirs).getByTestId("reply-waiting")).toHaveTextContent(
      "The model server is loading the model into memory, 5 seconds so far",
    );
    expect(within(theirs).getByText(/It said the model was not loaded/)).toBeVisible();
    // No time is promised for the loading itself.
    expect(within(theirs).getByTestId("reply-waiting").textContent).not.toMatch(/will take|about \d/);
  });

  it("while passages are being found, says so", () => {
    const live: LiveReply = {
      messageId: "a1",
      phase: "finding",
      model: "llama3.2:3b",
      grounded: true,
      sources: [],
      searchedFor: null,
      blocks: [],
      since: Date.now(),
    };
    show([said("u1", "Hello"), reply("a1", "", { state: "writing", grounded: true })], { live, busy: true });
    expect(screen.getByTestId("reply-waiting")).toHaveTextContent("Finding passages in your library");
  });

  it("while the reply is written: shows the words that have arrived, not the stored ones, and marks it unfinished", () => {
    const live: LiveReply = {
      messageId: "a1",
      phase: "writing",
      model: "llama3.2:3b",
      grounded: true,
      sources,
      searchedFor: "boil",
      blocks: [paragraph("Boil it for one")],
      since: Date.now(),
    };
    show([said("u1", "Hello"), reply("a1", "", { state: "writing", grounded: true })], { live, busy: true });
    const body = screen.getByTestId("reply-text");
    expect(body).toHaveTextContent("Boil it for one");
    expect(body).toHaveAttribute("data-writing", "true");
    expect(screen.getByText("Being written from 2 passages of your library.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("a stopped reply keeps its words, says it is unfinished, and can be tried again", async () => {
    const actions = show([
      said("u1", "Hello"),
      reply("a1", "Boil it for", { state: "stopped", notice: "Stopped. This reply is unfinished." }),
    ]);
    expect(screen.getByText("Boil it for")).toBeVisible();
    expect(screen.getByText("Stopped. This reply is unfinished.")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(actions.regenerate).toHaveBeenCalled();
  });

  it("a reply that was cut off says so and offers to ask for the rest", async () => {
    const actions = show([
      said("u1", "Hello"),
      reply("a1", "A long account that", {
        state: "cut-short",
        notice: "The model reached its length limit, so this reply stops before its end.",
      }),
    ]);
    expect(screen.getByText(/reached its length limit/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ask it to continue" }));
    expect(actions.say).toHaveBeenCalledWith("Please continue from where you stopped.");
  });

  it("a failed reply says what happened and what to do next", async () => {
    const actions = show([
      said("u1", "Hello"),
      reply("a1", "", {
        state: "failed",
        failure: "no-such-model",
        notice: 'The model server at 127.0.0.1:11434 has no model called "llama9:70b". Choose another model for this conversation.',
        model: "llama9:70b",
      }),
    ]);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No reply was written");
    expect(alert).toHaveTextContent('has no model called "llama9:70b"');
    const user = userEvent.setup();
    await user.click(within(alert).getByRole("button", { name: "Choose another model" }));
    expect(actions.chooseModel).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(actions.regenerate).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("a server that is not answering leads to Settings", () => {
    show([
      said("u1", "Hello"),
      reply("a1", "", { state: "failed", failure: "unreachable", notice: "No model server answered at 127.0.0.1:11434." }),
    ]);
    expect(within(screen.getByRole("alert")).getByRole("link", { name: "Open Settings" })).toHaveAttribute(
      "href",
      "/settings#answers-title",
    );
  });

  it("when the library held nothing, says the model was not asked and offers to ask it without the library", async () => {
    const notice =
      "Nothing in your documents, notes or books matches this, so the model was not asked. A reply written from no passages would be the model’s guess, not your library’s.";
    const actions = show([said("u1", "Zeppelins?"), reply("a1", "", { state: "nothing-found", grounded: true, notice })]);
    expect(screen.getByText("Nothing in your documents, notes or books matches this, so the model was not asked.")).toBeVisible();
    expect(screen.getByText("was not asked")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ask without my library" }));
    expect(actions.askWithoutLibrary).toHaveBeenCalled();
  });

  it("does not offer to leave the library in a conversation that is about one item", () => {
    show(
      [
        said("u1", "Q"),
        reply("a1", "", { state: "nothing-found", grounded: true, notice: "No text of this item is in the search index. More." }),
      ],
      { scoped: true },
    );
    expect(screen.queryByRole("button", { name: "Ask without my library" })).toBeNull();
  });

  it("draws a line where the messages that are still sent begin", () => {
    show([said("u1", "One"), reply("a1", "First."), said("u2", "Two"), reply("a2", "Second.")], { sentFrom: "u2" });
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Messages above this line are no longer sent to the model.");
    // It sits between the first exchange and the second.
    const order = [...document.querySelectorAll('[role="note"], article')].map(
      (element) => element.getAttribute("role") ?? element.getAttribute("data-role"),
    );
    expect(order).toEqual(["user", "assistant", "note", "user", "assistant"]);
  });

  it("folds a long message from the person, and unfolds it when asked", async () => {
    show([said("u1", `A pasted page. ${"word ".repeat(400)}`), reply("a1", "Noted.")]);
    const toggle = screen.getByRole("button", { name: "Show all of it" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("the reply being written, as events arrive", () => {
  const start: ChatStreamEvent = {
    type: "start",
    messageId: "a1",
    phase: "waiting",
    model: "llama3.2:3b",
    grounded: false,
    sources: [],
    searchedFor: null,
    omitted: 0,
    startedAt: 1_000_000,
  };

  it("builds the reply from patches that replace it from where it changed", () => {
    let live = applyStreamEvent(null, start, 1_002_000);
    expect(live).toMatchObject({ messageId: "a1", phase: "waiting", blocks: [], since: 1_000_000 });
    live = applyStreamEvent(live, { type: "blocks", from: 0, blocks: [paragraph("One"), paragraph("Tw")] });
    live = applyStreamEvent(live, { type: "blocks", from: 1, blocks: [paragraph("Two"), paragraph("Three")] });
    expect(live?.phase).toBe("writing");
    expect(live?.blocks).toEqual([paragraph("One"), paragraph("Two"), paragraph("Three")]);
    expect(applyStreamEvent(live, { type: "done", message: reply("a1", "One Two Three") })).toBeNull();
    expect(applyStreamEvent(live, { type: "idle" })).toBeNull();
  });

  it("keeps the passages when the phase changes, and does not trust a clock that runs ahead", () => {
    let live = applyStreamEvent(null, { ...start, phase: "finding", grounded: true, startedAt: 9_000_000 }, 1_000_000);
    expect(live?.since).toBe(1_000_000);
    live = applyStreamEvent(live, { type: "phase", phase: "waiting", sources, searchedFor: "boil" });
    live = applyStreamEvent(live, { type: "phase", phase: "writing" });
    expect(live).toMatchObject({ phase: "writing", searchedFor: "boil" });
    expect(live?.sources).toHaveLength(2);
    // An event for a reply this browser never saw start changes nothing.
    expect(applyStreamEvent(null, { type: "blocks", from: 0, blocks: [paragraph("x")] })).toBeNull();
  });

  it("reads events from a stream however it is cut into pieces, and skips keep-alive lines", async () => {
    const text = `: the model is working\n\nevent: start\ndata: ${JSON.stringify({ ...start, type: undefined })}\n\nevent: blocks\r\ndata: {"from":0,"blocks":[]}\r\n\r\nevent: idle\ndata: {}\n\n`;
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += 7) controller.enqueue(bytes.slice(at, at + 7));
        controller.close();
      },
    });
    const seen: string[] = [];
    await readChatEvents(stream, (event) => seen.push(event.type));
    expect(seen).toEqual(["start", "blocks", "idle"]);
  });
});

describe("small things said in words", () => {
  it("times, durations, markers, model facts and the item a conversation is about", () => {
    const now = new Date(2026, 10, 16, 18, 0).getTime();
    expect(whenWords(new Date(2026, 10, 16, 14, 2).getTime(), now)).toBe("14:02");
    expect(whenWords(new Date(2026, 10, 12, 9, 30).getTime(), now)).toBe("12 Nov, 09:30");
    expect(tookWords(400)).toBe("1 second");
    expect(tookWords(48_000)).toBe("48 seconds");
    expect(tookWords(150_000)).toBe("3 minutes");
    expect(markersIn("One [1]. Two [2, 3] and [1] again, not [see 4] or [1994 edition].")).toEqual([1, 2, 3]);
    expect(modelFacts({ id: "x", sizeBytes: 2_019_393_189, parameters: "3.2B", quantization: "Q4_K_M", family: "llama" })).toBe(
      "2.02 GB, 3.2B parameters, Q4_K_M",
    );
    expect(modelFacts({ id: "x", sizeBytes: null, parameters: null, quantization: null, family: null })).toBe("");
    expect(readAbout("document:01JABC")).toEqual({ kind: "document", id: "01JABC" });
    expect(readAbout("note:../../etc")).toBeNull();
    expect(readAbout("collection:abc")).toBeNull();
    expect(readAbout(null)).toBeNull();
  });

  it("knows a model that is not on the server from one that is, whatever tag it was given", () => {
    const list = {
      models: [{ id: "llama3.2:latest", sizeBytes: null, parameters: null, quantization: null, family: null }],
      message: null,
      ollama: true,
    };
    expect(isMissing("llama3.2", list)).toBe(false);
    expect(isMissing("llama3.2:latest", list)).toBe(false);
    expect(isMissing("qwen3:4b", list)).toBe(true);
    // A list that could not be read says nothing about what is missing.
    expect(isMissing("qwen3:4b", { models: [], message: "No model server answered.", ollama: false })).toBe(false);
    expect(isMissing("", list)).toBe(false);
  });
});

import type { AnswerSource, ChatConversationDetail, ChatMessage, ChatModel, ChatStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { applyStreamEvent, type LiveReply } from "./chat-data";
import { Composer } from "./composer";
import { argumentWords, toolsNoteFor } from "./looked-at";
import { Transcript } from "./transcript";

const reply = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "a1",
  role: "assistant",
  text: "Tesco Extra is 2.1 km away [1].",
  blocks: [{ t: "paragraph", c: [{ t: "text", v: "Tesco Extra is 2.1 km away [1]." }] }],
  state: "complete",
  failure: null,
  notice: null,
  model: "llama3.2:3b",
  grounded: false,
  sources: [],
  searchedFor: null,
  declined: false,
  used: [1],
  unsupported: [],
  repointed: [],
  citesAll: false,
  omitted: 0,
  tookMs: 9000,
  createdAt: Date.UTC(2026, 10, 17, 9, 0),
  ...over,
});

const places: AnswerSource = {
  marker: 1,
  kind: "lookup",
  entityId: "find_places",
  title: "places on the map (Food and supplies, fetched 12 Nov)",
  collection: null,
  url: "/map?layer=food",
  page: null,
  heading: null,
  quote: "Supermarkets near Northampton:\nTesco Extra, 2.1 km north-east.",
  safetyCritical: false,
  lookup: { tool: "find_places", arguments: { kind: "supermarket", near: "Northampton" }, area: "places", ok: true },
};
const supplies: AnswerSource = {
  ...places,
  marker: 2,
  entityId: "supplies",
  title: "supplies",
  url: "",
  quote: "Water: 12 litres, 4 days for two people.",
  lookup: { tool: "supplies", arguments: {}, area: "supplies", ok: true },
};
const refused: AnswerSource = {
  ...places,
  marker: 0,
  entityId: "",
  title: "find_treasure",
  url: "",
  quote: 'There is no tool called "find_treasure". The tools are: find_places, supplies.',
  lookup: { tool: "find_treasure", arguments: { where: "garden" }, area: null, ok: false },
};

function show(message: ChatMessage, live: LiveReply | null = null) {
  const detail: ChatConversationDetail = {
    conversation: { id: "c1", title: "Shops", model: "", useLibrary: false, scope: null, createdAt: 0, updatedAt: 0 },
    messages: [{ ...reply(), id: "u1", role: "user", text: "Supermarkets near Northampton?", blocks: [], model: null }, message],
    sentFrom: null,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Transcript
          detail={detail}
          live={live}
          busy={false}
          actions={{
            regenerate: vi.fn(),
            edit: vi.fn(),
            say: vi.fn(),
            askWithoutLibrary: vi.fn(),
            saveAsNote: vi.fn(),
            chooseModel: vi.fn(),
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("what the model looked up", () => {
  it("lists the lookups on one quiet line, folded, apart from the library's passages", () => {
    show(reply({ sources: [places, supplies] }));
    const line = screen.getByRole("region", { name: "What the model looked up in Outpost" });
    expect(line).toHaveTextContent("Looked at: places on the map (Food and supplies, fetched 12 Nov), supplies");
    const first = within(line).getByRole("button", { name: "places on the map (Food and supplies, fetched 12 Nov)" });
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(within(line).queryByText(/Tesco Extra, 2.1 km/)).toBeNull();
    // Not listed as passages of the library.
    expect(screen.queryByRole("region", { name: "Passages the model was given" })).toBeNull();
    // The marker in the reply shows what the tool answered.
    expect(screen.getByRole("button", { name: /^Source 1: looked up in Outpost, places on the map/ })).toBeVisible();
  });

  it("opens one to show what was asked, in words, and what it answered, quoted, with the way to the screen", async () => {
    show(reply({ sources: [places, supplies] }));
    const line = screen.getByRole("region", { name: "What the model looked up in Outpost" });
    const user = userEvent.setup();
    await user.click(within(line).getByRole("button", { name: /^places on the map/ }));
    expect(within(line).getByRole("button", { name: /^places on the map/ })).toHaveAttribute("aria-expanded", "true");
    expect(line).toHaveTextContent("asked for kind: supermarket, near: Northampton");
    expect(line).not.toHaveTextContent("{");
    const quote = line.querySelector("blockquote");
    expect(quote).toHaveTextContent("Tesco Extra, 2.1 km north-east.");
    expect(quote).toHaveClass("font-serif");
    expect(within(line).getByRole("link", { name: "Open it in Outpost" })).toHaveAttribute("href", "/map?layer=food");
    // A lookup with no screen to open has no link; one asked nothing in particular says so.
    await user.click(within(line).getByRole("button", { name: "supplies" }));
    expect(line).toHaveTextContent("asked for nothing in particular");
    expect(within(line).getAllByRole("link")).toHaveLength(1);
  });

  it("shows a refused call as refused, with what the model was told", async () => {
    show(
      reply({
        text: "I could not look that up.",
        blocks: [{ t: "paragraph", c: [{ t: "text", v: "I could not look that up." }] }],
        used: [],
        sources: [refused],
      }),
    );
    const line = screen.getByRole("region", { name: "What the model looked up in Outpost" });
    expect(line).toHaveTextContent("Looked at: a tool that does not exist (refused)");
    await userEvent.setup().click(within(line).getByRole("button", { name: "a tool that does not exist (refused)" }));
    expect(line).toHaveTextContent('Outpost did not run it, and told the model: There is no tool called "find_treasure".');
    expect(line).toHaveTextContent("asked for where: garden");
    expect(line.querySelector("blockquote")).toBeNull();
  });

  it("says what it is looking at while it looks, and lists each lookup before the reply is written", () => {
    let live = applyStreamEvent(
      null,
      {
        type: "start",
        messageId: "a1",
        phase: "waiting",
        model: "llama3.2:3b",
        grounded: false,
        sources: [],
        searchedFor: null,
        omitted: 0,
        startedAt: Date.now(),
      },
      Date.now(),
    );
    live = applyStreamEvent(live, { type: "phase", phase: "looking", looking: "places on the map" });
    live = applyStreamEvent(live, { type: "phase", phase: "looking", looking: "supplies", sources: [places] });
    expect(live).toMatchObject({ phase: "looking", looking: "supplies" });
    show(reply({ state: "writing", text: "", blocks: [], used: [], tookMs: null }), live);
    expect(screen.getByTestId("reply-waiting")).toHaveTextContent("Looking at supplies…");
    expect(screen.getByRole("region", { name: "What the model looked up in Outpost" })).toHaveTextContent(
      "Looked at: places on the map (Food and supplies, fetched 12 Nov)",
    );
    // Once it writes, it is no longer looking.
    expect(applyStreamEvent(live, { type: "phase", phase: "writing" })).toMatchObject({ phase: "writing", looking: null });
  });

  it("turns arguments into words, never JSON", () => {
    expect(argumentWords({ kind: "supermarket", radius_km: 5, open_now: true })).toBe("kind: supermarket, radius km: 5, open now: true");
    expect(argumentWords({ near: { lat: 52.2, lon: -0.9 } })).toBe("near: lat: 52.2, lon: -0.9");
    expect(argumentWords('{"kind": supermarket')).toBe("something that could not be read");
    expect(argumentWords({})).toBe("nothing in particular");
  });
});

describe("the note about a model that cannot look things up", () => {
  const status = (over: Partial<ChatStatus["tools"]> = {}): ChatStatus => ({
    enabled: true,
    usable: true,
    reason: null,
    defaultModel: "gemma3:1b",
    server: "127.0.0.1:11434",
    place: "this-computer",
    writingIn: null,
    tools: { enabled: true, offForModels: [], offered: 13, ...over },
  });
  const model = (tools?: boolean): ChatModel => ({
    id: "gemma3:1b",
    sizeBytes: 815_000_000,
    parameters: "1B",
    quantization: "Q4_K_M",
    family: "gemma3",
    ...(tools === undefined ? {} : { tools }),
  });
  const note = (over: Partial<Parameters<typeof toolsNoteFor>[0]> = {}) =>
    toolsNoteFor({ status: status(), model: "gemma3:1b", info: model(false), listed: true, grounded: true, scoped: false, ...over });

  it("says so once, under the message box, and names the suggested models that can", () => {
    const text = note();
    expect(text).toBe(
      "This model cannot look things up in Outpost; it answers from your library’s passages only. Of the models tried here, lfm3:1.7b looks things up well: see Which model, under Help.",
    );
    render(
      <MemoryRouter>
        <Composer value="" onChange={vi.fn()} onSend={vi.fn()} useLibrary toolsNote={text} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("chat-tools-note")).toHaveTextContent("This model cannot look things up in Outpost");
  });

  it("says nothing while looking things up is off, in a conversation about one item, or before the model list is read", () => {
    expect(note({ status: { ...status(), tools: { enabled: false, offForModels: [], offered: 13 } } })).toBeNull();
    expect(note({ scoped: true })).toBeNull();
    expect(note({ listed: false })).toBeNull();
  });

  it("tells apart a server that does not say, a model turned off in Settings, and one that can", () => {
    expect(note({ info: model(undefined), grounded: false })).toMatch(
      /^The model server does not say whether this model can look things up in Outpost, so it is not offered the tools; it answers from what it learned only\./,
    );
    expect(note({ status: status({ offForModels: ["gemma3:1b"] }), info: model(true) })).toBe(
      "Looking things up in Outpost is turned off for this model in Settings, so it answers from your library’s passages only.",
    );
    expect(note({ info: model(true) })).toMatch(/^It can also look things up in Outpost/);
    expect(note({ info: model(true), status: status({ offered: 0 }) })).toMatch(
      /^Every area the model could look things up in is switched off/,
    );
  });
});

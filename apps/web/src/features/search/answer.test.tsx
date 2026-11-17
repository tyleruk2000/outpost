import type { AnswerEvent, AnswerSource, AnswersStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerArea } from "./answer";
import { type AnswerStore, createAnswerStore, readEvents } from "./answer-store";
import { readAnswer, whereOf } from "./answer-text";

const sources: AnswerSource[] = [
  {
    marker: 1,
    kind: "document",
    entityId: "d-water",
    title: "Water treatment in the field",
    collection: "Medicine and first aid",
    url: "/library/documents/d-water?page=3",
    page: 3,
    heading: "Boiling",
    quote: "Bring the water to a rolling boil for one minute.",
    safetyCritical: true,
  },
  {
    marker: 2,
    kind: "note",
    entityId: "n-kit",
    title: "Kit list",
    collection: null,
    url: "/notes/n-kit",
    page: null,
    heading: "Stove",
    quote: "The small stove boils a litre in four minutes.",
    safetyCritical: false,
  },
];

const ready: AnswersStatus = {
  enabled: true,
  ready: true,
  reason: null,
  model: "llama3.2:3b",
  server: "127.0.0.1:11434",
  place: "this-computer",
  busy: false,
};

const sourcesEvent = (over: Partial<Extract<AnswerEvent, { type: "sources" }>> = {}): AnswerEvent => ({
  type: "sources",
  question: "how long to boil water",
  searchedFor: "boil water",
  model: "llama3.2:3b",
  server: "127.0.0.1:11434",
  sources,
  omitted: 0,
  leftOut: 0,
  safetyCritical: false,
  ...over,
});
const done = (over: Partial<Extract<AnswerEvent, { type: "done" }>> = {}): AnswerEvent => ({
  type: "done",
  outcome: "answered",
  used: [1],
  unsupported: [],
  repointed: [],
  citesAll: false,
  cutShort: false,
  tookMs: 1200,
  ...over,
});

interface Served {
  /** Bodies of the questions asked. */
  asked: Array<{ question: string; mode?: string }>;
  /** The signal of the latest question, to see whether it was stopped. */
  signal(): AbortSignal | undefined;
  /** Sends events down the open answer, as the server would. */
  send(...events: AnswerEvent[]): Promise<void>;
  /** Ends the open answer's stream. */
  end(): Promise<void>;
}

/** A server that answers the status request and holds the answer stream open for the test to write to. */
function serve(status: AnswersStatus, refuse?: { status: number; body: unknown }): Served {
  const asked: Served["asked"] = [];
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let signal: AbortSignal | undefined;
  const encoder = new TextEncoder();
  const json = (body: unknown, code = 200) =>
    new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/answers/status") return json(status);
      if (url.pathname === "/api/answers" && init?.method === "POST") {
        asked.push(JSON.parse(String(init.body)));
        if (refuse) return json(refuse.body, refuse.status);
        signal = init.signal ?? undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
            signal?.addEventListener("abort", () => {
              try {
                controller.error(new DOMException("The operation was aborted.", "AbortError"));
              } catch {
                // Already closed.
              }
            });
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      return json({ error: { code: "not_found", message: "Not found" } }, 404);
    }),
  );
  return {
    asked,
    signal: () => signal,
    async send(...events) {
      await act(async () => {
        for (const { type, ...data } of events) stream!.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async end() {
      await act(async () => {
        stream!.close();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

function show(q: string, store: AnswerStore = createAnswerStore(), referenceResults = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AnswerArea q={q} referenceResults={referenceResults} store={store} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, store };
}

const ask = async () => userEvent.click(await screen.findByRole("button", { name: "Answer from my library" }));

afterEach(() => vi.unstubAllGlobals());

describe("reading an answer as text", () => {
  it("cuts it into paragraphs, emphasis and markers, and knows which markers are real", () => {
    const [first, second] = readAnswer("Boil it for **one minute** [1].\n\nThen store it [2, 9].", sources);
    expect(first).toEqual([
      { kind: "text", text: "Boil it for ", strong: false },
      { kind: "text", text: "one minute", strong: true },
      { kind: "text", text: " ", strong: false },
      { kind: "marker", marker: 1, source: sources[0] },
      { kind: "text", text: ".", strong: false },
    ]);
    expect(second!.filter((piece) => piece.kind === "marker")).toEqual([
      { kind: "marker", marker: 2, source: sources[1] },
      { kind: "marker", marker: 9, source: undefined },
    ]);
    expect(readAnswer("", sources)).toEqual([]);
    expect(readAnswer("See the [1994 edition].", sources)[0]).toEqual([{ kind: "text", text: "See the [1994 edition].", strong: false }]);
  });

  it("says where a source is without repeating itself", () => {
    expect(whereOf(sources[0]!)).toBe("Water treatment in the field, Boiling, page 3");
    expect(whereOf({ title: "Kit list", heading: "Kit list", page: null })).toBe("Kit list");
  });
});

describe("reading the answer stream", () => {
  it("puts events back together however the network cut them up", async () => {
    const text = `event: sources\ndata: ${JSON.stringify({ sources: [] })}\n\n: waiting for the model\n\nevent: delta\ndata: {"text":"Bo"}\n\nevent: delta\r\ndata: {"text":"il é"}\r\n\r\nevent: done\ndata: {"outcome":"answered"}\n\n`;
    const bytes = new TextEncoder().encode(text);
    for (const size of [1, 7, 23, bytes.length]) {
      const events: AnswerEvent[] = [];
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let at = 0; at < bytes.length; at += size) controller.enqueue(bytes.slice(at, at + size));
          controller.close();
        },
      });
      await readEvents(body, (event) => events.push(event));
      expect(
        events.map((event) => event.type),
        `chunks of ${size}`,
      ).toEqual(["sources", "delta", "delta", "done"]);
      expect(events.map((event) => (event.type === "delta" ? event.text : "")).join("")).toBe("Boil é");
    }
  });
});

describe("Answer from my library", () => {
  it("is not offered until answers are set up", async () => {
    const served = serve({
      ...ready,
      enabled: false,
      ready: false,
      reason: "Answers are turned off.",
      model: "",
      server: null,
      place: null,
    });
    const { container } = show("boil water");
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(served.asked).toEqual([]);
  });

  it("says what is missing when answers are switched on but not ready", async () => {
    serve({ ...ready, ready: false, reason: "Choose which model writes the answers, in Settings.", model: "" });
    show("boil water");
    expect(await screen.findByText(/switched on but not ready\. Choose which model writes the answers/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings#answers-title");
    expect(screen.queryByRole("button", { name: "Answer from my library" })).not.toBeInTheDocument();
  });

  it("names the model and where it runs before anything is sent, and sends nothing until asked", async () => {
    const served = serve(ready);
    show("how long to boil water");
    expect(await screen.findByRole("button", { name: "Answer from my library" })).toBeInTheDocument();
    expect(screen.getByText(/a language model on this computer, writes a short answer/)).toBeInTheDocument();
    expect(screen.getByText("llama3.2:3b")).toBeInTheDocument();
    expect(served.asked).toEqual([]);
  });

  it("warns when the model server is somewhere else", async () => {
    serve({ ...ready, place: "elsewhere", server: "models.example.com" });
    show("boil water");
    expect(await screen.findByText(/a language model at models\.example\.com, writes/)).toBeInTheDocument();
    expect(screen.getByText(/The question and those passages are sent to that address/)).toBeInTheDocument();
  });

  it("streams the answer under a heading that says it was generated and by what, with the passages beneath", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    expect(served.asked).toEqual([{ question: "how long to boil water" }]);
    const panel = await screen.findByRole("region", { name: "Generated answer" });
    expect(within(panel).getByText("Finding passages in your library")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Stop" })).toBeInTheDocument();

    await served.send(sourcesEvent());
    expect(within(panel).getByText(/The model is reading 2 passages/)).toBeInTheDocument();
    expect(within(panel).getByText(/Written by/)).toHaveTextContent(
      "Written by llama3.2:3b, a language model on this computer, for “how long to boil water”. It is the model’s wording, not a source.",
    );
    // The passages are there before the model has written a word.
    expect(within(panel).getByRole("heading", { name: "The 2 passages the model was given" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Water treatment in the field, Boiling, page 3" })).toHaveAttribute(
      "href",
      "/library/documents/d-water?page=3",
    );
    expect(within(panel).getByRole("link", { name: "Kit list, Stove" })).toHaveAttribute("href", "/notes/n-kit");

    await served.send({ type: "delta", text: "Boil it for one " }, { type: "delta", text: "minute [1" });
    expect(within(panel).getByTestId("answer-text")).toHaveTextContent("Boil it for one minute [1");
    await served.send({ type: "delta", text: "]." }, done());
    await served.end();
    expect(within(panel).getByTestId("answer-text")).toHaveTextContent("Boil it for one minute [1].");
    expect(within(panel).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Ask again" })).toBeInTheDocument();
    expect(within(panel).getByText("Cited in the answer")).toBeInTheDocument();
    expect(within(panel).getByText("Not cited")).toBeInTheDocument();
    expect(within(panel).getByText(/Reference collections such as Wikipedia are not read/)).toBeInTheDocument();
    expect(within(panel).getByText(/This answer is not saved anywhere/)).toBeInTheDocument();
    // The offer goes away while its answer is on show.
    expect(screen.queryByRole("button", { name: "Answer from my library" })).not.toBeInTheDocument();
  });

  it("shows the quoted passage beside the claim when a marker is pressed, with a link to the exact place", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boil it [1]. The stove is quick [2]." }, done({ used: [1, 2] }));
    await userEvent.click(
      screen.getByRole("button", { name: "Source 1: Water treatment in the field, Boiling, page 3. Show the passage." }),
    );
    const quote = await screen.findByRole("dialog");
    expect(within(quote).getByText("Bring the water to a rolling boil for one minute.")).toBeInTheDocument();
    expect(within(quote).getByText(/Quoted from your library, exactly as stored/)).toBeInTheDocument();
    expect(within(quote).getByRole("link", { name: "Open it at page 3" })).toHaveAttribute("href", "/library/documents/d-water?page=3");
    await userEvent.keyboard("{Escape}");

    // And from the list beneath, on demand.
    const panel = screen.getByRole("region", { name: "Generated answer" });
    expect(within(panel).queryByText("The small stove boils a litre in four minutes.")).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Show the passage" }));
    expect(within(panel).getByText("The small stove boils a litre in four minutes.")).toBeInTheDocument();
  });

  it("takes out a marker that refers to no source once the answer is finished, and says so", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boil it [1]. It always works [9]." });
    // While it is being written the marker is struck through: nothing is settled yet.
    expect(screen.getByText("(refers to no source the model was given)")).toBeInTheDocument();
    await served.send(done({ text: "Boil it [1]. It always works.", used: [1], unsupported: [9] }));
    expect(screen.queryByText("(refers to no source the model was given)")).toBeNull();
    expect(screen.getByTestId("answer-text")).toHaveTextContent("Boil it [1]. It always works.");
    expect(screen.queryByRole("button", { name: /Source 9/ })).not.toBeInTheDocument();
    expect(screen.getByText("[9] taken out: no passage has that number")).toBeInTheDocument();
    expect(screen.getByText(/numbered 1 to 2, and cited \[9\]\. That marker was taken out/)).toBeInTheDocument();
  });

  it("says when a stray marker was pointed at the passage that holds its words", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(
      sourcesEvent(),
      { type: "delta", text: "Bring the water to a rolling boil for one minute [7]." },
      done({ text: "Bring the water to a rolling boil for one minute [1].", used: [1], unsupported: [7], repointed: [{ from: 7, to: 1 }] }),
    );
    expect(screen.getByText("[7] pointed at the passage that holds the words")).toBeInTheDocument();
    expect(screen.getByText(/The words marked \[7\] are, word for word, in passage \[1\]/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Source 1:/ })).toBeInTheDocument();
  });

  it("shows plainly when the model said the library does not cover the question, citing nothing", async () => {
    const served = serve(ready);
    show("who won the world cup in 1966");
    await ask();
    await served.send(
      sourcesEvent({ question: "who won the world cup in 1966" }),
      { type: "delta", text: "There is no information about that in the provided sources. [1][2]" },
      done({ outcome: "not-covered", text: "There is no information about that in the provided sources.", used: [] }),
    );
    expect(screen.getByTestId("answer-declined")).toHaveTextContent("Your library does not seem to cover this.");
    expect(screen.getByTestId("answer-text")).toHaveTextContent("There is no information about that in the provided sources.");
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    // The passages are listed as what was read, not as the sources of an answer.
    expect(screen.getByRole("heading", { name: "The 2 passages the model read" })).toBeInTheDocument();
    expect(screen.queryByText("Cited in the answer")).toBeNull();
    expect(screen.queryByText("Not cited")).toBeNull();
    expect(screen.queryByText("This answer cites no source")).toBeNull();
  });

  it("says nothing of the model's when all it wrote was that the passages do not answer", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(
      sourcesEvent(),
      { type: "delta", text: "The sources do not answer this." },
      done({ outcome: "not-covered", text: "", used: [] }),
    );
    expect(screen.getByTestId("answer-declined")).toBeInTheDocument();
    expect(screen.queryByTestId("answer-text")).toBeNull();
  });

  it("says how many passages were left out when the model server refused them as too long", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent({ sources: [...sources, { ...sources[0]!, marker: 3 }] }));
    expect(screen.queryByTestId("answer-left-out")).toBeNull();
    await served.send(sourcesEvent({ sources: sources.slice(0, 1), leftOut: 2 }), { type: "delta", text: "Boil it [1]." }, done());
    expect(screen.getByTestId("answer-left-out")).toHaveTextContent(
      "2 passages left out: the model server said all 3 were more than the model can read at once, so Outpost asked again with the best one.",
    );
    expect(screen.getByRole("heading", { name: "The passage the model was given" })).toBeInTheDocument();
  });

  it("says the model is being loaded only when the model server said so", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent());
    expect(screen.getByTestId("answer-waiting")).toHaveTextContent("The model is reading 2 passages.");
    expect(screen.queryByText(/into memory/)).toBeNull();
    await served.send({ type: "loading" });
    expect(screen.getByTestId("answer-waiting")).toHaveTextContent(
      "The model server is loading llama3.2:3b into memory before it can read 2 passages: it said the model was not loaded.",
    );
    await served.send({ type: "delta", text: "Boil it [1]." });
    expect(screen.queryByTestId("answer-waiting")).toBeNull();
  });

  it("says when an answer cites every passage it was given", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boil it [1][2]." }, done({ used: [1, 2], citesAll: true }));
    expect(screen.getByText(/cites every passage it was given/)).toBeInTheDocument();
  });

  it("says plainly when an answer cites nothing", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boiling makes water safe." }, done({ used: [] }));
    expect(screen.getByText("This answer cites no source")).toBeInTheDocument();
    expect(screen.getByText(/nothing in it can be checked against your library/)).toBeInTheDocument();
  });

  it("carries the safety warning and opens the quoted passages when a source is from a risky field", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent({ safetyCritical: true }));
    expect(screen.getByText("Read the passages themselves before acting on this")).toBeInTheDocument();
    // The risky source's own words are on show without being asked for; the other passage waits to be opened.
    expect(screen.getByText("Bring the water to a rolling boil for one minute.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Hide the passage" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Show the passage" })).toHaveLength(1);
    expect(screen.getByText(/Found by searching for “boil water”/)).toBeInTheDocument();
  });

  it("does not pretend when nothing was found, and says reference articles were not read", async () => {
    const served = serve(ready);
    show("zeppelin maintenance", createAnswerStore(), 3);
    await ask();
    await served.send(sourcesEvent({ question: "zeppelin maintenance", sources: [] }), done({ outcome: "nothing-found", used: [] }));
    await served.end();
    expect(
      screen.getByText(/Nothing in your documents, notes or books matches this question, so the model was not asked/),
    ).toBeInTheDocument();
    expect(screen.getByText(/The 3 reference articles in the results below were not read/)).toBeInTheDocument();
    expect(screen.queryByTestId("answer-text")).not.toBeInTheDocument();
  });

  it("stops when asked, keeping what was written and calling it unfinished", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boil it for" });
    expect(served.signal()!.aborted).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    // The request itself is cancelled, which is what makes the server stop the model.
    expect(served.signal()!.aborted).toBe(true);
    expect(screen.getByText("Stopped. The answer above is unfinished.")).toBeInTheDocument();
    expect(screen.getByTestId("answer-text")).toHaveTextContent("Boil it for");
    expect(screen.getByRole("button", { name: "Ask again" })).toBeInTheDocument();
  });

  it("explains a failure part-way through and keeps what was written", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(
      sourcesEvent(),
      { type: "delta", text: "Boil it for" },
      {
        type: "error",
        failure: "interrupted",
        message: "The model server stopped part-way through the answer.",
      },
    );
    await served.end();
    expect(screen.getByRole("alert")).toHaveTextContent("The answer above is unfinished");
    expect(screen.getByRole("alert")).toHaveTextContent("The model server stopped part-way through the answer.");
    expect(screen.getByTestId("answer-text")).toHaveTextContent("Boil it for");
  });

  it("points at Settings when the model or its context is the problem", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), {
      type: "error",
      failure: "context-too-long",
      message: "The passages and the question were too long for the model. Lower the context budget in Settings.",
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No answer was written");
    expect(within(alert).getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings#answers-title");
  });

  it("says so when the connection drops before the answer ends", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boil" });
    await served.end();
    expect(screen.getByRole("alert")).toHaveTextContent(/connection to Outpost was lost before the answer was finished/);
  });

  it("passes on the server's refusal when another answer is being written", async () => {
    serve(ready, {
      status: 409,
      body: {
        error: { code: "conflict", message: "Outpost is already writing an answer, here or on another device.", details: { busy: true } },
      },
    });
    show("how long to boil water");
    await ask();
    expect(await screen.findByRole("alert")).toHaveTextContent("Outpost is already writing an answer, here or on another device.");
  });

  it("never acts on what an answer says: markup and addresses stay words", async () => {
    const served = serve(ready);
    show("sourdough starter");
    await ask();
    const hostile =
      'Visit [the fix](https://evil.example/x) or <a href="https://evil.example">here</a> <img src=x onerror="alert(1)"> <script>alert(2)</script> javascript:alert(3) [1]';
    await served.send(sourcesEvent({ question: "sourdough starter" }), { type: "delta", text: hostile }, done());
    const panel = screen.getByRole("region", { name: "Generated answer" });
    const text = within(panel).getByTestId("answer-text");
    // Every character is shown as written...
    expect(text).toHaveTextContent('Visit [the fix](https://evil.example/x) or <a href="https://evil.example">here</a>');
    // ...and none of it became an element. The only links in the panel are to sources Outpost supplied.
    expect(text.querySelector("a, img, script, iframe")).toBeNull();
    const links = within(panel)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(links).toEqual(["/library/documents/d-water?page=3", "/notes/n-kit"]);
  });

  it("does not follow a source address that is not a route inside Outpost", async () => {
    const served = serve(ready);
    show("how long to boil water");
    await ask();
    await served.send(sourcesEvent({ sources: [{ ...sources[0]!, url: "https://evil.example/doc" }] }), done());
    const panel = screen.getByRole("region", { name: "Generated answer" });
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
    expect(within(panel).getByText("Water treatment in the field, Boiling, page 3")).toBeInTheDocument();
  });

  it("draws nothing while the page is hidden, and everything that arrived once it is shown", async () => {
    const served = serve(ready);
    const { store } = show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boil it " });
    const panel = screen.getByRole("region", { name: "Generated answer" });
    const drawn = vi.fn();
    const unsubscribe = store.subscribe(drawn);
    const hide = (hidden: boolean) =>
      act(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    try {
      hide(true);
      await served.send({ type: "delta", text: "for one " }, { type: "delta", text: "minute [1]." });
      expect(drawn).not.toHaveBeenCalled();
      expect(within(panel).getByTestId("answer-text")).toHaveTextContent("Boil it");
      hide(false);
      expect(drawn).toHaveBeenCalledTimes(1);
      expect(within(panel).getByTestId("answer-text")).toHaveTextContent("Boil it for one minute [1].");
      // Hidden again when it finishes: what was held is drawn with the end, and nothing is lost.
      hide(true);
      await served.send({ type: "delta", text: " Let it cool." }, done());
      expect(within(panel).getByTestId("answer-text")).toHaveTextContent("Boil it for one minute [1]. Let it cool.");
    } finally {
      unsubscribe();
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("keeps the answer while the person is away reading a source, labelled with its question", async () => {
    const served = serve(ready);
    const first = show("how long to boil water");
    await ask();
    await served.send(sourcesEvent(), { type: "delta", text: "Boil it [1]." });
    first.unmount();
    // Still being written while the Search screen is not on show.
    await served.send({ type: "delta", text: " Then cool it [1]." }, done());
    show("stove fuel", first.store);
    const panel = await screen.findByRole("region", { name: "Generated answer" });
    expect(within(panel).getByTestId("answer-text")).toHaveTextContent("Boil it [1]. Then cool it [1].");
    expect(within(panel).getByText(/for “how long to boil water”/)).toBeInTheDocument();
    // A different question is in the box now, so a new answer is on offer above the old one.
    expect(await screen.findByRole("button", { name: "Answer from my library" })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Close this answer" }));
    expect(screen.queryByRole("region", { name: "Generated answer" })).not.toBeInTheDocument();
  });
});

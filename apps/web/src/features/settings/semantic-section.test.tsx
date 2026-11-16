import type { JobDto, SemanticStatus, Settings } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexCost, indexStage, SemanticSection, secondsLeft, timeLeft } from "./semantic-section";

const MODEL_ID = "built-in:all-MiniLM-L6-v2-q8-245889ee";
/** The built-in model as first shipped, which cut long passages off. */
const EARLIER_MODEL_ID = "built-in:all-MiniLM-L6-v2-q8-84769597";

const settings = (change: Partial<Settings> = {}) =>
  ({
    "search.semantic.enabled": true,
    "search.semantic.provider": "built-in",
    "search.semantic.model": "Xenova/all-MiniLM-L6-v2",
    "search.semantic.endpoint": "http://127.0.0.1:11434/v1",
    "search.hybrid.keywordWeight": 1,
    "search.hybrid.semanticWeight": 1,
    "search.hybrid.rrfK": 60,
    ...change,
  }) as Settings;

const status = (change: Partial<SemanticStatus> = {}): SemanticStatus => ({
  enabled: true,
  provider: "built-in",
  model: "Xenova/all-MiniLM-L6-v2",
  modelId: MODEL_ID,
  ready: true,
  reason: null,
  dimensions: 384,
  totalChunks: 5045,
  embeddedChunks: 0,
  otherModels: [],
  indexing: false,
  build: null,
  secondsLeft: null,
  keptChunks: change.embeddedChunks ?? 0,
  builtIn: {
    installed: true,
    reason: null,
    name: "all-MiniLM-L6-v2",
    licence: "Apache-2.0",
    madeBy: "The Sentence Transformers project",
    languages: "English",
    dimensions: 384,
    bytes: 23_684_397,
    threads: 4,
  },
  ...change,
});

const job = (change: Partial<JobDto> = {}): JobDto => ({
  id: "j1",
  type: "semantic.index",
  queue: "index",
  state: "running",
  title: "Build semantic search index",
  subject: `semantic:${MODEL_ID}`,
  progress: { current: 1200, total: 5045, message: "1200 of 5045 passages" },
  error: null,
  errorKind: null,
  attempts: 1,
  maxAttempts: 3,
  result: null,
  createdAt: 1,
  startedAt: 1,
  finishedAt: null,
  updatedAt: 1,
  ...change,
});

let requests: string[] = [];

/** Answers the section's requests. `next` is what the status becomes after any action. */
function serve(first: SemanticStatus, next: SemanticStatus = first) {
  requests = [];
  let current = first;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (method !== "GET" || url.search) {
        requests.push(`${method} ${url.pathname}${url.search}`);
        current = next;
      }
      if (["/api/semantic/status", "/api/semantic/index", "/api/semantic/use-built-in"].includes(url.pathname)) return json(current);
      if (url.pathname.startsWith("/api/jobs/")) return json({ job: job() });
      if (url.pathname.startsWith("/api/semantic/models/")) return json({ removed: 5045 });
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
}

function show(current: Settings) {
  const saved: Array<[string, unknown]> = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SemanticSection settings={current} disabled={false} save={(key, value) => saved.push([key, value])} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { saved, section: () => screen.getByRole("region", { name: "Search by meaning" }) };
}

/** Everything but the switch is behind this one line. */
const openMoreOptions = () => userEvent.click(screen.getByText("More options"));
const OFF = { enabled: false, modelId: null, ready: false, reason: "Semantic search is turned off." } as const;

afterEach(() => vi.unstubAllGlobals());

describe("search by meaning in Settings: the first level", () => {
  it("is one switch while it is off, and says in plain words what turning it on will cost", async () => {
    serve(status(OFF));
    const { saved } = show(settings({ "search.semantic.enabled": false }));

    expect(await screen.findByText("Off")).toBeVisible();
    expect(
      screen.getByText(
        "Turn it on and Outpost reads your library once, on this computer: about 4 minutes for its 5,045 passages on a recent laptop, longer on a small computer, and about 10.9 MB of disk. Nothing leaves this computer.",
      ),
    ).toBeVisible();
    // One thing to press, a guide, and one quiet line for everything else.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set-up guide" })).toHaveAttribute("href", "/help/search-and-answers#search-by-meaning");
    expect(screen.getByText("More options")).toBeVisible();
    // No word of the machinery on the first level.
    expect(screen.getByRole("region", { name: "Search by meaning" })).not.toHaveTextContent(
      /embedding|provider|vector|index|OpenAI|model/i,
    );

    await userEvent.click(screen.getByRole("switch", { name: "Search by meaning" }));
    expect(saved).toEqual([["search.semantic.enabled", true]]);
  });

  it("says it is starting once switched on, without asking for anything more", async () => {
    serve(status(OFF), status());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (current: Settings, save: (key: string, value: unknown) => void) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SemanticSection settings={current} disabled={false} save={save} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const saved: unknown[] = [];
    const { rerender } = render(view(settings({ "search.semantic.enabled": false }), (...change) => saved.push(change)));
    await userEvent.click(await screen.findByRole("switch", { name: "Search by meaning" }));
    // The setting is saved; the server starts reading by itself, and until it says so the screen says "Starting".
    serve(status());
    rerender(view(settings(), () => {}));
    expect(await screen.findByText("Starting")).toBeVisible();
    expect(await screen.findByText("Outpost is about to read your library.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Start reading|Build index/ })).not.toBeInTheDocument();
    expect(requests).not.toContain("POST /api/semantic/index");
  });

  it("shows the reading with an honest estimate, from the build's own speed once there is one", async () => {
    serve(status({ indexing: true, embeddedChunks: 1200, secondsLeft: 290, build: job() }));
    show(settings());

    expect(await screen.findByText("Reading your library")).toBeVisible();
    expect(screen.getByText("Reading 5,045 passages, about 5 minutes left.")).toBeVisible();
    expect(Number(screen.getByRole("progressbar", { name: "Reading your library" }).getAttribute("aria-valuenow"))).toBeCloseTo(23.8, 1);
    expect(screen.getByText(/1,200 read so far, and searches already use them. You can leave this page; it carries on/)).toBeVisible();
    expect(screen.getByText(/Turning the switch off pauses it and keeps what was read/)).toBeVisible();
    // Nothing to press but the switch.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("quotes the measured laptop figure, and says that is what it is, until the build can be timed", async () => {
    serve(
      status({
        indexing: true,
        embeddedChunks: 0,
        secondsLeft: null,
        build: job({ progress: { current: 0, total: 5045, message: null } }),
      }),
    );
    show(settings());
    expect(await screen.findByText("Reading 5,045 passages, about 4 minutes on a recent laptop.")).toBeVisible();
  });

  it("says when it is ready, with nothing left to press", async () => {
    serve(status({ embeddedChunks: 5045, build: job({ state: "succeeded" }) }));
    show(settings());

    expect(await screen.findByText("Ready")).toBeVisible();
    expect(
      screen.getByText("Search now also finds things by meaning. What you add is read as it arrives. Nothing leaves this computer."),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says that what was read is kept while it is off", async () => {
    serve(status({ ...OFF, keptChunks: 5045, otherModels: [{ modelId: MODEL_ID, dimensions: 384, vectors: 5045 }] }));
    show(settings({ "search.semantic.enabled": false }));
    expect(
      await screen.findByText("What Outpost read before is kept (5,045 passages, 10.9 MB), so turning it on again takes no time."),
    ).toBeVisible();
  });

  it("says a paused reading is paused, and carries on with one press", async () => {
    serve(status({ embeddedChunks: 1200, build: job({ state: "paused" }) }));
    show(settings());

    expect(await screen.findByText("On, and not finished reading")).toBeVisible();
    expect(screen.getByText("Paused. 3,845 passages still to read.")).toBeVisible();
    expect(screen.getByText("Searches already use what has been read.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Carry on reading" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
  });

  it("says why the reading stopped, keeps what was read, and tries again with one press", async () => {
    serve(
      status({
        embeddedChunks: 300,
        build: job({ state: "failed", error: "The built-in model needed more memory than Outpost allows, so it was stopped." }),
      }),
    );
    show(settings());

    expect(await screen.findByText("Reading stopped with 4,745 passages still to read.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The built-in model needed more memory than Outpost allows, so it was stopped. What was read before that is kept.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
  });

  it("says when there is nothing to read yet", async () => {
    serve(status({ totalChunks: 0, build: job({ state: "succeeded" }) }));
    show(settings());
    expect(await screen.findByText("There is nothing to read yet. What you add is read as it arrives.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("notices a set-up pointing at a server that does not answer, and offers what comes with Outpost in one press", async () => {
    serve(
      status({
        provider: "openai-compatible",
        modelId: "openai-compatible:nomic-embed-text",
        ready: false,
        reason: "The embedding server at http://127.0.0.1:11434/v1 is not reachable. Check that it is running.",
      }),
      status({ indexing: true, build: job({ state: "queued", progress: { current: 0, total: null, message: null } }) }),
    );
    show(settings({ "search.semantic.provider": "openai-compatible", "search.semantic.model": "nomic-embed-text" }));

    expect(await screen.findByText("On, but not working yet")).toBeVisible();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The program this was set up to use is not answering");
    expect(notice).toHaveTextContent(
      "Search by meaning was pointed at a program of your own at 127.0.0.1:11434, and nothing there is answering. Outpost comes with what it needs, with nothing to install.",
    );
    await userEvent.click(within(notice).getByRole("button", { name: "Use what comes with Outpost" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/use-built-in"));
  });

  it("says so, and offers the same, when it was left switched off and pointing at a server of the person's own", async () => {
    serve(status({ ...OFF, provider: "openai-compatible" }));
    show(settings({ "search.semantic.enabled": false, "search.semantic.provider": "openai-compatible" }));

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("This was set up to use a separate program");
    expect(notice).toHaveTextContent("at 127.0.0.1:11434. If you do not run one, there is no need to: Outpost comes with what it needs");
    // Nothing has been asked of that server: it is off.
    expect(within(notice).queryByRole("button", { name: "Try my own again" })).not.toBeInTheDocument();
    await userEvent.click(within(notice).getByRole("button", { name: "Use what comes with Outpost" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/use-built-in"));
  });

  it("lets a person who does run a server try it again", async () => {
    const down = status({
      provider: "openai-compatible",
      modelId: "openai-compatible:nomic-embed-text",
      ready: false,
      reason: "The embedding server at http://127.0.0.1:11434/v1 is not reachable. Check that it is running.",
    });
    serve(down, { ...down, ready: true, reason: null, indexing: true, build: job() });
    show(settings({ "search.semantic.provider": "openai-compatible", "search.semantic.model": "nomic-embed-text" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try my own again" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
    expect(await screen.findByText("Reading your library")).toBeVisible();
  });

  it("says plainly when the installation is missing the part that does this, and offers nothing that cannot work", async () => {
    const reason = "The built-in model has not been fetched yet. Run `node scripts/fetch-embedding-model.mjs` once to fetch it.";
    serve(status({ ready: false, reason, dimensions: null, builtIn: { ...status().builtIn, installed: false, reason } }));
    show(settings());

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("This installation is missing the part that does this");
    expect(notice).toHaveTextContent(reason);
    expect(notice).toHaveTextContent("Ordinary search is not affected.");
    // Asking again cannot make missing files appear.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("says when it could not be started, and tries again on request", async () => {
    const reason =
      "The built-in model's file tokenizer.json does not match its checksum, so it is damaged or is not the file Outpost was built with. Install Outpost again.";
    serve(status({ ready: false, reason, dimensions: null }), status({ indexing: true, build: job() }));
    show(settings());

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The part of Outpost that does this could not be started");
    expect(notice).toHaveTextContent(reason);
    await userEvent.click(within(notice).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
    expect(await screen.findByText("Reading your library")).toBeVisible();
  });
});

describe("search by meaning in Settings: more options", () => {
  it("is closed to begin with, and draws nothing until it is opened", async () => {
    serve(status());
    show(settings());
    await screen.findByText("More options");
    expect(screen.queryByRole("radiogroup", { name: "Where the model runs" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Weight of matching words")).not.toBeInTheDocument();
    await openMoreOptions();
    expect(await screen.findByRole("radiogroup", { name: "Where the model runs" })).toBeVisible();
  });

  it("says what it will cost in the measured figures, while it is off", async () => {
    serve(status(OFF));
    show(settings({ "search.semantic.enabled": false }));
    await screen.findByText("Off");
    await openMoreOptions();

    expect(await screen.findByText("Time to build the index")).toBeVisible();
    // Per thousand passages as measured, and for this library's 5,045.
    expect(screen.getByText(/About 45 seconds for every thousand passages on a recent laptop/)).toBeVisible();
    expect(screen.getByText(/This library has 5,045: about 4 minutes on that laptop/)).toBeVisible();
    expect(screen.getByText(/About 2.16 MB for every thousand passages.*For this library, about 10.9 MB/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Build index" })).not.toBeInTheDocument();
  });

  it("offers the built-in model first, credits it, and builds the index when asked", async () => {
    serve(status(), status({ indexing: true, build: job({ state: "queued", progress: { current: 0, total: null, message: null } }) }));
    const { saved } = show(settings());
    await screen.findByText("More options");
    await openMoreOptions();

    const choice = await screen.findByRole("radiogroup", { name: "Where the model runs" });
    const options = within(choice).getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual(["Built in", "Local server"]);
    expect(options[0]).toBeChecked();
    expect(screen.getByText(/comes with Outpost and runs on this device. Nothing to install, nothing to download/)).toBeVisible();
    // The credit: which model, whose, under what licence, and what it is not good at.
    const credit = await screen.findByText(/The built-in model is/);
    expect(credit).toHaveTextContent(
      "all-MiniLM-L6-v2 (23.7 MB), made by the Sentence Transformers project and used under the Apache-2.0 licence",
    );
    expect(credit).toHaveTextContent("trained on English text and matches other languages poorly");
    // A local server's fields are not shown for the built-in model.
    expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();

    expect(await screen.findByText("Index not built yet")).toBeVisible();
    expect(screen.getByText("0 of 5,045 passages")).toBeVisible();
    expect(screen.getByText(/Building reads 5,045 passages and adds about 10.9 MB to the database/)).toBeVisible();
    expect(screen.getByText(/On a recent laptop that takes about 4 minutes/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Build index" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
    expect(await screen.findByText("Building the index")).toBeVisible();

    await userEvent.click(within(choice).getByRole("radio", { name: "Local server" }));
    expect(saved).toEqual([["search.semantic.provider", "openai-compatible"]]);
  });

  it("shows a running build with its progress, and pauses or stops it", async () => {
    serve(status({ indexing: true, embeddedChunks: 1200, secondsLeft: 290, build: job() }));
    show(settings());
    await screen.findByText("Reading your library");
    await openMoreOptions();

    expect(await screen.findByText("Building the index")).toBeVisible();
    expect(screen.getByText("1,200 of 5,045 passages, about 5 minutes left")).toBeVisible();
    expect(Number(screen.getByRole("progressbar", { name: "Semantic index" }).getAttribute("aria-valuenow"))).toBeCloseTo(23.8, 1);
    expect(screen.queryByRole("button", { name: /Build index|Continue building/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(requests).toContain("POST /api/jobs/j1/pause"));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(requests).toContain("POST /api/jobs/j1/cancel"));
  });

  it("says a build is paused and offers to continue it", async () => {
    serve(status({ embeddedChunks: 1200, build: job({ state: "paused" }) }));
    show(settings());
    await screen.findByText("Paused. 3,845 passages still to read.");
    await openMoreOptions();

    expect(await screen.findByText("Building is paused")).toBeVisible();
    expect(screen.getByText(/3,845 passages still to read. Searches already use the part that is built/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continue building" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
  });

  it("says when the index is up to date, with nothing left to press but saving it", async () => {
    serve(status({ embeddedChunks: 5045, build: job({ state: "succeeded" }) }));
    show(settings());
    await screen.findByText("Ready");
    await openMoreOptions();

    expect(await screen.findByText("Index is up to date")).toBeVisible();
    expect(screen.getByText("5,045 of 5,045 passages")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Build index|Continue building|Try again|Pause/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save vectors to a file" })).toHaveAttribute("href", "/api/semantic/export");
    expect(screen.getByRole("button", { name: "Load vectors from a file" })).toBeEnabled();
  });

  it("keeps the local server for people who run one", async () => {
    serve(
      status({
        provider: "openai-compatible",
        modelId: "openai-compatible:nomic-embed-text",
        ready: false,
        reason: "The embedding server at http://127.0.0.1:11434/v1 is not reachable. Check that it is running.",
        otherModels: [{ modelId: MODEL_ID, dimensions: 384, vectors: 5045 }],
      }),
    );
    show(settings({ "search.semantic.provider": "openai-compatible", "search.semantic.model": "nomic-embed-text" }));
    await screen.findByText("On, but not working yet");
    await openMoreOptions();

    expect(await screen.findByLabelText("Server address")).toHaveValue("http://127.0.0.1:11434/v1");
    expect(screen.getByLabelText("Model")).toHaveValue("nomic-embed-text");
    expect(screen.getByText(/such as Ollama or llama.cpp. Use it for a larger model, or one trained on other languages/)).toBeVisible();
    expect(screen.queryByText(/The built-in model is/)).not.toBeInTheDocument();
    const notice = screen.getByText("The model is not answering").closest('[role="status"]') as HTMLElement;
    expect(within(notice).getByRole("button", { name: "Check again" })).toBeVisible();
    // The built-in model's vectors are kept, and say how much room they take.
    const kept = screen.getByText(MODEL_ID).closest("li");
    expect(kept).toHaveTextContent("5,045 passages, 10.9 MB");
  });

  it("says that vectors from an earlier built-in model are not used and need building again", async () => {
    serve(status({ otherModels: [{ modelId: EARLIER_MODEL_ID, dimensions: 384, vectors: 5045 }] }));
    show(settings());
    await screen.findByText("More options");
    await openMoreOptions();

    // Nothing is built for the model in use, so the screen offers to build, as for any change of model.
    expect(await screen.findByText("Index not built yet")).toBeVisible();
    expect(screen.getByText("0 of 5,045 passages")).toBeVisible();
    expect(screen.getByRole("button", { name: "Build index" })).toBeEnabled();
    expect(
      screen.getByText(/An earlier version of the built-in model made some of these.*build the index again, then remove them/),
    ).toBeVisible();
    const kept = screen.getByText(EARLIER_MODEL_ID).closest("li");
    expect(kept).toHaveTextContent("5,045 passages, 10.9 MB");
    await userEvent.click(within(kept as HTMLElement).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(requests).toContain(`DELETE /api/semantic/models/${encodeURIComponent(EARLIER_MODEL_ID)}`));
  });

  it("shows the demonstration choice only to someone who already made it", async () => {
    serve(status({ provider: "demo", modelId: "demo:word-counts", dimensions: 256 }));
    show(settings({ "search.semantic.provider": "demo" }));
    await screen.findByText("More options");
    await openMoreOptions();
    const choice = await screen.findByRole("radiogroup", { name: "Where the model runs" });
    expect(
      within(choice)
        .getAllByRole("radio")
        .map((option) => option.textContent),
    ).toEqual(["Built in", "Local server", "Demonstration"]);
    expect(screen.getByText(/Results follow shared words, not meaning; choose Built in for the real thing/)).toBeVisible();
  });

  it("holds the numbers that weigh the two searches against each other", async () => {
    serve(status({ embeddedChunks: 5045, build: job({ state: "succeeded" }) }));
    const { saved } = show(settings());
    await screen.findByText("Ready");
    await openMoreOptions();
    const weight = await screen.findByLabelText("Weight of matching meaning");
    await userEvent.clear(weight);
    await userEvent.type(weight, "1.5{Enter}");
    expect(saved).toEqual([["search.hybrid.semanticWeight", 1.5]]);
    expect(screen.getByLabelText("Weight of matching words")).toHaveValue(1);
    expect(screen.getByLabelText("Evenness of combining")).toHaveValue(60);
    expect(screen.getByRole("link", { name: "Try the three settings on a question of your own" })).toHaveAttribute(
      "href",
      "/search/how-it-works#fig-formula",
    );
  });
});

describe("the sums behind the screen", () => {
  it("costs an index from the measured figures", () => {
    expect(indexCost(1000, 384)).toEqual({ disk: "2.16 MB", time: "45 seconds" });
    expect(indexCost(100_000, 384)).toEqual({ disk: "216 MB", time: "1 hour 15 minutes" });
    expect(indexCost(0, 384).time).toBe("1 second");
  });

  it("judges the time left from how fast the build is really going", () => {
    const first = { at: 0, done: 100 };
    // Too little to judge by.
    expect(secondsLeft(first, { at: 2_000, done: 140 }, 1000)).toBeNull();
    expect(secondsLeft(first, { at: 60_000, done: 104 }, 1000)).toBeNull();
    // 200 passages in 10 seconds is 20 a second; 700 are left.
    expect(secondsLeft(first, { at: 10_000, done: 300 }, 1000)).toBe(35);
    expect(secondsLeft(first, { at: 10_000, done: 1000 }, 1000)).toBe(0);
  });

  it("says how long is left in words, and stops counting when it is nearly done", () => {
    expect(timeLeft(290)).toBe("about 5 minutes left");
    expect(timeLeft(45)).toBe("about 45 seconds left");
    expect(timeLeft(3)).toBe("a few seconds left");
  });

  it("names the state of the index", () => {
    const base = { indexing: false, build: null, embeddedChunks: 0, totalChunks: 10 };
    expect(indexStage(base)).toBe("empty");
    expect(indexStage({ ...base, embeddedChunks: 4 })).toBe("partial");
    expect(indexStage({ ...base, embeddedChunks: 10 })).toBe("complete");
    expect(indexStage({ ...base, indexing: true, build: job() })).toBe("building");
    expect(indexStage({ ...base, indexing: true, build: job({ state: "queued", error: "the model fell over" }) })).toBe("waiting");
    expect(indexStage({ ...base, embeddedChunks: 4, build: job({ state: "paused" }) })).toBe("paused");
    expect(indexStage({ ...base, embeddedChunks: 4, build: job({ state: "failed", error: "no" }) })).toBe("failed");
    // A stopped build is simply a partly built index.
    expect(indexStage({ ...base, embeddedChunks: 4, build: job({ state: "cancelled" }) })).toBe("partial");
    // New passages after a finished build: the index is behind, not broken.
    expect(indexStage({ ...base, embeddedChunks: 10, totalChunks: 12, build: job({ state: "succeeded" }) })).toBe("partial");
  });
});

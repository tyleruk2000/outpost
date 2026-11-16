import type { JobDto, SemanticStatus, Settings } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexCost, indexStage, SemanticSection, secondsLeft } from "./semantic-section";

const MODEL_ID = "built-in:all-MiniLM-L6-v2-q8-245889ee";
/** The built-in model as first shipped, which cut long passages off. */
const EARLIER_MODEL_ID = "built-in:all-MiniLM-L6-v2-q8-84769597";

const settings = (change: Partial<Settings> = {}) =>
  ({
    "search.semantic.enabled": true,
    "search.semantic.provider": "built-in",
    "search.semantic.model": "Xenova/all-MiniLM-L6-v2",
    "search.semantic.endpoint": "http://127.0.0.1:11434/v1",
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
      if (url.pathname === "/api/semantic/status" || url.pathname === "/api/semantic/index") return json(current);
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
      <SemanticSection settings={current} disabled={false} save={(key, value) => saved.push([key, value])} />
    </QueryClientProvider>,
  );
  return { saved, section: () => screen.getByRole("region", { name: "Search by meaning" }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("search by meaning in Settings", () => {
  it("says what it will cost before it is switched on", async () => {
    serve(status({ enabled: false, modelId: null, ready: false, reason: "Semantic search is turned off." }));
    const { saved } = show(settings({ "search.semantic.enabled": false }));

    expect(await screen.findByText("Time to build the index")).toBeVisible();
    // Per thousand passages as measured, and for this library's 5,045.
    expect(screen.getByText(/About 45 seconds for every thousand passages on a recent laptop/)).toBeVisible();
    expect(screen.getByText(/This library has 5,045: about 4 minutes on that laptop/)).toBeVisible();
    expect(screen.getByText(/About 2.16 MB for every thousand passages.*For this library, about 10.9 MB/)).toBeVisible();
    expect(screen.getByText(/Nothing is sent to the internet/)).toBeVisible();
    // Nothing else is offered until it is on.
    expect(screen.queryByRole("radiogroup", { name: "Where the model runs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build index" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Search by meaning" }));
    expect(saved).toEqual([["search.semantic.enabled", true]]);
  });

  it("offers the built-in model first, credits it, and builds the index when asked", async () => {
    serve(status(), status({ indexing: true, build: job({ state: "queued", progress: { current: 0, total: null, message: null } }) }));
    const { saved } = show(settings());

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
    serve(status({ indexing: true, embeddedChunks: 1200, build: job() }));
    show(settings());

    expect(await screen.findByText("Building the index")).toBeVisible();
    expect(screen.getByText("1,200 of 5,045 passages")).toBeVisible();
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

    expect(await screen.findByText("Building is paused")).toBeVisible();
    expect(screen.getByText(/3,845 passages still to read. Searches already use the part that is built/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continue building" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
  });

  it("says why a build failed, keeps what was built, and offers to try again", async () => {
    serve(
      status({
        embeddedChunks: 300,
        build: job({ state: "failed", error: "The built-in model needed more memory than Outpost allows, so it was stopped." }),
      }),
    );
    show(settings());

    expect(await screen.findByText("The build stopped")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The built-in model needed more memory than Outpost allows, so it was stopped. What was built before that is kept.",
    );
    expect(screen.getByText("300 of 5,045 passages")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(requests).toContain("POST /api/semantic/index"));
  });

  it("says when the index is up to date, with nothing left to press but saving it", async () => {
    serve(status({ embeddedChunks: 5045, build: job({ state: "succeeded" }) }));
    show(settings());

    expect(await screen.findByText("Index is up to date")).toBeVisible();
    expect(screen.getByText("5,045 of 5,045 passages")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Build index|Continue building|Try again|Pause/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save vectors to a file" })).toHaveAttribute("href", "/api/semantic/export");
  });

  it("says plainly when the built-in model is not part of the installation", async () => {
    const reason = "The built-in model has not been fetched yet. Run `node scripts/fetch-embedding-model.mjs` once to fetch it.";
    serve(status({ ready: false, reason, dimensions: null, builtIn: { ...status().builtIn, installed: false, reason } }));
    show(settings());

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The built-in model is not part of this installation");
    expect(notice).toHaveTextContent(reason);
    expect(notice).toHaveTextContent("Ordinary search is not affected. A local server can be used instead.");
    // Asking again cannot make missing files appear, and there is no index to build.
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build index" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("says when the built-in model is installed but would not start, and checks again on request", async () => {
    const reason =
      "The built-in model's file tokenizer.json does not match its checksum, so it is damaged or is not the file Outpost was built with. Install Outpost again.";
    serve(status({ ready: false, reason, dimensions: null }), status());
    show(settings());

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The built-in model could not be started");
    expect(notice).toHaveTextContent(reason);
    await userEvent.click(within(notice).getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(requests).toContain("GET /api/semantic/status?fresh=1"));
    expect(await screen.findByText("Index not built yet")).toBeVisible();
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

    expect(await screen.findByLabelText("Server address")).toHaveValue("http://127.0.0.1:11434/v1");
    expect(screen.getByLabelText("Model")).toHaveValue("nomic-embed-text");
    expect(screen.getByText(/such as Ollama or llama.cpp. Use it for a larger model, or one trained on other languages/)).toBeVisible();
    expect(screen.queryByText(/The built-in model is/)).not.toBeInTheDocument();
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The model is not answering");
    expect(within(notice).getByRole("button", { name: "Check again" })).toBeVisible();
    // The built-in model's vectors are kept, and say how much room they take.
    const kept = screen.getByText(MODEL_ID).closest("li");
    expect(kept).toHaveTextContent("5,045 passages, 10.9 MB");
  });

  it("says that vectors from an earlier built-in model are not used and need building again", async () => {
    serve(status({ otherModels: [{ modelId: EARLIER_MODEL_ID, dimensions: 384, vectors: 5045 }] }));
    show(settings());

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
    const choice = await screen.findByRole("radiogroup", { name: "Where the model runs" });
    expect(
      within(choice)
        .getAllByRole("radio")
        .map((option) => option.textContent),
    ).toEqual(["Built in", "Local server", "Demonstration"]);
    expect(screen.getByText(/Results follow shared words, not meaning; choose Built in for the real thing/)).toBeVisible();
  });
});

describe("the sums behind the screen", () => {
  it("costs an index from the measured figures", () => {
    expect(indexCost(1000, 384)).toEqual({ disk: "2.16 MB", time: "45 seconds" });
    expect(indexCost(100_000, 384)).toEqual({ disk: "216 MB", time: "1 hour 15 minutes" });
    expect(indexCost(0, 384).time).toBe("1 seconds");
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

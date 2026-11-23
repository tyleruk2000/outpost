import type { ExplainChunk, ExplainEntity, ExplainHit, ExplainOverview, ExplainResponse, ProjectionResponse } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import UnderstandPage from "./understand-page";

const overview: ExplainOverview = {
  entities: { document: 2, note: 1, catalog: 4 },
  chunks: 9,
  chunkLengths: [
    { from: 0, to: 150, count: 4 },
    { from: 900, to: 1050, count: 3 },
    { from: 1050, to: 1200, count: 2 },
  ],
  settings: { chunkSize: 1200, chunkOverlap: 150, rrfK: 60, keywordWeight: 1, semanticWeight: 1 },
  vectors: {
    source: "demonstration",
    modelId: "demo:word-counts",
    dimensions: 256,
    reason: "Search by meaning is turned off in Settings, so word-count vectors are used here to show how it works.",
    embedded: 0,
    total: 9,
  },
};

const entities: ExplainEntity[] = [
  { kind: "document", entityId: "d-water", title: "Water treatment in the field", url: "/library/documents/d-water", chunks: 3 },
  { kind: "document", entityId: "d-knots", title: "Knots for climbing", url: "/library/documents/d-knots", chunks: 2 },
  { kind: "note", entityId: "n-kit", title: "Kit list", url: "/notes/n-kit", chunks: 1 },
];

const first = "Boiling is the most reliable way to make water safe to drink. Bring it to a rolling boil for one minute.";
const shared = " At altitude, boil for three minutes.";
const chunks: ExplainChunk[] = [
  {
    chunkId: 1,
    ordinal: 0,
    heading: "Water treatment in the field",
    page: null,
    text: "Clear water is not always clean water.",
    charStart: 0,
    charEnd: 38,
    overlapWithPrevious: 0,
    contentHash: "aaaa1111",
    hasVector: false,
  },
  {
    chunkId: 2,
    ordinal: 1,
    heading: "Boiling",
    page: null,
    text: `${first}${shared}`,
    charStart: 40,
    charEnd: 40 + first.length + shared.length,
    overlapWithPrevious: 0,
    contentHash: "bbbb2222",
    hasVector: false,
  },
  {
    chunkId: 3,
    ordinal: 2,
    heading: "Boiling",
    page: null,
    text: `${shared.trim()} Let it cool before drinking.`,
    charStart: 41 + first.length,
    charEnd: 41 + first.length + 64,
    overlapWithPrevious: shared.length - 1,
    contentHash: "cccc3333",
    hasVector: false,
  },
];

const hit = (chunkId: number, rank: number, title: string, heading: string | null): ExplainHit => ({
  rank,
  chunkId,
  kind: "document",
  entityId: `d-${chunkId}`,
  title,
  url: `/library/documents/d-${chunkId}`,
  page: null,
  heading,
  segments: [
    { text: "Bring the ", hit: false },
    { text: "water", hit: true },
    { text: " to a rolling boil.", hit: false },
  ],
  length: 400,
});
const vector = (lit: number[]) => Array.from({ length: 64 }, (_, index) => (lit.includes(index) ? 0.5 : 0));

function explain(query: string): ExplainResponse {
  const keywordHits = [hit(11, 1, "Alpha stoves", "Boiling"), hit(12, 2, "Bravo knots", null), hit(13, 3, "Charlie water", "Storing")];
  const semanticHits = [hit(14, 1, "Delta weather", "Fog"), hit(13, 2, "Charlie water", "Storing"), hit(11, 3, "Alpha stoves", "Boiling")];
  return {
    query,
    parse: {
      words: ["boil", "water"],
      ignored: ["how", "to"],
      excluded: [],
      prefixLast: true,
      expression: '("boil" AND "water"*)',
      relaxed: false,
      terms: [
        { term: "boil", chunksContaining: 2, idf: 1.2993 },
        { term: "water", chunksContaining: 5, idf: 0.5978 },
      ],
      totalChunks: 9,
    },
    keyword: {
      tookMs: 0.4,
      hits: keywordHits.map((item, index) => ({
        ...item,
        score: 0.9 - index * 0.2,
        bm25: 8 - index * 2,
        why: index === 0 ? "All 2 words, side by side" : "All 2 words",
        parts: { coverage: 1, title: index === 2 ? 1 : 0, closeness: 1 - index * 0.3, phrase: index === 0 ? 1 : 0, frequency: 0.5 },
        fields: { title: index === 2, heading: index === 0, text: true, tags: false },
      })),
    },
    semantic: {
      source: "demonstration",
      modelId: "demo:word-counts",
      dimensions: 256,
      reason: overview.vectors.reason,
      tookMs: 3,
      compared: 9,
      queryVector: vector([16]),
      queryTerms: ["boil", "water"],
      hits: semanticHits.map((item, index) => ({
        ...item,
        similarity: 0.5 - index * 0.1,
        vector: vector([16, 20 + index]),
        sharesWords: item.chunkId !== 14,
      })),
    },
    fusion: { k: 60, keywordWeight: 1, semanticWeight: 1, rows: [] },
    context: {
      text: "[1] Alpha stoves, Boiling\nBring the water to a rolling boil.\n\n[2] Charlie water, Storing\nKeep treated water covered.",
      citations: [
        {
          marker: 1,
          chunkId: 11,
          title: "Alpha stoves",
          heading: "Boiling",
          page: null,
          url: "/library/documents/d-11",
          quote: "Bring the water to a rolling boil.",
        },
        {
          marker: 2,
          chunkId: 13,
          title: "Charlie water",
          heading: "Storing",
          page: 4,
          url: "/library/documents/d-13?page=4",
          quote: "Keep treated water covered.",
        },
      ],
      omitted: 1,
      safetyCritical: true,
      characters: 116,
      approxTokens: 29,
    },
    prompt: {
      system: "Answer the question using only the numbered sources below.",
      user: `Sources:\n\n[1] Alpha stoves\n\nQuestion: ${query}`,
      approxTokens: 31,
    },
    timings: { keywordMs: 0.4, semanticMs: 3, fusionMs: 0.1, contextMs: 0.2, totalMs: 4.1 },
  };
}

const projection: ProjectionResponse = {
  source: "demonstration",
  modelId: "demo:word-counts",
  dimensions: 256,
  reason: overview.vectors.reason,
  explained: [0.2, 0.1],
  points: [
    {
      chunkId: 11,
      x: 0.1,
      y: 0.2,
      kind: "document",
      title: "Alpha stoves",
      excerpt: "Bring the water to a rolling boil.",
      similarity: 0.5,
      nearest: true,
    },
    {
      chunkId: 12,
      x: -0.4,
      y: 0.1,
      kind: "document",
      title: "Bravo knots",
      excerpt: "The bowline makes a fixed loop.",
      similarity: 0,
      nearest: false,
    },
    { chunkId: 21, x: 0.3, y: -0.3, kind: "note", title: "Kit list", excerpt: "Stove, gas, lighter.", similarity: 0.1, nearest: false },
  ],
  query: { x: 0.15, y: 0.25 },
  shown: 3,
  total: 3,
};

interface Served {
  calls: string[];
  explained: string[];
}

function serve(options: { overview?: ExplainOverview; failExplain?: boolean } = {}): Served {
  const served: Served = { calls: [], explained: [] };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      served.calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/api/retrieval/overview") return json(options.overview ?? overview);
      if (url.pathname === "/api/retrieval/entities") return json({ entities });
      if (url.pathname === "/api/retrieval/chunks")
        return json({
          entity: entities.find((entity) => entity.entityId === url.searchParams.get("entityId")) ?? entities[0],
          chunks,
          chunkSize: 1200,
          chunkOverlap: 150,
        });
      if (url.pathname === "/api/retrieval/explain") {
        const body = JSON.parse(String(init?.body)) as { query: string };
        served.explained.push(body.query);
        if (options.failExplain) return json({ error: { code: "internal", message: "The index could not be read." } }, 500);
        return json(explain(body.query));
      }
      if (url.pathname === "/api/retrieval/projection") return json(projection);
      return json({ error: { code: "not_found", message: "Not found" } }, 404);
    }),
  );
  return served;
}

function show(path = "/search/how-it-works") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <UnderstandPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const finalOrder = () =>
  within(screen.getByRole("list", { name: /Final order/ }))
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace(/^\d+/, "").replace(/[↑↓]\d+$/, "") ?? "");

afterEach(() => vi.unstubAllGlobals());

describe("How search works", () => {
  it("shows outlines and invitations before a question, with examples taken from the library", async () => {
    const served = serve();
    show();
    expect(await screen.findByRole("button", { name: "Boiling" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Knots for climbing" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been traced yet/)).toBeInTheDocument();
    // Figures that need a trace invite one; they do not show sample data.
    expect(screen.getAllByRole("link", { name: "Trace a question" }).length).toBeGreaterThan(8);
    expect(screen.queryByRole("img", { name: /^Rank 1:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Final order/ })).not.toBeInTheDocument();
    expect(served.explained).toEqual([]);
    // What does not need a question is already real: the index in a sentence, and the vector honesty notice.
    expect(screen.getByText(/the index holds 2 documents and 1 page of your own, plus 4 short entries/)).toBeInTheDocument();
    expect(screen.getByText("These are demonstration vectors, not a language model")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Set up search by meaning in Settings/ })[0]).toHaveAttribute(
      "href",
      "/settings#semantic-title",
    );
  });

  it("traces the question in the address once and draws every stage from it", async () => {
    const served = serve();
    show("/search/how-it-works?q=boil%20water");
    expect(await screen.findByText(/Traced “boil water” in 4.1 ms/)).toBeInTheDocument();
    expect(served.explained).toEqual(["boil water"]);

    // The expression really sent, and the rule about the last word.
    expect(screen.getByText('("boil" AND "water"*)')).toBeInTheDocument();
    expect(screen.getByText(/any word starting with these letters/)).toBeInTheDocument();
    // Rarity, keyword bars and field marks.
    expect(screen.getByRole("img", { name: "boil: in 2 of 9 passages" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Rank 1: Alpha stoves, Boiling. Score 0.9/ })).toBeInTheDocument();
    // Vectors: the words behind the demonstration vector, and a bar per passage.
    expect(screen.getByText(/Your question’s vector is built from 2 words: “boil”, “water”/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Rank 1: Delta weather, Fog. Cosine similarity 0.50/ })).toBeInTheDocument();
    // Demonstration vectors only find shared words, so the point is made by a marked illustration, with no scores.
    expect(screen.getByRole("heading", { name: "An illustration, not from your library" })).toBeInTheDocument();
    expect(screen.getByText(/my dog ate chocolate/)).toBeInTheDocument();
    // Fusion, in the server's order.
    expect(finalOrder()).toEqual(["Alpha stoves · Boiling", "Charlie water · Storing", "Delta weather · Fog", "Bravo knots"]);
    // Context: the safety rule, the numbered sources with their links, and what was left out.
    expect(screen.getByText("These sources are flagged as safety-critical")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Source 2: Charlie water, Storing, page 4" })).toHaveAttribute(
      "href",
      "/library/documents/d-13?page=4",
    );
    expect(screen.getByText(/1 passage that ranked well enough was left out/)).toBeInTheDocument();
    // The prompt is the one answers send, and this page only shows it.
    expect(screen.getByText("What is sent when you ask for an answer. Shown here, not sent.")).toBeInTheDocument();
    // The map has a table for people who cannot see it.
    expect(screen.getByRole("table", { name: "The passages nearest the question, of those drawn on the map" })).toBeInTheDocument();
  });

  it("recomputes the fused order in the browser when a slider moves, without asking the server again", async () => {
    const served = serve();
    show("/search/how-it-works?q=boil%20water");
    await screen.findByText(/Traced “boil water”/);
    expect(finalOrder()[0]).toBe("Alpha stoves · Boiling");

    fireEvent.change(screen.getByRole("slider", { name: "Weight of words" }), { target: { value: "0" } });
    // With words worth nothing, the order is the meaning list's order.
    expect(finalOrder().slice(0, 3)).toEqual(["Delta weather · Fog", "Charlie water · Storing", "Alpha stoves · Boiling"]);
    expect(screen.getByText(/This is a what-if on this page. Your settings have not changed/)).toBeInTheDocument();
    expect(screen.getByText("Two lists become one (what if)")).toBeInTheDocument();
    expect(served.explained).toEqual(["boil water"]);

    await userEvent.click(screen.getByRole("button", { name: /Back to your settings/ }));
    expect(finalOrder()[0]).toBe("Alpha stoves · Boiling");
    expect(served.calls.filter((call) => call === "POST /api/retrieval/explain")).toHaveLength(1);
  });

  it("lets the ribbon be read passage by passage from the keyboard, with shared text marked", async () => {
    serve();
    show();
    const ribbon = await screen.findByRole("listbox", { name: /Passages of Water treatment in the field/ });
    // It opens on the first passage that shares text with its neighbour.
    expect(screen.getByText("Passage 3 of 3")).toBeInTheDocument();
    expect(screen.getByText(/36 characters with the passage before, 0 with the one after/)).toBeInTheDocument();
    fireEvent.keyDown(ribbon, { key: "ArrowLeft" });
    expect(screen.getByText("Passage 2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/0 characters with the passage before, 36 with the one after/)).toBeInTheDocument();
    expect(screen.getByText("bbbb2222")).toBeInTheDocument();
    fireEvent.keyDown(ribbon, { key: "Home" });
    expect(screen.getByText("Passage 1 of 3")).toBeInTheDocument();
    expect(screen.getByText(/none: this passage is a whole section on its own/)).toBeInTheDocument();
  });

  it("checks the markers of an answer the reader pastes, and writes none itself", async () => {
    serve();
    show("/search/how-it-works?q=boil%20water");
    await screen.findByText(/Traced “boil water”/);
    await userEvent.type(screen.getByLabelText("An answer to check"), "Boil it {[}1{]}. Add salt {[}7{]}.");
    expect(screen.getByText("Supported")).toBeInTheDocument();
    expect(screen.getByText(/\[7\] refers to no source that was supplied/)).toBeInTheDocument();
    expect(screen.getByText(/\[2\] was supplied but never cited/)).toBeInTheDocument();
  });

  it("says so when the library is empty, and asks the server for nothing more", async () => {
    const served = serve({ overview: { ...overview, entities: { catalog: 4 }, chunks: 4 } });
    show("/search/how-it-works?q=boil%20water");
    expect(await screen.findByRole("heading", { name: "Nothing to trace yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add documents/ })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Write a page" })).toHaveAttribute("href", "/notes");
    expect(screen.queryByRole("button", { name: "Trace this question" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add something to your library" }).length).toBeGreaterThan(8);
    await waitFor(() => expect(served.calls).toContain("GET /api/retrieval/entities"));
    expect(served.calls.some((call) => call.includes("explain") || call.includes("projection") || call.includes("chunks"))).toBe(false);
  });

  it("keeps the essay standing when the trace fails, and offers a retry in each figure", async () => {
    serve({ failExplain: true });
    show("/search/how-it-works?q=boil%20water");
    expect((await screen.findAllByText("The index could not be read.")).length).toBeGreaterThan(5);
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(5);
    expect(screen.getByRole("heading", { name: "Search by words" })).toBeInTheDocument();
    // The ribbon does not depend on the trace and is still drawn.
    expect(screen.getByRole("listbox", { name: /Passages of/ })).toBeInTheDocument();
  });
});

import type { SemanticStatus } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a plain JavaScript module of the evaluation scripts
import * as metrics from "../../../../../scripts/search-eval/metrics.mjs";
import queries from "../../../../../scripts/search-eval/queries.json";
import reference from "../../../../../scripts/search-eval/reference.json";
import {
  BM25_PASSAGES,
  blended,
  bm25Score,
  CPR_IDEAL,
  CPR_QUERY,
  CPR_RESULTS,
  dcg,
  GRADED_EXAMPLES,
  ndcg,
  OWNER_RESULTS,
  oldShownScore,
  percentile,
  QUANTISE_EXAMPLE,
  quantise,
} from "./data";
import HowSearchTunedPage from "./how-search-tuned-page";

const status = (change: Partial<SemanticStatus> = {}): SemanticStatus => ({
  enabled: true,
  provider: "built-in",
  model: "Xenova/all-MiniLM-L6-v2",
  modelId: "built-in:all-MiniLM-L6-v2-q8-245889ee",
  ready: true,
  reason: null,
  dimensions: 384,
  totalChunks: 5045,
  embeddedChunks: 1200,
  otherModels: [],
  indexing: false,
  build: null,
  secondsLeft: null,
  keptChunks: 1200,
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

function serve(answer: SemanticStatus | "fail") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, code = 200) =>
        new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/semantic/status")
        return answer === "fail" ? json({ error: { code: "internal", message: "The server did not answer." } }, 500) : json(answer);
      return json({}, 404);
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/search/how-it-was-tuned"]}>
        <HowSearchTunedPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("how search was tuned", () => {
  it("sets this Outpost's figures beside the Pi's", async () => {
    serve(status());
    show();
    expect(screen.getByRole("heading", { name: "How search was tuned", level: 1 })).toBeVisible();
    const here = screen.getByRole("region", { name: "This Outpost, beside the Pi measured here" });
    expect(await within(here).findByText("5,045 passages")).toBeVisible();
    expect(within(here).getByText("On, 1,200 of 5,045 passages read")).toBeVisible();
  });

  it("says when search by meaning is off, and when there is nothing yet", async () => {
    serve(status({ enabled: false, totalChunks: 0, embeddedChunks: 0 }));
    show();
    const here = screen.getByRole("region", { name: "This Outpost, beside the Pi measured here" });
    expect(await within(here).findByText("Off: keyword search only")).toBeVisible();
    expect(within(here).getByText(/None yet/)).toBeVisible();
  });

  it("says plainly when the figures could not be read, and keeps the explanation", async () => {
    serve("fail");
    show();
    expect(await screen.findByText("This could not be loaded")).toBeVisible();
    expect(screen.getByRole("heading", { name: "How keyword search works underneath", level: 2 })).toBeVisible();
  });

  it("explains each part under its own heading, with every diagram named and described", () => {
    serve(status());
    show();
    for (const heading of [
      "Where it started",
      "How to tell whether search is good",
      "How keyword search works underneath",
      "The changes, in the order they were made",
      "The final score",
      "Search by meaning, in depth",
      "Speed",
      "What carries over to tuning models",
      "Before and after, on the Raspberry Pi",
    ]) {
      expect(screen.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
    }
    for (const step of [
      "1. Truthful basics",
      "2. Understanding the question",
      "3. The reference collections",
      "4. Speed, the kind of question, and duplicates",
      "5. Search by meaning, done properly",
    ]) {
      const region = screen.getByRole("region", { name: step });
      for (const part of ["Problem", "Evidence", "Change", "Measured after"]) expect(within(region).getByText(part)).toBeVisible();
    }
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(10);
    for (const image of images) {
      expect(image).toHaveAccessibleName();
      expect(image).toHaveAccessibleDescription();
    }
    const links = screen.getByRole("navigation", { name: "On this page" });
    expect(within(links).getAllByRole("link")).toHaveLength(9);
    expect(screen.getAllByRole("link", { name: "How search works" })[0]).toHaveAttribute("href", "/search/how-it-works");
  });

  it("works nDCG@5 by hand, to the evaluation script's answer", () => {
    serve(status());
    show();
    const table = screen.getByRole("table", { name: `nDCG@5 for “${CPR_QUERY}”, worked by hand` });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    expect(within(rows[0]!).getByText("7.00")).toBeVisible();
    expect(screen.getByText(/nDCG@5 = 9\.71 ÷ 12\.07 = 0\.804/)).toBeVisible();
    const grades = CPR_RESULTS.map((result) => result.grade);
    expect(ndcg(grades, CPR_IDEAL)).toBeCloseTo(metrics.ndcg(grades, CPR_IDEAL), 12);
    expect(dcg(grades)).toBeCloseTo(metrics.dcg(grades), 12);
  });

  it("shows the scores and sums the server would", () => {
    serve(status());
    show();
    expect(screen.getByRole("table", { name: "The score of one passage, part by part" })).toHaveTextContent("0.712");
    const bm25 = screen.getByRole("table", { name: "BM25 for “car battery” in three passages" });
    for (const passage of BM25_PASSAGES) expect(bm25).toHaveTextContent(bm25Score(passage).total.toFixed(2));
    expect(screen.getByText(/= 0\.763/)).toBeVisible();
    expect(screen.getByText(/0\.90 rises only to 0\.92/)).toBeVisible();
    expect(screen.getByRole("table", { name: "The Raspberry Pi before and after tuning" })).toHaveTextContent("888 ms122 ms");
  });
});

describe("the page's figures", () => {
  it("are the old screen's scores: 61 ÷ (60 + place)", () => {
    for (const result of OWNER_RESULTS) expect(oldShownScore(result.place).toFixed(3)).toBe(result.shown.toFixed(3));
  });

  it("quote the evaluation set as it is", () => {
    const set = (queries as unknown as { queries: Array<{ q: string; grades: Record<string, number>; pi: string[] }> }).queries;
    expect(set).toHaveLength(56);
    for (const example of GRADED_EXAMPLES) {
      const query = set.find((each) => each.q === example.q)!;
      expect(Object.values(query.grades)).toEqual(example.grades.map(([, grade]) => grade));
    }
    // The ideal of "CPR on a child": every graded item and every recorded article the patterns grade, best first.
    const cpr = set.find((each) => each.q === CPR_QUERY)!;
    const pool = (reference as unknown as { collections: Array<{ hits: Array<{ title: string; snippet: string }> }> }).collections
      .flatMap((collection) => collection.hits)
      .map((hit) => ({ title: hit.title, passages: [{ segments: [{ text: hit.snippet }] }] }));
    const ideal = [...Object.values(cpr.grades), ...pool.map((hit) => metrics.gradeByPattern(cpr, hit) as number)]
      .filter((grade) => grade > 0)
      .sort((a, b) => b - a);
    expect(ideal.slice(0, 5)).toEqual(CPR_IDEAL);
  });

  it("take p95 as the evaluation script does", () => {
    const times = Array.from({ length: 56 }, (_, index) => index + 1);
    expect(percentile(times, 0.95)).toBe(metrics.percentile(times, 0.95));
    expect(percentile(times, 0.95)).toBe(54);
  });

  it("round to eight bits within 0.003, and blend meaning as the server does", () => {
    const { bytes, back } = quantise(QUANTISE_EXAMPLE);
    expect(bytes).toEqual([78, -34, 13, -114, 62, 127]);
    for (const [index, value] of QUANTISE_EXAMPLE.entries()) expect(Math.abs(back[index]! - value)).toBeLessThan(0.003);
    expect(blended(0.7, 0.55)).toBe(0.763);
    expect(blended(0.7, 0.1)).toBe(0.7);
  });
});

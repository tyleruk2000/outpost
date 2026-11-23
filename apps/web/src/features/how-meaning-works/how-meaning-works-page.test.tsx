import type { SemanticStatus, Settings } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import HowMeaningWorksPage from "./how-meaning-works-page";
import { wrap } from "./plates";

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
  indexing: true,
  build: null,
  secondsLeft: 300,
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

const settings = { "search.hybrid.rrfK": 60, "search.hybrid.keywordWeight": 1, "search.hybrid.semanticWeight": 1 } as Settings;

function serve(answer: SemanticStatus | "fail") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, code = 200) =>
        new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/semantic/status")
        return answer === "fail" ? json({ error: { code: "internal", message: "The server did not answer." } }, 500) : json(answer);
      if (url.pathname === "/api/settings") return json({ settings });
      return json({}, 404);
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/search/how-meaning-works"]}>
        <HowMeaningWorksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("how search by meaning works", () => {
  it("shows this Outpost's own figures, with the way to the setting", async () => {
    serve(status());
    show();
    expect(screen.getByRole("heading", { name: "How search by meaning works", level: 1 })).toBeVisible();
    const here = screen.getByRole("region", { name: "On this Outpost now" });
    expect(await within(here).findByText("On, reading your library")).toBeVisible();
    expect(within(here).getByText("1,200 of 5,045 passages")).toBeVisible();
    expect(within(here).getByText(/about 5 minutes left/)).toBeVisible();
    expect(within(here).getByText(/all-MiniLM-L6-v2, which comes with Outpost \(English, Apache-2.0 licence\)/)).toBeVisible();
    expect(within(here).getByRole("progressbar", { name: "Passages read" })).toBeInTheDocument();
    expect(within(here).getByRole("link", { name: "Search by meaning in Settings" })).toHaveAttribute("href", "/settings#semantic");
  });

  it("says when it is off, and counts what was kept", async () => {
    serve(status({ enabled: false, indexing: false, ready: false, embeddedChunks: 0, keptChunks: 300, secondsLeft: null }));
    show();
    const here = screen.getByRole("region", { name: "On this Outpost now" });
    expect(await within(here).findByText("Off")).toBeVisible();
    expect(within(here).getByText("300 of 5,045 passages")).toBeVisible();
    expect(within(here).getByRole("link", { name: "Turn on search by meaning in Settings" })).toHaveAttribute("href", "/settings#semantic");
  });

  it("says plainly when the figures could not be read", async () => {
    serve("fail");
    show();
    expect(await screen.findByText("This could not be loaded")).toBeVisible();
    // The explanation is still there to read.
    expect(screen.getByRole("heading", { name: "Each passage becomes a list of numbers", level: 2 })).toBeVisible();
  });

  it("explains each step under its own heading, with every diagram named and described", async () => {
    serve(status());
    show();
    for (const heading of [
      "Why search by meaning",
      "First, documents are cut into passages",
      "Each passage becomes a list of numbers",
      "Your question finds its nearest passages",
      "How it works together with keyword search",
      "Where it runs",
      "Reading your library",
      "What it cannot do",
    ]) {
      expect(screen.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
    }
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(6);
    for (const image of images) {
      expect(image).toHaveAccessibleName();
      expect(image).toHaveAccessibleDescription();
    }
    expect(screen.getByRole("img", { name: /A simplification: the real map has 384 directions, not two/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How documents are cut into passages" })).toHaveAttribute(
      "href",
      "/search/how-it-works#stage-cutting",
    );
  });

  it("says that new documents are read by themselves, a few seconds after they are indexed", async () => {
    serve(status());
    show();
    expect(
      screen.getByText("About five seconds after that settles, it reads the new or changed passages for search by meaning."),
    ).toBeVisible();
    expect(screen.getByText("This happens only while search by meaning is on.")).toBeVisible();
    expect(await screen.findByText(/This library has 5,045 passages: about 4 minutes on that laptop\./)).toBeVisible();
  });

  it("combines the two lists by reciprocal rank fusion, as the server does", async () => {
    serve(status());
    show();
    const table = await screen.findByRole("table", { name: "How each passage in the example scores" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("rowheader")[0]!.firstChild?.textContent)).toEqual([
      "Fuel",
      "Battery",
      "Starter",
      "Cold",
    ]);
    expect(within(rows[0]!).getByText("1 ÷ (60 + 1)")).toBeVisible();
    expect(within(rows[0]!).getByText("1 ÷ (60 + 2)")).toBeVisible();
    expect(within(rows[0]!).getByText((1 / 61 + 1 / 62).toFixed(4))).toBeVisible();
    expect(within(rows[1]!).getByText("not found")).toBeVisible();
  });
});

describe("the diagrams' text", () => {
  it("wraps at the width it is given, a word at a time", () => {
    expect(wrap("one two three four", 1000, 14)).toEqual(["one two three four"]);
    // 0.62 of the font per character: "one two" is 7 characters, 60.8 px at 14 px.
    expect(wrap("one two three four", 62, 14)).toEqual(["one two", "three", "four"]);
  });
});

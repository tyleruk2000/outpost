import type { HighlightDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HighlightsPanel } from "./highlights-panel";
import { indexText, locate, quoteOf, rangeOf } from "./quote";

function page(html: string): HTMLElement {
  const root = document.createElement("article");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("finding a passage by its words", () => {
  it("quotes a selection across elements, with white space made single, and finds it again", () => {
    const root = page("<p>Boil water for <em>one\n   minute</em> to make it safe.</p><p>At altitude, boil for three minutes.</p>");
    const em = root.querySelector("em")!;
    const range = document.createRange();
    range.setStart(root.querySelector("p")!.firstChild!, 5);
    range.setEnd(em.firstChild!, em.firstChild!.textContent!.length);
    const quote = quoteOf(indexText(root), range)!;
    expect(quote.exact).toBe("water for one minute");
    expect(quote.prefix).toBe("Boil ");
    expect(quote.suffix.startsWith(" to make it safe.At altitude")).toBe(true);

    const index = indexText(root);
    const found = rangeOf(index, locate(index, quote)!);
    expect(found.toString().replace(/\s+/g, " ")).toBe("water for one minute");
  });

  it("chooses the occurrence whose surroundings match", () => {
    const root = page("<p>Boil for one minute. Then wait. Boil for one minute at altitude.</p>");
    const index = indexText(root);
    const second = locate(index, { exact: "Boil for one minute", prefix: "Then wait. ", suffix: " at altitude." })!;
    expect(second[0]).toBe(index.text.lastIndexOf("Boil for one minute"));
    expect(locate(index, { exact: "not in it", prefix: "", suffix: "" })).toBeNull();
  });
});

const highlight = (change: Partial<HighlightDto>): HighlightDto => ({
  id: "h1",
  documentId: "d1",
  page: 4,
  chapter: null,
  exact: "Boil water for one minute",
  prefix: "",
  suffix: "",
  note: "kettle rule",
  url: "/library/documents/d1?page=4&highlight=h1",
  createdAt: 1,
  updatedAt: 1,
  ...change,
});

let requests: string[] = [];
function serve(highlights: HighlightDto[]) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url.pathname}`);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/documents/d1/highlights" && method === "GET") return json({ highlights });
      if (url.pathname === "/api/documents/d1/highlights/to-notes") return json({ note: { id: "n1", title: "Highlights from Water" } });
      return json({ ok: true });
    }),
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HighlightsPanel document={{ id: "d1", type: "pdf", title: "Water" } as never} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the highlights of a document", () => {
  it("lists each passage with its note and place, links back to it, and copies them to Notes", async () => {
    serve([
      highlight({}),
      highlight({ id: "h2", exact: "boil for three minutes", note: "", page: 9, url: "/library/documents/d1?page=9&highlight=h2" }),
    ]);
    show();
    expect(await screen.findByText("2 highlights")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Boil water for one minute" })).toHaveAttribute(
      "href",
      "/library/documents/d1?page=4&highlight=h1",
    );
    expect(screen.getByText("kettle rule")).toBeInTheDocument();
    expect(screen.getByText("Page 9")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy all 2 to a page in Notes" }));
    expect(requests).toContain("POST /api/documents/d1/highlights/to-notes");
  });

  it("finds among many by their words, and says when none match", async () => {
    serve([1, 2, 3, 4].map((n) => highlight({ id: `h${n}`, exact: n === 3 ? "shelter from wind" : `passage ${n}`, note: "" })));
    show();
    const find = await screen.findByRole("searchbox", { name: "Find in these highlights" });
    await userEvent.type(find, "wind");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    await userEvent.clear(find);
    await userEvent.type(find, "glacier");
    expect(screen.getByText(/No highlight here has those words/)).toBeInTheDocument();
  });

  it("says how to make the first one", async () => {
    serve([]);
    show();
    expect(await screen.findByText(/Select words in the document/)).toBeInTheDocument();
  });
});

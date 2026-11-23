import { type DocumentDto, type DocumentFacets, formatBytes } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocumentsPanel from "./documents-panel";

const doc = (change: Partial<DocumentDto>): DocumentDto => ({
  id: "d1",
  title: "Water treatment field guide",
  originalName: "water.pdf",
  type: "pdf",
  mime: "application/pdf",
  ext: "pdf",
  sizeBytes: 40_478,
  sha256: "a".repeat(64),
  locationId: "loc1",
  locationAvailable: true,
  relPath: "documents/d1/water.pdf",
  category: "Field guides",
  description: null,
  author: null,
  source: null,
  language: null,
  tags: ["water"],
  pageCount: 12,
  extraction: "done",
  extractionDetail: null,
  textChars: 100,
  scanPages: 0,
  ocrPages: null,
  ocrDetail: null,
  fileUrl: "/api/documents/d1/file",
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now(),
  ...change,
});

const facets: DocumentFacets = {
  categories: [{ name: "Field guides", count: 2 }],
  tags: [{ name: "water", count: 1 }],
  types: [
    { type: "pdf", count: 2 },
    { type: "markdown", count: 1 },
  ],
  total: 3,
  totalBytes: 123_456,
};

let listRequests: URLSearchParams[] = [];

function serve({
  documents,
  total = documents.length,
  library = facets,
}: {
  documents: DocumentDto[];
  total?: number;
  library?: DocumentFacets;
}) {
  listRequests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://outpost.test");
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/documents/facets") return json(library);
      if (url.pathname === "/api/storage/locations")
        return json({ locations: [{ id: "loc2", name: "Field drive", status: "unavailable" }], roots: [] });
      if (url.pathname === "/api/documents") {
        listRequests.push(url.searchParams);
        return json({ documents, total });
      }
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
}

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

function renderPanel(address = "/library") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <DocumentsPanel />
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const address = () => screen.getByTestId("address").textContent;
const lastRequest = () => Object.fromEntries(listRequests.at(-1) ?? []);

beforeEach(() => serve({ documents: [doc({})] }));
afterEach(() => vi.unstubAllGlobals());

describe("documents panel", () => {
  it("lists documents as links, with a summary of the whole library", async () => {
    renderPanel();
    const row = await screen.findByRole("link", { name: /Water treatment field guide/ });
    expect(row).toHaveAttribute("href", "/library/documents/d1");
    expect(within(row).getByText(/PDF, 12 pages/)).toBeInTheDocument();
    expect(within(row).getByText(/#water/)).toBeInTheDocument();
    expect(screen.getByText(`3 documents, ${formatBytes(123_456)}`)).toBeInTheDocument();
    expect(lastRequest()).toEqual({ sort: "added", limit: "50", offset: "0" });
  });

  it("asks the server for the view the address describes", async () => {
    renderPanel("/library?type=pdf&tag=water&category=Field+guides&sort=title");
    await screen.findByRole("link", { name: /Water treatment/ });
    expect(lastRequest()).toEqual({ type: "pdf", tag: "water", category: "Field guides", sort: "title", limit: "50", offset: "0" });
    expect(screen.getByText("1 of 3 documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Type: PDFs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tag: water" })).toBeInTheDocument();
  });

  it("puts a typed name filter in the address after a pause, and filters by it", async () => {
    renderPanel("/library?tab=documents");
    await screen.findByRole("link", { name: /Water treatment/ });
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter documents by name" }), "knots");
    await waitFor(() => expect(address()).toBe("/library?tab=documents&q=knots"));
    await waitFor(() => expect(lastRequest()).toMatchObject({ q: "knots" }));
    // One request for the finished word, not one per letter.
    expect(listRequests.filter((request) => request.has("q")).map((request) => request.get("q"))).toEqual(["knots"]);
  });

  it("clears the filters but keeps the sort order", async () => {
    renderPanel("/library?q=water&type=pdf&sort=size");
    await screen.findByRole("link", { name: /Water treatment/ });
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(address()).toBe("/library?sort=size"));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("says when nothing matches, and offers the way back", async () => {
    serve({ documents: [], total: 0 });
    renderPanel("/library?q=zebra");
    expect(await screen.findByRole("heading", { name: "No documents match these filters" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(address()).toBe("/library"));
  });

  it("invites the first documents when the library is empty", async () => {
    serve({ documents: [], library: { categories: [], tags: [], types: [], total: 0, totalBytes: 0 } });
    renderPanel();
    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeInTheDocument();
    expect(screen.getByText(/PDF, EPUB, Markdown, plain text, HTML, CSV, JSON, images .*, and audio/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add documents" })).toBeInTheDocument();
    // A person with no files of their own is shown where to find something to read.
    expect(screen.getByRole("link", { name: "Find something to read in Explore" })).toHaveAttribute("href", "/explore");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("opens the file picker for ?upload=1 and takes the parameter out of the address", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderPanel("/library?upload=1&type=pdf");
    await waitFor(() => expect(address()).toBe("/library?type=pdf"));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("says plainly when a document is unavailable, still being read, or could not be read", async () => {
    serve({
      documents: [
        doc({ id: "a", title: "On the drive", locationId: "loc2", locationAvailable: false }),
        doc({ id: "b", title: "Just added", extraction: "running", pageCount: null }),
        doc({ id: "c", title: "Broken", extraction: "failed", extractionDetail: "This file could not be read as a PDF." }),
        doc({
          id: "d",
          title: "A photo",
          type: "image",
          ext: "png",
          pageCount: null,
          extraction: "unsupported",
          extractionDetail: "Images have no searchable text.",
        }),
      ],
    });
    renderPanel();
    expect(
      within(await screen.findByRole("link", { name: /On the drive/ })).getByText(/“Field drive” is not connected/),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /Just added/ })).getByText("Reading text…")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /Broken/ })).getByText(/This file could not be read as a PDF\./)).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /A photo/ })).getByText("No searchable text")).toHaveAttribute(
      "title",
      "Images have no searchable text.",
    );
  });

  it("offers more when the view has more than one page of documents", async () => {
    serve({ documents: Array.from({ length: 50 }, (_, index) => doc({ id: `d${index}`, title: `Document ${index}` })), total: 120 });
    renderPanel();
    await screen.findByRole("link", { name: /Document 49/ });
    expect(screen.getByText("Showing 50 of 120")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(lastRequest()).toMatchObject({ offset: "50", limit: "50" }));
  });
});

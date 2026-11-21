import type { CalibreImportDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorsText, placeOf, seriesText } from "./calibre-model";
import CalibrePage from "./calibre-page";

const ready: CalibreImportDto = {
  id: "c1",
  state: "ready",
  locationId: "loc-1",
  locationName: "Books drive",
  relPath: "Calibre Library",
  plan: {
    bookCount: 2,
    totalBytes: 3_000_000,
    coverCount: 1,
    hasCalibreDatabase: true,
    books: [
      {
        folder: "Frank Herbert/Dune (1)",
        title: "Dune",
        authors: ["Frank Herbert"],
        series: "Dune",
        seriesIndex: 1,
        tags: ["Fiction"],
        file: { name: "Dune.epub", ext: "epub", sizeBytes: 2 * 1024 * 1024 },
        cover: { name: "cover.jpg", sizeBytes: 1024 },
        otherFormats: ["MOBI"],
      },
      {
        folder: "Jane Doe/Knots (2)",
        title: "Knots for Sailors",
        authors: ["Jane Doe", "Ann Roe"],
        series: null,
        seriesIndex: null,
        tags: [],
        file: { name: "Knots.pdf", ext: "pdf", sizeBytes: 1024 * 1024 },
        cover: null,
        otherFormats: [],
      },
    ],
    leftOut: [{ folder: "Someone/Only Mobi (3)", title: "Only Mobi", reason: "Only in MOBI, which Outpost cannot read." }],
    beyondLimit: 0,
  },
  options: null,
  report: null,
  error: null,
  job: null,
  createdAt: Date.UTC(2026, 10, 20),
  completedAt: null,
};

const locations = {
  roots: ["/srv"],
  locations: [
    {
      id: "loc-1",
      name: "Books drive",
      path: "/srv/books",
      kind: "external",
      isDefault: true,
      status: "available",
      statusDetail: null,
      totalBytes: 10 ** 12,
      freeBytes: 10 ** 11,
      lastSeenAt: null,
      createdAt: 0,
      usage: { byKind: {}, totalBytes: 0 },
    },
  ],
};

function renderAt(dto: CalibreImportDto) {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      requests.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      const body = url.startsWith("/api/storage/locations")
        ? locations
        : url.includes("/commit")
          ? { import: { ...dto, state: "importing" } }
          : { import: dto };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/library/calibre?id=${dto.id}`]}>
        <Routes>
          <Route path="/library/calibre" element={<CalibrePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe("importing from Calibre", () => {
  it("says how many books and how much space before anything is added, and what is left out", async () => {
    renderAt(ready);
    expect(await screen.findByRole("heading", { name: "2 books, 3.00 MB" })).toBeInTheDocument();
    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Books found" }).textContent).toContain("Dune, book 1");
    expect(screen.getByRole("list", { name: "Books found" }).textContent).toContain("Jane Doe and Ann Roe");
    expect(screen.getByText("1 book will be left out")).toBeInTheDocument();
    expect(screen.getByText(/the Calibre folder is only read/)).toBeInTheDocument();
  });

  it("brings the books in where they are when asked to", async () => {
    const user = userEvent.setup();
    const requests = renderAt(ready);
    await user.click(await screen.findByRole("radio", { name: /Use them where they are/ }));
    await user.click(screen.getByRole("button", { name: "Add 2 books" }));
    const commit = requests.find((request) => request.url.includes("/commit"));
    expect(commit).toMatchObject({ method: "POST", body: { mode: "in-place" } });
  });

  it("copies them to the chosen location by default", async () => {
    const user = userEvent.setup();
    const requests = renderAt(ready);
    await screen.findByRole("radio", { name: /Books drive/ });
    await user.click(screen.getByRole("button", { name: "Add 2 books" }));
    const commit = requests.find((request) => request.url.includes("/commit"));
    expect(commit?.body).toEqual({ mode: "copy", locationId: "loc-1" });
  });

  it("reports what was added", async () => {
    renderAt({ ...ready, state: "completed", report: { added: 1, alreadyThere: 1, failed: [], stopped: false } });
    expect(await screen.findByText("The library is in")).toBeInTheDocument();
    expect(screen.getByText(/1 book added, 1 book already there and left as they were/)).toBeInTheDocument();
  });
});

describe("the Calibre screen's helpers", () => {
  it("finds the innermost storage location holding a folder", () => {
    const places = [
      { id: "outer", path: "/srv" },
      { id: "inner", path: "/srv/books/" },
    ];
    expect(placeOf("/srv/books/Calibre Library", places)).toEqual({ locationId: "inner", relPath: "Calibre Library" });
    expect(placeOf("/srv/books", places)).toEqual({ locationId: "inner", relPath: "" });
    expect(placeOf("/srv/booksellers", places)).toEqual({ locationId: "outer", relPath: "booksellers" });
    expect(placeOf("/elsewhere", places)).toBeNull();
  });

  it("writes series and authors as people say them", () => {
    expect(seriesText("Dune", 2)).toBe("Dune, book 2");
    expect(seriesText("Dune", 2.5)).toBe("Dune, book 2.5");
    expect(seriesText("Dune", null)).toBe("Dune");
    expect(seriesText(null, 1)).toBeNull();
    expect(authorsText(["A", "B", "C"])).toBe("A, B and C");
  });
});

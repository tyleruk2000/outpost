/**
 * Books in the library: the contents page of a book, finding your way from inside a
 * chapter, and where books are (and are not) listed.
 */
import type { BookContentsResponse, DocumentChapterDto } from "@outpost/shared";
import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { collection, entry, fakeServer, installBrowserStubs, location, renderScreen } from "../downloads/test-support";
import { EntryCard } from "../explore/entry-card";
import { ChapterPlace, ChapterTurn } from "./chapter-nav";
import { chapterCount, groupCollections, isBook, kindLabel, openTarget } from "./collection-meta";
import CollectionPage from "./collection-page";
import CollectionsPanel from "./collections-panel";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const book = (over: Record<string, unknown> = {}) =>
  collection({
    id: "b1",
    kind: "file",
    title: "Xiegu G90 companion guide",
    description: "A compact 20 W HF transceiver, explained.",
    publisher: "LogBook73",
    license: "MIT",
    version: "2026-11-12",
    relPath: "collections/books/logbook73.guide.g90",
    catalogEntryId: "logbook73.guide.g90",
    meta: { format: "markdown", bundled: true, book: { chapters: 3 }, licenseNote: "LogBook73 reviewed it on 28 August 2026." },
    ...over,
  });

const contents: BookContentsResponse = {
  collectionId: "b1",
  total: 3,
  sections: [
    {
      title: "Introduction",
      chapters: [{ key: "overview", number: "00", title: "Why the G90", summary: "What it is.", documentId: "d0" }],
    },
    {
      title: "Every menu explained",
      chapters: [
        { key: "menus", number: "02", title: "Menu reference", summary: "Every button.", documentId: "d2" },
        { key: "about-this-book", number: null, title: "About this book", summary: null, documentId: "d9" },
      ],
    },
  ],
};

function serve(item = book()) {
  return fakeServer({
    "GET /api/collections/b1": { collection: item },
    "GET /api/collections/b1/chapters": contents,
    "GET /api/collections": { collections: [item] },
    "GET /api/catalog": { categories: [], entries: [], packs: [], manifests: [], problems: [], lastRefreshedAt: null },
    "GET /api/jobs": { jobs: [] },
    "GET /api/storage/locations": { roots: ["/mnt"], locations: [location()] },
  });
}

describe("a collection that is a book", () => {
  it("is told apart from a single file, and listed under its own heading with its chapters counted", async () => {
    expect(isBook(book())).toBe(true);
    expect(isBook(collection({ kind: "file", meta: { documentId: "d1" } }))).toBe(false);
    expect(chapterCount(book())).toBe(3);
    expect(chapterCount(collection())).toBeNull();
    expect(kindLabel(book())).toBe("Book");
    expect(kindLabel(collection({ kind: "file", meta: {} }))).toBe("File");
    // Its page is its contents, so there is nowhere else to send a person from a list.
    expect(openTarget(book())).toBeNull();
    const groups = groupCollections([
      collection({ id: "f", kind: "file", title: "A PDF", meta: { documentId: "d" } }),
      book(),
      collection(),
    ]);
    expect(groups.map((group) => [group.title, group.collections.length])).toEqual([
      ["Reference collections", 1],
      ["Books", 1],
      ["Files", 1],
    ]);

    serve();
    renderScreen(<CollectionsPanel />);
    expect(await screen.findByRole("heading", { name: "Books" })).toBeInTheDocument();
    const row = screen.getByRole("link", { name: "Xiegu G90 companion guide" }).closest("li");
    expect(row).toHaveTextContent("3 chapters");
  });

  it("has a page that is its contents: parts, numbers, titles and summaries, each a link to its chapter", async () => {
    serve();
    renderScreen(
      <Routes>
        <Route path="/library/collections/:id" element={<CollectionPage />} />
      </Routes>,
      "/library/collections/b1",
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Xiegu G90 companion guide" })).toBeInTheDocument();
    const list = await screen.findByRole("region", { name: "Contents" });
    expect(within(list).getByText("3 chapters")).toBeInTheDocument();
    expect(
      within(list)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Introduction", "Every menu explained"]);
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/library/documents/d0",
      "/library/documents/d2",
      "/library/documents/d9",
    ]);
    expect(links[1]).toHaveAccessibleName(/^Chapter 02:\s*Menu reference\s*Every button\.$/);
    expect(links[2]).toHaveAccessibleName("About this book");
    // Reading starts at the first chapter; the details say it is a book and carry its review note.
    expect(await screen.findByRole("link", { name: "Start reading" })).toHaveAttribute("href", "/library/documents/d0");
    expect(screen.getByText("Book")).toBeInTheDocument();
    expect(screen.getByText("LogBook73 reviewed it on 28 August 2026.")).toBeInTheDocument();
  });

  it("still lists its contents when its storage is disconnected, without offering what cannot be opened", async () => {
    serve(book({ locationAvailable: false }));
    renderScreen(
      <Routes>
        <Route path="/library/collections/:id" element={<CollectionPage />} />
      </Routes>,
      "/library/collections/b1",
    );
    const list = await screen.findByRole("region", { name: "Contents" });
    expect(await within(list).findByText("Menu reference")).toBeInTheDocument();
    expect(within(list).queryAllByRole("link")).toEqual([]);
    expect(screen.getByRole("button", { name: "Start reading" })).toBeDisabled();
  });
});

describe("inside a chapter", () => {
  const chapter: DocumentChapterDto = {
    collectionId: "b1",
    bookTitle: "Xiegu G90 companion guide",
    key: "menus",
    number: "02",
    section: "Every menu explained",
    position: 2,
    total: 3,
    previous: { documentId: "d0", title: "Why the G90", number: "00" },
    next: { documentId: "d9", title: "About this book", number: null },
  };

  it("says which book it is and how far through, and leads back to the contents", () => {
    renderScreen(<ChapterPlace chapter={chapter} />);
    const place = screen.getByRole("navigation", { name: "Book" });
    expect(within(place).getByRole("link", { name: "Xiegu G90 companion guide" })).toHaveAttribute("href", "/library/collections/b1");
    expect(place).toHaveTextContent("Every menu explained, 2 of 3");
  });

  it("offers the chapters on either side, and says when there is no next one", () => {
    const { unmount } = renderScreen(<ChapterTurn chapter={chapter} />);
    const turn = screen.getByRole("navigation", { name: "Chapters" });
    expect(within(turn).getByRole("link", { name: /Previous.*Why the G90/ })).toHaveAttribute("href", "/library/documents/d0");
    expect(within(turn).getByRole("link", { name: /Next.*About this book/ })).toHaveAttribute("href", "/library/documents/d9");
    expect(within(turn).getByRole("link", { name: "Contents of Xiegu G90 companion guide" })).toHaveAttribute(
      "href",
      "/library/collections/b1",
    );
    unmount();

    renderScreen(<ChapterTurn chapter={{ ...chapter, position: 3, next: null }} />);
    expect(screen.queryByRole("link", { name: /Next/ })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Chapters" })).toHaveTextContent("This is the last chapter.");
  });

  it("shows nothing for a document that is not a chapter", () => {
    const { container } = renderScreen(
      <>
        <ChapterPlace chapter={undefined} />
        <ChapterTurn chapter={undefined} />
      </>,
    );
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("a book in Explore", () => {
  it("says it is a book and how long, and keeps its author's account of the review a line away", () => {
    renderScreen(
      <ul>
        <EntryCard
          entry={entry({
            id: "logbook73.guide.g90",
            name: "Xiegu G90 companion guide",
            publisher: "LogBook73",
            format: "markdown",
            license: "MIT",
            licenseNote: "Written by Tyler Allen for LogBook73. LogBook73 reviewed it on 28 August 2026. Outpost has not checked it again.",
            source: { type: "bundled", version: "2026-11-12" },
            chapterCount: 16,
            sizeBytes: 300_000,
            sizeIsEstimate: false,
            version: "2026-11-12",
            availability: "available",
          })}
          download={undefined}
          onDownload={vi.fn()}
          onAdd={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText(/Book, 16 chapters/)).toBeInTheDocument();
    expect(screen.getByText("Licence: MIT.")).toBeInTheDocument();
    expect(screen.getByText("Who wrote it and how it was reviewed")).toBeInTheDocument();
    expect(screen.getByText(/LogBook73 reviewed it on 28 August 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to library: Xiegu G90 companion guide" })).toBeInTheDocument();
  });
});

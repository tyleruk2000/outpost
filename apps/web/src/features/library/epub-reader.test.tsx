/**
 * Reading an EPUB book: the front of the book, a chapter drawn from plain values, the
 * addresses the reader builds, the place it keeps, and what it says when a book cannot
 * be read.
 */
import type { DocumentDto, DocumentEpubChapterResponse, DocumentEpubResponse } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resultHref } from "@/components/search-hit";
import { fakeServer, installBrowserStubs, renderScreen } from "../downloads/test-support";
import { chapterForHeading, chapterInAddress, chapterTo, pictureUrl, readPlace, savePlace } from "./epub-data";
import { EpubReader } from "./epub-reader";

beforeAll(installBrowserStubs);
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const ID = "01HUTBOOK";
const document = {
  id: ID,
  title: "hut",
  type: "epub",
  ext: "epub",
  extraction: "done",
  textChars: 900,
  fileUrl: `/api/documents/${ID}/file`,
} as DocumentDto;

const book: DocumentEpubResponse = {
  documentId: ID,
  title: "The Hut Book",
  author: "Mara Ellison",
  language: "en",
  cover: "OEBPS/images/cover.png",
  chapters: [
    { position: 1, title: "Arriving", heading: "Arriving" },
    { position: 2, title: "The stove", heading: "Lighting the stove" },
    { position: 3, title: "Leaving", heading: null },
  ],
  contents: [
    { title: "Arriving", chapter: 1, depth: 0 },
    { title: "The door", chapter: 1, anchor: "the_door", depth: 1 },
    { title: "Living there", chapter: null, depth: 0 },
    { title: "The stove", chapter: 2, depth: 1 },
  ],
  notes: [],
};

const words = (v: string) => [{ t: "text" as const, v }];
const arriving: DocumentEpubChapterResponse = {
  documentId: ID,
  position: 1,
  total: 3,
  title: "Arriving",
  notes: ["This chapter has audio or video, which is not played here."],
  blocks: [
    { t: "heading", depth: 1, id: "top", c: words("Arriving") },
    {
      t: "paragraph",
      c: [
        ...words("Wet boots and a "),
        { t: "chapter", chapter: 2, anchor: "lighting", c: words("cold stove") },
        ...words(", then "),
        { t: "chapter", chapter: 0, c: words("the contents") },
        { t: "anchor", id: "r1" },
        { t: "jump", to: "n1", c: [{ t: "sup", c: words("1") }] },
        ...words(" and a sign "),
        { t: "picture", src: "OEBPS/images/sign.png", alt: "no fires" },
        ...words(" and "),
        { t: "picture", src: "../../etc/passwd", alt: "a trick" },
      ],
    },
    { t: "paragraph", c: [{ t: "anchor", id: "lone" }] },
    { t: "figure", src: "OEBPS/images/hut plan.svg", alt: "Plan of the hut", caption: words("One room.") },
    { t: "table", plain: true, rows: [[words("Pine"), words("1")]] },
    { t: "quote", kind: "note", c: [{ t: "paragraph", c: [{ t: "anchor", id: "n1" }, ...words("Boots dry best away from the stove.")] }] },
  ],
};

const refuse = (status: number, code: string, message: string, reason?: string) => ({
  status,
  error: { code, message, ...(reason ? { details: { reason } } : {}) },
});

function Address() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="address">{`${pathname}${search}${hash}`}</output>;
}
const address = () => screen.getByTestId("address").textContent;

function open(route: string, routes: Record<string, unknown> = {}) {
  const server = fakeServer({
    [`GET /api/documents/${ID}/epub`]: book,
    [`GET /api/documents/${ID}/epub/chapters/1`]: arriving,
    [`GET /api/documents/${ID}/epub/chapters/2`]: {
      ...arriving,
      position: 2,
      title: "The stove",
      notes: [],
      blocks: [{ t: "paragraph", c: words("Open the damper.") }],
    },
    ...routes,
  });
  renderScreen(
    <>
      <EpubReader document={document} downloadUrl={`${document.fileUrl}?download=1`} />
      <Address />
    </>,
    route,
  );
  return server;
}

describe("the front of a book", () => {
  it("shows the cover, title and author from the book itself, where to start, and its contents", async () => {
    open(`/library/documents/${ID}`);
    expect(await screen.findByRole("heading", { level: 2, name: "The Hut Book" })).toBeInTheDocument();
    expect(screen.getByText("Mara Ellison")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cover of The Hut Book" })).toHaveAttribute(
      "src",
      `/api/documents/${ID}/epub/file?path=OEBPS%2Fimages%2Fcover.png`,
    );
    expect(screen.getByRole("link", { name: "Start reading" })).toHaveAttribute("href", `/library/documents/${ID}?chapter=1`);
    // Says what a person is looking at, and what is not there.
    expect(screen.getByText(/audio, video and anything interactive/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download the original" })).toHaveAttribute("href", `${document.fileUrl}?download=1`);

    const contents = within(screen.getByRole("region", { name: "Contents" }));
    expect(contents.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Arriving", `/library/documents/${ID}?chapter=1`],
      ["The door", `/library/documents/${ID}?chapter=1#h-the_door`],
      ["The stove", `/library/documents/${ID}?chapter=2`],
    ]);
    // A line that only names a part of the book is words, not a link.
    expect(contents.getByText("Living there").closest("a")).toBeNull();
  });

  it("offers to carry on from the place kept on this device", async () => {
    savePlace(ID, { chapter: 2, section: 0, block: 3, offset: 12 });
    open(`/library/documents/${ID}`);
    expect(await screen.findByRole("link", { name: "Continue reading" })).toHaveAttribute("href", `/library/documents/${ID}?chapter=2`);
    expect(screen.getByText("You were in “The stove”, 2 of 3.")).toBeInTheDocument();
  });

  it("lists the chapters in order when the book has no table of contents, and does without a cover", async () => {
    open(`/library/documents/${ID}`, { [`GET /api/documents/${ID}/epub`]: { ...book, title: null, cover: null, contents: [] } });
    // With no title of its own, the book goes by the name it has in the library.
    expect(await screen.findByRole("heading", { level: 2, name: "hut" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Contents" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Arriving", "The stove", "Leaving"]);
  });
});

describe("a chapter", () => {
  it("is drawn from plain values, with the book's place above it and the chapters on either side below", async () => {
    open(`/library/documents/${ID}?chapter=2`);
    expect(await screen.findByText("Open the damper.")).toBeInTheDocument();
    const place = screen.getByRole("navigation", { name: "Book" });
    expect(within(place).getByRole("link", { name: "The Hut Book" })).toHaveAttribute("href", `/library/documents/${ID}`);
    expect(place).toHaveTextContent("2 of 3");
    const turn = within(screen.getByRole("navigation", { name: "Chapters" }));
    expect(turn.getByRole("link", { name: /Previous.*Arriving/ })).toHaveAttribute("href", `/library/documents/${ID}?chapter=1`);
    expect(turn.getByRole("link", { name: /Next.*Leaving/ })).toHaveAttribute("href", `/library/documents/${ID}?chapter=3`);
    expect(turn.getByRole("link", { name: "Contents of The Hut Book" })).toHaveAttribute("href", `/library/documents/${ID}`);
    // Opening a chapter is enough for the book to be carried on from it.
    expect(readPlace(ID)).toMatchObject({ chapter: 2 });
  });

  it("builds every address itself: pictures by their path in the book, chapters by number, jumps within the chapter", async () => {
    open(`/library/documents/${ID}?chapter=1`);
    await screen.findByRole("heading", { name: "Arriving" });
    expect(screen.getByText("This chapter has audio or video, which is not played here.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "cold stove" })).toHaveAttribute("href", `/library/documents/${ID}?chapter=2#h-lighting`);
    expect(screen.getByRole("link", { name: "the contents" })).toHaveAttribute("href", `/library/documents/${ID}`);
    // A jump stays in this chapter: the chapter stays in the address.
    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute("href", `/library/documents/${ID}?chapter=1#h-n1`);

    expect(screen.getByRole("img", { name: "no fires" })).toHaveAttribute(
      "src",
      `/api/documents/${ID}/epub/file?path=OEBPS%2Fimages%2Fsign.png`,
    );
    expect(screen.getByRole("img", { name: "Plan of the hut" })).toHaveAttribute(
      "src",
      `/api/documents/${ID}/epub/file?path=OEBPS%2Fimages%2Fhut%20plan.svg`,
    );
    expect(screen.getByText("One room.").tagName).toBe("FIGCAPTION");
    // A path that climbs out of the book is never made into an address; its description stands in.
    expect(screen.queryByRole("img", { name: "a trick" })).toBeNull();
    expect(screen.getByText("a trick")).toBeInTheDocument();

    // Places a link can land on are there, under ids of their own kind.
    for (const id of ["h-top", "h-r1", "h-n1", "h-lone"]) expect(window.document.getElementById(id), id).not.toBeNull();
    // A note is the author's own words, not a quotation; a table without a header row has none.
    expect(screen.getByText("Boots dry best away from the stove.").closest("aside")).not.toBeNull();
    expect(screen.getByRole("table").querySelector("thead")).toBeNull();
  });

  it("shows what a picture is when the picture will not load", async () => {
    open(`/library/documents/${ID}?chapter=1`);
    const picture = await screen.findByRole("img", { name: "no fires" });
    picture.dispatchEvent(new Event("error"));
    await waitFor(() => expect(screen.queryByRole("img", { name: "no fires" })).toBeNull());
    expect(screen.getByText("no fires")).toBeInTheDocument();
  });

  it("turns the page", async () => {
    open(`/library/documents/${ID}?chapter=1`);
    await screen.findByRole("heading", { name: "Arriving" });
    await userEvent.click(screen.getByRole("link", { name: /Next.*The stove/ }));
    expect(await screen.findByText("Open the damper.")).toBeInTheDocument();
    expect(address()).toBe(`/library/documents/${ID}?chapter=2`);
    expect(readPlace(ID)).toMatchObject({ chapter: 2 });
  });

  it("says why a chapter cannot be shown, and still offers the chapters around it", async () => {
    const message = "This chapter is 3.1 MB of markup, and Outpost shows chapters of up to 2.0 MB.";
    open(`/library/documents/${ID}?chapter=2`, {
      [`GET /api/documents/${ID}/epub/chapters/2`]: refuse(413, "too_large", message, "too_large"),
    });
    expect(await screen.findByRole("heading", { name: "This chapter cannot be shown" })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download original" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next.*Leaving/ })).toBeInTheDocument();
    // A chapter that could not be shown is not a place to carry on from.
    expect(readPlace(ID)).toBeNull();
  });

  it("opens the chapter a search result names by its heading", async () => {
    open(`/library/documents/${ID}?heading=${encodeURIComponent("lighting the stove")}`);
    expect(await screen.findByText("Open the damper.")).toBeInTheDocument();
    expect(address()).toBe(`/library/documents/${ID}?chapter=2`);
  });

  it("opens the front of the book when no chapter has that heading", async () => {
    open(`/library/documents/${ID}?heading=Nothing`);
    expect(await screen.findByRole("link", { name: "Start reading" })).toBeInTheDocument();
    expect(address()).toBe(`/library/documents/${ID}`);
  });
});

describe("a book that cannot be read", () => {
  it("says plainly that a copy-protected book is locked", async () => {
    open(`/library/documents/${ID}`, {
      [`GET /api/documents/${ID}/epub`]: refuse(
        415,
        "unsupported",
        "This book is copy-protected (DRM), so Outpost cannot read it.",
        "protected",
      ),
    });
    expect(await screen.findByRole("heading", { name: "This book is copy-protected" })).toBeInTheDocument();
    expect(screen.getByText(/Outpost does not remove copy protection/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download original" })).toHaveAttribute("href", `${document.fileUrl}?download=1`);
    expect(screen.queryByRole("button", { name: "Show its plain text" })).toBeNull();
  });

  it("explains a damaged book in the server's words, and offers the text that was read for search", async () => {
    const server = open(`/library/documents/${ID}?chapter=2`, {
      [`GET /api/documents/${ID}/epub`]: refuse(415, "unsupported", "This EPUB lists no chapters that are in the file.", "damaged"),
      [`GET /api/documents/${ID}/text`]: {
        documentId: ID,
        extraction: "done",
        extractionDetail: null,
        pageCount: null,
        sections: [{ page: null, heading: "Arriving", text: "Wet boots.", ocr: false }],
      },
      [`GET /api/documents/${ID}`]: { document },
    });
    expect(await screen.findByRole("heading", { name: "This book could not be opened" })).toBeInTheDocument();
    expect(screen.getByText("This EPUB lists no chapters that are in the file.")).toBeInTheDocument();
    // No chapter is asked for from a book that could not be opened.
    expect(server.calls.filter((call) => call.includes("/chapters/"))).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Show its plain text" }));
    expect(await screen.findByText("Wet boots.")).toBeInTheDocument();
  });

  it("offers to try again when the server could not be asked", async () => {
    open(`/library/documents/${ID}`, { [`GET /api/documents/${ID}/epub`]: refuse(500, "internal", "Something went wrong.") });
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("addresses", () => {
  it("makes a picture's address only from a plain path inside the book", () => {
    expect(pictureUrl(ID, "OEBPS/images/a b.png")).toBe(`/api/documents/${ID}/epub/file?path=OEBPS%2Fimages%2Fa%20b.png`);
    expect(pictureUrl(ID, "cover.png?x=1&path=other#frag")).toBe(
      `/api/documents/${ID}/epub/file?path=cover.png%3Fx%3D1%26path%3Dother%23frag`,
    );
    for (const path of [
      "",
      "../x.png",
      "a/../b.png",
      "a//b.png",
      "./a.png",
      "/a.png",
      "a\\b.png",
      "https://example.org/a.png",
      "a/",
      "a\u0000.png",
    ]) {
      expect(pictureUrl(ID, path), JSON.stringify(path)).toBeNull();
    }
    expect(pictureUrl("../../settings", "cover.png")).toBeNull();
    expect(pictureUrl(ID, "x".repeat(1025))).toBeNull();
  });

  it("makes a chapter's address from a number and a checked id", () => {
    expect(chapterTo(ID, 3)).toEqual({ pathname: `/library/documents/${ID}`, search: "?chapter=3", hash: "" });
    expect(chapterTo(ID, 3, "sec_1")).toMatchObject({ search: "?chapter=3", hash: "#h-sec_1" });
    // Not an id: the chapter is still opened, at its start.
    expect(chapterTo(ID, 3, "a b/../c")).toMatchObject({ search: "?chapter=3", hash: "" });
    expect(chapterTo(ID, 0, "x")).toEqual({ pathname: `/library/documents/${ID}`, search: "", hash: "" });
    expect(chapterTo(ID, -1)).toBeNull();
    expect(chapterTo(ID, 1.5)).toBeNull();
    expect(chapterTo("a/b", 1)).toBeNull();
  });

  it("reads the chapter out of an address", () => {
    const at = (search: string) => chapterInAddress(new URLSearchParams(search));
    expect(at("chapter=4")).toBe(4);
    expect(at("")).toBeNull();
    for (const bad of ["chapter=0", "chapter=-2", "chapter=1.5", "chapter=two", "chapter=1e3", "chapter=99999999"])
      expect(at(bad), bad).toBeNull();
  });

  it("finds the chapter a heading names: by what search read first, then by the contents", () => {
    expect(chapterForHeading(book.chapters, "Lighting the stove")).toBe(2);
    expect(chapterForHeading(book.chapters, " ARRIVING ")).toBe(1);
    expect(chapterForHeading(book.chapters, "Leaving")).toBe(3);
    expect(chapterForHeading(book.chapters, "Elsewhere")).toBeNull();
    expect(chapterForHeading(book.chapters, " ")).toBeNull();
  });

  it("sends a search result for a passage under a heading to that heading", () => {
    const passage = (heading: string | null, page: number | null = null) => [{ chunkId: 1, segments: [], page, heading }];
    const url = `/library/documents/${ID}`;
    expect(resultHref({ kind: "document", url, passages: passage("The stove & flue") })).toBe(`${url}?heading=The%20stove%20%26%20flue`);
    // A page of a PDF already has its address; a note and a result with no passage are opened as they are.
    expect(resultHref({ kind: "document", url: `${url}?page=2`, passages: passage("Filters", 2) })).toBe(`${url}?page=2`);
    expect(resultHref({ kind: "document", url, passages: passage(null) })).toBe(url);
    expect(resultHref({ kind: "document", url, passages: [] })).toBe(url);
    expect(resultHref({ kind: "note", url: "/notes/n1", passages: passage("Heading") })).toBe("/notes/n1");
  });
});

describe("the reading place", () => {
  it("is kept per book and read back field by field", () => {
    expect(readPlace(ID)).toBeNull();
    savePlace(ID, { chapter: 3, section: 2, block: 7, offset: 41.6 }, 1000);
    savePlace("01OTHER", { chapter: 1, section: 0, block: 0, offset: 0 }, 2000);
    expect(readPlace(ID)).toEqual({ chapter: 3, section: 2, block: 7, offset: 42, at: 1000 });
    expect(readPlace("01OTHER")).toMatchObject({ chapter: 1 });
  });

  it("does not trust what it finds in storage", () => {
    for (const stored of [
      "not json",
      "[]",
      JSON.stringify({ [ID]: "chapter 2" }),
      JSON.stringify({ [ID]: { chapter: 0, section: 0, block: 0 } }),
      JSON.stringify({ [ID]: { chapter: "2", section: 0, block: 0 } }),
      JSON.stringify({ [ID]: { chapter: 2, section: -1, block: 0 } }),
      JSON.stringify({ [ID]: { chapter: 2, section: 0, block: 1.5 } }),
    ]) {
      localStorage.setItem("outpost.epub.places", stored);
      expect(readPlace(ID), stored).toBeNull();
    }
    localStorage.setItem("outpost.epub.places", JSON.stringify({ [ID]: { chapter: 2, section: 1, block: 4, offset: "far", at: "then" } }));
    expect(readPlace(ID)).toEqual({ chapter: 2, section: 1, block: 4, offset: 0, at: 0 });
  });

  it("forgets the book read longest ago once it is keeping two hundred", () => {
    for (let index = 0; index < 205; index += 1) savePlace(`01BOOK${index}`, { chapter: 1, section: 0, block: 0, offset: 0 }, index);
    expect(readPlace("01BOOK0")).toBeNull();
    expect(readPlace("01BOOK4")).toBeNull();
    expect(readPlace("01BOOK5")).not.toBeNull();
    expect(readPlace("01BOOK204")).not.toBeNull();
  });
});

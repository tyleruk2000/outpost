import type { ArchiveDocument, ArchiveDocumentsResponse } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import { fakeServer, installBrowserStubs, renderScreen } from "../downloads/test-support";
import { DocumentList, fileKindLabel } from "./document-list";
import ReaderPage from "./reader-page";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

const BASE = "/kiwix/open/content/field-library/";

const documents: ArchiveDocument[] = [
  {
    id: "0",
    title: "Boiling water to make it safe",
    description: "Water: how long to boil",
    author: "A. Writer",
    files: [{ name: "Water (1).pdf", path: "files/Water (1).pdf", kind: "pdf", documentId: null, adding: null, problem: null }],
  },
  {
    id: "1",
    title: "<img src=x onerror=alert(1)> & <b>bold</b>",
    description: "<script>alert(2)</script>",
    author: "",
    files: [{ name: "odd #1?.pdf", path: "files/odd #1?.pdf", kind: "pdf", documentId: "doc9", adding: null, problem: null }],
  },
  {
    id: "2",
    title: "Radio check procedure",
    description: "",
    author: "Outpost tests",
    files: [
      { name: "Radio check.pdf", path: "files/Radio check.pdf", kind: "pdf", documentId: null, adding: null, problem: null },
      { name: "Radio check.wav", path: "files/Radio check.wav", kind: "audio", documentId: null, adding: null, problem: null },
      { name: "notes.docx", path: "files/notes.docx", kind: "other", documentId: null, adding: null, problem: null },
    ],
  },
  {
    id: "3",
    title: "Kit list",
    description: "Kit list",
    author: "",
    files: [{ name: "kit list.ods", path: "files/sheets/kit list.ods", kind: "other", documentId: null, adding: null, problem: null }],
  },
];

const answer = (over: Partial<NonNullable<ArchiveDocumentsResponse["list"]>> = {}): ArchiveDocumentsResponse => ({
  list: { home: "home", total: documents.length, matched: documents.length, offset: 0, documents, skipped: 0, truncated: false, ...over },
  problem: null,
});

function list(props: Partial<Parameters<typeof DocumentList>[0]> = {}) {
  const onOpen = vi.fn();
  const onShowOwnPage = vi.fn();
  const onClearQuery = vi.fn();
  renderScreen(
    <DocumentList
      collectionId="c1"
      contentBase={BASE}
      description="Documents for the field."
      query=""
      onOpen={onOpen}
      onShowOwnPage={onShowOwnPage}
      onClearQuery={onClearQuery}
      {...props}
    />,
  );
  return { onOpen, onShowOwnPage, onClearQuery };
}

describe("the list of a collection's documents", () => {
  it("shows each document with its kind, author and description, and opens one in the reader", async () => {
    fakeServer({ "GET /api/kiwix/books/c1/documents": answer() });
    const { onOpen, onShowOwnPage } = list();
    expect(await screen.findByRole("heading", { level: 1, name: "Documents in this collection" })).toBeInTheDocument();
    expect(screen.getByText("Documents for the field.")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("4 documents");

    const rows = within(screen.getByRole("list", { name: "Documents" })).getAllByRole("listitem");
    const first = within(rows[0]!);
    expect(first.getByRole("heading", { level: 2, name: "Boiling water to make it safe" })).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("PDF · , A. Writer");
    expect(first.getByText("Water: how long to boil")).toBeInTheDocument();
    await userEvent.click(first.getByRole("button", { name: "Boiling water to make it safe" }));
    expect(onOpen).toHaveBeenCalledWith(documents[0]!.files[0], documents[0]);

    // A description that only repeats the title is left out.
    const kit = screen.getByRole("link", { name: "Kit list" }).closest("li")!;
    expect(within(kit).getAllByText("Kit list")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Show the collection's own page" }));
    expect(onShowOwnPage).toHaveBeenCalled();
  });

  it("shows what the collection wrote as text, never as markup", async () => {
    fakeServer({ "GET /api/kiwix/books/c1/documents": answer() });
    list();
    const title = await screen.findByRole("heading", { level: 2, name: "<img src=x onerror=alert(1)> & <b>bold</b>" });
    expect(title.querySelector("img, b, script")).toBeNull();
    expect(screen.getByText("<script>alert(2)</script>")).toBeInTheDocument();
    expect(document.querySelector("img[src='x'], script")).toBeNull();
  });

  it("lists every file of a document that has several, and hands the browser what the reader cannot show", async () => {
    fakeServer({ "GET /api/kiwix/books/c1/documents": answer() });
    const { onOpen } = list();
    const files = within(await screen.findByRole("list", { name: "Files of Radio check procedure" }));
    expect(files.getAllByRole("listitem")).toHaveLength(3);
    // The title of such a document opens nothing by itself.
    expect(screen.queryByRole("button", { name: "Radio check procedure" })).not.toBeInTheDocument();
    await userEvent.click(files.getByRole("button", { name: "Radio check.wav" }));
    expect(onOpen).toHaveBeenCalledWith(documents[2]!.files[1], documents[2]);
    expect(files.getByText("Sound recording")).toBeInTheDocument();
    // A kind the reader has no viewer for is a plain link to the file inside the collection, opened apart from Outpost.
    const other = files.getByRole("link", { name: "notes.docx" });
    expect(other).toHaveAttribute("href", `${BASE}files/notes.docx`);
    expect(other).toHaveAttribute("target", "_blank");
    expect(other).toHaveAttribute("rel", "noopener noreferrer");
    expect(files.getByText("DOCX file, opens in a new tab")).toBeInTheDocument();
    // The same for a document that is one such file. Each part of its path is escaped.
    const sheet = screen.getByRole("link", { name: "Kit list" });
    expect(sheet).toHaveAttribute("href", `${BASE}files/sheets/kit%20list.ods`);
    expect(sheet).toHaveAttribute("target", "_blank");
    // Only PDFs and e-books can be kept as documents.
    expect(screen.getAllByRole("button", { name: /^Add to library: / })).toHaveLength(2);
  });

  it("adds a document to the library under the title the collection gives it, and then leads to it", async () => {
    const server = fakeServer({
      "GET /api/kiwix/books/c1/documents": answer(),
      "POST /api/kiwix/books/c1/files/save": { status: "created", document: { id: "doc1", title: "Boiling water to make it safe" } },
    });
    const fetched = vi.mocked(fetch);
    list();
    // One of the documents was added before.
    expect(await screen.findByRole("link", { name: "In your library: <img src=x onerror=alert(1)> & <b>bold</b>" })).toHaveAttribute(
      "href",
      "/library/documents/doc9",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add to library: Boiling water to make it safe" }));
    expect(await screen.findByRole("link", { name: "In your library: Boiling water to make it safe" })).toHaveAttribute(
      "href",
      "/library/documents/doc1",
    );
    const post = fetched.mock.calls.find(([input, init]) => init?.method === "POST" && String(input).endsWith("/files/save"))!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ path: "files/Water (1).pdf", title: "Boiling water to make it safe" });
    expect(server.calls).toContain("POST /api/kiwix/books/c1/files/save");
  });

  it("says why when a document could not be added", async () => {
    fakeServer({
      "GET /api/kiwix/books/c1/documents": answer(),
      "POST /api/kiwix/books/c1/files/save": {
        status: 404,
        error: { code: "not_found", message: '"Water (1).pdf" is not in this collection.' },
      },
    });
    list();
    await userEvent.click(await screen.findByRole("button", { name: "Add to library: Boiling water to make it safe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('"Water (1).pdf" is not in this collection.');
  });

  it("asks the server for the words typed, and says so when nothing matches", async () => {
    const server = fakeServer({
      "GET /api/kiwix/books/c1/documents": ({ url }: { url: URL }) =>
        url.searchParams.get("q") === "water" ? answer({ matched: 1, documents: [documents[0]!] }) : answer({ matched: 0, documents: [] }),
    });
    const { onClearQuery } = list({ query: "water" });
    expect(await screen.findByRole("heading", { level: 1, name: "Documents matching “water”" })).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("1 of 4 documents");
    expect(server.calls).toContain("GET /api/kiwix/books/c1/documents?q=water&offset=0&limit=100");
    await userEvent.click(screen.getByRole("button", { name: "Show all documents" }));
    expect(onClearQuery).toHaveBeenCalled();
  });

  it("says when no document matches, and when the list left entries out", async () => {
    fakeServer({ "GET /api/kiwix/books/c1/documents": answer({ matched: 0, documents: [] }) });
    list({ query: "zebra" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "None of the 4 documents has those words in its title, author or description. Try fewer or different ones.",
    );
    expect(screen.queryByRole("list", { name: "Documents" })).not.toBeInTheDocument();
  });

  it("says what was left out of a list, and fetches a long list a part at a time", async () => {
    const many = Array.from(
      { length: 130 },
      (_, index): ArchiveDocument => ({
        id: String(index),
        title: `Document ${index + 1}`,
        description: "",
        author: "",
        files: [{ name: `${index}.pdf`, path: `files/${index}.pdf`, kind: "pdf", documentId: null, adding: null, problem: null }],
      }),
    );
    const server = fakeServer({
      "GET /api/kiwix/books/c1/documents": ({ url }: { url: URL }) => {
        const offset = Number(url.searchParams.get("offset"));
        return answer({ total: 130, matched: 130, offset, documents: many.slice(offset, offset + 100), skipped: 2, truncated: true });
      },
    });
    list();
    expect(await screen.findByRole("heading", { level: 2, name: "Document 100" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Document 101" })).not.toBeInTheDocument();
    expect(screen.getByText(/2 entries in the collection's list name no file that can be opened, and are left out\./)).toBeInTheDocument();
    expect(screen.getByText(/lists more documents than Outpost reads/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show 30 more" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Document 130" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).not.toBeInTheDocument();
    expect(server.calls).toContain("GET /api/kiwix/books/c1/documents?offset=100&limit=100");
  });

  it("offers to try again when the list cannot be fetched", async () => {
    fakeServer({
      "GET /api/kiwix/books/c1/documents": { status: 502, error: { code: "upstream", message: "The Kiwix server is not answering." } },
    });
    list();
    expect(await screen.findByText("The Kiwix server is not answering.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("names a file by what it is", () => {
    expect(fileKindLabel({ kind: "pdf", name: "a.pdf" })).toBe("PDF");
    expect(fileKindLabel({ kind: "video", name: "a.webm" })).toBe("Video");
    expect(fileKindLabel({ kind: "other", name: "table.ODS" })).toBe("ODS file");
    expect(fileKindLabel({ kind: "other", name: "README" })).toBe("File");
  });
});

describe("the reader, for a collection that lists documents", () => {
  const book = {
    book: {
      collectionId: "c1",
      bookName: "field-library",
      title: "Field library",
      description: "Documents for the field.",
      language: "eng",
      articleCount: 1,
      sizeBytes: 1000,
      contentBase: BASE,
      iconUrl: null,
      ready: true,
    },
    reason: null,
  };
  const reader = (route: string) =>
    renderScreen(
      <TooltipProvider>
        <Routes>
          <Route path="/library/read/:collectionId/*" element={<ReaderPage />} />
        </Routes>
      </TooltipProvider>,
      route,
    );
  const frame = () => document.querySelector("iframe");

  it("shows the list in place of the collection's own page, which is never loaded", async () => {
    const server = fakeServer({ "GET /api/kiwix/books/c1": book, "GET /api/kiwix/books/c1/documents": answer() });
    reader("/library/read/c1/");
    expect(await screen.findByRole("heading", { level: 1, name: "Documents in this collection" })).toBeInTheDocument();
    expect(frame()).toBeNull();
    // The search box looks through the documents; nothing is asked of the collection's own search.
    await userEvent.type(screen.getByRole("combobox", { name: "Search the documents in Field library" }), "water{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Documents matching “water”" })).toBeInTheDocument();
    await waitFor(() => expect(server.calls).toContain("GET /api/kiwix/books/c1/documents?q=water&offset=0&limit=100"));
    expect(server.calls.some((call) => call.includes("/suggest") || call.includes("/search"))).toBe(false);
  });

  it("shows it on the page that would have drawn the list, and opens a document over it", async () => {
    fakeServer({
      "GET /api/kiwix/books/c1": book,
      "GET /api/kiwix/books/c1/documents": answer(),
      "POST /api/kiwix/books/c1/files/check": { files: [] },
    });
    reader("/library/read/c1/home");
    await userEvent.click(await screen.findByRole("button", { name: "Radio check.wav" }));
    // A recording plays in the browser's own player, straight from the collection.
    const player = await waitFor(() => {
      const found = document.querySelector("audio");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(player).toHaveAttribute("src", `${BASE}files/Radio%20check.wav`);
    expect(screen.getByRole("heading", { level: 2, name: "Radio check procedure: Radio check.wav" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to the list" }));
    await waitFor(() => expect(document.querySelector("audio")).toBeNull());
    expect(screen.getByRole("heading", { level: 1, name: "Documents in this collection" })).toBeInTheDocument();
  });

  it("still shows the collection's own page when asked, in its sandbox, and the way back", async () => {
    fakeServer({ "GET /api/kiwix/books/c1": book, "GET /api/kiwix/books/c1/documents": answer() });
    reader("/library/read/c1/home");
    await userEvent.click(await screen.findByRole("button", { name: "Show the collection's own page" }));
    await waitFor(() => expect(frame()).not.toBeNull());
    expect(frame()).toHaveAttribute("src", `${BASE}home`);
    expect(frame()!.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(screen.queryByRole("heading", { level: 1, name: "Documents in this collection" })).not.toBeInTheDocument();
    expect(screen.getByText("This is the collection's own page. It cannot draw its list of documents here.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the documents" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Documents in this collection" })).toBeInTheDocument();
    expect(frame()).toBeNull();
  });

  it("leaves an ordinary collection as it was: its pages, in the frame", async () => {
    fakeServer({ "GET /api/kiwix/books/c1": book, "GET /api/kiwix/books/c1/documents": { list: null, problem: null } });
    reader("/library/read/c1/Bowline");
    await waitFor(() => expect(frame()).not.toBeNull());
    expect(frame()).toHaveAttribute("src", `${BASE}Bowline`);
    expect(screen.getByRole("combobox", { name: "Search in Field library" })).toBeInTheDocument();
    expect(screen.queryByText(/Documents in this collection/)).not.toBeInTheDocument();
    // The screen is named by what it shows: here the collection, there being no list or results over it.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Field library");
  });

  it("has one main heading whichever way the collection is shown", async () => {
    fakeServer({ "GET /api/kiwix/books/c1": book, "GET /api/kiwix/books/c1/documents": answer() });
    reader("/library/read/c1/");
    expect(await screen.findByRole("heading", { level: 1, name: "Documents in this collection" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows the collection's own page, and says why, when its list could not be read", async () => {
    fakeServer({
      "GET /api/kiwix/books/c1": book,
      "GET /api/kiwix/books/c1/documents": {
        list: null,
        problem: "This collection's list of documents is larger than Outpost reads (4 MB).",
      },
    });
    reader("/library/read/c1/");
    expect(
      await screen.findByText(
        "This collection's list of documents is larger than Outpost reads (4 MB). Its own page is shown instead, and its list may stay empty.",
      ),
    ).toBeInTheDocument();
    expect(frame()).not.toBeNull();
  });

  it("says why a collection cannot be read, and opens it when asked again once it can", async () => {
    let ready = false;
    fakeServer({
      "GET /api/kiwix/books/c1": () =>
        ready
          ? book
          : { book: { ...book.book, ready: false }, reason: "The Kiwix server is not answering. Check that its container is running." },
      "GET /api/kiwix/books/c1/documents": answer(),
    });
    reader("/library/read/c1/");
    expect(await screen.findByText("The Kiwix server is not answering. Check that its container is running.")).toBeInTheDocument();
    ready = true;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Documents in this collection" })).toBeInTheDocument();
  });

  it("falls back to the frame when it cannot learn what kind of collection this is", async () => {
    fakeServer({ "GET /api/kiwix/books/c1": book });
    reader("/library/read/c1/Bowline");
    await waitFor(() => expect(frame()).not.toBeNull());
  });
});

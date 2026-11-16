/**
 * Reading an EPUB book in the app: what the server says is in a book, what a chapter
 * becomes, which files of the archive it will hand over as pictures, and what it refuses.
 */
import type { DocumentDto, DocumentEpubChapterResponse, DocumentEpubResponse, MarkdownBlock } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_SPINE_ITEMS } from "../src/modules/documents/epub-package.ts";
import {
  archivePath,
  decodeMarkup,
  MAX_CHAPTER_BYTES,
  MAX_CHAPTER_TAGS,
  MAX_PICTURE_BYTES,
  pictureType,
} from "../src/modules/documents/epub-reader.ts";
import { anchorId, chapterBlocks } from "../src/modules/documents/epub-view.ts";
import { buildZip, multipart, tinyPng } from "./fixtures/documents/builders.ts";
import {
  container,
  encrypted,
  hutBook,
  MIMETYPE,
  page,
  plainSvg,
  scriptedSvg,
  tideBook,
  withEncryption,
} from "./fixtures/documents/epub-books.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(async () => {
  // Let text extraction finish first: closing with a job in flight waits out a timeout.
  await app?.ctx.jobs.whenIdle();
  await app?.close();
});

async function add(name: string, content: Buffer): Promise<DocumentDto> {
  const { payload, headers } = multipart({}, [{ name, content }]);
  const { body } = await app.api("POST", "/api/documents", payload, { headers });
  expect(body.results[0].status, body.results[0].reason).toBe("created");
  await app.ctx.jobs.whenIdle();
  return (await app.api("GET", `/api/documents/${body.results[0].document.id}`)).body.document;
}

const summaryOf = (id: string) => app.api<DocumentEpubResponse>("GET", `/api/documents/${id}/epub`);
const chapterOf = (id: string, position: number) =>
  app.api<DocumentEpubChapterResponse>("GET", `/api/documents/${id}/epub/chapters/${position}`);
const fileOf = (id: string, path: string) =>
  app.app.inject({ method: "GET", url: `/api/documents/${id}/epub/file?path=${encodeURIComponent(path)}`, headers: { host: "localhost" } });

/** A book of the given chapters, as plainly as a book can be written. */
function plainBook(
  chapters: Array<{ file: string; content: string | Buffer }>,
  extra: Array<{ name: string; content: string | Buffer }> = [],
) {
  const items = chapters.map((chapter, index) => `<item id="c${index}" href="${chapter.file}" media-type="application/xhtml+xml"/>`);
  const refs = chapters.map((_, index) => `<itemref idref="c${index}"/>`);
  return buildZip([
    MIMETYPE,
    container("book.opf"),
    {
      name: "book.opf",
      content: `<package><metadata><dc:title>A plain book</dc:title></metadata><manifest>${items.join("")}</manifest><spine>${refs.join("")}</spine></package>`,
    },
    ...chapters.map((chapter) => ({ name: chapter.file, content: chapter.content })),
    ...extra,
  ]);
}

describe("what is in a book", () => {
  it("reads an EPUB 3: title, author, cover, reading order and a nested table of contents from the navigation document", async () => {
    const book = await add("hut.epub", await hutBook());
    const { status, body } = await summaryOf(book.id);
    expect(status).toBe(200);
    expect(body).toEqual({
      documentId: book.id,
      title: "The Hut Book",
      author: "Mara Ellison",
      language: "en-GB",
      cover: "OEBPS/images/cover.png",
      // The navigation document is in the spine, and is not a chapter: the reader has a contents page of its own.
      chapters: [
        { position: 1, title: "Arriving", heading: "Arriving" },
        { position: 2, title: "The stove", heading: "The stove" },
        { position: 3, title: "Leaving", heading: "Leaving" },
      ],
      contents: [
        { title: "Arriving", chapter: 1, depth: 0 },
        // An id with a dot in it, as the web app will meet it.
        { title: "The door", chapter: 1, anchor: "the_door", depth: 1 },
        // A line that names a part of the book and opens nothing.
        { title: "Living there", chapter: null, depth: 0 },
        { title: "The stove", chapter: 2, depth: 1 },
        { title: "Leaving", chapter: 3, anchor: "last", depth: 0 },
      ],
      notes: [],
    });
  });

  it("reads an EPUB 2: the table of contents from the NCX, the cover from the metadata, a file name with a space", async () => {
    const book = await add("tides.epub", await tideBook());
    const { body } = await summaryOf(book.id);
    expect(body).toMatchObject({ title: "Tide Tables for Walkers", author: "Owen Pryce", language: "en", cover: "cover.png" });
    // The title page is in no table of contents; it goes by what search read from it.
    expect(body.chapters.map((chapter) => chapter.title)).toEqual(["Title page", "Crossing the sands", "Springs and neaps"]);
    expect(body.contents).toEqual([
      { title: "Crossing the sands", chapter: 2, depth: 0 },
      { title: "When to set out", chapter: 2, anchor: "when", depth: 1 },
      { title: "Springs and neaps", chapter: 3, depth: 0 },
    ]);

    const { body: chapter } = await chapterOf(book.id, 2);
    expect(chapter.blocks).toEqual([
      { t: "heading", depth: 2, c: [{ t: "text", v: "Crossing the sands" }] },
      { t: "paragraph", c: [{ t: "text", v: "Never cross on a rising tide." }] },
      // `<a name="when"/>`, as EPUB 2 books mark a place.
      {
        t: "heading",
        depth: 3,
        c: [
          { t: "anchor", id: "when" },
          { t: "text", v: "When to set out" },
        ],
      },
      {
        t: "paragraph",
        c: [
          { t: "text", v: "Two hours after high water, and see " },
          { t: "chapter", chapter: 3, c: [{ t: "text", v: "springs and neaps" }] },
          { t: "text", v: "." },
        ],
      },
    ]);
  });

  it("does without a table of contents, and names chapters by their place when nothing else names them", async () => {
    const book = await add(
      "plain.epub",
      await plainBook([
        { file: "a.html", content: "<p>No heading and no title here.</p>" },
        { file: "b.html", content: page("", "<h1>Second thoughts</h1><p>Some.</p>") },
      ]),
    );
    const { body } = await summaryOf(book.id);
    expect(body.contents).toEqual([]);
    expect(body.cover).toBeNull();
    expect(body.chapters).toEqual([
      { position: 1, title: "Section 1", heading: null },
      { position: 2, title: "Second thoughts", heading: "Second thoughts" },
    ]);
  });

  it("says when a book is fixed-layout, and reads only the first chapters of a book with too many", async () => {
    const fixed = await add("fixed.epub", await hutBook({ metadata: '<meta property="rendition:layout">pre-paginated</meta>' }));
    expect((await summaryOf(fixed.id)).body.notes).toEqual([expect.stringContaining("fixed-layout book")]);

    const many = Array.from({ length: MAX_SPINE_ITEMS + 5 }, (_, index) => ({ file: `p${index}.html`, content: `<p>Part ${index}.</p>` }));
    const long = await add("long.epub", await plainBook(many));
    const { body } = await summaryOf(long.id);
    expect(body.chapters).toHaveLength(MAX_SPINE_ITEMS);
    expect(body.notes).toEqual(["This book is in 2,005 sections. Only the first 2,000 can be read here."]);
    expect((await chapterOf(long.id, MAX_SPINE_ITEMS)).status).toBe(200);
    expect((await chapterOf(long.id, MAX_SPINE_ITEMS + 1)).status).toBe(400);
  });

  it("is only for EPUB books, and only for chapters the book has", async () => {
    const { payload, headers } = multipart({}, [{ name: "notes.md", content: "# Notes" }]);
    const note = (await app.api("POST", "/api/documents", payload, { headers })).body.results[0].document;
    const refused = await summaryOf(note.id);
    expect(refused.status).toBe(415);
    expect((refused.body as unknown as { error: { message: string } }).error.message).toMatch(/^"notes" is not an EPUB book\.$/i);
    expect((await summaryOf("nosuchdocument")).status).toBe(404);

    const book = await add("hut.epub", await hutBook());
    const beyond = await chapterOf(book.id, 4);
    expect(beyond.status).toBe(404);
    expect((beyond.body as unknown as { error: { message: string } }).error.message).toBe(
      "This book has 3 sections; there is no section 4.",
    );
    for (const bad of ["0", "-1", "1.5", "two", "1e9"]) {
      expect((await app.api("GET", `/api/documents/${book.id}/epub/chapters/${bad}`)).status, bad).toBe(400);
    }
  });
});

describe("a chapter", () => {
  it("is sent as plain values: formatting kept, links looked up, pictures named by their place in the archive", async () => {
    const book = await add("hut.epub", await hutBook());
    const { body } = await chapterOf(book.id, 1);
    expect(body).toMatchObject({ documentId: book.id, position: 1, total: 3, title: "Arriving", notes: [] });
    const text = (v: string) => ({ t: "text", v });
    expect(body.blocks).toEqual([
      { t: "heading", depth: 1, id: "top", c: [text("Arriving")] },
      {
        t: "paragraph",
        c: [
          text("You reach the hut "),
          { t: "em", c: [text("late")] },
          text(", with "),
          { t: "strong", c: [text("wet boots")] },
          text(" and a "),
          // A link to a place in another chapter: the chapter's number and the place's id, not an address.
          { t: "chapter", chapter: 2, anchor: "lighting", c: [text("cold stove")] },
          text(" ahead of you."),
          // The marker of a note: a place of its own (the note links back to it) and a jump to the note.
          { t: "anchor", id: "r1" },
          { t: "jump", to: "n1", c: [{ t: "sup", c: [text("1")] }] },
        ],
      },
      { t: "heading", depth: 2, id: "the_door", c: [text("The door")] },
      {
        t: "paragraph",
        c: [
          text("The key hangs "),
          { t: "em", c: [text("inside")] },
          text(" the wood store. See "),
          { t: "jump", to: "top", c: [text("the start")] },
          text(", "),
          // The book's own table of contents is the reader's contents page.
          { t: "chapter", chapter: 0, c: [text("the contents")] },
          text(", "),
          { t: "link", href: "https://example.org/huts?x=1", c: [text("the hut register")] },
          // A `javascript:` link and a link to nowhere keep their words and nothing else.
          text(", a trick and a dead end."),
        ],
      },
      { t: "figure", src: "OEBPS/images/cover.png", alt: "The hut at dusk" },
      {
        t: "figure",
        src: "OEBPS/images/hut.svg",
        alt: "Plan of the hut",
        caption: [text("One room, one "), { t: "strong", c: [text("stove")] }, text(".")],
      },
      {
        t: "paragraph",
        c: [
          text("A sign "),
          { t: "picture", src: "OEBPS/images/cover.png", alt: "no fires" },
          text(" is nailed up, and a picture from "),
          // A picture on the web is never fetched; what was written about it is kept.
          { t: "image", alt: "the valley" },
          text(" far away."),
        ],
      },
      { t: "quote", c: [{ t: "paragraph", c: [text("Leave it better than you found it.")] }] },
      {
        t: "list",
        ordered: false,
        items: [
          { c: [{ t: "paragraph", c: [text("Sweep the floor")] }] },
          {
            c: [
              { t: "paragraph", c: [text("Split kindling")] },
              {
                t: "list",
                ordered: true,
                start: 3,
                items: [{ c: [{ t: "paragraph", c: [text("dry")] }] }, { c: [{ t: "paragraph", c: [text("small")] }] }],
              },
            ],
          },
        ],
      },
      {
        t: "quote",
        kind: "note",
        c: [
          {
            t: "paragraph",
            c: [{ t: "anchor", id: "n1" }, text("1. Boots dry best away from the stove. "), { t: "jump", to: "r1", c: [text("Back")] }],
          },
        ],
      },
    ]);
  });

  it("keeps tables, code and subscripts, and says what it left out: scripts, video, mathematics, drawings, forms", async () => {
    const book = await add("hut.epub", await hutBook());
    const { body } = await chapterOf(book.id, 2);
    const text = (v: string) => ({ t: "text", v });
    expect(body.blocks).toEqual([
      { t: "heading", depth: 1, c: [text("The stove")] },
      { t: "paragraph", c: [{ t: "anchor", id: "lighting" }, text("Open the damper first.")] },
      { t: "paragraph", c: [text("Burn times")] },
      // A short row is filled out, so every row has the same number of cells.
      {
        t: "table",
        rows: [
          [[text("Wood")], [text("Hours")]],
          [[text("Birch")], [text("2")]],
          [[text("Oak")], []],
        ],
      },
      // No header cells: the first row is not dressed as a header.
      { t: "table", plain: true, rows: [[[text("Pine")], [text("1")]]] },
      { t: "code", v: "damper: open\ndoor:   ajar" },
      { t: "paragraph", c: [text("Water is H"), { t: "sub", c: [text("2")] }, text("O and boils when T = 100.")] },
      { t: "rule" },
      { t: "paragraph", c: [{ t: "strong", c: [text("Damper")] }] },
      { t: "paragraph", c: [text("The plate in the flue.")] },
      // A drawing written into the page is not drawn; what it is called is kept. One that only places a picture shows the picture.
      { t: "paragraph", c: [{ t: "image", alt: "Flue diagram" }] },
      { t: "figure", src: "OEBPS/images/cover.png", alt: "" },
    ]);
    expect(body.notes).toEqual([
      expect.stringContaining("Outpost does not run a book's scripts"),
      expect.stringContaining("mathematics"),
      expect.stringContaining("audio or video"),
      expect.stringContaining("drawing"),
      expect.stringContaining("Forms and buttons"),
    ]);
  });

  it("never passes on the book's own markup, styles, scripts, handlers or addresses", async () => {
    const book = await add("hut.epub", await hutBook());
    for (const position of [1, 2, 3]) {
      const sent = JSON.stringify((await chapterOf(book.id, position)).body);
      for (const never of [
        "<",
        "onclick",
        "onerror",
        "steal",
        "javascript",
        "pwned",
        "display:none",
        "color:red",
        "style.css",
        "reader.js",
        "fire.mp4",
      ]) {
        expect(sent, `chapter ${position}: ${never}`).not.toContain(never);
      }
      // The one address that survives is the web link, which the reader opens away from Outpost.
      expect(sent.match(/https?:[^"]*/g) ?? []).toEqual(position === 1 ? ["https://example.org/huts?x=1"] : []);
    }
  });

  it("reads a sloppy chapter as a browser would: unclosed tags, bare ampersands, capitals, no body, an old encoding", async () => {
    const latin1 = Buffer.concat([
      Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><html><body><p>Caf', "latin1"),
      Buffer.from([0xe9]),
      Buffer.from(" au lait</p></body></html>", "latin1"),
    ]);
    const book = await add(
      "sloppy.epub",
      await plainBook([
        {
          file: "a.html",
          content:
            "<H1>Fish & chips<P>Salt &amp; vinegar, <B>and <I>mushy</B> peas</I><p>A second <span>paragraph<br>on two lines<UL><LI>one<LI>two</UL>trailing words <a href=b.html#x>onward</a>",
        },
        { file: "b.html", content: latin1 },
        { file: "c.html", content: "" },
      ]),
    );
    const { status, body } = await chapterOf(book.id, 1);
    expect(status).toBe(200);
    const text = (v: string) => ({ t: "text", v });
    expect(body.blocks).toEqual([
      { t: "heading", depth: 1, c: [text("Fish & chips")] },
      {
        t: "paragraph",
        c: [text("Salt & vinegar, "), { t: "strong", c: [text("and "), { t: "em", c: [text("mushy")] }] }, { t: "em", c: [text(" peas")] }],
      },
      { t: "paragraph", c: [text("A second paragraph"), { t: "break" }, text("on two lines")] },
      {
        t: "list",
        ordered: false,
        items: [{ c: [{ t: "paragraph", c: [text("one")] }] }, { c: [{ t: "paragraph", c: [text("two")] }] }],
      },
      { t: "paragraph", c: [text("trailing words "), { t: "chapter", chapter: 2, anchor: "x", c: [text("onward")] }] },
    ]);
    expect((await chapterOf(book.id, 2)).body.blocks).toEqual([{ t: "paragraph", c: [text("Café au lait")] }]);
    // An empty chapter is an empty chapter, not an error.
    expect((await chapterOf(book.id, 3)).body).toMatchObject({ blocks: [], notes: [] });
  });

  it("refuses a chapter that is too large or too tangled, and goes on reading the others", async () => {
    const paragraph = "<p>Rain on the roof all night, and the stream up by morning.</p>\n";
    const book = await add(
      "heavy.epub",
      await plainBook([
        { file: "big.html", content: page("Big", paragraph.repeat(Math.ceil((MAX_CHAPTER_BYTES + 1) / paragraph.length))) },
        { file: "ok.html", content: page("Fine", "<p>A chapter of ordinary size.</p>") },
        { file: "busy.html", content: page("Busy", "<b></b>".repeat(MAX_CHAPTER_TAGS / 2 + 10)) },
        { file: "deep.html", content: page("Deep", `${"<div>".repeat(40_000)}bottom`) },
      ]),
    );
    type Refusal = { error: { code: string; message: string; details?: { reason?: string } } };
    const big = await app.api<Refusal>("GET", `/api/documents/${book.id}/epub/chapters/1`);
    expect(big.status).toBe(413);
    expect(big.body.error).toMatchObject({ code: "too_large", details: { reason: "too_large" } });
    expect(big.body.error.message).toMatch(
      /^This chapter is 2\.\d MB of markup, and Outpost shows chapters of up to 2\.0 MB\. The other chapters/,
    );

    expect((await chapterOf(book.id, 2)).body.blocks).toEqual([{ t: "paragraph", c: [{ t: "text", v: "A chapter of ordinary size." }] }]);

    const busy = await app.api<Refusal>("GET", `/api/documents/${book.id}/epub/chapters/3`);
    expect(busy.status).toBe(413);
    expect(busy.body.error.message).toContain("more pieces of markup than Outpost will read into memory");

    // Forty thousand elements each inside the last: said to be unreadable, and the server carries on.
    const deep = await app.api<Refusal>("GET", `/api/documents/${book.id}/epub/chapters/4`);
    expect(deep.status).toBe(415);
    expect(deep.body.error).toMatchObject({ message: "This chapter is nested too deeply to be read.", details: { reason: "damaged" } });
    expect((await chapterOf(book.id, 2)).status).toBe(200);
  });
});

describe("pictures from inside a book", () => {
  it("sends a picture under the type its bytes say, in a sandbox", async () => {
    const book = await add("hut.epub", await hutBook());
    const cover = await fileOf(book.id, "OEBPS/images/cover.png");
    expect(cover.statusCode).toBe(200);
    expect(cover.rawPayload.equals(tinyPng)).toBe(true);
    expect(cover.headers["content-type"]).toBe("image/png");
    expect(cover.headers["content-security-policy"]).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'");
    expect(cover.headers["x-content-type-options"]).toBe("nosniff");
    expect(cover.headers["content-disposition"]).toMatch(/^inline; filename="cover.png"/);

    // Asked for again with what the browser kept, it is not sent twice.
    const again = await app.app.inject({
      method: "GET",
      url: `/api/documents/${book.id}/epub/file?path=${encodeURIComponent("OEBPS/images/cover.png")}`,
      headers: { host: "localhost", "if-none-match": String(cover.headers.etag) },
    });
    expect(again.statusCode).toBe(304);
  });

  it("treats a drawing as the library treats every SVG: a download in a sandbox, and never one that carries script", async () => {
    const book = await add(
      "hut.epub",
      await hutBook({
        extra: [
          { name: "OEBPS/images/trap.svg", content: scriptedSvg },
          { name: "OEBPS/images/handler.svg", content: plainSvg.replace("<path", '<path onclick="steal()"') },
          { name: "OEBPS/images/link.svg", content: plainSvg.replace("<path", '<a href="JavaScript:steal()"><path') },
          { name: "OEBPS/images/page.svg", content: plainSvg.replace("<path", "<foreignObject><body/></foreignObject><path") },
        ],
      }),
    );
    const drawing = await fileOf(book.id, "OEBPS/images/hut.svg");
    expect(drawing.statusCode).toBe(200);
    expect(drawing.headers["content-type"]).toBe("image/svg+xml; charset=utf-8");
    // Shown through an <img> it is a picture; opened on its own it is a file to save, and could not act if it were shown.
    expect(drawing.headers["content-disposition"]).toMatch(/^attachment; filename="hut.svg"/);
    expect(drawing.headers["content-security-policy"]).toContain("sandbox");

    for (const name of ["trap", "handler", "link", "page"]) {
      const refused = await fileOf(book.id, `OEBPS/images/${name}.svg`);
      expect(refused.statusCode, name).toBe(415);
      expect(refused.json().error.message, name).toBe("This drawing holds a script or other active content, so Outpost does not show it.");
      expect(refused.body, name).not.toContain("steal");
    }
  });

  it("hands over nothing that is not a picture, whatever it is called", async () => {
    const book = await add(
      "hut.epub",
      await hutBook({
        extra: [
          { name: "OEBPS/images/page.png", content: "<html><body><script>steal()</script></body></html>" },
          { name: "OEBPS/images/page.svg", content: page("Not a drawing", '<svg xmlns="http://www.w3.org/2000/svg"/>') },
          { name: "OEBPS/font.otf", content: Buffer.from([0x4f, 0x54, 0x54, 0x4f, 0, 1, 2, 3]) },
        ],
      }),
    );
    // A chapter, the package file, a stylesheet, a font, the encryption list, and a page dressed as a picture.
    for (const path of [
      "OEBPS/text/arriving.xhtml",
      "OEBPS/book.opf",
      "OEBPS/nav.xhtml",
      "OEBPS/style.css",
      "OEBPS/font.otf",
      "META-INF/container.xml",
      "mimetype",
      "OEBPS/images/page.png",
      "OEBPS/images/page.svg",
    ]) {
      const refused = await fileOf(book.id, path);
      expect(refused.statusCode, path).toBe(415);
      expect(refused.json().error.message, path).toBe("That file of the book is not a picture Outpost can show.");
    }
    expect((await fileOf(book.id, "OEBPS/images/missing.png")).statusCode).toBe(404);
  });

  it("refuses any path that is not plainly a file of the book", async () => {
    const book = await add(
      "hut.epub",
      // An archive can carry an entry whose name climbs out; the reader never lists it.
      await hutBook({ extra: [{ name: "../outside.png", content: tinyPng }] }),
    );
    for (const path of [
      "../outside.png",
      "../../../../etc/passwd",
      "OEBPS/../../outside.png",
      "OEBPS/images/../images/cover.png",
      "OEBPS//images/cover.png",
      "./OEBPS/images/cover.png",
      "/OEBPS/images/cover.png",
      "/etc/passwd",
      "OEBPS\\images\\cover.png",
      "C:\\Windows\\win.ini",
      "file:///etc/passwd",
      "https://example.org/x.png",
      "OEBPS/images/",
      "OEBPS/images/cover.png\0.xhtml",
      "..",
      ".",
    ]) {
      const refused = await fileOf(book.id, path);
      expect(refused.statusCode, JSON.stringify(path)).toBe(400);
      expect(refused.json().error.message).toBe("That is not the path of a file inside this book.");
    }
    expect((await fileOf(book.id, "")).statusCode).toBe(400);
    expect((await fileOf(book.id, "a/".repeat(600))).statusCode).toBe(400);
    expect(archivePath("OEBPS/images/cover.png")).toBe("OEBPS/images/cover.png");
    expect(archivePath("cover image (1).png")).toBe("cover image (1).png");
  });

  it("does not show a chapter a picture the book does not hold, or one outside the book", async () => {
    const book = await add(
      "paths.epub",
      await plainBook(
        [
          {
            file: "text/a.html",
            content:
              '<p><img src="../pic.png" alt="in the book"/><img src="../../pic.png" alt="above the book"/><img src="/pic.png" alt="from the root"/><img src="file:///etc/passwd" alt="a file"/><img src="data:image/png;base64,AAAA" alt="written in"/><img src="gone.png" alt="missing"/></p>',
          },
        ],
        [{ name: "pic.png", content: tinyPng }],
      ),
    );
    expect((await chapterOf(book.id, 1)).body.blocks).toEqual([
      {
        t: "paragraph",
        c: [
          { t: "picture", src: "pic.png", alt: "in the book" },
          { t: "image", alt: "above the book" },
          { t: "image", alt: "from the root" },
          { t: "image", alt: "a file" },
          { t: "image", alt: "written in" },
          { t: "image", alt: "missing" },
        ],
      },
    ]);
  });

  it("caps the size of a picture", async () => {
    const huge = Buffer.concat([tinyPng, Buffer.alloc(MAX_PICTURE_BYTES)]);
    const book = await add("big-picture.epub", await hutBook({ extra: [{ name: "OEBPS/images/huge.png", content: huge }] }));
    const refused = await fileOf(book.id, "OEBPS/images/huge.png");
    expect(refused.statusCode).toBe(413);
    expect(refused.json().error.message).toBe("This picture is 16.0 MB, which is more than Outpost shows from inside a book.");
  });

  it("tells pictures from everything else by their bytes", () => {
    expect(pictureType(tinyPng)).toEqual({ mime: "image/png", svg: false });
    expect(pictureType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual({ mime: "image/jpeg", svg: false });
    expect(pictureType(Buffer.from("GIF89a...."))).toEqual({ mime: "image/gif", svg: false });
    expect(pictureType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toEqual({ mime: "image/webp", svg: false });
    expect(pictureType(Buffer.from(plainSvg))).toEqual({ mime: "image/svg+xml", svg: true });
    expect(pictureType(Buffer.from('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<svg:svg xmlns:svg="x"/>'))?.svg).toBe(true);
    expect(pictureType(Buffer.from("<?xml version='1.0'?><html><svg/></html>"))).toBeNull();
    expect(pictureType(Buffer.from("just words about <svg> elements"))).toBeNull();
    expect(pictureType(Buffer.from("MZ\u0090\0"))).toBeNull();
    expect(pictureType(Buffer.alloc(0))).toBeNull();
  });
});

describe("books that cannot be read", () => {
  type Refusal = { error: { code: string; message: string; details?: { reason?: string } } };
  const DRM =
    "This book is copy-protected (DRM), so Outpost cannot read it. Outpost does not remove copy protection. The file is stored as it is and can be downloaded.";

  it("says plainly that a copy-protected book is locked, and opens no part of it", async () => {
    const locked = await withEncryption(
      encrypted("http://www.w3.org/2001/04/xmlenc#aes128-cbc", "OEBPS/text/arriving.xhtml") +
        encrypted("http://www.w3.org/2001/04/xmlenc#aes128-cbc", "OEBPS/images/cover.png"),
    );
    const book = await add("locked.epub", locked);
    // The file is kept and can be downloaded; its text is not read for search.
    expect(book).toMatchObject({ type: "epub", extraction: "failed", extractionDetail: DRM, textChars: 0 });
    for (const url of [
      `/api/documents/${book.id}/epub`,
      // Not even the chapters and pictures the encryption list does not name.
      `/api/documents/${book.id}/epub/chapters/2`,
      `/api/documents/${book.id}/epub/file?path=${encodeURIComponent("OEBPS/images/hut.svg")}`,
    ]) {
      const refused = await app.api<Refusal>("GET", url);
      expect(refused.status, url).toBe(415);
      expect(refused.body.error, url).toEqual({ code: "unsupported", message: DRM, details: { reason: "protected" } });
    }
    expect((await app.api("GET", `/api/documents/${book.id}/file`)).status).toBe(200);
  });

  it("takes a rights file as a lock, whatever the encryption list says", async () => {
    for (const name of ["META-INF/rights.xml", "META-INF/license.lcpl", "META-INF/sinf.xml"]) {
      const book = await add("rights.epub", await hutBook({ extra: [{ name, content: "<rights/>" }] }));
      const refused = await app.api<Refusal>("GET", `/api/documents/${book.id}/epub`);
      expect(refused.body.error.details, name).toEqual({ reason: "protected" });
      await app.api("DELETE", `/api/documents/${book.id}`);
    }
    // An encrypted file that does not say how is not given the benefit of the doubt.
    const vague = await add(
      "vague.epub",
      await withEncryption('<enc:EncryptedData><enc:CipherData><enc:CipherReference URI="a"/></enc:CipherData></enc:EncryptedData>'),
    );
    expect((await app.api<Refusal>("GET", `/api/documents/${vague.id}/epub`)).body.error.details).toEqual({ reason: "protected" });
  });

  it("reads a book whose only encrypted files are obfuscated fonts", async () => {
    const book = await add(
      "fonts.epub",
      await withEncryption(
        encrypted("http://www.idpf.org/2008/embedding", "OEBPS/fonts/a.otf") +
          encrypted("http://ns.adobe.com/pdf/enc#RC", "OEBPS/fonts/b.otf"),
      ),
    );
    expect(book.extraction).toBe("done");
    expect((await summaryOf(book.id)).body.title).toBe("The Hut Book");
    expect((await chapterOf(book.id, 3)).status).toBe(200);
    // An empty encryption list locks nothing either.
    const empty = await add("empty-list.epub", await withEncryption(""));
    expect((await summaryOf(empty.id)).status).toBe(200);
  });

  it("explains a malformed book instead of failing", async () => {
    const broken: Array<[string, Buffer, RegExp]> = [
      [
        "no-container.epub",
        await buildZip([MIMETYPE, { name: "book.opf", content: "<package/>" }]),
        /missing the files that describe its contents/,
      ],
      ["no-package.epub", await buildZip([MIMETYPE, container("gone.opf")]), /missing the files that describe its contents/],
      [
        "no-chapters.epub",
        await buildZip([
          MIMETYPE,
          container("book.opf"),
          {
            name: "book.opf",
            content:
              '<package><manifest><item id="a" href="gone.html" media-type="application/xhtml+xml"/><item id="b" href="../escape.html" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/><itemref idref="nothing"/></spine></package>',
          },
          { name: "../escape.html", content: "<p>Outside the book.</p>" },
        ]),
        /lists no chapters that are in the file/,
      ],
      [
        "garbage-package.epub",
        await buildZip([MIMETYPE, container("book.opf"), { name: "book.opf", content: Buffer.alloc(4000, 0x07) }]),
        /lists no chapters/,
      ],
    ];
    for (const [name, content, message] of broken) {
      const book = await add(name, content);
      const refused = await app.api<Refusal>("GET", `/api/documents/${book.id}/epub`);
      expect(refused.status, name).toBe(415);
      expect(refused.body.error.message, name).toMatch(message);
      expect(refused.body.error.details, name).toEqual({ reason: "damaged" });
      expect((await app.api("GET", `/api/documents/${book.id}/epub/chapters/1`)).status, name).toBe(415);
    }
  });

  it("reads a book whose table of contents is broken or points nowhere, from its reading order", async () => {
    const book = await add(
      "bad-toc.epub",
      await buildZip([
        MIMETYPE,
        container("book.opf"),
        {
          name: "book.opf",
          content:
            '<package><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="a" href="a.html" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="a"/></spine></package>',
        },
        {
          name: "toc.ncx",
          content:
            '<ncx><navMap><navPoint><navLabel><text>Elsewhere</text></navLabel><content src="../../etc/passwd"/></navPoint><navPoint><navLabel><text>On the web</text></navLabel><content src="https://example.org/a.html"/></navPoint><navPoint><content src="a.html"/></navPoint>',
        },
        { name: "a.html", content: "<h1>Only chapter</h1><p>Words.</p>" },
      ]),
    );
    const { status, body } = await summaryOf(book.id);
    expect(status).toBe(200);
    // Lines that lead out of the book open nothing; a line with no words is not a line.
    expect(body.contents).toEqual([
      { title: "Elsewhere", chapter: null, depth: 0 },
      { title: "On the web", chapter: null, depth: 0 },
    ]);
    expect(body.chapters).toEqual([{ position: 1, title: "Only chapter", heading: "Only chapter" }]);
  });
});

describe("the pieces", () => {
  it("writes ids the web app will accept, the same way from every chapter", () => {
    expect(anchorId("the.door")).toBe("the_door");
    expect(anchorId("sec:1.2 (a)")).toBe("sec_1_2__a_");
    expect(anchorId("Füße-3_b")).toBe("Füße-3_b");
    expect(anchorId("  ")).toBe("");
    expect(anchorId("x".repeat(500))).toHaveLength(200);
  });

  it("decodes a chapter by its byte-order mark, its declaration, or as UTF-8", () => {
    expect(decodeMarkup(Buffer.from("\uFEFF<p>é</p>", "utf8"))).toBe("<p>é</p>");
    expect(decodeMarkup(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("<p>é</p>", "utf16le")]))).toBe("<p>é</p>");
    expect(decodeMarkup(Buffer.from('<?xml version="1.0" encoding="windows-1252"?><p>\u0093</p>', "latin1"))).toContain("“");
    expect(decodeMarkup(Buffer.from('<?xml version="1.0" encoding="no-such-encoding"?><p>é</p>', "utf8"))).toContain("é");
  });

  it("reads formatting no test book above uses", () => {
    const lookups = { link: () => null, picture: () => null };
    const blocks = (body: string): MarkdownBlock[] => chapterBlocks(`<html><body>${body}</body></html>`, lookups).blocks;
    const text = (v: string) => ({ t: "text", v });
    // An element of no kind HTML knows is read for its words, whatever it is called.
    expect(blocks("<p>The <constructor>builder</constructor> runs first.</p>")).toEqual([
      { t: "paragraph", c: [text("The builder runs first.")] },
    ]);
    expect(blocks("<p>He said <q>go</q>, <del>stay</del>, <code>x = 1</code>, 10<sup>3</sup>.</p>")).toEqual([
      {
        t: "paragraph",
        c: [
          text("He said “go”, "),
          { t: "del", c: [text("stay")] },
          text(", "),
          { t: "code", v: "x = 1" },
          text(", 10"),
          { t: "sup", c: [text("3")] },
          text("."),
        ],
      },
    ]);
    // The reading written above a character follows it in brackets.
    expect(blocks("<p><ruby>山<rp>(</rp><rt>yama</rt><rp>)</rp></ruby></p>")).toEqual([{ t: "paragraph", c: [text("山 (yama)")] }]);
    // A heading built from blocks keeps its words apart.
    expect(blocks("<h2><div>Part one</div><div>The climb</div></h2>")).toEqual([
      { t: "heading", depth: 2, c: [text("Part one The climb")] },
    ]);
    // A note written as a section, and a table used only to lay a page out.
    expect(blocks('<section role="doc-endnote" id="e1"><p>An endnote.</p></section>')).toEqual([
      { t: "quote", kind: "note", c: [{ t: "paragraph", c: [{ t: "anchor", id: "e1" }, text("An endnote.")] }] },
    ]);
    expect(blocks("<table><tr><td><p>First.</p><p>Second.</p></td></tr></table>")).toEqual([
      { t: "paragraph", c: [text("First.")] },
      { t: "paragraph", c: [text("Second.")] },
    ]);
    // A cell holding blocks: one after another on lines of their own.
    expect(blocks("<table><tr><th>A</th><th>B</th></tr><tr><td><p>one</p><ul><li>two</li></ul></td><td>three</td></tr></table>")).toEqual([
      {
        t: "table",
        rows: [
          [[text("A")], [text("B")]],
          [[text("one"), { t: "break" }, text("• two")], [text("three")]],
        ],
      },
    ]);
    // A place with nothing to hold it gets a paragraph of its own, which shows nothing.
    expect(blocks('<hr id="break"/><p>After.</p>')).toEqual([
      { t: "paragraph", c: [{ t: "anchor", id: "break" }] },
      { t: "rule" },
      { t: "paragraph", c: [text("After.")] },
    ]);
    // Past sixteen levels of quotation the rest is plain words.
    const nested = blocks(`${"<blockquote>".repeat(20)}<p>deep <b>down</b></p>`);
    let depth = 0;
    let at: MarkdownBlock | undefined = nested[0];
    while (at?.t === "quote") {
      depth += 1;
      at = at.c[0];
    }
    expect(depth).toBe(16);
    expect(at).toEqual({ t: "paragraph", c: [text("deep down")] });
  });
});

import fs from "node:fs";
import path from "node:path";
import type { MarkdownBlock, MarkdownInline } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { validateCatalog } from "../src/cli/validate-catalog.ts";
import { manifestJsonSchema, parseManifest } from "../src/modules/catalog/manifest.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.ctx.jobs.whenIdle();
  await app?.close();
  app = undefined;
});

type Json = Record<string, unknown>;

const CHAPTERS: Record<string, string> = {
  "00-overview.md":
    "# Why this guide\n\nThe squelch knob is the first thing to learn. Then read [the menus](outpost:entry/test.guide/menus).\n",
  "01-menus.md": [
    "# Every menu explained",
    "",
    "Menu 7 sets the repeater shift. Theory is in [Decibels](outpost:entry/test.handbook/decibels#the-three-db-rule).",
    "",
    "## Tone squelch",
    "",
    "CTCSS 71.9 Hz opens the repeater. Back to [the overview](outpost:entry/test.guide/overview).",
    "",
  ].join("\n"),
  "02-reference.md": "# Quick reference\n\nCalling frequency 145.500 MHz.\n",
};

const HANDBOOK: Record<string, string> = {
  "04-decibels.md": "# Decibels\n\nA logarithmic unit.\n\n## The three dB rule\n\nThree decibels is double the power.\n",
};

function bookEntry(extra: Json = {}, source: Json = {}, book: Json = {}): Json {
  return {
    id: "test.guide",
    name: "Pocket radio companion guide",
    description: "A guide to a pocket radio.",
    category: "radio",
    publisher: "LogBook73",
    language: "en",
    format: "markdown",
    license: "MIT",
    licenseNote: "Written for tests.",
    attribution: "Copyright (c) a test",
    lastVerified: "2026-08-17",
    source: {
      type: "bundled",
      version: "2026-11-01",
      book: {
        folder: "guides/pocket",
        sections: [
          {
            title: "Introduction",
            chapters: [{ key: "overview", number: "00", title: "Why this guide", summary: "What it is for.", file: "00-overview.md" }],
          },
          {
            title: "Menus and controls",
            chapters: [
              { key: "menus", number: "01", title: "Every menu explained", summary: "All of them.", file: "01-menus.md" },
              { key: "reference", number: "02", title: "Quick reference", file: "02-reference.md" },
            ],
          },
        ],
        ...book,
      },
      ...source,
    },
    ...extra,
  };
}

const handbookEntry = (): Json =>
  bookEntry(
    { id: "test.handbook", name: "Test handbook" },
    {},
    {
      folder: "handbook",
      sections: [{ title: "Foundations", chapters: [{ key: "decibels", number: "04", title: "Decibels", file: "04-decibels.md" }] }],
    },
  );

const manifestOf = (entries: Json[]): Json => ({
  schemaVersion: 1,
  id: "test-books",
  name: "Books",
  description: "Test",
  maintainers: ["Tests"],
  downloadHosts: [],
  entries,
});

function ship(target: TestApp, entries: Json[], folders: Record<string, Record<string, string>> = { "guides/pocket": CHAPTERS }): void {
  const catalogDir = path.join(target.dir, "catalog");
  fs.mkdirSync(path.join(catalogDir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(catalogDir, "manifests", "books.json"), JSON.stringify(manifestOf(entries)));
  for (const [folder, files] of Object.entries(folders)) {
    const dir = path.join(catalogDir, "bundled", folder);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  }
  target.ctx.services.catalog.reload();
}

const entryOf = async (target: TestApp, id = "test.guide") =>
  (await target.api("GET", "/api/catalog")).body.entries.find((entry: { id: string }) => entry.id === id);

async function add(target: TestApp, id = "test.guide") {
  const response = await target.api("POST", `/api/catalog/entries/${id}/add`, {});
  await target.ctx.jobs.whenIdle();
  return response;
}

const contentsOf = async (target: TestApp, collectionId: string) =>
  (await target.api("GET", `/api/collections/${collectionId}/chapters`)).body;

interface ChapterRef {
  key: string;
  documentId: string;
}
/** The document behind each chapter of the test books, by chapter key. */
const chapterIds = (contents: { sections: Array<{ chapters: ChapterRef[] }> }) =>
  Object.fromEntries(
    contents.sections.flatMap((section) => section.chapters.map((chapter) => [chapter.key, chapter.documentId])),
  ) as Record<"overview" | "menus" | "reference" | "decibels", string>;

/** Every inline run of a tree of blocks, wherever it sits. */
function runsOf(blocks: MarkdownBlock[]): MarkdownInline[] {
  const inlines = (runs: MarkdownInline[]): MarkdownInline[] => runs.flatMap((run) => ("c" in run ? [run, ...inlines(run.c)] : [run]));
  return blocks.flatMap((block) => {
    switch (block.t) {
      case "heading":
      case "paragraph":
        return inlines(block.c);
      case "quote":
        return runsOf(block.c);
      case "list":
        return block.items.flatMap((item) => runsOf(item.c));
      case "table":
        return block.rows.flatMap((row) => row.flatMap(inlines));
      default:
        return [];
    }
  });
}

describe("a manifest entry that is a book", () => {
  it("is a folder of chapters in named sections, and is either that or one file", () => {
    const parsed = (entry: Json) => parseManifest(JSON.stringify(manifestOf([entry])));
    expect(parsed(bookEntry()).manifest?.entries).toHaveLength(1);

    const both = parsed(bookEntry({}, { file: "radio/bands.md" }));
    expect(both.problem).toMatch(/either one "file" or a "book" of chapters, and not both/);
    const { book: _book, ...neither } = (bookEntry().source ?? {}) as Json;
    expect(parsed(bookEntry({ source: neither })).problem).toMatch(/either one "file" or a "book"/);

    for (const book of [
      { folder: "../outside" },
      { folder: "Guides/Pocket" },
      { sections: [] },
      { sections: [{ title: "Empty", chapters: [] }] },
      { sections: [{ title: "Bad key", chapters: [{ key: "Has Spaces", title: "x", file: "x.md" }] }] },
      { sections: [{ title: "Bad file", chapters: [{ key: "x", title: "x", file: "../x.md" }] }] },
      { sections: [{ title: "Not Markdown", chapters: [{ key: "x", title: "x", file: "x.pdf" }] }] },
      { sections: [{ title: "Extra", chapters: [{ key: "x", title: "x", file: "x.md", url: "https://example.org/x.md" }] }] },
    ]) {
      expect(parsed(bookEntry({}, {}, book)).problem, JSON.stringify(book)).toMatch(/does not follow the format/);
    }

    // The published schema states the same rule: three kinds of source, and a bundled one names a file or a book.
    const source = JSON.parse(manifestJsonSchema()).properties.entries.items.properties.source;
    expect(source.oneOf).toHaveLength(3);
    const bundled = source.oneOf.find((option: { properties: { type: { const: string } } }) => option.properties.type.const === "bundled");
    expect(bundled.oneOf).toEqual([{ required: ["file"] }, { required: ["book"] }]);
    expect(Object.keys(bundled.properties.book.properties)).toEqual(["folder", "sections"]);
  });

  it("is skipped, with the reason, when a chapter is missing, two chapters share a name, or it is not Markdown", async () => {
    app = await createTestApp();
    const twice = { key: "overview", title: "Again", file: "02-reference.md" };
    const sameFile = { key: "again", title: "Again", file: "00-overview.md" };
    const first = { key: "overview", title: "Why this guide", file: "00-overview.md" };
    ship(app, [
      bookEntry(),
      bookEntry(
        { id: "test.missing", name: "Missing" },
        {},
        { sections: [{ title: "One", chapters: [{ key: "gone", title: "Gone", file: "99-gone.md" }] }] },
      ),
      bookEntry({ id: "test.keys", name: "Keys" }, {}, { sections: [{ title: "One", chapters: [first, twice] }] }),
      bookEntry({ id: "test.files", name: "Files" }, {}, { sections: [{ title: "One", chapters: [first, sameFile] }] }),
      bookEntry({ id: "test.pdf", name: "Pdf", format: "pdf" }),
    ]);
    const catalog = (await app.api("GET", "/api/catalog")).body;
    expect(catalog.entries.map((entry: { id: string }) => entry.id)).toEqual(["test.guide"]);
    const problems = Object.fromEntries(
      catalog.problems.map((problem: { entryId: string; message: string }) => [problem.entryId, problem.message]),
    );
    expect(problems["test.missing"]).toMatch(/"guides\/pocket\/99-gone\.md" is not in the bundled folder/);
    expect(problems["test.keys"]).toMatch(/Two chapters of the book have the key "overview"/);
    expect(problems["test.files"]).toMatch(/Two chapters of the book have the file "00-overview\.md"/);
    expect(problems["test.pdf"]).toMatch(/made of Markdown chapters, but the format is given as "pdf"/);
  });

  it("is listed with its size and number of chapters, and without its list of chapters", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const entry = await entryOf(app);
    const bytes = Object.values(CHAPTERS).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
    expect(entry).toMatchObject({
      status: "not_installed",
      availability: "available",
      sizeBytes: bytes,
      sizeIsEstimate: false,
      chapterCount: 3,
    });
    expect(entry.source).toEqual({ type: "bundled", version: "2026-11-01" });
    expect(JSON.stringify(entry)).not.toContain("00-overview.md");
  });

  it("is checked by the validator: every chapter is listed, readable and opens with its title", () => {
    const dir = fs.mkdtempSync(path.join(import.meta.dirname, "../node_modules/.catalog-books-"));
    try {
      fs.mkdirSync(path.join(dir, "manifests"));
      fs.mkdirSync(path.join(dir, "bundled", "guides", "pocket"), { recursive: true });
      for (const [name, text] of Object.entries(CHAPTERS)) fs.writeFileSync(path.join(dir, "bundled", "guides", "pocket", name), text);
      fs.writeFileSync(path.join(dir, "manifests", "books.json"), JSON.stringify(manifestOf([bookEntry()])));
      expect(validateCatalog(dir, { checkSchemaFile: false }).problems).toEqual([]);

      fs.writeFileSync(path.join(dir, "bundled", "guides", "pocket", "02-reference.md"), "No title here.\n");
      fs.writeFileSync(path.join(dir, "bundled", "guides", "pocket", "03-stray.md"), "# Nobody lists me\n");
      const problems = validateCatalog(dir, { checkSchemaFile: false }).problems.join("\n");
      expect(problems).toMatch(/\(test\.guide\): guides\/pocket\/02-reference\.md should open with its title/);
      expect(problems).toMatch(/bundled\/guides\/pocket\/03-stray\.md is not listed by any manifest/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("adding a book that ships with Outpost", () => {
  it("copies its chapters into one folder and records each as a document, in reading order", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const added = await add(app);
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ chapterCount: 3, replacedCollectionId: null });
    expect(added.body.documentId).toBeUndefined();

    const collection = (await app.api("GET", `/api/collections/${added.body.collectionId}`)).body.collection;
    expect(collection).toMatchObject({
      kind: "file",
      status: "installed",
      title: "Pocket radio companion guide",
      relPath: "collections/books/test.guide",
      version: "2026-11-01",
      license: "MIT",
      publisher: "LogBook73",
    });
    expect(collection.meta).toMatchObject({ format: "markdown", bundled: true, book: { chapters: 3 }, licenseNote: "Written for tests." });
    expect(collection.sha256).toMatch(/^[0-9a-f]{64}$/);

    const contents = await contentsOf(app, added.body.collectionId);
    expect(contents.total).toBe(3);
    expect(contents.sections).toMatchObject([
      { title: "Introduction", chapters: [{ key: "overview", number: "00", title: "Why this guide", summary: "What it is for." }] },
      {
        title: "Menus and controls",
        chapters: [
          { key: "menus", number: "01", title: "Every menu explained", summary: "All of them." },
          { key: "reference", number: "02", title: "Quick reference", summary: null },
        ],
      },
    ]);

    // Each chapter is a document whose file lies in the book's folder, exactly as shipped.
    const location = app.ctx.services.storage.getDefault();
    const ids = chapterIds(contents);
    const menus = (await app.api("GET", `/api/documents/${ids.menus}`)).body;
    expect(menus.document).toMatchObject({
      title: "Every menu explained",
      type: "markdown",
      relPath: "collections/books/test.guide/01-menus.md",
      category: "Radio communications",
      author: "LogBook73",
      description: "All of them.",
      language: "en",
      extraction: "done",
      book: { collectionId: added.body.collectionId, title: "Pocket radio companion guide", number: "01" },
    });
    expect(fs.readFileSync(path.join(location.path, menus.document.relPath), "utf8")).toBe(CHAPTERS["01-menus.md"]);
    expect(fs.readFileSync(path.join(app.dir, "catalog", "bundled", "guides", "pocket", "01-menus.md"), "utf8")).toBe(
      CHAPTERS["01-menus.md"],
    );

    // A chapter knows its place: what comes before and after, and how to get back to the contents.
    expect(menus.chapter).toEqual({
      collectionId: added.body.collectionId,
      bookTitle: "Pocket radio companion guide",
      key: "menus",
      number: "01",
      section: "Menus and controls",
      position: 2,
      total: 3,
      previous: { documentId: ids.overview, title: "Why this guide", number: "00" },
      next: { documentId: ids.reference, title: "Quick reference", number: "02" },
    });
    expect((await app.api("GET", `/api/documents/${ids.overview}`)).body.chapter).toMatchObject({ previous: null, position: 1 });
    expect((await app.api("GET", `/api/documents/${ids.reference}`)).body.chapter).toMatchObject({ next: null, position: 3 });

    expect(await entryOf(app)).toMatchObject({
      status: "installed",
      collectionId: added.body.collectionId,
      installedVersion: "2026-11-01",
    });
    expect(app.ctx.services.downloads.list()).toEqual([]);
  });

  it("keeps the chapters out of the library list and its counts, and findable by search and by name", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const own = path.join(app.dir, "kit.md");
    fs.writeFileSync(own, "# Kit list\n\nStove, gas, lighter.\n");
    await app.ctx.services.documents.ingestFile({ sourcePath: own, originalName: "kit.md", category: "Radio communications" });
    const added = await add(app);
    const ids = chapterIds(await contentsOf(app, added.body.collectionId));

    // The library lists the person's own document; the book is one thing, under collections.
    const listed = (await app.api("GET", "/api/documents")).body;
    expect(listed.total).toBe(1);
    expect(listed.documents.map((document: { title: string }) => document.title)).toEqual(["Kit list"]);
    expect((await app.api("GET", "/api/documents?category=Radio%20communications")).body.total).toBe(1);
    const facets = (await app.api("GET", "/api/documents/facets")).body;
    expect(facets).toMatchObject({
      total: 1,
      types: [{ type: "markdown", count: 1 }],
      categories: [{ name: "Radio communications", count: 1 }],
    });
    expect((await app.api("GET", "/api/documents?chapters=true")).body.total).toBe(4);

    // Typing part of a chapter's name finds it, and says which book it is from.
    const named = (await app.api("GET", "/api/documents?q=menu")).body;
    expect(named.documents).toMatchObject([{ id: ids.menus, book: { title: "Pocket radio companion guide", number: "01" } }]);
    expect((await app.api("GET", "/api/documents?q=menu&chapters=false")).body.total).toBe(0);

    // Search lands on the chapter, not on the book as a whole.
    for (const [q, chapter] of [
      ["repeater shift", ids.menus],
      ["71.9", ids.menus],
      ["145.500", ids.reference],
      ["squelch knob", ids.overview],
    ] as const) {
      const found = (await app.api("GET", `/api/search?q=${encodeURIComponent(q)}&kinds=document`)).body;
      expect(found.results[0], q).toMatchObject({ entityId: chapter, url: `/library/documents/${chapter}` });
    }
    const hit = (await app.api("GET", "/api/search?q=71.9&kinds=document")).body.results[0];
    expect(hit.subtitle).toBe("Pocket radio companion guide, chapter 01");
  });

  it("refuses a second copy, and replaces the book with a newer edition when asked", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const first = (await add(app)).body;
    const again = await add(app);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already in your library \(version 2026-11-01\)/);

    const edited = {
      ...CHAPTERS,
      "02-reference.md": "# Quick reference\n\nCalling frequency 145.500 MHz. Corrected in the second edition.\n",
    };
    ship(app, [bookEntry({}, { version: "2027-02-01" })], { "guides/pocket": edited });
    expect(await entryOf(app)).toMatchObject({
      status: "installed",
      updateAvailable: true,
      version: "2027-02-01",
      installedVersion: "2026-11-01",
    });

    const second = await add(app);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ chapterCount: 3, replacedCollectionId: first.collectionId });
    expect((await app.api("GET", "/api/collections")).body.collections).toHaveLength(1);
    expect((await app.api("GET", "/api/documents?chapters=true")).body.total).toBe(3);
    expect((await app.api("GET", `/api/collections/${first.collectionId}/chapters`)).status).toBe(404);

    // The old folder went with the old edition; the new one is beside where it was.
    const location = app.ctx.services.storage.getDefault();
    expect(fs.existsSync(path.join(location.path, "collections/books/test.guide"))).toBe(false);
    expect(fs.readdirSync(path.join(location.path, "collections/books/test.guide_2027-02-01")).sort()).toEqual(Object.keys(CHAPTERS));
    const ids = chapterIds(await contentsOf(app, second.body.collectionId));
    expect((await app.api("GET", "/api/search?q=corrected&kinds=document")).body.results[0]).toMatchObject({ entityId: ids.reference });
    expect(await entryOf(app)).toMatchObject({ status: "installed", updateAvailable: false, installedVersion: "2027-02-01" });
  });

  it("leaves nothing behind when a chapter cannot be added", async () => {
    app = await createTestApp();
    // A file that claims to be Markdown and is not text is refused by the library.
    ship(app, [bookEntry()], { "guides/pocket": { ...CHAPTERS, "02-reference.md": "\u0000\u0001\u0002 not text" } });
    const failed = await add(app);
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect((await app.api("GET", "/api/collections")).body.collections).toEqual([]);
    expect((await app.api("GET", "/api/documents?chapters=true")).body.total).toBe(0);
    expect(fs.existsSync(path.join(app.ctx.services.storage.getDefault().path, "collections/books/test.guide"))).toBe(false);
    expect(await entryOf(app)).toMatchObject({ status: "not_installed" });
  });
});

describe("a book in the library", () => {
  it("goes with its chapters and its folder when removed with its files", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const added = (await add(app)).body;
    const folder = path.join(app.ctx.services.storage.getDefault().path, "collections/books/test.guide");
    expect((await app.api("DELETE", `/api/collections/${added.collectionId}`, { deleteFiles: true })).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(fs.existsSync(folder)).toBe(false);
    expect((await app.api("GET", "/api/documents?chapters=true")).body.total).toBe(0);
    expect((await app.api("GET", "/api/search?q=squelch&kinds=document")).body.total).toBe(0);
    expect(await entryOf(app)).toMatchObject({ status: "not_installed" });
    // And it can be added again.
    expect((await add(app)).status).toBe(200);
  });

  it("leaves its chapters as ordinary documents when only Outpost's record of it is removed", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const added = (await add(app)).body;
    const folder = path.join(app.ctx.services.storage.getDefault().path, "collections/books/test.guide");
    expect((await app.api("DELETE", `/api/collections/${added.collectionId}`, { deleteFiles: false })).status).toBe(200);
    expect(fs.readdirSync(folder).sort()).toEqual(Object.keys(CHAPTERS));
    const listed = (await app.api("GET", "/api/documents")).body;
    expect(listed.total).toBe(3);
    expect(listed.documents.every((document: { book: unknown }) => document.book === null)).toBe(true);
    // Search stops describing them as chapters of a book that is no longer there.
    const target = app;
    await waitFor(
      async () => (await target.api("GET", "/api/search?q=71.9&kinds=document")).body.results[0]?.subtitle === "LogBook73",
      "search to describe the chapter as an ordinary document",
    );
  });

  it("is forgotten when its last chapter is deleted, and says how many it has left before that", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const added = (await add(app)).body;
    const target = app;
    const ids = chapterIds(await contentsOf(app, added.collectionId));
    const folder = path.join(app.ctx.services.storage.getDefault().path, "collections/books/test.guide");

    expect((await app.api("DELETE", `/api/documents/${ids.reference}`)).status).toBe(200);
    await waitFor(
      async () => (await target.api("GET", `/api/collections/${added.collectionId}`)).body.collection?.meta.book.chapters === 2,
      "the book to notice it has lost a chapter",
    );
    const collection = (await app.api("GET", `/api/collections/${added.collectionId}`)).body.collection;
    // The checksum covered the chapter that has gone; the next check records a new one instead of crying damage.
    expect(collection).toMatchObject({ sha256: null, status: "installed" });
    expect(fs.readdirSync(folder).sort()).toEqual(["00-overview.md", "01-menus.md"]);
    expect((await app.api("GET", `/api/documents/${ids.menus}`)).body.chapter).toMatchObject({ next: null, total: 2 });

    for (const id of [ids.overview, ids.menus]) expect((await app.api("DELETE", `/api/documents/${id}`)).status).toBe(200);
    await waitFor(async () => (await entryOf(target)).status === "not_installed", "the catalogue to notice the book has gone");
    expect((await app.api("GET", "/api/collections")).body.collections).toEqual([]);
    // The empty folder goes just after the record does.
    await waitFor(() => !fs.existsSync(folder), "the book's empty folder to be removed");
  });

  it("can be checked, and moves to another location with its chapters", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const added = (await add(app)).body;
    const target = app;
    const finished = (jobId: string) =>
      waitFor(() => {
        const job = target.ctx.jobs.get(jobId)!;
        return ["succeeded", "failed", "cancelled"].includes(job.state) ? job : undefined;
      }, "the job to finish");

    const check = await finished((await app.api("POST", `/api/collections/${added.collectionId}/verify`, {})).body.job.id);
    expect(check.result).toMatchObject({ outcome: "ok" });

    const usb = await app.ctx.services.storage.add({ name: "USB drive", path: path.join(app.dir, "storage", "usb"), kind: "external" });
    const original = app.ctx.services.storage.getDefault();
    const move = await finished((await app.api("POST", `/api/collections/${added.collectionId}/move`, { locationId: usb.id })).body.job.id);
    expect(move).toMatchObject({ state: "succeeded", result: { originalRemoved: true } });
    await app.ctx.jobs.whenIdle();

    expect(fs.existsSync(path.join(original.path, "collections/books/test.guide"))).toBe(false);
    expect(fs.readdirSync(path.join(usb.path, "collections/books/test.guide")).sort()).toEqual(Object.keys(CHAPTERS));
    const ids = chapterIds(await contentsOf(app, added.collectionId));
    for (const id of Object.values(ids)) {
      const { document } = (await app.api("GET", `/api/documents/${id}`)).body;
      expect(document).toMatchObject({ locationId: usb.id, locationAvailable: true });
      expect((await app.api("GET", `/api/documents/${id}/markdown`)).status).toBe(200);
    }
    expect((await app.api("GET", "/api/search?q=71.9&kinds=document")).body.results[0]).toMatchObject({ entityId: ids.menus });
    expect((await app.api("GET", `/api/collections/${added.collectionId}`)).body.collection).toMatchObject({
      locationId: usb.id,
      status: "installed",
    });
  });

  it("follows its chapters when every document is moved to another location", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const added = (await add(app)).body;
    const target = app;
    const usb = await app.ctx.services.storage.add({ name: "USB drive", path: path.join(app.dir, "storage", "usb"), kind: "external" });
    expect((await app.api("POST", "/api/documents/move", { locationId: usb.id })).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    await waitFor(
      async () => (await target.api("GET", `/api/collections/${added.collectionId}`)).body.collection.locationId === usb.id,
      "the book to follow its chapters",
    );
    const collection = (await app.api("GET", `/api/collections/${added.collectionId}`)).body.collection;
    expect(collection).toMatchObject({ status: "installed", relPath: "collections/books/test.guide" });
    expect(fs.readdirSync(path.join(usb.path, "collections/books/test.guide")).sort()).toEqual(Object.keys(CHAPTERS));
    expect((await contentsOf(app, added.collectionId)).total).toBe(3);
  });
});

describe("links between chapters", () => {
  it("lead to the chapter's document when its book is in the library, and to Explore when it is not", async () => {
    app = await createTestApp();
    ship(app, [bookEntry(), handbookEntry()], { "guides/pocket": CHAPTERS, handbook: HANDBOOK });
    const guide = (await add(app)).body;
    const ids = chapterIds(await contentsOf(app, guide.collectionId));
    const refs = async (documentId: string) =>
      runsOf((await target.api("GET", `/api/documents/${documentId}/markdown`)).body.blocks).filter((run) => run.t === "ref");
    const target = app;

    // Within the book: straight to the other chapter.
    expect(await refs(ids.overview)).toEqual([
      {
        t: "ref",
        entryId: "test.guide",
        entryName: "Pocket radio companion guide",
        collectionId: guide.collectionId,
        documentId: ids.menus,
        c: [{ t: "text", v: "the menus" }],
      },
    ]);

    // To a book that has not been added: the words, and which catalogue entry it is in. No document, no heading.
    const before = await refs(ids.menus);
    expect(before[0]).toEqual({ t: "ref", entryId: "test.handbook", entryName: "Test handbook", c: [{ t: "text", v: "Decibels" }] });
    expect(before[1]).toMatchObject({ entryId: "test.guide", documentId: ids.overview });

    // Once the handbook is added, the same file links to its chapter and the heading in it.
    const handbook = (await add(app, "test.handbook")).body;
    const decibels = chapterIds(await contentsOf(app, handbook.collectionId)).decibels;
    expect((await refs(ids.menus))[0]).toEqual({
      t: "ref",
      entryId: "test.handbook",
      entryName: "Test handbook",
      collectionId: handbook.collectionId,
      documentId: decibels,
      anchor: "the-three-db-rule",
      c: [{ t: "text", v: "Decibels" }],
    });
    const target2 = (await app.api("GET", `/api/documents/${decibels}/markdown`)).body.blocks;
    expect(target2).toContainEqual({ t: "heading", depth: 2, id: "the-three-db-rule", c: [{ t: "text", v: "The three dB rule" }] });
  });

  it("are the same for a file a person uploads, and never leave Outpost", async () => {
    app = await createTestApp();
    ship(app, [bookEntry()]);
    const guide = (await add(app)).body;
    const own = path.join(app.dir, "notes.md");
    fs.writeFileSync(
      own,
      [
        "# My notes",
        "",
        "[book](outpost:entry/test.guide) [chapter](outpost:entry/test.guide/menus) [no such chapter](outpost:entry/test.guide/nowhere)",
        "[no such entry](outpost:entry/not.in.catalogue/menus) [up](outpost:entry/../../api/system) [query](outpost:entry/test.guide?x=1)",
        "[host](outpost://evil.example/test.guide) [upper](outpost:entry/Test.Guide/menus) [deep](outpost:entry/test.guide/menus/extra)",
        "",
      ].join("\n"),
    );
    const { document } = await app.ctx.services.documents.ingestFile({ sourcePath: own, originalName: "notes.md" });
    await app.ctx.jobs.whenIdle();
    const { blocks } = (await app.api("GET", `/api/documents/${document.id}/markdown`)).body;
    const refs = runsOf(blocks).filter((run) => run.t === "ref");
    const ids = chapterIds(await contentsOf(app, guide.collectionId));
    expect(refs).toMatchObject([
      { entryId: "test.guide", collectionId: guide.collectionId, c: [{ v: "book" }] },
      { entryId: "test.guide", collectionId: guide.collectionId, documentId: ids.menus, c: [{ v: "chapter" }] },
      // The book is here but has no such chapter: the link falls back to the book.
      { entryId: "test.guide", collectionId: guide.collectionId, c: [{ v: "no such chapter" }] },
    ]);
    expect(refs[0]).not.toHaveProperty("documentId");
    expect(refs[2]).not.toHaveProperty("documentId");
    // Everything else is words. Nothing the file wrote as an address is sent to the browser.
    const flat = JSON.stringify(blocks);
    for (const word of ["no such entry", "up", "query", "host", "upper", "deep"]) expect(flat).toContain(word);
    expect(flat).not.toMatch(/outpost:|not\.in\.catalogue|\.\.\/|evil\.example|x=1|Test\.Guide|extra"/);
  });
});

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateCatalog } from "../src/cli/validate-catalog.ts";
import { loadCatalog, manifestJsonSchema, parseManifest } from "../src/modules/catalog/manifest.ts";
import { resolveEntries } from "../src/modules/catalog/resolve.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const repoCatalogDir = path.resolve(import.meta.dirname, "../../../catalog");

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const SHEET_V1 = [
  "# Amateur bands",
  "",
  "The FM calling frequency is 145.500 MHz.",
  "",
  "## Channels",
  "",
  "| Channel | Frequency |",
  "| --- | --- |",
  "| 1 | 446.00625 MHz |",
  "| 2 | 446.01875 MHz |",
  "",
].join("\n");
const SHEET_V2 = SHEET_V1.replace("145.500 MHz.", "145.500 MHz. Corrected in the second edition.");

type Json = Record<string, unknown>;

function sheetEntry(extra: Json = {}, source: Json = {}): Json {
  return {
    id: "test.radio.bands",
    name: "Amateur bands",
    description: "A reference sheet.",
    category: "radio",
    publisher: "Outpost",
    language: "en",
    format: "markdown",
    license: "MIT",
    attribution: "Compiled for tests",
    homepage: "https://example.org/bands",
    lastVerified: "2026-11-15",
    source: { type: "bundled", file: "radio/bands.md", version: "2026-11-15", ...source },
    ...extra,
  };
}

const manifestOf = (entries: Json[]): Json => ({
  schemaVersion: 1,
  id: "test-included",
  name: "Included",
  description: "Test",
  maintainers: ["Tests"],
  downloadHosts: [],
  entries,
});

/** Writes a manifest and its bundled file where the server ships its own, and has the server read them. */
function ship(target: TestApp, entries: Json[], files: Record<string, string> = { "radio/bands.md": SHEET_V1 }): void {
  const catalogDir = path.join(target.dir, "catalog");
  fs.mkdirSync(path.join(catalogDir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(catalogDir, "manifests", "included.json"), JSON.stringify(manifestOf(entries)));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(catalogDir, "bundled", name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  target.ctx.services.catalog.reload();
}

const entryOf = async (target: TestApp, id = "test.radio.bands") =>
  (await target.api("GET", "/api/catalog")).body.entries.find((entry: { id: string }) => entry.id === id);

async function add(target: TestApp, id = "test.radio.bands") {
  const response = await target.api("POST", `/api/catalog/entries/${id}/add`, {});
  await target.ctx.jobs.whenIdle();
  return response;
}

describe("entries that ship with Outpost", () => {
  it("are listed as available with their measured size, without anything being asked of the network", async () => {
    app = await createTestApp();
    ship(app, [sheetEntry()]);
    const entry = await entryOf(app);
    expect(entry).toMatchObject({
      status: "not_installed",
      availability: "available",
      sizeBytes: Buffer.byteLength(SHEET_V1),
      sizeIsEstimate: false,
      version: "2026-11-15",
      publishedAt: null,
      updateAvailable: false,
    });
    expect(entry.source).toEqual({ type: "bundled", file: "radio/bands.md", version: "2026-11-15" });
    // Nothing about where the file is on this machine leaves the server.
    expect(JSON.stringify(entry)).not.toContain(app.dir);
    expect((await app.api("GET", "/api/catalog")).body.problems).toEqual([]);
    expect(app.ctx.services.catalog.allowedHosts()).toEqual([]);
  });

  it("are added to the document library with one request: copied, searchable, and recorded as installed", async () => {
    app = await createTestApp();
    ship(app, [sheetEntry()]);
    const added = await add(app);
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ replacedCollectionId: null });
    expect(added.body.collectionId).toBeTruthy();
    expect(added.body.documentId).toBeTruthy();

    const documents = (await app.api("GET", "/api/documents")).body;
    expect(documents.total).toBe(1);
    expect(documents.documents[0]).toMatchObject({
      id: added.body.documentId,
      title: "Amateur bands",
      type: "markdown",
      category: "Radio communications",
      author: "Outpost",
      source: "https://example.org/bands",
      language: "en",
      extraction: "done",
    });

    // The frequencies and channel tables in the sheet are what a person searches for.
    for (const q of ["145.500", "446.00625", "calling frequency"]) {
      const found = (await app.api("GET", `/api/search?q=${encodeURIComponent(q)}&kinds=document`)).body;
      expect(found.results[0], q).toMatchObject({ entityId: added.body.documentId });
    }
    const text = (await app.api("GET", `/api/documents/${added.body.documentId}/text`)).body;
    expect(text.sections.map((section: { heading?: string }) => section.heading)).toEqual(["Amateur bands", "Channels"]);
    expect(text.sections[1].text).toBe("Channel | Frequency\n1 | 446.00625 MHz\n2 | 446.01875 MHz");

    const entry = await entryOf(app);
    expect(entry).toMatchObject({
      status: "installed",
      collectionId: added.body.collectionId,
      documentId: added.body.documentId,
      installedVersion: "2026-11-15",
      updateAvailable: false,
    });
    const collection = (await app.api("GET", `/api/collections/${added.body.collectionId}`)).body.collection;
    expect(collection).toMatchObject({ kind: "file", status: "installed", license: "MIT", relPath: documents.documents[0].relPath });
    expect(collection.meta).toMatchObject({ format: "markdown", bundled: true, documentId: added.body.documentId });

    // A copy went to the library; the file that ships with Outpost is where it was.
    expect(fs.readFileSync(path.join(app.dir, "catalog", "bundled", "radio", "bands.md"), "utf8")).toBe(SHEET_V1);
    const location = app.ctx.services.storage.get(documents.documents[0].locationId);
    expect(fs.readFileSync(path.join(location.path, documents.documents[0].relPath), "utf8")).toBe(SHEET_V1);
    expect(app.ctx.services.downloads.list()).toEqual([]);
  });

  it("refuse a second copy, and refuse to be downloaded", async () => {
    app = await createTestApp();
    ship(app, [sheetEntry()]);
    expect((await add(app)).status).toBe(200);
    const again = await add(app);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already in your library \(version 2026-11-15\)/);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(1);

    const download = await app.api("POST", "/api/catalog/entries/test.radio.bands/download", {});
    expect(download.status).toBe(400);
    expect(download.body.error.message).toMatch(/included with Outpost.*Add it to the library instead/);
    expect((await app.api("POST", "/api/catalog/entries/no.such.entry/add", {})).status).toBe(404);
  });

  it("offer a corrected edition from a later release as an update, and replace the old one when asked", async () => {
    app = await createTestApp();
    ship(app, [sheetEntry()]);
    const first = (await add(app)).body;

    ship(app, [sheetEntry({}, { version: "2027-02-01" })], { "radio/bands.md": SHEET_V2 });
    expect(await entryOf(app)).toMatchObject({
      status: "installed",
      version: "2027-02-01",
      installedVersion: "2026-11-15",
      updateAvailable: true,
    });

    const second = await add(app);
    expect(second.status).toBe(200);
    expect(second.body.replacedCollectionId).toBe(first.collectionId);
    const target = app;
    await waitFor(async () => (await target.api("GET", "/api/documents")).body.total === 1, "the old edition to go");
    const documents = (await app.api("GET", "/api/documents")).body.documents;
    expect(documents[0].id).toBe(second.body.documentId);
    expect(documents[0].id).not.toBe(first.documentId);
    expect((await app.api("GET", "/api/search?q=corrected&kinds=document")).body.results[0]).toMatchObject({
      entityId: second.body.documentId,
    });
    expect(await entryOf(app)).toMatchObject({ status: "installed", installedVersion: "2027-02-01", updateAvailable: false });
    expect((await app.api("GET", "/api/collections")).body.collections).toHaveLength(1);
  });

  it("are forgotten by the catalogue when the document is deleted, and can be added again", async () => {
    app = await createTestApp();
    ship(app, [sheetEntry()]);
    const first = (await add(app)).body;
    expect((await app.api("DELETE", `/api/documents/${first.documentId}`)).status).toBe(200);
    const target = app;
    await waitFor(async () => (await entryOf(target)).status === "not_installed", "the catalogue to notice");
    expect((await add(app)).status).toBe(200);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(1);
  });

  it("stay as they are through a catalogue refresh, which asks nobody about them", async () => {
    app = await createTestApp();
    ship(app, [sheetEntry()]);
    const refreshed = await app.api("POST", "/api/catalog/refresh", {});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({ checked: 1, available: 1, unavailable: [], unchecked: [] });
    expect(await entryOf(app)).toMatchObject({ availability: "available", sizeBytes: Buffer.byteLength(SHEET_V1), version: "2026-11-15" });

    // No HTTP client is needed at all to resolve them.
    const { entries } = loadCatalog([path.join(app.dir, "catalog", "manifests")]);
    const results = await resolveEntries(undefined as never, entries, { allowedHosts: [] });
    expect(results.get("test.radio.bands")).toEqual({
      state: "available",
      resolved: { availability: "available", version: "2026-11-15", publishedAt: undefined },
    });
  });

  it("can also come from a person's own manifest folder, with its files beside it", async () => {
    app = await createTestApp();
    const own = path.join(app.dir, "data", "catalog");
    fs.mkdirSync(path.join(own, "bundled"), { recursive: true });
    fs.writeFileSync(path.join(own, "mine.json"), JSON.stringify(manifestOf([sheetEntry({}, { file: "plan.md" })])));
    fs.writeFileSync(path.join(own, "bundled", "plan.md"), "# Our radio plan\n\nChannel 3 at noon.\n");
    app.ctx.services.catalog.reload();
    expect((await add(app)).status).toBe(200);
    expect((await app.api("GET", "/api/search?q=noon&kinds=document")).body.total).toBe(1);
  });
});

describe("manifests that bundle files", () => {
  it("skip an entry whose file is missing, empty, of the wrong kind, or outside the bundled folder", async () => {
    app = await createTestApp();
    fs.writeFileSync(path.join(app.dir, "secret.md"), "# Not for bundling\n");
    ship(
      app,
      [
        sheetEntry(),
        sheetEntry({ id: "test.missing", name: "Missing" }, { file: "radio/missing.md" }),
        sheetEntry({ id: "test.empty", name: "Empty" }, { file: "radio/empty.md" }),
        sheetEntry({ id: "test.kind", name: "Wrong kind", format: "pdf" }),
        sheetEntry({ id: "test.type", name: "Unsupported" }, { file: "radio/notes.txt" }),
        sheetEntry({ id: "test.link", name: "Linked out" }, { file: "radio/link.md" }),
      ],
      { "radio/bands.md": SHEET_V1, "radio/empty.md": "", "radio/notes.txt": "notes" },
    );
    fs.symlinkSync(path.join(app.dir, "secret.md"), path.join(app.dir, "catalog", "bundled", "radio", "link.md"));
    app.ctx.services.catalog.reload();

    const catalog = (await app.api("GET", "/api/catalog")).body;
    expect(catalog.entries.map((entry: { id: string }) => entry.id)).toEqual(["test.radio.bands"]);
    const problems = Object.fromEntries(
      catalog.problems.map((problem: { entryId: string; message: string }) => [problem.entryId, problem.message]),
    );
    expect(problems["test.missing"]).toMatch(/"radio\/missing\.md" is not in the bundled folder/);
    expect(problems["test.empty"]).toMatch(/is empty/);
    expect(problems["test.kind"]).toMatch(/is a markdown file, but the format is given as "pdf"/);
    expect(problems["test.type"]).toMatch(/must be Markdown, PDF, EPUB or HTML/);
    expect(problems["test.link"]).toMatch(/leads outside the bundled folder/);
    expect(JSON.stringify(catalog.problems)).not.toContain(app.dir);
  });

  it("only accept a plain path inside the bundled folder", () => {
    const withFile = (file: string) => parseManifest(JSON.stringify(manifestOf([sheetEntry({}, { file })])));
    expect(withFile("radio/uk-amateur-bands.md").manifest?.entries).toHaveLength(1);
    for (const file of ["../secret.md", "/etc/passwd", "radio/../../x.md", "radio//x.md", "Radio/X.md", "radio\\x.md", ""]) {
      expect(withFile(file).problem, file).toMatch(/does not follow the format/);
    }
    // No address, checksum or other field of a download belongs on a bundled source.
    expect(parseManifest(JSON.stringify(manifestOf([sheetEntry({}, { url: "https://example.org/x.md" })]))).problem).toMatch(
      /does not follow the format/,
    );
    expect(JSON.parse(manifestJsonSchema()).properties.entries.items.properties.source.oneOf).toHaveLength(3);
  });

  it("are checked by the validator: every bundled file is listed, carries a version, and is readable text with a title", () => {
    const dir = fs.mkdtempSync(path.join(import.meta.dirname, "../node_modules/.catalog-bundled-"));
    try {
      fs.mkdirSync(path.join(dir, "manifests"));
      fs.mkdirSync(path.join(dir, "bundled", "radio"), { recursive: true });
      fs.writeFileSync(path.join(dir, "bundled", "radio", "bands.md"), SHEET_V1);
      fs.writeFileSync(path.join(dir, "manifests", "included.json"), JSON.stringify(manifestOf([sheetEntry()])));
      expect(validateCatalog(dir, { checkSchemaFile: false }).problems).toEqual([]);

      fs.writeFileSync(path.join(dir, "bundled", "radio", "stray.md"), "# Nobody lists me\n");
      fs.writeFileSync(path.join(dir, "bundled", "radio", "untitled.md"), "No heading here.\n");
      fs.writeFileSync(path.join(dir, "bundled", "radio", "binary.md"), Buffer.from([0x23, 0x20, 0x41, 0x00, 0xff]));
      const { version: _version, ...unversioned } = (sheetEntry().source ?? {}) as Json;
      fs.writeFileSync(
        path.join(dir, "manifests", "included.json"),
        JSON.stringify(
          manifestOf([
            sheetEntry({}, undefined),
            sheetEntry({ id: "test.unversioned", name: "Unversioned", source: unversioned }),
            sheetEntry({ id: "test.untitled", name: "Untitled" }, { file: "radio/untitled.md" }),
            sheetEntry({ id: "test.binary", name: "Binary" }, { file: "radio/binary.md" }),
          ]),
        ),
      );
      const problems = validateCatalog(dir, { checkSchemaFile: false }).problems.join("\n");
      expect(problems).toMatch(/bundled\/radio\/stray\.md is not listed by any manifest/);
      expect(problems).toMatch(/\(test\.unversioned\): a bundled entry needs a "version"/);
      expect(problems).toMatch(/\(test\.untitled\): radio\/untitled\.md should open with its title/);
      expect(problems).toMatch(/\(test\.binary\): radio\/binary\.md is not UTF-8 text/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the reference sheets shipped with Outpost", () => {
  const catalog = loadCatalog([path.join(repoCatalogDir, "manifests")]);
  // Single files; the books that ship with Outpost have tests of their own (catalog-books.test.ts).
  const sheets = catalog.entries.filter((entry) => entry.source.type === "bundled" && entry.source.file);

  it("are all listed, in the radio category, with a version and an honest note", () => {
    expect(sheets.length).toBeGreaterThanOrEqual(8);
    for (const sheet of sheets) {
      expect(catalog.bundled.get(sheet.id)?.sizeBytes, sheet.id).toBeGreaterThan(2000);
      expect(sheet.source.type === "bundled" && sheet.source.version, sheet.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sheet.licenseNote, sheet.id).toMatch(/not an official document and not legal advice/);
    }
    expect(sheets.filter((sheet) => sheet.category === "radio")).toHaveLength(
      sheets.filter((sheet) => sheet.id.startsWith("outpost.radio.")).length,
    );
  });

  it("each state the law, the date checked, their sources with addresses, and what they leave out", () => {
    for (const sheet of sheets.filter((item) => item.id.startsWith("outpost.radio."))) {
      const text = fs.readFileSync(catalog.bundled.get(sheet.id)!.path, "utf8");
      const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
      expect(text, sheet.id).toMatch(/^# \S/);
      expect(
        headings.some((heading) => /^(The law in brief|Read this first)$/.test(heading ?? "")),
        sheet.id,
      ).toBe(true);
      expect(headings.slice(-3), sheet.id).toEqual(["Checked", "Sources", "Not covered"]);
      const [, checked = "", sources = "", notCovered = ""] = text.split(/^## (?:Checked|Sources|Not covered)$/m);
      expect(checked, sheet.id).toMatch(/\d{1,2} \w+ 20\d\d/);
      expect((sources.match(/https:\/\/\S+/g) ?? []).length, sheet.id).toBeGreaterThanOrEqual(3);
      expect(notCovered.trim().split("\n").length, sheet.id).toBeGreaterThanOrEqual(3);
      expect(text, sheet.id).toMatch(/not legal advice/);
      // Tables must be real Markdown tables: a header row followed by a separator row.
      expect(text, sheet.id).toMatch(/^\|.+\|\n\| --- \|/m);
      // Addresses are written out, because the library shows the text without link targets.
      expect(text, sheet.id).not.toMatch(/\]\(https?:/);
    }
  });
});

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPdf } from "./fixtures/documents/builders.ts";
import { type FileServer, startFileServer, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
let server: FileServer | undefined;
afterEach(async () => {
  await app?.close();
  await server?.close();
  app = undefined;
  server = undefined;
});

async function setup() {
  app = await createTestApp();
  server = await startFileServer();
  const pdf = buildPdf(
    [
      ["Home canning", "Process pint jars for 40 minutes."],
      ["Altitude", "Add five minutes above 1,000 feet."],
    ],
    { title: "Canning guide" },
  );
  server.routes.set("/guides/canning.pdf", { body: pdf });
  const dir = path.join(app.dir, "catalog", "manifests");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "publications.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "test-publications",
      name: "Publications",
      description: "Test",
      maintainers: ["Tests"],
      downloadHosts: ["127.0.0.1"],
      entries: [
        {
          id: "usda.canning",
          name: "Complete Guide to Home Canning",
          description: "Research-tested canning instructions.",
          category: "food",
          publisher: "USDA",
          language: "en",
          format: "pdf",
          license: "Public domain (US Government work)",
          attribution: "United States Department of Agriculture",
          homepage: "https://example.org/canning",
          lastVerified: "2026-11-15",
          source: {
            type: "http",
            url: server.url("/guides/canning.pdf"),
            sha256: createHash("sha256").update(pdf).digest("hex"),
            sizeBytes: pdf.length,
            version: "2015",
          },
        },
      ],
    }),
  );
  app.ctx.services.catalog.reload();
  return { app, pdf };
}

async function download(target: TestApp) {
  const started = await target.api("POST", "/api/catalog/entries/usda.canning/download", {});
  expect(started.status).toBe(200);
  await waitFor(() => target.ctx.services.downloads.get(started.body.download.id)?.state === "completed", "the download");
  // The document is added, and its text read, after the download reports completion.
  await waitFor(async () => (await target.api("GET", "/api/documents")).body.total === 1, "the document to appear");
  await target.ctx.jobs.whenIdle();
  return started.body.download.id as string;
}

const entryOf = async (target: TestApp) =>
  (await target.api("GET", "/api/catalog")).body.entries.find((entry: { id: string }) => entry.id === "usda.canning");

/** A second entry whose address has no file name in it, as some publishers' repositories serve a book. */
function shipNameless(target: TestApp, files: FileServer, pdf: Buffer): void {
  files.routes.set("/bitstreams/4541/content", { body: pdf });
  const file = path.join(target.dir, "catalog", "manifests", "publications.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.entries.push({
    ...manifest.entries[0],
    id: "fao.garden",
    name: "A Vegetable Garden: for All?",
    source: {
      type: "http",
      url: files.url("/bitstreams/4541/content"),
      sha256: createHash("sha256").update(pdf).digest("hex"),
      sizeBytes: pdf.length,
      version: "5th edition (2014)",
    },
  });
  fs.writeFileSync(file, JSON.stringify(manifest));
  target.ctx.services.catalog.reload();
}

describe("books and papers from the catalogue", () => {
  it("names a file that came from an address with no file name after its title, so it can be read", async () => {
    const { app } = await setup();
    const pdf = buildPdf([["Beds", "Dig the bed twice as deep as the spade."]], { title: "Garden" });
    shipNameless(app, server!, pdf);

    const started = await app.api("POST", "/api/catalog/entries/fao.garden/download", {});
    expect(started.status).toBe(200);
    await waitFor(async () => (await app.api("GET", "/api/documents")).body.total === 1, "the document to appear");
    await app.ctx.jobs.whenIdle();

    const document = (await app.api("GET", "/api/documents")).body.documents[0];
    // Named after its title and edition, without the punctuation a file name cannot hold; the entry's format gives the extension.
    expect(document).toMatchObject({
      title: "A Vegetable Garden: for All?",
      type: "pdf",
      originalName: "A Vegetable Garden for All, 5th edition (2014).pdf",
      extraction: "done",
    });
    const entry = (await app.api("GET", "/api/catalog")).body.entries.find((each: { id: string }) => each.id === "fao.garden");
    expect(entry).toMatchObject({ status: "installed", documentId: document.id });
    const collection = (await app.api("GET", `/api/collections/${entry.collectionId}`)).body.collection;
    expect(collection).toMatchObject({ locationId: document.locationId, relPath: document.relPath });
    expect((await app.api("GET", "/api/search?q=spade&kinds=document")).body.results[0]).toMatchObject({ entityId: document.id });
  });

  it("hands over, at the next start, a catalogue document an earlier version left out of the library", async () => {
    const { app: first } = await setup();
    const pdf = buildPdf([["Beds", "Dig the bed twice as deep as the spade."]], { title: "Garden" });
    // As it was left: the file under its nameless name, a collection record, and no document.
    const location = first.ctx.services.storage.getDefault();
    const relPath = "collections/files/content_5th edition (2014)";
    fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
    fs.writeFileSync(path.join(location.path, relPath), pdf);
    const left = await first.ctx.services.collections.create({
      kind: "file",
      title: "A Vegetable Garden for All",
      locationId: location.id,
      relPath,
      catalogEntryId: "fao.garden",
      publisher: "FAO",
      // No edition recorded: the file keeps the name it has, and the catalogue's title is kept over the PDF's own ("Garden").
      meta: { format: "pdf", homepage: "https://example.org/garden" },
    });
    // And one that is not a document at all: it is left exactly as it is.
    fs.writeFileSync(path.join(location.path, "collections/files/notes.bin"), "not a document");
    const other = await first.ctx.services.collections.create({
      kind: "file",
      title: "Something else",
      locationId: location.id,
      relPath: "collections/files/notes.bin",
      meta: { format: "other" },
    });
    // Stop the server without removing its folder.
    await first.app.close();

    app = await createTestApp({}, first.dir);
    const second = app;
    // The document is made first and then told who published it.
    await waitFor(async () => (await second.api("GET", "/api/documents")).body.documents[0]?.author === "FAO", "the document to appear");
    await second.ctx.jobs.whenIdle();
    const document = (await second.api("GET", "/api/documents")).body.documents[0];
    expect(document).toMatchObject({
      title: "A Vegetable Garden for All",
      type: "pdf",
      originalName: "content_5th edition (2014).pdf",
      author: "FAO",
    });
    const collection = (await second.api("GET", `/api/collections/${left.id}`)).body.collection;
    expect(collection).toMatchObject({ status: "installed", relPath: document.relPath });
    expect(collection.meta.documentId).toBe(document.id);
    expect(fs.existsSync(path.join(location.path, document.relPath))).toBe(true);
    expect(fs.existsSync(path.join(location.path, relPath))).toBe(false);
    expect((await second.api("GET", `/api/collections/${other.id}`)).body.collection).toMatchObject({
      relPath: "collections/files/notes.bin",
    });
    expect(fs.readFileSync(path.join(location.path, "collections/files/notes.bin"), "utf8")).toBe("not a document");
  });

  it("arrive in the document library: searchable by page, with their source recorded", async () => {
    const { app } = await setup();
    await download(app);

    const document = (await app.api("GET", "/api/documents")).body.documents[0];
    expect(document).toMatchObject({
      title: "Complete Guide to Home Canning",
      type: "pdf",
      category: "Food preservation and cooking",
      author: "USDA",
      source: "https://example.org/canning",
      language: "en",
      pageCount: 2,
      extraction: "done",
    });
    const search = (await app.api("GET", "/api/search?q=altitude&kinds=document")).body;
    expect(search.results[0]).toMatchObject({ entityId: document.id, url: `/library/documents/${document.id}?page=2` });

    // One file on disk, known to both records.
    const entry = await entryOf(app);
    expect(entry.status).toBe("installed");
    const collection = (await app.api("GET", `/api/collections/${entry.collectionId}`)).body.collection;
    expect(collection).toMatchObject({ kind: "file", status: "installed", locationId: document.locationId, relPath: document.relPath });
    expect(collection.meta.documentId).toBe(document.id);
    const location = app.ctx.services.storage.get(document.locationId);
    expect(fs.existsSync(path.join(location.path, document.relPath))).toBe(true);
    expect(fs.existsSync(path.join(location.path, "collections", "files", "canning.pdf"))).toBe(false);
  });

  it("forgets the catalogue item when the document is deleted from the library", async () => {
    const { app } = await setup();
    await download(app);
    const document = (await app.api("GET", "/api/documents")).body.documents[0];
    expect((await app.api("DELETE", `/api/documents/${document.id}`)).status).toBe(200);
    await waitFor(async () => (await entryOf(app)).status === "not_installed", "the catalogue to notice");
    expect((await app.api("GET", "/api/collections")).body.collections).toEqual([]);
  });

  it("removes the document when the catalogue item is removed with its files", async () => {
    const { app } = await setup();
    await download(app);
    const entry = await entryOf(app);
    const document = (await app.api("GET", "/api/documents")).body.documents[0];
    const file = path.join(app.ctx.services.storage.get(document.locationId).path, document.relPath);
    expect((await app.api("DELETE", `/api/collections/${entry.collectionId}?deleteFiles=true`)).status).toBe(200);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
    expect((await app.api("GET", "/api/search?q=altitude")).body.total).toBe(0);
  });

  it("follows the document when documents are moved to another location", async () => {
    const { app } = await setup();
    await download(app);
    const ssd = (
      await app.api("POST", "/api/storage/locations", { name: "Field SSD", path: path.join(app.dir, "storage", "ssd"), kind: "external" })
    ).body.location;
    await app.api("POST", "/api/documents/move", { locationId: ssd.id });
    await app.ctx.jobs.whenIdle();
    const entry = await entryOf(app);
    await waitFor(
      async () => (await app.api("GET", `/api/collections/${entry.collectionId}`)).body.collection.locationId === ssd.id,
      "the collection to follow",
    );
    expect((await entryOf(app)).status).toBe("installed");
  });

  it("takes the document along when the catalogue item itself is moved", async () => {
    const { app } = await setup();
    await download(app);
    const ssd = (
      await app.api("POST", "/api/storage/locations", { name: "Field SSD", path: path.join(app.dir, "storage", "ssd"), kind: "external" })
    ).body.location;
    const entry = await entryOf(app);
    expect((await app.api("POST", `/api/collections/${entry.collectionId}/move`, { locationId: ssd.id })).status).toBe(200);
    await app.ctx.jobs.whenIdle();

    // One file, two records: both must name the new place, and the file must open from it.
    const collection = (await app.api("GET", `/api/collections/${entry.collectionId}`)).body.collection;
    const document = (await app.api("GET", `/api/documents/${entry.documentId}`)).body.document;
    expect(collection).toMatchObject({ locationId: ssd.id, status: "installed" });
    expect(document).toMatchObject({ locationId: ssd.id, relPath: collection.relPath });
    expect((await app.api("GET", `/api/documents/${entry.documentId}/file`)).status).toBe(200);
    // The reconcile that follows a document change must leave it there.
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", `/api/collections/${entry.collectionId}`)).body.collection.locationId).toBe(ssd.id);
    expect((await entryOf(app)).status).toBe("installed");
  });
});

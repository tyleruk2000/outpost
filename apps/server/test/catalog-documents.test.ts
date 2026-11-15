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
  const pdf = buildPdf([["Home canning", "Process pint jars for 40 minutes."], ["Altitude", "Add five minutes above 1,000 feet."]], { title: "Canning guide" });
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
          source: { type: "http", url: server.url("/guides/canning.pdf"), sha256: createHash("sha256").update(pdf).digest("hex"), sizeBytes: pdf.length, version: "2015" },
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

const entryOf = async (target: TestApp) => (await target.api("GET", "/api/catalog")).body.entries.find((entry: { id: string }) => entry.id === "usda.canning");

describe("books and papers from the catalogue", () => {
  it("arrive in the document library: searchable by page, with their source recorded", async () => {
    const { app } = await setup();
    await download(app);

    const document = (await app.api("GET", "/api/documents")).body.documents[0];
    expect(document).toMatchObject({ title: "Complete Guide to Home Canning", type: "pdf", category: "Food preservation and cooking", author: "USDA", source: "https://example.org/canning", language: "en", pageCount: 2, extraction: "done" });
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
    const ssd = (await app.api("POST", "/api/storage/locations", { name: "Field SSD", path: path.join(app.dir, "storage", "ssd"), kind: "external" })).body.location;
    await app.api("POST", "/api/documents/move", { locationId: ssd.id });
    await app.ctx.jobs.whenIdle();
    const entry = await entryOf(app);
    await waitFor(async () => (await app.api("GET", `/api/collections/${entry.collectionId}`)).body.collection.locationId === ssd.id, "the collection to follow");
    expect((await entryOf(app)).status).toBe("installed");
  });
});

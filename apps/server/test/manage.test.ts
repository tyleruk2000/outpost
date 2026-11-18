/**
 * Managing and cleaning up, against a real server with real files on temporary
 * directories: the inventory, removing and moving a selection, leftovers, and each of the
 * three clean-ups, with a location that is not connected, a catalogue item that is also
 * a document, a download in flight, and the rule about where "erase everything" may be
 * asked from.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CleanupPlan, CleanupResult, Leftover, ManagedItem, UsageResponse } from "@outpost/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/core/errors.ts";
import { isLocalRequest, isLoopbackAddress } from "../src/core/local.ts";
import { readBaseline } from "../src/modules/merge/fingerprint.ts";
import { buildPdf, multipart } from "./fixtures/documents/builders.ts";
import { type FileServer, startFileServer, testBytes, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

let app: TestApp | undefined;
let server: FileServer | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  await server?.close();
  app = undefined;
  server = undefined;
});

interface World {
  app: TestApp;
  server: FileServer;
  internal: string;
  usbPath: string;
  usbId: string;
  /** A catalogue PDF: one file, a collection and a document. */
  sheet: { collectionId: string; documentId: string; file: string };
  /** A file fetched by a download with no catalogue entry. */
  manual: { collectionId: string; file: string };
  /** A document the person added themselves. */
  own: { documentId: string; file: string };
  /** An archive of the person's own, outside the folders Outpost makes. */
  imported: { collectionId: string; file: string };
  /** Downloaded content on the external drive. */
  onUsb: { collectionId: string; file: string };
}

/** A library with one of everything this screen has to tell apart. */
async function world(env: Record<string, string> = {}): Promise<World> {
  app = await createTestApp(env);
  server = await startFileServer();
  const { storage, collections, documents, downloads, catalog } = app.ctx.services;
  const internal = storage.getDefault();

  const pdf = buildPdf([["Home canning", "Process pint jars for 40 minutes."]], { title: "Canning guide" });
  server.routes.set("/guides/canning.pdf", { body: pdf });
  const manifests = path.join(app.dir, "catalog", "manifests");
  fs.mkdirSync(manifests, { recursive: true });
  fs.writeFileSync(
    path.join(manifests, "publications.json"),
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
          lastVerified: "2026-11-15",
          source: { type: "http", url: server.url("/guides/canning.pdf"), sha256: sha256(pdf), sizeBytes: pdf.length, version: "2015" },
        },
      ],
    }),
  );
  catalog.reload();
  const started = await app.api("POST", "/api/catalog/entries/usda.canning/download", {});
  expect(started.status).toBe(200);
  await waitFor(() => downloads.get(started.body.download.id)?.state === "completed", "the catalogue download");
  await waitFor(async () => (await app!.api("GET", "/api/documents")).body.total === 1, "the catalogue document");
  const sheetDocument = (await app.api("GET", "/api/documents")).body.documents[0];
  const sheetCollection = collections.list({ catalogEntryId: "usda.canning" })[0]!;

  const manualBytes = testBytes(40_000, 3);
  server.routes.set("/manual.bin", { body: manualBytes });
  const manualDownload = await downloads.start({
    kind: "file",
    title: "Field manual",
    url: server.url("/manual.bin"),
    relPath: "collections/files/manual.bin",
    allowedHosts: [server.host],
    sha256: sha256(manualBytes),
  });
  await waitFor(() => downloads.get(manualDownload.id)?.state === "completed", "the plain download");
  const manualCollection = downloads.get(manualDownload.id)!.collectionId!;

  const source = path.join(app.dir, "my notes.txt");
  fs.writeFileSync(source, "Water boils at a lower temperature at altitude.\n".repeat(40));
  const added = await documents.ingestFile({ sourcePath: source, originalName: "my notes.txt" });

  const importedFile = path.join(internal.path, "my-archives", "own.bin");
  fs.mkdirSync(path.dirname(importedFile), { recursive: true });
  fs.writeFileSync(importedFile, testBytes(12_000, 5));
  const imported = await collections.create({
    kind: "file",
    title: "My own archive",
    locationId: internal.id,
    relPath: "my-archives/own.bin",
  });

  const usbPath = path.join(app.dir, "storage", "usb");
  const usb = await storage.add({ name: "USB drive", path: usbPath, kind: "external" });
  const usbFile = path.join(usbPath, "collections", "files", "atlas.bin");
  fs.mkdirSync(path.dirname(usbFile), { recursive: true });
  fs.writeFileSync(usbFile, testBytes(30_000, 7));
  const onUsb = await collections.create({
    kind: "file",
    title: "Road atlas",
    locationId: usb.id,
    relPath: "collections/files/atlas.bin",
    catalogEntryId: "test.atlas",
  });

  await app.ctx.jobs.whenIdle();
  return {
    app,
    server,
    internal: internal.path,
    usbPath,
    usbId: usb.id,
    sheet: { collectionId: sheetCollection.id, documentId: sheetDocument.id, file: path.join(internal.path, sheetDocument.relPath) },
    manual: { collectionId: manualCollection, file: path.join(internal.path, "collections/files/manual.bin") },
    own: { documentId: added.document.id, file: path.join(internal.path, added.document.relPath) },
    imported: { collectionId: imported.id, file: importedFile },
    onUsb: { collectionId: onUsb.id, file: usbFile },
  };
}

/** "Unplugs" the external drive: its folder is no longer under any storage root. */
async function unplug(w: World): Promise<string> {
  const away = path.join(w.app.dir, "unplugged");
  fs.renameSync(w.usbPath, away);
  await w.app.ctx.services.storage.refresh();
  return away;
}

async function items(target: TestApp): Promise<ManagedItem[]> {
  return (await target.api("GET", "/api/manage/items")).body.items;
}

/** Waits for the clean-up job to reach a final state and returns it. */
async function finished(target: TestApp, jobId: string) {
  return waitFor(
    () => {
      const job = target.ctx.jobs.get(jobId);
      return job && ["succeeded", "failed", "cancelled"].includes(job.state) ? job : undefined;
    },
    "the clean-up to finish",
    20_000,
  );
}

/** Makes the survey count now and waits for it. */
async function measured(target: TestApp): Promise<UsageResponse> {
  await target.api("POST", "/api/manage/measure", {});
  return waitFor(async () => {
    const usage = (await target.api<UsageResponse>("GET", "/api/manage/usage")).body;
    return usage.measuring || usage.measuredAt === null ? undefined : usage;
  }, "the count to finish");
}

/** Leftover files are only offered once they have sat for a while; make one look old. */
function age(file: string, ms = 60 * 60 * 1000): void {
  const then = new Date(Date.now() - ms);
  fs.utimesSync(file, then, then);
}

describe("everything installed", () => {
  it("lists a catalogue sheet once, with its document, and tells downloaded from the person's own", async () => {
    const w = await world();
    const list = await items(w.app);
    expect(list).toHaveLength(5);

    const sheet = list.find((item) => item.id === w.sheet.collectionId)!;
    expect(sheet).toMatchObject({
      key: `collection:${w.sheet.collectionId}`,
      kind: "sheet",
      origin: "downloaded",
      inOutpostFolder: true,
      state: "ok",
      href: `/library/documents/${w.sheet.documentId}`,
    });
    expect(sheet.documents).toEqual([{ id: w.sheet.documentId, title: "Complete Guide to Home Canning" }]);
    // The document is not listed a second time on its own.
    expect(list.some((item) => item.key === `document:${w.sheet.documentId}`)).toBe(false);

    expect(list.find((item) => item.id === w.manual.collectionId)).toMatchObject({ kind: "file", origin: "downloaded", sizeBytes: 40_000 });
    expect(list.find((item) => item.id === w.own.documentId)).toMatchObject({ kind: "document", origin: "own", type: "document" });
    expect(list.find((item) => item.id === w.imported.collectionId)).toMatchObject({ origin: "own", inOutpostFolder: false });
    expect(list.find((item) => item.id === w.onUsb.collectionId)).toMatchObject({ locationName: "USB drive", locationAvailable: true });
  });

  it("treats a catalogue item that holds several documents as one thing", async () => {
    const w = await world();
    const { documents, collections } = w.app.ctx.services;
    const second = path.join(w.app.dir, "chapter two.txt");
    fs.writeFileSync(second, "Chapter two: pressure canning.\n".repeat(30));
    const chapter = await documents.ingestFile({ sourcePath: second, originalName: "chapter two.txt" });
    const row = collections.get(w.sheet.collectionId)!;
    collections.update(row.id, { meta: { ...row.meta, documentIds: [w.sheet.documentId, chapter.document.id] } });

    const sheet = (await items(w.app)).find((item) => item.id === w.sheet.collectionId)!;
    expect(sheet.documents.map((document) => document.id).sort()).toEqual([w.sheet.documentId, chapter.document.id].sort());
    // The second document is a file of its own, so it adds to what the item takes.
    expect(sheet.sizeBytes).toBe(row.sizeBytes + chapter.document.sizeBytes);
    expect(sheet.href).toBe(`/library/collections/${row.id}`);

    const started = await w.app.api("POST", "/api/manage/remove", { keys: [sheet.key] });
    await finished(w.app, started.body.job.id);
    expect((await w.app.api("GET", `/api/documents/${chapter.document.id}`)).status).toBe(404);
    expect((await w.app.api("GET", `/api/documents/${w.sheet.documentId}`)).status).toBe(404);
    expect(collections.get(row.id)).toBeUndefined();
  });
});

describe("the map's own files", () => {
  it("lists a reference layer as a map layer, apart from the radio data", async () => {
    const w = await world();
    const { collections, storage } = w.app.ctx.services;
    const internal = storage.list().find((location) => location.isDefault)!;
    const write = (relPath: string) => {
      const file = path.join(w.internal, relPath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, testBytes(4_000, 9));
    };
    write("collections/reference/natural-earth/countries.geojson");
    write("collections/propagation/solar-cycle.json");
    const layer = await collections.create({
      kind: "dataset",
      title: "Country boundaries (Natural Earth 1:50m)",
      locationId: internal.id,
      relPath: "collections/reference/natural-earth/countries.geojson",
      meta: { reference: { provider: "natural-earth" } } as never,
    });
    const radio = await collections.create({
      kind: "dataset",
      title: "Solar cycle prediction",
      locationId: internal.id,
      relPath: "collections/propagation/solar-cycle.json",
      meta: { dataset: "solar-cycle" } as never,
    });
    const listed = await items(w.app);
    expect(listed.find((item) => item.id === layer.id)?.kind).toBe("layer");
    expect(listed.find((item) => item.id === radio.id)?.kind).toBe("dataset");
    const usage = await measured(w.app);
    expect(usage.rows.find((row) => row.id === "layer")).toMatchObject({ count: 1, bytes: 4_000 });
  });
});

describe("a book", () => {
  it("is one item with its chapters inside it, and moves and goes as one", async () => {
    const w = await world();
    // A small book in the test catalogue: three chapters in one folder.
    const folder = path.join(w.app.dir, "catalog", "bundled", "guides", "pocket");
    fs.mkdirSync(folder, { recursive: true });
    const chapters = ["overview", "menus", "reference"].map((key, index) => {
      fs.writeFileSync(path.join(folder, `0${index}-${key}.md`), `# ${key}\n\n${`Chapter ${key} of the pocket guide. `.repeat(40)}\n`);
      return { key, number: `0${index}`, title: `The ${key}`, file: `0${index}-${key}.md` };
    });
    fs.writeFileSync(
      path.join(w.app.dir, "catalog", "manifests", "books.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "test-books",
        name: "Books",
        description: "Test",
        maintainers: ["Tests"],
        downloadHosts: [],
        entries: [
          {
            id: "test.guide",
            name: "Pocket radio companion guide",
            description: "A guide to a pocket radio.",
            category: "radio",
            publisher: "Tests",
            language: "en",
            format: "markdown",
            license: "MIT",
            attribution: "Copyright (c) a test",
            lastVerified: "2026-08-17",
            source: {
              type: "bundled",
              version: "2026-11-01",
              book: { folder: "guides/pocket", sections: [{ title: "All of it", chapters }] },
            },
          },
        ],
      }),
    );
    w.app.ctx.services.catalog.reload();
    const added = await w.app.api("POST", "/api/catalog/entries/test.guide/add", {});
    expect(added.status).toBe(200);
    await w.app.ctx.jobs.whenIdle();
    const { collectionId, chapterCount } = added.body as { collectionId: string; chapterCount: number };
    const row = w.app.ctx.services.collections.get(collectionId)!;

    const list = await items(w.app);
    const book = list.find((item) => item.id === collectionId)!;
    expect(book.documents).toHaveLength(chapterCount);
    // The chapters are files inside the book's folder: they add nothing to its size, and are not listed again.
    expect(book.sizeBytes).toBe(row.sizeBytes);
    for (const chapter of book.documents) expect(list.some((item) => item.key === `document:${chapter.id}`)).toBe(false);

    // Moved as a folder by one verified job; the chapters are not also moved one by one.
    const moved = await w.app.api("POST", "/api/manage/move", { keys: [book.key], locationId: w.usbId });
    expect(moved.body.jobs.map((job: { type: string }) => job.type)).toEqual(["collection.move"]);
    await w.app.ctx.jobs.whenIdle();
    const chapter = (await w.app.api("GET", `/api/documents/${book.documents[0]!.id}`)).body.document;
    expect(chapter.locationId).toBe(w.usbId);
    expect((await w.app.api("GET", `/api/documents/${chapter.id}/markdown`)).status).toBe(200);
    expect(fs.existsSync(path.join(w.usbPath, row.relPath))).toBe(true);

    const started = await w.app.api("POST", "/api/manage/remove", { keys: [book.key] });
    const job = await finished(w.app, started.body.job.id);
    expect((job.result as CleanupResult).failed).toEqual([]);
    expect(w.app.ctx.services.collections.get(collectionId)).toBeUndefined();
    expect((await w.app.api("GET", `/api/documents/${chapter.id}`)).status).toBe(404);
    expect(fs.existsSync(path.join(w.usbPath, row.relPath))).toBe(false);
    expect((await items(w.app)).some((item) => book.documents.some((document) => document.id === item.id))).toBe(false);
  });
});

describe("removing a selection", () => {
  it("says what the selection adds up to, then removes a catalogue sheet together with its document", async () => {
    const w = await world();
    const keys = [`collection:${w.sheet.collectionId}`, `document:${w.own.documentId}`];
    const plan = (await w.app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "items", keys })).body;
    expect(plan.remove.count).toBe(2);
    expect(plan.remove.bytes).toBe(fs.statSync(w.sheet.file).size + fs.statSync(w.own.file).size);
    expect(plan.linkedDocuments).toBe(1);
    expect(plan.own.count).toBe(1);
    expect(plan.byKind.map((bucket) => bucket.kind).sort()).toEqual(["document", "sheet"]);
    expect(plan.byLocation).toHaveLength(1);
    // Asking changes nothing.
    expect(fs.existsSync(w.sheet.file)).toBe(true);

    const started = await w.app.api("POST", "/api/manage/remove", { keys });
    expect(started.status).toBe(200);
    const job = await finished(w.app, started.body.job.id);
    expect(job.state).toBe("succeeded");
    const result = job.result as CleanupResult;
    expect(result.removed.count).toBe(2);
    expect(result.failed).toEqual([]);

    expect(fs.existsSync(w.sheet.file)).toBe(false);
    expect(fs.existsSync(w.own.file)).toBe(false);
    expect(w.app.ctx.services.collections.get(w.sheet.collectionId)).toBeUndefined();
    expect((await w.app.api("GET", "/api/documents")).body.total).toBe(0);
    // What was not chosen is untouched.
    expect(fs.existsSync(w.manual.file)).toBe(true);
    expect(fs.existsSync(w.imported.file)).toBe(true);
  });

  it("leaves what is on a disconnected location alone unless asked to forget it, and never deletes its file", async () => {
    const w = await world();
    const away = await unplug(w);
    const keys = [`collection:${w.onUsb.collectionId}`, `collection:${w.manual.collectionId}`];

    const plan = (await w.app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "items", keys })).body;
    expect(plan.remove.count).toBe(1);
    expect(plan.disconnected.count).toBe(1);
    expect(plan.disconnected.files[0]).toMatchObject({ title: "Road atlas", locationName: "USB drive" });

    const left = await finished(w.app, (await w.app.api("POST", "/api/manage/remove", { keys })).body.job.id);
    const first = left.result as CleanupResult;
    expect(first.removed.count).toBe(1);
    expect(first.left.count).toBe(1);
    expect(first.leftBehind[0]?.title).toBe("Road atlas");
    expect(w.app.ctx.services.collections.get(w.onUsb.collectionId)).toBeDefined();

    const forgot = await finished(
      w.app,
      (await w.app.api("POST", "/api/manage/remove", { keys: [`collection:${w.onUsb.collectionId}`], disconnected: "forget" })).body.job.id,
    );
    const second = forgot.result as CleanupResult;
    expect(second.forgotten.count).toBe(1);
    expect(second.removed.count).toBe(0);
    expect(second.leftBehind[0]?.path).toContain("atlas.bin");
    expect(w.app.ctx.services.collections.get(w.onUsb.collectionId)).toBeUndefined();
    expect(fs.existsSync(path.join(away, "collections/files/atlas.bin"))).toBe(true);
  });

  it("can remove only Outpost's records and keep the files", async () => {
    const w = await world();
    const keys = [`collection:${w.sheet.collectionId}`, `collection:${w.manual.collectionId}`];
    const job = await finished(w.app, (await w.app.api("POST", "/api/manage/remove", { keys, files: "keep" })).body.job.id);
    expect((job.result as CleanupResult).forgotten.count).toBe(2);
    expect(fs.existsSync(w.sheet.file)).toBe(true);
    expect(fs.existsSync(w.manual.file)).toBe(true);
    // Both records of the sheet went: the catalogue's note and the document.
    expect(w.app.ctx.services.collections.get(w.sheet.collectionId)).toBeUndefined();
    expect((await w.app.api("GET", `/api/documents/${w.sheet.documentId}`)).status).toBe(404);
  });

  it("refuses what is being moved or checked, and says so before and after", async () => {
    const w = await world();
    const { collections } = w.app.ctx.services;
    collections.update(w.manual.collectionId, { status: "moving" });
    // A job stands for the move, as it would while one is under way.
    w.app.ctx.jobs.enqueue(
      "collection.verify",
      { collectionId: w.manual.collectionId },
      { title: "Check", subject: `collection:${w.manual.collectionId}`, paused: true },
    );
    const keys = [`collection:${w.manual.collectionId}`, `document:${w.own.documentId}`];

    const plan = (await w.app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "items", keys })).body;
    expect(plan.refused).toHaveLength(1);
    expect(plan.refused[0]?.reason).toMatch(/being moved or checked/);
    expect(plan.remove.count).toBe(1);

    const job = await finished(w.app, (await w.app.api("POST", "/api/manage/remove", { keys })).body.job.id);
    const result = job.result as CleanupResult;
    expect(result.removed.count).toBe(1);
    expect(result.failed).toEqual([{ title: "Field manual", reason: expect.stringMatching(/being moved or checked/) }]);
    expect(fs.existsSync(w.manual.file)).toBe(true);

    // Only refused things chosen: nothing is started at all.
    const none = await w.app.api("POST", "/api/manage/remove", { keys: [`collection:${w.manual.collectionId}`] });
    expect(none.status).toBe(409);
  });

  it("when stopped, says what it had removed and what it had not reached", async () => {
    const w = await world();
    const { collections } = w.app.ctx.services;
    const keys = [`collection:${w.manual.collectionId}`, `collection:${w.imported.collectionId}`, `collection:${w.sheet.collectionId}`];
    const original = collections.remove.bind(collections);
    let jobId = "";
    let calls = 0;
    vi.spyOn(collections, "remove").mockImplementation(async (id, options) => {
      await original(id, options);
      calls += 1;
      // The person presses Stop while the first item is being removed.
      if (calls === 1) w.app.ctx.jobs.cancel(jobId);
    });
    const started = await w.app.api("POST", "/api/manage/remove", { keys });
    jobId = started.body.job.id;
    const job = await finished(w.app, jobId);
    expect(job.state).toBe("cancelled");
    const result = job.result as CleanupResult;
    expect(result.stopped).toBe(true);
    expect(result.removed.count).toBe(1);
    expect(result.notReached).toBe(2);
    expect((await items(w.app)).length).toBe(4);
  });

  it("refuses keys that are not items, and a second clean-up while one is waiting", async () => {
    const w = await world();
    expect((await w.app.api("POST", "/api/manage/remove", { keys: ["../../etc/passwd"] })).status).toBe(400);
    expect((await w.app.api("POST", "/api/manage/remove", { keys: [] })).status).toBe(400);
    expect((await w.app.api("POST", "/api/manage/remove", { keys: ["collection:nothing"] })).status).toBe(409);

    w.app.ctx.jobs.enqueue(
      "manage.derived",
      { steps: ["compact"] },
      { title: "Clear and rebuild search data", subject: "manage", paused: true },
    );
    const second = await w.app.api("POST", "/api/manage/remove", { keys: [`collection:${w.manual.collectionId}`] });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/still under way/);
  });
});

describe("moving a selection", () => {
  it("moves a catalogue sheet and a document with the verified move jobs, and keeps the sheet's two records in step", async () => {
    const w = await world();
    const keys = [`collection:${w.sheet.collectionId}`, `document:${w.own.documentId}`, `collection:${w.onUsb.collectionId}`];
    const moved = await w.app.api("POST", "/api/manage/move", { keys, locationId: w.usbId });
    expect(moved.status).toBe(200);
    // One job for the collection, one for the documents; what is already there is named.
    expect(moved.body.jobs.map((job: { type: string }) => job.type).sort()).toEqual(["collection.move", "documents.move"]);
    expect(moved.body.refused).toEqual([
      { key: `collection:${w.onUsb.collectionId}`, title: "Road atlas", reason: expect.stringMatching(/already on "USB drive"/) },
    ]);
    await w.app.ctx.jobs.whenIdle();

    const document = (await w.app.api("GET", `/api/documents/${w.sheet.documentId}`)).body.document;
    const collection = w.app.ctx.services.collections.get(w.sheet.collectionId)!;
    expect(document.locationId).toBe(w.usbId);
    expect(collection).toMatchObject({ locationId: w.usbId, relPath: document.relPath, status: "installed" });
    expect(fs.existsSync(path.join(w.usbPath, document.relPath))).toBe(true);
    expect(fs.existsSync(w.sheet.file)).toBe(false);

    const own = (await w.app.api("GET", `/api/documents/${w.own.documentId}`)).body.document;
    expect(own.locationId).toBe(w.usbId);
    expect(fs.existsSync(w.own.file)).toBe(false);
  });

  it("refuses the whole move when the target has no room, and a target that is not connected", async () => {
    const w = await world();
    const asked: number[] = [];
    vi.spyOn(w.app.ctx.services.storage, "assertSpace").mockImplementation(async (_locationId, bytes) => {
      asked.push(bytes);
      throw new AppError("insufficient_space", '"USB drive" does not have enough free space for this.');
    });
    const keys = [`collection:${w.manual.collectionId}`, `document:${w.own.documentId}`];
    const full = await w.app.api("POST", "/api/manage/move", { keys, locationId: w.usbId });
    expect(full.status).toBe(507);
    // Room was asked for everything chosen together, before any job was queued.
    expect(asked).toEqual([40_000 + fs.statSync(w.own.file).size]);
    expect(w.app.ctx.jobs.list({ states: ["queued", "running"] })).toEqual([]);
    expect(fs.existsSync(w.manual.file)).toBe(true);
    vi.restoreAllMocks();

    await unplug(w);
    const gone = await w.app.api("POST", "/api/manage/move", { keys: [`collection:${w.manual.collectionId}`], locationId: w.usbId });
    expect(gone.status).toBe(503);
  });
});

describe("what is taking the space", () => {
  it("gives records at once, measures the rest in the background, and says which is which", async () => {
    const w = await world();
    const first = (await w.app.api<UsageResponse>("GET", "/api/manage/usage")).body;
    const row = (usage: UsageResponse, id: string) => usage.rows.find((entry) => entry.id === id)!;
    expect(row(first, "sheet")).toMatchObject({ count: 1, basis: "records" });
    expect(row(first, "document")).toMatchObject({ count: 1, basis: "records" });
    expect(row(first, "file")).toMatchObject({ count: 3 });
    expect(row(first, "database").bytes).toBeGreaterThan(0);

    const usage = await measured(w.app);
    expect(usage.measuring).toBe(false);
    expect(row(usage, "extracted")).toMatchObject({ basis: "disk" });
    expect(row(usage, "extracted").bytes).toBeGreaterThan(0);
    expect(row(usage, "passages")).toMatchObject({ basis: "estimate", within: "database" });
    expect(row(usage, "passages").bytes).toBeGreaterThan(0);
    expect(row(usage, "untracked")).toMatchObject({ bytes: 0, count: 0 });

    const internal = usage.locations.find((location) => location.isDefault)!;
    // Measured on disk in Outpost's folders: the sheet, the manual and the person's document, not the archive beside them.
    expect(internal.measuredBytes).toBe(fs.statSync(w.sheet.file).size + 40_000 + fs.statSync(w.own.file).size);
    expect(internal.recorded.count).toBe(4);
    expect(internal.freeBytes).toBeGreaterThan(0);
    expect(usage.dataDir.measuredBytes).toBeGreaterThan(0);
  });

  it("shows a disconnected location as last known, and says it is disconnected", async () => {
    const w = await world();
    await measured(w.app);
    await unplug(w);
    const usage = await measured(w.app);
    const usb = usage.locations.find((location) => location.name === "USB drive")!;
    expect(usb.available).toBe(false);
    expect(usb.recorded).toEqual({ count: 1, bytes: 30_000 });
    expect(usb.measuredBytes).toBeNull();
    expect(usb.totalBytes).toBeGreaterThan(0);
    expect(usage.rows.find((entry) => entry.id === "file")!.disconnectedBytes).toBe(30_000);
  });

  it("does not count a download still under way as left over, as the list of leftovers does not", async () => {
    const w = await world();
    w.server.routes.set("/slow", { body: testBytes(900_000, 9), chunkBytes: 16_384, delayMs: 15 });
    const { downloads } = w.app.ctx.services;
    const started = await downloads.start({
      kind: "file",
      title: "Atlas on its way",
      url: w.server.url("/slow"),
      relPath: "collections/files/on-its-way.bin",
      allowedHosts: [w.server.host],
    });
    const part = path.join(w.internal, "collections/files/on-its-way.bin.part");
    await waitFor(() => fs.existsSync(part) && fs.statSync(part).size > 0, "part of the file to arrive");
    const usage = await measured(w.app);
    expect(downloads.get(started.id)?.state).toBe("running");
    expect(usage.rows.find((entry) => entry.id === "unfinished")).toMatchObject({ bytes: 0, count: 0 });
    const listed = (await w.app.api<{ items: Leftover[] }>("GET", "/api/manage/leftovers")).body.items;
    expect(listed.filter((item) => item.kind === "download")).toEqual([]);
    downloads.cancel(started.id);
    await w.app.ctx.jobs.whenIdle();
  });
});

describe("leftovers", () => {
  const leftovers = async (target: TestApp): Promise<Leftover[]> => {
    await measured(target);
    return (await target.api("GET", "/api/manage/leftovers")).body.items;
  };

  it("finds a file no record refers to inside Outpost's folders, and deletes it only when chosen", async () => {
    const w = await world();
    const stray = path.join(w.internal, "collections", "zim", "abandoned.zim");
    fs.mkdirSync(path.dirname(stray), { recursive: true });
    fs.writeFileSync(stray, testBytes(9_000, 11));
    age(stray);
    // Not Outpost's folder: never looked at, never offered.
    const beside = path.join(w.internal, "holiday-photos", "beach.jpg");
    fs.mkdirSync(path.dirname(beside), { recursive: true });
    fs.writeFileSync(beside, "not ours");
    age(beside);
    // Too new to call a leftover: something may still be putting it in place.
    const fresh = path.join(w.internal, "collections", "files", "arriving.bin");
    fs.writeFileSync(fresh, "new");

    const found = await leftovers(w.app);
    const untracked = found.filter((item) => item.kind === "untracked");
    expect(untracked).toHaveLength(1);
    expect(untracked[0]).toMatchObject({ title: "abandoned.zim", bytes: 9_000, detail: stray });
    expect(fs.existsSync(stray)).toBe(true);

    const cleared = await w.app.api("POST", "/api/manage/leftovers/clear", { ids: [untracked[0]!.id] });
    expect(cleared.body).toEqual({ cleared: { count: 1, bytes: 9_000 }, failed: [] });
    expect(fs.existsSync(stray)).toBe(false);
    // The folder it emptied went; the top folder stays.
    expect(fs.existsSync(path.dirname(stray))).toBe(false);
    expect(fs.existsSync(path.join(w.internal, "collections"))).toBe(true);
    expect(fs.existsSync(beside)).toBe(true);
    expect(fs.existsSync(fresh)).toBe(true);
    expect((await w.app.api("GET", "/api/manage/leftovers")).body.items.some((item: Leftover) => item.kind === "untracked")).toBe(false);
  });

  it("will not delete a file a record uses, a file outside Outpost's folders, or anything reached by climbing out", async () => {
    const w = await world();
    const internalId = w.app.ctx.services.storage.getDefault().id;
    const tries = [
      `file:${internalId}:collections/files/manual.bin`,
      `file:${internalId}:my-archives/own.bin`,
      `file:${internalId}:.outpost-location.json`,
      `file:${internalId}:collections/../my-archives/own.bin`,
      `file:${internalId}:../../data/outpost.db`,
      `file:nowhere:collections/files/manual.bin`,
      "previous:../outpost.db",
      "cache:everything",
    ];
    const cleared = await w.app.api("POST", "/api/manage/leftovers/clear", { ids: tries });
    expect(cleared.body.cleared).toEqual({ count: 0, bytes: 0 });
    expect(cleared.body.failed).toHaveLength(tries.length);
    expect(fs.existsSync(w.manual.file)).toBe(true);
    expect(fs.existsSync(w.imported.file)).toBe(true);
    expect(fs.existsSync(path.join(w.internal, ".outpost-location.json"))).toBe(true);
    expect(fs.existsSync(path.join(w.app.dir, "data", "outpost.db"))).toBe(true);

    // A link inside Outpost's folder that leads out of the location is neither listed nor followed.
    const outside = path.join(w.app.dir, "elsewhere.txt");
    fs.writeFileSync(outside, "keep me");
    fs.symlinkSync(path.dirname(outside), path.join(w.internal, "collections", "link"));
    age(outside);
    expect((await leftovers(w.app)).filter((item) => item.kind === "untracked")).toEqual([]);
    const viaLink = await w.app.api("POST", "/api/manage/leftovers/clear", { ids: [`file:${internalId}:collections/link/elsewhere.txt`] });
    expect(viaLink.body.failed).toHaveLength(1);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it("lists a download that stopped with the part that arrived, and clears both", async () => {
    const w = await world();
    const body = testBytes(900_000, 9);
    w.server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 15 });
    const { downloads } = w.app.ctx.services;
    const started = await downloads.start({
      kind: "file",
      title: "Big atlas",
      url: w.server.url("/slow"),
      relPath: "collections/files/big.bin",
      allowedHosts: [w.server.host],
    });
    const part = path.join(w.internal, "collections/files/big.bin.part");
    await waitFor(() => fs.existsSync(part) && fs.statSync(part).size > 0, "part of the file to arrive");
    downloads.cancel(started.id);
    await w.app.ctx.jobs.whenIdle();
    const onDisk = fs.statSync(part).size;

    const found = await leftovers(w.app);
    const stopped = found.find((item) => item.kind === "download")!;
    expect(stopped).toMatchObject({ title: "Big atlas", bytes: onDisk, what: "cancelled", detail: part });
    // The part file belongs to that download; it is not also listed as a stray file.
    expect(found.filter((item) => item.kind === "untracked")).toEqual([]);

    const cleared = await w.app.api("POST", "/api/manage/leftovers/clear", { ids: [stopped.id] });
    expect(cleared.body.cleared).toEqual({ count: 1, bytes: onDisk });
    expect(fs.existsSync(part)).toBe(false);
    expect(downloads.get(started.id)).toBeUndefined();
  });

  it("finds records whose file has gone and forgets them, both records of a sheet together", async () => {
    const w = await world();
    fs.rmSync(w.sheet.file);
    fs.rmSync(w.own.file);
    await w.app.ctx.services.collections.reconcile();

    const missing = (await leftovers(w.app)).filter((item) => item.kind === "missing");
    expect(missing.map((item) => item.title).sort()).toEqual(["Complete Guide to Home Canning", "my notes"]);
    expect(missing.find((item) => item.title === "Complete Guide to Home Canning")?.href).toBe("/explore?entry=usda.canning");

    const cleared = await w.app.api("POST", "/api/manage/leftovers/clear", { ids: missing.map((item) => item.id) });
    expect(cleared.body.failed).toEqual([]);
    expect((await w.app.api("GET", "/api/documents")).body.total).toBe(0);
    expect(w.app.ctx.services.collections.get(w.sheet.collectionId)).toBeUndefined();
  });

  it("offers finished history, caches and data a restore set aside, each cleared by name", async () => {
    const w = await world();
    const data = path.join(w.app.dir, "data");
    fs.mkdirSync(path.join(data, "runtimes", "node-24"), { recursive: true });
    fs.writeFileSync(path.join(data, "runtimes", "node-24", "node"), testBytes(5_000));
    fs.mkdirSync(path.join(data, "before-restore-2026-11-01T10-00-00-000Z"));
    fs.writeFileSync(path.join(data, "before-restore-2026-11-01T10-00-00-000Z", "outpost.db"), testBytes(7_000));
    fs.mkdirSync(path.join(data, "extracted"), { recursive: true });
    const orphan = path.join(data, "extracted", "01GONE0000000000000000000.json");
    fs.writeFileSync(orphan, "{}");
    age(orphan);

    const found = await leftovers(w.app);
    const byId = new Map(found.map((item) => [item.id, item]));
    expect(byId.get("cache:runtimes")).toMatchObject({ kind: "cache", bytes: 5_000 });
    expect(byId.get("cache:text")).toMatchObject({ count: 1, bytes: 2 });
    expect(byId.get("previous:before-restore-2026-11-01T10-00-00-000Z")).toMatchObject({ kind: "previous", bytes: 7_000 });
    expect(byId.get("history:jobs")!.count).toBeGreaterThan(0);
    expect(byId.get("history:downloads")).toMatchObject({ count: 2 });

    const cleared = await w.app.api("POST", "/api/manage/leftovers/clear", {
      ids: ["cache:runtimes", "cache:text", "previous:before-restore-2026-11-01T10-00-00-000Z", "history:jobs", "history:downloads"],
    });
    expect(cleared.body.failed).toEqual([]);
    expect(cleared.body.cleared.bytes).toBe(5_000 + 2 + 7_000);
    expect(fs.existsSync(path.join(data, "runtimes"))).toBe(false);
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(path.join(data, "before-restore-2026-11-01T10-00-00-000Z"))).toBe(false);
    // Clearing the history of a finished download never touches the file it installed.
    expect(fs.existsSync(w.manual.file)).toBe(true);
    expect(w.app.ctx.services.downloads.list()).toEqual([]);
    expect(w.app.ctx.jobs.list()).toEqual([]);
    // The text of documents that are still in the library stays.
    expect(fs.existsSync(path.join(data, "extracted", `${w.own.documentId}.json`))).toBe(true);
  });
});

describe("remove all downloaded content", () => {
  it("removes what can be fetched again, stops a download in flight, and keeps the person's own things", async () => {
    const w = await world();
    const { downloads, storage } = w.app.ctx.services;
    await w.app.api("POST", "/api/notes", { title: "Trip plan" });
    const body = testBytes(1_500_000, 21);
    w.server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 15 });
    const inFlight = await downloads.start({
      kind: "file",
      title: "Slow archive",
      url: w.server.url("/slow"),
      relPath: "collections/files/slow.bin",
      allowedHosts: [w.server.host],
    });
    const part = path.join(w.internal, "collections/files/slow.bin.part");
    await waitFor(() => fs.existsSync(part) && fs.statSync(part).size > 0, "the download to be under way");

    const plan = (await w.app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "downloaded" })).body;
    expect(plan.remove.count).toBe(3);
    expect(plan.own.count).toBe(0);
    expect(plan.downloads.count).toBe(1);
    expect(plan.byLocation.map((location) => [location.name, location.remove.count]).sort()).toEqual([
      ["Internal storage", 2],
      ["USB drive", 1],
    ]);

    const started = await w.app.api("POST", "/api/manage/cleanup/downloaded", {});
    expect(started.status).toBe(200);
    const job = await finished(w.app, started.body.job.id);
    expect(job.state).toBe("succeeded");
    const result = job.result as CleanupResult;
    expect(result.removed.count).toBe(3);
    expect(result.failed).toEqual([]);

    // Downloaded content and the download in flight are gone, files and all.
    for (const file of [w.sheet.file, w.manual.file, w.onUsb.file, part, path.join(w.internal, "collections/files/slow.bin")]) {
      expect(fs.existsSync(file), file).toBe(false);
    }
    expect(downloads.get(inFlight.id)).toBeUndefined();
    await w.app.ctx.jobs.whenIdle();
    expect(fs.existsSync(part)).toBe(false);

    // The person's own: a document, an archive Outpost was pointed at, a page of notes.
    expect(fs.existsSync(w.own.file)).toBe(true);
    expect(fs.existsSync(w.imported.file)).toBe(true);
    expect((await items(w.app)).map((item) => item.origin)).toEqual(["own", "own"]);
    expect(w.app.ctx.sqlite.prepare("SELECT count(*) AS n FROM notes").get()).toEqual({ n: 1 });
    // Locations and their marker files are not content.
    expect(storage.list().map((location) => location.name)).toEqual(["Internal storage", "USB drive"]);
    expect(fs.existsSync(path.join(w.usbPath, ".outpost-location.json"))).toBe(true);
  });

  it("leaves a disconnected location's content behind and says where it is; forgets it only when asked", async () => {
    const w = await world();
    const away = await unplug(w);

    const plan = (await w.app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "downloaded" })).body;
    expect(plan.remove.count).toBe(2);
    expect(plan.disconnected).toMatchObject({ count: 1, bytes: 30_000 });
    expect(plan.byLocation.find((location) => location.name === "USB drive")).toMatchObject({
      available: false,
      stays: { count: 1, bytes: 30_000 },
    });

    const job = await finished(w.app, (await w.app.api("POST", "/api/manage/cleanup/downloaded", {})).body.job.id);
    const result = job.result as CleanupResult;
    expect(result.removed.count).toBe(2);
    expect(result.left.count).toBe(1);
    expect(result.leftBehind).toEqual([expect.objectContaining({ title: "Road atlas", locationName: "USB drive" })]);
    expect(w.app.ctx.services.collections.get(w.onUsb.collectionId)).toBeDefined();
    expect(fs.existsSync(path.join(away, "collections/files/atlas.bin"))).toBe(true);

    const again = await finished(
      w.app,
      (await w.app.api("POST", "/api/manage/cleanup/downloaded", { disconnected: "forget" })).body.job.id,
    );
    expect((again.result as CleanupResult).forgotten.count).toBe(1);
    expect(w.app.ctx.services.collections.get(w.onUsb.collectionId)).toBeUndefined();
    expect(fs.existsSync(path.join(away, "collections/files/atlas.bin"))).toBe(true);
  });
});

describe("clear and rebuild search data", () => {
  it("clears vectors, reads documents again, and compacts the database", async () => {
    const w = await world();
    const { sqlite } = w.app.ctx;
    sqlite.prepare("INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES ('demo:m', 'demo', 'm', 4, 0)").run();
    const chunk = sqlite.prepare("SELECT id, content_hash AS hash FROM chunks LIMIT 1").get() as { id: number; hash: string };
    sqlite
      .prepare("INSERT INTO embeddings (chunk_id, model_id, vector, content_hash, created_at) VALUES (?, 'demo:m', ?, ?, 0)")
      .run(chunk.id, Buffer.alloc(16), chunk.hash);

    const before = (await w.app.api("GET", "/api/manage/cleanup")).body;
    expect(before.derived.vectors).toEqual({ count: 1, bytes: 16 });
    expect(before.derived.documents).toEqual({ count: 2, unreachable: 0 });

    const started = await w.app.api("POST", "/api/manage/cleanup/derived", { steps: ["compact", "text", "vectors"] });
    const job = await finished(w.app, started.body.job.id);
    expect(job.state).toBe("succeeded");
    const result = job.result as CleanupResult;
    // Compacting runs last whatever order was asked for, so it gives back what the others freed.
    expect(result.steps?.map((entry) => entry.step)).toEqual(["vectors", "text", "compact"]);
    expect(result.steps?.[0]?.message).toMatch(/Cleared 1 vector/);
    expect(result.steps?.[1]?.message).toMatch(/Reading the text of 2 documents again/);
    expect(sqlite.prepare("SELECT count(*) AS n FROM embeddings").get()).toEqual({ n: 0 });

    await w.app.ctx.jobs.whenIdle();
    const search = (await w.app.api("GET", "/api/search?q=altitude&kinds=document")).body;
    expect(search.results[0]?.entityId).toBe(w.own.documentId);
    expect((await w.app.api("GET", "/api/manage/cleanup")).body.derived.reclaimableBytes).toBe(0);
    // Nothing a person keeps was touched.
    expect((await items(w.app)).length).toBe(5);
  });
});

describe("where erase everything may be asked from", () => {
  it("knows a loopback address, and treats anything that came through a proxy as remote", () => {
    for (const address of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]) expect(isLoopbackAddress(address), address).toBe(true);
    for (const address of ["192.168.1.20", "10.0.0.5", "::ffff:192.168.1.20", "fe80::1", "", undefined, "1270.0.0.1"]) {
      expect(isLoopbackAddress(address), String(address)).toBe(false);
    }
    const from = (remoteAddress: string, headers: Record<string, string> = {}) => ({ socket: { remoteAddress }, headers });
    expect(isLocalRequest(from("127.0.0.1"), { lanAccess: true })).toBe(true);
    expect(isLocalRequest(from("192.168.1.20"), { lanAccess: true })).toBe(false);
    // With LAN access off nothing but this computer can connect, whatever address a container shows.
    expect(isLocalRequest(from("172.17.0.1"), { lanAccess: false })).toBe(true);
    expect(isLocalRequest(from("127.0.0.1", { "x-forwarded-for": "203.0.113.9" }), { lanAccess: true })).toBe(false);
    expect(isLocalRequest(from("127.0.0.1", { forwarded: "for=203.0.113.9" }), { lanAccess: false })).toBe(false);
  });

  it("refuses another device on the network, and does not offer it the button", async () => {
    const w = await world({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" });
    const phone = { remoteAddress: "192.168.1.20" };

    const status = (await w.app.api("GET", "/api/manage/cleanup", undefined, phone)).body;
    expect(status.erase).toEqual({ allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" });
    const refused = await w.app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" }, phone);
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/only be started on the computer Outpost runs on/);
    expect(refused.body.error.message).toMatch(/OUTPOST_ALLOW_REMOTE_ERASE=true/);

    // A proxy on this computer makes every request look local; a forwarded request is not trusted.
    const proxied = await w.app.api(
      "POST",
      "/api/manage/cleanup/everything",
      { confirm: "erase everything" },
      { headers: { "x-forwarded-for": "192.168.1.20" } },
    );
    expect(proxied.status).toBe(403);
    expect((await items(w.app)).length).toBe(5);
    expect(w.app.ctx.jobs.findBySubject("manage")).toEqual([]);

    // The same device may still remove downloaded content, as it can one item at a time.
    expect((await w.app.api("POST", "/api/manage/plan", { scope: "everything" }, phone)).status).toBe(200);
    const downloaded = await w.app.api("POST", "/api/manage/cleanup/downloaded", {}, phone);
    expect(downloaded.status).toBe(200);
    await finished(w.app, downloaded.body.job.id);

    // At the computer itself it is offered.
    expect((await w.app.api("GET", "/api/manage/cleanup")).body.erase).toMatchObject({ allowed: true, reason: "local" });
  });

  it("does not let another device delete several of the person's own items in one step", async () => {
    const w = await world({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" });
    const phone = { remoteAddress: "192.168.1.20" };
    const keys = [`document:${w.own.documentId}`, `collection:${w.imported.collectionId}`];

    const refused = await w.app.api("POST", "/api/manage/remove", { keys }, phone);
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/one at a time/);
    expect(fs.existsSync(w.own.file)).toBe(true);
    expect(fs.existsSync(w.imported.file)).toBe(true);

    // Forgetting them, which leaves the files, and removing one, are still open to it.
    const one = await w.app.api("POST", "/api/manage/remove", { keys: [keys[0]] }, phone);
    expect(one.status).toBe(200);
    await finished(w.app, one.body.job.id);
    expect(fs.existsSync(w.own.file)).toBe(false);
    const forget = await w.app.api("POST", "/api/manage/remove", { keys: [keys[1]], files: "keep" }, phone);
    expect(forget.status).toBe(200);
    await finished(w.app, forget.body.job.id);
    expect(fs.existsSync(w.imported.file)).toBe(true);
  });

  it("is allowed from anywhere when the person starting Outpost opted in", async () => {
    const w = await world({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0", OUTPOST_ALLOW_REMOTE_ERASE: "true" });
    const phone = { remoteAddress: "192.168.1.20" };
    expect((await w.app.api("GET", "/api/manage/cleanup", undefined, phone)).body.erase).toMatchObject({ allowed: true, reason: "option" });
    const wrong = await w.app.api("POST", "/api/manage/cleanup/everything", { confirm: "yes" }, phone);
    expect(wrong.status).toBe(400);
    const started = await w.app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" }, phone);
    expect(started.status).toBe(200);
    await finished(w.app, started.body.job.id);
  });
});

describe("erase everything", () => {
  it("needs the phrase typed, then erases content and the person's own things, leaving alone what Outpost did not make", async () => {
    const w = await world();
    const { storage, downloads } = w.app.ctx.services;
    const data = path.join(w.app.dir, "data");
    const note = (await w.app.api("POST", "/api/notes", { title: "Trip plan" })).body;
    expect(note).toBeDefined();
    await w.app.api("POST", "/api/maps/markers", { name: "Hut", lat: 46.5, lon: 8.1 });
    await w.app.api("PATCH", "/api/settings", { "downloads.concurrency": 4 });
    fs.mkdirSync(path.join(data, "before-restore-2026-11-01T10-00-00-000Z"));
    fs.writeFileSync(path.join(data, "before-restore-2026-11-01T10-00-00-000Z", "outpost.db"), "old notes");
    fs.mkdirSync(path.join(data, "catalog"), { recursive: true });
    fs.writeFileSync(path.join(data, "catalog", "mine.json"), "{}");
    // A second external drive, unplugged, with a document of the person's own on it.
    const cardPath = path.join(w.app.dir, "storage", "card");
    const card = await storage.add({ name: "SD card", path: cardPath, kind: "external" });
    const source = path.join(w.app.dir, "logbook.txt");
    fs.writeFileSync(source, "Logbook entry.\n".repeat(20));
    const logbook = await w.app.ctx.services.documents.ingestFile({ sourcePath: source, originalName: "logbook.txt", locationId: card.id });
    await w.app.ctx.jobs.whenIdle();
    const cardAway = path.join(w.app.dir, "card-unplugged");
    fs.renameSync(cardPath, cardAway);
    await storage.refresh();
    // And a download in flight.
    w.server.routes.set("/slow", { body: testBytes(1_500_000, 21), chunkBytes: 16_384, delayMs: 15 });
    await downloads.start({
      kind: "file",
      title: "Slow archive",
      url: w.server.url("/slow"),
      relPath: "collections/files/slow.bin",
      allowedHosts: [w.server.host],
    });
    const part = path.join(w.internal, "collections/files/slow.bin.part");
    await waitFor(() => fs.existsSync(part) && fs.statSync(part).size > 0, "the download to be under way");

    const plan = (await w.app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.remove.count).toBe(4);
    expect(plan.own.count).toBe(1);
    expect(plan.outside).toMatchObject({ count: 1, files: [expect.objectContaining({ title: "My own archive", path: w.imported.file })] });
    expect(plan.disconnected).toMatchObject({ count: 1, files: [expect.objectContaining({ title: "logbook", locationName: "SD card" })] });
    expect(plan.personal).toMatchObject({ pages: 1, places: 1, settings: 1 });
    expect(plan.downloads.count).toBe(1);

    for (const confirm of ["", "erase", "ERASE EVERYTHING NOW"]) {
      expect((await w.app.api("POST", "/api/manage/cleanup/everything", { confirm })).status).toBe(400);
    }
    expect((await w.app.api("POST", "/api/manage/cleanup/everything", {})).status).toBe(400);
    expect((await items(w.app)).length).toBe(6);

    const started = await w.app.api("POST", "/api/manage/cleanup/everything", { confirm: "Erase everything" });
    expect(started.status).toBe(200);
    const job = await finished(w.app, started.body.job.id);
    expect(job.error).toBeNull();
    expect(job.state).toBe("succeeded");
    const result = job.result as CleanupResult;
    expect(result.removed.count).toBe(4);
    expect(result.forgotten.count).toBe(2);
    expect(result.failed).toEqual([]);
    expect(result.personal).toMatchObject({ pages: 1, places: 1, settings: 1 });
    // It says where the files it did not delete are.
    expect(result.leftBehind.map((file) => file.title).sort()).toEqual(["My own archive", "logbook"]);
    expect(result.leftBehind.find((file) => file.title === "My own archive")?.path).toBe(w.imported.file);

    // Content Outpost put in its own folders is gone, with the download that was arriving.
    for (const file of [w.sheet.file, w.manual.file, w.onUsb.file, w.own.file, part]) expect(fs.existsSync(file), file).toBe(false);
    // What it did not make is where it was: the person's archive, and everything on the unplugged card.
    expect(fs.existsSync(w.imported.file)).toBe(true);
    expect(fs.existsSync(path.join(cardAway, logbook.document.relPath))).toBe(true);
    expect(fs.existsSync(path.join(cardAway, ".outpost-location.json"))).toBe(true);

    const count = (table: string) => (w.app.ctx.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    for (const table of [
      "collections",
      "documents",
      "notes",
      "attachments",
      "markers",
      "tracks",
      "downloads",
      "settings",
      "embeddings",
      "tags",
    ]) {
      expect(count(table), table).toBe(0);
    }
    expect(count("jobs")).toBe(1);
    expect(w.app.ctx.services.settings.get("downloads.concurrency")).toBe(2);
    expect(
      (await w.app.api("GET", "/api/search?q=canning")).body.results.filter((hit: { kind: string }) => hit.kind !== "catalog"),
    ).toEqual([]);
    expect(fs.existsSync(path.join(data, "extracted"))).toBe(false);
    expect(fs.existsSync(path.join(data, "before-restore-2026-11-01T10-00-00-000Z"))).toBe(false);

    // Kept: storage locations with their marker files, the person's own catalogue manifests, the database itself.
    expect(storage.list().map((location) => location.name)).toEqual(["Internal storage", "USB drive", "SD card"]);
    expect(fs.existsSync(path.join(w.internal, ".outpost-location.json"))).toBe(true);
    expect(fs.existsSync(path.join(data, "catalog", "mine.json"))).toBe(true);

    // Outpost carries on working without a restart: a new page and a new document.
    expect((await w.app.api("POST", "/api/notes", { title: "A fresh start" })).status).toBe(200);
    const again = path.join(w.app.dir, "again.txt");
    fs.writeFileSync(again, "Starting again.\n");
    const added = await w.app.ctx.services.documents.ingestFile({ sourcePath: again, originalName: "again.txt" });
    expect(added.status).toBe("created");
    await w.app.ctx.jobs.whenIdle();
    expect((await w.app.api("GET", "/api/search?q=starting&kinds=document")).body.results).toHaveLength(1);
  });
  it("erases conversations and repeaters, a list's and the person's own, and counts them before and after", async () => {
    app = await createTestApp();
    const { chat } = app.ctx.services;
    const first = chat.store.create({ title: "Water filters" });
    chat.store.addUserMessage(first.id, "Which filter takes out giardia?");
    chat.store.addUserMessage(first.id, "And how long does one last?");
    chat.store.create({ title: "An empty one" });
    const csv = fs.readFileSync(path.join(import.meta.dirname, "fixtures/repeaters/etcc-status.csv"), "utf8");
    const upload = multipart({ name: "North list" }, [{ name: "etcc-status.csv", content: csv, type: "text/csv" }]);
    expect((await app.api("POST", "/api/repeaters/import", upload.payload, { headers: upload.headers })).status).toBe(200);
    expect((await app.api("POST", "/api/repeaters", { callsign: "QZ3HAND", outputHz: 145_725_000 })).status).toBe(200);

    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal).toMatchObject({ conversations: 2, repeaters: 7, repeaterLists: 1 });

    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    const job = await finished(app, started.body.job.id);
    expect(job.state).toBe("succeeded");
    const result = job.result as CleanupResult;
    expect(result.failed).toEqual([]);
    expect(result.personal).toMatchObject({ conversations: 2, repeaters: 7, repeaterLists: 1 });

    const count = (table: string) => (app!.ctx.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    for (const table of ["chat_conversations", "chat_messages", "repeater_lists", "repeaters"]) expect(count(table), table).toBe(0);
    expect((await app.api("GET", "/api/chat/conversations")).body.conversations).toEqual([]);
    expect((await app.api("GET", `/api/chat/conversations/${first.id}`)).status).toBe(404);
    expect((await app.api("GET", "/api/repeaters/overview")).body).toMatchObject({ total: 0, ownCount: 0, lists: [] });
    expect((await app.api("GET", "/api/search?q=QZ3HAND")).body.results).toEqual([]);
  });
});

describe("when what is stored is counted again", () => {
  it("does not walk the folders again just because a screen asked, unless something changed or an hour has gone", async () => {
    app = await createTestApp();
    const first = await measured(app);
    const start = Date.now();
    const clock = vi.spyOn(Date, "now");

    clock.mockReturnValue(start + 10 * 60_000);
    expect((await app.api<UsageResponse>("GET", "/api/manage/usage")).body).toMatchObject({
      measuring: false,
      measuredAt: first.measuredAt,
    });

    // Something changed in Outpost: the next look counts again.
    app.ctx.events.publish({ type: "documents.changed" });
    expect((await app.api<UsageResponse>("GET", "/api/manage/usage")).body.measuring).toBe(true);
    clock.mockRestore();
    const second = await measured(app);

    // Nothing changed, but files may have been changed by hand: an hour later it counts again.
    vi.spyOn(Date, "now").mockReturnValue(second.measuredAt! + 61 * 60_000);
    expect((await app.api<UsageResponse>("GET", "/api/manage/usage")).body.measuring).toBe(true);
  });
});

describe("erasing everything on a portable drive", () => {
  it("cuts the drive's tie to the library it was written from, so a merge home cannot read everything as removed", async () => {
    app = await createTestApp();
    const db = app.ctx.sqlite;
    // What writing a drive leaves in its database (merge/fingerprint.ts).
    db.prepare("INSERT INTO drive_baseline (kind, item_id, hash, parent_id, trashed) VALUES ('page', 'p1', 'h', NULL, 0)").run();
    const meta = db.prepare("INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    meta.run("drive.madeFrom", "home-library");
    meta.run("drive.writtenAt", "1000");
    meta.run("drive.baseline", "1");

    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    await waitFor(() => {
      const job = app!.ctx.jobs.get(started.body.job.id);
      return job && ["succeeded", "failed"].includes(job.state) ? job : undefined;
    }, "the erase");

    const recorded = readBaseline(db);
    expect(recorded?.pages.size).toBe(0);
    expect(recorded?.madeFrom).toBe("erased");
    expect(recorded?.writtenAt).toBeGreaterThan(1000);
  });

  it("leaves a library that was never a drive without any such record", async () => {
    app = await createTestApp();
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    await waitFor(() => {
      const job = app!.ctx.jobs.get(started.body.job.id);
      return job && ["succeeded", "failed"].includes(job.state) ? job : undefined;
    }, "the erase");
    expect(readBaseline(app.ctx.sqlite)).toBeNull();
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ArchiveAddPlan, ArchiveAddResult, JobDto } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";
import { NAUTILUS_BOOK, type NautilusArchive, startNautilusArchive, zimHeader } from "./nautilus-archive.ts";

/**
 * "Add all": every document of a collection that lists documents, copied into the
 * library by one job. The archive is the stand-in the reader's tests use
 * (nautilus-archive.ts): ten documents, eight of them PDFs the library can keep.
 */
const PDFS = [
  "files/Water (1).pdf",
  "files/stoves/rocket stove.pdf",
  "files/Schrift & Zeichen #1?.pdf",
  "files/Radio check.pdf",
  "files/Water (2).pdf",
  "files/north.pdf",
  "files/first aid/splint.pdf",
  "files/grain.pdf",
];

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function waitFor(check: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function setup(prepare?: (archive: NautilusArchive) => void, more: Record<string, string> = {}) {
  const archive = await startNautilusArchive();
  cleanups.push(() => archive.close());
  prepare?.(archive);
  // A folder of the test's own, so that a second server can be started on what the first one left.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-test-"));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { OUTPOST_KIWIX_URL: archive.url, ...more };
  const app: TestApp = await createTestApp(env, dir);
  let open: TestApp | undefined = app;
  cleanups.push(async () => {
    await open?.close();
  });
  const location = app.ctx.services.storage.getDefault();
  const relPath = `collections/zim/${NAUTILUS_BOOK}.zim`;
  fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), zimHeader());
  const imported = await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath });
  expect(imported.status).toBe(200);
  const id = imported.body.collection.id as string;
  // Its title is read from the archive in the background, and is part of how an added file is recognised.
  await waitFor(() => fs.readFileSync(app.ctx.config.kiwix.libraryPath, "utf8").includes('name="field-library_en"'));
  await waitFor(async () => (await app.api("GET", `/api/kiwix/books/${id}/documents?limit=0`)).body.list?.total === 10);

  const base = `/api/kiwix/books/${id}/files`;
  return {
    archive,
    id,
    dir,
    location,
    app,
    /** Stops this server as a restart would, and starts another on the same folder. */
    async restart(): Promise<TestApp> {
      await open?.close();
      open = await createTestApp(env, dir);
      return open;
    },
    plan: (on: TestApp, scope: unknown = { kind: "list" }) => on.api<ArchiveAddPlan>("POST", `${base}/add-all/plan`, scope),
    start: (on: TestApp, scope: unknown = { kind: "list" }) => on.api("POST", `${base}/add-all`, scope),
    status: async (on: TestApp) => (await on.api("GET", `${base}/add-all`)).body.job as JobDto | null,
    files: async (on: TestApp, query = "") =>
      (
        (await on.api("GET", `/api/kiwix/books/${id}/documents${query}`)).body.list.documents as Array<{
          title: string;
          files: Array<{ path: string; documentId: string | null; adding: string | null; problem: string | null }>;
        }>
      ).flatMap((document) => document.files),
    titles: async (on: TestApp) =>
      ((await on.api("GET", "/api/documents?limit=200&sort=title")).body.documents as Array<{ title: string }>).map((document) => document.title),
    /** Nothing half-copied is left where files wait on their way in. */
    leftovers: () => {
      const saved = path.join(location.path, "documents", "saved");
      return fs.existsSync(saved) ? fs.readdirSync(saved) : [];
    },
  };
}

const finished = (job: JobDto | null) => job !== null && ["succeeded", "failed", "cancelled"].includes(job.state);
const resultOf = (job: JobDto | null) => job?.result as unknown as ArchiveAddResult;

describe("adding every document of a collection to the library", () => {
  it("says beforehand how many documents, how much space and where", async () => {
    const { app, archive, id, plan, location } = await setup();
    const { status, body } = await plan(app);
    expect(status).toBe(200);
    expect(body).toMatchObject({ count: 8, already: 0, unsized: 0, refusal: null, ocrAuto: false, location: { id: location.id, name: location.name } });
    expect(body.bytes).toBeGreaterThan(8 * 300);
    expect(body.location!.freeBytes).toBeGreaterThan(0);
    // Each PDF was asked how large it is, and nothing was read: no file was fetched, and nothing is in the library.
    expect(archive.heads).toHaveLength(8);
    expect(archive.requests.some((url) => url.includes("/files/"))).toBe(false);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(0);
    // Asked again, the sizes are remembered.
    await plan(app, { kind: "list", q: "water" });
    expect(archive.heads).toHaveLength(8);

    // A search narrows it to what is showing.
    expect((await plan(app, { kind: "list", q: "water" })).body).toMatchObject({ count: 2, already: 0 });
    expect((await plan(app, { kind: "list", q: "whistle" })).body).toMatchObject({ count: 0, bytes: 0 });

    // The same sizes are there for the lines of the list.
    const sizes = await app.api("POST", `/api/kiwix/books/${id}/files/sizes`, {
      paths: ["files/north.pdf", "files/not there.pdf", "files/whistle.wav"],
    });
    expect(sizes.body.files).toEqual([
      { path: "files/north.pdf", sizeBytes: expect.any(Number) },
      { path: "files/not there.pdf", sizeBytes: null },
      { path: "files/whistle.wav", sizeBytes: null },
    ]);
    expect(sizes.body.files[0].sizeBytes).toBeGreaterThan(300);
    for (const bad of [{}, { kind: "everything" }, { kind: "list", q: "x".repeat(201) }, { kind: "files", files: [] }]) {
      expect((await plan(app, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("adds them one after another as a job, counting as it goes, without piling up documents to be read", async () => {
    const { app, archive, id, start, status, files, titles, leftovers } = await setup((made) => {
      // Slow enough that progress is written several times: it is recorded at most twice a second.
      made.fileDelayMs = 200;
    });
    const seen: Array<{ current: number; total: number | null; backlog: number }> = [];
    const backlog = () =>
      app.ctx.jobs.list({ states: ["queued", "running"], limit: 200 }).filter((job) => job.type === "document.extract").length;
    const stop = app.ctx.events.subscribe((event) => {
      const data = event.data as JobDto | undefined;
      if (event.type === "job.updated" && data?.type === "kiwix.add-files") {
        seen.push({ current: data.progress.current, total: data.progress.total, backlog: backlog() });
      }
    });
    cleanups.push(stop);

    const started = await start(app);
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ already: false, job: { type: "kiwix.add-files", queue: "reference-files" } });
    expect(started.body.job.title).toBe("Adding documents from “Field library” to your library");
    // Until they are copied, the list says each of them is on its way.
    const waiting = (await files(app)).filter((file) => file.adding !== null);
    expect(waiting.length).toBeGreaterThanOrEqual(7);
    // Asking a second time starts nothing new.
    const again = await start(app);
    expect(again.body).toMatchObject({ already: true, job: { id: started.body.job.id } });

    await waitFor(async () => finished(await status(app)), 30_000);
    const job = (await status(app))!;
    expect(job.state).toBe("succeeded");
    expect(resultOf(job)).toMatchObject({
      scope: "list",
      q: "",
      wanted: 8,
      added: 8,
      already: 0,
      failed: [],
      failedMore: 0,
      notReached: 0,
      stopped: null,
      locationName: "Internal storage",
    });
    expect(resultOf(job).addedBytes).toBeGreaterThan(8 * 300);
    expect(job.progress).toMatchObject({ current: 8, total: 8 });

    // It counted up to eight of eight.
    const counted = seen.filter((item) => item.total === 8).map((item) => item.current);
    expect(counted.at(-1)).toBe(8);
    expect([...counted].sort((a, b) => a - b)).toEqual(counted);
    expect(new Set(counted).size).toBeGreaterThanOrEqual(3);
    // One document is read at a time by default: never more than that one and one waiting.
    expect(Math.max(...seen.map((item) => item.backlog))).toBeLessThanOrEqual(2);

    // Each file was fetched once, from the archive.
    for (const file of PDFS) {
      const address = `/content/${NAUTILUS_BOOK}/${file.split("/").map(encodeURIComponent).join("/")}`;
      expect(archive.requests.filter((url) => url === address), file).toHaveLength(1);
    }
    // A document that is one file takes the title the collection gives it; a file among several keeps its own name.
    expect(await titles(app)).toEqual([
      "A camper's rocket stove",
      "Boiling water to make it safe",
      "Finding north without a compass",
      "Purifying water with bleach",
      "Radio check",
      "Splinting a forearm",
      "Storing grain for a year",
      "Sütterlin für Anfänger — 初級",
    ]);
    const after = await files(app);
    expect(after.filter((file) => file.documentId).map((file) => file.path)).toEqual(PDFS);
    expect(after.every((file) => file.adding === null && file.problem === null)).toBe(true);
    expect(leftovers()).toEqual([]);

    // Their text is read, so search finds them to the page.
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", "/api/search?q=bricks")).body.results[0]).toMatchObject({ kind: "document", title: "A camper's rocket stove" });

    // Done twice, it adds nothing twice.
    const twice = await start(app);
    expect(twice.status).toBe(409);
    expect(twice.body.error.message).toMatch(/already in your library/);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(8);

    // Removing the collection leaves the documents that were added from it.
    expect((await app.api("DELETE", `/api/collections/${id}?deleteFiles=true`)).status).toBe(200);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(8);
  }, 60_000);

  it("leaves out what is already in the library, and adds only what a search is showing", async () => {
    const { app, id, plan, start, status, titles } = await setup();
    const one = await app.api("POST", `/api/kiwix/books/${id}/files/save`, { path: "files/Water (1).pdf", title: "Boiling water to make it safe" });
    expect(one.body.status).toBe("created");
    expect((await plan(app, { kind: "list", q: "water" })).body).toMatchObject({ count: 1, already: 1 });

    expect((await start(app, { kind: "list", q: "water" })).status).toBe(200);
    await waitFor(async () => finished(await status(app)));
    expect(resultOf(await status(app))).toMatchObject({ scope: "list", q: "water", wanted: 1, added: 1, already: 0, notReached: 0 });
    expect(await titles(app)).toEqual(["Boiling water to make it safe", "Purifying water with bleach"]);

    // The rest of the list: six more, and the two that are there are not copied again.
    expect((await plan(app)).body).toMatchObject({ count: 6, already: 2 });
    expect((await start(app)).status).toBe(200);
    await waitFor(async () => finished(await status(app)), 30_000);
    expect(resultOf(await status(app))).toMatchObject({ wanted: 6, added: 6 });
    expect((await app.api("GET", "/api/documents")).body.total).toBe(8);
  }, 60_000);

  it("can be cancelled part of the way through, says what it had done, and takes up the rest when asked again", async () => {
    const { app, archive, start, status, leftovers } = await setup((made) => {
      made.fileDelayMs = 150;
    });
    const started = await start(app);
    await waitFor(async () => ((await status(app))?.progress.current ?? 0) >= 2, 30_000);
    expect((await app.api("POST", `/api/jobs/${started.body.job.id}/cancel`)).status).toBe(200);
    await waitFor(async () => finished(await status(app)));
    const job = (await status(app))!;
    expect(job.state).toBe("cancelled");
    const result = resultOf(job);
    expect(result.stopped).toBe("cancelled");
    expect(result.added).toBeGreaterThanOrEqual(2);
    expect(result.added).toBeLessThan(8);
    expect(result.added + result.notReached).toBe(8);
    expect(result.failed).toEqual([]);
    // What it added stays; the file it was in the middle of leaves nothing behind.
    expect((await app.api("GET", "/api/documents")).body.total).toBe(result.added);
    expect(leftovers()).toEqual([]);

    archive.fileDelayMs = 0;
    expect((await start(app)).body.already).toBe(false);
    await waitFor(async () => finished(await status(app)), 30_000);
    expect(resultOf(await status(app))).toMatchObject({ wanted: 8 - result.added, added: 8 - result.added, stopped: null });
    expect((await app.api("GET", "/api/documents")).body.total).toBe(8);
  }, 60_000);

  it("picks up where it left off after the server is restarted", async () => {
    const { app, archive, restart, start, status, leftovers } = await setup((made) => {
      made.fileDelayMs = 150;
    });
    const started = await start(app);
    await waitFor(async () => ((await status(app))?.progress.current ?? 0) >= 2, 30_000);
    const before = (await app.api("GET", "/api/documents")).body.total as number;
    expect(before).toBeGreaterThanOrEqual(2);
    expect(before).toBeLessThan(8);

    archive.fileDelayMs = 0;
    const second = await restart();
    await waitFor(async () => finished(await status(second)), 30_000);
    const job = (await status(second))!;
    // The same job, finished by the second server, and it knows what it added before the restart.
    expect(job.id).toBe(started.body.job.id);
    expect(job.state).toBe("succeeded");
    expect(resultOf(job)).toMatchObject({ wanted: 8, added: 8, already: 0, failed: [], notReached: 0, stopped: null });
    expect(job.progress).toMatchObject({ current: 8, total: 8 });
    expect((await second.api("GET", "/api/documents")).body.total).toBe(8);
    expect(leftovers()).toEqual([]);
    // Nothing that was added before the restart was fetched a second time.
    const fetched = archive.requests.filter((url) => url.includes("/files/"));
    expect(fetched.length).toBeLessThanOrEqual(8 + 1);
  }, 60_000);

  it("refuses to start when there is not room, and says how much is needed and how much is free", async () => {
    const { app, archive, plan, start, status, location } = await setup((made) => {
      // One file that claims to be far larger than any disk.
      made.saysOnHead.set("grain.pdf", 4e15);
    });
    const { body } = await plan(app);
    expect(body).toMatchObject({ count: 8, unsized: 0, location: { name: location.name } });
    expect(body.bytes).toBeGreaterThan(4e15);
    expect(body.refusal).toMatch(/^"Internal storage" does not have room for these 8 files: 4\.00 PB would be needed and .+ is free/);
    expect(body.refusal).toMatch(/Free some space, or make another storage location the default, then try again\.$/);

    const refused = await start(app);
    expect(refused.status).toBe(507);
    expect(refused.body.error).toMatchObject({ code: "insufficient_space", message: body.refusal });
    expect(await status(app)).toBeNull();
    expect(archive.requests.some((url) => url.includes("/files/"))).toBe(false);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(0);
    // What does fit can still be added.
    expect((await plan(app, { kind: "list", q: "water" })).body.refusal).toBeNull();
  });

  it("stops when the room runs out part of the way, and keeps what it had added", async () => {
    const { app, start, status, files, leftovers } = await setup(
      (made) => {
        // The archive only says how large this one is when it is fetched.
        made.saysOnGet.set("north.pdf", 4e15);
      },
      // Otherwise it would be refused for its size alone, whatever room there was.
      { OUTPOST_MAX_UPLOAD_MB: "10000000000" },
    );
    expect((await start(app)).status).toBe(200);
    await waitFor(async () => finished(await status(app)), 30_000);
    const job = (await status(app))!;
    expect(job.state).toBe("succeeded");
    const result = resultOf(job);
    // north.pdf is the sixth PDF of the list: five were added, and it and the two after it were not reached.
    expect(result).toMatchObject({ wanted: 8, added: 5, failed: [], notReached: 3, stopped: "space" });
    expect(result.stoppedReason).toMatch(/^"Internal storage" does not have room for "north\.pdf": 4\.00 PB would be needed/);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(5);
    expect(leftovers()).toEqual([]);
    expect((await files(app)).every((file) => file.adding === null)).toBe(true);
  }, 60_000);

  it("goes on past a file that cannot be added, says which and why, and can try it again", async () => {
    const { app, archive, start, status, files } = await setup((made) => {
      made.missing.add("north.pdf");
    });
    expect((await start(app)).status).toBe(200);
    await waitFor(async () => finished(await status(app)), 30_000);
    const job = (await status(app))!;
    expect(job.state).toBe("succeeded");
    expect(resultOf(job)).toMatchObject({ wanted: 8, added: 7, already: 0, failedMore: 0, notReached: 0, stopped: null });
    expect(resultOf(job).failed).toEqual([
      {
        path: "files/north.pdf",
        title: "Finding north without a compass",
        reason: '"north.pdf" is not in this collection. The site it was copied from may have had it; the copy does not.',
      },
    ]);
    // The line of the list says so too, until the file is added.
    const north = (await files(app)).find((file) => file.path === "files/north.pdf")!;
    expect(north).toMatchObject({ documentId: null, adding: null, problem: expect.stringMatching(/is not in this collection/) });
    expect((await files(app)).filter((file) => file.problem !== null)).toHaveLength(1);

    // Tried again once the file is there, only that one is copied.
    archive.missing.clear();
    const fetchedBefore = archive.requests.filter((url) => url.includes("/files/")).length;
    expect((await start(app)).status).toBe(200);
    await waitFor(async () => resultOf(await status(app))?.wanted === 1 && finished(await status(app)), 30_000);
    expect(resultOf(await status(app))).toMatchObject({ wanted: 1, added: 1, failed: [] });
    expect(archive.requests.filter((url) => url.includes("/files/")).length - fetchedBefore).toBe(1);
    expect((await files(app)).every((file) => file.problem === null)).toBe(true);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(8);
  }, 60_000);

  it("adds files named one by one, as a page that links to them does", async () => {
    const { app, id, plan, start, status, titles } = await setup();
    const scope = {
      kind: "files",
      files: [
        { path: "files/north.pdf", title: "North without a compass" },
        { path: "files/grain.pdf" },
        { path: "files/grain.pdf" },
      ],
    };
    expect((await plan(app, scope)).body).toMatchObject({ count: 2, already: 0, unsized: 0, refusal: null });
    expect((await start(app, scope)).status).toBe(200);
    await waitFor(async () => finished(await status(app)));
    expect(resultOf(await status(app))).toMatchObject({ scope: "files", q: "", wanted: 2, added: 2, failed: [] });
    expect(await titles(app)).toEqual(["grain", "North without a compass"]);
    const check = await app.api("POST", `/api/kiwix/books/${id}/files/check`, {
      paths: ["files/north.pdf", "files/Water (1).pdf"],
    });
    expect(check.body.files).toEqual([
      { path: "files/north.pdf", state: "saved", documentId: expect.any(String) },
      { path: "files/Water (1).pdf", state: "new" },
    ]);
    // A name that is not a file of the collection is refused before anything starts.
    for (const bad of ["../../etc/passwd", "files/kit list.ods", "https://example.org/a.pdf"]) {
      expect((await start(app, { kind: "files", files: [{ path: bad }] })).status, bad).toBe(400);
    }
    expect((await start(app, { kind: "files", files: Array.from({ length: 301 }, (_, n) => ({ path: `files/${n}.pdf` })) })).status).toBe(400);
  }, 60_000);

  it("copies a file once when it is asked for twice at the same moment", async () => {
    const { app, archive, id } = await setup((made) => {
      made.fileDelayMs = 100;
    });
    const save = () => app.api("POST", `/api/kiwix/books/${id}/files/save`, { path: "files/north.pdf" });
    const [first, second] = await Promise.all([save(), save()]);
    expect(first.body.status).toBe("created");
    expect(second.body.document.id).toBe(first.body.document.id);
    expect(archive.requests.filter((url) => url.endsWith("/files/north.pdf"))).toHaveLength(1);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(1);
  });

  it("stops when the collection is removed, and leaves what it had added", async () => {
    const { app, id, start, leftovers } = await setup((made) => {
      made.fileDelayMs = 150;
    });
    const started = await start(app);
    await waitFor(async () => ((await app.api("GET", `/api/jobs/${started.body.job.id}`)).body.job.progress.current ?? 0) >= 1, 30_000);
    expect((await app.api("DELETE", `/api/collections/${id}?deleteFiles=true`)).status).toBe(200);
    await waitFor(async () => (await app.api("GET", `/api/jobs/${started.body.job.id}`)).body.job.state === "cancelled");
    await app.ctx.jobs.whenIdle();
    const total = (await app.api("GET", "/api/documents")).body.total as number;
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThan(8);
    expect(leftovers()).toEqual([]);
  }, 60_000);
});

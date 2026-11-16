import fs from "node:fs";
import path from "node:path";
import type { DatabaseStatus } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { checkFile } from "../src/modules/database/inspect.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function start(env: Record<string, string> = {}): Promise<TestApp> {
  const app = await createTestApp(env);
  apps.push(app);
  return app;
}

const status = async (app: TestApp, extra = {}) => (await app.api("GET", "/api/database", undefined, extra)).body as DatabaseStatus;

/** Waits until the contents have been worked out, and returns the status with them. */
async function measured(app: TestApp, again = false): Promise<DatabaseStatus> {
  const before = (await status(app)).contents?.workedOutAt ?? 0;
  if (again) await app.api("POST", "/api/database/contents");
  for (let i = 0; i < 200; i += 1) {
    const now = await status(app);
    if (now.contents && !now.measuring && (!again || now.contents.workedOutAt >= before)) return now;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The contents were never worked out.");
}

/** Notes with enough text to fill a few hundred pages of the file. */
function fill(app: TestApp, count: number, size = 4000): void {
  const insert = app.ctx.sqlite.prepare(
    "INSERT INTO notes (id, title, content, content_text, created_at, updated_at) VALUES (?, ?, '{}', ?, 0, 0)",
  );
  app.ctx.sqlite.transaction(() => {
    for (let i = 0; i < count; i += 1) insert.run(`filler-${i}`, `Filler ${i}`, `${i} `.padEnd(size, "x"));
  })();
}

/** Leaves unused pages in the file, as removing things does. */
function leaveUnusedPages(app: TestApp): void {
  fill(app, 400);
  app.ctx.sqlite.prepare("DELETE FROM notes WHERE id LIKE 'filler-%'").run();
  app.ctx.sqlite.pragma("wal_checkpoint(TRUNCATE)");
}

describe("the database on the Storage screen", () => {
  it("describes a fresh installation: where the file is, its layout, and nothing in it yet", async () => {
    const app = await start();
    const first = await status(app);
    expect(first.file.path).toBe(path.join(app.dir, "data", "outpost.db"));
    expect(first.file.bytes).toBeGreaterThan(0);
    expect(first.file.pages * first.file.pageSize).toBeGreaterThan(0);
    expect(first.sqlite.journalMode).toBe("wal");
    expect(first.sqlite.version).toMatch(/^3\.\d+\.\d+$/);
    const journal = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../src/db/migrations/meta/_journal.json"), "utf8"));
    expect(first.schema).toMatchObject({ applied: journal.entries.length, known: journal.entries.length, state: "current" });
    expect(first.schema.lastAppliedAt).toBe(journal.entries.at(-1).when);
    expect(first.backup).toEqual({ lastAt: null, kind: null, scheduled: false });
    expect(first.lastCheck).toBeNull();
    expect(first.active).toBeNull();
    expect(first.disk.freeBytes).toBeGreaterThan(0);
    // Worked out away from the request, the first time anyone looks.
    expect(first.contents === null || first.measuring === false).toBe(true);

    const now = await measured(app);
    expect(now.contents!.counts.every((entry) => entry.count === 0)).toBe(true);
    expect(now.contents!.counts.map((entry) => entry.id)).toContain("passages");
    // Nothing in the answer is a setting's value or a key.
    expect(JSON.stringify(now)).not.toMatch(/passphrase|secret|privateKey/i);
  });

  it("counts what is kept, and says where every byte of the file goes", async () => {
    const app = await start();
    for (const title of ["One", "Two"]) expect((await app.api("POST", "/api/notes", { title })).status).toBe(200);
    expect((await app.api("POST", "/api/maps/markers", { name: "Hut", lat: 57.1, lon: -3.6 })).status).toBe(200);
    expect(
      (await app.api("POST", "/api/contacts", { name: { prefix: "", given: "Ann", additional: "", family: "Lee", suffix: "" } })).status,
    ).toBe(200);
    await app.ctx.jobs.whenIdle();

    const now = await measured(app, true);
    const counts = Object.fromEntries(now.contents!.counts.map((entry) => [entry.id, entry.count]));
    expect(counts).toMatchObject({ pages: 2, places: 1, contacts: 1, documents: 0, routes: 0, repeaters: 0 });
    // The two pages are in the search index too.
    expect(counts.passages).toBeGreaterThanOrEqual(2);

    expect(now.contents!.method).toBe("dbstat");
    const groups = now.contents!.groups!;
    expect(groups.map((group) => group.id)).toEqual(["search", "meaning", "library", "notes", "maps", "radio", "prepare", "other"]);
    // Every page belongs to a table or index or is unused, so the figures add up to the file exactly.
    const total = groups.reduce((sum, group) => sum + group.bytes, 0) + now.contents!.unusedBytes;
    expect(total).toBe(now.contents!.fileBytes);
    app.ctx.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    expect(fs.statSync(now.file.path).size).toBe(now.contents!.fileBytes);
  });

  it("checks the database, quickly and fully, as a job", async () => {
    const app = await start();
    const quick = await app.api("POST", "/api/database/check", { kind: "quick" });
    expect(quick.status).toBe(200);
    expect(quick.body.job.title).toBe("Check the database");
    await app.ctx.jobs.whenIdle();
    expect((await status(app)).lastCheck).toMatchObject({ kind: "quick", ok: true, problems: [] });

    expect((await app.api("POST", "/api/database/check", { kind: "full" })).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect((await status(app)).lastCheck).toMatchObject({ kind: "full", ok: true });
    expect((await app.api("POST", "/api/database/check", { kind: "thorough" })).status).toBe(400);
  });

  it("finds a database that has been damaged", async () => {
    const app = await start();
    fill(app, 300);
    app.ctx.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const pageSize = app.ctx.sqlite.pragma("page_size", { simple: true }) as number;
    const { pageno } = app.ctx.sqlite
      .prepare("SELECT pageno FROM dbstat WHERE name = 'notes' AND pagetype = 'leaf' ORDER BY pageno LIMIT 1 OFFSET 20")
      .get() as { pageno: number };
    const file = path.join(app.dir, "data", "outpost.db");

    // A copy first, damaged and checked on its own.
    const copy = path.join(app.dir, "copy.db");
    await app.ctx.sqlite.backup(copy);
    const damage = (target: string) => {
      const handle = fs.openSync(target, "r+");
      fs.writeSync(handle, Buffer.alloc(pageSize, 0xab), 0, pageSize, (pageno - 1) * pageSize);
      fs.closeSync(handle);
    };
    expect(checkFile(copy, "quick").ok).toBe(true);
    damage(copy);
    const quick = checkFile(copy, "quick");
    expect(quick.ok).toBe(false);
    expect(quick.problems.length).toBeGreaterThan(0);
    expect(checkFile(copy, "full").ok).toBe(false);

    // Then the database itself, through the route, on the server that has it open.
    damage(file);
    expect((await app.api("POST", "/api/database/check", { kind: "quick" })).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const check = (await status(app)).lastCheck!;
    expect(check.ok).toBe(false);
    expect(check.problems.length).toBeGreaterThan(0);
    expect(check.problems.length).toBeLessThanOrEqual(10);
  });

  it("reclaims unused space as a job, and refuses without the room for it", async () => {
    const app = await start();
    leaveUnusedPages(app);
    const before = await status(app);
    expect(before.file.unusedPages).toBeGreaterThan(100);
    expect(before.reclaim.neededBytes).toBeGreaterThan(before.disk.reserveBytes);

    // Too little room on the drive: refused, and the screen says so beforehand.
    app.ctx.services.database.setSpace(async () => ({ freeBytes: 1024 * 1024, totalBytes: 10 * 1024 * 1024, device: 1 }));
    expect((await status(app)).reclaim.enoughRoom).toBe(false);
    expect((await status(app)).disk.low).toBe(true);
    const refused = await app.api("POST", "/api/database/reclaim");
    expect(refused.status).toBe(507);
    expect(refused.body.error.message).toMatch(/does not have room/);
    expect(app.ctx.jobs.findBySubject("database")).toHaveLength(0);

    app.ctx.services.database.setSpace(undefined);
    const started = await app.api("POST", "/api/database/reclaim");
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(started.body.job.id)!.state).toBe("succeeded");
    const after = await status(app);
    expect(after.file.unusedPages).toBe(0);
    expect(after.lastVacuum!.afterBytes).toBeLessThan(after.lastVacuum!.beforeBytes);
    expect(after.lastVacuum!.beforeBytes).toBe(before.file.pages * before.file.pageSize);
    // Nothing left to reclaim now.
    expect((await app.api("POST", "/api/database/reclaim")).status).toBe(409);
  });

  it("does not reclaim space beside a backup, and backups wait while it runs", async () => {
    const app = await start();
    leaveUnusedPages(app);
    const { storage, backups, database } = app.ctx.services;
    const nas = await storage.add({ name: "NAS", path: path.join(app.dir, "storage", "nas"), kind: "network" });
    expect((await app.api("PATCH", "/api/backup/schedule", { locationId: nas.id })).status).toBe(200);

    // A backup under way: refused, naming it.
    let finishBackup = () => {};
    backups.setBeforeCheck(() => new Promise<void>((resolve) => (finishBackup = resolve)));
    const backup = await app.api("POST", "/api/backup/run");
    expect(backup.status).toBe(200);
    for (let i = 0; i < 100 && app.ctx.jobs.get(backup.body.job.id)!.progressMessage !== "Reading the backup back to check it"; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect((await status(app)).reclaim.waitingFor).toEqual(["Back up to NAS"]);
    const refused = await app.api("POST", "/api/database/reclaim");
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/Back up to NAS/);
    finishBackup();
    backups.setBeforeCheck(undefined);
    await app.ctx.jobs.whenIdle();

    // A backup taking its copy of the database (a download from Settings): refused too.
    let finishCopy = () => {};
    const copying = database.whileCopying(() => new Promise<void>((resolve) => (finishCopy = resolve)));
    const whileCopying = await app.api("POST", "/api/database/reclaim");
    expect(whileCopying.status).toBe(409);
    expect(whileCopying.body.error.message).toMatch(/copying the database/);
    finishCopy();
    await copying;

    // While space is being reclaimed: a backup waits its turn, a download is refused,
    // and so is anything that would change something.
    let finishVacuum = () => {};
    let held = false;
    database.setBeforeVacuum(
      () =>
        new Promise<void>((resolve) => {
          held = true;
          finishVacuum = resolve;
        }),
    );
    const reclaim = await app.api("POST", "/api/database/reclaim");
    expect(reclaim.status).toBe(200);
    for (let i = 0; i < 100 && !held; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(held).toBe(true);

    const waiting = await app.api("POST", "/api/backup/run");
    expect(waiting.status).toBe(409);
    expect(waiting.body.error.message).toMatch(/reclaiming unused space/);
    backups.tick();
    expect(app.ctx.jobs.findBySubject("backup").filter((job) => job.state === "queued")).toHaveLength(0);
    const download = await app.api("GET", "/api/backup/download");
    expect(download.status).toBe(409);
    expect((await app.api("POST", "/api/notes", { title: "Not now" })).status).toBe(409);
    // Reading goes on.
    expect((await app.api("GET", "/api/notes/tree")).status).toBeLessThan(500);
    expect((await status(app)).active).toMatchObject({ type: "database.vacuum", state: "running" });

    finishVacuum();
    database.setBeforeVacuum(undefined);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(reclaim.body.job.id)!.state).toBe("succeeded");
    expect((await app.api("POST", "/api/notes", { title: "Now" })).status).toBe(200);
    const after = await app.api("POST", "/api/backup/run");
    expect(after.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(after.body.job.id)!.state).toBe("succeeded");
    expect((await status(app)).backup).toMatchObject({ kind: "manual", scheduled: true });
  });

  it("reclaims space only from the computer Outpost runs on; anyone may check", async () => {
    const app = await start({ OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" });
    leaveUnusedPages(app);
    const phone = { remoteAddress: "192.168.1.20" };
    expect((await status(app, phone)).reclaim.right).toMatchObject({ allowed: false, reason: "remote" });
    const refused = await app.api("POST", "/api/database/reclaim", undefined, phone);
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/OUTPOST_ALLOW_REMOTE_ERASE/);
    expect((await app.api("POST", "/api/database/check", { kind: "quick" }, phone)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
  });
});

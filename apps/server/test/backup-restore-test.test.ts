import fs from "node:fs";
import path from "node:path";
import type { BackupSchedule, DeviceStatus, StoredBackup } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_FOLDER } from "../src/modules/backup/stored.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
// The status screen reads the computer's clock, so it is moved with the schedule's. Only the date: timers run as they do.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.useRealTimers();
});

const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, 16 + day, hours, minutes, 0).getTime();

async function world() {
  const app = await createTestApp();
  apps.push(app);
  const { storage, backups } = app.ctx.services;
  const nas = await storage.add({ name: "NAS", path: path.join(app.dir, "storage", "nas"), kind: "network" });
  const clock = {
    value: at(0, 10),
    get now() {
      return this.value;
    },
    set now(time: number) {
      this.value = time;
      vi.setSystemTime(time);
    },
  };
  clock.now = at(0, 10);
  backups.setClock(() => clock.now);
  await app.api("PATCH", "/api/backup/schedule", { locationId: nas.id, frequency: "daily", time: "03:00" });
  return {
    app,
    nas,
    clock,
    async goTo(time: number) {
      clock.now = time;
      backups.tick();
      await app.ctx.jobs.whenIdle();
    },
    stored: async (): Promise<StoredBackup[]> => (await app.api("GET", "/api/backup/stored")).body.backups,
    schedule: async (): Promise<BackupSchedule> => (await app.api("GET", "/api/backup/schedule")).body,
    check: async (id: string) =>
      ((await app.api("GET", "/api/device/status")).body as DeviceStatus).checks.find((check) => check.id === id),
  };
}

describe("test a restore", () => {
  it("opens a stored backup into a scratch copy, counts what it holds against what is here, and changes nothing", async () => {
    const w = await world();
    for (const title of ["Water", "Fire", "Shelter"]) expect((await w.app.api("POST", "/api/notes", { title })).status).toBeLessThan(300);
    await w.goTo(at(1, 3));
    const [backup] = await w.stored();
    expect(backup?.check).toBe("verified");
    // One more page after the backup: the test says the backup holds one fewer than is here now.
    await w.app.api("POST", "/api/notes", { title: "Food" });
    const before = fs.statSync(path.join(w.app.ctx.config.dataDir, "outpost.db")).mtimeMs;
    const notesBefore = (await w.app.api("GET", "/api/notes")).body;

    const started = await w.app.api("POST", `/api/backup/stored/${backup!.name}/test`);
    expect(started.status).toBe(200);
    await w.app.ctx.jobs.whenIdle();
    const result = (await w.schedule()).restoreTest!;
    expect(result).toMatchObject({ ok: true, problem: null, name: backup!.name, backupCreatedAt: at(1, 3) });
    expect(result.migrations?.backup).toBe(result.migrations?.current);
    expect(result.counts.find((entry) => entry.what === "Pages")).toEqual({ what: "Pages", inBackup: 3, now: 4 });

    // Nothing live was touched: no staged restore, no scratch left, the same pages.
    expect((await w.app.api("GET", "/api/backup/status")).body.restorePending).toBe(false);
    expect(fs.existsSync(path.join(w.app.ctx.config.dataDir, "restore-test"))).toBe(false);
    expect(fs.existsSync(path.join(w.app.ctx.config.dataDir, "restore-pending"))).toBe(false);
    expect((await w.app.api("GET", "/api/notes")).body).toEqual(notesBefore);
    expect(fs.statSync(path.join(w.app.ctx.config.dataDir, "outpost.db")).mtimeMs).toBeGreaterThanOrEqual(before);

    const check = await w.check("restore-test");
    expect(check).toMatchObject({ state: "good" });
    expect(check?.summary).toMatch(/its database is sound\. It holds 3 pages/);
  });

  it("reports a backup that has been damaged where it is kept, on the status screen as a problem", async () => {
    const w = await world();
    await w.goTo(at(1, 3));
    const [backup] = await w.stored();
    const file = path.join(w.nas.path, BACKUP_FOLDER, backup!.name);
    const size = fs.statSync(file).size;
    const handle = fs.openSync(file, "r+");
    fs.writeSync(handle, Buffer.alloc(256, 0xa5), 0, 256, Math.floor(size / 2));
    fs.closeSync(handle);

    await w.app.api("POST", `/api/backup/stored/${backup!.name}/test`);
    await w.app.ctx.jobs.whenIdle();
    const result = (await w.schedule()).restoreTest!;
    expect(result.ok).toBe(false);
    expect(result.problem).toBeTruthy();
    expect(result.counts).toEqual([]);
    expect(await w.check("restore-test")).toMatchObject({ state: "problem" });
  });

  it("asks for the passphrase of a protected backup and accepts only one of its own backups' names", async () => {
    const w = await world();
    expect((await w.app.api("POST", "/api/backup/stored/notes.db/test")).status).toBe(404);
    expect((await w.app.api("POST", "/api/backup/stored/outpost-backup-2026-11-17T03-00-00-000Z-scheduled.zip.enc/test")).status).toBe(400);
  });

  it("says on the status screen that no restore has been tested once backups are kept", async () => {
    const w = await world();
    expect(await w.check("restore-test")).toMatchObject({ state: "attention", summary: "No backup has been test-restored yet." });
  });
});

describe("the status screen on scheduled backups", () => {
  it("says how many are kept and how old, warns while the location is away at backup time, and says the next one was late", async () => {
    const w = await world();
    const { storage } = w.app.ctx.services;
    await w.goTo(at(1, 3));
    await w.goTo(at(2, 3));
    await w.stored();
    let check = await w.check("backup");
    expect(check?.state).toBe("good");
    expect(check?.summary).toMatch(/2 kept on NAS, the oldest/);

    // The NAS is off at 03:00.
    const off = path.join(w.app.dir, "off");
    fs.renameSync(w.nas.path, off);
    fs.mkdirSync(w.nas.path);
    await storage.refresh();
    await w.goTo(at(3, 3));
    check = await w.check("backup");
    expect(check?.state).toBe("attention");
    expect(check?.summary).toMatch(/was not made: NAS was not connected/);
    expect((await w.schedule()).away).toMatchObject({ dueAt: at(3, 3), locationName: "NAS", madeAt: null });

    // Back at nine: the backup is made, late, and the screen says so.
    w.clock.now = at(3, 9);
    fs.rmdirSync(w.nas.path);
    fs.renameSync(off, w.nas.path);
    await storage.refresh();
    await w.app.ctx.jobs.whenIdle();
    check = await w.check("backup");
    expect(check?.state).toBe("good");
    expect(check?.summary).toMatch(/made late: NAS was not connected when it was due/);
    expect((await w.schedule()).away).toMatchObject({ dueAt: at(3, 3), madeAt: at(3, 9) });
  });

  it("calls a nightly backup old after two days", async () => {
    const w = await world();
    await w.goTo(at(1, 3));
    w.clock.now = at(1, 20);
    expect((await w.check("backup"))?.state).toBe("good");
    // Two nights missed (the schedule is not let look, so nothing is made): two days and an hour.
    w.clock.now = at(3, 4);
    const check = await w.check("backup");
    expect(check?.state).toBe("attention");
  });
});

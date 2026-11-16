import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type BackupSchedule, nextBackupSlot, previousBackupSlot, type StoredBackup } from "@outpost/shared";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { JobRow } from "../src/core/jobs.ts";
import { verifyBackupFile } from "../src/modules/backup/archive.ts";
import { RETRY_AFTER_FAILURE_MS } from "../src/modules/backup/automatic.ts";
import { BACKUP_FOLDER, backupFileName, parseBackupName, recordName, retentionPlan } from "../src/modules/backup/stored.ts";
import { prepareDriveDatabase } from "../src/modules/portable/database.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Local time, as the schedule is: a Monday morning. */
const MONDAY_10 = new Date(2026, 10, 16, 10, 0, 0).getTime();
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, 16 + day, hours, minutes, 0).getTime();

interface World {
  app: TestApp;
  nas: { id: string; path: string; name: string };
  folder: string;
  clock: { now: number };
  /** Moves the clock, lets the schedule look, and waits for whatever it started. */
  goTo(time: number): Promise<void>;
  stored(): Promise<StoredBackup[]>;
  schedule(): Promise<BackupSchedule>;
}

async function world(env: Record<string, string> = {}, existingDir?: string): Promise<World> {
  const app = await createTestApp(env, existingDir);
  apps.push(app);
  const { storage, backups } = app.ctx.services;
  const nasPath = path.join(app.dir, "storage", "nas");
  const nas = storage.list().find((row) => row.path === nasPath) ?? (await storage.add({ name: "NAS", path: nasPath, kind: "network" }));
  const clock = { now: MONDAY_10 };
  backups.setClock(() => clock.now);
  return {
    app,
    nas,
    folder: path.join(nas.path, BACKUP_FOLDER),
    clock,
    async goTo(time) {
      clock.now = time;
      backups.tick();
      await app.ctx.jobs.whenIdle();
    },
    stored: async () => (await app.api("GET", "/api/backup/stored")).body.backups,
    schedule: async () => (await app.api("GET", "/api/backup/schedule")).body,
  };
}

const choose = (w: World, patch: Record<string, unknown> = {}) =>
  w.app.api("PATCH", "/api/backup/schedule", { locationId: w.nas.id, frequency: "daily", time: "03:00", ...patch });

const backupJobs = (w: World) => w.app.ctx.jobs.findBySubject("backup");

async function backUpNow(w: World): Promise<JobRow> {
  const started = await w.app.api("POST", "/api/backup/run");
  expect(started.status).toBe(200);
  await w.app.ctx.jobs.whenIdle();
  return w.app.ctx.jobs.get(started.body.job.id)!;
}

function damage(file: string): void {
  const size = fs.statSync(file).size;
  const handle = fs.openSync(file, "r+");
  // Past the manifest, inside the compressed database.
  fs.writeSync(handle, Buffer.alloc(256, 0xa5), 0, 256, Math.floor(size / 2));
  fs.closeSync(handle);
}

describe("when a backup is due", () => {
  it("works out the last and next time of a daily and a weekly schedule on the server's own clock", () => {
    const daily = { frequency: "daily" as const, time: "03:00", weekday: 0 };
    expect(previousBackupSlot(daily, at(0, 10))).toBe(at(0, 3));
    expect(previousBackupSlot(daily, at(0, 2, 59))).toBe(at(-1, 3));
    expect(previousBackupSlot(daily, at(0, 3))).toBe(at(0, 3));
    expect(nextBackupSlot(daily, at(0, 10))).toBe(at(1, 3));
    // 16 November 2026 is a Monday; weekday 3 is Wednesday.
    const weekly = { frequency: "weekly" as const, time: "21:30", weekday: 3 };
    expect(previousBackupSlot(weekly, at(0, 10))).toBe(at(-5, 21, 30));
    expect(nextBackupSlot(weekly, at(0, 10))).toBe(at(2, 21, 30));
    expect(previousBackupSlot(weekly, at(2, 21, 31))).toBe(at(2, 21, 30));
    expect(nextBackupSlot(weekly, at(2, 21, 31))).toBe(at(9, 21, 30));
  });

  it("is off until a location is chosen, and then says when the first one will be", async () => {
    const w = await world();
    const off = await w.schedule();
    expect(off.settings).toEqual({ locationId: null, frequency: "daily", time: "03:00", weekday: 0, keep: 7 });
    expect(off).toMatchObject({ location: null, nextRunAt: null, lastBackupAt: null, waiting: null, active: null });
    await w.goTo(at(5, 12));
    expect(backupJobs(w)).toEqual([]);
    expect((await w.app.api("POST", "/api/backup/run")).status).toBe(409);
    expect((await w.app.api("GET", "/api/backup/stored")).body).toMatchObject({ available: false, backups: [] });

    w.clock.now = MONDAY_10;
    const chosen = await choose(w);
    expect(chosen.status).toBe(200);
    expect(chosen.body).toMatchObject({
      location: { id: w.nas.id, name: "NAS", connected: true },
      nextRunAt: at(1, 3),
      folder: BACKUP_FOLDER,
    });
    // Choosing does not make one at once for a time that had already passed today.
    await w.goTo(at(0, 10, 1));
    expect(backupJobs(w)).toEqual([]);
    expect(fs.existsSync(w.folder)).toBe(false);
  });

  it("makes one backup at each scheduled time, verified, and not a second for the same time", async () => {
    const w = await world();
    await choose(w);
    await w.goTo(at(1, 2, 59));
    expect(backupJobs(w)).toEqual([]);

    await w.goTo(at(1, 3, 0));
    expect(backupJobs(w).map((job) => job.state)).toEqual(["succeeded"]);
    const [first] = await w.stored();
    expect(first).toMatchObject({ kind: "scheduled", createdAt: at(1, 3, 0), check: "verified", appVersion: "0.1.0" });
    expect(first!.sizeBytes).toBeGreaterThan(1000);
    expect(parseBackupName(first!.name)).toEqual({ createdAt: at(1, 3, 0), kind: "scheduled" });
    // Whole, under its final name, with the record of its check beside it and nothing else.
    expect(fs.readdirSync(w.folder).sort()).toEqual([first!.name, recordName(first!.name)].sort());
    expect((await w.schedule()).lastBackupAt).toBe(at(1, 3, 0));

    await w.goTo(at(1, 3, 1));
    await w.goTo(at(1, 23, 0));
    expect(backupJobs(w)).toHaveLength(1);
    await w.goTo(at(2, 3, 0));
    expect(backupJobs(w)).toHaveLength(2);
    expect((await w.stored()).map((backup) => backup.createdAt)).toEqual([at(2, 3, 0), at(1, 3, 0)]);
  });

  it("makes one backup, not one for each time missed, when the server was off for days", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-backup-off-"));
    let w = await world({}, dir);
    // Chosen three days ago by the real clock, so that the restart below finds one owed.
    w.clock.now = Date.now() - 3 * DAY;
    await choose(w);
    await w.app.close();
    apps.length = 0;

    w = await world({}, dir);
    // The server looked for itself when it started; nobody called tick.
    await w.app.ctx.jobs.whenIdle();
    expect(backupJobs(w).map((job) => job.state)).toEqual(["succeeded"]);
    expect(await w.stored()).toHaveLength(1);
    await w.app.close();
    apps.length = 0;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("holds the database still: a backup made while notes are being written reads back sound", async () => {
    const w = await world();
    await choose(w);
    const started = await w.app.api("POST", "/api/backup/run");
    for (let index = 0; index < 60; index += 1) {
      w.app.ctx.services.search.upsert({
        kind: "note",
        entityId: `n${index}`,
        title: `Note ${index}`,
        url: `/notes/n${index}`,
        sections: [{ text: "x".repeat(4000) }],
      });
      await new Promise((resolve) => setImmediate(resolve));
    }
    await w.app.ctx.jobs.whenIdle();
    expect(w.app.ctx.jobs.get(started.body.job.id)).toMatchObject({ state: "succeeded" });
    expect((await w.stored())[0]).toMatchObject({ kind: "manual", check: "verified" });
  });
});

describe("a location that goes away and comes back", () => {
  it("skips the backup, says why in plain words, writes nowhere else, and catches up when the location returns", async () => {
    const w = await world();
    const { storage } = w.app.ctx.services;
    await choose(w);
    await w.goTo(at(1, 3));
    expect(await w.stored()).toHaveLength(1);

    // The share is unmounted: the folder it was mounted on is still there, empty.
    const unplugged = path.join(w.app.dir, "unplugged");
    fs.renameSync(w.nas.path, unplugged);
    fs.mkdirSync(w.nas.path);
    await storage.refresh();

    await w.goTo(at(2, 3));
    await w.goTo(at(3, 3));
    await w.goTo(at(4, 9));
    expect(backupJobs(w)).toHaveLength(1);
    const waiting = await w.schedule();
    expect(waiting.lastBackupAt).toBe(at(1, 3));
    expect(waiting.location).toMatchObject({ name: "NAS", connected: false });
    expect(waiting.waiting).toMatchObject({ dueAt: at(4, 3), reason: "not_connected" });
    expect(waiting.waiting?.message).toBe(
      '"NAS" is not connected. The backup will be made when it is connected again, and nothing is written anywhere else in the meantime.',
    );
    expect((await w.app.api("GET", "/api/backup/stored")).body).toMatchObject({ available: false, backups: [] });
    const refused = await w.app.api("POST", "/api/backup/run");
    expect(refused.status).toBe(503);
    expect(refused.body.error.message).toMatch(/"NAS" is not connected.*Nothing is written anywhere else/);
    // Not into the empty mount point, and not into the default location or the data directory.
    expect(fs.readdirSync(w.nas.path)).toEqual([]);
    expect(fs.existsSync(path.join(storage.getDefault().path, BACKUP_FOLDER))).toBe(false);
    expect(fs.readdirSync(w.app.ctx.config.dataDir).filter((name) => /backup/.test(name))).toEqual([]);

    // Plugged back in. Nobody asks for a backup; the storage check noticing the location is enough.
    fs.rmdirSync(w.nas.path);
    fs.renameSync(unplugged, w.nas.path);
    await storage.refresh();
    await w.app.ctx.jobs.whenIdle();
    expect(backupJobs(w).map((job) => job.state)).toEqual(["succeeded", "succeeded"]);
    // One backup for the days missed, not three.
    expect((await w.stored()).map((backup) => backup.createdAt)).toEqual([at(4, 9), at(1, 3)]);
    expect(await w.schedule()).toMatchObject({ waiting: null, lastBackupAt: at(4, 9), lastFailure: null });
  });

  it("does not write into the folder a share was mounted on when the share went away a moment ago", async () => {
    const w = await world();
    await choose(w);
    // Gone, but the routine check has not run yet: the record still says it is connected.
    fs.renameSync(w.nas.path, path.join(w.app.dir, "unplugged"));
    fs.mkdirSync(w.nas.path);
    expect(w.app.ctx.services.storage.get(w.nas.id).status).toBe("available");

    const job = await backUpNow(w);
    expect(job.state).toBe("failed");
    expect(job.error).toBe('"NAS" is not connected, so no backup was made. Nothing was written anywhere else.');
    expect(fs.readdirSync(w.nas.path)).toEqual([]);
    expect((await w.schedule()).lastFailure).toMatchObject({ message: job.error });
  });

  it("does not make a scheduled backup wait an hour when it failed only because the location had just gone", async () => {
    const w = await world();
    await choose(w);
    const unplugged = path.join(w.app.dir, "unplugged");
    fs.renameSync(w.nas.path, unplugged);
    fs.mkdirSync(w.nas.path);
    // The record still says connected, so the schedule starts the job; the job looks again and stops.
    await w.goTo(at(1, 3));
    expect(backupJobs(w).map((job) => job.state)).toEqual(["failed"]);
    expect((await w.schedule()).waiting).toMatchObject({ reason: "not_connected", dueAt: at(1, 3) });
    expect(fs.readdirSync(w.nas.path)).toEqual([]);

    fs.rmdirSync(w.nas.path);
    fs.renameSync(unplugged, w.nas.path);
    w.clock.now = at(1, 3, 5);
    await w.app.ctx.services.storage.refresh();
    await w.app.ctx.jobs.whenIdle();
    expect(backupJobs(w).map((job) => job.state)).toEqual(["failed", "succeeded"]);
  });

  it("tries a failed scheduled backup again after an hour, not every minute", async () => {
    const w = await world();
    await choose(w);
    // A file where the folder should be: Outpost will not write through it.
    fs.writeFileSync(w.folder, "not a folder");
    await w.goTo(at(1, 3));
    expect(backupJobs(w).map((job) => job.state)).toEqual(["failed"]);
    const failed = await w.schedule();
    expect(failed.waiting).toMatchObject({ dueAt: at(1, 3), reason: "failed" });
    expect(failed.waiting?.message).toMatch(/is not an ordinary folder/);
    expect(fs.readFileSync(w.folder, "utf8")).toBe("not a folder");

    await w.goTo(at(1, 3, 30));
    expect(backupJobs(w)).toHaveLength(1);
    fs.rmSync(w.folder);
    await w.goTo(at(1, 3) + RETRY_AFTER_FAILURE_MS);
    expect(backupJobs(w).map((job) => job.state)).toEqual(["failed", "succeeded"]);
    expect(await w.schedule()).toMatchObject({ waiting: null, lastFailure: null });
  });

  it("will not follow a link named like its folder", async () => {
    const w = await world();
    await choose(w);
    const elsewhere = path.join(w.app.dir, "elsewhere");
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, w.folder);
    expect((await backUpNow(w)).state).toBe("failed");
    expect(fs.readdirSync(elsewhere)).toEqual([]);
  });
});

describe("keeping only so many", () => {
  it("removes its own oldest backups and leaves every other file in the folder alone", async () => {
    const w = await world();
    await choose(w, { keep: 2 });
    await w.goTo(at(1, 3));
    const [oldest] = await w.stored();

    // Things that are not Outpost's, some of them named to look as if they were.
    const foreign: Record<string, string> = {
      "notes.txt": "mine",
      "holiday-photos.zip": "not a backup",
      // The name of a download from Settings, which a person might well keep here.
      "outpost-backup-2026-11-16-03-00.zip": "a person's own copy",
      // Outpost's naming, but not a backup inside: older than everything, so first in line if names were trusted.
      [backupFileName(at(-300, 3), "scheduled")]: "this is not a zip",
      [`${backupFileName(at(-200, 3), "scheduled")}.part`]: "a part file too new to be called abandoned",
      "outpost-backup-old.verified.json": "{}",
    };
    for (const [name, content] of Object.entries(foreign)) fs.writeFileSync(path.join(w.folder, name), content);
    fs.mkdirSync(path.join(w.folder, "family"));
    fs.writeFileSync(path.join(w.folder, "family", backupFileName(at(-100, 3), "scheduled")), "deep");
    // A link named like a backup, pointing at something outside the folder.
    const precious = path.join(w.app.dir, "precious.txt");
    fs.writeFileSync(precious, "do not delete");
    const link = backupFileName(at(-50, 3), "scheduled");
    fs.symlinkSync(precious, path.join(w.folder, link));

    await w.goTo(at(2, 3));
    await w.goTo(at(3, 3));
    await w.goTo(at(4, 3));
    const listed = await w.stored();
    // The file that only looks like a backup is shown as unreadable, and is still there.
    expect(listed.filter((backup) => backup.check === "verified").map((backup) => backup.createdAt)).toEqual([at(4, 3), at(3, 3)]);
    expect(listed.filter((backup) => backup.check === "unreadable").map((backup) => backup.createdAt)).toEqual([at(-300, 3)]);
    expect(fs.existsSync(path.join(w.folder, oldest!.name))).toBe(false);
    expect(fs.existsSync(path.join(w.folder, recordName(oldest!.name)))).toBe(false);
    for (const [name, content] of Object.entries(foreign)) expect(fs.readFileSync(path.join(w.folder, name), "utf8"), name).toBe(content);
    expect(fs.readdirSync(path.join(w.folder, "family"))).toHaveLength(1);
    expect(fs.readFileSync(precious, "utf8")).toBe("do not delete");
    expect(fs.lstatSync(path.join(w.folder, link)).isSymbolicLink()).toBe(true);
    expect(w.app.ctx.jobs.get(backupJobs(w).at(-1)!.id)!.result).toMatchObject({ removed: [backupFileName(at(2, 3), "scheduled")] });
  });

  it("counts backups started by hand apart from scheduled ones, so pressing the button cannot push the schedule's out", async () => {
    const w = await world();
    await choose(w, { keep: 2 });
    await w.goTo(at(1, 3));
    await w.goTo(at(2, 3));
    for (let index = 0; index < 4; index += 1) {
      w.clock.now = at(2, 10, index);
      expect((await backUpNow(w)).state).toBe("succeeded");
    }
    const listed = await w.stored();
    expect(listed.filter((backup) => backup.kind === "scheduled").map((backup) => backup.createdAt)).toEqual([at(2, 3), at(1, 3)]);
    expect(listed.filter((backup) => backup.kind === "manual").map((backup) => backup.createdAt)).toEqual([at(2, 10, 3), at(2, 10, 2)]);
  });

  it("plans from verified backups only, and never plans to remove the newest verified one", () => {
    const backup = (day: number, check: StoredBackup["check"], kind: StoredBackup["kind"] = "scheduled"): StoredBackup => ({
      name: backupFileName(at(day, 3), kind),
      kind,
      createdAt: at(day, 3),
      sizeBytes: 1,
      appVersion: check === "unreadable" ? null : "0.1.0",
      check,
      checkedAt: null,
      protected: false,
      currentPassphrase: null,
    });
    const names = (days: number[]) => days.map((day) => backupFileName(at(day, 3), "scheduled"));
    // Fewer verified than the number to keep: nothing goes, however many there are.
    expect(
      retentionPlan([backup(5, "unverified"), backup(4, "verified"), backup(3, "unverified"), backup(2, "unverified")], "scheduled", 2),
    ).toEqual([]);
    // An unverified backup is not counted: the two kept are the two that passed.
    expect(
      retentionPlan(
        [backup(5, "unverified"), backup(4, "verified"), backup(3, "unverified"), backup(2, "verified"), backup(1, "verified")],
        "scheduled",
        2,
      ),
    ).toEqual(names([1]));
    // Older than the last one kept goes whether it passed or not; unreadable files never do.
    expect(
      retentionPlan([backup(4, "verified"), backup(3, "verified"), backup(2, "unverified"), backup(1, "unreadable")], "scheduled", 2),
    ).toEqual(names([2]));
    // Only the newest backup passed, and it is of the other kind: it is not this plan's to remove.
    expect(retentionPlan([backup(9, "verified", "manual"), backup(4, "verified"), backup(3, "verified")], "manual", 1)).toEqual([]);
    expect(retentionPlan([backup(4, "verified"), backup(3, "verified"), backup(2, "verified")], "scheduled", 1)).toEqual(names([3, 2]));
  });
});

describe("a backup that does not read back", () => {
  it("is found by the check: a damaged archive, a cut-off file and a damaged database all fail", async () => {
    const w = await world();
    await choose(w);
    await backUpNow(w);
    const [good] = await w.stored();
    const file = path.join(w.folder, good!.name);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-verify-"));
    expect((await verifyBackupFile(file, work)).manifest).toMatchObject({ format: "outpost-backup", appVersion: "0.1.0" });

    const damaged = path.join(work, "damaged.zip");
    fs.copyFileSync(file, damaged);
    damage(damaged);
    await expect(verifyBackupFile(damaged, work)).rejects.toThrow(/does not match its checksum|could not be read back/);

    const cut = path.join(work, "cut.zip");
    fs.writeFileSync(cut, fs.readFileSync(file).subarray(0, Math.floor(good!.sizeBytes * 0.7)));
    await expect(verifyBackupFile(cut, work)).rejects.toThrow(/could not be read back as a zip archive/);
    // The copies of the database made for checking are not left behind.
    expect(fs.readdirSync(work).sort()).toEqual(["cut.zip", "damaged.zip"]);
    fs.rmSync(work, { recursive: true, force: true });
  });

  it("is not listed while it is being checked, and is listed as verified once it has been", async () => {
    const w = await world();
    await choose(w);
    let checked = () => {};
    let checking = (_file: string) => {};
    const reached = new Promise<string>((resolve) => (checking = resolve));
    w.app.ctx.services.backups.setBeforeCheck(async (file) => {
      checking(file);
      await new Promise<void>((resolve) => (checked = resolve));
    });
    const started = await w.app.api("POST", "/api/backup/run");
    expect(started.status).toBe(200);
    // Part of the way through its check: whole on the disk, but not yet a backup anyone should be shown.
    expect(path.basename(await reached)).toMatch(/\.zip\.part$/);
    expect(await w.stored()).toEqual([]);
    checked();
    w.app.ctx.services.backups.setBeforeCheck(undefined);
    await w.app.ctx.jobs.whenIdle();
    expect((await w.stored()).map((backup) => backup.check)).toEqual(["verified"]);
    expect(fs.readdirSync(w.folder).filter((name) => name.endsWith(".part"))).toEqual([]);
  });

  it("is not counted, is reported, and stays out of the way of the next good one", async () => {
    const w = await world();
    await choose(w, { keep: 1 });
    await w.goTo(at(1, 3));
    const [good] = await w.stored();

    // The share returns different bytes from the ones written to it.
    w.app.ctx.services.backups.setBeforeCheck(async (file) => damage(file));
    await w.goTo(at(2, 3));
    const failed = backupJobs(w).at(-1)!;
    expect(failed.state).toBe("failed");
    expect(failed.error).toMatch(/was written to "NAS" but did not read back correctly/);
    expect(failed.error).toMatch(/shown as not verified, and is not counted as a backup/);

    const listed = await w.stored();
    expect(listed.map((backup) => [backup.createdAt, backup.check])).toEqual([
      [at(2, 3), "unverified"],
      [at(1, 3), "verified"],
    ]);
    // Keep is 1, and the good one is still there: the bad one did not take its place.
    expect(fs.existsSync(path.join(w.folder, good!.name))).toBe(true);
    expect(fs.existsSync(path.join(w.folder, recordName(listed[0]!.name)))).toBe(false);
    const status = await w.schedule();
    expect(status.lastBackupAt).toBe(at(1, 3));
    expect(status.lastFailure?.message).toBe(failed.error);
    expect(status.waiting).toMatchObject({ reason: "failed", dueAt: at(2, 3) });
    // Nothing of the check is left in the data directory.
    expect(fs.readdirSync(w.app.ctx.config.dataDir).filter((name) => name.startsWith("backup-snapshot-"))).toEqual([]);

    // Restoring it is refused too.
    const restore = await w.app.api("POST", `/api/backup/stored/${listed[0]!.name}/restore`);
    expect(restore.status).toBe(400);
    expect((await w.app.api("GET", "/api/backup/status")).body.restorePending).toBe(false);

    w.app.ctx.services.backups.setBeforeCheck(undefined);
    await w.goTo(at(3, 3));
    // Keep is still 1: the good backup is kept, and both older ones go, the one that never passed included.
    expect((await w.stored()).map((backup) => [backup.createdAt, backup.check])).toEqual([[at(3, 3), "verified"]]);
    expect(await w.schedule()).toMatchObject({ lastBackupAt: at(3, 3), lastFailure: null, waiting: null });
  });

  it("does not pile up archives or tries when the check goes on failing: the newest two that failed are kept, and less is tried each time", async () => {
    const w = await world();
    await choose(w);
    await w.goTo(at(1, 3));
    const [good] = await w.stored();
    // A backup a person copied here without its record: not verified, but not from a run that failed.
    const copied = backupFileName(at(-3, 3), "scheduled");
    fs.copyFileSync(path.join(w.folder, good!.name), path.join(w.folder, copied));
    fs.writeFileSync(path.join(w.folder, "notes.txt"), "mine");

    // No room for the copy of the database the check makes, say: every check fails from now on.
    w.app.ctx.services.backups.setBeforeCheck(async () => {
      throw new Error("There is no room to check it.");
    });
    const HOUR = 60 * MINUTE;
    for (let hour = 0; hour < 24; hour += 1) await w.goTo(at(2, 3) + hour * HOUR);

    // Tried at the time it was due, then after 1, 2, 4 and 8 hours: five times in a day, not twenty-four.
    const failed = backupJobs(w).filter((job) => job.state === "failed");
    expect(failed).toHaveLength(5);
    expect(failed.at(-1)!.error).toMatch(/shown as not verified, and is not counted as a backup/);
    const listed = await w.stored();
    expect(listed.map((backup) => [backup.createdAt, backup.check])).toEqual([
      [at(2, 3) + 15 * HOUR, "unverified"],
      [at(2, 3) + 7 * HOUR, "unverified"],
      [at(1, 3), "verified"],
      [at(-3, 3), "unverified"],
    ]);
    // Nothing of the three that were removed is left, and nothing that was not Outpost's failed run was touched.
    expect(fs.readdirSync(w.folder).filter((name) => name.endsWith(".zip"))).toHaveLength(4);
    expect(fs.readdirSync(w.folder).filter((name) => name.endsWith(".failed.json"))).toHaveLength(2);
    expect(fs.readFileSync(path.join(w.folder, "notes.txt"), "utf8")).toBe("mine");
    expect((await w.schedule()).waiting).toMatchObject({ reason: "failed", retryAt: at(2, 3) + 31 * HOUR });

    // The next day's backup is tried when it is due, whatever the wait had come to.
    await w.goTo(at(3, 3));
    expect(backupJobs(w).filter((job) => job.state === "failed")).toHaveLength(6);
    expect((await w.stored()).filter((backup) => backup.check === "unverified")).toHaveLength(3);

    // When the fault clears, the next try is a backup, and the hour's wait starts again.
    w.app.ctx.services.backups.setBeforeCheck(undefined);
    await w.goTo(at(4, 3));
    expect(backupJobs(w).at(-1)!.state).toBe("succeeded");
    expect(await w.schedule()).toMatchObject({ lastBackupAt: at(4, 3), lastFailure: null, waiting: null });
    expect(fs.existsSync(path.join(w.folder, copied))).toBe(true);
    expect(fs.existsSync(path.join(w.folder, good!.name))).toBe(true);
  });

  it("removes the archive of a failed run only while it is the file that run wrote", async () => {
    const w = await world();
    await choose(w);
    w.app.ctx.services.backups.setBeforeCheck(async () => {
      throw new Error("There is no room to check it.");
    });
    await w.goTo(at(1, 3));
    const [first] = await w.stored();
    // Somebody puts a file of their own under that name: it is no longer the one Outpost wrote.
    fs.writeFileSync(path.join(w.folder, first!.name), "a person's own file now");
    await w.goTo(at(1, 4));
    await w.goTo(at(1, 6));
    await w.goTo(at(1, 10));
    expect(backupJobs(w)).toHaveLength(4);
    expect(fs.readFileSync(path.join(w.folder, first!.name), "utf8")).toBe("a person's own file now");
    expect((await w.stored()).filter((backup) => backup.check === "unverified").map((backup) => backup.createdAt)).toEqual([
      at(1, 10),
      at(1, 6),
    ]);
  });

  it("shows a backup as not verified once its size no longer matches the record of its check", async () => {
    const w = await world();
    await choose(w);
    await backUpNow(w);
    const [good] = await w.stored();
    fs.appendFileSync(path.join(w.folder, good!.name), "extra");
    expect((await w.stored())[0]!.check).not.toBe("verified");
  });
});

describe("restoring from the list", () => {
  it("stages the chosen backup, and after a restart the data is back", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-backup-restore-"));
    let w = await world({}, dir);
    await w.app.api("PATCH", "/api/settings", { "downloads.concurrency": 5 });
    w.app.ctx.services.search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Tide tables",
      url: "/notes/n1",
      sections: [{ text: "High water at Dover." }],
    });
    const attachment = path.join(w.app.ctx.config.dataDir, "attachments", "ab", "photo.txt");
    fs.mkdirSync(path.dirname(attachment), { recursive: true });
    fs.writeFileSync(attachment, "a picture, honest");
    await choose(w);
    await backUpNow(w);
    const [backup] = await w.stored();

    // Then things go wrong.
    await w.app.api("PATCH", "/api/settings", { "downloads.concurrency": 1 });
    w.app.ctx.services.search.remove("note", "n1");
    fs.rmSync(attachment);

    const download = await w.app.app.inject({
      method: "GET",
      url: `/api/backup/stored/${backup!.name}/download`,
      headers: { host: "localhost" },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toBe(`attachment; filename="${backup!.name}"`);
    expect(download.rawPayload.length).toBe(backup!.sizeBytes);

    const staged = await w.app.api("POST", `/api/backup/stored/${backup!.name}/restore`);
    expect(staged.status).toBe(200);
    expect(staged.body).toMatchObject({ staged: true, appVersion: "0.1.0" });
    // Nothing changes until the restart, and the stored backup is still where it was.
    expect((await w.app.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(1);
    expect((await w.app.api("GET", "/api/backup/status")).body.restorePending).toBe(true);
    expect(await w.stored()).toHaveLength(1);
    await w.app.close();
    apps.length = 0;

    w = await world({}, dir);
    expect((await w.app.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(5);
    expect((await w.app.api("GET", "/api/search?q=dover")).body.total).toBe(1);
    expect(fs.readFileSync(attachment, "utf8")).toBe("a picture, honest");
    const status = (await w.app.api("GET", "/api/backup/status")).body;
    expect(status.restorePending).toBe(false);
    expect(status.previousData).toHaveLength(1);
    // The schedule came back with the rest, and the backups on the location are still listed.
    expect((await w.schedule()).location).toMatchObject({ name: "NAS", connected: true });
    await w.app.ctx.jobs.whenIdle();
    expect((await w.stored()).map((item) => [item.name, item.check])).toContainEqual([backup!.name, "verified"]);
    await w.app.close();
    apps.length = 0;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("accepts only the name of one of its own backups", async () => {
    const w = await world();
    await choose(w);
    await backUpNow(w);
    fs.writeFileSync(path.join(w.folder, "holiday-photos.zip"), "mine");
    fs.writeFileSync(path.join(w.nas.path, "secret.zip"), "outside the folder");
    const names = [
      "holiday-photos.zip",
      "..%2Fsecret.zip",
      "..%2F.outpost-location.json",
      `${backupFileName(at(0, 3), "manual")}.part`,
      backupFileName(at(-9, 3), "manual"),
    ];
    for (const name of names) {
      for (const [method, suffix] of [
        ["GET", "/download"],
        ["POST", "/restore"],
        ["DELETE", ""],
      ] as const) {
        expect((await w.app.api(method, `/api/backup/stored/${name}${suffix}`)).status, `${method} ${name}`).toBe(404);
      }
    }
    expect(fs.readFileSync(path.join(w.folder, "holiday-photos.zip"), "utf8")).toBe("mine");
    expect(fs.existsSync(path.join(w.nas.path, "secret.zip"))).toBe(true);
    expect(fs.existsSync(path.join(w.nas.path, ".outpost-location.json"))).toBe(true);
  });

  it("deletes one backup and its record when asked, and nothing else", async () => {
    const w = await world();
    await choose(w);
    w.clock.now = at(0, 11);
    await backUpNow(w);
    w.clock.now = at(0, 12);
    await backUpNow(w);
    const [newer, older] = await w.stored();
    expect((await w.app.api("DELETE", `/api/backup/stored/${older!.name}`)).status).toBe(200);
    expect(fs.readdirSync(w.folder).sort()).toEqual([newer!.name, recordName(newer!.name)].sort());
  });
});

describe("who may restore, delete, and keep fewer", () => {
  const phone = { remoteAddress: "192.168.1.20" };
  const lan = { OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" };

  it("refuses another device, saying why and what to do, and still lets it back up and download", async () => {
    const w = await world(lan);
    await choose(w, { keep: 3 });
    await backUpNow(w);
    const [backup] = await w.stored();
    const explains =
      /can only be done on the computer Outpost runs on\. Open Outpost there, or start it with OUTPOST_ALLOW_REMOTE_ERASE=true/;

    expect((await w.app.api("GET", "/api/backup/status", undefined, phone)).body.right).toEqual({
      allowed: false,
      reason: "remote",
      option: "OUTPOST_ALLOW_REMOTE_ERASE",
    });
    expect((await w.app.api("GET", "/api/backup/schedule", undefined, phone)).body.right).toMatchObject({
      allowed: false,
      reason: "remote",
    });

    const fromList = await w.app.api("POST", `/api/backup/stored/${backup!.name}/restore`, undefined, phone);
    expect(fromList.status).toBe(403);
    expect(fromList.body.error.message).toMatch(/^Restoring a backup can only be done/);
    expect(fromList.body.error.message).toMatch(explains);

    // An uploaded file is refused before any of it is read.
    const upload = await w.app.app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
      payload: fs.readFileSync(path.join(w.folder, backup!.name)),
      ...phone,
    });
    expect(upload.statusCode).toBe(403);
    expect(upload.json().error.message).toMatch(explains);
    expect(fs.existsSync(path.join(w.app.ctx.config.dataDir, "restore-pending"))).toBe(false);

    const deleted = await w.app.api("DELETE", `/api/backup/stored/${backup!.name}`, undefined, phone);
    expect(deleted.status).toBe(403);
    expect(deleted.body.error.message).toMatch(/^Deleting a stored backup can only be done/);
    expect(fs.existsSync(path.join(w.folder, backup!.name))).toBe(true);

    // Keeping fewer deletes older backups at the next run, so it is the same act.
    const fewer = await w.app.api("PATCH", "/api/backup/schedule", { keep: 1 }, phone);
    expect(fewer.status).toBe(403);
    expect(fewer.body.error.message).toMatch(/^Keeping fewer backups, which deletes older ones, can only be done/);
    expect((await w.schedule()).settings.keep).toBe(3);
    // The schedule is not a setting the open settings route knows, so there is no way round.
    expect((await w.app.api("PATCH", "/api/settings", { "backup.schedule": { keep: 1 } }, phone)).status).toBe(400);

    // A proxy on this computer makes every request look local; a forwarded request is not trusted.
    const proxied = await w.app.api("DELETE", `/api/backup/stored/${backup!.name}`, undefined, {
      headers: { "x-forwarded-for": "192.168.1.20" },
    });
    expect(proxied.status).toBe(403);

    // What does not take anything away is open to every device, as the rest of Outpost is.
    expect((await w.app.api("PATCH", "/api/backup/schedule", { keep: 5, time: "04:30" }, phone)).status).toBe(200);
    expect((await w.app.api("GET", "/api/backup/stored", undefined, phone)).body.backups).toHaveLength(1);
    expect((await w.app.api("GET", `/api/backup/stored/${backup!.name}/download`, undefined, phone)).status).toBe(200);
    w.clock.now = at(0, 11);
    const started = await w.app.api("POST", "/api/backup/run", undefined, phone);
    expect(started.status).toBe(200);
    await w.app.ctx.jobs.whenIdle();
    expect(await w.stored()).toHaveLength(2);

    // At the computer itself all of it is allowed.
    expect((await w.app.api("GET", "/api/backup/status")).body.right).toMatchObject({ allowed: true, reason: "local" });
    expect((await w.app.api("PATCH", "/api/backup/schedule", { keep: 1 })).status).toBe(200);
    expect((await w.app.api("DELETE", `/api/backup/stored/${backup!.name}`)).status).toBe(200);
    expect((await w.app.api("POST", `/api/backup/stored/${(await w.stored())[0]!.name}/restore`)).status).toBe(200);
  });

  it("allows it from anywhere when the person starting Outpost opted in", async () => {
    const w = await world({ ...lan, OUTPOST_ALLOW_REMOTE_ERASE: "true" });
    await choose(w, { keep: 3 });
    await backUpNow(w);
    const [backup] = await w.stored();
    expect((await w.app.api("GET", "/api/backup/status", undefined, phone)).body.right).toMatchObject({ allowed: true, reason: "option" });
    expect((await w.app.api("PATCH", "/api/backup/schedule", { keep: 1 }, phone)).status).toBe(200);
    expect((await w.app.api("POST", `/api/backup/stored/${backup!.name}/restore`, undefined, phone)).status).toBe(200);
    expect((await w.app.api("DELETE", `/api/backup/stored/${backup!.name}`, undefined, phone)).status).toBe(200);
  });

  it("checks what is chosen: a real location that is connected, and a time and number that make sense", async () => {
    const w = await world();
    expect((await w.app.api("PATCH", "/api/backup/schedule", { locationId: "nowhere" })).status).toBe(404);
    for (const bad of [
      { time: "25:00" },
      { time: "3am" },
      { keep: 0 },
      { keep: 61 },
      { weekday: 7 },
      { frequency: "hourly" },
      { path: "/etc" },
    ]) {
      expect((await w.app.api("PATCH", "/api/backup/schedule", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    fs.renameSync(w.nas.path, path.join(w.app.dir, "unplugged"));
    await w.app.ctx.services.storage.refresh();
    const away = await choose(w);
    expect(away.status).toBe(503);
    expect(away.body.error.message).toBe('"NAS" is not connected. Connect it, then choose it for backups.');
    expect((await w.schedule()).settings.locationId).toBeNull();
  });

  it("switching off keeps what was made, and a location that is removed is said to be gone", async () => {
    const w = await world();
    await choose(w);
    await backUpNow(w);
    const files = fs.readdirSync(w.folder);
    expect((await w.app.api("PATCH", "/api/backup/schedule", { locationId: null })).body).toMatchObject({
      location: null,
      nextRunAt: null,
    });
    await w.goTo(at(9, 3));
    expect(fs.readdirSync(w.folder)).toEqual(files);

    await choose(w);
    w.app.ctx.services.storage.remove(w.nas.id);
    await w.goTo(at(20, 3));
    const gone = await w.schedule();
    expect(gone.location).toBeNull();
    expect(gone.waiting).toMatchObject({ reason: "location_removed" });
    expect(fs.readdirSync(w.folder)).toEqual(files);
  });
});

describe("what does not travel", () => {
  it("leaves the schedule behind when the library is copied to a portable drive", async () => {
    const w = await world();
    await choose(w);
    await backUpNow(w);
    const copy = path.join(w.app.dir, "drive.db");
    await w.app.ctx.sqlite.backup(copy);
    prepareDriveDatabase(copy, {
      locationId: "drive",
      locationName: "This drive",
      locationPath: "/drive",
      collectionIds: [],
      documentIds: [],
      madeFrom: "home",
    });
    const drive = new Database(copy, { readonly: true });
    try {
      expect(drive.prepare("SELECT count(*) AS n FROM settings WHERE key LIKE 'backup.%'").get()).toEqual({ n: 0 });
      expect(drive.prepare("SELECT count(*) AS n FROM library_meta WHERE key LIKE 'backup.%'").get()).toEqual({ n: 0 });
    } finally {
      drive.close();
    }
    // At home it is still chosen.
    expect((await w.schedule()).settings.locationId).toBe(w.nas.id);
  });
});

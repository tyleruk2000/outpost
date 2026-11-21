/**
 * Backups made on a schedule and kept on a storage location.
 *
 * Off until a person chooses a location. Then, once a day or once a week at the time
 * they chose, a job writes a backup into a folder of Outpost's own on that location,
 * reads it back to check it, and removes the ones past keeping.
 *
 * Three rules shape the code:
 *
 *  - A backup is only ever written to the chosen location. If that location is not
 *    connected when a backup is due, nothing is written anywhere; the backup is made
 *    when the location is next seen, or when the server next starts and finds it.
 *  - A backup counts once it has been read back whole and its database has passed
 *    SQLite's integrity check. One that has not is kept, shown as not verified, and
 *    never counted towards the number to keep. Only the newest few of those are kept
 *    (`setAsideFailed` in `stored.ts`), and a scheduled backup that goes on failing is
 *    tried less and less often, so a fault that lasts cannot fill the location.
 *  - Only Outpost's own backups are ever deleted here (see `stored.ts`), and what
 *    removes a person's way back (restoring, deleting a stored backup, keeping fewer)
 *    is accepted only where "erase everything" is (see `right.ts`).
 *
 * Nothing about a network share's sign-in is read or stored: the location is a mounted
 * folder like any other, and this module only writes files into it.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  BACKUP_KEEP_DEFAULT,
  BACKUP_KEEP_MAX,
  type BackupAway,
  type BackupSchedule,
  type BackupScheduleSettings,
  type BackupsKept,
  nextBackupSlot,
  previousBackupSlot,
  type RestoreTestResult,
  type StoredBackup,
  type StoredBackupKind,
  type StoredBackupsResponse,
} from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, messageOf, notFound } from "../../core/errors.ts";
import { resolveInside, sizeOnDisk } from "../../core/fs-safe.ts";
import { type JobRow, type JobRun, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { syncedWriteStream } from "../../core/synced-write.ts";
import { settings as settingsTable } from "../../db/schema.ts";
import type { LocationRow } from "../storage/service.ts";
import { DATA_FOLDERS, startBackup, verifyBackupFile } from "./archive.ts";
import { assertPassphraseRight, PROTECTED_TYPE, type ProtectionService, passphraseField, readProtection } from "./protection.ts";
import type { RestoreStager } from "./restore.ts";
import { registerRestoreTest } from "./restore-test.ts";
import { assertBackupRight, backupRight } from "./right.ts";
import {
  applyRetention,
  BACKUP_FOLDER,
  backupFileName,
  clearStaleParts,
  deleteStored,
  isBackupName,
  listStored,
  partName,
  recordName,
  setAsideFailed,
  writeRecord,
} from "./stored.ts";

export const BACKUP_JOB = "backup.run";
const QUEUE = "backup";
const SUBJECT = "backup";
/**
 * The schedule is kept in the settings table, so that "reset settings" and "erase
 * everything" switch automatic backups off like any other setting. It is not in the
 * settings schema, because `PATCH /api/settings` is open to every device and one part
 * of this (keeping fewer backups) is not.
 */
const SETTING_KEY = "backup.schedule";
/** What has happened so far. A fact about this library, not a setting, so it is kept with those. */
const STATE_KEY = "backup.state";
/**
 * The longest the schedule sleeps before looking again, even when nothing is due sooner:
 * a timer counts time passing, and the clock it is set from can be changed meanwhile (a
 * new time zone, a Raspberry Pi that boots without the time and is told it later). A
 * timer also counts only the time the computer is awake: a Mac asleep through the time
 * a backup was due wakes with its timer where it was, so this is short enough that the
 * backup is made soon after it wakes.
 */
const LONGEST_SLEEP_MS = 15 * 60 * 1000;
/** While space is being reclaimed in the database, how soon to look again. */
const HELD_RETRY_MS = 60_000;
/** After a scheduled backup fails, how long before it is tried again. Doubled for each failure in a row. */
export const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
/** The longest wait between tries, however many have failed. */
export const RETRY_LONGEST_MS = 24 * 60 * 60 * 1000;

/** How long to wait after the `attempts`-th failure in a row: an hour, then two, four, eight, up to a day. */
export function retryWaitMs(attempts: number): number {
  const doublings = Math.min(Math.max(1, Math.floor(attempts)) - 1, 10);
  return Math.min(RETRY_AFTER_FAILURE_MS * 2 ** doublings, RETRY_LONGEST_MS);
}

const settingsShape = {
  locationId: z.string().min(1).max(100).nullable(),
  frequency: z.enum(["daily", "weekly"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Give the time as hours and minutes, such as 03:00."),
  weekday: z.number().int().min(0).max(6),
  keep: z.number().int().min(1).max(BACKUP_KEEP_MAX),
};
const patchBody = z.object(settingsShape).partial().strict();
const restoreBody = z.object({ passphrase: passphraseField.optional() }).strict();
const storedSettings = z.object({ ...settingsShape, setAt: z.number() });
type StoredSettings = z.infer<typeof storedSettings>;

const OFF: StoredSettings = { locationId: null, frequency: "daily", time: "03:00", weekday: 0, keep: BACKUP_KEEP_DEFAULT, setAt: 0 };

interface State {
  /** When the newest backup that passed its check was made. */
  lastBackupAt: number | null;
  /** When the newest scheduled backup that passed its check was started. */
  lastScheduledAt: number | null;
  /**
   * The last run that failed, until one succeeds. `dueAt` is set for a scheduled run.
   * `attempts` counts the scheduled runs that have failed in a row since the last backup that was made.
   */
  failure: { at: number; message: string; dueAt: number | null; attempts?: number } | null;
  /** The last scheduled time the location was away, and when the backup owed for it was made. */
  away: BackupAway | null;
  /** The backups on the location, as last listed. */
  kept: BackupsKept | null;
}

interface RunPayload extends Record<string, unknown> {
  kind: StoredBackupKind;
  dueAt?: number;
}

export interface BackupOverview {
  frequency: BackupScheduleSettings["frequency"] | null;
  locationName: string | null;
  /** A scheduled backup owed and not made because the location is not connected (or was removed). */
  missing: { dueAt: number } | null;
  away: BackupAway | null;
  kept: BackupsKept | null;
  restoreTest: RestoreTestResult | null;
}

/** How many verified backups there are, and how old the newest and the oldest are. */
export function summariseKept(backups: StoredBackup[], at: number): BackupsKept {
  const verified = backups.filter((backup) => backup.check === "verified").map((backup) => backup.createdAt);
  return {
    at,
    verified: verified.length,
    newestAt: verified.length > 0 ? Math.max(...verified) : null,
    oldestAt: verified.length > 0 ? Math.min(...verified) : null,
  };
}

export interface BackupsService {
  /**
   * Starts a scheduled backup if one is due and can be made, then sleeps until the next
   * time one could be. Run then, at start, when storage changes and when the schedule does.
   */
  tick(): void;
  /** When the schedule will next look by itself, or null when nothing is scheduled. For tests. */
  nextWake(): number | null;
  /** The newest backup that passed its check, how it was started, and whether backups are scheduled. For the Storage screen. */
  last(): { lastAt: number | null; kind: StoredBackupKind | null; scheduled: boolean };
  /** For the status screen: how often, where, a backup owed while the location is away, what is kept, the last restore test. */
  overview(): BackupOverview;
  /** Tests move time: everything the schedule decides is decided by this clock. */
  setClock(now: () => number): void;
  /** Tests damage a backup between its being written and its being read back. */
  setBeforeCheck(hook: ((file: string) => Promise<void>) | undefined): void;
  /** Tests fix how much work a passphrase is put through (see `sealed.ts`), so that each does not spend a second on it. */
  setPassphraseCost(logN: number | undefined): void;
}

declare module "../../core/context.ts" {
  interface Services {
    backups: BackupsService;
  }
}

export function registerAutomaticBackups(
  app: FastifyInstance,
  ctx: AppContext,
  stager: RestoreStager,
  protection: ProtectionService,
): void {
  const { storage } = ctx.services;
  const { dataDir } = ctx.config;
  let clock: () => number = Date.now;
  let beforeCheck: ((file: string) => Promise<void>) | undefined;
  let closed = false;
  /** The last "due but not made" the browser was told about, so it is told once, not every minute. */
  let announced = "";

  // ── What was chosen, and what has happened ──

  function readSettings(): StoredSettings {
    const row = ctx.db.select().from(settingsTable).where(eq(settingsTable.key, SETTING_KEY)).get();
    const parsed = storedSettings.safeParse(row?.value);
    return parsed.success ? parsed.data : OFF;
  }

  function writeSettings(value: StoredSettings): void {
    const now = Date.now();
    ctx.db
      .insert(settingsTable)
      .values({ key: SETTING_KEY, value, updatedAt: now })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: now } })
      .run();
  }

  function readState(): State {
    const row = ctx.sqlite.prepare("SELECT value FROM library_meta WHERE key = ?").get(STATE_KEY) as { value: string } | undefined;
    try {
      const parsed = JSON.parse(row?.value ?? "null") as Partial<State> | null;
      return {
        lastBackupAt: parsed?.lastBackupAt ?? null,
        lastScheduledAt: parsed?.lastScheduledAt ?? null,
        failure: parsed?.failure ?? null,
        away: parsed?.away ?? null,
        kept: parsed?.kept ?? null,
      };
    } catch {
      return { lastBackupAt: null, lastScheduledAt: null, failure: null, away: null, kept: null };
    }
  }

  function writeState(state: State): void {
    ctx.sqlite
      .prepare("INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(STATE_KEY, JSON.stringify(state));
  }

  const changed = () => ctx.events.publish({ type: "backup.changed" });
  const findLocation = (id: string): LocationRow | undefined => storage.list().find((row) => row.id === id);

  function activeJob(): JobRow | undefined {
    return ctx.jobs
      .findBySubject(SUBJECT)
      .filter((job) => job.state === "queued" || job.state === "running" || job.state === "paused")
      .at(-1);
  }

  /** The scheduled time a backup is owed for, or null when the last one due has been made. */
  function dueSlot(settings: StoredSettings, state: State, now: number): number | null {
    if (!settings.locationId) return null;
    const slot = previousBackupSlot(settings, now);
    // Choosing or changing the schedule starts it afresh: the first backup is at the
    // next time chosen, not at once for a time that passed before it was chosen.
    return slot > Math.max(state.lastScheduledAt ?? 0, settings.setAt) ? slot : null;
  }

  function notConnected(location: LocationRow): string {
    return `"${location.name}" is not connected. The backup will be made when it is connected again, and nothing is written anywhere else in the meantime.`;
  }
  const REMOVED = "The storage location backups were kept on is no longer one of this Outpost's locations. Choose where to keep them.";

  // ── The schedule ──

  let timer: NodeJS.Timeout | undefined;
  let wakeAt: number | null = null;

  /** Sleeps until `at` (by the schedule's clock), or not at all. */
  function sleepUntil(at: number | null): void {
    clearTimeout(timer);
    timer = undefined;
    wakeAt = at;
    if (at === null || closed) return;
    timer = setTimeout(tick, Math.min(Math.max(at - clock(), 0), LONGEST_SLEEP_MS));
    timer.unref();
  }

  function tick(): void {
    if (!closed) sleepUntil(look());
  }

  /** Starts a backup if one is due and can be made; answers when to look next, or null for never. */
  function look(): number | null {
    // Space is being reclaimed in the database, which nothing can write to meanwhile. The
    // backup is made once that has finished.
    if (ctx.jobs.holding) return clock() + HELD_RETRY_MS;
    const settings = readSettings();
    if (!settings.locationId) return null;
    const state = readState();
    const now = clock();
    const next = nextBackupSlot(settings, now);
    const due = dueSlot(settings, state, now);
    // Nothing owed, or a backup is being made (its end looks again): the next time is next.
    if (due === null || activeJob()) return next;
    const location = findLocation(settings.locationId);
    if (location?.status !== "available") {
      // Skipped, not redirected: there is no second place a backup may go. A location
      // coming back is a storage change, which looks again.
      const key = `${due}|${location?.id ?? "removed"}`;
      if (announced !== key) {
        announced = key;
        // Remembered, so that the status screen can say the backup for this time was late and why.
        if (location && state.away?.dueAt !== due)
          writeState({ ...state, away: { dueAt: due, locationName: location.name, madeAt: null } });
        ctx.log.warn({ location: settings.locationId, dueAt: due }, "scheduled backup not made: its storage location is not connected");
        changed();
      }
      return next;
    }
    if (state.failure?.dueAt === due) {
      const retryAt = state.failure.at + retryWaitMs(state.failure.attempts ?? 1);
      if (now < retryAt) return Math.min(retryAt, next);
    }
    announced = "";
    ctx.jobs.enqueue<RunPayload>(BACKUP_JOB, { kind: "scheduled", dueAt: due }, { title: `Back up to ${location.name}`, subject: SUBJECT });
    return next;
  }

  // ── One backup ──

  /** Room the backup could need: the database and the folders that go with it, before compression. */
  async function estimate(): Promise<number> {
    const pages = ctx.sqlite.pragma("page_count", { simple: true }) as number;
    const pageSize = ctx.sqlite.pragma("page_size", { simple: true }) as number;
    let bytes = pages * pageSize;
    for (const folder of DATA_FOLDERS) bytes += await sizeOnDisk(path.join(dataDir, folder));
    return bytes;
  }

  /** The location as it is this moment, not as it was at the last routine check. */
  async function connectedLocation(id: string): Promise<LocationRow> {
    // A share that has just gone leaves an empty folder where it was mounted. Checking
    // for the location's marker now is what stops a backup being written into that.
    await storage.refresh();
    const location = findLocation(id);
    if (!location) throw new AppError("not_found", REMOVED);
    if (location.status !== "available") {
      throw new AppError(
        "storage_unavailable",
        `"${location.name}" is not connected, so no backup was made. Nothing was written anywhere else.`,
      );
    }
    return location;
  }

  async function ensureFolder(folder: string, location: LocationRow): Promise<void> {
    const stat = await fs.promises.lstat(folder).catch(() => undefined);
    if (!stat) {
      await fs.promises.mkdir(folder);
      return;
    }
    // A link would send the backup somewhere other than the location that was chosen.
    if (!stat.isDirectory()) {
      throw new AppError(
        "conflict",
        `"${BACKUP_FOLDER}" on "${location.name}" is not an ordinary folder, so Outpost will not write backups there.`,
      );
    }
  }

  /** Asks the system to put the file on the disk or the server now. Some network filesystems cannot; the read-back still checks it. */
  async function flushToDisk(file: string): Promise<void> {
    const handle = await fs.promises.open(file, "r+");
    try {
      await handle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOTSUP" && code !== "EINVAL" && code !== "ENOSYS") throw error;
    } finally {
      await handle.close();
    }
  }

  async function writeBackup(kind: StoredBackupKind, run: JobRun<RunPayload>, now: number): Promise<Record<string, unknown>> {
    const settings = readSettings();
    if (!settings.locationId) throw new PermanentJobError("Automatic backups were switched off before this backup started.");
    const location = await connectedLocation(settings.locationId);
    const folder = storage.resolve(location.id, BACKUP_FOLDER);
    await ensureFolder(folder, location);
    await clearStaleParts(folder);
    await storage.assertSpace(location.id, await estimate());
    run.signal.throwIfAborted();

    run.progress({ message: "Copying the database" });
    const backup = await startBackup(ctx, undefined, now);
    const name = backupFileName(Date.parse(backup.manifest.createdAt), kind, backup.fileKey !== undefined);
    const file = path.join(folder, name);
    const part = path.join(folder, partName(name));
    const discard = async () => {
      backup.fileKey?.fill(0);
      backup.archive.abort();
      backup.cleanup();
      await fs.promises.rm(part, { force: true }).catch(() => undefined);
    };
    try {
      run.progress({ message: `Writing the backup to ${location.name}` });
      // Under a temporary name until it is whole, and flushed to the disk before it is renamed.
      await pipeline(backup.output, syncedWriteStream(part, { flags: "wx" }), { signal: run.signal });
      await flushToDisk(part);
      // The same folder must still be the location: a share can go away part-way through.
      const still = await connectedLocation(location.id).catch(() => undefined);
      if (!still || storage.resolve(still.id, BACKUP_FOLDER) !== folder) {
        throw new AppError(
          "storage_unavailable",
          `"${location.name}" was disconnected while the backup was being written, so no backup was made. Nothing was written anywhere else.`,
        );
      }
      if (await fs.promises.lstat(file).catch(() => undefined)) throw conflict(`A backup named ${name} is already there.`);
    } catch (error) {
      await discard();
      throw error;
    }

    // It is checked under its temporary name, and takes its own only once the record of its check is
    // written beside it. (Renamed first, it was listed while it was being checked, as "Not verified:
    // its check did not finish or did not pass", which is not what was happening.)
    run.progress({ message: "Reading the backup back to check it" });
    const bytes = (await fs.promises.stat(part)).size;
    let check: Awaited<ReturnType<typeof verifyBackupFile>>;
    try {
      await beforeCheck?.(part);
      // A protected backup is read back with the key of this one file, which this run
      // still holds and which is wiped as soon as the check is over. After that only
      // the passphrase opens it, and the passphrase is not here.
      check = await verifyBackupFile(part, dataDir, run.signal, backup.fileKey ? { fileKey: backup.fileKey } : undefined);
    } catch (error) {
      backup.fileKey?.fill(0);
      // Kept under its own name, as one that did not pass, as it was before the check was made under the temporary one.
      await fs.promises.rename(part, file).catch(() => fs.promises.rm(part, { force: true }).catch(() => undefined));
      // Whether it failed its check or the check was cut short, this run's archive has not been shown to be good.
      const aside = await setAsideFailed(folder, name, bytes, Date.now()).catch(() => ({ kept: true, removed: [] as string[] }));
      if (aside.removed.length > 0) run.log.info({ removed: aside.removed }, "older backups that failed their check were removed");
      if (run.signal.aborted) throw error;
      throw new PermanentJobError(
        `The backup was written to "${location.name}" but did not read back correctly. ${messageOf(error)} ${
          aside.kept
            ? `It is kept as ${name}, shown as not verified, and is not counted as a backup.`
            : "It could not be marked as having failed its check, so it was removed."
        }`,
        "verification",
      );
    }
    backup.fileKey?.fill(0);
    try {
      await writeRecord(folder, name, bytes, check, Date.now());
      await fs.promises.rename(part, file);
    } catch (error) {
      await fs.promises.rm(path.join(folder, recordName(name)), { force: true }).catch(() => undefined);
      await fs.promises.rm(part, { force: true }).catch(() => undefined);
      throw error;
    }

    const removed = await applyRetention(folder, kind, settings.keep).catch((error) => {
      // The backup itself is made and checked; old ones not being cleared is not its failure.
      run.log.warn({ err: error }, "old backups could not be removed");
      return [] as string[];
    });
    return { name, sizeBytes: bytes, entries: check.entries, removed, locationId: location.id };
  }

  /** A count of the verified backups on the location, for the status screen, which does not read the share itself. */
  async function keptNow(): Promise<BackupsKept> {
    const backups = await listStored(backupFolder(), readProtection(ctx)?.key.publicKey);
    return summariseKept(backups, Date.now());
  }

  ctx.jobs.register<RunPayload>(BACKUP_JOB, {
    queue: QUEUE,
    async run(run) {
      const now = clock();
      const { kind, dueAt } = run.payload;
      try {
        const result = await writeBackup(kind, run, now);
        const state = readState();
        const away =
          state.away && state.away.madeAt === null && kind === "scheduled" && (dueAt ?? 0) >= state.away.dueAt
            ? { ...state.away, madeAt: now }
            : state.away;
        writeState({
          ...state,
          lastBackupAt: now,
          lastScheduledAt: kind === "scheduled" ? now : state.lastScheduledAt,
          failure: null,
          away,
          kept: await keptNow().catch(() => state.kept),
        });
        changed();
        return result;
      } catch (error) {
        // Paused, cancelled or shutting down: the backup was stopped, it did not fail.
        if (!run.signal.aborted) {
          const known = error instanceof AppError || error instanceof PermanentJobError;
          const message = known ? messageOf(error) : `The backup could not be written: ${messageOf(error)}`;
          // A location that went away is not held to the hour's wait: the backup is made as soon as it is back.
          const away = error instanceof AppError && error.code === "storage_unavailable";
          const before = readState();
          // Counted for scheduled runs only: pressing "Back up now" neither lengthens nor shortens the schedule's wait.
          const attempts = (before.failure?.attempts ?? 0) + (kind === "scheduled" && !away ? 1 : 0);
          writeState({
            ...before,
            failure: { at: clock(), message, dueAt: kind === "scheduled" && !away ? (dueAt ?? null) : null, attempts },
          });
          changed();
          if (!known) throw new PermanentJobError(message);
        }
        throw error;
      }
    },
  });

  // A location that comes back is a reason to look again straight away.
  const unsubscribe = ctx.events.subscribe((event) => {
    if (event.type === "storage.changed") tick();
    // A backup has finished, or was stopped: what is owed next follows from how it went.
    const job = event.type === "job.updated" ? (event.data as { type?: string; state?: string } | undefined) : undefined;
    if (job?.type === BACKUP_JOB && ["succeeded", "failed", "cancelled"].includes(job.state ?? "")) tick();
  });
  // At start: whatever came due while the server was off is made now, if it can be.
  app.addHook("onReady", async () => tick());
  ctx.onClose.push(() => {
    closed = true;
    clearTimeout(timer);
    unsubscribe();
  });

  ctx.services.backups = {
    tick,
    last() {
      const state = readState();
      return {
        lastAt: state.lastBackupAt,
        kind: state.lastBackupAt === null ? null : state.lastScheduledAt === state.lastBackupAt ? "scheduled" : "manual",
        scheduled: readSettings().locationId !== null,
      };
    },
    overview() {
      const settings = readSettings();
      const state = readState();
      const location = settings.locationId ? findLocation(settings.locationId) : undefined;
      const due = dueSlot(settings, state, clock());
      return {
        frequency: settings.locationId ? settings.frequency : null,
        locationName: location?.name ?? null,
        missing: due !== null && !activeJob() && location?.status !== "available" ? { dueAt: due } : null,
        away: state.away,
        kept: state.kept,
        restoreTest: tests.last(),
      };
    },
    nextWake: () => wakeAt,
    setClock(now) {
      clock = now;
    },
    setBeforeCheck(hook) {
      beforeCheck = hook;
    },
    setPassphraseCost: protection.setCost,
  };

  // ── Routes ──

  function scheduleFor(request: FastifyRequest): BackupSchedule {
    const stored = readSettings();
    const settings: BackupScheduleSettings = {
      locationId: stored.locationId,
      frequency: stored.frequency,
      time: stored.time,
      weekday: stored.weekday,
      keep: stored.keep,
    };
    const state = readState();
    const now = clock();
    const location = settings.locationId ? findLocation(settings.locationId) : undefined;
    const due = dueSlot(stored, state, now);
    const active = activeJob();
    let waiting: BackupSchedule["waiting"] = null;
    if (due !== null && !active) {
      if (!location) waiting = { dueAt: due, reason: "location_removed", message: REMOVED };
      else if (location.status !== "available") waiting = { dueAt: due, reason: "not_connected", message: notConnected(location) };
      else if (state.failure?.dueAt === due) {
        waiting = {
          dueAt: due,
          reason: "failed",
          message: state.failure.message,
          retryAt: state.failure.at + retryWaitMs(state.failure.attempts ?? 1),
        };
      }
    }
    return {
      settings,
      folder: BACKUP_FOLDER,
      location: location ? { id: location.id, name: location.name, connected: location.status === "available" } : null,
      lastBackupAt: state.lastBackupAt,
      nextRunAt: settings.locationId ? nextBackupSlot(settings, now) : null,
      waiting,
      lastFailure: state.failure ? { at: state.failure.at, message: state.failure.message } : null,
      active: active ? toJobDto(active) : null,
      right: backupRight(request, ctx),
      away: state.away,
      kept: state.kept,
      restoreTest: tests.last(),
      restoreTestActive: tests.active() ? toJobDto(tests.active()!) : null,
    };
  }

  app.get("/api/backup/schedule", async (request) => scheduleFor(request));

  app.patch("/api/backup/schedule", async (request) => {
    const patch = patchBody.parse(request.body);
    const current = readSettings();
    const next: StoredSettings = { ...current, ...patch };
    // Fewer kept means older backups deleted at the next run: the same act as deleting them by hand.
    if (next.keep < current.keep) assertBackupRight(request, ctx, "Keeping fewer backups, which deletes older ones,");
    if (next.locationId && next.locationId !== current.locationId) {
      const location = storage.get(next.locationId);
      if (location.status !== "available") {
        throw new AppError("storage_unavailable", `"${location.name}" is not connected. Connect it, then choose it for backups.`);
      }
      const writable = await fs.promises.access(location.path, fs.constants.W_OK).then(
        () => true,
        () => false,
      );
      if (!writable) throw new AppError("storage_unavailable", `Outpost cannot write to "${location.name}". Check its permissions.`);
    }
    const rescheduled = (["locationId", "frequency", "time", "weekday"] as const).some((key) => next[key] !== current[key]);
    if (rescheduled) next.setAt = clock();
    writeSettings(next);
    announced = "";
    changed();
    tick();
    return scheduleFor(request);
  });

  /** "Back up now": the same job a scheduled backup runs, started by a person. */
  app.post("/api/backup/run", async () => {
    const settings = readSettings();
    if (!settings.locationId) throw conflict("Choose where backups are kept first.");
    const location = findLocation(settings.locationId);
    if (!location) throw conflict(REMOVED);
    if (location.status !== "available") {
      throw new AppError(
        "storage_unavailable",
        `"${location.name}" is not connected, so a backup cannot be made now. Nothing is written anywhere else instead.`,
      );
    }
    if (activeJob()) throw conflict("A backup is already being made.");
    const job = ctx.jobs.enqueue<RunPayload>(BACKUP_JOB, { kind: "manual" }, { title: `Back up to ${location.name}`, subject: SUBJECT });
    return { job: toJobDto(job) };
  });

  /** The backup folder, when the chosen location is connected. Throws in words for a person otherwise. */
  function backupFolder(): string {
    const settings = readSettings();
    if (!settings.locationId) throw conflict("No location is chosen for backups.");
    if (!findLocation(settings.locationId)) throw conflict(REMOVED);
    return storage.resolve(settings.locationId, BACKUP_FOLDER);
  }

  /** The path of a stored backup named in a request. Only a name Outpost gives its backups is accepted. */
  async function storedFile(name: string): Promise<{ folder: string; file: string; stat: fs.Stats }> {
    if (!isBackupName(name)) throw notFound("That backup");
    const folder = backupFolder();
    const file = resolveInside(folder, name);
    const stat = await fs.promises.lstat(file).catch(() => undefined);
    if (!stat?.isFile()) throw notFound("That backup");
    return { folder, file, stat };
  }

  const tests = registerRestoreTest(app, ctx, storedFile, changed);

  app.get("/api/backup/stored", async (): Promise<StoredBackupsResponse> => {
    let folder: string;
    try {
      folder = backupFolder();
    } catch (error) {
      if (error instanceof AppError) return { available: false, reason: error.message, backups: [] };
      throw error;
    }
    try {
      const backups = await listStored(folder, readProtection(ctx)?.key.publicKey);
      writeState({ ...readState(), kept: summariseKept(backups, Date.now()) });
      return { available: true, reason: null, backups };
    } catch (error) {
      return { available: false, reason: `The backup folder could not be read: ${messageOf(error)}`, backups: [] };
    }
  });

  app.get<{ Params: { name: string } }>("/api/backup/stored/:name/download", async (request, reply) => {
    // A page on another site must not be able to make the browser fetch a backup.
    const site = request.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") throw new AppError("forbidden", "Download the backup from the Outpost app.");
    const { file, stat } = await storedFile(request.params.name);
    reply
      .header("Content-Type", request.params.name.endsWith(".enc") ? PROTECTED_TYPE : "application/zip")
      .header("Content-Length", stat.size)
      .header("Content-Disposition", `attachment; filename="${request.params.name}"`);
    return reply.send(fs.createReadStream(file));
  });

  /**
   * "Restore this one": checks the stored backup and stages it, exactly as an uploaded
   * file is. A protected one is opened with the passphrase in the body and read where it
   * lies; no decrypted copy of it is written.
   */
  app.post<{ Params: { name: string } }>("/api/backup/stored/:name/restore", async (request) => {
    assertBackupRight(request, ctx, "Restoring a backup");
    const { passphrase } = restoreBody.parse(request.body ?? {});
    if (passphrase !== undefined) assertPassphraseRight(request, ctx, "Restoring a backup");
    const { file } = await storedFile(request.params.name);
    const staged = await stager.stage(async () => file, passphrase);
    changed();
    return staged;
  });

  app.delete<{ Params: { name: string } }>("/api/backup/stored/:name", async (request) => {
    assertBackupRight(request, ctx, "Deleting a stored backup");
    const { folder } = await storedFile(request.params.name);
    if (!(await deleteStored(folder, request.params.name))) throw notFound("That backup");
    changed();
    return { ok: true };
  });
}

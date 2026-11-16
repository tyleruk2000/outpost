/**
 * Backups kept in a folder of Outpost's own inside a storage location.
 *
 * The folder may sit on a share other things write to, so nothing here trusts it. A
 * file is one of Outpost's backups only if it has the name Outpost gives them, is an
 * ordinary file (not a link), and reads as a backup. Everything else in the folder is
 * somebody else's: it is not listed, not counted and never deleted.
 *
 * Whether a backup passed its check is recorded in a small file beside it,
 * `<name>.verified.json`, so that the record travels with the backup and survives a
 * restore of the database. A backup with no such record, or whose size no longer
 * matches it, is shown as not verified.
 *
 * A run whose backup did not pass its check leaves a different record beside it,
 * `<name>.failed.json`. That is how the archives of failed runs are told from every
 * other file that is not verified (a backup a person copied here without its record,
 * say): only the newest few with such a record are kept, see `setAsideFailed`.
 *
 * A backup made while a passphrase is set is named `….zip.enc`. What it is is decided
 * by how the file starts, not by its name; the name only tells a person, and the
 * program they open it with, what to expect.
 */
import fs from "node:fs";
import path from "node:path";
import type { StoredBackup, StoredBackupKind } from "@outpost/shared";
import { type BackupCheck, readManifest } from "./archive.ts";
import { BackupDamaged, readSealedHeader } from "./sealed.ts";

/** The folder inside a storage location that backups are written to. */
export const BACKUP_FOLDER = "outpost-backups";

const NAME = /^outpost-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(scheduled|manual)\.zip(\.enc)?$/;
const EXTENSION = /\.zip(\.enc)?$/;
const CHECK_FORMAT = "outpost-backup-check";
const FAILED_FORMAT = "outpost-backup-failed-check";
const MAX_RECORD_BYTES = 16 * 1024;
/** How many archives of runs that failed their check are kept, across both kinds. */
export const FAILED_KEPT = 2;
/** A part file this old belongs to a run that was cut off, not to one under way. */
const STALE_PART_MS = 24 * 60 * 60 * 1000;

interface CheckRecord {
  format: typeof CHECK_FORMAT;
  version: 1;
  file: string;
  bytes: number;
  checkedAt: number;
  createdAt: string;
  appVersion: string;
  entries: number;
}

/**
 * `outpost-backup-2026-11-16T03-00-00-000Z-scheduled.zip`: sorts by time, and says how
 * it was started. A protected one ends `.zip.enc`.
 */
export function backupFileName(createdAt: number, kind: StoredBackupKind, sealed = false): string {
  return `outpost-backup-${new Date(createdAt).toISOString().replace(/[:.]/g, "-")}-${kind}.zip${sealed ? ".enc" : ""}`;
}

export function parseBackupName(name: string): { createdAt: number; kind: StoredBackupKind } | undefined {
  const match = NAME.exec(name);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, ms, kind] = match;
  const createdAt = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`);
  return Number.isFinite(createdAt) ? { createdAt, kind: kind as StoredBackupKind } : undefined;
}

export const isBackupName = (name: string): boolean => parseBackupName(name) !== undefined;
/** `….zip` has `….verified.json` beside it, and `….zip.enc` has `….enc.verified.json`. */
const beside = (name: string, what: string): string => name.replace(EXTENSION, (_whole, enc?: string) => `${enc ?? ""}.${what}.json`);
export const recordName = (name: string): string => beside(name, "verified");
export const failedRecordName = (name: string): string => beside(name, "failed");
export const partName = (name: string): string => `${name}.part`;

async function isOrdinaryFile(file: string): Promise<fs.Stats | undefined> {
  const stat = await fs.promises.lstat(file).catch(() => undefined);
  return stat?.isFile() ? stat : undefined;
}

async function readRecord(folder: string, name: string): Promise<CheckRecord | undefined> {
  const file = path.join(folder, recordName(name));
  const stat = await isOrdinaryFile(file);
  if (!stat || stat.size > MAX_RECORD_BYTES) return undefined;
  try {
    const record = JSON.parse(await fs.promises.readFile(file, "utf8")) as Partial<CheckRecord>;
    if (record.format !== CHECK_FORMAT || record.version !== 1 || record.file !== name) return undefined;
    if (typeof record.bytes !== "number" || typeof record.checkedAt !== "number" || typeof record.appVersion !== "string") return undefined;
    return record as CheckRecord;
  } catch {
    return undefined;
  }
}

export async function writeRecord(folder: string, name: string, bytes: number, check: BackupCheck, checkedAt: number): Promise<void> {
  const record: CheckRecord = {
    format: CHECK_FORMAT,
    version: 1,
    file: name,
    bytes,
    checkedAt,
    createdAt: check.manifest.createdAt,
    appVersion: check.manifest.appVersion,
    entries: check.entries,
  };
  await fs.promises.writeFile(path.join(folder, recordName(name)), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
}

interface Glance {
  /** The version in the manifest, or null when the file does not read as a backup. */
  appVersion: string | null;
  /** Whether the file starts as a protected backup does. */
  sealed: boolean;
  /** For a protected backup whose header reads, the public key it was encrypted to. */
  sealedTo: Buffer | null;
}

/** What the start of each file said, so that listing does not open every archive every time. */
const glanceCache = new Map<string, Glance>();

async function glanceAt(file: string, stat: fs.Stats): Promise<Glance> {
  const key = `${file}\n${stat.size}\n${stat.mtimeMs}`;
  const cached = glanceCache.get(key);
  if (cached) return cached;
  let sealed = false;
  let sealedTo: Buffer | null = null;
  try {
    const header = await readSealedHeader(file);
    sealed = header !== undefined;
    sealedTo = header?.publicKey ?? null;
  } catch (error) {
    // A protected backup whose header does not read.
    sealed = error instanceof BackupDamaged;
  }
  const appVersion = await readManifest(file).then(
    (manifest) => manifest.appVersion,
    () => null,
  );
  const glance = { appVersion, sealed, sealedTo };
  if (glanceCache.size > 500) glanceCache.clear();
  glanceCache.set(key, glance);
  return glance;
}

/**
 * Outpost's own backups in `folder`, newest first. A folder that does not exist yet
 * holds none. `currentKey` is the public key backups are encrypted to now, if any, so
 * that each protected backup can say whether today's passphrase opens it.
 */
export async function listStored(folder: string, currentKey?: Buffer): Promise<StoredBackup[]> {
  let names: string[];
  try {
    names = await fs.promises.readdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const backups: StoredBackup[] = [];
  for (const name of names) {
    const parsed = parseBackupName(name);
    if (!parsed) continue;
    const file = path.join(folder, name);
    const stat = await isOrdinaryFile(file);
    if (!stat) continue;
    const record = await readRecord(folder, name);
    const glance = await glanceAt(file, stat);
    const base = {
      name,
      kind: parsed.kind,
      createdAt: parsed.createdAt,
      sizeBytes: stat.size,
      protected: glance.sealed,
      currentPassphrase: glance.sealed ? Boolean(glance.sealedTo && currentKey?.equals(glance.sealedTo)) : null,
    };
    // A protected backup's header is read every time, so one that no longer reads is not shown as sound on the word of its record.
    if (record && record.bytes === stat.size && (!glance.sealed || glance.sealedTo)) {
      backups.push({ ...base, appVersion: record.appVersion, check: "verified", checkedAt: record.checkedAt });
      continue;
    }
    backups.push({
      ...base,
      appVersion: glance.appVersion,
      check: glance.appVersion === null ? "unreadable" : "unverified",
      checkedAt: null,
    });
  }
  return backups.sort((a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name));
}

/**
 * Which backups of one kind are past keeping. The newest `keep` that passed their check
 * stay; anything of that kind older than the oldest of those goes, checked or not. A
 * backup that did not pass is not counted towards `keep`, and until there are `keep`
 * that did, nothing is removed at all. Files that do not read as backups are never in
 * the answer, and neither is the newest verified backup of any kind.
 */
export function retentionPlan(backups: StoredBackup[], kind: StoredBackupKind, keep: number): string[] {
  const mine = backups.filter((backup) => backup.kind === kind && backup.check !== "unreadable").sort((a, b) => b.createdAt - a.createdAt);
  const verified = mine.filter((backup) => backup.check === "verified");
  const oldestKept = verified[Math.max(1, Math.floor(keep)) - 1];
  if (!oldestKept) return [];
  const newestVerified = backups.filter((backup) => backup.check === "verified").sort((a, b) => b.createdAt - a.createdAt)[0];
  return mine
    .filter((backup) => backup.createdAt < oldestKept.createdAt && backup.name !== newestVerified?.name)
    .map((backup) => backup.name);
}

/** Removes one of Outpost's backups and its record. Refuses anything that is not named and shaped like one. */
export async function deleteStored(folder: string, name: string): Promise<boolean> {
  if (!isBackupName(name)) return false;
  const file = path.join(folder, name);
  if (!(await isOrdinaryFile(file))) return false;
  await fs.promises.rm(file);
  for (const beside of [recordName(name), failedRecordName(name)]) {
    const record = path.join(folder, beside);
    if (await isOrdinaryFile(record)) await fs.promises.rm(record, { force: true });
  }
  return true;
}

interface FailedRecord {
  format: typeof FAILED_FORMAT;
  version: 1;
  file: string;
  bytes: number;
  failedAt: number;
}

/** The size of the archive a failed run wrote under this name, if a record of one is there. */
async function failedBytes(folder: string, name: string): Promise<number | undefined> {
  const file = path.join(folder, failedRecordName(name));
  const stat = await isOrdinaryFile(file);
  if (!stat || stat.size > MAX_RECORD_BYTES) return undefined;
  try {
    const record = JSON.parse(await fs.promises.readFile(file, "utf8")) as Partial<FailedRecord>;
    if (record.format !== FAILED_FORMAT || record.version !== 1 || record.file !== name) return undefined;
    return typeof record.bytes === "number" ? record.bytes : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Called for the archive a run has just written when its check did not pass. The
 * archive is kept, since the fault may be in the checking and not in the file, but
 * only the newest `keep` such archives are: older ones are removed, oldest first, so
 * that a fault that lasts cannot fill the location.
 *
 * What is removed is only ever a file that a failed run of this Outpost recorded
 * writing, still the size it was written at, with no record of having passed. An
 * archive that damage has made unreadable cannot be recognised by its contents, so the
 * record and the size are what identify it. A verified backup, a backup with no
 * record of failing, and anything not named as a backup are never candidates.
 *
 * Returns whether the new archive was kept, and the names removed. If its record
 * cannot be written the archive is removed instead: unrecorded, it could never be cleared.
 */
export async function setAsideFailed(
  folder: string,
  name: string,
  bytes: number,
  failedAt: number,
  keep = FAILED_KEPT,
): Promise<{ kept: boolean; removed: string[] }> {
  if (!isBackupName(name)) return { kept: true, removed: [] };
  const record: FailedRecord = { format: FAILED_FORMAT, version: 1, file: name, bytes, failedAt };
  try {
    await fs.promises.writeFile(path.join(folder, failedRecordName(name)), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  } catch {
    const stat = await isOrdinaryFile(path.join(folder, name));
    if (stat?.size === bytes) await fs.promises.rm(path.join(folder, name), { force: true }).catch(() => undefined);
    return { kept: false, removed: [] };
  }

  const failed: Array<{ name: string; createdAt: number }> = [];
  for (const other of await fs.promises.readdir(folder).catch(() => [] as string[])) {
    const parsed = parseBackupName(other);
    if (!parsed) continue;
    const stat = await isOrdinaryFile(path.join(folder, other));
    if (!stat || (await failedBytes(folder, other)) !== stat.size) continue;
    // A record of passing wins: that file is a backup, whatever else is written beside it.
    if ((await readRecord(folder, other))?.bytes === stat.size) continue;
    failed.push({ name: other, createdAt: parsed.createdAt });
  }
  failed.sort((a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name));
  const removed: string[] = [];
  for (const old of failed.slice(Math.max(1, Math.floor(keep)))) {
    if (old.name !== name && (await deleteStored(folder, old.name).catch(() => false))) removed.push(old.name);
  }
  return { kept: true, removed };
}

/**
 * Removes backups past keeping, and returns the names removed. Each one is opened
 * again first: only a file that still reads as an Outpost backup is deleted.
 */
export async function applyRetention(folder: string, kind: StoredBackupKind, keep: number): Promise<string[]> {
  const removed: string[] = [];
  for (const name of retentionPlan(await listStored(folder), kind, keep)) {
    const recognised = await readManifest(path.join(folder, name)).then(
      () => true,
      () => false,
    );
    if (recognised && (await deleteStored(folder, name))) removed.push(name);
  }
  return removed;
}

/** Removes part files of Outpost's own that a cut-off run left behind long ago. */
export async function clearStaleParts(folder: string): Promise<void> {
  for (const name of await fs.promises.readdir(folder).catch(() => [] as string[])) {
    if (!name.endsWith(".part") || !isBackupName(name.slice(0, -".part".length))) continue;
    const file = path.join(folder, name);
    const stat = await isOrdinaryFile(file);
    if (stat && Date.now() - stat.mtimeMs > STALE_PART_MS) await fs.promises.rm(file, { force: true });
  }
}

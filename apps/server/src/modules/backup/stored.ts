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
 */
import fs from "node:fs";
import path from "node:path";
import type { StoredBackup, StoredBackupKind } from "@outpost/shared";
import { type BackupCheck, readManifest } from "./archive.ts";

/** The folder inside a storage location that backups are written to. */
export const BACKUP_FOLDER = "outpost-backups";

const NAME = /^outpost-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(scheduled|manual)\.zip$/;
const CHECK_FORMAT = "outpost-backup-check";
const MAX_RECORD_BYTES = 16 * 1024;
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

/** `outpost-backup-2026-11-16T03-00-00-000Z-scheduled.zip`: sorts by time, and says how it was started. */
export function backupFileName(createdAt: number, kind: StoredBackupKind): string {
  return `outpost-backup-${new Date(createdAt).toISOString().replace(/[:.]/g, "-")}-${kind}.zip`;
}

export function parseBackupName(name: string): { createdAt: number; kind: StoredBackupKind } | undefined {
  const match = NAME.exec(name);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, ms, kind] = match;
  const createdAt = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`);
  return Number.isFinite(createdAt) ? { createdAt, kind: kind as StoredBackupKind } : undefined;
}

export const isBackupName = (name: string): boolean => parseBackupName(name) !== undefined;
export const recordName = (name: string): string => name.replace(/\.zip$/, ".verified.json");
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

/** Versions read from manifests, so that listing does not open every archive every time. */
const manifestCache = new Map<string, string | null>();

async function versionOf(file: string, stat: fs.Stats): Promise<string | null> {
  const key = `${file}\n${stat.size}\n${stat.mtimeMs}`;
  const cached = manifestCache.get(key);
  if (cached !== undefined) return cached;
  const version = await readManifest(file).then(
    (manifest) => manifest.appVersion,
    () => null,
  );
  if (manifestCache.size > 500) manifestCache.clear();
  manifestCache.set(key, version);
  return version;
}

/** Outpost's own backups in `folder`, newest first. A folder that does not exist yet holds none. */
export async function listStored(folder: string): Promise<StoredBackup[]> {
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
    const base = { name, kind: parsed.kind, createdAt: parsed.createdAt, sizeBytes: stat.size };
    if (record && record.bytes === stat.size) {
      backups.push({ ...base, appVersion: record.appVersion, check: "verified", checkedAt: record.checkedAt });
      continue;
    }
    const appVersion = await versionOf(file, stat);
    backups.push({ ...base, appVersion, check: appVersion === null ? "unreadable" : "unverified", checkedAt: null });
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
  const record = path.join(folder, recordName(name));
  if (await isOrdinaryFile(record)) await fs.promises.rm(record, { force: true });
  return true;
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

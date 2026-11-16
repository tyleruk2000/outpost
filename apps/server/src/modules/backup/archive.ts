/**
 * The backup file itself: what is in it, how one is made, and how one is checked.
 *
 * A backup is a zip holding `manifest.json`, a snapshot of the database as
 * `outpost.db`, and the data folders that travel with it. The download in Settings and
 * the backups written to a storage location on a schedule are the same file, made by
 * the same code. When a passphrase has been set for backups, the zip is written and
 * read through the envelope in `sealed.ts`; what is inside is the same.
 */
import fs from "node:fs";
import path from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { ZipArchive } from "archiver";
import Database from "better-sqlite3";
import yauzl from "yauzl";
import type { AppContext } from "../../core/context.ts";
import { VERSION } from "../system/index.ts";
import { readProtection } from "./protection.ts";
import { BackupDamaged, BackupLocked, openSealed, readSealedHeader, type SealedAccess, type SealedFile, seal } from "./sealed.ts";

export { BackupDamaged, BackupLocked };

export const FORMAT = "outpost-backup";
/** Folders in the data directory that travel with a backup. */
export const DATA_FOLDERS = ["attachments", "extracted", "catalog"];
/** The manifest is a few lines of JSON; anything much larger is not one. */
const MAX_MANIFEST_BYTES = 64 * 1024;
const MANIFEST_WITHIN = 8;

export interface BackupManifest {
  format: typeof FORMAT;
  version: 1;
  appVersion: string;
  createdAt: string;
  migrations: number;
  includesDocuments: boolean;
}

export function migrationCount(file: string): number {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

const ZIP_OPTIONS = { lazyEntries: true, validateEntrySizes: true, strictFileNames: true };

/** Lets the zip reader ask a protected backup for any range of the zip inside it. */
class SealedReader extends yauzl.RandomAccessReader {
  sealed: SealedFile;

  constructor(sealed: SealedFile) {
    super();
    this.sealed = sealed;
  }

  override _readStreamForRange(start: number, end: number): Readable {
    return this.sealed.read(start, end);
  }

  override close(callback: (error: Error | null) => void): void {
    this.sealed.close().then(() => callback(null), callback);
  }
}

export interface OpenedBackup {
  zip: yauzl.ZipFile;
  /** For a protected backup: the public key it was encrypted to, and the manifest its header shows. */
  sealed?: { publicKey: Buffer; manifest: string };
}

/**
 * Opens a backup file as a zip, whether or not it is protected. A protected one needs
 * `access` (throws `BackupLocked` without it, or with the wrong passphrase) and is read
 * through once first, every chunk checked, so that a file that was altered or cut
 * short is refused before anything in it is used. It is decrypted in memory as the zip
 * reader asks for it: no decrypted copy is written.
 */
export async function openBackup(file: string, access?: SealedAccess, signal?: AbortSignal): Promise<OpenedBackup> {
  const header = await readSealedHeader(file);
  if (!header) {
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
      yauzl.open(file, ZIP_OPTIONS, (error, opened) => (error ? reject(error) : resolve(opened)));
    });
    return { zip };
  }
  if (!access) throw new BackupLocked("passphrase_required");
  const sealed = await openSealed(file, access);
  try {
    await sealed.checkWhole(signal);
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
      yauzl.fromRandomAccessReader(new SealedReader(sealed), sealed.size, ZIP_OPTIONS, (error, opened) =>
        error ? reject(error) : resolve(opened),
      );
    });
    return { zip, sealed: { publicKey: sealed.header.publicKey, manifest: sealed.header.manifest } };
  } catch (error) {
    await sealed.close();
    throw error;
  }
}

export function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream))));
}

/**
 * Passes an entry's bytes through and fails at the end if they do not match the
 * checksum the zip recorded for them. The zip reader checks sizes but not this.
 */
export function crcCheck(entry: yauzl.Entry): Transform {
  let crc = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      crc = zlib.crc32(chunk, crc);
      done(null, chunk);
    },
    flush(done) {
      done(crc === entry.crc32 ? null : new BackupDamaged(`"${entry.fileName}" does not match its checksum.`));
    },
  });
}

function isManifest(value: unknown): value is BackupManifest {
  const manifest = value as Partial<BackupManifest> | null;
  return (
    typeof manifest === "object" &&
    manifest !== null &&
    manifest.format === FORMAT &&
    manifest.version === 1 &&
    typeof manifest.appVersion === "string" &&
    typeof manifest.createdAt === "string" &&
    Number.isFinite(Date.parse(manifest.createdAt))
  );
}

export function parseManifest(text: string): BackupManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isManifest(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Visits every entry of a zip in turn. `visit` must finish reading an entry before the next is given. */
async function eachEntry(
  file: string,
  visit: (zip: yauzl.ZipFile, entry: yauzl.Entry) => Promise<void>,
  access?: SealedAccess,
  signal?: AbortSignal,
): Promise<OpenedBackup> {
  const opened = await openBackup(file, access, signal);
  const { zip } = opened;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        visit(zip, entry).then(() => zip.readEntry(), reject);
      });
      zip.readEntry();
    });
    return opened;
  } finally {
    zip.close();
  }
}

async function readSmallEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  if (entry.uncompressedSize > MAX_MANIFEST_BYTES) throw new BackupDamaged("Its manifest is larger than a manifest is.");
  const chunks: Buffer[] = [];
  await pipeline(await entryStream(zip, entry), crcCheck(entry), async (source) => {
    for await (const chunk of source) chunks.push(chunk as Buffer);
  });
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Reads only the manifest of a backup file: enough to say that the file is an Outpost
 * backup and which version made it, without reading the rest. Throws if it is not one.
 *
 * A protected backup shows its manifest in its header, so this needs no passphrase.
 * Nothing vouches for what it says until the backup is opened: `verifyBackupFile` and
 * a restore both read the manifest inside.
 */
export async function readManifest(file: string): Promise<BackupManifest> {
  const header = await readSealedHeader(file);
  if (header) {
    const shown = parseManifest(header.manifest);
    if (!shown) throw new BackupDamaged("Its header does not hold an Outpost backup's manifest.");
    return shown;
  }
  let manifest: BackupManifest | undefined;
  const found = new Error("found");
  let seen = 0;
  try {
    await eachEntry(file, async (zip, entry) => {
      seen += 1;
      // Outpost writes the manifest first. A file that does not have it near the start
      // is not one of its backups, and is not read through to find out.
      if (seen > MANIFEST_WITHIN) throw found;
      if (entry.fileName !== "manifest.json") return;
      manifest = parseManifest(await readSmallEntry(zip, entry));
      // Nothing after the manifest is needed.
      throw found;
    });
  } catch (error) {
    if (error !== found) throw error;
  }
  if (!manifest) throw new BackupDamaged("It has no manifest, so it is not an Outpost backup.");
  return manifest;
}

export interface BackupCheck {
  manifest: BackupManifest;
  /** Files in the archive, the manifest and database included. */
  entries: number;
}

/**
 * Reads a backup file back from start to finish: every entry must match the checksum
 * recorded for it, the manifest must be an Outpost backup's, and the database inside
 * must open and pass SQLite's integrity check. The database is copied to `workDir`
 * (the data directory, a local disk) for that, and the copy is removed afterwards.
 *
 * A protected backup is opened with `access`: the key of the file, which the run that
 * wrote it still holds, or a passphrase. Every chunk of it must open, and the manifest
 * its header shows must be the one inside.
 */
export async function verifyBackupFile(file: string, workDir: string, signal?: AbortSignal, access?: SealedAccess): Promise<BackupCheck> {
  // The same name as the snapshot a backup is made from, so that a copy left behind by
  // a crash is recognised and offered for removal like one of those.
  const database = path.join(workDir, `backup-snapshot-${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}.db`);
  let manifest: BackupManifest | undefined;
  let manifestText: string | undefined;
  let entries = 0;
  let hasDatabase = false;
  const visit = async (zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<void> => {
    signal?.throwIfAborted();
    if (entry.fileName.endsWith("/")) return;
    entries += 1;
    if (entry.fileName === "manifest.json") {
      manifestText = await readSmallEntry(zip, entry);
      manifest = parseManifest(manifestText);
      return;
    }
    const source = await entryStream(zip, entry);
    if (entry.fileName === "outpost.db") {
      hasDatabase = true;
      await pipeline(source, crcCheck(entry), fs.createWriteStream(database, { flags: "wx" }), { signal });
      return;
    }
    // Read to the end and thrown away: the point is that it can be read and matches.
    await pipeline(
      source,
      crcCheck(entry),
      async (chunks) => {
        for await (const _chunk of chunks) {
          // Nothing to keep.
        }
      },
      { signal },
    );
  };
  try {
    try {
      const opened = await eachEntry(file, visit, access, signal);
      if (opened.sealed && opened.sealed.manifest !== manifestText) {
        throw new BackupDamaged("The manifest its header shows is not the one inside it.");
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof BackupDamaged || error instanceof BackupLocked) throw error;
      throw new BackupDamaged(`It could not be read back as a zip archive (${error instanceof Error ? error.message : error}).`);
    }
    if (!manifest) throw new BackupDamaged("It has no manifest, so it is not an Outpost backup.");
    if (!hasDatabase) throw new BackupDamaged("It does not contain a database.");
    let sound = false;
    try {
      const check = new Database(database, { readonly: true });
      try {
        sound = check.pragma("integrity_check", { simple: true }) === "ok";
      } finally {
        check.close();
      }
      migrationCount(database);
    } catch {
      sound = false;
    }
    if (!sound) throw new BackupDamaged("The database inside it is damaged or is not an Outpost database.");
    return { manifest, entries };
  } finally {
    await removeDatabase(database);
  }
}

/**
 * Removes a temporary copy of the database. The copy is in write-ahead mode like the
 * database it was taken from, so merely opening it to read makes two small files beside it.
 */
async function removeDatabase(file: string): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) await fs.promises.rm(`${file}${suffix}`, { force: true }).catch(() => undefined);
}

export interface BackupInProgress {
  /** The zip, being produced. `abort()` stops it. */
  archive: ZipArchive;
  /** The bytes of the backup file: the zip, encrypted when backups are protected. Read it to the end, or call `cleanup`. */
  output: Readable;
  /**
   * For a protected backup, the key of this one file, so that the run that writes it
   * can read it back to check it. Held in memory only; wipe it when the check is done.
   */
  fileKey?: Buffer;
  manifest: BackupManifest;
  /** Removes the temporary database snapshot. Safe to call more than once. */
  cleanup(): void;
}

/**
 * Starts a backup: takes a snapshot of the database and returns the archive as a
 * stream. Nothing is written to the data directory except that snapshot.
 *
 * The snapshot is made with SQLite's online backup, which copies the database page by
 * page from inside the connection that writes to it. A write that lands while the copy
 * is under way is carried into the copy, so the result is always one whole, consistent
 * state of the database, never half of a change. The server keeps working meanwhile.
 */
export async function startBackup(
  ctx: AppContext,
  onError: (error: Error) => void = () => {},
  now: number = Date.now(),
): Promise<BackupInProgress> {
  const { dataDir } = ctx.config;
  const snapshot = path.join(dataDir, `backup-snapshot-${Date.now()}.db`);
  const cleanup = () => void removeDatabase(snapshot);
  try {
    await ctx.sqlite.backup(snapshot);
    const manifest: BackupManifest = {
      format: FORMAT,
      version: 1,
      appVersion: VERSION,
      createdAt: new Date(now).toISOString(),
      migrations: migrationCount(snapshot),
      includesDocuments: false,
    };
    const manifestText = JSON.stringify(manifest, null, 2);
    const protection = readProtection(ctx);
    const sealing = protection ? seal(protection.key, manifestText) : undefined;
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", (error: Error) => {
      onError(error);
      cleanup();
    });
    archive.on("end", cleanup);
    archive.append(manifestText, { name: "manifest.json" });
    archive.file(snapshot, { name: "outpost.db" });
    for (const folder of DATA_FOLDERS) {
      const full = path.join(dataDir, folder);
      if (fs.existsSync(full)) archive.directory(full, folder);
    }
    // An error in the zip reaches whoever reads `output` through the pipeline.
    if (sealing) pipeline(archive, sealing.stream).catch(() => undefined);
    void archive.finalize();
    return { archive, output: sealing ? sealing.stream : archive, fileKey: sealing?.fileKey, manifest, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

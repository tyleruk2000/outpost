/**
 * Restoring: a backup file is unpacked into a staging folder, checked, and marked
 * ready. It is applied on the next start, before the database is opened, and the data
 * it replaces is kept beside it. The same staging serves a file a person uploads and a
 * backup chosen from the ones kept on a storage location.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { BackupStagedResponse } from "@outpost/shared";
import Database from "better-sqlite3";
import type yauzl from "yauzl";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { type BackupManifest, crcCheck, entryStream, migrationCount, openZip, parseManifest } from "./archive.ts";

export const PENDING = "restore-pending";
export const READY_MARKER = "READY";
/**
 * Folders a restore puts back. Catalogue manifests are in the backup for safe keeping
 * but are not restored: they decide which hosts Outpost will download from, and a
 * backup file from somewhere else must not be able to change that.
 */
const RESTORED_FOLDERS = ["attachments", "extracted"];
const MAX_ENTRIES = 500_000;
export const MAX_TOTAL_BYTES = 64 * 1024 * 1024 * 1024;
/** A backup is mostly a database and images; anything that expands more than this is not one. */
const MAX_RATIO = 200;
const SPACE_RESERVE = 512 * 1024 * 1024;

/**
 * Called at startup before the database is opened. If a checked restore is waiting,
 * the current files step aside (kept, with a timestamp) and the restored ones take
 * their place.
 */
export function applyPendingRestore(dataDir: string, log: (message: string) => void = () => {}): boolean {
  const pending = path.join(dataDir, PENDING);
  if (!fs.existsSync(path.join(pending, READY_MARKER))) {
    // A half-staged restore from an interrupted upload is discarded, never applied.
    if (fs.existsSync(pending)) fs.rmSync(pending, { recursive: true, force: true });
    return false;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const aside = path.join(dataDir, `before-restore-${stamp}`);
  fs.mkdirSync(aside, { recursive: true });
  for (const name of ["outpost.db", "outpost.db-wal", "outpost.db-shm", ...RESTORED_FOLDERS]) {
    const current = path.join(dataDir, name);
    if (fs.existsSync(current)) fs.renameSync(current, path.join(aside, name));
  }
  for (const name of ["outpost.db", ...RESTORED_FOLDERS]) {
    const staged = path.join(pending, name);
    if (fs.existsSync(staged)) fs.renameSync(staged, path.join(dataDir, name));
  }
  fs.rmSync(pending, { recursive: true, force: true });
  log(`Restored from backup. The previous data was kept in ${aside}.`);
  return true;
}

/** Unpacks a backup into `target`, accepting only the entries a backup can contain. */
async function unpack(file: string, target: string): Promise<BackupManifest> {
  const zip = await openZip(file);
  const packedSize = (await fs.promises.stat(file)).size;
  const space = await fs.promises.statfs(target).catch(() => undefined);
  const room = space ? space.bavail * space.bsize - SPACE_RESERVE : Number.POSITIVE_INFINITY;
  let manifest: BackupManifest | undefined;
  let entries = 0;
  let total = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          entries += 1;
          total += entry.uncompressedSize;
          if (entries > MAX_ENTRIES || total > MAX_TOTAL_BYTES) throw badRequest("That backup is larger than Outpost accepts.");
          if (total > Math.max(packedSize, 1024 * 1024) * MAX_RATIO)
            throw badRequest("That file expands far more than a backup does, so it was not unpacked.");
          if (total > room) throw badRequest("There is not enough free space in the data directory to unpack that backup.");
          const name = entry.fileName;
          if (name.endsWith("/")) return zip.readEntry();
          const top = name.split("/")[0]!;
          const allowed = name === "manifest.json" || name === "outpost.db" || RESTORED_FOLDERS.includes(top);
          // Unknown entries are skipped, not written: a backup cannot place files elsewhere.
          if (!allowed) return zip.readEntry();
          const destination = resolveInside(target, name);
          await fs.promises.mkdir(path.dirname(destination), { recursive: true });
          // Each file must match the checksum the archive recorded for it: a backup that
          // was damaged where it was kept is refused, not restored in part.
          await pipeline(await entryStream(zip, entry), crcCheck(entry), fs.createWriteStream(destination, { flags: "wx" }));
          if (name === "manifest.json") manifest = parseManifest(await fs.promises.readFile(destination, "utf8"));
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  if (!manifest) throw badRequest("That file is not an Outpost backup.");
  return manifest;
}

export interface RestoreStager {
  /**
   * Checks a backup file and stages it for the next start. `prepare` is given the empty
   * staging folder and returns the path of the zip to read: an upload writes itself
   * there first, a stored backup is read where it lies. A file inside the staging
   * folder is removed once it has been unpacked.
   */
  stage(prepare: (pending: string) => Promise<string>): Promise<BackupStagedResponse>;
  pending(): boolean;
  cancel(): Promise<void>;
}

export function createRestoreStager(ctx: AppContext): RestoreStager {
  const { dataDir } = ctx.config;
  const pending = path.join(dataDir, PENDING);
  /** Two restores staged at once would unpack into each other. */
  let busy = false;

  return {
    pending: () => fs.existsSync(path.join(pending, READY_MARKER)),

    async cancel() {
      if (busy) throw conflict("A backup is being checked right now. Wait for it to finish, then cancel it.");
      await fs.promises.rm(pending, { recursive: true, force: true });
    },

    async stage(prepare) {
      if (busy) throw conflict("Another backup is being checked for restore. Wait for it to finish.");
      busy = true;
      try {
        await fs.promises.rm(pending, { recursive: true, force: true });
        await fs.promises.mkdir(pending, { recursive: true });
        const source = await prepare(pending);
        const manifest = await unpack(source, pending).catch((error) => {
          if (error instanceof AppError) throw error;
          throw badRequest(`That file could not be read as a backup: ${error instanceof Error ? error.message : error}`);
        });
        if (path.dirname(source) === pending) await fs.promises.rm(source, { force: true });

        const staged = path.join(pending, "outpost.db");
        if (!fs.existsSync(staged)) throw badRequest("That backup does not contain a database.");
        // A file that is not a database, or a damaged one, fails here and is never applied.
        let stagedMigrations: number;
        try {
          const check = new Database(staged, { readonly: true });
          try {
            if (check.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("integrity check failed");
          } finally {
            check.close();
          }
          stagedMigrations = migrationCount(staged);
        } catch {
          throw badRequest("The database inside that backup is damaged or is not an Outpost database, so it was not restored.");
        }
        // A backup carries the state of the machine it was made on. Work in progress does
        // not transfer: its queued jobs must not start running on this machine. Nor do the
        // network shares that machine had connected: this one would try to connect to them.
        const clean = new Database(staged);
        try {
          // A backup made before network shares existed has no such table.
          if (clean.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'network_shares'").get()) {
            clean.exec("DELETE FROM network_shares");
          }
          clean.exec(`
            DELETE FROM jobs;
            UPDATE downloads SET state = 'cancelled', job_id = NULL, error = 'This download was in progress when the backup was made.' WHERE state IN ('queued', 'running', 'verifying', 'paused');
            UPDATE imports SET state = 'discarded' WHERE state NOT IN ('completed', 'discarded');
          `);
        } finally {
          clean.close();
        }
        // An older backup is migrated forward on start. A newer one cannot be read by this version.
        if (stagedMigrations > migrationCount(path.join(dataDir, "outpost.db"))) {
          throw badRequest(`That backup was made by a newer Outpost (${manifest.appVersion}). Update Outpost, then restore it.`);
        }
        await fs.promises.writeFile(path.join(pending, READY_MARKER), manifest.createdAt);
        return {
          staged: true,
          createdAt: manifest.createdAt,
          appVersion: manifest.appVersion,
          supervised: process.env.OUTPOST_SUPERVISED === "true",
        };
      } catch (error) {
        await fs.promises.rm(pending, { recursive: true, force: true });
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}

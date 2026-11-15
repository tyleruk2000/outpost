/**
 * Backup and restore of everything Outpost itself owns: the database (notes, tags,
 * library records, settings, saved places), note attachments and extracted text.
 *
 * Large content (collections, maps, original documents) is not copied by default: it
 * already lives on storage you control, and the backup records where. After a restore,
 * reconnecting those locations brings the content back.
 *
 * A restore is staged, checked, and applied on the next start, before the database is
 * opened. The database it replaces is kept beside it.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import yauzl from "yauzl";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { VERSION } from "../system/index.ts";

const FORMAT = "outpost-backup";
const PENDING = "restore-pending";
const READY_MARKER = "READY";
/** Folders in the data directory that travel with a backup. */
const DATA_FOLDERS = ["attachments", "extracted", "catalog"];
const MAX_ENTRIES = 500_000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024 * 1024;

interface BackupManifest {
  format: typeof FORMAT;
  version: 1;
  appVersion: string;
  createdAt: string;
  migrations: number;
  includesDocuments: boolean;
}

function migrationCount(file: string): number {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

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
  for (const name of ["outpost.db", "outpost.db-wal", "outpost.db-shm", ...DATA_FOLDERS]) {
    const current = path.join(dataDir, name);
    if (fs.existsSync(current)) fs.renameSync(current, path.join(aside, name));
  }
  for (const name of ["outpost.db", ...DATA_FOLDERS]) {
    const staged = path.join(pending, name);
    if (fs.existsSync(staged)) fs.renameSync(staged, path.join(dataDir, name));
  }
  fs.rmSync(pending, { recursive: true, force: true });
  log(`Restored from backup. The previous data was kept in ${aside}.`);
  return true;
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => (error ? reject(error) : resolve(zip)));
  });
}

function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream))));
}

/** Unpacks a backup into `target`, accepting only the entries a backup can contain. */
async function unpack(file: string, target: string): Promise<BackupManifest> {
  const zip = await openZip(file);
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
          const name = entry.fileName;
          if (name.endsWith("/")) return zip.readEntry();
          const top = name.split("/")[0]!;
          const allowed = name === "manifest.json" || name === "outpost.db" || DATA_FOLDERS.includes(top);
          // Unknown entries are skipped, not written: a backup cannot place files elsewhere.
          if (!allowed) return zip.readEntry();
          const destination = resolveInside(target, name);
          await fs.promises.mkdir(path.dirname(destination), { recursive: true });
          await pipeline(await entryStream(zip, entry), fs.createWriteStream(destination, { flags: "wx" }));
          if (name === "manifest.json") manifest = JSON.parse(await fs.promises.readFile(destination, "utf8")) as BackupManifest;
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  if (!manifest || manifest.format !== FORMAT || manifest.version !== 1) throw badRequest("That file is not an Outpost backup.");
  return manifest;
}

export async function registerBackup(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { auth } = ctx.services;
  const { dataDir } = ctx.config;

  app.get("/api/backup/status", async (request) => {
    auth.requireAdmin(request);
    const kept = (await fs.promises.readdir(dataDir)).filter((name) => name.startsWith("before-restore-")).sort();
    return {
      restorePending: fs.existsSync(path.join(dataDir, PENDING, READY_MARKER)),
      previousData: kept,
      supervised: process.env.OUTPOST_SUPERVISED === "true",
    };
  });

  /** Streams a backup as a zip. Nothing is written to the data directory except a temporary database snapshot. */
  app.get("/api/backup/download", async (request, reply) => {
    auth.requireAdmin(request);
    const snapshot = path.join(dataDir, `backup-snapshot-${Date.now()}.db`);
    // SQLite's online backup gives a consistent copy while the server keeps working.
    await ctx.sqlite.backup(snapshot);
    const manifest: BackupManifest = {
      format: FORMAT,
      version: 1,
      appVersion: VERSION,
      createdAt: new Date().toISOString(),
      migrations: migrationCount(snapshot),
      includesDocuments: false,
    };
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const cleanup = () => fs.rm(snapshot, { force: true }, () => {});
    archive.on("error", (error: Error) => {
      request.log.error({ err: error }, "backup failed");
      cleanup();
    });
    archive.on("end", cleanup);
    reply.raw.on("close", cleanup);
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    archive.file(snapshot, { name: "outpost.db" });
    for (const folder of DATA_FOLDERS) {
      const full = path.join(dataDir, folder);
      if (fs.existsSync(full)) archive.directory(full, folder);
    }
    void archive.finalize();
    const stamp = manifest.createdAt.slice(0, 16).replace(/[:T]/g, "-");
    reply.header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="outpost-backup-${stamp}.zip"`);
    return reply.send(archive);
  });

  // The backup is sent as the raw request body and streamed straight to disk.
  app.addContentTypeParser("application/zip", (_request, payload, done) => done(null, payload));
  app.post("/api/backup/restore", { bodyLimit: MAX_TOTAL_BYTES }, async (request) => {
    auth.requireAdmin(request);
    const body = request.body as NodeJS.ReadableStream | undefined;
    if (!body || typeof body.pipe !== "function") throw badRequest("Send the backup .zip as the request body with Content-Type application/zip.");

    const pending = path.join(dataDir, PENDING);
    await fs.promises.rm(pending, { recursive: true, force: true });
    await fs.promises.mkdir(pending, { recursive: true });
    const upload = path.join(pending, "upload.zip");
    try {
      await pipeline(body, fs.createWriteStream(upload));
      const manifest = await unpack(upload, pending).catch((error) => {
        if (error instanceof AppError) throw error;
        throw badRequest(`That file could not be read as a backup: ${error instanceof Error ? error.message : error}`);
      });
      await fs.promises.rm(upload, { force: true });

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
      // An older backup is migrated forward on start. A newer one cannot be read by this version.
      if (stagedMigrations > migrationCount(path.join(dataDir, "outpost.db"))) {
        throw badRequest(`That backup was made by a newer Outpost (${manifest.appVersion}). Update Outpost, then restore it.`);
      }
      await fs.promises.writeFile(path.join(pending, READY_MARKER), manifest.createdAt);
      return { staged: true, createdAt: manifest.createdAt, appVersion: manifest.appVersion, supervised: process.env.OUTPOST_SUPERVISED === "true" };
    } catch (error) {
      await fs.promises.rm(pending, { recursive: true, force: true });
      throw error;
    }
  });

  app.delete("/api/backup/restore", async (request) => {
    auth.requireAdmin(request);
    await fs.promises.rm(path.join(dataDir, PENDING), { recursive: true, force: true });
    return { ok: true };
  });

  /**
   * Stops the server so that whatever supervises it (Docker's restart policy, the
   * portable launcher) starts it again. Refused when nothing would restart it.
   */
  app.post("/api/system/restart", async (request, reply) => {
    auth.requireAdmin(request);
    if (process.env.OUTPOST_SUPERVISED !== "true") {
      throw new AppError("conflict", "Outpost cannot restart itself here. Stop it and start it again to finish.");
    }
    await reply.send({ restarting: true });
    setTimeout(() => {
      void app.close().finally(() => process.exit(75));
    }, 250).unref();
  });
}

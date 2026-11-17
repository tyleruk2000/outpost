/**
 * Backup and restore of everything Outpost itself owns: the database (notes, tags,
 * library records, settings, saved places), note attachments and extracted text.
 *
 * Large content (collections, maps, original documents) is not copied by default: it
 * already lives on storage you control, and the backup records where. After a restore,
 * reconnecting those locations brings the content back.
 *
 * A backup is made in two ways, and both make the same file (`archive.ts`): as a
 * download from Settings, and on a schedule into a folder on a storage location
 * (`automatic.ts`, `stored.ts`).
 *
 * A restore is staged, checked, and applied on the next start, before the database is
 * opened. The database it replaces is kept beside it (`restore.ts`). Restoring replaces
 * everything at once, so it is accepted only from where "erase everything" is
 * (`right.ts`).
 *
 * Backups can be protected with a passphrase (`protection.ts`, `sealed.ts`). Off by
 * default; when it is on, both ways of making a backup make an encrypted file, and a
 * restore asks for the passphrase.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline as pipe, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BackupDownloaded, BackupStatus } from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { closeThenExit } from "../../core/stop.ts";
import { startBackup } from "./archive.ts";
import { registerAutomaticBackups } from "./automatic.ts";
import { assertPassphraseRight, PROTECTED_TYPE, passphraseFromHeader, registerProtection } from "./protection.ts";
import { createRestoreStager, MAX_TOTAL_BYTES } from "./restore.ts";
import { assertBackupRight, backupRight } from "./right.ts";

export { applyPendingRestore } from "./restore.ts";

const BACKUP_TYPES = /^application\/(zip|vnd\.outpost\.backup)\b/i;
/** The last backup saved from Settings: a fact about this library, kept with the others. */
const DOWNLOADED_KEY = "backup.downloaded";

export async function registerBackup(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { dataDir } = ctx.config;
  const stager = createRestoreStager(ctx);
  const protection = registerProtection(app, ctx);

  const lastDownload = (): BackupDownloaded | null => {
    const row = ctx.sqlite.prepare("SELECT value FROM library_meta WHERE key = ?").get(DOWNLOADED_KEY) as { value: string } | undefined;
    try {
      const value = JSON.parse(row?.value ?? "null") as BackupDownloaded | null;
      return value && typeof value.at === "number" && typeof value.name === "string" && typeof value.bytes === "number" ? value : null;
    } catch {
      return null;
    }
  };

  app.get("/api/backup/status", async (request): Promise<BackupStatus> => {
    const kept = (await fs.promises.readdir(dataDir)).filter((name) => name.startsWith("before-restore-")).sort();
    return {
      lastDownload: lastDownload(),
      restorePending: stager.pending(),
      previousData: kept,
      supervised: process.env.OUTPOST_SUPERVISED === "true",
      right: backupRight(request, ctx),
      protection: protection.status(request),
    };
  });

  /**
   * Streams a backup as a zip, or as an encrypted file when backups are protected.
   * Nothing is written to the data directory except a temporary database snapshot.
   */
  app.get("/api/backup/download", async (request, reply) => {
    // Making a backup takes a database snapshot, which is work. A page on another site
    // must not be able to set it off by pointing an image or a link here.
    const site = request.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") throw new AppError("forbidden", "Start the backup from the Outpost app.");
    const { output, fileKey, manifest, cleanup } = await startBackup(ctx, (error) => request.log.error({ err: error }, "backup failed"));
    // A download is not read back here, so this copy of the file's key is not needed.
    fileKey?.fill(0);
    reply.raw.on("close", cleanup);
    const stamp = manifest.createdAt.slice(0, 16).replace(/[:T]/g, "-");
    const name = `outpost-backup-${stamp}.zip${fileKey ? ".enc" : ""}`;
    // Counted on the way out, and recorded once the whole file has been sent, so that Settings can say it was made.
    let bytes = 0;
    const counted = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        done(null, chunk);
      },
    });
    pipe(output, counted, () => {});
    // Once: a response can say it has finished twice (light-my-request's stand-in does, the
    // second time after the server may have closed the database).
    reply.raw.once("finish", () => {
      const value: BackupDownloaded = { at: Date.now(), name, bytes };
      ctx.sqlite
        .prepare("INSERT INTO library_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(DOWNLOADED_KEY, JSON.stringify(value));
    });
    reply
      .header("Content-Type", fileKey ? PROTECTED_TYPE : "application/zip")
      .header("Content-Disposition", `attachment; filename="${name}"`);
    return reply.send(counted);
  });

  // The backup is sent as the raw request body and streamed straight to disk.
  app.addContentTypeParser(["application/zip", PROTECTED_TYPE], (_request, payload, done) => done(null, payload));
  /**
   * Runs before the body is read, so that a request that will be refused never makes
   * the server receive a file: one from a device that may not restore, one that is not
   * a backup, or one whose passphrase would have crossed the network in the clear.
   */
  const beforeBody = async (request: FastifyRequest) => {
    assertBackupRight(request, ctx, "Restoring a backup");
    if (!BACKUP_TYPES.test(request.headers["content-type"] ?? "")) {
      throw new AppError(
        "unsupported",
        `Send the backup file with Content-Type application/zip, or ${PROTECTED_TYPE} for a protected one.`,
      );
    }
    if (passphraseFromHeader(request) !== undefined) assertPassphraseRight(request, ctx, "Restoring a backup");
  };
  app.post("/api/backup/restore", { bodyLimit: MAX_TOTAL_BYTES, onRequest: beforeBody }, async (request) => {
    const body = request.body as NodeJS.ReadableStream | undefined;
    if (!body || typeof body.pipe !== "function")
      throw badRequest("Send the backup file as the request body with Content-Type application/zip.");
    // Written as it arrived. A protected backup stays encrypted on disk and is opened in memory from there.
    return stager.stage(async (pending) => {
      const upload = path.join(pending, "upload.zip");
      await pipeline(body, fs.createWriteStream(upload));
      return upload;
    }, passphraseFromHeader(request));
  });

  // Not held to where the request comes from: dropping a staged restore changes nothing
  // and keeps what is here, which is the safe direction.
  app.delete("/api/backup/restore", async () => {
    await stager.cancel();
    return { ok: true };
  });

  /**
   * Stops the server so that whatever supervises it (Docker's restart policy, the
   * portable launcher) starts it again. Refused when nothing would restart it.
   *
   * Its one use is applying a staged restore, which only the computer Outpost runs on
   * can stage, so it is held to the same rule: a restart cuts off whatever everyone else
   * is doing (an upload, a reply being written), and with no accounts any device on the
   * network could otherwise do that as often as it liked.
   */
  app.post("/api/system/restart", async (request, reply) => {
    assertBackupRight(request, ctx, "Restarting Outpost");
    if (process.env.OUTPOST_SUPERVISED !== "true") {
      throw new AppError("conflict", "Outpost cannot restart itself here. Stop it and start it again to finish.");
    }
    await reply.send({ restarting: true });
    // The same stop as a signal, so the browser that asked (which holds the live-events
    // stream open) cannot keep the server from going.
    setTimeout(() => closeThenExit(app, 75), 250).unref();
  });

  registerAutomaticBackups(app, ctx, stager, protection);
}

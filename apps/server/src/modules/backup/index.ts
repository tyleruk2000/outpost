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
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { BackupStatus } from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { startBackup } from "./archive.ts";
import { registerAutomaticBackups } from "./automatic.ts";
import { createRestoreStager, MAX_TOTAL_BYTES } from "./restore.ts";
import { assertBackupRight, backupRight } from "./right.ts";

export { applyPendingRestore } from "./restore.ts";

export async function registerBackup(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { dataDir } = ctx.config;
  const stager = createRestoreStager(ctx);

  app.get("/api/backup/status", async (request): Promise<BackupStatus> => {
    const kept = (await fs.promises.readdir(dataDir)).filter((name) => name.startsWith("before-restore-")).sort();
    return {
      restorePending: stager.pending(),
      previousData: kept,
      supervised: process.env.OUTPOST_SUPERVISED === "true",
      right: backupRight(request, ctx),
    };
  });

  /** Streams a backup as a zip. Nothing is written to the data directory except a temporary database snapshot. */
  app.get("/api/backup/download", async (request, reply) => {
    // Making a backup takes a database snapshot, which is work. A page on another site
    // must not be able to set it off by pointing an image or a link here.
    const site = request.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") throw new AppError("forbidden", "Start the backup from the Outpost app.");
    const { archive, manifest, cleanup } = await startBackup(ctx, (error) => request.log.error({ err: error }, "backup failed"));
    reply.raw.on("close", cleanup);
    const stamp = manifest.createdAt.slice(0, 16).replace(/[:T]/g, "-");
    reply.header("Content-Type", "application/zip").header("Content-Disposition", `attachment; filename="outpost-backup-${stamp}.zip"`);
    return reply.send(archive);
  });

  // The backup is sent as the raw request body and streamed straight to disk.
  app.addContentTypeParser("application/zip", (_request, payload, done) => done(null, payload));
  /**
   * Runs before the body is read, so that a request that will be refused never makes
   * the server receive a file: one from a device that may not restore, or one that is
   * not a zip.
   */
  const beforeBody = async (request: FastifyRequest) => {
    assertBackupRight(request, ctx, "Restoring a backup");
    if (!/^application\/zip\b/i.test(request.headers["content-type"] ?? "")) {
      throw new AppError("unsupported", "Send the backup .zip with Content-Type application/zip.");
    }
  };
  app.post("/api/backup/restore", { bodyLimit: MAX_TOTAL_BYTES, onRequest: beforeBody }, async (request) => {
    const body = request.body as NodeJS.ReadableStream | undefined;
    if (!body || typeof body.pipe !== "function")
      throw badRequest("Send the backup .zip as the request body with Content-Type application/zip.");
    return stager.stage(async (pending) => {
      const upload = path.join(pending, "upload.zip");
      await pipeline(body, fs.createWriteStream(upload));
      return upload;
    });
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
   */
  app.post("/api/system/restart", async (_request, reply) => {
    if (process.env.OUTPOST_SUPERVISED !== "true") {
      throw new AppError("conflict", "Outpost cannot restart itself here. Stop it and start it again to finish.");
    }
    await reply.send({ restarting: true });
    setTimeout(() => {
      void app.close().finally(() => process.exit(75));
    }, 250).unref();
  });

  registerAutomaticBackups(app, ctx, stager);
}

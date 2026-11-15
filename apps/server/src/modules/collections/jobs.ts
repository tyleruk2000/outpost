/**
 * The two long-running things done to an installed collection: checking it against its
 * recorded checksum, and moving it to another storage location.
 *
 * A move never puts the only copy at risk. The original is read, never written, until
 * a complete copy exists on the target, has been read back and found identical, and
 * Outpost's record points at it. Only then is the original deleted. Stopping at any
 * earlier point (an error, a pause, a cancel, a shutdown) throws the partial copy away
 * and leaves everything as it was.
 */
import fs from "node:fs";
import path from "node:path";
import type { CollectionVerifyResult } from "@outpost/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { pathExists, sizeOnDisk } from "../../core/fs-safe.ts";
import { type JobRow, type JobRun, PermanentJobError } from "../../core/jobs.ts";
import { type collections, downloads } from "../../db/schema.ts";
import type { CollectionRow, MovedFrom } from "./service.ts";
import { copyTree, hashTree, UnsupportedEntryError } from "./transfer.ts";

/** What the jobs need from the service that owns the rows. */
export interface CollectionJobsHost {
  requireRow(id: string): CollectionRow;
  get(id: string): CollectionRow | undefined;
  write(id: string, patch: Partial<typeof collections.$inferInsert>): CollectionRow;
  resolveTarget(locationId: string, relPath: string): { absolute: string; relPath: string };
  hasActiveJob(id: string): boolean;
  notifyMoved(collection: CollectionRow, from: MovedFrom): Promise<void>;
}

interface VerifyPayload extends Record<string, unknown> {
  collectionId: string;
}

interface MovePayload extends Record<string, unknown> {
  collectionId: string;
  targetLocationId: string;
}

export const VERIFY_JOB = "collection.verify";
export const MOVE_JOB = "collection.move";

export function createCollectionJobs(ctx: AppContext, host: CollectionJobsHost) {
  const { storage } = ctx.services;

  function loadForJob(id: string): CollectionRow {
    const row = host.get(id);
    if (!row) throw new PermanentJobError("This collection has been removed since the job was started.");
    return row;
  }

  function assertIdle(row: CollectionRow): void {
    if (row.status === "moving" || host.hasActiveJob(row.id)) {
      throw conflict(`"${row.title}" is already being moved or checked. Wait for that to finish first.`);
    }
  }

  async function runVerify(run: JobRun<VerifyPayload>): Promise<Record<string, unknown>> {
    const row = loadForJob(run.payload.collectionId);
    // Throws storage_unavailable when the drive is unplugged; that says nothing about the file.
    const target = storage.resolve(row.locationId, row.relPath);
    const verdict = (result: CollectionVerifyResult): Record<string, unknown> => ({ ...result });

    if (!(await pathExists(target))) {
      host.write(row.id, { status: "missing" });
      return verdict({
        outcome: "missing",
        message: `The file for "${row.title}" is not on its storage location any more. Download it again, or put the file back and check again.`,
      });
    }

    run.progress({ current: 0, total: row.sizeBytes || null, message: "Checking the file" });
    const digest = await hashTree(target, {
      signal: run.signal,
      onProgress: (bytes) => run.progress({ current: bytes }),
    });
    const now = Date.now();

    if (!row.sha256) {
      host.write(row.id, { sha256: digest.sha256, sizeBytes: digest.bytes, verifiedAt: now, status: "installed" });
      return verdict({
        outcome: "recorded",
        sha256: digest.sha256,
        message:
          "No checksum was recorded when this was installed, so there was nothing to compare with. Outpost has recorded one now and will use it for future checks.",
      });
    }
    if (digest.sha256 === row.sha256) {
      host.write(row.id, { verifiedAt: now, status: "installed" });
      return verdict({ outcome: "ok", sha256: digest.sha256, message: "The file is intact: it matches its recorded checksum." });
    }
    host.write(row.id, { status: "damaged" });
    return verdict({
      outcome: "damaged",
      sha256: digest.sha256,
      message:
        "The file no longer matches the checksum recorded when it was installed. It may be corrupted. Download it again, or restore it from a backup.",
    });
  }

  /** A download writes to "<file>.part" too; a move must never take over or delete one. */
  function downloadClaims(locationId: string, relPath: string): boolean {
    return Boolean(
      ctx.db
        .select({ id: downloads.id })
        .from(downloads)
        .where(
          and(
            eq(downloads.locationId, locationId),
            eq(downloads.relPath, relPath),
            inArray(downloads.state, ["queued", "running", "verifying", "paused", "failed", "cancelled"]),
          ),
        )
        .get(),
    );
  }

  async function runMove(run: JobRun<MovePayload>): Promise<Record<string, unknown>> {
    const { collectionId, targetLocationId } = run.payload;
    const row = loadForJob(collectionId);
    if (row.locationId === targetLocationId) throw new PermanentJobError("This collection is already on that storage location.");
    // "moving" is expected here when the server restarted during an earlier attempt.
    if (row.status !== "installed" && row.status !== "moving") {
      throw new PermanentJobError(`"${row.title}" is ${row.status} and cannot be moved. Check it first.`);
    }

    const from: MovedFrom = {
      locationId: row.locationId,
      relPath: row.relPath,
      path: storage.resolve(row.locationId, row.relPath),
    };
    const target = host.resolveTarget(targetLocationId, row.relPath).absolute;
    const targetName = storage.get(targetLocationId).name;

    if (!(await pathExists(from.path))) {
      throw new PermanentJobError(`The file for "${row.title}" is not on its storage location, so there is nothing to move.`);
    }
    if ((await pathExists(target)) || downloadClaims(targetLocationId, row.relPath)) {
      throw conflict(`"${targetName}" already has a file at ${row.relPath}. Outpost will not overwrite it.`);
    }
    const size = await sizeOnDisk(from.path);
    await storage.assertSpace(targetLocationId, size);

    host.write(row.id, { status: "moving" });
    const moved = await copyAndSwitch(run, row, from, target, size, targetName);
    await host.notifyMoved(moved, from);

    // Only now, with a verified copy in place and the record pointing at it.
    let originalRemoved = true;
    try {
      await fs.promises.rm(from.path, { recursive: true });
    } catch (error) {
      originalRemoved = false;
      run.log.warn({ err: error, path: from.path }, "moved, but the original could not be removed");
    }
    return {
      sha256: moved.sha256,
      bytes: moved.sizeBytes,
      originalRemoved,
      message: originalRemoved
        ? `Moved to "${targetName}".`
        : `Moved to "${targetName}", but the original could not be deleted. It is still at its old place and can be removed by hand.`,
    };
  }

  /**
   * Copies, verifies and switches the record over. Returns the row at its new place, or
   * throws having removed the partial copy and put the status back.
   */
  async function copyAndSwitch(
    run: JobRun<MovePayload>,
    row: CollectionRow,
    from: MovedFrom,
    target: string,
    size: number,
    targetName: string,
  ): Promise<CollectionRow> {
    const part = `${target}.part`;
    let switched = false;
    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      // Anything at the partial path now is what an interrupted attempt of this same move left.
      await fs.promises.rm(part, { recursive: true, force: true });

      run.progress({ current: 0, total: size * 2, message: `Copying to ${targetName}` });
      const read = await copyTree(from.path, part, {
        signal: run.signal,
        onProgress: (bytes) => run.progress({ current: bytes }),
      });
      if (row.sha256 && read.sha256 !== row.sha256) {
        throw new PermanentJobError(
          "The original no longer matches the checksum recorded when it was installed, so it was not moved. Check the collection to see whether it is damaged.",
        );
      }
      // First time this collection has been hashed: keep the result for later checks.
      if (!row.sha256) host.write(row.id, { sha256: read.sha256 });

      run.progress({ current: size, message: "Checking the copy" });
      const written = await hashTree(part, {
        signal: run.signal,
        onProgress: (bytes) => run.progress({ current: size + bytes }),
      });
      if (written.sha256 !== read.sha256) {
        throw new PermanentJobError(
          `The copy on "${targetName}" did not match the original, so it was discarded. The original is untouched. The target drive may be faulty.`,
        );
      }
      run.signal.throwIfAborted();

      // The switch: from here on the copy is the collection.
      await fs.promises.rename(part, target);
      try {
        const moved = host.write(row.id, {
          locationId: run.payload.targetLocationId,
          sizeBytes: written.bytes,
          status: "installed",
          verifiedAt: Date.now(),
        });
        switched = true;
        return moved;
      } catch (error) {
        await fs.promises.rename(target, part).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (error instanceof UnsupportedEntryError) throw new PermanentJobError(error.message);
      throw error;
    } finally {
      if (!switched) {
        await fs.promises
          .rm(part, { recursive: true, force: true })
          .catch((error) => run.log.warn({ err: error }, "could not remove the partial copy"));
        host.write(row.id, { status: "installed" });
      }
    }
  }

  ctx.jobs.register<VerifyPayload>(VERIFY_JOB, { queue: "transfer", run: runVerify });
  ctx.jobs.register<MovePayload>(MOVE_JOB, { queue: "transfer", run: runMove });

  return {
    verify(id: string): JobRow {
      const row = host.requireRow(id);
      assertIdle(row);
      if (!storage.isAvailable(row.locationId)) {
        throw new AppError(
          "storage_unavailable",
          `The storage location holding "${row.title}" is not connected. Reconnect it, then check again.`,
          { locationId: row.locationId },
        );
      }
      return ctx.jobs.enqueue<VerifyPayload>(
        VERIFY_JOB,
        { collectionId: id },
        { title: `Check ${row.title}`, subject: `collection:${id}` },
      );
    },

    async move(id: string, targetLocationId: string): Promise<JobRow> {
      const row = host.requireRow(id);
      assertIdle(row);
      const target = storage.get(targetLocationId);
      if (row.locationId === targetLocationId) throw conflict(`"${row.title}" is already on "${target.name}".`);
      if (row.status !== "installed") {
        throw conflict(`"${row.title}" is ${row.status} and cannot be moved. Check it first.`);
      }
      // Fail now, with the reason, rather than in a background job a moment later.
      const source = storage.resolve(row.locationId, row.relPath);
      const destination = host.resolveTarget(targetLocationId, row.relPath).absolute;
      if (await pathExists(destination)) {
        throw conflict(`"${target.name}" already has a file at ${row.relPath}. Outpost will not overwrite it.`);
      }
      await storage.assertSpace(targetLocationId, await sizeOnDisk(source));
      return ctx.jobs.enqueue<MovePayload>(
        MOVE_JOB,
        { collectionId: id, targetLocationId },
        { title: `Move ${row.title} to ${target.name}`, subject: `collection:${id}` },
      );
    },
  };
}

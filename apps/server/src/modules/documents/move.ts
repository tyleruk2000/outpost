/**
 * Moving documents to another storage location.
 *
 * Each original is copied, the copy is checked against the checksum recorded when the
 * document was added, the record is pointed at the copy, and only then is the old file
 * removed. A document keeps its id throughout, so links, tags and search results are
 * unaffected. Anything that cannot be moved is left exactly where it was and reported.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, inArray, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { openRegularFile } from "../../core/fs-safe.ts";
import { type JobRow, toJobDto } from "../../core/jobs.ts";
import { syncedWriteStream } from "../../core/synced-write.ts";
import { documents } from "../../db/schema.ts";

interface MovePayload extends Record<string, unknown> {
  locationId: string;
  /** Only these documents; every document that is elsewhere when omitted. */
  ids?: string[];
}

export interface DocumentMoves {
  /** Queues a job that moves documents to a location: the ones named, or every one that is elsewhere. */
  start(locationId: string, ids?: string[]): Promise<{ job: JobRow; documents: number }>;
}

declare module "../../core/context.ts" {
  interface Services {
    documentMoves: DocumentMoves;
  }
}

/** SQLite takes a limited number of values in one statement; a selection can be larger. */
const ID_BATCH = 400;

export function registerDocumentMoves(app: FastifyInstance, ctx: AppContext): void {
  const { db, jobs } = ctx;
  const { storage } = ctx.services;

  function elsewhere(locationId: string, ids?: string[]) {
    if (!ids) return db.select().from(documents).where(ne(documents.locationId, locationId)).all();
    const rows: Array<typeof documents.$inferSelect> = [];
    for (let start = 0; start < ids.length; start += ID_BATCH) {
      rows.push(
        ...db
          .select()
          .from(documents)
          .where(and(ne(documents.locationId, locationId), inArray(documents.id, ids.slice(start, start + ID_BATCH))))
          .all(),
      );
    }
    return rows;
  }

  jobs.register<MovePayload>("documents.move", {
    queue: "transfer",
    async run({ payload, signal, progress }) {
      const target = storage.get(payload.locationId);
      const rows = elsewhere(target.id, payload.ids);
      const total = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
      let done = 0;
      const moved: string[] = [];
      const left: Array<{ title: string; reason: string }> = [];

      for (const row of rows) {
        signal.throwIfAborted();
        progress({ current: done, total, message: `Moving ${row.title}` });
        if (!storage.isAvailable(row.locationId)) {
          left.push({ title: row.title, reason: `It is on "${storage.get(row.locationId).name}", which is not connected.` });
          done += row.sizeBytes;
          continue;
        }
        const source = storage.resolve(row.locationId, row.relPath);
        const destination = storage.resolve(target.id, row.relPath);
        const partial = `${destination}.part`;
        const before = done;
        try {
          await fs.promises.mkdir(path.dirname(destination), { recursive: true });
          const hash = createHash("sha256");
          await pipeline(
            // By its own name, not through a link put in its place.
            (await openRegularFile(source)).handle.createReadStream({ highWaterMark: 1024 * 1024 }),
            async function* (stream) {
              for await (const chunk of stream) {
                hash.update(chunk as Buffer);
                done += (chunk as Buffer).length;
                progress({ current: done, total, message: `Moving ${row.title}` });
                yield chunk;
              }
            },
            syncedWriteStream(partial),
            { signal },
          );
          if (hash.digest("hex") !== row.sha256) {
            throw new AppError(
              "conflict",
              "The file no longer matches the checksum recorded when it was added, so it was left where it is.",
            );
          }
          await fs.promises.rename(partial, destination);
          await ctx.services.documents.relocate(row.id, target.id, row.relPath);
          // The record now points at the copy; the original can go, and its folder if that emptied it.
          await fs.promises.rm(source, { force: true });
          await fs.promises.rmdir(path.dirname(source)).catch(() => {});
          moved.push(row.id);
        } catch (error) {
          await fs.promises.rm(partial, { force: true });
          if (signal.aborted) throw error;
          done = before + row.sizeBytes;
          const code = (error as NodeJS.ErrnoException).code;
          left.push({
            title: row.title,
            reason:
              code === "ENOSPC"
                ? "The destination is full."
                : code === "ENOENT"
                  ? "The original file is missing."
                  : error instanceof Error
                    ? error.message
                    : String(error),
          });
          if (code === "ENOSPC") break;
        }
      }
      ctx.events.publish({ type: "documents.changed" });
      ctx.events.publish({ type: "storage.changed" });
      return { moved: moved.length, left, locationId: target.id };
    },
  });

  async function start(locationId: string, ids?: string[]): Promise<{ job: JobRow; documents: number }> {
    const body = { locationId, ids };
    const target = storage.get(body.locationId);
    if (target.status !== "available") throw new AppError("storage_unavailable", `"${target.name}" is not connected.`);
    const rows = elsewhere(target.id, body.ids);
    if (rows.length === 0) {
      throw conflict(body.ids ? `Those documents are already on "${target.name}".` : `Every document is already on "${target.name}".`);
    }
    if (jobs.list({ states: ["queued", "running"], types: ["documents.move"], limit: 1 }).length > 0) {
      throw conflict("Documents are already being moved. Wait for that to finish, or cancel it on the Downloads and tasks screen.");
    }
    await storage.assertSpace(
      target.id,
      rows.reduce((sum, row) => sum + row.sizeBytes, 0),
    );
    const job = jobs.enqueue(
      "documents.move",
      { locationId: target.id, ...(body.ids ? { ids: rows.map((row) => row.id) } : {}) },
      {
        title: body.ids
          ? `Move ${rows.length} document${rows.length === 1 ? "" : "s"} to ${target.name}`
          : `Move documents to ${target.name}`,
        subject: `documents-move:${target.id}`,
      },
    );
    return { job, documents: rows.length };
  }
  ctx.services.documentMoves = { start };

  app.post("/api/documents/move", async (request) => {
    const body = z
      .object({ locationId: z.string().min(1), ids: z.array(z.string().min(1).max(100)).min(1).max(20_000).optional() })
      .parse(request.body);
    const started = await start(body.locationId, body.ids);
    return { job: toJobDto(started.job), documents: started.documents };
  });
}

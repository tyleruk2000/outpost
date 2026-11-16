/**
 * Receiving a multipart upload of one or more files.
 *
 * Each file is streamed to a part file as it arrives (hashed, counted and type-checked
 * on the way) and nothing is held in memory. Files become documents only after the
 * whole request has been read, for two reasons: form fields such as `category` may
 * come after the files they describe, and a connection that drops half-way then leaves
 * nothing behind rather than an arbitrary first few files.
 *
 * A file that is refused does not stop the others: its bytes are read and thrown away
 * so the next part can be reached, and it is reported in its own result.
 */
import type { UploadResult } from "@outpost/shared";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import type { LocationRow } from "../storage/service.ts";
import { displayName } from "./file-types.ts";
import { type CommitOptions, cleanTags, type DocumentsService } from "./service.ts";
import { discardPart, type StagedFile, stageStream } from "./staging.ts";

const MAX_FILES_PER_REQUEST = 200;
const fieldNames = new Set(["category", "tags", "locationId", "allowDuplicate", "title", "source"]);

const flag = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");

const fieldsSchema = z.object({
  category: z.string().trim().max(100).optional(),
  tags: z
    .string()
    .max(4000)
    .optional()
    .transform((value) => (value ?? "").split(",")),
  locationId: z.string().max(64).optional(),
  allowDuplicate: flag,
  // What the file is and where it came from, when the sender knows better than the file's
  // name does: a PDF the web app made itself says so here (see docs/library.md).
  title: z.string().trim().max(300).optional(),
  source: z.string().trim().max(1000).optional(),
});

type Received = { originalName: string } & ({ staged: StagedFile } | { refusal: AppError });

/**
 * Lets a loop stop reading a stream without closing it. Breaking out of `for await`
 * on the stream itself would destroy it, and with it the rest of the request; here the
 * remainder can still be drained so the next file can be read.
 */
function resumable(stream: AsyncIterable<Buffer>): { chunks: AsyncIterable<Buffer>; drain(): Promise<void> } {
  const iterator = stream[Symbol.asyncIterator]();
  return {
    chunks: { [Symbol.asyncIterator]: () => ({ next: () => iterator.next() }) },
    async drain() {
      while (!(await iterator.next()).done);
    },
  };
}

function refusalOf(error: unknown): AppError {
  if (error instanceof AppError) return error;
  throw error;
}

const rejected = (originalName: string, refusal: AppError): UploadResult => ({
  originalName,
  status: "rejected",
  reason: refusal.message,
  code: refusal.code,
});

/** Parser limits arrive as plain 413 errors; say what the limit was. */
function describeLimit(error: unknown): unknown {
  const code = (error as { code?: string } | null)?.code;
  if (code === "FST_FILES_LIMIT") return badRequest(`Upload at most ${MAX_FILES_PER_REQUEST} files at a time.`);
  if (code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT")
    return badRequest("This upload has more parts than Outpost accepts in one request.");
  return error;
}

export async function receiveUpload(request: FastifyRequest, ctx: AppContext, service: DocumentsService): Promise<UploadResult[]> {
  if (!request.isMultipart()) throw badRequest("Send the files as a multipart/form-data upload.");
  const maxBytes = ctx.config.maxUploadBytes;
  // Fields may also be given in the address, which is the only way to be sure the
  // storage location is known before the first file starts arriving.
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.query as Record<string, unknown>)) {
    if (fieldNames.has(name) && typeof value === "string") fields[name] = value;
  }

  const received: Received[] = [];
  let location: LocationRow | undefined;
  let finished = false;
  try {
    const parts = request.parts({
      limits: { fileSize: maxBytes, files: MAX_FILES_PER_REQUEST, fields: 20, fieldSize: 8192 },
      // Too-large files are reported one by one below rather than failing the request.
      throwFileSizeLimit: false,
    } as Parameters<FastifyRequest["parts"]>[0]);

    for await (const part of parts) {
      if (part.type === "field") {
        if (!fieldNames.has(part.fieldname) || typeof part.value !== "string") continue;
        if (part.fieldname === "locationId" && location && part.value !== location.id) {
          throw badRequest("Send the locationId field before the files, so Outpost knows where to store them.");
        }
        fields[part.fieldname] = part.value;
        continue;
      }

      if (!location) {
        location = service.uploadLocation(fields.locationId || undefined);
        // The request is a little larger than the files in it, so this errs on the safe side.
        const declared = Number(request.headers["content-length"]);
        if (Number.isFinite(declared) && declared > 0) await ctx.services.storage.assertSpace(location.id, declared);
      }
      const originalName = displayName(part.filename);
      const body = resumable(part.file);
      try {
        const staged = await stageStream(body.chunks, { location, originalName, maxBytes, wasTruncated: () => part.file.truncated });
        received.push({ originalName, staged });
      } catch (error) {
        received.push({ originalName, refusal: refusalOf(error) });
        await body.drain();
      }
    }

    if (received.length === 0) throw badRequest("No files were sent. Choose at least one file to upload.");
    const parsed = fieldsSchema.parse(fields);
    // A title names one thing. Given with several files it would name them all alike.
    if (parsed.title && received.length > 1) throw badRequest("A title can be given only when one file is sent.");
    // Tags are checked once here: a bad tag is a mistake in the request, not in any one file.
    const options: CommitOptions = {
      title: parsed.title,
      source: parsed.source,
      category: parsed.category,
      tags: cleanTags(parsed.tags),
      allowDuplicate: parsed.allowDuplicate,
    };

    const results: UploadResult[] = [];
    for (const item of received) {
      if ("refusal" in item) {
        results.push(rejected(item.originalName, item.refusal));
        continue;
      }
      try {
        const outcome = await service.commitStaged(item.staged, options);
        results.push({ originalName: item.originalName, status: outcome.status, document: outcome.document });
      } catch (error) {
        results.push(rejected(item.originalName, refusalOf(error)));
      }
    }
    finished = true;
    return results;
  } catch (error) {
    throw describeLimit(error);
  } finally {
    // After a failure, part files that never became documents are removed. On success
    // every one of them was consumed by its commit.
    if (!finished) {
      for (const item of received) if ("staged" in item) await discardPart(item.staged.partPath);
    }
  }
}

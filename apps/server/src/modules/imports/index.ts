/**
 * Imports: bringing existing notes into Outpost.
 *
 *   POST   /api/imports             upload files (multipart); analysis starts by itself
 *   GET    /api/imports             recent imports
 *   GET    /api/imports/:id         one import with its plan and, later, its report
 *   POST   /api/imports/:id/commit  carry out the plan with the chosen options
 *   POST   /api/imports/:id/cancel  stop the analysis or the commit that is running
 *   DELETE /api/imports/:id         discard: remove the uploaded files
 *
 * The rules live in `service.ts`; this file receives the upload, checks who is asking
 * and validates what they sent.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import fastifyMultipart from "@fastify/multipart";
import { formatBytes, IMPORT_EXTENSIONS, type ImportListResponse, type ImportResponse } from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { safeFileName } from "../../core/fs-safe.ts";
import { newId } from "../../core/ids.ts";
import { SPACE_RESERVE_BYTES } from "../storage/service.ts";
import { extensionOf, stemOf } from "./names.ts";
import { createImportsService, type ImportsService, type ReceivedUpload } from "./service.ts";

export type { ImportsService } from "./service.ts";

const MAX_FILES_PER_UPLOAD = 500;
const ACCEPTED = new Set<string>(IMPORT_EXTENSIONS);
const ACCEPTED_TEXT = "Markdown (.md), HTML, plain text, CSV and PDF files, or a ZIP archive of them";

const idParams = z.object({ id: z.string().min(1).max(64) });

const commitBody = z.object({
  parentId: z.string().min(1).max(64).nullable().optional(),
  duplicates: z.enum(["skip", "copy", "replace"]),
  pdfs: z.enum(["library", "skip"]),
  replaceConfirmed: z.boolean().optional(),
});

/** A name not yet used in this upload: "notes.md", then "notes (2).md". */
function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${stemOf(name)} (${n})${path.extname(name)}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Refuses an upload that plainly cannot fit before a byte of it is written. */
async function assertRoom(dir: string, request: FastifyRequest): Promise<void> {
  const declared = Number(request.headers["content-length"]);
  if (!Number.isFinite(declared) || declared <= 0) return;
  const stats = await fs.promises.statfs(dir).catch(() => undefined);
  if (stats && stats.bavail * stats.bsize < declared + SPACE_RESERVE_BYTES) {
    throw new AppError(
      "insufficient_space",
      "There is not enough free space where Outpost keeps its data to take this upload. Free some space and try again.",
    );
  }
}

/**
 * Streams every file of a multipart request into the import's `upload/` folder. Files
 * go straight to disk as they arrive; nothing is held in memory. Any refusal removes
 * what was written, so an upload either becomes an import whole or leaves nothing.
 */
async function receive(request: FastifyRequest, ctx: AppContext, service: ImportsService): Promise<ReceivedUpload> {
  if (!request.isMultipart()) throw badRequest("Send the files as a form upload.");
  const maxBytes = ctx.config.maxUploadBytes;
  const id = newId();
  const dir = await service.prepareUpload(id);
  const taken = new Set<string>();
  const upload: ReceivedUpload = { id, names: [], sizeBytes: 0 };

  try {
    await assertRoom(dir, request);
    const parts = request.parts({
      limits: { fileSize: maxBytes, files: MAX_FILES_PER_UPLOAD, fields: 10 },
      // An oversized file is answered below with a message that names it.
      throwFileSizeLimit: false,
    } as Parameters<FastifyRequest["parts"]>[0]);

    for await (const part of parts) {
      if (part.type !== "file") continue;
      // Only the last segment of the name is used, so a path in the name cannot place the file.
      const original = (part.filename ?? "").split(/[\\/]/).pop() ?? "";
      const name = safeFileName(original, "");
      if (!name || !ACCEPTED.has(extensionOf(name))) {
        throw new AppError(
          "unsupported",
          `"${original || "A file without a name"}" is not something Outpost can import. Choose ${ACCEPTED_TEXT}.`,
        );
      }
      const stored = uniqueName(name, taken);
      const target = path.join(dir, stored);
      await pipeline(part.file, fs.createWriteStream(target, { flags: "wx" }));
      if (part.file.truncated) {
        throw new AppError("too_large", `"${name}" is larger than the ${formatBytes(maxBytes)} this server accepts for one file.`);
      }
      upload.names.push(stored);
      upload.sizeBytes += (await fs.promises.stat(target)).size;
    }
    if (upload.names.length === 0) throw badRequest("No files were received. Choose at least one file to import.");
    return upload;
  } catch (error) {
    await service.abandonUpload(id);
    const code = (error as { code?: string } | null)?.code;
    if (code === "FST_FILES_LIMIT")
      throw badRequest(`Upload at most ${MAX_FILES_PER_UPLOAD} files at a time. To import more, put them in a ZIP archive.`);
    throw error;
  }
}

export async function registerImports(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = await createImportsService(ctx);
  ctx.services.imports = service;
  const { auth } = ctx.services;

  // Whichever module registers first provides the parser; limits are given per request.
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(fastifyMultipart, { limits: { fileSize: ctx.config.maxUploadBytes } });
  }

  app.post("/api/imports", async (request): Promise<ImportResponse> => {
    auth.requireUser(request);
    const upload = await receive(request, ctx, service);
    try {
      return { import: service.createFromUpload(upload) };
    } catch (error) {
      await service.abandonUpload(upload.id);
      throw error;
    }
  });

  app.get("/api/imports", async (request): Promise<ImportListResponse> => {
    auth.requireUser(request);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
    return { imports: service.list(query.limit) };
  });

  app.get("/api/imports/:id", async (request): Promise<ImportResponse> => {
    auth.requireUser(request);
    return { import: service.get(idParams.parse(request.params).id) };
  });

  app.post("/api/imports/:id/commit", async (request): Promise<ImportResponse> => {
    auth.requireUser(request);
    const { id } = idParams.parse(request.params);
    return { import: service.commit(id, commitBody.parse(request.body ?? {})) };
  });

  app.post("/api/imports/:id/cancel", async (request): Promise<ImportResponse> => {
    auth.requireUser(request);
    return { import: service.cancel(idParams.parse(request.params).id) };
  });

  app.delete("/api/imports/:id", async (request): Promise<ImportResponse> => {
    auth.requireUser(request);
    return { import: await service.discard(idParams.parse(request.params).id) };
  });
}

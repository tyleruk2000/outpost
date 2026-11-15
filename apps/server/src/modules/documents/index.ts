/**
 * HTTP routes of the document library. The rules live in `service.ts`; this file
 * validates input, checks who is asking, and shapes responses.
 */
import fs from "node:fs";
import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { safeFileName } from "../../core/fs-safe.ts";
import { DOCUMENT_TYPES, formatForExt, servedAs } from "./file-types.ts";
import { contentDisposition, matchesEtag, parseRange } from "./http.ts";
import { createDocumentsService } from "./service.ts";
import { receiveUpload } from "./upload.ts";

/**
 * Sent with every original file. `sandbox` gives the response an origin of its own, so
 * even a file that a browser decides to render cannot read Outpost's cookies or call
 * its API; the rest stops it loading anything from anywhere.
 */
const FILE_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";

const blankAsMissing = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

const listQuery = z.object({
  q: blankAsMissing(200),
  category: blankAsMissing(100),
  tag: blankAsMissing(50),
  type: z.enum(DOCUMENT_TYPES).optional(),
  sort: z.enum(["added", "title", "size"]).default("added"),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const optionalText = (max: number) => z.string().max(max).nullable().optional();

const patchBody = z
  .object({
    title: z.string().trim().min(1, "A document needs a title.").max(300).optional(),
    description: optionalText(5000),
    category: optionalText(100),
    author: optionalText(300),
    source: optionalText(1000),
    language: optionalText(35),
    tags: z.array(z.string().max(200)).max(200).optional(),
  })
  .strict();

const switchOn = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");

type IdParams = { Params: { id: string } };

export async function registerDocuments(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createDocumentsService(ctx);
  ctx.services.documents = service;
  const { auth } = ctx.services;

  // Another module may have registered the multipart parser already; twice is an error.
  // Limits are passed with each request, so it does not matter whose registration won.
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(fastifyMultipart, { limits: { fileSize: ctx.config.maxUploadBytes } });
  }

  /**
   * Upload one or more files. Optional fields `category`, `tags` (comma separated),
   * `locationId` and `allowDuplicate` may be form fields or query parameters. The
   * answer has one result per file; a refused file does not fail the others.
   */
  app.post("/api/documents", async (request) => {
    auth.requireUser(request);
    return { results: await receiveUpload(request, ctx, service) };
  });

  app.get("/api/documents", async (request) => service.list(listQuery.parse(request.query)));

  app.get("/api/documents/facets", async () => service.facets());

  app.get<IdParams>("/api/documents/:id", async (request) => ({ document: service.get(request.params.id) }));

  app.patch<IdParams>("/api/documents/:id", async (request) => {
    auth.requireUser(request);
    return { document: await service.update(request.params.id, patchBody.parse(request.body)) };
  });

  app.delete<IdParams>("/api/documents/:id", async (request) => {
    auth.requireAdmin(request);
    const { forget } = z.object({ forget: switchOn }).parse(request.query);
    await service.remove(request.params.id, { forget });
    return { ok: true };
  });

  app.post<IdParams>("/api/documents/:id/reextract", async (request) => {
    auth.requireUser(request);
    const { document, job } = service.reextract(request.params.id);
    return { document, jobId: job.id };
  });

  app.get<IdParams>("/api/documents/:id/text", async (request) => {
    const { page } = z.object({ page: z.coerce.number().int().min(1).optional() }).parse(request.query);
    return service.text(request.params.id, page);
  });

  /**
   * The original file, with byte ranges so a PDF viewer can fetch only the pages it
   * shows. Only types that cannot run script are displayed in place; see `servedAs`.
   */
  app.get<IdParams>("/api/documents/:id/file", async (request, reply) => {
    const document = service.get(request.params.id);
    const file = service.absolutePath(document.id);
    const stat = await fs.promises.stat(file).catch(() => undefined);
    if (!stat?.isFile()) {
      throw new AppError(
        "not_found",
        `The file of "${document.title}" is missing from its storage location (${document.relPath}). It may have been moved or deleted outside Outpost.`,
      );
    }

    const { download } = z.object({ download: switchOn }).parse(request.query);
    const served = servedAs(formatForExt(document.ext), download);
    const etag = `"${document.sha256}"`;
    reply
      .header("Content-Security-Policy", FILE_CSP)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Disposition", contentDisposition(served.disposition, safeFileName(document.originalName)))
      .header("Accept-Ranges", "bytes")
      .header("ETag", etag)
      // The bytes behind an id never change, so a browser may keep them and revalidate.
      .header("Cache-Control", "private, no-cache")
      .header("Last-Modified", new Date(document.createdAt).toUTCString());

    if (matchesEtag(request.headers["if-none-match"], etag)) return reply.status(304).send();

    // A range is only honoured for the version the client already has part of.
    const ifRange = request.headers["if-range"];
    const current = ifRange === undefined || (typeof ifRange === "string" && matchesEtag(ifRange, etag));
    const range = current ? parseRange(request.headers.range, stat.size) : undefined;
    if (range === "unsatisfiable") {
      return reply
        .status(416)
        .header("Content-Range", `bytes */${stat.size}`)
        .send({ error: { code: "bad_request", message: "The requested part of the file does not exist." } });
    }

    reply.type(served.contentType);
    if (range) {
      reply
        .status(206)
        .header("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`)
        .header("Content-Length", range.end - range.start + 1);
      return reply.send(fs.createReadStream(file, { start: range.start, end: range.end }));
    }
    reply.header("Content-Length", stat.size);
    return reply.send(fs.createReadStream(file));
  });

  app.get("/api/tags", async () => ({ tags: service.tags() }));
}

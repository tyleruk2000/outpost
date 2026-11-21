/**
 * Notes: routes for the page tree, page content, attachments and Markdown export.
 * The rules live in `service.ts`; this file checks who is asking, validates the request
 * and shapes the answer.
 */
import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { pathExists } from "../../core/fs-safe.ts";
import { registerMultipart } from "../../core/multipart.ts";
import { type AttachmentRow, contentDisposition, createAttachmentStore, MAX_ATTACHMENT_BYTES } from "./attachments.ts";
import { createNotesExporter, type NotesExporter } from "./export.ts";
import { createNotesService } from "./service.ts";

export type { NotesService } from "./service.ts";

/** Uploaded files are never trusted to be what they claim, so they can never script the app. */
const ATTACHMENT_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
/** An attachment's bytes never change for an id, so the browser may keep it for good. */
const ATTACHMENT_CACHE = "private, max-age=31536000, immutable";

const id = z.string().min(1).max(64);
const title = z.string().max(300);
const icon = z.string().max(64).nullable();
const idParams = z.object({ id });

const createBody = z.object({
  parentId: id.nullable().optional(),
  title: title.optional(),
  icon: icon.optional(),
  content: z.unknown().optional(),
  templateId: z.string().min(1).max(80).optional(),
  afterId: id.optional(),
  /** The page's id as the device that wrote it made it: sent twice, it makes one page (see CreateNoteInput). */
  clientId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, "That is not an id a phone gives.")
    .optional(),
});

const updateBody = z.object({
  title: title.optional(),
  icon: icon.optional(),
  content: z.unknown().optional(),
  tags: z.array(z.string().max(200)).max(200).optional(),
  isFavorite: z.boolean().optional(),
  coverAttachmentId: id.nullable().optional(),
  isTemplate: z.boolean().optional(),
  baseUpdatedAt: z.number().optional(),
  removeEncryption: z.boolean().optional(),
  origin: z.string().max(64).optional(),
});

const moveBody = z.object({ parentId: id.nullable(), afterId: id.nullable().optional() });
const duplicateBody = z.object({ withChildren: z.boolean().optional() });
const flag = z.enum(["1", "true", "0", "false"]).optional();
const isOn = (value: string | undefined) => value === "1" || value === "true";

declare module "../../core/context.ts" {
  interface Services {
    /** Pages as Markdown, for "Take everything out" (modules/export-all). */
    notesExport: NotesExporter;
  }
}

export async function registerNotes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const attachments = createAttachmentStore(ctx);
  const notes = createNotesService(ctx, attachments);
  const exporter = createNotesExporter(ctx, notes, attachments);
  ctx.services.notes = notes;
  ctx.services.notesExport = exporter;

  // The limits are the routes' own, given with each request (see core/multipart.ts).
  await registerMultipart(app);

  // ── The tree and lists ──

  app.get("/api/notes/tree", async () => {
    return { notes: notes.tree() };
  });

  app.get("/api/notes/recent", async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    return { notes: notes.recent(query.limit) };
  });

  app.get("/api/notes/favorites", async () => {
    return { notes: notes.favorites() };
  });

  app.get("/api/notes/trash", async () => {
    return { notes: notes.listTrash() };
  });

  app.get("/api/notes/templates", async () => {
    return { templates: notes.templates() };
  });

  app.get("/api/notes/lookup", async (request) => {
    const query = z
      .object({ q: z.string().max(200).default(""), limit: z.coerce.number().int().min(1).max(50).default(10) })
      .parse(request.query);
    return { notes: notes.lookup(query.q, query.limit) };
  });

  // ── Pages ──

  app.post("/api/notes", async (request) => {
    return { note: notes.create(createBody.parse(request.body ?? {})) };
  });

  app.get("/api/notes/:id", async (request) => {
    const params = idParams.parse(request.params);
    const query = z.object({ view: flag }).parse(request.query);
    return { note: notes.get(params.id, { view: isOn(query.view) }) };
  });

  app.patch("/api/notes/:id", async (request) => {
    const params = idParams.parse(request.params);
    return { note: notes.update(params.id, { ...updateBody.parse(request.body ?? {}), guardEncryption: true }) };
  });

  app.post("/api/notes/:id/move", async (request) => {
    const params = idParams.parse(request.params);
    return { note: notes.move(params.id, moveBody.parse(request.body)) };
  });

  app.post("/api/notes/:id/duplicate", async (request) => {
    const params = idParams.parse(request.params);
    return { note: notes.duplicate(params.id, duplicateBody.parse(request.body ?? {})) };
  });

  app.delete("/api/notes/:id", async (request) => {
    const params = idParams.parse(request.params);
    const query = z.object({ permanent: flag }).parse(request.query);
    if (isOn(query.permanent)) {
      return notes.deletePermanently(params.id);
    }
    return { trashed: notes.trash(params.id) };
  });

  app.post("/api/notes/:id/restore", async (request) => {
    const params = idParams.parse(request.params);
    return { note: notes.restore(params.id) };
  });

  // ── Earlier versions ──

  app.get("/api/notes/versions/space", async () => {
    return notes.versions.space();
  });

  app.delete("/api/notes/versions", async () => {
    return { cleared: notes.clearVersions() };
  });

  app.get("/api/notes/:id/versions", async (request) => {
    const params = idParams.parse(request.params);
    notes.getRow(params.id);
    return { versions: notes.versions.list(params.id) };
  });

  app.get("/api/notes/:id/versions/:versionId", async (request) => {
    const params = z.object({ id, versionId: id }).parse(request.params);
    return { version: notes.versions.get(params.id, params.versionId) };
  });

  app.post("/api/notes/:id/versions/:versionId/restore", async (request) => {
    const params = z.object({ id, versionId: id }).parse(request.params);
    const body = z.object({ baseUpdatedAt: z.number(), origin: z.string().max(64).optional() }).parse(request.body);
    return { note: notes.restoreVersion(params.id, params.versionId, body) };
  });

  // ── Export ──

  app.get("/api/notes/:id/export.md", async (request, reply) => {
    const params = idParams.parse(request.params);
    const { filename, markdown } = exporter.page(params.id);
    return reply
      .header("Content-Type", "text/markdown; charset=utf-8")
      .header("Content-Disposition", contentDisposition("attachment", filename))
      .send(markdown);
  });

  app.get("/api/notes/export.zip", async (_request, reply) => {
    const { filename, stream } = exporter.workspace();
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", contentDisposition("attachment", filename))
      .send(stream);
  });

  // ── Attachments ──

  /**
   * Upload one file as `multipart/form-data`. An optional `noteId` field (or query
   * parameter) records which page it was added to.
   */
  app.post("/api/attachments", async (request) => {
    if (!request.isMultipart()) throw badRequest("Send the file as a form upload.");
    const query = z.object({ noteId: id.optional() }).parse(request.query);
    let noteId = query.noteId;
    let saved: AttachmentRow | undefined;

    // One byte over the limit is allowed through so that the store can tell "exactly
    // the limit" from "too large" and answer with a message that says so.
    const parts = request.parts({ limits: { fileSize: MAX_ATTACHMENT_BYTES + 1, files: 1, fields: 10 } });
    try {
      for await (const part of parts) {
        if (part.type === "file") {
          if (saved) part.file.resume();
          else saved = await attachments.saveStream({ stream: part.file, filename: part.filename || "file" });
        } else if (part.fieldname === "noteId" && typeof part.value === "string" && part.value) {
          noteId = part.value;
        }
      }
      if (!saved) throw badRequest("No file was received. Choose a file and try again.");
      // The field may arrive after the file, so the page is checked once both are known.
      if (noteId) {
        notes.getRow(noteId);
        ctx.sqlite.prepare(`UPDATE attachments SET note_id = ? WHERE id = ?`).run(noteId, saved.id);
        saved = attachments.get(saved.id);
      }
    } catch (error) {
      // A request that fails after its file was stored must not leave the file behind.
      if (saved) await attachments.remove(saved.id);
      throw error;
    }
    return { attachment: attachments.toDto(saved) };
  });

  app.get("/api/attachments/:id", async (request, reply) => {
    const params = idParams.parse(request.params);
    const row = attachments.get(params.id);
    const file = attachments.filePath(row);
    if (!(await pathExists(file))) throw notFound("The file of this attachment");

    const etag = `"${row.sha256}"`;
    reply
      .header("Content-Security-Policy", ATTACHMENT_CSP)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", ATTACHMENT_CACHE)
      .header("ETag", etag);
    if (request.headers["if-none-match"] === etag) return reply.status(304).send();

    return reply
      .header("Content-Type", row.mime)
      .header("Content-Length", row.sizeBytes)
      .header("Content-Disposition", contentDisposition(attachments.isInline(row) ? "inline" : "attachment", row.filename))
      .send(fs.createReadStream(file));
  });

  app.delete("/api/attachments/:id", async (request) => {
    const params = idParams.parse(request.params);
    await notes.deleteAttachment(params.id);
    return { ok: true };
  });
}

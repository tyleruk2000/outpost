/**
 * Highlights and margin notes on library documents (PDF, EPUB, Markdown).
 *
 * They live in the `document_highlights` table only: the document's file is never
 * opened for writing. Each highlight is also an entry of its own in search, so a line
 * written beside a passage is found by the search box, and a document's highlights can
 * be copied into a new page of Notes with a link back to each passage.
 */
import {
  HIGHLIGHT_CONTEXT_CHARS,
  type HighlightDto,
  type HighlightListItem,
  highlightUrl,
  MAX_HIGHLIGHT_CHARS,
  MAX_HIGHLIGHT_NOTE_CHARS,
  type NoteNodeJson,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";

const SEARCH_KIND = "highlight";
/** The document types a passage can be marked in. */
const MARKABLE = new Set(["pdf", "epub", "markdown"]);

interface HighlightRow {
  id: string;
  documentId: string;
  page: number | null;
  chapter: number | null;
  exact: string;
  prefix: string;
  suffix: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface HighlightsService {
  list(documentId: string): HighlightDto[];
  search(query: string, limit: number): HighlightListItem[];
  create(documentId: string, input: CreateInput): HighlightDto;
  update(id: string, note: string, baseUpdatedAt?: number): HighlightDto;
  remove(id: string): void;
  /** Makes a page in Notes of the document's highlights (all, or those named). */
  toNotes(documentId: string, ids?: string[]): { id: string; title: string };
}

declare module "../../core/context.ts" {
  interface Services {
    highlights: HighlightsService;
  }
}

/** Collapses runs of white space, as a selection read from the screen has them. */
const squash = (value: string) => value.replace(/\s+/g, " ");

const id = z.string().min(1).max(64);
const position = z.number().int().min(1).max(1_000_000).nullable().optional();
const createBody = z.object({
  page: position,
  chapter: position,
  exact: z.string().max(MAX_HIGHLIGHT_CHARS * 2),
  prefix: z
    .string()
    .max(HIGHLIGHT_CONTEXT_CHARS * 4)
    .optional(),
  suffix: z
    .string()
    .max(HIGHLIGHT_CONTEXT_CHARS * 4)
    .optional(),
  note: z.string().max(MAX_HIGHLIGHT_NOTE_CHARS).optional(),
});
type CreateInput = z.infer<typeof createBody>;

const COLUMNS = `id, document_id AS documentId, page, chapter, exact, prefix, suffix, note, created_at AS createdAt, updated_at AS updatedAt`;
const ORDER = `coalesce(chapter, 0), coalesce(page, 0), created_at, id`;

export async function registerHighlights(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { sqlite } = ctx;
  const { documents, search, notes } = ctx.services;

  const listStatement = sqlite.prepare(`SELECT ${COLUMNS} FROM document_highlights WHERE document_id = ? ORDER BY ${ORDER}`);
  const getStatement = sqlite.prepare(`SELECT ${COLUMNS} FROM document_highlights WHERE id = ?`);
  const sameStatement = sqlite.prepare(
    `SELECT ${COLUMNS} FROM document_highlights
      WHERE document_id = @documentId AND page IS @page AND chapter IS @chapter AND exact = @exact AND prefix = @prefix AND suffix = @suffix`,
  );
  const insert = sqlite.prepare(
    `INSERT INTO document_highlights (id, document_id, page, chapter, exact, prefix, suffix, note, created_at, updated_at)
     VALUES (@id, @documentId, @page, @chapter, @exact, @prefix, @suffix, @note, @createdAt, @updatedAt)`,
  );
  const setNote = sqlite.prepare(`UPDATE document_highlights SET note = ?, updated_at = ? WHERE id = ?`);
  const deleteStatement = sqlite.prepare(`DELETE FROM document_highlights WHERE id = ?`);
  const titleStatement = sqlite.prepare(`SELECT title FROM documents WHERE id = ?`);
  const searchStatement = sqlite.prepare(
    `SELECT ${COLUMNS.replace(/(^|, )(\w)/g, "$1h.$2")}, d.title AS documentTitle
       FROM document_highlights h JOIN documents d ON d.id = h.document_id
      WHERE @q = '' OR h.exact LIKE @like ESCAPE '\\' OR h.note LIKE @like ESCAPE '\\' OR d.title LIKE @like ESCAPE '\\'
      ORDER BY h.updated_at DESC, h.id LIMIT @limit`,
  );
  const orphansStatement = sqlite.prepare(
    `SELECT entity_id AS id FROM search_entities WHERE kind = '${SEARCH_KIND}' AND entity_id NOT IN (SELECT id FROM document_highlights)`,
  );

  const toDto = (row: HighlightRow): HighlightDto => ({ ...row, url: highlightUrl(row) });

  function getRow(highlightId: string): HighlightRow {
    const row = getStatement.get(highlightId) as HighlightRow | undefined;
    if (!row) throw notFound("That highlight");
    return row;
  }

  /** Where in the document, in words: "Page 12", "Chapter 3". */
  const placeWords = (row: HighlightRow) =>
    row.page !== null ? `Page ${row.page}` : row.chapter !== null ? `Chapter ${row.chapter}` : null;

  function index(row: HighlightRow): void {
    const title = (titleStatement.get(row.documentId) as { title: string } | undefined)?.title ?? "";
    search.upsert({
      kind: SEARCH_KIND,
      entityId: row.id,
      title,
      subtitle: row.note || placeWords(row) || null,
      collection: "Highlights",
      url: highlightUrl(row),
      tags: [],
      sections: [{ text: row.exact }, ...(row.note ? [{ heading: "Margin note", text: row.note }] : [])],
    });
  }

  // A document deleted takes its highlights with it (the table cascades); their search entries follow.
  // A document renamed renames its highlights' entries (an unchanged entry is left as it is).
  const unsubscribe = ctx.events.subscribe((event) => {
    if (event.type !== "documents.changed") return;
    for (const { id: orphan } of orphansStatement.all() as Array<{ id: string }>) search.remove(SEARCH_KIND, orphan);
    if (event.id) for (const row of listStatement.all(event.id) as HighlightRow[]) index(row);
  });
  ctx.onClose.push(unsubscribe);

  const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

  const service: HighlightsService = {
    list(documentId) {
      documents.get(documentId);
      return (listStatement.all(documentId) as HighlightRow[]).map(toDto);
    },

    search(query, limit) {
      const q = query.trim();
      return (searchStatement.all({ q, like: `%${escapeLike(q)}%`, limit }) as Array<HighlightRow & { documentTitle: string }>).map(
        (row) => ({ ...toDto(row), documentTitle: row.documentTitle }),
      );
    },

    create(documentId, input) {
      const document = documents.get(documentId);
      if (!MARKABLE.has(document.type)) throw badRequest("Passages can be marked in PDFs, EPUB books and Markdown documents.");
      const exact = squash(input.exact).trim();
      if (!exact) throw badRequest("Select some words to mark first.");
      if (exact.length > MAX_HIGHLIGHT_CHARS) {
        throw badRequest(`A highlight can mark up to ${MAX_HIGHLIGHT_CHARS.toLocaleString("en-GB")} characters. Select a shorter passage.`);
      }
      const now = Date.now();
      const row: HighlightRow = {
        id: newId(),
        documentId,
        page: document.type === "pdf" ? (input.page ?? 1) : null,
        chapter: document.type === "epub" ? (input.chapter ?? null) : null,
        exact,
        prefix: squash(input.prefix ?? "").slice(-HIGHLIGHT_CONTEXT_CHARS),
        suffix: squash(input.suffix ?? "").slice(0, HIGHLIGHT_CONTEXT_CHARS),
        note: (input.note ?? "").trim(),
        createdAt: now,
        updatedAt: now,
      };
      // The same passage marked twice is one highlight; a note given the second time is added to it.
      const same = sameStatement.get(row) as HighlightRow | undefined;
      if (same) return row.note && !same.note ? service.update(same.id, row.note) : toDto(same);
      insert.run(row);
      index(row);
      ctx.events.publish({ type: "highlights.changed", id: documentId });
      return toDto(row);
    },

    update(highlightId, note, baseUpdatedAt) {
      const row = getRow(highlightId);
      if (baseUpdatedAt !== undefined && row.updatedAt > baseUpdatedAt)
        throw conflict(
          "This highlight's note was changed somewhere else after you opened it. Your note was not saved over it; open it again to see the newer one.",
          { current: { updatedAt: row.updatedAt, note: row.note } },
        );
      const next = { ...row, note: note.trim(), updatedAt: Math.max(Date.now(), row.updatedAt + 1) };
      setNote.run(next.note, next.updatedAt, highlightId);
      index(next);
      ctx.events.publish({ type: "highlights.changed", id: row.documentId });
      return toDto(next);
    },

    remove(highlightId) {
      const row = getRow(highlightId);
      deleteStatement.run(highlightId);
      search.remove(SEARCH_KIND, highlightId);
      ctx.events.publish({ type: "highlights.changed", id: row.documentId });
    },

    toNotes(documentId, ids) {
      const document = documents.get(documentId);
      let rows = listStatement.all(documentId) as HighlightRow[];
      if (ids) {
        const wanted = new Set(ids);
        rows = rows.filter((row) => wanted.has(row.id));
      }
      if (rows.length === 0) throw badRequest("There are no highlights to copy. Mark a passage first.");

      const text = (value: string, href?: string): NoteNodeJson =>
        href ? { type: "text", text: value, marks: [{ type: "link", attrs: { href } }] } : { type: "text", text: value };
      const paragraph = (...content: NoteNodeJson[]): NoteNodeJson => ({ type: "paragraph", content });
      const content: NoteNodeJson[] = [paragraph(text("From "), text(document.title, `/library/documents/${document.id}`), text("."))];
      for (const row of rows) {
        content.push({ type: "blockquote", content: [paragraph(text(row.exact))] });
        if (row.note) content.push(paragraph(text(row.note)));
        content.push(paragraph(text(placeWords(row) ?? "Go to the passage", highlightUrl(row))));
      }
      const page = notes.create({ title: `Highlights from ${document.title}`.slice(0, 300), content: { type: "doc", content } });
      return { id: page.id, title: page.title };
    },
  };
  ctx.services.highlights = service;

  // ── Routes ──

  app.get("/api/documents/:id/highlights", async (request) => {
    const params = z.object({ id }).parse(request.params);
    return { highlights: service.list(params.id) };
  });

  app.post("/api/documents/:id/highlights", async (request) => {
    const params = z.object({ id }).parse(request.params);
    return { highlight: service.create(params.id, createBody.parse(request.body)) };
  });

  app.post("/api/documents/:id/highlights/to-notes", async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ highlightIds: z.array(id).max(5000).optional() }).parse(request.body ?? {});
    return { note: service.toNotes(params.id, body.highlightIds) };
  });

  app.get("/api/highlights", async (request) => {
    const query = z
      .object({ q: z.string().max(200).default(""), limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(request.query);
    return { highlights: service.search(query.q, query.limit) };
  });

  app.patch("/api/highlights/:id", async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z
      .object({ note: z.string().max(MAX_HIGHLIGHT_NOTE_CHARS), baseUpdatedAt: z.number().int().optional() })
      .parse(request.body);
    return { highlight: service.update(params.id, body.note, body.baseUpdatedAt) };
  });

  app.delete("/api/highlights/:id", async (request) => {
    const params = z.object({ id }).parse(request.params);
    service.remove(params.id);
    return { ok: true };
  });
}

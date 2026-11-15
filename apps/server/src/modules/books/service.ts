/**
 * Books: a collection that is a folder of documents read in order.
 *
 * A handbook or a guide from the catalogue is too long to be one document: search could
 * only say "somewhere in this book", and a phone would have to load all of it to show a
 * page. So a book is kept as one document per chapter. The collection is the book (its
 * page is the contents), its folder holds the chapter files side by side, and the
 * `book_chapters` table says which document is which chapter and in what order.
 *
 * The chapters are ordinary documents: searched, opened and tagged like any other. They
 * differ in two ways. Their files stay together in the book's folder, so the book can
 * be checked and moved as one thing; and the library does not list them one by one
 * (see `documents/service.ts`), because three hundred chapters would bury everything else.
 *
 * The collection and its documents are kept in step here: removing the book with its
 * files removes the chapters, moving the book moves them, and a book whose chapters
 * have all been deleted is forgotten.
 */
import fs from "node:fs";
import path from "node:path";
import type { BookContentsResponse, BookSectionDto, DocumentChapterDto } from "@outpost/shared";
import { asc, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { bookChapters, collections as collectionsTable, documents as documentsTable } from "../../db/schema.ts";
import type { CollectionRow, CreateCollection } from "../collections/service.ts";
import { hashTree } from "../collections/transfer.ts";

export interface NewChapter {
  /** The chapter's name in links between chapters. */
  key: string;
  number?: string;
  title: string;
  summary?: string;
  /** The named part of the book it belongs to. */
  section: string;
  /** Name of its file inside the book's folder. */
  fileName: string;
}

export interface CreateBook {
  /** The collection to record. `relPath` is the book's folder, already holding every chapter file. */
  collection: Omit<CreateCollection, "kind" | "sizeBytes" | "sha256">;
  /** In reading order. */
  chapters: NewChapter[];
  /** Details every chapter document carries. */
  document: { category?: string; author?: string | null; source?: string | null; language?: string | null };
}

export interface BooksService {
  /**
   * Records a folder of chapter files as a book: the collection, one document per
   * chapter where the file lies, and the order. If any chapter cannot be added nothing
   * is recorded, and the folder is left for the caller, who made it, to clear away.
   */
  create(input: CreateBook): Promise<{ collection: CollectionRow; chapterCount: number }>;
  isBook(collection: Pick<CollectionRow, "meta">): boolean;
  /** The chapters of a book in reading order, grouped by part. Throws `not_found` for anything that is not a book. */
  contents(collectionId: string): BookContentsResponse;
  /** Where a document comes in its book, or undefined when it is not a chapter. */
  chapterOf(documentId: string): DocumentChapterDto | undefined;
  /** The document holding the chapter with this key in this book. */
  chapterDocument(collectionId: string, key: string): string | undefined;
}

declare module "../../core/context.ts" {
  interface Services {
    books: BooksService;
  }
}

interface ChapterRow {
  documentId: string;
  key: string;
  position: number;
  section: string;
  number: string | null;
  summary: string | null;
  title: string;
}

export function createBooksService(ctx: AppContext): BooksService {
  const { db } = ctx;
  const { collections, documents, storage } = ctx.services;

  const isBook = (collection: Pick<CollectionRow, "meta">) => typeof collection.meta.book === "object" && collection.meta.book !== null;

  function chapterRows(collectionId: string): ChapterRow[] {
    return db
      .select({
        documentId: bookChapters.documentId,
        key: bookChapters.key,
        position: bookChapters.position,
        section: bookChapters.section,
        number: bookChapters.number,
        summary: bookChapters.summary,
        title: documentsTable.title,
      })
      .from(bookChapters)
      .innerJoin(documentsTable, eq(documentsTable.id, bookChapters.documentId))
      .where(eq(bookChapters.collectionId, collectionId))
      .orderBy(asc(bookChapters.position))
      .all();
  }

  /**
   * Books being taken apart right now, and how many are being put together. Chapters
   * come and go one at a time, and `reconcile` must not read a half-made book as one
   * that has lost chapters, nor a book with no chapters yet as one to forget.
   */
  const busy = new Set<string>();
  let creating = 0;

  async function create(input: CreateBook): Promise<{ collection: CollectionRow; chapterCount: number }> {
    creating += 1;
    try {
      return await record(input);
    } finally {
      creating -= 1;
    }
  }

  async function record(input: CreateBook): Promise<{ collection: CollectionRow; chapterCount: number }> {
    const folder = storage.resolve(input.collection.locationId, input.collection.relPath);
    const digest = await hashTree(folder);
    const collection = await collections.create({
      ...input.collection,
      kind: "file",
      sizeBytes: digest.bytes,
      sha256: digest.sha256,
      meta: { ...input.collection.meta, book: { chapters: input.chapters.length } },
    });
    const added: string[] = [];
    try {
      for (const [position, chapter] of input.chapters.entries()) {
        const { document } = await documents.ingestFile({
          sourcePath: path.join(folder, chapter.fileName),
          originalName: chapter.fileName,
          title: chapter.title,
          category: input.document.category,
          locationId: collection.locationId,
          inPlace: true,
          // Another copy of the same text elsewhere in the library does not make the book a chapter short.
          allowDuplicate: true,
        });
        added.push(document.id);
        db.insert(bookChapters)
          .values({
            collectionId: collection.id,
            documentId: document.id,
            key: chapter.key,
            position,
            section: chapter.section,
            number: chapter.number ?? null,
            summary: chapter.summary ?? null,
          })
          .run();
        // Also describes the chapter to search again, now that it is known to belong to the book.
        await documents.update(document.id, {
          description: chapter.summary ?? null,
          author: input.document.author ?? null,
          source: input.document.source ?? null,
          language: input.document.language ?? null,
        });
      }
    } catch (error) {
      // Half a book is not a book. The files are the caller's copies and are left to it.
      for (const id of added) await documents.remove(id, { forget: true }).catch(() => undefined);
      db.delete(bookChapters).where(eq(bookChapters.collectionId, collection.id)).run();
      await collections.remove(collection.id, { deleteFiles: false }).catch(() => undefined);
      throw error;
    }
    return { collection: collections.get(collection.id) ?? collection, chapterCount: added.length };
  }

  function contents(collectionId: string): BookContentsResponse {
    const collection = collections.get(collectionId);
    if (!collection || !isBook(collection)) throw notFound("Book");
    const sections: BookSectionDto[] = [];
    const rows = chapterRows(collectionId);
    for (const row of rows) {
      let section = sections.at(-1);
      if (!section || section.title !== row.section) {
        section = { title: row.section, chapters: [] };
        sections.push(section);
      }
      section.chapters.push({ key: row.key, number: row.number, title: row.title, summary: row.summary, documentId: row.documentId });
    }
    return { collectionId, sections, total: rows.length };
  }

  function chapterOf(documentId: string): DocumentChapterDto | undefined {
    const own = db
      .select({ collectionId: bookChapters.collectionId })
      .from(bookChapters)
      .where(eq(bookChapters.documentId, documentId))
      .get();
    const collection = own ? collections.get(own.collectionId) : undefined;
    if (!own || !collection) return undefined;
    const rows = chapterRows(own.collectionId);
    const index = rows.findIndex((row) => row.documentId === documentId);
    const row = rows[index];
    if (!row) return undefined;
    const link = (other: ChapterRow | undefined) =>
      other ? { documentId: other.documentId, title: other.title, number: other.number } : null;
    return {
      collectionId: collection.id,
      bookTitle: collection.title,
      key: row.key,
      number: row.number,
      section: row.section,
      position: index + 1,
      total: rows.length,
      previous: link(rows[index - 1]),
      next: link(rows[index + 1]),
    };
  }

  function chapterDocument(collectionId: string, key: string): string | undefined {
    return chapterRows(collectionId).find((row) => row.key === key)?.documentId;
  }

  // ── Keeping the book and its chapters in step ──

  /** Chapter documents left in the library when a book's record was removed without its files. */
  const released = new Map<string, string[]>();

  collections.onRemoved(async (row, options) => {
    if (!isBook(row)) return;
    const ids = chapterRows(row.id).map((chapter) => chapter.documentId);
    if (!options.deleteFiles) {
      // The files stay, and so do the documents: from now on they are ordinary ones.
      released.set(row.id, ids);
      return;
    }
    // The folder is deleted by whoever removes the collection; only the records go here.
    busy.add(row.id);
    for (const id of ids) await documents.remove(id, { forget: true }).catch(() => undefined);
  });

  collections.onMoved(async (collection, from) => {
    if (!isBook(collection)) return;
    const inside = `${from.relPath}/`;
    for (const chapter of chapterRows(collection.id)) {
      const document = documents.get(chapter.documentId);
      if (document.locationId !== from.locationId || !document.relPath.startsWith(inside)) continue;
      // The folder was copied whole, so each file has the same path on the new location.
      await documents.relocate(document.id, collection.locationId, document.relPath);
    }
  });

  /**
   * Follows what happens to the chapters as documents: a book whose chapters have all
   * been deleted is forgotten; one that has lost some says so and drops the checksum
   * that covered them; and when "Move documents" has taken every chapter to another
   * location, the book is recorded there too.
   */
  async function reconcile(): Promise<void> {
    if (creating > 0) return;
    for (const row of collections.list({ kind: "file" })) {
      if (!isBook(row) || row.status === "moving" || busy.has(row.id)) continue;
      const chapters = db
        .select({ locationId: documentsTable.locationId, relPath: documentsTable.relPath, sizeBytes: documentsTable.sizeBytes })
        .from(bookChapters)
        .innerJoin(documentsTable, eq(documentsTable.id, bookChapters.documentId))
        .where(eq(bookChapters.collectionId, row.id))
        .all();
      if (chapters.length === 0) {
        await collections.remove(row.id, { deleteFiles: false }).catch(() => undefined);
        // The folder Outpost made for the book, if nothing is left in it. `rmdir` refuses anything else.
        if (storage.isAvailable(row.locationId))
          await fs.promises.rmdir(storage.resolve(row.locationId, row.relPath)).catch(() => undefined);
        continue;
      }
      const recorded = (row.meta.book as { chapters?: unknown }).chapters;
      if (recorded !== chapters.length) {
        collections.update(row.id, {
          meta: { ...row.meta, book: { chapters: chapters.length } },
          sizeBytes: chapters.reduce((sum, chapter) => sum + chapter.sizeBytes, 0),
          sha256: null,
          verifiedAt: null,
        });
      }
      const elsewhere = chapters[0]!.locationId;
      const inside = `${row.relPath}/`;
      if (
        elsewhere !== row.locationId &&
        chapters.every((chapter) => chapter.locationId === elsewhere && chapter.relPath.startsWith(inside))
      ) {
        // Location is not part of an ordinary collection update: nothing moves here, the
        // record is only told where its chapters already are.
        db.update(collectionsTable).set({ locationId: elsewhere, updatedAt: Date.now() }).where(eq(collectionsTable.id, row.id)).run();
        ctx.events.publish({ type: "collections.changed", id: row.id });
      }
    }
  }

  let reconciling = false;
  let again = false;
  function reconcileSoon(): void {
    if (reconciling) {
      again = true;
      return;
    }
    reconciling = true;
    void (async () => {
      try {
        do {
          again = false;
          await reconcile();
        } while (again);
      } catch (error) {
        ctx.log.warn({ err: error }, "books could not be reconciled with their chapters");
      } finally {
        reconciling = false;
      }
    })();
  }

  const stop = ctx.events.subscribe((event) => {
    if (event.type === "documents.changed") reconcileSoon();
    if (event.type === "collections.changed" && event.id && busy.has(event.id) && !collections.get(event.id)) busy.delete(event.id);
    if (event.type === "collections.changed" && event.id && released.has(event.id) && !collections.get(event.id)) {
      // Search described each of these as a chapter of the book that has just gone.
      const ids = released.get(event.id) ?? [];
      released.delete(event.id);
      void (async () => {
        for (const id of ids) await documents.update(id, {}).catch(() => undefined);
      })();
    }
  });
  ctx.onClose.push(stop);

  return { create, isBook, contents, chapterOf, chapterDocument };
}

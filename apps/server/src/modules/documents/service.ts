/**
 * The document library: files a person adds, kept exactly as they were given.
 *
 * A document is a row with a stable id plus one original file in a storage location
 * (`locationId` + `relPath`). The original is never modified. Everything Outpost
 * derives from it (extracted text, the search entry) lives in the data directory and
 * can be rebuilt from the original at any time.
 *
 * Files arrive two ways, through an upload or through `ingestFile` for a file already
 * on disk, and both end in `commit`: check for a duplicate, move the staged file into
 * `documents/<id>/`, record it, and queue reading its text.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type {
  DocumentDto,
  DocumentFacets,
  DocumentListResponse,
  DocumentPatch,
  DocumentSort,
  DocumentTextResponse,
  DocumentType,
  OcrStatus,
  TagDto,
} from "@outpost/shared";
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, messageOf, notFound } from "../../core/errors.ts";
import { resolveInside, safeFileName } from "../../core/fs-safe.ts";
import { sha256File } from "../../core/hashing.ts";
import { newId } from "../../core/ids.ts";
import { type JobRow, PermanentJobError } from "../../core/jobs.ts";
import { bookChapters, bookDetails, collections, documents, documentTags, tags } from "../../db/schema.ts";
import type { LocationRow } from "../storage/service.ts";
import { readAudioFacts } from "./audio-tags.ts";
import { ExtractionFailure, runExtraction } from "./extract-host.ts";
import { type Extracted, type ExtractedSection, type ExtractKind, withHeading } from "./extract-types.ts";
import { createExtractedStore } from "./extracted-store.ts";
import {
  assertContentMatches,
  defaultTitle,
  displayName,
  extensionsOfType,
  formatForExt,
  formatForName,
  isEpubHead,
  SUPPORTED_TYPES_TEXT,
} from "./file-types.ts";
import { createDocumentOcr } from "./ocr.ts";
import {
  changedWhileRead,
  describeWriteError,
  discardPart,
  INCOMING_DIR,
  isSameFile,
  moveFile,
  moveOriginal,
  newPartPath,
  readHead,
  type StagedFile,
  tooLarge,
} from "./staging.ts";
import { isEpubArchive } from "./zip.ts";

export type DocumentRow = typeof documents.$inferSelect;

export const EXTRACT_JOB = "document.extract";
const SEARCH_KIND = "document";
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 50;
const MAX_TITLE_LENGTH = 300;
const MAX_SOURCE_LENGTH = 1000;
/** A whole PDF is held in memory while it is read, so very large ones are not attempted. */
const MAX_PDF_BYTES = 512 * 1024 * 1024;
/** Part files older than this at start-up belong to uploads that never finished. */
const STALE_PART_MS = 24 * 60 * 60 * 1000;

const IMAGE_DETAIL = "An image has no text of its own to search. It is stored and shown, and it can still be found by its title and tags.";
const AUDIO_DETAIL =
  "A recording's words are not transcribed, so they cannot be searched. It is found by its title, its author and its tags.";
const NO_TEXT_DETAIL: Record<ExtractKind, string> = {
  pdf: "This PDF has no text of its own. Its pages appear to be scans (pictures of text). The file is stored and can be opened, and it can still be found by its title and tags.",
  epub: "No readable text was found in this book. It may be copy-protected (DRM) or made only of images. It can still be found by its title and tags.",
  markdown: "This file has no text to search.",
  html: "This page has no text to search.",
  text: "This file has no text to search.",
};

export interface CommitOptions {
  title?: string;
  /** Where the file came from, in words. Recorded as the document's source. */
  source?: string | null;
  category?: string | null;
  tags?: string[];
  allowDuplicate?: boolean;
}

export interface IngestInput extends CommitOptions {
  /** Absolute path of a file already on this machine. */
  sourcePath: string;
  /** Name to record and to derive the type from; `sourcePath` may be a temporary name. */
  originalName: string;
  /** Destination storage location; the default location when omitted. */
  locationId?: string;
  /** Move the file instead of copying it. A duplicate is never moved or removed. */
  move?: boolean;
  /**
   * Record the file where it is instead of taking it into a folder of its own. It must
   * already be inside the storage location given. Used for the chapters of a book, which
   * stay together in the book's folder.
   */
  inPlace?: boolean;
}

export interface IngestOutcome {
  status: "created" | "duplicate";
  /** The new document, or the one already holding the same bytes. */
  document: DocumentDto;
}

export interface DocumentListQuery {
  /** Matches part of the title or the original file name. */
  q?: string;
  category?: string;
  tag?: string;
  type?: DocumentType;
  /**
   * Chapters of books are left out of the list unless it is being searched by name
   * (`q`) or by tag: a book is one thing in the library, reached from its own page.
   * True lists them always, false never.
   */
  chapters?: boolean;
  sort?: DocumentSort;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface DocumentsService {
  /** Throws `not_found` when there is no such document. */
  get(id: string): DocumentDto;
  /** Absolute path of the original. Throws `storage_unavailable` while its location is disconnected. */
  absolutePath(id: string): string;
  /**
   * Adds a file that is already on disk, with the same validation, hashing, duplicate
   * detection and text extraction as an upload. Throws `AppError` when it is refused.
   */
  ingestFile(input: IngestInput): Promise<IngestOutcome>;
  list(query?: DocumentListQuery): DocumentListResponse;
  facets(): DocumentFacets;
  update(id: string, patch: DocumentPatch): Promise<DocumentDto>;
  /**
   * Removes a document and, because the person asked, its original file. With
   * `forget` only Outpost's record goes and the file is left where it is.
   */
  remove(id: string, options?: { forget?: boolean }): Promise<void>;
  /** Writes the search entry again, after another module recorded more about the document (a book's series). */
  refreshSearch(id: string): Promise<void>;
  /** Records that another module has moved the original. Touches no files. */
  relocate(id: string, locationId: string, relPath: string): Promise<DocumentDto>;
  /** Queues reading the text again, unless that is already under way. */
  reextract(id: string): { document: DocumentDto; job: JobRow };
  /** Whether this installation can read text from scans (OCR), and with which languages. */
  ocrStatus(): Promise<OcrStatus>;
  /**
   * Queues reading the text of scanned pages or of an image by OCR, or returns the job
   * already doing so. With `redo`, pages OCR has read before are read again.
   */
  ocr(id: string, options?: { redo?: boolean }): Promise<{ document: DocumentDto; job: JobRow }>;
  text(id: string, page?: number): Promise<DocumentTextResponse>;
  tags(): TagDto[];
  /** The location an upload goes to. Throws `storage_unavailable` when it is disconnected. */
  uploadLocation(locationId?: string): LocationRow;
  /** Turns a staged file into a document (or reports the duplicate). Consumes the part file. */
  commitStaged(staged: StagedFile, options: CommitOptions): Promise<IngestOutcome>;
}

declare module "../../core/context.ts" {
  interface Services {
    documents: DocumentsService;
  }
}

/** Tags are the same tag whatever their capitalisation: "Water" and "water". */
const tagKey = (name: string) => name.normalize("NFC").toLowerCase();

/** Trims, drops blanks and repeats, and refuses names the tag list cannot hold. */
export function cleanTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of input) {
    const name = raw
      .normalize("NFC")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is being removed
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || seen.has(tagKey(name))) continue;
    if (name.includes(",")) throw badRequest(`Tags cannot contain commas ("${name}"). Add each tag separately.`);
    if (name.length > MAX_TAG_LENGTH) {
      throw badRequest(`The tag "${name.slice(0, 20)}…" is too long. Keep tags to ${MAX_TAG_LENGTH} characters or fewer.`);
    }
    seen.add(tagKey(name));
    names.push(name);
  }
  if (names.length > MAX_TAGS) throw badRequest(`A document can have at most ${MAX_TAGS} tags.`);
  return names;
}

const blankToNull = (value: string | null | undefined) => value?.trim() || null;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const subjectOf = (id: string) => `document:${id}`;

function notAnEpub(originalName: string): AppError {
  return new AppError(
    "unsupported",
    `"${originalName}" is named like an EPUB book, but it is not one (an EPUB is a zip archive that declares itself as "application/epub+zip"). Supported types: ${SUPPORTED_TYPES_TEXT}.`,
    { ext: "epub" },
  );
}

export function createDocumentsService(ctx: AppContext): DocumentsService {
  const { db, sqlite, events } = ctx;
  const { storage, search, settings } = ctx.services;
  const extracted = createExtractedStore(ctx);

  const findRow = (id: string) => db.select().from(documents).where(eq(documents.id, id)).get();
  const changed = (id: string) => events.publish({ type: "documents.changed", id });

  function requireRow(id: string): DocumentRow {
    const row = findRow(id);
    if (!row) throw notFound("Document");
    return row;
  }

  // ── Tags ──

  function tagNames(documentIds: string[]): Map<string, string[]> {
    const byDocument = new Map<string, string[]>();
    if (documentIds.length === 0) return byDocument;
    const rows = db
      .select({ documentId: documentTags.documentId, name: tags.name })
      .from(documentTags)
      .innerJoin(tags, eq(tags.id, documentTags.tagId))
      .where(inArray(documentTags.documentId, documentIds))
      .orderBy(sql`${tags.name} collate nocase`)
      .all();
    for (const row of rows) byDocument.set(row.documentId, [...(byDocument.get(row.documentId) ?? []), row.name]);
    return byDocument;
  }

  const tagIdsOf = (documentId: string) =>
    db
      .select({ tagId: documentTags.tagId })
      .from(documentTags)
      .where(eq(documentTags.documentId, documentId))
      .all()
      .map((row) => row.tagId);

  /**
   * Drops tags nothing uses any more, so a typo does not linger as a suggestion. The
   * table is shared with notes, hence the second check.
   */
  const pruneTag = sqlite.prepare(
    `DELETE FROM tags WHERE id = @id
       AND NOT EXISTS (SELECT 1 FROM document_tags WHERE tag_id = @id)
       AND NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = @id)`,
  );

  /** Replaces a document's tags, creating any that do not exist. Call inside a transaction. */
  function setTags(documentId: string, names: string[]): void {
    const known = new Map(
      db
        .select()
        .from(tags)
        .all()
        .map((tag) => [tagKey(tag.name), tag.id]),
    );
    const before = tagIdsOf(documentId);
    const after = new Set<string>();
    db.delete(documentTags).where(eq(documentTags.documentId, documentId)).run();
    for (const name of names) {
      let tagId = known.get(tagKey(name));
      if (!tagId) {
        tagId = newId();
        db.insert(tags).values({ id: tagId, name, createdAt: Date.now() }).run();
        known.set(tagKey(name), tagId);
      }
      after.add(tagId);
      db.insert(documentTags).values({ documentId, tagId }).run();
    }
    for (const tagId of before) if (!after.has(tagId)) pruneTag.run({ id: tagId });
  }

  // ── Reading ──

  /** The book each of these documents is a chapter of, for those that are. */
  function booksOf(documentIds: string[]): Map<string, { collectionId: string; title: string; number: string | null }> {
    const found = new Map<string, { collectionId: string; title: string; number: string | null }>();
    if (documentIds.length === 0) return found;
    const rows = db
      .select({
        documentId: bookChapters.documentId,
        collectionId: bookChapters.collectionId,
        title: collections.title,
        number: bookChapters.number,
      })
      .from(bookChapters)
      .innerJoin(collections, eq(collections.id, bookChapters.collectionId))
      .where(inArray(bookChapters.documentId, documentIds))
      .all();
    for (const { documentId, ...book } of rows) found.set(documentId, book);
    return found;
  }

  /** "Series: Dune, book 2" for a book that came from Calibre with a series, for search to find it by. */
  function seriesLine(documentId: string): string | null {
    const row = db
      .select({ series: bookDetails.series, index: bookDetails.seriesIndex })
      .from(bookDetails)
      .where(eq(bookDetails.documentId, documentId))
      .get();
    if (!row?.series) return null;
    return row.index === null ? `Series: ${row.series}` : `Series: ${row.series}, book ${row.index}`;
  }

  /** True for every document that is not a chapter of a book. */
  const notAChapter = sql`not exists (select 1 from ${bookChapters} where ${bookChapters.documentId} = ${documents.id})`;

  function toDtos(rows: DocumentRow[]): DocumentDto[] {
    const names = tagNames(rows.map((row) => row.id));
    const books = booksOf(rows.map((row) => row.id));
    const connected = new Set(
      storage
        .list()
        .filter((location) => location.status === "available")
        .map((location) => location.id),
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      originalName: row.originalName,
      // Rows written by an older version with a type no longer on the list still show.
      type: formatForExt(row.ext)?.type ?? "text",
      mime: row.mime,
      ext: row.ext,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      locationId: row.locationId,
      locationAvailable: connected.has(row.locationId),
      relPath: row.relPath,
      category: row.category,
      description: row.description,
      author: row.author,
      source: row.source,
      language: row.language,
      tags: names.get(row.id) ?? [],
      pageCount: row.pageCount,
      extraction: row.extraction,
      extractionDetail: row.extractionDetail,
      textChars: row.textChars,
      scanPages: row.scanPages,
      ocrPages: row.ocrPages,
      ocrDetail: row.ocrDetail,
      fileUrl: `/api/documents/${row.id}/file`,
      book: books.get(row.id) ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  const toDto = (row: DocumentRow) => toDtos([row])[0]!;

  // ── Search ──

  function index(row: DocumentRow, sections: ExtractedSection[]): void {
    // A chapter is told apart from other chapters of the same name by its book.
    const book = booksOf([row.id]).get(row.id);
    // A recording has no text, so its author is what search can find it by. A chapter is found through its book.
    const byline: ExtractedSection[] = !book && row.author && formatForExt(row.ext)?.type === "audio" ? [{ text: `By ${row.author}` }] : [];
    // A book's series is found as its title is: "Discworld" finds every book of it.
    const series = seriesLine(row.id);
    if (series) byline.push({ text: series });
    search.upsert({
      kind: SEARCH_KIND,
      entityId: row.id,
      title: row.title,
      subtitle: book ? `${book.title}${book.number ? `, chapter ${book.number}` : ""}` : row.author || row.originalName,
      collection: row.category,
      url: `/library/documents/${row.id}`,
      sourcePath: row.relPath,
      tags: tagNames([row.id]).get(row.id) ?? [],
      sections: [...byline, ...sections],
    });
  }

  /** Refreshes the search entry after a change to title, tags or other metadata. */
  async function reindex(id: string): Promise<void> {
    const sections = await extracted.read(id);
    const row = findRow(id);
    if (row) index(row, sections);
  }

  // ── Adding ──

  function uploadLocation(locationId?: string): LocationRow {
    const location = locationId ? storage.get(locationId) : storage.defaultFor("documents");
    if (location.status !== "available") {
      throw new AppError(
        "storage_unavailable",
        `"${location.name}" is not connected. Reconnect it or choose another storage location, then try again.`,
        { locationId: location.id },
      );
    }
    return location;
  }

  function enqueueExtraction(row: DocumentRow): JobRow {
    return ctx.jobs.enqueue(EXTRACT_JOB, { documentId: row.id }, { title: `Reading text from "${row.title}"`, subject: subjectOf(row.id) });
  }

  /**
   * Changes to one document's stored text run one at a time. Reading the file's own
   * text and OCR both rewrite the same stored file, and may finish close together.
   */
  const textLocks = new Map<string, Promise<unknown>>();
  function exclusive<T>(id: string, task: () => Promise<T>): Promise<T> {
    const run = (textLocks.get(id) ?? Promise.resolve()).then(task, task);
    const settled = run.catch(() => undefined);
    textLocks.set(id, settled);
    void settled.then(() => {
      if (textLocks.get(id) === settled) textLocks.delete(id);
    });
    return run;
  }

  const ocr = createDocumentOcr(ctx, { findRow, index, changed, subjectOf, extracted, exclusive });

  const findBySha = (sha256: string) =>
    db.select().from(documents).where(eq(documents.sha256, sha256)).orderBy(asc(documents.createdAt)).limit(1).get();

  /**
   * Commits run one at a time. Checking for a duplicate and inserting the row are
   * separated by file operations, and two copies of the same file arriving together
   * would otherwise both pass the check.
   */
  let commits: Promise<unknown> = Promise.resolve();
  function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
    const run = commits.then(task, task);
    commits = run.catch(() => undefined);
    return run;
  }

  async function commit(staged: StagedFile, options: CommitOptions): Promise<IngestOutcome> {
    const location = storage.get(staged.locationId);
    // A part file is Outpost's own and is cleaned up; a file being moved in is the
    // person's original and is left exactly where it was if anything goes wrong.
    const discard = () => (staged.owned ? discardPart(staged.partPath) : Promise.resolve());
    try {
      const tagList = cleanTags(options.tags ?? []);
      if (staged.format.type === "epub" && !isEpubHead(staged.head) && !(await isEpubArchive(staged.partPath))) {
        throw notAnEpub(staged.originalName);
      }
      if (!options.allowDuplicate) {
        const existing = findBySha(staged.sha256);
        if (existing) {
          await discard();
          return { status: "duplicate", document: toDto(existing) };
        }
      }

      const id = newId();
      const fallbackName = `document.${staged.format.ext}`;
      let fileName = safeFileName(staged.originalName, fallbackName);
      if (!fileName.toLowerCase().endsWith(`.${staged.format.ext}`)) fileName = fallbackName;
      const relPath = staged.keepAt ?? `documents/${id}/${fileName}`;
      const finalPath = storage.resolve(location.id, relPath);
      const folder = path.dirname(finalPath);
      const now = Date.now();
      if (!staged.keepAt) await fs.promises.mkdir(folder, { recursive: true });
      let moved = false;
      let recorded = false;
      try {
        if (!staged.keepAt) {
          // A person's own file is checked after the rename: a link swapped in at the last moment goes back.
          if (staged.identity) await moveOriginal(staged.partPath, finalPath, staged.identity, staged.originalName);
          else await moveFile(staged.partPath, finalPath);
          moved = true;
        }
        sqlite.transaction(() => {
          db.insert(documents)
            .values({
              id,
              title: (blankToNull(options.title) ?? defaultTitle(staged.originalName)).slice(0, MAX_TITLE_LENGTH),
              originalName: staged.originalName,
              mime: staged.format.mime,
              ext: staged.format.ext,
              sizeBytes: staged.sizeBytes,
              sha256: staged.sha256,
              locationId: location.id,
              relPath,
              category: blankToNull(options.category),
              source: blankToNull(options.source)?.slice(0, MAX_SOURCE_LENGTH) ?? null,
              extraction: "pending",
              createdAt: now,
              updatedAt: now,
            })
            .run();
          setTags(id, tagList);
        })();
        recorded = true;
        // Recorded where it lies, by name: the name must still be the file read once the record exists,
        // or a link swapped in after the last look would be what the record points at.
        if (staged.keepAt && staged.identity && !(await isSameFile(finalPath, staged.identity))) {
          throw changedWhileRead(staged.originalName);
        }
      } catch (error) {
        if (recorded) {
          const tagIds = tagIdsOf(id);
          sqlite.transaction(() => {
            db.delete(documents).where(eq(documents.id, id)).run();
            for (const tagId of tagIds) pruneTag.run({ id: tagId });
          })();
        }
        // Put a moved-in original back before removing the folder made for it.
        if (moved && !staged.owned) await moveFile(finalPath, staged.partPath).catch(() => undefined);
        // A file recorded where it lies has no folder of its own to clear away.
        if (!staged.keepAt) await fs.promises.rm(folder, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }

      const row = requireRow(id);
      // Findable by title and tags straight away; the text follows when it has been read.
      index(row, []);
      enqueueExtraction(row);
      changed(id);
      return { status: "created", document: toDto(row) };
    } catch (error) {
      await discard();
      throw describeWriteError(error, location.name);
    }
  }

  async function ingestFile(input: IngestInput): Promise<IngestOutcome> {
    const originalName = displayName(input.originalName);
    const format = formatForName(originalName);
    const location = uploadLocation(input.locationId);
    const source = path.resolve(input.sourcePath);
    // Opened once, never through a link, and everything below is read through this handle: a file
    // swapped for another (or for a link) part of the way through cannot be checked as one and kept as another.
    const handle = await fs.promises.open(source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ELOOP")
        throw badRequest(`"${originalName}" is a link to somewhere else, so it was not added to the library.`);
      throw badRequest(`"${originalName}" could not be found, so it was not added to the library.`);
    });
    let stat: fs.Stats;
    let head: Buffer;
    let sha256: string;
    let partPath: string | null = null;
    let sameDrive = false;
    try {
      stat = await handle.stat();
      if (!stat.isFile()) throw badRequest(`"${originalName}" could not be found, so it was not added to the library.`);
      if (stat.size > ctx.config.maxUploadBytes) throw tooLarge(originalName, ctx.config.maxUploadBytes);

      head = await readHead(handle);
      assertContentMatches(format, head, stat.size <= head.length, originalName);
      if (format.type === "epub" && !isEpubHead(head) && !(await isEpubArchive({ handle, size: stat.size }))) throw notAnEpub(originalName);

      sha256 = await sha256File(handle);
      if (!input.allowDuplicate) {
        // Checked before copying so that re-importing a folder does not copy it all again.
        const existing = findBySha(sha256);
        if (existing) return { status: "duplicate", document: toDto(existing) };
      }

      if (!input.inPlace) {
        const incoming = path.join(location.path, INCOMING_DIR);
        await fs.promises.mkdir(incoming, { recursive: true });
        sameDrive = (await fs.promises.stat(incoming)).dev === stat.dev;
        if (!(input.move && sameDrive)) {
          await storage.assertSpace(location.id, stat.size);
          partPath = await newPartPath(location.path);
          try {
            await pipeline(handle.createReadStream({ start: 0, autoClose: false }), fs.createWriteStream(partPath));
            if ((await fs.promises.stat(partPath)).size !== stat.size) {
              throw new AppError(
                "conflict",
                `"${originalName}" changed while it was being copied. Try again once it is no longer being written.`,
              );
            }
          } catch (error) {
            await discardPart(partPath);
            throw describeWriteError(error, location.name);
          }
        }
      }
    } finally {
      await handle.close();
    }

    const facts = { locationId: location.id, originalName, format, sha256, sizeBytes: stat.size, head };
    if (partPath) {
      const outcome = await oneAtATime(() => commit({ ...facts, partPath: partPath!, owned: true }, input));
      if (input.move && outcome.status === "created") await fs.promises.rm(source, { force: true });
      return outcome;
    }
    // Kept where it is, or moved by a rename: by its name, so the name must still be the file read.
    // Checked here and again once moved in or recorded, which is the check that cannot be raced.
    const identity = { ino: stat.ino, dev: stat.dev };
    if (!(await isSameFile(source, identity))) throw changedWhileRead(originalName);
    if (input.inPlace) {
      const keepAt = path
        .relative(location.path, resolveInside(location.path, path.relative(location.path, source)))
        .split(path.sep)
        .join("/");
      if (!keepAt) throw badRequest(`"${originalName}" is not a file inside "${location.name}", so it cannot be recorded where it is.`);
      return oneAtATime(() => commit({ ...facts, partPath: source, owned: false, keepAt, identity }, input));
    }
    // A rename is instant and cannot half-finish, so the original goes straight in.
    return oneAtATime(() => commit({ ...facts, partPath: source, owned: false, identity }, input));
  }

  // ── Text extraction ──

  function setExtraction(id: string, extraction: DocumentRow["extraction"], extractionDetail: string | null): void {
    const result = db.update(documents).set({ extraction, extractionDetail, updatedAt: Date.now() }).where(eq(documents.id, id)).run();
    if (result.changes > 0) changed(id);
  }

  /**
   * Records what was read: the text itself, counts, and metadata for fields left empty.
   * Text that OCR read earlier from pages with no text of their own is kept: reading the
   * file again cannot improve on it, and OCR is slow to repeat.
   */
  function storeExtraction(
    id: string,
    kind: ExtractKind | "image" | "audio",
    result: Extracted,
  ): Promise<DocumentRow["extraction"] | "removed"> {
    return exclusive(id, async () => {
      const row = findRow(id);
      if (!row) return "removed";

      const before = await extracted.readAll(id);
      const ownPages = new Set(result.sections.map((section) => section.page ?? 0));
      const pageless = result.sections.some((section) => section.page === undefined);
      const stillScanned = (page: number) => !ownPages.has(page) && !(page === 0 && pageless);
      // Kept, under the heading the file now gives its page (its bookmarks may have changed).
      const pageHeadings = result.pageHeadings ?? {};
      const fromOcr = before.sections
        .filter((section) => section.ocr && stillScanned(section.page ?? 0))
        .map((section) => withHeading(section, section.page === undefined ? undefined : pageHeadings[section.page]));
      const ocrPages = before.ocrPages.filter(stillScanned);
      const sections = [...result.sections, ...fromOcr].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

      const textChars = sections.reduce((total, section) => total + section.text.length, 0);
      const extraction = textChars > 0 ? "done" : "unsupported";
      const reason = kind === "image" ? IMAGE_DETAIL : kind === "audio" ? AUDIO_DETAIL : NO_TEXT_DETAIL[kind];
      const detail = (textChars > 0 ? result.notes : [reason, ...result.notes]).join(" ") || null;
      // What OCR could try: the PDF pages that gave no text, or the one picture of an image.
      const scanPages = kind === "pdf" ? (result.pagesWithoutText ?? 0) : kind === "image" && ocr.kindOf(row) ? 1 : 0;

      await extracted.write(id, sections, ocrPages, pageHeadings);
      const patch: Partial<DocumentRow> = {
        extraction,
        extractionDetail: detail,
        textChars,
        pageCount: result.pageCount,
        scanPages,
        ocrPages: ocrPages.length > 0 ? ocrPages.length : null,
        updatedAt: Date.now(),
      };
      // Metadata from inside the file only fills what nobody has filled in. A title still
      // equal to the file name counts as not filled in.
      if (result.meta.title && row.title === defaultTitle(row.originalName)) patch.title = result.meta.title.slice(0, MAX_TITLE_LENGTH);
      if (result.meta.author && !row.author) patch.author = result.meta.author.slice(0, MAX_TITLE_LENGTH);
      if (result.meta.language && !row.language) patch.language = result.meta.language;
      db.update(documents).set(patch).where(eq(documents.id, id)).run();

      const fresh = findRow(id);
      if (!fresh) {
        // Deleted while its text was being written.
        await extracted.remove(id);
        return "removed";
      }
      index(fresh, sections);
      changed(id);
      return extraction;
    });
  }

  /** After a document's own text has been read: OCR for what is left, if the setting asks for it. */
  async function afterExtraction(id: string): Promise<void> {
    const row = findRow(id);
    if (row) await ocr.startIfAutomatic(row);
  }

  ctx.jobs.register<{ documentId: string }>(EXTRACT_JOB, {
    queue: "index",
    async run({ payload, signal, progress }) {
      const id = payload.documentId;
      const row = findRow(id);
      if (!row) return { skipped: "The document was removed before its text was read." };
      const format = formatForExt(row.ext);
      const empty: Extracted = { sections: [], pageCount: null, meta: {}, notes: [] };

      if (!format || format.type === "image") {
        const extraction = await storeExtraction(id, "image", empty);
        await afterExtraction(id);
        return { extraction };
      }
      if (format.type === "pdf" && row.sizeBytes > MAX_PDF_BYTES) {
        const megabytes = Math.round(MAX_PDF_BYTES / (1024 * 1024));
        setExtraction(
          id,
          "unsupported",
          `This PDF is larger than ${megabytes} MB, which is more than Outpost can read text from in this version. It is stored and can be opened, and it can still be found by its title and tags.`,
        );
        return { extraction: "unsupported" };
      }

      // Nothing is removed when the original cannot be reached: text read earlier stays
      // searchable, and the file is assumed to be coming back with its drive.
      let file: string;
      try {
        file = storage.resolve(row.locationId, row.relPath);
      } catch (error) {
        const detail = `${messageOf(error)} The text of this document will be read when you choose "Read text again" after reconnecting.`;
        setExtraction(id, "failed", detail);
        throw new PermanentJobError(detail, "storage_unavailable");
      }
      if (!(await fs.promises.stat(file).catch(() => undefined))?.isFile()) {
        const detail = `The file is missing from "${storage.get(row.locationId).name}" (${row.relPath}). If it was moved or deleted outside Outpost, put it back and choose "Read text again".`;
        setExtraction(id, "failed", detail);
        throw new PermanentJobError(detail, "not_found");
      }

      setExtraction(id, "running", null);
      if (format.type === "audio") {
        // Only the tags are read: the title and author fill what nobody has filled in.
        const facts = await readAudioFacts(file, row.ext);
        const extraction = await storeExtraction(id, "audio", {
          ...empty,
          meta: { title: facts.title, author: facts.artist ?? facts.albumArtist },
        });
        return { extraction };
      }
      let result: Extracted;
      try {
        result = await runExtraction(
          { filePath: file, kind: format.type, maxPdfPages: settings.get("indexing.maxPdfPages") },
          { signal, onProgress: progress },
        );
      } catch (error) {
        if (signal.aborted) {
          // Paused or shutting down: it will run again. Cancelled: say so.
          if (signal.reason === "cancelled")
            setExtraction(id, "failed", 'Reading the text was cancelled. Choose "Read text again" to try again.');
          else setExtraction(id, "pending", null);
          throw error;
        }
        if (!findRow(id)) return { skipped: "The document was removed while its text was being read." };
        const detail = error instanceof ExtractionFailure ? error.message : `This file could not be read: ${messageOf(error)}`;
        setExtraction(id, "failed", detail);
        throw new PermanentJobError(detail, "extraction");
      }
      const extraction = await storeExtraction(id, format.type, result);
      await afterExtraction(id);
      return { extraction, sections: result.sections.length, pageCount: result.pageCount };
    },
  });

  /** Removes part files left behind by uploads that were cut off by a crash or restart. */
  async function sweepIncoming(): Promise<void> {
    const cutoff = Date.now() - STALE_PART_MS;
    for (const location of storage.list()) {
      if (location.status !== "available") continue;
      const dir = path.join(location.path, INCOMING_DIR);
      for (const name of await fs.promises.readdir(dir).catch(() => [] as string[])) {
        if (!name.endsWith(".part")) continue;
        const file = path.join(dir, name);
        const stat = await fs.promises.stat(file).catch(() => undefined);
        if (stat?.isFile() && stat.mtimeMs < cutoff) await discardPart(file);
      }
    }
  }
  void sweepIncoming().catch((error) => ctx.log.warn({ err: error }, "could not clean up unfinished uploads"));

  // Documents read before OCR existed have no count of scanned pages. Those with no
  // text at all are counted here so that they offer OCR too; a PDF with only some
  // pages scanned is counted the next time its text is read.
  const mostPages = settings.get("indexing.maxPdfPages");
  sqlite
    .prepare(
      `UPDATE documents SET scan_pages = CASE WHEN ext = 'pdf' THEN min(page_count, @most) ELSE 1 END
       WHERE scan_pages = 0 AND ocr_pages IS NULL AND extraction = 'unsupported' AND text_chars = 0
         AND ((ext = 'pdf' AND page_count > 0) OR ext IN ('png', 'jpg', 'jpeg', 'gif', 'webp'))`,
    )
    .run({ most: mostPages > 0 ? mostPages : Number.MAX_SAFE_INTEGER });

  // Counted as the list shows them: a book's chapters are not separate documents here.
  const loose = "NOT EXISTS (SELECT 1 FROM book_chapters bc WHERE bc.document_id = documents.id)";
  const facetStatements = {
    categories: sqlite.prepare(
      `SELECT min(category) AS name, count(*) AS count FROM documents
       WHERE category IS NOT NULL AND category != '' AND ${loose}
       GROUP BY category COLLATE NOCASE ORDER BY count DESC, name COLLATE NOCASE`,
    ),
    tags: sqlite.prepare(
      `SELECT t.name AS name, count(*) AS count FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
       GROUP BY t.id ORDER BY count DESC, t.name COLLATE NOCASE`,
    ),
    types: sqlite.prepare(`SELECT ext, count(*) AS count FROM documents WHERE ${loose} GROUP BY ext`),
    totals: sqlite.prepare(`SELECT count(*) AS total, coalesce(sum(size_bytes), 0) AS totalBytes FROM documents WHERE ${loose}`),
    // An audiobook of several files is one book, kept as a collection; the Library offers it under "Audiobooks".
    audiobooks: sqlite.prepare(`SELECT count(*) AS count FROM collections WHERE json_extract(meta, '$.audiobook') IS NOT NULL`),
  };
  const tagList = sqlite.prepare(
    `SELECT t.id AS id, t.name AS name, count(dt.document_id) AS documentCount
     FROM tags t LEFT JOIN document_tags dt ON dt.tag_id = t.id
     GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
  );

  // ── The service ──

  const sortColumn: Record<DocumentSort, SQL> = {
    added: sql`${documents.createdAt}`,
    title: sql`${documents.title} collate nocase`,
    size: sql`${documents.sizeBytes}`,
  };

  const service: DocumentsService = {
    get: (id) => toDto(requireRow(id)),

    absolutePath(id) {
      const row = requireRow(id);
      return storage.resolve(row.locationId, row.relPath);
    },

    ingestFile,
    uploadLocation,
    commitStaged: (staged, options) => oneAtATime(() => commit(staged, options)),

    list(query = {}) {
      const conditions: SQL[] = [];
      if (query.q) {
        const pattern = `%${escapeLike(query.q)}%`;
        conditions.push(
          sql`(${documents.title} like ${pattern} escape '\\' or ${documents.originalName} like ${pattern} escape '\\' or exists (select 1 from ${bookDetails} where ${bookDetails.documentId} = ${documents.id} and ${bookDetails.series} like ${pattern} escape '\\'))`,
        );
      }
      if (query.category) conditions.push(sql`${documents.category} = ${query.category} collate nocase`);
      if (query.type) conditions.push(inArray(documents.ext, extensionsOfType(query.type)));
      if (query.tag) {
        const wanted = tagKey(query.tag.trim());
        const tag = db
          .select()
          .from(tags)
          .all()
          .find((candidate) => tagKey(candidate.name) === wanted);
        if (!tag) return { documents: [], total: 0 };
        conditions.push(
          sql`exists (select 1 from ${documentTags} where ${documentTags.documentId} = ${documents.id} and ${documentTags.tagId} = ${tag.id})`,
        );
      }
      if (!(query.chapters ?? Boolean(query.q || query.tag))) conditions.push(notAChapter);
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const sort = query.sort ?? "added";
      // Newest and largest first, but titles from A to Z, unless asked otherwise.
      const direction = (query.order ?? (sort === "title" ? "asc" : "desc")) === "asc" ? asc : desc;
      const rows = db
        .select()
        .from(documents)
        .where(where)
        .orderBy(direction(sortColumn[sort]), direction(documents.id))
        .limit(Math.min(Math.max(query.limit ?? 50, 1), 200))
        .offset(Math.max(query.offset ?? 0, 0))
        .all();
      const total = db.select({ n: sql<number>`count(*)` }).from(documents).where(where).get()?.n ?? 0;
      return { documents: toDtos(rows), total };
    },

    facets() {
      const byType = new Map<DocumentType, number>();
      for (const row of facetStatements.types.all() as Array<{ ext: string; count: number }>) {
        const type = formatForExt(row.ext)?.type ?? "text";
        byType.set(type, (byType.get(type) ?? 0) + row.count);
      }
      const books = (facetStatements.audiobooks.get() as { count: number }).count;
      if (books > 0) byType.set("audio", (byType.get("audio") ?? 0) + books);
      const totals = facetStatements.totals.get() as { total: number; totalBytes: number };
      return {
        categories: facetStatements.categories.all() as Array<{ name: string; count: number }>,
        tags: facetStatements.tags.all() as Array<{ name: string; count: number }>,
        types: [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
        total: totals.total,
        totalBytes: totals.totalBytes,
      };
    },

    async update(id, patch) {
      requireRow(id);
      const set: Partial<DocumentRow> = { updatedAt: Date.now() };
      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title) throw badRequest("A document needs a title.");
        set.title = title.slice(0, MAX_TITLE_LENGTH);
      }
      if (patch.description !== undefined) set.description = blankToNull(patch.description);
      if (patch.category !== undefined) set.category = blankToNull(patch.category);
      if (patch.author !== undefined) set.author = blankToNull(patch.author);
      if (patch.source !== undefined) set.source = blankToNull(patch.source);
      if (patch.language !== undefined) set.language = blankToNull(patch.language);
      const tagList = patch.tags === undefined ? undefined : cleanTags(patch.tags);
      sqlite.transaction(() => {
        db.update(documents).set(set).where(eq(documents.id, id)).run();
        if (tagList) setTags(id, tagList);
      })();
      await reindex(id);
      changed(id);
      return toDto(requireRow(id));
    },

    async remove(id, options = {}) {
      const row = requireRow(id);
      const location = storage.get(row.locationId);
      if (!options.forget && location.status !== "available") {
        throw new AppError(
          "storage_unavailable",
          `"${location.name}" is not connected, so the file of "${row.title}" cannot be deleted. Reconnect it and try again, or remove only Outpost's record of this document and leave the file where it is.`,
          { locationId: location.id, canForget: true },
        );
      }
      // Stop reading a file that is about to go, rather than let that job fail on it.
      for (const job of ctx.jobs.findBySubject(subjectOf(id))) {
        if (job.state === "queued" || job.state === "running" || job.state === "paused") ctx.jobs.cancel(job.id);
      }
      if (!options.forget) {
        try {
          await fs.promises.rm(resolveInside(location.path, row.relPath), { force: true });
          // Only the folder Outpost made for this document goes with it. A file that
          // was relocated somewhere else leaves its surroundings alone.
          const ownFolder = `documents/${row.id}`;
          if (row.relPath.startsWith(`${ownFolder}/`)) {
            await fs.promises.rm(resolveInside(location.path, ownFolder), { recursive: true, force: true });
          }
        } catch (error) {
          throw new AppError(
            "storage_unavailable",
            `The file of "${row.title}" could not be deleted from "${location.name}" (${messageOf(error)}). Check that the drive is writable and try again. Nothing was removed.`,
            { locationId: location.id },
          );
        }
      }
      const tagIds = tagIdsOf(id);
      sqlite.transaction(() => {
        db.delete(documents).where(eq(documents.id, id)).run();
        for (const tagId of tagIds) pruneTag.run({ id: tagId });
      })();
      search.remove(SEARCH_KIND, id);
      await extracted.remove(id);
      changed(id);
    },

    refreshSearch: (id) => reindex(id),

    async relocate(id, locationId, relPath) {
      requireRow(id);
      const location = storage.get(locationId);
      const relative = path.relative(location.path, resolveInside(location.path, relPath)).split(path.sep).join("/");
      if (!relative) throw badRequest("A document's path must name a file inside the storage location.");
      db.update(documents).set({ locationId, relPath: relative, updatedAt: Date.now() }).where(eq(documents.id, id)).run();
      await reindex(id);
      changed(id);
      return toDto(requireRow(id));
    },

    reextract(id) {
      const row = requireRow(id);
      const underWay = ctx.jobs
        .findBySubject(subjectOf(id))
        .find((job) => job.type === EXTRACT_JOB && (job.state === "queued" || job.state === "running"));
      if (underWay) return { document: toDto(row), job: underWay };
      // The two would rewrite the same stored text. What OCR has finished is kept.
      ocr.cancel(id);
      // Fails now, with a clear message, rather than later in the background.
      if (formatForExt(row.ext)?.type !== "image") storage.resolve(row.locationId, row.relPath);
      db.update(documents).set({ extraction: "pending", extractionDetail: null, updatedAt: Date.now() }).where(eq(documents.id, id)).run();
      const fresh = requireRow(id);
      const job = enqueueExtraction(fresh);
      changed(id);
      return { document: toDto(fresh), job };
    },

    ocrStatus: () => ocr.status(),

    async ocr(id, options = {}) {
      const job = await ocr.start(requireRow(id), options);
      return { document: toDto(requireRow(id)), job };
    },

    async text(id, page) {
      const row = requireRow(id);
      const sections = await extracted.read(id);
      const wanted = page === undefined ? sections : sections.filter((section) => section.page === page);
      return {
        documentId: row.id,
        extraction: row.extraction,
        extractionDetail: row.extractionDetail,
        pageCount: row.pageCount,
        sections: wanted.map((section) => ({
          page: section.page ?? null,
          heading: section.heading ?? null,
          text: section.text,
          ocr: section.ocr === true,
        })),
      };
    },

    tags: () => tagList.all() as TagDto[],
  };

  return service;
}

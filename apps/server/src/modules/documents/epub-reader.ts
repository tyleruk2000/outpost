/**
 * Reading an EPUB book in the app: what is in it, one chapter at a time, and its pictures.
 *
 * The book stays one file in the library. Nothing is unpacked to disk: each request
 * opens the archive, reads the one entry it needs into memory under a limit, and closes
 * it. A chapter is sent as plain values (`epub-view.ts`), never as the book's own
 * markup. A picture is sent only if its bytes are a picture.
 *
 * What is refused, and said plainly: a book locked by a rights scheme (DRM), which is
 * never opened; an archive that is damaged or built to exhaust memory; a chapter too
 * large or too tangled to show; a path that is not a file of the book.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DocumentDto, DocumentEpubChapterResponse, DocumentEpubResponse, EpubContentsEntry } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import {
  type ContentsLine,
  type EpubPackage,
  fragmentOf,
  isProtected,
  MAX_SPINE_ITEMS,
  PROTECTED_MESSAGE,
  readContents,
  readPackage,
  resolveHref,
} from "./epub-package.ts";
import { anchorId, type ChapterLookups, chapterBlocks, type LeftOut } from "./epub-view.ts";
import { ExtractionError } from "./extract-types.ts";
import { createExtractedStore } from "./extracted-store.ts";
import { formatForExt, looksLikeUtf8Text } from "./file-types.ts";
import { contentDisposition, matchesEtag } from "./http.ts";
import { safeHref } from "./markdown-view.ts";
import type { DocumentsService } from "./service.ts";
import { openZip, type ZipReader } from "./zip.ts";

/**
 * The largest chapter shown. A chapter is parsed on the server's own thread into a tree
 * several times its size, so this is the same limit a Markdown file is held to. Books
 * made by the usual tools split their text into files well under it.
 */
export const MAX_CHAPTER_BYTES = 2 * 1024 * 1024;
/**
 * Most tags in a chapter. Every element costs memory whatever it holds, so a page of
 * nothing but tiny elements is refused by count rather than by size.
 */
export const MAX_CHAPTER_TAGS = 120_000;
/** The largest picture sent from a book, and the largest drawing (SVG is text, and is read through). */
export const MAX_PICTURE_BYTES = 16 * 1024 * 1024;
export const MAX_SVG_BYTES = 2 * 1024 * 1024;
/** Largest package file or table of contents read here, on the server's own thread. */
const MAX_DESCRIPTION_BYTES = 4 * 1024 * 1024;
/** Books whose description is kept in memory between requests. */
const REMEMBERED_BOOKS = 16;

/** As for every file a person uploaded: an origin of its own, and nothing loaded from anywhere. */
const PICTURE_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'";

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Why a book or a part of it is not shown, for the web app to choose its words by. */
type Reason = "protected" | "damaged" | "too_large";
const refusal = (code: "unsupported" | "too_large" | "not_found", message: string, reason: Reason) =>
  new AppError(code, message, { reason });

const NOTES: Record<LeftOut, string> = {
  script: "This chapter has scripted, interactive content. Outpost does not run a book's scripts, so only its words are shown.",
  media: "This chapter has audio or video, which is not played here.",
  math: "The mathematics in this chapter is shown as plain text and may not read correctly.",
  drawing: "A drawing in this chapter is not shown.",
  form: "Forms and buttons in this chapter are left out.",
};

/**
 * A path as this server writes it for a file of a book: relative, forward slashes,
 * already in its simplest form, never climbing out. Anything else is not a path into
 * the book, whatever it might resolve to.
 */
export function archivePath(raw: string): string | null {
  if (!raw || raw.length > 1024 || raw.includes("\0") || raw.includes("\\")) return null;
  if (raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  const normal = path.posix.normalize(raw);
  return normal === raw && normal !== "." && normal !== ".." && !normal.startsWith("../") && !normal.endsWith("/") ? normal : null;
}

/**
 * Anything in a drawing that could act: script, embedded pages, an event handler or a
 * script address on any element, declared entities (which could spell any of those).
 */
const ACTIVE_SVG =
  /<(?:[\w.-]+:)?(?:script|foreignObject|iframe|embed|object|handler|listener)\b|<[^>]*\son[a-z]+\s*=|<[^>]*(?:java|vb)script\s*:|<!ENTITY/i;

/**
 * What kind of picture some bytes are, judged by the bytes alone. Null for anything
 * that is not a picture: a chapter, a font, a stylesheet, a script.
 */
export function pictureType(bytes: Buffer): { mime: string; svg: boolean } | null {
  for (const ext of ["png", "jpg", "gif", "webp"]) {
    const format = formatForExt(ext);
    if (format?.matches(bytes.subarray(0, 64), bytes.length <= 64)) return { mime: format.mime, svg: false };
  }
  if (bytes.length > MAX_SVG_BYTES || !looksLikeUtf8Text(bytes, true)) return null;
  // A drawing is a file whose outermost element is `<svg>`; a page that merely holds one is not.
  const start = bytes
    .toString("utf8", 0, 4096)
    .replace(/^﻿/, "")
    .replace(/^\s*<\?xml[^>]*\?>/, "")
    .replace(/^(?:\s*<!--[\s\S]*?-->|\s*<!DOCTYPE[^>[]*(?:\[[^\]]*\])?\s*>)*/i, "")
    .trimStart();
  return /^<(?:[\w.-]+:)?svg[\s>]/i.test(start) ? { mime: "image/svg+xml", svg: true } : null;
}

/** Decodes a chapter: by its byte-order mark, else by the encoding its first line declares, else as UTF-8. */
export function decodeMarkup(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const declared = /^<\?xml[^>]*\sencoding\s*=\s*["']([\w.:-]{1,40})["']/i.exec(bytes.toString("latin1", 0, 200).replace(/^ï»¿/, ""));
  let text: string | undefined;
  try {
    if (declared) text = new TextDecoder(declared[1]).decode(bytes);
  } catch {
    // An encoding this server does not know: read as UTF-8, as before.
  }
  return (text ?? new TextDecoder("utf-8").decode(bytes)).replace(/^\uFEFF/, "");
}

/** What is known of a book once its package and table of contents have been read. */
interface OpenBook {
  book: EpubPackage;
  contents: ContentsLine[];
  /** Place in the reading order of each content document, counted from 0. */
  positions: Map<string, number>;
  /** The first heading search found in each chapter, by its place counted from 1. */
  headings: Map<number, string>;
}

export interface EpubReader {
  summary(id: string): Promise<DocumentEpubResponse>;
  chapter(id: string, position: number): Promise<DocumentEpubChapterResponse>;
  /** A picture from inside the book. Throws unless `rawPath` is a file of the book whose bytes are a picture. */
  picture(id: string, rawPath: string): Promise<{ bytes: Buffer; mime: string; svg: boolean }>;
}

export function createEpubReader(ctx: AppContext, documents: DocumentsService): EpubReader {
  const extracted = createExtractedStore(ctx);
  const remembered = new Map<string, OpenBook>();

  /** Chapters are read one at a time, so several requests cannot add their memory up. */
  let line: Promise<unknown> = Promise.resolve();
  function inTurn<T>(work: () => T): Promise<T> {
    const next = line.then(work);
    line = next.catch(() => undefined);
    return next;
  }

  async function describe(document: DocumentDto, zip: ZipReader): Promise<OpenBook> {
    if (await isProtected(zip, MAX_DESCRIPTION_BYTES)) throw refusal("unsupported", PROTECTED_MESSAGE, "protected");
    const book = await readPackage(zip, MAX_DESCRIPTION_BYTES);
    if (book.spine.length === 0) {
      throw refusal(
        "unsupported",
        "This EPUB lists no chapters that are in the file, so there is nothing to read. It may be damaged.",
        "damaged",
      );
    }
    const contents = await readContents(zip, book, MAX_DESCRIPTION_BYTES);
    const headings = new Map<number, string>();
    for (const section of await extracted.read(document.id)) {
      if (section.chapter && section.heading && !headings.has(section.chapter))
        headings.set(section.chapter, section.heading.slice(0, 300));
    }
    return { book, contents, positions: new Map(book.spine.map((item, index) => [item.path, index])), headings };
  }

  /** Opens the book's archive for one request. Every failure leaves as a sentence a person can read. */
  async function withBook<T>(id: string, use: (open: OpenBook, zip: ZipReader, document: DocumentDto) => Promise<T>): Promise<T> {
    const document = documents.get(id);
    if (document.type !== "epub") throw new AppError("unsupported", `"${document.title}" is not an EPUB book.`);
    const file = documents.absolutePath(id);
    const stat = await fs.promises.stat(file).catch(() => undefined);
    if (!stat?.isFile()) {
      throw new AppError(
        "not_found",
        `The file of "${document.title}" is missing from its storage location (${document.relPath}). It may have been moved or deleted outside Outpost.`,
      );
    }
    let zip: ZipReader | undefined;
    try {
      zip = await openZip(file);
      // The text read for search can change (it is read again on request), and with it the headings kept here.
      const key = `${document.id}:${document.sha256}:${document.updatedAt}`;
      let open = remembered.get(key);
      remembered.delete(key);
      open ??= await describe(document, zip);
      remembered.set(key, open);
      for (const oldest of remembered.keys()) {
        if (remembered.size <= REMEMBERED_BOOKS) break;
        remembered.delete(oldest);
      }
      return await use(open, zip, document);
    } catch (error) {
      // The archive and package readers write their failures for people already.
      if (error instanceof ExtractionError) throw refusal("unsupported", error.message, "damaged");
      throw error;
    } finally {
      zip?.close();
    }
  }

  /** The name each chapter goes by: from the table of contents, else its first heading, else its place. */
  function titlesOf(open: OpenBook): string[] {
    const fromContents = new Map<number, string>();
    for (const entry of open.contents) {
      const position = entry.path === undefined ? undefined : open.positions.get(entry.path);
      if (position !== undefined && !fromContents.has(position)) fromContents.set(position, entry.title);
    }
    return open.book.spine.map((_, index) => fromContents.get(index) ?? open.headings.get(index + 1) ?? `Section ${index + 1}`);
  }

  function lookupsFor(open: OpenBook, zip: ZipReader, chapterPath: string): ChapterLookups {
    return {
      link(href) {
        const written = href.trim();
        const web = safeHref(written);
        if (web) return { kind: "web", href: web };
        // Any other scheme (`javascript:`, `data:`, `file:`) is not a link at all.
        if (/^[a-z][a-z0-9+.-]*:/i.test(written)) return null;
        const fragment = fragmentOf(written);
        const anchor = fragment ? anchorId(fragment) : "";
        const place = anchor ? { anchor } : {};
        if (written.startsWith("#")) return { kind: "here", ...place };
        const target = resolveHref(chapterPath, written);
        if (!target) return null;
        if (target === chapterPath) return { kind: "here", ...place };
        const position = open.positions.get(target);
        if (position !== undefined) return { kind: "chapter", chapter: position + 1, ...place };
        // The book's own table of contents is the contents page here.
        if (target === open.book.navPath) return { kind: "chapter", chapter: 0 };
        return null;
      },
      picture(src) {
        const target = resolveHref(chapterPath, src.trim());
        return target && archivePath(target) && zip.has(target) ? target : null;
      },
    };
  }

  return {
    summary(id) {
      return withBook(id, async (open, _zip, document) => {
        const { book } = open;
        const titles = titlesOf(open);
        const contents: EpubContentsEntry[] = open.contents.map((entry) => {
          const position = entry.path === undefined ? undefined : open.positions.get(entry.path);
          const anchor = position !== undefined && entry.fragment ? anchorId(entry.fragment) : "";
          return {
            title: entry.title,
            chapter: position === undefined ? null : position + 1,
            ...(anchor ? { anchor } : {}),
            depth: entry.depth,
          };
        });
        const notes: string[] = [];
        if (book.fixedLayout) {
          notes.push(
            "This is a fixed-layout book: each page was designed as a picture of a page. Outpost does not draw those layouts. It shows the words and pictures of each page in order.",
          );
        }
        if (book.spineDropped > 0) {
          const all = (book.spine.length + book.spineDropped).toLocaleString("en");
          notes.push(`This book is in ${all} sections. Only the first ${MAX_SPINE_ITEMS.toLocaleString("en")} can be read here.`);
        }
        return {
          documentId: document.id,
          title: book.meta.title ?? null,
          author: book.meta.author ?? null,
          language: book.meta.language ?? null,
          cover: book.coverPath && archivePath(book.coverPath) ? book.coverPath : null,
          chapters: book.spine.map((_, index) => ({
            position: index + 1,
            title: titles[index] ?? `Section ${index + 1}`,
            heading: open.headings.get(index + 1) ?? null,
          })),
          contents,
          notes,
        };
      });
    },

    chapter(id, position) {
      return withBook(id, async (open, zip, document) => {
        const item = open.book.spine[position - 1];
        const total = open.book.spine.length;
        if (!item)
          throw new AppError(
            "not_found",
            `This book has ${total} ${total === 1 ? "section" : "sections"}; there is no section ${position}.`,
          );
        const size = zip.sizeOf(item.path) ?? 0;
        const tooLarge = (what: string) =>
          refusal(
            "too_large",
            `${what} The other chapters can still be read here, and the original can be downloaded and opened in another program.`,
            "too_large",
          );
        if (size > MAX_CHAPTER_BYTES) {
          throw tooLarge(
            `This chapter is ${megabytes(size)} of markup, and Outpost shows chapters of up to ${megabytes(MAX_CHAPTER_BYTES)}.`,
          );
        }
        const source = decodeMarkup(await zip.read(item.path, MAX_CHAPTER_BYTES));
        let tags = 0;
        for (let at = source.indexOf("<"); at !== -1; at = source.indexOf("<", at + 1)) tags += 1;
        if (tags > MAX_CHAPTER_TAGS) throw tooLarge("This chapter is made of more pieces of markup than Outpost will read into memory.");

        const view = await inTurn(() => {
          try {
            return chapterBlocks(source, lookupsFor(open, zip, item.path));
          } catch (error) {
            // Nesting thousands deep is not writing; it is a page built to exhaust the reader.
            if (error instanceof RangeError) throw refusal("unsupported", "This chapter is nested too deeply to be read.", "damaged");
            throw error;
          }
        });
        return {
          documentId: document.id,
          position,
          total,
          title: titlesOf(open)[position - 1] ?? `Section ${position}`,
          blocks: view.blocks,
          notes: view.leftOut.map((what) => NOTES[what]),
        };
      });
    },

    picture(id, rawPath) {
      return withBook(id, async (_open, zip) => {
        const file = archivePath(rawPath);
        if (!file) throw new AppError("bad_request", "That is not the path of a file inside this book.");
        const size = zip.sizeOf(file);
        if (size === undefined) throw new AppError("not_found", "This book has no such picture.");
        if (size > MAX_PICTURE_BYTES) {
          throw refusal(
            "too_large",
            `This picture is ${megabytes(size)}, which is more than Outpost shows from inside a book.`,
            "too_large",
          );
        }
        const bytes = await zip.read(file, MAX_PICTURE_BYTES);
        const type = pictureType(bytes);
        if (!type) throw new AppError("unsupported", "That file of the book is not a picture Outpost can show.");
        if (type.svg && ACTIVE_SVG.test(bytes.toString("utf8"))) {
          throw new AppError("unsupported", "This drawing holds a script or other active content, so Outpost does not show it.");
        }
        return { bytes, ...type };
      });
    },
  };
}

type IdParams = { Params: { id: string } };

export function registerEpubReader(app: FastifyInstance, ctx: AppContext, documents: DocumentsService): void {
  const reader = createEpubReader(ctx, documents);

  /** What an EPUB book says about itself: title, author, cover, reading order and table of contents. */
  app.get<IdParams>("/api/documents/:id/epub", async (request): Promise<DocumentEpubResponse> => reader.summary(request.params.id));

  /**
   * One chapter, by its place in the reading order (from 1), as plain values the web
   * app draws itself. The book's own HTML, styles and scripts are never sent.
   */
  app.get<{ Params: { id: string; position: string } }>(
    "/api/documents/:id/epub/chapters/:position",
    async (request): Promise<DocumentEpubChapterResponse> => {
      const { position } = z.object({ position: z.coerce.number().int().min(1).max(MAX_SPINE_ITEMS) }).parse(request.params);
      return reader.chapter(request.params.id, position);
    },
  );

  /**
   * A picture from inside the book, named by its path in the archive. Only bytes that
   * are a picture are sent, under the type the bytes say, in a sandbox like every
   * other file a person added. A drawing (SVG) is offered as a download, so it is only
   * ever seen through an `<img>`, where it cannot run script.
   */
  app.get<IdParams>("/api/documents/:id/epub/file", async (request, reply) => {
    const query = z.object({ path: z.string().min(1).max(1024) }).parse(request.query);
    const document = documents.get(request.params.id);
    const etag = `"${document.sha256.slice(0, 32)}-${createHash("sha256").update(query.path).digest("hex").slice(0, 16)}"`;
    reply
      .header("Content-Security-Policy", PICTURE_CSP)
      .header("X-Content-Type-Options", "nosniff")
      // The bytes behind a document's id never change, so a browser may keep them and revalidate.
      .header("Cache-Control", "private, no-cache")
      .header("ETag", etag);
    if (matchesEtag(request.headers["if-none-match"], etag)) return reply.status(304).send();
    const picture = await reader.picture(document.id, query.path);
    const name = path.posix.basename(query.path);
    return reply
      .header("Content-Disposition", contentDisposition(picture.svg ? "attachment" : "inline", name))
      .header("Content-Length", picture.bytes.length)
      .type(picture.svg ? "image/svg+xml; charset=utf-8" : picture.mime)
      .send(picture.bytes);
  });
}

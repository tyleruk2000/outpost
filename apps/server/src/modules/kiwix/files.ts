/**
 * Files inside a reference collection.
 *
 * Some archives are copies of web sites that hold PDFs and e-books as well as pages. A
 * person reading such an archive should be able to keep one of those files as a document
 * of their own: opened in the built-in viewer and searchable to the page. Copying it out
 * of the archive needs no internet connection; the archive is already on their disk.
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DocumentDto } from "@outpost/shared";
import { inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { safeFileName } from "../../core/fs-safe.ts";
import { newId } from "../../core/ids.ts";
import { documents as documentsTable } from "../../db/schema.ts";
import type { CollectionRow } from "../collections/service.ts";
import { extensionOf, formatForExt } from "../documents/file-types.ts";

/** The kinds of file that can be taken out of a collection. Pages stay where they are. */
const KEPT_TYPES = new Set(["pdf", "epub", "markdown", "text"]);
const SAVED_DIR = "documents/saved";
const MAX_PATH = 1000;
const MAX_REDIRECTS = 3;

export interface ArchiveFile {
  /** Path inside the book, as the archive names it, e.g. "example.org/docs/manual.pdf". */
  path: string;
  name: string;
}

/** A path a person may ask for, or the reason it is refused. */
export function parseArchivePath(raw: string): ArchiveFile {
  const clean = raw.trim();
  const refuse = () => badRequest("That is not the address of a file inside this collection.");
  if (!clean || clean.length > MAX_PATH || clean.startsWith("/") || clean.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(clean))
    throw refuse();
  const parts = clean.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw refuse();
  const name = safeFileName(parts.at(-1) ?? "", "");
  const format = name ? formatForExt(extensionOf(name)) : undefined;
  if (!format || !KEPT_TYPES.has(format.type)) {
    throw badRequest("Only PDFs, e-books and text files can be added to the library from a collection.");
  }
  return { path: parts.join("/"), name };
}

/**
 * Where the file came from, for the document's record. An archive of a web site keeps
 * each file under the site's own address, so that address can be given back.
 */
export function sourceOfArchiveFile(collectionTitle: string, filePath: string): string {
  const host = filePath.split("/")[0] ?? "";
  const looksLikeHost = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
  return looksLikeHost && filePath.includes("/") ? `https://${filePath}` : `${collectionTitle}: ${filePath}`;
}

export interface ArchiveFilesOptions {
  /** Asks kiwix-serve for a path, without following redirects. */
  upstream(pathAndQuery: string): Promise<Response>;
  requireBook(collectionId: string): CollectionRow;
  bookNameOf(row: CollectionRow): string;
}

const encode = (filePath: string) => filePath.split("/").map(encodeURIComponent).join("/");

/**
 * Asks the archive for something inside a book, following the archive's own redirects as
 * long as they stay inside that book. `relPath` is a path inside the book; empty asks for
 * the book's first page. Answers with the response and the path it came from, or
 * undefined when a redirect leads out of the book or they do not end.
 */
export async function followInsideBook(
  upstream: ArchiveFilesOptions["upstream"],
  bookName: string,
  relPath: string,
): Promise<{ response: Response; path: string } | undefined> {
  const root = `content/${encodeURIComponent(bookName)}`;
  let target = relPath ? `${root}/${encode(relPath)}` : root;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await upstream(target);
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) {
      try {
        return { response, path: decodeURIComponent(target.slice(root.length + 1)) };
      } catch {
        await response.body?.cancel();
        return undefined;
      }
    }
    await response.body?.cancel();
    const next = new URL(location, `http://archive/${target}`);
    if (next.host !== "archive" || !next.pathname.startsWith(`/${root}/`)) break;
    target = next.pathname.slice(1);
  }
  return undefined;
}

export interface ArchiveFilesService {
  /** Which of these paths inside a book are already documents in the library: path to document id. */
  savedDocuments(row: CollectionRow, paths: string[]): Map<string, string>;
}

export function registerArchiveFiles(app: FastifyInstance, ctx: AppContext, options: ArchiveFilesOptions): ArchiveFilesService {
  const { documents } = ctx.services;

  const savedAs = (sources: string[]): Map<string, string> => {
    const found = new Map<string, string>();
    // A few hundred at a time: a query takes only so many values.
    for (let from = 0; from < sources.length; from += 500) {
      const rows = ctx.db
        .select({ id: documentsTable.id, source: documentsTable.source })
        .from(documentsTable)
        .where(inArray(documentsTable.source, sources.slice(from, from + 500)))
        .all();
      for (const row of rows) found.set(row.source!, row.id);
    }
    return found;
  };

  function savedDocuments(row: CollectionRow, paths: string[]): Map<string, string> {
    const sources = new Map<string, string>();
    for (const raw of paths) {
      try {
        sources.set(raw, sourceOfArchiveFile(row.title, parseArchivePath(raw).path));
      } catch {
        // Not a file the library keeps, so it cannot have been added.
      }
    }
    const saved = savedAs([...new Set(sources.values())]);
    const found = new Map<string, string>();
    for (const [raw, source] of sources) {
      const documentId = saved.get(source);
      if (documentId) found.set(raw, documentId);
    }
    return found;
  }

  /** Asks the archive for the file, following its own redirects as long as they stay inside the book. */
  async function open(bookName: string, file: ArchiveFile): Promise<Response> {
    const found = await followInsideBook(options.upstream, bookName, file.path);
    if (!found) throw new AppError("upstream", `"${file.name}" could not be read from this collection.`);
    return found.response;
  }

  async function save(
    row: CollectionRow,
    file: ArchiveFile,
    title: string | undefined,
  ): Promise<{ status: "created" | "duplicate" | "already"; document: DocumentDto }> {
    const source = sourceOfArchiveFile(row.title, file.path);
    const known = savedAs([source]).get(source);
    if (known) return { status: "already", document: documents.get(known) };

    const response = await open(options.bookNameOf(row), file);
    if (response.status === 404) {
      await response.body?.cancel();
      throw new AppError(
        "not_found",
        `"${file.name}" is not in this collection. The site it was copied from may have had it; the copy does not.`,
      );
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new AppError("upstream", `"${file.name}" could not be read from this collection.`);
    }
    if ((response.headers.get("content-type") ?? "").includes("text/html")) {
      await response.body.cancel();
      throw badRequest(`The collection has a page at that address, not a file the library can keep.`);
    }

    const location = documents.uploadLocation();
    const folder = path.join(location.path, SAVED_DIR);
    const temp = path.join(folder, `${newId()}-${file.name}`);
    await fs.promises.mkdir(folder, { recursive: true });
    try {
      let seen = 0;
      const limit = ctx.config.maxUploadBytes;
      await pipeline(
        Readable.fromWeb(response.body as never),
        async function* cap(chunks: AsyncIterable<Buffer>) {
          for await (const chunk of chunks) {
            seen += chunk.length;
            if (seen > limit) throw badRequest(`"${file.name}" is larger than this server accepts for one document.`);
            yield chunk;
          }
        },
        fs.createWriteStream(temp),
      );
      const outcome = await documents.ingestFile({ sourcePath: temp, originalName: file.name, title, locationId: location.id, move: true });
      if (outcome.status === "duplicate") return outcome;
      const document = await documents.update(outcome.document.id, { source, description: `Saved from ${row.title}.` });
      return { status: "created", document };
    } finally {
      // Moved into the library when it was accepted; otherwise it is not wanted.
      await fs.promises.rm(temp, { force: true });
      await fs.promises.rmdir(folder).catch(() => undefined);
    }
  }

  const saveBody = z.object({ path: z.string().max(MAX_PATH * 3), title: z.string().trim().max(300).optional() });
  const checkBody = z.object({ paths: z.array(z.string().max(MAX_PATH * 3)).max(500) });

  app.post<{ Params: { collectionId: string } }>("/api/kiwix/books/:collectionId/files/save", async (request) => {
    const row = options.requireBook(request.params.collectionId);
    const input = saveBody.parse(request.body);
    return save(row, parseArchivePath(input.path), input.title || undefined);
  });

  // Which of these files are already documents in the library.
  app.post<{ Params: { collectionId: string } }>("/api/kiwix/books/:collectionId/files/check", async (request) => {
    const row = options.requireBook(request.params.collectionId);
    const { paths } = checkBody.parse(request.body);
    const saved = savedDocuments(row, paths);
    return {
      files: paths.map((raw) => {
        const documentId = saved.get(raw);
        return documentId ? { path: raw, state: "saved" as const, documentId } : { path: raw, state: "new" as const };
      }),
    };
  });

  return { savedDocuments };
}

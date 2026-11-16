/**
 * Files inside a reference collection.
 *
 * Some archives are copies of web sites that hold PDFs and e-books as well as pages. A
 * person reading such an archive should be able to keep one of those files as a document
 * of their own: opened in the built-in viewer and searchable to the page. Copying it out
 * of the archive needs no internet connection; the archive is already on their disk.
 *
 * What adding a file does, in order: the bytes are asked of kiwix-serve, which reads them
 * out of the archive; they are written under `documents/saved/` on the default storage
 * location; the document library takes the file from there into a folder of its own
 * (`documents/<id>/`), records it, and queues reading its text. The archive is not
 * changed, so the file is then on disk twice. Nothing is fetched from anywhere else.
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type ArchiveFileSizes, type ArchiveFileTurn, type DocumentDto, formatBytes } from "@outpost/shared";
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
import { SPACE_RESERVE_BYTES } from "../storage/service.ts";

/** The kinds of file that can be taken out of a collection. Pages stay where they are. */
const KEPT_TYPES = new Set(["pdf", "epub", "markdown", "text"]);
const SAVED_DIR = "documents/saved";
const MAX_PATH = 1000;
const MAX_REDIRECTS = 3;
/**
 * How long a file being copied may go without a byte arriving before the copy is given up.
 * There is no limit on the whole copy: a large file from a slow drive takes as long as it takes.
 */
const STALL_MS = 30_000;
/** How long the archive is given to say how large one file is. */
const SIZE_TIMEOUT_MS = 8_000;
/** How many sizes are asked for at once: fewer than kiwix-serve's four places, so that someone reading is not kept waiting. */
const SIZES_AT_ONCE = 3;
/** Sizes remembered across all archives, at about a hundred bytes each. Past this the oldest archive's are let go. */
const MAX_HELD_SIZES = 100_000;

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
  upstream(pathAndQuery: string, init?: RequestInit): Promise<Response>;
  requireBook(collectionId: string): CollectionRow;
  bookNameOf(row: CollectionRow): string;
  /** Tells a replaced archive from the one a size was read from. */
  uuidOf(row: CollectionRow): string | undefined;
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
  init?: RequestInit,
): Promise<{ response: Response; path: string } | undefined> {
  const root = `content/${encodeURIComponent(bookName)}`;
  let target = relPath ? `${root}/${encode(relPath)}` : root;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await upstream(target, init);
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

export interface SaveOutcome {
  /** "already": this file had been added before. "duplicate": the library held the same file from elsewhere. */
  status: "created" | "duplicate" | "already";
  document: DocumentDto;
}

export interface ArchiveFilesService {
  /** Which of these paths inside a book are already documents in the library: path to document id. */
  savedDocuments(row: CollectionRow, paths: string[]): Map<string, string>;
  /**
   * Copies one file out of the archive into the document library. Two requests for the
   * same file share one copy. `signal` stops it part of the way; nothing is left behind.
   */
  save(row: CollectionRow, file: ArchiveFile, title: string | undefined, options?: { signal?: AbortSignal }): Promise<SaveOutcome>;
  /**
   * How large each of these files is, as the archive says: path to bytes, with nothing for
   * a file it gave no size for before `deadlineMs` had passed. Remembered, so asking again is free.
   */
  sizes(row: CollectionRow, paths: string[], deadlineMs?: number): Promise<Map<string, number>>;
  /** A file's place in the adding that is under way, if it has one. */
  turnOf(row: CollectionRow, path: string): ArchiveFileTurn | null;
  /** Marks files as waiting their turn in an "add all", or (with none) says that it is over. */
  setWaiting(collectionId: string, paths: Iterable<string>): void;
  doneWaiting(collectionId: string, path: string): void;
  /** Where copies go and how much room is there now. Throws `storage_unavailable` when the location is not connected. */
  destination(): Promise<{ id: string; name: string; freeBytes: number | null }>;
  forget(collectionId: string): void;
}

/** "Main" has room for 12.0 MB more, in the words a person is shown when it has not. */
export function noRoomMessage(locationName: string, what: string, neededBytes: number, freeBytes: number): string {
  return `"${locationName}" does not have room for ${what}: ${formatBytes(neededBytes)} would be needed and ${formatBytes(freeBytes)} is free, of which Outpost keeps ${formatBytes(SPACE_RESERVE_BYTES)} clear. Free some space, or make another storage location the default, then try again.`;
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

  async function destination(): Promise<{ id: string; name: string; path: string; freeBytes: number | null }> {
    const location = documents.uploadLocation();
    const stats = await fs.promises.statfs(location.path).catch(() => undefined);
    return { id: location.id, name: location.name, path: location.path, freeBytes: stats ? stats.bavail * stats.bsize : null };
  }

  /** Copies under way, by collection and path, so that a second request for the same file joins the first. */
  const copying = new Map<string, Promise<SaveOutcome>>();
  /** Files waiting their turn in an "add all", by collection. */
  const waiting = new Map<string, Set<string>>();
  const keyOf = (collectionId: string, filePath: string) => `${collectionId}\n${filePath}`;

  async function copy(
    row: CollectionRow,
    file: ArchiveFile,
    title: string | undefined,
    outer: AbortSignal | undefined,
  ): Promise<SaveOutcome> {
    const source = sourceOfArchiveFile(row.title, file.path);
    const known = savedAs([source]).get(source);
    if (known) return { status: "already", document: documents.get(known) };

    // The copy is given up when the caller says so, or when the archive stops sending.
    const stall = new AbortController();
    let timer = setTimeout(() => stall.abort(), STALL_MS);
    const alive = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stall.abort(), STALL_MS);
    };
    const signal = outer ? AbortSignal.any([outer, stall.signal]) : stall.signal;
    const unread = () => new AppError("upstream", `"${file.name}" could not be read from this collection.`);

    let temp: string | undefined;
    let folder: string | undefined;
    try {
      const found = await followInsideBook(options.upstream, options.bookNameOf(row), file.path, { signal });
      if (!found) throw unread();
      const { response } = found;
      if (response.status === 404) {
        await response.body?.cancel();
        throw new AppError(
          "not_found",
          `"${file.name}" is not in this collection. The site it was copied from may have had it; the copy does not.`,
        );
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw unread();
      }
      if ((response.headers.get("content-type") ?? "").includes("text/html")) {
        await response.body.cancel();
        throw badRequest(`The collection has a page at that address, not a file the library can keep.`);
      }
      const limit = ctx.config.maxUploadBytes;
      const tooLarge = () => badRequest(`"${file.name}" is larger than this server accepts for one document.`);
      const declared = Number(response.headers.get("content-length"));
      const place = await destination();
      // Refused before a byte is written, when the archive says how large the file is.
      if (Number.isFinite(declared) && declared > 0) {
        if (declared > limit) {
          await response.body.cancel();
          throw tooLarge();
        }
        if (place.freeBytes !== null && place.freeBytes < declared + SPACE_RESERVE_BYTES) {
          await response.body.cancel();
          throw new AppError("insufficient_space", noRoomMessage(place.name, `"${file.name}"`, declared, place.freeBytes), {
            locationId: place.id,
            requiredBytes: declared,
            freeBytes: place.freeBytes,
            reserveBytes: SPACE_RESERVE_BYTES,
          });
        }
      }

      folder = path.join(place.path, SAVED_DIR);
      temp = path.join(folder, `${newId()}-${file.name}`);
      await fs.promises.mkdir(folder, { recursive: true });
      let seen = 0;
      await pipeline(
        Readable.fromWeb(response.body as never),
        async function* cap(chunks: AsyncIterable<Buffer>) {
          for await (const chunk of chunks) {
            alive();
            seen += chunk.length;
            if (seen > limit) throw tooLarge();
            yield chunk;
          }
        },
        fs.createWriteStream(temp),
        { signal },
      );
      clearTimeout(timer);
      const outcome = await documents.ingestFile({ sourcePath: temp, originalName: file.name, title, locationId: place.id, move: true });
      if (outcome.status === "duplicate") return outcome;
      const document = await documents.update(outcome.document.id, { source, description: `Saved from ${row.title}.` });
      return { status: "created", document };
    } catch (error) {
      if (outer?.aborted) throw new AppError("conflict", `Adding "${file.name}" was stopped before it finished. It can be added again.`);
      if (stall.signal.aborted) {
        throw new AppError("upstream", `"${file.name}" stopped arriving from this collection part of the way through. Try again.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      // Moved into the library when it was accepted; otherwise it is not wanted.
      if (temp) await fs.promises.rm(temp, { force: true });
      if (folder) await fs.promises.rmdir(folder).catch(() => undefined);
    }
  }

  function save(
    row: CollectionRow,
    file: ArchiveFile,
    title: string | undefined,
    saving: { signal?: AbortSignal } = {},
  ): Promise<SaveOutcome> {
    const key = keyOf(row.id, file.path);
    const before = copying.get(key);
    if (before) return before;
    const started = copy(row, file, title, saving.signal).finally(() => copying.delete(key));
    copying.set(key, started);
    return started;
  }

  // ── Sizes ──

  /** What each archive has said about the size of its files, by collection. A Map keeps the order archives were first asked in. */
  const held = new Map<string, { uuid: string | undefined; sizes: Map<string, number> }>();

  function sizesOf(row: CollectionRow): Map<string, number> {
    const uuid = options.uuidOf(row);
    const before = held.get(row.id);
    if (before && before.uuid === uuid) return before.sizes;
    const fresh = { uuid, sizes: new Map<string, number>() };
    held.set(row.id, fresh);
    return fresh.sizes;
  }

  /**
   * Asks the archive how large a file is without reading it. kiwix-serve answers HEAD
   * with the length; a server that does not is asked for the file and hung up on once
   * the length has arrived.
   */
  async function askSize(bookName: string, filePath: string): Promise<number | undefined> {
    for (const method of ["HEAD", "GET"]) {
      const found = await followInsideBook(options.upstream, bookName, filePath, {
        method,
        // Otherwise the length could be that of a compressed copy.
        headers: { "accept-encoding": "identity" },
        signal: AbortSignal.timeout(SIZE_TIMEOUT_MS),
      }).catch(() => undefined);
      if (!found) return undefined;
      const { response } = found;
      await response.body?.cancel().catch(() => undefined);
      const answered = response.status === 200;
      if (answered && (response.headers.get("content-type") ?? "").includes("text/html")) return undefined;
      const length = response.headers.get("content-length");
      const size = length === null || length === "" ? Number.NaN : Number(length);
      if (answered && Number.isSafeInteger(size) && size >= 0) return size;
      // A file that is not there has no size to ask for a second time.
      if (response.status === 404) return undefined;
    }
    return undefined;
  }

  async function sizes(row: CollectionRow, paths: string[], deadlineMs = 8_000): Promise<Map<string, number>> {
    const known = sizesOf(row);
    const found = new Map<string, number>();
    const wanted: Array<{ raw: string; path: string }> = [];
    for (const raw of new Set(paths)) {
      const size = known.get(raw);
      if (size !== undefined) {
        found.set(raw, size);
        continue;
      }
      try {
        wanted.push({ raw, path: parseArchivePath(raw).path });
      } catch {
        // Not a file the library keeps; its size is of no interest.
      }
    }
    if (wanted.length === 0) return found;
    const bookName = options.bookNameOf(row);
    const until = Date.now() + deadlineMs;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(SIZES_AT_ONCE, wanted.length) }, async () => {
        while (next < wanted.length && Date.now() < until) {
          const file = wanted[next++]!;
          const size = await askSize(bookName, file.path);
          if (size === undefined) continue;
          known.set(file.raw, size);
          found.set(file.raw, size);
        }
      }),
    );
    let total = 0;
    for (const entry of held.values()) total += entry.sizes.size;
    for (const [id, entry] of held) {
      if (total <= MAX_HELD_SIZES) break;
      if (id === row.id) continue;
      held.delete(id);
      total -= entry.sizes.size;
    }
    return found;
  }

  function turnOf(row: CollectionRow, filePath: string): ArchiveFileTurn | null {
    if (copying.has(keyOf(row.id, filePath))) return "now";
    return waiting.get(row.id)?.has(filePath) ? "waiting" : null;
  }

  const saveBody = z.object({ path: z.string().max(MAX_PATH * 3), title: z.string().trim().max(300).optional() });
  const checkBody = z.object({ paths: z.array(z.string().max(MAX_PATH * 3)).max(500) });

  app.post<{ Params: { collectionId: string } }>("/api/kiwix/books/:collectionId/files/save", async (request) => {
    const row = options.requireBook(request.params.collectionId);
    const input = saveBody.parse(request.body);
    return save(row, parseArchivePath(input.path), input.title || undefined);
  });

  // Which of these files are already documents in the library, or on their way into it.
  app.post<{ Params: { collectionId: string } }>("/api/kiwix/books/:collectionId/files/check", async (request) => {
    const row = options.requireBook(request.params.collectionId);
    const { paths } = checkBody.parse(request.body);
    const saved = savedDocuments(row, paths);
    return {
      files: paths.map((raw) => {
        const documentId = saved.get(raw);
        if (documentId) return { path: raw, state: "saved" as const, documentId };
        const turn = turnOf(row, raw);
        return turn ? { path: raw, state: "adding" as const, turn } : { path: raw, state: "new" as const };
      }),
    };
  });

  // How large these files are, so that a person can see what adding them will take. Changes nothing.
  app.post<{ Params: { collectionId: string } }>(
    "/api/kiwix/books/:collectionId/files/sizes",
    async (request): Promise<ArchiveFileSizes> => {
      const row = options.requireBook(request.params.collectionId);
      const { paths } = checkBody.parse(request.body);
      const found = await sizes(row, paths);
      return { files: paths.map((raw) => ({ path: raw, sizeBytes: found.get(raw) ?? null })) };
    },
  );

  return {
    savedDocuments,
    save,
    sizes,
    turnOf,
    setWaiting(collectionId, paths) {
      const set = new Set(paths);
      if (set.size === 0) waiting.delete(collectionId);
      else waiting.set(collectionId, set);
    },
    doneWaiting(collectionId, filePath) {
      waiting.get(collectionId)?.delete(filePath);
    },
    async destination() {
      const { id, name, freeBytes } = await destination();
      return { id, name, freeBytes };
    },
    forget(collectionId) {
      held.delete(collectionId);
      waiting.delete(collectionId);
    },
  };
}

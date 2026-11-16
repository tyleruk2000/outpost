/**
 * Reference collections that are a set of documents with a list, and not a web site.
 *
 * The list such an archive keeps is drawn by its own page with the help of browser
 * storage, which a page in Outpost's sandbox does not have (see nautilus.ts). So the
 * server reads the list out of the archive, and the reader shows it as a list of its
 * own: each document opens in Outpost's viewer and can be added to the library, the
 * same as a file a page links to.
 *
 * Nothing from the archive is run. Its page is looked at for two marks, its list is
 * read by a parser that accepts one shape, and every string in it is kept as text.
 * What is read is held in memory, for as long as the server runs: nothing is stored,
 * and nothing is asked of kiwix-serve again until the archive is opened after a restart.
 */
import {
  type ArchiveDocument,
  type ArchiveDocumentList,
  type ArchiveDocumentsResponse,
  type ArchiveFileKind,
  type ArchiveFileTurn,
  archiveFileKind,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import type { CollectionRow } from "../collections/service.ts";
import { followInsideBook } from "./files.ts";
import { DEFAULT_LITERAL_LIMITS, LiteralError } from "./literal.ts";
import { fold, isNautilusHome, NAUTILUS_DATABASE, type NautilusDocument, readNautilusDatabase, searchWords } from "./nautilus.ts";

/** A first page larger than this is not looked at; nautilus writes one of a few kilobytes. */
const MAX_HOME_BYTES = 2 * 1024 * 1024;
/** The list itself. The one archive measured holds 108 documents in 17.6 kB. */
const MAX_DATABASE_BYTES = DEFAULT_LITERAL_LIMITS.maxLength;
/**
 * How many documents are kept in memory across all lists: about 32 MB at the measured 0.64 kB
 * a document. Past that, the list used longest ago is let go, and read again when asked for.
 */
const MAX_HELD_DOCUMENTS = 50_000;

interface HeldDocument extends NautilusDocument {
  index: number;
  /** Ready for comparing with what was typed: the title; the title and author; and everything a document might be looked for by. */
  titleFolded: string;
  namedFolded: string;
  allFolded: string;
}

interface HeldList {
  home: string;
  documents: HeldDocument[];
  skipped: number;
  truncated: boolean;
}

type Reading =
  /** The archive lists documents. */
  | { kind: "list"; list: HeldList }
  /** An ordinary archive, made of pages. */
  | { kind: "none" }
  /** The archive has the page that draws a list, but the list could not be read. */
  | { kind: "unreadable"; problem: string }
  /** kiwix-serve gave no answer to go on (it is starting, or has not noticed the archive yet). Not remembered. */
  | { kind: "unknown" };

export interface ListedHit {
  entityId: string;
  title: string;
  description: string;
  /** In-app route that opens the document. */
  url: string;
}

/** A file of a listed document that the library can keep, with what the list says about it. */
export interface ListedFile {
  path: string;
  /** The title the document gets: the list's title when the document is this one file, otherwise left to the file. */
  title: string | undefined;
  /** What to call it when speaking of it: the document's title, with the file's name when there are several. */
  label: string;
}

export interface DocumentLists {
  /** Reads the archive's list in the background, so that search can find its documents without waiting. */
  warm(row: CollectionRow): void;
  forget(collectionId: string): void;
  /** Documents of an archive whose list has already been read that match these words. Never waits. */
  hits(row: CollectionRow, q: string, limit: number): ListedHit[];
  /**
   * The files of an archive's list that the library can keep, those of documents matching
   * `q` when words are given, in the list's order. Undefined when the archive has no list,
   * or it cannot be read now.
   */
  keepable(row: CollectionRow, q: string): Promise<ListedFile[] | undefined>;
}

export interface DocumentListsOptions {
  /** Asks kiwix-serve for a path, without following redirects. */
  upstream(pathAndQuery: string): Promise<Response>;
  requireBook(collectionId: string): CollectionRow;
  bookNameOf(row: CollectionRow): string;
  uuidOf(row: CollectionRow): string | undefined;
  /** Whether kiwix-serve can be asked for this book now. */
  isReady(row: CollectionRow): Promise<boolean>;
  savedDocuments(row: CollectionRow, paths: string[]): Map<string, string>;
  /** A file's place in the adding that is under way, if it has one. */
  turnOf(row: CollectionRow, path: string): ArchiveFileTurn | null;
  /** Files the last "add all" could not add, each with the reason. */
  problems(row: CollectionRow): Map<string, string>;
  readerUrl(collectionId: string, articlePath: string): string;
}

/** The text of a response, or undefined when there is more of it than `maxBytes`. */
async function readText(response: Response, maxBytes: number): Promise<string | undefined> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Whether a word starts somewhere in the text: "pur" finds "purification", "ation" does not. */
function hasWord(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]!)) return true;
  }
  return false;
}

/**
 * The documents that have every word, those with all of them in the title first, each
 * group in the archive's order. `everywhere` also looks in descriptions and file names.
 */
function matching(list: HeldList, q: string, everywhere: boolean): HeldDocument[] {
  const words = searchWords(q);
  if (words.length === 0) return list.documents;
  const inTitle: HeldDocument[] = [];
  const elsewhere: HeldDocument[] = [];
  for (const document of list.documents) {
    if (words.every((word) => hasWord(document.titleFolded, word))) inTitle.push(document);
    else if (words.every((word) => hasWord(everywhere ? document.allFolded : document.namedFolded, word))) elsewhere.push(document);
  }
  return [...inTitle, ...elsewhere];
}

const VIEWABLE: ReadonlySet<ArchiveFileKind> = new Set(["pdf", "epub", "audio", "video"]);
/** The kinds the reader offers to add to the library. */
const KEPT: ReadonlySet<ArchiveFileKind> = new Set(["pdf", "epub"]);

export function registerDocumentLists(app: FastifyInstance, ctx: AppContext, options: DocumentListsOptions): DocumentLists {
  const { log } = ctx;
  /** What has been learnt about each archive, by collection. The UUID tells a replaced archive from the one that was read. */
  const known = new Map<string, { uuid: string | undefined; reading: Exclude<Reading, { kind: "unknown" }> }>();
  const underWay = new Map<string, Promise<Reading>>();
  let closed = false;
  ctx.onClose.push(() => {
    closed = true;
  });

  async function load(row: CollectionRow): Promise<Reading> {
    const bookName = options.bookNameOf(row);
    const first = await followInsideBook(options.upstream, bookName, "");
    if (!first) return { kind: "unknown" };
    if (first.response.status !== 200) {
      await first.response.body?.cancel();
      return { kind: "unknown" };
    }
    if (!(first.response.headers.get("content-type") ?? "").includes("text/html")) {
      await first.response.body?.cancel();
      return { kind: "none" };
    }
    const html = await readText(first.response, MAX_HOME_BYTES);
    if (html === undefined || !isNautilusHome(html)) return { kind: "none" };

    // The page asks for its list by a relative address, so the list is in the page's own folder.
    const home = first.path;
    const folder = home.includes("/") ? home.slice(0, home.lastIndexOf("/") + 1) : "";
    const unreadable = (problem: string): Reading => ({ kind: "unreadable", problem });
    const data = await followInsideBook(options.upstream, bookName, `${folder}${NAUTILUS_DATABASE}`);
    if (!data) return { kind: "unknown" };
    const type = data.response.headers.get("content-type") ?? "";
    if (data.response.status === 404 || (data.response.status === 200 && type.includes("text/html"))) {
      await data.response.body?.cancel();
      return unreadable("This collection's page draws a list of documents from a file that is not where Outpost looks for it.");
    }
    if (data.response.status !== 200) {
      await data.response.body?.cancel();
      return { kind: "unknown" };
    }
    const source = await readText(data.response, MAX_DATABASE_BYTES);
    if (source === undefined) {
      return unreadable(
        `This collection's list of documents is larger than Outpost reads (${Math.round(MAX_DATABASE_BYTES / (1024 * 1024))} MB).`,
      );
    }
    try {
      const read = readNautilusDatabase(source);
      const documents = read.documents.map((document, index) => ({
        ...document,
        // Files sit under the same folder as the page that lists them.
        files: document.files.map((file) => ({ name: file.name, path: `${folder}${file.path}` })),
        index,
        titleFolded: fold(document.title),
        namedFolded: fold(`${document.title}\n${document.author}`),
        allFolded: fold([document.title, document.author, document.description, ...document.files.map((file) => file.name)].join("\n")),
      }));
      return { kind: "list", list: { home, documents, skipped: read.skipped, truncated: read.truncated } };
    } catch (error) {
      if (!(error instanceof LiteralError)) throw error;
      log.warn({ collection: row.id, at: error.at, reason: error.message }, "an archive's list of documents could not be read");
      return unreadable("This collection's list of documents is not written the way Outpost reads it.");
    }
  }

  function remember(row: CollectionRow, reading: Reading): void {
    if (reading.kind === "unknown") return;
    known.delete(row.id);
    known.set(row.id, { uuid: options.uuidOf(row), reading });
    const size = (entry: { reading: Reading }) => (entry.reading.kind === "list" ? entry.reading.list.documents.length : 0);
    let held = [...known.values()].reduce((sum, entry) => sum + size(entry), 0);
    // A Map keeps the order things were put in, so the first list met is the one used longest ago.
    for (const [id, entry] of known) {
      if (held <= MAX_HELD_DOCUMENTS) break;
      if (entry.reading.kind !== "list" || id === row.id) continue;
      known.delete(id);
      held -= size(entry);
    }
  }

  function recall(row: CollectionRow): Exclude<Reading, { kind: "unknown" }> | undefined {
    const entry = known.get(row.id);
    return entry && entry.uuid === options.uuidOf(row) ? entry.reading : undefined;
  }

  /** What is known about an archive, reading it if it has not been read. Two askers share one reading. */
  function read(row: CollectionRow): Promise<Reading> {
    const before = recall(row);
    if (before) {
      // Asked for again: it becomes the most recently used.
      known.delete(row.id);
      known.set(row.id, { uuid: options.uuidOf(row), reading: before });
      return Promise.resolve(before);
    }
    const running = underWay.get(row.id);
    if (running) return running;
    const started = load(row)
      .then((reading) => {
        if (!closed) remember(row, reading);
        return reading;
      })
      .finally(() => underWay.delete(row.id));
    underWay.set(row.id, started);
    return started;
  }

  function warm(row: CollectionRow, attempt = 0): void {
    if (closed) return;
    void options
      .isReady(row)
      .then((ready): Promise<Reading> | Reading => (ready ? read(row) : { kind: "unknown" }))
      .catch((): Reading => ({ kind: "unknown" }))
      .then((reading) => {
        // kiwix-serve needs a moment to start, and another to notice an archive that has just been added.
        if (reading.kind !== "unknown" || attempt >= 6 || closed) return;
        setTimeout(
          () => {
            if (closed) return;
            try {
              warm(options.requireBook(row.id), attempt + 1);
            } catch {
              // The collection was removed while this waited.
            }
          },
          2500 * (attempt + 1),
        ).unref();
      });
  }

  const query = z.object({
    q: z.string().max(200).optional(),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    limit: z.coerce.number().int().min(0).max(500).default(200),
  });

  app.get<{ Params: { collectionId: string } }>(
    "/api/kiwix/books/:collectionId/documents",
    async (request): Promise<ArchiveDocumentsResponse> => {
      const row = options.requireBook(request.params.collectionId);
      const { q, offset, limit } = query.parse(request.query);
      // While the book cannot be read at all, the reader already says why.
      if (!(await options.isReady(row))) return { list: null, problem: null };
      const reading = await read(row);
      if (reading.kind === "unreadable") return { list: null, problem: reading.problem };
      if (reading.kind !== "list") return { list: null, problem: null };

      const { list } = reading;
      const matched = matching(list, q ?? "", true);
      const page = matched.slice(offset, offset + limit);
      const saved = options.savedDocuments(
        row,
        page.flatMap((document) => document.files.map((file) => file.path)),
      );
      const problems = page.length > 0 ? options.problems(row) : new Map<string, string>();
      const documents: ArchiveDocument[] = page.map((document) => ({
        id: String(document.index),
        title: document.title,
        description: document.description,
        author: document.author,
        files: document.files.map((file) => {
          const documentId = saved.get(file.path) ?? null;
          return {
            name: file.name,
            path: file.path,
            kind: archiveFileKind(file.path),
            documentId,
            adding: documentId ? null : options.turnOf(row, file.path),
            problem: documentId ? null : (problems.get(file.path) ?? null),
          };
        }),
      }));
      const answer: ArchiveDocumentList = {
        home: list.home,
        total: list.documents.length,
        matched: matched.length,
        offset,
        documents,
        skipped: list.skipped,
        truncated: list.truncated,
      };
      return { list: answer, problem: null };
    },
  );

  return {
    warm: (row) => warm(row),
    forget(collectionId) {
      known.delete(collectionId);
    },
    async keepable(row, q) {
      if (!(await options.isReady(row))) return undefined;
      const reading = await read(row);
      if (reading.kind !== "list") return undefined;
      const files: ListedFile[] = [];
      const seen = new Set<string>();
      for (const document of matching(reading.list, q, true)) {
        const alone = document.files.length === 1;
        for (const file of document.files) {
          if (!KEPT.has(archiveFileKind(file.path)) || seen.has(file.path)) continue;
          seen.add(file.path);
          files.push({ path: file.path, title: alone ? document.title : undefined, label: alone ? document.title : `${document.title}: ${file.name}` });
        }
      }
      return files;
    },
    hits(row, q, limit) {
      const reading = recall(row);
      if (reading?.kind !== "list" || searchWords(q).length === 0) return [];
      const base = options.readerUrl(row.id, reading.list.home);
      return matching(reading.list, q, false)
        .slice(0, limit)
        .map((document) => {
          const only = document.files.length === 1 ? document.files[0]! : undefined;
          return {
            entityId: `${row.id}:document:${document.index}`,
            title: document.title,
            description: document.description,
            // One file the reader can show opens straight away; anything else opens the list at this document.
            url:
              only && VIEWABLE.has(archiveFileKind(only.path))
                ? `${base}?file=${encodeURIComponent(only.path)}`
                : `${base}?q=${encodeURIComponent(document.title)}`,
          };
        });
    },
  };
}

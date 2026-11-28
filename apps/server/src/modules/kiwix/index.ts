/**
 * Reference collections: ZIM archives (Wikipedia and the rest of the Kiwix library)
 * read through kiwix-serve.
 *
 * Outpost keeps kiwix-serve's library file in step with the installed collections,
 * learns each archive's details from the archive itself, searches inside them, and
 * serves their pages to the browser through a proxy.
 *
 * The proxy is the security boundary. A ZIM archive is a copy of someone else's web
 * site, scripts included. Served from Outpost's own origin those scripts could call
 * Outpost's API, and change or delete the library, without anyone meaning them to. So
 * every proxied response carries a Content Security Policy `sandbox` without
 * `allow-same-origin`: the page runs in an origin of its own, cannot read Outpost's
 * responses or make changing requests that Outpost accepts, and cannot load anything
 * from the internet.
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { XMLParser } from "fast-xml-parser";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { randomToken } from "../../core/ids.ts";
import type { CollectionRow } from "../collections/service.ts";
import { titleWords } from "../search/query.ts";
import { gatherParts, referenceBudgets, type SearchResult, type SearchSource } from "../search/service.ts";
import { type ArchiveAdding, registerArchiveAdding } from "./add-files.ts";
import { type DocumentLists, registerDocumentLists } from "./document-lists.ts";
import { type ArchiveFilesService, registerArchiveFiles } from "./files.ts";
import { isJunkHit } from "./junk.ts";
import { bookNameOf, decodeEntities, type LibraryBook, readZimUuid, writeLibrary } from "./library.ts";
import { type ArchiveProfile, createRouteMemory, routeArchives, routeWords, TITLE_ANSWER_PRIOR } from "./routing.ts";
import { createSearchHealth, type SearchMark } from "./search-health.ts";
import { type Asked, createPlaces, createSearchQueue } from "./search-queue.ts";
import { createKiwixConnection, type KiwixConnection } from "./server.ts";

interface KiwixMeta {
  name?: string;
  language?: string;
  creator?: string;
  publisher?: string;
  date?: string;
  tags?: string;
  mediaCount?: number;
  /** Details were read from the archive itself. */
  enriched?: boolean;
  /** Set when it can be searched by its titles only (search-health.ts). */
  search?: SearchMark;
}

export interface BookDto {
  collectionId: string;
  bookName: string;
  title: string;
  description: string | null;
  language: string | null;
  articleCount: number | null;
  sizeBytes: number;
  /** Address of the book's pages, ending in "/". Append an article path. */
  contentBase: string;
  /**
   * The same pages at the address the reader frames them at: under this installation's
   * secret word, where a page may read its own archive's files. For the frame alone.
   */
  frameBase: string;
  iconUrl: string | null;
  /** False while kiwix-serve cannot serve it (drive disconnected, server down, still loading). */
  ready: boolean;
}

export interface KiwixService {
  connection: KiwixConnection;
  /** Rewrites the library file from the installed collections. */
  sync(): Promise<void>;
  books(token: string): Promise<BookDto[]>;
  /** Searches of archives at kiwix-serve now, and searches waiting their turn. */
  searchLoad(): { running: number; waiting: number };
  /** The English Wikipedia copies, for other modules to look an article up in (Satellites: About this satellite). */
  wikipedia: WikipediaArchives;
}

export interface WikipediaArchiveRef {
  collectionId: string;
  title: string;
  /** The archive's own date ("2026-10-18"), or null. */
  date: string | null;
}

export interface WikipediaArchives {
  /** The English Wikipedia copies (WikiMed and partial ones included) that can be read now, largest first. */
  list(): WikipediaArchiveRef[];
  /** Titles holding these words, best first (kiwix-serve's suggestions). */
  suggest(collectionId: string, term: string, count: number): Promise<Array<{ title: string; path: string }>>;
  /** An article's HTML and the path it ended at after any redirect, or null. */
  article(collectionId: string, articlePath: string): Promise<{ html: string; path: string } | null>;
  /** Where the reader opens an article. */
  readerUrl(collectionId: string, articlePath: string): string;
}

declare module "../../core/context.ts" {
  interface Services {
    kiwix: KiwixService;
  }
}

/** What a proxied page may do: run its own scripts, in an origin of its own. */
const SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

/**
 * A small script added to every archive page, so that the reader around it knows which
 * page is on show and what was pressed, which pages of the same archive it links to
 * (for learning progress: "3 of 5 done in Fractions"), and when a video on it has played
 * to the end. It only ever sends messages up to the reader, never takes any, and the
 * page's sandbox is the same with it as without. It is placed before the archive's own scripts
 * and keeps its own reference to how a link's address is read: books made from web
 * sites carry a script that makes every link report the address it had on the live
 * site, which would make files inside the archive look as if they were on the internet.
 *
 * It begins by giving the page stand-ins for three things a browser refuses a page in a
 * sandbox outright, by throwing: `document.cookie`, `localStorage` and `sessionStorage`.
 * Ordinary web-app code touches them in passing (a request library looks for a cookie
 * before every request) and a page that is a small web app stopped there: "Failed to
 * load channel data". The stand-ins hold nothing but what the page itself puts in them,
 * for as long as the page is open, and give it no access to anything.
 */
const BRIDGE = `<script>(function(){try{try{Object.defineProperty(document,"cookie",{configurable:true,get:function(){return""},set:function(){}})}catch(e){}var M=function(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}};["localStorage","sessionStorage"].forEach(function(n){try{window[n]}catch(e){try{Object.defineProperty(window,n,{configurable:true,value:M()})}catch(x){}}})}catch(e){}try{var G=Element.prototype.getAttribute,P=function(m){parent.postMessage(m,"*")};var F=/\\.(pdf|epub)$/i,X=/\\.(pdf|epub|txt|md|markdown)$/i;var R=function(a){var h=G.call(a,"href");if(h==null)return null;try{var u=new URL(h,location.href);return u.protocol==="http:"||u.protocol==="https:"?u:null}catch(x){return null}};var T=function(a){return(a.textContent||"").replace(/\\s+/g," ").trim().slice(0,200)};var s=function(){P({type:"outpost:reader",path:location.pathname,hash:location.hash,title:document.title})};var l=function(){try{var o=[],n={},a=document.querySelectorAll("a[href]");for(var i=0;i<a.length&&o.length<300;i++){var u=R(a[i]);if(!u)continue;var w=u.host===location.host;if(!(w?F:X).test(u.pathname))continue;u.hash="";var k=w?u.pathname:u.href;if(n[k])continue;n[k]=1;o.push({href:k,inside:w,text:T(a[i])})}P({type:"outpost:links",path:location.pathname,links:o});var q=[],m={},Y=/\\.(css|js|mjs|json|png|jpe?g|gif|svg|webp|avif|ico|bmp|mp4|webm|ogv|ogg|mp3|wav|m4a|vtt|srt|woff2?|ttf|otf|zip|pdf|epub|txt|md|markdown)$/i;for(var j=0;j<a.length&&q.length<600;j++){var v=R(a[j]);if(!v||v.host!==location.host||v.pathname===location.pathname||Y.test(v.pathname)||m[v.pathname])continue;m[v.pathname]=1;q.push(v.pathname)}P({type:"outpost:pages",path:location.pathname,links:q})}catch(e){}};s();addEventListener("DOMContentLoaded",function(){s();l()});addEventListener("hashchange",s);addEventListener("ended",function(e){var t=e.target;if(!t||t.tagName!=="VIDEO")return;var d=t.duration,p=0;try{for(var i=0;i<t.played.length;i++)p+=t.played.end(i)-t.played.start(i)}catch(x){}P({type:"outpost:ended",path:location.pathname,played:d>0?p/d:0})},true);addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var u=R(a);if(!u)return;if(u.host!==location.host){e.preventDefault();P({type:"outpost:external",href:u.href})}else if(F.test(u.pathname)){e.preventDefault();P({type:"outpost:file",path:u.pathname,text:T(a)})}},true)}catch(e){}})();</script>`;

/**
 * The address archive pages are framed at, which only this Outpost's own screens can learn.
 *
 * A proxied page runs in a sandbox with an origin of its own, so to the browser its own
 * scripts loaded as modules, its fonts and its fetches of its own data are requests from
 * another origin ("Origin: null"), and the answers are kept from the page unless the server
 * says it may have them. Archives whose pages are a small web app (most video collections)
 * showed nothing at all for that reason. Saying so at the plain address would let any page
 * on any site, through a sandboxed frame of its own, read what this library holds: the
 * address is the same on every Outpost and archive names are public. A sandboxed page does
 * not tell the server where a request came from either (browsers send no Referer from one),
 * so there is nothing in the request to tell an archive's own page from a stranger's.
 *
 * So the reader frames archive pages under a second first segment, a long random word made
 * once for this installation and kept in the data folder. The page's own relative addresses
 * carry it without knowing it; the API hands it only to Outpost's own screens, whose answers
 * another site cannot read; and only requests under it are told they may be read.
 */
export function readerSecret(dataDir: string): string {
  const file = path.join(dataDir, "reader-token");
  try {
    const kept = fs.readFileSync(file, "utf8").trim();
    if (/^[A-Za-z0-9_-]{32,}$/.test(kept)) return kept;
  } catch {
    // Not made yet.
  }
  const made = randomToken(24);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, `${made}\n`, { mode: 0o600 });
  } catch {
    // A folder that cannot be written to still gets a word, for as long as this process runs.
  }
  return made;
}

const MAX_HTML_BYTES = 32 * 1024 * 1024;
/**
 * The fixed first segment of reference-content addresses, kept so that links people have
 * saved go on working and Outpost's own viewer can read a file. Pages are framed under
 * the installation's secret instead (`readerSecret`).
 */
const CONTENT_TOKEN = "open";
/** Only a book's pages and its icon are reachable; search and the rest of kiwix-serve are not. */
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** What a page of a reference collection says while the collection's storage location is not connected. Self-contained. */
export function awayPage(title: string, where: string): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}: not connected</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem 1rem;color:#1d2a2e;background:#f7f9f9}main{max-width:36rem;margin:0 auto}h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:0 0 .75rem}@media (prefers-color-scheme:dark){body{color:#e4ecec;background:#141c1e}}</style></head><body><main><h1>“${escapeHtml(where)}” is not connected</h1><p>${escapeHtml(title)} is kept on “${escapeHtml(where)}”, which Outpost cannot reach just now. Nothing has been lost: the page opens again here as soon as the drive or share is back.</p><p>If it is a network share, check that its server is switched on and on the same network. Storage in Outpost says which locations are connected.</p></main></body></html>`;
}

const isAllowedPath = (rest: string) => rest.startsWith("content/") || /^raw\/[^/]+\/meta\/Illustration_48x48@1$/.test(rest);
const passThroughHeaders = ["content-type", "etag", "last-modified", "content-range", "accept-ranges"];

/** The numbers that decide how archives are searched. Tests shorten them; nothing else changes them. */
export const referenceTimings = {
  /**
   * How many searches Outpost has at kiwix-serve at once: one fewer than the four requests
   * kiwix-serve works on at a time, so that someone reading an article is not kept waiting
   * behind a search. Sending more does not make it search more; they wait inside it.
   */
  atOnce: 3,
  /**
   * How long a search waits for one archive once that archive's search has begun. On the
   * network share this was measured on, under heavy load, seven archives in eight answered
   * a first search within 7.3 seconds; on a quiet machine they take about one.
   */
  archiveLimitMs: 8_000,
  /** How long a search may go on at kiwix-serve before Outpost stops waiting for it to end. */
  archiveCeilingMs: 20_000,
  /**
   * How long a search of an archive's titles is waited for. kiwix-serve answers one from
   * its title index without reading any article: well under a second, even on a Pi.
   */
  titleLimitMs: 3_000,
  /**
   * How many searches, full text and titles together, are at kiwix-serve at once: the four
   * requests it works on. Title searches take any of them the full-text searches leave
   * free (`atOnce` at most), and a place given back goes to a title search first: they
   * take a tenth of a second on a Raspberry Pi, and one at a time a widened search of
   * thirty archives waited three to six seconds for its titles alone.
   */
  placesAtOnce: 4,
};

/** How a search of reference collections is shaped (routing.ts chooses which archives come first). */
export const referenceShape = {
  /** Results asked of each archive searched first: enough for one ranked list across them. */
  firstEach: 8,
  /** Titles asked of each archive's title search. */
  titles: 5,
  /** With fewer good results than this from the first archives, the rest are searched too. */
  enoughGood: 3,
};

/** A result this good (on the one scale, score.ts) counts as a good one: most of the question, much of it in the title. */
export const GOOD_SCORE = 0.6;

/**
 * How many results to ask each archive for. Every result costs kiwix-serve a read of
 * that article (about half a second each from a cold network share, as measured), so this is no more
 * than is shown: enough to make about twenty in all, at least three and at most ten.
 */
export const resultsFromEach = (archives: number) => Math.min(10, Math.max(3, Math.ceil(20 / Math.max(archives, 1))));

/** kiwix-serve refused a search (an answer in the 400s): this archive cannot be searched that way. */
class Refused extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`kiwix-serve answered ${status}`);
    this.status = status;
    this.body = body;
  }
}

const zimOf = (row: CollectionRow) => row.meta.zim;
const kiwixOf = (row: CollectionRow) => (row.meta.kiwix ?? {}) as KiwixMeta;

export async function registerKiwix(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const secret = readerSecret(ctx.config.dataDir);
  const { config, log } = ctx;
  const { collections, storage, search, settings } = ctx.services;
  const connection = createKiwixConnection({ url: config.kiwix.url, bin: config.kiwix.bin, libraryPath: config.kiwix.libraryPath, log });
  ctx.onClose.push(() => connection.close());
  // Descriptions carry <b> around matched words; keep them raw so the matches survive.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    processEntities: true,
    htmlEntities: true,
    stopNodes: ["*.description"],
  });

  const zimCollections = () => collections.list({ kind: "zim" });
  const servable = (row: CollectionRow) => row.status === "installed" && storage.isAvailable(row.locationId) && Boolean(zimOf(row)?.uuid);

  /** Makes sure a collection has the two things the library file needs: UUID and book name. */
  async function identify(row: CollectionRow): Promise<CollectionRow> {
    // Once details have been read from the archive, its identity is settled.
    if (kiwixOf(row).enriched && zimOf(row)?.uuid && zimOf(row)?.bookName) return row;
    if (!storage.isAvailable(row.locationId)) return row;
    const file = collections.absolutePath(row.id);
    const uuid = await readZimUuid(file);
    if (!uuid) {
      log.warn({ collection: row.id, file }, "installed ZIM collection is not a ZIM archive");
      return row;
    }
    const bookName = bookNameOf(file);
    // The archive's own header is the authority, whatever a catalogue said about it.
    if (zimOf(row)?.uuid === uuid && zimOf(row)?.bookName === bookName) return row;
    return collections.update(row.id, { meta: { ...row.meta, zim: { ...zimOf(row), uuid, bookName } } });
  }

  function toLibraryBook(row: CollectionRow): LibraryBook {
    const zim = zimOf(row)!;
    const extra = kiwixOf(row);
    return {
      id: zim.uuid,
      path: collections.absolutePath(row.id),
      title: row.title,
      description: row.description ?? undefined,
      // A language is required for search to run; "eng" is the honest default for the
      // catalogue's English entries until the archive's own value has been read.
      language: extra.language ?? (row.language === "en" || !row.language ? "eng" : row.language),
      creator: extra.creator,
      publisher: extra.publisher ?? row.publisher ?? undefined,
      name: extra.name,
      flavour: zim.flavour,
      date: extra.date,
      tags: extra.tags,
      articleCount: zim.articleCount,
      mediaCount: extra.mediaCount,
      sizeKib: Math.round(row.sizeBytes / 1024),
    };
  }

  let syncing: Promise<void> = Promise.resolve();
  function sync(): Promise<void> {
    // One writer at a time; each run sees the latest state.
    syncing = syncing
      .then(async () => {
        const rows: CollectionRow[] = [];
        for (const row of zimCollections()) rows.push(await identify(row));
        const changed = await writeLibrary(config.kiwix.libraryPath, rows.filter(servable).map(toLibraryBook));
        if (changed) {
          log.info({ books: rows.filter(servable).length }, "kiwix library updated");
          ctx.events.publish({ type: "collections.changed" });
        }
      })
      .catch((error) => log.error({ err: error }, "kiwix library sync failed"));
    return syncing;
  }
  // A rewrite begun just before the server stops (a location going away) is let finish, not left to write afterwards.
  ctx.onClose.push(() => syncing);

  async function upstream(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
    const base = connection.baseUrl();
    if (!base) throw new AppError("upstream", connection.problem() ?? "Reference collections are not available.");
    try {
      return await fetch(`${base}/${pathAndQuery}`, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...init });
    } catch {
      throw new AppError("upstream", connection.problem() ?? "The Kiwix server is not answering.");
    }
  }

  /** Reads one metadata value from an archive through kiwix-serve. */
  async function readMeta(bookName: string, key: string): Promise<string | undefined> {
    const response = await upstream(`raw/${encodeURIComponent(bookName)}/meta/${key}`).catch(() => undefined);
    if (!response?.ok || response.headers.get("content-type")?.includes("text/html")) {
      await response?.body?.cancel();
      return undefined;
    }
    return (await response.text()).trim() || undefined;
  }

  /**
   * Fills in a book's details from the archive. kiwix-serve needs a moment to notice a
   * changed library file, so this is tried a few times before giving up until next start.
   */
  let closed = false;
  ctx.onClose.push(() => {
    closed = true;
  });
  function enrich(collectionId: string, attempt = 0): Promise<void> {
    // Runs in the background, possibly after a retry delay; it must never outlive the
    // server or surface as an unhandled failure.
    if (closed) return Promise.resolve();
    return readDetails(collectionId, attempt).catch((error) => {
      if (!closed) log.warn({ err: error, collection: collectionId }, "could not read details from a ZIM archive");
    });
  }
  async function readDetails(collectionId: string, attempt: number): Promise<void> {
    const row = collections.get(collectionId);
    const zim = row && zimOf(row);
    if (!row || !zim?.bookName || kiwixOf(row).enriched || !servable(row)) return;
    const title = (await connection.isUp()) ? await readMeta(zim.bookName, "Title") : undefined;
    if (!title) {
      if (attempt < 6) setTimeout(() => void enrich(collectionId, attempt + 1), 2500 * (attempt + 1)).unref();
      return;
    }
    const [description, language, name, flavour, date, creator, publisher, counter, tags] = await Promise.all(
      ["Description", "Language", "Name", "Flavour", "Date", "Creator", "Publisher", "Counter", "Tags"].map((key) =>
        readMeta(zim.bookName, key),
      ),
    );
    // Counter looks like "image/png=3;text/html=599;…".
    const counts = new Map((counter ?? "").split(";").map((part) => part.split("=") as [string, string]));
    const articles = Number(counts.get("text/html")) || undefined;
    const media = [...counts]
      .filter(([type]) => type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/"))
      .reduce((sum, [, n]) => sum + (Number(n) || 0), 0);
    if (closed) return;
    const fresh = collections.get(collectionId);
    if (!fresh) return;
    collections.update(collectionId, {
      // Catalogue wording, where there is some, was chosen by a person; keep it.
      title: fresh.catalogEntryId ? fresh.title : title,
      description: fresh.description ?? description ?? null,
      publisher: fresh.publisher ?? publisher ?? null,
      version: fresh.version ?? date ?? null,
      meta: {
        ...fresh.meta,
        zim: { ...zimOf(fresh)!, articleCount: articles ?? zimOf(fresh)!.articleCount, flavour: flavour ?? zimOf(fresh)!.flavour },
        kiwix: { name, language, creator, publisher, date, tags, mediaCount: media || undefined, enriched: true } satisfies KiwixMeta,
      },
    });
    await sync();
  }

  // Set further down, once the routes they need exist; nothing is installed or removed before then.
  let lists: DocumentLists | undefined;
  let files: ArchiveFilesService | undefined;
  let adding: ArchiveAdding | undefined;
  collections.onInstalled(async (row) => {
    if (row.kind !== "zim") return;
    await sync();
    void enrich(row.id);
    const fresh = collections.get(row.id);
    if (fresh) lists?.warm(fresh);
  });
  collections.onRemoved(async (row) => {
    // Runs before the file is deleted, so kiwix-serve lets go of it first.
    if (row.kind !== "zim") return;
    // Documents already added from it are the library's own and stay; only the adding stops.
    adding?.cancel(row.id);
    files?.forget(row.id);
    lists?.forget(row.id);
    const remaining = zimCollections().filter((other) => other.id !== row.id && servable(other));
    await writeLibrary(config.kiwix.libraryPath, remaining.map(toLibraryBook));
  });
  collections.onMoved(async (row) => {
    if (row.kind === "zim") await sync();
  });
  const stopListening = ctx.events.subscribe((event) => {
    if (event.type === "storage.changed") void sync();
  });
  ctx.onClose.push(stopListening);

  // The library file must exist before kiwix-serve starts, even when it is empty.
  await sync();
  for (const row of zimCollections()) if (!kiwixOf(row).enriched) void enrich(row.id);

  function bookDto(row: CollectionRow, token: string, up: boolean): BookDto | undefined {
    const zim = zimOf(row);
    if (!zim?.bookName) return undefined;
    return {
      collectionId: row.id,
      bookName: zim.bookName,
      title: row.title,
      description: row.description,
      language: kiwixOf(row).language ?? row.language,
      articleCount: zim.articleCount ?? null,
      sizeBytes: row.sizeBytes,
      contentBase: `/kiwix/${token}/content/${encodeURIComponent(zim.bookName)}/`,
      frameBase: `/kiwix/${secret}/content/${encodeURIComponent(zim.bookName)}/`,
      iconUrl: `/kiwix/${token}/raw/${encodeURIComponent(zim.bookName)}/meta/Illustration_48x48@1`,
      ready: up && servable(row),
    };
  }

  const service: KiwixService = {
    connection,
    sync,
    async books(token) {
      const up = await connection.isUp();
      return zimCollections()
        .map((row) => bookDto(row, token, up))
        .filter((book): book is BookDto => Boolean(book));
    },
    searchLoad: () => queue.load(),
    wikipedia: {
      list() {
        return zimCollections()
          .filter(servable)
          .filter((row) => {
            const extra = kiwixOf(row);
            const language = extra.language ?? row.language ?? "";
            const named = `${zimOf(row)?.bookName ?? ""} ${extra.name ?? ""} ${row.title}`;
            return /^(en|eng)\b/i.test(language || "en") && /wikipedia|wikimed/i.test(named);
          })
          .sort((a, b) => (zimOf(b)?.articleCount ?? 0) - (zimOf(a)?.articleCount ?? 0))
          .map((row) => ({ collectionId: row.id, title: row.title, date: kiwixOf(row).date ?? null }));
      },
      async suggest(collectionId, term, count) {
        const row = collections.get(collectionId);
        if (!row || !servable(row)) return [];
        return (await suggestBook(row, term, count)).map((hit) => ({ title: hit.title, path: hit.path }));
      },
      async article(collectionId, articlePath) {
        const row = collections.get(collectionId);
        const bookName = row && servable(row) ? zimOf(row)?.bookName : undefined;
        if (!bookName) return null;
        const prefix = `/content/${encodeURIComponent(bookName)}/`;
        const encoded = articlePath.split("/").map(encodeURIComponent).join("/");
        const response = await upstream(`content/${encodeURIComponent(bookName)}/${encoded}`, { redirect: "follow" });
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
          await response.body?.cancel();
          return null;
        }
        const html = await response.text();
        if (html.length > 4 * 1024 * 1024) return null;
        const ended = response.url ? new URL(response.url).pathname : "";
        const finalPath = ended.startsWith(prefix)
          ? ended
              .slice(prefix.length)
              .split("/")
              .map((part) => decodeURIComponent(part))
              .join("/")
          : articlePath;
        return { html, path: finalPath };
      },
      readerUrl: (collectionId, articlePath) => readerUrl(collectionId, articlePath),
    },
  };
  ctx.services.kiwix = service;

  // ── Searching inside books ──
  interface Hit {
    title: string;
    path: string;
    snippet: string;
    segments: Array<{ text: string; hit: boolean }>;
  }

  /** Turns kiwix-serve's `…words <b>match</b> words…` into plain segments, never HTML. */
  function snippetSegments(raw: string): Hit["segments"] {
    const segments: Hit["segments"] = [];
    let hit = false;
    for (const part of raw.split(/(<\/?b>)/i)) {
      if (/^<b>$/i.test(part)) hit = true;
      else if (/^<\/b>$/i.test(part)) hit = false;
      else {
        const text = decodeEntities(part.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ");
        if (text) segments.push({ text, hit });
      }
    }
    return segments;
  }

  async function searchBook(
    row: CollectionRow,
    q: string,
    start: number,
    limit: number,
    signal?: AbortSignal,
    /** Throw when kiwix-serve refuses, so that the caller can say the archive was not searched. */
    strict = false,
  ): Promise<{ total: number; hits: Hit[] }> {
    const zim = zimOf(row)!;
    const query = new URLSearchParams({
      "books.id": zim.uuid,
      pattern: q,
      start: String(start),
      pageLength: String(Math.min(limit, 100)),
      format: "xml",
    });
    const response = await upstream(`search?${query}`, { signal: signal ?? AbortSignal.timeout(8000) });
    const body = await response.text();
    if (!response.ok) {
      if (strict && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        throw new Refused(response.status, body);
      }
      if (strict) throw new Error(`kiwix-serve answered ${response.status}`);
      return { total: 0, hits: [] };
    }
    const channel = parser.parse(body)?.rss?.channel;
    if (!channel) return { total: 0, hits: [] };
    const items = channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
    const prefix = `/content/${zim.bookName}/`;
    const hits: Hit[] = [];
    for (const item of items) {
      const link = decodeEntities(String(item.link ?? ""));
      const at = link.indexOf(prefix);
      if (at === -1) continue;
      const segments = snippetSegments(typeof item.description === "string" ? item.description : "");
      hits.push({
        title: decodeEntities(String(item.title ?? "")),
        path: link.slice(at + prefix.length),
        snippet: segments
          .map((segment) => segment.text)
          .join("")
          .trim(),
        segments,
      });
    }
    return { total: Number(channel["opensearch:totalResults"]) || hits.length, hits };
  }

  /** Two answers of one archive as one: their articles taken in turn without repeats. */
  function mergeHits(lists: Hit[][], each: number): Hit[] {
    const seen = new Set<string>();
    const hits: Hit[] = [];
    for (let rank = 0; hits.length < each && lists.some((list) => rank < list.length); rank += 1) {
      for (const list of lists) {
        const hit = list[rank];
        if (hit && !seen.has(hit.path) && hits.length < each) {
          seen.add(hit.path);
          hits.push(hit);
        }
      }
    }
    return hits;
  }

  /** kiwix-serve's title search: the titles holding these words, best first. Fast: it reads no article. */
  async function suggestBook(row: CollectionRow, term: string, count: number, signal?: AbortSignal): Promise<Hit[]> {
    const query = new URLSearchParams({ content: zimOf(row)!.bookName, term, count: String(count) });
    const response = await upstream(`suggest?${query}`, { signal: signal ?? AbortSignal.timeout(4000) });
    if (!response.ok) {
      await response.body?.cancel();
      return [];
    }
    const raw = (await response.json().catch(() => [])) as Array<{ value?: string; kind?: string; path?: string }>;
    return raw
      .filter((item) => item.kind === "path" && item.path && item.value)
      .map((item) => {
        const title = decodeEntities(item.value!);
        return { title, path: decodeEntities(item.path!), snippet: "", segments: [] };
      });
  }

  const readerUrl = (collectionId: string, articlePath: string) =>
    `/library/read/${collectionId}/${articlePath.split("/").map(encodeURIComponent).join("/")}`;

  /** One archive's answer to a search of its full text, as the queue keeps it. */
  type BookAnswer = { refused: false; total: number; hits: Hit[] } | { refused: true; status: number; body: string };
  // Titles join the shared places first, so that a place given back goes to a title search before the full text.
  const places = createPlaces(referenceTimings.placesAtOnce);
  const titleQueue = createSearchQueue<Hit[]>({
    concurrency: referenceTimings.placesAtOnce,
    places,
    limitMs: referenceTimings.titleLimitMs,
    ceilingMs: referenceTimings.archiveCeilingMs,
    remember: 600,
    rememberMs: 5 * 60_000,
  });
  ctx.onClose.push(() => titleQueue.close());
  const queue = createSearchQueue<BookAnswer>({
    concurrency: referenceTimings.atOnce,
    places,
    limitMs: referenceTimings.archiveLimitMs,
    ceilingMs: referenceTimings.archiveCeilingMs,
    remember: 600,
    rememberMs: 5 * 60_000,
  });
  ctx.onClose.push(() => queue.close());

  // Which archives answered well for which words lately, and which cannot be searched by their full text.
  const memory = createRouteMemory();
  const health = createSearchHealth({
    read: (id) => {
      const row = collections.get(id);
      return row ? kiwixOf(row).search : undefined;
    },
    write: (id, mark) => {
      const row = collections.get(id);
      if (!row) return;
      const { search: _gone, ...rest } = kiwixOf(row);
      collections.update(id, { meta: { ...row.meta, kiwix: mark ? { ...rest, search: mark } : rest } });
      if (mark) log.info({ collection: row.title, mark: mark.fullText }, "reference collection searched by its titles only from now");
    },
  });

  const profileOf = (row: CollectionRow): ArchiveProfile => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: kiwixOf(row).tags,
    language: kiwixOf(row).language ?? row.language,
    sizeBytes: row.sizeBytes,
  });

  const source: SearchSource = {
    id: "reference",
    layer: "reference",
    isAvailable: () => Boolean(connection.baseUrl()) && zimCollections().some(servable),
    weight: () => settings.get("search.hybrid.keywordWeight"),
    async search({ q, signal }) {
      const { results, outcome } = await gatherParts(source, { q, signal, budgetMs: referenceBudgets.onePartMs });
      if (outcome.message) throw new Error(outcome.message);
      return results;
    },
    async searchInParts({ q, alternate, parsed, scope = "routed", rank, signal, budgetMs, onStart, onWiden, onPart, widen = true }) {
      if (!(await connection.isUp())) {
        onStart?.(0, 0);
        return {
          collections: 0,
          searched: 0,
          missing: [],
          message: connection.problem() ?? "Reference collections are not answering, so their articles are missing from these results.",
          more: 0,
        };
      }
      const books = zimCollections().filter(servable);
      const words = parsed ?? { required: q.split(/\s+/).filter(Boolean), excluded: [], prefixLast: false };
      const route = routeWords(words);
      const titleTerm = titleWords(words).join(" ");
      // A book that is a list of documents has no articles to search; its documents are found by their titles, at no cost.
      const listedOf = new Map(books.map((row) => [row.id, lists?.hits(row, q, referenceShape.firstEach) ?? []]));
      const always = new Set([...listedOf].filter(([, hits]) => hits.length > 0).map(([id]) => id));
      const plan = routeArchives(books.map(profileOf), route, { memory, always, first: scope === "all" ? books.length : undefined });
      const byId = new Map(books.map((row) => [row.id, row]));
      const first = plan.first.map((profile) => byId.get(profile.id)!);
      const rest = plan.rest.map((profile) => byId.get(profile.id)!);
      onStart?.(first.length, rest.length);

      const budget = AbortSignal.timeout(budgetMs);
      const waiting = signal ? AbortSignal.any([signal, budget]) : budget;
      const missing: Array<{ collectionId: string; title: string; reason: "slow" | "failed" }> = [];
      let searched = 0;
      let good = 0;
      // A title that is the answer counts as one only where the collection fits the question (routing.ts).
      const fits = (row: CollectionRow) => (plan.priors.get(row.id)?.prior ?? 0) >= TITLE_ANSWER_PRIOR;
      const ranked = (row: CollectionRow, results: SearchResult[]) => (rank ? rank(results, { titleAnswers: fits(row) }) : results);

      const toResult = (row: CollectionRow, hit: { entityId: string; title: string; url: string; segments: Hit["segments"] }) => ({
        kind: "reference",
        entityId: hit.entityId,
        title: hit.title,
        titleSegments: [{ text: hit.title, hit: false }],
        subtitle: null,
        collection: row.title,
        url: hit.url,
        tags: [],
        score: 0,
        passages: hit.segments.length > 0 ? [{ chunkId: null, segments: hit.segments, page: null, heading: null }] : [],
        sources: ["reference"],
      });
      /** An archive's hits as results on the one scale, junk left out, best first, at most `each`. */
      function resultsOf(row: CollectionRow, hits: Hit[], each: number): SearchResult[] {
        const listed = (listedOf.get(row.id) ?? []).map((hit) =>
          toResult(row, {
            entityId: hit.entityId,
            title: hit.title,
            url: hit.url,
            segments: hit.description ? [{ text: hit.description, hit: false }] : [],
          }),
        );
        const seen = new Set<string>();
        const articles = hits
          .filter((hit) => !isJunkHit(hit) && !seen.has(hit.path) && seen.add(hit.path))
          .map((hit) =>
            toResult(row, {
              entityId: `${row.id}:${hit.path}`,
              title: hit.title,
              url: readerUrl(row.id, hit.path),
              segments: hit.segments,
            }),
          );
        const all = [...listed, ...articles];
        const scored = rank ? ranked(row, all) : all.map((result, index) => ({ ...result, score: 1 - index / Math.max(all.length, 1) }));
        return scored.slice(0, each);
      }

      async function searchSet(rows: CollectionRow[], each: number): Promise<void> {
        // The words as typed and, when they can be said another way ("tire" for "tyre"), once more that way:
        // never more than two requests to an archive for its full text.
        const patterns = alternate && alternate !== q ? [q, alternate] : [q];
        // The full text is asked first, so that it starts in its three places at once as before; the titles take the
        // fourth and, since they answer in a fraction of the time and put the first results on screen, every place
        // given back while titles are still waiting (`placesAtOnce`).
        const fullText = rows.map((row) =>
          health.fullTextNow(row.id)
            ? Promise.all(
                patterns.map((pattern) =>
                  queue.ask(
                    `${zimOf(row)!.uuid}\n${each}\n${pattern}`,
                    (running) =>
                      searchBook(row, pattern, 0, each, running, true).then(
                        (value): BookAnswer => ({ refused: false, ...value }),
                        (error: unknown) => {
                          if (error instanceof Refused) return { refused: true, status: error.status, body: error.body };
                          throw error;
                        },
                      ),
                    waiting,
                  ),
                ),
              )
            : null,
        );
        const titles = rows.map((row) =>
          titleTerm
            ? titleQueue.ask(
                `${zimOf(row)!.uuid}\n${titleTerm}`,
                (running) => suggestBook(row, titleTerm, referenceShape.titles, running),
                waiting,
              )
            : Promise.resolve<Asked<Hit[]>>({ status: "found", value: [] }),
        );
        await Promise.all(
          rows.map(async (row, index) => {
            const asked = fullText[index];
            const titled = await titles[index]!;
            const titleHits = titled.status === "found" ? titled.value : [];
            if (signal?.aborted) return;
            // A first look while the full text is still being searched.
            if (asked && titleHits.length > 0) {
              const preview = resultsOf(row, titleHits, each);
              if (preview.length > 0) onPart({ collectionId: row.id, title: row.title, results: preview, done: false });
            }
            const answers = asked ? await asked : [];
            if (signal?.aborted) return;
            const found: Hit[][] = [];
            let failure: "slow" | "failed" | null = null;
            for (const answer of answers) {
              if (answer.status === "found" && !answer.value.refused) found.push(answer.value.hits);
              else if (answer.status === "found" && answer.value.refused) health.refused(row.id, answer.value.status, answer.value.body);
              else if (answer.status === "failed") {
                failure = "failed";
                health.failed(row.id, answer.message);
              } else if (answer.status === "slow" && failure === null) failure = "slow";
            }
            if (found.length > 0) health.worked(row.id);
            // Searched by its titles alone (no full-text index, or failing lately): nothing is said about it in the results.
            const titlesOnly = !asked || !health.fullTextNow(row.id);
            const answered = found.length > 0 || (titlesOnly && titled.status === "found");
            const results = resultsOf(row, [...mergeHits(found, each), ...titleHits], each);
            if (answered) searched += 1;
            else missing.push({ collectionId: row.id, title: row.title, reason: failure === "failed" ? "failed" : "slow" });
            const goodHere = results.filter((result) => result.score >= GOOD_SCORE).length;
            good += goodHere;
            if (answered) memory.record(route.words, row.id, goodHere > 0);
            if (!answered && results.length === 0) return;
            onPart({ collectionId: row.id, title: row.title, results, done: true });
          }),
        );
      }

      await searchSet(first, referenceShape.firstEach);
      let more = rest.length;
      let collectionsAsked = first.length;
      // Too little found where it was most likely: the rest after all, while there is time. Not when the person's own
      // library already holds plenty with every word (`widen` false): on a Raspberry Pi the other thirty-one archives
      // took three to six seconds more, mostly asking their titles one at a time, for "cpr on a child" or "storm
      // warning" with seven and seventeen of the person's own. They wait behind "Search all reference collections".
      if (widen && more > 0 && good < referenceShape.enoughGood && !waiting.aborted) {
        onWiden?.(more);
        collectionsAsked += more;
        more = 0;
        await searchSet(rest, resultsFromEach(rest.length));
      }
      missing.sort((a, b) => a.title.localeCompare(b.title));
      return { collections: collectionsAsked, searched, missing, message: null, more };
    },
  };
  search.addSource(source);

  // ── API ──
  function requireBook(collectionId: string): CollectionRow {
    const row = collections.get(collectionId);
    if (row?.kind !== "zim" || !zimOf(row)?.bookName) throw notFound("Collection");
    return row;
  }

  app.get("/api/kiwix/status", async () => {
    const up = await connection.isUp();
    return {
      mode: connection.mode,
      available: up,
      problem: up ? null : (connection.problem() ?? null),
      books: zimCollections().filter(servable).length,
    };
  });

  app.get("/api/kiwix/books", async () => ({ books: await service.books(CONTENT_TOKEN) }));

  app.get<{ Params: { collectionId: string } }>("/api/kiwix/books/:collectionId", async (request) => {
    const row = requireBook(request.params.collectionId);
    const up = await connection.isUp();
    const book = bookDto(row, CONTENT_TOKEN, up);
    if (!book) throw notFound("Collection");
    const reason = book.ready
      ? null
      : !up
        ? (connection.problem() ?? "The Kiwix server is not answering.")
        : !storage.isAvailable(row.locationId)
          ? `This collection is on "${storage.get(row.locationId).name}", which is not connected.`
          : "This collection is not ready to read yet.";
    return { book, reason };
  });

  app.get<{ Params: { collectionId: string }; Querystring: { q?: string } }>("/api/kiwix/books/:collectionId/suggest", async (request) => {
    const row = requireBook(request.params.collectionId);
    const q = (request.query.q ?? "").trim().slice(0, 200);
    if (!q) return { suggestions: [] };
    const query = new URLSearchParams({ content: zimOf(row)!.bookName, term: q, count: "10" });
    const response = await upstream(`suggest?${query}`);
    if (!response.ok) return { suggestions: [] };
    const raw = (await response.json().catch(() => [])) as Array<{ value?: string; kind?: string; path?: string }>;
    return {
      suggestions: raw
        .filter((item) => item.kind === "path" && item.path && item.value)
        .map((item) => ({
          title: decodeEntities(item.value!),
          path: decodeEntities(item.path!),
          url: readerUrl(row.id, decodeEntities(item.path!)),
        })),
    };
  });

  app.get<{ Params: { collectionId: string }; Querystring: { q?: string; offset?: string; limit?: string } }>(
    "/api/kiwix/books/:collectionId/search",
    async (request) => {
      const row = requireBook(request.params.collectionId);
      const q = (request.query.q ?? "").trim().slice(0, 300);
      if (!q) return { total: 0, results: [] };
      const offset = Math.max(0, Number(request.query.offset) || 0);
      const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 20));
      const { total, hits } = await searchBook(row, q, offset, limit);
      return { total, results: hits.map((hit) => ({ ...hit, url: readerUrl(row.id, hit.path) })) };
    },
  );

  /** Registers a ZIM archive that is already on a storage location. Nothing is copied. */
  app.post("/api/kiwix/import", async (request) => {
    const body = z
      .object({ locationId: z.string(), relPath: z.string().min(1).max(500), title: z.string().trim().max(200).optional() })
      .parse(request.body);
    const file = await storage.resolveFollowingLinks(body.locationId, body.relPath);
    const uuid = await readZimUuid(file);
    if (!uuid) throw badRequest("That file is not a ZIM archive.");
    if (zimCollections().some((row) => zimOf(row)?.uuid === uuid))
      throw new AppError("conflict", "That archive is already in your library.");
    const { size } = await fs.promises.stat(file);
    const row = await collections.create({
      kind: "zim",
      title: body.title || path.basename(file, path.extname(file)),
      locationId: body.locationId,
      relPath: body.relPath,
      sizeBytes: size,
      meta: { zim: { uuid, bookName: bookNameOf(file) } },
    });
    return { collection: collections.toDto(row) };
  });

  const isReady = async (row: CollectionRow) => servable(row) && (await connection.isUp());
  const archiveFiles = registerArchiveFiles(app, ctx, {
    upstream,
    requireBook,
    bookNameOf: (row) => zimOf(row)!.bookName,
    uuidOf: (row) => zimOf(row)?.uuid,
  });
  files = archiveFiles;
  lists = registerDocumentLists(app, ctx, {
    upstream,
    requireBook,
    bookNameOf: (row) => zimOf(row)!.bookName,
    uuidOf: (row) => zimOf(row)?.uuid,
    isReady,
    savedDocuments: archiveFiles.savedDocuments,
    turnOf: archiveFiles.turnOf,
    problems: (row) => adding?.problems(row) ?? new Map(),
    readerUrl,
  });
  adding = registerArchiveAdding(app, ctx, { files: archiveFiles, lists, requireBook, isReady });
  // Read each archive's list once now, so that search finds its documents before anyone has opened it.
  for (const row of zimCollections()) if (servable(row) && zimOf(row)?.bookName) lists.warm(row);

  // ── Proxy ──
  app.route<{ Params: { token: string; "*": string } }>({
    method: ["GET", "HEAD"],
    url: "/kiwix/:token/*",
    async handler(request, reply) {
      if (request.params.token !== CONTENT_TOKEN && request.params.token !== secret) {
        return reply.status(404).type("text/plain").send("There is nothing at this address.");
      }
      const rest = request.params["*"];
      if (rest.includes("..") || !isAllowedPath(rest)) {
        return reply.status(404).type("text/plain").send("Not found.");
      }
      // A book whose storage location is away is not in the reader's library, and the reader would say only "Page not
      // found". Said here instead, with where it is and that nothing is lost: a search result or a bookmark leads here.
      const book = /^(?:content|raw)\/([^/]+)/.exec(rest)?.[1];
      const away = book
        ? zimCollections().find((row) => zimOf(row)?.bookName === decodeURIComponent(book) && !storage.isAvailable(row.locationId))
        : undefined;
      if (away) {
        const where = (() => {
          try {
            return storage.get(away.locationId).name;
          } catch {
            return "its storage location";
          }
        })();
        return reply
          .status(503)
          .header("Cache-Control", "no-store")
          .header("Retry-After", "60")
          .type("text/html; charset=utf-8")
          .send(awayPage(away.title, where));
      }
      const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
      const headers: Record<string, string> = { "accept-encoding": "identity" };
      for (const name of ["range", "if-none-match", "if-modified-since", "accept"]) {
        const value = request.headers[name];
        if (typeof value === "string") headers[name] = value;
      }
      const prefix = `/kiwix/${request.params.token}`;
      const response = await upstream(
        `${rest
          .split("/")
          .map((part) => encodeURIComponent(part).replace(/%40/g, "@"))
          .join("/")}${query}`,
        { method: request.method, headers },
      ).catch((error: AppError) => {
        reply.status(502).type("text/plain");
        return error.message;
      });
      if (typeof response === "string") return reply.send(response);

      const origin = `${request.protocol}://${request.headers.host}`;
      reply.status(response.status);
      for (const name of passThroughHeaders) {
        const value = response.headers.get(name);
        if (value) reply.header(name, value);
      }
      reply
        .header("Content-Security-Policy", `default-src 'self' ${origin} data: blob: 'unsafe-inline' 'unsafe-eval'; ${SANDBOX}`)
        .header("Referrer-Policy", "no-referrer")
        .header("Vary", "Origin")
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, max-age=3600")
        .removeHeader("X-Frame-Options");

      // Only under the secret address, and only to a page with no origin of its own: see `readerSecret`.
      if (request.params.token === secret && request.headers.origin === "null") reply.header("Access-Control-Allow-Origin", "null");

      // kiwix-serve redirects to its own addresses; send the browser back through the proxy.
      const location = response.headers.get("location");
      if (location) {
        const target = new URL(location, `${connection.baseUrl()}/`);
        reply.header("Location", `${prefix}${target.pathname}${target.search}`);
      }

      if (request.method === "HEAD" || !response.body || response.status === 304) {
        await response.body?.cancel();
        return reply.send();
      }
      const type = response.headers.get("content-type") ?? "";
      const length = Number(response.headers.get("content-length")) || 0;
      if (type.includes("text/html") && response.status === 200 && length <= MAX_HTML_BYTES) {
        const html = Buffer.from(await response.arrayBuffer()).toString("utf8");
        // Straight after <head>, ahead of anything the archive's page loads.
        const head = /<head[^>]*>/i.exec(html);
        const at = head ? head.index + head[0].length : 0;
        return reply.send(html.slice(0, at) + BRIDGE + html.slice(at));
      }
      if (length) reply.header("content-length", length);
      return reply.send(Readable.fromWeb(response.body as never));
    },
  });
}

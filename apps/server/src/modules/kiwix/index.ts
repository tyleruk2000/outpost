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
 * Outpost's API as the signed-in person. So every proxied response carries a Content
 * Security Policy `sandbox` without `allow-same-origin`: the page runs in an origin of
 * its own, cannot read Outpost's cookies or responses, and cannot load anything from
 * the internet. Because cookies are not sent from a sandboxed page, access is carried
 * by a short-lived token in the URL instead.
 */
import path from "node:path";
import { Readable } from "node:stream";
import { XMLParser } from "fast-xml-parser";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { SearchResult, SearchSource } from "../search/service.ts";
import { bookNameOf, decodeEntities, type LibraryBook, readZimUuid, writeLibrary } from "./library.ts";
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
  iconUrl: string | null;
  /** False while kiwix-serve cannot serve it (drive disconnected, server down, still loading). */
  ready: boolean;
}

export interface KiwixService {
  connection: KiwixConnection;
  /** Rewrites the library file from the installed collections. */
  sync(): Promise<void>;
  books(token: string): Promise<BookDto[]>;
}

declare module "../../core/context.ts" {
  interface Services {
    kiwix: KiwixService;
  }
}

/** What a proxied page may do: run its own scripts, in an origin of its own. */
const SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";

/**
 * Tells the reader which article is showing and hands links that leave the library to
 * it, since a sandboxed page cannot be inspected from outside.
 */
const BRIDGE = `<script>(function(){try{var s=function(){parent.postMessage({type:"outpost:reader",path:location.pathname,hash:location.hash,title:document.title},"*")};s();addEventListener("DOMContentLoaded",s);addEventListener("hashchange",s);addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var u;try{u=new URL(a.href,location.href)}catch(x){return}if((u.protocol==="http:"||u.protocol==="https:")&&u.host!==location.host){e.preventDefault();parent.postMessage({type:"outpost:external",href:u.href},"*")}},true)}catch(e){}})();</script>`;

const MAX_HTML_BYTES = 32 * 1024 * 1024;
const allowedPrefixes = ["content/", "catalog/v2/illustration/"];
const passThroughHeaders = ["content-type", "etag", "last-modified", "content-range", "accept-ranges"];

const zimOf = (row: CollectionRow) => row.meta.zim;
const kiwixOf = (row: CollectionRow) => (row.meta.kiwix ?? {}) as KiwixMeta;

export async function registerKiwix(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config, log } = ctx;
  const { auth, collections, storage, search, settings } = ctx.services;
  const connection = createKiwixConnection({ url: config.kiwix.url, bin: config.kiwix.bin, libraryPath: config.kiwix.libraryPath, log });
  ctx.onClose.push(() => connection.close());
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", processEntities: true, htmlEntities: true });

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
      ["Description", "Language", "Name", "Flavour", "Date", "Creator", "Publisher", "Counter", "Tags"].map((key) => readMeta(zim.bookName, key)),
    );
    // Counter looks like "image/png=3;text/html=599;…".
    const counts = new Map((counter ?? "").split(";").map((part) => part.split("=") as [string, string]));
    const articles = Number(counts.get("text/html")) || undefined;
    const media = [...counts].filter(([type]) => type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")).reduce((sum, [, n]) => sum + (Number(n) || 0), 0);
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

  collections.onInstalled(async (row) => {
    if (row.kind !== "zim") return;
    await sync();
    void enrich(row.id);
  });
  collections.onRemoved(async (row) => {
    // Runs before the file is deleted, so kiwix-serve lets go of it first.
    if (row.kind !== "zim") return;
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
      iconUrl: `/kiwix/${token}/catalog/v2/illustration/${zim.uuid}/?size=48`,
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
  };
  ctx.services.kiwix = service;

  // ── Searching inside books ──
  interface Hit {
    title: string;
    path: string;
    snippet: string;
  }

  async function searchBook(row: CollectionRow, q: string, start: number, limit: number, signal?: AbortSignal): Promise<{ total: number; hits: Hit[] }> {
    const zim = zimOf(row)!;
    const query = new URLSearchParams({ "books.id": zim.uuid, pattern: q, start: String(start), pageLength: String(Math.min(limit, 100)), format: "xml" });
    const response = await upstream(`search?${query}`, { signal: signal ?? AbortSignal.timeout(8000) });
    const body = await response.text();
    if (!response.ok) return { total: 0, hits: [] };
    const channel = parser.parse(body)?.rss?.channel;
    if (!channel) return { total: 0, hits: [] };
    const items = channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
    const prefix = `/content/${zim.bookName}/`;
    const hits: Hit[] = [];
    for (const item of items) {
      const link = decodeEntities(String(item.link ?? ""));
      const at = link.indexOf(prefix);
      if (at === -1) continue;
      hits.push({
        title: decodeEntities(String(item.title ?? "")),
        path: link.slice(at + prefix.length),
        snippet: decodeEntities(String(item.description ?? "")).replace(/\s+/g, " ").trim(),
      });
    }
    return { total: Number(channel["opensearch:totalResults"]) || hits.length, hits };
  }

  const readerUrl = (collectionId: string, articlePath: string) => `/library/read/${collectionId}/${articlePath.split("/").map(encodeURIComponent).join("/")}`;

  const source: SearchSource = {
    id: "reference",
    layer: "reference",
    isAvailable: () => Boolean(connection.baseUrl()) && zimCollections().some(servable),
    weight: () => settings.get("search.hybrid.keywordWeight"),
    async search({ q, limit, signal }) {
      if (!(await connection.isUp())) throw new Error(connection.problem() ?? "Reference collections are not answering, so their articles are missing from these results.");
      const books = zimCollections().filter(servable).slice(0, 24);
      const perBook = Math.max(3, Math.ceil((limit * 1.5) / Math.max(books.length, 1)));
      const answers = await Promise.allSettled(books.map((row) => searchBook(row, q, 0, perBook, signal)));
      // Each book ranks its own articles; take them in turn so one large book does not crowd out the rest.
      const results: SearchResult[] = [];
      for (let rank = 0; rank < perBook && results.length < limit; rank += 1) {
        answers.forEach((answer, index) => {
          if (answer.status !== "fulfilled") return;
          const hit = answer.value.hits[rank];
          const row = books[index]!;
          if (!hit || results.length >= limit) return;
          results.push({
            kind: "reference",
            entityId: `${row.id}:${hit.path}`,
            title: hit.title,
            titleSegments: [{ text: hit.title, hit: false }],
            subtitle: null,
            collection: row.title,
            url: readerUrl(row.id, hit.path),
            tags: [],
            score: 1 - rank / perBook,
            passages: hit.snippet ? [{ chunkId: null, segments: [{ text: hit.snippet.slice(0, 320), hit: false }], page: null, heading: null }] : [],
            sources: ["reference"],
          });
        });
      }
      return results;
    },
  };
  search.addSource(source);

  // ── API ──
  function requireBook(collectionId: string): CollectionRow {
    const row = collections.get(collectionId);
    if (!row || row.kind !== "zim" || !zimOf(row)?.bookName) throw notFound("Collection");
    return row;
  }

  app.get("/api/kiwix/status", async () => {
    const up = await connection.isUp();
    return { mode: connection.mode, available: up, problem: up ? null : (connection.problem() ?? null), books: zimCollections().filter(servable).length };
  });

  app.get("/api/kiwix/books", async (request) => ({ books: await service.books(auth.contentToken(auth.requireUser(request))) }));

  app.get<{ Params: { collectionId: string } }>("/api/kiwix/books/:collectionId", async (request) => {
    const row = requireBook(request.params.collectionId);
    const up = await connection.isUp();
    const book = bookDto(row, auth.contentToken(auth.requireUser(request)), up);
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
        .map((item) => ({ title: decodeEntities(item.value!), path: decodeEntities(item.path!), url: readerUrl(row.id, decodeEntities(item.path!)) })),
    };
  });

  app.get<{ Params: { collectionId: string }; Querystring: { q?: string; offset?: string; limit?: string } }>("/api/kiwix/books/:collectionId/search", async (request) => {
    const row = requireBook(request.params.collectionId);
    const q = (request.query.q ?? "").trim().slice(0, 300);
    if (!q) return { total: 0, results: [] };
    const offset = Math.max(0, Number(request.query.offset) || 0);
    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 20));
    const { total, hits } = await searchBook(row, q, offset, limit);
    return { total, results: hits.map((hit) => ({ ...hit, url: readerUrl(row.id, hit.path) })) };
  });

  /** Registers a ZIM archive that is already on a storage location. Nothing is copied. */
  app.post("/api/kiwix/import", async (request) => {
    auth.requireAdmin(request);
    const body = z.object({ locationId: z.string(), relPath: z.string().min(1).max(500), title: z.string().trim().max(200).optional() }).parse(request.body);
    const file = storage.resolve(body.locationId, body.relPath);
    const uuid = await readZimUuid(file);
    if (!uuid) throw badRequest("That file is not a ZIM archive.");
    if (zimCollections().some((row) => zimOf(row)?.uuid === uuid)) throw new AppError("conflict", "That archive is already in your library.");
    const { size } = await import("node:fs").then((fs) => fs.promises.stat(file));
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

  // ── Proxy ──
  app.route<{ Params: { token: string; "*": string } }>({
    method: ["GET", "HEAD"],
    url: "/kiwix/:token/*",
    async handler(request, reply) {
      if (!auth.verifyContentToken(request.params.token)) {
        return reply.status(401).type("text/plain").send("This link to your library has expired. Go back to Outpost and open the page again.");
      }
      const rest = request.params["*"];
      if (rest.includes("..") || !allowedPrefixes.some((prefix) => rest.startsWith(prefix))) {
        return reply.status(404).type("text/plain").send("Not found.");
      }
      const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
      const headers: Record<string, string> = { "accept-encoding": "identity" };
      for (const name of ["range", "if-none-match", "if-modified-since", "accept"]) {
        const value = request.headers[name];
        if (typeof value === "string") headers[name] = value;
      }
      const prefix = `/kiwix/${request.params.token}`;
      const response = await upstream(`${rest.split("/").map(encodeURIComponent).join("/")}${query}`, { method: request.method, headers }).catch((error: AppError) => {
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
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, max-age=3600")
        .removeHeader("X-Frame-Options");

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
        const at = html.search(/<\/head>/i);
        return reply.send(at === -1 ? BRIDGE + html : html.slice(0, at) + BRIDGE + html.slice(at));
      }
      if (length) reply.header("content-length", length);
      return reply.send(Readable.fromWeb(response.body as never));
    },
  });
}

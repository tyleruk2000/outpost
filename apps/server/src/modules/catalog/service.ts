/**
 * The content catalogue: what Explore shows.
 *
 * Three things are merged for every entry:
 *  - the manifest (what it is, who publishes it, under which licence): always there,
 *    read from disk, works offline;
 *  - the last resolution (current size, version, whether the source still has it):
 *    cached in the database, refreshed only when an administrator asks;
 *  - what is installed or downloading on this server.
 *
 * Nothing here calls out on its own. `refresh` and `download` do, and both are the
 * direct result of someone pressing a button. `add` never does: it copies a file that
 * ships with Outpost into the library.
 */
import fs from "node:fs";
import path from "node:path";
import {
  CATALOG_CATEGORIES,
  type CatalogEntryDto,
  type CatalogInstallStatus,
  type CatalogPackInstallResponse,
  type CatalogRefreshSummary,
  type CatalogResponse,
} from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, classifyNetworkError, conflict, messageOf, notFound } from "../../core/errors.ts";
import { pathExists, safeFileName } from "../../core/fs-safe.ts";
import { sha256File } from "../../core/hashing.ts";
import { createHttpClient, type HttpClient } from "../../core/http.ts";
import { catalogCache, searchEntities } from "../../db/schema.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow, InstallMeta } from "../downloads/types.ts";
import type { DocumentBridge } from "./documents-bridge.ts";
import { fetchBooks, fetchFileFacts, KIWIX_CATALOG_URL, type KiwixBook, pickBook } from "./kiwix.ts";
import { type BundledBook, type BundledFile, type LoadedCatalog, type LoadedEntry, loadCatalog } from "./manifest.ts";
import { type LoadedPacks, loadPacks } from "./packs.ts";
import {
  bookResolution,
  type CachedResolution,
  type EntryResolution,
  hostProblem,
  isKiwixEntry,
  notListedReason,
  resolveEntries,
  underlyingAppError,
} from "./resolve.ts";

export type { CachedResolution } from "./resolve.ts";

const SEARCH_KIND = "catalog";
/** Row in the cache table that records when the catalogue was last refreshed. */
const REFRESH_MARKER = "$refresh";
const OFFLINE_REFRESH_MESSAGE = "The catalogue could not be refreshed because there is no connection. Showing the last known details.";

/** Everything needed to start a download, resolved a moment ago. */
export interface DownloadResolution {
  url: string;
  fileName: string;
  sizeBytes?: number;
  sha256?: string;
  version?: string;
  publishedAt?: string;
  kiwix?: { name: string; flavour: string; uuid: string; articleCount: number | null; title: string };
}

export interface CatalogDownloadResult {
  download: DownloadRow;
  /** The installed collection this download will replace once it is installed. */
  replacesCollectionId: string | null;
}

export interface CatalogAddResult {
  collection: CollectionRow;
  /** The document the file became in the library, when it is one. */
  documentId?: string;
  /** For a book: how many chapters were added, each as a document. */
  chapterCount?: number;
  /** The older edition this one took the place of; it has been removed with its file. */
  replacedCollectionId: string | null;
}

export interface CatalogLinkTarget {
  entryId: string;
  entryName: string;
  collectionId?: string;
  documentId?: string;
}

export interface CatalogService {
  /** Reads the manifests from disk again and re-describes the entries to search. */
  reload(): LoadedCatalog;
  list(): CatalogResponse;
  getEntry(id: string): LoadedEntry | undefined;
  /** Hosts a first request may go to: every manifest's downloadHosts plus the configured extras. */
  allowedHosts(): string[];
  /** Asks the sources what they currently offer and caches the answers. Needs a connection. */
  refresh(): Promise<CatalogRefreshSummary>;
  /** Resolves one entry right now, with exact size and checksum where the source publishes them. */
  resolveForDownload(entryId: string): Promise<DownloadResolution>;
  download(entryId: string, options?: { locationId?: string }): Promise<CatalogDownloadResult>;
  /**
   * Fetches what a pack holds that is not here yet: starts a download for each such
   * entry and adds the ones that ship with Outpost. One entry failing to start does not
   * stop the others. `entryIds` narrows it to part of the pack.
   */
  installPack(packId: string, options?: { locationId?: string; entryIds?: string[] }): Promise<CatalogPackInstallResponse>;
  /**
   * Adds an entry that ships with Outpost: copies its file, or the chapters of its book,
   * into the library and records it as installed. Works with no connection, and
   * finishes before it returns.
   */
  add(entryId: string, options?: { locationId?: string }): Promise<CatalogAddResult>;
  /**
   * What a link to a catalogue entry (and a chapter of its book) leads to on this server:
   * the entry's name, and the collection and document it is in the library as, if it is.
   * Undefined when the catalogue has no such entry.
   */
  linkTarget(entryId: string, chapterKey?: string): CatalogLinkTarget | undefined;
  /** True when the catalogue knows a newer version than the one installed. */
  hasUpdate(collection: CollectionRow): boolean;
}

declare module "../../core/context.ts" {
  interface Services {
    catalog: CatalogService;
  }
}

export interface CatalogServiceOptions {
  /** The Kiwix OPDS endpoint. Tests point this at a local fixture. */
  kiwixCatalogUrl?: string;
  /** Hands installed documents to the document library. Without it, added files stay plain collections. */
  documents?: DocumentBridge;
}

/**
 * Orders version labels such as "2026-08" < "2026-10" or "1.9" < "1.10": runs of digits
 * compare as numbers, everything else as text.
 */
export function compareVersions(a: string, b: string): number {
  const split = (value: string) => value.match(/\d+|\D+/g) ?? [];
  const left = split(a);
  const right = split(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const x = left[index];
    const y = right[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numeric = /^\d/.test(x) && /^\d/.test(y);
    const order = numeric ? Number(x) - Number(y) : x < y ? -1 : x > y ? 1 : 0;
    if (order !== 0) return order < 0 ? -1 : 1;
  }
  return 0;
}

function fileNameFromUrl(address: string): string {
  const last = new URL(address).pathname.split("/").filter(Boolean).pop() ?? "";
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // Not valid percent-encoding; the raw segment will do.
  }
  return safeFileName(decoded, "download");
}

export function createCatalogService(ctx: AppContext, options: CatalogServiceOptions = {}): CatalogService {
  const { db, config } = ctx;
  const { storage, search } = ctx.services;
  const kiwixCatalogUrl = options.kiwixCatalogUrl ?? KIWIX_CATALOG_URL;
  const http: HttpClient = createHttpClient({ allowPrivate: config.allowPrivateDownloads });
  ctx.onClose.push(() => http.close());

  const manifestDirs = [path.join(config.catalogDir, "manifests"), path.join(config.dataDir, "catalog")];
  let catalog: LoadedCatalog = { manifests: [], entries: [], problems: [], downloadHosts: [], bundled: new Map(), books: new Map() };
  // Packs that ship with Outpost first; a person's own after, in the folder that holds their manifests.
  const packFiles = [path.join(config.catalogDir, "packs.json"), path.join(config.dataDir, "catalog", "packs.json")];
  let packs: LoadedPacks = { packs: [], problems: [] };
  let byId = new Map<string, LoadedEntry>();

  function allowedHosts(): string[] {
    return [...new Set([...catalog.downloadHosts, ...config.extraDownloadHosts])];
  }

  // ── Manifests ──

  /** Explore content is findable from unified search whether or not it is installed. */
  function indexEntries(): void {
    for (const entry of catalog.entries) {
      search.upsert({
        kind: SEARCH_KIND,
        entityId: entry.id,
        title: entry.name,
        subtitle: entry.publisher,
        collection: entry.category,
        url: `/explore?entry=${encodeURIComponent(entry.id)}`,
        tags: entry.tags,
        sections: [{ text: entry.description }],
      });
    }
    const indexed = db.select({ entityId: searchEntities.entityId }).from(searchEntities).where(eq(searchEntities.kind, SEARCH_KIND)).all();
    for (const row of indexed) if (!byId.has(row.entityId)) search.remove(SEARCH_KIND, row.entityId);
  }

  function reload(): LoadedCatalog {
    // http addresses are for a mirror on the person's own network, and only when they allowed that.
    catalog = loadCatalog(manifestDirs, { allowInsecureHttp: config.allowPrivateDownloads });
    byId = new Map(catalog.entries.map((entry) => [entry.id, entry]));
    packs = loadPacks(packFiles, new Set(byId.keys()));
    for (const problem of [...catalog.problems, ...packs.problems]) {
      ctx.log.warn({ file: problem.file, entry: problem.entryId }, `catalogue: ${problem.message}`);
    }
    indexEntries();
    return catalog;
  }

  function requireEntry(id: string): LoadedEntry {
    const entry = byId.get(id);
    if (!entry) throw notFound("Catalogue entry");
    return entry;
  }

  // ── The cache ──

  function cached(entryId: string): { resolved: CachedResolution; resolvedAt: number } | undefined {
    const row = db.select().from(catalogCache).where(eq(catalogCache.entryId, entryId)).get();
    return row ? { resolved: row.resolved as unknown as CachedResolution, resolvedAt: row.resolvedAt } : undefined;
  }

  function remember(entryId: string, resolved: CachedResolution, at = Date.now()): void {
    const value = resolved as unknown as Record<string, unknown>;
    db.insert(catalogCache)
      .values({ entryId, resolved: value, resolvedAt: at })
      .onConflictDoUpdate({ target: catalogCache.entryId, set: { resolved: value, resolvedAt: at } })
      .run();
  }

  /** Marks an entry unavailable but keeps the last known size and version for display. */
  function rememberUnavailable(entryId: string, reason: string, at = Date.now()): void {
    const { url: _url, ...last } = cached(entryId)?.resolved ?? { availability: "unavailable" as const };
    remember(entryId, { ...last, availability: "unavailable", reason }, at);
  }

  // ── Talking to the sources ──

  /** Network trouble in words: "you are offline" is not the same as "they are having a bad day". */
  function asRefreshError(error: unknown): AppError {
    if (classifyNetworkError(error) === "offline") return new AppError("offline", OFFLINE_REFRESH_MESSAGE);
    return (
      underlyingAppError(error) ??
      new AppError("upstream", `The catalogue could not be refreshed: ${messageOf(error)}. Showing the last known details.`)
    );
  }

  const kiwixOptions = (signal?: AbortSignal) => ({ catalogUrl: kiwixCatalogUrl, allowedHosts: allowedHosts(), signal });

  async function refresh(): Promise<CatalogRefreshSummary> {
    reload();
    let results: Map<string, EntryResolution>;
    try {
      results = await resolveEntries(http, catalog.entries, {
        allowedHosts: allowedHosts(),
        kiwixCatalogUrl,
        trustPinned: true,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw asRefreshError(error);
    }

    const summary: CatalogRefreshSummary = { checked: 0, available: 0, unavailable: [], unchecked: [], refreshedAt: Date.now() };
    ctx.sqlite.transaction(() => {
      for (const [entryId, result] of results) {
        if (result.state === "available") {
          remember(entryId, result.resolved, summary.refreshedAt);
          summary.available += 1;
        } else if (result.state === "unavailable") {
          rememberUnavailable(entryId, result.reason, summary.refreshedAt);
          summary.unavailable.push({ entryId, reason: result.reason });
        } else {
          // Not asked, so nothing changes: the last known details stay as they are.
          summary.unchecked.push({ entryId, reason: result.reason });
        }
      }
      remember(REFRESH_MARKER, { availability: "available" }, summary.refreshedAt);
    })();
    summary.checked = summary.available + summary.unavailable.length;
    ctx.events.publish({ type: "catalog.changed" });
    return summary;
  }

  async function resolveForDownload(entryId: string): Promise<DownloadResolution> {
    const entry = requireEntry(entryId);
    if (entry.source.type === "http") {
      const { url, sha256, sizeBytes, version, published } = entry.source;
      return { url, fileName: fileNameFromUrl(url), sha256, sizeBytes, version, publishedAt: published };
    }
    if (!isKiwixEntry(entry)) {
      throw badRequest(`"${entry.name}" is included with Outpost, so there is nothing to download. Add it to the library instead.`);
    }
    const { name, flavour } = entry.source;
    const signal = AbortSignal.timeout(60_000);
    let book: KiwixBook | undefined;
    let facts: { sizeBytes?: number; sha256?: string };
    try {
      book = pickBook(await fetchBooks(http, { name }, kiwixOptions(signal)), name, flavour);
      if (!book) {
        const reason = notListedReason(entry);
        rememberUnavailable(entryId, reason);
        throw new AppError("upstream", `${reason} Refresh the catalogue to see what is available now.`);
      }
      const blocked = hostProblem(book.fileUrl, allowedHosts());
      if (blocked) throw new AppError("forbidden", blocked);
      facts = await fetchFileFacts(http, book, kiwixOptions(signal));
    } catch (error) {
      if (classifyNetworkError(error) === "offline") {
        throw new AppError(
          "offline",
          "This download could not be started because there is no connection. Try again when the network is back.",
        );
      }
      throw asRefreshError(error);
    }
    if (!facts.sha256) {
      // Mirrors may serve the file, so without the publisher's checksum nothing vouches for it.
      throw new AppError(
        "upstream",
        "The Kiwix library did not provide a checksum for this file, so it cannot be verified. Try again later.",
      );
    }
    remember(entryId, bookResolution(book, facts));
    return {
      url: book.fileUrl,
      fileName: safeFileName(book.fileName, `${name}.zim`),
      sizeBytes: facts.sizeBytes ?? book.sizeBytes ?? undefined,
      sha256: facts.sha256,
      version: book.version ?? undefined,
      publishedAt: book.updated || undefined,
      kiwix: { name, flavour, uuid: book.uuid, articleCount: book.articleCount, title: book.title },
    };
  }

  // ── Install state ──

  const { downloads, collections } = ctx.services;
  const isActive = (row: DownloadRow) => ["queued", "running", "verifying", "paused"].includes(row.state);

  function knownVersion(entry: LoadedEntry, resolution: CachedResolution | undefined): string | undefined {
    // What ships with this copy of Outpost is the edition on offer, whatever an earlier refresh remembered.
    if (entry.source.type === "bundled") return entry.source.version;
    return resolution?.version ?? (entry.source.type === "http" ? entry.source.version : undefined);
  }

  function isNewer(installed: string | null | undefined, offered: string | undefined): boolean {
    return Boolean(installed && offered && compareVersions(installed, offered) < 0);
  }

  function hasUpdate(collection: CollectionRow): boolean {
    const entry = collection.catalogEntryId ? byId.get(collection.catalogEntryId) : undefined;
    if (!entry) return false;
    return isNewer(collection.version, knownVersion(entry, cached(entry.id)?.resolved));
  }

  function toDto(entry: LoadedEntry, entryDownloads: DownloadRow[], installed: CollectionRow | undefined): CatalogEntryDto {
    const cache = cached(entry.id);
    const resolution = cache?.resolved;
    const source = entry.source;
    const { sizeBytes: estimate, source: _source, ...manifestFields } = entry;

    const active = entryDownloads.find(isActive);
    const latest = entryDownloads[0];
    let status: CatalogInstallStatus = "not_installed";
    let downloadId: string | undefined;
    if (active) {
      status = active.state === "queued" ? "queued" : active.state === "paused" ? "paused" : "downloading";
      downloadId = active.id;
    } else if (installed) {
      status = "installed";
    } else if (latest?.state === "failed") {
      status = "failed";
      downloadId = latest.id;
    }

    const version = knownVersion(entry, resolution);
    const documentId = typeof installed?.meta.documentId === "string" ? installed.meta.documentId : undefined;
    const installState = {
      status,
      downloadId,
      collectionId: installed?.id,
      documentId,
      installedVersion: installed?.version ?? undefined,
      updateAvailable: installed ? isNewer(installed.version, version) : false,
    };
    if (source.type === "bundled") {
      // The file is on this machine already: its size is measured, and it is always available.
      // A book's list of chapters stays here; the catalogue says only how many there are.
      const { book: _book, ...bundledSource } = source;
      const book = catalog.books.get(entry.id);
      return {
        ...manifestFields,
        source: bundledSource,
        ...(book ? { chapterCount: book.chapters.length } : {}),
        sizeBytes: (book ?? catalog.bundled.get(entry.id))?.sizeBytes ?? null,
        sizeIsEstimate: false,
        version: version ?? null,
        publishedAt: source.published ?? null,
        articleCount: null,
        resolvedAt: null,
        availability: "available",
        unavailableReason: null,
        ...installState,
      };
    }
    const resolvedSize = resolution?.sizeBytes ?? (source.type === "http" ? source.sizeBytes : undefined);
    return {
      ...manifestFields,
      source,
      sizeBytes: resolvedSize ?? estimate ?? null,
      sizeIsEstimate: resolvedSize === undefined && estimate !== undefined,
      version: version ?? null,
      publishedAt: resolution?.publishedAt ?? (source.type === "http" ? (source.published ?? null) : null),
      articleCount: resolution?.articleCount ?? null,
      resolvedAt: cache?.resolvedAt ?? null,
      availability: resolution?.availability ?? "unknown",
      unavailableReason: resolution?.availability === "unavailable" ? (resolution.reason ?? null) : null,
      ...installState,
    };
  }

  /**
   * An archive that was added by hand, or installed before the catalogue listed it, is
   * that entry's installed copy: the same book in the same edition. Without this the
   * catalogue offers to download what is already there, and a pack fetches it twice.
   * The record is only told which entry it belongs to; nothing else about it changes.
   */
  function adoptUnlinkedArchives(): void {
    // Oldest first (ids sort by when they were made): of two copies, the first one keeps the entry.
    const unlinked = collections
      .list({ kind: "zim" })
      .filter((row) => !row.catalogEntryId)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (unlinked.length === 0) return;
    const taken = new Set(collections.list().map((row) => row.catalogEntryId));
    for (const row of unlinked) {
      const zim = (row.meta.zim ?? {}) as { flavour?: unknown };
      const kiwix = (row.meta.kiwix ?? {}) as { name?: unknown };
      const name = typeof kiwix.name === "string" ? kiwix.name : typeof row.meta.kiwixName === "string" ? row.meta.kiwixName : undefined;
      if (!name) continue;
      const flavour = typeof zim.flavour === "string" ? zim.flavour : "";
      const entry = catalog.entries.find(
        (candidate) => candidate.source.type === "kiwix" && candidate.source.name === name && candidate.source.flavour === flavour,
      );
      if (!entry || taken.has(entry.id)) continue;
      collections.update(row.id, { catalogEntryId: entry.id });
      taken.add(entry.id);
      ctx.log.info({ collection: row.id, entry: entry.id }, "an installed archive was matched to its catalogue entry");
    }
  }

  function list(): CatalogResponse {
    adoptUnlinkedArchives();
    const downloadsByEntry = new Map<string, DownloadRow[]>();
    for (const row of downloads.list()) {
      if (!row.catalogEntryId) continue;
      const rows = downloadsByEntry.get(row.catalogEntryId) ?? [];
      rows.push(row); // downloads.list() is newest first, so each list is too
      downloadsByEntry.set(row.catalogEntryId, rows);
    }
    const installedByEntry = new Map<string, CollectionRow>();
    for (const row of collections.list()) {
      // collections.list() is newest first: the first one seen is the current install.
      if (row.catalogEntryId && !installedByEntry.has(row.catalogEntryId)) installedByEntry.set(row.catalogEntryId, row);
    }
    const entries = catalog.entries.map((entry) => toDto(entry, downloadsByEntry.get(entry.id) ?? [], installedByEntry.get(entry.id)));
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    return {
      categories: CATALOG_CATEGORIES.map(({ slug, label }) => ({ slug, label, count: counts.get(slug) ?? 0 })),
      entries,
      packs: packs.packs,
      manifests: catalog.manifests.map(({ id, name }) => ({ id, name })),
      problems: [...catalog.problems, ...packs.problems],
      lastRefreshedAt: cached(REFRESH_MARKER)?.resolvedAt ?? null,
    };
  }

  // ── Downloading ──

  /**
   * Where the file goes. An update usually has a new name (the date is part of it); if
   * the name is taken anyway, the version is added rather than touching what is there.
   */
  async function destination(locationId: string, folder: string, fileName: string, version: string | undefined): Promise<string> {
    const natural = `collections/${folder}/${fileName}`;
    if (!version || !(await pathExists(storage.resolve(locationId, natural)))) return natural;
    const extension = path.extname(fileName);
    const stem = fileName.slice(0, fileName.length - extension.length);
    return `collections/${folder}/${safeFileName(`${stem}_${version}${extension}`)}`;
  }

  async function download(entryId: string, request: { locationId?: string } = {}): Promise<CatalogDownloadResult> {
    const entry = requireEntry(entryId);
    const entryDownloads = downloads.list().filter((row) => row.catalogEntryId === entryId);
    if (entryDownloads.some(isActive)) throw conflict(`"${entry.name}" is already being downloaded.`);
    adoptUnlinkedArchives();
    const installed = collections.list({ catalogEntryId: entryId })[0];
    const location = request.locationId ? storage.get(request.locationId) : storage.getDefault();

    const resolution = await resolveForDownload(entryId);
    let replacesCollectionId: string | null = null;
    if (installed) {
      const update = isNewer(installed.version, resolution.version);
      if (!update && installed.status !== "missing") {
        throw conflict(
          `"${entry.name}" is already installed${installed.version ? ` (version ${installed.version})` : ""} and the source has nothing newer. To download it again, remove the installed copy first.`,
        );
      }
      replacesCollectionId = installed.id;
    }

    // The same check start() makes, done here first so the error names the chosen location
    // and carries requiredBytes and freeBytes before anything is recorded.
    if (resolution.sizeBytes !== undefined) await storage.assertSpace(location.id, resolution.sizeBytes);

    const isZim = entry.format === "zim";
    const relPath = await destination(location.id, isZim ? "zim" : "files", resolution.fileName, resolution.version);

    // An earlier attempt at exactly this file continues from its partial file.
    const unfinished = entryDownloads.find(
      (row) =>
        (row.state === "failed" || row.state === "cancelled") &&
        row.url === resolution.url &&
        row.locationId === location.id &&
        row.relPath === relPath &&
        row.sha256Expected === (resolution.sha256 ?? null),
    );
    if (unfinished) return { download: await downloads.retry(unfinished.id), replacesCollectionId };

    const install: InstallMeta = {
      title: entry.name,
      description: entry.description,
      category: entry.category,
      language: entry.language,
      publisher: entry.publisher,
      license: entry.license,
      attribution: entry.attribution,
      version: resolution.version,
      collectionMeta: {
        format: entry.format,
        manifestId: entry.manifestId,
        ...(entry.licenseNote ? { licenseNote: entry.licenseNote } : {}),
        ...(entry.homepage ? { homepage: entry.homepage } : {}),
        ...(resolution.publishedAt ? { publishedAt: resolution.publishedAt } : {}),
        ...(resolution.kiwix
          ? {
              zim: {
                // kiwix-serve addresses a book by its file name without the extension.
                bookName: resolution.fileName.replace(/\.zim$/, ""),
                uuid: resolution.kiwix.uuid,
                articleCount: resolution.kiwix.articleCount ?? undefined,
                flavour: resolution.kiwix.flavour,
              },
              kiwixName: resolution.kiwix.name,
            }
          : {}),
      },
    };
    const row = await downloads.start({
      kind: isZim ? "zim" : "file",
      title: entry.name,
      url: resolution.url,
      locationId: location.id,
      relPath,
      sizeBytes: resolution.sizeBytes,
      sha256: resolution.sha256,
      allowedHosts: allowedHosts(),
      catalogEntryId: entry.id,
      meta: {
        ...install,
        ...(resolution.kiwix ? { kiwix: resolution.kiwix } : {}),
        ...(replacesCollectionId ? { replacesCollectionId } : {}),
      },
    });
    ctx.events.publish({ type: "catalog.changed", id: entry.id });
    return { download: row, replacesCollectionId };
  }

  // ── Adding what ships with Outpost ──

  /** A free path for a bundled file: its own name, then with the version, then numbered. */
  async function freeDestination(locationId: string, fileName: string, version: string | undefined): Promise<string> {
    const extension = path.extname(fileName);
    const stem = fileName.slice(0, fileName.length - extension.length);
    const candidates = [fileName, ...(version ? [safeFileName(`${stem}_${version}${extension}`)] : [])];
    for (let copy = 2; copy <= 50; copy += 1) candidates.push(`${stem}_${copy}${extension}`);
    for (const candidate of candidates) {
      const relPath = `collections/files/${candidate}`;
      if (!(await pathExists(storage.resolve(locationId, relPath)))) return relPath;
    }
    throw conflict(`There are already many files called "${fileName}" in this location. Remove some of them and try again.`);
  }

  /** A free folder for a bundled book: named for its entry, then with the version, then numbered. */
  async function freeFolder(locationId: string, name: string, version: string | undefined): Promise<string> {
    const candidates = [name, ...(version ? [safeFileName(`${name}_${version}`)] : [])];
    for (let copy = 2; copy <= 50; copy += 1) candidates.push(`${name}_${copy}`);
    for (const candidate of candidates) {
      const relPath = `collections/books/${candidate}`;
      if (!(await pathExists(storage.resolve(locationId, relPath)))) return relPath;
    }
    throw conflict(`There are already many folders called "${name}" in this location. Remove some of them and try again.`);
  }

  const adding = new Set<string>();

  /** What the catalogue records about anything it installs from an entry that ships with Outpost. */
  function bundledRecord(entry: LoadedEntry, locationId: string, relPath: string) {
    const { version, published } = entry.source as { version?: string; published?: string };
    return {
      title: entry.name,
      locationId,
      relPath,
      catalogEntryId: entry.id,
      description: entry.description,
      category: entry.category,
      language: entry.language,
      publisher: entry.publisher,
      license: entry.license,
      attribution: entry.attribution,
      version,
      meta: {
        format: entry.format,
        manifestId: entry.manifestId,
        bundled: true,
        ...(entry.licenseNote ? { licenseNote: entry.licenseNote } : {}),
        ...(entry.homepage ? { homepage: entry.homepage } : {}),
        ...(published ? { publishedAt: published } : {}),
      },
    };
  }

  /** Copies one bundled file into the library: a collection record, and the document it becomes. */
  async function addFile(
    entry: LoadedEntry,
    file: BundledFile,
    locationId: string,
  ): Promise<{ collection: CollectionRow; documentId?: string }> {
    const { version } = entry.source as { version?: string };
    const relPath = await freeDestination(locationId, safeFileName(path.basename(file.path), "document"), version);
    const target = storage.resolve(locationId, relPath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    // COPYFILE_EXCL: never write over a file that appeared in the meantime.
    await fs.promises.copyFile(file.path, target, fs.constants.COPYFILE_EXCL);

    let collection: CollectionRow;
    try {
      collection = await collections.create({
        ...bundledRecord(entry, locationId, relPath),
        kind: "file",
        sizeBytes: file.sizeBytes,
        sha256: await sha256File(target),
      });
    } catch (error) {
      // Nothing records the copy, so it would only be clutter. It is Outpost's own copy, made a moment ago.
      await fs.promises.rm(target, { force: true }).catch(() => undefined);
      throw error;
    }
    return { collection, documentId: await options.documents?.adopt(collection.id) };
  }

  /** Copies a bundled book into the library: its chapters into one folder, each recorded as a document. */
  async function addBook(
    entry: LoadedEntry,
    book: BundledBook,
    locationId: string,
  ): Promise<{ collection: CollectionRow; chapterCount: number }> {
    const { version } = entry.source as { version?: string };
    const relPath = await freeFolder(locationId, safeFileName(entry.id, "book"), version);
    const target = storage.resolve(locationId, relPath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    // Not recursive: the folder must be new, so nothing that is already there is written into.
    await fs.promises.mkdir(target);
    try {
      for (const chapter of book.chapters) {
        await fs.promises.copyFile(chapter.path, path.join(target, chapter.fileName), fs.constants.COPYFILE_EXCL);
      }
      return await ctx.services.books.create({
        collection: bundledRecord(entry, locationId, relPath),
        chapters: book.chapters,
        document: {
          category: CATALOG_CATEGORIES.find((category) => category.slug === entry.category)?.label,
          author: entry.publisher,
          source: entry.homepage ?? entry.publisher,
          language: entry.language,
        },
      });
    } catch (error) {
      // Nothing records the copies, so they would only be clutter. They are Outpost's own, made a moment ago.
      await fs.promises.rm(target, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async function add(entryId: string, request: { locationId?: string } = {}): Promise<CatalogAddResult> {
    const entry = requireEntry(entryId);
    const file = catalog.bundled.get(entryId);
    const book = catalog.books.get(entryId);
    if (entry.source.type !== "bundled" || !(file || book)) {
      throw badRequest(`"${entry.name}" does not ship with Outpost. Download it from the catalogue instead.`);
    }
    if (adding.has(entryId)) throw conflict(`"${entry.name}" is already being added.`);
    adding.add(entryId);
    try {
      const { version } = entry.source;
      const installed = collections.list({ catalogEntryId: entryId })[0];
      if (installed && !isNewer(installed.version, version) && installed.status !== "missing") {
        throw conflict(`"${entry.name}" is already in your library${installed.version ? ` (version ${installed.version})` : ""}.`);
      }
      const location = request.locationId ? storage.get(request.locationId) : storage.getDefault();
      await storage.assertSpace(location.id, (book ?? file)!.sizeBytes);

      const added: { collection: CollectionRow; documentId?: string; chapterCount?: number } = book
        ? await addBook(entry, book, location.id)
        : await addFile(entry, file!, location.id);
      const { collection } = added;

      let replacedCollectionId: string | null = null;
      if (installed && installed.id !== collection.id) {
        // The same rule as an updated download: the person asked for the new edition, so
        // the one it replaces goes, with its file, once the new one is in place.
        try {
          await collections.remove(installed.id, { deleteFiles: true });
          replacedCollectionId = installed.id;
        } catch (error) {
          ctx.log.warn({ err: error, collection: installed.id }, "the replaced edition could not be removed");
        }
      }
      ctx.events.publish({ type: "catalog.changed", id: entry.id });
      return {
        collection: collections.get(collection.id) ?? collection,
        documentId: added.documentId,
        chapterCount: added.chapterCount,
        replacedCollectionId,
      };
    } finally {
      adding.delete(entryId);
    }
  }

  function linkTarget(entryId: string, chapterKey?: string): CatalogLinkTarget | undefined {
    const entry = byId.get(entryId);
    if (!entry) return undefined;
    const target: CatalogLinkTarget = { entryId: entry.id, entryName: entry.name };
    // collections.list() is newest first: the first one is the current install.
    const installed = collections.list({ catalogEntryId: entryId })[0];
    if (!installed) return target;
    target.collectionId = installed.id;
    if (chapterKey !== undefined) target.documentId = ctx.services.books.chapterDocument(installed.id, chapterKey);
    else if (typeof installed.meta.documentId === "string") target.documentId = installed.meta.documentId;
    return target;
  }

  reload();

  async function installPack(
    packId: string,
    request: { locationId?: string; entryIds?: string[] } = {},
  ): Promise<CatalogPackInstallResponse> {
    const pack = packs.packs.find((item) => item.id === packId);
    if (!pack) throw new AppError("not_found", "There is no pack by that name.");
    const wanted = request.entryIds ?? pack.entryIds;
    const outside = wanted.filter((id) => !pack.entryIds.includes(id));
    if (outside.length > 0) throw badRequest(`These are not part of the pack "${pack.name}": ${outside.join(", ")}.`);

    const status = new Map(list().entries.map((item) => [item.id, item.status]));
    const result: CatalogPackInstallResponse = { queued: [], added: [], already: 0, failed: [] };
    // In the pack's own order, one at a time: each start checks the free space left by the ones before it.
    for (const entryId of pack.entryIds.filter((id) => wanted.includes(id))) {
      const entry = requireEntry(entryId);
      const now = status.get(entryId);
      if (now === "installed" || now === "queued" || now === "downloading" || now === "paused") {
        result.already += 1;
        continue;
      }
      try {
        if (entry.source.type === "bundled") {
          const added = await add(entryId, { locationId: request.locationId });
          result.added.push({ entryId, name: entry.name, documentId: added.documentId, collectionId: added.collection.id });
        } else {
          const started = await download(entryId, { locationId: request.locationId });
          result.queued.push(downloads.toDto(started.download));
        }
      } catch (error) {
        // Without a connection none of the rest can start either; say so once, plainly, for each.
        result.failed.push({ entryId, name: entry.name, reason: underlyingAppError(error)?.message ?? messageOf(error) });
      }
    }
    return result;
  }

  return {
    installPack,
    reload,
    list,
    getEntry: (id) => byId.get(id),
    allowedHosts,
    refresh,
    resolveForDownload,
    download,
    add,
    linkTarget,
    hasUpdate,
  };
}

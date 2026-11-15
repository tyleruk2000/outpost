/**
 * Asking the sources what they currently offer, for many entries at once. Used by the
 * catalogue's refresh and by the manifest validator (`--online`), which is why it
 * depends only on an HTTP client and not on the running server.
 */
import { AppError, classifyNetworkError, messageOf } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { fetchBooks, type KiwixBook, pickBook } from "./kiwix.ts";
import type { LoadedEntry } from "./manifest.ts";

/** What the last look at the source found. Stored as JSON in `catalog_cache`. */
export interface CachedResolution {
  availability: "available" | "unavailable";
  /** Why it is unavailable, in plain words. */
  reason?: string;
  title?: string;
  summary?: string;
  sizeBytes?: number;
  /** False when the size is the feed's rounded figure. */
  sizeExact?: boolean;
  version?: string;
  publishedAt?: string;
  articleCount?: number;
  mediaCount?: number;
  /** Informational only. Downloads always resolve afresh; see kiwix.ts. */
  url?: string;
  uuid?: string;
}

export type EntryResolution =
  | { state: "available"; resolved: CachedResolution }
  /** The source answered, and does not have it (any more). */
  | { state: "unavailable"; reason: string }
  /** The source could not be asked; nothing is known either way. */
  | { state: "unchecked"; reason: string };

export interface ResolveOptions {
  /** Hosts requests may go to, and hosts a resolved file may be served from. */
  allowedHosts: string[];
  kiwixCatalogUrl?: string;
  signal?: AbortSignal;
  /**
   * Take a file's manifest details on trust when the manifest pins both its size and
   * its checksum, and do not contact the publisher. The download itself checks both, so
   * asking first only adds requests to someone else's server. A refresh does this; the
   * maintainers' online check does not.
   */
  trustPinned?: boolean;
  /** Leave at least this long between requests to one host, as publishers' crawl delays ask. */
  hostIntervalMs?: number;
}

type KiwixEntry = LoadedEntry & { source: { type: "kiwix" } };

export const isKiwixEntry = (entry: LoadedEntry): entry is KiwixEntry => entry.source.type === "kiwix";

const isEnglish = (language: string) => /^en(-|$)/i.test(language);

/** fetch() wraps refusals by Outpost's own guards ("fetch failed"); the reason is underneath. */
export function underlyingAppError(error: unknown): AppError | undefined {
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause; depth += 1) {
    if (cause instanceof AppError) return cause;
    cause = (cause as { cause?: unknown }).cause;
  }
  return undefined;
}

const reasonOf = (error: unknown): string => underlyingAppError(error)?.message ?? messageOf(error);

export function bookResolution(book: KiwixBook, exact?: { sizeBytes?: number }): CachedResolution {
  return {
    availability: "available",
    title: book.title,
    summary: book.summary,
    sizeBytes: exact?.sizeBytes ?? book.sizeBytes ?? undefined,
    sizeExact: exact?.sizeBytes !== undefined,
    version: book.version ?? undefined,
    publishedAt: book.updated || undefined,
    articleCount: book.articleCount ?? undefined,
    mediaCount: book.mediaCount ?? undefined,
    url: book.fileUrl,
    uuid: book.uuid,
  };
}

export function notListedReason(entry: KiwixEntry): string {
  const edition = entry.source.flavour ? ` in the "${entry.source.flavour}" edition` : "";
  return `The Kiwix library no longer lists a book named "${entry.source.name}"${edition}. It may have been renamed or withdrawn.`;
}

/** A file is only usable if a manifest (or the server's configuration) allows the host serving it. */
export function hostProblem(address: string, allowedHosts: string[]): string | undefined {
  const host = new URL(address).hostname.toLowerCase();
  return allowedHosts.includes(host)
    ? undefined
    : `The source now serves this file from ${host}, which no catalogue manifest lists as a download host.`;
}

async function resolveKiwix(http: HttpClient, entries: KiwixEntry[], options: ResolveOptions, out: Map<string, EntryResolution>) {
  if (entries.length === 0) return;
  const request = { catalogUrl: options.kiwixCatalogUrl, allowedHosts: options.allowedHosts, signal: options.signal };
  // One request covers every English book; that is nearly all of a typical catalogue.
  const english = entries.some((entry) => isEnglish(entry.language)) ? await fetchBooks(http, { lang: "eng" }, request) : [];
  // Books in other languages, and any the big list did not have, are asked for by name.
  const byName = new Map<string, Promise<KiwixBook[]>>();

  for (const entry of entries) {
    const { name, flavour } = entry.source;
    let book = pickBook(english, name, flavour);
    if (!book) {
      try {
        if (!byName.has(name)) byName.set(name, fetchBooks(http, { name }, request));
        book = pickBook(await byName.get(name)!, name, flavour);
      } catch (error) {
        if (classifyNetworkError(error) === "offline") throw error;
        out.set(entry.id, { state: "unchecked", reason: reasonOf(error) });
        continue;
      }
    }
    const problem = book ? hostProblem(book.fileUrl, options.allowedHosts) : notListedReason(entry);
    out.set(
      entry.id,
      book && !problem ? { state: "available", resolved: bookResolution(book) } : { state: "unavailable", reason: problem! },
    );
  }
}

type HttpEntry = LoadedEntry & { source: { type: "http" } };

const isHttpEntry = (entry: LoadedEntry): entry is HttpEntry => entry.source.type === "http";

function fromManifest(source: HttpEntry["source"], sizeBytes = source.sizeBytes): EntryResolution {
  return {
    state: "available",
    resolved: {
      availability: "available",
      sizeBytes,
      sizeExact: sizeBytes !== undefined,
      version: source.version,
      publishedAt: source.published,
    },
  };
}

/** The whole file's size from a response: Content-Range's total for a partial answer, else Content-Length. */
function sizeFrom(response: Response): number | undefined {
  const total = /\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1];
  const length = response.status === 206 ? total : (total ?? response.headers.get("content-length"));
  return length && /^\d+$/.test(length) ? Number(length) : undefined;
}

async function resolveHttp(http: HttpClient, entry: HttpEntry, options: ResolveOptions): Promise<EntryResolution> {
  const source = entry.source;
  const request = { allowedHosts: options.allowedHosts, signal: options.signal };
  let { response } = await http.fetch(source.url, { ...request, method: "HEAD" });
  await response.body?.cancel();
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    // Some servers refuse HEAD, or answer it with an error, while serving the file
    // normally. Asking for the first byte settles it without fetching the file.
    ({ response } = await http.fetch(source.url, { ...request, method: "GET", headers: { range: "bytes=0-0" } }));
    await response.body?.cancel();
  }
  if (response.status === 404 || response.status === 410) {
    return { state: "unavailable", reason: "The file is no longer at the address this entry gives." };
  }
  if (!response.ok) {
    return { state: "unchecked", reason: `${new URL(source.url).hostname} answered HTTP ${response.status}.` };
  }
  return fromManifest(source, source.sizeBytes ?? sizeFrom(response));
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * Entries in an order that visits hosts in turn, so that waiting out one host's
 * interval is spent asking the others.
 */
function interleavedByHost(entries: HttpEntry[]): HttpEntry[] {
  const turn = new Map<string, number>();
  return entries
    .map((entry, index) => {
      const host = new URL(entry.source.url).host;
      const round = turn.get(host) ?? 0;
      turn.set(host, round + 1);
      return { entry, round, index };
    })
    .sort((a, b) => a.round - b.round || a.index - b.index)
    .map((item) => item.entry);
}

/**
 * Looks up every entry. Throws only when nothing can be learned at all (no connection,
 * or the Kiwix library not answering); trouble with a single entry is reported for
 * that entry as "unchecked".
 */
export async function resolveEntries(
  http: HttpClient,
  entries: LoadedEntry[],
  options: ResolveOptions,
): Promise<Map<string, EntryResolution>> {
  const out = new Map<string, EntryResolution>();
  for (const entry of entries) {
    // A file that ships with Outpost was found on disk when the manifest was loaded; there is nobody to ask.
    if (entry.source.type === "bundled") {
      const { version, published } = entry.source;
      out.set(entry.id, { state: "available", resolved: { availability: "available", version, publishedAt: published } });
    }
  }
  await resolveKiwix(http, entries.filter(isKiwixEntry), options, out);
  const direct = entries.filter(isHttpEntry);
  const toAsk: HttpEntry[] = [];
  for (const entry of direct) {
    if (options.trustPinned && entry.source.sha256 && entry.source.sizeBytes) out.set(entry.id, fromManifest(entry.source));
    else toAsk.push(entry);
  }
  const lastAsked = new Map<string, number>();
  for (const entry of options.hostIntervalMs ? interleavedByHost(toAsk) : toAsk) {
    const host = new URL(entry.source.url).host;
    const wait = (lastAsked.get(host) ?? Number.NEGATIVE_INFINITY) + (options.hostIntervalMs ?? 0) - Date.now();
    try {
      if (wait > 0) await sleep(wait, options.signal);
      lastAsked.set(host, Date.now());
      out.set(entry.id, await resolveHttp(http, entry, options));
    } catch (error) {
      if (classifyNetworkError(error) === "offline") throw error;
      out.set(entry.id, { state: "unchecked", reason: reasonOf(error) });
    }
  }
  // Report in the order the entries were given, whatever order they were asked in.
  return new Map(entries.filter((entry) => out.has(entry.id)).map((entry) => [entry.id, out.get(entry.id)!]));
}

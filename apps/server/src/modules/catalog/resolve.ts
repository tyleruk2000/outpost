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

async function resolveHttp(http: HttpClient, entry: LoadedEntry, options: ResolveOptions): Promise<EntryResolution> {
  if (entry.source.type !== "http") throw new Error("not an http entry");
  const source = entry.source;
  const { response } = await http.fetch(source.url, { method: "HEAD", allowedHosts: options.allowedHosts, signal: options.signal });
  await response.body?.cancel();
  if (response.status === 404 || response.status === 410) {
    return { state: "unavailable", reason: "The file is no longer at the address this entry gives." };
  }
  if (!response.ok) {
    // Some servers refuse HEAD; that says nothing about the file.
    return { state: "unchecked", reason: `${new URL(source.url).hostname} answered HTTP ${response.status}.` };
  }
  const length = response.headers.get("content-length");
  const sizeBytes = source.sizeBytes ?? (length && /^\d+$/.test(length) ? Number(length) : undefined);
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
  await resolveKiwix(http, entries.filter(isKiwixEntry), options, out);
  for (const entry of entries) {
    if (entry.source.type !== "http") continue;
    try {
      out.set(entry.id, await resolveHttp(http, entry, options));
    } catch (error) {
      if (classifyNetworkError(error) === "offline") throw error;
      out.set(entry.id, { state: "unchecked", reason: reasonOf(error) });
    }
  }
  return out;
}

/**
 * Finding books in the Kiwix library.
 *
 * Manifests name a book ("wikipedia_en_all") and a flavour ("maxi"); they never hold a
 * file address, because Kiwix republishes most books every month or two and keeps only
 * the latest couple of builds. The address is looked up in the library's OPDS feed
 * right before it is needed.
 *
 * What the feed does and does not do (checked against the live service):
 *  - `name=<book>` returns every flavour of the book; there is no flavour filter, so
 *    the flavour is matched here. It is often the empty string.
 *  - `lang=eng&count=-1` returns every English book in one response.
 *  - The acquisition link points at "<file>.zim.meta4"; the file is that address
 *    without ".meta4". Its `length` is rounded; the exact size and the SHA-256 are in
 *    "<file>.zim.sha256" and in the .meta4 (Metalink) document.
 */
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";

export const KIWIX_CATALOG_URL = "https://opds.library.kiwix.org/catalog/v2/entries";

const ACQUISITION_REL = "http://opds-spec.org/acquisition/open-access";
const ZIM_TYPE = "application/x-zim";

export interface KiwixBook {
  uuid: string;
  name: string;
  /** "" when the book has a single edition. */
  flavour: string;
  title: string;
  summary: string;
  /** ISO 639-3 codes, comma separated when there are several ("eng", "eng,fra"). */
  language: string;
  /** ISO timestamp of the build. */
  updated: string;
  articleCount: number | null;
  mediaCount: number | null;
  /** Direct address of the .zim file. Short-lived: never store it for later. */
  fileUrl: string;
  fileName: string;
  /** Rounded by the feed; see `fetchFileFacts` for the exact figure. */
  sizeBytes: number | null;
  /** The build date in the file name, e.g. "2026-08". */
  version: string | null;
}

interface RawLink {
  "@_rel"?: string;
  "@_type"?: string;
  "@_href"?: string;
  "@_length"?: string;
}

interface RawEntry {
  id?: string;
  title?: string;
  summary?: string;
  language?: string;
  name?: string;
  flavour?: string;
  updated?: string;
  articleCount?: string;
  mediaCount?: string;
  link?: RawLink[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep everything as text: a book called "100" must stay a string.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "entry" || name === "link",
});

const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

function count(value: unknown): number | null {
  const raw = text(value);
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** "wikipedia_en_100_2026-08.zim" → "2026-08". */
export function versionFromFileName(fileName: string): string | null {
  return /_(\d{4}-\d{2}(?:-\d{2})?)\.zim$/.exec(fileName)?.[1] ?? null;
}

function toBook(entry: RawEntry): KiwixBook | undefined {
  const link = entry.link?.find((candidate) => candidate["@_rel"] === ACQUISITION_REL && candidate["@_type"] === ZIM_TYPE);
  const href = link?.["@_href"];
  const name = text(entry.name);
  if (!href || !name) return undefined;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  // The link is to the Metalink description; the file itself is the same address without it.
  url.pathname = url.pathname.replace(/\.meta4$/, "");
  const fileName = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (!fileName.endsWith(".zim")) return undefined;
  return {
    uuid: text(entry.id).replace(/^urn:uuid:/, ""),
    name,
    flavour: text(entry.flavour),
    title: text(entry.title),
    summary: text(entry.summary),
    language: text(entry.language),
    updated: text(entry.updated),
    articleCount: count(entry.articleCount),
    mediaCount: count(entry.mediaCount),
    fileUrl: url.toString(),
    fileName,
    sizeBytes: count(link?.["@_length"]),
    version: versionFromFileName(fileName),
  };
}

/** Books in an OPDS acquisition feed. Entries without a ZIM download are left out. */
export function parseOpdsFeed(xml: string): KiwixBook[] {
  let document: { feed?: { entry?: RawEntry[] } };
  try {
    document = parser.parse(xml) as typeof document;
  } catch (error) {
    throw new AppError("upstream", `The Kiwix library sent an answer Outpost could not read (${(error as Error).message}).`);
  }
  if (!document.feed) throw new AppError("upstream", "The Kiwix library sent an answer Outpost could not read (it is not an OPDS feed).");
  const books: KiwixBook[] = [];
  for (const entry of document.feed.entry ?? []) {
    const book = toBook(entry);
    if (book) books.push(book);
  }
  return books;
}

/**
 * The book with exactly this name and flavour. Names are meant to be unique per
 * flavour, but the feed can briefly list two builds; the newest one wins.
 */
export function pickBook(books: Iterable<KiwixBook>, name: string, flavour: string): KiwixBook | undefined {
  let best: KiwixBook | undefined;
  for (const book of books) {
    if (book.name !== name || book.flavour !== flavour) continue;
    if (!best || book.updated > best.updated || (book.updated === best.updated && (book.version ?? "") > (best.version ?? ""))) {
      best = book;
    }
  }
  return best;
}

/** First hash in a "<hex>  <filename>" checksum file. */
export function parseSha256File(content: string): string | undefined {
  return /^([0-9a-fA-F]{64})(?:\s|$)/.exec(content.trim())?.[1]?.toLowerCase();
}

/**
 * Size and SHA-256 from a Metalink document. Read with expressions rather than a full
 * parse: for a 100 GB file the document carries tens of thousands of piece hashes.
 */
export function parseMetalink(xml: string): { sizeBytes?: number; sha256?: string } {
  const size = /<size>\s*(\d+)\s*<\/size>/.exec(xml)?.[1];
  const hash = /<hash\s+type="sha-256">\s*([0-9a-fA-F]{64})\s*<\/hash>/.exec(xml)?.[1];
  return { sizeBytes: size ? Number(size) : undefined, sha256: hash?.toLowerCase() };
}

export interface KiwixRequestOptions {
  /** OPDS entries endpoint; overridden in tests. */
  catalogUrl?: string;
  allowedHosts?: Iterable<string>;
  signal?: AbortSignal;
}

/** Reads a response body as text, refusing to buffer more than `maxBytes`. */
async function readText(response: { body: ReadableStream<Uint8Array> | null }, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const decoder = new TextDecoder();
  let out = "";
  let seen = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    seen += chunk.length;
    if (seen > maxBytes) throw new AppError("upstream", "The answer from the server was far larger than expected, so it was not read.");
    out += decoder.decode(chunk, { stream: true });
  }
  return out + decoder.decode();
}

async function getText(http: HttpClient, url: string, options: KiwixRequestOptions, maxBytes: number): Promise<string> {
  const { response } = await http.fetch(url, {
    allowedHosts: options.allowedHosts,
    signal: options.signal,
    headers: { accept: "application/atom+xml, application/xml, text/plain, */*" },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError("upstream", `${new URL(url).hostname} answered with an error (HTTP ${response.status}). Try again later.`, {
      status: response.status,
    });
  }
  return readText(response as never, maxBytes);
}

const isHttpStatusError = (error: unknown): boolean =>
  error instanceof AppError && error.code === "upstream" && typeof error.details?.status === "number";

/**
 * One request to the library. `{ lang: "eng" }` lists every English book;
 * `{ name }` lists every flavour of one book.
 */
export async function fetchBooks(
  http: HttpClient,
  query: { name?: string; lang?: string },
  options: KiwixRequestOptions = {},
): Promise<KiwixBook[]> {
  const url = new URL(options.catalogUrl ?? KIWIX_CATALOG_URL);
  if (query.name) url.searchParams.set("name", query.name);
  if (query.lang) url.searchParams.set("lang", query.lang);
  // Without this the feed stops after the first ten entries.
  url.searchParams.set("count", "-1");
  return parseOpdsFeed(await getText(http, url.toString(), options, 64 * 1024 * 1024));
}

/**
 * Exact size and checksum of a book's file, from the small files published next to it.
 * The checksum file is tried first; the Metalink document supplies the size and is the
 * fallback for the checksum. Either may be missing from the result if both fail.
 */
export async function fetchFileFacts(
  http: HttpClient,
  book: Pick<KiwixBook, "fileUrl">,
  options: KiwixRequestOptions = {},
): Promise<{ sizeBytes?: number; sha256?: string }> {
  const [checksum, metalink] = await Promise.allSettled([
    getText(http, `${book.fileUrl}.sha256`, options, 64 * 1024).then(parseSha256File),
    getText(http, `${book.fileUrl}.meta4`, options, 16 * 1024 * 1024).then(parseMetalink),
  ]);
  const fromMetalink = metalink.status === "fulfilled" ? metalink.value : {};
  const sha256 = (checksum.status === "fulfilled" ? checksum.value : undefined) ?? fromMetalink.sha256;
  if (!sha256) {
    // "The server has no such file" is an answer; not reaching the server is a failure
    // the caller should hear about as what it is (offline, blocked, …).
    for (const result of [checksum, metalink]) {
      if (result.status === "rejected" && !isHttpStatusError(result.reason)) throw result.reason;
    }
  }
  return { sizeBytes: fromMetalink.sizeBytes, sha256 };
}

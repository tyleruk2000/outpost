/**
 * Fetching one thing from the web, held to a size and a time.
 *
 * Every request goes through the guarded download client (`core/http.ts`), which is
 * what refuses addresses on this computer or a private network, at connect time and on
 * each redirect. This file adds the two limits a saved page needs, and turns what can
 * go wrong into a sentence a person can act on.
 *
 * What is sent is the client's plain name and the kinds of content wanted. There is
 * no cookie jar and no referrer: each request, redirects included, starts from nothing.
 */
import { AppError, classifyNetworkError, messageOf } from "../../core/errors.ts";
import { BlockedAddressError, type HttpClient } from "../../core/http.ts";

export interface LimitedFetch {
  /** What to ask for, as an `Accept` header. */
  accept: string;
  maxBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** How the thing is named in a message: "the page", "a picture". */
  what: string;
}

export interface Fetched {
  status: number;
  /** The address the answer came from, after redirects. */
  url: string;
  contentType: string | null;
  /** The body, for a 2xx answer; empty otherwise. */
  bytes: Buffer;
}

export class TooLargeError extends AppError {
  constructor(what: string, maxBytes: number) {
    super("too_large", `${what} is larger than ${megabytes(maxBytes)}, which is the most Outpost fetches for it, so it was not saved.`, {
      maxBytes,
    });
  }
}

export class TooSlowError extends AppError {
  constructor(what: string, timeoutMs: number) {
    super(
      "upstream",
      `${what} did not arrive within ${Math.round(timeoutMs / 1000)} seconds, so Outpost stopped waiting. The site may be slow or not answering; try again later.`,
    );
  }
}

export class PrivateAddressError extends AppError {
  constructor(what: string) {
    super(
      "forbidden",
      `${what} is at, or redirects to, an address on this computer or a private network. Outpost only fetches from the public internet, so it was not fetched.`,
    );
  }
}

export function megabytes(bytes: number): string {
  const value = bytes / (1024 * 1024);
  return `${Number.isInteger(value) ? value : value.toFixed(1)} MB`;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return "the site";
  }
}

/**
 * Fetches `address` and reads the body up to `maxBytes`. An answer that is not a
 * success comes back with its status and no body, for the caller to describe.
 * Throws `AppError` for everything else, and rethrows as it is when `signal` fired.
 */
export async function fetchLimited(client: HttpClient, address: string, options: LimitedFetch): Promise<Fetched> {
  const What = capital(options.what);
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const { response, url } = await client.fetch(address, { headers: { accept: options.accept }, signal });
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { status: response.status, url, contentType, bytes: Buffer.alloc(0) };
    }
    // The size a server states is only a reason to stop early. What is counted is what arrives.
    const stated = Number(response.headers.get("content-length"));
    if (Number.isFinite(stated) && stated > options.maxBytes && !response.headers.get("content-encoding")) {
      await response.body?.cancel().catch(() => undefined);
      throw new TooLargeError(What, options.maxBytes);
    }
    const pieces: Buffer[] = [];
    let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > options.maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new TooLargeError(What, options.maxBytes);
        }
        pieces.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      }
    }
    return { status: response.status, url, contentType, bytes: Buffer.concat(pieces, total) };
  } catch (error) {
    // Stopped by whoever asked (a cancelled job, a closed connection): theirs to explain.
    if (options.signal?.aborted) throw error;
    if (timeout.aborted) throw new TooSlowError(What, options.timeoutMs);
    if (error instanceof BlockedAddressError) throw new PrivateAddressError(What);
    if (error instanceof AppError) throw error;
    if (classifyNetworkError(error) === "offline") {
      throw new AppError(
        "offline",
        `Outpost could not reach ${hostOf(address)}. Saving a web page needs an internet connection; check the address and the connection, then try again.`,
      );
    }
    const cause = (error as { cause?: unknown }).cause;
    throw new AppError("upstream", `${What} could not be fetched from ${hostOf(address)} (${messageOf(cause ?? error)}).`);
  }
}

// ── Reading the bytes of a page as text ──

function decoder(label: string | undefined): InstanceType<typeof TextDecoder> | undefined {
  if (!label) return undefined;
  try {
    return new TextDecoder(label.trim().toLowerCase());
  } catch {
    // A character set this computer's Node does not know.
    return undefined;
  }
}

/** The character set named in a `Content-Type` header. */
function charsetOfHeader(contentType: string | null): string | undefined {
  return /;\s*charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType ?? "")?.[1];
}

/** The character set a page names for itself in its first lines, as a browser looks for it. */
function charsetOfMeta(bytes: Buffer): string | undefined {
  const start = bytes.subarray(0, 4096).toString("latin1");
  const direct = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(start)?.[1];
  // A page cannot be read far enough to find this line if it were really in UTF-16, so that claim is never true.
  return direct && !/^utf-?16/i.test(direct) ? direct : undefined;
}

/**
 * The text of a page. In the order a browser uses: a byte-order mark, then what the
 * server said, then what the page says of itself. With none of those it is read as
 * UTF-8, or as Windows-1252 (the web's old default) when it is not valid UTF-8.
 */
export function decodePage(bytes: Buffer, contentType: string | null): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const named = decoder(charsetOfHeader(contentType)) ?? decoder(charsetOfMeta(bytes));
  if (named) return named.decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// ── Whether an answer is a web page at all ──

const KINDS: Array<[RegExp, string]> = [
  [/^application\/pdf$/, "a PDF"],
  [/^application\/epub\+zip$/, "an e-book"],
  [/^image\//, "a picture"],
  [/^video\//, "a video"],
  [/^audio\//, "a sound recording"],
  [/^text\/plain$/, "a plain text file"],
  [/^text\/markdown$/, "a Markdown file"],
  [/^application\/(json|ld\+json)$/, "data (JSON)"],
  [/^(application|text)\/xml$/, "data (XML)"],
  [/^application\/(rss|atom)\+xml$/, "a news feed"],
  [/^application\/(zip|gzip|x-tar|x-7z-compressed)$/, "an archive"],
];

/** The media type alone, lower case: "text/html" from "Text/HTML; charset=utf-8". */
export const mediaType = (contentType: string | null) => (contentType ?? "").split(";")[0]!.trim().toLowerCase();

function looksLikeHtml(bytes: Buffer): boolean {
  if (bytes.subarray(0, 2048).includes(0)) return false;
  const start = bytes
    .subarray(0, 2048)
    .toString("latin1")
    .replace(/^ï»¿/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trimStart()
    .toLowerCase();
  return /^<(!doctype html|html|head|body|meta|title|div|p|h1|article|main)[\s>]/.test(start);
}

/** Throws `unsupported`, naming what was found, unless the answer is an HTML page. */
export function assertIsPage(fetched: Fetched): void {
  const type = mediaType(fetched.contentType);
  const html = type === "text/html" || type === "application/xhtml+xml";
  // A server that names no type, or only "some bytes", is given the benefit of a look.
  const unstated = type === "" || type === "application/octet-stream";
  if ((html || unstated) && looksLikeText(fetched.bytes) && (html || looksLikeHtml(fetched.bytes))) return;
  const kind = KINDS.find(([pattern]) => pattern.test(type))?.[1] ?? (type && !html ? `a file of the type ${type}` : "not a web page");
  throw new AppError(
    "unsupported",
    `That address holds ${kind}, not a web page, so there is no article to save from it. To keep a file, download it in your browser and add it to the Library.`,
    { contentType: type || null },
  );
}

/** No NUL bytes near the start: a page is text, whatever its character set (UTF-16 with its mark aside). */
function looksLikeText(bytes: Buffer): boolean {
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  return utf16 || !bytes.subarray(0, 2048).includes(0);
}

/** A sentence for an answer that was not a success. */
export function describeStatus(status: number, what: string): string {
  const What = capital(what);
  if (status === 401 || status === 403) {
    return `The site refused to send ${what} (it answered ${status}). It may want you to sign in, or it may turn away programs that are not browsers. Outpost does not sign in to sites.`;
  }
  if (status === 404 || status === 410) return `${What} is not there: the site answered ${status}, "not found".`;
  if (status === 429) return `The site said it is being asked too often (it answered 429). Wait a while before trying again.`;
  if (status >= 500) return `The site could not send ${what} (it answered ${status}, an error on its side). Try again later.`;
  return `The site did not send ${what}: it answered ${status}.`;
}

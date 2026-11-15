/** Small pieces of HTTP needed to serve original files: byte ranges and download names. */

export interface ByteRange {
  start: number;
  /** Inclusive, as in the Range header. */
  end: number;
}

/**
 * Reads a `Range` header against a file of `size` bytes.
 *
 * Returns the range to send, "unsatisfiable" when it lies wholly outside the file
 * (answer 416), or undefined when the header should be ignored and the whole file
 * sent. Requests for several ranges at once are ignored: answering them needs a
 * multipart body that no viewer Outpost ships asks for.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, first, last] = match;
  if (first === "" && last === "") return undefined;

  if (first === "") {
    // "bytes=-500": the last 500 bytes.
    const length = Number(last);
    if (length === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (!Number.isSafeInteger(start) || start >= size) return "unsatisfiable";
  if (last !== "" && Number(last) < start) return undefined;
  return { start, end };
}

/** True when an `If-None-Match` or `If-Range` header names this entity tag. */
export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value === etag || value === `W/${etag}`;
  });
}

/**
 * `Content-Disposition` with the file name in both forms: a plain ASCII fallback for
 * old clients and the RFC 5987 `filename*` that carries any Unicode name exactly.
 */
export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

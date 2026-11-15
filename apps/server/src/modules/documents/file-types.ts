/**
 * The file types the library accepts, and how each is recognised.
 *
 * A file is accepted only when its extension is on the list AND its first bytes look
 * like that type. The extension alone is a claim by whoever sent the file; the content
 * check is what stops an executable renamed to `.pdf` from being stored and offered
 * back to other people as a document. The MIME type always comes from this table.
 */
import path from "node:path";
import type { DocumentType } from "@outpost/shared";
import { AppError } from "../../core/errors.ts";

export interface FileFormat {
  /** Lower-case extension without the dot. */
  ext: string;
  type: DocumentType;
  mime: string;
  /** How the type is named in a message: "a PDF", "an EPUB book". */
  label: string;
  /** Whether the first bytes of a file look like this type. */
  matches(head: Buffer, complete: boolean): boolean;
}

/** Bytes of a file looked at to recognise its type. */
export const SNIFF_BYTES = 8192;

export const SUPPORTED_TYPES_TEXT =
  "PDF, EPUB, Markdown (.md), plain text (.txt, .csv, .json), HTML, and images (.png, .jpg, .gif, .webp, .svg)";

const MAX_NAME_LENGTH = 255;

export const DOCUMENT_TYPES = ["pdf", "markdown", "text", "html", "epub", "image"] as const satisfies readonly DocumentType[];

function startsWith(head: Buffer, signature: string | number[], offset = 0): boolean {
  const bytes = typeof signature === "string" ? Buffer.from(signature, "latin1") : Buffer.from(signature);
  return head.length >= offset + bytes.length && head.subarray(offset, offset + bytes.length).equals(bytes);
}

/**
 * Valid UTF-8 with no NUL bytes. When `complete` is false the buffer is only the start
 * of the file, so a multi-byte character cut off at the end is not an error.
 */
export function looksLikeUtf8Text(head: Buffer, complete: boolean): boolean {
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: !complete });
    return true;
  } catch {
    return false;
  }
}

// Readers accept a little junk before the header, so the same allowance is made here.
const isPdf = (head: Buffer) => head.subarray(0, 1024).includes("%PDF-");
const isZip = (head: Buffer) => startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
const isPng = (head: Buffer) => startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (head: Buffer) => startsWith(head, [0xff, 0xd8, 0xff]);
const isGif = (head: Buffer) => startsWith(head, "GIF87a") || startsWith(head, "GIF89a");
const isWebp = (head: Buffer) => startsWith(head, "RIFF") && startsWith(head, "WEBP", 8);

function isSvg(head: Buffer, complete: boolean): boolean {
  if (!looksLikeUtf8Text(head, complete)) return false;
  const text = head.toString("utf8").replace(/^﻿/, "").trimStart();
  return /<svg[\s>]/i.test(text) || text.startsWith("<?xml");
}

const text = (ext: string, type: DocumentType, mime: string, label: string): FileFormat => ({
  ext,
  type,
  mime,
  label,
  matches: looksLikeUtf8Text,
});

const formats: FileFormat[] = [
  { ext: "pdf", type: "pdf", mime: "application/pdf", label: "a PDF", matches: isPdf },
  // The zip signature is only the first test; `isEpubHead` and the archive check finish it.
  { ext: "epub", type: "epub", mime: "application/epub+zip", label: "an EPUB book", matches: isZip },
  text("md", "markdown", "text/markdown", "a Markdown file"),
  text("markdown", "markdown", "text/markdown", "a Markdown file"),
  text("txt", "text", "text/plain", "a text file"),
  text("csv", "text", "text/csv", "a CSV file"),
  text("json", "text", "application/json", "a JSON file"),
  text("html", "html", "text/html", "an HTML page"),
  text("htm", "html", "text/html", "an HTML page"),
  { ext: "png", type: "image", mime: "image/png", label: "a PNG image", matches: isPng },
  { ext: "jpg", type: "image", mime: "image/jpeg", label: "a JPEG image", matches: isJpeg },
  { ext: "jpeg", type: "image", mime: "image/jpeg", label: "a JPEG image", matches: isJpeg },
  { ext: "gif", type: "image", mime: "image/gif", label: "a GIF image", matches: isGif },
  { ext: "webp", type: "image", mime: "image/webp", label: "a WebP image", matches: isWebp },
  { ext: "svg", type: "image", mime: "image/svg+xml", label: "an SVG image", matches: isSvg },
];

const byExt = new Map(formats.map((format) => [format.ext, format]));

export function formatForExt(ext: string): FileFormat | undefined {
  return byExt.get(ext.toLowerCase());
}

export function extensionsOfType(type: DocumentType): string[] {
  return formats.filter((format) => format.type === type).map((format) => format.ext);
}

/**
 * The name shown for a file: its last path segment, without control characters. This
 * is for display and for the record; the name used on disk goes through `safeFileName`.
 */
export function displayName(raw: string | undefined): string {
  const segment = (raw ?? "").split(/[\\/]/).pop() ?? "";
  let cleaned = segment
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > MAX_NAME_LENGTH) {
    // Shorten the middle, not the end: the extension is what says what the file is.
    const ext = path.extname(cleaned).slice(0, 12);
    cleaned = cleaned.slice(0, MAX_NAME_LENGTH - ext.length).trimEnd() + ext;
  }
  return cleaned || "file";
}

export function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

/** Title a document starts with: its file name without the extension. */
export function defaultTitle(originalName: string): string {
  const ext = path.extname(originalName);
  const base = (ext ? originalName.slice(0, -ext.length) : originalName).trim();
  return base || originalName;
}

/** The format a file name claims, or an `unsupported` error naming what is accepted. */
export function formatForName(originalName: string): FileFormat {
  const ext = extensionOf(originalName);
  const format = ext ? byExt.get(ext) : undefined;
  if (format) return format;
  const what = ext
    ? `"${originalName}" is a .${ext} file, which the library cannot store.`
    : `"${originalName}" has no file extension, so Outpost cannot tell what kind of file it is.`;
  throw new AppError("unsupported", `${what} Supported types: ${SUPPORTED_TYPES_TEXT}.`, { ext });
}

/** Throws `unsupported` unless the first bytes of the file match what its name claims. */
export function assertContentMatches(format: FileFormat, head: Buffer, complete: boolean, originalName: string): void {
  if (head.length === 0) {
    throw new AppError("bad_request", `"${originalName}" is empty (0 bytes), so there is nothing to store.`);
  }
  if (format.matches(head, complete)) return;
  const textual = format.matches === looksLikeUtf8Text;
  const problem = textual
    ? `"${originalName}" is named like ${format.label}, but it is not UTF-8 text. If it is a text file, save it with UTF-8 encoding and try again.`
    : `"${originalName}" is named like ${format.label}, but its contents are not one. Check that the file opens on your computer and has the right extension.`;
  throw new AppError("unsupported", `${problem} Supported types: ${SUPPORTED_TYPES_TEXT}.`, { ext: format.ext });
}

const EPUB_MIME = "application/epub+zip";

/**
 * A well-formed EPUB starts with an uncompressed entry named `mimetype` holding
 * `application/epub+zip`, which puts both strings at fixed offsets in the first bytes.
 * EPUBs made by sloppier tools need the full archive check instead.
 */
export function isEpubHead(head: Buffer): boolean {
  return isZip(head) && startsWith(head, "mimetype", 30) && startsWith(head, EPUB_MIME, 38);
}

export function isEpubMimetype(content: string): boolean {
  return content.replace(/^﻿/, "").trim() === EPUB_MIME;
}

/**
 * How the original is handed back to a browser. Only types that cannot run script are
 * shown in place; everything else (HTML, SVG, EPUB) is a download, so that an uploaded
 * page can never act inside Outpost's origin even if the sandbox header were ignored.
 */
export function servedAs(format: FileFormat | undefined, forceDownload: boolean): { disposition: "inline" | "attachment"; contentType: string } {
  if (!format) return { disposition: "attachment", contentType: "application/octet-stream" };
  const utf8 = format.mime.startsWith("text/") || format.mime === "application/json" || format.mime === "image/svg+xml";
  const declared = utf8 ? `${format.mime}; charset=utf-8` : format.mime;
  if (forceDownload) return { disposition: "attachment", contentType: declared };
  if (format.type === "pdf") return { disposition: "inline", contentType: format.mime };
  if (format.type === "image" && format.ext !== "svg") return { disposition: "inline", contentType: format.mime };
  // Markdown, CSV and JSON are shown as plain text: readable, and never interpreted.
  if (format.type === "text" || format.type === "markdown") return { disposition: "inline", contentType: "text/plain; charset=utf-8" };
  return { disposition: "attachment", contentType: declared };
}

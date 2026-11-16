/**
 * Pictures carried inside a Markdown file.
 *
 * A document is one file: it is what gets checksummed, moved to another drive, backed
 * up and written to a portable drive. So a web page saved with its pictures keeps them
 * in the same file, the way plain Markdown allows. The text refers to a picture by a
 * label,
 *
 *     ![A boat on the lake][outpost-picture-1]
 *
 * and the file ends with one line per picture that says what the label stands for:
 *
 *     [outpost-picture-1]: data:image/jpeg;base64,/9j/4AAQ…
 *
 * Those lines are megabytes long, so nothing here hands them to the Markdown parser.
 * The text is read without them, and one picture at a time is read from its place in
 * the file. Only the closing run of such lines counts: a line of the same shape in the
 * middle of a file (in an example, say) is ordinary text.
 *
 * A picture is only ever a PNG, JPEG, GIF or WebP image, and is checked to be one when
 * it is written and again when it is read. The type sent to the browser comes from
 * that check, never from the file's own words.
 */
import fs from "node:fs";
import { AppError } from "../../core/errors.ts";
import { formatForExt } from "./file-types.ts";

export type PictureMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

const EXT_OF: Record<PictureMime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

/** The label a picture is referred to by: `outpost-picture-1` to `outpost-picture-9999`. */
export const PICTURE_LABEL = /^outpost-picture-([1-9]\d{0,3})$/;
export const pictureLabel = (number: number) => `outpost-picture-${number}`;

/** The start of a line that holds a picture. */
const LINE_HEAD = /^\[outpost-picture-([1-9]\d{0,3})\]: data:(image\/(?:png|jpeg|gif|webp));base64,/;
/** Enough of a line to hold its head. */
const HEAD_BYTES = 64;
/** The most lines looked at from the end of a file: every picture it could number, and blank lines among them. */
const MAX_CLOSING_LINES = 12_000;
/** The largest picture read back out of a file, in bytes of base64 (about 9 MB of picture). */
const MAX_ENCODED_BYTES = 12 * 1024 * 1024;

/** Which raster type these bytes are, by their first bytes; undefined for anything else. */
export function pictureTypeOf(bytes: Buffer): PictureMime | undefined {
  const head = bytes.subarray(0, 32);
  for (const mime of Object.keys(EXT_OF) as PictureMime[]) {
    if (formatForExt(EXT_OF[mime])?.matches(head, false)) return mime;
  }
  return undefined;
}

/** The closing lines of a file that carry these pictures, numbered from 1 in the order given. */
export function pictureLines(pictures: ReadonlyArray<{ mime: PictureMime; bytes: Buffer }>): string {
  if (pictures.length === 0) return "";
  const lines = pictures.map(
    (picture, index) => `[${pictureLabel(index + 1)}]: data:${picture.mime};base64,${picture.bytes.toString("base64")}`,
  );
  return `\n${lines.join("\n")}\n`;
}

/**
 * Where the closing run of picture lines begins in a piece of Markdown, or its length
 * when there is none. Works on the start of a file too: a last line cut short still
 * begins with its head.
 */
function pictureLinesStart(source: string): number {
  let start = source.length;
  let end = source.length;
  for (let lines = 0; end > 0 && lines < MAX_CLOSING_LINES; lines += 1) {
    const lineStart = source.lastIndexOf("\n", end - 1) + 1;
    const head = source.slice(lineStart, Math.min(end, lineStart + HEAD_BYTES));
    if (LINE_HEAD.test(head)) start = lineStart;
    else if (head.trim() !== "") break;
    end = lineStart - 1;
  }
  return start;
}

/**
 * Markdown without its picture data, for a parser. Each label the text uses is given a
 * short stand-in, so a reference to a picture is still read as one.
 */
export function withoutPictureData(source: string): string {
  const start = pictureLinesStart(source);
  if (start === source.length && !source.includes("][outpost-picture-")) return source;
  const text = source.slice(0, start);
  const used = new Set<string>();
  for (const match of text.matchAll(/\]\[(outpost-picture-[1-9]\d{0,3})\]/g)) used.add(match[1]!);
  if (used.size === 0) return text;
  return `${text.trimEnd()}\n\n${[...used].map((label) => `[${label}]: #`).join("\n")}\n`;
}

interface PictureEntry {
  mime: PictureMime;
  /** Where the base64 data starts in the file, and how many bytes of it there are. */
  start: number;
  length: number;
}

export interface PictureIndex {
  /** Bytes of the file before its picture lines: the text. */
  textBytes: number;
  pictures: Map<number, PictureEntry>;
}

const indexes = new Map<string, { size: number; mtimeMs: number; index: PictureIndex }>();
const MAX_INDEXES = 64;

async function readAt(handle: fs.promises.FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, position + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buffer.subarray(0, read);
}

/**
 * The position just after the last line break before `end`, reading backwards. The
 * pieces start small and grow, so a short line costs a short read and a picture's line
 * a few large ones.
 */
async function lineStartBefore(handle: fs.promises.FileHandle, end: number): Promise<number> {
  let piece = 4096;
  let upTo = end;
  while (upTo > 0) {
    const from = Math.max(0, upTo - piece);
    const found = (await readAt(handle, from, upTo - from)).lastIndexOf(0x0a);
    if (found !== -1) return from + found + 1;
    upTo = from;
    piece = Math.min(piece * 4, 1024 * 1024);
  }
  return 0;
}

async function scan(handle: fs.promises.FileHandle, size: number): Promise<PictureIndex> {
  const pictures = new Map<number, PictureEntry>();
  let textBytes = size;
  let end = size;
  for (let lines = 0; end > 0 && lines < MAX_CLOSING_LINES; lines += 1) {
    const lineStart = await lineStartBefore(handle, end);
    const head = (await readAt(handle, lineStart, Math.min(HEAD_BYTES, end - lineStart))).toString("latin1");
    const match = LINE_HEAD.exec(head);
    if (match) {
      const start = lineStart + match[0].length;
      // A file saved with Windows line endings has a carriage return before each break.
      const last = end > start ? (await readAt(handle, end - 1, 1))[0] : undefined;
      const number = Number(match[1]);
      if (!pictures.has(number))
        pictures.set(number, { mime: match[2] as PictureMime, start, length: end - start - (last === 0x0d ? 1 : 0) });
      textBytes = lineStart;
    } else if (head.trim() !== "") {
      break;
    }
    end = lineStart - 1;
  }
  return { textBytes, pictures };
}

/** Where the text of a Markdown file ends and where each of its pictures lies. Remembered until the file changes. */
export async function pictureIndex(file: string): Promise<PictureIndex> {
  const stat = await fs.promises.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new AppError("not_found", "The file is missing from its storage location.");
  const known = indexes.get(file);
  if (known && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return known.index;
  const handle = await fs.promises.open(file, "r");
  try {
    const index = await scan(handle, stat.size);
    indexes.delete(file);
    indexes.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, index });
    // The oldest goes first: a Map keeps the order things were put in.
    for (const key of indexes.keys()) {
      if (indexes.size <= MAX_INDEXES) break;
      indexes.delete(key);
    }
    return index;
  } finally {
    await handle.close();
  }
}

/** The text of a Markdown file, as bytes, without its picture lines. Refuses text longer than `maxBytes`. */
export async function readTextPart(
  file: string,
  maxBytes: number,
  tooLarge: () => AppError,
): Promise<{ bytes: Buffer; index: PictureIndex }> {
  const index = await pictureIndex(file);
  if (index.textBytes > maxBytes) throw tooLarge();
  const handle = await fs.promises.open(file, "r");
  try {
    return { bytes: await readAt(handle, 0, index.textBytes), index };
  } finally {
    await handle.close();
  }
}

/** One picture out of a Markdown file. Throws `not_found` when the file has no such picture or it is not an image. */
export async function readPicture(file: string, number: number): Promise<{ mime: PictureMime; bytes: Buffer }> {
  const missing = () => new AppError("not_found", "This document has no such picture.");
  const entry = (await pictureIndex(file)).pictures.get(number);
  if (!entry || entry.length <= 0 || entry.length > MAX_ENCODED_BYTES) throw missing();
  const handle = await fs.promises.open(file, "r");
  let encoded: Buffer;
  try {
    encoded = await readAt(handle, entry.start, entry.length);
  } finally {
    await handle.close();
  }
  const bytes = Buffer.from(encoded.toString("latin1"), "base64");
  // What the line calls itself is not taken on trust: the bytes say what they are.
  const mime = pictureTypeOf(bytes);
  if (!mime) throw missing();
  return { mime, bytes };
}

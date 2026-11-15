/**
 * Getting a file safely onto a storage location before it becomes a document.
 *
 * Whatever the source (an upload stream, a file another module already has on disk),
 * the bytes first land in `documents/.incoming/<random>.part` on the destination. Only
 * a complete, validated file is renamed into place, so a dropped connection or a full
 * disk can never leave half a document where the library would find it.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../../core/errors.ts";
import { assertContentMatches, type FileFormat, formatForName, SNIFF_BYTES } from "./file-types.ts";

export const INCOMING_DIR = "documents/.incoming";

export interface StagedFile {
  /** Absolute path of the file waiting to be moved into place. */
  partPath: string;
  /**
   * True for a `.part` file Outpost wrote, which is deleted if the file is refused.
   * False when this is a person's own file being moved in, which must be left alone.
   */
  owned: boolean;
  locationId: string;
  originalName: string;
  format: FileFormat;
  sha256: string;
  sizeBytes: number;
  /** The first bytes, kept for checks that need more than the signature (EPUB). */
  head: Buffer;
}

export function tooLarge(originalName: string, maxBytes: number): AppError {
  const megabytes = Math.floor(maxBytes / (1024 * 1024));
  return new AppError(
    "too_large",
    `"${originalName}" is larger than the ${megabytes.toLocaleString("en")} MB this server accepts per file. Whoever runs this server can raise the limit with OUTPOST_MAX_UPLOAD_MB.`,
    { maxBytes },
  );
}

/** Turns "disk full" into a message a person can act on; other errors pass through. */
export function describeWriteError(error: unknown, locationName: string): unknown {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "ENOSPC" || code === "EDQUOT") {
    return new AppError(
      "insufficient_space",
      `"${locationName}" is full. Free some space or choose another storage location, then try again.`,
    );
  }
  return error;
}

export async function newPartPath(locationPath: string): Promise<string> {
  const dir = path.join(locationPath, INCOMING_DIR);
  await fs.promises.mkdir(dir, { recursive: true });
  return path.join(dir, `${randomBytes(12).toString("hex")}.part`);
}

export async function discardPart(partPath: string): Promise<void> {
  await fs.promises.rm(partPath, { force: true }).catch(() => undefined);
}

export interface StageOptions {
  location: { id: string; name: string; path: string };
  originalName: string;
  maxBytes: number;
  /** True once the source has been cut short by an upstream size limit. */
  wasTruncated?: () => boolean;
}

/**
 * Streams `source` to a part file while hashing and counting it. The type is checked
 * as soon as enough bytes have arrived, before anything is written, so a file that is
 * not what its name claims never touches the disk. On any failure the part is removed
 * and the error is thrown; the caller decides what to do with the rest of the stream.
 */
export async function stageStream(source: AsyncIterable<Buffer>, options: StageOptions): Promise<StagedFile> {
  const { location, originalName, maxBytes } = options;
  const format = formatForName(originalName);
  const hash = createHash("sha256");
  let sizeBytes = 0;
  let head: Buffer = Buffer.alloc(0);
  let pending: Buffer[] | undefined = [];
  let partPath: string | undefined;
  let handle: fs.promises.FileHandle | undefined;

  const write = async (chunk: Buffer) => {
    let offset = 0;
    while (offset < chunk.length) offset += (await handle!.write(chunk, offset)).bytesWritten;
  };
  /** Checks the type against the first bytes, then opens the part file and catches up. */
  const begin = async (complete: boolean) => {
    head = Buffer.concat(pending!);
    pending = undefined;
    assertContentMatches(format, head.subarray(0, SNIFF_BYTES), complete, originalName);
    partPath = await newPartPath(location.path);
    handle = await fs.promises.open(partPath, "wx");
    await write(head);
    head = Buffer.from(head.subarray(0, SNIFF_BYTES));
  };

  try {
    for await (const chunk of source) {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) throw tooLarge(originalName, maxBytes);
      hash.update(chunk);
      if (pending) {
        pending.push(chunk);
        if (sizeBytes >= SNIFF_BYTES) await begin(false);
      } else {
        await write(chunk);
      }
    }
    if (options.wasTruncated?.()) throw tooLarge(originalName, maxBytes);
    if (pending) await begin(true);
    await handle!.close();
    handle = undefined;
    return { partPath: partPath!, owned: true, locationId: location.id, originalName, format, sha256: hash.digest("hex"), sizeBytes, head };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (partPath) await discardPart(partPath);
    throw describeWriteError(error, location.name);
  }
}

/** Reads up to `length` bytes from the start of a file. */
export async function readHead(file: string, length = SNIFF_BYTES): Promise<Buffer> {
  const handle = await fs.promises.open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const { bytesRead } = await handle.read(buffer, read, length - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

/** Moves a file, falling back to copy-then-delete when the two paths are on different drives. */
export async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.promises.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.promises.copyFile(from, to);
    await fs.promises.rm(from, { force: true });
  }
}

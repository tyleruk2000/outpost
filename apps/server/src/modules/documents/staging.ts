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
import { pipeline } from "node:stream/promises";
import { AppError } from "../../core/errors.ts";
import { READ_NO_FOLLOW } from "../../core/fs-safe.ts";
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
  /**
   * Set when the file is already where it is to stay, as a path inside the storage
   * location: it is recorded there and not moved into a folder of its own.
   */
  keepAt?: string;
  /**
   * For a person's own file (not `owned`): which file was read. The name is checked against it
   * again after the file is moved in or recorded, and nothing else is kept in its place.
   */
  identity?: FileIdentity;
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

/** Reads up to `length` bytes from the start of a file, by its path or through a handle already open (left open). */
export async function readHead(file: string | fs.promises.FileHandle, length = SNIFF_BYTES): Promise<Buffer> {
  const handle = typeof file === "string" ? await fs.promises.open(file, "r") : file;
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
    if (typeof file === "string") await handle.close();
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

/**
 * Which file a name was found to be when it was read, and as what: what it must still be when
 * it is kept, moved or removed. Device and inode say which file; size and modification time,
 * to the nanosecond, say it was not written to since.
 */
export interface FileIdentity {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
}

export const identityOf = (stat: fs.BigIntStats): FileIdentity => ({
  dev: stat.dev,
  ino: stat.ino,
  size: stat.size,
  mtimeNs: stat.mtimeNs,
});

const sameIdentity = (stat: fs.BigIntStats, expected: FileIdentity) =>
  stat.isFile() &&
  stat.dev === expected.dev &&
  stat.ino === expected.ino &&
  stat.size === expected.size &&
  stat.mtimeNs === expected.mtimeNs;

/** True when `file` is, by its own name and without following a link, the regular file `expected`, unchanged. */
export async function isSameFile(file: string, expected: FileIdentity): Promise<boolean> {
  const now = await fs.promises.lstat(file, { bigint: true }).catch(() => undefined);
  return Boolean(now && sameIdentity(now, expected));
}

export const changedWhileRead = (name: string) =>
  new AppError("conflict", `"${name}" changed while it was being read. Try again once it is no longer being written.`);

/** Said when what was moved in could not be put back without replacing something: where it is now. */
export const leftWhereMoved = (name: string, whereNow: string) =>
  new AppError(
    "conflict",
    `"${name}" changed while it was being added, and what was moved could not be put back without replacing what is at its old name now, so it was left at ${whereNow}. Nothing was added to the library.`,
  );

/**
 * Puts what was moved to `to` back at `from`, only if nothing is at `from` now: a hard link
 * never replaces a name that is taken, where a rename would. False when it could not be put
 * back (the name is taken, or the drive has no hard links); it is then still at `to`.
 */
export async function putBack(to: string, from: string): Promise<boolean> {
  try {
    await fs.promises.link(to, from);
  } catch {
    return false;
  }
  // Back at its own name; the second name inside Outpost's folder goes. Should that fail, both names are the same file.
  await fs.promises.unlink(to).catch(() => undefined);
  return true;
}

/**
 * Moves a person's own file in by name, then makes sure what was moved is the file that was
 * read. Node has no rename that refuses a link, so a link (or another file) swapped in in the
 * instant before the rename would otherwise be moved in and kept: it is checked after the
 * rename and put back where it was, without ever replacing what is there now; if it cannot be,
 * it is left where it was moved to and the error says where (`whereNow`).
 *
 * Across drives the copy is read through a handle opened without following links, and must
 * be unchanged from start to end; the original's name is then removed only while it is still
 * that file, unchanged. If it is not, it is left where it is (`leftAtSource`), and the copy,
 * which is of the file that was read, is kept.
 */
export async function moveOriginal(
  from: string,
  to: string,
  expected: FileIdentity,
  name: string,
  whereNow: string,
): Promise<{ leftAtSource: boolean }> {
  try {
    await fs.promises.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    const handle = await fs.promises.open(from, READ_NO_FOLLOW).catch(() => {
      throw changedWhileRead(name);
    });
    try {
      if (!sameIdentity(await handle.stat({ bigint: true }), expected)) throw changedWhileRead(name);
      await pipeline(handle.createReadStream({ start: 0, autoClose: false }), fs.createWriteStream(to, { flags: "wx" }));
      // Written to while it was copied: the copy may be half of each.
      if (!sameIdentity(await handle.stat({ bigint: true }), expected)) throw changedWhileRead(name);
      if (BigInt((await fs.promises.stat(to)).size) !== expected.size) throw changedWhileRead(name);
    } catch (copyError) {
      // Only Outpost's own copy, made with "wx" so that it can be nothing else, is removed.
      if ((copyError as NodeJS.ErrnoException).code !== "EEXIST") await fs.promises.rm(to, { force: true }).catch(() => undefined);
      throw copyError;
    } finally {
      await handle.close();
    }
    if (!(await isSameFile(from, expected))) return { leftAtSource: true };
    await fs.promises.unlink(from);
    return { leftAtSource: false };
  }
  if (await isSameFile(to, expected)) return { leftAtSource: false };
  if (await putBack(to, from)) throw changedWhileRead(name);
  throw leftWhereMoved(name, whereNow);
}

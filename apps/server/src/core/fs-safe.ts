/**
 * Path handling for anything that touches user-influenced names. Every file Outpost
 * reads or writes on behalf of a request goes through `resolveInside`, so a crafted
 * name can never reach outside the directory it was meant for.
 */
import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.ts";

/** True when `child` is `parent` or lies beneath it. Purely lexical; resolve first. */
export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Joins `relative` onto `root` and refuses any result that escapes `root`. */
export function resolveInside(root: string, relative: string): string {
  if (relative.includes("\0")) throw new AppError("bad_request", "That path is not valid.");
  const resolved = path.resolve(root, relative);
  if (!isInside(root, resolved)) throw new AppError("bad_request", "That path is outside the allowed folder.");
  return resolved;
}

/**
 * Like `resolveInside`, and also follows symbolic links for the part of the path that
 * already exists, so a link inside the root cannot point the write somewhere else.
 */
export function resolveInsideReal(root: string, relative: string): string {
  const resolved = resolveInside(root, relative);
  const realRoot = fs.realpathSync(root);
  let existing = resolved;
  const tail: string[] = [];
  while (!fs.existsSync(existing)) {
    tail.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const real = path.join(fs.realpathSync(existing), ...tail);
  if (!isInside(realRoot, real)) throw new AppError("bad_request", "That path is outside the allowed folder.");
  return real;
}

const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Turns an arbitrary name into one that is safe as a single path segment on macOS,
 * Linux, Windows, exFAT and SMB shares. Keeps Unicode letters; drops separators,
 * control characters and trailing dots or spaces.
 */
export function safeFileName(name: string, fallback = "file"): string {
  let cleaned = name
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  // Leading dots would hide the file or, as "..", mean the parent folder.
  cleaned = cleaned.replace(/^[. ]+/, "");
  if (!cleaned || reservedWindowsNames.test(cleaned.split(".")[0] ?? "")) cleaned = fallback;
  // Disks count a name in bytes (255 at most): 120 characters, and 240 bytes, whole characters only.
  if (cleaned.length > 120 || Buffer.byteLength(cleaned) > 240) {
    const ext = path.extname(cleaned).slice(0, 12);
    const stem = [...cleaned.slice(0, cleaned.length - path.extname(cleaned).length)];
    let kept = "";
    for (const character of stem) {
      if (kept.length + character.length + ext.length > 120 || Buffer.byteLength(kept + character + ext) > 240) break;
      kept += character;
    }
    cleaned = kept.trimEnd() + ext;
  }
  return cleaned;
}

/**
 * Flags for reading a file a person keeps: never through a link at its own name (O_NOFOLLOW),
 * and never waiting on a pipe put in its place (O_NONBLOCK, which changes nothing for a file).
 */
export const READ_NO_FOLLOW = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);

export const replacedByLink = () => new AppError("conflict", "This file has been replaced by a link, so Outpost will not open it.");
const replacedByNonFile = () =>
  new AppError("conflict", "This file has been replaced by something that is not a file, so Outpost will not open it.");

/**
 * Opens a file that a document, kept where a person put it, is recorded at: by its own name,
 * not through a link, and only if it is a regular file. Everything is then read through the
 * handle, so what was checked is what is read. A missing file throws its own error (ENOENT).
 */
export async function openRegularFile(file: string): Promise<{ handle: fs.promises.FileHandle; stat: fs.Stats }> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, READ_NO_FOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ELOOP on Linux and macOS, EMLINK on FreeBSD.
    if (code === "ELOOP" || code === "EMLINK") throw replacedByLink();
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw replacedByNonFile();
    return { handle, stat };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/** The whole of a file, read as `openRegularFile` reads it. */
export async function readRegularFile(file: string): Promise<Buffer> {
  const { handle } = await openRegularFile(file);
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Total size of a file or of everything under a directory. Missing paths count as 0. */
export async function sizeOnDisk(target: string): Promise<number> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of await fs.promises.readdir(target, { withFileTypes: true })) {
    total += await sizeOnDisk(path.join(target, entry.name));
  }
  return total;
}

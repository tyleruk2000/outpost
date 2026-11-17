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

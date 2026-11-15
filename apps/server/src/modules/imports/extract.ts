/**
 * Unpacking an uploaded ZIP archive into an import's staging folder, without trusting it.
 *
 * An archive is only a list of names and sizes that somebody else wrote, so every one
 * is checked before a byte lands on disk:
 *
 * - a name that climbs out of the folder (`../`), is absolute or holds a NUL byte means
 *   the archive was built to do harm, and the whole archive is refused;
 * - symbolic links and device files are never created (a link could point a later
 *   write somewhere else); they are listed as left out;
 * - the number of files, the total unpacked size, the size of each file and how much
 *   each one inflates are all capped, so a small upload cannot fill the disk.
 *
 * Declared sizes are checked first and the bytes that actually arrive are counted too,
 * because only those can be believed.
 */
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { formatBytes } from "@outpost/shared";
import yauzl from "yauzl";
import { AppError } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { isJunk, isZip } from "./names.ts";

export interface ExtractLimits {
  /** Files across the archive and the archives inside it. */
  maxEntries: number;
  /** Unpacked bytes across the archive and the archives inside it. */
  maxTotalBytes: number;
  /** A single unpacked file. Larger ones are left out, not refused. */
  maxFileBytes: number;
  /** How many times larger than its compressed form a file may be. DEFLATE tops out near 1030. */
  maxRatio: number;
  /** Files smaller than this are not held to the ratio: a short run of spaces compresses enormously and harms nobody. */
  ratioFloorBytes: number;
  /** Free space that unpacking must leave on the disk. */
  freeReserveBytes: number;
}

export const DEFAULT_EXTRACT_LIMITS: Omit<ExtractLimits, "maxFileBytes"> = {
  maxEntries: 50_000,
  maxTotalBytes: 8 * 1024 ** 3,
  maxRatio: 200,
  ratioFloorBytes: 1024 * 1024,
  freeReserveBytes: 512 * 1024 * 1024,
};

/** Running totals shared by an archive and the archives nested in it. */
export interface ExtractBudget {
  entries: number;
  bytes: number;
  /** The most bytes this import may unpack: the limit, or less when the disk is nearly full. */
  allowedBytes: number;
}

export interface ExtractResult {
  /** Files written, as paths relative to the destination, with `/` separators. */
  written: string[];
  /** Entries that were deliberately not unpacked, with the reason in plain words. */
  leftOut: Array<{ path: string; reason: string }>;
  /** Hidden and system files passed over without comment. */
  ignored: number;
}

export interface ExtractOptions {
  limits: ExtractLimits;
  budget: ExtractBudget;
  /** The archive's name as the person knows it, for messages. */
  label: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

const refused = (message: string) => new AppError("bad_request", message);

/** Thrown when an archive cannot be opened or read at all, as opposed to being refused for what it holds. */
export class UnreadableArchive extends AppError {
  constructor(label: string) {
    super(
      "bad_request",
      `"${label}" could not be read as a ZIP archive. It may be damaged or only partly downloaded. Export or compress it again, then upload the new file.`,
    );
    this.name = "UnreadableArchive";
  }
}

/** How much may be unpacked into `dir`: the configured limit, or what the disk can spare. */
export async function newBudget(dir: string, limits: ExtractLimits): Promise<ExtractBudget> {
  let allowedBytes = limits.maxTotalBytes;
  try {
    const stats = await fs.promises.statfs(dir);
    allowedBytes = Math.min(allowedBytes, Math.max(0, stats.bavail * stats.bsize - limits.freeReserveBytes));
  } catch {
    // Some filesystems cannot say how full they are; the fixed limit still applies.
  }
  return { entries: 0, bytes: 0, allowedBytes };
}

function open(file: string, label: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    // Names are decoded and judged below: left to itself the library would reject the
    // archive with a message about its internals instead of one a person can act on.
    yauzl.open(file, { lazyEntries: true, autoClose: false, decodeStrings: false, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(new UnreadableArchive(label));
      else resolve(zip);
    });
  });
}

/** The next entry of the archive, or null at the end. */
function nextEntry(zip: yauzl.ZipFile, label: string): Promise<yauzl.Entry | null> {
  return new Promise((resolve, reject) => {
    const done = (finish: () => void) => {
      zip.off("entry", onEntry);
      zip.off("end", onEnd);
      zip.off("error", onError);
      finish();
    };
    const onEntry = (entry: yauzl.Entry) => done(() => resolve(entry));
    const onEnd = () => done(() => resolve(null));
    const onError = () => done(() => reject(new UnreadableArchive(label)));
    zip.on("entry", onEntry);
    zip.on("end", onEnd);
    zip.on("error", onError);
    zip.readEntry();
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, label: string): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(new UnreadableArchive(label));
      else resolve(stream);
    });
  });
}

/**
 * The entry's name as a relative path with `/` separators. Throws for names that only
 * an archive made to escape its folder would contain.
 */
export function safeEntryName(raw: string, label: string): string {
  const hostile = () =>
    refused(
      `"${label}" contains a file whose name points outside the archive ("${raw.replaceAll("\0", "").slice(0, 80)}"). Outpost does not unpack archives like that.`,
    );
  if (raw.includes("\0")) throw hostile();
  // Windows tools write backslashes; both separators mean the same thing here.
  const name = raw.replaceAll("\\", "/");
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) throw hostile();
  const segments = name.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) throw hostile();
  return segments.join("/");
}

/** Counts the bytes passing through and stops the stream when they exceed what was promised. */
function counter(limit: number, onBytes: (bytes: number) => void, label: string): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      if (seen > limit) {
        callback(refused(`"${label}" holds more data than it declares. Outpost stopped unpacking it.`));
        return;
      }
      onBytes(chunk.length);
      callback(null, chunk);
    },
  });
}

/** Why a file could not be written although its name was acceptable. */
function writeProblem(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "EEXIST") return "Another file with the same name is already part of this import.";
  if (code === "ENOTDIR" || code === "EISDIR") return "Its name clashes with another file in the archive.";
  if (code === "ENAMETOOLONG") return "Its name is too long for this computer.";
  if (code === "EINVAL" || code === "EILSEQ") return "Its name contains characters this computer cannot store.";
  return undefined;
}

/**
 * Unpacks `zipPath` into `destDir`. Throws `AppError` when the archive is refused or
 * unreadable; the caller removes whatever was written so far.
 */
export async function extractArchive(zipPath: string, destDir: string, options: ExtractOptions): Promise<ExtractResult> {
  const { limits, budget, label, signal } = options;
  const result: ExtractResult = { written: [], leftOut: [], ignored: 0 };
  const zip = await open(zipPath, label);
  try {
    const tooMany = () =>
      refused(
        `"${label}" holds more than ${limits.maxEntries.toLocaleString("en")} files, which is more than Outpost imports at once. Split it into smaller archives.`,
      );
    // The count in the archive's own index is checked first so that an absurd archive is refused before any work.
    if (budget.entries + zip.entryCount > limits.maxEntries) throw tooMany();

    let seen = 0;
    for (let entry = await nextEntry(zip, label); entry; entry = await nextEntry(zip, label)) {
      signal?.throwIfAborted();
      seen += 1;
      options.onProgress?.(seen, zip.entryCount);
      const name = safeEntryName((entry.fileName as unknown as Buffer).toString("utf8"), label);
      if (!name || (entry.fileName as unknown as Buffer).at(-1) === 0x2f) continue; // a folder; folders are made as files need them

      budget.entries += 1;
      if (budget.entries > limits.maxEntries) throw tooMany();

      const type = (entry.externalFileAttributes >>> 16) & S_IFMT;
      if (type !== 0 && type !== S_IFREG) {
        if (type !== S_IFDIR) result.leftOut.push({ path: name, reason: "Symbolic links and special files are never unpacked." });
        continue;
      }
      if (isJunk(name)) {
        result.ignored += 1;
        continue;
      }
      if (entry.isEncrypted()) {
        throw refused(
          `"${label}" is protected with a password, so Outpost cannot read it. Make an archive without a password and upload that.`,
        );
      }
      if (!entry.canDecodeFileData()) {
        result.leftOut.push({ path: name, reason: "It is compressed in a way Outpost cannot unpack." });
        continue;
      }

      const size = entry.uncompressedSize;
      if (size >= limits.ratioFloorBytes && size / Math.max(1, entry.compressedSize) > limits.maxRatio) {
        throw refused(
          `"${label}" was refused: "${path.posix.basename(name)}" unpacks to ${formatBytes(size)} from ${formatBytes(entry.compressedSize)}, which is how an archive built to fill a disk looks.`,
        );
      }
      if (budget.bytes + size > budget.allowedBytes) {
        throw budget.allowedBytes < limits.maxTotalBytes
          ? new AppError(
              "insufficient_space",
              `There is not enough free space to unpack "${label}". Free some space where Outpost keeps its data, then upload it again.`,
            )
          : new AppError(
              "too_large",
              `"${label}" unpacks to more than ${formatBytes(limits.maxTotalBytes)}, which is more than Outpost imports at once. Split it into smaller archives.`,
            );
      }
      if (size > limits.maxFileBytes) {
        result.leftOut.push({
          path: name,
          reason: `It is larger than the ${formatBytes(limits.maxFileBytes)} this server accepts for one file.`,
        });
        continue;
      }

      const target = resolveInside(destDir, name);
      let wrote = 0;
      try {
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const source = await openEntry(zip, entry, label);
        // "wx": never write over a file that is already there. Two entries can carry the
        // same name, or names that differ only by case on a disk that ignores case.
        const out = fs.createWriteStream(target, { flags: "wx" });
        await pipeline(
          source,
          counter(size, (bytes) => (wrote += bytes), label),
          out,
          { signal },
        );
      } catch (error) {
        const reason = writeProblem(error);
        if (!reason) {
          // Whatever stopped the write, half a file must not be left to be imported.
          await fs.promises.rm(target, { force: true });
          if (error instanceof AppError || signal?.aborted) throw error;
          throw new UnreadableArchive(label);
        }
        result.leftOut.push({ path: name, reason });
        continue;
      }
      budget.bytes += wrote;
      result.written.push(name);
    }
  } finally {
    zip.close();
  }
  return result;
}

/**
 * Unpacks an archive and, one level down, the archives inside it. Notion splits a large
 * export into `…-Part-1.zip`, `…-Part-2.zip` inside the file it gives you; their
 * contents belong side by side, so each is unpacked where it lies and then removed.
 * An archive inside one of those is left as a file.
 */
export async function extractWithNested(zipPath: string, destDir: string, options: ExtractOptions): Promise<ExtractResult> {
  const outer = await extractArchive(zipPath, destDir, options);
  const result: ExtractResult = { written: [], leftOut: [...outer.leftOut], ignored: outer.ignored };

  for (const file of outer.written) {
    if (!isZip(file)) {
      result.written.push(file);
      continue;
    }
    const nestedPath = resolveInside(destDir, file);
    const folder = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
    let inner: ExtractResult;
    try {
      inner = await extractArchive(nestedPath, resolveInside(destDir, folder), {
        ...options,
        label: path.posix.basename(file),
        onProgress: undefined,
      });
    } catch (error) {
      if (!(error instanceof UnreadableArchive)) throw error;
      // A damaged archive inside a good one costs only itself.
      await fs.promises.rm(nestedPath, { force: true });
      result.leftOut.push({ path: file, reason: "This archive inside the upload is damaged and could not be opened." });
      continue;
    }
    await fs.promises.rm(nestedPath, { force: true });
    const prefix = folder ? `${folder}/` : "";
    result.written.push(...inner.written.map((name) => `${prefix}${name}`));
    result.leftOut.push(...inner.leftOut.map((entry) => ({ ...entry, path: `${prefix}${entry.path}` })));
    result.ignored += inner.ignored;
  }
  return result;
}

/**
 * Reading zip archives (EPUB books) without trusting them.
 *
 * Entries are only ever read into memory, never written to disk, so a crafted name has
 * nowhere to escape to; names with `..` or an absolute path are skipped all the same.
 * Reads are counted against a budget so that a small file which inflates to gigabytes
 * (a "zip bomb") is abandoned rather than read.
 */
import path from "node:path";
import yauzl from "yauzl";
import { ExtractionError } from "./extract-types.ts";
import { isEpubMimetype } from "./file-types.ts";

export const MAX_ZIP_ENTRIES = 20_000;
export const MAX_ZIP_TOTAL_BYTES = 512 * 1024 * 1024;

export interface ZipReader {
  has(name: string): boolean;
  /** Uncompressed size the archive declares for an entry. */
  sizeOf(name: string): number | undefined;
  /** Reads one entry. Throws when it is larger than `maxBytes` or the budget is spent. */
  read(name: string, maxBytes: number): Promise<Buffer>;
  close(): void;
}

function open(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    // decodeStrings is off because yauzl otherwise rejects the whole archive for one
    // suspicious name; names are decoded and filtered below instead.
    yauzl.open(file, { lazyEntries: true, autoClose: false, decodeStrings: false, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(new ExtractionError("This file is not a readable zip archive; it may be damaged."));
      else resolve(zip);
    });
  });
}

function isSafeName(name: string): boolean {
  if (!name || name.includes("\0") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split(/[\\/]/).includes("..");
}

function listEntries(zip: yauzl.ZipFile): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    let seen = 0;
    zip.on("error", () => reject(new ExtractionError("This archive is damaged and could not be read.")));
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry: yauzl.Entry) => {
      seen += 1;
      if (seen > MAX_ZIP_ENTRIES) {
        reject(new ExtractionError(`This archive holds more than ${MAX_ZIP_ENTRIES.toLocaleString("en")} files, which is more than Outpost will read.`));
        return;
      }
      const name = (entry.fileName as unknown as Buffer).toString("utf8");
      const isFolder = name.endsWith("/");
      if (!isFolder && isSafeName(name) && !entries.has(name)) entries.set(name, entry);
      zip.readEntry();
    });
    zip.readEntry();
  });
}

export async function openZip(file: string, totalBudget = MAX_ZIP_TOTAL_BYTES): Promise<ZipReader> {
  const zip = await open(file);
  let entries: Map<string, yauzl.Entry>;
  try {
    entries = await listEntries(zip);
  } catch (error) {
    zip.close();
    throw error;
  }
  let remaining = totalBudget;

  function read(name: string, maxBytes: number): Promise<Buffer> {
    const entry = entries.get(name);
    if (!entry) return Promise.reject(new ExtractionError(`The archive has no file named "${name}".`));
    if (entry.isEncrypted()) return Promise.reject(new ExtractionError(`"${name}" is encrypted.`));
    const limit = Math.min(maxBytes, remaining);
    if (entry.uncompressedSize > limit) {
      return Promise.reject(new ExtractionError(`"${path.posix.basename(name)}" is too large to read.`));
    }
    return new Promise((resolve, reject) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(new ExtractionError(`"${name}" could not be read from the archive.`));
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          // The declared size was checked above, but only the bytes that actually
          // arrive can be trusted.
          if (size > limit) {
            stream.destroy();
            reject(new ExtractionError(`"${path.posix.basename(name)}" is too large to read.`));
            return;
          }
          parts.push(chunk);
        });
        stream.on("error", () => reject(new ExtractionError(`"${name}" is damaged and could not be read.`)));
        stream.on("end", () => {
          remaining -= size;
          resolve(Buffer.concat(parts));
        });
      });
    });
  }

  return {
    has: (name) => entries.has(name),
    sizeOf: (name) => entries.get(name)?.uncompressedSize,
    read,
    close: () => zip.close(),
  };
}

/** Whether a zip file is an EPUB: its `mimetype` entry says `application/epub+zip`. */
export async function isEpubArchive(file: string): Promise<boolean> {
  let zip: ZipReader;
  try {
    zip = await openZip(file);
  } catch {
    return false;
  }
  try {
    return zip.has("mimetype") && isEpubMimetype((await zip.read("mimetype", 256)).toString("utf8"));
  } catch {
    return false;
  } finally {
    zip.close();
  }
}

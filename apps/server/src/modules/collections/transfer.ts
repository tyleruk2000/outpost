/**
 * Hashing and copying for collections, which are either one file (a ZIM archive, a
 * PMTiles extract) or a folder of files.
 *
 * A single file's digest is its plain SHA-256, so it can be compared with the checksum
 * a publisher gives. A folder's digest is a SHA-256 over the sorted list of
 * "relative path, file hash" pairs: it changes when any file changes, appears,
 * disappears or is renamed.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { sha256File } from "../../core/hashing.ts";
import { syncedWriteStream } from "../../core/synced-write.ts";

export interface TreeDigest {
  sha256: string;
  bytes: number;
  files: number;
}

export interface TransferOptions {
  signal?: AbortSignal;
  /** Total bytes handled so far, across all files. */
  onProgress?: (bytes: number) => void;
}

interface TreeFile {
  /** Path relative to the root, with forward slashes; "" when the root is itself a file. */
  rel: string;
  size: number;
}

/** Thrown when a folder holds something that cannot be copied faithfully (a link, a device). */
export class UnsupportedEntryError extends Error {
  constructor(entry: string) {
    super(`"${entry}" is a link or special file. Outpost only moves ordinary files and folders.`);
    this.name = "UnsupportedEntryError";
  }
}

async function walk(root: string, rel: string, files: TreeFile[], folders: string[]): Promise<void> {
  const entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      folders.push(child);
      await walk(root, child, files, folders);
    } else if (entry.isFile()) {
      files.push({ rel: child, size: (await fs.promises.stat(path.join(root, child))).size });
    } else {
      throw new UnsupportedEntryError(child);
    }
  }
}

interface Tree {
  isDirectory: boolean;
  files: TreeFile[];
  /** Sub-folders, parents before children, so that empty ones survive a copy too. */
  folders: string[];
}

/** Every file under `target`, in a stable order. */
async function listTree(target: string): Promise<Tree> {
  const stat = await fs.promises.lstat(target);
  if (stat.isFile()) return { isDirectory: false, files: [{ rel: "", size: stat.size }], folders: [] };
  if (!stat.isDirectory()) throw new UnsupportedEntryError(path.basename(target));
  const files: TreeFile[] = [];
  const folders: string[] = [];
  await walk(target, "", files, folders);
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { isDirectory: true, files, folders };
}

function combine(isDirectory: boolean, hashes: Array<{ rel: string; sha256: string }>): string {
  if (!isDirectory) return hashes[0]!.sha256;
  const hash = createHash("sha256");
  for (const entry of hashes) hash.update(`${entry.rel}\0${entry.sha256}\n`);
  return hash.digest("hex");
}

/** Digest of a file or folder as it is on disk now. */
export async function hashTree(target: string, options: TransferOptions = {}): Promise<TreeDigest> {
  const tree = await listTree(target);
  const hashes: Array<{ rel: string; sha256: string }> = [];
  let done = 0;
  for (const file of tree.files) {
    const sha256 = await sha256File(path.join(target, file.rel), {
      signal: options.signal,
      onProgress: (bytes) => options.onProgress?.(done + bytes),
    });
    done += file.size;
    hashes.push({ rel: file.rel, sha256 });
  }
  return { sha256: combine(tree.isDirectory, hashes), bytes: done, files: tree.files.length };
}

async function copyFileHashed(
  source: string,
  target: string,
  signal: AbortSignal | undefined,
  onBytes: (count: number) => void,
): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(
    fs.createReadStream(source, { highWaterMark: 1024 * 1024 }),
    async function* tap(chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        hash.update(chunk);
        onBytes(chunk.length);
        yield chunk;
      }
    },
    // `flush` asks the drive to really store the bytes before the copy is trusted.
    syncedWriteStream(target, { flags: "w", flush: true }),
    { signal },
  );
  return hash.digest("hex");
}

/**
 * Copies a file or folder to `target` and returns the digest of the bytes that were
 * read from the source. The caller compares it with `hashTree(target)` to know the
 * copy is faithful before trusting it.
 */
export async function copyTree(source: string, target: string, options: TransferOptions = {}): Promise<TreeDigest> {
  const tree = await listTree(source);
  const hashes: Array<{ rel: string; sha256: string }> = [];
  let done = 0;
  const onBytes = (count: number) => {
    done += count;
    options.onProgress?.(done);
  };
  if (tree.isDirectory) {
    await fs.promises.mkdir(target, { recursive: true });
    for (const folder of tree.folders) await fs.promises.mkdir(path.join(target, folder), { recursive: true });
  }
  for (const file of tree.files) {
    options.signal?.throwIfAborted();
    const to = path.join(target, file.rel);
    hashes.push({ rel: file.rel, sha256: await copyFileHashed(path.join(source, file.rel), to, options.signal, onBytes) });
  }
  return { sha256: combine(tree.isDirectory, hashes), bytes: done, files: tree.files.length };
}

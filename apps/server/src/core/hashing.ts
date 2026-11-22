import { createHash } from "node:crypto";
import fs from "node:fs";

type HashOptions = {
  signal?: AbortSignal;
  onProgress?: (bytes: number) => void;
  /** Given each piece of the file as it is read, in order: for a second check made in the same reading. */
  onChunk?: (chunk: Buffer) => void;
};

/**
 * Checksums of a file by several algorithms in one reading of it, as a stream so that
 * multi-gigabyte archives never sit in memory. `onProgress` receives the number of bytes
 * hashed so far.
 */
export async function hashFile<Algorithm extends string>(
  file: string | fs.promises.FileHandle,
  algorithms: readonly Algorithm[],
  options: HashOptions = {},
): Promise<Record<Algorithm, string>> {
  const hashes = algorithms.map((algorithm) => createHash(algorithm));
  let seen = 0;
  // A handle already open is read from its start and left open for whoever opened it.
  const stream =
    typeof file === "string"
      ? fs.createReadStream(file, { highWaterMark: 1024 * 1024, signal: options.signal })
      : file.createReadStream({ start: 0, highWaterMark: 1024 * 1024, signal: options.signal, autoClose: false });
  for await (const chunk of stream) {
    for (const hash of hashes) hash.update(chunk as Buffer);
    options.onChunk?.(chunk as Buffer);
    seen += (chunk as Buffer).length;
    options.onProgress?.(seen);
  }
  return Object.fromEntries(algorithms.map((algorithm, index) => [algorithm, hashes[index]!.digest("hex")])) as Record<Algorithm, string>;
}

/** SHA-256 of a file. */
export async function sha256File(file: string | fs.promises.FileHandle, options: HashOptions = {}): Promise<string> {
  return (await hashFile(file, ["sha256"], options)).sha256;
}

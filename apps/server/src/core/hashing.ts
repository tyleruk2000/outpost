import { createHash } from "node:crypto";
import fs from "node:fs";

/**
 * SHA-256 of a file, read as a stream so that multi-gigabyte archives never sit in
 * memory. `onProgress` receives the number of bytes hashed so far.
 */
export async function sha256File(
  file: string,
  options: { signal?: AbortSignal; onProgress?: (bytes: number) => void } = {},
): Promise<string> {
  const hash = createHash("sha256");
  let seen = 0;
  const stream = fs.createReadStream(file, { highWaterMark: 1024 * 1024, signal: options.signal });
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
    seen += (chunk as Buffer).length;
    options.onProgress?.(seen);
  }
  return hash.digest("hex");
}

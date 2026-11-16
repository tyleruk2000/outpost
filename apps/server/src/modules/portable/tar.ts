/**
 * Just enough of the tar format to pull one file out of a .tar.gz while it streams by,
 * so a 50 MB runtime archive never has to be unpacked to disk or held in memory.
 * Handles ustar names (with prefix), GNU long names and pax headers.
 */
import fs from "node:fs";
import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

const BLOCK = 512;

function text(block: Buffer, start: number, length: number): string {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

/**
 * Writes the first entry whose path matches `wanted` to `destination`. Resolves true
 * if it was found. The rest of the archive is read and discarded so the source stream
 * finishes cleanly.
 */
export async function extractOneFromTarGz(source: Readable, wanted: (entryPath: string) => boolean, destination: string): Promise<boolean> {
  const gunzip = createGunzip();
  source.on("error", (error) => gunzip.destroy(error));
  source.pipe(gunzip);

  let buffered: Buffer = Buffer.alloc(0);
  let remaining = 0; // bytes of the current entry's data still to consume
  let padding = 0;
  let output: fs.WriteStream | undefined;
  let longName: string | undefined;
  let collectingLongName: Buffer[] | undefined;
  let found = false;

  const writeChunk = (chunk: Buffer) =>
    new Promise<void>((resolve, reject) => {
      if (!output) return resolve();
      output.write(chunk, (error) => (error ? reject(error) : resolve()));
    });

  for await (const piece of gunzip) {
    buffered = buffered.length ? Buffer.concat([buffered, piece as Buffer]) : (piece as Buffer);
    for (;;) {
      if (remaining > 0) {
        if (buffered.length === 0) break;
        const take = Math.min(remaining, buffered.length);
        const chunk = buffered.subarray(0, take);
        if (collectingLongName) collectingLongName.push(Buffer.from(chunk));
        else await writeChunk(chunk);
        buffered = buffered.subarray(take);
        remaining -= take;
        if (remaining > 0) break;
        if (collectingLongName) {
          longName = Buffer.concat(collectingLongName).toString("utf8").replace(/\0+$/, "");
          collectingLongName = undefined;
        }
        if (output) {
          await new Promise<void>((resolve, reject) => output!.end((error?: Error | null) => (error ? reject(error) : resolve())));
          output = undefined;
        }
        continue;
      }
      if (padding > 0) {
        if (buffered.length < padding) break;
        buffered = buffered.subarray(padding);
        padding = 0;
        continue;
      }
      if (buffered.length < BLOCK) break;
      const header = buffered.subarray(0, BLOCK);
      buffered = buffered.subarray(BLOCK);
      if (header.every((byte) => byte === 0)) continue; // end-of-archive marker
      const size = Number.parseInt(text(header, 124, 12).trim() || "0", 8);
      const type = String.fromCharCode(header[156] ?? 48);
      const prefix = text(header, 345, 155);
      const name = longName ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
      remaining = size;
      padding = (BLOCK - (size % BLOCK)) % BLOCK;
      if (type === "L") {
        collectingLongName = [];
        continue;
      }
      longName = undefined;
      const isFile = type === "0" || type === "\0";
      if (isFile && !found && wanted(name)) {
        found = true;
        output = fs.createWriteStream(destination, { mode: 0o755 });
        // A write that fails reaches the callbacks of write() and end(), which reject; the
        // stream also emits "error", and without a listener that would end the process.
        output.on("error", () => undefined);
      }
      if (size === 0) remaining = 0;
    }
  }
  return found;
}

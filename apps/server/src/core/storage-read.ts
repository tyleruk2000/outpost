/**
 * Reading a file as the storage holds it, not as this computer remembers writing it.
 *
 * Linux keeps what was written to a file in memory (the page cache) and answers reads of
 * it from there. For a network share that memory can outlive the truth: on the first
 * Raspberry Pi (23 November 2026) a 2.29 GB country file written to a NAS share read back
 * from memory with Geofabrik's MD5, in seven seconds (no share answers that fast), while
 * the copy on the NAS itself had damage in it, found only when the roads were read from
 * it. A check that reads from memory checks nothing about the storage.
 *
 * So a file being checked is opened with O_DIRECT, which has the read go to the storage.
 * Not every file system takes it: some refuse the flag when the file is opened, and a
 * local disk refuses a read into memory that is not aligned to its blocks. Either way
 * the file is read as usual instead, which for a local disk is what it holds.
 */
import fs from "node:fs";

const CHUNK_BYTES = 1024 * 1024;

/** A file opened for reading, and whether its reads go past the page cache. */
export interface StorageHandle {
  handle: fs.promises.FileHandle;
  direct: boolean;
}

async function openFromStorage(file: string): Promise<StorageHandle> {
  const direct = fs.constants.O_DIRECT;
  if (typeof direct === "number" && direct !== 0) {
    try {
      return { handle: await fs.promises.open(file, fs.constants.O_RDONLY | direct), direct: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EINVAL") throw error;
    }
  }
  return { handle: await fs.promises.open(file, "r"), direct: false };
}

/** The seam tests stand in for: a storage whose page cache and contents differ cannot be made on a test machine. */
export const storageRead = { open: openFromStorage };

/** The file's bytes in order from the first, read from the storage where the system allows it. */
export async function* readFromStorage(file: string, signal?: AbortSignal): AsyncGenerator<Buffer> {
  let { handle, direct } = await storageRead.open(file);
  let position = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.allocUnsafeSlow(CHUNK_BYTES);
      let bytesRead: number;
      try {
        ({ bytesRead } = await handle.read(buffer, 0, CHUNK_BYTES, position));
      } catch (error) {
        if (!direct || (error as NodeJS.ErrnoException).code !== "EINVAL") throw error;
        // A local disk that wants aligned memory for O_DIRECT: what it holds is what an ordinary read gives.
        await handle.close();
        handle = await fs.promises.open(file, "r");
        direct = false;
        continue;
      }
      if (bytesRead === 0) return;
      position += bytesRead;
      yield buffer.subarray(0, bytesRead);
    }
  } finally {
    await handle.close();
  }
}

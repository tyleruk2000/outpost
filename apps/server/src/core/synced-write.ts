/**
 * A file write stream that hands what it wrote to the disk every 16 MB (`fdatasync`).
 *
 * Left to itself, Linux holds up to a fifth of the memory in writes not yet on the disk:
 * 1.6 GB on an 8 GB Raspberry Pi. On ext4 a small write to another file (the database)
 * then waits for that backlog to reach the disk first, and the database is written on the
 * server's own thread, so nothing else is answered meanwhile. Measured on the Pi's SD card
 * (18 November 2026), 2.4 GB written while the database was written each second: one
 * database write took 5.6 s as things were, 0.33 s with the big file handed over every
 * 16 MB, and the whole took about as long (58 s, against 31 s of which much was still in
 * memory when it "finished").
 *
 * Use it for anything that writes many megabytes: downloads, moves, copies, backups.
 */
import fs from "node:fs";
import { Writable } from "node:stream";

export const SYNC_EVERY_BYTES = 16 * 1024 * 1024;

type Options = Parameters<typeof fs.createWriteStream>[1];

/**
 * Writing in whole blocks, for a network share: what arrives is held until it reaches the next multiple of
 * `bytes` from the start of the file, and written as one, so no write ends part-way through a page of memory
 * and the next begins there. On the first Raspberry Pi (23 November 2026, a kernel with 16 KiB pages, a CIFS
 * share) a download written as it arrived came back with the rest of one page as zeros after a write that
 * ended inside it: bytes 7,044,587 to 7,045,120 of a 2.29 GB file, the end being a page boundary.
 */
export interface Blocks {
  bytes: number;
  /** Where in the file the first write goes: its length, when appending. */
  from: number;
}

export function syncedWriteStream(file: fs.PathLike, options?: Options, every = SYNC_EVERY_BYTES, blocks?: Blocks): Writable {
  const out = fs.createWriteStream(file, options);
  let since = 0;
  // What is held for the next whole block, and where the file ends on its storage.
  let held: Buffer[] = [];
  let heldBytes = 0;
  let at = blocks?.from ?? 0;
  const put = (chunk: Buffer, done: (error?: Error | null) => void) => {
    out.write(chunk, (error) => {
      if (error) return done(error);
      at += chunk.length;
      since += chunk.length;
      if (since >= every) sync(done);
      else done();
    });
  };
  const release = (done: (error?: Error | null) => void) => {
    if (heldBytes === 0) return done();
    const all = Buffer.concat(held, heldBytes);
    held = [];
    heldBytes = 0;
    put(all, done);
  };
  const sync = (done: (error?: Error | null) => void) => {
    since = 0;
    // A stand-in stream (as in tests) has no file descriptor: there is nothing to hand over.
    const fd = (out as unknown as { fd?: unknown }).fd;
    if (typeof fd !== "number") return done();
    fs.fdatasync(fd, (error) => done(error));
  };
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!blocks) return put(chunk, done);
      held.push(chunk);
      heldBytes += chunk.length;
      // Up to the last block boundary that what is held reaches; the rest waits for more.
      const end = at + heldBytes;
      const boundary = end - (end % blocks.bytes);
      if (boundary <= at) return done();
      const all = Buffer.concat(held, heldBytes);
      const take = boundary - at;
      held = take < all.length ? [all.subarray(take)] : [];
      heldBytes = all.length - take;
      put(all.subarray(0, take), done);
    },
    final(done) {
      release((error) => {
        if (error) return done(error);
        out.end((ended?: Error | null) => done(ended));
      });
    },
    destroy(error, done) {
      // Stopped part-way (a dropped connection, a pause): what arrived is still written, so the download continues after it.
      if (heldBytes === 0 || out.destroyed) {
        out.destroy(error ?? undefined);
        return done(error);
      }
      release(() => {
        out.destroy(error ?? undefined);
        done(error);
      });
    },
  });
  // A failure of the file (a full disk, a drive pulled out) is this stream's failure, never an uncaught one.
  out.on("error", (error) => stream.destroy(error));
  return stream;
}

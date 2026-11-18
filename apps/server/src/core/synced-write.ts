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

export function syncedWriteStream(file: fs.PathLike, options?: Options, every = SYNC_EVERY_BYTES): Writable {
  const out = fs.createWriteStream(file, options);
  let since = 0;
  const sync = (done: (error?: Error | null) => void) => {
    since = 0;
    // A stand-in stream (as in tests) has no file descriptor: there is nothing to hand over.
    const fd = (out as unknown as { fd?: unknown }).fd;
    if (typeof fd !== "number") return done();
    fs.fdatasync(fd, (error) => done(error));
  };
  return new Writable({
    write(chunk: Buffer, _encoding, done) {
      out.write(chunk, (error) => {
        if (error) return done(error);
        since += chunk.length;
        if (since >= every) sync(done);
        else done();
      });
    },
    final(done) {
      out.end((error?: Error | null) => done(error));
    },
    destroy(error, done) {
      out.destroy(error ?? undefined);
      done(error);
    },
  });
}

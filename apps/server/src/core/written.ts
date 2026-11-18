/**
 * What was written to a file, as it was handed to the storage: a checksum of each stretch,
 * to hold against what the storage gives back when the file is read.
 *
 * A published checksum says whether a finished file is the publisher's. It does not say
 * where the damage is, and many files have none. This record is made by Outpost itself
 * as the bytes arrive, so it holds for every file, and it says where: the first stretch
 * that reads back differently from what was written is what the storage lost, and only
 * from there on need be fetched again. (The first Raspberry Pi, 18 November 2026: 2.3 GB
 * written to a NAS share came back the right size with one 4 KiB block of zeros in it.)
 *
 * The checksum is CRC-32, which is for accidents and not for tampering: it catches a lost
 * or altered block in a stretch, and misses one in four thousand million. It is kept in
 * memory, a few bytes for each megabyte written, for as long as the server runs: what
 * was written before a restart is not covered by it.
 *
 * A file is either appended to, start to end (a download), or filled in by position (a
 * map region cut from an archive). Stretches of an appended file are a megabyte, so that
 * a file can be cut back to just before the damage and carried on from there.
 */
import zlib from "node:zlib";

/** How much of an appended file one checksum covers. */
export const STRETCH_BYTES = 1024 * 1024;

interface Stretch {
  start: number;
  end: number;
  crc: number;
}

export class WrittenRecord {
  /** By where each starts. Sorted when it is read, not as it is written: a region is filled in from several places at once. */
  private readonly stretches = new Map<number, Stretch>();
  /** The stretch being appended to, not yet a megabyte. */
  private open: Stretch | undefined;
  /** True once anything was written by position: such a file cannot be cut back and carried on. */
  placed = false;

  /** Bytes covered. */
  get bytes(): number {
    let total = this.open ? this.open.end - this.open.start : 0;
    for (const stretch of this.stretches.values()) total += stretch.end - stretch.start;
    return total;
  }

  /** The file is this long now and will be written on from here: what was recorded past it no longer stands. */
  cutTo(length: number): void {
    this.close();
    for (const [start, stretch] of this.stretches) if (stretch.end > length) this.stretches.delete(start);
  }

  /** Bytes written at the end of the file, where the last ones ended (or where `cutTo` said). */
  append(position: number, chunk: Uint8Array): void {
    let at = 0;
    while (at < chunk.length) {
      if (!this.open || this.open.end !== position + at) {
        this.close();
        this.open = { start: position + at, end: position + at, crc: 0 };
      }
      const take = Math.min(chunk.length - at, STRETCH_BYTES - (this.open.end - this.open.start));
      this.open.crc = zlib.crc32(chunk.subarray(at, at + take), this.open.crc);
      this.open.end += take;
      at += take;
      if (this.open.end - this.open.start >= STRETCH_BYTES) this.close();
    }
  }

  /**
   * For a file filled in by position, from several places at once: each writer takes a run of its own. What it
   * places one after another, touching, is one stretch; `close` ends the run. Writing the same bytes again (a
   * piece fetched a second time) starts at the same place and replaces what was recorded there.
   */
  run(): { place(position: number, chunk: Uint8Array): void; close(): void } {
    this.placed = true;
    let open: Stretch | undefined;
    const close = () => {
      if (open && open.end > open.start) this.stretches.set(open.start, open);
      open = undefined;
    };
    return {
      place: (position, chunk) => {
        if (!open || open.end !== position) {
          close();
          open = { start: position, end: position, crc: 0 };
        }
        open.crc = zlib.crc32(chunk, open.crc);
        open.end += chunk.length;
      },
      close,
    };
  }

  /** Ends the stretch being appended to, where the writing stopped. */
  close(): void {
    if (this.open && this.open.end > this.open.start) this.stretches.set(this.open.start, this.open);
    this.open = undefined;
  }

  clear(): void {
    this.open = undefined;
    this.stretches.clear();
    this.placed = false;
  }

  /**
   * Holds the file against the record as it is read: give it the file's bytes in order from the first, then ask.
   * `damagedAt` is where the first stretch that differs starts, or null when everything recorded read back as written.
   */
  check(): { update(chunk: Uint8Array): void; damagedAt(): number | null } {
    this.close();
    const sorted = [...this.stretches.values()].sort((a, b) => a.start - b.start);
    // Two stretches that share bytes cannot both be what the file holds, and which is the later is not known:
    // neither is held against the file, so that nothing sound is ever called damaged.
    const stretches: Stretch[] = [];
    let reach = 0;
    for (const stretch of sorted) {
      if (stretch.start < reach) {
        if (stretches.at(-1) && stretches.at(-1)!.end > stretch.start) stretches.pop();
      } else stretches.push(stretch);
      reach = Math.max(reach, stretch.end);
    }
    let index = 0;
    let offset = 0;
    let crc = 0;
    let damaged: number | null = null;
    return {
      update(chunk) {
        const chunkEnd = offset + chunk.length;
        while (damaged === null && index < stretches.length) {
          const stretch = stretches[index]!;
          if (stretch.start >= chunkEnd) break;
          const from = Math.max(stretch.start, offset);
          const to = Math.min(stretch.end, chunkEnd);
          if (to > from) crc = zlib.crc32(chunk.subarray(from - offset, to - offset), crc);
          if (stretch.end > chunkEnd) break;
          if (crc !== stretch.crc) damaged = stretch.start;
          crc = 0;
          index += 1;
        }
        offset = chunkEnd;
      },
      damagedAt() {
        // A stretch the file ended before, or inside: the storage does not hold what was written there.
        if (damaged === null && index < stretches.length) damaged = stretches[index]!.start;
        return damaged;
      },
    };
  }
}

/**
 * The record of what was written to a file, held against what the storage gives back:
 * the check that found nothing on the first Raspberry Pi because it did not exist yet,
 * when a NAS share gave back 2.3 GB with one 4 KiB block of zeros in it.
 */
import { describe, expect, it } from "vitest";
import { STRETCH_BYTES, WrittenRecord } from "../src/core/written.ts";
import { testBytes } from "./fixtures/downloads/file-server.ts";

/** Reads `file` back through the record's check, in pieces of `step` bytes. */
function readBack(record: WrittenRecord, file: Buffer, step = 300_000): number | null {
  const check = record.check();
  for (let at = 0; at < file.length; at += step) check.update(file.subarray(at, at + step));
  return check.damagedAt();
}

/** Appends `body` from `from` on, in the uneven pieces a network hands over. */
function appendAll(record: WrittenRecord, body: Buffer, from = 0) {
  record.cutTo(from);
  let at = from;
  for (let n = 1; at < body.length; n += 1) {
    const size = 1 + ((n * 7919) % 16_384);
    record.append(at, body.subarray(at, at + size));
    at += Math.min(size, body.length - at);
  }
}

describe("a file appended to, start to end", () => {
  const body = testBytes(3 * STRETCH_BYTES + 12_345, 21);

  it("reads back as written, whatever the size of the pieces it is read in", () => {
    const record = new WrittenRecord();
    appendAll(record, body);
    expect(record.bytes).toBe(body.length);
    expect(readBack(record, body)).toBeNull();
    expect(readBack(record, body, 4096)).toBeNull();
    expect(readBack(record, body, body.length)).toBeNull();
  });

  it("finds a block of zeros the storage put where data was written, and says where to cut back to", () => {
    const record = new WrittenRecord();
    appendAll(record, body);
    const onDisk = Buffer.from(body);
    // As on the NAS: 4 KiB of zeros, at a page boundary, in the third megabyte.
    onDisk.fill(0, 2 * STRETCH_BYTES + 405_504, 2 * STRETCH_BYTES + 405_504 + 4096);
    expect(readBack(record, onDisk)).toBe(2 * STRETCH_BYTES);
    // One altered byte is enough, and the first damaged stretch is the one named.
    onDisk[STRETCH_BYTES + 5] = onDisk[STRETCH_BYTES + 5]! ^ 1;
    expect(readBack(record, onDisk)).toBe(STRETCH_BYTES);
  });

  it("finds a file that ends before what was written", () => {
    const record = new WrittenRecord();
    appendAll(record, body);
    expect(readBack(record, body.subarray(0, 2 * STRETCH_BYTES + 100))).toBe(2 * STRETCH_BYTES);
    expect(readBack(record, body.subarray(0, STRETCH_BYTES))).toBe(STRETCH_BYTES);
  });

  it("carried on from where it was cut back to, covers the file again", () => {
    const record = new WrittenRecord();
    appendAll(record, body);
    record.cutTo(2 * STRETCH_BYTES);
    expect(record.bytes).toBe(2 * STRETCH_BYTES);
    appendAll(record, body, 2 * STRETCH_BYTES);
    expect(record.bytes).toBe(body.length);
    expect(readBack(record, body)).toBeNull();
  });

  it("says nothing about what it did not see written: the part from before a restart", () => {
    const record = new WrittenRecord();
    // Resumed at an odd byte, as a download is: only what arrives from there on is recorded.
    appendAll(record, body, 1_500_000);
    const onDisk = Buffer.from(body);
    onDisk.fill(0, 100_000, 104_096);
    expect(readBack(record, onDisk)).toBeNull();
    onDisk.fill(0, 1_600_000, 1_604_096);
    expect(readBack(record, onDisk)).toBe(1_500_000);
  });

  it("a writer that stopped part of the way through a stretch is held to what it wrote", () => {
    const record = new WrittenRecord();
    record.cutTo(0);
    record.append(0, body.subarray(0, 700_000));
    record.close();
    expect(readBack(record, body.subarray(0, 700_000))).toBeNull();
    // The next attempt finds less on the disk than was handed over, and writes on from there.
    record.cutTo(650_000);
    expect(record.bytes).toBe(0);
    record.append(650_000, body.subarray(650_000));
    expect(readBack(record, body)).toBeNull();
  });
});

describe("a file filled in by position, from several places at once", () => {
  const body = testBytes(900_000, 22);

  it("is held to each run that was placed, in whatever order they were", () => {
    const record = new WrittenRecord();
    const [first, second] = [record.run(), record.run()];
    // Two writers, turn about; each one's pieces touch.
    second.place(500_000, body.subarray(500_000, 600_000));
    first.place(100_000, body.subarray(100_000, 150_000));
    second.place(600_000, body.subarray(600_000, 900_000));
    first.place(150_000, body.subarray(150_000, 400_000));
    first.close();
    second.close();
    const head = record.run();
    head.place(0, body.subarray(0, 100_000));
    head.close();
    expect(record.placed).toBe(true);
    expect(record.bytes).toBe(800_000);
    expect(readBack(record, body)).toBeNull();
    const onDisk = Buffer.from(body);
    onDisk.fill(0, 700_000, 704_096);
    expect(readBack(record, onDisk)).toBe(500_000);
    // The stretch nobody placed (400,000 to 500,000) is not held to anything.
    const elsewhere = Buffer.from(body);
    elsewhere.fill(0, 400_000, 500_000);
    expect(readBack(record, elsewhere)).toBeNull();
  });

  it("a piece fetched and placed a second time replaces the first", () => {
    const record = new WrittenRecord();
    const once = record.run();
    once.place(0, Buffer.alloc(1000, 1));
    once.close();
    const again = record.run();
    again.place(0, body.subarray(0, 1000));
    again.close();
    expect(readBack(record, body.subarray(0, 1000))).toBeNull();
  });

  it("never calls sound bytes damaged where two records share them", () => {
    const record = new WrittenRecord();
    const a = record.run();
    a.place(0, Buffer.alloc(2000, 1));
    a.close();
    const b = record.run();
    b.place(1000, body.subarray(1000, 3000));
    b.close();
    const c = record.run();
    c.place(5000, body.subarray(5000, 6000));
    c.close();
    // The first two overlap, so neither is held against the file; the third still is.
    expect(readBack(record, body.subarray(0, 6000))).toBeNull();
    const onDisk = Buffer.from(body.subarray(0, 6000));
    onDisk[5500] = onDisk[5500]! ^ 1;
    expect(readBack(record, onDisk)).toBe(5000);
  });
});

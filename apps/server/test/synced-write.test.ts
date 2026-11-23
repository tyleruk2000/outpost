import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncedWriteStream } from "../src/core/synced-write.ts";
import { testBytes } from "./fixtures/downloads/file-server.ts";
import { tempDir } from "./temp.ts";

const dir = tempDir("outpost-synced-");
afterEach(() => vi.restoreAllMocks());

describe("a write stream that hands what it wrote to the disk as it goes", () => {
  it("writes every byte, and hands them over each time the stated amount has been written", async () => {
    const synced = vi.spyOn(fs, "fdatasync");
    const body = testBytes(1_000_000, 3);
    const file = path.join(dir, "big.bin");
    // In uneven pieces, as a download arrives; handed over every 100 kB here.
    const pieces = Array.from({ length: Math.ceil(body.length / 7_919) }, (_, i) => body.subarray(i * 7_919, (i + 1) * 7_919));
    await pipeline(Readable.from(pieces), syncedWriteStream(file, { flags: "w" }, 100_000));
    expect(fs.readFileSync(file).equals(body)).toBe(true);
    expect(synced.mock.calls.length).toBe(9);
  });

  it("appends where asked, and passes on a failure to write", async () => {
    const file = path.join(dir, "append.bin");
    fs.writeFileSync(file, "head ");
    await pipeline(Readable.from([Buffer.from("tail")]), syncedWriteStream(file, { flags: "a" }));
    expect(fs.readFileSync(file, "utf8")).toBe("head tail");
    await expect(
      pipeline(Readable.from([Buffer.from("x")]), syncedWriteStream(path.join(dir, "no", "such", "folder.bin"))),
    ).rejects.toThrow(/ENOENT/);
  });

  it("writes in whole blocks from where the file ends when asked, and the rest at the end", async () => {
    const file = path.join(dir, "blocks.bin");
    fs.writeFileSync(file, Buffer.alloc(1000, 1));
    const body = testBytes(300_000, 4);
    const sizes: number[] = [];
    const write = fs.write;
    vi.spyOn(fs, "write").mockImplementation(((fd: number, buffer: Buffer, ...rest: unknown[]) => {
      sizes.push(buffer.length);
      return (write as (...args: unknown[]) => void)(fd, buffer, ...rest);
    }) as never);
    const pieces = Array.from({ length: Math.ceil(body.length / 7_919) }, (_, i) => body.subarray(i * 7_919, (i + 1) * 7_919));
    await pipeline(Readable.from(pieces), syncedWriteStream(file, { flags: "a" }, 10 ** 9, { bytes: 65_536, from: 1000 }));
    expect(fs.readFileSync(file).equals(Buffer.concat([Buffer.alloc(1000, 1), body]))).toBe(true);
    // Up to the first boundary, then whole blocks, then what is left.
    let at = 1000;
    for (const size of sizes.slice(0, -1)) {
      at += size;
      expect(at % 65_536).toBe(0);
    }
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(body.length);
  });

  it("still writes what it holds when stopped part-way, so a download carries on after it", async () => {
    const file = path.join(dir, "stopped.bin");
    const body = testBytes(100_000, 5);
    async function* dropped() {
      yield body.subarray(0, 50_000);
      yield body.subarray(50_000);
      throw new Error("the connection closed");
    }
    await expect(pipeline(dropped(), syncedWriteStream(file, { flags: "w" }, 10 ** 9, { bytes: 65_536, from: 0 }))).rejects.toThrow(
      /connection closed/,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fs.readFileSync(file).equals(body)).toBe(true);
  });
});

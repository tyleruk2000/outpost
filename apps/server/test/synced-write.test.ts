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
    await expect(pipeline(Readable.from([Buffer.from("x")]), syncedWriteStream(path.join(dir, "no", "such", "folder.bin")))).rejects.toThrow(
      /ENOENT/,
    );
  });
});

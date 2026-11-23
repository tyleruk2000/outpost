import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashFile } from "../src/core/hashing.ts";
import { readFromStorage, storageRead } from "../src/core/storage-read.ts";
import { testBytes } from "./fixtures/downloads/file-server.ts";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fileOf(body: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-storage-read-"));
  dirs.push(dir);
  const file = path.join(dir, "file.bin");
  fs.writeFileSync(file, body);
  return file;
}

describe("reading a file as the storage holds it", () => {
  it("gives the whole file in order, and hashes as an ordinary read does", async () => {
    const body = testBytes(3 * 1024 * 1024 + 12_345, 7);
    const file = fileOf(body);
    const chunks: Buffer[] = [];
    for await (const chunk of readFromStorage(file)) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(body)).toBe(true);
    const sums = await hashFile(file, ["md5", "sha256"], { fromStorage: true });
    expect(sums.md5).toBe(createHash("md5").update(body).digest("hex"));
    expect(sums.sha256).toBe(createHash("sha256").update(body).digest("hex"));
  });

  it("reads as usual where the storage refuses an uncached read (a local disk wanting aligned memory)", async () => {
    const body = testBytes(1_500_000, 8);
    const file = fileOf(body);
    const refusing = {
      read: async () => {
        throw Object.assign(new Error("EINVAL: invalid argument, read"), { code: "EINVAL" });
      },
      close: async () => undefined,
    } as unknown as fs.promises.FileHandle;
    vi.spyOn(storageRead, "open").mockResolvedValue({ handle: refusing, direct: true });
    const chunks: Buffer[] = [];
    for await (const chunk of readFromStorage(file)) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(body)).toBe(true);
  });

  it("does not hide any other failure to read", async () => {
    const file = fileOf(testBytes(10, 9));
    const failing = {
      read: async () => {
        throw Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
      },
      close: async () => undefined,
    } as unknown as fs.promises.FileHandle;
    vi.spyOn(storageRead, "open").mockResolvedValue({ handle: failing, direct: true });
    await expect(hashFile(file, ["md5"], { fromStorage: true })).rejects.toThrow(/EIO/);
  });
});

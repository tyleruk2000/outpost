/**
 * Repairing a damaged country file with a bounded Range request: only the stretch that
 * will not read is fetched, from a local stand-in for Geofabrik (fixtures/downloads/
 * file-server.ts); a server that ignores Range changes nothing; a repair that does not
 * bring back Geofabrik's checksum is undone. Nothing reaches the internet.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpClient } from "../src/core/http.ts";
import { findDamage, repairCountryFile, restoreFromUndo, undoPathOf } from "../src/modules/maps/country-file-repair.ts";
import { type FileServer, startFileServer } from "./fixtures/downloads/file-server.ts";
import { buildPbf } from "./fixtures/layers/builders.ts";
import { tempDir } from "./temp.ts";

/** A made-up extract with enough nodes that its blocks are of some size. */
function extract(): Buffer {
  const nodes = Array.from({ length: 3000 }, (_, i) => ({
    id: i + 1,
    lat: 43.7 + (i % 100) * 0.001,
    lon: 7.4 + Math.floor(i / 100) * 0.001,
    tags: i % 7 === 0 ? { amenity: "bench", name: `Bench ${i} (test)` } : undefined,
  }));
  return buildPbf({
    nodes,
    ways: [{ id: 1, refs: nodes.slice(0, 500).map((n) => n.id), tags: { highway: "primary", ref: "M6" } }],
    relations: [],
    timestamp: Date.UTC(2026, 10, 21) / 1000,
  });
}

const dir = tempDir("outpost-repair-");
const good = extract();
const md5 = crypto.createHash("md5").update(good).digest("hex");
let server: FileServer;
const client = createHttpClient({ allowPrivate: true });

beforeAll(async () => {
  server = await startFileServer();
  server.routes.set("/europe/monaco-261121.osm.pbf", { body: good });
  server.routes.set("/plain/monaco-261121.osm.pbf", { body: good, ranges: false });
});
afterAll(async () => {
  await server.close();
  await client.close();
});

let count = 0;
const fileWith = (bytes: Buffer) => {
  count += 1;
  const file = path.join(dir, `monaco-${count}.osm.pbf`);
  fs.writeFileSync(file, bytes);
  return file;
};
/** The file with one byte changed in the middle of its largest block. */
const damaged = () => {
  const copy = Buffer.from(good);
  const at = Math.floor(good.length * 0.4);
  copy[at] = copy[at]! ^ 0xff;
  return { copy, at };
};
const repair = (filePath: string, url = server.url("/europe/monaco-261121.osm.pbf"), sum = md5) =>
  repairCountryFile({ filePath, url, bytes: good.length, md5: sum, client, allowedHosts: [server.host] });
const rangesAsked = () => server.requests.filter((r) => r.method === "GET").map((r) => r.range);

describe("repairing a damaged country file", () => {
  it("finds no damage in a whole file", async () => {
    expect(await findDamage(fileWith(good), good.length)).toBeNull();
  });

  it("fetches only the damaged block, with a bounded Range, and brings back Geofabrik's checksum", async () => {
    const { copy, at } = damaged();
    const file = fileWith(copy);
    const stretch = (await findDamage(file, good.length))!;
    expect(stretch.start).toBeLessThanOrEqual(at);
    expect(stretch.end).toBeGreaterThan(at);
    expect(stretch.end - stretch.start).toBeLessThan(good.length);
    server.requests.length = 0;
    const result = await repair(file);
    expect(result.stretches).toEqual([stretch]);
    expect(result.fetched).toBe(stretch.end - stretch.start);
    expect(rangesAsked()).toEqual([`bytes=${stretch.start}-${stretch.end - 1}`]);
    expect(fs.readFileSync(file).equals(good)).toBe(true);
  });

  it("fetches the end of a file that stops short", async () => {
    const file = fileWith(good.subarray(0, good.length - 40));
    server.requests.length = 0;
    const result = await repair(file);
    expect(result.fetched).toBeLessThan(good.length);
    expect(rangesAsked()[0]).toMatch(new RegExp(`-${good.length - 1}$`));
    expect(fs.readFileSync(file).equals(good)).toBe(true);
  });

  it("fetches from a block whose header cannot be read, and reads on from there", async () => {
    const copy = Buffer.from(good);
    // The first block's header length, made impossible.
    copy.writeUInt32BE(0xffffffff, 0);
    const file = fileWith(copy);
    await repair(file);
    expect(fs.readFileSync(file).equals(good)).toBe(true);
  });

  it("changes nothing when the server ignores Range and sends the whole file", async () => {
    const { copy } = damaged();
    const file = fileWith(copy);
    await expect(repair(file, server.url("/plain/monaco-261121.osm.pbf"))).rejects.toThrow(/sent the whole file/);
    expect(fs.readFileSync(file).equals(copy)).toBe(true);
  });

  it("puts every byte back when the repair does not bring back the checksum", async () => {
    const { copy } = damaged();
    const file = fileWith(copy);
    await expect(repair(file, undefined, "0".repeat(32))).rejects.toThrow(/put back as it was/);
    expect(fs.readFileSync(file).equals(copy)).toBe(true);
    // A file shorter than Geofabrik's is put back to its own length too.
    const short = good.subarray(0, good.length - 40);
    const shortFile = fileWith(short);
    await expect(repair(shortFile, undefined, "0".repeat(32))).rejects.toThrow(/put back as it was/);
    expect(fs.readFileSync(shortFile).equals(short)).toBe(true);
  });

  it("keeps the way back on the disk until the checksum is matched, and puts the file back from it after a power cut", async () => {
    const { copy } = damaged();
    const file = fileWith(copy);
    let patched: Buffer | null = null;
    let undo: Buffer | null = null;
    await repairCountryFile({
      filePath: file,
      url: server.url("/europe/monaco-261121.osm.pbf"),
      bytes: good.length,
      md5,
      client,
      allowedHosts: [server.host],
      progress: (message) => {
        // The moment before the checksum: the file is already written over, and the undo is beside it.
        if (message.startsWith("Checking")) {
          patched = fs.readFileSync(file);
          undo = fs.readFileSync(undoPathOf(file));
        }
      },
    });
    expect(fs.existsSync(undoPathOf(file))).toBe(false);
    // As a power cut would have left it: the file written over, the undo beside it.
    fs.writeFileSync(file, patched!);
    fs.writeFileSync(undoPathOf(file), undo!);
    expect(await restoreFromUndo(file)).toBe(true);
    expect(fs.readFileSync(file).equals(copy)).toBe(true);
    expect(fs.existsSync(undoPathOf(file))).toBe(false);
    expect(await restoreFromUndo(file)).toBe(false);
  });

  describe("an answer that is not the stretch asked for", () => {
    let odd: http.Server;
    let origin = "";
    /** Answers 206 as `kind` says, whatever was asked. */
    let kind: "star" | "other-total" | "other-range" | "long" | "short" = "star";
    beforeAll(async () => {
      odd = http.createServer((request, response) => {
        const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "")!.map(Number) as [number, number, number];
        const piece = good.subarray(a, b + 1);
        const range =
          kind === "star"
            ? `bytes ${a}-${b}/*`
            : kind === "other-total"
              ? `bytes ${a}-${b}/${good.length + 1}`
              : kind === "other-range"
                ? `bytes ${a + 1}-${b + 1}/${good.length}`
                : `bytes ${a}-${b}/${good.length}`;
        const body =
          kind === "long" ? Buffer.concat([piece, Buffer.alloc(100)]) : kind === "short" ? piece.subarray(0, piece.length - 10) : piece;
        // No length said, so that a body longer or shorter than asked reaches the reader.
        response.writeHead(206, { "content-range": range });
        response.end(body);
      });
      await new Promise<void>((resolve) => odd.listen(0, "127.0.0.1", resolve));
      origin = `http://127.0.0.1:${(odd.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      await new Promise((resolve) => odd.close(resolve));
    });

    it.each([
      ["star", /different stretch|size kept/],
      ["other-total", /different stretch|size kept/],
      ["other-range", /different stretch/],
      ["long", /more than the stretch/],
      ["short", /came short/],
    ] as const)("refuses %s, changing nothing", async (which, said) => {
      kind = which;
      const { copy } = damaged();
      const file = fileWith(copy);
      await expect(
        repairCountryFile({
          filePath: file,
          url: `${origin}/monaco.osm.pbf`,
          bytes: good.length,
          md5,
          client,
          allowedHosts: ["127.0.0.1"],
        }),
      ).rejects.toThrow(said);
      expect(fs.readFileSync(file).equals(copy)).toBe(true);
      expect(fs.existsSync(undoPathOf(file))).toBe(false);
    });
  });
});

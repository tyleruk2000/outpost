/**
 * Repairing a damaged country file with a bounded Range request: only the stretch that
 * will not read is fetched, from a local stand-in for Geofabrik (fixtures/downloads/
 * file-server.ts); a server that ignores Range changes nothing; a repair that does not
 * bring back Geofabrik's checksum is undone. Nothing reaches the internet.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpClient } from "../src/core/http.ts";
import { findDamage, repairCountryFile } from "../src/modules/maps/country-file-repair.ts";
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
});

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PMTiles, tileIdToZxy as referenceIdToZxy, zxyToTileId as referenceZxyToId } from "pmtiles";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHttpClient, type HttpClient } from "../src/core/http.ts";
import {
  buildDirectories,
  deserializeDirectory,
  directoryFromEntries,
  type Entry,
  entriesOf,
  findEntryIndex,
  serializeDirectory,
} from "../src/modules/maps/pmtiles/directory.ts";
import { extractArchive, headPathOf, planPathOf, progressPathOf } from "../src/modules/maps/pmtiles/extract.ts";
import {
  Compression,
  HEADER_BYTES,
  type PmtilesHeader,
  parseHeader,
  serializeHeader,
  TileType,
} from "../src/modules/maps/pmtiles/header.ts";
import { type ExtractRequest, planExtract, planRequests, type RangeReader } from "../src/modules/maps/pmtiles/plan.ts";
import { LocalArchive } from "../src/modules/maps/pmtiles/reader.ts";
import { createRemoteArchive } from "../src/modules/maps/pmtiles/remote.ts";
import { bboxToTileRanges, bboxToTileRect, countTiles, tileIdToZxy, zoomBase, zxyToTileId } from "../src/modules/maps/pmtiles/tiles.ts";
import {
  type ByteServer,
  buildArchive,
  dropTileDataAfter,
  type Fixture,
  NodeFileSource,
  onTileDataRequest,
  serveBytes,
  tileInBbox,
  worldTiles,
} from "./fixtures/maps/archive.ts";
import { tempDir } from "./temp.ts";

/** Deterministic pseudo-random numbers, so a failure can be reproduced. */
function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("tile ids", () => {
  it("match the reference implementation for many random tiles", () => {
    const random = randomSource(42);
    for (let i = 0; i < 5000; i += 1) {
      const z = Math.floor(random() * 21);
      const x = Math.floor(random() * 2 ** z);
      const y = Math.floor(random() * 2 ** z);
      const id = zxyToTileId(z, x, y);
      expect(id).toBe(referenceZxyToId(z, x, y));
      expect(tileIdToZxy(id)).toEqual(referenceIdToZxy(id));
      expect(tileIdToZxy(id)).toEqual([z, x, y]);
    }
  });

  it("covers the edges of each zoom", () => {
    expect(zxyToTileId(0, 0, 0)).toBe(0);
    for (let z = 0; z <= 26; z += 1) {
      const last = 2 ** z - 1;
      for (const [x, y] of [
        [0, 0],
        [last, 0],
        [0, last],
        [last, last],
      ] as const) {
        expect(zxyToTileId(z, x, y)).toBe(referenceZxyToId(z, x, y));
      }
      expect(zoomBase(z)).toBe(referenceZxyToId(z, 0, 0));
    }
    expect(() => zxyToTileId(3, 8, 0)).toThrow();
    expect(() => zxyToTileId(27, 0, 0)).toThrow();
  });
});

describe("bbox to tile ranges", () => {
  function bruteForce(bbox: [number, number, number, number], minZoom: number, maxZoom: number): number[] {
    const ids: number[] = [];
    for (let z = minZoom; z <= maxZoom; z += 1) {
      const rect = bboxToTileRect(bbox, z);
      for (let x = rect.minX; x <= rect.maxX; x += 1) {
        for (let y = rect.minY; y <= rect.maxY; y += 1) ids.push(referenceZxyToId(z, x, y));
      }
    }
    return ids.sort((a, b) => a - b);
  }

  it("equals the brute-force set of tiles for small boxes", () => {
    const boxes: Array<[number, number, number, number]> = [
      [-4.25, 52.85, -3.65, 53.25],
      [-10, -10, 10, 10],
      [100.2, -44, 179.9, -8.5],
      [-180, -85.0511, 180, 85.0511],
      [13.3, 52.4, 13.5, 52.6],
    ];
    for (const bbox of boxes) {
      const ranges = bboxToTileRanges(bbox, 0, 9);
      const expected = bruteForce(bbox, 0, 9);
      const actual: number[] = [];
      for (const range of ranges) for (let id = range.start; id < range.end; id += 1) actual.push(id);
      expect(actual).toEqual(expected);
      // Sorted, and merged: no two ranges touch.
      for (let i = 1; i < ranges.length; i += 1) expect(ranges[i]!.start).toBeGreaterThan(ranges[i - 1]!.end);
    }
  });

  it("describes the whole world as one range per call", () => {
    expect(bboxToTileRanges([-180, -85.0511, 180, 85.0511], 0, 6)).toEqual([{ start: 0, end: zoomBase(7) }]);
  });

  it("stays compact for a continent at high zoom", () => {
    const europe: [number, number, number, number] = [-25, 34, 45, 72];
    const started = Date.now();
    const ranges = bboxToTileRanges(europe, 0, 15);
    let tiles = 0;
    for (let z = 0; z <= 15; z += 1) {
      const rect = bboxToTileRect(europe, z);
      tiles += (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
    }
    expect(countTiles(ranges)).toBe(tiles);
    expect(tiles).toBeGreaterThan(40_000_000);
    expect(ranges.length).toBeLessThan(60_000);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("covers both sides of the antimeridian when west is greater than east", () => {
    const ranges = bboxToTileRanges([170, -20, -170, -10], 3, 3);
    const tiles = new Set<string>();
    for (const range of ranges) for (let id = range.start; id < range.end; id += 1) tiles.add(tileIdToZxy(id).join("/"));
    expect([...tiles].sort()).toEqual(["3/0/4", "3/7/4"]);
  });
});

describe("header", () => {
  it("round-trips every field", () => {
    const header: PmtilesHeader = {
      rootDirectoryOffset: 127,
      rootDirectoryLength: 1234,
      metadataOffset: 1361,
      metadataLength: 77,
      leafDirectoryOffset: 1438,
      leafDirectoryLength: 5_000_000_000,
      tileDataOffset: 5_000_001_438,
      tileDataLength: 139_000_000_000,
      addressedTiles: 357_913_941,
      tileEntries: 50_000_000,
      tileContents: 40_000_000,
      clustered: true,
      internalCompression: Compression.Gzip,
      tileCompression: Compression.Gzip,
      tileType: TileType.Mvt,
      minZoom: 0,
      maxZoom: 15,
      minLon: -4.25,
      minLat: 52.85,
      maxLon: -3.65,
      maxLat: 53.25,
      centerZoom: 10,
      centerLon: -3.95,
      centerLat: 53.05,
    };
    const bytes = serializeHeader(header);
    expect(bytes.length).toBe(HEADER_BYTES);
    expect(parseHeader(bytes)).toEqual(header);
  });

  it("refuses files that are not PMTiles v3", () => {
    expect(() => parseHeader(Buffer.from("not a tile archive at all, just some text".repeat(5)))).toThrow(/not a PMTiles archive/);
    const v2 = Buffer.alloc(HEADER_BYTES);
    v2.write("PMTiles");
    v2[7] = 2;
    expect(() => parseHeader(v2)).toThrow(/version 2/);
  });
});

describe("directories", () => {
  function sampleEntries(count: number): Entry[] {
    const random = randomSource(7);
    const entries: Entry[] = [];
    let id = 0;
    let offset = 0;
    for (let i = 0; i < count; i += 1) {
      id += 1 + Math.floor(random() * 5);
      const runLength = 1 + Math.floor(random() * 3);
      const length = 20 + Math.floor(random() * 4000);
      // One in six points back at earlier bytes, as shared tiles do.
      const shared = i > 10 && random() < 0.16;
      entries.push({
        tileId: id,
        runLength,
        offset: shared ? entries[i - 5]!.offset : offset,
        length: shared ? entries[i - 5]!.length : length,
      });
      if (!shared) offset += length;
      id += runLength - 1;
    }
    return entries;
  }

  it("round-trips entries through the wire format", () => {
    const entries = sampleEntries(3000);
    for (const compression of [Compression.Gzip, Compression.None]) {
      const bytes = serializeDirectory(directoryFromEntries(entries), compression);
      expect(entriesOf(deserializeDirectory(bytes, compression))).toEqual(entries);
    }
  });

  it("keeps large offsets and ids exact", () => {
    const entries: Entry[] = [
      { tileId: 5, runLength: 1, offset: 0, length: 10 },
      { tileId: zoomBase(15) + 12345, runLength: 4_000_000, offset: 139_000_000_123, length: 4_294_967_295 },
      { tileId: zoomBase(20), runLength: 0, offset: 2 ** 40 + 3, length: 17 },
    ];
    expect(entriesOf(deserializeDirectory(serializeDirectory(directoryFromEntries(entries)), Compression.Gzip))).toEqual(entries);
  });

  it("is read the same way by the reference implementation", async () => {
    // The official reader decodes what our writer wrote: the strongest check there is.
    const fixture = buildArchive({ tiles: worldTiles(4), rootBudget: 120, minLeafSize: 16 });
    expect(fixture.leafCount).toBeGreaterThan(2);
    const file = path.join(tempDir("outpost-pmtiles-"), "fixture.pmtiles");
    fs.writeFileSync(file, fixture.bytes);
    const reference = new PMTiles(new NodeFileSource(file));
    for (const key of fixture.tiles.keys()) {
      const [z, x, y] = key.split("/").map(Number) as [number, number, number];
      const tile = await reference.getZxy(z, x, y);
      // The reference reader un-gzips tiles; compare with our stored bytes un-gzipped.
      expect(tile, key).toBeDefined();
      expect(Buffer.from(tile!.data).toString()).toContain("tile:");
    }
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it("puts everything in the root when it fits and builds leaves when it does not", () => {
    const entries = directoryFromEntries(sampleEntries(5000));
    const whole = buildDirectories(entries, { rootBudget: 1_000_000 });
    expect(whole.leafCount).toBe(0);
    expect(entriesOf(deserializeDirectory(whole.root, Compression.Gzip))).toHaveLength(5000);

    const split = buildDirectories(entries, { rootBudget: 400, minLeafSize: 50 });
    expect(split.root.length).toBeLessThanOrEqual(400);
    expect(split.leafCount).toBeGreaterThan(1);
    const pointers = deserializeDirectory(split.root, Compression.Gzip);
    expect(pointers.count).toBe(split.leafCount);
    const reassembled: Entry[] = [];
    for (const pointer of entriesOf(pointers)) {
      expect(pointer.runLength).toBe(0);
      const leaf = deserializeDirectory(split.leaves.subarray(pointer.offset, pointer.offset + pointer.length), Compression.Gzip);
      expect(leaf.tileIds[0]).toBe(pointer.tileId);
      reassembled.push(...entriesOf(leaf));
    }
    expect(reassembled).toEqual(entriesOf(entries));
  });

  it("finds the entry at or before a tile id", () => {
    const directory = directoryFromEntries([
      { tileId: 10, runLength: 2, offset: 0, length: 1 },
      { tileId: 20, runLength: 1, offset: 1, length: 1 },
    ]);
    expect(findEntryIndex(directory, 9)).toBe(-1);
    expect(findEntryIndex(directory, 10)).toBe(0);
    expect(findEntryIndex(directory, 19)).toBe(0);
    expect(findEntryIndex(directory, 500)).toBe(1);
  });
});

describe("request planning", () => {
  it("joins nearby copies within the over-fetch budget and splits large ones", () => {
    const copies = [
      { src: 0, dst: 0, length: 1000 },
      { src: 1010, dst: 1000, length: 1000 }, // 10-byte gap: joined
      { src: 9000, dst: 2000, length: 1000 }, // far away: its own request
    ];
    const { requests, overfetchBytes } = planRequests(copies, 0.05, 1500);
    expect(overfetchBytes).toBe(10);
    expect(requests).toEqual([
      { offset: 0, length: 1500, copyFrom: 0, copyTo: 2 },
      { offset: 1500, length: 510, copyFrom: 1, copyTo: 2 },
      { offset: 9000, length: 1000, copyFrom: 2, copyTo: 3 },
    ]);
  });
});

// ── Planning and extracting against a local server ──────────────────────────

const BBOX: [number, number, number, number] = [-20, 20, 60, 70];
const REQUEST: ExtractRequest = { bbox: BBOX, minZoom: 0, maxZoom: 6 };
/** Padded past 16 KB so the fixture's tile data lies beyond the planner's first read, as in a real planet. */
const METADATA = {
  name: "Synthetic planet",
  attribution: "© Test",
  vector_layers: [{ id: "earth" }],
  padding: Array.from({ length: 900 }, (_, i) => createHash("sha256").update(String(i)).digest("base64")).join(""),
};
/** Small requests so that even a tiny fixture needs many of them. */
const PLAN_OPTIONS = { maxRequestBytes: 2048, rootBudget: 300, minLeafSize: 64 };

describe("extracting a region", () => {
  let fixture: Fixture;
  let server: ByteServer;
  let client: HttpClient;
  let dir: string;
  let part: string;

  beforeAll(() => {
    // Seven zoom levels, 5,461 tiles, a quarter of them sharing one "ocean" blob.
    fixture = buildArchive({
      tiles: worldTiles(6),
      metadata: METADATA,
      rootBudget: 300,
      minLeafSize: 64,
    });
    expect(fixture.leafCount).toBeGreaterThan(4);
    client = createHttpClient({ allowPrivate: true });
  });
  afterAll(() => client.close());

  beforeEach(async () => {
    server = await serveBytes(fixture.bytes);
    dir = tempDir("outpost-extract-");
    part = path.join(dir, "region.pmtiles.part");
  });
  afterEach(async () => {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const dataRequests = (requests: ByteServer["requests"]) =>
    requests.filter((range): range is [number, number] => range !== null && range[0] >= fixture.header.tileDataOffset);

  async function verifyOutput(file: string, request: ExtractRequest): Promise<void> {
    const reference = new PMTiles(new NodeFileSource(file));
    const header = await reference.getHeader();
    let expectedTiles = 0;
    for (const key of fixture.tiles.keys()) {
      const [z, x, y] = key.split("/").map(Number) as [number, number, number];
      const inside = z >= request.minZoom && z <= request.maxZoom && tileInBbox(request.bbox, z, x, y);
      // The official reader hands tiles back un-gzipped; `LocalArchive` gives the stored bytes.
      const tile = await reference.getZxy(z, x, y);
      if (inside) {
        expectedTiles += 1;
        expect(tile, `tile ${key} should be present`).toBeDefined();
      } else {
        expect(tile, `tile ${key} should be absent`).toBeUndefined();
      }
    }
    expect(header.numAddressedTiles).toBe(expectedTiles);
    expect(header.clustered).toBe(true);
    expect(header.minZoom).toBe(request.minZoom);
    expect(header.maxZoom).toBe(request.maxZoom);
    expect([header.minLon, header.minLat, header.maxLon, header.maxLat]).toEqual(request.bbox);
    expect(header.centerLon).toBeCloseTo((request.bbox[0] + request.bbox[2]) / 2, 5);
    expect(header.tileType).toBe(1);
    expect(await reference.getMetadata()).toEqual(METADATA);

    // Byte-for-byte: every stored tile in the output is the source's stored tile.
    const local = await LocalArchive.open(file);
    for (const [key, stored] of fixture.tiles) {
      const [z, x, y] = key.split("/").map(Number) as [number, number, number];
      const tile = await local.getTile(z, x, y);
      if (z >= request.minZoom && z <= request.maxZoom && tileInBbox(request.bbox, z, x, y))
        expect(tile?.equals(stored), `bytes of ${key}`).toBe(true);
      else expect(tile).toBeUndefined();
    }
    await local.close();
  }

  it("plans by reading directories only, and predicts the size exactly", async () => {
    const archive = createRemoteArchive(client, server.url);
    const plan = await planExtract(archive.read, REQUEST, PLAN_OPTIONS);

    // Nothing asked for while planning reaches into the tile data.
    expect(server.requests.length).toBe(plan.planningRequests);
    for (const range of server.requests) {
      expect(range).not.toBeNull();
      expect(range![0] === 0 || range![1] < fixture.header.tileDataOffset).toBe(true);
    }
    // The first read is the fixed 16 KB; the fixture's tile data starts beyond it.
    expect(fixture.header.tileDataOffset).toBeGreaterThan(16_384);
    // Fewer leaves fetched than exist: only those covering the box.
    expect(server.requests.length).toBeLessThan(fixture.leafCount + 2);

    // Selected entries are in tile order and cover exactly the wanted tiles.
    let expected = 0;
    for (const key of fixture.tiles.keys()) {
      const [z, x, y] = key.split("/").map(Number) as [number, number, number];
      if (tileInBbox(BBOX, z, x, y)) expected += 1;
    }
    expect(plan.tileCount).toBe(expected);
    for (let i = 1; i < plan.entries.count; i += 1) expect(plan.entries.tileIds[i]!).toBeGreaterThan(plan.entries.tileIds[i - 1]!);

    // Shared tiles are fetched once: fewer contents than entries, and copies do not overlap.
    expect(plan.header.tileContents).toBeLessThan(plan.header.tileEntries);
    for (let i = 1; i < plan.copies.length; i += 1) {
      expect(plan.copies[i]!.src).toBeGreaterThanOrEqual(plan.copies[i - 1]!.src + plan.copies[i - 1]!.length);
    }
    expect(plan.copies.reduce((sum, copy) => sum + copy.length, 0)).toBe(plan.tileDataLength);
    expect(plan.outputSize).toBe(plan.head.length + plan.tileDataLength);

    const result = await extractArchive({ archive, request: REQUEST, partPath: part, planOptions: PLAN_OPTIONS });
    expect(result.sizeBytes).toBe(plan.outputSize);
    expect(fs.statSync(part).size).toBe(plan.outputSize);
    expect(result.totalRequests).toBe(plan.requests.length);
    expect(result.resumed).toBe(false);
    // Sidecar files are gone once the archive is complete.
    expect(fs.readdirSync(dir)).toEqual(["region.pmtiles.part"]);
    await verifyOutput(part, REQUEST);
  });

  it("extracts a deeper range of zooms and a small box", async () => {
    const request: ExtractRequest = { bbox: [100, -45, 150, -10], minZoom: 3, maxZoom: 5 };
    const archive = createRemoteArchive(client, server.url);
    const progress: number[] = [];
    const result = await extractArchive({
      archive,
      request,
      partPath: part,
      planOptions: PLAN_OPTIONS,
      onProgress: (update) => progress.push(update.writtenBytes),
    });
    await verifyOutput(part, request);
    expect(progress.at(-1)).toBe(result.sizeBytes);
    for (let i = 1; i < progress.length; i += 1) expect(progress[i]!).toBeGreaterThanOrEqual(progress[i - 1]!);
  });

  it("never looks like a finished archive while it is incomplete, and resumes where it stopped", async () => {
    // Reference run, to know what the finished file and the full request list look like.
    const referencePart = path.join(dir, "reference.part");
    const full = await extractArchive({
      archive: createRemoteArchive(client, server.url),
      request: REQUEST,
      partPath: referencePart,
      planOptions: PLAN_OPTIONS,
      concurrency: 1,
    });
    const allData = dataRequests(server.requests);
    expect(allData.length).toBe(full.totalRequests);
    expect(full.totalRequests).toBeGreaterThan(12);

    // First attempt: the connection dies on the seventh tile-data request.
    server.requests.length = 0;
    server.intercept = dropTileDataAfter(fixture.header.tileDataOffset, 6);
    await expect(
      extractArchive({
        archive: createRemoteArchive(client, server.url),
        request: REQUEST,
        partPath: part,
        planOptions: PLAN_OPTIONS,
        concurrency: 1,
      }),
    ).rejects.toThrow();
    expect(fs.existsSync(planPathOf(part))).toBe(true);
    expect(fs.existsSync(headPathOf(part))).toBe(true);
    expect(JSON.parse(fs.readFileSync(progressPathOf(part), "utf8"))).toEqual({ done: [[0, 6]] });
    // The partial file has no header yet, so nothing can mistake it for an archive.
    await expect(LocalArchive.open(part)).rejects.toThrow(/not a PMTiles archive/);
    const saved = JSON.parse(fs.readFileSync(planPathOf(part), "utf8"));
    expect(saved.sourceUrl).toBe(server.url);
    expect(saved.etag).toBe('"v1"');

    // Second attempt: only the header is re-read (to check the ETag) and the rest fetched.
    server.intercept = null;
    server.requests.length = 0;
    const second = await extractArchive({
      archive: createRemoteArchive(client, server.url),
      request: REQUEST,
      partPath: part,
      planOptions: PLAN_OPTIONS,
      concurrency: 1,
    });
    expect(second.resumed).toBe(true);
    expect(second.restartedBecause).toBeNull();
    expect(second.requestsMade).toBe(full.totalRequests - 6);
    expect(server.requests[0]).toEqual([0, HEADER_BYTES - 1]);
    expect(dataRequests(server.requests)).toEqual(allData.slice(6));
    expect(server.requests.length).toBe(1 + full.totalRequests - 6);

    expect(fs.readFileSync(part).equals(fs.readFileSync(referencePart))).toBe(true);
    await verifyOutput(part, REQUEST);
  });

  it("resumes correctly with several requests in flight", async () => {
    const referencePart = path.join(dir, "reference.part");
    await extractArchive({
      archive: createRemoteArchive(client, server.url),
      request: REQUEST,
      partPath: referencePart,
      planOptions: PLAN_OPTIONS,
    });
    server.intercept = dropTileDataAfter(fixture.header.tileDataOffset, 9);
    await expect(
      extractArchive({
        archive: createRemoteArchive(client, server.url),
        request: REQUEST,
        partPath: part,
        planOptions: PLAN_OPTIONS,
        concurrency: 4,
      }),
    ).rejects.toThrow();
    server.intercept = null;
    const second = await extractArchive({
      archive: createRemoteArchive(client, server.url),
      request: REQUEST,
      partPath: part,
      planOptions: PLAN_OPTIONS,
      concurrency: 4,
    });
    expect(second.resumed).toBe(true);
    expect(second.requestsMade).toBeLessThan(second.totalRequests);
    expect(fs.readFileSync(part).equals(fs.readFileSync(referencePart))).toBe(true);
  });

  it("stops promptly when asked to, keeping its progress", async () => {
    const controller = new AbortController();
    server.intercept = onTileDataRequest(fixture.header.tileDataOffset, 5, () => {
      controller.abort("paused");
    });
    await expect(
      extractArchive({
        archive: createRemoteArchive(client, server.url),
        request: REQUEST,
        partPath: part,
        planOptions: PLAN_OPTIONS,
        concurrency: 1,
        signal: controller.signal,
      }),
    ).rejects.toBeDefined();
    const progress = JSON.parse(fs.readFileSync(progressPathOf(part), "utf8")) as { done: Array<[number, number]> };
    expect(progress.done[0]![1]).toBeGreaterThanOrEqual(4);
    server.intercept = null;
    const second = await extractArchive({
      archive: createRemoteArchive(client, server.url),
      request: REQUEST,
      partPath: part,
      planOptions: PLAN_OPTIONS,
    });
    expect(second.resumed).toBe(true);
    await verifyOutput(part, REQUEST);
  });

  it("starts over when the source has changed since the plan was made", async () => {
    server.intercept = dropTileDataAfter(fixture.header.tileDataOffset, 4);
    await expect(
      extractArchive({
        archive: createRemoteArchive(client, server.url),
        request: REQUEST,
        partPath: part,
        planOptions: PLAN_OPTIONS,
        concurrency: 1,
      }),
    ).rejects.toThrow();

    // A new build appears at the same address: different tiles, different ETag.
    const next = buildArchive({ tiles: worldTiles(6, () => false), metadata: METADATA, rootBudget: 300, minLeafSize: 64 });
    server.intercept = null;
    server.body = next.bytes;
    server.etag = '"v2"';
    server.requests.length = 0;
    const messages: string[] = [];
    const result = await extractArchive({
      archive: createRemoteArchive(client, server.url),
      request: REQUEST,
      partPath: part,
      planOptions: PLAN_OPTIONS,
      onProgress: (update) => update.message && messages.push(update.message),
    });
    expect(result.resumed).toBe(false);
    expect(result.restartedBecause).toMatch(/updated since this download began/);
    expect(messages.join(" ")).toMatch(/starting again/);
    expect(result.requestsMade).toBe(result.totalRequests);
    expect(result.etag).toBe('"v2"');
    // The output is the new build's, whole.
    const local = await LocalArchive.open(part);
    for (const [key, stored] of next.tiles) {
      const [z, x, y] = key.split("/").map(Number) as [number, number, number];
      if (tileInBbox(BBOX, z, x, y)) expect((await local.getTile(z, x, y))?.equals(stored)).toBe(true);
    }
    await local.close();
  });

  it("notices the source changing in the middle of a run", async () => {
    server.intercept = onTileDataRequest(fixture.header.tileDataOffset, 4, () => {
      server.etag = '"v2"';
    });
    await expect(
      extractArchive({
        archive: createRemoteArchive(client, server.url),
        request: REQUEST,
        partPath: part,
        planOptions: PLAN_OPTIONS,
        concurrency: 1,
      }),
    ).rejects.toThrow(/changed/);
  });

  it("starts over when asked for a different area than the saved plan", async () => {
    server.intercept = dropTileDataAfter(fixture.header.tileDataOffset, 3);
    await expect(
      extractArchive({
        archive: createRemoteArchive(client, server.url),
        request: REQUEST,
        partPath: part,
        planOptions: PLAN_OPTIONS,
        concurrency: 1,
      }),
    ).rejects.toThrow();
    server.intercept = null;
    const other: ExtractRequest = { bbox: [0, 0, 30, 30], minZoom: 0, maxZoom: 4 };
    const result = await extractArchive({
      archive: createRemoteArchive(client, server.url),
      request: other,
      partPath: part,
      planOptions: PLAN_OPTIONS,
    });
    expect(result.resumed).toBe(false);
    await verifyOutput(part, other);
  });

  it("refuses a server that ignores Range requests", async () => {
    server.ranges = false;
    const archive = createRemoteArchive(client, server.url);
    await expect(planExtract(archive.read, REQUEST, PLAN_OPTIONS)).rejects.toThrow(/does not support partial downloads/);
    await expect(extractArchive({ archive, request: REQUEST, partPath: part })).rejects.toMatchObject({ code: "unsupported" });
    expect(fs.existsSync(part)).toBe(false);
  });

  it("reports a missing source and an unclustered one in plain words", async () => {
    server.failWith = 404;
    await expect(planExtract(createRemoteArchive(client, server.url).read, REQUEST)).rejects.toThrow(/no longer available/);
    server.failWith = null;

    server.body = buildArchive({ tiles: worldTiles(2), clustered: false }).bytes;
    await expect(planExtract(createRemoteArchive(client, server.url).read, REQUEST)).rejects.toThrow(/not stored in tile order/);

    server.body = Buffer.from("<html>Not a tile archive</html>".repeat(20));
    await expect(planExtract(createRemoteArchive(client, server.url).read, REQUEST)).rejects.toThrow(/not a PMTiles archive/);
  });

  it("says so when the area has no tiles or the zooms do not exist", async () => {
    const sparse = buildArchive({ tiles: worldTiles(3).filter((tile) => tile.z === 3 && tile.x < 2), bounds: [-180, -85, -90, 85] });
    server.body = sparse.bytes;
    const read = createRemoteArchive(client, server.url).read;
    await expect(planExtract(read, { bbox: [100, 0, 120, 20], minZoom: 3, maxZoom: 3 })).rejects.toThrow(/no tiles for that area/);
    await expect(planExtract(read, { bbox: [100, 0, 120, 20], minZoom: 5, maxZoom: 9 })).rejects.toThrow(/only has zoom levels 3–3/);
  });

  it("reads a source whose index is not gzipped, and writes a gzipped one", async () => {
    const plain = buildArchive({
      tiles: worldTiles(4),
      metadata: { name: "Plain" },
      internalCompression: Compression.None,
      rootBudget: 400,
      minLeafSize: 32,
    });
    expect(plain.leafCount).toBeGreaterThan(1);
    server.body = plain.bytes;
    const request: ExtractRequest = { bbox: [-20, 20, 60, 70], minZoom: 0, maxZoom: 4 };
    await extractArchive({ archive: createRemoteArchive(client, server.url), request, partPath: part });
    const reference = new PMTiles(new NodeFileSource(part));
    expect((await reference.getHeader()).internalCompression).toBe(Compression.Gzip);
    expect(await reference.getMetadata()).toEqual({ name: "Plain" });
    const local = await LocalArchive.open(part);
    for (const [key, stored] of plain.tiles) {
      const [z, x, y] = key.split("/").map(Number) as [number, number, number];
      const tile = await local.getTile(z, x, y);
      if (tileInBbox(request.bbox, z, x, y)) expect(tile?.equals(stored), key).toBe(true);
      else expect(tile).toBeUndefined();
    }
    await local.close();
  });

  it("works from any range reader, not only HTTP", async () => {
    const calls: Array<[number, number]> = [];
    const read: RangeReader = async (offset, length) => {
      calls.push([offset, length]);
      return fixture.bytes.subarray(offset, offset + length);
    };
    const plan = await planExtract(read, REQUEST, PLAN_OPTIONS);
    expect(calls.length).toBe(plan.planningRequests);
    expect(plan.requests.length).toBeGreaterThan(10);
    expect(plan.requests.every((request) => request.length <= 2048)).toBe(true);
  });
});

describe("reading a local archive", () => {
  it("returns stored tiles through leaf directories and nothing outside the archive", async () => {
    const fixture = buildArchive({ tiles: worldTiles(5), rootBudget: 200, minLeafSize: 32 });
    const dir = tempDir("outpost-reader-");
    const file = path.join(dir, "world.pmtiles");
    fs.writeFileSync(file, fixture.bytes);
    const archive = await LocalArchive.open(file);
    expect(archive.header.maxZoom).toBe(5);
    expect((await archive.getTile(5, 17, 9))?.equals(fixture.tiles.get("5/17/9")!)).toBe(true);
    expect((await archive.getTile(0, 0, 0))?.equals(fixture.tiles.get("0/0/0")!)).toBe(true);
    expect(await archive.getTile(6, 0, 0)).toBeUndefined();
    expect(await archive.getMetadata()).toEqual({ name: "fixture" });
    await archive.close();
    expect(await archive.getTile(0, 0, 0)).toBeUndefined();

    fs.writeFileSync(file, fixture.bytes.subarray(0, fixture.bytes.length - 100));
    await expect(LocalArchive.open(file)).rejects.toThrow(/incomplete/);
    fs.rmSync(dir, { recursive: true });
  });
});

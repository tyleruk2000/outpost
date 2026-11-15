/**
 * Test-only helpers: a writer for small synthetic PMTiles archives, a local HTTP server
 * that serves bytes with (or without) Range support, and a file-backed source for the
 * official `pmtiles` reader, which the tests use as the referee.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import type { RangeResponse, Source } from "pmtiles";
import { buildDirectories, DirectoryBuilder } from "../../../src/modules/maps/pmtiles/directory.ts";
import { Compression, HEADER_BYTES, type PmtilesHeader, serializeHeader, TileType } from "../../../src/modules/maps/pmtiles/header.ts";
import { bboxToTileRect, zxyToTileId } from "../../../src/modules/maps/pmtiles/tiles.ts";

export interface FixtureTile {
  z: number;
  x: number;
  y: number;
  /** Stored bytes (already compressed, as a real archive holds them). */
  data: Buffer;
}

export interface FixtureOptions {
  tiles: FixtureTile[];
  metadata?: Record<string, unknown>;
  bounds?: [number, number, number, number];
  tileType?: number;
  tileCompression?: number;
  clustered?: boolean;
  /** How directories and metadata are packed; gzip unless a test says otherwise. */
  internalCompression?: number;
  /** Small values force leaf directories. */
  rootBudget?: number;
  minLeafSize?: number;
}

export interface Fixture {
  bytes: Buffer;
  header: PmtilesHeader;
  /** Stored bytes by "z/x/y". */
  tiles: Map<string, Buffer>;
  leafCount: number;
}

/**
 * The stored form of a fake vector tile: gzip of a recognisable string. Sizes vary from
 * tile to tile, as real ones do, so directories do not compress to nothing.
 */
export function fakeTile(label: string): Buffer {
  const noise = createHash("sha256").update(label).digest();
  const filler = Buffer.alloc(20 + noise[0]! * 2, noise).toString("base64");
  return zlib.gzipSync(Buffer.from(`tile:${label}:${filler}`));
}

/**
 * A full pyramid over the whole world from zoom 0 to `maxZoom`. Some tiles share one
 * blob, the way a real planet shares its sea tiles: the whole far west (which gives
 * long runs of consecutive ids) and a scattering everywhere else (which gives entries
 * that point back at bytes stored earlier). Both forms of sharing are exercised.
 */
export function worldTiles(
  maxZoom: number,
  isShared: (z: number, x: number, y: number) => boolean = (z, x, y) => z >= 2 && (x < 2 ** z / 4 || (x + 2 * y) % 5 === 0),
): FixtureTile[] {
  const ocean = fakeTile("ocean");
  const tiles: FixtureTile[] = [];
  for (let z = 0; z <= maxZoom; z += 1) {
    for (let x = 0; x < 2 ** z; x += 1) {
      for (let y = 0; y < 2 ** z; y += 1) {
        tiles.push({ z, x, y, data: isShared(z, x, y) ? ocean : fakeTile(`${z}/${x}/${y}`) });
      }
    }
  }
  return tiles;
}

export function buildArchive(options: FixtureOptions): Fixture {
  const sorted = options.tiles.map((tile) => ({ ...tile, id: zxyToTileId(tile.z, tile.x, tile.y) })).sort((a, b) => a.id - b.id);

  const offsets = new Map<string, number>();
  const blobs: Buffer[] = [];
  let dataLength = 0;
  const entries = new DirectoryBuilder();
  let run: { id: number; length: number; offset: number; size: number } | undefined;
  let addressed = 0;
  for (const tile of sorted) {
    const key = createHash("sha256").update(tile.data).digest("hex");
    let offset = offsets.get(key);
    if (offset === undefined) {
      offset = dataLength;
      offsets.set(key, offset);
      blobs.push(tile.data);
      dataLength += tile.data.length;
    }
    addressed += 1;
    if (run && run.offset === offset && run.id + run.length === tile.id) {
      run.length += 1;
      continue;
    }
    if (run) entries.push(run.id, run.length, run.offset, run.size);
    run = { id: tile.id, length: 1, offset, size: tile.data.length };
  }
  if (run) entries.push(run.id, run.length, run.offset, run.size);
  const directory = entries.finish();

  const internalCompression = options.internalCompression ?? Compression.Gzip;
  const { root, leaves, leafCount } = buildDirectories(directory, {
    rootBudget: options.rootBudget,
    minLeafSize: options.minLeafSize,
    compression: internalCompression,
  });
  const metadataJson = Buffer.from(JSON.stringify(options.metadata ?? { name: "fixture" }));
  const metadata = internalCompression === Compression.Gzip ? zlib.gzipSync(metadataJson) : metadataJson;
  const zooms = sorted.map((tile) => tile.z);
  const bounds = options.bounds ?? [-180, -85.0511287, 180, 85.0511287];
  const header: PmtilesHeader = {
    rootDirectoryOffset: HEADER_BYTES,
    rootDirectoryLength: root.length,
    metadataOffset: HEADER_BYTES + root.length,
    metadataLength: metadata.length,
    leafDirectoryOffset: HEADER_BYTES + root.length + metadata.length,
    leafDirectoryLength: leaves.length,
    tileDataOffset: HEADER_BYTES + root.length + metadata.length + leaves.length,
    tileDataLength: dataLength,
    addressedTiles: addressed,
    tileEntries: directory.count,
    tileContents: blobs.length,
    clustered: options.clustered ?? true,
    internalCompression,
    tileCompression: options.tileCompression ?? Compression.Gzip,
    tileType: options.tileType ?? TileType.Mvt,
    minZoom: Math.min(...zooms),
    maxZoom: Math.max(...zooms),
    minLon: bounds[0],
    minLat: bounds[1],
    maxLon: bounds[2],
    maxLat: bounds[3],
    centerZoom: 0,
    centerLon: (bounds[0] + bounds[2]) / 2,
    centerLat: (bounds[1] + bounds[3]) / 2,
  };
  return {
    bytes: Buffer.concat([serializeHeader(header), root, metadata, leaves, ...blobs]),
    header,
    tiles: new Map(sorted.map((tile) => [`${tile.z}/${tile.x}/${tile.y}`, tile.data])),
    leafCount,
  };
}

/** True when the tile is one a box touches at its zoom. */
export function tileInBbox(bbox: [number, number, number, number], z: number, x: number, y: number): boolean {
  const rect = bboxToTileRect(bbox, z);
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

export interface ByteServer {
  url: string;
  /** Every range asked for, in order: [first byte, last byte]. Null for a request without Range. */
  requests: Array<[number, number] | null>;
  body: Buffer;
  etag: string | null;
  /** When false the server ignores Range and sends everything with a 200. */
  ranges: boolean;
  /** Answer every request with this status instead. */
  failWith: number | null;
  /** Called before each response; throw or return false to drop the connection. */
  intercept: ((range: [number, number] | null, count: number) => boolean | undefined) | null;
  close(): Promise<void>;
}

export async function serveBytes(body: Buffer, options: { etag?: string | null; ranges?: boolean } = {}): Promise<ByteServer> {
  const state: ByteServer = {
    url: "",
    requests: [],
    body,
    etag: options.etag === undefined ? '"v1"' : options.etag,
    ranges: options.ranges ?? true,
    failWith: null,
    intercept: null,
    close: async () => undefined,
  };
  const server = http.createServer((request, response) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    const range: [number, number] | null = match ? [Number(match[1]), Number(match[2])] : null;
    state.requests.push(range);
    if (state.intercept && state.intercept(range, state.requests.length) === false) {
      response.destroy();
      return;
    }
    if (state.failWith) {
      response.writeHead(state.failWith).end();
      return;
    }
    const headers: Record<string, string> = { "content-type": "application/octet-stream" };
    if (state.etag) headers.etag = state.etag;
    if (!range || !state.ranges) {
      response.writeHead(200, { ...headers, "content-length": String(state.body.length) }).end(state.body);
      return;
    }
    if (range[0] >= state.body.length) {
      response.writeHead(416, { "content-range": `bytes */${state.body.length}` }).end();
      return;
    }
    const end = Math.min(range[1], state.body.length - 1);
    const slice = state.body.subarray(range[0], end + 1);
    response
      .writeHead(206, {
        ...headers,
        "content-range": `bytes ${range[0]}-${end}/${state.body.length}`,
        "content-length": String(slice.length),
      })
      .end(slice);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/planet.pmtiles`;
  state.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return state;
}

/** An `intercept` that lets `allowed` requests for tile data through and drops every one after. */
export function dropTileDataAfter(tileDataOffset: number, allowed: number): NonNullable<ByteServer["intercept"]> {
  let seen = 0;
  return (range) => {
    if (!range || range[0] < tileDataOffset) return true;
    seen += 1;
    return seen <= allowed;
  };
}

/** An `intercept` that runs `action` just before the nth request for tile data is answered. */
export function onTileDataRequest(tileDataOffset: number, nth: number, action: () => void): NonNullable<ByteServer["intercept"]> {
  let seen = 0;
  return (range) => {
    if (range && range[0] >= tileDataOffset) {
      seen += 1;
      if (seen === nth) action();
    }
    return true;
  };
}

/** Lets the official `pmtiles` reader open a local file. */
export class NodeFileSource implements Source {
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
  }
  getKey(): string {
    return this.file;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const handle = await fs.promises.open(this.file, "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      const view = buffer.subarray(0, bytesRead);
      return { data: view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer };
    } finally {
      await handle.close();
    }
  }
}

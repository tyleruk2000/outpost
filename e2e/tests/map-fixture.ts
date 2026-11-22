/**
 * A small map made for the tests: a real PMTiles archive of real vector tiles in the
 * schema Outpost draws (Protomaps), and a second archive of terrain, so that a page can
 * be drawn from them and then measured.
 *
 * Everything in it is placed where arithmetic can find it again:
 *
 * - land everywhere;
 * - one lake, a rectangle exactly 1,000 m wide and 500 m high on the ground (on the
 *   sphere the app measures with), centred on `CENTRE`;
 * - roads on a grid: north–south every 0.02° of longitude, east–west every 0.01° of
 *   latitude, with one main road through the centre;
 * - three named places, a named lake, a named road and a summit with an icon, so that
 *   lettering and the sprite sheet are both drawn from;
 * - a single round hill north-east of the lake, 200 m at its foot and 900 m at the top.
 *
 * Nothing here is copied from any real map.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { Page, TestInfo } from "@playwright/test";
import { Compression, TileType } from "../../apps/server/src/modules/maps/pmtiles/header.ts";
import { buildArchive, type FixtureTile } from "../../apps/server/test/fixtures/maps/archive.ts";
import { api } from "./fixtures";

export const CENTRE = { lat: 53.07, lon: -4.07 };
/** [west, south, east, north] */
export const MAP_BOUNDS: [number, number, number, number] = [-4.21, 52.98, -3.93, 53.16];
export const MAP_MAX_ZOOM = 14;
export const TERRAIN_MAX_ZOOM = 12;

/** The circumference the web app's own scale arithmetic uses. */
const CIRCUMFERENCE = 40_075_016.686;
const METRES_PER_DEGREE = CIRCUMFERENCE / 360;
const RAD = Math.PI / 180;

export const LAKE = {
  widthMetres: 1000,
  heightMetres: 500,
  west: CENTRE.lon - 500 / (METRES_PER_DEGREE * Math.cos(CENTRE.lat * RAD)),
  east: CENTRE.lon + 500 / (METRES_PER_DEGREE * Math.cos(CENTRE.lat * RAD)),
  south: CENTRE.lat - 250 / METRES_PER_DEGREE,
  north: CENTRE.lat + 250 / METRES_PER_DEGREE,
};

/** North–south roads run this far east of every other hundredth of a degree: clear of the lake, and just off the round figures a graticule uses. */
const ROAD_OFFSET = 0.0093;

export const HILL = { lat: 53.105, lon: -4.01, foot: 200, top: 900, spreadMetres: 2200 };

export const PLACES = [
  { name: "Capel Prawf", lat: 53.092, lon: -4.115 },
  { name: "Nant Enghraifft", lat: 53.045, lon: -4.035 },
  { name: "Pont Arbrawf", lat: 53.058, lon: -4.125 },
];

/** A named summit, drawn with an icon. */
export const SUMMIT = { name: "Bryn Prawf", lat: 53.088, lon: -4.047 };

// ── Web Mercator ──

const worldX = (lon: number) => (lon + 180) / 360;
const worldY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / Math.PI) / 2;
const latOf = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / RAD;

function tilesFor(bounds: [number, number, number, number], minZoom: number, maxZoom: number): Array<{ z: number; x: number; y: number }> {
  const tiles: Array<{ z: number; x: number; y: number }> = [];
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const size = 2 ** z;
    const clamp = (value: number) => Math.max(0, Math.min(size - 1, value));
    const [x0, x1] = [clamp(Math.floor(worldX(bounds[0]) * size)), clamp(Math.floor(worldX(bounds[2]) * size))];
    const [y0, y1] = [clamp(Math.floor(worldY(bounds[3]) * size)), clamp(Math.floor(worldY(bounds[1]) * size))];
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) tiles.push({ z, x, y });
  }
  return tiles;
}

// ── A vector tile, written by hand (Mapbox Vector Tile 2.1: protocol buffers) ──

function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
}
const zigzag = (value: number) => (value < 0 ? -value * 2 - 1 : value * 2);
const field = (number: number, wire: number) => varint(number * 8 + wire);
const bytesField = (number: number, body: number[] | Buffer) => [...field(number, 2), ...varint(body.length), ...body];
const stringField = (number: number, text: string) => bytesField(number, Buffer.from(text, "utf8"));
const varintField = (number: number, value: number) => [...field(number, 0), ...varint(value)];

type Value = string | number | boolean;
interface Feature {
  type: 1 | 2 | 3;
  /** Rings or lines of [x, y] in tile units; a single point for type 1. */
  geometry: Array<Array<[number, number]>>;
  properties: Record<string, Value>;
}

const EXTENT = 4096;

function encodeGeometry(feature: Feature): number[] {
  const out: number[] = [];
  let cx = 0;
  let cy = 0;
  const step = (x: number, y: number) => {
    out.push(zigzag(x - cx), zigzag(y - cy));
    cx = x;
    cy = y;
  };
  for (const part of feature.geometry) {
    out.push(1 | (1 << 3));
    step(part[0]![0], part[0]![1]);
    if (feature.type === 1) continue;
    out.push(2 | ((part.length - 1) << 3));
    for (const [x, y] of part.slice(1)) step(x, y);
    if (feature.type === 3) out.push(7 | (1 << 3));
  }
  return out;
}

function encodeLayer(name: string, features: Feature[]): number[] {
  const keys: string[] = [];
  const values: Value[] = [];
  const index = <T>(list: T[], item: T) => {
    const at = list.indexOf(item);
    return at === -1 ? list.push(item) - 1 : at;
  };
  const body: number[] = [...varintField(15, 2), ...stringField(1, name)];
  for (const feature of features) {
    const tags = Object.entries(feature.properties).flatMap(([key, value]) => [index(keys, key), index(values, value)]);
    body.push(
      ...bytesField(2, [
        ...bytesField(2, tags.flatMap(varint)),
        ...varintField(3, feature.type),
        ...bytesField(4, encodeGeometry(feature).flatMap(varint)),
      ]),
    );
  }
  for (const key of keys) body.push(...stringField(3, key));
  for (const value of values) {
    const encoded =
      typeof value === "string"
        ? stringField(1, value)
        : typeof value === "boolean"
          ? varintField(7, value ? 1 : 0)
          : Number.isInteger(value) && value >= 0
            ? varintField(5, value)
            : [...field(3, 1), ...new Uint8Array(new Float64Array([value]).buffer)];
    body.push(...bytesField(4, encoded));
  }
  body.push(...varintField(5, EXTENT));
  return bytesField(3, body);
}

function vectorTile(z: number, x: number, y: number): Buffer {
  const size = 2 ** z;
  // A little past the edge, so that lines and outlines join across tiles.
  const [low, high] = [-64, EXTENT + 64];
  const tx = (lon: number) => Math.round((worldX(lon) * size - x) * EXTENT);
  const ty = (lat: number) => Math.round((worldY(lat) * size - y) * EXTENT);
  const clip = (value: number) => Math.max(low, Math.min(high, value));
  const within = (value: number) => value >= low && value <= high;
  const layers = { earth: [] as Feature[], water: [] as Feature[], roads: [] as Feature[], places: [] as Feature[], pois: [] as Feature[] };

  layers.earth.push({
    type: 3,
    geometry: [
      [
        [low, low],
        [high, low],
        [high, high],
        [low, high],
      ],
    ],
    properties: { kind: "earth" },
  });

  const lake = { left: tx(LAKE.west), right: tx(LAKE.east), top: ty(LAKE.north), bottom: ty(LAKE.south) };
  if (lake.right > low && lake.left < high && lake.bottom > low && lake.top < high && lake.right - lake.left >= 1) {
    const [left, right, top, bottom] = [clip(lake.left), clip(lake.right), clip(lake.top), clip(lake.bottom)];
    layers.water.push({
      type: 3,
      geometry: [
        [
          [left, top],
          [right, top],
          [right, bottom],
          [left, bottom],
        ],
      ],
      properties: { kind: "lake", name: "Llyn Prawf", min_zoom: 8 },
    });
  }

  // Roads: only from the zoom at which a real map would show them. Each crosses its tile from edge to edge.
  if (z >= 11) {
    for (let index = -8; index <= 8; index += 1) {
      const across = tx(CENTRE.lon + ROAD_OFFSET + index * 0.02);
      if (within(across)) {
        layers.roads.push({
          type: 2,
          geometry: [
            [
              [across, low],
              [across, high],
            ],
          ],
          properties: { kind: "minor_road", kind_detail: "unclassified", min_zoom: 11 },
        });
      }
    }
    for (let index = -10; index <= 10; index += 1) {
      const down = ty(CENTRE.lat + 0.005 + index * 0.01);
      if (within(down)) {
        layers.roads.push({
          type: 2,
          geometry: [
            [
              [low, down],
              [high, down],
            ],
          ],
          properties: { kind: "minor_road", kind_detail: "unclassified", min_zoom: 11 },
        });
      }
    }
  }
  // The main road runs east–west 0.012° south of the centre, clear of the lake.
  const main = ty(CENTRE.lat - 0.012);
  if (z >= 7 && within(main)) {
    layers.roads.push({
      type: 2,
      geometry: [
        [
          [low, main],
          [high, main],
        ],
      ],
      properties: { kind: "major_road", kind_detail: "primary", name: "Ffordd Brawf", ref: "A0000", min_zoom: 7 },
    });
  }

  if (z >= 8) {
    for (const [index, place] of PLACES.entries()) {
      const [px, py] = [tx(place.lon), ty(place.lat)];
      // A point belongs to one tile only, or its name would be drawn twice.
      if (px < 0 || px >= EXTENT || py < 0 || py >= EXTENT) continue;
      layers.places.push({
        type: 1,
        geometry: [[[px, py]]],
        properties: { kind: "locality", kind_detail: "village", name: place.name, min_zoom: 8, population_rank: 4, sort_key: index },
      });
    }
  }

  // A summit, which the map marks with an icon from its sprite sheet.
  const [sx, sy] = [tx(SUMMIT.lon), ty(SUMMIT.lat)];
  if (z >= 11 && sx >= 0 && sx < EXTENT && sy >= 0 && sy < EXTENT) {
    layers.pois.push({ type: 1, geometry: [[[sx, sy]]], properties: { kind: "peak", name: SUMMIT.name, min_zoom: 11, elevation: 512 } });
  }

  const tile = Object.entries(layers)
    .filter(([, features]) => features.length > 0)
    .flatMap(([name, features]) => encodeLayer(name, features));
  return zlib.gzipSync(Buffer.from(tile));
}

// ── Terrain: PNG tiles in the Terrarium encoding ──

export function heightAt(lat: number, lon: number): number {
  const north = (lat - HILL.lat) * METRES_PER_DEGREE;
  const east = (lon - HILL.lon) * METRES_PER_DEGREE * Math.cos(HILL.lat * RAD);
  return HILL.foot + (HILL.top - HILL.foot) * Math.exp(-(north * north + east * east) / (2 * HILL.spreadMetres * HILL.spreadMetres));
}

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (data: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of data) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
})();

function png(width: number, height: number, rgb: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(CRC(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) rgb.copy(rows, row * (width * 3 + 1) + 1, row * width * 3, (row + 1) * width * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TERRAIN_TILE = 512;

function terrainTile(z: number, x: number, y: number): Buffer {
  const size = 2 ** z;
  const rgb = Buffer.alloc(TERRAIN_TILE * TERRAIN_TILE * 3);
  for (let row = 0; row < TERRAIN_TILE; row += 1) {
    const lat = latOf((y + (row + 0.5) / TERRAIN_TILE) / size);
    for (let column = 0; column < TERRAIN_TILE; column += 1) {
      const lon = ((x + (column + 0.5) / TERRAIN_TILE) / size) * 360 - 180;
      // Terrarium: height = red × 256 + green + blue / 256 − 32768. Kept to sixteenths of a metre: fine
      // enough for smooth shading and contour lines, coarse enough that the tiles stay small.
      const value = Math.round((heightAt(lat, lon) + 32768) * 16) / 16;
      const at = (row * TERRAIN_TILE + column) * 3;
      rgb[at] = Math.floor(value / 256);
      rgb[at + 1] = Math.floor(value) % 256;
      rgb[at + 2] = Math.round((value % 1) * 256);
    }
  }
  return png(TERRAIN_TILE, TERRAIN_TILE, rgb);
}

/** The map archive: vector tiles from zoom 0 to `MAP_MAX_ZOOM` over `MAP_BOUNDS`. */
export function buildMapArchive(): Buffer {
  const tiles: FixtureTile[] = tilesFor(MAP_BOUNDS, 0, MAP_MAX_ZOOM).map((tile) => ({ ...tile, data: vectorTile(tile.z, tile.x, tile.y) }));
  return buildArchive({ tiles, bounds: MAP_BOUNDS, metadata: { name: "Outpost test map", vector_layers: [] } }).bytes;
}

/** The terrain archive for the same ground, to zoom `TERRAIN_MAX_ZOOM`. */
export function buildTerrainArchive(): Buffer {
  const tiles: FixtureTile[] = tilesFor(MAP_BOUNDS, 0, TERRAIN_MAX_ZOOM).map((tile) => ({
    ...tile,
    data: terrainTile(tile.z, tile.x, tile.y),
  }));
  return buildArchive({
    tiles,
    bounds: MAP_BOUNDS,
    tileType: TileType.Png,
    tileCompression: Compression.None,
    metadata: { name: "Outpost test terrain", encoding: "terrarium" },
  }).bytes;
}

// ── Installing it in the Outpost under test, and reading what comes out ──

export interface InstalledTestMaps {
  ids: string[];
}

/** Writes both archives into the default storage location and registers them, as a person importing their own files would. */
export async function installTestMaps(page: Page): Promise<InstalledTestMaps> {
  const { locations } = await api<{ locations: Array<{ id: string; path: string; isDefault: boolean }> }>(
    page,
    "GET",
    "/api/storage/locations",
  );
  const location = locations.find((item) => item.isDefault)!;
  const folder = path.join(location.path, "imports");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "test-map.pmtiles"), buildMapArchive());
  fs.writeFileSync(path.join(folder, "test-terrain.pmtiles"), buildTerrainArchive());
  const map = await api(page, "POST", "/api/maps/import", {
    locationId: location.id,
    relPath: "imports/test-map.pmtiles",
    name: "Test map",
  });
  const terrain = await api(page, "POST", "/api/maps/import", {
    locationId: location.id,
    relPath: "imports/test-terrain.pmtiles",
    name: "Test terrain",
    tileType: "terrain",
  });
  return { ids: [map.collection.id, terrain.collection.id] };
}

/** Takes them away again, so the tests that follow start from the map they expect. */
export async function removeTestMaps(page: Page, installed: InstalledTestMaps | undefined): Promise<void> {
  for (const id of installed?.ids ?? []) {
    await page.request.delete(`/api/collections/${id}?deleteFiles=true`, { headers: { "X-Outpost-Request": "1" } });
  }
}

export interface ReadPdf {
  pages: number;
  /** The page's size in points. */
  width: number;
  height: number;
  /** Every picture in the file: the size it declares, and the JPEG itself. */
  images: Array<{ width: number; height: number; jpeg: Buffer }>;
  /** Where each picture is put on the page: size and bottom-left corner, in points. */
  placed: Array<{ width: number; height: number; x: number; y: number }>;
  /** The file as text, for looking up the lettering. */
  text: string;
}

/** Reads the few things these tests check straight from a PDF's bytes, without a PDF library. */
export function readPdf(bytes: Buffer): ReadPdf {
  const text = bytes.toString("latin1");
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
  const images = [
    ...text.matchAll(/\/Subtype \/Image \/Width (\d+) \/Height (\d+)[^>]*?\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/g),
  ].map((match) => {
    const from = match.index + match[0].length;
    return { width: Number(match[1]), height: Number(match[2]), jpeg: bytes.subarray(from, from + Number(match[3])) };
  });
  // The print kit's files (pdfmake, through pdfkit) write a picture's dictionary a key to a line.
  if (images.length === 0)
    for (const match of text.matchAll(/<<\n\/Type \/XObject\n\/Subtype \/Image\n([\s\S]*?)>>\nstream\n/g)) {
      const entry = (key: string) => Number(new RegExp(`/${key} (\\d+)\\n`).exec(match[1]!)?.[1]);
      if (!/\/Filter \/DCTDecode/.test(match[1]!)) continue;
      const from = match.index + match[0].length;
      images.push({ width: entry("Width"), height: entry("Height"), jpeg: bytes.subarray(from, from + entry("Length")) });
    }
  const placed = [...text.matchAll(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im\d+ Do Q/g)].map((match) => ({
    width: Number(match[1]),
    height: Number(match[2]),
    x: Number(match[3]),
    y: Number(match[4]),
  }));
  return {
    pages: Number(/\/Type \/Pages[^>]*\/Count (\d+)/.exec(text)?.[1]),
    width: Number(box?.[1]),
    height: Number(box?.[2]),
    images,
    placed,
    text,
  };
}

/** The size a JPEG says it is, read from its own header (the start-of-frame segment), not from the PDF around it. */
export function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let at = 2;
  while (at < jpeg.length) {
    const marker = jpeg[at + 1]!;
    const length = jpeg.readUInt16BE(at + 2);
    // SOF0 to SOF2: baseline and progressive frames.
    if (marker >= 0xc0 && marker <= 0xc2) return { height: jpeg.readUInt16BE(at + 5), width: jpeg.readUInt16BE(at + 7) };
    at += 2 + length;
  }
  throw new Error("That is not a JPEG with a frame header.");
}

/**
 * Measures a patch of one colour in a JPEG, in a real browser: from a point inside the
 * patch, how far the same colour runs along its row and down its column, in pixels.
 */
export async function measurePatch(page: Page, jpeg: Buffer, at: { x: number; y: number }): Promise<{ width: number; height: number }> {
  return page.evaluate(
    async ({ base64, at }) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const x = Math.round(bitmap.width * at.x);
      const y = Math.round(bitmap.height * at.y);
      const row = context.getImageData(0, y, bitmap.width, 1).data;
      const column = context.getImageData(x, 0, 1, bitmap.height).data;
      const reference = [row[x * 4]!, row[x * 4 + 1]!, row[x * 4 + 2]!];
      const same = (data: Uint8ClampedArray, index: number) =>
        Math.abs(data[index * 4]! - reference[0]!) +
          Math.abs(data[index * 4 + 1]! - reference[1]!) +
          Math.abs(data[index * 4 + 2]! - reference[2]!) <
        24;
      const run = (data: Uint8ClampedArray, from: number, length: number) => {
        let low = from;
        let high = from;
        while (low > 0 && same(data, low - 1)) low -= 1;
        while (high < length - 1 && same(data, high + 1)) high += 1;
        return high - low + 1;
      };
      return { width: run(row, x, bitmap.width), height: run(column, y, bitmap.height) };
    },
    { base64: jpeg.toString("base64"), at },
  );
}

/**
 * Attaches something a test made (a PDF, a screenshot) to its report. With
 * OUTPOST_E2E_KEEP set to a folder it is also written there, so that the pages these
 * tests print can be opened and looked at after a run that passed.
 */
export async function keep(testInfo: TestInfo, name: string, body: Buffer, contentType: string): Promise<void> {
  await testInfo.attach(name, { body, contentType });
  const folder = process.env.OUTPOST_E2E_KEEP;
  if (!folder) return;
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${testInfo.project.name}-${name}`), body);
}

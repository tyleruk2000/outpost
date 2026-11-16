/**
 * Map tiles of a small area from one Sentinel-2 pass, made from the publisher's own
 * files by reading only the parts that cover the area.
 *
 * What is done to the numbers, exactly (also in docs/maps.md):
 *
 * 1. The red, green and blue bands (B04, B03, B02) of the Level-2A product are read at
 *    their native 10 m. Each value is turned into surface reflectance with the scale
 *    and offset the publisher's metadata gives (for current scenes ×0.0001 − 0.1).
 * 2. Reflectance from 0 to WHITE (0.3) is mapped to 0 to 1 and anything above is held at
 *    1; that is then put on the sRGB curve, as a screen expects light to be encoded,
 *    and written as 8 bits. The same numbers are used for every scene: there is no
 *    stretch fitted to a picture, no colour balancing, no sharpening.
 * 3. Each pixel of the deepest zoom is taken back to its place in the scene's UTM grid
 *    and read by bilinear interpolation between the four nearest 10 m pixels. Each
 *    coarser zoom is the average of four pixels of the one below.
 * 4. A pixel with no data in a scene (value 0, beyond the edge of the swath) is taken
 *    from the next scene of the same pass if there is one, and is otherwise left
 *    transparent, so the coarser imagery beneath shows through. Outside the chosen
 *    area every pixel is transparent.
 *
 * The work goes area by area (a zoom-10 square at a time, about 25 km), so a large
 * area needs no more memory than a small one.
 */
import type { Bbox } from "@outpost/shared";
import { type ByteSource, COG_HEADER_BYTES, Cog, type TileRef } from "./cog.ts";
import type { ImageArchiveWriter } from "./pmtiles-writer.ts";
import { honestMaxZoom, lonLatToUtm, lonLatToWorldPixel, TILE_SIZE, utmZoneOf, worldPixelToLonLat } from "./projection.ts";
import type { RangeFetcher } from "./ranges.ts";
import { blank, cut, encodeTile, halve, isEmpty, type Picture, parentOf } from "./render.ts";
import { type Scene, sceneCovers } from "./stac.ts";

/** Reflectance drawn as full white. Chosen by looking at real scenes (docs/maps.md). */
export const WHITE = 0.3;
export const SENTINEL_RESOLUTION = 10;
/** Shallowest zoom an area is made for; the world imagery, if any, lies beneath it. */
export const SENTINEL_MIN_ZOOM = 6;
/** How many zooms of the deepest are made at once from one piece of the scene. */
const CHUNK_DEPTH = 3;

const BANDS = ["red", "green", "blue"] as const;

/** 8-bit sRGB value for each reflectance stored as a whole number 0…65535 after scale and offset. */
function stretchTable(scale: number, offset: number): Uint8Array {
  const table = new Uint8Array(65536);
  for (let value = 1; value < 65536; value += 1) {
    const reflectance = value * scale + offset;
    const linear = Math.min(1, Math.max(0, reflectance / WHITE));
    const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
    table[value] = Math.round(encoded * 255);
  }
  return table;
}

export interface BandSource {
  cog: Cog;
  url: string;
}

export interface ScenePlan {
  scene: Scene;
  zone: { zone: number; south: boolean };
  bands: Record<(typeof BANDS)[number], BandSource>;
}

export interface SentinelPlan {
  bbox: Bbox;
  minZoom: number;
  maxZoom: number;
  scenes: ScenePlan[];
  /** Bytes the build will fetch beyond the headers already read, exactly. */
  tileBytes: number;
  tileRequests: number;
  /** Bytes the headers took (read once more when the build starts, unless cached). */
  headerBytes: number;
  outputTiles: number;
}

const remote = (fetcher: RangeFetcher, url: string): ByteSource => ({ read: (offset, length) => fetcher.read(url, offset, length) });

/** Projected outline of a box in a UTM zone: its edges sampled, then the extremes. */
function utmBounds(bbox: Bbox, zone: number, south: boolean): [number, number, number, number] {
  const [west, south_, east, north] = bbox;
  let minE = Number.POSITIVE_INFINITY;
  let minN = Number.POSITIVE_INFINITY;
  let maxE = Number.NEGATIVE_INFINITY;
  let maxN = Number.NEGATIVE_INFINITY;
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    for (const [lon, lat] of [
      [west + t * (east - west), south_],
      [west + t * (east - west), north],
      [west, south_ + t * (north - south_)],
      [east, south_ + t * (north - south_)],
    ] as Array<[number, number]>) {
      const [e, n] = lonLatToUtm(lon, lat, zone, south);
      minE = Math.min(minE, e);
      maxE = Math.max(maxE, e);
      minN = Math.min(minN, n);
      maxN = Math.max(maxN, n);
    }
  }
  return [minE, minN, maxE, maxN];
}

/** The pixel window of image 0 of a band that a box needs, with a pixel to spare for interpolation. */
function windowOf(cog: Cog, bbox: Bbox, zone: number, south: boolean): [number, number, number, number] | undefined {
  const [minE, minN, maxE, maxN] = utmBounds(bbox, zone, south);
  const image = cog.images[0]!;
  const x0 = Math.max(0, Math.floor((minE - cog.geo.originX) / cog.geo.pixelWidth) - 2);
  const x1 = Math.min(image.width, Math.ceil((maxE - cog.geo.originX) / cog.geo.pixelWidth) + 2);
  const y0 = Math.max(0, Math.floor((cog.geo.originY - maxN) / cog.geo.pixelHeight) - 2);
  const y1 = Math.min(image.height, Math.ceil((cog.geo.originY - minN) / cog.geo.pixelHeight) + 2);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : undefined;
}

/** Map tiles at zoom `z` that a box touches. */
export function tileRect(bbox: Bbox, z: number): { x0: number; y0: number; x1: number; y1: number } {
  const [px0, py0] = lonLatToWorldPixel(bbox[0], bbox[3], z);
  const [px1, py1] = lonLatToWorldPixel(bbox[2], bbox[1], z);
  const last = 2 ** z - 1;
  return {
    x0: Math.max(0, Math.floor(px0 / TILE_SIZE)),
    y0: Math.max(0, Math.floor(py0 / TILE_SIZE)),
    x1: Math.min(last, Math.floor((px1 - 1e-9) / TILE_SIZE)),
    y1: Math.min(last, Math.floor((py1 - 1e-9) / TILE_SIZE)),
  };
}

export function countOutputTiles(bbox: Bbox, minZoom: number, maxZoom: number): number {
  let count = 0;
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const rect = tileRect(bbox, z);
    count += (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1);
  }
  return count;
}

/** The deepest zoom for this area: 10 m pixels at its middle latitude, no deeper (see honestMaxZoom). */
export function sentinelMaxZoom(bbox: Bbox): number {
  return honestMaxZoom(SENTINEL_RESOLUTION, (bbox[1] + bbox[3]) / 2);
}

/** Reads the scenes' headers and works out exactly which parts of their files the area needs. */
export async function planSentinel(fetcher: RangeFetcher, bbox: Bbox, scenes: Scene[]): Promise<SentinelPlan> {
  const before = fetcher.transfer.bytes;
  const plans: ScenePlan[] = [];
  for (const scene of scenes) {
    const zone = utmZoneOf(scene.epsg);
    if (!zone) throw new Error(`Scene ${scene.id} is not in a UTM projection, which Outpost does not read.`);
    const bands = {} as ScenePlan["bands"];
    for (const name of BANDS) {
      const url = scene.bands[name];
      const cog = await Cog.open(remote(fetcher, url), await fetcher.read(url, 0, COG_HEADER_BYTES));
      if (cog.geo.epsg !== null && cog.geo.epsg !== scene.epsg) throw new Error(`Scene ${scene.id}'s files disagree about where it is.`);
      bands[name] = { cog, url };
    }
    plans.push({ scene, zone, bands });
  }
  const headerBytes = fetcher.transfer.bytes - before;
  const minZoom = SENTINEL_MIN_ZOOM;
  const maxZoom = Math.max(minZoom, sentinelMaxZoom(bbox));
  // Every COG tile any chunk will read, counted once.
  const needed = new Map<string, number>();
  for (const plan of plans) {
    for (const name of BANDS) {
      const { cog, url } = plan.bands[name];
      const window = windowOf(cog, bbox, plan.zone.zone, plan.zone.south);
      if (!window) continue;
      for (const ref of cog.tilesFor(0, ...window)) if (ref.length > 0) needed.set(`${url}#${ref.index}`, ref.length);
    }
  }
  return {
    bbox,
    minZoom,
    maxZoom,
    scenes: plans,
    tileBytes: [...needed.values()].reduce((sum, length) => sum + length, 0),
    tileRequests: needed.size,
    headerBytes,
    outputTiles: countOutputTiles(bbox, minZoom, maxZoom),
  };
}

/** SCL classes that are cloud or its shadow: 3 cloud shadow, 8 and 9 cloud, 10 thin cirrus. */
const CLOUDY = new Set([3, 8, 9, 10]);

/**
 * Cloud and cloud shadow over the area, in percent, from the scene classification layer
 * (SCL) the publisher makes with each scene, read from one of its reduced copies (80 m
 * or so): a few small requests. Null when there is none.
 */
export async function areaCloud(fetcher: RangeFetcher, bbox: Bbox, scenes: Scene[]): Promise<number | null> {
  const opened: Array<{ scene: Scene; cog: Cog; level: number; zone: { zone: number; south: boolean }; tiles: Map<number, Uint8Array> }> =
    [];
  for (const scene of scenes) {
    const zone = utmZoneOf(scene.epsg);
    if (!scene.bands.scl || !zone) continue;
    const url = scene.bands.scl;
    const cog = await Cog.open(remote(fetcher, url), await fetcher.read(url, 0, COG_HEADER_BYTES));
    let level = 0;
    for (let i = 0; i < cog.images.length; i += 1) if (cog.pixelSizeOf(i)[0] <= 160) level = i;
    opened.push({ scene, cog, level, zone, tiles: new Map() });
  }
  if (opened.length === 0) return null;
  const [west, south, east, north] = bbox;
  const steps = 48;
  let counted = 0;
  let cloudy = 0;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const lon = west + ((i + 0.5) / steps) * (east - west);
      const lat = south + ((j + 0.5) / steps) * (north - south);
      for (const entry of opened) {
        if (!sceneCovers(entry.scene, lon, lat)) continue;
        const [e, n] = lonLatToUtm(lon, lat, entry.zone.zone, entry.zone.south);
        const [pw, ph] = entry.cog.pixelSizeOf(entry.level);
        const x = Math.floor((e - entry.cog.geo.originX) / pw);
        const y = Math.floor((entry.cog.geo.originY - n) / ph);
        const image = entry.cog.images[entry.level]!;
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
        const [ref] = entry.cog.tilesFor(entry.level, x, y, x + 1, y + 1);
        if (!ref) continue;
        let bytes = entry.tiles.get(ref.index);
        if (!bytes) {
          bytes = await fetcher.read(entry.scene.bands.scl!, ref.offset, ref.length);
          entry.tiles.set(ref.index, bytes);
        }
        const pixels = entry.cog.decodeTile(entry.level, bytes);
        const across = Math.ceil(image.width / image.tileWidth);
        const tx = (ref.index % across) * image.tileWidth;
        const ty = Math.floor(ref.index / across) * image.tileHeight;
        const value = pixels[(y - ty) * image.tileWidth + (x - tx)]!;
        if (value === 0) continue;
        counted += 1;
        if (CLOUDY.has(value)) cloudy += 1;
        break;
      }
    }
  }
  return counted === 0 ? null : Math.round((cloudy / counted) * 1000) / 10;
}

export interface BuildProgress {
  tilesWritten: number;
  tilesTotal: number;
  message: string;
}

interface Band {
  width: number;
  x0: number;
  y0: number;
  height: number;
  data: Uint16Array;
}

/** A band's values over a window, from tiles fetched through `fetcher`. */
async function readBand(fetcher: RangeFetcher, source: BandSource, window: [number, number, number, number]): Promise<Band> {
  const refs: TileRef[] = source.cog.tilesFor(0, ...window);
  const tiles = new Map<number, Uint8Array>();
  await Promise.all(
    refs.map(async (ref) => {
      tiles.set(ref.index, ref.length > 0 ? await fetcher.read(source.url, ref.offset, ref.length) : new Uint8Array(0));
    }),
  );
  const assembled = source.cog.assemble(0, ...window, tiles);
  if (!(assembled.data instanceof Uint16Array) || assembled.samples !== 1)
    throw new Error("A Sentinel-2 band was not in the expected form.");
  return { width: assembled.width, height: assembled.height, x0: window[0], y0: window[1], data: assembled.data };
}

/** Bilinear read of a band at a fractional pixel position; 0 means no data. */
function sample(band: Band, fx: number, fy: number): number {
  const x = fx - band.x0 - 0.5;
  const y = fy - band.y0 - 0.5;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix + 1 >= band.width || iy + 1 >= band.height) {
    const nx = Math.round(x);
    const ny = Math.round(y);
    if (nx < 0 || ny < 0 || nx >= band.width || ny >= band.height) return 0;
    return band.data[ny * band.width + nx]!;
  }
  const at = iy * band.width + ix;
  const a = band.data[at]!;
  const b = band.data[at + 1]!;
  const c = band.data[at + band.width]!;
  const d = band.data[at + band.width + 1]!;
  if (a === 0 || b === 0 || c === 0 || d === 0) {
    // At the edge of the data: the nearest pixel, never a blend with "nothing".
    return band.data[Math.round(y) * band.width + Math.round(x)] ?? 0;
  }
  const tx = x - ix;
  const ty = y - iy;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** UTM coordinates every this many pixels, and interpolated between: well under a millimetre off over 16 pixels. */
const GRID = 16;

/**
 * Makes every tile of the area and writes it. Returns the tiles written per zoom.
 */
export async function buildSentinel(
  plan: SentinelPlan,
  fetcher: RangeFetcher,
  writer: ImageArchiveWriter,
  options: { signal?: AbortSignal; onProgress?: (progress: BuildProgress) => void } = {},
): Promise<number> {
  const { bbox, minZoom, maxZoom } = plan;
  const chunkZoom = Math.max(minZoom, maxZoom - CHUNK_DEPTH);
  const depth = maxZoom - chunkZoom;
  const side = TILE_SIZE * 2 ** depth;
  const tables = plan.scenes.map((entry) => stretchTable(entry.scene.scale, entry.scene.offset));
  const kept = new Map<string, Picture>();
  const total = plan.outputTiles;
  let done = 0;
  const report = (message: string) => options.onProgress?.({ tilesWritten: done, tilesTotal: total, message });

  const chunks = tileRect(bbox, chunkZoom);
  const chunkCount = (chunks.x1 - chunks.x0 + 1) * (chunks.y1 - chunks.y0 + 1);
  let chunkIndex = 0;
  for (let cy = chunks.y0; cy <= chunks.y1; cy += 1) {
    for (let cx = chunks.x0; cx <= chunks.x1; cx += 1) {
      options.signal?.throwIfAborted();
      chunkIndex += 1;
      report(chunkCount > 1 ? `Fetching part ${chunkIndex} of ${chunkCount} of the area` : "Fetching the picture of the area");
      // The part of the area inside this chunk.
      const [cw, cn] = worldPixelToLonLat(cx * TILE_SIZE, cy * TILE_SIZE, chunkZoom);
      const [ce, cs] = worldPixelToLonLat((cx + 1) * TILE_SIZE, (cy + 1) * TILE_SIZE, chunkZoom);
      const part: Bbox = [Math.max(bbox[0], cw), Math.max(bbox[1], cs), Math.min(bbox[2], ce), Math.min(bbox[3], cn)];
      if (part[0] >= part[2] || part[1] >= part[3]) continue;

      const readers: Array<{ plan: ScenePlan; table: Uint8Array; bands: Band[]; gx: Float64Array; gy: Float64Array }> = [];
      for (const [index, entry] of plan.scenes.entries()) {
        const window = windowOf(entry.bands.red.cog, part, entry.zone.zone, entry.zone.south);
        if (!window) continue;
        const bands: Band[] = [];
        for (const name of BANDS) bands.push(await readBand(fetcher, entry.bands[name], window));
        readers.push({ plan: entry, table: tables[index]!, bands, gx: new Float64Array(0), gy: new Float64Array(0) });
      }

      report(chunkCount > 1 ? `Making map tiles for part ${chunkIndex} of ${chunkCount}` : "Making map tiles");
      const picture = blank(side, side);
      const originX = cx * side;
      const originY = cy * side;
      const lons = new Float64Array(side);
      const lats = new Float64Array(side);
      for (let i = 0; i < side; i += 1) {
        lons[i] = worldPixelToLonLat(originX + i + 0.5, 0, maxZoom)[0];
        lats[i] = worldPixelToLonLat(0, originY + i + 0.5, maxZoom)[1];
      }
      const nodes = side / GRID + 1;
      for (const reader of readers) {
        const { zone, south } = reader.plan.zone;
        const cog = reader.plan.bands.red.cog;
        // Pixel position in the band at each grid node.
        const gx = new Float64Array(nodes * nodes);
        const gy = new Float64Array(nodes * nodes);
        for (let j = 0; j < nodes; j += 1) {
          const lat = worldPixelToLonLat(0, originY + Math.min(side, j * GRID) + 0.5, maxZoom)[1];
          for (let i = 0; i < nodes; i += 1) {
            const lon = worldPixelToLonLat(originX + Math.min(side, i * GRID) + 0.5, 0, maxZoom)[0];
            const [e, n] = lonLatToUtm(lon, lat, zone, south);
            gx[j * nodes + i] = (e - cog.geo.originX) / cog.geo.pixelWidth;
            gy[j * nodes + i] = (cog.geo.originY - n) / cog.geo.pixelHeight;
          }
        }
        reader.gx = gx;
        reader.gy = gy;
      }
      const data = picture.data;
      for (let y = 0; y < side; y += 1) {
        const lat = lats[y]!;
        if (lat < bbox[1] || lat > bbox[3]) continue;
        const j = Math.floor(y / GRID);
        const ty = (y - j * GRID) / GRID;
        for (let x = 0; x < side; x += 1) {
          const lon = lons[x]!;
          if (lon < bbox[0] || lon > bbox[2]) continue;
          const i = Math.floor(x / GRID);
          const tx = (x - i * GRID) / GRID;
          for (const reader of readers) {
            const { gx, gy } = reader;
            const k = j * nodes + i;
            const fx = (gx[k]! * (1 - tx) + gx[k + 1]! * tx) * (1 - ty) + (gx[k + nodes]! * (1 - tx) + gx[k + nodes + 1]! * tx) * ty;
            const fy = (gy[k]! * (1 - tx) + gy[k + 1]! * tx) * (1 - ty) + (gy[k + nodes]! * (1 - tx) + gy[k + nodes + 1]! * tx) * ty;
            const r = sample(reader.bands[0]!, fx, fy);
            const g = sample(reader.bands[1]!, fx, fy);
            const b = sample(reader.bands[2]!, fx, fy);
            if (r === 0 || g === 0 || b === 0) continue;
            const at = (y * side + x) * 4;
            data[at] = reader.table[Math.round(r)]!;
            data[at + 1] = reader.table[Math.round(g)]!;
            data[at + 2] = reader.table[Math.round(b)]!;
            data[at + 3] = 255;
            break;
          }
        }
        if (y % 256 === 255) {
          options.signal?.throwIfAborted();
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

      // The deepest zoom, then each coarser one down to the chunk's own tile.
      let level = picture;
      for (let z = maxZoom; z >= chunkZoom; z -= 1) {
        const across = level.width / TILE_SIZE;
        const rect = tileRect(part, z);
        const firstX = cx * across;
        const firstY = cy * across;
        for (let row = 0; row < across; row += 1) {
          for (let column = 0; column < across; column += 1) {
            const tx = firstX + column;
            const ty = firstY + row;
            if (tx < rect.x0 || tx > rect.x1 || ty < rect.y0 || ty > rect.y1) continue;
            const tile = cut(level, column, row);
            if (z === chunkZoom) kept.set(`${tx}/${ty}`, tile);
            if (!isEmpty(tile)) await writer.addTile(z, tx, ty, await encodeTile(tile));
            done += 1;
          }
        }
        report(chunkCount > 1 ? `Making map tiles for part ${chunkIndex} of ${chunkCount}` : "Making map tiles");
        if (z > chunkZoom) level = halve(level);
      }
    }
  }

  // Coarser zooms, from the chunks' own tiles.
  let below = kept;
  for (let z = chunkZoom - 1; z >= minZoom; z -= 1) {
    const rect = tileRect(bbox, z);
    const above = new Map<string, Picture>();
    for (let ty = rect.y0; ty <= rect.y1; ty += 1) {
      for (let tx = rect.x0; tx <= rect.x1; tx += 1) {
        const children = [0, 1, 2, 3].map((k) => below.get(`${tx * 2 + (k % 2)}/${ty * 2 + Math.floor(k / 2)}`));
        const tile = parentOf(children);
        above.set(`${tx}/${ty}`, tile);
        if (!isEmpty(tile)) await writer.addTile(z, tx, ty, await encodeTile(tile));
        done += 1;
      }
    }
    below = above;
  }
  report("Finishing");
  return done;
}

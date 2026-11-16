/**
 * Heights from the terrain that is installed.
 *
 * Terrain tiles are images whose colours are heights ("Terrarium" encoding: red × 256 +
 * green + blue ÷ 256 − 32768 metres). The browser uses them for hill shading; this
 * reads the same tiles on the server to give a drawn route its heights. Nothing is ever
 * downloaded for this: where no terrain is installed, the answer is "not known".
 */

import zlib from "node:zlib";
import type { AppContext } from "../../core/context.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { decodePng } from "./terrain/png.ts";
import { type DecodedImage, decodeLosslessWebp } from "./terrain/webp-lossless.ts";
import type { ServedTile, TileServer } from "./tile-server.ts";

const DEG = Math.PI / 180;
const EARTH_CIRCUMFERENCE = 40_075_016.686;
/** Beyond this the Web Mercator map, and so every tile, ends. */
const MAX_LATITUDE = 85.0511;
/** Decoded tiles kept while one request is answered (about 1 MB each at 512 px). */
const MAX_DECODED_TILES = 24;
/** Tiles coarser than this (pixels of 100 m and more) are only read for a line sampled that coarsely. */
const COARSEST_USEFUL_ZOOM = 9;
/** Nothing on Earth is outside this range; a value beyond it is a hole in the data. */
const LOWEST = -11_500;
const HIGHEST = 9_000;

export interface ElevationSampler {
  /**
   * The height in metres at each [longitude, latitude], or null where no installed
   * terrain covers it. `spacingMeters` is how far apart the positions are: a long line
   * sampled coarsely is read from coarser tiles, so it never touches thousands of them.
   */
  sample(positions: ReadonlyArray<readonly [lon: number, lat: number]>, spacingMeters: number): Promise<Array<number | null>>;
  /**
   * The same, and for each position the width in metres of one cell of the tile its
   * height was read from (null where there is none): a caller that has to say how fine
   * its heights are can.
   */
  sampleWithCells(positions: ReadonlyArray<readonly [lon: number, lat: number]>, spacingMeters: number): Promise<SampledHeights>;
}

export interface SampledHeights {
  heights: Array<number | null>;
  cells: Array<number | null>;
}

/**
 * Width in metres of one cell (one height) of a terrain tile at a zoom and latitude.
 * The terrain Outpost downloads has tiles 512 cells across; an imported archive may not.
 */
export function terrainCellMeters(zoom: number, latitude: number, tileSize = 512): number {
  return (EARTH_CIRCUMFERENCE * Math.max(0.01, Math.cos(latitude * DEG))) / (tileSize * 2 ** zoom);
}

interface HeightTile {
  size: number;
  heights: Float32Array;
}

/** Turns a tile image into heights. Exported for tests. */
export function terrariumHeights(image: DecodedImage): HeightTile | null {
  if (image.width !== image.height) return null;
  const heights = new Float32Array(image.argb.length);
  for (let index = 0; index < heights.length; index += 1) {
    const pixel = image.argb[index]!;
    const height = ((pixel >>> 16) & 0xff) * 256 + ((pixel >>> 8) & 0xff) + (pixel & 0xff) / 256 - 32768;
    // A transparent pixel, or a height that cannot be, marks a place the data does not cover.
    heights[index] = pixel >>> 24 === 0 || height < LOWEST || height > HIGHEST ? Number.NaN : height;
  }
  return { size: image.width, heights };
}

function decodeTile(tile: ServedTile): HeightTile | null {
  let data: Uint8Array = tile.data;
  if (tile.contentEncoding === "gzip") data = zlib.gunzipSync(tile.data);
  else if (tile.contentEncoding === "br") data = zlib.brotliDecompressSync(tile.data);
  else if (tile.contentEncoding) return null;
  if (tile.contentType === "image/webp") return terrariumHeights(decodeLosslessWebp(data));
  if (tile.contentType === "image/png") return terrariumHeights(decodePng(data));
  return null;
}

/** A height between pixel centres, weighted by how near each of the four around it is. */
function interpolate(tile: HeightTile, u: number, v: number): number | null {
  const last = tile.size - 1;
  const x = Math.min(last, Math.max(0, u * tile.size - 0.5));
  const y = Math.min(last, Math.max(0, v * tile.size - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(last, x0 + 1);
  const y1 = Math.min(last, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (column: number, row: number) => tile.heights[row * tile.size + column]!;
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  const height = top * (1 - fy) + bottom * fy;
  return Number.isNaN(height) ? null : Math.round(height * 10) / 10;
}

export function createElevationSampler(ctx: AppContext, tiles: TileServer): ElevationSampler {
  const sampler: ElevationSampler = {
    async sample(positions, spacingMeters) {
      return (await sampler.sampleWithCells(positions, spacingMeters)).heights;
    },

    async sampleWithCells(positions, spacingMeters) {
      const terrain = tiles.sources().sources.terrain;
      if (!terrain || positions.length === 0) return { heights: positions.map(() => null), cells: positions.map(() => null) };
      const [west, south, east, north] = terrain.bounds;

      // Tiles fine enough that a pixel is about half the spacing, and no finer than is installed.
      const middle = positions[positions.length >> 1]![1];
      const wanted = Math.ceil(Math.log2(terrainCellMeters(0, middle) / Math.max(1, spacingMeters / 2)));
      const startZoom = Math.min(terrain.maxzoom, Math.max(terrain.minzoom, wanted));
      // Where the detailed tile is missing a coarser one is used, but only so far: a pixel
      // a kilometre wide says nothing useful about the height of a point on a hillside.
      const lowestZoom = Math.max(terrain.minzoom, Math.min(startZoom - 2, COARSEST_USEFUL_ZOOM));

      /** Decoded tiles, least recently used first; null for a tile that is not there. */
      const cache = new Map<string, HeightTile | null>();
      let decoded = 0;
      const load = async (z: number, x: number, y: number): Promise<HeightTile | null> => {
        const key = `${z}/${x}/${y}`;
        const cached = cache.get(key);
        if (cached !== undefined) {
          cache.delete(key);
          cache.set(key, cached);
          return cached;
        }
        let tile: HeightTile | null = null;
        try {
          const served = await tiles.getTile("terrain", z, x, y);
          if (served) tile = decodeTile(served);
        } catch (error) {
          // A tile that cannot be read is a gap in the heights, not a failed request.
          ctx.log.warn({ err: error, tile: key }, "terrain tile could not be read for heights");
        }
        cache.set(key, tile);
        if (tile) {
          decoded += 1;
          // Decoding a tile is tens of milliseconds of arithmetic. A long line reads many, so
          // other requests get a turn between one tile and the next.
          await yieldToEventLoop();
        }
        for (const [oldest, value] of cache) {
          if (decoded <= MAX_DECODED_TILES) break;
          if (!value || oldest === key) continue;
          cache.delete(oldest);
          decoded -= 1;
        }
        return tile;
      };

      const heights: Array<number | null> = [];
      const cells: Array<number | null> = [];
      for (const [lon, lat] of positions) {
        let height: number | null = null;
        let cell: number | null = null;
        if (lon >= west && lon <= east && lat >= south && lat <= north && Math.abs(lat) < MAX_LATITUDE) {
          const worldX = (lon + 180) / 360;
          const worldY = (1 - Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG)) / Math.PI) / 2;
          // The detailed tile may not exist here (another region, downloaded with less detail).
          for (let z = startZoom; z >= lowestZoom && height === null; z -= 1) {
            const scale = 2 ** z;
            const x = Math.min(scale - 1, Math.floor(worldX * scale));
            const y = Math.min(scale - 1, Math.floor(worldY * scale));
            const tile = await load(z, x, y);
            if (tile) height = interpolate(tile, worldX * scale - x, worldY * scale - y);
            if (tile && height !== null) cell = terrainCellMeters(z, lat, tile.size);
          }
        }
        heights.push(height);
        cells.push(cell);
      }
      return { heights, cells };
    },
  };
  return sampler;
}

/**
 * Map tiles of a small area from a national aerial photograph: an orthophoto that a
 * government publishes as Cloud-Optimised GeoTIFFs, one file to a sheet of its own grid.
 *
 * What is done to the picture, exactly (also in docs/maps.md):
 *
 * 1. The photograph is already 8-bit colour, as the publisher made it for looking at.
 *    Its red, green and blue are used as they are: no stretch, no colour balance, no
 *    sharpening. A fourth band that is near infra-red is left out; a fourth band that is
 *    transparency marks where there is no photograph.
 * 2. The deepest zoom is the first whose map pixels are as fine as the photograph's at
 *    the area's latitude, or the source's own ceiling if that is shallower (see
 *    `AerialSourceDef.maxZoom`). Nothing finer than the photograph is made.
 * 3. The publisher's files carry reduced copies (overviews). Each map zoom is read from
 *    the coarsest copy that is still at least as fine as the map pixels, so a coarse zoom
 *    does not fetch the full photograph.
 * 4. Each map pixel of the deepest zoom is taken back to the publisher's grid and read
 *    by bilinear interpolation between the four nearest pixels; each coarser zoom is the
 *    average of four pixels of the one below. Where the photograph has no data, and
 *    outside the chosen area, the tile is transparent and the imagery beneath shows.
 *
 * The work goes a piece at a time (a map tile three zooms above the deepest), so a large
 * area needs no more memory than a small one.
 */
import type { Bbox } from "@outpost/shared";
import { type ByteSource, COG_HEADER_BYTES, Cog } from "./cog.ts";
import type { ImageArchiveWriter } from "./pmtiles-writer.ts";
import { groundResolution, honestMaxZoom, lonLatToWorldPixel, TILE_SIZE, worldPixelToLonLat } from "./projection.ts";
import type { RangeFetcher } from "./ranges.ts";
import { blank, cut, encodeTile, halve, isEmpty, type Picture, parentOf } from "./render.ts";
import { countOutputTiles, tileRect } from "./sentinel.ts";

/** How many zooms of the deepest are made at once from one piece of the photograph. */
const CHUNK_DEPTH = 3;
/** Map coordinates are worked out exactly every this many pixels and interpolated between. */
const GRID = 16;

/** One file of a photograph: a sheet of the publisher's grid. */
export interface AerialFile {
  id: string;
  url: string;
  /**
   * True when the file is a sheet that may or may not have been photographed: its
   * name is worked out from the publisher's grid, and a sheet the publisher does not
   * have (403 or 404) is simply left out.
   */
  mayBeAbsent?: boolean;
}

/** From longitude and latitude to the publisher's grid (easting, northing in metres). */
export type GridProjection = (lon: number, lat: number) => [number, number];

export interface AerialFilePlan {
  file: AerialFile;
  cog: Cog;
  /** Which image of the file (0 the full photograph, then its overviews) the deepest zoom is read from. */
  level: number;
  project: GridProjection;
  zeroIsNoData: boolean;
}

export interface AerialPlan {
  bbox: Bbox;
  minZoom: number;
  maxZoom: number;
  files: AerialFilePlan[];
  /** Bytes the build will fetch beyond the headers already read, exactly. */
  tileBytes: number;
  tileRequests: number;
  headerBytes: number;
  outputTiles: number;
}

/** The deepest zoom for an area of a photograph of `metres` a pixel, no deeper than `ceiling`. */
export function aerialMaxZoom(metres: number, bbox: Bbox, ceiling: number): number {
  return Math.min(ceiling, honestMaxZoom(metres, (bbox[1] + bbox[3]) / 2));
}

/** The coarsest image of a file whose pixels are still no larger than `metres`. */
export function levelFor(cog: Cog, metres: number): number {
  let level = 0;
  for (let i = 1; i < cog.images.length; i += 1) {
    const [width, height] = cog.pixelSizeOf(i);
    if (Math.max(width, height) <= metres * 1.0001) level = i;
  }
  return level;
}

/** Projected outline of a box: its edges sampled, then the extremes. */
function gridBounds(bbox: Bbox, project: GridProjection): [number, number, number, number] {
  const [west, south, east, north] = bbox;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    for (const [lon, lat] of [
      [west + t * (east - west), south],
      [west + t * (east - west), north],
      [west, south + t * (north - south)],
      [east, south + t * (north - south)],
    ] as Array<[number, number]>) {
      const [x, y] = project(lon, lat);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/** The pixel window of one image of a file that a box needs, with pixels to spare for interpolation. */
function windowOf(plan: Pick<AerialFilePlan, "cog" | "project">, level: number, bbox: Bbox): [number, number, number, number] | undefined {
  const [minX, minY, maxX, maxY] = gridBounds(bbox, plan.project);
  const { cog } = plan;
  const [pw, ph] = cog.pixelSizeOf(level);
  const image = cog.images[level]!;
  const x0 = Math.max(0, Math.floor((minX - cog.geo.originX) / pw) - 2);
  const x1 = Math.min(image.width, Math.ceil((maxX - cog.geo.originX) / pw) + 2);
  const y0 = Math.max(0, Math.floor((cog.geo.originY - maxY) / ph) - 2);
  const y1 = Math.min(image.height, Math.ceil((cog.geo.originY - minY) / ph) + 2);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : undefined;
}

const remote = (fetcher: RangeFetcher, url: string): ByteSource => ({ read: (offset, length) => fetcher.read(url, offset, length) });

/** Checks a file can be drawn: 8-bit colour, three or four samples. */
function checkForm(cog: Cog, id: string): void {
  for (const image of cog.images) {
    if (image.bitsPerSample !== 8 || image.samplesPerPixel < 3 || image.samplesPerPixel > 4) {
      throw new Error(`The photograph ${id} is not 8-bit colour, which Outpost does not expect of it.`);
    }
  }
}

/**
 * Reads the files' headers and works out exactly which parts of them the area needs.
 * `projectionOf` gives the projection of a file's EPSG code, or undefined for one that
 * is not expected; such a file is refused.
 */
export async function planAerial(
  fetcher: RangeFetcher,
  bbox: Bbox,
  files: AerialFile[],
  options: {
    resolutionMeters: number;
    minZoom: number;
    maxZoomCeiling: number;
    projectionOf: (epsg: number | null) => GridProjection | undefined;
    /** Black (0, 0, 0) is where there is no photograph: for publishers who fill the corners of a sheet with it. */
    zeroIsNoData?: boolean;
    /** How much of each file to read first; the reader asks for more if its directory runs on. */
    headerBytes?: number;
  },
): Promise<AerialPlan> {
  const before = fetcher.transfer.bytes;
  const minZoom = options.minZoom;
  const maxZoom = Math.max(minZoom, aerialMaxZoom(options.resolutionMeters, bbox, options.maxZoomCeiling));
  const metres = groundResolution(maxZoom, (bbox[1] + bbox[3]) / 2);
  const plans: AerialFilePlan[] = [];
  const opened = await Promise.all(
    files.map(async (file) => {
      const length = options.headerBytes ?? COG_HEADER_BYTES;
      const head = file.mayBeAbsent ? await fetcher.readIfExists(file.url, 0, length) : await fetcher.read(file.url, 0, length);
      if (!head) return undefined;
      const cog = await Cog.open(remote(fetcher, file.url), head);
      checkForm(cog, file.id);
      const project = options.projectionOf(cog.geo.epsg);
      if (!project) throw new Error(`The photograph ${file.id} is in a projection (EPSG ${cog.geo.epsg ?? "unknown"}) Outpost does not expect.`);
      return { file, cog, level: levelFor(cog, metres), project, zeroIsNoData: options.zeroIsNoData === true };
    }),
  );
  for (const plan of opened) if (plan) plans.push(plan);
  const headerBytes = fetcher.transfer.bytes - before;
  const needed = new Map<string, number>();
  for (const plan of plans) {
    const window = windowOf(plan, plan.level, bbox);
    if (!window) continue;
    for (const ref of plan.cog.tilesFor(plan.level, ...window)) if (ref.length > 0) needed.set(`${plan.file.url}#${ref.image}:${ref.index}`, ref.length);
  }
  return {
    bbox,
    minZoom,
    maxZoom,
    files: plans,
    tileBytes: [...needed.values()].reduce((sum, length) => sum + length, 0),
    tileRequests: needed.size,
    headerBytes,
    outputTiles: countOutputTiles(bbox, minZoom, maxZoom),
  };
}

interface Patch {
  x0: number;
  y0: number;
  width: number;
  height: number;
  samples: number;
  alpha: boolean;
  nodata: number | null;
  data: Uint8Array;
}

async function readPatch(fetcher: RangeFetcher, plan: AerialFilePlan, window: [number, number, number, number]): Promise<Patch> {
  const refs = plan.cog.tilesFor(plan.level, ...window);
  const tiles = new Map<number, Uint8Array>();
  await Promise.all(
    refs.map(async (ref) => {
      tiles.set(ref.index, ref.length > 0 ? await fetcher.read(plan.file.url, ref.offset, ref.length) : new Uint8Array(0));
    }),
  );
  const assembled = plan.cog.assemble(plan.level, ...window, tiles);
  if (!(assembled.data instanceof Uint8Array)) throw new Error(`The photograph ${plan.file.id} was not in the expected form.`);
  const image = plan.cog.images[plan.level]!;
  return {
    x0: window[0],
    y0: window[1],
    width: assembled.width,
    height: assembled.height,
    samples: assembled.samples,
    alpha: image.alpha,
    nodata: plan.cog.geo.nodata ?? (plan.zeroIsNoData ? 0 : null),
    data: assembled.data,
  };
}

/** Whether a pixel of a patch holds part of the photograph. */
function present(patch: Patch, at: number): boolean {
  const { data, samples } = patch;
  if (patch.alpha) return data[at + samples - 1]! >= 128;
  if (patch.nodata !== null) return !(data[at] === patch.nodata && data[at + 1] === patch.nodata && data[at + 2] === patch.nodata);
  return true;
}

/** Bilinear read of a patch at a fractional pixel position, into `out` (r, g, b). False where there is no photograph. */
function sample(patch: Patch, fx: number, fy: number, out: Float64Array): boolean {
  const x = fx - patch.x0 - 0.5;
  const y = fy - patch.y0 - 0.5;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const { width, height, samples, data } = patch;
  if (ix >= 0 && iy >= 0 && ix + 1 < width && iy + 1 < height) {
    const a = (iy * width + ix) * samples;
    const b = a + samples;
    const c = a + width * samples;
    const d = c + samples;
    if (present(patch, a) && present(patch, b) && present(patch, c) && present(patch, d)) {
      const tx = x - ix;
      const ty = y - iy;
      for (let s = 0; s < 3; s += 1) {
        out[s] = (data[a + s]! * (1 - tx) + data[b + s]! * tx) * (1 - ty) + (data[c + s]! * (1 - tx) + data[d + s]! * tx) * ty;
      }
      return true;
    }
  }
  // At the edge of the photograph: the nearest pixel, never a blend with "nothing".
  const nx = Math.round(x);
  const ny = Math.round(y);
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
  const at = (ny * width + nx) * samples;
  if (!present(patch, at)) return false;
  out[0] = data[at]!;
  out[1] = data[at + 1]!;
  out[2] = data[at + 2]!;
  return true;
}

export interface AerialProgress {
  tilesWritten: number;
  tilesTotal: number;
  message: string;
}

/** Makes every tile of the area and writes it. Returns the number of tile positions made. */
export async function buildAerial(
  plan: AerialPlan,
  fetcher: RangeFetcher,
  writer: ImageArchiveWriter,
  options: { signal?: AbortSignal; onProgress?: (progress: AerialProgress) => void } = {},
): Promise<number> {
  const { bbox, minZoom, maxZoom } = plan;
  const chunkZoom = Math.max(minZoom, maxZoom - CHUNK_DEPTH);
  const side = TILE_SIZE * 2 ** (maxZoom - chunkZoom);
  const kept = new Map<string, Picture>();
  const total = plan.outputTiles;
  let done = 0;
  const report = (message: string) => options.onProgress?.({ tilesWritten: done, tilesTotal: total, message });
  const value = new Float64Array(3);

  const chunks = tileRect(bbox, chunkZoom);
  const chunkCount = (chunks.x1 - chunks.x0 + 1) * (chunks.y1 - chunks.y0 + 1);
  let chunkIndex = 0;
  for (let cy = chunks.y0; cy <= chunks.y1; cy += 1) {
    for (let cx = chunks.x0; cx <= chunks.x1; cx += 1) {
      options.signal?.throwIfAborted();
      chunkIndex += 1;
      report(chunkCount > 1 ? `Fetching part ${chunkIndex} of ${chunkCount} of the area` : "Fetching the photograph of the area");
      const [cw, cn] = worldPixelToLonLat(cx * TILE_SIZE, cy * TILE_SIZE, chunkZoom);
      const [ce, cs] = worldPixelToLonLat((cx + 1) * TILE_SIZE, (cy + 1) * TILE_SIZE, chunkZoom);
      const part: Bbox = [Math.max(bbox[0], cw), Math.max(bbox[1], cs), Math.min(bbox[2], ce), Math.min(bbox[3], cn)];
      if (part[0] >= part[2] || part[1] >= part[3]) continue;

      const readers: Array<{ plan: AerialFilePlan; patch: Patch; gx: Float64Array; gy: Float64Array }> = [];
      for (const filePlan of plan.files) {
        const window = windowOf(filePlan, filePlan.level, part);
        if (!window) continue;
        readers.push({ plan: filePlan, patch: await readPatch(fetcher, filePlan, window), gx: new Float64Array(0), gy: new Float64Array(0) });
      }

      report(chunkCount > 1 ? `Making map tiles for part ${chunkIndex} of ${chunkCount}` : "Making map tiles");
      const picture = blank(side, side);
      const originX = cx * side;
      const originY = cy * side;
      const nodes = side / GRID + 1;
      for (const reader of readers) {
        const { cog, level, project } = reader.plan;
        const [pw, ph] = cog.pixelSizeOf(level);
        const gx = new Float64Array(nodes * nodes);
        const gy = new Float64Array(nodes * nodes);
        for (let j = 0; j < nodes; j += 1) {
          const lat = worldPixelToLonLat(0, originY + Math.min(side, j * GRID) + 0.5, maxZoom)[1];
          for (let i = 0; i < nodes; i += 1) {
            const lon = worldPixelToLonLat(originX + Math.min(side, i * GRID) + 0.5, 0, maxZoom)[0];
            const [e, n] = project(lon, lat);
            gx[j * nodes + i] = (e - cog.geo.originX) / pw;
            gy[j * nodes + i] = (cog.geo.originY - n) / ph;
          }
        }
        reader.gx = gx;
        reader.gy = gy;
      }
      // Only the pixels inside the chosen area are drawn.
      const [left, top] = lonLatToWorldPixel(bbox[0], bbox[3], maxZoom);
      const [right, bottom] = lonLatToWorldPixel(bbox[2], bbox[1], maxZoom);
      const data = picture.data;
      for (let y = 0; y < side; y += 1) {
        const wy = originY + y + 0.5;
        if (wy < top || wy > bottom) continue;
        const j = Math.floor(y / GRID);
        const ty = (y - j * GRID) / GRID;
        for (let x = 0; x < side; x += 1) {
          const wx = originX + x + 0.5;
          if (wx < left || wx > right) continue;
          const i = Math.floor(x / GRID);
          const tx = (x - i * GRID) / GRID;
          const k = j * nodes + i;
          for (const reader of readers) {
            const { gx, gy } = reader;
            const fx = (gx[k]! * (1 - tx) + gx[k + 1]! * tx) * (1 - ty) + (gx[k + nodes]! * (1 - tx) + gx[k + nodes + 1]! * tx) * ty;
            const fy = (gy[k]! * (1 - tx) + gy[k + 1]! * tx) * (1 - ty) + (gy[k + nodes]! * (1 - tx) + gy[k + nodes + 1]! * tx) * ty;
            if (!sample(reader.patch, fx, fy, value)) continue;
            const at = (y * side + x) * 4;
            data[at] = Math.round(value[0]!);
            data[at + 1] = Math.round(value[1]!);
            data[at + 2] = Math.round(value[2]!);
            data[at + 3] = 255;
            break;
          }
        }
        if (y % 256 === 255) {
          options.signal?.throwIfAborted();
          await new Promise((resolve) => setImmediate(resolve));
        }
      }

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

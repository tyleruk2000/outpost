/**
 * Population grids: WorldPop's count of people per 30 arc-second cell (about 1 km at the
 * equator), one GeoTIFF per country, read with the imagery module's GeoTIFF reader.
 *
 * When a grid is installed, its cells are summed into coarser grids (4, 16, 64 and 256
 * cells to a side) kept in a small file in the data directory, so that a whole country
 * can be drawn from a few hundred numbers. Close in, and for a sum within a circle, the
 * GeoTIFF itself is read, strip by strip, with the strips last used kept in memory.
 *
 * The figures are WorldPop's modelled estimates. A sum is rounded to two significant
 * figures and said to be "about": the product does not support more.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Bbox, PopulationCell, PopulationGridResponse, PopulationSetDto, PopulationSumResponse } from "@outpost/shared";
import { haversineMeters } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import { type ByteSource, Cog, CogError } from "../maps/imagery/cog.ts";

export const POPULATION_FACTORS = [4, 16, 64, 256] as const;
/** At most about this many cells are sent for a view. */
const CELL_BUDGET = 3_000;
/** The legend's classes, in people per square kilometre. */
export const DENSITY_CLASSES = [1, 10, 100, 500, 2_000];
const STRIP_CACHE_BYTES = 64 * 1048576;
const MAX_RADIUS_KM = 300;
const MAGIC = "OPOP1\n";

export interface PopulationMeta {
  iso3: string;
  country: string;
  year: number;
  product: string;
  citation: string;
}

interface Level {
  factor: number;
  width: number;
  height: number;
  data: Float32Array;
}

interface Grid {
  key: string;
  collectionId: string;
  meta: PopulationMeta;
  width: number;
  height: number;
  originX: number;
  originY: number;
  pixel: number;
  nodata: number | null;
  levels: Level[];
  filePath: string;
  bbox: Bbox;
}

function fileSource(filePath: string): ByteSource & { close(): Promise<void> } {
  const opened = fs.promises.open(filePath, "r");
  return {
    async read(offset, length) {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await (await opened).read(buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    },
    async close() {
      await (await opened).close();
    },
  };
}

/** Opens a grid file and checks it is what a population layer can use: one band of 32-bit numbers in latitude and longitude. */
export async function openPopulationTiff(filePath: string): Promise<{ cog: Cog; source: ByteSource & { close(): Promise<void> } }> {
  const source = fileSource(filePath);
  try {
    const cog = await Cog.open(source);
    if (cog.geo.epsg !== 4326) {
      throw new PermanentJobError(
        `This grid is in ${cog.geo.epsg ? `EPSG:${cog.geo.epsg}` : "a coordinate system it does not name"}, not latitude and longitude (EPSG:4326). WorldPop's grids are in EPSG:4326; this file is not one of them, and it was not used.`,
      );
    }
    if (cog.images[0]!.sampleFormat !== 3) throw new PermanentJobError("This grid does not hold counts of people (32-bit numbers).");
    return { cog, source };
  } catch (error) {
    await source.close();
    if (error instanceof CogError) throw new PermanentJobError(`The grid could not be read: ${error.message}`);
    throw error;
  }
}

/** Area of a cell of `sizeDeg` degrees whose middle is at latitude `lat`, in square kilometres. */
export function cellAreaKm2(lat: number, sizeDeg: number): number {
  return sizeDeg * 111.32 * Math.cos((lat * Math.PI) / 180) * sizeDeg * 110.57;
}

/** A number to two significant figures, as the product supports. */
export function roundPeople(value: number): number {
  if (value < 10) return Math.round(value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

export interface PopulationService {
  /** Reads a downloaded grid, writes its coarse grids, and returns what it is. */
  install(filePath: string, sidecarKey: string, meta: PopulationMeta, signal: AbortSignal, progress: (done: number, total: number) => void): Promise<{ bbox: Bbox; total: number }>;
  sidecarKey(locationId: string, relPath: string): string;
  forget(sidecarKey: string): void;
  sets(): PopulationSetDto[];
  grid(bbox: Bbox, zoom: number): Promise<PopulationGridResponse>;
  sum(lat: number, lon: number, radiusKm: number): Promise<PopulationSumResponse>;
  close(): Promise<void>;
}

export function createPopulationService(
  ctx: AppContext,
  installed: () => Array<{ collectionId: string; filePath: string | null; available: boolean; sidecarKey: string; meta: PopulationMeta }>,
): PopulationService {
  const dir = path.join(ctx.config.dataDir, "reference", "population");
  const grids = new Map<string, Grid>();
  const strips = new Map<string, Float32Array>();
  let stripBytes = 0;
  const sidecarPath = (key: string) => path.join(dir, `${key}.bin`);

  function loadSidecar(key: string): Omit<Grid, "collectionId" | "meta" | "filePath" | "key"> | null {
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(sidecarPath(key));
    } catch {
      return null;
    }
    if (buffer.subarray(0, MAGIC.length).toString("latin1") !== MAGIC) return null;
    const headerLength = buffer.readUInt32LE(MAGIC.length);
    const header = JSON.parse(buffer.subarray(MAGIC.length + 4, MAGIC.length + 4 + headerLength).toString("utf8")) as {
      width: number;
      height: number;
      originX: number;
      originY: number;
      pixel: number;
      nodata: number | null;
      levels: Array<{ factor: number; width: number; height: number; offset: number }>;
    };
    const base = MAGIC.length + 4 + headerLength;
    const levels = header.levels.map((level) => {
      const start = base + level.offset;
      const copy = new Uint8Array(buffer.subarray(start, start + level.width * level.height * 4));
      return { factor: level.factor, width: level.width, height: level.height, data: new Float32Array(copy.buffer) };
    });
    const bbox: Bbox = [header.originX, header.originY - header.height * header.pixel, header.originX + header.width * header.pixel, header.originY];
    return { width: header.width, height: header.height, originX: header.originX, originY: header.originY, pixel: header.pixel, nodata: header.nodata, levels, bbox };
  }

  function current(): Grid[] {
    const seen = new Set<string>();
    const out: Grid[] = [];
    for (const set of installed()) {
      if (!set.available || !set.filePath) continue;
      seen.add(set.sidecarKey);
      let grid = grids.get(set.sidecarKey);
      if (!grid) {
        const loaded = loadSidecar(set.sidecarKey);
        if (!loaded) continue;
        grid = { ...loaded, key: set.sidecarKey, collectionId: set.collectionId, meta: set.meta, filePath: set.filePath };
        grids.set(set.sidecarKey, grid);
      }
      out.push(grid);
    }
    for (const key of grids.keys()) if (!seen.has(key)) grids.delete(key);
    return out;
  }

  /** The full-resolution values of a window of a grid, NaN where there is no value. */
  async function window(grid: Grid, x0: number, y0: number, x1: number, y1: number): Promise<Float32Array> {
    const width = x1 - x0;
    const out = new Float32Array(width * (y1 - y0)).fill(Number.NaN);
    if (width <= 0 || y1 <= y0) return out;
    const { cog, source } = await openPopulationTiff(grid.filePath);
    try {
      const image = cog.images[0]!;
      const across = Math.ceil(image.width / image.tileWidth);
      for (const ref of cog.tilesFor(0, x0, y0, x1, y1)) {
        const cacheKey = `${grid.key}:${ref.index}`;
        let values = strips.get(cacheKey);
        if (values) {
          strips.delete(cacheKey);
          strips.set(cacheKey, values);
        } else {
          values = cog.decodeFloatTile(0, await source.read(ref.offset, ref.length));
          strips.set(cacheKey, values);
          stripBytes += values.byteLength;
          while (stripBytes > STRIP_CACHE_BYTES && strips.size > 1) {
            const [oldest, old] = strips.entries().next().value as [string, Float32Array];
            strips.delete(oldest);
            stripBytes -= old.byteLength;
          }
        }
        const tileX = (ref.index % across) * image.tileWidth;
        const tileY = Math.floor(ref.index / across) * image.tileHeight;
        for (let y = Math.max(y0, tileY); y < Math.min(y1, tileY + image.tileHeight, image.height); y += 1) {
          for (let x = Math.max(x0, tileX); x < Math.min(x1, tileX + image.tileWidth, image.width); x += 1) {
            const value = values[(y - tileY) * image.tileWidth + (x - tileX)]!;
            out[(y - y0) * width + (x - x0)] = grid.nodata !== null && value === grid.nodata ? Number.NaN : value < 0 ? Number.NaN : value;
          }
        }
      }
    } finally {
      await source.close();
    }
    return out;
  }

  const setsOf = (list: Grid[]) => list.map((grid) => ({ country: grid.meta.country, product: grid.meta.product, year: grid.meta.year }));

  return {
    sidecarKey(locationId, relPath) {
      return crypto.createHash("sha1").update(`${locationId}:${relPath}`).digest("hex").slice(0, 24);
    },

    forget(key) {
      grids.delete(key);
      for (const cacheKey of [...strips.keys()]) {
        if (cacheKey.startsWith(`${key}:`)) {
          stripBytes -= strips.get(cacheKey)!.byteLength;
          strips.delete(cacheKey);
        }
      }
      fs.rmSync(sidecarPath(key), { force: true });
    },

    async install(filePath, key, meta, signal, progress) {
      const { cog, source } = await openPopulationTiff(filePath);
      try {
        const image = cog.images[0]!;
        const { width, height } = image;
        const pixel = cog.geo.pixelWidth;
        if (Math.abs(cog.geo.pixelHeight - pixel) > pixel * 1e-6) throw new PermanentJobError("This grid's cells are not square in degrees, which WorldPop's are.");
        const first = POPULATION_FACTORS[0];
        const fw = Math.ceil(width / first);
        const fh = Math.ceil(height / first);
        const base = new Float32Array(fw * fh).fill(Number.NaN);
        const refs = cog.tilesFor(0, 0, 0, width, height);
        const across = Math.ceil(width / image.tileWidth);
        let total = 0;
        let done = 0;
        for (const ref of refs) {
          signal.throwIfAborted();
          const values = cog.decodeFloatTile(0, await source.read(ref.offset, ref.length));
          const tileX = (ref.index % across) * image.tileWidth;
          const tileY = Math.floor(ref.index / across) * image.tileHeight;
          for (let y = tileY; y < Math.min(height, tileY + image.tileHeight); y += 1) {
            for (let x = tileX; x < Math.min(width, tileX + image.tileWidth); x += 1) {
              const value = values[(y - tileY) * image.tileWidth + (x - tileX)]!;
              if (!Number.isFinite(value) || value < 0 || (cog.geo.nodata !== null && value === cog.geo.nodata)) continue;
              const at = Math.floor(y / first) * fw + Math.floor(x / first);
              base[at] = (Number.isNaN(base[at]!) ? 0 : base[at]!) + value;
              total += value;
            }
          }
          done += 1;
          progress(done, refs.length);
        }
        const levels: Level[] = [{ factor: first, width: fw, height: fh, data: base }];
        for (const factor of POPULATION_FACTORS.slice(1)) {
          const below = levels.at(-1)!;
          const w = Math.ceil(below.width / 4);
          const h = Math.ceil(below.height / 4);
          const data = new Float32Array(w * h).fill(Number.NaN);
          for (let y = 0; y < below.height; y += 1) {
            for (let x = 0; x < below.width; x += 1) {
              const value = below.data[y * below.width + x]!;
              if (Number.isNaN(value)) continue;
              const at = Math.floor(y / 4) * w + Math.floor(x / 4);
              data[at] = (Number.isNaN(data[at]!) ? 0 : data[at]!) + value;
            }
          }
          levels.push({ factor, width: w, height: h, data });
        }
        fs.mkdirSync(dir, { recursive: true });
        let offset = 0;
        const header = {
          width,
          height,
          originX: cog.geo.originX,
          originY: cog.geo.originY,
          pixel,
          nodata: cog.geo.nodata,
          levels: levels.map((level) => {
            const entry = { factor: level.factor, width: level.width, height: level.height, offset };
            offset += level.data.byteLength;
            return entry;
          }),
        };
        const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
        const length = Buffer.alloc(4);
        length.writeUInt32LE(headerBytes.length, 0);
        const temporary = `${sidecarPath(key)}.tmp`;
        fs.writeFileSync(temporary, Buffer.concat([Buffer.from(MAGIC, "latin1"), length, headerBytes, ...levels.map((level) => Buffer.from(level.data.buffer))]));
        fs.renameSync(temporary, sidecarPath(key));
        grids.delete(key);
        void meta;
        const bbox: Bbox = [cog.geo.originX, cog.geo.originY - height * pixel, cog.geo.originX + width * pixel, cog.geo.originY];
        return { bbox, total };
      } finally {
        await source.close();
      }
    },

    sets() {
      return installed().map((set) => {
        const grid = current().find((candidate) => candidate.key === set.sidecarKey);
        return {
          id: set.collectionId,
          country: set.meta.country,
          product: set.meta.product,
          year: set.meta.year,
          bbox: grid?.bbox ?? [0, 0, 0, 0],
          available: set.available && Boolean(grid),
          citation: set.meta.citation,
        };
      });
    },

    async grid(view, zoom) {
      const list = current();
      const cells: PopulationCell[] = [];
      const used: Grid[] = [];
      for (const grid of list) {
        const west = Math.max(view[0], grid.bbox[0]);
        const east = Math.min(view[2], grid.bbox[2]);
        const south = Math.max(view[1], grid.bbox[1]);
        const north = Math.min(view[3], grid.bbox[3]);
        if (west >= east || south >= north) continue;
        used.push(grid);
        const across = (east - west) / grid.pixel;
        const down = (north - south) / grid.pixel;
        // The finest level that keeps within the budget; full resolution only close in.
        let factor = 1;
        for (const candidate of [1, ...POPULATION_FACTORS]) {
          factor = candidate;
          if ((across / candidate) * (down / candidate) <= CELL_BUDGET / Math.max(1, list.length)) break;
        }
        void zoom;
        const size = grid.pixel * factor;
        const x0 = Math.max(0, Math.floor((west - grid.originX) / size));
        const x1 = Math.min(Math.ceil(grid.width / factor), Math.ceil((east - grid.originX) / size));
        const y0 = Math.max(0, Math.floor((grid.originY - north) / size));
        const y1 = Math.min(Math.ceil(grid.height / factor), Math.ceil((grid.originY - south) / size));
        let values: Float32Array;
        let rowWidth: number;
        let shiftX = 0;
        let shiftY = 0;
        if (factor === 1) {
          values = await window(grid, x0, y0, x1, y1);
          rowWidth = x1 - x0;
          shiftX = x0;
          shiftY = y0;
        } else {
          const level = grid.levels.find((candidate) => candidate.factor === factor)!;
          values = level.data;
          rowWidth = level.width;
        }
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const people = values[(y - shiftY) * rowWidth + (x - shiftX)];
            if (people === undefined || Number.isNaN(people)) continue;
            const cellWest = grid.originX + x * size;
            const cellNorth = grid.originY - y * size;
            const density = people / cellAreaKm2(cellNorth - size / 2, size);
            if (density < DENSITY_CLASSES[0]!) continue;
            cells.push({ west: cellWest, south: cellNorth - size, east: cellWest + size, north: cellNorth, density: Math.round(density * 10) / 10 });
          }
        }
      }
      return { cells, classes: DENSITY_CLASSES, sets: setsOf(used) };
    },

    async sum(lat, lon, radiusKm) {
      if (radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) throw new PermanentJobError(`Give a radius between 0 and ${MAX_RADIUS_KM} km.`);
      const radius = radiusKm * 1000;
      const dLat = radiusKm / 110.57;
      const dLon = radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
      const box: Bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
      const list = current();
      let people = 0;
      let insideCells = 0;
      let coveredCells = 0;
      const used: Grid[] = [];
      // Counted on the finest grid installed: each cell whose middle is inside the circle, once.
      const pixel = list.length > 0 ? Math.min(...list.map((grid) => grid.pixel)) : 1 / 120;
      const seen = new Set<string>();
      for (let y = Math.floor(box[1] / pixel); y <= Math.ceil(box[3] / pixel); y += 1) {
        for (let x = Math.floor(box[0] / pixel); x <= Math.ceil(box[2] / pixel); x += 1) {
          const cy = (y + 0.5) * pixel;
          const cx = (x + 0.5) * pixel;
          if (haversineMeters(lat, lon, cy, cx) > radius) continue;
          insideCells += 1;
          if (list.some((grid) => cx >= grid.bbox[0] && cx < grid.bbox[2] && cy > grid.bbox[1] && cy <= grid.bbox[3])) coveredCells += 1;
          seen.add(`${x}:${y}`);
        }
      }
      for (const grid of list) {
        const x0 = Math.max(0, Math.floor((box[0] - grid.originX) / grid.pixel));
        const x1 = Math.min(grid.width, Math.ceil((box[2] - grid.originX) / grid.pixel));
        const y0 = Math.max(0, Math.floor((grid.originY - box[3]) / grid.pixel));
        const y1 = Math.min(grid.height, Math.ceil((grid.originY - box[1]) / grid.pixel));
        if (x0 >= x1 || y0 >= y1) continue;
        used.push(grid);
        const values = await window(grid, x0, y0, x1, y1);
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const value = values[(y - y0) * (x1 - x0) + (x - x0)]!;
            if (Number.isNaN(value)) continue;
            const cy = grid.originY - (y + 0.5) * grid.pixel;
            const cx = grid.originX + (x + 0.5) * grid.pixel;
            if (haversineMeters(lat, lon, cy, cx) <= radius) people += value;
          }
        }
      }
      void seen;
      const covered = insideCells === 0 ? 0 : coveredCells / insideCells;
      return {
        people: used.length === 0 ? null : roundPeople(people),
        covered: Math.round(covered * 100) / 100,
        sets: setsOf(used),
        note:
          used.length === 0
            ? "No population grid installed covers this circle."
            : `About this many people lived in the cells whose middle is inside the circle, by WorldPop's ${used.map((grid) => `${grid.meta.year} estimate for ${grid.meta.country}`).join(" and ")}, rounded to two figures. A modelled estimate, not a count.${covered < 0.99 ? ` Only ${Math.round(covered * 100)}% of the circle is covered by installed grids.` : ""}`,
      };
    },

    async close() {
      grids.clear();
      strips.clear();
    },
  };
}

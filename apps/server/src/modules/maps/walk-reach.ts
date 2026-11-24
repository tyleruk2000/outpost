/**
 * The ground reachable on foot from a point in a set time (see `walk-reach.ts` in the shared package for the pace
 * rule and what the answer holds).
 *
 * The ground round the start is a grid of square cells, each with its height from installed terrain and, from the
 * installed map's tiles, whether a path or road crosses it and whether water, a river or a cliff bars it. The fastest
 * time to every cell is found outward from the start (Dijkstra's method), stepping to the 16 cells around each: the
 * eight next to it and the eight a knight's move away, so that a walk across open ground is not forced along the
 * grid's eight directions. A step takes its length over Tobler's speed for the slope between the two cells, his
 * on-path speed where both cells are on a path or road and three fifths of it otherwise.
 *
 * Only the ground the walk reaches is read: the grid is read in blocks as the walk first comes near each, so a walk
 * hemmed in by hills reads a fraction of the area a walk along a valley road would. The work yields to other
 * requests as it goes. Nothing is downloaded; with no map installed the walk is all off-path.
 */
import zlib from "node:zlib";
import {
  EARTH_RADIUS_METERS,
  encodeBits,
  type RoutePoint,
  toblerKmh,
  WALK_MINUTES,
  WALK_MINUTES_ANSWERED,
  WALK_OFF_PATH_FACTOR,
  WALK_PACES,
  WALK_STEEPEST_SLOPE,
  type WalkReach,
  walkCellMeters,
} from "@outpost/shared";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import type { ElevationSampler } from "./elevation.ts";
import { position } from "./terrain-profile.ts";
import type { TileServer } from "./tile-server.ts";
import { readVectorTile, type TileFeature } from "./vector-tile.ts";

export const walkReachQuery = z.object({
  at: position("at"),
  minutes: z.coerce
    .number({ error: "Give `minutes` as a number of minutes." })
    .refine((value) => WALK_MINUTES_ANSWERED.includes(value), `\`minutes\` is one of ${WALK_MINUTES.join(", ")}.`),
  pace: z.enum(WALK_PACES.map((pace) => pace.id) as [string, ...string[]]).default("standard"),
});

const DEG = Math.PI / 180;
/** Cells read at a time: a block 64 cells a side. */
const BLOCK = 64;
/** The zoom the map's paths are read at: the first at which footpaths are in the map Outpost downloads. */
const PATH_ZOOM = 13;
const PATH = 1;
const BARRED = 2;
const BRIDGE = 4;
/** Not reached. */
const NEVER = 255;
/** Answers kept, most recently asked last. */
const KEPT = 8;

/** The 16 steps: the eight neighbours and the eight knight's moves, with the cells a step passes beside. */
const STEPS: Array<{ dx: number; dy: number; length: number; beside: Array<[number, number]> }> = [];
for (const [dx, dy] of [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
] as const) {
  const beside: Array<[number, number]> = [];
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) beside.push([dx, 0], [0, dy]);
  if (Math.abs(dx) === 2) beside.push([Math.sign(dx), 0], [Math.sign(dx), dy]);
  if (Math.abs(dy) === 2) beside.push([0, Math.sign(dy)], [dx, Math.sign(dy)]);
  STEPS.push({ dx, dy, length: Math.hypot(dx, dy), beside });
}

/** A binary heap of cells by time, in typed arrays. */
class Heap {
  private cells = new Int32Array(1024);
  private times = new Float64Array(1024);
  size = 0;

  push(cell: number, time: number): void {
    if (this.size === this.cells.length) {
      const cells = new Int32Array(this.size * 2);
      cells.set(this.cells);
      this.cells = cells;
      const times = new Float64Array(this.size * 2);
      times.set(this.times);
      this.times = times;
    }
    let index = this.size++;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.times[parent]! <= time) break;
      this.cells[index] = this.cells[parent]!;
      this.times[index] = this.times[parent]!;
      index = parent;
    }
    this.cells[index] = cell;
    this.times[index] = time;
  }

  /** The cell with the least time, and its time; the heap must not be empty. */
  pop(): [number, number] {
    const top: [number, number] = [this.cells[0]!, this.times[0]!];
    const lastCell = this.cells[--this.size]!;
    const lastTime = this.times[this.size]!;
    let index = 0;
    for (;;) {
      let child = 2 * index + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.times[child + 1]! < this.times[child]!) child += 1;
      if (this.times[child]! >= lastTime) break;
      this.cells[index] = this.cells[child]!;
      this.times[index] = this.times[child]!;
      index = child;
    }
    this.cells[index] = lastCell;
    this.times[index] = lastTime;
    return top;
  }
}

/** What a feature of the map is to a walker: a path or road, a bridge, a barrier, or nothing. */
function roleOf(layer: string, feature: TileFeature): "path" | "bridge" | "barrier" | "water" | null {
  const kind = String(feature.properties.kind ?? "");
  if (layer === "roads") {
    // Every road and path can be walked except a motorway; a railway is not a path.
    if (kind === "highway" || kind === "rail" || kind === "aerialway" || kind === "ferry") return null;
    return feature.properties.is_bridge === true ? "bridge" : "path";
  }
  if (layer === "water") {
    if (feature.type === 3) return "water";
    // A river or canal bars the way; a stream or a ditch is stepped over.
    return kind === "river" || kind === "canal" ? "barrier" : null;
  }
  if (layer === "earth" && feature.type === 2 && kind === "cliff") return "barrier";
  return null;
}

export type WalkReacher = (query: { at: RoutePoint; minutes: number; pace: string }) => Promise<WalkReach>;

export function createWalkReacher(ctx: AppContext, sampler: ElevationSampler, tiles: TileServer): WalkReacher {
  const kept = new Map<string, Promise<WalkReach>>();

  const work = async (at: RoutePoint, minutes: number, paceId: string): Promise<WalkReach> => {
    const pace = WALK_PACES.find((one) => one.id === paceId) ?? WALK_PACES[0];
    const cell = walkCellMeters(minutes);
    // As far as the fastest pace on the best path could go, and a cell more.
    const radius = (toblerKmh(-0.05) * pace.factor * minutes * 1000) / 60 + cell;
    const half = Math.ceil(radius / cell);
    const size = 2 * half + 1;
    const cosLat = Math.cos(at.lat * DEG);
    const latOf = (row: number) => at.lat + ((half - row) * cell) / EARTH_RADIUS_METERS / DEG;
    const lonOf = (column: number) => at.lon + ((column - half) * cell) / (EARTH_RADIUS_METERS * cosLat) / DEG;
    const base = { at, minutes, pace: pace.id, cellMeters: cell, size };
    const none: WalkReach = { ...base, coverage: "none", groundMeters: null, minutesGrid: "", paths: false, furthestMeters: 0 };

    const [ground] = await sampler.sample([[at.lon, at.lat]], cell);
    if (ground == null) return none;

    const heights = new Float32Array(size * size).fill(Number.NaN);
    const flags = new Uint8Array(size * size);
    const blocks = Math.ceil(size / BLOCK);
    const loaded = new Uint8Array(blocks * blocks);
    const basemap = tiles.sources().sources.basemap;
    const zoom = basemap ? Math.max(basemap.minzoom, Math.min(PATH_ZOOM, basemap.maxzoom)) : 0;
    const tilesRead = new Set<string>();
    let paths = false;
    let unknown = false;

    /** The map's features in one tile, drawn into the grid. */
    const drawTile = async (x: number, y: number) => {
      const key = `${x}/${y}`;
      if (tilesRead.has(key)) return;
      tilesRead.add(key);
      let served: Awaited<ReturnType<TileServer["getTile"]>>;
      try {
        served = await tiles.getTile("vector", zoom, x, y);
      } catch (error) {
        ctx.log.warn({ err: error, tile: `${zoom}/${key}` }, "map tile could not be read for a walk");
        return;
      }
      if (!served) return;
      let bytes: Uint8Array = served.data;
      try {
        if (served.contentEncoding === "gzip") bytes = zlib.gunzipSync(served.data);
        else if (served.contentEncoding === "br") bytes = zlib.brotliDecompressSync(served.data);
        else if (served.contentEncoding) return;
        const layers = readVectorTile(bytes, new Set(["roads", "water", "earth"]));
        const scale = 2 ** zoom;
        for (const [name, layer] of layers) {
          // Tile units to grid columns and rows.
          const toColumn = (u: number) => {
            const lon = ((x + u / layer.extent) / scale) * 360 - 180;
            return half + ((lon - at.lon) * DEG * EARTH_RADIUS_METERS * cosLat) / cell;
          };
          const toRow = (v: number) => {
            const n = Math.PI - (2 * Math.PI * (y + v / layer.extent)) / scale;
            const lat = Math.atan(Math.sinh(n)) / DEG;
            return half - ((lat - at.lat) * DEG * EARTH_RADIUS_METERS) / cell;
          };
          for (const feature of layer.features) {
            const role = roleOf(name, feature);
            if (!role) continue;
            const parts = feature.parts.map((part) => {
              const points = new Float64Array(part.length);
              for (let index = 0; index < part.length; index += 2) {
                points[index] = toColumn(part[index]!);
                points[index + 1] = toRow(part[index + 1]!);
              }
              return points;
            });
            if (role === "water") fillPolygon(parts, size, flags, BARRED);
            else {
              const bit = role === "path" ? PATH : role === "bridge" ? PATH | BRIDGE : BARRED;
              if (role !== "barrier") paths = true;
              for (const part of parts) drawLine(part, size, flags, bit);
            }
          }
        }
      } catch (error) {
        ctx.log.warn({ err: error, tile: `${zoom}/${key}` }, "map tile could not be read for a walk");
      }
    };

    const loadBlock = async (bx: number, by: number) => {
      loaded[by * blocks + bx] = 1;
      const columns = Math.min(BLOCK, size - bx * BLOCK);
      const rows = Math.min(BLOCK, size - by * BLOCK);
      const lons = new Float64Array(columns * rows);
      const lats = new Float64Array(columns * rows);
      for (let r = 0; r < rows; r += 1)
        for (let c = 0; c < columns; c += 1) {
          lons[r * columns + c] = lonOf(bx * BLOCK + c);
          lats[r * columns + c] = latOf(by * BLOCK + r);
        }
      const read = await sampler.sampleGrid(lons, lats, cell);
      for (let r = 0; r < rows; r += 1)
        heights.set(read.heights.subarray(r * columns, (r + 1) * columns), (by * BLOCK + r) * size + bx * BLOCK);
      if (!basemap) return;
      // The map's tiles over the block, a little wider so that a path at its edge is drawn whole.
      const scale = 2 ** zoom;
      const tileX = (lon: number) => Math.floor(((lon + 180) / 360) * scale);
      const tileY = (lat: number) => Math.floor(((1 - Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG)) / Math.PI) / 2) * scale);
      const [x0, x1] = [tileX(lonOf(bx * BLOCK - 1)), tileX(lonOf(bx * BLOCK + columns))];
      const [y0, y1] = [tileY(latOf(by * BLOCK - 1)), tileY(latOf(by * BLOCK + rows))];
      for (let ty = y0; ty <= y1; ty += 1) for (let tx = x0; tx <= x1; tx += 1) await drawTile(tx, ty);
    };
    const ensure = async (column: number, row: number) => {
      const bx = Math.floor(column / BLOCK);
      const by = Math.floor(row / BLOCK);
      if (!loaded[by * blocks + bx]) await loadBlock(bx, by);
    };

    // A cell can be stood on: terrain is known there, and nothing bars it unless a bridge crosses it.
    const open = (index: number) => !Number.isNaN(heights[index]!) && ((flags[index]! & BARRED) === 0 || (flags[index]! & BRIDGE) !== 0);
    const limit = minutes * 60;
    const times = new Float64Array(size * size).fill(Number.POSITIVE_INFINITY);
    const done = new Uint8Array(size * size);
    const start = half * size + half;
    await ensure(half, half);
    times[start] = 0;
    const heap = new Heap();
    heap.push(start, 0);
    const speedFactor = pace.factor / 3.6; // km/h to m/s, with the pace
    let popped = 0;
    let furthest = 0;
    while (heap.size > 0) {
      const [current, time] = heap.pop();
      if (done[current] || time > times[current]!) continue;
      done[current] = 1;
      const column = current % size;
      const row = (current - column) / size;
      furthest = Math.max(furthest, Math.hypot(column - half, row - half) * cell);
      // Every block a step from here could reach is read before the steps are taken.
      for (const [dc, dr] of [
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
      ] as const) {
        const c = column + dc;
        const r = row + dr;
        if (c >= 0 && r >= 0 && c < size && r < size) await ensure(c, r);
      }
      const here = heights[current]!;
      for (const step of STEPS) {
        const c = column + step.dx;
        const r = row + step.dy;
        if (c < 0 || r < 0 || c >= size || r >= size) continue;
        const next = r * size + c;
        if (done[next] || !open(next)) continue;
        if (step.beside.some(([bc, br]) => !open((row + br) * size + column + bc))) continue;
        const run = step.length * cell;
        const slope = (heights[next]! - here) / run;
        if (Math.abs(slope) > WALK_STEEPEST_SLOPE) continue;
        const onPath = (flags[current]! & PATH) !== 0 && (flags[next]! & PATH) !== 0;
        const speed = toblerKmh(slope) * (onPath ? 1 : WALK_OFF_PATH_FACTOR) * speedFactor;
        const arrive = time + run / speed;
        if (arrive > limit || arrive >= times[next]!) continue;
        times[next] = arrive;
        heap.push(next, arrive);
      }
      popped += 1;
      if (popped % 20_000 === 0) await yieldToEventLoop();
    }

    const grid = new Uint8Array(size * size).fill(NEVER);
    for (let index = 0; index < grid.length; index += 1) {
      if (
        Number.isNaN(heights[index]!) &&
        loaded[Math.floor(Math.floor(index / size) / BLOCK) * blocks + Math.floor((index % size) / BLOCK)]
      )
        unknown = true;
      const time = times[index]!;
      if (time <= limit) grid[index] = Math.min(254, Math.floor(time / 60));
    }
    return {
      ...base,
      coverage: unknown ? "partial" : "terrain",
      groundMeters: ground,
      minutesGrid: encodeBits(grid),
      paths,
      furthestMeters: Math.round(furthest),
    };
  };

  return ({ at, minutes, pace }) => {
    const edition = tiles
      .regions()
      .map((region) => `${region.id}:${region.installedAt}:${region.status}:${region.available}`)
      .join(",");
    const key = `${at.lat.toFixed(5)},${at.lon.toFixed(5)}|${minutes}|${pace}|${edition}`;
    const known = kept.get(key);
    if (known) return known;
    const pending = work(at, minutes, pace);
    kept.set(key, pending);
    pending.catch(() => kept.delete(key));
    while (kept.size > KEPT) kept.delete(kept.keys().next().value!);
    return pending;
  };
}

/** Marks every cell a line passes through, stepping a quarter of a cell at a time so that no corner is skipped. */
function drawLine(points: Float64Array, size: number, flags: Uint8Array, bit: number): void {
  for (let index = 0; index + 3 < points.length; index += 2) {
    const [x0, y0, x1, y1] = [points[index]!, points[index + 1]!, points[index + 2]!, points[index + 3]!];
    if ((x0 < -1 && x1 < -1) || (y0 < -1 && y1 < -1) || (x0 > size && x1 > size) || (y0 > size && y1 > size)) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
    for (let step = 0; step <= steps; step += 1) {
      const c = Math.round(x0 + ((x1 - x0) * step) / steps);
      const r = Math.round(y0 + ((y1 - y0) * step) / steps);
      if (c >= 0 && r >= 0 && c < size && r < size) flags[r * size + c]! |= bit;
    }
  }
}

/** Marks every cell whose centre is inside a polygon (its rings taken together, even-odd, so holes stay clear). */
function fillPolygon(rings: Float64Array[], size: number, flags: Uint8Array, bit: number): void {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const ring of rings)
    for (let index = 1; index < ring.length; index += 2) {
      top = Math.min(top, ring[index]!);
      bottom = Math.max(bottom, ring[index]!);
    }
  const first = Math.max(0, Math.ceil(top));
  const last = Math.min(size - 1, Math.floor(bottom));
  const crossings: number[] = [];
  for (let row = first; row <= last; row += 1) {
    crossings.length = 0;
    for (const ring of rings)
      for (let index = 0; index + 3 < ring.length; index += 2) {
        const [x0, y0, x1, y1] = [ring[index]!, ring[index + 1]!, ring[index + 2]!, ring[index + 3]!];
        if (y0 <= row === y1 <= row) continue;
        crossings.push(x0 + ((row - y0) / (y1 - y0)) * (x1 - x0));
      }
    crossings.sort((a, b) => a - b);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const from = Math.max(0, Math.ceil(crossings[index]!));
      const to = Math.min(size - 1, Math.floor(crossings[index + 1]!));
      for (let column = from; column <= to; column += 1) flags[row * size + column]! |= bit;
    }
  }
}

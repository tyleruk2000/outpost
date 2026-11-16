/**
 * Keeping a box of the map on this phone.
 *
 * The map is drawn from tiles the server cuts out of its installed archives, one
 * address per tile. Keeping an area is asking for every tile of the box, from the
 * coarsest zoom to the one chosen, and filing each under its address, together with
 * the lettering those tiles use and the map's icons. Out of reach, the service worker
 * answers the map's requests from those files, so the same map code draws the same map.
 *
 * The server measures the box first (`GET /api/maps/area-size`), so the size shown
 * before starting is the size that is stored: tiles are kept gzipped, as the archive
 * holds them. Fetching runs in this tab and can take minutes; it survives moving
 * between screens, and one that was interrupted can be carried on from where it stopped.
 */
import {
  type Bbox,
  countRectTiles,
  formatBytes,
  MAX_KEPT_AREA_BYTES,
  type MapAreaSize,
  type MapOverview,
  type MapSources,
  type TileRect,
  tileRects,
} from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { regionsCacheKey } from "@/features/maps/lib/tiles";
import { api } from "@/lib/api";
import { TILE_ENCODING_HEADER } from "@/sw/rules";
import { DEVICE } from "./device";
import { BASE_GLYPH_RANGES, collectGlyphRanges, GLYPH_FONTS, glyphPath, spritePaths } from "./glyphs";
import { getKept, type KeptArea, openKept, outOfRoomMessage, putKept, putKeptBytes } from "./store";

/** Tiles asked for at once. A browser opens about this many connections to one server. */
const PARALLEL = 6;
/** How often the record of an unfinished area is written, in tiles. */
const RECORD_EVERY = 150;

export function measureArea(bbox: Bbox, maxZoom: number, terrain: boolean, signal?: AbortSignal): Promise<MapAreaSize> {
  return api.get<MapAreaSize>(
    "/api/maps/area-size",
    { bbox: bbox.map((value) => value.toFixed(5)).join(","), maxZoom, terrain: terrain ? 1 : 0 },
    signal,
  );
}

/** Room this browser says is left for Outpost, or null when it will not say. An estimate, not a promise. */
export async function roomLeft(): Promise<number | null> {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return typeof quota === "number" && typeof usage === "number" ? Math.max(0, quota - usage) : null;
  } catch {
    return null;
  }
}

/** Why an area of this size cannot be kept, or undefined when it can. */
export function areaRefusal(size: MapAreaSize, room: number | null): string | undefined {
  if (!size.map || size.map.tiles === 0)
    return "No detailed map is installed for this area, so there is nothing to keep. Download a region that covers it first.";
  if (size.totalBytes > MAX_KEPT_AREA_BYTES)
    return "That is more than one kept area may hold. Zoom in to a smaller area, or choose less detail.";
  // Lettering and icons come on top of the tiles.
  if (room !== null && size.totalBytes + 3 * 1024 * 1024 > room)
    return "This browser does not have that much room left for Outpost. Remove something that is kept, or choose a smaller area.";
  return undefined;
}

interface Position {
  path: string;
  vector: boolean;
}

function positionsOf(rects: TileRect[], template: (z: number, x: number, y: number) => string, vector: boolean): Position[] {
  const positions: Position[] = [];
  for (const rect of rects) {
    for (let x = rect.minX; x <= rect.maxX; x += 1) {
      for (let y = rect.minY; y <= rect.maxY; y += 1) positions.push({ path: template(rect.z, x, y), vector });
    }
  }
  return positions;
}

/** Every tile address of a kept area, coarsest first, so a part-finished area already draws something everywhere. */
export function areaPositions(area: Pick<KeptArea, "bbox" | "maxZoom" | "terrainMaxZoom" | "sources">): Position[] {
  const { basemap, terrain } = area.sources.sources;
  const positions: Position[] = [];
  if (basemap) {
    const rects = tileRects(area.bbox, Math.min(basemap.minzoom, area.maxZoom), area.maxZoom);
    positions.push(...positionsOf(rects, (z, x, y) => `/api/maps/tiles/${z}/${x}/${y}.mvt`, true));
  }
  if (terrain && area.terrainMaxZoom !== null) {
    const rects = tileRects(area.bbox, Math.min(terrain.minzoom, area.terrainMaxZoom), area.terrainMaxZoom);
    positions.push(...positionsOf(rects, (z, x, y) => `/api/maps/terrain/${z}/${x}/${y}.webp`, false));
  }
  return positions;
}

export const countAreaPositions = (bbox: Bbox, minZoom: number, maxZoom: number) => countRectTiles(tileRects(bbox, minZoom, maxZoom));

/**
 * A tile kept gzipped has to be unpacked when it is drawn. A browser that cannot do that (Safari before 16.4)
 * is given tiles the ordinary way and keeps them unpacked: two to three times the size the server measured.
 */
const CAN_UNPACK = typeof DecompressionStream !== "undefined";

async function gunzip(bytes: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── Work in progress, for any screen that wants to show it ──

export interface AreaWork {
  id: string;
  title: string;
  done: number;
  positions: number;
  bytes: number;
  state: "running" | "stopped" | "failed";
  message?: string;
}

const work = new Map<string, AreaWork & { abort: AbortController }>();
let workSnapshot: AreaWork[] = [];
const workListeners = new Set<() => void>();
function publish(): void {
  workSnapshot = [...work.values()].map(({ abort: _abort, ...rest }) => rest);
  for (const listener of workListeners) listener();
}

export function useAreaWork(): AreaWork[] {
  return useSyncExternalStore(
    (listener) => {
      workListeners.add(listener);
      return () => workListeners.delete(listener);
    },
    () => workSnapshot,
    () => workSnapshot,
  );
}

/** Areas removed while their tiles were still being fetched: nothing more is recorded for them. */
const removed = new Set<string>();

/** Stops fetching. With `forget`, the area is being removed: its record must not be written again. */
export function stopArea(id: string, forget = false): void {
  if (forget) removed.add(id);
  work.get(id)?.abort.abort();
  if (forget) {
    work.delete(id);
    publish();
  }
}

/** Forgets a finished, stopped or failed piece of work (the kept record says the rest). */
export function dismissAreaWork(id: string): void {
  if (work.get(id)?.state === "running") return;
  work.delete(id);
  publish();
}

export interface AreaRequest {
  title: string;
  bbox: Bbox;
  size: MapAreaSize;
}

/** Starts keeping a measured box. Resolves once the record exists; the fetching goes on in the background. */
export async function startArea(request: AreaRequest): Promise<KeptArea> {
  if (!request.size.map) throw new Error("No detailed map is installed for this area.");
  const [sources, overview] = await Promise.all([api.get<MapSources>("/api/maps/sources"), api.get<MapOverview>("/api/maps/overview")]);
  const now = Date.now();
  const area: KeptArea = {
    kind: "area",
    id: crypto.randomUUID(),
    title: request.title,
    bbox: request.bbox,
    maxZoom: request.size.map.maxZoom,
    terrainMaxZoom: request.size.terrain?.maxZoom ?? null,
    tiles: 0,
    done: 0,
    positions: 0,
    complete: false,
    sources,
    regionsKey: regionsCacheKey(overview.regions),
    bytes: 0,
    keptAt: now,
    refreshedAt: now,
  };
  area.positions = areaPositions(area).length;
  await putKept(area);
  void runArea(area, false);
  return area;
}

/** Carries on an area whose fetching stopped part of the way, or fetches a finished one again from the server. */
export async function continueArea(id: string, again = false): Promise<void> {
  const area = await getKept("area", id);
  if (!area || work.get(id)?.state === "running") return;
  if (!again) return void runArea(area, false);
  const [sources, overview] = await Promise.all([api.get<MapSources>("/api/maps/sources"), api.get<MapOverview>("/api/maps/overview")]);
  void runArea({ ...area, sources, regionsKey: regionsCacheKey(overview.regions), stale: false }, true);
}

async function runArea(start: KeptArea, again: boolean): Promise<void> {
  const abort = new AbortController();
  const positions = areaPositions(start);
  const entry: AreaWork & { abort: AbortController } = {
    id: start.id,
    title: start.title,
    done: 0,
    positions: positions.length,
    bytes: 0,
    state: "running",
    abort,
  };
  work.set(start.id, entry);
  publish();

  let area: KeptArea = { ...start, positions: positions.length, complete: false };
  const cache = await openKept("area", start.id);
  // What is already here from an earlier run is not asked for twice, unless this is a fresh copy.
  const have = new Map<string, number>();
  if (again) {
    for (const request of await cache.keys()) await cache.delete(request);
  } else {
    for (const request of await cache.keys()) have.set(new URL(request.url).pathname, 0);
  }
  const ranges = new Set<number>(BASE_GLYPH_RANGES);
  let stored = 0;
  let bytes = again ? 0 : start.bytes;
  let next = 0;

  const record = async (complete: boolean) => {
    if (removed.has(start.id)) return;
    area = { ...area, tiles: stored, done: entry.done, bytes, complete, refreshedAt: complete ? Date.now() : area.refreshedAt };
    await putKept(area);
  };

  const fetchTile = async (position: Position): Promise<void> => {
    if (have.has(position.path)) {
      stored += 1;
      // Its lettering still has to be counted: read the kept copy.
      if (position.vector) {
        const copy = await cache.match(position.path);
        if (copy) await countLettering(copy, ranges);
      }
      return;
    }
    const response = await fetch(`${position.path}${CAN_UNPACK ? "?raw=1" : ""}`, {
      signal: abort.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 204) return;
    if (!response.ok) throw new Error(`The server could not give a map tile (${response.status}).`);
    const body = await response.arrayBuffer();
    const headers: Record<string, string> = { "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream" };
    const encoding = response.headers.get(TILE_ENCODING_HEADER);
    if (encoding) headers[TILE_ENCODING_HEADER] = encoding;
    bytes += await putKeptBytes(cache, position.path, body, headers);
    stored += 1;
    if (position.vector) collectGlyphRanges(encoding === "gzip" ? await gunzip(body) : new Uint8Array(body), ranges);
  };

  const worker = async (): Promise<void> => {
    while (next < positions.length) {
      const position = positions[next]!;
      next += 1;
      try {
        await fetchTile(position);
      } catch (error) {
        if (abort.signal.aborted) throw error;
        // One more try: a home server under a burst of requests can drop one.
        await fetchTile(position);
      }
      entry.done += 1;
      entry.bytes = bytes;
      if (entry.done % 25 === 0) publish();
      if (entry.done % RECORD_EVERY === 0) await record(false);
    }
  };

  try {
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    // Lettering and icons: small, and fetched whole each time so a fresh copy is complete.
    const furniture = [
      ...[...ranges].flatMap((range) => GLYPH_FONTS.map((font) => glyphPath(font, range))),
      ...spritePaths(area.sources.sprites),
    ];
    for (const path of furniture) {
      if (have.has(new URL(path, window.location.origin).pathname)) continue;
      const response = await fetch(path, { signal: abort.signal, credentials: "same-origin" });
      // Not every font has every range; that is what a 404 means here.
      if (!response.ok) continue;
      bytes += await putKeptBytes(cache, path, await response.arrayBuffer(), {
        "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
      });
    }
    await record(true);
    work.delete(start.id);
    // Said wherever the person is by now: fetching can outlast the screen it was started from.
    toast.success(`“${start.title}” is kept on this ${DEVICE} (${formatBytes(bytes)}).`);
  } catch (error) {
    abort.abort();
    await record(false).catch(() => undefined);
    if (removed.has(start.id)) return;
    entry.state = error instanceof DOMException && error.name === "AbortError" ? "stopped" : "failed";
    entry.message =
      entry.state === "stopped"
        ? undefined
        : (outOfRoomMessage(error) ??
          "The server stopped answering part of the way through. What was fetched is kept; carry on when it is back in reach.");
    if (entry.message) toast.error(`“${start.title}” was not finished. ${entry.message}`);
  }
  publish();
}

async function countLettering(copy: Response, ranges: Set<number>): Promise<void> {
  const body = await copy.arrayBuffer();
  collectGlyphRanges(copy.headers.get(TILE_ENCODING_HEADER) === "gzip" ? await gunzip(body) : new Uint8Array(body), ranges);
}

/** Marks kept areas whose server maps have changed since, so the screen can offer to fetch them again. */
export async function checkAreas(areas: KeptArea[]): Promise<void> {
  if (areas.length === 0) return;
  const overview = await api.get<MapOverview>("/api/maps/overview");
  const key = regionsCacheKey(overview.regions);
  for (const area of areas) {
    const stale = area.regionsKey !== key;
    if (Boolean(area.stale) !== stale) await putKept({ ...area, stale });
  }
}

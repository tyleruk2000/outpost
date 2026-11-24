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
 *
 * Fetching a finished area again never takes the working copy away first. Each tile
 * replaces the one kept under its address as it arrives, and what the area no longer
 * holds is removed only once every tile has arrived. Until then the record is the
 * earlier one, marked as mixed, so an interrupted refresh leaves a whole area that
 * draws, part of it newer than the rest.
 */
import {
  type Bbox,
  countRectTiles,
  formatBytes,
  MAX_KEPT_AREA_BYTES,
  MAX_KEPT_AREA_TILES,
  type MapAreaSize,
  type MapOverview,
  type MapSources,
  type TileRect,
  tileRects,
} from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { regionsCacheKey } from "@/features/maps/lib/tiles";
import { ApiError, api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatNumber, localId } from "@/lib/utils";
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
    // Every tile in the box is counted: a large area takes a while on a small computer.
    { timeoutMs: 120_000 },
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

/**
 * What else to choose, for an area that is too large: the same at less detail, or less of the map. For the part in
 * view, less of the map is zooming the map in; a whole region cannot be made smaller, so it is the part of it in view.
 */
function smallerArea(region: string | undefined): string {
  return region ? `or keep the part of ${region} in view instead` : "or zoom the map in so that less of it is in view";
}

/** Why an area of this size cannot be kept, or undefined when it can. `region` names a whole region being kept. */
export function areaRefusal(size: MapAreaSize, room: number | null, region?: string): string | undefined {
  if (!size.map || size.map.tiles === 0)
    return "No detailed map is installed for this area, so there is nothing to keep. Download a region that covers it first.";
  if (size.totalBytes > MAX_KEPT_AREA_BYTES)
    return `At this detail that is ${formatBytes(size.totalBytes)}, more than one kept area may hold. Choose less detail, ${smallerArea(region)}.`;
  // Lettering and icons come on top of the tiles.
  if (room !== null && size.totalBytes + 3 * 1024 * 1024 > room)
    return "This browser does not have that much room left for Outpost. Remove something that is kept, or choose a smaller area.";
  return undefined;
}

/** What the server says of a box with more tiles than one kept area may hold (`kept-area.ts`). */
export interface TooManyTiles {
  layer: "map" | "terrain";
  zoom: number;
  /** The deepest zoom the same box fits to, or null when it is too large even at the least detail. */
  fitsZoom: number | null;
}

/** The server's refusal of a box with too many tiles, read from the error, or null for any other error. */
export function tooManyTiles(error: unknown): TooManyTiles | null {
  if (!(error instanceof ApiError) || error.code !== "too_large" || !error.details) return null;
  const { layer, zoom, fitsZoom } = error.details as Partial<TooManyTiles>;
  if ((layer !== "map" && layer !== "terrain") || typeof zoom !== "number") return null;
  return { layer, zoom, fitsZoom: typeof fitsZoom === "number" ? fitsZoom : null };
}

/** The same refusal in words for this screen: what fits, and the other way to make it fit. */
export function tooManyTilesRefusal(refusal: TooManyTiles, region?: string): string {
  const what = region ? `All of ${region}` : "The area in view";
  const layer = refusal.layer === "terrain" ? " with terrain" : "";
  if (refusal.fitsZoom === null)
    return `${what}${layer} is too large to keep even at the least detail: more than ${formatNumber(MAX_KEPT_AREA_TILES)} tiles. ${region ? `Keep the part of ${region} in view instead.` : "Zoom the map in so that less of it is in view."}`;
  return `${what}${layer} is more than ${formatNumber(MAX_KEPT_AREA_TILES)} tiles at zoom ${refusal.zoom}, more than one kept area may hold. It fits to zoom ${refusal.fitsZoom}: choose that detail or less, ${smallerArea(region)}${refusal.layer === "terrain" ? ", or keep it without terrain" : ""}.`;
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
    id: localId(),
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
  void runArea({ ...area, sources, regionsKey: regionsCacheKey(overview.regions), stale: false }, area);
}

/** Thrown when a fresh copy was asked for and the server holds no map tile of the area any more. */
class NothingToFetch extends Error {}

/** What is in a kept thing's cache, counted as it is stored. */
async function bytesIn(cache: Cache): Promise<number> {
  let bytes = 0;
  for (const request of await cache.keys()) bytes += (await (await cache.match(request))?.blob())?.size ?? 0;
  return bytes;
}

/**
 * Fetches the tiles of `start`. `earlier` is given when a finished area is being fetched
 * again: it is the record of the copy already here, which stays the record until every
 * tile has been replaced.
 */
async function runArea(start: KeptArea, earlier: KeptArea | false): Promise<void> {
  const again = earlier !== false;
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
  // A fresh copy asks for everything, and leaves what is here in place until its replacement has arrived.
  const have = new Map<string, number>();
  if (!again) for (const request of await cache.keys()) have.set(new URL(request.url).pathname, 0);
  /** For a fresh copy: every address written by this run. Anything else in the cache is the earlier copy's. */
  const fresh = new Set<string>();
  const ranges = new Set<number>(BASE_GLYPH_RANGES);
  let stored = 0;
  let bytes = again ? 0 : start.bytes;
  let next = 0;

  const record = async (complete: boolean) => {
    if (removed.has(start.id)) return;
    if (earlier && !complete) {
      // Not finished: the copy is still the earlier one, whole, with some of its tiles replaced.
      // It is drawn as the earlier copy was, and is still offered to be fetched again.
      await putKept({ ...earlier, stale: true, mixed: true, bytes: fresh.size > 0 ? await bytesIn(cache) : earlier.bytes });
      return;
    }
    area = { ...area, tiles: stored, done: entry.done, bytes, complete, refreshedAt: complete ? Date.now() : area.refreshedAt };
    await putKept(area);
  };
  // Said before the first tile is replaced, so that a tab closed part of the way through leaves a true record.
  if (earlier) await record(false);

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
    // Not `bytes += await …`: that reads the total before waiting, and tiles stored meanwhile would go uncounted.
    const size = await putKeptBytes(cache, position.path, body, headers);
    bytes += size;
    fresh.add(position.path);
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
      // A fresh copy has said what it is already; an unfinished one records how far it has come.
      if (!again && entry.done % RECORD_EVERY === 0) await record(false);
    }
  };

  try {
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    // The server's map for this area has gone. An empty area in place of the one that was kept would be no refresh.
    if (earlier && stored === 0 && earlier.tiles > 0) throw new NothingToFetch();
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
      fresh.add(new URL(path, window.location.origin).pathname);
    }
    if (again) {
      // Everything of the new copy is here. What is left of the earlier one is no longer part of the area.
      for (const request of await cache.keys()) {
        if (!fresh.has(new URL(request.url).pathname)) await cache.delete(request);
      }
      area = { ...area, mixed: false };
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
        : error instanceof NothingToFetch
          ? "The server has no map for this area now, so the copy that was here is kept as it was."
          : (outOfRoomMessage(error) ??
            (again
              ? "The server stopped answering part of the way through. The area is still whole: the tiles that arrived are new and the rest are the copy that was here. Fetch it again when the server is back in reach."
              : "The server stopped answering part of the way through. What was fetched is kept; carry on when it is back in reach."));
    if (entry.message) notify.error(`“${start.title}” was not finished. ${entry.message}`);
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

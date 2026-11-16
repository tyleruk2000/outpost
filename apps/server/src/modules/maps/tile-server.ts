/**
 * Serving tiles from whatever is installed, as if it were one map.
 *
 * Each installed region is its own archive: a detailed one for the hills you walk in,
 * a coarse one for the whole country, an overview of the world. A request for a tile
 * is answered from the most detailed archive that covers it and actually has the tile,
 * falling back through the others, so the map is seamless wherever regions overlap.
 */
import type { Bbox, InstalledRegion, MapSources, MapTileType } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import type { CollectionRow } from "../collections/service.ts";
import { contentEncodingOf, contentTypeOf } from "./pmtiles/header.ts";
import { LocalArchive } from "./pmtiles/reader.ts";
import { tileToBbox } from "./pmtiles/tiles.ts";
import { ATTRIBUTIONS } from "./source.ts";

/** Archives kept open at once. Each holds one file handle and a small directory cache. */
const MAX_OPEN_ARCHIVES = 12;
/** The list of installed regions is re-read at most this often, and whenever it changes. */
const CANDIDATE_TTL_MS = 5_000;

export interface ServedTile {
  data: Buffer;
  contentType: string;
  contentEncoding: string | undefined;
}

interface Candidate {
  row: CollectionRow;
  bounds: Bbox;
  minZoom: number;
  maxZoom: number;
  area: number;
}

export interface TileServer {
  getTile(tileType: MapTileType, z: number, x: number, y: number): Promise<ServedTile | undefined>;
  /** The stored size of the tile `getTile` would answer with, without reading it; undefined when there is none. */
  tileLength(tileType: MapTileType, z: number, x: number, y: number): Promise<number | undefined>;
  regions(): InstalledRegion[];
  sources(): MapSources;
  /** Lets go of an archive's file, e.g. before it is deleted or once it has moved. */
  release(collectionId: string): Promise<void>;
  /** Forget what is installed; the next request looks again. */
  invalidate(): void;
  close(): Promise<void>;
}

const kindOf = (tileType: MapTileType) => (tileType === "vector" ? "map" : "terrain") as "map" | "terrain";

function overlaps(a: Bbox, b: Bbox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function union(boxes: Bbox[]): Bbox | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}

export function createTileServer(ctx: AppContext): TileServer {
  const { collections, storage } = ctx.services;
  /** Open archives, least recently used first. A failed open is remembered as null for a while. */
  const open = new Map<string, Promise<LocalArchive | null>>();
  const candidates = new Map<MapTileType, { at: number; list: Candidate[] }>();

  function listCandidates(tileType: MapTileType): Candidate[] {
    const cached = candidates.get(tileType);
    if (cached && Date.now() - cached.at < CANDIDATE_TTL_MS) return cached.list;
    const list: Candidate[] = [];
    for (const row of collections.list({ kind: kindOf(tileType) })) {
      const map = row.meta.map;
      // A file that is mid-move is still in place and in use; missing or damaged ones are not served.
      if (map?.format !== "pmtiles" || (row.status !== "installed" && row.status !== "moving")) continue;
      if (!storage.isAvailable(row.locationId)) continue;
      const [west, south, east, north] = map.bounds;
      list.push({
        row,
        bounds: map.bounds,
        minZoom: map.minZoom,
        maxZoom: map.maxZoom,
        area: Math.max(0, east - west) * Math.max(0, north - south),
      });
    }
    // Most detailed first; among equals the smaller (more specific) region, then the newer.
    list.sort((a, b) => b.maxZoom - a.maxZoom || a.area - b.area || b.row.installedAt - a.row.installedAt);
    candidates.set(tileType, { at: Date.now(), list });
    return list;
  }

  async function release(collectionId: string): Promise<void> {
    const pending = open.get(collectionId);
    open.delete(collectionId);
    const archive = await pending?.catch(() => null);
    await archive?.close().catch(() => undefined);
  }

  function archiveFor(row: CollectionRow): Promise<LocalArchive | null> {
    const existing = open.get(row.id);
    if (existing) {
      open.delete(row.id);
      open.set(row.id, existing);
      return existing;
    }
    const opening = (async () => {
      try {
        return await LocalArchive.open(collections.absolutePath(row.id));
      } catch (error) {
        ctx.log.warn({ err: error, collection: row.id }, "map archive could not be opened");
        // Do not retry on every tile of the screen; look again when the list is refreshed.
        setTimeout(() => {
          if (open.get(row.id) === opening) open.delete(row.id);
        }, CANDIDATE_TTL_MS).unref();
        return null;
      }
    })();
    open.set(row.id, opening);
    while (open.size > MAX_OPEN_ARCHIVES) {
      const oldest = open.keys().next().value;
      if (oldest === undefined || oldest === row.id) break;
      void release(oldest);
    }
    return opening;
  }

  function toRegion(row: CollectionRow, tileType: MapTileType): InstalledRegion | undefined {
    const map = row.meta.map;
    if (!map) return undefined;
    const location = storage.list().find((entry) => entry.id === row.locationId);
    return {
      id: row.id,
      regionId: typeof row.meta.regionId === "string" ? row.meta.regionId : null,
      name: row.title,
      tileType,
      bounds: map.bounds,
      minZoom: map.minZoom,
      maxZoom: map.maxZoom,
      sizeBytes: row.sizeBytes,
      sourceBuild: map.sourceBuild ?? null,
      installedAt: row.installedAt,
      locationId: row.locationId,
      locationName: location?.name ?? "Unknown location",
      available: location?.status === "available",
      status: row.status,
    };
  }

  // Anything that changes what is installed, or which drives are connected, changes the answer.
  const unsubscribe = ctx.events.subscribe((event) => {
    if (event.type === "maps.changed" || event.type === "storage.changed" || event.type === "collections.changed") candidates.clear();
  });

  /** Asks the installed archives for a tile, most detailed first, and returns the first answer. */
  async function find<T>(
    tileType: MapTileType,
    z: number,
    x: number,
    y: number,
    read: (archive: LocalArchive) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const size = 2 ** z;
    if (
      !Number.isInteger(z) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      z < 0 ||
      z > 24 ||
      x < 0 ||
      y < 0 ||
      x >= size ||
      y >= size
    ) {
      return undefined;
    }
    const tile = tileToBbox(z, x, y);
    for (const candidate of listCandidates(tileType)) {
      if (z < candidate.minZoom || z > candidate.maxZoom || !overlaps(tile, candidate.bounds)) continue;
      const archive = await archiveFor(candidate.row);
      if (!archive) continue;
      try {
        const found = await read(archive);
        if (found !== undefined) return found;
      } catch (error) {
        // A drive pulled out mid-read, or a damaged file: drop the handle and try the next region.
        ctx.log.warn({ err: error, collection: candidate.row.id }, "map tile could not be read");
        void release(candidate.row.id);
      }
    }
    return undefined;
  }

  return {
    async getTile(tileType, z, x, y) {
      return find(tileType, z, x, y, async (archive) => {
        const data = await archive.getTile(z, x, y);
        return data
          ? {
              data,
              contentType: contentTypeOf(archive.header.tileType),
              contentEncoding: contentEncodingOf(archive.header.tileCompression),
            }
          : undefined;
      });
    },

    async tileLength(tileType, z, x, y) {
      return find(tileType, z, x, y, (archive) => archive.tileLength(z, x, y));
    },

    regions() {
      const regions: InstalledRegion[] = [];
      for (const tileType of ["vector", "terrain"] as const) {
        for (const row of collections.list({ kind: kindOf(tileType) })) {
          const region = toRegion(row, tileType);
          if (region) regions.push(region);
        }
      }
      return regions;
    },

    sources() {
      const basemap = listCandidates("vector");
      const terrain = listCandidates("terrain");
      const sources: MapSources["sources"] = {};
      const basemapBounds = union(basemap.map((candidate) => candidate.bounds));
      if (basemapBounds) {
        sources.basemap = {
          type: "vector",
          tiles: ["/api/maps/tiles/{z}/{x}/{y}.mvt"],
          minzoom: Math.min(...basemap.map((candidate) => candidate.minZoom)),
          maxzoom: Math.max(...basemap.map((candidate) => candidate.maxZoom)),
          bounds: basemapBounds,
          attribution: ATTRIBUTIONS.basemap.html,
        };
      }
      const terrainBounds = union(terrain.map((candidate) => candidate.bounds));
      if (terrainBounds) {
        sources.terrain = {
          type: "raster-dem",
          tiles: ["/api/maps/terrain/{z}/{x}/{y}.webp"],
          minzoom: Math.min(...terrain.map((candidate) => candidate.minZoom)),
          maxzoom: Math.max(...terrain.map((candidate) => candidate.maxZoom)),
          bounds: terrainBounds,
          // Mapterhorn tiles are 512 px, Terrarium-encoded.
          tileSize: 512,
          encoding: "terrarium",
          attribution: ATTRIBUTIONS.terrain.html,
        };
      }
      const hasPlaces = collections.list({ kind: "places" }).length > 0;
      const attributions = [
        ...(sources.basemap ? [ATTRIBUTIONS.basemap] : []),
        ...(sources.terrain ? [ATTRIBUTIONS.terrain] : []),
        ...(hasPlaces ? [ATTRIBUTIONS.places] : []),
      ];
      return {
        hasTiles: Boolean(sources.basemap),
        hasTerrain: Boolean(sources.terrain),
        sources,
        glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
        sprites: Object.fromEntries(
          ["light", "dark", "white", "grayscale", "black"].map((flavour) => [flavour, `/map-assets/sprites/v4/${flavour}`]),
        ),
        bounds: basemapBounds,
        minZoom: sources.basemap?.minzoom ?? 0,
        maxZoom: sources.basemap?.maxzoom ?? 0,
        attribution: attributions.map((entry) => entry.html).join(" | "),
        attributions,
      };
    },

    release,

    invalidate() {
      candidates.clear();
    },

    async close() {
      unsubscribe();
      await Promise.all([...open.keys()].map((id) => release(id)));
    },
  };
}

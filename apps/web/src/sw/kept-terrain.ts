/**
 * Heights and an aerial's estimated range from the terrain kept on this phone, for when
 * the server is out of reach. The service worker answers `GET /api/maps/height` and
 * `GET /api/maps/sight-range` from here only when the server does not answer; within
 * reach the server's answer is always the one used.
 *
 * The sums are the server's own (`createTileSampler`, `computeViewshed` in the shared
 * package), read from the terrain tiles of kept map areas instead of the installed
 * archives. So where the phone holds the same tiles the answer is the same; where it
 * holds less (an area kept to a coarser zoom, or 30 km across when the range reaches
 * 100 km) the answer says the ground beyond is not known, as the server does at the edge
 * of its terrain. Plain functions on a `CacheStorage`, so they can be tested without a
 * worker.
 */
import {
  computeViewshed,
  createTileSampler,
  decodeLosslessWebp,
  type HeightTile,
  type PointHeight,
  pointHeightFrom,
  RANGE_MAX_HEIGHT_METERS,
  type SightRange,
  type TerrainExtent,
  terrariumHeights,
} from "@outpost/shared";
import { KEPT_INDEX, KEPT_PREFIX, TILE_ENCODING_HEADER } from "./rules";

interface KeptAreaRecord {
  kind: "area";
  id: string;
  bbox: [number, number, number, number];
  terrainMaxZoom: number | null;
  sources?: { sources?: { terrain?: { minzoom: number; maxzoom: number; bounds: [number, number, number, number] } } };
}

/** The kept areas that hold terrain, read from the list of what is kept. */
async function areasWithTerrain(storage: CacheStorage): Promise<KeptAreaRecord[]> {
  const index = await storage.open(KEPT_INDEX);
  const areas: KeptAreaRecord[] = [];
  for (const request of await index.keys()) {
    if (!new URL(request.url).pathname.startsWith("/__kept/area/")) continue;
    try {
      const record = (await (await index.match(request))?.json()) as KeptAreaRecord | undefined;
      if (record?.kind === "area" && record.terrainMaxZoom !== null && record.sources?.sources?.terrain) areas.push(record);
    } catch {
      // A record that cannot be read is passed over.
    }
  }
  return areas;
}

/** What terrain the phone holds: from the coarsest zoom kept to the finest, over the boxes of the areas kept with it. */
export function keptExtent(areas: KeptAreaRecord[]): TerrainExtent | null {
  if (areas.length === 0) return null;
  const minzoom = Math.min(...areas.map((area) => area.sources!.sources!.terrain!.minzoom));
  const maxzoom = Math.max(...areas.map((area) => area.terrainMaxZoom!));
  const bounds: [number, number, number, number] = [
    Math.min(...areas.map((area) => area.bbox[0])),
    Math.min(...areas.map((area) => area.bbox[1])),
    Math.max(...areas.map((area) => area.bbox[2])),
    Math.max(...areas.map((area) => area.bbox[3])),
  ];
  return { minzoom, maxzoom, bounds };
}

async function unpack(response: Response): Promise<Uint8Array> {
  if (response.headers.get(TILE_ENCODING_HEADER) === "gzip" && response.body)
    return new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  return new Uint8Array(await response.arrayBuffer());
}

/** A sampler over the kept terrain tiles, or null when no kept area holds terrain. */
export async function keptSampler(storage: CacheStorage) {
  const areas = await areasWithTerrain(storage);
  const extent = keptExtent(areas);
  if (!extent) return null;
  const names = areas.map((area) => `${KEPT_PREFIX}area:${area.id}`);
  const sampler = createTileSampler({
    terrain: () => extent,
    async getTile(z, x, y): Promise<HeightTile | null> {
      for (const name of names) {
        const found = await (await storage.open(name)).match(`/api/maps/terrain/${z}/${x}/${y}.webp`);
        if (!found) continue;
        // Kept tiles are as the archive holds them: lossless WebP. Anything else is a gap, not a guess.
        return terrariumHeights(decodeLosslessWebp(await unpack(found)));
      }
      return null;
    },
  });
  return { sampler, extent };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Outpost-Worked-On": "phone" } });

/** "lat,lon" as the server reads it, or null. */
function readAt(text: string | null): { lat: number; lon: number } | null {
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(text ?? "");
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

const heightParam = (text: string | null) => {
  const value = Number(text);
  return text !== null && Number.isFinite(value) && value >= 0 && value <= RANGE_MAX_HEIGHT_METERS ? Math.round(value * 10) / 10 : null;
};

/** The answer to a height or a range question from what is kept, as the server would give it; null for any other address. */
export async function answerFromKept(url: URL, storage: CacheStorage): Promise<Response | null> {
  if (url.pathname === "/api/maps/height") {
    const at = readAt(url.searchParams.get("at"));
    if (!at) return json({ error: { code: "bad_request", message: "Give `at` as latitude,longitude." } }, 400);
    const kept = await keptSampler(storage);
    const answer: PointHeight = kept ? await pointHeightFrom(kept.sampler, at) : { at, heightMeters: null, cellMeters: null };
    return json(answer);
  }
  if (url.pathname === "/api/maps/sight-range") {
    const at = readAt(url.searchParams.get("at"));
    const aerial = heightParam(url.searchParams.get("aerial"));
    const station = heightParam(url.searchParams.get("station"));
    if (!at || aerial === null || station === null)
      return json({ error: { code: "bad_request", message: "Give `at` as latitude,longitude and the two heights in metres." } }, 400);
    const kept = await keptSampler(storage);
    const shed = await computeViewshed(
      kept?.sampler ?? createTileSampler({ terrain: () => null, getTile: async () => null }),
      kept ? { maxzoom: kept.extent.maxzoom } : null,
      at,
      aerial,
      station,
    );
    const range: SightRange = shed.range;
    return json(range);
  }
  return null;
}

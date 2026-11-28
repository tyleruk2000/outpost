/**
 * Map data by place: the rows of `GET /api/maps/data` grouped the way a person thinks of them.
 * A place is a country (with any parts of it added on their own), a drawn area, or the world's
 * basics; each says where its Map (the map, hills and place names), Routes, Nearby places and
 * Walk/cycle stand in one word, with every item behind that word listed once.
 *
 * Pure: it reads the answer already built, so the grouping is tested on its own.
 */
import type {
  MapDataBundle,
  MapDataBundleKind,
  MapDataBundleState,
  MapDataCountry,
  MapDataItem,
  MapDataKind,
  MapDataPlace,
} from "./map-data.ts";

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** Which bundle each kind of item belongs to; the source file belongs to none. */
export const MAP_BUNDLE_OF: Record<MapDataKind, MapDataBundleKind | null> = {
  map: "map",
  terrain: "map",
  names: "map",
  roads: "routes",
  places: "nearby",
  streets: "walk",
  imagery: "imagery",
  extract: null,
};

const STATE_OF: Record<MapDataItem["state"], MapDataBundleState> = {
  waiting: "waiting",
  downloading: "downloading",
  paused: "paused",
  processing: "building",
  moving: "moving",
  ready: "ready",
  failed: "failed",
  missing: "failed",
  damaged: "failed",
  "location-offline": "location-offline",
};

/** Most pressing first: what is moving now is said before what is stopped, and that before what is fine. */
const ORDER: MapDataBundleState[] = [
  "downloading",
  "building",
  "paused",
  "waiting",
  "moving",
  "failed",
  "location-offline",
  "ready",
  "none",
];

const UNDER_WAY = new Set<MapDataItem["state"]>(["waiting", "downloading", "paused", "processing", "moving"]);

/** On disk now: not a download or a task on its way. */
export const mapItemOnDisk = (item: MapDataItem) => !item.downloadId && !UNDER_WAY.has(item.state) && item.state !== "failed";

/**
 * A failed download or read that a later one for the same region and kind has taken the place of:
 * the first, damaged attempt at a country beside the routes that a second attempt made. It is not
 * shown on Offline maps at all (Downloads still lists it, to remove), and never outranks what is ready.
 */
export function isMapItemSuperseded(item: MapDataItem, all: MapDataItem[]): boolean {
  if (item.state !== "failed" || !(item.downloadId || item.taskId)) return false;
  return all.some(
    (other) =>
      other !== item &&
      other.kind === item.kind &&
      other.state !== "failed" &&
      STATE_OF[other.state] !== "failed" &&
      (other.regionId === item.regionId || other.regionId === null || item.regionId === null),
  );
}

/** Over a year old by the day its data is from; never for a set made once (ageless). */
export function isMapItemStale(item: MapDataItem, now = Date.now()): boolean {
  if (item.ageless || !item.dataDate || item.state !== "ready") return false;
  const time = Date.parse(`${item.dataDate.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(time) && now - time > YEAR_MS;
}

/** One bundle from its items: the most pressing state, real progress, the oldest day. */
export function mapBundleOf(kind: MapDataBundleKind, given: MapDataItem[]): MapDataBundle {
  const items = given.filter((item) => !isMapItemSuperseded(item, given));
  const states = items.map((item) => STATE_OF[item.state]);
  // A failed copy beside one under way is the same thing being fetched again: the one under way is what counts.
  const state = ORDER.find((each) => states.includes(each)) ?? "none";
  const moving = items.filter((item) => STATE_OF[item.state] === state && item.progress);
  const current = moving.reduce((sum, item) => sum + (item.progress?.current ?? 0), 0);
  const total = moving.reduce((sum, item) => sum + (item.progress?.total ?? 0), 0);
  const dates = items
    .filter((item) => mapItemOnDisk(item) && !item.ageless && item.dataDate)
    .map((item) => item.dataDate!)
    .sort();
  const seen = new Set<string>();
  const sizeBytes = items.reduce((sum, item) => {
    // One download feeding two bundles is counted in each bundle once only.
    // A failed download holds nothing; what it would have been is not counted.
    const id = item.downloadId ?? item.key;
    if (seen.has(id) || item.state === "failed") return sum;
    seen.add(id);
    return sum + (item.sizeBytes ?? 0);
  }, 0);
  return {
    kind,
    state,
    items: items.map((item) => item.key),
    sizeBytes,
    fraction: ["downloading", "paused", "building", "moving"].includes(state) && total > 0 ? Math.min(1, current / total) : null,
    dataDate: dates[0] ?? null,
    reason: state === "failed" ? (items.find((item) => STATE_OF[item.state] === "failed")?.reason ?? null) : null,
  };
}

function placeOf(
  base: Pick<MapDataPlace, "key" | "type" | "name" | "country" | "regionId" | "lastRead">,
  all: MapDataItem[],
  always: MapDataBundleKind[],
  now: number,
): MapDataPlace {
  const seen = new Set<string>();
  const once = all.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
  const items = once.filter((item) => !isMapItemSuperseded(item, once));
  const of = (kind: MapDataBundleKind) => items.filter((item) => MAP_BUNDLE_OF[item.kind] === kind);
  const kinds: MapDataBundleKind[] = ["map", "routes", "nearby", "walk", "imagery"];
  const bundles = kinds.filter((kind) => always.includes(kind) || of(kind).length > 0).map((kind) => mapBundleOf(kind, of(kind)));
  const files = items.filter((item) => item.kind === "extract");
  // The kept file in use: one here before one on its way; the newest of two kept.
  const sourceFile =
    [...files].filter(mapItemOnDisk).sort((a, b) => (b.dataDate ?? "").localeCompare(a.dataDate ?? ""))[0] ?? files[0] ?? null;
  const here = items.filter(mapItemOnDisk);
  return {
    ...base,
    parts: [],
    bundles,
    items,
    sourceFile,
    sizeBytes: here.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
    locations: [...new Set(here.map((item) => item.locationName ?? "Outpost's own data"))],
    stale: items.filter((item) => isMapItemStale(item, now)).length,
  };
}

/** The box round several. */
function unionOf(boxes: Array<[number, number, number, number]>): [number, number, number, number] | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}

/** An area's own name: a map and its terrain are one area ("Cairngorms" and "Cairngorms (terrain)"). */
const areaName = (title: string) => title.replace(/\s*\(terrain\)$/i, "").trim();

const fold = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Every place, countries by name, then drawn areas, then the world's basics last. `streets`: the
 * add-on is installed, so every country offers Walk/cycle.
 */
export function mapPlacesOf(
  input: { countries: MapDataCountry[]; world: MapDataItem[]; other: MapDataItem[] },
  options: { streets: boolean; now?: number } = { streets: false },
): MapDataPlace[] {
  const now = options.now ?? Date.now();
  const always: MapDataBundleKind[] = ["map", "routes", "nearby", ...(options.streets ? (["walk"] as const) : [])];
  const countries = input.countries.map((country) => {
    const items = country.rows.flatMap((row) => row.items);
    const place = placeOf(
      {
        key: `country:${country.country}`,
        type: "country",
        name: country.name,
        country: country.country,
        regionId: country.regionId,
        lastRead: country.lastRead,
      },
      items,
      always,
      now,
    );
    // The parts added on their own: an item named for neither the country nor its terrain.
    const own = new Set([fold(country.name), fold(`${country.name} (terrain)`)]);
    const parts = items
      .filter((item) => item.kind === "roads" || item.kind === "places" || item.kind === "extract")
      .filter((item) => item.regionId && country.regionId && item.regionId !== country.regionId && !own.has(fold(item.title)))
      .map((item) => item.title);
    return { ...place, parts: [...new Set(parts)] };
  });

  const areas = new Map<string, MapDataItem[]>();
  for (const item of input.other) {
    const name = areaName(item.title);
    areas.set(name, [...(areas.get(name) ?? []), item]);
  }
  // A drawn area offers a map and its nearby places, as Add a place does for an area.
  const drawn = [...areas.entries()]
    .map(([name, items]) => ({
      ...placeOf(
        { key: `area:${items[0]!.key}`, type: "area", name, country: null, regionId: null, lastRead: null },
        items,
        ["map", "nearby"],
        now,
      ),
      bbox: unionOf(items.flatMap((item) => (item.bbox ? [item.bbox] : []))),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  const world =
    input.world.length > 0
      ? [
          placeOf(
            { key: "world", type: "world", name: "World basics", country: null, regionId: null, lastRead: null },
            input.world,
            ["map", "nearby"],
            now,
          ),
        ]
      : [];
  return [...countries, ...drawn, ...world];
}

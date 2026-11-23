/**
 * Map data: everything Outpost keeps for the map, in one answer (`GET /api/maps/data`),
 * grouped by what it is for rather than where it came from; and the one way to add a
 * country's roads, places and country file together (`POST /api/maps/data/add`).
 *
 * A country file is a Geofabrik extract (`.osm.pbf`): the full OpenStreetMap record of a
 * country or region. It is downloaded once and read for both road routes and places to
 * find; afterwards it is kept (a collection of kind "extract" on a storage location) or
 * deleted, as the person chose.
 */

/** The six rows each country has, in the order they are shown. */
export const MAP_DATA_COUNTRY_KINDS = ["map", "terrain", "names", "roads", "places", "extract"] as const;

/**
 * What a piece of map data is for: "map" the map to look at, "terrain" hills and heights,
 * "names" place names for search, "roads" roads for routes, "places" places to find
 * (reference layers), "extract" a country file, "imagery" satellite pictures.
 */
export type MapDataKind = (typeof MAP_DATA_COUNTRY_KINDS)[number] | "imagery";

/**
 * Where a piece of map data stands. "waiting" is queued behind other downloads or tasks;
 * "processing" is being read or built after it arrived (with real progress); "location-offline"
 * is installed on a storage location that is not connected now.
 */
export type MapDataState =
  | "waiting"
  | "downloading"
  | "paused"
  | "processing"
  | "ready"
  | "failed"
  | "location-offline"
  | "missing"
  | "damaged"
  | "moving";

export interface MapDataProgress {
  current: number;
  /** Null while the total is not known. */
  total: number | null;
  /** What `current` and `total` count ("bytes", "ways"); null when not said. */
  unit: string | null;
  /** What is happening, as the task says it ("Reading the main roads"). */
  message: string | null;
  /** Which step of a country file's work this is, where it has more than one: reading roads, then places. */
  step: { at: number; of: number } | null;
}

export interface MapDataItem {
  /** Stable for the life of the thing: "collection:<id>", "road-network:<id>", "download:<id>" or "task:<id>". */
  key: string;
  kind: MapDataKind;
  title: string;
  state: MapDataState;
  /** Bytes on disk; for a download, the size it will be once arrived, where known. */
  sizeBytes: number | null;
  /** The storage location; null for a road network, which is kept with Outpost's own data. */
  locationId: string | null;
  locationName: string | null;
  /** The day the data is from ("2026-11-21"), or null where the source gives none. */
  dataDate: string | null;
  progress: MapDataProgress | null;
  /** Why it failed or what is wrong, in words for the person; null otherwise. */
  reason: string | null;
  /** For "waiting": how many downloads are ahead of it. */
  ahead: number | null;
  /** How many places, names or road junctions it holds, where that is counted. */
  count: number | null;
  /** For places to find: the layers it holds ("hospitals", "food"). */
  layers: string[];
  /** Geofabrik's region for roads, places and country files; the map region's id for a map. */
  regionId: string | null;
  /** Links for "Details" and the row menu. */
  collectionId: string | null;
  networkId: string | null;
  packId: string | null;
  /** The download to open at /downloads/:id. */
  downloadId: string | null;
  /** The task to open at /downloads/tasks/:id (a build, a read, a move). */
  taskId: string | null;
}

export interface MapDataRow {
  kind: MapDataKind;
  /** Empty: not added. */
  items: MapDataItem[];
}

/** A country file read and then deleted: what the Country file row says when none is kept. */
export interface CountryFileRead {
  regionId: string;
  name: string;
  fileName: string;
  bytes: number;
  dataDate: string | null;
  readAt: number;
  kept: boolean;
}

export interface MapDataCountry {
  /** Two letters, upper case ("GB"). */
  country: string;
  name: string;
  /** Geofabrik's region for the whole country, to add roads, places or the country file from; null until the list is read or where it has none. */
  regionId: string | null;
  /** Always six, in `MAP_DATA_COUNTRY_KINDS` order. */
  rows: MapDataRow[];
  /** The newest country file read for this country, kept or not. */
  lastRead: CountryFileRead | null;
}

export interface MapDataResponse {
  summary: {
    /** Bytes of everything listed that is on disk. */
    totalBytes: number;
    /** Where it is, largest first; road networks are under Outpost's own data (`locationId` null). */
    locations: Array<{ locationId: string | null; name: string; bytes: number; available: boolean }>;
    /** Downloads and tasks under way or waiting for map data. */
    active: number;
  };
  countries: MapDataCountry[];
  /** The world overview, world towns, world-wide layers (Natural Earth, airports), world satellite pictures. */
  world: MapDataItem[];
  /** Areas drawn by hand, satellite areas, and anything not one country's. */
  other: MapDataItem[];
  /** Every kept country file, also listed under its country. */
  countryFiles: MapDataItem[];
  /** Map areas kept on a phone live in that phone's browser: the server cannot know them. */
  onThisPhone: null;
  /** The last choice for a country file, to preselect: null until one was made (ask, preselecting nothing). */
  countryFileChoice: { keep: boolean | null; locationId: string | null };
  /** Geofabrik's list of regions has been read on this device: a country's region can be chosen. */
  regionsListed: boolean;
}

/** What can be added for a country in one press. */
export type MapDataAddKind = "map" | "terrain" | "names" | "roads" | "places" | "extract";

/** `POST /api/maps/data/add`. */
export interface MapDataAddRequest {
  /** Geofabrik's region ("united-kingdom", "us/ohio"), for roads, places and the country file. */
  regionId?: string;
  kinds: MapDataAddKind[];
  /** Where it goes: the country file (kept or only while it is read), and the map and terrain. Defaults per kind. */
  locationId?: string;
  /** The country file once read: keep it (true) or delete it (false). Required whenever a country file is involved. */
  keep?: boolean;
  /** For places to find: the layers to read; the five safety layers and food and supplies when left out. */
  layers?: string[];
  /** Read a kept country file only if its data is from this day or later ("2026-11-01"); otherwise download a new one. */
  newerThan?: string;
  /** For "map" (and "terrain"): the area, as the map regions list gives it. */
  map?: { name: string; regionId?: string; bbox: [number, number, number, number]; maxZoom: number; minZoom?: number };
  /** For "names": the country whose GeoNames list to fetch, two letters. */
  country?: string;
}

export interface MapDataAddResponse {
  /** How the country file is had, when one is needed. */
  countryFile:
    | { source: "kept"; collectionId: string; dataDate: string | null; fileName: string }
    | {
        source: "download";
        downloadId: string;
        fileName: string;
        /** From the dated file name. */
        dataDate: string | null;
        /** Set when Geofabrik's latest file was not there and an older dated one is fetched instead. */
        fallback: string | null;
      }
    | null;
  /** Every download started, and every task queued (reading a kept file). */
  downloadIds: string[];
  taskIds: string[];
}

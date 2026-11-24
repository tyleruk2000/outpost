/**
 * Streets for routes: an optional add-on (Valhalla, in its own container, the Compose
 * profile "routes") for what Outpost's own main-roads router cannot do: real streets at
 * both ends of a drive (door to door), walking and cycling routes, and the areas
 * reachable in up to 2 hours by car or bicycle, 8 hours on foot. Outpost's router stays the "Drive" route and the
 * spine of a door-to-door one. Without the add-on (most installations) none of these
 * modes is offered, except a drive-time area over Outpost's own main roads, labelled so.
 *
 * Streets are built on this computer from country files already kept in storage; nothing
 * is downloaded. See docs/development/street-routes.md.
 */
import type { RoadDistanceUnit, RoadRoutePoint, RoadRouteResult } from "./roads.ts";

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Where streets stand.
 * - "not-installed": the add-on is not part of this installation (the usual case).
 * - "no-streets": the add-on is there, with no streets built yet.
 * - "ready": streets are built and the service answers.
 * - "not-answering": streets are built but the service does not answer now.
 * - "problem": the service's address is not allowed, or its folder cannot be read.
 */
export type StreetsState = "not-installed" | "no-streets" | "ready" | "not-answering" | "problem";

/** One country or region a set of streets was built from. */
export interface StreetsRegion {
  /** Geofabrik's region id ("europe/great-britain"), or null for streets imported without one. */
  regionId: string | null;
  name: string;
  /** Two letters, upper case, where known. */
  country: string | null;
  /** The day the country file's data is from, where known. */
  dataDate: string | null;
}

/** The streets in use: one set, built from one or more joined country files. */
export interface StreetsTileset {
  /** "Great Britain", "Kent and East Sussex". */
  name: string;
  regions: StreetsRegion[];
  /** The countries it covers (from `regions`), for "Streets are not installed for France". Empty when not known (an import with no manifest). */
  countries: string[];
  /** The country files it was built from, by name. */
  extracts: Array<{ file: string; bytes: number }>;
  builtAt: number;
  /** Bytes the streets take on disk. */
  sizeBytes: number;
  /** Valhalla's version that built them, or null when not known. */
  valhalla: string | null;
  /** The newest data date among the regions, or null. */
  dataDate: string | null;
}

/** A build or import under way, or the last one that failed. */
export interface StreetsBuildState {
  jobId: string | null;
  state: "waiting" | "building" | "failed";
  /** The step ("merge", "admins", "tiles", "extract", "import", "swap"), and its words. */
  stage: string | null;
  stageLabel: string | null;
  /** Step `at` of `of`, counting only the steps this build has. */
  step: { at: number; of: number } | null;
  /** Why it failed, or what is happening, in words for the person. */
  message: string | null;
  startedAt: number | null;
  /** The expected time for the whole build, from the measured figures (ms); null for an import. */
  expectedMs: number | null;
}

export interface StreetsStatusResponse {
  state: StreetsState;
  /** False when the add-on is not part of this installation: show none of its modes or rows. */
  installed: boolean;
  /** What is wrong or missing, in plain words; null when ready. */
  message: string | null;
  tileset: StreetsTileset | null;
  build: StreetsBuildState | null;
  /** What can be asked now. `reach.drive` is "streets" with streets ready, else "main-roads" when a road network is installed. */
  modes: {
    driveDoor: boolean;
    walk: boolean;
    cycle: boolean;
    reach: { drive: "streets" | "main-roads" | null; walk: boolean; cycle: boolean };
  };
  /** Kept country files streets can be built from. */
  countryFiles: StreetsCountryFile[];
  /** The times that can be asked for each way, in minutes (STREETS_REACH_MINUTES). */
  reachMinutes: Readonly<Record<StreetsReachMode, readonly number[]>>;
}

export interface StreetsCountryFile {
  regionId: string;
  name: string;
  country: string | null;
  dataDate: string | null;
  bytes: number;
  locationId: string;
  locationName: string;
  collectionId: string;
}

// ── Building ────────────────────────────────────────────────────────────────

/**
 * POST /api/streets/tiles: build streets from kept country files (`regions`, Geofabrik
 * ids: all joined into one set, which replaces the one in use), or import a tiles file
 * built elsewhere (`import`, a `.tar` in storage with its `.json` beside it).
 * `workLocationId` puts the build's working files (about 2.4 times the country files at
 * their peak, and every write) on another storage location, such as a USB SSD, instead of
 * the streets' own volume; the streets service must be able to write there.
 */
export type StreetsBuildRequest =
  | { regions: string[]; workLocationId?: string }
  | { import: { locationId: string; relPath: string; name?: string } };

/** POST /api/streets/tiles/estimate: what a build will cost, said before it starts. */
export interface StreetsEstimateRequest {
  regions: string[];
  /** Source files not kept yet (to be downloaded first, from Add a place), with the size Check size found. */
  coming?: Array<{ regionId: string; name: string; country: string | null; bytes: number }>;
}

/** Figures measured on a Raspberry Pi 5 (8 GB) with two threads, scaled by the size of the country files. */
export interface StreetsEstimate {
  regions: StreetsRegion[];
  /** Bytes of the country files read. */
  inputBytes: number;
  /** Several files are joined first (osmium), which needs more room. */
  joined: boolean;
  /** About how long, in minutes, on a Pi 5. */
  minutes: number;
  /** Memory the build takes from what is free, in bytes. */
  memoryBytes: number;
  /** Bytes written to the disk it works on (an SD card wears with writes). */
  writtenBytes: number;
  /** Free space it checks for before it starts. */
  freeSpaceBytes: number;
  /** The size of the streets once built. */
  resultBytes: number;
  /** False when the area is larger than anything built on a Pi so far: the figures are guesses. */
  measured: boolean;
  /** Plain sentences to show before the button. */
  warnings: string[];
}

export interface StreetsBuildResponse {
  jobId: string;
  estimate: StreetsEstimate | null;
}

// ── Routes ──────────────────────────────────────────────────────────────────

/** "drive-door": Outpost's main-roads route with streets from the door and to the door; "walk" and "cycle": streets all the way. */
export type StreetsRouteMode = "drive-door" | "walk" | "cycle";

export interface StreetsRouteRequest {
  /** Start, via points, end: two to twelve. Via points of a drive are Outpost's route's own. */
  points: RoadRoutePoint[];
  mode: StreetsRouteMode;
  units?: RoadDistanceUnit;
  /** For "drive-door": the crossing, as for a road route. */
  crossing?: string;
}

export type StreetLineKind =
  | "start"
  | "turn"
  | "keep"
  | "continue"
  | "roundabout"
  | "exit"
  | "join"
  | "ferry"
  | "steps"
  | "via"
  | "arrive"
  | "other";

/** One line of turn-by-turn directions: "Turn right onto School Lane", "At the roundabout, take the 2nd exit onto A24 (Leatherhead Road)". */
export interface StreetLine {
  kind: StreetLineKind;
  text: string;
  /** Distance and time from this line to the next. */
  distanceM: number;
  durationS: number;
  /** "300 m", "1.2 km", "0.4 miles", "200 yards": the distance to the next line, in the units asked for; "" at the end. */
  distanceText: string;
  /** [lon, lat] where it happens. */
  at: [number, number];
}

/** Turn-by-turn directions for streets: a whole walk or ride, or one end of a drive. */
export interface StreetDirections {
  lines: StreetLine[];
  distanceM: number;
  durationS: number;
  /** [lon, lat] pairs, simplified for drawing. */
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
}

export interface StreetsRouteResult {
  mode: StreetsRouteMode;
  /**
   * For "drive-door": "main-roads" when Outpost's route is the spine and streets are added at each end;
   * "streets" when the streets service drove it all (a short trip, or no road network installed).
   * Null for walking and cycling.
   */
  spine: "main-roads" | "streets" | null;
  /** Outpost's own route, its legs in the owner's style, for "drive-door" with a main-roads spine. */
  road: RoadRouteResult | null;
  /** From the door to where Outpost's route starts; and from where it ends to the door. Null when the door is on the route. */
  start: StreetDirections | null;
  end: StreetDirections | null;
  /** The whole route on streets: walking, cycling, or a drive with a streets spine. */
  streets: StreetDirections | null;
  summary: { distanceM: number; durationS: number };
  /** Everything to draw, each part a line. */
  geometry: { type: "MultiLineString"; coordinates: Array<Array<[number, number]>> };
  warnings: string[];
  /** One sentence for the foot of the page: who made the data, its licence and date. */
  credit: string;
  request: StreetsRouteRequest;
  plannedAt: number;
}

// ── Reachable areas ─────────────────────────────────────────────────────────

export type StreetsReachMode = "drive" | "walk" | "cycle";

/** The times that can be asked, in minutes, for each way: up to 2 hours by car or bicycle, 8 hours on foot. */
export const STREETS_REACH_MINUTES = {
  drive: [15, 30, 60, 90, 120],
  cycle: [15, 30, 60, 90, 120],
  walk: [30, 60, 120, 240, 360, 480],
} as const satisfies Record<StreetsReachMode, readonly number[]>;

/** At most this many times are drawn at once, one inside another. */
export const STREETS_REACH_MAX_AREAS = 3;

export interface StreetsReachRequest {
  point: RoadRoutePoint;
  mode: StreetsReachMode;
  /** One to three of the times in STREETS_REACH_MINUTES for the mode. */
  minutes: number[];
  /** "auto" (default): streets when ready, else Outpost's main roads for a drive. "main-roads": always Outpost's own. */
  source?: "auto" | "main-roads";
}

export interface StreetsReachFeature {
  type: "Feature";
  properties: { minutes: number };
  geometry:
    | { type: "Polygon"; coordinates: Array<Array<[number, number]>> }
    | { type: "MultiPolygon"; coordinates: Array<Array<Array<[number, number]>>> };
}

export interface StreetsReachResult {
  mode: StreetsReachMode;
  /** "streets": Valhalla's areas over every street; "main-roads": Outpost's own, over main roads only. */
  source: "streets" | "main-roads";
  /** "Streets" or "Main roads only": to show with the areas. */
  label: string;
  /** "Free-flowing traffic, no stops." and, for main roads, what that leaves out. */
  note: string;
  point: { lat: number; lon: number; name: string | null };
  /** Smallest time first. */
  areas: { type: "FeatureCollection"; features: StreetsReachFeature[] };
  /** How the shapes were smoothed: Valhalla's `denoise` and `generalize` (metres), or the grid used on main roads (metres). */
  settings: { denoise: number | null; generalizeM: number | null; gridM: number | null };
  credit: string;
  madeAt: number;
}

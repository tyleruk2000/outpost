/**
 * Offline maps: the shapes the maps API returns, and the coordinate helpers both sides
 * need (the server to understand what someone typed into the search box, the web app
 * to show the position under the cursor). Everything here is pure arithmetic.
 */
import { parseMaidenhead } from "./locator.ts";
import { parseMgrs, parseUtmReadings } from "./utm.ts";

// ── Types ───────────────────────────────────────────────────────────────────

/** [west, south, east, north] in degrees. */
export type Bbox = [west: number, south: number, east: number, north: number];

export type MapTileType = "vector" | "terrain";

export const MARKER_COLORS = ["teal", "amber", "red", "green", "blue", "violet", "slate"] as const;
export type MarkerColor = (typeof MARKER_COLORS)[number];
/** Each marker and route colour as drawn on the map, and as written into an exported KML or GeoJSON file. */
export const MARKER_COLOR_HEX: Record<MarkerColor, string> = {
  teal: "#1f8a8c",
  amber: "#dc9414",
  red: "#d24b3e",
  green: "#3d9150",
  blue: "#3f7fd6",
  violet: "#8d62cc",
  slate: "#6d7c88",
};

/**
 * The icons a saved place can carry, beside its colour. A small fixed set for what the
 * map is used for: where to sleep, park, drink, eat and get help, what to head for and
 * what to keep away from. "pin" is the plain dot every place had before there were
 * icons, and what a place has until one is chosen. The drawings are in the web app
 * (`features/maps/lib/place-icons.ts`); the names GPX files use for them are in the
 * server (`modules/maps/waypoint-symbols.ts`).
 */
export const MARKER_ICONS = [
  "pin",
  "home",
  "shelter",
  "tent",
  "parking",
  "water",
  "food",
  "first-aid",
  "fuel",
  "summit",
  "viewpoint",
  "mast",
  "meeting",
  "danger",
  "star",
  "flag",
] as const;
export type MarkerIcon = (typeof MARKER_ICONS)[number];
export const DEFAULT_MARKER_ICON: MarkerIcon = "pin";

/** A stored or received icon name as one of the icons: anything else (a name from a newer Outpost, say) is the plain pin. */
export const asMarkerIcon = (value: unknown): MarkerIcon =>
  typeof value === "string" && (MARKER_ICONS as readonly string[]).includes(value) ? (value as MarkerIcon) : DEFAULT_MARKER_ICON;

/** A ready-made area someone can download with one click. */
export interface MapRegionPreset {
  id: string;
  name: string;
  /** Heading the preset is listed under, e.g. "Britain and Ireland" or "Africa". */
  group: string;
  bbox: Bbox;
  /** Deepest zoom worth downloading by default: detailed for a valley, coarse for a continent. */
  recommendedMaxZoom: number;
  /** Anything a person should know before downloading, e.g. what the box leaves out. */
  note?: string;
}

export interface MapRegionPresetStatus extends MapRegionPreset {
  installed: boolean;
  /** Installed map collections that came from this preset. */
  collectionIds: string[];
  /** A download of this preset that has not finished yet. */
  downloadId: string | null;
}

export interface MapRegionsResponse {
  groups: Array<{ name: string; regions: MapRegionPresetStatus[] }>;
}

export interface InstalledRegion {
  /** Collection id. Remove or move a region through the collections API. */
  id: string;
  /** Preset this was downloaded from, when it was. */
  regionId: string | null;
  name: string;
  tileType: MapTileType;
  bounds: Bbox;
  minZoom: number;
  maxZoom: number;
  sizeBytes: number;
  /** Day of the source build, "YYYYMMDD", when known. */
  sourceBuild: string | null;
  installedAt: number;
  locationId: string;
  locationName: string;
  /** False while the drive holding the file is not connected. */
  available: boolean;
  status: "installed" | "missing" | "moving" | "damaged";
}

export interface PlacesDataset {
  id: string;
  name: string;
  /** Which GeoNames file it came from ("cities500", "cities15000" or a country code), or "os-open-names". */
  dataset: string;
  countries: string[];
  count: number;
  sizeBytes: number;
  installedAt: number;
  /** Who publishes it: GeoNames, or Ordnance Survey (OS Open Names). */
  source: "geonames" | "os";
  /** OS Open Names: the edition held, as OS names it ("2026-10"); null for GeoNames. */
  edition: string | null;
  /** OS Open Names: whether streets and numbered roads were kept. */
  roads?: boolean;
  /** The credit its publisher asks for, as plain text. */
  credit: string;
  locationName: string;
  /** False while the drive holding its file is not connected (the names still work: they are in the database). */
  available: boolean;
}

export interface MapOverview {
  regions: InstalledRegion[];
  places: PlacesDataset[];
  counts: { markers: number; tracks: number; places: number };
}

export interface MapAttribution {
  name: string;
  /** HTML for the map's attribution control. */
  html: string;
  license: string;
  url: string;
}

/**
 * The pieces of a MapLibre style that depend on what is installed. The web app adds the
 * layers. Tile addresses are relative to the server; MapLibre wants absolute ones, so
 * prefix them with `location.origin`.
 */
export interface MapSources {
  hasTiles: boolean;
  hasTerrain: boolean;
  sources: {
    basemap?: {
      type: "vector";
      tiles: string[];
      minzoom: number;
      maxzoom: number;
      bounds: Bbox;
      attribution: string;
    };
    terrain?: {
      type: "raster-dem";
      tiles: string[];
      minzoom: number;
      maxzoom: number;
      bounds: Bbox;
      tileSize: number;
      encoding: "terrarium" | "mapbox";
      attribution: string;
    };
  };
  glyphs: string;
  /** Sprite address per basemap flavour ("light", "dark", …), without extension. */
  sprites: Record<string, string>;
  /** Union of everything installed; null when there are no map tiles yet. */
  bounds: Bbox | null;
  minZoom: number;
  maxZoom: number;
  /** All attributions joined, ready for the attribution control. */
  attribution: string;
  attributions: MapAttribution[];
  /**
   * Installed satellite imagery, one raster source per set, coarsest first: the map
   * draws them in this order, so the most detailed lies on top (see imagery.ts). Not
   * credited in `attributions`; each carries its own credit and date, shown while it
   * is on screen.
   */
  imagery?: ImageryStyleSource[];
}

export interface ImageryStyleSource {
  id: string;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: Bbox;
  attribution: string;
  /** "12 July 2026": the day the picture was taken, said wherever it is shown. */
  imageDateText: string;
}

export interface MapEstimate {
  sizeBytes: number;
  /** Tiles the extract will hold, counting every position (shared tiles count each time). */
  tileCount: number;
  /** Network requests the download will make for tile data. */
  requests: number;
  sourceBuild: string | null;
  sourceUrl: string;
  minZoom: number;
  maxZoom: number;
  attribution: string;
}

export interface MarkerDto {
  id: string;
  name: string;
  note: string;
  lat: number;
  lon: number;
  color: MarkerColor;
  icon: MarkerIcon;
  isFavorite: boolean;
  noteId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TrackDto {
  id: string;
  name: string;
  description: string;
  color: MarkerColor;
  sourceFilename: string | null;
  distanceMeters: number;
  /** Null when the file carried no elevations. */
  ascentMeters: number | null;
  pointCount: number;
  bounds: Bbox | null;
  createdAt: number;
  updatedAt: number;
}

/** GeoJSON FeatureCollection of the lines and waypoints; typed loosely to stay dependency-free. */
export interface TrackWithGeometryDto extends TrackDto {
  geojson: { type: "FeatureCollection"; features: unknown[] };
}

export interface TrackImportResponse {
  track: TrackDto | null;
  /** Markers created from the file's waypoints, when that was asked for. */
  markers: MarkerDto[];
  /** Of the track's lines, how many are outlines (a polygon's rings, from a KML or GeoJSON file). */
  outlines?: number;
  /** The routes after the first, for a KML file whose lines lie in several folders: one route for each folder. */
  moreTracks?: TrackDto[];
}

/** The kinds of file a map import reads. */
export type MapFileFormat = "gpx" | "kml" | "kmz" | "geojson";

/**
 * What a map file would make, read before anything is saved. Importing it adds a new
 * route and new places beside those already saved; nothing is changed or replaced.
 */
export interface MapFilePreview {
  format: MapFileFormat;
  /** The file's own name for itself, or the name the route will be given from the file's name. */
  name: string;
  /** Points in the file. In a GPX file these are waypoints, saved as places only when asked. */
  points: number;
  lines: number;
  /** Polygons' rings, kept as closed lines. */
  outlines: number;
  /** Points in all the lines and outlines. */
  linePoints: number;
  /** How many routes it makes: more than one for a KML file whose lines lie in several folders, one for each. */
  routes?: number;
}

/**
 * A height has to change by this much from the last counted one before it counts as
 * climbing, so that the wobble of a GPS standing still does not add up to a mountain.
 * The server uses it for every stored track; the map uses it for a track being recorded,
 * so the climb shown while walking is the climb the saved track will have.
 */
export const ASCENT_THRESHOLD_METERS = 3;

/**
 * The most points one track recorded on the map may hold. As the map writes GPX, a
 * point with a height and a time is at most 111 bytes, so this many come to under
 * 17 MB, inside the 20 MB a GPX upload may be.
 */
export const MAX_RECORDING_POINTS = 150_000;

/**
 * The id a recording is given on the device that made it: 26 characters in the same
 * alphabet as the ids the server makes. The track is saved under it, so sending the
 * same recording twice (a save whose answer was lost when the network dropped) cannot
 * make two tracks.
 */
export const RECORDING_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/;

/** `PUT /api/maps/recordings/:id`: a track recorded on the map, sent as GPX. */
export interface RecordingSaveResponse {
  track: TrackDto;
  /** True when a track with this id was there already, so nothing was written this time. */
  alreadySaved: boolean;
}

/** The most points a route drawn or edited by hand may have. */
export const MAX_ROUTE_POINTS = 2000;

/** One point placed on the map. A drawn route is straight lines between these, in order. */
export interface RoutePoint {
  lat: number;
  lon: number;
}

/**
 * Where a drawn route's heights came from: the installed terrain for all of it
 * ("terrain"), for only part of it ("partial"), or nowhere, because no terrain is
 * installed for the area ("none"). Nothing is ever downloaded to find heights.
 */
export type RouteElevation = "terrain" | "partial" | "none";

/** `POST /api/maps/tracks`: a route made by placing points. */
export interface RouteCreateRequest {
  name: string;
  description?: string;
  color?: MarkerColor;
  points: RoutePoint[];
}

/** `PUT /api/maps/tracks/:id/points`: replaces the line of a route; its waypoints are kept. */
export interface RoutePointsRequest {
  points: RoutePoint[];
}

export interface RouteSaveResponse {
  track: TrackDto;
  elevation: RouteElevation;
}

/**
 * What the line of a drawn route carries in its GeoJSON properties, beside the usual
 * name. `_profile` is the line sampled every few tens of metres with a height at each
 * sample ([longitude, latitude, metres]; the height is left off where none is known),
 * so the elevation profile shows the ground between the points, not just at them.
 */
export interface DrawnRouteProperties {
  _drawn: true;
  _elevation: RouteElevation;
  _profile?: Array<[lon: number, lat: number, elevation?: number]>;
}

export interface PlaceDto {
  id: number;
  /** GeoNames, or Ordnance Survey's OS Open Names. */
  source: "geonames" | "os";
  name: string;
  country: string | null;
  /** GeoNames: the first-level division's code ("ENG"). OS Open Names: the area in words ("Aberystwyth, Ceredigion, Wales"). */
  admin1: string | null;
  featureCode: string | null;
  /** Plain word for what it is: "City", "Mountain", "Lake", … */
  kindLabel: string;
  lat: number;
  lon: number;
  population: number;
  elevation: number | null;
}

export interface PlaceSearchResponse {
  query: string;
  /** Set when the text is a position rather than a name. */
  coordinate: ParsedCoordinate | null;
  /**
   * Other positions the same text can mean. Four characters such as "NN16" are both a
   * British grid reference and a Maidenhead locator, and nothing in the text says which.
   */
  otherReadings?: ParsedCoordinate[];
  places: PlaceDto[];
  /** The credits of the sources the places listed came from, as their publishers ask for them. */
  credits?: string[];
  /** Something to say about the text: a Northern Ireland postcode, which no installed source covers. */
  notice?: string;
}

// ── Coordinates ─────────────────────────────────────────────────────────────

export type CoordinateFormat = "decimal" | "ddm" | "dms" | "geo" | "osgb" | "irish" | "maidenhead" | "utm" | "mgrs";

export interface ParsedCoordinate {
  lat: number;
  lon: number;
  format: CoordinateFormat;
  /** For grid references: the size of the square the reference names, in metres. */
  precisionMeters?: number;
  /** For Maidenhead locators: the locator as it is written, in upper case. The position is the middle of its cell. */
  locator?: string;
  /** For UTM, UPS and MGRS: the reference written out in the usual way, upper case and spaced ("33U XP 04542 31236"). */
  reference?: string;
}

const DEG = Math.PI / 180;

export function isValidLatLon(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** Great-circle distance in metres on a sphere of mean Earth radius. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── British National Grid ───────────────────────────────────────────────────
// Ordnance Survey, "A guide to coordinate systems in Great Britain": Transverse
// Mercator on the Airy 1830 ellipsoid, and a seven-parameter Helmert shift between
// OSGB36 and WGS84. The shift is good to about five metres, which is finer than
// anything typed as a grid reference by hand.

interface Ellipsoid {
  a: number;
  b: number;
}
const AIRY_1830: Ellipsoid = { a: 6_377_563.396, b: 6_356_256.909 };
const WGS84: Ellipsoid = { a: 6_378_137, b: 6_356_752.314245 };

const GRID = { f0: 0.9996012717, lat0: 49 * DEG, lon0: -2 * DEG, e0: 400_000, n0: -100_000 };
const GRID_WIDTH = 700_000;
const GRID_HEIGHT = 1_300_000;

/** WGS84 → OSGB36: translations in metres, rotations in arc-seconds, scale in ppm. */
const HELMERT_TO_OSGB36 = { tx: -446.448, ty: 125.157, tz: -542.06, rx: -0.1502, ry: -0.247, rz: -0.8421, s: 20.4894 };

type Helmert = typeof HELMERT_TO_OSGB36;

function invertHelmert(t: Helmert): Helmert {
  return { tx: -t.tx, ty: -t.ty, tz: -t.tz, rx: -t.rx, ry: -t.ry, rz: -t.rz, s: -t.s };
}

function toCartesian(lat: number, lon: number, e: Ellipsoid): [number, number, number] {
  const e2 = 1 - (e.b * e.b) / (e.a * e.a);
  const sinLat = Math.sin(lat);
  const nu = e.a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return [nu * Math.cos(lat) * Math.cos(lon), nu * Math.cos(lat) * Math.sin(lon), nu * (1 - e2) * sinLat];
}

function fromCartesian(x: number, y: number, z: number, e: Ellipsoid): [lat: number, lon: number] {
  const e2 = 1 - (e.b * e.b) / (e.a * e.a);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 10; i += 1) {
    const sinLat = Math.sin(lat);
    const nu = e.a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const next = Math.atan2(z + e2 * nu * sinLat, p);
    if (Math.abs(next - lat) < 1e-13) {
      lat = next;
      break;
    }
    lat = next;
  }
  return [lat, Math.atan2(y, x)];
}

function helmert(point: [number, number, number], t: Helmert): [number, number, number] {
  const [x, y, z] = point;
  const arcSecond = DEG / 3600;
  const rx = t.rx * arcSecond;
  const ry = t.ry * arcSecond;
  const rz = t.rz * arcSecond;
  const s = 1 + t.s / 1e6;
  return [t.tx + x * s - y * rz + z * ry, t.ty + x * rz + y * s - z * rx, t.tz - x * ry + y * rx + z * s];
}

function shiftDatum(latDeg: number, lonDeg: number, from: Ellipsoid, to: Ellipsoid, t: Helmert): [number, number] {
  const moved = helmert(toCartesian(latDeg * DEG, lonDeg * DEG, from), t);
  const [lat, lon] = fromCartesian(moved[0], moved[1], moved[2], to);
  return [lat / DEG, lon / DEG];
}

/** A Transverse Mercator grid: its ellipsoid, true origin, scale on the central meridian and false origin. */
interface TmGrid {
  ellipsoid: Ellipsoid;
  f0: number;
  lat0: number;
  lon0: number;
  e0: number;
  n0: number;
}

const NATIONAL_GRID: TmGrid = { ellipsoid: AIRY_1830, ...GRID };

/** Meridional arc from the grid's true origin to latitude `lat` (radians), in metres. */
function meridionalArc(lat: number, grid: TmGrid): number {
  const { a, b } = grid.ellipsoid;
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n2 * n;
  const dLat = lat - grid.lat0;
  const sLat = lat + grid.lat0;
  return (
    b *
    grid.f0 *
    ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * dLat -
      (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(dLat) * Math.cos(sLat) +
      ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * dLat) * Math.cos(2 * sLat) -
      (35 / 24) * n3 * Math.sin(3 * dLat) * Math.cos(3 * sLat))
  );
}

/** Latitude and longitude (degrees, on the grid's own ellipsoid) to easting and northing. */
function toTm(latDeg: number, lonDeg: number, grid: TmGrid): { easting: number; northing: number } {
  const { a, b } = grid.ellipsoid;
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const e2 = 1 - (b * b) / (a * a);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tan2 = Math.tan(lat) ** 2;
  const nu = (a * grid.f0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * grid.f0 * (1 - e2)) / (1 - e2 * sinLat * sinLat) ** 1.5;
  const eta2 = nu / rho - 1;
  const m = meridionalArc(lat, grid);
  const dLon = lon - grid.lon0;

  const i = m + grid.n0;
  const ii = (nu / 2) * sinLat * cosLat;
  const iii = (nu / 24) * sinLat * cosLat ** 3 * (5 - tan2 + 9 * eta2);
  const iiia = (nu / 720) * sinLat * cosLat ** 5 * (61 - 58 * tan2 + tan2 * tan2);
  const iv = nu * cosLat;
  const v = (nu / 6) * cosLat ** 3 * (nu / rho - tan2);
  const vi = (nu / 120) * cosLat ** 5 * (5 - 18 * tan2 + tan2 * tan2 + 14 * eta2 - 58 * tan2 * eta2);

  return {
    northing: i + ii * dLon ** 2 + iii * dLon ** 4 + iiia * dLon ** 6,
    easting: grid.e0 + iv * dLon + v * dLon ** 3 + vi * dLon ** 5,
  };
}

/** Easting and northing to latitude and longitude (degrees, on the grid's own ellipsoid). */
function fromTm(easting: number, northing: number, grid: TmGrid): [lat: number, lon: number] {
  const { a, b } = grid.ellipsoid;
  const e2 = 1 - (b * b) / (a * a);
  let lat = grid.lat0;
  let m = 0;
  for (let i = 0; i < 20; i += 1) {
    lat = (northing - grid.n0 - m) / (a * grid.f0) + lat;
    m = meridionalArc(lat, grid);
    if (Math.abs(northing - grid.n0 - m) < 0.00001) break;
  }
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tan = Math.tan(lat);
  const tan2 = tan * tan;
  const nu = (a * grid.f0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * grid.f0 * (1 - e2)) / (1 - e2 * sinLat * sinLat) ** 1.5;
  const eta2 = nu / rho - 1;
  const dE = easting - grid.e0;

  const vii = tan / (2 * rho * nu);
  const viii = (tan / (24 * rho * nu ** 3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const ix = (tan / (720 * rho * nu ** 5)) * (61 + 90 * tan2 + 45 * tan2 * tan2);
  const x = 1 / (cosLat * nu);
  const xi = (1 / (cosLat * 6 * nu ** 3)) * (nu / rho + 2 * tan2);
  const xii = (1 / (cosLat * 120 * nu ** 5)) * (5 + 28 * tan2 + 24 * tan2 * tan2);
  const xiia = (1 / (cosLat * 5040 * nu ** 7)) * (61 + 662 * tan2 + 1320 * tan2 * tan2 + 720 * tan2 ** 3);

  return [
    (lat - vii * dE ** 2 + viii * dE ** 4 - ix * dE ** 6) / DEG,
    (grid.lon0 + x * dE - xi * dE ** 3 + xii * dE ** 5 - xiia * dE ** 7) / DEG,
  ];
}

/** National Grid easting and northing of a WGS84 position, or null outside the grid. */
export function toOsGrid(lat: number, lon: number): { easting: number; northing: number } | null {
  // Far from Britain the projection is meaningless and its series diverge.
  if (!isValidLatLon(lat, lon) || lat < 49 || lat > 62 || lon < -10 || lon > 4) return null;
  const [osLat, osLon] = shiftDatum(lat, lon, WGS84, AIRY_1830, HELMERT_TO_OSGB36);
  const grid = toTm(osLat, osLon, NATIONAL_GRID);
  if (grid.easting < 0 || grid.easting >= GRID_WIDTH || grid.northing < 0 || grid.northing >= GRID_HEIGHT) return null;
  return grid;
}

/** WGS84 position of a National Grid easting and northing (metres). */
export function fromOsGrid(easting: number, northing: number): { lat: number; lon: number } | null {
  if (!(easting >= 0 && easting < GRID_WIDTH && northing >= 0 && northing < GRID_HEIGHT)) return null;
  const [osLat, osLon] = fromTm(easting, northing, NATIONAL_GRID);
  const [lat, lon] = shiftDatum(osLat, osLon, AIRY_1830, WGS84, invertHelmert(HELMERT_TO_OSGB36));
  return { lat, lon };
}

/** The 25 letters of the grid: A–Z without I, five to a row, starting top-left. */
const GRID_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

/**
 * Parses a grid reference such as "NY 215 072", "NY21540721" or "NY 21540 07210".
 * The position returned is the middle of the square the reference names, because that
 * is the best single guess for where the person means.
 */
export function parseOsGridRef(input: string): ParsedCoordinate | null {
  const match = /^([A-HJ-Z])([A-HJ-Z])\s*((?:\d\s*){2,10})$/i.exec(input.trim());
  if (!match) return null;
  const digits = match[3]!.replace(/\s+/g, "");
  if (digits.length % 2 !== 0) return null;
  // With a space, the two halves must be the same length ("NY 2154 0721", not "NY 215 4072").
  const parts = match[3]!.trim().split(/\s+/);
  if (parts.length > 2 || (parts.length === 2 && parts[0]!.length !== parts[1]!.length)) return null;

  const first = GRID_LETTERS.indexOf(match[1]!.toUpperCase());
  const second = GRID_LETTERS.indexOf(match[2]!.toUpperCase());
  // The first letter picks a 500 km square (S is at the origin's row), the second a 100 km one.
  const e100 = ((first % 5) - 2) * 5 + (second % 5);
  const n100 = (4 - Math.floor(first / 5) - 1) * 5 + (4 - Math.floor(second / 5));
  if (e100 < 0 || e100 > 6 || n100 < 0 || n100 > 12) return null;

  const half = digits.length / 2;
  const square = 10 ** (5 - half);
  const easting = e100 * 100_000 + Number(digits.slice(0, half)) * square + square / 2;
  const northing = n100 * 100_000 + Number(digits.slice(half)) * square + square / 2;
  const position = fromOsGrid(easting, northing);
  return position ? { ...position, format: "osgb", precisionMeters: square } : null;
}

/**
 * Formats a position as a grid reference with `figures` digits in total (6 = 100 m,
 * 8 = 10 m, 10 = 1 m). Digits are cut, not rounded, as the Ordnance Survey does: a
 * reference names the square a point is in. Null outside Great Britain's grid.
 */
export function formatOsGridRef(lat: number, lon: number, figures: 2 | 4 | 6 | 8 | 10 = 8): string | null {
  const grid = toOsGrid(lat, lon);
  if (!grid) return null;
  const easting = Math.floor(grid.easting);
  const northing = Math.floor(grid.northing);
  const e100 = Math.floor(easting / 100_000);
  const n100 = Math.floor(northing / 100_000);
  const first = (4 - Math.floor(n100 / 5) - 1) * 5 + Math.floor(e100 / 5) + 2;
  const second = (4 - (n100 % 5)) * 5 + (e100 % 5);
  const half = figures / 2;
  const cut = (value: number) =>
    Math.floor((value % 100_000) / 10 ** (5 - half))
      .toString()
      .padStart(half, "0");
  return `${GRID_LETTERS[first]}${GRID_LETTERS[second]} ${cut(easting)} ${cut(northing)}`;
}

// ── Irish Grid and Irish Transverse Mercator ────────────────────────────────
// Ordnance Survey of Ireland and Ordnance Survey of Northern Ireland, "The Irish Grid: A
// Description of the Co-ordinate Reference System" (2000), sections 4.2 and 4.3: Transverse
// Mercator on the Airy Modified ellipsoid of the 1965 datum (TM75, EPSG:29903). The shift
// from WGS84 is the EPSG dataset's "TM75 to WGS 84 (2)" (EPSG:1954), a position-vector
// Helmert transformation good to about a metre. Irish Transverse Mercator (EPSG:2157) is on
// GRS80 in ETRS89, which is taken as WGS84: the two differ by well under a metre in Ireland.
// Letters as Northern Ireland's statistics agency gives them (NISRA, "Grid square products":
// Belfast City Hall, 333831 E 374015 N, is in square J): 25 squares of 100 km, A to Z
// without I, five to a row from the top left, V at the false origin.

const AIRY_MODIFIED: Ellipsoid = { a: 6_377_340.189, b: 6_377_340.189 * Math.sqrt(1 - 0.00667054015) };
const GRS80: Ellipsoid = { a: 6_378_137, b: 6_378_137 * (1 - 1 / 298.257222101) };
const IRISH_GRID: TmGrid = { ellipsoid: AIRY_MODIFIED, f0: 1.000035, lat0: 53.5 * DEG, lon0: -8 * DEG, e0: 200_000, n0: 250_000 };
const ITM_GRID: TmGrid = { ellipsoid: GRS80, f0: 0.99982, lat0: 53.5 * DEG, lon0: -8 * DEG, e0: 600_000, n0: 750_000 };
/** The Irish Grid's squares: 500 km each way from the false origin. */
const IRISH_GRID_SIZE = 500_000;
/** TM75 → WGS84 (EPSG:1954): translations in metres, rotations in arc-seconds, scale in ppm. */
const HELMERT_TM75_TO_WGS84 = { tx: 482.5, ty: -130.6, tz: 564.6, rx: -1.042, ry: -0.214, rz: -0.631, s: 8.15 };

/** Round Ireland, where the two grids mean something; their series diverge far from it. */
function nearIreland(lat: number, lon: number): boolean {
  return isValidLatLon(lat, lon) && lat >= 51 && lat <= 56.5 && lon >= -11.5 && lon <= -4.5;
}

/** Irish Grid easting and northing (TM75) of a WGS84 position, or null off the grid. */
export function toIrishGrid(lat: number, lon: number): { easting: number; northing: number } | null {
  if (!nearIreland(lat, lon)) return null;
  const [tmLat, tmLon] = shiftDatum(lat, lon, WGS84, AIRY_MODIFIED, invertHelmert(HELMERT_TM75_TO_WGS84));
  const grid = toTm(tmLat, tmLon, IRISH_GRID);
  if (!(grid.easting >= 0 && grid.easting < IRISH_GRID_SIZE && grid.northing >= 0 && grid.northing < IRISH_GRID_SIZE)) return null;
  return grid;
}

/** WGS84 position of an Irish Grid easting and northing (metres). */
export function fromIrishGrid(easting: number, northing: number): { lat: number; lon: number } | null {
  if (!(easting >= 0 && easting < IRISH_GRID_SIZE && northing >= 0 && northing < IRISH_GRID_SIZE)) return null;
  const [tmLat, tmLon] = fromTm(easting, northing, IRISH_GRID);
  const [lat, lon] = shiftDatum(tmLat, tmLon, AIRY_MODIFIED, WGS84, HELMERT_TM75_TO_WGS84);
  return nearIreland(lat, lon) ? { lat, lon } : null;
}

/** Irish Grid easting and northing on the projection alone, from TM75 latitude and longitude: for checking against OSi's worked examples. */
export function irishGridProjection(lat: number, lon: number): { easting: number; northing: number } {
  return toTm(lat, lon, IRISH_GRID);
}

/** Irish Transverse Mercator easting and northing of a WGS84 position, or null away from Ireland. */
export function toItm(lat: number, lon: number): { easting: number; northing: number } | null {
  if (!nearIreland(lat, lon)) return null;
  return toTm(lat, lon, ITM_GRID);
}

/** WGS84 position of an ITM easting and northing (metres). */
export function fromItm(easting: number, northing: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  const [lat, lon] = fromTm(easting, northing, ITM_GRID);
  return nearIreland(lat, lon) ? { lat, lon } : null;
}

/**
 * Formats a position as an Irish Grid reference with `figures` digits in total ("O 154 345"
 * is 6 figures, 100 m). Digits are cut, not rounded, as for the British grid. Null off the grid.
 */
export function formatIrishGridRef(lat: number, lon: number, figures: 2 | 4 | 6 | 8 | 10 = 8): string | null {
  const grid = toIrishGrid(lat, lon);
  if (!grid) return null;
  const easting = Math.floor(grid.easting);
  const northing = Math.floor(grid.northing);
  const letter = GRID_LETTERS[(4 - Math.floor(northing / 100_000)) * 5 + Math.floor(easting / 100_000)]!;
  const half = figures / 2;
  const cut = (value: number) =>
    Math.floor((value % 100_000) / 10 ** (5 - half))
      .toString()
      .padStart(half, "0");
  return `${letter} ${cut(easting)} ${cut(northing)}`;
}

/** "ITM 715830 734697": an ITM easting and northing, to `stepMeters` (cut, as a grid reference is). Null away from Ireland. */
export function formatItm(lat: number, lon: number, stepMeters = 1): string | null {
  const grid = toItm(lat, lon);
  if (!grid) return null;
  const cut = (value: number) => String(Math.floor(value / stepMeters) * stepMeters);
  return `ITM ${cut(grid.easting)} ${cut(grid.northing)}`;
}

/**
 * Parses an Irish Grid reference such as "J 338 740", "O1534" or "N 12345 67890": one letter,
 * then an even number of digits. The position is the middle of the square it names.
 */
export function parseIrishGridRef(input: string): ParsedCoordinate | null {
  const match = /^([A-HJ-Z])\s*((?:\d\s*){2,10})$/i.exec(input.trim());
  if (!match) return null;
  const digits = match[2]!.replace(/\s+/g, "");
  if (digits.length % 2 !== 0) return null;
  const parts = match[2]!.trim().split(/\s+/);
  if (parts.length > 2 || (parts.length === 2 && parts[0]!.length !== parts[1]!.length)) return null;
  const index = GRID_LETTERS.indexOf(match[1]!.toUpperCase());
  const e100 = index % 5;
  const n100 = 4 - Math.floor(index / 5);
  const half = digits.length / 2;
  const square = 10 ** (5 - half);
  const easting = e100 * 100_000 + Number(digits.slice(0, half)) * square + square / 2;
  const northing = n100 * 100_000 + Number(digits.slice(half)) * square + square / 2;
  const position = fromIrishGrid(easting, northing);
  return position ? { ...position, format: "irish", precisionMeters: square } : null;
}

// ── Parsing typed positions ─────────────────────────────────────────────────

interface AngleGroup {
  numbers: string[];
  hemisphere?: string;
}

/** Degrees from one to three numbers (degrees, minutes, seconds). Null if they make no sense. */
function angleFromGroup(group: AngleGroup): number | null {
  const [degText, minText, secText] = group.numbers;
  if (!degText || group.numbers.length > 3) return null;
  const negative = degText.startsWith("-");
  const degrees = Math.abs(Number(degText));
  const minutes = minText === undefined ? 0 : Number(minText);
  const seconds = secText === undefined ? 0 : Number(secText);
  // Only the last part may carry a fraction, and only degrees may carry a sign.
  if (minText !== undefined && (degText.includes(".") || /^[+-]/.test(minText) || minutes >= 60)) return null;
  if (secText !== undefined && (minText!.includes(".") || /^[+-]/.test(secText) || seconds >= 60)) return null;
  if (group.hemisphere && /^[+-]/.test(degText)) return null;
  let value = degrees + minutes / 60 + seconds / 3600;
  if (negative || group.hemisphere === "S" || group.hemisphere === "W") value = -value;
  return value;
}

function parseGeoUri(text: string): ParsedCoordinate | null {
  const match = /^geo:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:[,;?].*)?$/i.exec(text);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return isValidLatLon(lat, lon) ? { lat, lon, format: "geo" } : null;
}

/** Six-digit easting and northing written as plain numbers, e.g. "321540 507210". */
function parseEastingNorthing(text: string): ParsedCoordinate | null {
  const match = /^(\d{6})[\s,]+(\d{6,7})$/.exec(text);
  if (!match) return null;
  const position = fromOsGrid(Number(match[1]), Number(match[2]));
  return position ? { ...position, format: "osgb", precisionMeters: 1 } : null;
}

function parseLatLon(text: string): ParsedCoordinate | null {
  const normalised = text
    .replace(/[−–—]/g, "-")
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/''/g, '"')
    .replace(/º/g, "°")
    .toUpperCase();
  // Anything other than numbers, hemisphere letters and angle marks means it is a name.
  if (!/^[\s\d.,;+\-°'"NSEW]+$/.test(normalised)) return null;

  const tokens = normalised.match(/[+-]?\d+(?:\.\d+)?|[NSEW]|[,;]/g) ?? [];
  const letters = tokens.filter((token) => /^[NSEW]$/.test(token));
  const numberCount = tokens.filter((token) => /\d/.test(token)).length;
  if (numberCount < 2 || numberCount > 6) return null;

  const groups: AngleGroup[] = [];
  if (letters.length === 2) {
    // "54°27'N 3°05'W" or "N54 27 W3 05": each letter closes or opens its own group.
    const prefixed = /^[NSEW]$/.test(tokens[0]!);
    let current: AngleGroup = { numbers: [] };
    for (const token of tokens) {
      if (token === "," || token === ";") continue;
      if (/^[NSEW]$/.test(token)) {
        if (prefixed) {
          if (current.numbers.length > 0) groups.push(current);
          current = { numbers: [], hemisphere: token };
        } else {
          groups.push({ ...current, hemisphere: token });
          current = { numbers: [] };
        }
      } else {
        current.numbers.push(token);
      }
    }
    if (prefixed) groups.push(current);
    else if (current.numbers.length > 0) return null;
  } else if (letters.length === 0) {
    const separator = tokens.findIndex((token) => token === "," || token === ";");
    const numbers = tokens.filter((token) => /\d/.test(token));
    if (separator !== -1) {
      if (tokens.filter((token) => token === "," || token === ";").length > 1) return null;
      groups.push({ numbers: tokens.slice(0, separator) }, { numbers: tokens.slice(separator + 1) });
    } else {
      if (numbers.length % 2 !== 0) return null;
      groups.push({ numbers: numbers.slice(0, numbers.length / 2) }, { numbers: numbers.slice(numbers.length / 2) });
    }
  } else {
    return null;
  }

  if (groups.length !== 2) return null;
  const [first, second] = groups as [AngleGroup, AngleGroup];
  if (first.numbers.length !== second.numbers.length) return null;
  const a = angleFromGroup(first);
  const b = angleFromGroup(second);
  if (a === null || b === null) return null;

  // Latitude comes first unless the letters say otherwise ("3.09W 54.46N").
  const firstIsLon = first.hemisphere === "E" || first.hemisphere === "W";
  const secondIsLon = second.hemisphere === "E" || second.hemisphere === "W";
  if (letters.length === 2 && firstIsLon === secondIsLon) return null;
  const lat = firstIsLon ? b : a;
  const lon = firstIsLon ? a : b;
  if (!isValidLatLon(lat, lon)) return null;
  const format: CoordinateFormat = first.numbers.length === 1 ? "decimal" : first.numbers.length === 2 ? "ddm" : "dms";
  return { lat, lon, format };
}

/**
 * A Maidenhead locator of 4, 6 or 8 characters ("IO83", "IO83QM", "IO83QM27"). The
 * position is the middle of the cell it names. A field alone ("IO") is not read: it is
 * two letters, and 20° wide.
 */
function parseLocator(text: string): ParsedCoordinate | null {
  const square = parseMaidenhead(text);
  if (!square || square.locator.length < 4) return null;
  return { lat: square.lat, lon: square.lon, format: "maidenhead", locator: square.locator };
}

/** UTM or UPS coordinates, or an MGRS reference: one reading, or two for a UTM zone letter S (band or hemisphere). */
function parseGridReadings(text: string): ParsedCoordinate[] {
  const mgrs = parseMgrs(text);
  if (mgrs) return [{ lat: mgrs.lat, lon: mgrs.lon, format: "mgrs", precisionMeters: mgrs.precisionMeters, reference: mgrs.text }];
  return parseUtmReadings(text).map((reading) => ({ lat: reading.lat, lon: reading.lon, format: "utm", reference: reading.text }));
}

/**
 * Every position a piece of typed text can mean, most likely first. Almost always one
 * or none. The exception is four characters such as "NN16": a British grid reference
 * for a 10 km square in the Highlands, and a Maidenhead locator for a square in central
 * Asia. Both are returned, the grid reference first.
 */
export function parseCoordinateReadings(input: string): ParsedCoordinate[] {
  const text = input.trim();
  if (text.length < 3 || text.length > 80) return [];
  const grid = parseGridReadings(text);
  if (grid.length > 0) return grid;
  const first = parseGeoUri(text) ?? parseOsGridRef(text) ?? parseIrishGridRef(text) ?? parseEastingNorthing(text) ?? parseLatLon(text);
  const locator = parseLocator(text);
  return [first, locator].filter((reading) => reading !== null);
}

/**
 * Understands a position typed by hand: decimal degrees ("54.4609, -3.0886"), with
 * hemisphere letters, degrees and decimal minutes, degrees-minutes-seconds, `geo:`
 * links, British National Grid and Irish Grid references, Maidenhead locators, UTM and UPS coordinates
 * and MGRS references. Returns null for
 * anything else, so the caller can treat the text as a place name.
 */
export function parseCoordinates(input: string): ParsedCoordinate | null {
  return parseCoordinateReadings(input)[0] ?? null;
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** "54.46090, -3.08860" */
export function formatDecimal(lat: number, lon: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

function splitAngle(value: number, secondsDigits: number): { degrees: number; minutes: number; seconds: number } {
  const scale = 10 ** secondsDigits;
  // Work in whole units of the smallest step so that rounding can never show 60″.
  const total = Math.round(Math.abs(value) * 3600 * scale);
  const seconds = (total % (60 * scale)) / scale;
  const minutes = Math.floor(total / (60 * scale)) % 60;
  const degrees = Math.floor(total / (3600 * scale));
  return { degrees, minutes, seconds };
}

/** "54°27′39″N 3°05′19″W" */
export function formatDms(lat: number, lon: number, secondsDigits = 0): string {
  const part = (value: number, positive: string, negative: string) => {
    const { degrees, minutes, seconds } = splitAngle(value, secondsDigits);
    const secondsText = seconds.toFixed(secondsDigits).padStart(secondsDigits ? 3 + secondsDigits : 2, "0");
    return `${degrees}°${String(minutes).padStart(2, "0")}′${secondsText}″${value < 0 ? negative : positive}`;
  };
  return `${part(lat, "N", "S")} ${part(lon, "E", "W")}`;
}

/** "54°27.654′N 3°05.316′W" */
export function formatDdm(lat: number, lon: number, minutesDigits = 3): string {
  const part = (value: number, positive: string, negative: string) => {
    const scale = 10 ** minutesDigits;
    const total = Math.round(Math.abs(value) * 60 * scale);
    const degrees = Math.floor(total / (60 * scale));
    const minutes = (total % (60 * scale)) / scale;
    return `${degrees}°${minutes.toFixed(minutesDigits).padStart(3 + minutesDigits, "0")}′${value < 0 ? negative : positive}`;
  };
  return `${part(lat, "N", "S")} ${part(lon, "E", "W")}`;
}

/** `GET /api/maps/height`: the height of the ground at one point, read from the terrain installed. */
export interface PointHeight {
  at: { lat: number; lon: number };
  /** Metres above sea level as the terrain gives it, to a tenth of a metre; null where no installed terrain covers the point. */
  heightMeters: number | null;
  /** How wide the terrain cell the height was read from is, in metres; null with no height. */
  cellMeters: number | null;
}

// ── Outlines as areas ──────────────────────────────────────────────────────

type Ring = ReadonlyArray<ArrayLike<number | undefined>>;

/** Whether a point lies inside a ring (even-odd rule, longitude and latitude taken as a plane). */
function insideRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = [ring[i]![0], ring[i]![1]] as [number, number];
    const [xj, yj] = [ring[j]![0], ring[j]![1]] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * An outline's closed rings, gathered into areas: the rings of a polygon as Outpost keeps
 * them (outer first, then any holes, then the next polygon's) are kept as lines, so which
 * is a hole is read back from where they lie. A ring inside an area, and not inside one of
 * its holes, is a hole of it; any other ring starts a new area (an island in a lake is an
 * area of its own). Rings of fewer than four positions are not areas and are left out.
 */
export function outlineAreas<P extends ArrayLike<number | undefined>>(rings: ReadonlyArray<ReadonlyArray<P>>): P[][][] {
  const areas: P[][][] = [];
  for (const ring of rings) {
    if (ring.length < 4) continue;
    const [lon, lat] = [ring[0]![0], ring[0]![1]] as [number, number];
    const home = areas.find(
      ([outer, ...holes]) => insideRing(lon, lat, outer as Ring) && !holes.some((hole) => insideRing(lon, lat, hole as Ring)),
    );
    if (home) home.push([...ring]);
    else areas.push([[...ring]]);
  }
  return areas;
}

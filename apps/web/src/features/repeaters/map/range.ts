/**
 * A repeater's estimated range on the map, apart from React: what this device
 * remembers about it, the heights the estimate is made with, the ground in sight as a
 * shaded picture with rings round it, and the result said in a few short sentences.
 *
 * The viewshed itself is worked out on the server (`GET /api/maps/sight-range`) from
 * installed terrain; see `radio-range.ts` in the shared package for the sums.
 */

import type { Bbox } from "@outpost/shared";
import {
  compassWords,
  destinationPoint,
  RANGE_DEFAULT_AERIAL_METERS,
  RANGE_MAX_HEIGHT_METERS,
  RANGE_STATIONS,
  type RangeGrid,
  type RangeStationId,
  rangeGrid,
  rangeSampleIndex,
  type SightRange,
  typicalRangeMeters,
} from "@outpost/shared";
import { MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
import { paintShade, rgbOf, type ShadePicture } from "@/features/maps/map/shades";
import { formatHeight as formatFineHeight } from "@/lib/heights";
import { formatNumber } from "@/lib/utils";

export const RANGE_SOURCE = "o-range";
export const RANGE_KEY = "outpost.maps.repeaters.range";

/** At most this many ranges are shown at once: each is asked of the server and drawn, and more would be hard to tell apart. */
export const RANGE_MOST = 8;
/**
 * What this device remembers: the repeaters whose range is shown, the other station,
 * and the aerial height assumed where a list gives none. The station and the assumed
 * height apply to every range shown.
 */
export interface RangePrefs {
  chosen: string[];
  station: RangeStationId;
  assumedAerial: number;
}

export const DEFAULT_RANGE_PREFS: RangePrefs = { chosen: [], station: "handheld", assumedAerial: RANGE_DEFAULT_AERIAL_METERS };

const isStation = (value: unknown): value is RangeStationId => RANGE_STATIONS.some((station) => station.id === value);
const isHeight = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= RANGE_MAX_HEIGHT_METERS;

export function isRangePrefs(value: unknown): value is RangePrefs {
  if (!value || typeof value !== "object") return false;
  const prefs = value as Partial<RangePrefs>;
  return (
    Array.isArray(prefs.chosen) &&
    prefs.chosen.length <= RANGE_MOST &&
    prefs.chosen.every((id) => typeof id === "string") &&
    new Set(prefs.chosen).size === prefs.chosen.length &&
    isStation(prefs.station) &&
    isHeight(prefs.assumedAerial)
  );
}

/**
 * What is stored, made into the present shape. The first shape had one switch for the
 * device (`on`) in place of the repeaters chosen: its station and assumed height are kept,
 * and a range that was on is taken as none chosen, since it was never said for which.
 */
export function migrateRangePrefs(value: unknown): RangePrefs {
  if (isRangePrefs(value)) return value;
  const old = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    chosen: [],
    station: isStation(old.station) ? old.station : DEFAULT_RANGE_PREFS.station,
    assumedAerial: isHeight(old.assumedAerial) ? old.assumedAerial : DEFAULT_RANGE_PREFS.assumedAerial,
  };
}

export const stationOf = (id: RangeStationId) => RANGE_STATIONS.find((station) => station.id === id) ?? RANGE_STATIONS[0];

/** The repeater's aerial height: as its list gives it, or the height assumed on this device where it gives none. */
export function aerialOf(antennaMeters: number | null, prefs: RangePrefs): { meters: number; listed: boolean } {
  return antennaMeters === null ? { meters: prefs.assumedAerial, listed: false } : { meters: antennaMeters, listed: true };
}

// ── Saying it ───────────────────────────────────────────────────────────────

const METERS_PER_MILE = 1609.344;

/**
 * A reach, no finer than the estimate is good for: whole kilometres from 10 km, half
 * kilometres below that, hundreds of metres below 1 km; miles beside it, as roughly.
 */
export function formatReach(meters: number): string {
  if (meters < 950) return `${Math.max(100, Math.round(meters / 100) * 100)} m`;
  const km = meters / 1000;
  const shown = km >= 10 ? Math.round(km) : Math.round(km * 2) / 2;
  const miles = meters / METERS_PER_MILE;
  const roughMiles = miles >= 10 ? Math.round(miles) : Math.round(miles * 2) / 2;
  return `${formatNumber(shown)} km (${formatNumber(roughMiles)} mi)`;
}

/** A reach as `formatReach` gives it, without the miles: for the card folded to one line. */
export const formatKm = (meters: number) => formatReach(meters).replace(/ \(.*\)$/, "");

/** An aerial's height above the ground: to a tenth of a metre below 10 m and whole metres above, or to the foot (`@/lib/heights`). */
export function formatHeight(meters: number): string {
  return formatFineHeight(meters, "fine");
}

/** A share of the ground as a person says it: "none", "under 1%", "12%", "all". */
export function formatShare(share: number): string {
  if (share <= 0) return "none";
  if (share < 0.01) return "under 1%";
  if (share >= 0.995) return "all";
  return `${Math.round(share * 100)}%`;
}

/** The share of the ground within a distance that is in sight, or null where none of it is known. */
export function shareWithin(range: SightRange, meters: number): number | null {
  return range.shares.find((share) => share.withinMeters === meters)?.share ?? null;
}

/** The furthest ground in sight: how far, in which direction, and how wide the opening it is seen through. */
export function furthestOf(range: SightRange): { meters: number; bearingDeg: number; widthDeg: number } | null {
  const { bearings } = range;
  if (bearings.length === 0) return null;
  let best = 0;
  for (let index = 1; index < bearings.length; index += 1)
    if (bearings[index]!.furthestMeters > bearings[best]!.furthestMeters) best = index;
  const meters = bearings[best]!.furthestMeters;
  if (meters <= 0) return null;
  // The bearings either side that see at least half as far: the width of the opening.
  const far = (index: number) => bearings[(index + bearings.length) % bearings.length]!.furthestMeters >= meters / 2;
  let right = 0;
  while (right + 1 < bearings.length && far(best + right + 1)) right += 1;
  let left = 0;
  while (left + right + 1 < bearings.length && far(best - left - 1)) left += 1;
  return { meters, bearingDeg: bearings[best]!.bearingDeg, widthDeg: ((1 + left + right) * 360) / bearings.length };
}

/**
 * The typical range: the median over the bearings of the furthest ground in sight on each (`typicalRangeMeters`).
 * From the answer, or worked out here for an answer kept from before the server gave it. Null with no terrain.
 */
export function typicalOf(range: SightRange): number | null {
  if (range.coverage === "none" || range.bearings.length === 0) return null;
  return range.typicalMeters ?? typicalRangeMeters(range.bearings);
}

/** What "typical" means, in one line under the answer. */
export const TYPICAL_MEANS =
  "Typical is the middle of the furthest ground in sight over all 720 directions: half reach further, half not as far.";

export interface RangeReading {
  coverage: SightRange["coverage"];
  /** The answer in a sentence: how much of the ground near and further out is in sight. */
  title: string;
  /**
   * The typical range and the furthest ground in sight with its direction, in a sentence ("Typical range about 12 km;
   * furthest 31 km to the north-east."); null when no ground is in sight or no terrain is held.
   */
  furthest: string | null;
  /** What typical means, in one line; null when `furthest` is. */
  typicalMeans: string | null;
  /** The answer in a few words, for the card folded to one line. */
  short: string;
  /** What the shading rests on, when that is less than the terrain all round: one short sentence, said beside the answer. */
  note: string | null;
  /** What else is worth knowing, shortest first: said behind the disclosure. */
  sentences: string[];
  /** Where terrain could be got, when there is too little of it. */
  needsTerrain: boolean;
}

/**
 * How far to trust the shading, said in both range cards. From the check against GDAL's viewshed and a 5 m walk over
 * the same terrain at four places (docs/radio.md, "How accurate it is").
 */
export const RANGE_ACCURACY =
  "How close it is: over the terrain held, the share of ground in sight is within about 1.5 percentage points of a careful reading, and errs on the generous side; the edge of the shading is good to a sample or two. Trees and buildings are not in the terrain, so expect less in practice, often much less in a town or a wood.";

/** `where` says where the aerial is, for the one sentence that names it: a repeater, or a point chosen on the map ("here"). */
export function readRange(range: SightRange, where: "repeater" | "here" = "repeater"): RangeReading {
  const max = formatReach(range.maxMeters);
  if (range.coverage === "none") {
    const horizon = Math.min(range.horizonMeters, range.maxMeters);
    return {
      coverage: "none",
      title: `Without terrain: the smooth-Earth radio horizon, about ${formatReach(horizon)}.`,
      furthest: null,
      typicalMeans: null,
      short: `No terrain: about ${formatKm(horizon)}`,
      note: "No terrain is held here, so it is a plain circle.",
      sentences: [
        `No terrain is held ${where === "here" ? "here" : "under this repeater"}, so the circle is drawn as if the ground were flat all round. Hills will cut it short in places and stretch it in others.`,
      ],
      needsTerrain: true,
    };
  }
  const near = shareWithin(range, 10_000);
  const mid = shareWithin(range, 25_000);
  const said = (share: number | null) => (share === null ? "not known" : formatShare(share));
  const title =
    near === null && mid === null
      ? "No terrain is held around here to say what is in sight."
      : `In sight: ${said(near)} of the ground within 10 km, ${said(mid)} within 25 km.`;
  const far = furthestOf(range);
  const gap = far && far.widthDeg <= 6 ? `, through a gap about ${Math.max(1, Math.round(far.widthDeg))}° wide` : "";
  const typical = typicalOf(range) ?? 0;
  const farWordsLong = far ? `furthest ${formatKm(far.meters)} to the ${compassWords(far.bearingDeg)}${gap}` : "";
  const furthest = !far
    ? null
    : typical > 0
      ? `Typical range about ${formatKm(typical)}; ${farWordsLong}.`
      : `In most directions no ground is in sight; ${farWordsLong}.`;

  const sentences: string[] = [];
  const cut = range.bearings.filter((bearing) => bearing.limit === "terrain").length;
  if (range.coverage === "partial") {
    sentences.push(
      cut > 0
        ? `Terrain is held for only part of the area within ${max}. On ${cut} of ${range.bearings.length} bearings it runs out while the ground is still in sight, so more may be in sight beyond.`
        : `Terrain is held for only part of the area within ${max}. Where none is held, high ground further out could be in sight.`,
    );
  }
  const capped = range.bearings.filter((bearing) => bearing.limit === "max").length;
  if (capped > 0)
    sentences.push(
      `On ${capped} ${capped === 1 ? "bearing" : "bearings"} ground is still in sight at ${max}, where the estimate stops looking.`,
    );
  const partial = range.coverage === "partial";
  const nearWords = near === null ? null : `${formatShare(near)} in sight within 10 km`;
  const farWords = far
    ? `${typical > 0 ? `typical ${formatKm(typical)}, ` : ""}furthest ${formatKm(far.meters)} ${compassWords(far.bearingDeg)}`
    : "nothing further in sight";
  return {
    coverage: range.coverage,
    title,
    furthest,
    typicalMeans: far && typical > 0 ? TYPICAL_MEANS : null,
    short: [
      nearWords ? `${nearWords.charAt(0).toUpperCase()}${nearWords.slice(1)}` : null,
      nearWords ? farWords : `In sight: ${farWords}`,
      partial ? "terrain partial" : null,
    ]
      .filter(Boolean)
      .join(", "),
    note: partial ? `Terrain covers only part of the area within ${max}.` : null,
    sentences,
    needsTerrain: partial,
  };
}

/** How the ground was read, in one sentence: the steps and the size of the terrain's cells. */
export function describeRangeTerrain(range: SightRange): string | null {
  if (!range.terrain) return null;
  const cells = (meters: number) => `${formatNumber(Math.round(meters / 10) * 10)} m`;
  const { finestCellMeters: finest, coarsestCellMeters: coarsest } = range.terrain;
  const size = cells(finest) === cells(coarsest) ? `about ${cells(finest)}` : `from about ${cells(finest)} to ${cells(coarsest)}`;
  let from = 0;
  const steps = range.bands.map((band) => {
    const words = `every ${band.stepMeters} m ${from === 0 ? "out to" : "to"} ${formatNumber(band.toMeters / 1000)} km`;
    from = band.toMeters;
    return words;
  });
  const listed = steps.length > 1 ? `${steps.slice(0, -1).join(", ")} and ${steps.at(-1)}` : (steps[0] ?? "");
  return `Ground read along ${formatNumber(range.bearingCount)} bearings, ${formatNumber(360 / Math.max(1, range.bearingCount))}° apart: ${listed}, from installed terrain whose cells are ${size} wide.`;
}

// ── On the map ──────────────────────────────────────────────────────────────

/** The rings drawn round a range, and in the disc of the why view. */
export const RANGE_RINGS = [10_000, 25_000, 50_000, 100_000] as const;
/**
 * How solid the shading of the ground in sight is: the map's names, roads and coast still show through it. With the
 * edge drawn round it (`rangeEdges`), it reads on the light, dark and satellite maps and every map style at phone
 * size in sunlight; at the 0.42 it once was, specks and narrow fingers of ground in sight were lost in hill shading.
 */
export const RANGE_SHADE_OPACITY = 0.55;

const EARTH = 6_371_008.8;
const DEG = Math.PI / 180;

/** How far out the shading reaches: the furthest ground in sight, or the smooth-Earth horizon with no terrain. */
export function rangeExtent(range: SightRange): number {
  if (range.coverage === "none") return Math.min(range.horizonMeters, range.maxMeters);
  return Math.max(0, ...range.bearings.map((bearing) => bearing.furthestMeters));
}

/**
 * The rings that are drawn: each one out to the first that reaches round all the ground in sight, and none beyond it.
 * With the furthest ground in sight 31 km out, 10, 25 and 50 km; never 100 km for a range that ends far short of it.
 */
export function ringsFor(extentMeters: number): number[] {
  const enclosing = RANGE_RINGS.findIndex((ring) => ring >= extentMeters);
  return RANGE_RINGS.slice(0, enclosing === -1 ? RANGE_RINGS.length : enclosing + 1);
}

const circle = (range: SightRange, meters: number, steps = 180): Array<[number, number]> =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const at = destinationPoint(range.at, (index * 360) / steps, meters);
    return [Number(at.lon.toFixed(6)), Number(at.lat.toFixed(6))];
  });

/**
 * The rings, their distances, the typical-range circle and its distance, and (with no terrain) the plain circle of
 * the smooth-Earth horizon, as map data.
 */
/** `name` (a repeater's callsign) goes with each range's features, so that what is drawn can be told apart; it is not written on the map. */
export function rangesData(ranges: Array<{ range: SightRange; name?: string }>): FeatureCollection {
  return { type: "FeatureCollection", features: ranges.flatMap(({ range, name }) => rangeData(range, name).features) };
}

export function rangeData(range: SightRange | undefined, name = ""): FeatureCollection {
  if (!range) return { type: "FeatureCollection", features: [] };
  const features: FeatureCollection["features"] = [];
  if (range.coverage === "none") {
    const ring = circle(range, rangeExtent(range), 96);
    features.push({ type: "Feature", properties: { kind: "area", name }, geometry: { type: "Polygon", coordinates: [ring] } });
    features.push({
      type: "Feature",
      properties: { kind: "ring", dashed: true, name },
      geometry: { type: "LineString", coordinates: ring },
    });
    return { type: "FeatureCollection", features };
  }
  if (rangeExtent(range) <= 0) return { type: "FeatureCollection", features };
  const edges = rangeEdges(range);
  if (edges.length > 0)
    features.push({ type: "Feature", properties: { kind: "seen-edge", name }, geometry: { type: "MultiLineString", coordinates: edges } });
  for (const meters of ringsFor(rangeExtent(range))) {
    features.push({
      type: "Feature",
      properties: { kind: "ring", dashed: false, name },
      geometry: { type: "LineString", coordinates: circle(range, meters) },
    });
    const top = destinationPoint(range.at, 0, meters);
    features.push({
      type: "Feature",
      properties: { kind: "ring-label", name, label: `${formatNumber(meters / 1000)} km` },
      geometry: { type: "Point", coordinates: [top.lon, top.lat] },
    });
  }
  const typical = typicalOf(range);
  if (typical && typical > 0) {
    features.push({
      type: "Feature",
      properties: { kind: "typical", name },
      geometry: { type: "LineString", coordinates: circle(range, typical) },
    });
    // Written once, at the south, clear of the rings' distances at the north.
    const bottom = destinationPoint(range.at, 180, typical);
    features.push({
      type: "Feature",
      properties: { kind: "typical-label", name, label: `Typical ${formatKm(typical)}` },
      geometry: { type: "Point", coordinates: [bottom.lon, bottom.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

// ── What is shown, for a printed page ──────────────────────────────────────

let shown: Array<{ range: SightRange; name?: string }> = [];

/** The ranges drawn on the map on screen now, kept for "Print or save as PDF" (print/overlays.ts). */
export function setRangesShown(ranges: Array<{ range: SightRange; name?: string }>): void {
  shown = ranges;
}

export function rangesShown(): Array<{ range: SightRange; name?: string }> {
  return shown;
}

/** The box the shading and its rings fill, to bring them into view. */
export function rangeBounds(range: SightRange): Bbox {
  return boxAround(range, Math.max(500, rangeExtent(range)));
}

const boxAround = (range: SightRange, meters: number): Bbox => {
  const lat = meters / EARTH / DEG;
  const lon = lat / Math.max(0.05, Math.cos(range.at.lat * DEG));
  return [range.at.lon - lon, range.at.lat - lat, range.at.lon + lon, range.at.lat + lat];
};

/** The share of the ground in sight the map is fitted round when a range is first shown. */
const FIT_SHARE = 0.9;

/**
 * The box the map is fitted round when a range is first shown: round nine tenths of the ground in sight (and at least
 * 1.5 km), not round the furthest. Fitted round the furthest, one glen in sight 30 km out shrank the patch round the
 * aerial, which is most of the answer, to a few pixels on a phone. The rings and the card say how far the rest goes.
 */
export function rangeFitBounds(range: SightRange): Bbox {
  if (range.coverage === "none" || range.bearingCount === 0) return rangeBounds(range);
  const grid = rangeGrid(range);
  const { distances } = grid;
  const seenAt = new Float64Array(distances.length);
  let total = 0;
  for (let i = 0; i < distances.length; i += 1) {
    let count = 0;
    for (let b = 0; b < grid.bearingCount; b += 1) if (grid.seen(b, i)) count += 1;
    // The ground a sample stands for grows with its distance and the step around it.
    const weight = count * distances[i]! * ((distances[i + 1] ?? distances[i]!) - (distances[i - 1] ?? 0));
    seenAt[i] = weight;
    total += weight;
  }
  if (total <= 0) return rangeBounds(range);
  let sum = 0;
  let meters = rangeExtent(range);
  for (let i = 0; i < distances.length; i += 1) {
    sum += seenAt[i]!;
    if (sum >= FIT_SHARE * total) {
      meters = distances[i]!;
      break;
    }
  }
  return boxAround(range, Math.min(Math.max(500, rangeExtent(range)), Math.max(1_500, meters)));
}

/**
 * Whether ground a distance away along a bearing is in sight, from 0 to 1: between two bearings the two are blended,
 * so that the shading's edge is smooth rather than stepped. Any bearing and distance; 0 beyond what was looked at.
 */
export function seenAt(range: SightRange, grid: RangeGrid, bearingDeg: number, meters: number): number {
  if (meters > range.maxMeters) return 0;
  const position = ((((bearingDeg % 360) + 360) % 360) * grid.bearingCount) / 360;
  const first = Math.floor(position);
  const blend = position - first;
  const index = Math.max(0, rangeSampleIndex(meters, range.bands));
  const a = grid.seen(first, index) ? 1 : 0;
  const b = grid.seen(first + 1, index) ? 1 : 0;
  return a * (1 - blend) + b * blend;
}

/**
 * The ground in sight as a picture to lay over the map: in sight shaded in the range's colour, hidden ground clear.
 * Null when nothing is in sight, or with no terrain (the plain circle is drawn as a shape).
 */
export function rangeShade(range: SightRange, colour: string, pixels = 1536): ShadePicture | null {
  if (range.coverage === "none" || range.bearingCount === 0) return null;
  const extent = rangeExtent(range);
  if (extent <= 0) return null;
  const grid = rangeGrid(range);
  const [west, south, east, north] = rangeBounds(range);
  const [r, g, b] = rgbOf(colour);
  const { lat: lat0, lon: lon0 } = range.at;
  const reach = extent + 300;
  return paintShade({ west, south, east, north }, { pixels, finestMeters: 20 }, (lat, lon, out, offset) => {
    const dy = (lat - lat0) * DEG * EARTH;
    const dx = (lon - lon0) * DEG * EARTH * Math.cos(((lat + lat0) / 2) * DEG);
    const meters = Math.hypot(dx, dy);
    if (meters > reach) return;
    const seen = seenAt(range, grid, Math.atan2(dx, dy) / DEG, meters);
    if (seen <= 0) return;
    out[offset] = r;
    out[offset + 1] = g;
    out[offset + 2] = b;
    out[offset + 3] = Math.round(255 * seen);
  });
}

/** How many squares across the edge is traced in: fine enough to follow a glen, few enough to stay quick. */
const EDGE_CELLS = 640;

/**
 * The edge of the ground in sight, as short lines to draw over the shading, so that its shape reads however busy the
 * map beneath is (hill shading, woods, satellite imagery) and a small patch in sight is not lost. Traced by marching
 * squares over the same in-sight values the picture is painted from, where they cross one half, on a lattice laid on
 * the map's own projection over the box the picture fills. Empty with no terrain (the plain circle has its own line).
 */
export function rangeEdges(range: SightRange, cells = EDGE_CELLS): Array<[[number, number], [number, number]]> {
  if (range.coverage === "none" || range.bearingCount === 0) return [];
  const extent = rangeExtent(range);
  if (extent <= 0) return [];
  const grid = rangeGrid(range);
  const [west, south, east, north] = rangeBounds(range);
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
  const top = mercator(north);
  const spanY = top - mercator(south);
  const { lat: lat0, lon: lon0 } = range.at;
  const reach = extent + 300;
  const size = cells + 1;
  const lons = new Float64Array(size);
  const lats = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    lons[i] = west + (i / cells) * (east - west);
    lats[i] = (2 * Math.atan(Math.exp(top - (i / cells) * spanY)) - Math.PI / 2) / DEG;
  }
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const dy = (lats[y]! - lat0) * DEG * EARTH;
    const across = Math.cos(((lats[y]! + lat0) / 2) * DEG);
    for (let x = 0; x < size; x += 1) {
      const dx = (lons[x]! - lon0) * DEG * EARTH * across;
      const meters = Math.hypot(dx, dy);
      values[y * size + x] = meters > reach ? 0 : seenAt(range, grid, Math.atan2(dx, dy) / DEG, meters);
    }
  }
  const round = (value: number) => Number(value.toFixed(6));
  // A point on a lattice edge, where the value crosses one half between its two ends.
  const cross = (x0: number, y0: number, x1: number, y1: number): [number, number] => {
    const a = values[y0 * size + x0]!;
    const b = values[y1 * size + x1]!;
    const t = a === b ? 0.5 : Math.min(1, Math.max(0, (0.5 - a) / (b - a)));
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const lon = west + (x / cells) * (east - west);
    const lat = (2 * Math.atan(Math.exp(top - (y / cells) * spanY)) - Math.PI / 2) / DEG;
    return [round(lon), round(lat)];
  };
  const lines: Array<[[number, number], [number, number]]> = [];
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const tl = values[y * size + x]! >= 0.5 ? 1 : 0;
      const tr = values[y * size + x + 1]! >= 0.5 ? 1 : 0;
      const br = values[(y + 1) * size + x + 1]! >= 0.5 ? 1 : 0;
      const bl = values[(y + 1) * size + x]! >= 0.5 ? 1 : 0;
      const corners = tl * 8 + tr * 4 + br * 2 + bl;
      if (corners === 0 || corners === 15) continue;
      const topEdge = () => cross(x, y, x + 1, y);
      const right = () => cross(x + 1, y, x + 1, y + 1);
      const bottom = () => cross(x, y + 1, x + 1, y + 1);
      const left = () => cross(x, y, x, y + 1);
      switch (corners) {
        case 1:
        case 14:
          lines.push([left(), bottom()]);
          break;
        case 2:
        case 13:
          lines.push([bottom(), right()]);
          break;
        case 3:
        case 12:
          lines.push([left(), right()]);
          break;
        case 4:
        case 11:
          lines.push([topEdge(), right()]);
          break;
        case 6:
        case 9:
          lines.push([topEdge(), bottom()]);
          break;
        case 7:
        case 8:
          lines.push([left(), topEdge()]);
          break;
        case 5:
          lines.push([left(), topEdge()], [bottom(), right()]);
          break;
        case 10:
          lines.push([topEdge(), right()], [left(), bottom()]);
          break;
      }
    }
  }
  return lines;
}

/**
 * What the map draws beside the shading: grey rings at 10, 25, 50 and 100 km, out to the first beyond the furthest
 * ground in sight, thin and cased in the page colour so that they read on the plain map, on satellite imagery and in
 * the dark theme, each written once with its distance; over them the typical range, dashed and heavier in a hue of its
 * own (`--map-range-typical`), cased the same way and written once at the south. With no terrain, the plain circle of
 * the smooth-Earth horizon, washed and dashed in the range's colour.
 */
export function rangeLayers(theme: MapTheme): LayerSpecification[] {
  const ring = ["==", ["get", "kind"], "ring"];
  return [
    {
      id: "o-range-area",
      type: "fill",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "area"],
      paint: { "fill-color": theme.range, "fill-opacity": 0.18 },
    },
    {
      id: "o-range-edge-casing",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "seen-edge"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.page, "line-width": 4, "line-opacity": 0.75 },
    },
    {
      id: "o-range-edge",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "seen-edge"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.range, "line-width": 2 },
    },
    {
      id: "o-range-casing",
      type: "line",
      source: RANGE_SOURCE,
      filter: ring as never,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.page, "line-width": 3.5, "line-opacity": 0.6 },
    },
    {
      id: "o-range-ring",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["all", ring, ["!", ["get", "dashed"]]] as never,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.inkMuted, "line-width": 1.25, "line-opacity": 0.85 },
    },
    {
      id: "o-range-ring-dashed",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["all", ring, ["get", "dashed"]] as never,
      layout: { "line-join": "round" },
      paint: { "line-color": theme.range, "line-width": 1.75, "line-opacity": 0.9, "line-dasharray": [3, 2] },
    },
    {
      id: "o-range-typical-casing",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "typical"],
      layout: { "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": 5, "line-opacity": 0.75 },
    },
    {
      id: "o-range-typical",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "typical"],
      layout: { "line-join": "round" },
      // Dashed, and heavier than the rings: told from the solid edge and rings by form too, as in the night style, where every line is red.
      paint: { "line-color": theme.rangeTypical, "line-width": 2.5, "line-dasharray": [4, 2] },
    },
    {
      id: "o-range-label",
      type: "symbol",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "ring-label"],
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 11.5,
        "text-anchor": "bottom",
        "text-offset": [0, -0.2],
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
    {
      id: "o-range-typical-label",
      type: "symbol",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "typical-label"],
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 0.35],
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.8 },
    },
  ];
}

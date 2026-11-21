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

export interface RangeReading {
  coverage: SightRange["coverage"];
  /** The answer in a sentence: how much of the ground near and further out is in sight. */
  title: string;
  /** The furthest ground in sight and its direction, in a sentence; null when no ground is in sight or no terrain is held. */
  furthest: string | null;
  /** The answer in a few words, for the card folded to one line. */
  short: string;
  /** What the shading rests on, when that is less than the terrain all round: one short sentence, said beside the answer. */
  note: string | null;
  /** What else is worth knowing, shortest first: said behind the disclosure. */
  sentences: string[];
  /** Where terrain could be got, when there is too little of it. */
  needsTerrain: boolean;
}

/** `where` says where the aerial is, for the one sentence that names it: a repeater, or a point chosen on the map ("here"). */
export function readRange(range: SightRange, where: "repeater" | "here" = "repeater"): RangeReading {
  const max = formatReach(range.maxMeters);
  if (range.coverage === "none") {
    const horizon = Math.min(range.horizonMeters, range.maxMeters);
    return {
      coverage: "none",
      title: `Without terrain: the smooth-Earth radio horizon, about ${formatReach(horizon)}.`,
      furthest: null,
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
  const furthest = far
    ? `The furthest ground in sight is ${formatReach(far.meters)} away to the ${compassWords(far.bearingDeg)}${gap}.`
    : null;

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
  const farWords = far ? `furthest ${formatKm(far.meters)} ${compassWords(far.bearingDeg)}` : "nothing further in sight";
  return {
    coverage: range.coverage,
    title,
    furthest,
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
/** How solid the shading of the ground in sight is: the map's names, roads and coast still show through it. */
export const RANGE_SHADE_OPACITY = 0.42;

const EARTH = 6_371_008.8;
const DEG = Math.PI / 180;

/** How far out the shading reaches: the furthest ground in sight, or the smooth-Earth horizon with no terrain. */
export function rangeExtent(range: SightRange): number {
  if (range.coverage === "none") return Math.min(range.horizonMeters, range.maxMeters);
  return Math.max(0, ...range.bearings.map((bearing) => bearing.furthestMeters));
}

/** The rings that are drawn: each one out to the first that reaches round all the ground in sight. */
export function ringsFor(extentMeters: number): number[] {
  const enclosing = RANGE_RINGS.findIndex((ring) => ring >= extentMeters);
  return RANGE_RINGS.slice(0, enclosing === -1 ? RANGE_RINGS.length : enclosing + 1);
}

const circle = (range: SightRange, meters: number, steps = 180): Array<[number, number]> =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const at = destinationPoint(range.at, (index * 360) / steps, meters);
    return [Number(at.lon.toFixed(6)), Number(at.lat.toFixed(6))];
  });

/** The rings, their distances, and (with no terrain) the plain circle of the smooth-Earth horizon, as map data. */
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
  return { type: "FeatureCollection", features };
}

/** The box the shading and its rings fill, to bring them into view. */
export function rangeBounds(range: SightRange): Bbox {
  const extent = Math.max(500, rangeExtent(range));
  const lat = extent / EARTH / DEG;
  const lon = lat / Math.max(0.05, Math.cos(range.at.lat * DEG));
  return [range.at.lon - lon, range.at.lat - lat, range.at.lon + lon, range.at.lat + lat];
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

/**
 * What the map draws beside the shading: rings at 10, 25, 50 and 100 km in the range's colour, cased in the page
 * colour so that they read on the plain map, on satellite imagery and in the dark theme; each written once with its
 * distance. With no terrain, the plain circle of the smooth-Earth horizon, washed and dashed.
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
      paint: { "line-color": theme.range, "line-width": 1.25, "line-opacity": 0.9 },
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
  ];
}

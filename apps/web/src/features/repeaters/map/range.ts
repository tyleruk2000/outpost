/**
 * A repeater's estimated range on the map, apart from React: what this device
 * remembers about it, the heights the estimate is made with, the outline as map data
 * and layers, and the result said in a few short sentences.
 *
 * The outline itself is worked out on the server (`GET /api/maps/sight-range`) from
 * installed terrain; see `radio-range.ts` in the shared package for the sums.
 */

import type { Bbox } from "@outpost/shared";
import {
  destinationPoint,
  RANGE_DEFAULT_AERIAL_METERS,
  RANGE_MAX_HEIGHT_METERS,
  RANGE_STATIONS,
  type RangeStationId,
  type SightRange,
} from "@outpost/shared";
import { MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
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

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export interface RangeReading {
  coverage: SightRange["coverage"];
  /** The answer in a sentence. */
  title: string;
  /** The answer in a few words, for the card folded to one line. */
  short: string;
  /** What the outline rests on, when that is less than the terrain all round: one short sentence, said beside the answer. */
  note: string | null;
  /** What else is worth knowing about this outline, shortest first: said behind the disclosure. */
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
      short: `No terrain: about ${formatKm(horizon)}`,
      note: "No terrain is held here, so it is a plain circle.",
      sentences: [
        `No terrain is held ${where === "here" ? "here" : "under this repeater"}, so the circle is drawn as if the ground were flat all round. Hills will cut it short in places and stretch it in others.`,
      ],
      needsTerrain: true,
    };
  }
  const reaches = range.bearings.map((bearing) => bearing.reachMeters);
  const typical = median(reaches);
  const least = Math.min(...reaches);
  const most = Math.max(...reaches);
  const sentences: string[] = [];
  const spread = formatReach(least) === formatReach(most) ? "" : `, from ${formatReach(least)} to ${formatReach(most)}`;
  const title = `In sight to about ${formatReach(typical)} on most bearings${spread}.`;

  const cut = range.bearings.filter((bearing) => bearing.limit === "terrain").length;
  if (range.coverage === "partial") {
    sentences.push(
      cut > 0
        ? `Terrain is held for only part of the area within ${max}. On ${cut} of ${range.bearings.length} bearings it runs out while the aerial is still in sight, so the outline stops short there and is dashed.`
        : `Terrain is held for only part of the area within ${max}. The outline itself is complete, but where none is held, high ground further out could be in sight.`,
    );
  }
  const capped = range.bearings.filter((bearing) => bearing.limit === "max").length;
  if (capped > 0)
    sentences.push(
      `On ${capped} ${capped === 1 ? "bearing" : "bearings"} it is still in sight at ${max}, where the estimate stops looking.`,
    );
  const share = range.hiddenShare ?? 0;
  if (share >= 0.05) {
    sentences.push(`About ${Math.round(share * 20) * 5}% of the ground inside the outline is hidden from the aerial by nearer ground.`);
  }
  const further = range.bearings.filter((bearing) => bearing.furtherMeters !== null);
  if (further.length > 0) {
    const furthest = Math.max(...further.map((bearing) => bearing.furtherMeters!));
    sentences.push(
      `Higher ground beyond the outline is in sight again on ${further.length} ${further.length === 1 ? "bearing" : "bearings"}, up to ${formatReach(furthest)} away.`,
    );
  }
  const partial = range.coverage === "partial";
  // A few words that do not hide a spike: where most bearings end, and the furthest (or the nearest, when none goes further).
  const [km, far, near] = [formatKm(typical), formatKm(most), formatKm(least)];
  const tail = far !== km ? `, up to ${far}` : near !== km ? `, down to ${near}` : "";
  return {
    coverage: range.coverage,
    title,
    short: partial
      ? `${tail ? `Mostly ${km}${tail}` : `About ${km}`}, terrain partial`
      : tail
        ? `Mostly about ${km}${tail}`
        : `In sight to about ${km}`,
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
  return `Ground read every ${range.nearStepMeters} m out to ${formatNumber(range.nearMeters / 1000)} km and every ${range.farStepMeters} m beyond, from installed terrain whose cells are ${size} wide.`;
}

// ── On the map ──────────────────────────────────────────────────────────────

type Ring = Array<[number, number]>;

/** The outline's points, one per bearing, closed; and for each side, whether it is dashed (terrain ran out at either end). */
function outlineOf(range: SightRange): { ring: Ring; dashed: boolean[] } {
  const point = (bearing: number, meters: number): [number, number] => {
    const at = destinationPoint(range.at, bearing, Math.max(meters, 50));
    return [Number(at.lon.toFixed(6)), Number(at.lat.toFixed(6))];
  };
  if (range.coverage === "none") {
    // The smooth-Earth horizon: a plain circle, dashed all round, because no terrain shaped it.
    const radius = Math.min(range.horizonMeters, range.maxMeters);
    const steps = 96;
    const ring = Array.from({ length: steps + 1 }, (_, index) => point((index * 360) / steps, radius));
    return { ring, dashed: Array.from({ length: steps }, () => true) };
  }
  const { bearings } = range;
  const ring = [...bearings, bearings[0]!].map((bearing) => point(bearing.bearingDeg, bearing.reachMeters));
  const dashed = bearings.map(
    (bearing, index) => bearing.limit === "terrain" || bearings[(index + 1) % bearings.length]!.limit === "terrain",
  );
  return { ring, dashed };
}

/**
 * Outlines as map data: for each, one shape for the wash, and its edge in runs of solid
 * and dashed line named with the repeater's callsign, which is written along it.
 */
export function rangesData(ranges: Array<{ range: SightRange; name: string }>): FeatureCollection {
  return { type: "FeatureCollection", features: ranges.flatMap(({ range, name }) => rangeData(range, name).features) };
}

/** One outline as map data. */
export function rangeData(range: SightRange | undefined, name = ""): FeatureCollection {
  if (!range) return { type: "FeatureCollection", features: [] };
  const { ring, dashed } = outlineOf(range);
  const features: FeatureCollection["features"] = [
    { type: "Feature", properties: { kind: "area", name }, geometry: { type: "Polygon", coordinates: [ring] } },
  ];
  // Runs of sides that are drawn the same way, so the edge is a few lines rather than one per side.
  let start = 0;
  for (let index = 1; index <= dashed.length; index += 1) {
    if (index < dashed.length && dashed[index] === dashed[start]) continue;
    features.push({
      type: "Feature",
      properties: { kind: "edge", dashed: dashed[start]!, name },
      geometry: { type: "LineString", coordinates: ring.slice(start, index + 1) },
    });
    start = index;
  }
  return { type: "FeatureCollection", features };
}

/** The box the outline fills, to bring it into view. */
export function rangeBounds(range: SightRange): Bbox {
  const { ring } = outlineOf(range);
  const lons = ring.map((point) => point[0]);
  const lats = ring.map((point) => point[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/**
 * The outline as the map draws it: a light wash of the ink colour, and a thin ink edge
 * cased in the page colour like the map's other lines, so that it reads on the plain
 * map, on satellite imagery and in the dark theme alike. No colour of its own: the HF
 * coverage map is shaded cells in hues, the nuclear effects are rings in hues, and this
 * is neither. The repeater's callsign is written along the edge, so that where several
 * are shown each can be told from the others; where they cross, the labels give way to
 * each other rather than overprint, and each line is cased in the page colour.
 */
export function rangeLayers(theme: MapTheme): LayerSpecification[] {
  const edge = ["==", ["get", "kind"], "edge"];
  return [
    {
      id: "o-range-area",
      type: "fill",
      source: RANGE_SOURCE,
      filter: ["==", ["get", "kind"], "area"],
      paint: { "fill-color": theme.ink, "fill-opacity": 0.07 },
    },
    {
      id: "o-range-casing",
      type: "line",
      source: RANGE_SOURCE,
      filter: edge as never,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.page, "line-width": 4.5, "line-opacity": 0.75 },
    },
    {
      id: "o-range-edge",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["all", edge, ["!", ["get", "dashed"]]] as never,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": theme.ink, "line-width": 1.75, "line-opacity": 0.85 },
    },
    {
      id: "o-range-edge-dashed",
      type: "line",
      source: RANGE_SOURCE,
      filter: ["all", edge, ["get", "dashed"]] as never,
      layout: { "line-join": "round" },
      paint: { "line-color": theme.ink, "line-width": 1.75, "line-opacity": 0.85, "line-dasharray": [3, 2] },
    },
    {
      id: "o-range-label",
      type: "symbol",
      source: RANGE_SOURCE,
      filter: edge as never,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 250,
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "name"],
        "text-size": 11.5,
        "text-offset": [0, -0.8],
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
  ];
}

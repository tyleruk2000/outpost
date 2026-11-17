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
import { formatNumber } from "@/lib/utils";

export const RANGE_SOURCE = "o-range";
export const RANGE_KEY = "outpost.maps.repeaters.range";

/** What this device remembers: whether the outline is shown, the other station, and the aerial height assumed where a list gives none. */
export interface RangePrefs {
  on: boolean;
  station: RangeStationId;
  assumedAerial: number;
}

export const DEFAULT_RANGE_PREFS: RangePrefs = { on: false, station: "handheld", assumedAerial: RANGE_DEFAULT_AERIAL_METERS };

export function isRangePrefs(value: unknown): value is RangePrefs {
  if (!value || typeof value !== "object") return false;
  const prefs = value as Partial<RangePrefs>;
  return (
    typeof prefs.on === "boolean" &&
    RANGE_STATIONS.some((station) => station.id === prefs.station) &&
    typeof prefs.assumedAerial === "number" &&
    Number.isFinite(prefs.assumedAerial) &&
    prefs.assumedAerial >= 0 &&
    prefs.assumedAerial <= RANGE_MAX_HEIGHT_METERS
  );
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

/** Heights to a tenth of a metre below 10 m, whole metres above. */
export function formatHeight(meters: number): string {
  return `${meters < 9.95 ? Number(meters.toFixed(1)) : Math.round(meters)} m`;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export interface RangeReading {
  coverage: SightRange["coverage"];
  /** The answer in a sentence. */
  title: string;
  /** What else is worth knowing about this outline, shortest first. */
  sentences: string[];
  /** Where terrain could be got, when there is too little of it. */
  needsTerrain: boolean;
}

export function readRange(range: SightRange): RangeReading {
  const max = formatReach(range.maxMeters);
  if (range.coverage === "none") {
    return {
      coverage: "none",
      title: `Without terrain: the smooth-Earth radio horizon, about ${formatReach(Math.min(range.horizonMeters, range.maxMeters))}.`,
      sentences: [
        "No terrain is held under this repeater, so the circle is drawn as if the ground were flat all round. Hills will cut it short in places and stretch it in others.",
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
  return { coverage: range.coverage, title, sentences, needsTerrain: range.coverage === "partial" };
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

/** The outline as map data: one shape for the wash, and its edge in runs of solid and dashed line. */
export function rangeData(range: SightRange | undefined): FeatureCollection {
  if (!range) return { type: "FeatureCollection", features: [] };
  const { ring, dashed } = outlineOf(range);
  const features: FeatureCollection["features"] = [
    { type: "Feature", properties: { kind: "area" }, geometry: { type: "Polygon", coordinates: [ring] } },
  ];
  // Runs of sides that are drawn the same way, so the edge is a few lines rather than one per side.
  let start = 0;
  for (let index = 1; index <= dashed.length; index += 1) {
    if (index < dashed.length && dashed[index] === dashed[start]) continue;
    features.push({
      type: "Feature",
      properties: { kind: "edge", dashed: dashed[start]! },
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
 * is neither. Its name is written along the edge.
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
        "symbol-spacing": 400,
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": "Estimated range",
        "text-size": 11.5,
        "text-offset": [0, -0.8],
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
  ];
}

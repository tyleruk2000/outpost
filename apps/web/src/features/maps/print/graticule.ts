/**
 * Latitude and longitude along the edges of the printed map: where the ticks go and
 * what is written beside them. In this projection every meridian is a straight vertical
 * line and every parallel a straight horizontal one, so a tick on one edge and the tick
 * opposite it mark the two ends of a line of the graticule, and a ruler laid across
 * the sheet between them gives a position anywhere on it.
 *
 * Pure arithmetic.
 */
import type { Bbox } from "@outpost/shared";
import type { FeatureCollection } from "../map/overlays";
import { mercatorX, mercatorY } from "./scale";

/** How positions are written: as the readout on the map does, apart from grid references, which have no lines here. */
export type GraticuleFormat = "decimal" | "dms";

/** Steps in degrees a sexagesimal graticule may use: whole degrees, then minutes, then seconds. */
const DMS_STEPS = [
  30,
  20,
  10,
  5,
  2,
  1,
  ...[30, 20, 10, 5, 2, 1].map((minutes) => minutes / 60),
  ...[30, 20, 10, 5, 2, 1].map((seconds) => seconds / 3600),
];
/** And a decimal one: 1, 2 and 5 times a power of ten. */
const DECIMAL_STEPS = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001];

export interface Tick {
  /** Degrees: a longitude along the top and bottom, a latitude down the sides. */
  value: number;
  /** Where it falls, as a fraction of the way along the map: from the left for a longitude, from the top for a latitude. */
  at: number;
  label: string;
}

export interface Graticule {
  step: number;
  longitudes: Tick[];
  latitudes: Tick[];
}

/** The room one label needs along an edge, in points. */
const LABEL_ROOM = 62;

function label(value: number, step: number, format: GraticuleFormat, positive: string, negative: string): string {
  const hemisphere = Math.abs(value) < step / 1000 ? "" : value < 0 ? negative : positive;
  if (format === "decimal") {
    const digits = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
    return `${Math.abs(value).toFixed(digits)}°${hemisphere}`;
  }
  // In whole seconds, so that rounding can never write 60 of anything.
  const total = Math.round(Math.abs(value) * 3600);
  const degrees = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  // Plain marks for minutes and seconds: the typographic ones are not in the page's typeface.
  if (step >= 1) return `${degrees}°${hemisphere}`;
  const withMinutes = `${degrees}°${String(minutes).padStart(2, "0")}'`;
  return step * 60 >= 1 - 1e-9 ? `${withMinutes}${hemisphere}` : `${withMinutes}${String(seconds).padStart(2, "0")}"${hemisphere}`;
}

/**
 * The ticks for a map of `bbox` drawn `width` by `height` points. One step is used for
 * both directions, the finest that leaves room between the labels, so that the lines
 * make squares of the same number of degrees each way.
 */
export function graticule(bbox: Bbox, size: { width: number; height: number }, format: GraticuleFormat): Graticule {
  const [west, south, east, north] = bbox;
  const steps = format === "dms" ? DMS_STEPS : DECIMAL_STEPS;
  const left = mercatorX(west);
  const top = mercatorY(north);
  const across = mercatorX(east) - left;
  const down = mercatorY(south) - top;
  // Longitudes are evenly spaced. Latitudes are closest together on the page nearest the equator, so that is where room is checked.
  const pointsPerDegreeAcross = size.width / (east - west);
  const flattest = Math.max(south, Math.min(north, 0));
  const pointsPerDegreeDown = ((mercatorY(flattest - 0.0001) - mercatorY(flattest + 0.0001)) / 0.0002 / down) * size.height;
  const tightest = Math.min(pointsPerDegreeAcross, pointsPerDegreeDown);
  const step = [...steps].reverse().find((candidate) => candidate * tightest >= LABEL_ROOM) ?? steps[0]!;

  const multiples = (low: number, high: number) => {
    const values: number[] = [];
    // Counted in whole steps, so a long run of small steps does not drift.
    for (let index = Math.ceil(low / step - 1e-9); index * step <= high + step * 1e-9; index += 1)
      values.push(Number((index * step).toFixed(9)));
    return values;
  };
  return {
    step,
    longitudes: multiples(west, east).map((value) => ({
      value,
      at: (mercatorX(value) - left) / across,
      label: label(value, step, format, "E", "W"),
    })),
    latitudes: multiples(south, north).map((value) => ({
      value,
      at: (mercatorY(value) - top) / down,
      label: label(value, step, format, "N", "S"),
    })),
  };
}

/** The same lines as map data: one from edge to edge for every tick, for the overlay that draws them across the map. */
export function graticuleLines(bbox: Bbox, ticks: Graticule): FeatureCollection {
  const [west, south, east, north] = bbox;
  const line = (coordinates: Array<[number, number]>) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString", coordinates },
  });
  return {
    type: "FeatureCollection",
    features: [
      ...ticks.longitudes.map((tick) =>
        line([
          [tick.value, south],
          [tick.value, north],
        ]),
      ),
      ...ticks.latitudes.map((tick) =>
        line([
          [west, tick.value],
          [east, tick.value],
        ]),
      ),
    ],
  };
}

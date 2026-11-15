/** The measuring tool's arithmetic: legs between clicked points, a running total, and bearings. */
import { haversineMeters } from "@outpost/shared";
import { initialBearing, type LatLon } from "./geo";

export interface MeasureLeg {
  from: LatLon;
  to: LatLon;
  meters: number;
  /** Distance from the first point to the end of this leg. */
  totalMeters: number;
  /** Compass bearing to set out on, 0–360. */
  bearing: number;
}

export interface Measurement {
  legs: MeasureLeg[];
  totalMeters: number;
  /** Bearing of the last leg; null until there are two points. */
  lastBearing: number | null;
}

export function measure(points: LatLon[]): Measurement {
  const legs: MeasureLeg[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const meters = haversineMeters(from.lat, from.lon, to.lat, to.lon);
    total += meters;
    legs.push({ from, to, meters, totalMeters: total, bearing: initialBearing(from, to) });
  }
  return { legs, totalMeters: total, lastBearing: legs.at(-1)?.bearing ?? null };
}

/**
 * How fast a road is driven, for working out the quickest route and its time. Planned
 * times are for a car in free-flowing traffic with no stops: real journeys take longer.
 *
 * Where a road's limit is mapped (`maxspeed`), it is driven at 90% of it, held under the
 * class's ceiling below (an Autobahn with no limit is taken at 120 km/h). Where none is
 * mapped, the class's typical speed is used. Both columns are Outpost's assumption, set
 * under the legal limits they sit beside:
 *
 * | Road | Typical (no limit mapped) | Ceiling | Legal limit for cars (source) |
 * | --- | --- | --- | --- |
 * | motorway | 105 km/h | 120 km/h | UK 70 mph (GOV.UK "Speed limits", read 22 Nov 2026); France 130 km/h; Austria, Italy, Luxembourg, Netherlands 130; Switzerland 120; Germany advisory 130 (OpenStreetMap wiki, "Default speed limits", read 22 Nov 2026) |
 * | trunk | 85 km/h | 100 km/h | UK dual carriageway 70 mph, single 60 mph (GOV.UK); France dual carriageway 110 km/h (wiki) |
 * | primary | 65 km/h | 90 km/h | UK single carriageway 60 mph (GOV.UK); France rural 80 km/h (wiki, Code de la route) |
 * | secondary | 55 km/h | 80 km/h | as primary |
 * | motorway slip road | 55 km/h | 70 km/h | — |
 * | trunk slip road | 45 km/h | 60 km/h | — |
 * | primary or secondary slip road | 35 km/h | 50 km/h | — |
 * | car ferry with no duration mapped | 28 km/h (about 15 knots) | — | — |
 * | from a crossing's end to the nearest main road | 20 km/h over 1.3 times the straight line | — | — |
 *
 * Roundabouts are taken at no more than 30 km/h. Toll roads are not avoided (no option
 * yet). The figures are deliberately plain; docs/road-routes.md repeats them for people.
 */
import { CLASS, FLAG, SPEED_NONE } from "./build.ts";

export const TYPICAL_KMH: Record<number, number> = {
  [CLASS.motorway]: 105,
  [CLASS.trunk]: 85,
  [CLASS.primary]: 65,
  [CLASS.secondary]: 55,
  [CLASS.motorway_link]: 55,
  [CLASS.trunk_link]: 45,
  [CLASS.primary_link]: 35,
  [CLASS.secondary_link]: 35,
};

export const CEILING_KMH: Record<number, number> = {
  [CLASS.motorway]: 120,
  [CLASS.trunk]: 100,
  [CLASS.primary]: 90,
  [CLASS.secondary]: 80,
  [CLASS.motorway_link]: 70,
  [CLASS.trunk_link]: 60,
  [CLASS.primary_link]: 50,
  [CLASS.secondary_link]: 50,
};

export const FERRY_KMH = 28;
export const CONNECTOR_KMH = 20;
export const CONNECTOR_DETOUR = 1.3;
const ROUNDABOUT_KMH = 30;
/** The fastest anything is taken: what the A* estimate divides by, so it never overestimates. */
export const MAX_KMH = 120;

/** km/h a road edge is driven at. */
export function roadSpeedKmh(cls: number, maxspeed: number, flags: number): number {
  const ceiling = CEILING_KMH[cls] ?? 50;
  let speed: number;
  if (maxspeed === SPEED_NONE) speed = ceiling;
  else if (maxspeed > 0) speed = Math.min(ceiling, maxspeed * 0.9);
  else speed = TYPICAL_KMH[cls] ?? 40;
  if (flags & FLAG.roundabout) speed = Math.min(speed, ROUNDABOUT_KMH);
  return Math.max(5, speed);
}

/** Seconds to cross an edge. */
export function edgeSeconds(cls: number, lengthM: number, maxspeed: number, flags: number, fixedS: number): number {
  if (cls === CLASS.ferry || cls === CLASS.shuttle) {
    const assumed = lengthM / (FERRY_KMH / 3.6);
    const fastest = lengthM / (MAX_KMH / 3.6);
    return Math.max(fixedS > 0 ? fixedS : assumed, fastest);
  }
  if (cls === CLASS.connector) return lengthM / (CONNECTOR_KMH / 3.6);
  return lengthM / (roadSpeedKmh(cls, maxspeed, flags) / 3.6);
}

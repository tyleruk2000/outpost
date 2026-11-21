/**
 * The three norths at a place, and what a person with a map and a compass does with them.
 *
 * - True north: along the meridian, to the pole.
 * - Magnetic north: where a compass needle points; the World Magnetic Model gives its
 *   angle from true north, the declination (wmm.ts).
 * - Grid north: up the grid lines of a map. In Great Britain that is the Ordnance Survey
 *   National Grid, a Transverse Mercator projection whose grid lines run true north only
 *   along its central meridian, 2° W. Elsewhere its angle from true north, the grid
 *   convergence, grows with the distance from that meridian and with latitude.
 *
 * The angle that matters with a paper OS map is the grid magnetic angle: from grid north
 * to magnetic north. Every angle here is measured clockwise (east) from the first north to
 * the second, and is negative when the second lies to the west.
 */
import { toOsGrid } from "./maps.ts";
import { toGrid, utmConvergence } from "./utm.ts";
import { decimalYear, type MagneticField, magneticField } from "./wmm.ts";

export type North = "true" | "grid" | "magnetic";

type Projection = (lat: number, lon: number) => { easting: number; northing: number } | null;

/**
 * Grid convergence from a projection itself: the direction a meridian runs on the grid,
 * found from two points a little north and south of the place. Positive when grid north
 * is east of true north. On a Transverse Mercator grid this is about Δλ·sin φ, where Δλ is
 * the longitude from the central meridian; working it from the projection instead takes in
 * the ellipsoid and, for Great Britain, the shift between WGS 84 and OSGB36 as the map does.
 */
export function convergenceOf(project: Projection, lat: number, lon: number): number | null {
  const step = 1e-4; // degrees of latitude, about 11 m
  const north = project(lat + step, lon);
  const south = project(lat - step, lon);
  if (!north || !south || !project(lat, lon)) return null;
  // True north drawn on the grid; grid north is the same angle the other way.
  return -Math.atan2(north.easting - south.easting, north.northing - south.northing) / (Math.PI / 180);
}

/** Grid north's angle from true north on the National Grid, or null outside Great Britain's grid. */
export function nationalGridConvergence(lat: number, lon: number): number | null {
  return convergenceOf(toOsGrid, lat, lon);
}

/**
 * The grid a map is drawn with: Great Britain's National Grid, or UTM, which most of the
 * world's topographic maps carry (UPS over the poles). "none" is a map drawn to true north.
 */
export type MapGrid = "osgb" | "utm" | "none";

export interface Norths {
  field: MagneticField;
  /** Magnetic north from true north, degrees east. */
  declination: number;
  /** The grid the convergence is for; null when there is none (the National Grid outside Great Britain, or none asked for). */
  grid?: "osgb" | "utm" | "ups" | null;
  /** The UTM zone and band ("31U"), or "UPS N" or "UPS S", when the grid is UTM or UPS. */
  zone?: string;
  /** Grid north from true north, degrees east; null with no grid. */
  convergence: number | null;
  /** Magnetic north from grid north, degrees east; null with no grid. */
  gridMagneticAngle: number | null;
}

/** The grid a map of a place most likely has: the National Grid in Great Britain, UTM elsewhere. */
export function usualGrid(lat: number, lon: number): MapGrid {
  return nationalGridConvergence(lat, lon) !== null ? "osgb" : "utm";
}

/**
 * The three norths at a place on a date (milliseconds, or a Date). `grid` is the map's
 * grid; left out, it is the National Grid, which is null outside Great Britain.
 */
export function northsAt(lat: number, lon: number, date: Date | number, heightKm = 0, grid: MapGrid = "osgb"): Norths {
  const field = magneticField(lat, lon, decimalYear(date), heightKm);
  let convergence: number | null = null;
  let kind: Norths["grid"] = null;
  let zone: string | undefined;
  if (grid === "osgb") {
    convergence = nationalGridConvergence(lat, lon);
    kind = convergence === null ? null : "osgb";
  } else if (grid === "utm") {
    convergence = utmConvergence(lat, lon);
    const at = convergence === null ? null : toGrid(lat, lon);
    if (at) {
      kind = at.kind;
      zone = at.kind === "utm" ? `${at.zone}${at.band}` : `UPS ${at.hemisphere}`;
    }
  }
  return {
    field,
    declination: field.declination,
    grid: kind,
    ...(zone ? { zone } : {}),
    convergence,
    gridMagneticAngle: convergence === null ? null : field.declination - convergence,
  };
}

/** A bearing, 0 up to (not including) 360. */
export function normaliseBearing(degrees: number): number {
  const value = ((degrees % 360) + 360) % 360;
  return value === 360 ? 0 : value;
}

/** Where each north lies from true north at a place, degrees east. Grid is null outside Great Britain. */
export interface NorthOffsets {
  declination: number;
  convergence: number | null;
}

const offsetOf = (north: North, offsets: NorthOffsets): number | null =>
  north === "true" ? 0 : north === "magnetic" ? offsets.declination : offsets.convergence;

/**
 * A bearing measured from one north, measured from another. A bearing from magnetic north
 * is the true bearing less the declination; one from grid north is the true bearing less
 * the convergence. Null when grid north is asked for outside Great Britain.
 */
export function convertBearing(bearing: number, from: North, to: North, offsets: NorthOffsets): number | null {
  const fromOffset = offsetOf(from, offsets);
  const toOffset = offsetOf(to, offsets);
  if (fromOffset === null || toOffset === null) return null;
  return normaliseBearing(bearing + fromOffset - toOffset);
}

export interface CompassRule {
  /** The angle, rounded to whole degrees, as a hand compass can be set and read. */
  degrees: number;
  /** Which way magnetic north lies from the map's north, once rounded; null when it rounds to nothing. */
  side: "east" | "west" | null;
  /** From a bearing taken off the map to one to set on the compass. */
  mapToCompass: "add" | "subtract" | null;
  /** From a bearing read off the compass to one to draw on the map. */
  compassToMap: "add" | "subtract" | null;
}

/**
 * What to do with a bearing between a map and a compass, given magnetic north's angle
 * from the map's north (the grid magnetic angle on an OS map; the declination on a map
 * drawn to true north). A compass bearing is the map bearing less that angle: when
 * magnetic north is east of the map's north, subtract it going to the compass and add it
 * coming back; when it is west, the other way round. Rounded to whole degrees first,
 * because a hand compass is not read finer than that, so the rule says what to do with
 * the figure a person can actually set.
 */
export function compassRule(magneticFromMapNorth: number): CompassRule {
  const degrees = Math.round(Math.abs(magneticFromMapNorth));
  if (degrees === 0) return { degrees: 0, side: null, mapToCompass: null, compassToMap: null };
  const east = magneticFromMapNorth > 0;
  return {
    degrees,
    side: east ? "east" : "west",
    mapToCompass: east ? "subtract" : "add",
    compassToMap: east ? "add" : "subtract",
  };
}

/** An angle from a north in words, to a tenth of a degree: "0.6° west". "0.0°" when it rounds to nothing. */
export function angleInWords(degrees: number, digits = 1): string {
  const rounded = Number(Math.abs(degrees).toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}°`;
  return `${rounded.toFixed(digits)}° ${degrees > 0 ? "east" : "west"}`;
}

/** The sixteen points of the compass, from a bearing. */
export function compassPoint(bearing: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(normaliseBearing(bearing) / 22.5) % 16]!;
}

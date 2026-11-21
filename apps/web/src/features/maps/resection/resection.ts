/**
 * Resection: where you are, from compass bearings to things you can see and find on the
 * map, as it is taught for map and compass.
 *
 * From each landmark a line is drawn back along the bearing turned round (the
 * back-bearing): you are somewhere on it. Two lines cross at a point; three make a small
 * triangle, the triangle of error, whose size shows how good the bearings were. A
 * compass bearing is from magnetic north, so the World Magnetic Model's declination at
 * the place is added first to make it true (packages/shared/src/wmm.ts).
 *
 * The lines are worked on a Transverse Mercator plane whose central meridian runs through
 * the landmarks. It is conformal, so a true bearing becomes a bearing on the plane by
 * taking off the meridian's convergence at the landmark, and across the tens of kilometres
 * a person can see and name things a line on it is straight to well under a metre, far
 * finer than the degree a hand compass is read to. Pure arithmetic.
 */
import { decimalYear, magneticField, normaliseBearing, transverseMercatorForward, transverseMercatorInverse } from "@outpost/shared";
import type { LatLon } from "../lib/geo";

const DEG = Math.PI / 180;

export interface Sighting {
  position: LatLon;
  /** The bearing from you to the landmark, degrees, from the north `north` says. */
  bearing: number;
}

export type BearingNorth = "magnetic" | "true";

export interface Crossing {
  /** Which two sightings, by their places in the list. */
  between: [number, number];
  /** Where their lines cross, or null when they do not cross in front of both landmarks (or run side by side). */
  position: LatLon | null;
  /** The angle between the two lines, 0 to 90°: under about 30° a small error in either moves the crossing a long way. */
  cut: number;
}

export interface Resection {
  /** Each landmark's true bearing from you, and the back-bearing drawn from it. */
  lines: Array<{ from: LatLon; to: LatLon; trueBearing: number; backBearing: number }>;
  crossings: Crossing[];
  /** The best single point: where the lines come closest together (least squares), or null. */
  fix: LatLon | null;
  /** With three sightings whose lines all cross: the triangle of error's corners. */
  triangle: [LatLon, LatLon, LatLon] | null;
  /** The longest side of the triangle, metres; null without one. */
  triangleMeters: number | null;
  /** The declination added to each magnetic bearing, degrees east; 0 for true bearings. */
  declination: number;
  /** The smallest angle of cut between any two lines. */
  narrowestCut: number | null;
}

interface Plane {
  toXY(position: LatLon): [number, number];
  toLatLon(x: number, y: number): LatLon;
  /** The angle of the plane's north from true north at a place, degrees east. */
  convergence(position: LatLon): number;
}

/** A Transverse Mercator plane in metres, east and north, with `origin` at (0, 0). */
function planeAt(origin: LatLon): Plane {
  const dLon = (lon: number) => ((((lon - origin.lon) % 360) + 540) % 360) - 180;
  const base = transverseMercatorForward(origin.lat, 0, 1).y;
  const toXY = (position: LatLon): [number, number] => {
    const { x, y } = transverseMercatorForward(position.lat, dLon(position.lon), 1);
    return [x, y - base];
  };
  return {
    toXY,
    toLatLon: (x, y) => {
      const { lat, dLon: d } = transverseMercatorInverse(x, y + base, 1);
      return { lat, lon: ((((origin.lon + d) % 360) + 540) % 360) - 180 };
    },
    convergence: (position) => {
      const step = 1e-4;
      const [nx, ny] = toXY({ lat: position.lat + step, lon: position.lon });
      const [sx, sy] = toXY({ lat: position.lat - step, lon: position.lon });
      return -Math.atan2(nx - sx, ny - sy) / DEG;
    },
  };
}

const centroid = (positions: LatLon[]): LatLon => ({
  lat: positions.reduce((sum, p) => sum + p.lat, 0) / positions.length,
  lon: positions.reduce((sum, p) => sum + p.lon, 0) / positions.length,
});

/** The angle between two lines with these bearings, 0 to 90°. */
export function angleOfCut(a: number, b: number): number {
  const difference = Math.abs(normaliseBearing(a) - normaliseBearing(b)) % 180;
  return Math.min(difference, 180 - difference);
}

/** The least-squares point of lines through `points` along unit `directions`; null if they are all parallel. */
function closestPoint(points: Array<[number, number]>, directions: Array<[number, number]>): [number, number] | null {
  let a = 0;
  let b = 0;
  let c = 0;
  let u = 0;
  let v = 0;
  points.forEach(([px, py], index) => {
    const [dx, dy] = directions[index]!;
    // The normal to the line, (dy, −dx): the sum of squared distances to the lines is least where Σ n nᵀ x = Σ n nᵀ p.
    const nx = dy;
    const ny = -dx;
    a += nx * nx;
    b += nx * ny;
    c += ny * ny;
    const dot = nx * px + ny * py;
    u += nx * dot;
    v += ny * dot;
  });
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-9) return null;
  return [(c * u - b * v) / det, (a * v - b * u) / det];
}

/**
 * Works out the lines, their crossings, the best point and the triangle of error.
 *
 * A bearing is taken where you stand, from the north there: the declination (for a
 * compass bearing) and the meridian's direction are both those of your place, which is
 * what is being found. So they are taken first at the middle of the landmarks, then again
 * at the point found, twice; the point moves by centimetres the second time.
 */
export function resect(sightings: Sighting[], north: BearingNorth, date: Date | number): Resection {
  const declinationAt = (where: LatLon) => (north === "magnetic" ? magneticField(where.lat, where.lon, decimalYear(date)).declination : 0);
  let observer = sightings.length > 0 ? centroid(sightings.map((s) => s.position)) : { lat: 0, lon: 0 };
  let result = resectWith(sightings, declinationAt(observer), observer);
  for (let pass = 0; pass < 2 && result.fix; pass += 1) {
    observer = result.fix;
    result = resectWith(sightings, declinationAt(observer), observer);
  }
  return result;
}

function resectWith(sightings: Sighting[], declination: number, observer: LatLon): Resection {
  if (sightings.length === 0) {
    return { lines: [], crossings: [], fix: null, triangle: null, triangleMeters: null, declination, narrowestCut: null };
  }
  const plane = planeAt(centroid(sightings.map((s) => s.position)));
  const points = sightings.map((s) => plane.toXY(s.position));
  const trueBearings = sightings.map((s) => normaliseBearing(s.bearing + declination));
  const backBearings = trueBearings.map((bearing) => normaliseBearing(bearing + 180));
  // On the plane, each line runs at the bearing less the convergence where you stand, turned round.
  const convergence = plane.convergence(observer);
  const directions = backBearings.map((bearing): [number, number] => {
    const onPlane = (bearing - convergence) * DEG;
    return [Math.sin(onPlane), Math.cos(onPlane)];
  });

  const crossings: Crossing[] = [];
  const crossXY: Array<[number, number] | null> = [];
  for (let i = 0; i < sightings.length; i += 1) {
    for (let j = i + 1; j < sightings.length; j += 1) {
      const [px, py] = points[i]!;
      const [qx, qy] = points[j]!;
      const [dx, dy] = directions[i]!;
      const [ex, ey] = directions[j]!;
      const det = dx * -ey - dy * -ex;
      const cut = angleOfCut(trueBearings[i]!, trueBearings[j]!);
      let at: [number, number] | null = null;
      if (Math.abs(det) > 1e-9) {
        // p + t d = q + s e
        const t = ((qx - px) * -ey - (qy - py) * -ex) / det;
        const s = (dx * (qy - py) - dy * (qx - px)) / det;
        // In front of both landmarks: behind one, the bearings cannot both be right.
        if (t > 0 && s > 0) at = [px + t * dx, py + t * dy];
      }
      crossXY.push(at);
      crossings.push({ between: [i, j], position: at ? plane.toLatLon(at[0], at[1]) : null, cut });
    }
  }

  const fixXY = sightings.length >= 2 && crossXY.some(Boolean) ? closestPoint(points, directions) : null;
  const fix = fixXY ? plane.toLatLon(fixXY[0], fixXY[1]) : null;

  let triangle: Resection["triangle"] = null;
  let triangleMeters: number | null = null;
  if (sightings.length === 3 && crossXY.every(Boolean)) {
    const [a, b, c] = crossXY as Array<[number, number]>;
    triangle = [plane.toLatLon(a![0], a![1]), plane.toLatLon(b![0], b![1]), plane.toLatLon(c![0], c![1])];
    const side = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    triangleMeters = Math.max(side(a!, b!), side(b!, c!), side(a!, c!));
  }

  // Each line runs from its landmark past the point found, by half as far again.
  const lines = sightings.map((sighting, index) => {
    const [px, py] = points[index]!;
    const [dx, dy] = directions[index]!;
    const reach = fixXY ? Math.max(500, Math.hypot(fixXY[0] - px, fixXY[1] - py) * 1.5) : 10_000;
    return {
      from: sighting.position,
      to: plane.toLatLon(px + dx * reach, py + dy * reach),
      trueBearing: trueBearings[index]!,
      backBearing: backBearings[index]!,
    };
  });

  const cuts = crossings.map((crossing) => crossing.cut);
  return {
    lines,
    crossings,
    fix,
    triangle,
    triangleMeters,
    declination,
    narrowestCut: cuts.length > 0 ? Math.min(...cuts) : null,
  };
}

/** Under this angle of cut, the point is not to be trusted far. */
export const NARROW_CUT = 30;

/** How far a crossing moves along a line for each degree of error in the other bearing, metres: d / sin(cut) × 1°. */
export function errorPerDegree(distanceMeters: number, cut: number): number {
  return (distanceMeters * DEG) / Math.max(Math.sin(cut * DEG), 1e-6);
}

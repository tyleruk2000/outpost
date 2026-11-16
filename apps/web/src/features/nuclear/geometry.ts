/**
 * Where a scenario's effects lie on the ground. A ring is a circle on the ground: every
 * point of it is the stated distance from ground zero along the Earth's surface (a
 * great circle on a sphere of mean radius), not a circle drawn on the web-mercator
 * map, which would be the wrong size away from the equator. The fallout plume is the
 * book's idealised shape laid along the wind.
 *
 * Nothing here works out an effect: distances come from `computeEffects`.
 */
import type { EffectsResult, FalloutContour } from "@outpost/shared";
import type { LatLon } from "@/features/maps/lib/geo";

/** The Earth's mean radius, metres (IUGG), as `circleRing` in the maps code uses. */
export const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

/** The point `metres` from `from` on a bearing (degrees clockwise from north), on a sphere. */
export function destination(from: LatLon, bearingDeg: number, metres: number): LatLon {
  const angular = metres / EARTH_RADIUS_M;
  const bearing = bearingDeg * DEG;
  const lat1 = from.lat * DEG;
  const lon1 = from.lon * DEG;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lon2 =
    lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / DEG, lon: ((((lon2 / DEG + 540) % 360) + 360) % 360) - 180 };
}

/** The distance along the ground between two points, metres (haversine). */
export function groundDistance(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The bearing from `a` to `b`, degrees clockwise from north. */
export function bearing(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (((Math.atan2(y, x) / DEG) % 360) + 360) % 360;
}

/**
 * A ring of `metres` around `centre` as [lon, lat] points. Longitudes are kept
 * continuous across the antimeridian (they may pass ±180), which the map draws
 * correctly; a ring is never split.
 */
export function groundCircle(centre: LatLon, metres: number, steps = 128): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  let previous: number | null = null;
  for (let step = 0; step <= steps; step++) {
    const point = destination(centre, (step / steps) * 360, metres);
    let lon = point.lon;
    if (previous !== null) while (lon - previous > 180) lon -= 360;
    if (previous !== null) while (previous - lon > 180) lon += 360;
    previous = lon;
    ring.push([lon, point.lat]);
  }
  return ring;
}

/**
 * The half-width of an idealised contour at `x` metres along the wind from ground zero
 * (negative upwind). The book gives four dimensions (Table 9.93, Fig. 9.93): how far
 * downwind it reaches, its greatest width, its width at ground zero, and how far
 * upwind (half the width at ground zero, closed as a semicircle). It does not give
 * where along the plume the greatest width falls; Fig. 9.93 draws it about two thirds
 * of the way along, and so is it here, closing in an elliptical end. That placement is
 * this drawing's, and the screen says so.
 */
export function plumeHalfWidth(contour: FalloutContour, x: number): number {
  const g = contour.groundZeroWidthM / 2;
  const m = Math.max(contour.maxWidthM / 2, g);
  const length = contour.downwindM;
  if (x < -contour.upwindM || x > length) return 0;
  if (x <= 0) return Math.sqrt(Math.max(0, contour.upwindM ** 2 - x ** 2)) * (g / contour.upwindM);
  const widest = (2 / 3) * length;
  if (x <= widest) return g + (m - g) * Math.sin((x / widest) * (Math.PI / 2));
  const t = (x - widest) / (length - widest);
  return m * Math.sqrt(Math.max(0, 1 - t * t));
}

/** A contour as [lon, lat] points, laid along the direction the wind blows towards. */
export function plumePolygon(centre: LatLon, contour: FalloutContour, windFromDeg: number, steps = 96): Array<[number, number]> {
  const towards = (windFromDeg + 180) % 360;
  const along: number[] = [];
  for (let i = 0; i <= steps; i++) along.push(-contour.upwindM + ((contour.downwindM + contour.upwindM) * i) / steps);
  const side = (sign: 1 | -1) =>
    along.map((x) => {
      const y = plumeHalfWidth(contour, x) * sign;
      // Local flat offsets to a point: x metres along the wind, y across it (to the right of the wind's travel).
      const distance = Math.hypot(x, y);
      const angle = (Math.atan2(y, x) / DEG + towards + 360) % 360;
      const point = destination(centre, angle, distance);
      return [point.lon, point.lat] as [number, number];
    });
  const right = side(1);
  const left = side(-1).reverse();
  const ring = [...right, ...left];
  ring.push(ring[0]!);
  return ring;
}

/** Whether a place lies inside a contour, by putting it in the plume's own frame (along and across the wind). */
export function insidePlume(centre: LatLon, place: LatLon, contour: FalloutContour, windFromDeg: number): boolean {
  const distance = groundDistance(centre, place);
  const angle = (bearing(centre, place) - (windFromDeg + 180)) * DEG;
  const x = distance * Math.cos(angle);
  const y = distance * Math.sin(angle);
  return Math.abs(y) <= plumeHalfWidth(contour, x);
}

/** The rings a place is inside and the fallout contours it is inside, for words beside the place. */
export function placeAgainst(centre: LatLon, place: LatLon, result: EffectsResult) {
  const distance = groundDistance(centre, place);
  const rings = result.rings.filter((ring) => ring.metres !== null && distance <= ring.metres);
  const contours =
    result.fallout.drawn === true
      ? result.fallout.contours.filter((contour) =>
          insidePlume(centre, place, contour, (result.fallout as { fromDegrees: number }).fromDegrees),
        )
      : [];
  return { distance, rings, contours };
}

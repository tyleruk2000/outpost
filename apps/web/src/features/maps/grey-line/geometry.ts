/**
 * Day and night on the Earth at an instant, as shapes to draw on the map: the "grey line".
 *
 * The Sun's position comes from `lib/sun` (`solarPosition`), the same low-accuracy method
 * from Jean Meeus, "Astronomical Algorithms" (chapters 25 and 28), that gives the Sun tab
 * its sunrise and sunset, so the line on the map and the times in the tab come from one
 * piece of arithmetic. From the Sun's declination and the equation of time follows the
 * sub-solar point, where the Sun is straight overhead:
 *
 *   latitude  = declination
 *   longitude = −15° × (hours since 00:00 UTC − 12) − equation of time (minutes) ÷ 4
 *
 * and the Sun's height above the horizon anywhere else is the usual
 *
 *   sin(height) = sin(lat) sin(dec) + cos(lat) cos(dec) cos(lon − sub-solar longitude).
 *
 * Meeus gives the declination to about 0.01° and the equation of time to a few seconds;
 * that puts the sub-solar point within about 2 km of where it is, and moves a sunrise on
 * the line by a few seconds. The tests beside this file hold the line to the Sun tab and
 * to the US Naval Observatory's published times. The time is taken as UTC; the 69 s
 * between UTC and the dynamical time Meeus's series are written in moves the declination
 * by under 0.001° and is left out, as `lib/sun` leaves it out.
 *
 * Everywhere the Sun is lower than a given height is a cap on the globe: a circle round
 * the anti-solar point (the point opposite the sub-solar one) with an angular radius of
 * 90° plus that height. Each cap is traced as a ring of points round its centre, then cut
 * into pieces that lie between −180° and 180° of longitude, so that it is drawn whole on
 * every copy of the world the map shows and nothing is stretched across the date line.
 * A cap round a pole (the polar night) is closed along that pole.
 *
 * The line is drawn where the Sun's centre is 0.833° below the horizon: where it is rising
 * or setting by the same rule as the Sun tab's sunrise and sunset (standard refraction and
 * the Sun's radius). The twilights follow the usual limits: civil to 6° below, nautical to
 * 12°, astronomical to 18°; below that it is night.
 *
 * Pure, so it can be tested without a map.
 */
import type { LatLon } from "../lib/geo";
import { SUNRISE_ALTITUDE, solarPosition } from "../lib/sun";
import type { FeatureCollection } from "../map/overlays";

const DEG = Math.PI / 180;
const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * The heights, in degrees, that the shading steps at: the Sun set by sunrise's rule, then
 * the ends of civil, nautical and astronomical twilight. Each shade is everywhere the Sun
 * is lower than one of them, so a place in night lies under all four.
 */
export const GREY_LINE_LIMITS = [SUNRISE_ALTITUDE, -6, -12, -18] as const;

/** What the sky is doing at a place: the four steps of the shading, and day. */
export type SkyBand = "day" | "civil" | "nautical" | "astronomical" | "night";

/** Points round each ring: every quarter of a degree. Fine enough that the line does not show its corners at any zoom it is read at. */
const STEPS = 1440;

const sin = (degrees: number) => Math.sin(degrees * DEG);
const cos = (degrees: number) => Math.cos(degrees * DEG);
const asin = (value: number) => Math.asin(Math.max(-1, Math.min(1, value))) / DEG;
const atan2 = (y: number, x: number) => Math.atan2(y, x) / DEG;

/** A longitude brought into −180 … 180. */
export const wrapLongitude = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Where the Sun is straight overhead at an instant (milliseconds since 1970). */
export function subsolarPoint(ms: number): LatLon {
  const { declination, equationOfTime } = solarPosition(ms);
  const hours = (((ms % DAY) + DAY) % DAY) / HOUR;
  return { lat: declination, lon: wrapLongitude(-15 * (hours - 12) - equationOfTime / 4) };
}

/** The height of the Sun's centre above a flat horizon, in degrees, with no refraction. */
export function sunAltitude(lat: number, lon: number, ms: number): number {
  const sun = subsolarPoint(ms);
  return asin(sin(lat) * sin(sun.lat) + cos(lat) * cos(sun.lat) * cos(lon - sun.lon));
}

/** Which band a place is in at an instant: day, one of the twilights, or night. */
export function bandAt(lat: number, lon: number, ms: number): SkyBand {
  return bandOf(sunAltitude(lat, lon, ms));
}

export function bandOf(altitude: number): SkyBand {
  if (altitude >= SUNRISE_ALTITUDE) return "day";
  if (altitude >= -6) return "civil";
  if (altitude >= -12) return "nautical";
  if (altitude >= -18) return "astronomical";
  return "night";
}

type Point = [lon: number, lat: number];

/** The ring of points `radius` degrees from a centre, with longitudes kept continuous (they may run past ±180). */
function smallCircle(centre: LatLon, radius: number): Point[] {
  const points: Point[] = [];
  let previous = centre.lon;
  for (let step = 0; step <= STEPS; step += 1) {
    const bearing = (360 * step) / STEPS;
    const lat = asin(sin(centre.lat) * cos(radius) + cos(centre.lat) * sin(radius) * cos(bearing));
    let lon = centre.lon + atan2(sin(bearing) * sin(radius) * cos(centre.lat), cos(radius) - sin(centre.lat) * sin(lat));
    // Unwrapped: each point within half a turn of the one before.
    while (lon - previous > 180) lon -= 360;
    while (lon - previous < -180) lon += 360;
    previous = lon;
    points.push([lon, lat]);
  }
  return points;
}

/** Which pole, if either, lies inside a cap. A cap of less than 90° can hold one pole at most. */
function poleInside(centre: LatLon, radius: number): 90 | -90 | null {
  if (90 - centre.lat < radius) return 90;
  if (90 + centre.lat < radius) return -90;
  return null;
}

/** A polygon cut to one side of a vertical line (Sutherland and Hodgman). `keep` is which side. */
function clipPolygon(points: Point[], at: number, keep: "below" | "above"): Point[] {
  const inside = (point: Point) => (keep === "below" ? point[0] <= at : point[0] >= at);
  const out: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const before = points[(index + points.length - 1) % points.length]!;
    const crossing = (): Point => {
      const t = (at - before[0]) / (current[0] - before[0]);
      return [at, before[1] + t * (current[1] - before[1])];
    };
    if (inside(current)) {
      if (!inside(before)) out.push(crossing());
      out.push(current);
    } else if (inside(before)) out.push(crossing());
  }
  return out;
}

/** A line cut to the stretch −180 … 180: the pieces that lie inside it. */
function clipLine(points: Point[]): Point[][] {
  const pieces: Point[][] = [];
  let piece: Point[] = [];
  const inside = (point: Point) => point[0] >= -180 && point[0] <= 180;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const before = points[index - 1];
    if (before && inside(before) !== inside(current)) {
      const edge = inside(before) ? (current[0] > 180 ? 180 : -180) : before[0] > 180 ? 180 : -180;
      const t = (edge - before[0]) / (current[0] - before[0]);
      const meet: Point = [edge, before[1] + t * (current[1] - before[1])];
      if (inside(before)) {
        piece.push(meet);
        pieces.push(piece);
        piece = [];
      } else piece = [meet];
    }
    if (inside(current)) piece.push(current);
  }
  if (piece.length > 1) pieces.push(piece);
  return pieces.filter((line) => line.length > 1);
}

const area = (ring: Point[]) => {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[(index + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
};

const shifted = (points: Point[], by: number): Point[] => points.map(([lon, lat]) => [lon + by, lat]);

/** The ring brought round so that its middle is on the map's own world, −180 … 180. */
function centred(points: Point[]): Point[] {
  const lons = points.map((point) => point[0]);
  const middle = (Math.min(...lons) + Math.max(...lons)) / 2;
  return shifted(points, wrapLongitude(middle) - middle);
}

/**
 * Everywhere the Sun is lower than `altitude`: polygons between −180° and 180°, and the
 * edge as lines. `centre` is the anti-solar point.
 */
function cap(centre: LatLon, altitude: number): { polygons: Point[][]; lines: Point[][] } {
  const radius = 90 + altitude;
  const ring = centred(smallCircle(centre, radius));
  const pole = poleInside(centre, radius);
  // Round a pole the ring's longitude runs once round the world; it is closed along the pole.
  const closed = pole === null ? ring.slice(0, -1) : [...ring, [ring.at(-1)![0], pole] as Point, [ring[0]![0], pole] as Point];
  const polygons: Point[][] = [];
  const lines: Point[][] = [];
  for (const by of [-360, 0, 360]) {
    const piece = clipPolygon(clipPolygon(shifted(closed, by), 180, "below"), -180, "above");
    if (piece.length >= 3 && area(piece) > 1e-6) polygons.push(piece);
    lines.push(...clipLine(shifted(ring, by)));
  }
  return { polygons, lines };
}

const round = (value: number) => Math.round(value * 1e4) / 1e4;
const rounded = (points: Point[]) => points.map(([lon, lat]) => [round(lon), round(lat)]);

/**
 * The grey line at an instant, as one collection: for each limit a `shade` (a MultiPolygon
 * of everywhere the Sun is lower than it; drawn one over another they darken towards
 * night) and an `edge` (its boundary as lines), each with `below` (the limit) and `step`
 * (0 for the line itself, 1 to 3 for the twilights' ends), and the sub-solar point.
 */
export function greyLineData(ms: number): FeatureCollection {
  const sun = subsolarPoint(ms);
  const antisolar = { lat: -sun.lat, lon: wrapLongitude(sun.lon + 180) };
  const features: FeatureCollection["features"] = [];
  GREY_LINE_LIMITS.forEach((altitude, step) => {
    const { polygons, lines } = cap(antisolar, altitude);
    if (polygons.length > 0)
      features.push({
        type: "Feature",
        properties: { kind: "shade", below: altitude, step },
        geometry: { type: "MultiPolygon", coordinates: polygons.map((ring) => [closeRing(rounded(ring))]) },
      });
    if (lines.length > 0)
      features.push({
        type: "Feature",
        properties: { kind: "edge", below: altitude, step },
        geometry: { type: "MultiLineString", coordinates: lines.map(rounded) },
      });
  });
  features.push({
    type: "Feature",
    properties: { kind: "sun", label: "Sun overhead" },
    geometry: { type: "Point", coordinates: [round(sun.lon), round(sun.lat)] },
  });
  return { type: "FeatureCollection", features };
}

function closeRing(ring: number[][]): number[][] {
  const first = ring[0]!;
  const last = ring.at(-1)!;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

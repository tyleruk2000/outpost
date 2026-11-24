/**
 * Which country a point is in.
 *
 * `countryIn` tests the point against country outlines (Natural Earth 1:10m Admin 0,
 * simplified to within about a kilometre; the server bundles them,
 * `modules/layers/borders.ts`). A point just off a simplified coast is given the
 * country whose outline is nearest within `COAST_KM`. Within `BORDER_KM` of another
 * country's outline the answer says so (`near`), so whoever shows it can ask.
 *
 * `countryAt` is the rough fallback a screen without the outlines uses: the smallest of
 * the Natural Earth boxes the reference layers carry that holds the point. A box is
 * wrong near a border and for whole regions (Munich falls in Austria's box, Boston in
 * Canada's), so anything that decides by country takes the server's answer instead.
 */
import type { Bbox } from "./maps.ts";

export function countryAt(point: { lat: number; lon: number }, countries: ReadonlyArray<{ code: string; bbox: Bbox }>): string | null {
  let best: { code: string; area: number } | null = null;
  for (const country of countries) {
    const [west, south, east, north] = country.bbox;
    if (west > east) continue;
    if (point.lon < west || point.lon > east || point.lat < south || point.lat > north) continue;
    const area = (east - west) * (north - south);
    if (!best || area < best.area) best = { code: country.code, area };
  }
  return best?.code ?? null;
}

/** As `scripts/build-borders.mjs` writes it: integers of 1/scale degree, each ring's points after the first as steps. */
export interface BorderTable {
  source: string;
  tolerance: number;
  scale: number;
  countries: Array<{ code: string; bbox: [number, number, number, number]; rings: number[][] }>;
}

/** A country's outline in degrees: each ring as x0, y0, x1, y1, … */
export interface CountryOutline {
  code: string;
  bbox: Bbox;
  rings: Float64Array[];
}

export function outlinesOf(table: BorderTable): CountryOutline[] {
  return table.countries.map((country) => ({
    code: country.code,
    bbox: country.bbox.map((value) => value / table.scale) as Bbox,
    rings: country.rings.map((ring) => {
      const out = new Float64Array(ring.length);
      let x = 0;
      let y = 0;
      for (let i = 0; i < ring.length; i += 2) {
        x = i === 0 ? ring[0]! : x + ring[i]!;
        y = i === 0 ? ring[1]! : y + ring[i + 1]!;
        out[i] = x / table.scale;
        out[i + 1] = y / table.scale;
      }
      return out;
    }),
  }));
}

/** How far off a simplified coast a point may be and still be given that coast's country. */
export const COAST_KM = 15;
/** How near another country's outline a point is said to be near the border. */
export const BORDER_KM = 3;

const KM_PER_DEGREE = 111.32;

function inside(rings: Float64Array[], lon: number, lat: number): boolean {
  // Even-odd over every ring of the country: a hole (Lesotho in South Africa) is a ring too.
  let odd = false;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = ring[i]!;
      const yi = ring[i + 1]!;
      const xj = ring[j]!;
      const yj = ring[j + 1]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) odd = !odd;
    }
  }
  return odd;
}

/** The shortest distance in kilometres from a point to a country's outline, giving up past `limitKm`. */
function distanceKm(country: CountryOutline, lon: number, lat: number, limitKm: number): number {
  const margin = limitKm / KM_PER_DEGREE;
  const k = Math.cos((lat * Math.PI) / 180);
  const [west, south, east, north] = country.bbox;
  if (lat < south - margin || lat > north + margin) return Number.POSITIVE_INFINITY;
  if (k > 0.05 && (lon < west - margin / k || lon > east + margin / k)) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const ring of country.rings) {
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ax = (ring[j]! - lon) * k;
      const ay = ring[j + 1]! - lat;
      const bx = (ring[i]! - lon) * k;
      const by = ring[i + 1]! - lat;
      const dx = bx - ax;
      const dy = by - ay;
      const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = px * px + py * py;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best) * KM_PER_DEGREE;
}

export interface CountryFound {
  code: string;
  /** Other countries whose outline is within `BORDER_KM`: the answer may be wrong, so ask. */
  near: string[];
  /** True when the point is off every outline and was given the nearest coast's country. */
  offshore: boolean;
}

/** The country whose outline holds the point; else the nearest within `COAST_KM` (a coast simplified away); else null. */
export function countryIn(point: { lat: number; lon: number }, outlines: ReadonlyArray<CountryOutline>): CountryFound | null {
  const { lat, lon } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let found: string | null = null;
  for (const country of outlines) {
    const [west, south, east, north] = country.bbox;
    if (lon < west || lon > east || lat < south || lat > north) continue;
    if (inside(country.rings, lon, lat)) {
      found = country.code;
      break;
    }
  }
  const limit = found ? BORDER_KM : COAST_KM;
  const nearby = outlines
    .filter((country) => country.code !== found)
    .map((country) => ({ code: country.code, km: distanceKm(country, lon, lat, limit) }))
    .filter((each) => each.km <= limit)
    .sort((a, b) => a.km - b.km);
  if (found) return { code: found, near: nearby.map((each) => each.code), offshore: false };
  const [nearest, ...rest] = nearby;
  if (!nearest) return null;
  return {
    code: nearest.code,
    near: rest.filter((each) => each.km - nearest.km <= BORDER_KM).map((each) => each.code),
    offshore: true,
  };
}

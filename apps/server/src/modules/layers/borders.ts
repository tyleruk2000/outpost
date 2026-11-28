/**
 * Which country a point is in, from the country outlines bundled with the server
 * (borders.json: Natural Earth 1:10m Admin 0 Countries v5.1.2, public domain, simplified
 * by scripts/build-borders.mjs). Decoded once, when first asked; answers are remembered.
 */
import { type BorderTable, COAST_KM, type CountryFound, type CountryOutline, countryIn, outlinesOf } from "@outpost/shared";
import table from "./borders.json" with { type: "json" };

let outlines: CountryOutline[] | null = null;
const answers = new Map<string, CountryFound | null>();

function load(): CountryOutline[] {
  if (!outlines) {
    // Decoded when first asked, not at start.
    outlines = outlinesOf(table as unknown as BorderTable);
  }
  return outlines;
}

/** The country a point is in, with any other within a few kilometres (`near`); null at sea or with no position. */
export function countryFound(lat: number, lon: number): CountryFound | null {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const known = answers.get(key);
  if (known !== undefined) return known;
  const answer = countryIn({ lat, lon }, load());
  if (answers.size > 2000) answers.clear();
  answers.set(key, answer);
  return answer;
}

/** A country's outline as bundled (every ring, in degrees), or undefined for a code with none. */
export function outlineOf(code: string): CountryOutline | undefined {
  return load().find((outline) => outline.code === code);
}

/** Each country's rings with each ring's own box, for the quick test of which outline holds a point. */
let boxed: Array<{
  code: string;
  bbox: CountryOutline["bbox"];
  rings: Array<{ ring: Float64Array; box: [number, number, number, number] }>;
}> | null = null;
function boxedOutlines() {
  if (!boxed) {
    boxed = load().map((outline) => ({
      code: outline.code,
      bbox: outline.bbox,
      rings: outline.rings.map((ring) => {
        let west = Number.POSITIVE_INFINITY;
        let south = Number.POSITIVE_INFINITY;
        let east = Number.NEGATIVE_INFINITY;
        let north = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < ring.length; i += 2) {
          if (ring[i]! < west) west = ring[i]!;
          if (ring[i]! > east) east = ring[i]!;
          if (ring[i + 1]! < south) south = ring[i + 1]!;
          if (ring[i + 1]! > north) north = ring[i + 1]!;
        }
        return { ring, box: [west, south, east, north] as [number, number, number, number] };
      }),
    }));
  }
  return boxed;
}

/**
 * The country whose outline holds the point, by box and then point in polygon only: no
 * distance to any outline is worked out. Even-odd over the rings; a ring whose own box
 * does not hold the point cannot hold it, and crosses the ray an even number of times.
 */
function countryHolding(lat: number, lon: number): string | null {
  for (const country of boxedOutlines()) {
    const [west, south, east, north] = country.bbox;
    if (lon < west || lon > east || lat < south || lat > north) continue;
    let odd = false;
    for (const { ring, box } of country.rings) {
      if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const yi = ring[i + 1]!;
        const yj = ring[j + 1]!;
        if (yi > lat !== yj > lat && lon < ((ring[j]! - ring[i]!) * (lat - yi)) / (yj - yi) + ring[i]!) odd = !odd;
      }
    }
    if (odd) return country.code;
  }
  return null;
}

/**
 * For a point inside no outline: the country whose coast is nearest within `COAST_KM` (a
 * coast simplified away), as `countryIn` gives it, but passing over every ring whose own
 * box is further off than that.
 */
function nearestCoast(lat: number, lon: number): string | null {
  const margin = COAST_KM / KM_PER_DEGREE;
  const k = Math.cos((lat * Math.PI) / 180);
  const marginLon = k > 0.05 ? margin / k : 360;
  let best = (COAST_KM / KM_PER_DEGREE) ** 2;
  let code: string | null = null;
  const near = (box: readonly number[]) =>
    lat >= box[1]! - margin && lat <= box[3]! + margin && lon >= box[0]! - marginLon && lon <= box[2]! + marginLon;
  for (const country of boxedOutlines()) {
    if (!near(country.bbox)) continue;
    for (const { ring, box } of country.rings) {
      if (!near(box)) continue;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ax = (ring[j]! - lon) * k;
        const ay = ring[j + 1]! - lat;
        const dx = (ring[i]! - lon) * k - ax;
        const dy = ring[i + 1]! - lat - ay;
        const length = dx * dx + dy * dy;
        const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
        const px = ax + t * dx;
        const py = ay + t * dy;
        const d = px * px + py * py;
        if (d <= best) {
          best = d;
          code = country.code;
        }
      }
    }
  }
  return code;
}

const KM_PER_DEGREE = 111.32;
const codes = new Map<string, string | null>();

/**
 * The ISO 3166-1 code of the country a point is in, or null. Quick: inside an outline is
 * answered by point in polygon alone; only a point inside none (off a coast, at sea) is
 * measured against the outlines nearby. Answers are remembered.
 */
export function countryOfPoint(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const known = codes.get(key);
  if (known !== undefined) return known;
  const answer = countryHolding(lat, lon) ?? nearestCoast(lat, lon);
  if (codes.size > 20_000) codes.clear();
  codes.set(key, answer);
  return answer;
}

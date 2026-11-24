/**
 * Which country a point is in, from the country outlines bundled with the server
 * (borders.json: Natural Earth 1:10m Admin 0 Countries v5.1.2, public domain, simplified
 * by scripts/build-borders.mjs). Decoded once, when first asked; answers are remembered.
 */
import { type BorderTable, type CountryFound, type CountryOutline, countryIn, outlinesOf } from "@outpost/shared";
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

/** The ISO 3166-1 code of the country a point is in, or null. */
export function countryOfPoint(lat: number, lon: number): string | null {
  return countryFound(lat, lon)?.code ?? null;
}

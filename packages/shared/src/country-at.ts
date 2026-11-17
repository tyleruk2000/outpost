/**
 * Which country a point is in, roughly: the smallest of the Natural Earth boxes the
 * reference layers carry (GET /api/reference/catalogue) that holds it, the way Repeaters
 * and Frequencies choose a country from the home place. A box is rough near a border, so
 * whoever shows the answer says which country was taken.
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

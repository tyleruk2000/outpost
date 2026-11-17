/**
 * Which country the home place is in, for the first choice of the country filter. The
 * home place is the saved place with the home icon (homePlaceOf); the country is the
 * smallest of the Natural Earth boxes the reference layers already carry
 * (GET /api/reference/catalogue) that holds it, the way Repeaters chooses a country.
 * A box is rough near a border: the person can change the filter, and it is said which
 * country was taken.
 */
import { type Bbox, homePlaceOf } from "@outpost/shared";

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

export function homeCountry(
  markers: ReadonlyArray<{ icon: string; createdAt: number; id: string; lat: number; lon: number }> | undefined,
  countries: ReadonlyArray<{ code: string; bbox: Bbox }> | undefined,
): string | null {
  if (!markers || !countries) return null;
  const home = homePlaceOf(markers);
  return home ? countryAt(home, countries) : null;
}

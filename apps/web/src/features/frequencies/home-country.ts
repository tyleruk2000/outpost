/**
 * Which country the home place is in, for the first choice of the country filter. The
 * home place is the saved place with the home icon (homePlaceOf); the country is the
 * smallest of the Natural Earth boxes the reference layers already carry
 * (GET /api/reference/catalogue) that holds it, the way Repeaters chooses a country.
 * A box is rough near a border: the person can change the filter, and it is said which
 * country was taken.
 */
import { type Bbox, countryAt, homePlaceOf } from "@outpost/shared";

/** The smallest Natural Earth box that holds a point (shared with the server's radio tool). */
export { countryAt };

export function homeCountry(
  markers: ReadonlyArray<{ icon: string; createdAt: number; id: string; lat: number; lon: number }> | undefined,
  countries: ReadonlyArray<{ code: string; bbox: Bbox }> | undefined,
): string | null {
  if (!markers || !countries) return null;
  const home = homePlaceOf(markers);
  return home ? countryAt(home, countries) : null;
}

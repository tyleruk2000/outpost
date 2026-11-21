/**
 * Which country the home place is in, for the first choice of the country filter. The
 * home place is the saved place with the home icon (homePlaceOf); the country is the
 * smallest of the Natural Earth boxes the reference layers already carry
 * (GET /api/reference/catalogue) that holds it, the way Repeaters chooses a country.
 * A box is rough near a border: the person can change the filter, and it is said which
 * country was taken.
 */
import { type Bbox, countryAt, homePlaceOf } from "@outpost/shared";
import { useCatalogue } from "@/features/layers/data";
import { useMarkers } from "@/features/maps/data";

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

/**
 * Home's country for a screen that words or chooses something by country: its code and
 * name, or null while the places or the catalogue are loading, or when no place has the
 * home icon. A screen falls back to the device's region (`deviceRegion`) when it is null.
 */
export function useHomeCountry(): { code: string; name: string } | null {
  const markers = useMarkers();
  const catalogue = useCatalogue();
  const code = homeCountry(markers.data, catalogue.data?.countries);
  if (!code) return null;
  return { code, name: catalogue.data?.countries.find((country) => country.code === code)?.name ?? code };
}

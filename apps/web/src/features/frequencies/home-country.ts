/**
 * Which country the current household's home is in, for the first choice of a country
 * filter: the household's own choice of country if it made one, else the country its home
 * is in, from the smallest of the Natural Earth boxes the reference layers carry (worked
 * out by the server, `households.country()`). A box is rough near a border: the person can
 * change the filter, and it is said which country was taken.
 */
import { type Bbox, countryAt, homePlaceOf } from "@outpost/shared";
import { useHome } from "@/features/households/home";
import { useCatalogue } from "@/features/layers/data";

/** The smallest Natural Earth box that holds a point (shared with the server's radio tool). */
export { countryAt };

/** The country of the saved place with the home icon: what the first household takes when it has no place of its own. */
export function homeCountry(
  markers: ReadonlyArray<{ icon: string; createdAt: number; id: string; lat: number; lon: number }> | undefined,
  countries: ReadonlyArray<{ code: string; bbox: Bbox }> | undefined,
): string | null {
  if (!markers || !countries) return null;
  const home = homePlaceOf(markers);
  return home ? countryAt(home, countries) : null;
}

/**
 * The current household's country for a screen that words or chooses something by
 * country: its code and name, or null while it is loading or when it has none. A screen
 * falls back to the device's region (`deviceRegion`) when it is null. `first` takes the
 * first household's country instead, for what is the whole Outpost's (the mesh root topic).
 */
export function useHomeCountry(options: { first?: boolean } = {}): { code: string; name: string } | null {
  const current = useHome();
  // The mesh radio is the whole Outpost's, so its root topic goes by the first household's country.
  const code = options.first ? (current.households[0]?.country ?? null) : current.country;
  const catalogue = useCatalogue();
  if (!code) return null;
  return { code, name: catalogue.data?.countries.find((country) => country.code === code)?.name ?? code };
}

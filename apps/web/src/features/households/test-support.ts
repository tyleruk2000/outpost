/** Stand-in answers of `GET /api/households` for the screens' tests. */
import type { HouseholdDto, HouseholdHome, HouseholdsResponse } from "@outpost/shared";

export function householdOf(over: Partial<HouseholdDto> & { id: string; name: string }): HouseholdDto {
  return {
    position: 0,
    kind: "fixed",
    homePlaceId: null,
    basePlaceId: null,
    home: null,
    countryOverride: null,
    country: null,
    here: null,
    personIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

/** A fixed household's home at a saved place, in a country. */
export const placeHome = (name: string, country: string | null, lat = 51.5, lon = -0.12): HouseholdHome => ({
  kind: "place",
  id: `m-${name}`,
  name,
  lat,
  lon,
  country,
  at: null,
  source: null,
});

/** The households, the first current unless `currentId` is given. */
export function householdsAnswer(households: HouseholdDto[], currentId = households[0]!.id): HouseholdsResponse {
  return { households: households.map((household, position) => ({ ...household, position })), currentId };
}

/** One household, "Home", as on most installs. */
export const ONE_HOUSEHOLD = householdsAnswer([householdOf({ id: "household", name: "Home" })]);

/** Home and a caravan, the caravan current. */
export const TWO_HOUSEHOLDS = householdsAnswer(
  [householdOf({ id: "household", name: "Home" }), householdOf({ id: "caravan", name: "Caravan", kind: "portable" })],
  "caravan",
);

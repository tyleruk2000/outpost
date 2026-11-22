/**
 * For tests: households as GET /api/households answers them. `oneHouseholdOf(markers)` is
 * what the server says for an Outpost with one household and no home place of its own: the
 * first household, whose home is the saved place with the home icon (as before households).
 */
import {
  countryAt,
  FIRST_HOUSEHOLD_ID,
  type HouseholdDto,
  type HouseholdHome,
  type HouseholdsResponse,
  homePlaceOf,
} from "@outpost/shared";

/** Rough boxes for the countries the tests use, enough for `countryAt`. */
const TEST_COUNTRIES = [
  { code: "GB", bbox: [-8.65, 49.86, 1.77, 60.86] as [number, number, number, number] },
  { code: "FR", bbox: [-5.14, 41.33, 9.56, 51.09] as [number, number, number, number] },
  { code: "US", bbox: [-171.79, 18.91, -66.96, 71.36] as [number, number, number, number] },
];

export function household(over: Partial<HouseholdDto> = {}): HouseholdDto {
  return {
    id: FIRST_HOUSEHOLD_ID,
    name: "Home",
    position: 0,
    kind: "fixed",
    homePlaceId: null,
    basePlaceId: null,
    home: null,
    countryOverride: null,
    country: over.home?.country ?? null,
    here: null,
    personIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

/** A saved place as a household's home. */
export function placeHome(marker: { id: string; name: string; lat: number; lon: number }): HouseholdHome {
  return {
    kind: "place",
    id: marker.id,
    name: marker.name || "Home",
    lat: marker.lat,
    lon: marker.lon,
    country: countryAt(marker, TEST_COUNTRIES),
    at: null,
    source: null,
  };
}

/** A portable household's position, set at `at`. */
export function hereHome(name: string, lat: number, lon: number, at: number): HouseholdHome {
  return { kind: "here", id: null, name, lat, lon, country: countryAt({ lat, lon }, TEST_COUNTRIES), at, source: "map" };
}

export function households(list: HouseholdDto[], currentId = list[0]?.id ?? FIRST_HOUSEHOLD_ID): HouseholdsResponse {
  return { households: list, currentId };
}

/** One household, its home the first saved place with the home icon: what every install had before households. */
export function oneHouseholdOf(markers: ReadonlyArray<unknown>) {
  const marker = homePlaceOf(
    (markers as Array<{ id: string; name: string; lat: number; lon: number; icon: string; createdAt?: number }>).map((each) => ({
      ...each,
      createdAt: each.createdAt ?? 0,
    })),
  );
  const home = marker ? placeHome(marker) : null;
  return households([household({ home, country: home?.country ?? null })]);
}

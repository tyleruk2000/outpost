/**
 * Place names as the map's search finds them on a real Outpost, with the long details real
 * ones have ("Tidal water · Na h-Eileanan an Iar, Scotland"). The tests' own places have
 * short details, which hid a list wider than the screen. Answered in the browser, for the
 * page's own request to /api/maps/places: nothing reaches the internet.
 */
import type { Page } from "@playwright/test";

const place = (id: number, name: string, kindLabel: string, admin1: string, lat: number, lon: number) => ({
  id,
  source: "os" as const,
  name,
  country: "GB",
  admin1,
  featureCode: null,
  kindLabel,
  lat,
  lon,
  population: 0,
  elevation: null,
});

/** Places whose details are as long as the longest on the owner's Outpost. */
export const LONG_PLACES = [
  place(1, "Reiff", "Tidal water", "Na h-Eileanan an Iar, Comhairle nan Eilean Siar, Scotland", 58.05, -5.43),
  place(2, "Reinigeadal", "Hamlet or other settlement", "Na h-Eileanan an Iar, Comhairle nan Eilean Siar, Scotland", 57.93, -6.7),
  place(3, "Reiss", "Village", "Highland, Caithness, Scotland, United Kingdom of Great Britain", 58.47, -3.12),
];

/** Answers the map's place search with `LONG_PLACES` (and whatever the server reads as a position, as it would). */
export async function standInPlaceNames(page: Page): Promise<void> {
  await page.route(/\/api\/maps\/places\?/, async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") ?? "";
    const real = await route.fetch();
    const body = (await real.json()) as { places: unknown[] };
    const wanted = query.toLowerCase();
    await route.fulfill({
      response: real,
      json: { ...body, places: LONG_PLACES.filter((each) => each.name.toLowerCase().startsWith(wanted.slice(0, 3))) },
    });
  });
}

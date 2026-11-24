/** Shared by the persona-fix specs for the household (24 Nov 2026): a home put somewhere, and everything put back after. */
import type { Page } from "@playwright/test";
import { api } from "./fixtures";

/** Where a picture of the screen goes when `OUTPOST_SHOTS` names a folder; nothing otherwise. */
export async function shot(page: Page, name: string): Promise<void> {
  const folder = process.env.OUTPOST_SHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${name}.png`, fullPage: false });
}

/** Makes a saved place with the home icon at a position and the first household's home. */
export async function homeAt(page: Page, name: string, lat: number, lon: number): Promise<string> {
  const { households } = await api<{ households: Array<{ id: string }> }>(page, "GET", "/api/households");
  const made = await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", { name, lat, lon, icon: "home" });
  await api(page, "PUT", `/api/households/${households[0]!.id}`, { homePlaceId: made.marker.id });
  return households[0]!.id;
}

/** The first household as every other spec expects it: no home, no country chosen, no address; no E2E places or plans. */
export async function putBack(page: Page): Promise<void> {
  const { households } = await api<{ households: Array<{ id: string }> }>(page, "GET", "/api/households");
  await api(page, "PUT", `/api/households/${households[0]!.id}`, { homePlaceId: null, countryOverride: null, address: "" });
  const markers = await api<{ markers: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>>(
    page,
    "GET",
    "/api/maps/markers",
  );
  const list = Array.isArray(markers) ? markers : markers.markers;
  for (const marker of list) if (marker.name.startsWith("E2E ")) await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
  for (const place of (await api<{ places: Array<{ id: string; name: string }> }>(page, "GET", "/api/weather")).places)
    if (place.name.startsWith("E2E ")) await api(page, "DELETE", `/api/weather/places/${place.id}`);
  for (const plan of (await api<{ plans: Array<{ id: string; name: string }> }>(page, "GET", "/api/emergency-plans")).plans)
    if (plan.name.startsWith("E2E ")) await api(page, "DELETE", `/api/emergency-plans/${plan.id}`);
  for (const person of (await api<{ people: Array<{ id: string; name: string }> }>(page, "GET", "/api/people")).people)
    if (person.name.startsWith("E2E ")) await api(page, "DELETE", `/api/people/${person.id}?confirm=true`);
}

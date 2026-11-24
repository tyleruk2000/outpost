/**
 * Road networks and saved places for the road route tests. The networks are built from the
 * server tests' made-up extracts (Great Britain and France in two parts, shaped like the
 * owner's London to Chamonix list), put in storage as a person's own files: nothing is
 * downloaded and nothing reaches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { franceNorth, franceSouth, greatBritain } from "../../apps/server/test/fixtures/roads/channel-trip.ts";
import { api, expect } from "./fixtures";

/** Builds the three networks (or those of the countries given) and saves Leatherhead, Reims and Chamonix as places; answers the places' ids. */
export async function installChannelTrip(page: Page, only?: readonly string[]): Promise<string[]> {
  const { locations } = await api<{ locations: Array<{ id: string; path: string; isDefault: boolean }> }>(
    page,
    "GET",
    "/api/storage/locations",
  );
  const location = locations.find((each) => each.isDefault) ?? locations[0]!;
  fs.mkdirSync(path.join(location.path, "roads-e2e"), { recursive: true });
  const all = [
    ["Great Britain (test)", greatBritain(), "GB"],
    ["France north (test)", franceNorth(), "FR"],
    ["France south (test)", franceSouth(), "FR"],
  ] as const;
  const chosen = all.filter(([, , country]) => !only || only.includes(country));
  for (const [name, body, country] of chosen) {
    const file = `roads-e2e/${name.split(" ")[1]}-${country}.osm.pbf`;
    fs.writeFileSync(path.join(location.path, file), body);
    await api(page, "POST", "/api/roads/networks", { locationId: location.id, relPath: file, name, country });
  }
  await expect
    .poll(async () => (await api<{ networks: unknown[] }>(page, "GET", "/api/roads/networks")).networks.length, { timeout: 60_000 })
    .toBe(chosen.length);
  const places: string[] = [];
  for (const place of [
    { name: "Leatherhead", lat: 51.296, lon: -0.33 },
    { name: "Reims", lat: 49.27, lon: 4.06 },
    { name: "Chamonix", lat: 45.9237, lon: 6.8694 },
  ])
    places.push((await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", place)).marker.id);
  return places;
}

/** Leaves the server as it was found, for the tests that count places and routes. */
export async function removeChannelTrip(page: Page, places: string[]): Promise<void> {
  for (const id of places) await api(page, "DELETE", `/api/maps/markers/${id}`);
  for (const route of (await api<{ routes: Array<{ id: string }> }>(page, "GET", "/api/roads/routes")).routes)
    await api(page, "DELETE", `/api/roads/routes/${route.id}`);
  for (const network of (await api<{ networks: Array<{ id: string }> }>(page, "GET", "/api/roads/networks")).networks)
    await api(page, "DELETE", `/api/roads/networks/${network.id}`);
}

/** Chooses a saved place for a point of the route, from the list shown before anything is typed. */
export async function choosePlace(page: Page, label: string, place: string, tap = false): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  await (tap ? field.tap() : field.click());
  const row = page.getByRole("list", { name: "Saved places" }).getByRole("button", { name: place, exact: true });
  await (tap ? row.tap() : row.click());
}

/**
 * Makes a saved place the current household's home, where Directions starts from, whatever tests before left there;
 * answers how to put the household back as it was.
 */
export async function useAsHome(page: Page, markerId: string): Promise<() => Promise<void>> {
  const { households, currentId } = await api<{
    households: Array<{ id: string; kind: string; homePlaceId: string | null }>;
    currentId: string;
  }>(page, "GET", "/api/households");
  const current = households.find((household) => household.id === currentId)!;
  await api(page, "PUT", `/api/households/${current.id}`, { kind: "fixed", homePlaceId: markerId });
  return async () => {
    await api(page, "PUT", `/api/households/${current.id}`, { kind: current.kind, homePlaceId: current.homePlaceId });
  };
}

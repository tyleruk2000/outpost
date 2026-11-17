/** Installs the end-to-end terrain fixture (a plain at 100 m with two 400 m ridges, e2e/tools/terrain-fixture.mjs) and gives back how to remove it. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api } from "./fixtures";

export async function installRidges(page: Page): Promise<() => Promise<void>> {
  const { locations } = await api<{ locations: Array<{ id: string; path: string }> }>(page, "GET", "/api/storage/locations");
  const location = locations[0]!;
  execFileSync(process.execPath, [
    path.join(import.meta.dirname, "../tools/terrain-fixture.mjs"),
    path.join(location.path, "imports/e2e-height-ridges.pmtiles"),
  ]);
  const { collection } = await api<{ collection: { id: string } }>(page, "POST", "/api/maps/import", {
    locationId: location.id,
    relPath: "imports/e2e-height-ridges.pmtiles",
    name: "Two ridges",
    tileType: "terrain",
  });
  // Other tests expect no terrain to be installed.
  return async () => {
    await api(page, "DELETE", `/api/collections/${collection.id}?deleteFiles=true`);
  };
}

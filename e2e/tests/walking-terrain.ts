/**
 * Walking over the terrain, on the desktop and on an iPhone: Reachable from here on foot over the suite's test map
 * and terrain (map-fixture.ts: a lake and a round hill, made up), and a walking route re-timed over made-up terrain
 * rising south of Leatherhead, the streets service being the suite's stand-in (streets.ts), which answers every walk
 * with Leatherhead to Box Hill. Each makes its PDF, read back with pdf.js. Nothing reaches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { Compression, TileType } from "../../apps/server/src/modules/maps/pmtiles/header.ts";
import { buildArchive } from "../../apps/server/test/fixtures/maps/archive.ts";
import { type Ground, groundTiles, worldOf } from "../../apps/server/test/fixtures/maps/terrain.ts";
import { api, expect, watchForErrors } from "./fixtures";
import { CENTRE, installTestMaps, removeTestMaps } from "./map-fixture";
import { pdfWords } from "./pdf";
import { choosePlace } from "./road-routes";
import { installStreets, removeStreets } from "./streets";

const START = { lat: CENTRE.lat - 0.006, lon: CENTRE.lon };

async function picture(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const folder = process.env.OUTPOST_E2E_SHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${info.project.name}-${name}.png` });
}

async function saveFrom(page: Page, link: Locator): Promise<Buffer> {
  await expect(link).toBeVisible({ timeout: 120_000 });
  const downloading = page.waitForEvent("download");
  await link.click();
  return fs.readFileSync(await (await downloading).path());
}

/** Reachable from here on foot over the test terrain: an hour, then 4 hours, then on paper (on the desktop). */
export async function walkOverTerrain(
  page: Page,
  info: TestInfo,
  press: (target: Locator) => Promise<void>,
  print: boolean,
  /** More to check while the 4 hours are showing. */
  showing?: () => Promise<void>,
) {
  const errors = watchForErrors(page);
  const maps = await installTestMaps(page);
  try {
    // An address from before, when the walk was a tool of its own, opens Reachable from here on foot.
    // South of the test map's lake (the centre is in it), on the hill's side of the map.
    await page.goto(`/maps?lat=${START.lat}&lon=${START.lon}&z=12&reach=1&mode=walk`);
    const card = page.getByTestId("reach-card");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole("radiogroup", { name: "Way of travelling" }).getByRole("radio", { name: "Walk" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Over the terrain, with no streets service at all.
    await expect(card.getByText(/^Within 1 h: as far as [\d.]+ km from here, straight-line\.$/)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Hills, paths and water counted\. For a fit adult with no load\./)).toBeVisible();
    await expect(card.getByText(/ground \d+ m above sea level/)).toBeVisible();

    const asked = page.waitForRequest(
      (request) => request.url().includes("/api/maps/walk-reach?") && request.url().includes("minutes=240"),
    );
    await press(card.getByRole("radiogroup", { name: "Time" }).getByRole("radio", { name: "4 hours" }));
    await asked;
    await expect(card.getByText(/^Within 4 h: as far as/)).toBeVisible({ timeout: 30_000 });
    // The test terrain is a small square: a 4 hour walk runs off it, and the card says so.
    await expect(card.getByText("Terrain runs out within reach; no ground without it is shaded.")).toBeVisible();
    await press(card.getByRole("button", { name: "Pace and what this is" }));
    await expect(card.getByText(/Tobler's hiking function/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await picture(page, info, "walk-4-hours");
    await showing?.();

    const printButton = card.getByRole("button", { name: "Print or save as PDF" });
    const box = (await printButton.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(info.project.name === "iphone" ? 44 : 24);
    await press(printButton);
    await expect(page.getByRole("heading", { name: "Print or save as PDF" }).first()).toBeVisible();
    if (!print) return;

    await page.getByRole("combobox", { name: "Scale" }).click();
    await page.getByRole("option", { name: /1:100,000/ }).click();
    await page.getByRole("button", { name: "Preview the page" }).click();
    const dialog = page.getByRole("dialog", { name: "Print or save as PDF" });
    await expect(dialog.getByRole("checkbox", { name: /Reachable on foot/ })).toBeChecked();
    const sheet = dialog.getByRole("img", { name: /Preview of the page/ });
    await expect(sheet).toContainText("Reachable on foot within 4 h", { timeout: 30_000 });
    await expect(dialog.getByText("Drawing the preview")).toBeHidden({ timeout: 30_000 });
    await picture(page, info, "walk-4-hours-preview");
    await dialog.getByRole("button", { name: "Make the PDF" }).click();
    const bytes = await saveFrom(page, dialog.getByRole("link", { name: "Save as PDF" }));
    await info.attach("walk-4-hours.pdf", { body: bytes, contentType: "application/pdf" });
    if (process.env.OUTPOST_E2E_SHOTS) fs.writeFileSync(`${process.env.OUTPOST_E2E_SHOTS}/${info.project.name}-walk-4-hours.pdf`, bytes);
    const words = await pdfWords(bytes);
    expect(words).toContain(`Reachable on foot within 4 h from ${START.lat.toFixed(5)}, ${START.lon.toFixed(5)}`);
    expect(words).toContain("For a fit adult with no load.");
    expect(words).toContain("Tobler's hiking function over Test terrain");
    expect(words).toContain("Tobler's hiking function");
    expect(words).toContain("fences, walls, private land");
    expect(words).toContain("1:100,000");
  } finally {
    await removeTestMaps(page, maps);
  }
  expect(errors).toEqual([]);
}

const LEATHERHEAD = { lat: 51.2965, lon: -0.3303 };
const BOX = [-0.4, 51.22, -0.26, 51.33] as [number, number, number, number];

/** Made-up terrain over Leatherhead and Box Hill: rising 4% to the south. */
async function installHills(page: Page): Promise<string> {
  const [, startY] = worldOf(LEATHERHEAD.lat, LEATHERHEAD.lon);
  const metresPerWorld = 40_075_016.7 * Math.cos((51.28 * Math.PI) / 180);
  const ground: Ground = (_x, y) => Math.max(0, 50 + 0.04 * (y - startY) * metresPerWorld);
  const archive = buildArchive({
    tiles: groundTiles(ground, { minZoom: 8, maxZoom: 12, bbox: BOX, size: 256 }),
    bounds: BOX,
    tileType: TileType.Png,
    tileCompression: Compression.None,
    metadata: { name: "Outpost test hills", encoding: "terrarium" },
  });
  const { locations } = await api<{ locations: Array<{ id: string; path: string; isDefault: boolean }> }>(
    page,
    "GET",
    "/api/storage/locations",
  );
  const location = locations.find((each) => each.isDefault)!;
  fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
  fs.writeFileSync(path.join(location.path, "imports", "test-hills.pmtiles"), archive.bytes);
  const imported = await api<{ collection: { id: string } }>(page, "POST", "/api/maps/import", {
    locationId: location.id,
    relPath: "imports/test-hills.pmtiles",
    name: "Test hills",
    tileType: "terrain",
  });
  return imported.collection.id;
}

/** A walking route over the hills: the climb under the totals, and a route card with the profile and each turn's time. */
export async function walkingRouteOverHills(page: Page, info: TestInfo, press: (target: Locator) => Promise<void>, card: boolean) {
  const errors = watchForErrors(page);
  installStreets("ready");
  await page.goto("/");
  const hills = await installHills(page);
  const places: string[] = [];
  for (const place of [
    { name: "Leatherhead", ...LEATHERHEAD },
    { name: "Box Hill", lat: 51.2556, lon: -0.3106 },
  ])
    places.push((await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", place)).marker.id);
  try {
    await page.goto("/maps?lat=51.28&lon=-0.32&z=12");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await press(page.getByRole("tab", { name: /Routes/ }));
    // Plan a route is called Directions in the Routes tab (Maps redesign, part 1).
    await press(page.getByRole("button", { name: "Directions", exact: true }).first());
    await expect(page.getByRole("heading", { name: "Directions", exact: true })).toBeVisible();
    await press(page.getByRole("radiogroup", { name: "Way of travelling" }).getByRole("radio", { name: "Walk" }));
    const tap = info.project.name === "iphone";
    await choosePlace(page, "From", "Leatherhead", tap);
    await choosePlace(page, "To", "Box Hill", tap);
    await press(page.getByRole("button", { name: "Plan route" }));
    await expect(page.getByRole("list", { name: "Directions" }).getByText("Take the steps").first()).toBeVisible({ timeout: 30_000 });
    // About 180 m up at 4% to the south, and nearly nothing down.
    const climb = page.getByText(/^↑ \d+ m ↓ \d+ m$/);
    await expect(climb).toBeVisible();
    const [up, down] = ((await climb.textContent()) ?? "").match(/\d+/g)!.map(Number);
    expect(up).toBeGreaterThan(150);
    expect(up! - down!).toBeGreaterThan(150);
    await expect(page.getByText(/Steepest: \d+% uphill for/)).toBeVisible();
    await expect(page.getByText(/Hills counted, no stops\./)).toBeVisible();
    await expect(
      page.getByText("The time counts the hills over the installed terrain (Tobler's hiking function), but no stops or rests."),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await picture(page, info, "walk-route-hills");
    if (!card) return;

    await press(page.getByRole("button", { name: "Printable route card (PDF)" }));
    const bytes = await saveFrom(page, page.getByTestId("road-route-card").getByRole("link", { name: "Save as PDF" }));
    await info.attach("walk-route-hills.pdf", { body: bytes, contentType: "application/pdf" });
    if (process.env.OUTPOST_E2E_SHOTS)
      fs.writeFileSync(`${process.env.OUTPOST_E2E_SHOTS}/${info.project.name}-walk-route-hills.pdf`, bytes);
    const words = await pdfWords(bytes);
    expect(words).toMatch(/\d+ m of climb, \d+ m of descent; highest \d+ m, lowest \d+ m above sea level\./);
    expect(words).toContain("Heights along the way");
    expect(words).toContain("Kilometres from the start");
    expect(words).toContain("timed over the installed terrain (Test hills): Tobler's hiking function");
    expect(words).toContain("Take the steps");
    expect(words).toMatch(/Steepest: \d+% uphill/);
  } finally {
    removeStreets();
    for (const id of places) await api(page, "DELETE", `/api/maps/markers/${id}`);
    await page.request.delete(`/api/collections/${hills}?deleteFiles=true`, { headers: { "X-Outpost-Request": "1" } });
  }
  expect(errors).toEqual([]);
}

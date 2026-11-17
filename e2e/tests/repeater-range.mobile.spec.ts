/**
 * A repeater's estimated range on a phone the width of an iPhone (390 points): switched
 * on from the repeater's own page, worked out over terrain whose shape is known, drawn
 * on the map, said in words, and nothing pushed sideways off the screen.
 *
 * The terrain is the suite's fixture (e2e/tools/terrain-fixture.mjs): a plain at 100 m
 * with two ridges 400 m high along 3.5° W and 3.3° W, between 56.9° N and 57.1° N. A
 * repeater on the plain between them, at 3.4° W, is in sight up to each ridge east and
 * west, and up and down the valley until the terrain runs out: so the terrain covers
 * only part of the area, and the card says so.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

/** How many pixels of two pictures of the same part of the screen differ, as a share of them all. */
async function changedShare(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ([one, two]) => {
      const read = async (png: string) => {
        const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [a, b] = [await read(one!), await read(two!)];
      let changed = 0;
      for (let index = 0; index < a.length; index += 4) {
        if (Math.abs(a[index]! - b[index]!) + Math.abs(a[index + 1]! - b[index + 1]!) + Math.abs(a[index + 2]! - b[index + 2]!) > 6)
          changed += 1;
      }
      return changed / (a.length / 4);
    },
    [before.toString("base64"), after.toString("base64")],
  );
}

test("a repeater's estimated range: switched on from its page, drawn over terrain, and said in words", async ({ page }) => {
  const errors = watchForErrors(page);
  const { locations } = await api<{ locations: Array<{ id: string; path: string }> }>(page, "GET", "/api/storage/locations");
  const location = locations[0]!;
  execFileSync(process.execPath, [
    path.join(import.meta.dirname, "../tools/terrain-fixture.mjs"),
    path.join(location.path, "imports/e2e-range-ridges.pmtiles"),
  ]);
  const { collection } = await api<{ collection: { id: string } }>(page, "POST", "/api/maps/import", {
    locationId: location.id,
    relPath: "imports/e2e-range-ridges.pmtiles",
    name: "Two ridges",
    tileType: "terrain",
  });
  // Entered by hand, with no aerial height: the estimate assumes one and says so.
  const { repeater } = await api<{ repeater: { id: string } }>(page, "POST", "/api/repeaters", {
    callsign: "QZ3RNG",
    outputHz: 145_725_000,
    lat: 57,
    lon: -3.4,
    place: "Between the ridges",
  });

  try {
    await page.goto(`/radio/repeaters/${repeater.id}`);
    await expect(page.getByRole("heading", { name: "QZ3RNG", level: 1 })).toBeVisible();
    const asked = page.waitForResponse((response) => response.url().includes("/api/maps/sight-range"));
    await page.getByRole("link", { name: "Estimated range" }).tap();
    await idle(page);

    const card = page.getByRole("region", { name: "Estimated range" });
    await expect(card.getByRole("switch", { name: "Estimated range" })).toBeChecked();
    const answer = await (await asked).json();
    expect(answer).toMatchObject({ coverage: "partial", aerialMeters: 10, stationMeters: 1.5 });
    // The heights and the limit, the assumed one said to be assumed.
    await expect(card.getByText(/Repeater aerial 10 m above the ground, assumed: its list gives no height\./)).toBeVisible();
    await expect(card.getByText(/Handheld 1\.5 m: held at head height\. Out to 100 km/)).toBeVisible();
    await expect(card.getByRole("textbox", { name: "Repeater aerial" })).toHaveValue("10");
    // The answer: in sight to the ridges, and the terrain said to be only part of the area.
    await expect(card.getByText(/^In sight to about .* on most bearings/)).toBeVisible();
    await expect(card.getByText(/^Terrain is held for only part of the area within 100 km/)).toBeVisible();
    await expect(card.getByRole("button", { name: "Offline maps" })).toBeVisible();
    // What it is not, behind one disclosure.
    await card.getByText("What this is, and is not").tap();
    await expect(card.getByText(/It takes no account of transmitter power, aerial gain or pattern, frequency/)).toBeVisible();
    await expect(card.getByText(/A repeater may be heard beyond the outline and not heard inside it\./)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // The outline is on the map: switching it off changes a good part of the map round the repeater, at the same view.
    // The map was brought round the outline when it was worked out, so the repeater is at the centre of the clear map.
    await idle(page);
    const mark = (await page.locator("[data-centre-mark]").boundingBox())!;
    const clip = { x: mark.x + mark.width / 2 - 40, y: mark.y + mark.height / 2 - 40, width: 80, height: 80 };
    const on = await page.screenshot({ clip });
    await card.getByRole("switch", { name: "Estimated range" }).tap();
    await expect(card.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    await expect(card.getByText(/^In sight to about/)).toBeHidden();
    await idle(page);
    const off = await page.screenshot({ clip });
    expect(await changedShare(page, on, off)).toBeGreaterThan(0.15);
    expect(errors).toEqual([]);
  } finally {
    await api(page, "DELETE", `/api/repeaters/${repeater.id}`);
    // Other tests expect no terrain to be installed.
    await api(page, "DELETE", `/api/collections/${collection.id}?deleteFiles=true`);
  }
});

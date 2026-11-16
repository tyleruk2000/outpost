import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

/**
 * Where a position is on screen for a view, worked out independently of the app: the
 * map is Web Mercator, `zoom` 0 is one 512 px tile, and the view's centre is the centre
 * of the map's box.
 */
function offsetOf(view: { lat: number; lon: number; zoom: number }, position: { lat: number; lon: number }): { dx: number; dy: number } {
  const world = 512 * 2 ** view.zoom;
  const down = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
  return { dx: ((position.lon - view.lon) / 360) * world, dy: (down(position.lat) - down(view.lat)) * world };
}

async function press(page: Page, view: { lat: number; lon: number; zoom: number }, position: { lat: number; lon: number }) {
  const box = (await page.locator(".outpost-map").boundingBox())!;
  const { dx, dy } = offsetOf(view, position);
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

const idle = (page: Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

test.describe("radio tools on the map", () => {
  test.describe.configure({ mode: "serial" });

  test("draws the Maidenhead grid, reads positions as locators, and finds a locator from the search box", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=53.5&lon=-2.6&z=6");
    await idle(page);
    const map = page.locator(".outpost-map canvas").first();
    const plain = await map.screenshot();

    // The grid is switched on from the map's controls, changes what is drawn, and is remembered.
    const grid = page.getByRole("button", { name: "Maidenhead locator grid" });
    await expect(grid).toHaveAttribute("aria-pressed", "false");
    await grid.click();
    await expect(grid).toHaveAttribute("aria-pressed", "true");
    await idle(page);
    await expect.poll(async () => (await map.screenshot()).equals(plain), { timeout: 10_000 }).toBe(false);
    await page.reload();
    await idle(page);
    await expect(page.getByRole("button", { name: "Maidenhead locator grid" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Maidenhead locator grid" }).click();

    // A locator typed into the search is a position: the middle of its square, and the list says which square.
    await page.getByLabel("Search the map").fill("io83qm");
    const option = page.getByRole("option", { name: /IO83QM/ });
    await expect(option).toContainText("Middle of a locator subsquare");
    await option.click();
    await expect(page.getByRole("heading", { name: "IO83QM" })).toBeVisible();
    await expect(page.getByText(/Middle of a locator subsquare, 5\.\d+ km × 4\.\d+ km/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy coordinates 53.52083, -2.62500" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy Maidenhead locator IO83QM" })).toBeVisible();
    // The map has gone there.
    await expect.poll(() => new URL(page.url()).searchParams.get("lat")).toMatch(/^53\.52/);
    // The readout under the map can give positions as locators: an extended square, this close in.
    await page.getByRole("button", { name: /Coordinate format/ }).click();
    await page.getByRole("menuitemcheckbox", { name: "Maidenhead locator" }).click();
    await expect(page.getByRole("button", { name: "Copy these coordinates" })).toContainText("IO83QM");
    // The pin's own position is then the locator, and is not given a second time.
    await expect(page.getByRole("button", { name: /Copy coordinates IO83QM\d\d/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy Maidenhead locator/ })).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("checks line of sight over terrain whose shape is known: blocked across a ridge, clear from crest to crest", async ({ page }) => {
    const errors = watchForErrors(page);
    // Terrain made the way the server's tests make theirs: a plain at 100 m with two ridges 400 m
    // high, along 3.5° W and 3.3° W (see e2e/tools/terrain-fixture.mjs). Installed as a person would
    // install a file of their own.
    const { locations } = await api<{ locations: Array<{ id: string; path: string }> }>(page, "GET", "/api/storage/locations");
    const location = locations[0]!;
    execFileSync(process.execPath, [
      path.join(import.meta.dirname, "../tools/terrain-fixture.mjs"),
      path.join(location.path, "imports/e2e-ridges.pmtiles"),
    ]);
    const { collection } = await api<{ collection: { id: string } }>(page, "POST", "/api/maps/import", {
      locationId: location.id,
      relPath: "imports/e2e-ridges.pmtiles",
      name: "Two ridges",
      tileType: "terrain",
    });

    try {
      const view = { lat: 57.02, lon: -3.45, zoom: 10.3 };
      await page.goto(`/maps?lat=${view.lat}&lon=${view.lon}&z=${view.zoom}`);
      await idle(page);
      await page.getByRole("button", { name: "Line of sight between two points" }).click();
      const panel = page.getByRole("region", { name: "Line of sight" });
      await expect(panel.getByText(/Click or tap the map where the first antenna is/)).toBeVisible();

      // From the plain west of the first ridge to the plain east of it.
      await press(page, view, { lat: 57.02, lon: -3.6 });
      await expect(panel.getByText(/Now click or tap where the other antenna is/)).toBeVisible();
      await press(page, view, { lat: 57.02, lon: -3.4 });

      // Each end with its locator; the distance and the bearing each way.
      await expect(panel.getByText("IO87EA")).toBeVisible();
      await expect(panel.getByText("IO87HA")).toBeVisible();
      await expect(panel.getByText(/^12\.1 km \(7\.5\d mi\)$/)).toBeVisible();
      await expect(panel.getByText(/A to B 90° E/)).toBeVisible();
      await expect(panel.getByText(/B to A 270° W/)).toBeVisible();

      // 10 m masts at 100 m and a crest at 500 m midway: 390 m of ground above the ray, and 2 m of curve.
      await expect(panel.getByText("Blocked", { exact: true })).toBeVisible();
      await expect(panel.getByText(/At its worst, 6\.\d+ km from A, it is 39[0-4] m above the straight line/)).toBeVisible();
      // The path is drawn, with the curve said to be the 4/3 one, and can be read along.
      const chart = panel.getByRole("slider", { name: /Position along the path from A to B/ });
      await expect(panel.getByText(/It is the curve of an Earth of 4\/3 radius/)).toBeVisible();
      await chart.focus();
      await page.keyboard.press("End");
      await expect(chart).toHaveAttribute("aria-valuetext", /^12\.1 km from A: ground 10\d m, ray 10 m above it$/);
      // What it rests on, and what it is not.
      await expect(panel.getByText(/Ground read every 10 m from installed terrain whose cells are about 8\d m wide here\./)).toBeVisible();
      await expect(panel.getByText(/The terrain knows nothing of buildings, trees or masts\./)).toBeVisible();
      await expect(panel.getByText(/Nothing here predicts signal strength or coverage\./)).toBeVisible();

      // Taller masts than any there are: the ray goes over, and the answer follows without asking the server again.
      await panel.getByRole("textbox", { name: "Antenna at A" }).fill("450");
      await panel.getByRole("textbox", { name: "Antenna at B" }).fill("450");
      await expect(panel.getByText("Blocked", { exact: true })).toBeHidden();
      await panel.getByRole("textbox", { name: "Antenna at A" }).fill("10");
      await panel.getByRole("textbox", { name: "Antenna at B" }).fill("10");
      await expect(panel.getByText("Blocked", { exact: true })).toBeVisible();

      // From the crest of one ridge to the crest of the other, over the valley between.
      await panel.getByRole("button", { name: "Start again" }).click();
      await press(page, view, { lat: 57.025, lon: -3.5 });
      await press(page, view, { lat: 57.015, lon: -3.3 });
      await expect(panel.getByText("Clear", { exact: true })).toBeVisible();
      await expect(panel.getByText(/Nothing stands in the way, and the first Fresnel zone is clear enough all along\./)).toBeVisible();
      await expect(panel.getByText(/the usual guide asks for 60%/)).toBeVisible();

      // A longer wave has a wider zone: at 10 m the ground near each crest is inside it.
      await panel.getByRole("combobox", { name: "Band" }).click();
      await page.getByRole("option", { name: /^10 m/ }).click();
      await expect(panel.getByText("In sight, with the Fresnel zone partly blocked")).toBeVisible();

      // Escape puts the tool down, and the panel's tabs are back.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tab", { name: /Places/ })).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      // Other tests expect no terrain to be installed.
      await api(page, "DELETE", `/api/collections/${collection.id}?deleteFiles=true`);
    }
  });
});

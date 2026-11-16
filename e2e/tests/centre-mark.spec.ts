/**
 * The cross at the centre of the map, on a wide screen.
 *
 * "The centre of the map" is what the readout at the bottom gives while it says "Centre",
 * and what the Sun tab works its times out for. The cross has to be on that point: not
 * near it, and not at the middle of the map's box, which is somewhere else once the
 * camera has made room for the controls. Every check here finds a point on the ground
 * independently (a pin flown to, a right-click) and holds the cross to it.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

test.use({ timezoneId: "Europe/London" });

const mark = (page: Page) => page.locator("[data-centre-mark]");
const readout = (page: Page) => page.getByRole("button", { name: "Copy these coordinates" });

async function markAt(page: Page): Promise<{ x: number; y: number }> {
  const box = await mark(page).boundingBox();
  expect(box, "the cross").not.toBeNull();
  return { x: box!.x, y: box!.y };
}

test.describe("the centre of the map", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
  });

  test("is marked with a cross wherever something reads it, on the point that is read", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=51.48&lon=0&z=9");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();
    const map = (await page.locator("canvas").first().boundingBox())!;

    // No pointer on the map: the readout gives the centre, and the cross shows where that is.
    await page.mouse.move(40, 400);
    await expect(readout(page)).toContainText("Centre");
    await expect(readout(page)).toContainText("51.4800, 0.0000");
    await expect(mark(page)).toBeVisible();
    const at = await markAt(page);
    // On the map, clear of what lies over it.
    expect(at.x).toBeGreaterThan(map.x + 100);
    expect(at.x).toBeLessThan(map.x + map.width - 100);
    expect(at.y).toBeGreaterThan(map.y + 100);
    expect(at.y).toBeLessThan(map.y + map.height - 100);

    // The ground under the cross is the point the readout names: a right-click there says so in its own words.
    await page.mouse.click(at.x, at.y, { button: "right" });
    const menu = page.getByRole("menu", { name: "At this point" });
    await expect(menu).toBeVisible();
    const [lat, lon] = ((await menu.textContent())!.match(/(-?\d+\.\d+), (-?\d+\.\d+)/) ?? []).slice(1).map(Number) as [number, number];
    // To within a pixel of the screen, which at this zoom is about a thousandth of a degree.
    expect(Math.abs(lat - 51.48), `latitude under the cross: ${lat}`).toBeLessThan(0.0015);
    expect(Math.abs(lon - 0), `longitude under the cross: ${lon}`).toBeLessThan(0.0025);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // A pointer over the map: the readout gives the pointer's position instead, and the cross is put away,
    // so it is never taken for the point the readout is giving.
    await page.mouse.move(at.x + 180, at.y + 140);
    await expect(readout(page)).toContainText("Pointer");
    await expect(mark(page)).toBeHidden();
    await page.mouse.move(40, 400);
    await expect(mark(page)).toBeVisible();

    // The Sun tab reads the centre whatever the pointer does, says so, and the cross stays.
    await page.getByRole("tab", { name: "Sun" }).click();
    await expect(page.getByRole("heading", { name: "Sun at the centre of the map" })).toBeVisible();
    await expect(page.getByText("Centre of the map, marked with a cross:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy coordinates 51.4800, 0.0000" })).toBeVisible();
    await page.mouse.move(at.x + 180, at.y + 140);
    await expect(readout(page)).toContainText("Pointer");
    await expect(mark(page)).toBeVisible();
    expect(await markAt(page)).toEqual(at);

    // After the map has flown somewhere, the centre is that place, and the cross is on it: the pin dropped
    // on the place found and the cross are at the same point on the screen.
    await page.getByLabel("Search the map").fill("51.6, 0.2");
    await page.getByRole("option").first().click();
    await expect(page.getByRole("button", { name: /^Copy coordinates 51\.6000?0?, 0\.2000?0?$/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });
    const pin = (await page.locator(".outpost-pin").boundingBox())!;
    const tip = { x: pin.x + pin.width / 2, y: pin.y + pin.height };
    const after = await markAt(page);
    expect(Math.abs(after.x - tip.x), "the cross and the pin, across").toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.y - tip.y), "the cross and the pin, down").toBeLessThanOrEqual(1.5);
    // The times are for that point now.
    await expect(page.getByText(/^Sunrise 04:\d\d, sunset 21:\d\d$/)).toBeAttached();
    expect(errors).toEqual([]);
  });
});

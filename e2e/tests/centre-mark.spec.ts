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
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ timezoneId: "Europe/London" });

const mark = (page: Page) => page.locator("[data-centre-mark]");
const readout = (page: Page) => page.getByRole("button", { name: "Copy these coordinates" });

async function markAt(page: Page): Promise<{ x: number; y: number }> {
  const box = await mark(page).boundingBox();
  expect(box, "the cross").not.toBeNull();
  // The cross is a small box with the point in its middle.
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
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
    await expect(page.getByRole("tabpanel", { name: "Sun" }).getByText(/^Sunrise 04:\d\d, sunset 21:\d\d$/)).toBeAttached();
    expect(errors).toEqual([]);
  });

  test("after a fly, a place that is opened and a route that is fitted land in the middle of the clear part of the map", async ({
    page,
  }) => {
    // The camera keeps room for the column of controls from its first fly onwards. A fit used to keep that room a
    // second time on top, and landed 28 px to the left of where everything else does.
    const errors = watchForErrors(page);
    const centre = { lat: 51.52, lon: -0.12 };
    const { marker } = await api(page, "POST", "/api/maps/markers", {
      name: "Fit check place",
      lat: centre.lat + 0.05,
      lon: centre.lon - 0.09,
    });
    const { track } = await api(page, "POST", "/api/maps/tracks", {
      name: "Fit check route",
      color: "teal",
      // A box about `centre`, so the middle of the route's bounds is known.
      points: [
        { lat: centre.lat - 0.02, lon: centre.lon - 0.03 },
        { lat: centre.lat + 0.02, lon: centre.lon - 0.03 },
        { lat: centre.lat + 0.02, lon: centre.lon + 0.03 },
        { lat: centre.lat - 0.02, lon: centre.lon + 0.03 },
      ],
    });
    try {
      await page.goto("/maps?lat=51.48&lon=0&z=9");
      await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });
      const dismiss = page.getByRole("button", { name: "Dismiss" });
      if (await dismiss.isVisible()) await dismiss.click();
      const map = (await page.locator("canvas").first().boundingBox())!;
      // What lies over the map on a wide screen: 16 px at the top, and the column of controls, 56 px, at the right.
      const clear = { x: map.x + (map.width - 56) / 2, y: map.y + (16 + map.height) / 2 };
      const atRest = async () => {
        await page.mouse.move(40, 400);
        await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });
      };

      // A fly, to anywhere.
      await page.getByLabel("Search the map").fill("51.6, 0.2");
      await page.getByRole("option").first().click();
      await expect(page.getByRole("button", { name: /^Copy coordinates 51\.6000?0?, 0\.2000?0?$/ })).toBeVisible({ timeout: 15_000 });
      await atRest();

      // A place opened after it: its pin is in the middle of the clear part.
      await page.getByRole("tab", { name: /^Places/ }).click();
      await page
        .getByRole("button", { name: /^Fit check place/ })
        .first()
        .click();
      await expect(page.getByRole("heading", { name: "Fit check place" })).toBeVisible();
      await expect
        .poll(async () => {
          const pin = await page.locator(".outpost-pin").boundingBox();
          return pin ? Math.hypot(pin.x + pin.width / 2 - clear.x, pin.y + pin.height - clear.y) : 999;
        })
        .toBeLessThanOrEqual(2);

      // A route fitted after it: the middle of its bounds is the centre of the map, and that is in the middle of the clear part.
      await page.getByRole("tab", { name: /^Routes/ }).click();
      await page
        .getByRole("button", { name: /^Fit check route/ })
        .first()
        .click();
      await expect(page.getByRole("heading", { name: "Fit check route" })).toBeVisible();
      await atRest();
      await expect(readout(page)).toContainText("Centre");
      await expect
        .poll(async () => {
          const [lat, lon] = (((await readout(page).textContent()) ?? "").match(/(-?\d+\.\d+), (-?\d+\.\d+)/) ?? []).slice(1).map(Number);
          return Math.max(Math.abs((lat ?? 0) - centre.lat), Math.abs((lon ?? 0) - centre.lon));
        }, "the centre of the map is the middle of the route's bounds")
        .toBeLessThan(0.0006);
      const cross = await markAt(page);
      expect(Math.abs(cross.x - clear.x), "the centre, across").toBeLessThanOrEqual(2);
      expect(Math.abs(cross.y - clear.y), "the centre, down").toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
    } finally {
      await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
      await api(page, "DELETE", `/api/maps/tracks/${track.id}`);
    }
  });
});

/**
 * The grey line, from the button to what the map draws: night shaded where it is night
 * and nowhere else, the time it is drawn for said in words, another time chosen and then
 * "now" again, the choice remembered, the Sun tab on the same day, and the time printed
 * on a page.
 *
 * The clock is held still at noon UTC on the June solstice of 2026, on a device that
 * keeps London time (13:00 there). Only `Date` is held: the map draws as it always does.
 */
import { expect, test, watchForErrors } from "./fixtures";
import { centreOf, lightnessAt, mapReady, settled } from "./grey-line";
import { CENTRE, type InstalledTestMaps, installTestMaps, removeTestMaps } from "./map-fixture";

test.use({ timezoneId: "Europe/London" });

const NOON = new Date("2026-06-21T12:00:00Z");
/** The whole world, centred on Greenwich: at zoom 0.5 a degree of longitude is 512 × √2 / 360 pixels. */
const WORLD = "/maps?lat=0&lon=0&z=0.5";
const PX_PER_DEGREE = (512 * Math.SQRT2) / 360;

test.describe("the grey line", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOON);
  });

  test("shades the night side of the world and not the day side, says when for, and goes to another time and back", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(WORLD);
    await mapReady(page);
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();
    const centre = await centreOf(page);
    // The pointer off the map, so the cross and any tooltip are out of the way.
    await page.mouse.move(5, 5);

    // At noon UTC it is noon at 0° and about midnight at ±150°: the middle of the day and of the night.
    const day = { x: Math.round(centre.x + 30 * PX_PER_DEGREE), y: centre.y };
    const nightEast = { x: Math.round(centre.x + 150 * PX_PER_DEGREE), y: centre.y };
    const nightWest = { x: Math.round(centre.x - 150 * PX_PER_DEGREE), y: centre.y };
    const before = {
      day: await lightnessAt(page, day),
      east: await lightnessAt(page, nightEast),
      west: await lightnessAt(page, nightWest),
    };

    const button = page.getByRole("button", { name: "Grey line (day and night)" });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const legend = page.getByRole("region", { name: "Grey line" });
    await expect(legend).toBeVisible();
    // On this device's clock, as the Sun tab has it unless UTC is chosen.
    await expect(legend.locator("[data-grey-line-time]")).toHaveText("Now, 13:00 on Sunday 21 June 2026");
    await expect(legend.getByText("Twilight, deepening")).toBeVisible();

    await settled(page);
    await page.mouse.move(5, 5);
    await expect
      .poll(async () => before.east - (await lightnessAt(page, nightEast)), { message: "night east of the date line" })
      .toBeGreaterThan(20);
    expect(before.west - (await lightnessAt(page, nightWest)), "night west of the date line").toBeGreaterThan(20);
    expect(Math.abs((await lightnessAt(page, day)) - before.day), "day is left as it was").toBeLessThan(3);

    // Midnight UTC, chosen on this device's clock (01:00 in London): Greenwich's side of the world is now in night.
    await legend.getByRole("button", { name: "Choose the time it is drawn for" }).click();
    await legend.getByLabel("Time of the grey line").fill("01:00");
    await expect(legend.locator("[data-grey-line-time]")).toHaveText("Not now: drawn for 01:00 on Sunday 21 June 2026");
    await settled(page);
    await page.mouse.move(5, 5);
    await expect.poll(async () => before.day - (await lightnessAt(page, day)), { message: "0° at midnight" }).toBeGreaterThan(20);
    expect(Math.abs((await lightnessAt(page, nightEast)) - before.east), "150° east at noon its time").toBeLessThan(3);

    // One press back to now.
    await legend.getByRole("button", { name: "Now", exact: true }).click();
    await expect(legend.locator("[data-grey-line-time]")).toHaveText("Now, 13:00 on Sunday 21 June 2026");
    await expect(legend.getByRole("button", { name: "Back to now" })).toHaveCount(0);

    // In UTC, as a radio log writes it.
    await legend.getByRole("button", { name: "Use UTC" }).click();
    await expect(legend.locator("[data-grey-line-time]")).toHaveText("Now, 12:00 UTC on Sunday 21 June 2026");

    // Remembered on this device; the moment chosen is not.
    await page.reload();
    await mapReady(page);
    await expect(page.getByRole("button", { name: "Grey line (day and night)" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Grey line" }).locator("[data-grey-line-time]")).toHaveText(
      "Now, 12:00 UTC on Sunday 21 June 2026",
    );
    expect(errors).toEqual([]);
  });

  test("draws the night whole across the 180° meridian", async ({ page }) => {
    await page.goto("/maps?lat=10&lon=180&z=3");
    await mapReady(page);
    const dismiss = page.getByRole("button", { name: "Dismiss" });
    if (await dismiss.isVisible()) await dismiss.click();
    const centre = await centreOf(page);
    await page.mouse.move(5, 5);
    // Either side of the date line, a few degrees apart: both in the middle of the night at noon UTC.
    const sides = [-60, -20, 20, 60].map((dx) => ({ x: centre.x + dx, y: centre.y + 40 }));
    const before = await Promise.all(sides.map((at) => lightnessAt(page, at)));
    await page.getByRole("button", { name: "Grey line (day and night)" }).click();
    await settled(page);
    await page.mouse.move(5, 5);
    await expect.poll(async () => before[0]! - (await lightnessAt(page, sides[0]!))).toBeGreaterThan(20);
    const darkened = await Promise.all(sides.map(async (at, index) => before[index]! - (await lightnessAt(page, at))));
    for (const amount of darkened) expect(Math.abs(amount - darkened[0]!), `${darkened}`).toBeLessThan(3);
    // Panned across the line, it stays put.
    await page.mouse.move(centre.x, centre.y + 120);
    await page.mouse.down();
    await page.mouse.move(centre.x - 300, centre.y + 120, { steps: 10 });
    await page.mouse.up();
    await settled(page);
    await page.mouse.move(5, 5);
    const after = await lightnessAt(page, { x: centre.x - 300, y: centre.y + 40 });
    expect(Math.abs(before[0]! - darkened[0]! - after)).toBeLessThan(12);
  });

  test("shares its day with the Sun tab", async ({ page }) => {
    await page.goto("/maps?lat=51.48&lon=0&z=5");
    await mapReady(page);
    await page.getByRole("button", { name: "Grey line (day and night)" }).click();
    const legend = page.getByRole("region", { name: "Grey line" });
    await page.getByRole("tab", { name: /Sun/ }).click();
    await page.getByRole("button", { name: "The day after" }).click();
    await expect(legend.locator("[data-grey-line-time]")).toHaveText(/^Not now: drawn for \d\d:00( UTC)? on Monday 22 June 2026$/);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(legend.locator("[data-grey-line-time]")).toHaveText(/^Now, /);
  });
});

test.describe("the grey line on a printed page", () => {
  let installed: InstalledTestMaps | undefined;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    installed = await installTestMaps(page);
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await removeTestMaps(page, installed);
    await page.close();
  });

  test("is printed when it is on, with the time it is drawn for", async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.setFixedTime(NOON);
    await page.goto(`/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12.5`);
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Grey line (day and night)" }).click();
    await page.getByRole("button", { name: "Print or save as PDF" }).click();
    await page.getByRole("button", { name: "Preview the page" }).click();
    const dialog = page.getByRole("dialog", { name: "Print or save as PDF" });
    await expect(dialog.getByRole("checkbox", { name: /Grey line \(day and night\)/ })).toBeChecked();
    const sheet = dialog.getByRole("img", { name: /Preview of the page/ });
    await expect(sheet).toContainText("Day and night are drawn for 12:00 UTC on Sunday 21 June 2026.");

    await dialog.getByRole("checkbox", { name: /Grey line \(day and night\)/ }).uncheck();
    await expect(sheet).not.toContainText("Day and night are drawn for");
  });
});

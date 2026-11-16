/**
 * Sunrise and sunset for a place, with the clock and the time zone held still: it is
 * mid-morning on the June solstice of 2026 on a device that keeps London time.
 *
 * The times looked for are the US Naval Observatory's for Greenwich and Tromsø (the
 * values and where they were read are in apps/web/src/features/maps/lib/sun.test.ts),
 * moved onto a London clock.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ timezoneId: "Europe/London" });

/** The value beside a label in the Sun section. */
const row = (page: Page, label: string) =>
  page
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: label }) })
    .locator("dd");

test.describe("sun times for a place", () => {
  const made: string[] = [];

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
  });

  // Other tests count the saved places; leave none behind.
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    for (const id of made) await page.request.fetch(`/api/maps/markers/${id}`, { method: "DELETE", headers: { "X-Outpost-Request": "1" } });
    await page.close();
  });

  test("a saved place gives its sun times for today, for another date, and in UTC", async ({ page }) => {
    const errors = watchForErrors(page);
    const { marker } = await api(page, "POST", "/api/maps/markers", { name: "Greenwich meridian", lat: 51.48, lon: 0 });
    made.push(marker.id);

    await page.goto("/maps");
    await page.getByRole("tab", { name: /Places/ }).click();
    await page.getByRole("button", { name: /^Greenwich meridian/ }).click();
    await expect(page.getByRole("heading", { name: "Greenwich meridian" })).toBeVisible();

    // Folded, it is one line that already answers the question.
    const sun = page.getByRole("button", { name: /^Sun/ });
    await expect(sun).toHaveAttribute("aria-expanded", "false");
    await expect(sun).toContainText("Sunrise 04:43, sunset 21:21");

    await sun.click();
    await expect(row(page, "First light (civil dawn)")).toHaveText("03:55");
    await expect(row(page, "Sunrise")).toContainText("04:43");
    // The bearing has a row of its own, under the times, so that the two large times stand alone.
    await expect(row(page, "Rises towards")).toHaveText("49° NE");
    await expect(row(page, "Sets towards")).toHaveText("311° NW");
    await expect(row(page, "Solar noon")).toContainText("13:02");
    await expect(row(page, "Sunset")).toContainText("21:21");
    await expect(row(page, "Last light (civil dusk)")).toHaveText("22:09");
    await expect(row(page, "Day length")).toContainText("16 h 38 min");
    await expect(row(page, "Nautical twilight")).toHaveText("02:41 to 23:23");
    await expect(row(page, "Moon")).toHaveText("First quarter, 46% lit");
    await expect(page.getByText("Times are in this device’s time zone, Europe/London (UTC+1).")).toBeVisible();
    await expect(page.getByText(/flat horizon at sea level/)).toBeVisible();

    // Another date: the March equinox, when London keeps UTC.
    const date = page.getByLabel("Date", { exact: true });
    await expect(date).toHaveValue("2026-06-21");
    await date.fill("2026-03-20");
    await expect(row(page, "Sunrise")).toContainText("06:03");
    await expect(row(page, "Sunset")).toContainText("18:13");
    await expect(row(page, "Nautical twilight")).toHaveText("04:50 to 19:26");
    await expect(page.getByText("Times are in this device’s time zone, Europe/London (UTC+0).")).toBeVisible();

    // A day either way, and back to today.
    await page.getByRole("button", { name: "The day before" }).click();
    await expect(date).toHaveValue("2026-03-19");
    await expect(row(page, "Sunrise")).toContainText("06:05");
    await page.getByRole("button", { name: "The day after" }).click();
    await page.getByRole("button", { name: "The day after" }).click();
    await expect(date).toHaveValue("2026-03-21");
    await page.getByRole("button", { name: "Today" }).click();
    await expect(date).toHaveValue("2026-06-21");

    // UTC, for the radio log.
    await page.getByRole("radio", { name: "UTC" }).click();
    await expect(row(page, "Sunrise")).toContainText("03:43");
    await expect(row(page, "Sunset")).toContainText("20:21");
    await expect(page.getByText("Times are in UTC.")).toBeVisible();
    await page.getByRole("radio", { name: "This device’s time" }).click();
    await expect(row(page, "Sunrise")).toContainText("04:43");

    // Looking at sun times changed nothing about the place.
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("a place in the far north says in words that the sun does not set, or does not rise", async ({ page }) => {
    const errors = watchForErrors(page);
    const { marker } = await api(page, "POST", "/api/maps/markers", { name: "Tromsø harbour", lat: 69.65, lon: 18.96 });
    made.push(marker.id);

    await page.goto("/maps");
    await page.getByRole("tab", { name: /Places/ }).click();
    await page.getByRole("button", { name: /^Tromsø harbour/ }).click();
    const sun = page.getByRole("button", { name: /^Sun/ });
    await expect(sun).toContainText("The sun does not set");
    await sun.click();
    await expect(row(page, "Sun")).toHaveText("Does not set on this date (midnight sun)");
    await expect(row(page, "Day length")).toHaveText("24 hours");
    await expect(page.locator("dt", { hasText: "Sunrise" })).toHaveCount(0);

    await page.getByLabel("Date", { exact: true }).fill("2026-12-21");
    await expect(row(page, "Sun")).toHaveText("Does not rise on this date (polar night)");
    // There is still twilight around midday: published as 09:31 to 13:53 an hour ahead of London.
    await expect(row(page, "First light (civil dawn)")).toHaveText("08:31");
    await expect(row(page, "Last light (civil dusk)")).toHaveText("12:53");
    await expect(row(page, "Day length")).toHaveText("No daylight");
    await expect(page.getByLabel("Places, routes and offline maps")).not.toContainText(/Invalid|NaN/);
    expect(errors).toEqual([]);
  });

  test("a point pressed on the map gives its sun times from the menu there", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=51.48&lon=0&z=9");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
    await page.getByRole("menuitem", { name: "Sun times here" }).click();

    // A pin with its card, the sun times already unfolded.
    await expect(page.getByText("A point chosen on the map")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sun/ })).toHaveAttribute("aria-expanded", "true");
    await expect(row(page, "Sunrise")).toContainText("04:43");
    await expect(row(page, "Sunset")).toContainText("21:21");
    await expect(page.getByRole("button", { name: "Save this place" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test.describe("where the device is", () => {
    test.use({ geolocation: { latitude: 51.48, longitude: 0, accuracy: 12 }, permissions: ["geolocation"] });

    test("gets a card with its position and its sun times while it is being followed", async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto("/maps");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Show where I am" }).click();

      await expect(page.getByRole("heading", { name: "Where you are" })).toBeVisible();
      await expect(page.getByText("To within about 12 m")).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy coordinates 51.48000, 0.00000" })).toBeVisible();
      const sun = page.getByRole("button", { name: /^Sun/ });
      await expect(sun).toContainText("Sunrise 04:43, sunset 21:21");

      // Put away, it stays away until the position is asked for again.
      await page.getByRole("button", { name: "Hide this card" }).click();
      await expect(page.getByRole("heading", { name: "Where you are" })).toBeHidden();
      await page.getByRole("button", { name: "Stop showing where I am" }).click();
      await page.getByRole("button", { name: "Show where I am" }).click();
      await expect(page.getByRole("heading", { name: "Where you are" })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
});

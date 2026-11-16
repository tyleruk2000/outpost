/**
 * The Clock choice in Settings: 24-hour or 12-hour, for every time of day the app writes.
 * It is kept in the browser, so each test starts from "as this device", and the device
 * here uses the 24-hour clock (see playwright.config.ts).
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ timezoneId: "Europe/London" });

test.describe("the clock", () => {
  // The schedule is the server's, shared with the other tests: left off, as it was found.
  test.afterAll(async ({ request }) => {
    const headers = { "X-Outpost-Request": "1", "Content-Type": "application/json" };
    await request.patch("/api/backup/schedule", { headers, data: JSON.stringify({ locationId: null }) });
  });

  test("changes every time on the Settings screen at once, and is remembered", async ({ page }) => {
    const errors = watchForErrors(page);
    // Something on this screen that has times in it: a backup schedule.
    const { locations } = await api(page, "GET", "/api/storage/locations");
    await api(page, "PATCH", "/api/backup/schedule", { locationId: locations[0].id });

    await page.goto("/settings");
    const clock = page.getByRole("radiogroup", { name: "Clock" });
    await expect(clock.getByRole("radio", { name: "As this device" })).toBeChecked();
    await expect(page.getByText(/14:30 or 2:30 pm\. This device uses the 24-hour clock, as far as its browser says\./)).toBeVisible();
    const backups = page.getByRole("region", { name: "Automatic backups" });
    await expect(backups.getByText(/Every day at 03:00, by the clock of the computer Outpost runs on/)).toBeVisible();
    await expect(backups.getByText(/Next one \d+ \w+ \d{4}, \d\d:\d\d\.$/)).toBeVisible();

    await clock.getByRole("radio", { name: "12-hour" }).click();
    await expect(backups.getByText(/Every day at 3:00 am, by the clock of the computer Outpost runs on/)).toBeVisible();
    await expect(backups.getByText(/Next one \d+ \w+ \d{4}, \d{1,2}:\d\d [ap]m\.$/)).toBeVisible();
    // Not one 24-hour time is left on the screen beside them, except the example in the setting's own words.
    await expect(backups).not.toContainText(/\b\d\d:\d\d\b(?! [ap]m)/);

    // Remembered in this browser, on every screen.
    await page.reload();
    await expect(clock.getByRole("radio", { name: "12-hour" })).toBeChecked();
    await expect(backups.getByText(/Every day at 3:00 am/)).toBeVisible();

    await clock.getByRole("radio", { name: "24-hour" }).click();
    await expect(backups.getByText(/Every day at 03:00/)).toBeVisible();
    await clock.getByRole("radio", { name: "As this device" }).click();
    await expect(backups.getByText(/Every day at 03:00/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("outpost.clock"))).toBeNull();
    expect(errors).toEqual([]);
  });

  test("is the one the Sun section of a place writes its times on, with UTC always 24-hour", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
    await page.goto("/settings");
    await page.getByRole("radiogroup", { name: "Clock" }).getByRole("radio", { name: "12-hour" }).click();

    // No place is saved: the Sun tab gives the centre of the map.
    await page.goto("/maps?lat=51.48&lon=0&z=9");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Sun" }).click();
    await expect(page.getByText("Sunrise 4:43 am, sunset 9:21 pm", { exact: true })).toBeVisible();
    const row = (label: string) =>
      page
        .locator("dl > div")
        .filter({ has: page.locator("dt", { hasText: label }) })
        .locator("dd");
    await expect(row("Solar noon")).toContainText("1:02 pm");
    await expect(row("Last light (civil dusk)")).toHaveText("10:09 pm");

    await page.getByRole("radio", { name: "UTC" }).click();
    await expect(page.getByText("Sunrise 03:43, sunset 20:21 UTC", { exact: true })).toBeVisible();
    await expect(row("Solar noon")).toContainText("12:02 UTC");
    await expect(row("Nautical twilight")).toHaveText("01:41 UTC to 22:23 UTC");

    // The same from the map's menu: a pin with its sun times.
    await page.getByRole("radio", { name: "This device’s time" }).click();
    const canvas = (await page.locator("canvas").first().boundingBox())!;
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { button: "right" });
    await page.getByRole("menuitem", { name: "Sun times here" }).click();
    const card = page.locator("section", { has: page.getByText("A point chosen on the map") });
    await expect(card.locator("dl > div").filter({ hasText: "Sunrise" }).locator("dd")).toContainText("4:43 am");
    expect(errors).toEqual([]);
  });
});

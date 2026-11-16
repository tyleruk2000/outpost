/** The Sun section of a saved place on a phone: everything in reach, nothing spilling sideways. */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 360, height: 740 }, timezoneId: "Europe/London" });

test.describe("sun times for a place, on a phone", () => {
  let id: string | undefined;

  test.afterAll(async ({ browser }) => {
    if (!id) return;
    const page = await browser.newPage();
    await page.request.fetch(`/api/maps/markers/${id}`, { method: "DELETE", headers: { "X-Outpost-Request": "1" } });
    await page.close();
  });

  test("opens in the place's sheet with touch-sized controls", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
    // Far to the east of London, so the line about the place's own clock is there too: the longest the section gets.
    const { marker } = await api(page, "POST", "/api/maps/markers", { name: "Suva waterfront", lat: -18.14, lon: 178.44 });
    id = marker.id;

    await page.goto("/maps");
    await page.getByRole("tab", { name: /Places/ }).tap();
    await page.getByRole("button", { name: /^Suva waterfront/ }).tap();
    const sun = page.getByRole("button", { name: /^Sun/ });
    await sun.scrollIntoViewIfNeeded();
    await sun.tap();

    const sunset = page.locator("dt", { hasText: "Sunset" });
    await sunset.scrollIntoViewIfNeeded();
    await expect(sunset).toBeVisible();
    await expect(page.getByText(/this place runs about 12 hours ahead of this device’s time zone/)).toBeAttached();

    for (const name of ["The day before", "The day after"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    const toggle = (await sun.boundingBox())!;
    expect(toggle.height).toBeGreaterThanOrEqual(44);

    // Nothing in the section is wider than the sheet, and the page does not scroll sideways.
    const spill = await page.evaluate(() => {
      const section = [...document.querySelectorAll("section")].find((item) =>
        item.querySelector("button[aria-expanded]")?.textContent?.startsWith("Sun"),
      );
      if (!section) return "no section";
      const edge = section.getBoundingClientRect().right;
      const wide = [...section.querySelectorAll("*")].filter((item) => item.getBoundingClientRect().right > edge + 1);
      return wide.length === 0 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        ? "fits"
        : `${wide.length} too wide`;
    });
    expect(spill).toBe("fits");
    expect(errors).toEqual([]);
  });
});

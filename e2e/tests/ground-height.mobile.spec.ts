import { expect, test, watchForErrors } from "./fixtures";
import { installRidges } from "./ground-height";

const idle = (page: import("@playwright/test").Page) => page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });

test.use({ viewport: { width: 390, height: 844 } });

test("on a phone the folded readout has no height, and the opened one has the centre's", async ({ page }) => {
  const errors = watchForErrors(page);
  const remove = await installRidges(page);
  try {
    const asked: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/maps/height")) asked.push(request.url());
    });
    await page.goto("/maps?lat=57.0&lon=-3.4&z=11");
    await idle(page);
    const readout = page.getByRole("button", { name: "Copy these coordinates" });
    await expect(readout).toContainText("Centre");
    await page.waitForTimeout(600);
    await expect(readout.locator("[data-ground-height]")).toHaveCount(0);
    expect(asked).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: /Coordinate format/ }).click();
    const note = page.locator("[data-ground-height-note]");
    await expect(note).toContainText("Height at the centre100 m");
    await expect(note).toContainText(/not a surveyed spot height/);
    expect(asked).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  } finally {
    await remove();
  }
});

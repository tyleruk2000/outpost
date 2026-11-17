/**
 * The allotment on a phone: reached from the More sheet under Games, radishes sown in
 * bed 1 from its panel with real taps, kept on the server (read back through the API),
 * and still there after a reload. The plot is started afresh first. No sideways scroll.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Allotment on a phone", () => {
  test("sows radishes in bed 1 and keeps them on the server", async ({ page }) => {
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await api(page, "DELETE", "/api/games/allotment");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("list", { name: "Under Games" })
      .getByRole("link", { name: "Allotment" })
      .tap();
    await expect(page.getByRole("heading", { level: 1, name: "Allotment" })).toBeVisible();
    await expect(page.getByText("Sow radishes in a bed: they are free and grow in a few minutes.")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Bed 1's panel, and radishes sown from it.
    await page.getByRole("button", { name: "Bed 1, empty" }).tap();
    const panel = page.getByRole("region", { name: "Bed 1" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /^Sow radishes: free, 4 minutes/ }).tap();
    await expect(page.getByRole("button", { name: /^Bed 1, radishes, / })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Kept on the server, for every device.
    const kept = await api(page, "GET", "/api/games/allotment");
    expect(kept.started).toBe(true);
    expect(kept.plot.beds[0]).toMatchObject({ crop: "radishes" });

    await page.reload();
    await expect(page.getByRole("button", { name: /^Bed 1, radishes, / })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bed 2, empty" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    await api(page, "DELETE", "/api/games/allotment");
    expect(errors).toEqual([]);
  });
});

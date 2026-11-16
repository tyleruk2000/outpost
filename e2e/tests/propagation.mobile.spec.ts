import { expect, test, watchForErrors } from "./fixtures";

test.describe("HF propagation on a phone", () => {
  test("fits the screen, charts included", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
    await expect(page.getByRole("region", { name: /Reliability of SSB voice from 2 to 30 MHz by hour/ })).toBeVisible();
    // Nothing is wider than the screen: the page does not scroll sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The button a thumb presses is at least 44 px tall.
    const button = await page.getByRole("button", { name: "Predict", exact: true }).boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(44);
    expect(errors()).toEqual([]);
  });
});

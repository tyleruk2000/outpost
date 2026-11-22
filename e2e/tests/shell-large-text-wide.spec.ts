/**
 * The sidebar on a wide window with larger text: no more than 22% of the window, and every name in it still
 * whole. At Largest it took 384 px of 1280, and 512 px with the text at 200%.
 */
import { expect, test } from "./fixtures";

for (const [step, root] of [
  ["largest", null],
  ["200%", 32],
] as const) {
  test(`the sidebar keeps to its share of a 1280 px window with the text ${step}, its names whole`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    if (root)
      await page.addInitScript((size) => {
        const apply = () => document.documentElement.style.setProperty("font-size", `${size}px`, "important");
        if (document.documentElement) apply();
        document.addEventListener("DOMContentLoaded", apply);
      }, root);
    else await page.addInitScript(() => localStorage.setItem("outpost.textSize", "largest"));
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    const sidebar = await page.locator('aside[aria-label="Main"]').boundingBox();
    expect(sidebar!.width).toBeLessThanOrEqual(Math.ceil(1280 * 0.22));
    const cut = await page
      .locator('aside[aria-label="Main"] nav li > div > a > span, aside[aria-label="Main"] nav a[data-child] > span')
      .evaluateAll((spans) => spans.filter((span) => span.scrollWidth > span.clientWidth + 1).map((span) => span.textContent));
    expect(cut).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

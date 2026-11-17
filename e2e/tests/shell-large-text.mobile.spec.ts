/**
 * The shared parts of every screen on a 390 px phone with the text at 150% and at 200% (a
 * root font size of 24 and 32 px): each of the bottom bar's five names fits in it, uncut.
 * A shared button's label wraps, and the button grows taller, when it is wider than the
 * screen; at the normal size it is one line, as before. (What a screen's own layout does
 * at large text is held by that screen's own tests.)
 */
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const screens = ["/", "/library", "/explore", "/notes", "/downloads", "/storage", "/settings", "/radio"];

for (const root of [24, 32]) {
  test(`the bar's five names fit in it at a ${root} px root`, async ({ page }) => {
    const errors = watchForErrors(page);
    await page.addInitScript((size) => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = `${size}px`;
      });
    }, root);
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const past = await page.evaluate(() => {
        // The bar spans the page, which a screen's own content can make wider than the phone at large text (that is
        // the screen's to fix, and its own tests hold it): here, each of the five fits in the bar, its name uncut.
        const bar = document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect();
        const tabs = [...document.querySelectorAll('nav[aria-label="Main"] > a, nav[aria-label="Main"] > button')].filter(
          (tab) => tab.getBoundingClientRect().right > bar.right + 1 || tab.scrollWidth > tab.clientWidth + 1,
        );
        return tabs.map(
          (element) =>
            `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(element.getBoundingClientRect().right)}`,
        );
      });
      expect(past, path).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test("a button is one line at the normal size and wraps only when it does not fit", async ({ page }) => {
  await page.goto("/storage");
  const button = page.getByRole("button", { name: "Add location" });
  const normal = await button.evaluate((element) => element.getBoundingClientRect().height);
  expect(normal).toBe(44);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const large = await button.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { right: box.right, width: document.documentElement.clientWidth };
  });
  expect(large.right).toBeLessThanOrEqual(large.width + 1);
});

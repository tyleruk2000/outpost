/**
 * "How search was tuned" on a 390 px phone: at ordinary text size and with the root text at
 * 32 px (200%), the page stays within the screen (its tables stack, its diagrams lay
 * themselves out again) and no diagram's labels overlap.
 */
import { checkDiagrams } from "./diagrams";
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const tooWide = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return (
      [...document.querySelectorAll("main *")]
        .filter((element) => !element.closest("svg") || element.tagName.toLowerCase() === "svg")
        // A stacked table's head is kept for screen readers in a box of one pixel: out of sight on purpose.
        .filter((element) => {
          for (let box: Element | null = element; box && box !== document.body; box = box.parentElement) {
            if (box.getBoundingClientRect().width <= 1 && getComputedStyle(box).overflow === "hidden") return false;
          }
          return true;
        })
        .filter((element) => {
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            if (/auto|scroll/.test(getComputedStyle(parent).overflowX)) return parent.getBoundingClientRect().right > width + 1;
          }
          return true;
        })
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.right > width + 1)
        .slice(0, 5)
        .map(
          ({ element, box }) =>
            `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(box.right)}`,
        )
    );
  });

for (const size of [null, "32px"] as const) {
  test(`how search was tuned fits a phone${size ? " with the root text at 32 px" : ""}, its diagrams' labels apart`, async ({ page }) => {
    const errors = watchForErrors(page);
    if (size) {
      await page.addInitScript((value) => {
        const apply = () => document.documentElement.style.setProperty("font-size", value, "important");
        if (document.documentElement) apply();
        document.addEventListener("DOMContentLoaded", apply);
      }, size);
    }
    await page.goto("/search/how-it-was-tuned");
    await expect(page.getByRole("heading", { name: "How search was tuned", level: 1 })).toBeVisible();
    const drawn = await checkDiagrams(page);
    expect(drawn).toHaveLength(10);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide).toBeLessThanOrEqual(0);
    expect(await tooWide(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

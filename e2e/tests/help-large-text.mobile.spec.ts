/**
 * Help's pages for developers on a 390 px phone with the root text at 32 px (200%): folded
 * away on /help, so the walk to every screen never opens them. Their paths (a file's name
 * as a link, "In the repository as docs/development/…") wrap rather than run off the screen.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

/** What reaches past the right of the screen inside the page, as in radio-large-text.mobile.spec.ts. */
function tooWide(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return (
      [...document.querySelectorAll("main *")]
        .filter((element) => !element.closest("svg") || element.tagName.toLowerCase() === "svg")
        // A table kept for screen readers (sr-only: a box of one pixel that hides what overflows it) is out of sight on purpose.
        .filter((element) => {
          for (let box: Element | null = element; box && box !== document.body; box = box.parentElement) {
            if (box.getBoundingClientRect().width <= 1 && getComputedStyle(box).overflow === "hidden") return false;
          }
          return true;
        })
        .filter((element) => {
          // Inside a box that scrolls sideways, or in text cut short with an ellipsis on purpose, and that box within
          // the screen, is not past the edge. Anything else clipped is: words cut off are as lost as words off screen.
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (/auto|scroll/.test(style.overflowX) || style.textOverflow === "ellipsis")
              return parent.getBoundingClientRect().right > width + 1;
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
}

test("Help's pages for developers fit a phone with the root text at 32 px", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchForErrors(page);
  await page.addInitScript(() => {
    const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  });
  await page.goto("/help");
  await page.getByText(/^For developers: \d+ pages$/).click();
  const developers = page.locator("main details[open] a");
  await expect(developers.first()).toBeVisible();
  expect(await tooWide(page), "/help, its pages for developers open").toEqual([]);
  const addresses = await developers.evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
  expect(addresses.length).toBeGreaterThan(10);
  for (const address of addresses) {
    await page.goto(address);
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(await tooWide(page), `${address} at 32 px`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

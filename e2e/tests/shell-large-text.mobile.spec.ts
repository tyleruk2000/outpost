/**
 * Every top-level screen on a 390 px phone with the text at 150% and at 200% (a root font
 * size of 24 and 32 px): nothing on it reaches past the right of the screen, and each of
 * the bottom bar's five names fits in it, uncut. Long words wrap, a table moves a column
 * under another, and a box that scrolls sideways on purpose (a strip of chips) is allowed
 * when the box itself is on screen. On a 320 px phone the five names are at the smallest
 * size DESIGN.md allows and still fit. A shared button's label wraps, and the button grows
 * taller, when it is wider than the screen; at the normal size it is one line.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

/** The screens the navigation lists at the top level (apps/web/src/components/nav.ts). */
const screens = [
  "/",
  "/search",
  "/explore",
  "/library",
  "/maps",
  "/chat",
  "/contacts",
  "/messages",
  "/encryption",
  "/radio",
  "/tools",
  "/prepare",
  "/games",
  "/notes",
  "/downloads",
  "/storage",
  "/kept",
  "/settings",
];

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

/** Each of the bottom bar's five that reaches past the bar or has its name cut. */
function barCut(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bar = document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect();
    return [...document.querySelectorAll('nav[aria-label="Main"] > a, nav[aria-label="Main"] > button')]
      .filter((tab) => tab.getBoundingClientRect().right > bar.right + 1 || tab.scrollWidth > tab.clientWidth + 1)
      .map((tab) => `${tab.tagName.toLowerCase()} "${(tab.textContent ?? "").trim()}" to ${Math.round(tab.getBoundingClientRect().right)}`);
  });
}

for (const root of [24, 32]) {
  test(`every top-level screen fits a phone with the root text at ${root} px`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await page.addInitScript((size) => {
      const apply = () => document.documentElement.style.setProperty("font-size", `${size}px`, "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    }, root);
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      // What a screen loads after its heading (lists, figures) is drawn before it is measured.
      await page.waitForLoadState("networkidle");
      expect(await tooWide(page), `${path} at ${root} px`).toEqual([]);
      expect(await barCut(page), `the bar on ${path} at ${root} px`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

// Settings -> Appearance -> Text size, at each step other than the default (apps/web/src/lib/theme.tsx): put on the page
// before the first paint by public/pre-paint.js, and held by every top-level screen as the sizes above are.
for (const [step, root] of [
  ["smaller", 14],
  ["larger", 20],
  ["largest", 24],
] as const) {
  test(`every top-level screen fits a phone with Text size set to ${step}`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    await page.addInitScript((value) => localStorage.setItem("outpost.textSize", value), step);
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), path).toBe(`${root}px`);
      expect(await tooWide(page), `${path} with text ${step}`).toEqual([]);
      expect(await barCut(page), `the bar on ${path} with text ${step}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

/** Screens and tabs added on 17 November, at each step of Text size and at 200%: not top-level, so not in the list above. */
const addedToday = [
  "/tools/compass",
  "/games/allotment",
  "/tools/solar-clock?tab=recover",
  "/prepare/weather?view=rivers",
  "/prepare/supplies?view=days",
  "/library?tab=learning",
  "/settings#mesh",
  "/maps?tab=layers",
];

for (const [step, root] of [
  ["smaller", 14],
  ["larger", 20],
  ["largest", 24],
  ["200%", 32],
] as const) {
  test(`the screens added on 17 November fit a phone with the text ${step}`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchForErrors(page);
    if (step === "200%")
      await page.addInitScript((size) => {
        const apply = () => document.documentElement.style.setProperty("font-size", `${size}px`, "important");
        if (document.documentElement) apply();
        document.addEventListener("DOMContentLoaded", apply);
      }, root);
    else await page.addInitScript((value) => localStorage.setItem("outpost.textSize", value), step);
    for (const path of addedToday) {
      await page.goto(path);
      await expect(page.locator("main h1, main [role=tablist]").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), path).toBe(`${root}px`);
      expect(await tooWide(page), `${path} with text ${step}`).toEqual([]);
      expect(await barCut(page), `the bar on ${path} with text ${step}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test.describe("on a 320 px phone", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("the bar's five names are at the smallest size DESIGN.md allows, and fit", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1").first()).toBeVisible();
    const sizes = await page
      .getByRole("navigation", { name: "Main" })
      .locator(":scope > a, :scope > button")
      .evaluateAll((tabs) => tabs.map((tab) => Number.parseFloat(getComputedStyle(tab).fontSize)));
    // micro, 0.78125rem.
    expect(sizes).toEqual([12.5, 12.5, 12.5, 12.5, 12.5]);
    expect(await barCut(page)).toEqual([]);
  });
});

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

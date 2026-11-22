/**
 * The app's bars on a phone, by keyboard and by screen reader: each screen names the browser tab and is
 * announced when moved to, and a control reached with Tab or Shift+Tab is never left under the top bar or
 * the bar of screens (WCAG 2.4.2, 2.4.11, 4.1.3). Chromium with a phone's screen, not a real phone.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

/** What lies over the focused control's middle, if it is not the control: a bar, or nothing. */
const coveredBy = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;
    const box = element.getBoundingClientRect();
    const x = Math.min(Math.max(box.left + box.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(box.top + Math.min(box.height, 40) / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    if (!top || element.contains(top) || top.contains(element)) return null;
    const bar = top.closest('header.sticky, nav[aria-label="Main"]');
    return bar
      ? `${(element.getAttribute("aria-label") || element.textContent || element.tagName).trim().slice(0, 40)} under ${bar.tagName}`
      : null;
  });

test("each screen names the tab and is announced, and focus is never left under the phone's bars", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchForErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page).toHaveTitle("Settings / Outpost");

  const hidden: string[] = [];
  for (let step = 0; step < 60; step++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(30);
    const under = await coveredBy(page);
    if (under) hidden.push(under);
  }
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(30);
    const under = await coveredBy(page);
    if (under) hidden.push(under);
  }
  expect(hidden).toEqual([]);

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveTitle("Your library / Outpost");
  await expect(page.locator("[data-route-announcer]")).toHaveText("Your library");
  expect(errors).toEqual([]);
});

test("search results with their filter tabs do not scroll the page sideways on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/search?q=water");
  await expect(page.getByRole("tablist", { name: "Filter results" }).getByRole("tab").nth(1)).toBeVisible();
  // The words read out with a tab's count are kept inside the strip of tabs that scrolls, not past the screen's edge.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

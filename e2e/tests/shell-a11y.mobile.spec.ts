/**
 * The app's bars on a phone, by keyboard and by screen reader: each screen names the browser tab and is
 * announced when moved to, and a control reached with Tab or Shift+Tab is never left under the top bar or
 * the bar of screens (WCAG 2.4.2, 2.4.11, 4.1.3). Chromium with a phone's screen, not a real phone.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

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

test("a link to a place in Settings lands right under the phone's top bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ["backup", "https", "mesh"]) {
    await page.goto(`/settings#${id}`);
    const heading = page.locator(`#${id}-title`);
    await expect(heading).toBeVisible();
    // The screen holds the place for a moment while the sections above it fill in.
    await page.waitForTimeout(1200);
    const bar = await page.locator("header.sticky").boundingBox();
    const box = await page.locator(`section#${id}`).boundingBox();
    const gap = box!.y - (bar!.y + bar!.height);
    expect(gap, `#${id}`).toBeGreaterThanOrEqual(0);
    expect(gap, `#${id}`).toBeLessThanOrEqual(16);
  }
});

test("the set-up guide fits a phone with the text at 200%, its long addresses broken", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  });
  await page.goto("/help/search-and-answers");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("Home and Settings fit a narrow phone with the text at 200%, and so does the bar of screens", async ({ page }) => {
  // The bar is as wide as the page: a screen wider than the phone made the bar overhang it too.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  });
  for (const path of ["/", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      path,
    ).toBeLessThanOrEqual(0);
    const bar = await page.getByRole("navigation", { name: "Main" }).boundingBox();
    expect(bar!.x + bar!.width, path).toBeLessThanOrEqual(320);
  }
});

test("search results with their filter do not scroll the page sideways on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/search?q=water");
  // On a column this narrow the filter tabs give way to one "Show" list, which holds every kind with its count.
  const show = page.getByRole("combobox", { name: "Show" });
  await expect(show).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await show.click();
  await expect(page.getByRole("option").nth(1)).toBeVisible();
  const list = await page.getByRole("listbox").boundingBox();
  expect(list!.x).toBeGreaterThanOrEqual(0);
  expect(list!.x + list!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("the bar of screens overhangs nothing when a contact is changed on a narrow phone with the text at 200%", async ({ page }) => {
  // The bar is as wide as the page: it overhung only because the page was wider than the phone, by the editor's title (a
  // long name that did not break) and by its form's column, sized to a text area's natural width.
  const made = await api(page, "POST", "/api/contacts", {
    name: { prefix: "", given: "Margaret", additional: "", family: "Featherstonehaugh-Cholmondeley", suffix: "" },
    phones: [{ value: "+44 7700 900123", label: "mobile" }],
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  });
  await page.goto(`/contacts/${made.contact.id}/edit`);
  await expect(page.getByRole("textbox", { name: "Note" })).toBeAttached();
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const bar = await page.getByRole("navigation", { name: "Main" }).boundingBox();
  expect(bar!.x + bar!.width).toBeLessThanOrEqual(320);
});

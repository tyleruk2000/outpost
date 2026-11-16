/**
 * Small phones with the text at 150% (stood in for by a root font size of 24 px, as in
 * phone-layout.mobile.spec.ts): the screens that were wider than the screen there, the
 * shared dialog whose buttons were below it, and the shared controls' touch targets.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";
import { CENTRE, type InstalledTestMaps, installTestMaps, removeTestMaps } from "./map-fixture";

/** What reaches past the right of the screen, if the page scrolls sideways at all; nothing when it does not. */
async function tooWide(page: Page): Promise<string[]> {
  const { over, what } = await sideways(page);
  return over > 0 ? [`${over} px too wide`, ...what] : [];
}

/** How far the page reaches past the right of the screen, and what reaches furthest, for the message. */
async function sideways(page: Page): Promise<{ over: number; what: string[] }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const what = [...document.querySelectorAll("body *")]
      .filter((element) => !element.closest("svg") || element.tagName.toLowerCase() === "svg")
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > width + 1)
      .slice(0, 5)
      .map(
        ({ element, box }) =>
          `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(box.right)}`,
      );
    return { over: document.documentElement.scrollWidth - width, what };
  });
}

/** What reaches past the right of a region that clips (a panel of the map), for the message. */
async function pastEdge(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((scope) => {
    const region = document.querySelector(scope);
    if (!region) return [`${scope} is not there`];
    const right = Math.min(region.getBoundingClientRect().right, document.documentElement.clientWidth);
    return [...region.querySelectorAll("*")]
      .filter((element) => !element.closest("svg") && !element.closest(".truncate"))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0 && box.right > right + 1)
      .slice(0, 5)
      .map(
        ({ element, box }) =>
          `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(box.right)}`,
      );
  }, selector);
}

for (const size of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
]) {
  test.describe(`${size.width} by ${size.height} with the text at 150%`, () => {
    test.use({ viewport: size });
    let maps: InstalledTestMaps | undefined;

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const apply = () => document.documentElement.style.setProperty("font-size", "24px", "important");
        if (document.documentElement) apply();
        document.addEventListener("DOMContentLoaded", apply);
      });
    });
    test.afterEach(async ({ page }) => {
      await removeTestMaps(page, maps);
      maps = undefined;
    });

    test("the radio screens fit the width, and so do a dialog's buttons and its Close", async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchForErrors(page);
      await page.goto("/radio/coverage");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect.poll(() => tooWide(page)).toEqual([]);

      await page.goto("/radio/plans");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await tooWide(page)).toEqual([]);
      await page.getByRole("button", { name: "New plan" }).first().click();
      const dialog = page.getByRole("dialog", { name: "New plan" });
      // The shared dialog: its Close is a full touch target, and the whole of it can be scrolled to its buttons.
      const close = (await dialog.getByRole("button", { name: "Close" }).boundingBox())!;
      expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
      await dialog.getByLabel("Name").fill("Large text");
      const create = dialog.getByRole("button", { name: "Create plan" });
      await create.scrollIntoViewIfNeeded();
      const button = (await create.boundingBox())!;
      expect(button.y + button.height).toBeLessThanOrEqual(size.height);
      await create.click();
      await expect(page.getByRole("heading", { level: 1, name: "Large text" })).toBeVisible();
      await expect.poll(() => tooWide(page)).toEqual([]);
      // The shared segmented control is a full touch target too.
      const segment = page.getByRole("radio").first();
      if ((await segment.count()) > 0) expect((await segment.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const id = page.url().split("/").pop();

      // "Choose on the map", whose header and three buttons are taller than this screen at this size of text.
      await page.goto("/radio/propagation");
      await page.getByRole("button", { name: "Choose on the map" }).first().click();
      const choose = page.getByRole("dialog", { name: /^Choose where/ });
      const use = choose.getByRole("button", { name: "Use this place" });
      await use.scrollIntoViewIfNeeded();
      const useBox = (await use.boundingBox())!;
      expect(useBox.y).toBeGreaterThanOrEqual(0);
      expect(useBox.y + useBox.height).toBeLessThanOrEqual(size.height);
      await choose.getByRole("button", { name: "Cancel" }).click();
      await page.request.delete(`/api/radio/communication-plans/${id}`, { headers: { "X-Outpost-Request": "1" } });
      expect(errors).toEqual([]);
    });

    test("the map's panels keep within the screen: offline maps, the Sun, and drawing a route", async ({ page }) => {
      test.setTimeout(120_000);
      maps = await installTestMaps(page);
      await page.goto(`/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12`);
      await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
      const sheet = 'section[aria-label="Places, routes and offline maps"]';
      for (const tab of ["Offline maps", "Sun"]) {
        await page
          .getByRole("tab", { name: new RegExp(tab) })
          .first()
          .click();
        await expect.poll(() => pastEdge(page, `${sheet} [role="tabpanel"]`), { message: tab }).toEqual([]);
      }
      await page
        .getByRole("tab", { name: /Routes/ })
        .first()
        .click();
      await page.locator(sheet).getByRole("button", { name: "Draw a route" }).click();
      await expect(page.locator(sheet).getByRole("button", { name: /Add a point at the centre of the map/ })).toBeVisible();
      await expect.poll(() => pastEdge(page, sheet)).toEqual([]);
      expect(await tooWide(page)).toEqual([]);
    });
  });
}

/**
 * The Maps screen in Safari on an iPhone: WebKit, at the room Safari leaves with its bars
 * showing. Found on a real iPhone (390 by 664): the column of tools stopped short with
 * nothing to say there were more, and the card of the tool in hand was a small box over
 * the readout that scrolled inside itself, its choices cut off. Now the column ends in a
 * button that says "More", and the card in hand takes the sheet's place at the foot.
 *
 * Each state is measured (layout-audit.ts) and a picture of it is attached to the report,
 * to be looked at when the layout changes. WebKit here is not Safari on a phone: no
 * on-screen keyboard, no bars that come and go as the page scrolls.
 */
import type { Page, TestInfo } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { auditLayout } from "./layout-audit";
import { CENTRE, type InstalledTestMaps, installTestMaps, removeTestMaps } from "./map-fixture";

const VIEW = `/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12`;

const SIZES = [
  { name: "iPhone SE, 375 by 548", width: 375, height: 548, root: 16, scheme: "light" as const },
  { name: "iPhone 15, 390 by 664", width: 390, height: 664, root: 16, scheme: "light" as const },
  { name: "iPhone 15 in the dark, 390 by 664", width: 390, height: 664, root: 16, scheme: "dark" as const },
  { name: "iPhone 15 Pro Max, 430 by 740", width: 430, height: 740, root: 16, scheme: "light" as const },
  { name: "iPhone 15 with larger text, 390 by 664 at 125%", width: 390, height: 664, root: 20, scheme: "light" as const },
];

const atRest = async (page: Page) => {
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(450);
};

/** What is wrong with the screen as it stands, in words. The app's own bars, and a menu open over the page, are other tests' business. */
async function wrong(page: Page): Promise<string[]> {
  const findings = await page.evaluate(auditLayout, { shell: ["header.bg-spine", 'nav[aria-label="Main"]'] });
  return findings
    .filter((finding) => !finding.shell)
    .filter((finding) => !(finding.kind === "small-target" && finding.what.startsWith("link in a line of text")))
    .map((finding) => `${finding.kind}: ${finding.what} (${finding.detail})`);
}

async function picture(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
}

for (const size of SIZES) {
  test.describe(`Maps on an ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, colorScheme: size.scheme });
    let maps: InstalledTestMaps | undefined;
    let place: string | undefined;

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((root) => {
        const apply = () => document.documentElement.style.setProperty("font-size", `${root}px`, "important");
        if (document.documentElement) apply();
        document.addEventListener("DOMContentLoaded", apply);
      }, size.root);
      maps = await installTestMaps(page);
      ({
        marker: { id: place },
      } = await api(page, "POST", "/api/maps/markers", { name: "iPhone check hut", lat: CENTRE.lat + 0.004, lon: CENTRE.lon - 0.006 }));
    });
    test.afterEach(async ({ page }) => {
      if (place) await api(page, "DELETE", `/api/maps/markers/${place}`);
      await removeTestMaps(page, maps);
    });

    test("every tool can be found, and the card in hand has the room to be read and closed", async ({ page }, info) => {
      test.setTimeout(90_000);
      const errors = watchForErrors(page);
      await page.goto(VIEW);
      await atRest(page);
      await picture(page, info, "browsing");
      expect(await wrong(page), "browsing").toEqual([]);

      // The column ends in a button that says More, wholly on the screen, above the readout.
      const more = page.getByRole("button", { name: "More map tools" });
      await expect(more).toBeInViewport({ ratio: 1 });
      await expect(more).toHaveText("More");
      const readout = (await page.getByRole("button", { name: "Copy these coordinates" }).boundingBox())!;
      const moreBox = (await more.boundingBox())!;
      expect(moreBox.y + moreBox.height).toBeLessThanOrEqual(readout.y);
      await more.tap();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitemcheckbox", { name: "Find where you are from bearings" })).toBeVisible();
      await picture(page, info, "the menu of every tool");

      // The owner's case: finding where you are from bearings.
      await menu.getByRole("menuitemcheckbox", { name: "Find where you are from bearings" }).tap();
      const card = page.locator(".outpost-furniture-dock > .outpost-map-card");
      await expect(card.getByRole("heading", { name: "Find where you are from bearings" })).toBeVisible();
      await atRest(page);
      await picture(page, info, "finding where you are from bearings");
      expect(await wrong(page), "finding where you are from bearings").toEqual([]);

      // In the sheet's place: edge to edge, on the bar of screens, below the cross; nothing else at the foot.
      const box = (await card.boundingBox())!;
      const bar = (await page.locator('nav[aria-label="Main"]').boundingBox())!;
      const cross = (await page.locator("[data-centre-mark]").boundingBox())!;
      expect(box.x).toBeLessThanOrEqual(0.5);
      expect(box.x + box.width).toBeGreaterThanOrEqual(size.width - 0.5);
      expect(Math.abs(box.y + box.height - bar.y)).toBeLessThanOrEqual(1);
      expect(box.y).toBeGreaterThan(cross.y + cross.height);
      await expect(page.getByRole("button", { name: "Copy these coordinates" })).toBeHidden();
      await expect(page.getByRole("tab", { name: /^Places/ })).toBeHidden();
      // Taller than the box it was (about 180 px on this phone), and its choice of north wholly in view once scrolled to.
      expect(box.height).toBeGreaterThan(size.height * 0.33);
      const trueNorth = card.getByText("True north", { exact: true });
      await trueNorth.scrollIntoViewIfNeeded();
      await expect(trueNorth).toBeInViewport({ ratio: 1 });
      // Closed with one press in the card's own first line, and the sheet's tabs are back.
      await card.getByRole("button", { name: "Stop finding where you are" }).tap();
      await expect(page.getByRole("tab", { name: /^Places/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy these coordinates" })).toBeVisible();

      // Saving a place: the hint is in a card, not a message over the sheet's tabs.
      await more.tap();
      await page.getByRole("menuitemcheckbox", { name: "Save a place: then tap the map" }).tap();
      await expect(card.getByText("Tap the map where the place is.")).toBeVisible();
      await atRest(page);
      await picture(page, info, "saving a place");
      expect(await wrong(page), "saving a place").toEqual([]);
      await card.getByRole("button", { name: "Stop saving a place" }).tap();

      // A position found by search: what to do with it is in reach.
      await page.getByLabel("Search the map").fill(`${CENTRE.lat + 0.01}, ${CENTRE.lon + 0.01}`);
      await page.getByRole("option").first().tap();
      await expect(card.getByRole("button", { name: "Save this place" })).toBeAttached();
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await atRest(page);
      await picture(page, info, "a position found by search");
      expect(await wrong(page), "a position found by search").toEqual([]);
      await card.getByRole("button", { name: "Save this place" }).scrollIntoViewIfNeeded();
      await expect(card.getByRole("button", { name: "Save this place" })).toBeInViewport({ ratio: 1 });
      expect(errors).toEqual([]);
    });
  });
}

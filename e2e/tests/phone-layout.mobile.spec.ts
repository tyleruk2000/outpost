/**
 * Where things sit over the map on a phone.
 *
 * The Maps screen's tools were each built and checked alone, on a large screen. Together
 * on a small one they lay over each other: a card over the column of controls, the
 * readout under a card, the first-use card over the search box. Now one rule decides
 * where each kind of thing sits (docs/development/web-screens.md, "Things over a map"),
 * and this holds the screen to it: in each state below nothing may lie over anything
 * else, be cut off, scroll sideways, be too small to touch or too small to read.
 *
 * The measuring is `auditLayout` (layout-audit.ts). Three sizes are walked here; the
 * whole matrix (four sizes, three text sizes, with and without a home indicator, light
 * and dark) takes over an hour and is run by hand when the layout is changed. Larger
 * text is stood in for by a larger root font size. Chromium with a phone's screen and
 * touch is not a real phone, which this was not tried on.
 *
 * When you add a tool to the map, add its state here.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { auditLayout, type Finding } from "./layout-audit";
import { CENTRE, type InstalledTestMaps, installTestMaps, removeTestMaps } from "./map-fixture";

test.use({ timezoneId: "Europe/London" });

const VIEW = `/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12`;
const SHEET = 'section[aria-label="Places, routes and offline maps"]';
const TOOLS = [
  "Measure a distance",
  "Draw a route",
  "Save a place: then tap the map",
  "Print or save as PDF",
  "Line of sight between two points",
  "Hill shading",
  "Contour lines",
  "Maidenhead locator grid",
  // Offered before any imagery is installed, named for what it needs.
  "Satellite: none downloaded yet",
];

const SET_UPS = [
  { name: "a small phone, 320 by 568", width: 320, height: 568, root: 16 },
  { name: "a phone of today, 390 by 844", width: 390, height: 844, root: 16 },
  { name: "larger text, 375 by 667 with the text at 125%", width: 375, height: 667, root: 20 },
];

/** What is wrong with the screen as it stands, in words. The app's own bars are other tests' business. */
async function wrong(page: Page): Promise<string[]> {
  const lowered = await page.getByRole("button", { name: /^Panel height: lowered/ }).count();
  const findings: Finding[] = await page.evaluate(auditLayout, {
    shell: ["header.bg-spine", 'nav[aria-label="Main"]'],
    // The body of the lowered sheet is below the edge of the screen on purpose.
    folded: lowered ? [`${SHEET} [role="tabpanel"]`, `${SHEET} section[aria-label="Line of sight"] > :not(:first-child)`] : [],
  });
  return (
    findings
      .filter((finding) => !finding.shell)
      // A link in the line of credits is as tall as the line, as WCAG allows.
      .filter((finding) => !(finding.kind === "small-target" && finding.what.startsWith("link in a line of text")))
      .map((finding) => `${finding.kind}: ${finding.what} (${finding.detail})`)
  );
}

const atRest = async (page: Page) => {
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
  // The sheet and the camera take 200 ms to settle.
  await page.waitForTimeout(450);
};

/** Takes up a tool: from its icon in the column, or from the menu where the column has no room for it. */
async function takeUp(page: Page, name: string): Promise<void> {
  const icon = page.getByRole("button", { name, exact: true }).and(page.locator("[aria-pressed]"));
  if ((await icon.count()) > 0) return icon.tap();
  await page.getByRole("button", { name: "All map tools" }).tap();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).tap();
}

/** The middle of the cross that marks the centre of the map: by the rule, a place nothing lies over. */
async function cross(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator("[data-centre-mark]").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

for (const setUp of SET_UPS) {
  test.describe(`the Maps screen on ${setUp.name}`, () => {
    test.use({ viewport: { width: setUp.width, height: setUp.height } });
    let maps: InstalledTestMaps | undefined;
    let places: string[] = [];

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
      await page.addInitScript((size) => {
        const apply = () => document.documentElement.style.setProperty("font-size", `${size}px`, "important");
        if (document.documentElement) apply();
        document.addEventListener("DOMContentLoaded", apply);
      }, setUp.root);
      maps = await installTestMaps(page);
      places = [];
      for (const [index, name] of ["Layout check hut", "Layout check ford with a long name that takes two lines"].entries()) {
        const { marker } = await api(page, "POST", "/api/maps/markers", { name, lat: CENTRE.lat + 0.004 * index, lon: CENTRE.lon - 0.006 });
        places.push(marker.id);
      }
    });
    test.afterEach(async ({ page }) => {
      for (const id of places) await api(page, "DELETE", `/api/maps/markers/${id}`);
      await removeTestMaps(page, maps);
    });

    test("has a place for everything over the map, and nothing lies over anything else", async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchForErrors(page);
      await page.goto(VIEW);
      await atRest(page);

      // Browsing, the sheet lowered.
      expect(await wrong(page), "browsing").toEqual([]);

      // Every tool is in the menu by name, whether or not the column has room for its icon.
      await page.getByRole("button", { name: "All map tools" }).tap();
      const menu = page.getByRole("menu");
      for (const name of TOOLS) await expect(menu.getByRole("menuitemcheckbox", { name, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();

      // The cross at the centre is on clear map, above the middle of it, so a card has room to come up under it.
      const centre = await cross(page);
      const search = (await page.getByLabel("Search the map").boundingBox())!;
      const readout = (await page.getByRole("button", { name: "Copy these coordinates" }).boundingBox())!;
      expect(centre.y).toBeGreaterThan(search.y + search.height);
      expect(centre.y).toBeLessThan((search.y + search.height + readout.y) / 2);

      // Measuring: the card comes up from the foot, and the map above it can still be touched.
      await takeUp(page, "Measure a distance");
      await expect(page.getByRole("heading", { name: "Measure" })).toBeVisible();
      // The map did not move for the card: the centre is where it was, and still in the clear.
      await page.waitForTimeout(450);
      const still = await cross(page);
      expect(Math.hypot(still.x - centre.x, still.y - centre.y), "how far the centre moved when the card came up").toBeLessThanOrEqual(1);
      for (const [dx, dy] of [
        [-50, -6],
        [0, -40],
        [-70, -44],
      ]) {
        await page.touchscreen.tap(centre.x + dx!, centre.y + dy!);
      }
      await expect(page.getByText(/^2 legs, last leg heading/)).toBeVisible();
      await atRest(page);
      expect(await wrong(page), "measuring").toEqual([]);
      await page.getByRole("button", { name: "Stop measuring" }).tap();

      // A found position, with its sun times open: more than the card may show, so it scrolls inside itself.
      await page.getByLabel("Search the map").fill(`${CENTRE.lat + 0.01}, ${CENTRE.lon + 0.01}`);
      await page.getByRole("option").first().tap();
      const pinCard = page.locator(".outpost-map-card");
      await expect(pinCard.getByRole("button", { name: "Save this place" })).toBeAttached();
      const sun = pinCard.getByRole("button", { name: /^Sun/ });
      if ((await sun.getAttribute("aria-expanded")) === "false") await sun.tap();
      await expect(pinCard.getByText("Sunrise", { exact: true })).toBeAttached();
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await atRest(page);
      expect(await wrong(page), "a found position with its sun times open").toEqual([]);
      const cardBox = (await pinCard.boundingBox())!;
      const pin = (await page.locator(".outpost-pin").boundingBox())!;
      expect(pin.y + pin.height, "the pin is above the card that is about it").toBeLessThanOrEqual(cardBox.y + 1);
      expect(await pinCard.evaluate((card) => card.scrollHeight > card.clientHeight), "the card scrolls inside itself").toBe(true);
      await expect(pinCard.getByRole("button", { name: "Remove this pin" })).toBeInViewport();
      await pinCard.getByRole("button", { name: "Remove this pin" }).tap();

      // The page to print: its card, and the box on the map above it.
      await takeUp(page, "Print or save as PDF");
      await expect(page.getByRole("button", { name: "Preview the page" })).toBeAttached({ timeout: 15_000 });
      await atRest(page);
      await page.waitForTimeout(600);
      expect(await wrong(page), "the page to print").toEqual([]);
      await page.getByRole("button", { name: "Stop: put the page away" }).tap();

      // Line of sight takes over the sheet, and is named once: by the sheet, not by the card as well.
      await takeUp(page, "Line of sight between two points");
      await expect(page.getByRole("button", { name: "Use the centre of the map" })).toBeVisible();
      await atRest(page);
      const titles = await page.evaluate(
        () =>
          [...document.querySelectorAll("h2, h3")].filter(
            (heading) => heading.textContent === "Line of sight" && heading.getBoundingClientRect().height > 2,
          ).length,
      );
      expect(titles, "titles that say Line of sight").toBe(1);
      expect(await wrong(page), "line of sight, choosing a point").toEqual([]);
      await page.getByRole("button", { name: "Stop checking line of sight" }).tap();

      // The sheet half raised, with the list of places in it.
      await page.getByRole("tab", { name: /^Places/ }).tap();
      await expect(page.getByRole("button", { name: /^Panel height: half/ })).toBeVisible();
      await atRest(page);
      expect(await wrong(page), "the Places tab, half raised").toEqual([]);

      // And at full height only the search box is left over the map.
      await page.getByRole("button", { name: /^Panel height: half/ }).press("ArrowUp");
      await expect(page.getByRole("button", { name: /^Panel height: full/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy these coordinates" })).toHaveCount(0);
      await expect(page.getByLabel("Search the map")).toBeVisible();
      await page.waitForTimeout(450);
      expect(await wrong(page), "the Places tab, at full height").toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test.describe("saving a place on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  let maps: InstalledTestMaps | undefined;
  test.beforeEach(async ({ page }) => {
    maps = await installTestMaps(page);
  });
  test.afterEach(async ({ page }) => {
    const { markers } = await api<{ markers: Array<{ id: string; name: string }> }>(page, "GET", "/api/maps/markers");
    for (const marker of markers.filter((each) => each.name === "Layout check spring"))
      await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
    await removeTestMaps(page, maps);
  });

  test("the hint goes once the map is tapped, the name field stays above the keyboard, and the place is left in view", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(VIEW);
    await atRest(page);
    await takeUp(page, "Save a place: then tap the map");
    // On a touch screen the words say tap, never click.
    const hint = page.getByText("Tap the map where the place is.");
    await expect(hint).toBeVisible();
    const centre = await cross(page);
    // Low on the map, where the sheet rising for the form would cover it.
    await page.touchscreen.tap(centre.x - 60, centre.y + 150);
    const name = page.getByLabel("Name", { exact: true });
    await expect(name).toBeFocused();
    await expect(hint).toBeHidden();
    // The place being saved is moved into the clear map above the sheet.
    await page.waitForTimeout(600);
    const pin = (await page.locator(".outpost-pin").boundingBox())!;
    const sheet = (await page.locator(SHEET).boundingBox())!;
    expect(pin.y + pin.height, "the new place above the sheet").toBeLessThanOrEqual(sheet.y);

    // The on-screen keyboard leaves 420 px: the sheet rises and the field is above the bottom bar.
    await page.setViewportSize({ width: 390, height: 420 });
    await page.waitForTimeout(700);
    const field = (await name.boundingBox())!;
    const bar = (await page.locator('nav[aria-label="Main"]').boundingBox())!;
    expect(field.y + field.height, "the Name field above the bottom bar").toBeLessThanOrEqual(bar.y);
    expect(field.y).toBeGreaterThanOrEqual(0);

    await name.fill("Layout check spring");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Save place" }).tap();
    await expect(page.getByText("“Layout check spring” is saved to your places.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

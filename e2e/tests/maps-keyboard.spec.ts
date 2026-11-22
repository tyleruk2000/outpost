/**
 * The Maps screen without a pointer, and what a screen reader is told there. A map canvas cannot be
 * used by a keyboard or a screen reader by its nature, so every action on it has another way in:
 * the point is the centre of the map, which the cross marks, and the keys say so in the map's name.
 * Found in the usability and accessibility study of November 2026.
 */
import type { Page } from "@playwright/test";
import { accessibilityFindings } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { CENTRE, installTestMaps, removeTestMaps } from "./map-fixture";

const VIEW = `/maps?lat=${CENTRE.lat}&lon=${CENTRE.lon}&z=12`;

async function open(page: Page) {
  await page.goto(VIEW);
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
}

const focusOnMap = (page: Page) => page.locator(".maplibregl-canvas").focus();

test.describe("maps from the keyboard", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  let maps: Awaited<ReturnType<typeof installTestMaps>> | undefined;
  test.beforeEach(async ({ page }) => {
    maps = await installTestMaps(page);
  });
  test.afterEach(async ({ page }) => {
    await removeTestMaps(page, maps);
  });

  test("Shift F10 on the map opens the menu for the centre, and its radio range and walking reach", async ({ page }) => {
    const errors = watchForErrors(page);
    await open(page);
    const map = page.locator(".maplibregl-canvas");
    await expect(map).toHaveAccessibleName(/Shift F10 opens the menu for the point at the centre/);
    await focusOnMap(page);
    await page.keyboard.press("Shift+F10");
    const menu = page.getByRole("menu", { name: "At this point" });
    await expect(menu).toBeVisible();
    await expect(menu.getByText("53.07000, -4.07000")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Save a place here" })).toBeFocused();
    // Escape gives the keyboard back to the map.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(map).toBeFocused();

    await page.keyboard.press("Shift+F10");
    await menu.getByRole("menuitem", { name: "How far on foot from here" }).press("Enter");
    await expect(page.getByRole("heading", { name: "How far on foot", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Stop showing how far on foot" }).click();

    await focusOnMap(page);
    await page.keyboard.press("Shift+F10");
    await menu.getByRole("menuitem", { name: "Estimated radio range from here" }).press("Enter");
    await expect(page.getByRole("region", { name: "Estimated radio range" })).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test("measuring and saving a place take the centre from a button or from Enter, and each point is said", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Measure a distance" }).click();
    const card = page.locator(".outpost-map-card").filter({ has: page.getByRole("heading", { name: "Measure" }) });
    const said = card.locator('[aria-live="polite"]').first();
    await expect(said).toContainText("set the first point");
    await card.getByRole("button", { name: "Add the centre of the map" }).click();
    await expect(said).toContainText("First point set");
    // Then Enter on the map, moved east with the arrow keys.
    await expect(page.locator(".maplibregl-canvas")).toHaveAccessibleName(/Enter adds a point at the centre/);
    await focusOnMap(page);
    for (let step = 0; step < 4; step += 1) await page.keyboard.press("ArrowRight");
    await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(said).toContainText(/\d+(\.\d+)? (m|km)/);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /^Save a place: then/ }).click();
    await expect(page.locator(".maplibregl-canvas")).toHaveAccessibleName(/Enter saves a place at the centre/);
    await focusOnMap(page);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "New place" })).toBeVisible();
  });

  test("a search result chosen from the keyboard gives its card the keyboard", async ({ page }) => {
    await open(page);
    const search = page.getByLabel("Search the map");
    await search.fill("53.08, -4.06");
    await expect(page.getByRole("option").first()).toBeVisible();
    await search.press("Enter");
    const card = page.getByRole("region", { name: "53.08000, -4.06000" });
    await expect(card).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(card.getByRole("button", { name: "Remove this pin" })).toBeFocused();
  });

  test("cards have close buttons of 24 px, stay on the map together, and pass the automated check", async ({ page }) => {
    await open(page);
    // The pin of a search result is named and is an image (a div may not carry a name).
    await page.getByLabel("Search the map").fill("53.08, -4.06");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.getByLabel("Search the map").press("Enter");
    await expect(page.locator(".outpost-pin")).toHaveAttribute("role", "img");
    expect(await accessibilityFindings(page, "/maps", "light")).toEqual([]);
    await page.getByRole("button", { name: "Remove this pin" }).click();

    // A recording's card and a tool's card at once: both on the map, below the search box.
    await page.getByRole("button", { name: "Record a track" }).click();
    await page.getByRole("button", { name: "Find where you are from bearings" }).click();
    const searchBox = (await page.getByLabel("Search the map").boundingBox())!;
    for (const name of ["Record a track", "Find where you are from bearings"]) {
      const heading = page.getByRole("heading", { name, level: 2 });
      await expect(heading).toBeInViewport({ ratio: 1 });
      expect((await heading.boundingBox())!.y).toBeGreaterThan(searchBox.y + searchBox.height);
    }
    const close = page.getByRole("button", { name: "Stop finding where you are" });
    const box = (await close.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
    await close.click();
    // Escape in the recording's card closes it, as it does a tool's.
    await page.getByRole("region", { name: "Record a track" }).getByRole("button", { name: "Start recording" }).focus();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Record a track" })).toHaveCount(0);

    // Line of sight: its points are a list of terms that holds only terms and definitions.
    await page.getByRole("button", { name: "Line of sight between two points" }).click();
    await page.getByRole("button", { name: "Use the centre of the map" }).click();
    expect(await accessibilityFindings(page, "/maps", "light")).toEqual([]);
  });

  test("what takes the place of the button pressed has the keyboard, not the page", async ({ page }) => {
    await open(page);
    await page.getByRole("tab", { name: /^Offline/ }).click();
    await page.getByRole("button", { name: "Add a region" }).press("Enter");
    await expect(page.getByRole("heading", { name: "Add a region" })).toBeFocused();
    // Keeping the places on this computer: the button is busy a moment, and keeps the keyboard through it.
    const { marker } = await api(page, "POST", "/api/maps/markers", { name: "Kept hut", lat: CENTRE.lat, lon: CENTRE.lon });
    try {
      await page.getByRole("tab", { name: /^Places/ }).click();
      await page.getByRole("button", { name: /^Keep on this/ }).press("Enter");
      await expect(page.getByRole("button", { name: /^Remove from this/ })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: /^Keep on this/ })).toBeFocused();
    } finally {
      await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
    }
  });

  test("on a short window every tool in the column can still be reached by the pointer", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page);
    const last = page.getByRole("button", { name: "Line of sight between two points" });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport({ ratio: 1 });
    // The column scrolled, not the screen: the search box is where it was.
    await expect(page.getByLabel("Search the map")).toBeInViewport({ ratio: 1 });
    const credits = (await page.locator(".outpost-credits").boundingBox())!;
    const box = (await last.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(credits.y);
  });
});

test.describe("map credits", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the button that shows them all is named by the words it shows", async ({ page }) => {
    const maps = await installTestMaps(page);
    try {
      await open(page);
      const more = page.locator(".outpost-credits-more");
      const shows = ((await more.textContent()) ?? "").trim();
      await expect(more).toHaveAccessibleName(new RegExp(`^${shows} map credits?: show all \\d+$`));
    } finally {
      await removeTestMaps(page, maps);
    }
  });
});

test.describe("the menu of every tool on the narrowest phone", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test("is wholly on the screen", async ({ page }) => {
    const maps = await installTestMaps(page);
    try {
      await open(page);
      await page.getByRole("button", { name: "More map tools" }).click();
      const menu = page.getByRole("menu", { name: "More map tools" });
      await expect(menu).toBeVisible();
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    } finally {
      await removeTestMaps(page, maps);
    }
  });
});

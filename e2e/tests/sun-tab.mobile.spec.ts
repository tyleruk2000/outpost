/**
 * Sun times on a phone, found the way someone who has never seen them would look: by a
 * name that is on the screen. Nothing is saved, nothing is searched for, and nothing is
 * pressed and held. Every press is a touch.
 *
 * The clock and the zone are held still, as in sun.spec.ts: mid-morning on the June
 * solstice of 2026, on a device that keeps London time. The times looked for are the US
 * Naval Observatory's for Greenwich (apps/web/src/features/maps/lib/sun.test.ts).
 */
import type { Locator, Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ timezoneId: "Europe/London" });

const GREENWICH = "/maps?lat=51.48&lon=0&z=9";

/** Whether a thing is on the screen and nothing lies over its middle: what a person could see and touch. */
async function isInReach(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const screen = page.viewportSize();
  if (!box || !screen || box.y < 0 || box.y + box.height > screen.height) return false;
  return locator.evaluate(
    (element, [x, y]) => {
      const top = document.elementFromPoint(x!, y!);
      return Boolean(top && (element === top || element.contains(top)));
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

/** The same, waited for: the sheet takes a moment to come to rest after it is raised. */
const expectInReach = (page: Page, locator: Locator, what?: string) => expect.poll(() => isInReach(page, locator), what).toBe(true);

/** A finger dragged across the map. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= 8; step += 1) {
    const at = { x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 };
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at] });
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

/** A finger held still on the map, then lifted. */
async function hold(page: Page, at: { x: number; y: number }, ms: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForTimeout(ms);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** One of the day's times in the Sun tab or section, by the name written over or beside it. */
const time = (page: Page, label: string) =>
  page
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd");

test.describe("sun times on a phone, with no saved places", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
    // The premise of every test here. Other tests leave no places behind; one that failed part-way may have.
    for (const marker of (await api(page, "GET", "/api/maps/markers")).markers) await api(page, "DELETE", `/api/maps/markers/${marker.id}`);
    expect((await api(page, "GET", "/api/maps/markers")).markers).toEqual([]);
  });

  test("are one touch away, under a name that is on the screen when Maps opens", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(GREENWICH);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

    // Before anything is opened: the sheet is lowered, and "Sun" is one of the names on it.
    const tab = page.getByRole("tab", { name: "Sun" });
    await expect(tab).toBeVisible();
    await expectInReach(page, tab);
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("heading", { name: "Sun at the centre of the map" })).toBeHidden();

    await tab.tap();
    await expect(page.getByRole("heading", { name: "Sun at the centre of the map" })).toBeVisible();
    // The same point, in the same words, as the readout at the bottom of the map.
    await expect(page.getByRole("button", { name: "Copy coordinates 51.4800, 0.0000" })).toBeVisible();
    // The answer is on the screen without scrolling the sheet: the two times, large, and the date they are for.
    await expect(time(page, "Sunrise")).toHaveText("04:43");
    await expect(time(page, "Sunset")).toHaveText("21:21");
    await expectInReach(page, time(page, "Sunrise"));
    await expectInReach(page, time(page, "Sunset"));
    await expectInReach(page, page.getByText("Today, Sunday 21 June", { exact: true }));
    // The same in one line, for a screen reader, which is told when the map moves.
    const summary = page.getByText("Sunrise 04:43, sunset 21:21", { exact: true });
    await expect(summary).toBeAttached();
    const date = page.getByLabel("Date", { exact: true });
    await expect(date).toHaveValue("2026-06-21");
    await expectInReach(page, date);
    // Nothing had to be unfolded: the rest of the day is under it.
    await expect(page.locator("dt", { hasText: "Solar noon" })).toBeAttached();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Another day, with a touch-sized button.
    const next = page.getByRole("button", { name: "The day after" });
    expect((await next.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await next.tap();
    await expect(date).toHaveValue("2026-06-22");
    await expect(page.getByText(/^22 Jun: Sunrise 04:4\d, sunset 21:2\d$/)).toBeAttached();
    // The day is said over the times, so they are never read as today's.
    await expectInReach(page, page.getByText("Monday 22 June 2026", { exact: true }));
    await page.getByRole("button", { name: "Today" }).tap();
    await expect(summary).toBeAttached();
    await expect(time(page, "Sunrise")).toHaveText("04:43");

    // The map is moved with a finger, and the times are then for where its centre has come to rest.
    const map = (await page.locator("canvas").first().boundingBox())!;
    // Under the search box and clear of the column of controls.
    const from = { x: map.x + map.width * 0.3, y: map.y + 90 };
    await drag(page, from, { x: from.x + 90, y: from.y + 60 });
    const coordinates = page.getByRole("button", { name: /^Copy coordinates / });
    await expect(coordinates).not.toHaveAccessibleName("Copy coordinates 51.4800, 0.0000");
    await expect(page.getByText(/^Sunrise 04:\d\d, sunset 21:\d\d$/)).toBeAttached();
    await expect(time(page, "Sunrise")).toHaveText(/^04:\d\d$/);
    // Still the readout's own point, once the map has stopped.
    await expect(async () => {
      const shown = (await coordinates.textContent())!.trim();
      await expect(page.getByRole("button", { name: "Copy these coordinates" })).toContainText(shown, { timeout: 500 });
    }).toPass();

    // The tab is remembered, and the sheet starts lowered again: one touch brings the times back.
    await page.reload();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: "Sun" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Sun" }).tap();
    await expect(time(page, "Sunrise")).toHaveText(/^04:\d\d$/);
    await expectInReach(page, time(page, "Sunset"));
    expect(errors).toEqual([]);
  });

  test("are also in the menu of a point pressed and held, which stays when the finger is lifted", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(GREENWICH);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 15_000 });

    // Towards the left of the map, where the menu opens with its corner at the finger and not underneath it:
    // lifting the finger there is a press on the map as far as the browser is concerned, and must not close the menu.
    const map = (await page.locator("canvas").first().boundingBox())!;
    const at = { x: Math.round(map.x + 90), y: Math.round(map.y + 150) };
    await hold(page, at, 900);
    const menu = page.getByRole("menu", { name: "At this point" });
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.x).toBeGreaterThanOrEqual(at.x - 1);
    await page.waitForTimeout(600);
    await expect(menu).toBeVisible();

    // A touch on the map that is not held is still a press on it: it closes the menu, as before.
    await page.touchscreen.tap(at.x - 40, at.y - 40);
    await expect(menu).toBeHidden();

    // The clock is held still here, and the map tells one long press from the next by the time: move it on.
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:05Z"));
    await hold(page, at, 900);
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Sun times here" }).tap();
    await expect(page.getByText("A point chosen on the map")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sun/ })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("dl > div").filter({ hasText: "Sunrise" }).locator("dd")).toContainText(/04:\d\d/);
    expect(errors).toEqual([]);
  });

  test("say why the times where you are need HTTPS, in the same place, and lead to the setting", async ({ page }) => {
    // A phone on the home network reaches Outpost over plain http, which a browser does not count as secure.
    // The tests' own address is localhost, which it does, so the page is told otherwise.
    await page.addInitScript(() => Object.defineProperty(window, "isSecureContext", { configurable: true, get: () => false }));
    const errors = watchForErrors(page);
    await page.goto(GREENWICH);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Sun" }).tap();

    // The centre of the map still has its times.
    await expect(time(page, "Sunrise")).toHaveText("04:43");
    await expect(time(page, "Sunset")).toHaveText("21:21");
    const here = page.getByRole("heading", { name: "Where you are" });
    await here.scrollIntoViewIfNeeded();
    await expect(page.getByText(/This page was opened over plain HTTP, so Outpost cannot find where you are\./)).toBeVisible();
    await expect(page.getByText(/Until then, move the map until its centre is where you are\./)).toBeVisible();
    // Nothing is offered that could only fail.
    await expect(page.getByRole("tabpanel").getByRole("button", { name: "Show where I am" })).toHaveCount(0);

    const link = page.getByRole("link", { name: "Settings → HTTPS on your network" });
    await link.scrollIntoViewIfNeeded();
    await link.tap();
    await expect(page).toHaveURL(/\/settings#https$/);
    await expect(page.getByRole("heading", { name: "HTTPS on your network" })).toBeInViewport();
    expect(errors).toEqual([]);
  });

  test("fit a small phone: four names across the sheet, and the answer above the fold", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const errors = watchForErrors(page);
    await page.goto(GREENWICH);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    for (const name of [/^Places/, /^Routes/, "Offline maps", "Sun"]) {
      await expectInReach(page, page.getByRole("tab", { name }), String(name));
    }
    await page.getByRole("tab", { name: "Sun" }).tap();
    await expect(time(page, "Sunrise")).toHaveText("04:43");
    await expectInReach(page, time(page, "Sunrise"));
    await expectInReach(page, time(page, "Sunset"));
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test.describe("on a phone that uses the 12-hour clock", () => {
    test.use({ locale: "en-US" });

    test("are written that way without anything being chosen, and UTC stays as a radio log writes it", async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto(GREENWICH);
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("tab", { name: "Sun" }).tap();
      await expect(page.getByText("Sunrise 4:43 am, sunset 9:21 pm", { exact: true })).toBeAttached();
      await expect(time(page, "Sunrise")).toHaveText("4:43 am");
      await expectInReach(page, time(page, "Sunrise"));
      await expectInReach(page, time(page, "Sunset"));

      // All of it, with the sheet raised.
      await page.getByRole("button", { name: /^Panel height: half/ }).tap();
      const row = (label: string) =>
        page
          .locator("dl > div")
          .filter({ has: page.locator("dt", { hasText: label }) })
          .locator("dd");
      await expect(row("First light (civil dawn)")).toHaveText("3:55 am");
      await expect(row("Sunrise")).toContainText("4:43 am");
      await expect(row("Solar noon")).toContainText("1:02 pm");
      await expect(row("Sunset")).toContainText("9:21 pm");
      await expect(row("Nautical twilight")).toHaveText("2:41 am to 11:23 pm");
      await expect(row("Day length")).toContainText("16 h 38 min");
      expect(await overflow(page)).toBeLessThanOrEqual(1);

      const utc = page.getByRole("radio", { name: "UTC" });
      await utc.scrollIntoViewIfNeeded();
      await utc.tap();
      await expect(row("Sunrise")).toContainText("03:43 UTC");
      await expect(row("Sunset")).toContainText("20:21 UTC");
      await expect(page.getByText("Sunrise 03:43, sunset 20:21 UTC", { exact: true })).toBeAttached();
      await expect(page.getByText(/UTC is written on the 24-hour clock, whichever clock is chosen in Settings\./)).toBeVisible();
      expect(errors).toEqual([]);
    });
  });

  test("follow the Clock setting, reached from the section itself", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto(GREENWICH);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Sun" }).tap();
    await expect(time(page, "Sunrise")).toHaveText("04:43");

    const settings = page.getByRole("link", { name: "Settings → Appearance" });
    await settings.scrollIntoViewIfNeeded();
    await expect(page.getByText(/For a 12-hour clock, see/)).toBeVisible();
    await settings.tap();
    await expect(page).toHaveURL(/\/settings#appearance$/);
    const clock = page.getByRole("radiogroup", { name: "Clock" });
    await expect(clock.getByRole("radio", { name: "As this device" })).toBeChecked();
    await expect(page.getByText(/This device uses the 24-hour clock, as far as its browser says\./)).toBeVisible();
    for (const name of ["As this device", "24-hour", "12-hour"]) {
      expect((await clock.getByRole("radio", { name }).boundingBox())!.height, name).toBeGreaterThanOrEqual(40);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await clock.getByRole("radio", { name: "12-hour" }).tap();
    await expect(clock.getByRole("radio", { name: "12-hour" })).toBeChecked();

    // Back on the map, without loading the app again, the Sun tab is still the one chosen and its times have changed style.
    await page.goBack();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Sun" }).tap();
    await expect(page.getByText(/^Sunrise 4:\d\d am, sunset 9:\d\d pm$/)).toBeAttached();
    await expect(time(page, "Sunrise")).toHaveText(/^4:\d\d am$/);
    await expect(page.getByText(/For the 24-hour clock, see/)).toBeAttached();
    expect(errors).toEqual([]);
  });
});

test.describe("sun times for a saved place, on a phone", () => {
  let id: string | undefined;

  test.afterAll(async ({ browser }) => {
    if (!id) return;
    const page = await browser.newPage();
    await page.request.fetch(`/api/maps/markers/${id}`, { method: "DELETE", headers: { "X-Outpost-Request": "1" } });
    await page.close();
  });

  test("are on the screen as soon as the place is opened, and opening them keeps Save in reach", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.clock.setFixedTime(new Date("2026-06-21T09:00:00Z"));
    const { marker } = await api(page, "POST", "/api/maps/markers", { name: "Greenwich meridian", lat: 51.48, lon: 0 });
    id = marker.id;

    await page.goto("/maps");
    await page.getByRole("tab", { name: /Places/ }).tap();
    await page.getByRole("button", { name: /^Greenwich meridian/ }).tap();
    await expect(page.getByRole("heading", { name: "Greenwich meridian" })).toBeVisible();

    // One line, straight under the name, without scrolling the sheet.
    const sun = page.getByRole("button", { name: /^Sun/ });
    await expect(sun).toContainText("Sunrise 04:43, sunset 21:21");
    await expectInReach(page, sun.getByText("Sunrise 04:43, sunset 21:21"));
    const save = page.getByRole("button", { name: "Save changes" });
    await expectInReach(page, save);

    // Opened, the sheet is raised to make room: the day's main times are on the screen, and Save has not moved out of reach.
    await sun.tap();
    await expect(page.getByRole("button", { name: /^Panel height: full/ })).toBeVisible();
    const sunset = page.locator("dt", { hasText: "Sunset" });
    await expect(sunset).toBeVisible();
    await expectInReach(page, sunset);
    await expectInReach(page, save);
    // Folded again, the place's own details are back under it.
    await sun.tap();
    const name = page.getByRole("textbox", { name: "Name" });
    await expect(name).toBeVisible();
    await expectInReach(page, name);
    await expect(save).toBeDisabled();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});

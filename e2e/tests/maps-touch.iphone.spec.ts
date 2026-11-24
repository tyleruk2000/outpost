/**
 * Maps pressed with a finger in Safari on an iPhone (WebKit, touch). Found on the owner's
 * iPhone: a suggestion tapped in a route's form did nothing (the field's blur closed the
 * list before the tap's click, and WebKit never focuses a tapped button); with six
 * Outpost tabs open, the search icon did nothing and a route point said "Searching" for
 * ever (each tab's live stream held one of the six connections WebKit gives a server);
 * and the route form had 74 px of a half-height sheet, under the keyboard. Directions now
 * types in a picker at the top of the screen, not in the sheet.
 *
 * Every list of suggestions is tapped here; six tabs are opened, five put in the
 * background, and the sixth must still search; and Directions' picker is used at 320 and
 * 390 px with the room a keyboard leaves (laid over the page as Safari does, and the window
 * made shorter as other browsers do). Pictures are attached to the report, to be looked at.
 */
import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import { KESWICK_BOX } from "../../apps/server/test/fixtures/layers/food-stand-in.ts";
import { api, expect, test, watchForErrors } from "./fixtures";
import { aboveKeyboard, keyboard, standInKeyboard } from "./keyboard-stand-in";
import { removeReferencePacks } from "./reference-layers";
import { installChannelTrip, removeChannelTrip, useAsHome } from "./road-routes";

const SHEET = "section.outpost-sheet";

async function picture(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  // Kept for a person to look at as well, where the run was asked to (OUTPOST_E2E_SHOTS=folder).
  const folder = process.env.OUTPOST_E2E_SHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${info.project.name}-${name}.png` });
}

/** A press as a finger makes it, at the middle of what is found, with nothing else under it first. */
async function touch(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  const x = box.x + Math.min(60, box.width / 2);
  const y = box.y + box.height / 2;
  // What a finger there would land on: the row itself, not a bar or a sheet drawn over it.
  const top = await page.evaluate(
    ([px, py]) => document.elementFromPoint(px!, py!)?.closest("button,[role=option]")?.textContent ?? null,
    [x, y],
  );
  expect(top, "the row is what is under the finger").toBe(await locator.textContent());
  await page.touchscreen.tap(x, y);
}

/** Opens the Routes tab and Directions there, as a person does: the picker for where to, its field focused. */
async function openDirections(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /^Routes/ }).tap();
  await page.locator('[role="tabpanel"]').getByRole("button", { name: "Directions", exact: true }).first().tap();
  await expect(page.getByRole("dialog", { name: "Where to?" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^To: / })).toBeFocused();
}

test.describe("Maps by touch on an iPhone", () => {
  let places: string[] = [];
  let home: string | undefined;
  let restoreHome: (() => Promise<void>) | undefined;
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    places = await installChannelTrip(page);
    home = (
      await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", { name: "Home", lat: 51.3, lon: -0.34, isFavorite: true })
    ).marker.id;
    // Directions starts from the household's home: Leatherhead here, whatever tests before left.
    restoreHome = await useAsHome(page, places[0]!);
  });
  test.afterEach(async ({ page }) => {
    await restoreHome?.();
    if (home) await api(page, "DELETE", `/api/maps/markers/${home}`);
    await removeChannelTrip(page, places);
  });

  test("every suggestion in Directions is chosen by a tap, and the picker has the screen to itself", async ({ page }, info) => {
    test.setTimeout(150_000);
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=49&lon=3&z=5");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await openDirections(page);

    // The picker is the whole screen: nothing of the map, its buttons or its sheet over its rows.
    const picker = page.getByRole("dialog", { name: "Where to?" });
    const area = (await picker.boundingBox())!;
    expect(area.width).toBe(page.viewportSize()!.width);

    // To: a typed position, the server's reading of it.
    await page.keyboard.type("45.9237, 6.8694", { delay: 20 });
    const toList = picker.getByRole("listbox", { name: "Places for to" });
    await expect(toList.getByRole("option", { name: /45\.92/ }).first()).toBeVisible();
    await picture(page, info, "to-suggestions");
    await touch(page, toList.getByRole("option").first());

    // From: the household's home at once; changed by a tap on it, to a saved place from the list shown before anything is typed.
    await expect(page.getByRole("button", { name: "From: Leatherhead. Change" })).toBeVisible();
    await page.getByRole("button", { name: "From: Leatherhead. Change" }).tap();
    const from = page.getByRole("dialog", { name: "Where from?" });
    await expect(page.getByRole("combobox", { name: /^From: / })).toBeFocused();
    await touch(page, from.getByRole("option", { name: /^Home/ }));
    await expect(page.getByRole("button", { name: "From: Home. Change" })).toBeVisible();

    // A stop: a saved place found by typing part of its name.
    const sheet = page.getByRole("region", { name: "Directions" });
    await expect(sheet.getByRole("heading", { name: /\d+ km/ })).toBeVisible({ timeout: 60_000 });
    await sheet.getByRole("button", { name: "Options" }).tap();
    await sheet.getByRole("button", { name: "Add a stop" }).tap();
    await page.keyboard.type("Reim", { delay: 40 });
    const stop = page.getByRole("dialog", { name: "Stop 1: where?" });
    await expect(stop.getByRole("option", { name: /^Chamonix/ })).toBeHidden();
    await touch(page, stop.getByRole("option", { name: /^Reims/ }));
    await expect(sheet.getByRole("button", { name: /^Reims/ })).toBeVisible();

    // The sea crossing's drop-down, chosen by touch too.
    const crossing = page.getByRole("combobox", { name: "Sea crossing" });
    await crossing.scrollIntoViewIfNeeded();
    await crossing.tap();
    await page.getByRole("option", { name: /^Eurotunnel/ }).tap();
    await expect(crossing).toHaveText(/Eurotunnel/);
    await crossing.tap();
    await page.getByRole("option", { name: /^Any/ }).tap();
    await expect(crossing).toHaveText(/Any/);
    await page.getByRole("button", { name: "Done" }).tap();

    // Planned again with the stop, with no button to press; the totals are the sheet's first line.
    await expect(page.getByRole("button", { name: "Via Reims" })).toBeVisible();
    const totals = sheet.getByRole("heading", { name: /\d+ km/ });
    await expect(totals).toBeVisible({ timeout: 60_000 });
    const top = (await sheet.boundingBox())!.y;
    expect((await totals.boundingBox())!.y - top).toBeLessThan(40);
    await picture(page, info, "planned");
    expect(errors).toEqual([]);
  });

  test("the map's search box and a place's form choose by touch", async ({ page }, info) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=51.3&lon=-0.33&z=9");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    const box = page.getByRole("combobox", { name: "Search the map" });
    await box.tap();
    await page.keyboard.type("Leath", { delay: 40 });
    const before = page.url();
    await touch(page, page.getByRole("option", { name: /Leatherhead/ }));
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(box).toHaveValue("Leatherhead");
    // A saved place found opens its form: on a phone, the whole sheet, the tabs put away, the form's first line in view.
    await expect(page.getByRole("button", { name: "Places", exact: true })).toBeInViewport();
    await expect(page.getByRole("tab", { name: /^Routes/ })).toBeHidden();
    await expect(page.locator(SHEET)).toHaveAttribute("data-detent", "full");
    await expect.poll(() => page.url()).not.toBe(before);
    await picture(page, info, "place-form");
    // Its note, scrolled to, is wholly above its buttons.
    await page.getByRole("textbox", { name: "Note" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const note = (await page.getByRole("textbox", { name: "Note" }).boundingBox())!;
    const footer = (await page.getByRole("button", { name: /^(Close|Cancel)$/ }).boundingBox())!;
    expect(note.y + note.height).toBeLessThanOrEqual(footer.y);
    // The filter of saved places is 16 px, so Safari does not zoom in on it.
    await page.getByRole("button", { name: "Places", exact: true }).tap();
    expect(await page.getByLabel("Filter saved places by name").evaluate((field) => getComputedStyle(field).fontSize)).toBe("16px");
    expect(errors).toEqual([]);
  });
});

test.describe("Other lists of suggestions by touch", () => {
  test.afterEach(async ({ page }) => {
    await removeReferencePacks(page);
  });

  test("Add a place's Where? and the Layers tab's find", async ({ page }, info) => {
    const errors = watchForErrors(page);
    await page.goto("/maps/data");
    await page.getByRole("button", { name: "Add a place" }).first().tap();
    const dialog = page.getByRole("dialog", { name: "Add a place" });
    await dialog.getByLabel("Country, region or town").tap();
    await page.keyboard.type("Franc", { delay: 40 });
    await touch(page, dialog.getByRole("list", { name: "Places found" }).getByRole("button", { name: /^France/ }));
    await expect(dialog.getByRole("heading", { name: "What for France?" })).toBeVisible();
    await page.keyboard.press("Escape");

    // A record found by name in the Layers tab: the sheet is lowered so the map and the record's card are seen.
    const estimate = await api<{ estimateId: string; items: Array<{ key: string }> }>(page, "POST", "/api/reference/estimate", {
      provider: "osm",
      clientNameAgreed: true,
      scope: { bbox: KESWICK_BOX },
      layers: ["food"],
    });
    await api(page, "POST", "/api/reference/downloads", { estimateId: estimate.estimateId, keys: [estimate.items[0]!.key] });
    await expect
      .poll(async () => (await api<{ packs: Array<{ records: number }> }>(page, "GET", "/api/reference/packs")).packs[0]?.records ?? 0, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    await page.goto("/maps?lat=54.602&lon=-3.135&z=14");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: /^Layers/ }).tap();
    // The whole row of a layer switches it, not only the switch.
    const row = page.locator("label", { has: page.getByRole("switch", { name: "Food and supplies" }) });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("searchbox", { name: "Find in the reference layers" }).tap();
    await page.keyboard.type("Booths", { delay: 40 });
    await touch(page, page.getByRole("list", { name: "Found in the reference layers" }).getByRole("button").first());
    await expect(page.locator(SHEET)).toHaveAttribute("data-detent", "peek");
    await expect(page.getByRole("heading", { name: /Booths/ })).toBeVisible();
    await picture(page, info, "layers-found");
    expect(errors).toEqual([]);
  });
});

/** A tab of its own, whose page can be put in the background as switching tabs does. */
async function openTab(context: BrowserContext, path: string): Promise<Page> {
  const tab = await context.newPage();
  await tab.goto(path, { waitUntil: "domcontentloaded" });
  await tab.getByRole("button", { name: "Quick search" }).waitFor({ timeout: 30_000 });
  return tab;
}

test("with six tabs open, five behind, the sixth still searches", async ({ page }, info) => {
  test.setTimeout(120_000);
  const context = page.context();
  // Safari's own way of saying a tab is behind another, which WebKit under test does not do for its pages by itself.
  await context.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
    (window as unknown as { putAway: (away: boolean) => void }).putAway = (away) => {
      hidden = away;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  const elsewhere: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol.startsWith("http")) elsewhere.push(request.url());
  });
  const behind: Page[] = [];
  for (const path of ["/", "/library", "/notes", "/search", "/maps/data"]) {
    const tab = await openTab(context, path);
    await tab.waitForTimeout(500);
    await tab.evaluate(() => (window as unknown as { putAway: (away: boolean) => void }).putAway(true));
    behind.push(tab);
  }
  const sixth = await openTab(context, "/library");
  // The search icon answers.
  await sixth.getByRole("button", { name: "Quick search" }).tap();
  const search = sixth.getByRole("dialog", { name: "Search and go to" });
  await expect(search).toBeVisible({ timeout: 5_000 });
  await expect(search.getByRole("combobox")).toBeVisible({ timeout: 10_000 });
  await sixth.keyboard.type("maps", { delay: 30 });
  await expect(search.getByRole("option").first()).toBeVisible({ timeout: 10_000 });
  await picture(sixth, info, "sixth-tab-quick-search");
  await sixth.keyboard.press("Escape");
  // A route point's search answers, rather than saying "Searching" for ever.
  await sixth.goto("/maps?lat=51.3&lon=-0.33&z=8");
  await openDirections(sixth);
  await sixth.keyboard.type("51.30, -0.33", { delay: 20 });
  await expect(sixth.getByRole("listbox", { name: "Places for to" }).getByRole("option").first()).toBeVisible({ timeout: 10_000 });
  for (const tab of [...behind, sixth]) await tab.close();
  expect(elsewhere).toEqual([]);
});

for (const size of [
  { width: 320, height: 568, keyboard: 260, scheme: "light" as const },
  { width: 320, height: 568, keyboard: 260, scheme: "dark" as const },
  { width: 390, height: 664, keyboard: 300, scheme: "light" as const },
  { width: 390, height: 664, keyboard: 300, scheme: "dark" as const },
]) {
  test.describe(`Directions at ${size.width} by ${size.height}, ${size.scheme}, with a keyboard up`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, colorScheme: size.scheme });
    let home: string | undefined;
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      home = (await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", { name: "Home", lat: 51.3, lon: -0.34 })).marker.id;
    });
    test.afterEach(async ({ page }) => {
      if (home) await api(page, "DELETE", `/api/maps/markers/${home}`);
    });

    test("as Safari lays its keyboard over the page: the field and its suggestions above it", async ({ page }, info) => {
      const errors = watchForErrors(page);
      await standInKeyboard(page);
      await page.goto("/maps?lat=51.3&lon=-0.33&z=8");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      await openDirections(page);
      // The field is the first thing on the screen, so Safari has nothing to pan.
      const field = page.getByRole("combobox", { name: /^To: / });
      await expect(field).toBeInViewport({ ratio: 1 });
      await keyboard(page, size.keyboard);
      await aboveKeyboard(page, field, size.keyboard);
      const rows = page.getByRole("dialog", { name: "Where to?" }).getByRole("option");
      await aboveKeyboard(page, rows.first(), size.keyboard);
      await aboveKeyboard(page, rows.nth(1), size.keyboard);
      await picture(page, info, `${size.width}-${size.scheme}-keyboard`);
      await touch(page, page.getByRole("dialog", { name: "Where to?" }).getByRole("option", { name: /^Home/ }));
      await expect(page.getByRole("button", { name: "To: Home. Change" })).toBeVisible();
      await keyboard(page, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test("in a browser that makes the page shorter for its keyboard: the field and a suggestion in view", async ({ page }, info) => {
      const errors = watchForErrors(page);
      await page.goto("/maps?lat=51.3&lon=-0.33&z=8");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      await openDirections(page);
      const field = page.getByRole("combobox", { name: /^To: / });
      // The window made shorter by the keyboard.
      await page.setViewportSize({ width: size.width, height: size.height - size.keyboard });
      await page.waitForTimeout(300);
      await expect(field).toBeInViewport({ ratio: 1 });
      const rows = page.getByRole("dialog", { name: "Where to?" }).getByRole("option");
      // Two whole rows even at 320 by 308: the bar of screens is put away and the picker has the screen.
      await expect(rows.first()).toBeInViewport({ ratio: 1 });
      await expect(rows.nth(1)).toBeInViewport({ ratio: 1 });
      await picture(page, info, `${size.width}-${size.scheme}-shorter`);
      await page.getByRole("dialog", { name: "Where to?" }).getByRole("option", { name: /^Home/ }).tap();
      await expect(page.getByRole("button", { name: "To: Home. Change" })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

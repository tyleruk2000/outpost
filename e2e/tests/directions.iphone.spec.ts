/**
 * Directions on an iPhone (WebKit, by touch), as the owner asked for it: press Directions,
 * type where to, press the result. From is already home, the route is planned as soon as both
 * ends are known, and the answer is the sheet's first line. At 320 and 390 px with the room
 * a keyboard leaves, in both themes; then Steps, one step at a time, and Save. And on an iPad
 * held upright, where the panel's form keeps Directions working by touch.
 *
 * Pictures are attached to the report, and kept in OUTPOST_E2E_SHOTS when it names a folder.
 */
import type { Locator, Page, TestInfo } from "@playwright/test";
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { aboveKeyboard, keyboard, standInKeyboard } from "./keyboard-stand-in";
import { auditLayout } from "./layout-audit";
import { choosePlace, installChannelTrip, removeChannelTrip, useAsHome } from "./road-routes";

async function picture(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const folder = process.env.OUTPOST_E2E_SHOTS;
  if (folder) await page.screenshot({ path: `${folder}/${info.project.name}-${name}.png` });
}

/** A press as a finger makes it, with nothing else under it: what is under the finger is the thing itself. */
async function touch(page: Page, locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  const x = box.x + Math.min(60, box.width / 2);
  const y = box.y + box.height / 2;
  const mine = await locator.evaluate(
    (element, [px, py]) => {
      const hit = document.elementFromPoint(px!, py!);
      return hit === element || element.contains(hit);
    },
    [x, y],
  );
  expect(mine, "the row is what is under the finger").toBe(true);
  await page.touchscreen.tap(x, y);
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

let places: string[] = [];
let home: string | undefined;
let restoreHome: (() => Promise<void>) | undefined;
async function setUp(page: Page) {
  await page.goto("/");
  places = await installChannelTrip(page);
  // The household's home: the saved place with the home icon, as the first household takes it.
  home = (await api<{ marker: { id: string } }>(page, "POST", "/api/maps/markers", { name: "Home", lat: 51.3, lon: -0.34, icon: "home" }))
    .marker.id;
  restoreHome = await useAsHome(page, home);
}
async function tearDown(page: Page) {
  await restoreHome?.();
  if (home) await api(page, "DELETE", `/api/maps/markers/${home}`);
  await removeChannelTrip(page, places);
}

for (const size of [
  { width: 320, height: 568, keyboard: 260, scheme: "light" as const },
  { width: 320, height: 568, keyboard: 260, scheme: "dark" as const },
  { width: 390, height: 664, keyboard: 300, scheme: "light" as const },
  { width: 390, height: 664, keyboard: 300, scheme: "dark" as const },
]) {
  test.describe(`Directions at ${size.width} by ${size.height}, ${size.scheme}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, colorScheme: size.scheme });
    test.beforeEach(async ({ page }) => setUp(page));
    test.afterEach(async ({ page }) => tearDown(page));

    test("Directions, type, tap: planned at once; the totals, Steps, one step at a time, and Save", async ({ page }, info) => {
      test.setTimeout(150_000);
      const errors = watchForErrors(page);
      const shot = (name: string) => picture(page, info, `directions-${size.width}-${size.scheme}-${name}`);
      await standInKeyboard(page);
      await page.goto("/maps?lat=49&lon=3&z=5");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      // Maps has no app bar on a phone: its own search is at the top; quick search is in More.
      await expect(page.getByRole("button", { name: "Quick search" })).toBeHidden();
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav).toBeVisible();
      await shot("1-rest");

      // One press: the picker, its field focused (the keyboard comes up once), saved places under it.
      await page.getByRole("button", { name: "Directions", exact: true }).tap();
      const picker = page.getByRole("dialog", { name: "Where to?" });
      await expect(picker).toBeVisible();
      const field = picker.getByRole("combobox", { name: /^To: / });
      await expect(field).toBeFocused();
      await keyboard(page, size.keyboard);
      await aboveKeyboard(page, field, size.keyboard);
      const rows = picker.getByRole("option");
      // Above the keyboard: four rows at 320 by 568, five at 390 by 664 (the owner's iPhone has 372 pt of page).
      for (let row = 0; row < (size.width < 390 ? 4 : 5); row += 1) await aboveKeyboard(page, rows.nth(row), size.keyboard);
      await shot("2-where-to");

      await page.keyboard.type("Reim", { delay: 40 });
      // What was typed narrows the list: the saved places that do not match go.
      await expect(picker.getByRole("option", { name: /^Chamonix/ })).toBeHidden();
      const reims = picker.getByRole("option", { name: /^Reims/ });
      await aboveKeyboard(page, reims, size.keyboard);
      await shot("3-typing");
      await touch(page, reims);
      await keyboard(page, 0);
      await expect(picker).toBeHidden();

      // The route's bar: from home, to Reims; the bar of screens put away while the task is in hand.
      await expect(page.getByRole("button", { name: "From: Home. Change" })).toBeVisible();
      await expect(page.getByRole("button", { name: "To: Reims. Change" })).toBeVisible();
      await expect(nav).toBeHidden();

      // Planned with no button to press: the distance and time first.
      const sheet = page.getByRole("region", { name: "Directions" });
      const totals = sheet.getByRole("heading", { name: /\d+ km/ });
      await expect(totals).toBeVisible({ timeout: 60_000 });
      await expect(totals).toBeInViewport({ ratio: 1 });
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      const small = (await page.evaluate(auditLayout, { scope: "body" })).filter((finding) => finding.kind === "small-target");
      expect(
        small.filter((finding) => !/credit|OpenStreetMap|more|©/i.test(finding.what)),
        "44 px targets",
      ).toEqual([]);
      // Once the map has fitted the route into what the bar and the sheet leave: a short ease, then still.
      await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
      await shot("4-planned");

      // The steps, as a page; a line pressed drops the sheet to that step, and Next walks the route.
      await sheet.getByRole("button", { name: "Steps" }).tap();
      const list = sheet.getByRole("list", { name: "Directions" });
      await expect(list).toBeVisible();
      await shot("5-steps");
      await list.getByRole("button").first().tap();
      await expect(sheet.getByText(/^Step 1 of \d+$/)).toBeVisible();
      await sheet.getByRole("button", { name: /^Next/ }).tap();
      await expect(sheet.getByText(/^Step 2 of \d+$/)).toBeVisible();
      await shot("6-one-step");
      await sheet.getByRole("button", { name: "All steps" }).tap();
      await sheet.getByRole("button", { name: "Map" }).tap();
      await expect(totals).toBeVisible();

      // Save: one press, no keyboard, said where it was pressed.
      await sheet.getByRole("button", { name: "Save" }).tap();
      await expect(sheet.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
      await expect(sheet.getByText(/^Saved as “Home to Reims”/)).toBeVisible();
      expect((await api<{ routes: Array<{ name: string }> }>(page, "GET", "/api/roads/routes")).routes.map((route) => route.name)).toEqual([
        "Home to Reims",
      ]);
      await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
      await shot("7-saved");

      // Ended, Maps is as it was: the bar of screens back, and Directions under the thumb.
      await page.getByRole("button", { name: "End directions" }).tap();
      await expect(nav).toBeVisible();
      await expect(page.getByRole("button", { name: "Directions", exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe("Directions on a phone, more", () => {
  test.use({ viewport: { width: 390, height: 664 } });
  test.beforeEach(async ({ page }) => setUp(page));
  test.afterEach(async ({ page }) => tearDown(page));

  test("swap, a stop from the options, Cancel while planning, and both themes pass the automated check", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=49&lon=3&z=5");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Directions", exact: true }).tap();
    await page
      .getByRole("dialog", { name: "Where to?" })
      .getByRole("option", { name: /^Chamonix/ })
      .tap();
    const sheet = page.getByRole("region", { name: "Directions" });
    await expect(sheet.getByRole("heading", { name: /\d+ km/ })).toBeVisible({ timeout: 60_000 });
    expect(await accessibilityInBothThemes(page, "/maps (directions, phone)")).toEqual([]);

    // Swapped, the route is planned again the other way (the test roads are one way, so it says it could not be, and
    // what puts it right); swapped back, the first answer is there at once, kept for the visit and not asked for again.
    const plans: string[] = [];
    page.on("request", (request) => request.url().endsWith("/api/roads/route") && plans.push(request.url()));
    await page.getByRole("button", { name: "Swap the start and the end" }).tap();
    await expect(page.getByRole("button", { name: "From: Chamonix. Change" })).toBeVisible();
    await expect(sheet.getByText("The route could not be planned")).toBeVisible({ timeout: 60_000 });
    await expect(sheet.getByRole("button", { name: "Change the end" })).toBeVisible();
    await page.getByRole("button", { name: "Swap the start and the end" }).tap();
    await expect(sheet.getByRole("heading", { name: /\d+ km/ })).toBeVisible({ timeout: 2_000 });
    expect(plans).toHaveLength(1);

    // A stop, from the options page: the picker again, for Stop 1.
    await sheet.getByRole("button", { name: "Options" }).tap();
    await expect(page.getByText("Stops and options")).toBeVisible();
    await sheet.getByRole("button", { name: "Add a stop" }).tap();
    const picker = page.getByRole("dialog", { name: "Stop 1: where?" });
    await expect(picker).toBeVisible();
    await picker.getByRole("option", { name: /^Reims/ }).tap();
    await expect(sheet.getByRole("button", { name: /^Reims/ })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).tap();
    // Planning can be stopped while it runs, and asked for again.
    const cancel = sheet.getByRole("button", { name: "Cancel" });
    if (await cancel.isVisible()) {
      await cancel.tap();
      await expect(sheet.getByText("Planning stopped.")).toBeVisible();
      await sheet.getByRole("button", { name: "Plan the route" }).tap();
    }
    await expect(sheet.getByRole("heading", { name: /\d+ km/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Via Reims" })).toBeVisible();
    // The one refusal was the route the test roads cannot join, said in the sheet above.
    expect(errors.filter((error) => !/status of 400/.test(error))).toEqual([]);
  });

  test("home from where you are: Directions, Home, Choose on the map (opening where you were), Use this point", async ({ page }, info) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    // Looking at Leatherhead, close in, before Directions is pressed.
    await page.goto("/maps?lat=51.296&lon=-0.33&z=14");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Directions", exact: true }).tap();
    await page.getByRole("dialog", { name: "Where to?" }).getByRole("option", { name: /^Home/ }).tap();
    const from = page.getByRole("dialog", { name: "Where from?" });
    await expect(from).toBeVisible();
    const rows = from.getByRole("option");
    // Choose on the map first and largest; then where the device is (on localhost a browser will say); then the saved
    // places nearest where the map was looking.
    await expect(rows.nth(0)).toContainText("Choose on the map");
    await expect(rows.nth(0)).toContainText("Opens where you last looked at the map");
    expect((await rows.nth(0).boundingBox())!.height).toBeGreaterThanOrEqual(64);
    await expect(rows.nth(1)).toContainText("Where I am");
    await expect(rows.nth(2)).toContainText("Leatherhead");
    await picture(page, info, "directions-from-picker");
    await rows.nth(0).tap();
    // The map is back where it was looking, not on home or the far end.
    await expect.poll(() => new URL(page.url()).searchParams.get("lat")).toMatch(/^51\.29/);
    await page.getByRole("button", { name: "Use this point as the start" }).tap();
    await expect(page.getByRole("button", { name: /^From: Point at 51\.29/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "To: Home. Change" })).toBeVisible();
    const sheet = page.getByRole("region", { name: "Directions" });
    await expect(sheet.getByRole("heading", { name: /\d+(\.\d+)? k?m/ }).or(sheet.getByText("The route could not be planned"))).toBeVisible(
      {
        timeout: 60_000,
      },
    );
    await picture(page, info, "directions-from-point");
    expect(errors.filter((error) => !/status of 400/.test(error))).toEqual([]);
  });

  test("Directions from a saved place, and quick search in More", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=49&lon=3&z=5");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    // A saved place found by the map's search opens in the sheet, with Directions on its first line.
    await page.getByLabel("Search the map").tap();
    await page.keyboard.type("Chamon", { delay: 30 });
    await page.getByRole("option", { name: /^Chamonix/ }).tap();
    await page.getByRole("button", { name: "Directions", exact: true }).tap();
    await expect(page.getByRole("button", { name: "To: Chamonix. Change" })).toBeVisible();
    await expect(page.getByRole("button", { name: "From: Home. Change" })).toBeVisible();
    await page.getByRole("button", { name: "End directions" }).tap();
    // A point found by its coordinates has a card over the map, with Directions to here.
    await page.goto("/maps?lat=49&lon=3&z=5");
    await page.getByLabel("Search the map").tap();
    await page.keyboard.type("49.5, 3.5", { delay: 30 });
    await page.getByRole("option").first().tap();
    await page.getByRole("button", { name: "Directions to here" }).tap();
    await expect(page.getByRole("button", { name: /^To: Point at 49\.5/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "From: Home. Change" })).toBeVisible();
    await page.getByRole("button", { name: "End directions" }).tap();
    // Quick search, with no app bar on Maps, is the first row of More.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^More/ }).tap();
    await page.getByRole("button", { name: "Quick search" }).tap();
    await expect(page.getByRole("dialog", { name: "Search and go to" })).toBeVisible();
    // The made-up point is far from the test roads: its refusal is said in the sheet, and is the only one.
    expect(errors.filter((error) => !/status of 400/.test(error))).toEqual([]);
  });
});

test.describe("Directions on an iPad held upright, by touch", () => {
  test.use({ viewport: { width: 820, height: 1180 } });
  test.beforeEach(async ({ page }) => setUp(page));
  test.afterEach(async ({ page }) => tearDown(page));

  test("the panel's form plans a route by touch, under its new name", async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/maps?lat=49&lon=3&z=5&tab=routes");
    await page.getByRole("button", { name: "Directions", exact: true }).tap();
    await expect(page.getByRole("heading", { name: "Directions", exact: true })).toBeVisible();
    await choosePlace(page, "From", "Home", true);
    await choosePlace(page, "To", "Reims", true);
    await page.getByRole("button", { name: "Plan route" }).tap();
    await expect(page.getByRole("heading", { name: "Home to Reims" })).toBeVisible({ timeout: 60_000 });
    // The app's own bars are a wide screen's: the rail, no bar of screens.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await picture(page, info, "directions-ipad-portrait");
    expect(errors).toEqual([]);
  });
});

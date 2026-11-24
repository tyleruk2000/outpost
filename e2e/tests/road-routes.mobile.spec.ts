/**
 * Road routes on a phone: Directions' bar, picker and sheet, every control a 44 px target,
 * nothing past the edge of the screen (the plain text box scrolls inside itself), no serious
 * accessibility finding in either theme, and the same with the text at 200%.
 */
import type { Page } from "@playwright/test";
import { accessibilityInBothThemes } from "./a11y";
import { expect, test, watchForErrors } from "./fixtures";
import { auditLayout } from "./layout-audit";
import { installChannelTrip, removeChannelTrip, useAsHome } from "./road-routes";

const SHEET = 'section[aria-label="Directions"]';
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * What in the sheet reaches past the right of the screen. The panel scrolls up and down, so a
 * thing past the edge is cut off, not scrolled to; the plain text box scrolls its own lines.
 */
function pastTheEdge(page: Page): Promise<string[]> {
  return page.evaluate((sheet) => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll(`${sheet} *`)]
      .filter((element) => !element.closest("svg") || element.tagName.toLowerCase() === "svg")
      .filter((element) => !element.closest(".sr-only"))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.right > width + 1)
      .slice(0, 5)
      .map(
        ({ element, box }) =>
          `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" to ${Math.round(box.right)}`,
      );
  }, SHEET);
}

/** Opens the steps: the sheet takes the room under the bar, where the directions are read. */
async function raiseSheet(page: Page) {
  await page.locator(SHEET).getByRole("button", { name: "Steps" }).tap();
  await expect(page.getByRole("list", { name: "Directions" })).toBeVisible();
}

/** Directions, as a person does it on a phone: the end, then the start it asks for, then a stop from the options. */
async function planOnPhone(page: Page) {
  await page.goto("/maps?lat=49&lon=3&z=5");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Directions", exact: true }).tap();
  const smallBefore = (await page.evaluate(auditLayout, { scope: '[role="dialog"][aria-label="Where to?"]' })).filter(
    (finding) => finding.kind === "small-target",
  );
  expect(smallBefore, "the picker's controls are 44 px targets").toEqual([]);
  await page
    .getByRole("dialog", { name: "Where to?" })
    .getByRole("option", { name: /^Chamonix/ })
    .tap();
  // From is the household's home, Leatherhead here.
  await expect(page.getByRole("button", { name: "From: Leatherhead. Change" })).toBeVisible();
  const sheet = page.locator(SHEET);
  await expect(sheet.getByRole("heading", { name: /\d+ km/ })).toBeVisible({ timeout: 60_000 });
  await sheet.getByRole("button", { name: "Options" }).tap();
  await sheet.getByRole("button", { name: "Add a stop" }).tap();
  await page
    .getByRole("dialog", { name: "Stop 1: where?" })
    .getByRole("option", { name: /^Reims/ })
    .tap();
  await page.getByRole("button", { name: "Done" }).tap();
  await expect(sheet.getByRole("heading", { name: /\d+ km/ })).toBeVisible({ timeout: 60_000 });
  await raiseSheet(page);
  await expect(page.getByRole("list", { name: "Directions" }).getByText("M20 - Folkestone", { exact: true })).toBeAttached();
}

test("a road route on a phone: 44 px targets, nothing past the edge, both themes", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchForErrors(page);
  await page.goto("/");
  const places = await installChannelTrip(page);
  const restoreHome = await useAsHome(page, places[0]!);
  try {
    await planOnPhone(page);
    const small = (await page.evaluate(auditLayout, { scope: SHEET })).filter((finding) => finding.kind === "small-target");
    expect(small, "the route's controls are 44 px targets").toEqual([]);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    expect(await pastTheEdge(page)).toEqual([]);
    expect(await accessibilityInBothThemes(page, "/maps (road route, phone)")).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await restoreHome();
    await removeChannelTrip(page, places);
  }
});

test("a road route on a phone with the text at 200%", async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  });
  await page.goto("/");
  const places = await installChannelTrip(page);
  const restoreHome = await useAsHome(page, places[0]!);
  try {
    await planOnPhone(page);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    expect(await pastTheEdge(page)).toEqual([]);
  } finally {
    await restoreHome();
    await removeChannelTrip(page, places);
  }
});

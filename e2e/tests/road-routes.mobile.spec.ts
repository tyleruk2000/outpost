/**
 * Road routes on a phone: the panel in the sheet, every control a 44 px target, nothing past
 * the edge of the screen (the plain text box scrolls inside itself), no serious accessibility
 * finding in either theme, and the same with the text at 200%.
 */
import type { Page } from "@playwright/test";
import { accessibilityInBothThemes } from "./a11y";
import { expect, test, watchForErrors } from "./fixtures";
import { auditLayout } from "./layout-audit";
import { choosePlace, installChannelTrip, removeChannelTrip } from "./road-routes";

const SHEET = "section.outpost-sheet";
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

/** Steps the sheet up to its full height, where the directions are read. */
async function raiseSheet(page: Page) {
  const handle = page.getByRole("button", { name: /^Panel height/ });
  for (let step = 0; step < 3 && !/full/.test((await handle.getAttribute("aria-label")) ?? ""); step += 1) await handle.tap();
  await expect(handle).toHaveAttribute("aria-label", /full/);
  await expect(page.getByRole("list", { name: "Directions" })).toBeVisible();
}

async function planOnPhone(page: Page) {
  await page.goto("/maps?lat=49&lon=3&z=5&tab=routes");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Plan a route" }).first().tap();
  await expect(page.getByRole("heading", { name: "Plan a route", exact: true })).toBeVisible();
  const smallBefore = (await page.evaluate(auditLayout, { scope: SHEET })).filter((finding) => finding.kind === "small-target");
  expect(smallBefore, "the form's controls are 44 px targets").toEqual([]);
  await choosePlace(page, "From", "Leatherhead", true);
  await page.getByRole("button", { name: "Add a via point" }).tap();
  await choosePlace(page, "Via 1", "Reims", true);
  await choosePlace(page, "To", "Chamonix", true);
  await page.getByRole("button", { name: "Plan route" }).tap();
  await expect(page.getByRole("heading", { name: "Leatherhead to Chamonix" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("list", { name: "Directions" }).getByText("M20 - Folkestone", { exact: true })).toBeAttached();
}

test("a road route on a phone: 44 px targets, nothing past the edge, both themes", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchForErrors(page);
  await page.goto("/");
  const places = await installChannelTrip(page);
  try {
    await planOnPhone(page);
    // Raised, the sheet shows the directions.
    await raiseSheet(page);
    const small = (await page.evaluate(auditLayout, { scope: SHEET })).filter((finding) => finding.kind === "small-target");
    expect(small, "the route's controls are 44 px targets").toEqual([]);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    expect(await pastTheEdge(page)).toEqual([]);
    expect(await accessibilityInBothThemes(page, "/maps (road route, phone)")).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
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
  try {
    await planOnPhone(page);
    await raiseSheet(page);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    expect(await pastTheEdge(page)).toEqual([]);
  } finally {
    await removeChannelTrip(page, places);
  }
});

/**
 * Four faults measured on the owner's Outpost, with real place names: their long details
 * made the route form wider than the screen; the map's own buttons lay over the search
 * box's results; on an iPad the Plan route row floated over the suggestions; and after a
 * choice the form was left scrolled with From out of sight. WebKit, by touch.
 */
import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";
import { standInPlaceNames } from "./place-names-stand-in";
import { installChannelTrip, removeChannelTrip } from "./road-routes";

/** For each row, where its right-hand edge is, and whether a finger just inside that edge lands on the row itself. */
async function rowsUnderFinger(page: Page, selector: string) {
  return page.evaluate((rows) => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>(rows)].map((row) => {
      const box = row.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(box.right, width) - 6, box.top + box.height / 2);
      return { text: (row.textContent ?? "").slice(0, 24), right: box.right, mine: row === hit || row.contains(hit) };
    });
  }, selector);
}

for (const width of [320, 390]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 664 } });

    test("the map's search results are on the screen, and under the finger", async ({ page }) => {
      const errors = watchForErrors(page);
      await standInPlaceNames(page);
      await page.goto("/maps?lat=57&lon=-5&z=6");
      await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
      await page.getByLabel("Search the map").tap();
      await page.keyboard.type("Rei", { delay: 40 });
      await expect(page.getByRole("listbox", { name: "Search results" }).getByRole("option", { name: /Reinigeadal/ })).toBeVisible();
      const rows = await rowsUnderFinger(page, '[role="listbox"][aria-label="Search results"] [role="option"]');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.right, `${row.text} stays on the screen`).toBeLessThanOrEqual(width + 0.5);
        // Before, "Show where I am" was on top at the end of the first result.
        expect(row.mine, `${row.text} is what a finger at its end presses`).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe("Directions on an iPad held upright, by touch", () => {
  test.use({ viewport: { width: 820, height: 1180 } });
  let places: string[] = [];
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    places = await installChannelTrip(page);
  });
  test.afterEach(async ({ page }) => {
    await removeChannelTrip(page, places);
  });

  test("long details stay inside the panel, nothing floats over the suggestions, and a choice leaves the form at its top", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await standInPlaceNames(page);
    await page.goto("/maps?lat=50&lon=2&z=5&tab=routes&road=1");
    await expect(page.getByRole("heading", { name: "Directions", exact: true })).toBeVisible({ timeout: 15_000 });
    const edge = await page
      .getByRole("complementary", { name: /Places, routes/ })
      .evaluate((element) => element.getBoundingClientRect().right);

    await page.getByLabel("To", { exact: true }).tap();
    await page.keyboard.type("Rei", { delay: 40 });
    const list = page.getByRole("list", { name: "Places for to" });
    await expect(list.getByRole("button", { name: /Reinigeadal/ })).toBeVisible();
    // Nothing in the field's row or its list reaches past the panel: the middle-of-the-map button is in it.
    const middle = (await page.getByRole("button", { name: "To: the middle of the map" }).boundingBox())!;
    expect(middle.x + middle.width).toBeLessThanOrEqual(edge + 0.5);
    for (const row of await rowsUnderFinger(page, '[aria-label="Places for to"] button')) {
      expect(row.right, `${row.text} inside the panel`).toBeLessThanOrEqual(edge + 0.5);
      expect(row.mine, `${row.text} is what a finger at its end presses`).toBe(true);
    }
    // The Plan route row is an ordinary row where there is a finger, not a bar over the suggestions.
    const plan = page.getByRole("button", { name: "Plan route" });
    expect(await plan.evaluate((button) => getComputedStyle(button.parentElement!).position)).toBe("static");

    // Chosen, the form is back at its top: From in sight.
    await list.getByRole("button", { name: /Reinigeadal/ }).tap();
    await expect(page.getByRole("button", { name: "Change to" })).toBeVisible();
    await expect(page.getByLabel("From", { exact: true })).toBeInViewport();
    expect(await page.getByRole("form", { name: "Plan a road route" }).evaluate((form) => form.parentElement!.scrollTop)).toBe(0);
    expect(errors).toEqual([]);
  });
});

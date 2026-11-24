/**
 * Directions on a desktop with the keyboard alone: quick search to Directions, then Tab,
 * typing, Tab to a suggestion and Enter, for each end; Plan route; the route; and Save.
 * Nothing is pressed with the mouse and nothing is focused by the test itself.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { installChannelTrip, removeChannelTrip } from "./road-routes";

/** Presses Tab until what has focus is what `wanted` says, as a person would; fails if it is not reached. */
async function tabTo(page: Page, wanted: (element: { tag: string; label: string; text: string }) => boolean, what: string) {
  for (let step = 0; step < 60; step += 1) {
    await page.keyboard.press("Tab");
    const now = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      const label =
        element?.getAttribute("aria-label") ??
        (element?.id ? document.querySelector(`label[for="${element.id}"]`)?.textContent : null) ??
        "";
      return { tag: element?.tagName.toLowerCase() ?? "", label: label.trim(), text: (element?.textContent ?? "").trim() };
    });
    if (wanted(now)) return;
  }
  throw new Error(`${what} was not reached with Tab`);
}

test("Directions with the keyboard alone: quick search, both ends, plan, save", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchForErrors(page);
  await page.goto("/");
  const places = await installChannelTrip(page);
  try {
    await page.goto("/maps?lat=49&lon=3&z=5");
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Control+k");
    await page.keyboard.type("directions", { delay: 20 });
    await expect(page.getByRole("option", { name: /Directions/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Directions", exact: true })).toBeVisible();

    for (const [label, typed, place] of [
      ["From", "Leath", "Leatherhead"],
      ["To", "Reim", "Reims"],
    ] as const) {
      await tabTo(page, (element) => element.tag === "input" && element.label === label, `The ${label} field`);
      await page.keyboard.type(typed, { delay: 30 });
      await expect(
        page.getByRole("list", { name: `Places for ${label.toLowerCase()}` }).getByRole("button", { name: new RegExp(place) }),
      ).toBeVisible();
      await tabTo(page, (element) => element.tag === "button" && element.text.startsWith(place), `${place} in the list`);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: `Change ${label.toLowerCase()}` })).toBeVisible();
    }
    await tabTo(page, (element) => element.text === "Plan route", "Plan route");
    await page.keyboard.press("Enter");
    // The route's title takes the keyboard, so the next Tab is in the route.
    await expect(page.getByRole("heading", { name: "Leatherhead to Reims" })).toBeFocused({ timeout: 60_000 });
    await tabTo(page, (element) => element.text === "Save route", "Save route");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await api<{ routes: unknown[] }>(page, "GET", "/api/roads/routes")).routes.length).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await removeChannelTrip(page, places);
  }
});

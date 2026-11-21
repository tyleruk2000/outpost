/**
 * "Estimated radio range from here" on a phone: from the menu a long press opens, with the card and the outline sharing
 * a small screen. The terrain is the two ridges of tools/terrain-fixture.mjs.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { idle, ridgesAndRepeater } from "./repeater-range";

test.use({ viewport: { width: 390, height: 664 } });

/** A finger held on the map, as a long press is. */
async function hold(page: Page, at: { x: number; y: number }, ms: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForTimeout(ms);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

test("a radio range from a long press on a phone: the menu, the card in words, and the card put away", async ({ page }) => {
  const errors = watchForErrors(page);
  const { repeaterId, collectionId } = await ridgesAndRepeater(page, "e2e-point-range-phone");
  try {
    await page.goto("/maps?lat=57&lon=-3.4&z=10");
    await idle(page);
    // On the map itself, clear of the cards and the tools, held still as a long press is.
    const map = (await page.locator("canvas").first().boundingBox())!;
    await hold(page, { x: Math.round(map.x + 90), y: Math.round(map.y + 150) }, 900);
    const menu = page.getByRole("menu", { name: "At this point" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Estimated radio range from here" }).tap();

    const card = page.locator(".outpost-map-card").filter({ has: page.getByRole("heading", { name: "Estimated radio range" }) });
    // Folded to two lines once drawn, in the sheet's place, so the shading has the map; opened with one press.
    const folded = page.getByRole("region", { name: "Estimated radio range" });
    await expect(folded).toContainText(/in sight within 10 km/, { timeout: 20_000 });
    expect((await folded.boundingBox())!.height, "the folded card").toBeLessThan(map.height * 0.25);
    await expect(page.getByRole("button", { name: "Copy these coordinates" })).toBeHidden();
    await folded.getByRole("button", { name: "Show the details" }).tap();
    await expect(card.getByText(/^In sight: .* of the ground within 10 km/)).toBeVisible();
    // The drawing of why the shape is so is brought into view when it is opened.
    await card.getByRole("button", { name: "Why this shape: look along one direction" }).tap();
    await expect(card.getByRole("slider", { name: /^Direction to look along/ })).toBeInViewport({ timeout: 5_000 });
    await card.getByRole("button", { name: "Why this shape: look along one direction" }).tap();
    // Short until asked; what to change is then in reach, a finger's size.
    await card.getByRole("button", { name: /^Heights and details/ }).tap();
    for (const control of [card.getByLabel("Your aerial"), card.getByRole("radio", { name: "Car" })]) {
      await control.scrollIntoViewIfNeeded();
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await card.getByRole("button", { name: "Stop showing this range" }).tap();
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await api(page, "DELETE", `/api/repeaters/${repeaterId}`);
    await api(page, "DELETE", `/api/collections/${collectionId}?deleteFiles=true`);
  }
});

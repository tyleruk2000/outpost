/**
 * "Estimated radio range from here": chosen from the menu a right-click opens, worked out over installed terrain by the
 * repeaters' estimate, said in words in a card and drawn as an outline on the map. The terrain is the two ridges made by
 * tools/terrain-fixture.mjs; the point is between them.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { idle, outlineBox, ridgesAndRepeater } from "./repeater-range";

test.use({ viewport: { width: 1280, height: 800 } });

test("a radio range from any point: from the right-click menu, said in a card and drawn on the map", async ({ page }) => {
  const errors = watchForErrors(page);
  const { repeaterId, collectionId } = await ridgesAndRepeater(page, "e2e-point-range");
  try {
    await page.goto("/maps?lat=57&lon=-3.4&z=10");
    await idle(page);
    const map = (await page.locator(".outpost-map").boundingBox())!;
    await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2, { button: "right" });
    await page.getByRole("menuitem", { name: "Estimated radio range from here" }).click();

    const card = page.locator(".outpost-map-card").filter({ has: page.getByRole("heading", { name: "Estimated radio range" }) });
    await expect(card.getByText(/^In sight to about .* on most bearings/)).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: /^Heights and details/ }).click();
    await expect(card.getByText(/Line of sight only\. Your aerial 1\.5 m above the ground here/)).toBeVisible();
    await card.getByRole("button", { name: /^Heights and details/ }).click();
    await expect(card.getByText(/ground \d+ m above sea level/)).toBeVisible();
    await idle(page);

    // The outline is on the map, large enough to read: found as what changes when the card is closed.
    const outline = await outlineBox(page, () => card.getByRole("button", { name: "Stop showing this range" }).click());
    expect(outline, "the outline changes the map").not.toBeNull();
    expect(Math.min(outline!.width, outline!.height)).toBeGreaterThanOrEqual(120);
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await api(page, "DELETE", `/api/repeaters/${repeaterId}`);
    await api(page, "DELETE", `/api/collections/${collectionId}?deleteFiles=true`);
  }
});

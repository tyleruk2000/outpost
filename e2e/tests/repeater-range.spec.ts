/**
 * A repeater's estimated range on a wide screen (1280 x 800): the card stands at the
 * right of the map, short, and the outline is fitted into the map beside it, large
 * enough to read and none of it under the card. See repeater-range.mobile.spec.ts for
 * the terrain and the words.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { idle, outlineBox, overlaps, ridgesAndRepeater } from "./repeater-range";

test.use({ viewport: { width: 1280, height: 800 } });

test("a repeater's estimated range on a wide screen: fitted beside the card, which stays short", async ({ page }) => {
  const errors = watchForErrors(page);
  const { repeaterId, collectionId } = await ridgesAndRepeater(page, "e2e-range-wide");

  try {
    await page.goto(`/maps?repeater=${repeaterId}&range=1`);
    // Drawn, the card folds to one line at the top right of the map.
    const folded = page.getByRole("region", { name: "QZ3RNG: estimated range" });
    await expect(folded).toContainText(/QZ3RNG\s*About .* km, terrain partial/);
    await idle(page);

    // Opened out it stays short: the long account is behind a closed disclosure, and scrolls inside the card when open.
    await folded.getByRole("button", { name: "Show the details" }).click();
    const card = page.getByRole("region", { name: "Estimated range" });
    await expect(card.getByText(/^In sight to about .* on most bearings/)).toBeVisible();
    const whole = card.locator("xpath=ancestor::*[contains(@class, 'outpost-map-card')][1]");
    const map = (await page.locator(".outpost-map").boundingBox())!;
    expect((await whole.boundingBox())!.height).toBeLessThan(map.height * 0.8);
    await expect(card.getByText(/It takes no account of transmitter power/)).toBeHidden();
    await card.getByText("What this is, and is not").click();
    await expect(card.getByText(/It takes no account of transmitter power/)).toBeVisible();
    expect((await whole.boundingBox())!.height).toBeLessThan(map.height * 0.9);
    await card.getByText("What this is, and is not").click();

    // Folded again: the outline is in the map below the card, at least 120 px across, none of it under the card.
    await page.getByRole("button", { name: "Show less" }).click();
    await idle(page);
    const cardBox = (await folded.boundingBox())!;
    const outline = await outlineBox(page, () => folded.getByRole("switch", { name: "Estimated range" }).click());
    expect(outline, "the outline changes the map").not.toBeNull();
    expect(Math.min(outline!.width, outline!.height)).toBeGreaterThanOrEqual(120);
    expect(overlaps(outline!, cardBox), `outline ${JSON.stringify(outline)} and card ${JSON.stringify(cardBox)}`).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await api(page, "DELETE", `/api/repeaters/${repeaterId}`);
    await api(page, "DELETE", `/api/collections/${collectionId}?deleteFiles=true`);
  }
});

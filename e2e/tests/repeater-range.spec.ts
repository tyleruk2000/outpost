/**
 * A repeater's estimated range on a wide screen (1280 x 800): the card stands at the
 * right of the map, short, and the outline is fitted into the map beside it, large
 * enough to read and none of it under the card; and two repeaters' ranges on at once,
 * each from its own card. See repeater-range.mobile.spec.ts for the terrain and the words.
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
    await expect(folded).toContainText(/QZ3RNG\s*.* in sight within 10 km, typical .* km, furthest .* km .*, terrain partial/);
    await idle(page);

    // Opened out it stays short: the long account is behind a closed disclosure, and scrolls inside the card when open.
    await folded.getByRole("button", { name: "Show the details" }).click();
    const card = page.getByRole("region", { name: "Estimated range" });
    await expect(card.getByText(/^In sight: .* of the ground within 10 km, .* within 25 km\./)).toBeVisible();
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

test("two repeaters' ranges at once: each switched in its own card, both kept with no card open, one switched off alone", async ({
  page,
}) => {
  const errors = watchForErrors(page);
  const { repeaterId, collectionId } = await ridgesAndRepeater(page, "e2e-range-two");
  const { repeater: second } = await api<{ repeater: { id: string } }>(page, "POST", "/api/repeaters", {
    callsign: "QZ3RNH",
    outputHz: 145_750_000,
    lat: 57.05,
    lon: -3.36,
    place: "Up the valley",
  });
  const section = page.getByRole("region", { name: "Estimated range" });
  const repeatersButton = page.getByRole("button", { name: "Repeaters", exact: true });

  try {
    // The first, from the switch in its card.
    await page.goto(`/maps?repeater=${repeaterId}`);
    await section.getByRole("switch", { name: "Estimated range" }).click();
    await expect(page.getByRole("region", { name: "QZ3RNG: estimated range" })).toContainText(/terrain partial/);

    // The second has a switch of its own, off until it is switched on too.
    await page.goto(`/maps?repeater=${second.id}`);
    await expect(section.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    await section.getByRole("switch", { name: "Estimated range" }).click();
    const folded = page.getByRole("region", { name: "QZ3RNH: estimated range" });
    await expect(folded).toContainText(/terrain partial/);
    await folded.getByRole("button", { name: "Show the details" }).click();
    await expect(section.getByText("2 ranges are shown on the map.")).toBeVisible();
    await expect(section.getByRole("button", { name: "Hide all ranges" })).toBeVisible();

    // Closed, the outlines stay on the map, and go only with the map's repeaters.
    await page.getByRole("button", { name: "Close this repeater" }).click();
    await idle(page);
    const both = await outlineBox(page, () => repeatersButton.click());
    expect(both, "the outlines are still drawn with no card open").not.toBeNull();
    expect(Math.min(both!.width, both!.height)).toBeGreaterThanOrEqual(120);

    // The first opened again shows its switch on; switched off there, the second's outline stays.
    await page.goto(`/maps?repeater=${repeaterId}`);
    await expect(section.getByRole("switch", { name: "Estimated range" })).toBeChecked();
    await expect(section.getByText("2 ranges are shown on the map.")).toBeVisible();
    await section.getByRole("switch", { name: "Estimated range" }).click();
    await expect(section.getByRole("switch", { name: "Estimated range" })).not.toBeChecked();
    await expect(section.getByText(/ranges are shown on the map/)).toBeHidden();
    await idle(page);
    const left = await outlineBox(page, () => repeatersButton.click());
    expect(left, "the second repeater's outline is still drawn").not.toBeNull();
    expect(Math.min(left!.width, left!.height)).toBeGreaterThanOrEqual(120);
    expect(errors).toEqual([]);
  } finally {
    await api(page, "DELETE", `/api/repeaters/${second.id}`);
    await api(page, "DELETE", `/api/repeaters/${repeaterId}`);
    await api(page, "DELETE", `/api/collections/${collectionId}?deleteFiles=true`);
  }
});

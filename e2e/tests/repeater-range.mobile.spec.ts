/**
 * A repeater's estimated range on a phone the width of an iPhone (390 points): switched
 * on from the repeater's own page, worked out over terrain whose shape is known, the
 * card folded out of the way, the outline drawn large enough to read in the map the
 * card leaves clear, said in words, and nothing pushed sideways off the screen.
 *
 * The terrain is the suite's fixture (e2e/tools/terrain-fixture.mjs): a plain at 100 m
 * with two ridges 400 m high along 3.5° W and 3.3° W, between 56.9° N and 57.1° N. A
 * repeater on the plain between them, at 3.4° W, is in sight up to each ridge east and
 * west, and up and down the valley until the terrain runs out: so the terrain covers
 * only part of the area, and the card says so.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";
import { idle, outlineBox, overlaps, ridgesAndRepeater } from "./repeater-range";

test.use({ viewport: { width: 390, height: 844 } });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("a repeater's estimated range on a phone: folded out of the way, drawn large, and said in words", async ({ page }) => {
  const errors = watchForErrors(page);
  const { repeaterId, collectionId } = await ridgesAndRepeater(page, "e2e-range-phone");

  try {
    await page.goto(`/radio/repeaters/${repeaterId}`);
    await expect(page.getByRole("heading", { name: "QZ3RNG", level: 1 })).toBeVisible();
    const asked = page.waitForResponse((response) => response.url().includes("/api/maps/sight-range"));
    await page.getByRole("link", { name: "Estimated range" }).tap();
    expect(await (await asked).json()).toMatchObject({ coverage: "partial", aerialMeters: 10, stationMeters: 1.5 });

    // Once the outline is drawn the card folds to one line: the callsign, the answer in a few words, the switch.
    const folded = page.getByRole("region", { name: "QZ3RNG: estimated range" });
    await expect(folded).toContainText(/QZ3RNG\s*.* in sight within 10 km, typical .* km, furthest .* km .*, terrain partial/);
    await expect(folded.getByRole("switch", { name: "Estimated range" })).toBeChecked();
    await idle(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Every control on it a thumb's width.
    for (const control of await folded.getByRole("button").all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Unfolded: the heights and the limit, the assumed one said to be assumed; the answer in a sentence.
    await folded.getByRole("button", { name: "Show the details" }).tap();
    const card = page.getByRole("region", { name: "Estimated range" });
    await expect(
      card.getByText(/^Line of sight only\. Repeater aerial 10 m above the ground, assumed: its list gives no height\./),
    ).toBeVisible();
    await expect(card.getByText(/Handheld 1\.5 m: held at head height\. Out to 100 km/)).toBeVisible();
    await expect(card.getByRole("textbox", { name: "Repeater aerial" })).toHaveValue("10");
    await expect(card.getByText(/^In sight: .* of the ground within 10 km, .* within 25 km\./)).toBeVisible();
    await expect(card.getByText("Terrain covers only part of the area within 100 km (62 mi).")).toBeVisible();
    await expect(card.getByRole("button", { name: "Get terrain in Offline maps" })).toBeVisible();
    // What it is not, behind one disclosure.
    await card.getByText("What this is, and is not").tap();
    await expect(card.getByText(/It takes no account of transmitter power, aerial gain or pattern, frequency/)).toBeVisible();
    await expect(card.getByText(/A repeater may be heard from ground left clear and not heard from shaded ground\./)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Folded again, the outline is on the map, at least 120 px across, and none of it under the card.
    await page.getByRole("button", { name: "Show less" }).tap();
    await idle(page);
    const cardBox = (await folded.boundingBox())!;
    const outline = await outlineBox(page, () => folded.getByRole("switch", { name: "Estimated range" }).tap());
    expect(outline, "the outline changes the map").not.toBeNull();
    expect(Math.min(outline!.width, outline!.height)).toBeGreaterThanOrEqual(120);
    expect(overlaps(outline!, cardBox), `outline ${JSON.stringify(outline)} and card ${JSON.stringify(cardBox)}`).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await api(page, "DELETE", `/api/repeaters/${repeaterId}`);
    // Other tests expect no terrain to be installed.
    await api(page, "DELETE", `/api/collections/${collectionId}?deleteFiles=true`);
  }
});

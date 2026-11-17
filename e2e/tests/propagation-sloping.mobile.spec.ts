import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

/** Chooses from one of the planner's lists. */
async function choose(page: Page, list: string, option: string) {
  await page.getByRole("combobox", { name: list, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

/** Presses Predict and waits for the engine's answer to that press. */
async function predict(page: Page) {
  const answered = page.waitForResponse((response) => response.url().endsWith("/api/radio/propagation/predict"));
  await page.getByRole("button", { name: "Predict", exact: true }).click();
  expect((await answered).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
}

/**
 * Nothing spills sideways, read at once. (A new chart was once drawn at a 640 px fallback for a frame before its
 * width was measured, so a read just as an answer arrived found 270 px of sideways scroll; charts are now measured
 * before they are first painted, in features/radio/use-width.ts.)
 */
const fits = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.describe("A sloping 20 m wire on the HF planner, at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("is found in two steps in the antenna chooser, and is approximate on 40 m, 20 m and 10 m and not modelled on 80 m", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
    await page.getByLabel("Date (UTC)").fill("2026-11-16");

    // ── The chooser: a heading for the wire's length, then how it is put up. Reached by a thumb.
    const trigger = page.getByRole("button", { name: "Transmitting antenna", exact: true });
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
    const list = page.getByRole("listbox", { name: "Antennas" });
    const twenty = list.getByRole("group", { name: "End-fed wire, 20 m (a half-wave on 40 m)" });
    await expect(twenty.getByRole("option")).toHaveText([
      "Sloping 25°, from 1.5 m up to 10 m",
      "Horizontal, level 6 m up",
      "SPOOLTENNA, 19.8 m, sloping 17° from 1.8 m to 7.6 m",
    ]);
    // The list fits the phone's width, and each choice is a thumb's height.
    const box = (await list.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect((await twenty.getByRole("option").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Typing finds it too.
    await page.getByRole("searchbox", { name: "Find an antenna" }).fill("20 m sloping");
    await expect(list.getByRole("option")).toHaveCount(2);
    await twenty.getByRole("option", { name: "Sloping 25°, from 1.5 m up to 10 m" }).click();
    await expect(trigger).toHaveText("End-fed half-wave, 20 m wire, sloping 25° from 1.5 m to 10 m");
    await expect(page.getByText(/^Approximate: 20 m of wire is 0\.47 wavelengths at 7\.1 MHz, about a half-wave\./)).toBeVisible();
    await fits(page);

    const ranked = page.getByRole("list", { name: /Bands ranked by reliability at/ });
    const lengths = page.getByRole("list", { name: "The wire on each band" });

    // ── 40 m: a half-wave, run as the sloping long wire at its slope. Approximate, from the first line.
    await predict(page);
    await expect(page.getByText("Approximate figures for 7.10 MHz", { exact: true })).toBeVisible();
    await expect(page.locator("p[data-approximate]").first()).toContainText("sloping long wire (at the wire's slope)");
    await expect(page.getByText(/its high end towards \d+° \(away from the other station\)/)).toBeVisible();
    await expect(lengths.getByRole("listitem").filter({ hasText: "40 m" })).toContainText(
      "0.47 wavelengths, about a half-wave. Approximate: VOACAP's sloping long wire, at the wire's slope",
    );
    // Not modelled on 80 m and 60 m, approximate on the seven bands above; one model throughout, so no join between two.
    await expect(ranked.getByText("Not modelled", { exact: true })).toHaveCount(2);
    await expect(ranked.locator("[data-approximate]")).toHaveCount(7);
    await expect(page.getByText("Two of VOACAP's models side by side")).toHaveCount(0);
    await expect(lengths.getByRole("listitem").filter({ hasText: "80 m" })).toContainText(
      "0.24 wavelengths, shorter than a half-wave. Not modelled: no figure",
    );
    await fits(page);

    // ── 20 m: about a whole wavelength.
    await choose(page, "Band", "20 m");
    await predict(page);
    await expect(page.getByText("Approximate figures for 14.2 MHz", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /14\.2 MHz at \d\d:00 UTC/ })).toBeVisible();
    await expect(lengths.getByRole("listitem").filter({ hasText: "20 m" }).first()).toContainText(
      "0.95 wavelengths, longer than a half-wave. Approximate",
    );
    await fits(page);

    // ── 10 m: nearly two wavelengths.
    await choose(page, "Band", "10 m");
    await predict(page);
    await expect(page.getByText("Approximate figures for 28.9 MHz", { exact: true })).toBeVisible();
    await expect(lengths.getByRole("listitem").filter({ hasText: "10 m" }).last()).toContainText(
      "1.92 wavelengths, longer than a half-wave. Approximate",
    );
    await expect(page.getByText(/% for SSB voice \(approximate\)$/)).toBeVisible();
    await fits(page);
    expect(errors).toEqual([]);
  });
});

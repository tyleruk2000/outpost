import type { Page } from "@playwright/test";
import { expect, test, watchForErrors } from "./fixtures";

/** Chooses from one of the planner's lists. */
async function choose(page: Page, list: string, option: string) {
  await page.getByRole("combobox", { name: list, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

/** Presses Predict and waits for the engine's answer to that press, so that nothing is read off the answer before it. */
async function predict(page: Page) {
  const answered = page.waitForResponse((response) => response.url().endsWith("/api/radio/propagation/predict"));
  await page.getByRole("button", { name: "Predict", exact: true }).click();
  expect((await answered).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
}

const fits = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.describe("End-fed wires on the HF planner, on a phone", () => {
  test("offers a 10 m and a 5 m wire, level and upright, and never gives a figure the engine has no model for", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation");
    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
    await page.getByLabel("Date (UTC)").fill("2026-11-16");

    // ── 10 m of wire, level. On 40 m it is a quarter-wave: said under the antenna before anything is asked.
    await choose(page, "Transmitting antenna", "End-fed half-wave, 10 m wire, horizontal");
    await expect(page.getByText(/^Not modelled: 10 m of wire is 0\.24 wavelengths at 7\.1 MHz, shorter than a half-wave\./)).toBeVisible();
    await predict(page);
    await expect(page.getByText("No figure for 7.10 MHz: an antenna is not modelled there")).toBeVisible();
    await expect(page.getByText(/The bands below that have figures are 20 m, 17 m \(approximate\), 15 m \(approximate\), 12 m \(approximate\), 10 m \(approximate\)\./)).toBeVisible();
    // No figure for 7.1 MHz anywhere: not a nought, and not "no path".
    await expect(page.getByRole("heading", { name: /7\.10 MHz at \d\d:00 UTC/ })).toHaveCount(0);
    // The band table: the four bands below 20 m say they are not modelled; the others have figures.
    const ranked = page.getByRole("list", { name: /Bands ranked by reliability at/ });
    await expect(ranked.getByRole("listitem")).toHaveCount(9);
    await expect(ranked.getByText("Not modelled", { exact: true })).toHaveCount(4);
    await expect(page.getByRole("list", { name: "The wire on each band" }).getByRole("listitem").filter({ hasText: "40 m" })).toContainText(
      "0.24 wavelengths, shorter than a half-wave. Not modelled: no figure",
    );
    await fits(page);

    // On 20 m the same wire is a half-wave, and is run as one.
    await choose(page, "Band", "20 m");
    await expect(
      page.getByText(/0\.47 wavelengths at 14\.18 MHz, about a half-wave: run as VOACAP's horizontal dipole/).first(),
    ).toBeVisible();
    await predict(page);
    await expect(page.getByRole("heading", { name: /14\.2 MHz at \d\d:00 UTC/ })).toBeVisible();
    await expect(page.getByText(/No figure for/)).toHaveCount(0);
    await expect(page.getByText(/End-fed wire 10 m long, horizontal, 6 m above average ground, broadside towards 313°/)).toBeVisible();
    await expect(page.getByText(/Run as VOACAP's horizontal dipole \(type 23\) of that length from 13\.5 to 16\.5 MHz/)).toBeVisible();
    await expect(page.getByText(/Above 16\.5 MHz, where it is longer, approximate/)).toBeVisible();
    // The engine's own page leaves off the bands it has no model for, and says so.
    await page.getByRole("button", { name: "Show the page VOACAP prints" }).click();
    // VOACAP names the model it ran: its own dipole, type 23.
    await expect(page.getByRole("region", { name: "The page VOACAP prints for this path" })).toContainText(
      "XMTR  2-30 IONCAP #23[outpost/tx",
    );
    // And the bands above, where it is longer, each a page of its own run as the sloping long wire.
    await expect(page.getByRole("region", { name: "The page VOACAP prints for this path" })).toContainText(
      "XMTR  2-30 HFMUFES#41[outpost/tx",
    );
    await expect(page.getByRole("region", { name: "The page VOACAP prints for this path" })).toContainText(
      "Outpost: 28.85 MHz, approximate.",
    );
    await expect(page.getByText(/The frequencies an antenna is not modelled on are left off this page/)).toBeVisible();

    // ── 10 m of wire, upright. It has figures on every band; off 20 m they are for a wire that is not a half-wave.
    await choose(page, "Transmitting antenna", "End-fed half-wave, 10 m wire, vertical");
    await choose(page, "Band", "40 m");
    await expect(
      page.getByText(/0\.24 wavelengths at 7\.1 MHz, shorter than a half-wave\. The figure is VOACAP's vertical monopole/),
    ).toBeVisible();
    await predict(page);
    await expect(page.getByRole("heading", { name: /7\.10 MHz at \d\d:00 UTC/ })).toBeVisible();
    await expect(page.getByText(/No figure for/)).toHaveCount(0);
    await expect(ranked.getByText("Not modelled", { exact: true })).toHaveCount(0);
    const lengths = page.getByRole("list", { name: "The wire on each band" });
    await expect(lengths.getByRole("listitem").filter({ hasText: "40 m" })).toContainText(
      "0.24 wavelengths, not a half-wave; run as a wire of this length",
    );
    await expect(lengths.getByRole("listitem").filter({ hasText: "20 m" })).toContainText("0.47 wavelengths, about a half-wave");
    await expect(page.getByText(/End-fed wire 10 m long, vertical with its bottom end at the ground/)).toBeVisible();

    // ── 5 m of wire, level: a half-wave on 10 m.
    await choose(page, "Transmitting antenna", "End-fed half-wave, 5 m wire, horizontal");
    await choose(page, "Band", "10 m");
    await expect(page.getByText(/5 m of wire is 0\.48 wavelengths at 28\.85 MHz, about a half-wave/).first()).toBeVisible();
    await predict(page);
    await expect(page.getByRole("heading", { name: /28\.9 MHz at \d\d:00 UTC/ })).toBeVisible();
    await expect(page.getByText(/End-fed wire 5 m long, horizontal, 6 m above average ground/)).toBeVisible();
    await expect(ranked.getByText("Not modelled", { exact: true })).toHaveCount(8);
    await expect(ranked.getByRole("listitem").filter({ hasText: "10 m" }).first()).not.toContainText("Not modelled");

    // ── 5 m of wire, upright.
    await choose(page, "Transmitting antenna", "End-fed half-wave, 5 m wire, vertical");
    await expect(page.getByText(/about a half-wave: run as VOACAP's vertical monopole \(type 22\) of that height/).first()).toBeVisible();
    await predict(page);
    await expect(page.getByText(/End-fed wire 5 m long, vertical with its bottom end at the ground/)).toBeVisible();
    await expect(ranked.getByText("Not modelled", { exact: true })).toHaveCount(0);
    await expect(lengths.getByRole("listitem").filter({ hasText: "80 m" })).toContainText("0.06 wavelengths");
    await fits(page);

    // The list is reached by a thumb.
    expect((await page.getByRole("combobox", { name: "Transmitting antenna", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    expect(errors).toEqual([]);
  });

  test.describe("at 390 px", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the 10 m level wire is the dipole on 20 m, approximate on 10 m and not modelled on 80 m, and each says so", async ({ page }) => {
      const errors = watchForErrors(page);
      await page.goto("/radio/propagation");
      await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
      await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
      await page.getByLabel("Date (UTC)").fill("2026-11-16");
      await choose(page, "Transmitting antenna", "End-fed half-wave, 10 m wire, horizontal");
      const ranked = page.getByRole("list", { name: /Bands ranked by reliability at/ });
      const lengths = page.getByRole("list", { name: "The wire on each band" });

      // ── 20 m: a half-wave, VOACAP's dipole. Nothing about it is approximate.
      await choose(page, "Band", "20 m");
      await predict(page);
      await expect(page.getByRole("heading", { name: /14\.2 MHz at \d\d:00 UTC/ })).toBeVisible();
      await expect(page.getByText(/^Approximate figures for/)).toHaveCount(0);
      await expect(lengths.getByRole("listitem").filter({ hasText: "20 m" })).toContainText(
        "about a half-wave. Half-wave: VOACAP's dipole",
      );
      // The three states side by side in the band table: figures, approximate figures marked ≈, and none.
      await expect(ranked.getByText("Not modelled", { exact: true })).toHaveCount(4);
      await expect(ranked.locator("[data-approximate]")).toHaveCount(4);
      await expect(page.getByText("Two of VOACAP's models side by side")).toBeVisible();
      await fits(page);

      // ── 10 m: longer than a half-wave. Approximate, from the hint to the first line of the answer.
      await choose(page, "Band", "10 m");
      await expect(
        page.getByText(/^Approximate: 10 m of wire is 0\.96 wavelengths at 28\.85 MHz, longer than a half-wave\./),
      ).toBeVisible();
      await predict(page);
      await expect(page.getByText("Approximate figures for 28.9 MHz", { exact: true })).toBeVisible();
      const reading = page.locator("p[data-approximate]").first();
      await expect(reading).toContainText(/^Approximate figures for 28\.9 MHz\./);
      await expect(page.getByRole("heading", { name: /28\.9 MHz at \d\d:00 UTC/ })).toBeVisible();
      await expect(page.getByText(/% for SSB voice \(approximate\)$/)).toBeVisible();
      await expect(lengths.getByRole("listitem").filter({ hasText: "10 m" }).last()).toContainText(
        "0.96 wavelengths, longer than a half-wave. Approximate: VOACAP's sloping long wire, laid level",
      );
      await expect(page.getByText(/the wire running 43° to 223°/)).toBeVisible();
      await fits(page);

      // ── 80 m: shorter than a half-wave. No figure, and nothing that reads as a poor one.
      await choose(page, "Band", "80 m");
      await expect(
        page.getByText(/^Not modelled: 10 m of wire is 0\.12 wavelengths at 3\.65 MHz, shorter than a half-wave\./),
      ).toBeVisible();
      await predict(page);
      await expect(page.getByText("No figure for 3.65 MHz: an antenna is not modelled there")).toBeVisible();
      await expect(page.getByRole("heading", { name: /3\.65 MHz at \d\d:00 UTC/ })).toHaveCount(0);
      await expect(lengths.getByRole("listitem").filter({ hasText: "80 m" })).toContainText(
        "0.12 wavelengths, shorter than a half-wave. Not modelled: no figure",
      );
      await fits(page);
      expect(errors).toEqual([]);
    });
  });
});

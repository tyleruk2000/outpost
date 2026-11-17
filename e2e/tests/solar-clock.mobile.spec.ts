import { checkDiagrams } from "./diagrams";
import { expect, test, watchForErrors } from "./fixtures";

/**
 * The solar clock on a phone: from Tools, a place typed after picking "Coordinates typed
 * here" from the drop-down, the time recovered from a noon shadow and from a shadow's
 * length, each with a range, and the sundial's template put in the library.
 */
test.describe("the solar clock, on a phone", () => {
  test("recovers the time from a shadow and makes a sundial template", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/tools");
    await page.getByRole("link", { name: /^Solar clock/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Solar clock" })).toBeVisible();
    await expect(page.getByText("Never look at the sun directly")).toBeVisible();

    // A place typed here, picked from the drop-down (the test server has no saved places, so it is the only choice).
    await page.getByRole("combobox", { name: "Place" }).click();
    await page.getByRole("option", { name: "Coordinates typed here" }).click();
    await page.getByLabel("Coordinates").fill("51.4779, -0.0015");
    // Clocks on UTC+0 by hand, so that the answer does not depend on the zone the browser runs in.
    await page.getByRole("combobox", { name: "Clocks here keep" }).click();
    await page.getByRole("option", { name: "UTC+0, set by hand" }).click();
    await expect(page.getByText("Solar noon today")).toBeVisible();

    await page.getByRole("tab", { name: "Clock recovery" }).click();
    await page.getByLabel("The date of the measurement").fill("2026-11-17");
    const noon = page.getByRole("region", { name: "Noon from a shadow" });
    // The US Naval Observatory gives the sun's transit at Greenwich that day as 11:45 UT.
    await expect(noon.getByText(/the clock should have read 11:45, give or take \d+ minutes? \(between/)).toBeVisible();

    const length = page.getByRole("region", { name: "The time from a shadow's length" });
    await length.getByRole("textbox", { name: "Length of the shadow" }).fill("400");
    await expect(
      length.getByText(/When you measured it, the time was \d\d:\d\d, give or take \d+ minutes \(between \d\d:\d\d and \d\d:\d\d\)/),
    ).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);

    await page.getByRole("tab", { name: "Make a sundial" }).click();
    const template = page.getByRole("region", { name: "A template to print" });
    await template.scrollIntoViewIfNeeded();
    await expect(template.getByRole("link", { name: "Save as PDF" })).toBeVisible();
    await template.getByRole("button", { name: "Change where" }).click();
    await expect(template.getByRole("button", { name: "Use this" })).toBeVisible();
    await template.getByRole("button", { name: "Use this" }).click();
    await template.getByRole("button", { name: "Add to library" }).click();
    await expect(template.getByTestId("pdf-status")).toContainText("Added to the library");
    expect(await overflow()).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("draws its diagrams from the figures, with no label over another, at 390 px", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const placeAt = async (coordinates: string) => {
      await page.addInitScript((typed) => {
        localStorage.setItem("outpost.tools.solar-clock.place", "typed");
        localStorage.setItem("outpost.tools.text.solar-clock.typed", typed);
        localStorage.setItem("outpost.tools.solar-clock.zone", "fixed:0");
      }, coordinates);
    };
    await placeAt("51.4779, -0.0015");

    await page.goto("/tools/solar-clock?tab=recover");
    await page.getByLabel("The date of the measurement").fill("2026-11-17");
    const recover = await checkDiagrams(page);
    expect(recover.map((each) => each.name)).toEqual([
      "shadow-plan-equal",
      "answer-noon",
      "stick-side",
      "answer-height",
      "bearing-plan",
      "answer-bearing",
    ]);
    // Drawn from the same sun as the answer: the noon line points north at Greenwich, the answer is 11:45 (USNO's transit).
    expect(recover[0]!.label).toMatch(/points true north/);
    expect(recover[1]!.label).toMatch(/11:4\d to 11:4\d/);
    // The stick's angle is the screen's own: atan(100 cm / 360 cm) = 15.5°.
    expect(recover[2]!.label).toMatch(/The angle there, 15\.5°/);

    await page.getByRole("tab", { name: "Make a sundial" }).click();
    const sundial = await checkDiagrams(page);
    expect(sundial.map((each) => each.name)).toEqual(["dial-plate", "gnomon-side", "shadow-plan-north"]);
    expect(sundial[1]!.label).toMatch(/rises at 51\.5°, your latitude, so it points along the Earth's axis at the celestial pole/);

    await page.getByRole("tab", { name: "Make a nocturnal" }).click();
    await page.getByLabel("The date the night began").fill("2026-11-17");
    const nocturnal = await checkDiagrams(page);
    expect(nocturnal.map((each) => each.name)).toEqual(["north-sky"]);
    expect(nocturnal[0]!.label).toMatch(/The arm stands at 2 o'clock/);
    expect(errors).toEqual([]);
  });

  test("draws the southern hemisphere's geometry south of the equator", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("outpost.tools.solar-clock.place", "typed");
      localStorage.setItem("outpost.tools.text.solar-clock.typed", "-33.8568, 151.2153");
      localStorage.setItem("outpost.tools.solar-clock.zone", "fixed:600");
    });
    await page.goto("/tools/solar-clock?tab=recover");
    await page.getByLabel("The date of the measurement").fill("2026-11-17");
    const recover = await checkDiagrams(page);
    expect(recover[0]!.label).toMatch(/points true south/);
    await page.getByRole("tab", { name: "Make a sundial" }).click();
    const sundial = await checkDiagrams(page);
    expect(sundial[0]!.label).toMatch(/true south at the top/);
    await page.getByRole("tab", { name: "Make a nocturnal" }).click();
    // No sky about Polaris where Polaris is below the horizon.
    await expect(page.getByText("Not for the southern hemisphere")).toBeVisible();
    expect(await page.locator("figure[data-diagram]").count()).toBe(0);
  });
});

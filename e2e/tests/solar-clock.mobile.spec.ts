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
});

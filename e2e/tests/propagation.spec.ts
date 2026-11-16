import { expect, test, watchForErrors } from "./fixtures";

test.describe("HF propagation", () => {
  test("predicts the London to Birmingham path with the engine, and says where the figures come from", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio");
    await expect(page.getByRole("heading", { level: 1, name: "Radio" })).toBeVisible();
    await page
      .getByRole("link", { name: /HF propagation/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/radio\/propagation$/);
    await expect(page.getByRole("heading", { level: 1, name: "HF propagation" })).toBeVisible();

    await page.getByRole("button", { name: "Try London to Birmingham on 40 m" }).click();
    await expect(page.getByRole("heading", { name: "London to Birmingham" })).toBeVisible();
    // The example is for today; the figures checked below are those of one fixed month.
    await page.getByLabel("Date (UTC)").fill("2026-11-16");
    await page.getByRole("button", { name: "Predict", exact: true }).click();
    await expect(page.getByText(/Monthly median for November 2026 at smoothed sunspot number 83/)).toBeVisible();
    // It is a monthly median and says so; it is never called live.
    await expect(page.getByText(/A monthly median, with (a recent|an old) solar forecast/)).toBeVisible();
    await expect(page.getByText("It is not a reading of the ionosphere today.")).toBeVisible();
    await expect(page.getByText(/162 km, bearing 313° out and 131° back\. IO91WM to IO92BL\./)).toBeVisible();
    // The engine and its data are named.
    await expect(page.getByText(/VOACAP Version 16\.\d+W, run by hfcast/)).toBeVisible();
    await expect(page.getByText(/voacap-coefficients hfcast-[0-9a-f]{12}; solar-cycle 20\d\d-\d\d-\d\d/)).toBeVisible();

    // Choosing an hour with the keyboard moves every figure with it: 03:00 is night, and 40 m is shut.
    const grid = page.getByRole("region", { name: /Reliability of SSB voice from 2 to 30 MHz by hour/ });
    await grid.focus();
    await expect(page.getByRole("heading", { name: /7\.10 MHz at \d\d:00 UTC/ })).toBeVisible();
    const lines = page.getByRole("region", { name: /^Reliability of 7\.10 MHz by hour\./ });
    await lines.focus();
    for (let presses = 0; presses < 24; presses++) await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("heading", { name: "7.10 MHz at 01:00 UTC" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: "7.10 MHz at 03:00 UTC" })).toBeVisible();
    await expect(page.getByText(/7\.10 MHz is below it on 0% of the days of the month/)).toBeVisible();

    // The page VOACAP itself prints is there to check against.
    await page.getByRole("button", { name: "Show the page VOACAP prints" }).click();
    await expect(page.getByRole("region", { name: "The page VOACAP prints for this path" })).toContainText(
      "IONOSPHERIC COMMUNICATIONS ANALYSIS AND PREDICTION PROGRAM",
    );

    // Saving keeps the question by name.
    await page.getByRole("button", { name: "Save this prediction" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Saved predictions" })).toBeVisible();
    await expect(page.getByText("London to Birmingham, 7.1 MHz")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("keeps equipment and shows the data it rests on", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation?tab=equipment");
    await page.getByRole("button", { name: "Add an antenna" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add an antenna" });
    await dialog.getByLabel("Name").fill("Garden dipole");
    await dialog.getByLabel("Height of the wire, m").fill("7");
    await dialog.getByRole("button", { name: "Add antenna" }).click();
    await expect(page.getByText("Garden dipole")).toBeVisible();
    await expect(page.getByText(/Horizontal half-wave dipole \(VOACAP type 23\) · 7 m up/)).toBeVisible();

    await page.getByRole("tab", { name: "Engine and data" }).click();
    await expect(page.getByText("Ionospheric and noise coefficients")).toBeVisible();
    await expect(page.getByText(/44 files · checksums match/)).toBeVisible();
    await expect(page.getByText("Solar cycle prediction").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Download a newer table" })).toBeVisible();
    await expect(page.getByText(/SILSO/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("refuses a frequency the engine does not cover, in words", async ({ page }) => {
    await page.goto("/radio/propagation");
    await page.getByLabel("Transmitter", { exact: true }).fill("IO91WM");
    await page.getByLabel("Receiver", { exact: true }).fill("52.4862, -1.8904");
    await page.getByLabel("Frequency, MHz").fill("1.9");
    await page.getByRole("button", { name: "Predict", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Give a frequency between 2 and 30 MHz" })).toBeVisible();
  });
});

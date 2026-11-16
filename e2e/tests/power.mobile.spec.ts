import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Power and batteries on a phone", () => {
  test("a quick calculator answers as figures are typed", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await expect(page.getByRole("heading", { level: 1, name: "Power and batteries" })).toBeVisible();
    await page.getByText("Cable size and voltage drop").click();
    // 3 m each way of 4 mm² at 20 °C carrying 10 A from 12 V: 0.017241 × 6 / 4 × 10 = 0.259 V, 2.16%.
    await expect(page.getByText("0.259 V, 2.16%")).toBeVisible();
    await page.getByLabel("Current", { exact: true }).fill("40");
    await expect(page.getByText("1.034 V, 8.62%")).toBeVisible();
    await expect(page.getByText(/not BS 7671/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("a plan is made, given a radio picked from a list inside the dialog, kept, and written out", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await page.getByRole("button", { name: "New power plan" }).click();
    await page.getByLabel("Name").fill("Shack in a power cut");
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Shack in a power cut" })).toBeVisible();

    await page.getByRole("button", { name: "Add a load" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a load" });
    // Drop-downs inside the dialog: the kind of load, then the mode.
    await dialog.getByLabel("Start from").click();
    await page.getByRole("option", { name: "Radio transceiver" }).click();
    await dialog.getByLabel("Draw transmitting at full output").fill("25");
    await dialog.getByLabel("Draw receiving").fill("5");
    await dialog.getByLabel("Mode", { exact: true }).click();
    await page.getByRole("option", { name: "FT8" }).click();
    await expect(dialog.getByText(/Duty cycle 42.1%/)).toBeVisible();
    await dialog.getByRole("button", { name: "Add load" }).click();
    await expect(dialog).toBeHidden();
    // 0.4213 × 25 + 0.5787 × 5 = 13.43 W for 2 hours.
    await expect(page.getByText(/27 Wh a day/)).toBeVisible();
    await expect(page.getByText("Saved.")).toBeVisible();

    // Kept on the server: there after a reload.
    await page.reload();
    await expect(page.getByText(/25 W transmitting, 5 W receiving/)).toBeVisible();
    await expect(page.getByRole("region", { name: /State of charge, hour by hour over three days/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect((await page.getByRole("link", { name: "Save as PDF" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole("button", { name: "Add to library" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Copied, and the copy listed beside it.
    await page.getByRole("button", { name: "Copy plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Shack in a power cut (copy)" })).toBeVisible();
    await page.goto("/tools/power");
    await expect(page.getByRole("table")).toContainText("Shack in a power cut (copy)");

    const { plans } = await api(page, "GET", "/api/power/plans");
    for (const plan of plans) await api(page, "DELETE", `/api/power/plans/${plan.id}`);
    expect(errors).toEqual([]);
  });
});

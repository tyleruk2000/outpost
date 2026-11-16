import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Power and batteries on a phone", () => {
  test("a quick calculator answers as figures are typed", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await expect(page.getByRole("heading", { level: 1, name: "Power and batteries" })).toBeVisible();
    await page.getByText("Cable size and voltage drop").click();
    const cable = page.locator("#calc-cable");
    // 3 m each way of 4 mm² at 20 °C carrying 10 A from 12 V: 0.017241 × 6 / 4 × 10 = 0.259 V, 2.16%.
    await expect(cable.getByText("0.259 V, 2.16%")).toBeVisible();
    await cable.getByLabel("Current", { exact: true }).fill("40");
    await expect(cable.getByText("1.034 V, 8.62%")).toBeVisible();
    await expect(cable.getByText(/not BS 7671/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("sun hours are fetched for a place chosen in the plan, and go in on a press of their own", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await page.getByRole("button", { name: "New power plan" }).click();
    const naming = page.getByRole("dialog", { name: "New power plan" });
    await naming.getByLabel("Name").fill("Sun for a chosen place");
    await naming.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sun for a chosen place" })).toBeVisible();
    const planId = page.url().split("/").pop()!;

    // Somewhere else: a position typed here, whatever places other tests have left.
    await page.getByRole("combobox", { name: "Where the panels are" }).click();
    await page.getByRole("option", { name: /Somewhere else/ }).click();
    await page.getByLabel("Where the panels are: coordinates, a grid reference or a locator").fill("52.13, -0.46");
    await expect(page.getByText(/sending only the place's latitude and longitude rounded to two decimal places/)).toBeVisible();
    const fetchIt = page.getByRole("button", { name: "Fetch sun hours for 52.13, -0.46" });
    expect((await fetchIt.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByLabel("January")).toHaveValue("");
    await fetchIt.click();

    // Fetched and kept, and still not in the plan until asked.
    const fill = page.getByRole("button", { name: "Fill in from Weather and hazards" });
    await expect(fill).toBeVisible();
    await expect(page.getByLabel("January")).toHaveValue("");
    await fill.click();
    await expect(page.getByLabel("January")).not.toHaveValue("");
    await expect(page.getByText(/^Peak sun hours from PVGIS/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // The place joined the weather list; both are removed again.
    const weather = (await (await page.request.get("/api/weather")).json()) as { places: Array<{ id: string; name: string }> };
    const place = weather.places.find((each) => each.name === "Solar panels, 52.13, -0.46");
    expect(place).toBeTruthy();
    await page.request.delete(`/api/weather/places/${place!.id}`, { headers: { "X-Outpost-Request": "1" } });
    await page.request.delete(`/api/power/plans/${planId}`, { headers: { "X-Outpost-Request": "1" } });
    expect(errors).toEqual([]);
  });

  test("a plan is made, given a radio picked from a list inside the dialog, kept, and written out", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/power");
    await page.getByRole("button", { name: "New power plan" }).click();
    const naming = page.getByRole("dialog", { name: "New power plan" });
    await naming.getByLabel("Name").fill("Shack in a power cut");
    await naming.getByRole("button", { name: "Create plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Shack in a power cut" })).toBeVisible();

    await page.getByRole("button", { name: "Add a load" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a load" });
    // Typed by hand, from the picker; then a drop-down inside the dialog: the mode.
    await dialog.getByRole("button", { name: /A radio: type its draw/ }).click();
    await dialog.getByLabel("Name").fill("Radio");
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
    await expect(page.getByRole("listitem").filter({ hasText: /25 W transmitting, 5 W receiving/ })).toBeVisible();
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

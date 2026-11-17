import { api, expect, test, watchForErrors } from "./fixtures";

/** The calculators under Tools, on a phone: the main path of each screen. */
test.describe("the calculators, on a phone", () => {
  test("water: an answer as one types, a figure that is wrong said to be, a planning figure picked from a list, and the result kept as a page", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools");
    await page.getByRole("link", { name: /^Water/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Water" })).toBeVisible();

    const storage = page.getByRole("region", { name: "Water to store" });
    const people = storage.getByRole("textbox", { name: "People", exact: true });
    await people.fill("4");
    await expect(storage.getByText("36 litres").first()).toBeVisible();
    await people.fill("four");
    await expect(storage.getByRole("alert")).toHaveText("Type a figure in numbers, such as 12.5.");
    await people.fill("4");

    // A drop-down: the WHO's basic needs, a range.
    await storage.getByRole("combobox", { name: "Whose planning figure" }).click();
    await page.getByRole("option", { name: /WHO, basic needs/ }).click();
    await expect(storage.getByText("90 to 180 litres").first()).toBeVisible();

    // How it is worked out, one press away.
    await storage.getByText("How this is worked out").click();
    await expect(storage.getByText(/people × days × litres a person a day/)).toBeVisible();

    await storage.getByRole("button", { name: "Save as a page" }).click();
    await expect(page.getByText("Saved as a new page in Notes")).toBeVisible();
    const notes = await api(page, "GET", "/api/notes/tree");
    expect(JSON.stringify(notes)).toContain("Water to store for 4 people, 3 days");

    // The purification guidance and its sheet.
    const purification = page.getByRole("region", { name: "Making water safe to drink" });
    await purification.getByRole("textbox", { name: "Your height above sea level", exact: true }).fill("2500");
    await expect(purification.getByText("3 minutes", { exact: true })).toBeVisible();
    await expect(purification.getByRole("link", { name: "Save as PDF" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("outdoors: Naismith's time, and a unit kept on the device", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/outdoors");
    const walking = page.getByRole("region", { name: "Walking time" });
    await walking.getByRole("textbox", { name: "Distance", exact: true }).fill("10");
    await walking.getByRole("textbox", { name: "Total climb", exact: true }).fill("900");
    await expect(walking.getByText("3 hours 30 minutes")).toBeVisible();
    await walking.getByRole("radio", { name: "miles" }).click();
    await page.reload();
    await expect(page.getByRole("region", { name: "Walking time" }).getByRole("radio", { name: "miles" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(errors).toEqual([]);
  });

  test("radio: a dipole for a band picked from the list", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/radio");
    const antenna = page.getByRole("region", { name: "Antenna lengths" });
    await antenna.getByRole("combobox", { name: "Fill in a band" }).click();
    await page.getByRole("option", { name: /^20 m/ }).click();
    await expect(antenna.getByRole("textbox", { name: "Frequency", exact: true })).toHaveValue("14.18");
    // The answer, and the same figure on the drawing of the antenna beside it.
    await expect(antenna.getByText("5.02 m", { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("building and cooking open with answers", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/tools/building");
    await expect(page.getByRole("region", { name: "Cutting list" }).getByText(/^Board 1,/)).toBeVisible();
    await page.goto("/tools/cooking");
    const roasting = page.getByRole("region", { name: "Roasting a bird" });
    await expect(roasting.getByText("1 hour 50 minutes")).toBeVisible();
    await roasting.getByRole("button", { name: "Start a timer for this" }).click();
    await expect(page.getByRole("region", { name: "Timer" }).getByRole("button", { name: "Pause" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

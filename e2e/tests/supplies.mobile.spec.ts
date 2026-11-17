/**
 * Supplies on a phone: adding stock (with a category picked from a drop-down inside the
 * form), using one with one press, the days for a household, the shopping list ticked
 * off into stock, the CSV file out and back in, and finding an item by its barcode.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

async function clear(page: import("@playwright/test").Page) {
  const { items } = await api(page, "GET", "/api/supplies");
  for (const item of items as Array<{ id: string }>) await api(page, "DELETE", `/api/supplies/items/${item.id}`);
  const { lines } = await api(page, "GET", "/api/supplies/shopping");
  for (const line of lines as Array<{ id: string }>) await api(page, "DELETE", `/api/supplies/shopping/${line.id}`);
  await api(page, "PUT", "/api/supplies/household", {
    daysWanted: 3,
    drinkingLitres: 3,
    allUsesLitres: 7.5,
    waterBasis: "drinking",
    members: [],
  });
}

test.describe("Supplies on a phone", () => {
  test("adds stock, uses one, works out the days and the shopping list, and ticks a line off into stock", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await clear(page);
    // Reached from the More sheet, under Preparedness.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    // The screens under Preparedness are folded away until asked for.
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Preparedness" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/prepare/supplies"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Supplies" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nothing stored yet" })).toBeVisible();

    // Ten tins of beans, then water: the category picked from the drop-down inside the form.
    await page.getByRole("button", { name: "Add", exact: true }).tap();
    let dialog = page.getByRole("dialog", { name: "Add to supplies" });
    await dialog.getByLabel("Name").fill("Baked beans");
    await dialog.getByLabel("How many", { exact: true }).fill("10");
    await dialog.getByLabel("Kept in").fill("Pantry");
    await dialog.getByRole("radio", { name: "Per 100 g" }).tap();
    await dialog.getByLabel("kcal per 100 g").fill("84");
    await dialog.getByLabel("Grams in one").fill("400");
    await expect(dialog.getByText("336 kcal in one, 3,360 kcal in all.")).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    await dialog.getByRole("button", { name: "Add", exact: true }).tap();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Add", exact: true }).tap();
    dialog = page.getByRole("dialog", { name: "Add to supplies" });
    await dialog.getByLabel("Name").fill("Bottled water");
    await dialog.getByRole("combobox", { name: "Category" }).tap();
    const water = page.getByRole("option", { name: "Water", exact: true });
    await expect(water).toBeVisible();
    const onTop = await water.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    });
    expect(onTop, "the list of categories is drawn over the form").toBe(true);
    await water.tap();
    await expect(dialog.getByRole("combobox", { name: "Category" })).toHaveText("Water");
    await expect(dialog.getByLabel("Of what")).toHaveValue("bottle");
    await dialog.getByLabel("How many", { exact: true }).fill("3");
    await dialog.getByLabel("Litres in one").fill("2");
    await dialog.getByRole("button", { name: "Add", exact: true }).tap();
    await expect(dialog).toBeHidden();

    // Use one tin: one press.
    const beans = page.getByRole("listitem").filter({ hasText: "Baked beans" });
    await expect(beans).toContainText("10 tins · Pantry · 336 kcal each");
    const minus = page.getByRole("button", { name: "Use one tin of Baked beans" });
    expect((await minus.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await minus.tap();
    await expect(beans).toContainText("9 tins");

    // One adult for seven days: 2,500 kcal and 3 litres a day.
    await page.getByRole("tab", { name: "Household" }).tap();
    await page.getByRole("button", { name: "Add a person" }).tap();
    await page.getByRole("radio", { name: "Male", exact: true }).tap();
    await page.getByLabel("Days wanted", { exact: true }).fill("7");
    await page.getByRole("button", { name: "Save household" }).tap();
    await expect(page.getByText("Household saved.", { exact: false })).toBeVisible();

    await page.getByRole("tab", { name: "How long it lasts" }).tap();
    // 9 tins at 336 kcal: 3,024 kcal, 1.2 days. 6 litres at 3 a day: 2 days.
    await expect(page.getByText("Food runs out first, in about 1.2 days.", { exact: false })).toBeVisible();
    await expect(page.getByText(/That is 3,024 kcal in 1 item against 2,500 kcal a day/)).toBeVisible();

    // The shopping list: 14,476 kcal short is 44 tins; 15 litres short is 8 bottles.
    await page.getByRole("tab", { name: "Shopping list" }).tap();
    await page.getByRole("button", { name: "Work out the list" }).tap();
    await expect(page.getByText("44 tins of Baked beans")).toBeVisible();
    await expect(page.getByText("8 bottles of Bottled water")).toBeVisible();
    await expect(page.getByRole("link", { name: /Save as PDF/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add to library/ })).toBeVisible();

    await page.getByRole("button", { name: "Bought Bottled water" }).tap();
    dialog = page.getByRole("dialog", { name: "Bought: Bottled water" });
    await dialog.getByLabel("Best before", { exact: true }).fill("2028-05-01");
    await dialog.getByRole("button", { name: "Add to stock" }).tap();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("8 bottles of Bottled water")).toBeHidden();
    await page.getByRole("tab", { name: "Stock" }).tap();
    await expect(page.getByRole("listitem").filter({ hasText: /8 bottles · .*Best before 1 May 2028/ })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await clear(page);
    expect(errors).toEqual([]);
  });

  test("saves a CSV file and brings it back in with the duplicates found, and finds an item by a typed barcode", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await clear(page);
    await api(page, "POST", "/api/supplies/items", {
      name: "Chopped tomatoes",
      category: "food",
      quantity: 4,
      unit: "tin",
      barcode: "5012345678900",
    });
    await page.goto("/prepare/supplies");

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Save as CSV" }).tap()]);
    const csv = await (await download.createReadStream()).toArray();
    const text = Buffer.concat(csv).toString("utf8");
    expect(text).toContain("Chopped tomatoes,food,4,tin");

    await page.getByRole("button", { name: "Bring in a CSV file" }).tap();
    const dialog = page.getByRole("dialog", { name: "Bring in a CSV file" });
    await dialog
      .locator("#supplies-csv")
      .setInputFiles({ name: "supplies.csv", mimeType: "text/csv", buffer: Buffer.from(`${text}Rice,food,2,bag,Pantry,,,,,,,,,,\n`) });
    await expect(dialog.getByText("2 rows in the file: 1 new, 1 already in your supplies, 0 that cannot be read.")).toBeVisible();
    await dialog.getByRole("button", { name: "Bring in 1 row" }).tap();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "Rice" })).toBeVisible();

    await page.getByRole("button", { name: "Scan" }).tap();
    const scanner = page.getByRole("dialog", { name: "Scan a barcode" });
    await scanner.getByLabel("Barcode number", { exact: true }).fill("5012345678900");
    await scanner.getByLabel("Barcode number", { exact: true }).press("Enter");
    await expect(scanner.getByRole("heading", { name: "In your supplies" })).toBeVisible();
    await scanner.getByRole("button", { name: "Use one tin of Chopped tomatoes" }).tap();
    await expect(scanner.getByRole("listitem").filter({ hasText: "3 tins" })).toBeVisible();

    await clear(page);
    expect(errors).toEqual([]);
  });
});

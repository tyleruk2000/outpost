/**
 * Energy per food on a phone: rice added by its name, its energy chosen from USDA
 * FoodData Central's table that ships with Outpost, and the days of energy changing
 * under "How long it lasts". The table is Outpost's own; nothing is fetched from USDA.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

async function clear(page: import("@playwright/test").Page) {
  const { items } = await api(page, "GET", "/api/supplies");
  for (const item of items as Array<{ id: string }>) await api(page, "DELETE", `/api/supplies/items/${item.id}`);
  await api(page, "PUT", "/api/supplies/household", {
    daysWanted: 3,
    drinkingLitres: 3,
    allUsesLitres: 7.5,
    waterBasis: "drinking",
    members: [],
  });
}

test("adds rice by name, takes its energy from the USDA table, and sees the days of energy change", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");
  await clear(page);
  // One man (2,500 kcal a day, Public Health England) and ten tins of beans (3,360 kcal) to start with, and oats with no figure.
  await api(page, "PUT", "/api/supplies/household", {
    daysWanted: 7,
    drinkingLitres: 3,
    allUsesLitres: 7.5,
    waterBasis: "drinking",
    members: [{ kind: "person", name: "", band: "19-64", sex: "male" }],
  });
  await api(page, "POST", "/api/supplies/items", {
    name: "Baked beans",
    category: "food",
    quantity: 10,
    unit: "tin",
    kcalPer100g: 84,
    gramsPerUnit: 400,
  });
  await api(page, "POST", "/api/supplies/items", { name: "Oats", category: "food", quantity: 1, unit: "bag" });

  await page.goto("/prepare/supplies?view=days");
  await expect(page.getByText("The food holds about 1.3 days of energy for 1 person, of the 7 days wanted.")).toBeVisible();
  await expect(page.getByText(/1 food item has no energy figure and is not counted: Oats\./)).toBeVisible();
  await expect(page.getByText(/This is energy only/)).toBeVisible();

  // Five kilograms of rice, found by its name.
  await page.getByRole("button", { name: "Add", exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: "Add to supplies" });
  await dialog.getByLabel("Name").fill("rice");
  await dialog.getByLabel("How many", { exact: true }).fill("5");
  await dialog.getByLabel("Of what").fill("kg");
  const offers = dialog.getByRole("region", { name: "Energy from USDA FoodData Central" });
  const raw = offers.getByRole("button", { name: /^Rice, white, long-grain, regular, raw/ }).first();
  await expect(raw).toBeVisible();
  // Raw and cooked rice are offered apart, each named so.
  await expect(offers.getByRole("button", { name: /^Rice, white, long-grain, regular, raw/ }).first()).toContainText("365 kcal");
  expect((await raw.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await raw.tap();
  await expect(dialog.getByLabel("kcal per 100 g")).toHaveValue("365");
  await expect(dialog.getByLabel("Grams in one")).toHaveValue("1000");
  await expect(dialog.getByText("3,650 kcal in one, 18,250 kcal in all.")).toBeVisible();
  await expect(dialog.getByText(/From USDA FoodData Central \(SR Legacy, April 2018\)/)).toContainText("Check the label; products differ.");
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "Add", exact: true }).tap();
  await expect(dialog).toBeHidden();

  // 3,360 + 18,250 = 21,610 kcal against 2,500 a day: 8.6 days.
  await expect(page.getByText("The food holds about 8.6 days of energy for 1 person.")).toBeVisible();
  await expect(page.getByText(/That is 21,610 kcal in 2 items against 2,500 kcal a day/)).toBeVisible();

  // The rice's page says where its figure came from.
  await page.getByRole("tab", { name: "Stock" }).tap();
  await page.getByRole("link", { name: "Rice" }).tap();
  await expect(page.getByText(/Energy from USDA FoodData Central, SR Legacy \(April 2018\), food \d+/)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await clear(page);
  expect(errors).toEqual([]);
});

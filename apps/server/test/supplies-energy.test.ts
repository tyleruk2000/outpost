/**
 * Energy per food on a real server: finding a food in the table that ships, and the days
 * of energy said by `GET /api/supplies/outlook` with some food counted and some not.
 */
import { energyNoteLine, type SupplyItem, type SupplyOutlookResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app?.close();
});

const ok = async (method: string, url: string, body?: unknown) => {
  const response = await app.api(method, url, body);
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
};
const add = async (fields: Record<string, unknown>): Promise<SupplyItem> =>
  (await ok("POST", "/api/supplies/items", { category: "food", quantity: 1, ...fields })).item;

describe("energy per food", () => {
  it("finds a food in USDA FoodData Central's table, with its energy per 100 g", async () => {
    const body = await ok("GET", "/api/supplies/foods?q=rice&limit=3");
    expect(body.source).toBe("USDA FoodData Central, SR Legacy (April 2018)");
    expect(body.matches).toHaveLength(3);
    expect(body.matches[0]).toMatchObject({
      description: expect.stringMatching(/^Rice, white, long-grain, regular, raw/),
      kcalPer100g: 365,
    });
    expect((await ok("GET", "/api/supplies/foods?q=aubergine")).matches[0]).toMatchObject({ fdcId: 169228, description: "Eggplant, raw" });
    expect((await ok("GET", "/api/supplies/foods?q=")).matches).toEqual([]);
    expect((await app.api("GET", `/api/supplies/foods?q=${"a".repeat(101)}`)).status).toBe(400);
    expect((await app.api("GET", "/api/supplies/foods?q=rice&limit=500")).status).toBe(400);
  });

  it("keeps the note of where a figure came from with the item", async () => {
    const line = energyNoteLine({
      dataset: "SR Legacy",
      release: "April 2018",
      fdcId: 169756,
      description: "Rice, white, long-grain, regular, raw, unenriched",
      kcalPer100g: 365,
    });
    const rice = await add({ name: "Rice", quantity: 5, unit: "kg", kcalPer100g: 365, gramsPerUnit: 1000, notes: line });
    expect((await ok("GET", `/api/supplies/items/${rice.id}`)).item.notes).toBe(line);
    await ok("DELETE", `/api/supplies/items/${rice.id}`);
  });

  it("says how many days of energy are held, on whose figures, and what is not counted", async () => {
    await ok("PUT", "/api/supplies/household", {
      daysWanted: 7,
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [
        { kind: "person", name: "Sam", band: "19-64", sex: "male" },
        { kind: "person", name: "Ann", band: "75+", sex: "female", kcalPerDay: 1800 },
      ],
    });
    // 5 kg of rice at 365 kcal per 100 g: 18,250 kcal. Lentils given per pack: 2 × 500. Beans with no figure.
    await add({ name: "Rice", quantity: 5, unit: "kg", kcalPer100g: 365, gramsPerUnit: 1000 });
    await add({ name: "Lentils", quantity: 2, unit: "pack", kcalPerUnit: 500 });
    const beans = await add({ name: "Baked beans", quantity: 4, unit: "tin" });
    await add({ name: "Oats", quantity: 3, unit: "bag" });
    await add({ name: "Pasta", quantity: 0, unit: "pack" });
    await add({ name: "Batteries", category: "batteries", quantity: 8 });

    const { energy, outlook } = (await ok("GET", "/api/supplies/outlook?today=2026-11-17")) as SupplyOutlookResponse;
    // 19,250 kcal against 2,500 (Sam, from the table) + 1,800 (Ann's own) = 4,300 a day: 4.476 days, said as 4.4.
    expect(outlook.food.counted).toBe(19250);
    expect(energy).toMatchObject({ perDay: 4300, people: 2, fromTable: 1, stated: 1, counted: 2 });
    expect(energy.days).toBeCloseTo(19250 / 4300, 6);
    expect(energy.uncounted.map((row) => row.name)).toEqual(["Baked beans", "Oats"]);
    expect(energy.uncounted[0]!.id).toBe(beans.id);
    expect(energy.sentences).toEqual({
      days: "The food holds about 4.4 days of energy for 2 people, of the 7 days wanted.",
      basis:
        "That is 19,250 kcal in 2 items against 4,300 kcal a day: 1 person's figure for their age and sex from Public Health England, Government Dietary Recommendations (August 2016), and 1 figure you gave under Household.",
      uncounted: "2 food items have no energy figure and are not counted: Baked beans, Oats.",
      caveat:
        "This is energy only: it says nothing about protein, vitamins or a diet to live on for long, and the figures are averages, not your packets.",
    });

    // Giving the beans a figure counts them: 4 tins of 415 g at 94 kcal per 100 g (SR Legacy 175182) is 1,560.4 kcal.
    await ok("PATCH", `/api/supplies/items/${beans.id}`, { kcalPer100g: 94, gramsPerUnit: 415 });
    const after = ((await ok("GET", "/api/supplies/outlook?today=2026-11-17")) as SupplyOutlookResponse).energy;
    expect(after.sentences.uncounted).toBe("1 food item has no energy figure and is not counted: Oats.");
    expect(after.sentences.days).toBe("The food holds about 4.8 days of energy for 2 people, of the 7 days wanted.");
  });

  it("says plainly when there is nobody to work it out for", async () => {
    await ok("PUT", "/api/supplies/household", {
      daysWanted: 3,
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [],
    });
    const { energy } = (await ok("GET", "/api/supplies/outlook")) as SupplyOutlookResponse;
    expect(energy.sentences.days).toBe("There is nobody in the household to work the days of energy out for.");
  });
});

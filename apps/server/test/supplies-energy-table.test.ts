/**
 * Energy per food (packages/shared/src/supplies-energy.ts and the table that ships,
 * apps/server/src/modules/supplies/foods/fdc-sr-legacy.json).
 *
 * The table is checked against thirteen foods looked up by hand on 17 November 2026 in
 * USDA's own download (FoodData_Central_sr_legacy_food_csv_2018-04.zip: food.csv for the
 * id and description, food_nutrient.csv for nutrients 1008 energy kcal, 1003 protein, 1004
 * fat and 1005 carbohydrate by difference, per 100 g).
 */
import {
  energyNoteLine,
  type FoodTable,
  GRAMS_PER_OUNCE,
  GRAMS_PER_POUND,
  gramsInUnit,
  indexFoods,
  kcalOfUnit,
  queryForms,
  readEnergyNote,
  searchFoods,
  singular,
  withEnergyNote,
  withoutEnergyNote,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";
import raw from "../src/modules/supplies/foods/fdc-sr-legacy.json" with { type: "json" };

const table = raw as unknown as FoodTable & { downloadSha256: string; foods: FoodTable["foods"] };
const index = indexFoods(table);

describe("the table made from SR Legacy", () => {
  it("records the dataset, its release, the download it was made from, and the licence", () => {
    expect(table).toMatchObject({
      source: "USDA FoodData Central",
      dataset: "SR Legacy",
      release: "2018-04",
      download: "FoodData_Central_sr_legacy_food_csv_2018-04.zip",
      downloadSha256: "b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0",
      licence: "Public domain, CC0 1.0 Universal",
    });
    // all_downloaded_table_record_counts.csv in the download: "food","7793".
    expect(table.foods).toHaveLength(7793);
  });

  // [fdc_id, description, kcal, protein, fat, carbohydrate], each read by hand from the CSV files.
  const byHand: Array<[number, string, number, number, number, number]> = [
    [169756, "Rice, white, long-grain, regular, raw, unenriched", 365, 7.13, 0.66, 79.95],
    [168878, "Rice, white, long-grain, regular, enriched, cooked", 130, 2.69, 0.28, 28.17],
    [175182, "Beans, baked, canned, plain or vegetarian", 94, 4.75, 0.37, 21.14],
    [168936, "Wheat flour, white, all-purpose, enriched, unbleached", 364, 10.33, 0.98, 76.31],
    [173904, "Cereals, oats, regular and quick, not fortified, dry", 379, 13.15, 6.52, 67.7],
    [169655, "Sugars, granulated", 387, 0, 0, 99.98],
    [172420, "Lentils, raw", 352, 24.63, 1.06, 63.35],
    [168927, "Pasta, dry, unenriched", 371, 13.04, 1.51, 74.67],
    [172470, "Peanut butter, smooth style, without salt", 598, 22.21, 51.36, 22.31],
    [
      173709,
      "Fish, tuna, light, canned in water, drained solids (Includes foods for USDA's Food Distribution Program)",
      86,
      19.44,
      0.96,
      0,
    ],
    [169640, "Honey", 304, 0.3, 0, 82.4],
    [170877, "Milk, dry, nonfat, regular, without added vitamin A and vitamin D", 362, 36.16, 0.77, 51.98],
    [169228, "Eggplant, raw", 25, 0.98, 0.18, 5.88],
    [173410, "Butter, salted", 717, 0.85, 81.11, 0.06],
  ];
  it.each(byHand)("food %i, %s, as published", (id, description, kcal, protein, fat, carbohydrate) => {
    const row = table.foods.find((food) => food[0] === id);
    expect(row).toBeDefined();
    expect(row!.slice(1, 2).concat(row!.slice(3))).toEqual([description, kcal, protein, fat, carbohydrate]);
  });

  it("keeps a dry weight and a cooked one apart, each named so", () => {
    const rice = searchFoods(index, "rice white long grain", 20).map((match) => match.description);
    expect(rice).toContain("Rice, white, long-grain, regular, raw, unenriched");
    expect(rice).toContain("Rice, white, long-grain, regular, enriched, cooked");
  });
});

describe("weights from a unit", () => {
  it.each([
    ["g", 1],
    ["grams", 1],
    ["kg", 1000],
    ["Kilos", 1000],
    ["500 g", 500],
    ["1.5kg", 1500],
    ["2,5 kg", 2500],
    ["lb", GRAMS_PER_POUND],
    ["2 lbs", 907.185],
    ["oz", 28.35],
    ["16 oz", 453.592],
  ])("%s is %f g", (unit, grams) => {
    expect(gramsInUnit(unit)).toBeCloseTo(grams, 2);
  });
  it.each(["tin", "pack", "bag", "jar", "litre", "l", "ml", "500 ml", "", "12 tins", "0 g", "kg of rice"])("%s is not a weight", (unit) => {
    expect(gramsInUnit(unit)).toBeNull();
  });
  it("uses the international pound and ounce", () => {
    // The international yard and pound agreement of 1959: 1 lb = 0.45359237 kg exactly, 1 oz = 1/16 lb.
    expect(GRAMS_PER_POUND).toBe(453.59237);
    expect(GRAMS_PER_OUNCE * 16).toBeCloseTo(GRAMS_PER_POUND, 9);
  });
  it("gives the energy of 5 kg of rice held as five 1 kg units", () => {
    // 365 kcal per 100 g (SR Legacy 169756) × 1,000 g = 3,650 kcal in each kilogram; five of them 18,250.
    const each = kcalOfUnit({ kcalPerUnit: null, kcalPer100g: 365, gramsPerUnit: gramsInUnit("kg") });
    expect(each).toBe(3650);
    expect(each! * 5).toBe(18250);
    // A pound of it: 365 × 4.5359237 = 1,655.6 kcal.
    expect(kcalOfUnit({ kcalPerUnit: null, kcalPer100g: 365, gramsPerUnit: gramsInUnit("lb") })).toBeCloseTo(1655.61, 1);
  });
});

describe("finding a food by the words typed", () => {
  const top = (query: string) => searchFoods(index, query, 5)[0]?.description;
  // Twenty everyday British shopping words, with what should come first.
  it.each([
    ["rice", /^Rice, white, long-grain, regular, raw/],
    ["pasta", /^Pasta, dry/],
    ["porridge oats", /^Cereals, oats, regular and quick, not fortified, dry$/],
    ["plain flour", /^Wheat flour, white, all-purpose/],
    ["self raising flour", /^Wheat flour, white, all-purpose, self-rising/],
    ["baked beans", /^Beans, baked, canned, plain or vegetarian$/],
    ["tinned tomatoes", /^Tomatoes, red, ripe, canned/],
    ["aubergine", /^Eggplant, raw$/],
    ["courgette", /zucchini.*raw$/],
    ["mince", /^Beef, ground, .*raw$/],
    ["sugar", /^Sugars, granulated$/],
    ["peanut butter", /^Peanut butter/i],
    ["tinned tuna", /^Fish, tuna, .*canned/],
    ["sardines", /^Fish, sardine, .*canned/],
    ["lentils", /^Lentils, raw$/],
    ["chickpeas", /^Chickpeas .*raw$/],
    ["crisps", /^Snacks, potato chips, plain/],
    ["powdered milk", /^Milk, dry, nonfat/],
    ["honey", /^Honey$/],
    ["coriander", /^Coriander \(cilantro\) leaves, raw$/],
  ])("%s first offers %s", (query, expected) => {
    expect(top(query)).toMatch(expected);
  });

  it("offers plain white rice before a dish of rice", () => {
    const offered = searchFoods(index, "rice", 8).map((match) => match.description);
    expect(offered.slice(0, 2).every((name) => name.startsWith("Rice, white"))).toBe(true);
    expect(offered.findIndex((name) => /pudding|pilaf|spanish|fried/i.test(name))).toBe(-1);
  });

  it("finds a word part typed, a plural, and the British and American names alike", () => {
    expect(top("lent")).toBe("Lentils, raw");
    expect(top("eggplant")).toBe(top("aubergine"));
    expect(singular("tomatoes")).toBe("tomato");
    expect(singular("berries")).toBe("berry");
    expect(singular("glass")).toBe("glass");
    expect(queryForms("tinned tomatoes")).toHaveLength(2);
    expect(searchFoods(index, "x", 5)).toEqual([]);
    expect(searchFoods(index, "zzzz qqqq", 5)).toEqual([]);
  });

  it("is quick enough to run as a person types", () => {
    const start = performance.now();
    for (const word of ["rice", "baked beans", "porridge oats", "tinned tomatoes", "mince"]) searchFoods(index, word);
    expect((performance.now() - start) / 5).toBeLessThan(50);
  });
});

describe("the note of where a figure came from", () => {
  const note = {
    dataset: "SR Legacy",
    release: "April 2018",
    fdcId: 169756,
    description: "Rice, white, long-grain, regular, raw, unenriched",
    kcalPer100g: 365,
  };
  it("is written and read back", () => {
    const line = energyNoteLine(note);
    expect(line).toBe(
      "Energy from USDA FoodData Central, SR Legacy (April 2018), food 169756, “Rice, white, long-grain, regular, raw, unenriched”: 365 kcal per 100 g. Check the label; products differ.",
    );
    expect(readEnergyNote(`Bought at the market\n${line}`)).toEqual(note);
    expect(readEnergyNote("Bought at the market")).toBeNull();
  });
  it("leaves the person's own notes as they were", () => {
    const line = energyNoteLine(note);
    expect(withEnergyNote("Top shelf", note)).toBe(`Top shelf\n${line}`);
    expect(withEnergyNote("", note)).toBe(line);
    expect(withoutEnergyNote(`Top shelf\n${line}`)).toBe("Top shelf");
    expect(withEnergyNote(`Top shelf\n${line}`, null)).toBe("Top shelf");
    expect(withEnergyNote(`Top shelf\n${line}`, { ...note, fdcId: 168878, description: "Rice, cooked", kcalPer100g: 130 })).toBe(
      `Top shelf\n${energyNoteLine({ ...note, fdcId: 168878, description: "Rice, cooked", kcalPer100g: 130 })}`,
    );
  });
});

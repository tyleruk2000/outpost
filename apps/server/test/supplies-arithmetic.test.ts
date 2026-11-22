/**
 * The supplies arithmetic (packages/shared/src/supplies.ts) against households worked by
 * hand. The planning figures are checked against their sources: Public Health England,
 * "Government Dietary Recommendations" (August 2016), table 1 (page 6) and table 2
 * (page 7); WHO technical note 9 (July 2013), table 9.1; the UK government's "Be ready"
 * page (3 litres a day for drinking).
 */
import {
  barcodeKey,
  DEFAULT_HOUSEHOLD,
  daysWords,
  ENERGY_BANDS,
  type Household,
  type HouseholdMember,
  kcalOfUnit,
  lastDays,
  type SupplyItem,
  shoppingSuggestions,
  supplyOutlook,
  tableKcal,
  validGtin,
  WATER_FIGURES,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

const TODAY = "2026-11-16";
let next = 0;
function item(fields: Partial<SupplyItem> & Pick<SupplyItem, "name">): SupplyItem {
  next += 1;
  return {
    id: `i${next}`,
    category: "food",
    quantity: 1,
    unit: "tin",
    location: "Pantry",
    dateKind: null,
    date: null,
    kcalPerUnit: null,
    kcalPer100g: null,
    gramsPerUnit: null,
    litresPerUnit: null,
    minimum: null,
    barcode: null,
    notes: "",
    createdAt: next,
    updatedAt: next,
    ...fields,
  };
}
const person = (band: HouseholdMember["band"], sex: HouseholdMember["sex"], extra: Partial<HouseholdMember> = {}): HouseholdMember => ({
  id: `m${band}${sex}`,
  kind: "person",
  name: "",
  band,
  sex,
  kcalPerDay: null,
  drinkingLitres: null,
  allUsesLitres: null,
  note: "",
  ...extra,
});
const household = (members: HouseholdMember[], extra: Partial<Household> = {}): Household => ({
  ...DEFAULT_HOUSEHOLD,
  energyTable: "uk",
  members,
  ...extra,
});

describe("the planning figures", () => {
  it("are those of PHE's tables 1 and 2 (2016)", () => {
    const row = (id: string) => ENERGY_BANDS.find((band) => band.id === id)!;
    expect([row("1").male, row("1").female]).toEqual([765, 717]);
    expect([row("2-3").male, row("2-3").female]).toEqual([1088, 1004]);
    expect([row("4-6").male, row("4-6").female]).toEqual([1482, 1378]);
    expect([row("7-10").male, row("7-10").female]).toEqual([1817, 1703]);
    expect([row("11-14").male, row("11-14").female]).toEqual([2500, 2000]);
    expect([row("19-64").male, row("19-64").female]).toEqual([2500, 2000]);
    expect([row("65-74").male, row("65-74").female]).toEqual([2342, 1912]);
    expect([row("75+").male, row("75+").female]).toEqual([2294, 1840]);
    expect(tableKcal("under-1", "male")).toBeNull();
    // Sex not stated: the mean of the two, rounded.
    expect(tableKcal("7-10", "unstated")).toBe(1760);
  });

  it("for water are the UK's 3 litres to drink and the low end of WHO's 7.5 to 15 for all uses", () => {
    expect(WATER_FIGURES.drinking.litres).toBe(3);
    expect(WATER_FIGURES.allUses.range).toEqual([7.5, 15]);
    expect(WATER_FIGURES.allUses.litres).toBe(7.5);
  });
});

describe("energy of a unit", () => {
  it("is the figure per pack, or per 100 g times the weight", () => {
    expect(kcalOfUnit({ kcalPerUnit: 250, kcalPer100g: null, gramsPerUnit: null })).toBe(250);
    expect(kcalOfUnit({ kcalPerUnit: null, kcalPer100g: 84, gramsPerUnit: 400 })).toBe(336);
    expect(kcalOfUnit({ kcalPerUnit: null, kcalPer100g: 84, gramsPerUnit: null })).toBeNull();
  });
});

describe("days of food and water, worked by hand", () => {
  // Two adults (a man and a woman, 19 to 64) and a girl of 8: 2,500 + 2,000 + 1,703 = 6,203 kcal a day.
  const family = household([person("19-64", "male"), person("19-64", "female"), person("7-10", "female")], { daysWanted: 7 });
  const stock = [
    // 10 tins of beans, 400 g at 84 kcal per 100 g: 336 kcal a tin, 3,360 kcal.
    item({ name: "Baked beans", quantity: 10, kcalPer100g: 84, gramsPerUnit: 400 }),
    // 5 packs of pasta, 500 g at 359 kcal per 100 g: 1,795 a pack, 8,975 kcal.
    item({ name: "Pasta", unit: "pack", quantity: 5, kcalPer100g: 359, gramsPerUnit: 500 }),
    // 2 packs of crackers at 1,000 kcal a pack: 2,000 kcal.
    item({ name: "Crackers", unit: "pack", quantity: 2, kcalPerUnit: 1000 }),
    // No energy given: left out, and said so.
    item({ name: "Salt", unit: "tub" }),
    // 12 bottles of 2 litres: 24 litres.
    item({ name: "Water", category: "water", unit: "bottle", quantity: 12, litresPerUnit: 2 }),
  ];

  it("counts 14,335 kcal against 6,203 a day: about 2.3 days", () => {
    const outlook = supplyOutlook(stock, family, TODAY);
    expect(outlook.food.perDay).toBe(6203);
    expect(outlook.food.counted).toBe(14335);
    expect(outlook.food.days).toBeCloseTo(14335 / 6203, 9);
    expect(daysWords(outlook.food.days)).toBe("about 2.3 days");
    expect(outlook.food.leftOut).toEqual([{ id: stock[3]!.id, name: "Salt", reason: "no-energy" }]);
  });

  it("counts 24 litres: 2.6 days to drink at 9 litres a day, 1 day for all uses at 22.5", () => {
    const outlook = supplyOutlook(stock, family, TODAY);
    expect(outlook.water.drinkingPerDay).toBe(9);
    expect(outlook.water.allUsesPerDay).toBe(22.5);
    expect(daysWords(outlook.water.daysDrinking)).toBe("about 2.6 days");
    expect(daysWords(outlook.water.daysAllUses)).toBe("about 1 day");
    // The basis chosen is drinking, so food (2.3 days) runs out before water (2.67).
    expect(outlook.runsOutFirst?.what).toBe("food");
    const allUses = supplyOutlook(stock, { ...family, waterBasis: "all" }, TODAY);
    expect(allUses.runsOutFirst?.what).toBe("water");
  });

  it("uses a person's own figure in place of the table's", () => {
    const stated = household([person("19-64", "male", { kcalPerDay: 3000, drinkingLitres: 4 })]);
    const outlook = supplyOutlook([item({ name: "Ration", kcalPerUnit: 6000 })], stated, TODAY);
    expect(outlook.food.perDay).toBe(3000);
    expect(outlook.food.days).toBe(2);
    expect(outlook.water.drinkingPerDay).toBe(4);
  });

  it("leaves a baby with no figure out of the total, and names them", () => {
    const outlook = supplyOutlook([], household([person("19-64", "female"), person("under-1", "female", { name: "Ada" })]), TODAY);
    expect(outlook.food.perDay).toBe(2000);
    expect(outlook.peopleWithoutFigure).toEqual(["Ada"]);
  });

  it("works out pet food against the pets' stated needs and adds their water", () => {
    const pet: HouseholdMember = { ...person(null, null), id: "dog", kind: "pet", name: "Dog", kcalPerDay: 800, drinkingLitres: 0.6 };
    const outlook = supplyOutlook(
      [item({ name: "Dog food", category: "pet-food", quantity: 4, kcalPerUnit: 400 })],
      household([person("19-64", "male"), pet]),
      TODAY,
    );
    expect(outlook.petFood?.days).toBe(2);
    expect(outlook.food.perDay).toBe(2500);
    expect(outlook.water.drinkingPerDay).toBeCloseTo(3.6, 9);
  });

  it("is about 23 days, not 23.9, from ten days up", () => {
    expect(daysWords(23.9)).toBe("about 23 days");
    expect(daysWords(9.99)).toBe("about 9.9 days");
    expect(daysWords(0)).toBe("none");
    expect(daysWords(null)).toBe("not worked out");
  });
});

describe("use-by and best before", () => {
  const one = household([person("19-64", "male")]);

  it("does not count what is past its use-by, and lists it to throw away", () => {
    const stock = [
      item({ name: "Ham", kcalPerUnit: 500, dateKind: "use-by", date: "2026-11-15" }),
      item({ name: "Rice", kcalPerUnit: 2500, dateKind: "best-before", date: "2026-11-01" }),
    ];
    const outlook = supplyOutlook(stock, one, TODAY);
    expect(outlook.food.counted).toBe(2500);
    expect(outlook.food.leftOut.map((row) => [row.name, row.reason])).toEqual([["Ham", "past-use-by"]]);
    expect(outlook.expired.map((row) => row.name)).toEqual(["Ham"]);
    // Past its best before: still counted, listed to check and eat first.
    expect(outlook.pastBestBefore.map((row) => [row.name, row.daysLeft])).toEqual([["Rice", -15]]);
  });

  it("counts food on its use-by day itself", () => {
    const outlook = supplyOutlook([item({ name: "Milk", kcalPerUnit: 600, dateKind: "use-by", date: TODAY })], one, TODAY);
    expect(outlook.food.counted).toBe(600);
    expect(outlook.expired).toEqual([]);
  });

  it("eats in date order, and loses what reaches its use-by before its turn", () => {
    // 5,000 kcal to be eaten by the end of today, and 5,000 with no date, at 2,500 a day:
    // 2,500 of the first is eaten today and 2,500 lost; the rest lasts two more days. 3 days, not 4.
    const stock = [
      item({ name: "Fresh", kcalPerUnit: 5000, dateKind: "use-by", date: TODAY }),
      item({ name: "Tinned", kcalPerUnit: 5000 }),
    ];
    const outlook = supplyOutlook(stock, one, TODAY);
    expect(outlook.food.counted).toBe(10000);
    expect(outlook.food.days).toBe(3);
    expect(outlook.food.lost).toBe(2500);
  });

  it("does not lose food a best before date only describes", () => {
    const stock = [
      item({ name: "Biscuits", kcalPerUnit: 5000, dateKind: "best-before", date: TODAY }),
      item({ name: "Tinned", kcalPerUnit: 5000 }),
    ];
    expect(supplyOutlook(stock, one, TODAY).food.days).toBe(4);
  });

  it("lists what is dated within 30, 90 and 180 days in date order", () => {
    const stock = [
      item({ name: "C", dateKind: "best-before", date: "2027-04-01" }),
      item({ name: "A", dateKind: "use-by", date: "2026-11-20" }),
      item({ name: "B", dateKind: "best-before", date: "2027-01-10" }),
      item({ name: "D", dateKind: "best-before", date: "2028-01-01" }),
    ];
    const outlook = supplyOutlook(stock, one, TODAY);
    expect(outlook.within[30].map((row) => row.name)).toEqual(["A"]);
    expect(outlook.within[90].map((row) => row.name)).toEqual(["A", "B"]);
    expect(outlook.within[180].map((row) => row.name)).toEqual(["A", "B", "C"]);
  });

  it("lastDays on its own: three portions with deadlines", () => {
    // 1,000 a day. 1,500 by the end of day 1 (until 2), 1,500 by the end of day 2 (until 3), 2,000 undated.
    // First: eaten by t = 1.5. Second: 1,500 more until t = 3, all eaten. Third: t = 5.
    expect(
      lastDays(
        [
          { amount: 1500, until: 2, order: 0 },
          { amount: 1500, until: 3, order: 1 },
          { amount: 2000, until: Infinity, order: 2 },
        ],
        1000,
      ),
    ).toEqual({
      days: 5,
      lost: 0,
    });
  });
});

describe("the shopping list", () => {
  // One man, 2,500 kcal a day, for 7 days: 17,500 kcal; 3 litres a day to drink: 21 litres.
  const one = household([person("19-64", "male")], { daysWanted: 7 });
  const beans = () => item({ name: "Baked beans", quantity: 10, kcalPer100g: 84, gramsPerUnit: 400 });
  const pasta = () => item({ name: "Pasta", unit: "pack", quantity: 5, kcalPer100g: 359, gramsPerUnit: 500 });
  const water = () => item({ name: "Water", category: "water", unit: "bottle", quantity: 3, litresPerUnit: 2 });

  it("turns the energy shortfall into whole packs of what is stocked, in the same mix", () => {
    // Held: 3,360 + 8,975 = 12,335 kcal; short 5,165. Beans' share 3,360/12,335 of it, 1,406.9 kcal: 4.19 tins, so 5.
    // Pasta's 3,758.1 kcal: 2.09 packs, so 3.
    const lines = shoppingSuggestions([beans(), pasta(), water()], one, TODAY);
    const by = (name: string) => lines.find((line) => line.name === name);
    expect(by("Baked beans")).toMatchObject({ quantity: 5, reasons: ["energy"] });
    expect(by("Pasta")).toMatchObject({ quantity: 3, reasons: ["energy"] });
    // 21 litres wanted, 6 held: 15 short, 7.5 bottles of 2 litres, so 8.
    expect(by("Water")).toMatchObject({ quantity: 8, reasons: ["water"] });
  });

  it("asks for nothing once the days wanted are reached", () => {
    expect(shoppingSuggestions([beans(), pasta(), water()], household([person("19-64", "male")], { daysWanted: 2 }), TODAY)).toEqual([]);
  });

  it("buys up to a minimum, and replaces what is past its use-by, counting that against the shortfall", () => {
    const stock = [
      beans(),
      pasta(),
      water(),
      item({ name: "AA batteries", category: "batteries", unit: "pack", quantity: 2, minimum: 8 }),
      // 2 cartons past their use-by, 600 kcal each: replaced, and the 1,200 kcal come off the shortfall.
      item({ name: "UHT milk", unit: "carton", quantity: 2, kcalPerUnit: 600, dateKind: "use-by", date: "2026-11-15" }),
    ];
    const lines = shoppingSuggestions(stock, one, TODAY);
    const by = (name: string) => lines.find((line) => line.name === name);
    expect(by("AA batteries")).toMatchObject({ quantity: 6, reasons: ["minimum"] });
    expect(by("UHT milk")).toMatchObject({ quantity: 2, reasons: ["expired"] });
    // Short 5,165 - 1,200 = 3,965 kcal: beans 1,080.0 (3.21 tins, so 4), pasta 2,885.0 (1.61 packs, so 2).
    expect(by("Baked beans")).toMatchObject({ quantity: 4 });
    expect(by("Pasta")).toMatchObject({ quantity: 2 });
  });

  it("says the shortfall in kcal where nothing stocked has its energy given", () => {
    const lines = shoppingSuggestions([item({ name: "Mystery tin" })], one, TODAY);
    expect(lines).toEqual([
      expect.objectContaining({ name: "Food", quantity: null, note: "About 17500 kcal more", reasons: ["energy"] }),
      // And with no water stocked at all, 7 days at 3 litres.
      expect.objectContaining({ name: "Water", quantity: null, note: "About 21 litres more", reasons: ["water"] }),
    ]);
  });

  it("treats rows of the same product together for a minimum", () => {
    const stock = [
      item({ name: "Candles", category: "equipment", unit: "candle", quantity: 3, minimum: 10 }),
      item({ name: "candles", category: "equipment", unit: "candle", quantity: 4, location: "Garage" }),
    ];
    expect(shoppingSuggestions(stock, household([]), TODAY)).toEqual([expect.objectContaining({ quantity: 3, reasons: ["minimum"] })]);
  });
});

describe("barcodes", () => {
  it("checks the GS1 check digit", () => {
    expect(validGtin("96385074")).toBe(true);
    expect(validGtin("012345678905")).toBe(true);
    expect(validGtin("5012345678900")).toBe(true);
    expect(validGtin("5012345678901")).toBe(false);
  });
  it("matches a UPC-A read as 12 digits or as 13", () => {
    expect(barcodeKey("012345678905")).toBe("00012345678905");
    expect(barcodeKey("0012345678905")).toBe("00012345678905");
    expect(barcodeKey("96385074")).toBe("00000096385074");
    expect(barcodeKey(" ABC-123 ")).toBe("ABC-123");
    expect(barcodeKey("   ")).toBeNull();
  });
});

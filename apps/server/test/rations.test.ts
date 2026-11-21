/**
 * The ration calculator's sums (packages/shared/src/rations.ts) against the figures of the
 * bodies they come from, and its staple foods against the USDA table Supplies ships.
 */
import {
  balanceOf,
  coldAllowance,
  daysAtLevels,
  type FoodSearchResponse,
  personNeed,
  planFoods,
  type RationPerson,
  runsOutOn,
  STAPLES,
  shareByNeed,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

const person = (over: Partial<RationPerson>): RationPerson => ({
  id: over.name ?? "p",
  name: "",
  age: 30,
  sex: "female",
  pregnant: false,
  breastfeeding: false,
  ill: false,
  ownKcal: null,
  ...over,
});

describe("a day's energy for one person", () => {
  it("takes the UK figure by age and sex, with SACN's additions for pregnancy and breastfeeding", () => {
    expect(personNeed(person({ sex: "male" }), "uk", null).kcal).toBe(2500);
    expect(personNeed(person({}), "uk", null).kcal).toBe(2000);
    expect(personNeed(person({ pregnant: true }), "uk", null).kcal).toBe(2191);
    expect(personNeed(person({ breastfeeding: true }), "uk", null).kcal).toBe(2330);
    expect(personNeed(person({ age: 80, sex: "male" }), "uk", null).kcal).toBe(2294);
    // The UK table has no figure for a baby under one.
    expect(personNeed(person({ age: 0 }), "uk", null).kcal).toBeNull();
    // The UK gives no allowance for cold.
    expect(personNeed(person({}), "uk", 0).kcal).toBe(2000);
  });

  it("takes FNNE's annex 1 figures, its additions, and its cold allowance by whole 5 °C steps", () => {
    expect(personNeed(person({ sex: "male" }), "international", null).kcal).toBe(2460);
    expect(personNeed(person({ age: 17, sex: "unstated" }), "international", null).kcal).toBe(2420);
    expect(personNeed(person({ age: 0, sex: "male" }), "international", null).kcal).toBe(850);
    expect(personNeed(person({ pregnant: true }), "international", null).kcal).toBe(1990 + 285);
    expect(personNeed(person({ breastfeeding: true }), "international", null).kcal).toBe(1990 + 500);
    expect(coldAllowance(15)).toEqual({ kcal: 100, beyond: false });
    expect(coldAllowance(12)).toEqual({ kcal: 100, beyond: false });
    expect(coldAllowance(0)).toEqual({ kcal: 400, beyond: false });
    expect(coldAllowance(-8)).toEqual({ kcal: 400, beyond: true });
    expect(coldAllowance(25)).toEqual({ kcal: 0, beyond: false });
    expect(personNeed(person({}), "international", 10).kcal).toBe(1990 + 200);
  });

  it("gives Sphere's 2,100 kcal to everyone, plus the cold allowance, and a person's own figure over any table", () => {
    expect(personNeed(person({ age: 4 }), "sphere", null).kcal).toBe(2100);
    expect(personNeed(person({}), "sphere", 5).kcal).toBe(2400);
    expect(personNeed(person({ ownKcal: 3600 }), "uk", 0).kcal).toBe(3600);
  });

  it("keeps children, older people, and pregnant, breastfeeding and ill people on a full ration", () => {
    expect(personNeed(person({ age: 10 }), "uk", null).protected).toBe(true);
    expect(personNeed(person({ age: 70 }), "uk", null).protected).toBe(true);
    expect(personNeed(person({ ill: true }), "uk", null).why).toEqual(["ill"]);
    expect(personNeed(person({}), "uk", null).protected).toBe(false);
  });
});

describe("how long a store lasts", () => {
  const needs = [person({ name: "a", sex: "male" }), person({ name: "b" }), person({ name: "c", age: 8, sex: "male" })].map((p) =>
    personNeed(p, "uk", null),
  );
  it("divides the energy by the household's day, the child kept on full at every level", () => {
    const [full, three, half] = daysAtLevels(63_170, needs);
    expect(full!.perDay).toBe(2500 + 2000 + 1817);
    expect(full!.days).toBeCloseTo(10, 6);
    expect(three!.perDay).toBe((2500 + 2000) * 0.75 + 1817);
    expect(half!.perDay).toBe((2500 + 2000) * 0.5 + 1817);
    expect(half!.anyoneReduced).toBe(true);
  });
  it("reduces nobody when everyone must stay on full", () => {
    const children = [person({ age: 5 }), person({ age: 9 })].map((p) => personNeed(p, "uk", null));
    const levels = daysAtLevels(10_000, children);
    expect(levels.every((level) => !level.anyoneReduced && level.perDay === levels[0]!.perDay)).toBe(true);
  });
  it("names the last day covered, today being the first", () => {
    expect(runsOutOn("2026-11-21", 1)).toBe("2026-11-21");
    expect(runsOutOn("2026-11-21", 10.6)).toBe("2026-11-30");
  });
});

describe("what to store, and a stock shared by need", () => {
  it("makes up the energy from the staples chosen, and warns of a ration that is nearly all one food", () => {
    const rice = STAPLES.find((food) => food.id === "rice")!;
    const lentils = STAPLES.find((food) => food.id === "lentils")!;
    const lines = planFoods(21_000, [
      { food: rice, share: 3 },
      { food: lentils, share: 1 },
    ]);
    expect(lines[0]!.kcal).toBeCloseTo(15_750, 6);
    expect(lines[0]!.grams).toBeCloseTo((15_750 / 365) * 100, 6);
    const mixed = balanceOf(lines.map((line, index) => ({ food: [rice, lentils][index]!, grams: line.grams })));
    expect(mixed.oneFood).toBeNull();
    // 53 g of protein for 2,100 kcal is Sphere's 10%.
    expect(mixed.proteinWanted).toBeCloseTo(530, 6);
    const riceOnly = balanceOf([{ food: rice, grams: 1000 }]);
    expect(riceOnly.oneFood).toBe(rice.label);
    expect(riceOnly.proteinShare).toBeCloseTo((71.3 / ((53 * 3650) / 2100)) * 0.1, 6);
  });

  it("meets the needs of those kept on full first, and shares the rest in proportion", () => {
    const needs = [person({ name: "adult", sex: "male" }), person({ name: "child", age: 8, sex: "male" })].map((p) =>
      personNeed(p, "uk", null),
    );
    const { perDay, lines } = shareByNeed(30_000, 10, needs);
    expect(perDay).toBe(3000);
    expect(lines.find((line) => line.name === "child")!.kcal).toBe(1817);
    expect(lines.find((line) => line.name === "adult")!.kcal).toBeCloseTo(3000 - 1817, 6);
    // Nobody is given more than their need.
    expect(shareByNeed(1_000_000, 10, needs).lines.every((line) => line.ofNeed === 1)).toBe(true);
  });
});

describe("the staples and the USDA table", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("holds each staple's figures exactly as the table Supplies ships", async () => {
    const { body, status } = await app.api("GET", `/api/supplies/foods/by-id?ids=${STAPLES.map((food) => food.fdcId).join(",")}`);
    expect(status).toBe(200);
    const found = (body as FoodSearchResponse).matches;
    expect(found).toHaveLength(STAPLES.length);
    for (const staple of STAPLES) {
      const row = found.find((match) => match.fdcId === staple.fdcId)!;
      expect([row.kcalPer100g, row.proteinG, row.fatG]).toEqual([staple.kcalPer100g, staple.proteinG, staple.fatG]);
    }
  });

  it("refuses ids that are not numbers", async () => {
    expect((await app.api("GET", "/api/supplies/foods/by-id?ids=rice")).status).toBe(400);
  });
});

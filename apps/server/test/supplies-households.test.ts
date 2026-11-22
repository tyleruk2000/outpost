/**
 * Supplies per household on a real server: each household keeps its own stock, shopping
 * list, settings and people; switching the current household switches what Supplies
 * shows; stock in one household is never found, changed or counted in another.
 */
import { DEFAULT_HOUSEHOLD, type HouseholdDto, type SuppliesResponse, type SupplyOutlooksResponse } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterEach(async () => {
  await app?.close();
});

const ok = async (method: string, url: string, body?: unknown) => {
  const response = await app.api(method, url, body);
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
};
const supplies = async (): Promise<SuppliesResponse> => ok("GET", "/api/supplies");
const create = async (body: Record<string, unknown>): Promise<HouseholdDto> => (await ok("POST", "/api/households", body)).household;
const current = (id: string) => ok("PUT", "/api/households/current", { id });
const item = (name: string, extra: Record<string, unknown> = {}) =>
  ok("POST", "/api/supplies/items", { name, category: "food", quantity: 10, kcalPerUnit: 400, location: name, ...extra }).then(
    (body) => body.item as { id: string },
  );
const adult = (name: string) => ({ kind: "person", name, band: "19-64", sex: "female", note: "" });
const settings = (members: unknown[], extra: Record<string, unknown> = {}) => ({
  daysWanted: 14,
  drinkingLitres: 2,
  allUsesLitres: 4,
  waterBasis: "drinking",
  members,
  ...extra,
});

describe("supplies with one household", () => {
  it("works as before, with its rows in the first household", async () => {
    await item("Rice");
    await ok("PUT", "/api/supplies/household", settings([adult("Ann")]));
    const body = await supplies();
    expect(body.items.map((entry) => entry.name)).toEqual(["Rice"]);
    expect(body.household.members.map((member) => member.name)).toEqual(["Ann"]);
    expect(app.ctx.sqlite.prepare("SELECT household_id FROM supply_items").pluck().all()).toEqual(["household"]);
    expect(app.ctx.sqlite.prepare("SELECT id FROM supply_household").pluck().all()).toEqual(["household"]);
    // Stored as the first household by the first change.
    expect(app.ctx.sqlite.prepare("SELECT id FROM households").pluck().all()).toEqual(["household"]);
    const outlooks: SupplyOutlooksResponse = await ok("GET", "/api/supplies/outlooks");
    expect(outlooks.households).toHaveLength(1);
    expect(outlooks.households[0]).toMatchObject({ householdId: "household", name: "Home", current: true });
    expect(outlooks.households[0]!.outlook.food.items).toBe(1);
  });
});

describe("supplies with several households", () => {
  it("shows the current household's stock, shopping, settings and people, and switches with it", async () => {
    await item("Rice");
    await ok("PUT", "/api/supplies/household", settings([adult("Ann"), adult("Bob")], { daysWanted: 30 }));
    await ok("POST", "/api/supplies/shopping", { name: "Matches" });
    const caravan = await create({ name: "Caravan", kind: "portable" });

    await current(caravan.id);
    let body = await supplies();
    expect(body.items).toEqual([]);
    expect(body.locations).toEqual([]);
    expect(body.household.members).toEqual([]);
    expect(body.household.daysWanted).toBe(DEFAULT_HOUSEHOLD.daysWanted);
    expect((await ok("GET", "/api/supplies/shopping")).lines).toEqual([]);

    await item("Pasta");
    await ok("PUT", "/api/supplies/household", settings([adult("Cat")], { daysWanted: 5 }));
    await ok("POST", "/api/supplies/shopping", { name: "Gas" });
    body = await supplies();
    expect(body.items.map((entry) => entry.name)).toEqual(["Pasta"]);
    expect(body.household.daysWanted).toBe(5);
    expect(body.household.members.map((member) => member.name)).toEqual(["Cat"]);
    expect((await ok("GET", "/api/supplies/shopping")).lines.map((line: { name: string }) => line.name)).toEqual(["Gas"]);

    await current("household");
    body = await supplies();
    expect(body.items.map((entry) => entry.name)).toEqual(["Rice"]);
    expect(body.household.daysWanted).toBe(30);
    expect(body.household.members.map((member) => member.name)).toEqual(["Ann", "Bob"]);
    expect((await ok("GET", "/api/supplies/shopping")).lines.map((line: { name: string }) => line.name)).toEqual(["Matches"]);
  });

  it("never finds, changes or counts one household's stock in another", async () => {
    const rice = await item("Rice", { barcode: "5000000000017", minimum: 50 });
    const caravan = await create({ name: "Caravan" });
    await current(caravan.id);

    for (const [method, url, body] of [
      ["GET", `/api/supplies/items/${rice.id}`, undefined],
      ["PATCH", `/api/supplies/items/${rice.id}`, { quantity: 1 }],
      ["POST", `/api/supplies/items/${rice.id}/adjust`, { by: -1 }],
      ["DELETE", `/api/supplies/items/${rice.id}`, undefined],
    ] as const) {
      expect((await app.api(method, url, body)).status, `${method} ${url}`).toBe(404);
    }
    // The barcode is known (what the product is), but the caravan holds none of it.
    const lookup = await ok("GET", "/api/supplies/barcodes/5000000000017");
    expect(lookup.items).toEqual([]);
    expect(lookup.product.name).toBe("Rice");
    // An import cannot update another household's row.
    const imported = await app.api("POST", "/api/supplies/import/apply", {
      rows: [{ action: "update", id: rice.id, item: { name: "Rice", category: "food", quantity: 0 } }],
    });
    expect(imported.status).toBe(404);
    // Working out the caravan's list leaves home's list alone, and does not buy home's rice.
    const worked = await ok("POST", "/api/supplies/shopping/work-out");
    expect(worked.lines.some((line: { itemId: string | null }) => line.itemId === rice.id)).toBe(false);
    expect((await ok("GET", "/api/supplies/outlook")).outlook.food.items).toBe(0);

    await current("household");
    const home = await ok("GET", `/api/supplies/items/${rice.id}`);
    expect(home.item.quantity).toBe(10);
    expect((await supplies()).items).toHaveLength(1);
  });

  it("gives every household's outlook, the current one first, each from its own people", async () => {
    await item("Rice");
    await ok("PUT", "/api/supplies/household", settings([adult("Ann")]));
    const caravan = await create({ name: "Caravan", kind: "portable" });
    await current(caravan.id);
    await item("Oats", { quantity: 5 });
    await ok("PUT", "/api/supplies/household", settings([adult("Ann"), adult("Bob")]));

    const body: SupplyOutlooksResponse = await ok("GET", "/api/supplies/outlooks");
    expect(body.households.map((entry) => [entry.name, entry.current])).toEqual([
      ["Caravan", true],
      ["Home", false],
    ]);
    const [van, home] = body.households;
    expect(home!.outlook.food.items).toBe(1);
    expect(van!.outlook.food.items).toBe(1);
    // 4,000 kcal for one, 2,000 kcal for two: the caravan's days are worked to its two people.
    expect(home!.outlook.food.days).toBeGreaterThan(van!.outlook.food.days!);
  });

  it("takes each household's people into the shopping list only for that household", async () => {
    await ok("PUT", "/api/supplies/household", settings([adult("Ann")]));
    const caravan = await create({ name: "Caravan" });
    await current(caravan.id);
    // Keeping the caravan's people does not take Ann out of home.
    await ok("PUT", "/api/supplies/household", settings([adult("Cat")]));
    await current("household");
    expect((await supplies()).household.members.map((member) => member.name)).toEqual(["Ann"]);
  });

  it("exports every household's list, each named after its household", async () => {
    await item("Rice");
    const caravan = await create({ name: "Caravan" });
    await current(caravan.id);
    await item("Pasta");
    const estimate = await ok("GET", "/api/export-all/estimate");
    expect(estimate.sections.find((section: { id: string }) => section.id === "supplies").count).toBe(2);
    // The CSV of the Supplies screen is the current household's.
    const csv = await app.app.inject({ method: "GET", url: "/api/supplies/export.csv" });
    expect(csv.payload).toContain("Pasta");
    expect(csv.payload).not.toContain("Rice");
  });
});

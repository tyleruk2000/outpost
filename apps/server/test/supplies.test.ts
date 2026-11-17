/**
 * Supplies on a real server: the rows of stock, the household, barcodes, the shopping
 * list, the CSV file out and back in, and the person's-own-data rules (counted where
 * Outpost says what is stored, and taken by "erase everything").
 */

import fs from "node:fs";
import path from "node:path";
import type { CleanupPlan, CleanupResult, ImportPreview, SupplyItem } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { measureContents } from "../src/modules/database/inspect.ts";
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

describe("supplies", () => {
  it("starts empty, with a household of nobody planned for three days", async () => {
    const body = await ok("GET", "/api/supplies");
    expect(body.items).toEqual([]);
    expect(body.household).toMatchObject({ daysWanted: 3, drinkingLitres: 3, allUsesLitres: 7.5, waterBasis: "drinking", members: [] });
  });

  it("adds, adjusts, uses up and removes an item", async () => {
    const beans = await add({
      name: "Baked beans",
      quantity: 10,
      unit: "tin",
      location: "Pantry",
      kcalPer100g: 84,
      gramsPerUnit: 400,
      dateKind: "best-before",
      date: "2027-06-30",
    });
    expect(beans).toMatchObject({ name: "Baked beans", quantity: 10, dateKind: "best-before", date: "2027-06-30" });
    expect((await ok("POST", `/api/supplies/items/${beans.id}/adjust`, { by: -1 })).item.quantity).toBe(9);
    expect((await ok("POST", `/api/supplies/items/${beans.id}/adjust`, { by: -50 })).item.quantity).toBe(0);
    expect((await ok("PATCH", `/api/supplies/items/${beans.id}`, { quantity: 12 })).item.quantity).toBe(12);
    expect((await ok("GET", "/api/supplies")).locations).toEqual(["Pantry"]);
    await ok("DELETE", `/api/supplies/items/${beans.id}`);
    expect((await app.api("GET", `/api/supplies/items/${beans.id}`)).status).toBe(404);
  });

  it("refuses an item with no name, a date that is not a day, or a negative quantity", async () => {
    expect((await app.api("POST", "/api/supplies/items", { name: " ", category: "food", quantity: 1 })).status).toBe(400);
    expect((await app.api("POST", "/api/supplies/items", { name: "X", category: "food", quantity: 1, date: "2027-02-30" })).status).toBe(
      400,
    );
    expect((await app.api("POST", "/api/supplies/items", { name: "X", category: "food", quantity: -1 })).status).toBe(400);
    expect((await app.api("POST", "/api/supplies/items", { name: "X", category: "sweets", quantity: 1 })).status).toBe(400);
  });

  it("takes a date with no kind as a best before, and drops the kind with no date", async () => {
    const dated = await add({ name: "Rice", date: "2027-01-01" });
    expect(dated.dateKind).toBe("best-before");
    const undated = await add({ name: "Oats", dateKind: "use-by" });
    expect(undated.dateKind).toBeNull();
    await ok("DELETE", `/api/supplies/items/${dated.id}`);
    await ok("DELETE", `/api/supplies/items/${undated.id}`);
  });

  it("finds an item by its barcode however the scanner wrote it, and remembers the barcode after the item goes", async () => {
    const tin = await add({ name: "Tomatoes", unit: "tin", barcode: "012345678905", kcalPerUnit: 80 });
    const by13 = await ok("GET", "/api/supplies/barcodes/0012345678905");
    expect(by13.items.map((row: SupplyItem) => row.id)).toEqual([tin.id]);
    expect(by13.key).toBe("00012345678905");
    await ok("DELETE", `/api/supplies/items/${tin.id}`);
    const after = await ok("GET", "/api/supplies/barcodes/012345678905");
    expect(after.items).toEqual([]);
    expect(after.product).toMatchObject({ name: "Tomatoes", unit: "tin", kcalPerUnit: 80 });
    const unknown = await ok("GET", "/api/supplies/barcodes/5012345678900");
    expect(unknown).toMatchObject({ items: [], product: null });
  });

  it("works out days and what is missing for the planner", async () => {
    await ok("PUT", "/api/supplies/household", {
      daysWanted: 7,
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [{ kind: "person", name: "Sam", band: "19-64", sex: "male" }],
    });
    const beans = await add({ name: "Baked beans", quantity: 10, unit: "tin", kcalPer100g: 84, gramsPerUnit: 400 });
    const pasta = await add({ name: "Pasta", quantity: 5, unit: "pack", kcalPer100g: 359, gramsPerUnit: 500 });
    const water = await add({ name: "Water", category: "water", quantity: 3, unit: "bottle", litresPerUnit: 2 });
    const { outlook, missing } = await ok("GET", "/api/supplies/outlook?today=2026-11-16");
    expect(outlook.food.counted).toBe(12335);
    expect(outlook.food.days).toBeCloseTo(12335 / 2500, 9);
    expect(outlook.water.days).toBe(2);
    expect(outlook.runsOutFirst).toEqual({ what: "water", days: 2 });
    expect(missing.map((line: { name: string; quantity: number }) => [line.name, line.quantity])).toEqual([
      ["Baked beans", 5],
      ["Pasta", 3],
      ["Water", 8],
    ]);
    for (const row of [beans, pasta, water]) await ok("DELETE", `/api/supplies/items/${row.id}`);
  });

  it("refuses a person with neither an age nor a figure", async () => {
    const response = await app.api("PUT", "/api/supplies/household", {
      daysWanted: 3,
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [{ kind: "person", name: "Nobody" }],
    });
    expect(response.status).toBe(400);
  });
});

describe("the shopping list", () => {
  it("is worked out, kept, edited, and ticked off into stock with the date asked for", async () => {
    await ok("PUT", "/api/supplies/household", {
      daysWanted: 7,
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [{ kind: "person", band: "19-64", sex: "female" }],
    });
    const beans = await add({
      name: "Chickpeas",
      quantity: 2,
      unit: "tin",
      kcalPerUnit: 400,
      location: "Pantry",
      dateKind: "best-before",
      date: "2027-01-01",
    });
    const own = (await ok("POST", "/api/supplies/shopping", { name: "Matches", quantity: 2, unit: "box" })).line;
    const list = await ok("POST", "/api/supplies/shopping/work-out?today=2026-11-16");
    expect(list.stale).toBe(false);
    // 14,000 kcal wanted, 800 held: 13,200 short, 33 tins. And water, with none stocked, in litres. The person's own line stays, last.
    expect(
      list.lines.map((line: { name: string; quantity: number | null; source: string }) => [line.name, line.quantity, line.source]),
    ).toEqual([
      ["Chickpeas", 33, "worked"],
      ["Water", null, "worked"],
      ["Matches", 2, "own"],
    ]);
    const chickpeas = list.lines[0];
    await ok("PATCH", `/api/supplies/shopping/${chickpeas.id}`, { quantity: 30 });

    // Bought 12 with a later date: a new row like the old one; 18 left on the list.
    const bought = await ok("POST", `/api/supplies/shopping/${chickpeas.id}/bought`, {
      quantity: 12,
      dateKind: "best-before",
      date: "2028-03-01",
    });
    expect(bought.item).toMatchObject({ name: "Chickpeas", quantity: 12, date: "2028-03-01", location: "Pantry", kcalPerUnit: 400 });
    expect(bought.item.id).not.toBe(beans.id);
    expect(bought.line.quantity).toBe(18);
    // Bought the rest with the same date: added to that row, and the line is done.
    const rest = await ok("POST", `/api/supplies/shopping/${chickpeas.id}/bought`, {
      quantity: 18,
      dateKind: "best-before",
      date: "2028-03-01",
    });
    expect(rest.item).toMatchObject({ id: bought.item.id, quantity: 30 });
    expect(rest.line).toBeNull();

    // The stock changed since it was worked out.
    expect((await ok("GET", "/api/supplies/shopping")).stale).toBe(true);
    // A line of one's own becomes an item of the category asked for.
    const matches = await ok("POST", `/api/supplies/shopping/${own.id}/bought`, { quantity: 2, category: "equipment" });
    expect(matches.item).toMatchObject({ name: "Matches", category: "equipment", unit: "box", quantity: 2 });
    for (const row of (await ok("GET", "/api/supplies")).items as SupplyItem[]) await ok("DELETE", `/api/supplies/items/${row.id}`);
  });
});

describe("CSV", () => {
  it("goes out and comes back in without loss, and the second time every row is a duplicate", async () => {
    const tricky = await add({
      name: '=SUM(A1) "quoted", with a comma',
      category: "medical",
      quantity: 2.5,
      unit: "box",
      location: "Bathroom cabinet",
      dateKind: "use-by",
      date: "2027-02-28",
      minimum: 1,
      barcode: "5012345678900",
      notes: "Line one\nline two",
    });
    const water = await add({ name: "Water", category: "water", quantity: 6, unit: "bottle", litresPerUnit: 1.5, location: "Garage" });
    const csv = await app.api("GET", "/api/supplies/export.csv?today=2026-11-16");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["content-disposition"]).toContain("Supplies 2026-11-16.csv");
    const text = csv.body as unknown as string;
    // The formula is written so that a spreadsheet shows it as text.
    expect(text).toContain(`"'=SUM(A1) ""quoted"", with a comma"`);

    const preview: ImportPreview = await ok("POST", "/api/supplies/import/preview", { text });
    expect(preview.rows.map((row) => row.duplicateOf?.by)).toEqual(["id", "id"]);
    expect(preview.rows.every((row) => row.error === null)).toBe(true);
    const back = preview.rows.find((row) => row.duplicateOf?.id === tricky.id)!.item!;
    const { id: _id, createdAt: _c, updatedAt: _u, ...original } = tricky;
    expect(back).toEqual(original);

    // Brought in as new rows anyway: the same items again, with new ids.
    const result = await ok("POST", "/api/supplies/import/apply", {
      rows: preview.rows.map((row) => ({ action: "add", item: row.item })),
    });
    expect(result).toEqual({ added: 2, updated: 0, skipped: 0 });
    const items: SupplyItem[] = (await ok("GET", "/api/supplies")).items;
    expect(items.filter((row) => row.name === water.name)).toHaveLength(2);
    for (const row of items) await ok("DELETE", `/api/supplies/items/${row.id}`);
  });

  it("reads a spreadsheet of a person's own, with its own headers, and says what it could not read", async () => {
    const existing = await add({ name: "Rice", unit: "bag", location: "Pantry", date: "2027-05-31", dateKind: "best-before" });
    const text = [
      "Item;Qty;Unit;Where;Best before;Calories per pack;Colour",
      "Rice;3;bag;Pantry;05/2027;1800;white",
      "Soup;4;tin;Pantry;31/12/2026;;red",
      ";2;tin;;;;",
      "Crackers;lots;pack;;;;",
      "Tea;1;box;;2027-13-01;;",
    ].join("\n");
    const preview: ImportPreview = await ok("POST", "/api/supplies/import/preview", { text });
    expect(preview.ignoredColumns).toEqual(["Colour"]);
    const [rice, soup, noName, lots, tea] = preview.rows;
    expect(rice!.item).toMatchObject({ name: "Rice", quantity: 3, date: "2027-05-31", dateKind: "best-before", kcalPerUnit: 1800 });
    expect(rice!.duplicateOf).toEqual({ id: existing.id, name: "Rice", by: "same" });
    expect(soup!.item).toMatchObject({ name: "Soup", date: "2026-12-31", category: "food" });
    expect(noName!.error).toBe("It has no name.");
    expect(lots!.error).toContain("is not a number");
    expect(tea!.error).toContain("is not a date");

    // Update the rice, skip the soup.
    const result = await ok("POST", "/api/supplies/import/apply", {
      rows: [
        { action: "update", id: existing.id, item: rice!.item },
        { action: "skip", item: soup!.item },
      ],
    });
    expect(result).toEqual({ added: 0, updated: 1, skipped: 1 });
    expect((await ok("GET", `/api/supplies/items/${existing.id}`)).item).toMatchObject({ quantity: 3, kcalPerUnit: 1800 });
    await ok("DELETE", `/api/supplies/items/${existing.id}`);
  });

  it("refuses in the preview a row the inventory would refuse, so that bringing in the rest still works", async () => {
    // kJ in the kcal column is the usual slip: 1,550 kJ per 100 g is more than any food has in kcal.
    const text = ["name,kcal_per_100g,grams_per_unit,litres_per_unit", "Oats,1550,500,", "Rice,350,1000,", "Tank,,,20000"].join("\n");
    const preview: ImportPreview = await ok("POST", "/api/supplies/import/preview", { text });
    const [oats, rice, tank] = preview.rows;
    expect(oats!.error).toContain("kcal per 100g");
    expect(tank!.error).toContain("litres per unit");
    expect(rice!.item).toMatchObject({ name: "Rice", kcalPer100g: 350 });
    const rows = preview.rows.filter((row) => row.item).map((row) => ({ action: "add", item: row.item }));
    expect(await ok("POST", "/api/supplies/import/apply", { rows })).toEqual({ added: 1, updated: 0, skipped: 0 });
    for (const row of (await ok("GET", "/api/supplies")).items as SupplyItem[]) await ok("DELETE", `/api/supplies/items/${row.id}`);
  });

  it("refuses a file with no name column, or one that is a web page", async () => {
    expect((await app.api("POST", "/api/supplies/import/preview", { text: "qty,unit\n1,tin" })).status).toBe(400);
    expect((await app.api("POST", "/api/supplies/import/preview", { text: "<!doctype html><p>hi" })).status).toBe(400);
  });
});

describe("a person's own data", () => {
  it("is counted in the database and in the clean-up plan, and erased with everything else", async () => {
    await add({ name: "Candles", category: "equipment", quantity: 6, barcode: "96385074" });
    await ok("PUT", "/api/supplies/household", {
      daysWanted: 14,
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "all",
      members: [
        { kind: "person", band: "19-64", sex: "female" },
        { kind: "pet", name: "Dog", kcalPerDay: 700, drinkingLitres: 0.5 },
      ],
    });
    await ok("POST", "/api/supplies/shopping", { name: "Lamp oil" });

    // In the database a backup is made of, and counted under Storage, Database.
    const snapshot = path.join(app.dir, "snapshot.db");
    await app.ctx.sqlite.backup(snapshot);
    try {
      const contents = measureContents(snapshot);
      expect(contents.counts.find((entry) => entry.id === "supplies")?.count).toBe(1);
      if (contents.groups) expect(contents.groups.find((group) => group.id === "prepare")!.bytes).toBeGreaterThan(0);
    } finally {
      fs.rmSync(snapshot, { force: true });
    }
    // Barcodes are remembered after their items go, so the earlier tests' are still here (three), and so is
    // the shopping list's line for water that was never bought (two lines).
    const kept = app.ctx.services.supplies.count();
    expect(kept).toEqual({ items: 1, members: 2, shopping: 2, barcodes: 3 });

    const plan = (await app.api<CleanupPlan>("POST", "/api/manage/plan", { scope: "everything" })).body;
    expect(plan.personal?.supplies).toEqual(kept);

    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.supplies).toEqual(kept);
    expect(app.ctx.services.supplies.count()).toEqual({ items: 0, members: 0, shopping: 0, barcodes: 0 });
    expect((await ok("GET", "/api/supplies")).household).toMatchObject({ daysWanted: 3, members: [] });
  });
});

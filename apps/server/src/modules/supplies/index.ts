/**
 * Supplies, under Preparedness: stored food, water and equipment, who they are for, how
 * long they last, and what to buy. The rules are in `service.ts`, the arithmetic in
 * `@outpost/shared` (supplies.ts), and the CSV file in `csv.ts`.
 *
 * `GET /api/supplies/outlook` is the one other screens ask: how many days of food and
 * water there are for the household, and what is missing to reach the days wanted.
 *
 * `GET /api/supplies/foods?q=` finds a food's energy per 100 g in USDA FoodData Central's
 * table, which ships with Outpost (`foods.ts`).
 *
 * Nothing here makes a request anywhere. A barcode is looked up in the inventory and
 * nowhere else; see docs/supplies.md for why, and for what an open product database
 * would allow.
 */
import {
  AGE_BAND_IDS,
  energySummary,
  type ImportResult,
  isCalendarDay,
  localDay,
  SUPPLY_CATEGORY_IDS,
  SUPPLY_FIGURE_MAX,
  SUPPLY_LIMITS,
  type SuppliesResponse,
  type SupplyOutlookResponse,
  shoppingSuggestions,
  supplyOutlook,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { contentDisposition } from "../notes/attachments.ts";
import { previewCsv, toCsv } from "./csv.ts";
import { findFoods, foodsById } from "./foods.ts";
import { createSuppliesService, type SuppliesService } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    supplies: SuppliesService;
  }
}

const idParams = z.object({ id: z.string().min(1).max(64) });
const amount = (max: number) => z.number().finite().min(0).max(max);
const optionalAmount = (max: number) => amount(max).nullable();
const day = z.string().refine(isCalendarDay, "Give the date as a calendar day: 2027-03-31.");

const itemSchema = z
  .object({
    name: z.string().trim().min(1, "Give the item a name.").max(SUPPLY_LIMITS.name),
    category: z.enum(SUPPLY_CATEGORY_IDS),
    quantity: amount(SUPPLY_FIGURE_MAX.quantity),
    unit: z.string().max(SUPPLY_LIMITS.unit).default(""),
    location: z.string().max(SUPPLY_LIMITS.location).default(""),
    dateKind: z.enum(["use-by", "best-before"]).nullable().default(null),
    date: day.nullable().default(null),
    kcalPerUnit: optionalAmount(SUPPLY_FIGURE_MAX.kcalPerUnit).default(null),
    kcalPer100g: optionalAmount(SUPPLY_FIGURE_MAX.kcalPer100g).default(null),
    gramsPerUnit: optionalAmount(SUPPLY_FIGURE_MAX.gramsPerUnit).default(null),
    litresPerUnit: optionalAmount(SUPPLY_FIGURE_MAX.litresPerUnit).default(null),
    minimum: optionalAmount(SUPPLY_FIGURE_MAX.minimum).default(null),
    barcode: z.string().trim().max(SUPPLY_LIMITS.barcode).nullable().default(null),
    notes: z.string().max(SUPPLY_LIMITS.notes).default(""),
  })
  .strict();

const memberSchema = z
  .object({
    id: z.string().max(64).optional(),
    kind: z.enum(["person", "pet"]),
    name: z.string().max(80).default(""),
    band: z.enum(AGE_BAND_IDS).nullable().default(null),
    sex: z.enum(["male", "female", "unstated"]).nullable().default(null),
    kcalPerDay: optionalAmount(10_000).default(null),
    drinkingLitres: optionalAmount(50).default(null),
    allUsesLitres: optionalAmount(200).default(null),
    note: z.string().max(400).default(""),
  })
  .strict()
  .refine((member) => member.kind === "pet" || member.band !== null || member.kcalPerDay !== null, {
    message: "Give each person an age, or the energy they need a day.",
  });

const householdSchema = z
  .object({
    daysWanted: z.number().int().min(1, "Plan for at least one day.").max(3650),
    drinkingLitres: z.number().finite().min(0.5).max(50),
    allUsesLitres: z.number().finite().min(0.5).max(200),
    waterBasis: z.enum(["drinking", "all"]),
    members: z.array(memberSchema).max(SUPPLY_LIMITS.members),
  })
  .strict();

const todayQuery = z.object({ today: day.optional() });
const shoppingLineSchema = z
  .object({
    name: z.string().trim().min(1, "Say what to buy.").max(SUPPLY_LIMITS.name),
    quantity: optionalAmount(SUPPLY_LIMITS.quantity).default(null),
    unit: z.string().max(SUPPLY_LIMITS.unit).default(""),
    note: z.string().max(400).default(""),
  })
  .strict();
const boughtSchema = z
  .object({
    quantity: z.number().finite().gt(0, "Say how many you bought.").max(SUPPLY_LIMITS.quantity),
    dateKind: z.enum(["use-by", "best-before"]).nullable().default(null),
    date: day.nullable().default(null),
    location: z.string().max(SUPPLY_LIMITS.location).optional(),
    category: z.enum(SUPPLY_CATEGORY_IDS).optional(),
  })
  .strict();
const importSchema = z.object({
  rows: z
    .array(z.object({ action: z.enum(["add", "update", "skip"]), id: z.string().max(64).optional(), item: itemSchema }))
    .max(SUPPLY_LIMITS.items),
});

export async function registerSupplies(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createSuppliesService(ctx);
  ctx.services.supplies = service;
  /** The day the figures are for: the device's, when it says, else this computer's. */
  const todayOf = (query: unknown) => todayQuery.parse(query).today ?? localDay();

  app.get(
    "/api/supplies",
    async (): Promise<SuppliesResponse> => ({ items: service.items(), household: service.household(), locations: service.locations() }),
  );

  app.post("/api/supplies/items", async (request) => ({ item: service.create(itemSchema.parse(request.body)) }));
  app.get("/api/supplies/items/:id", async (request) => ({ item: service.item(idParams.parse(request.params).id) }));
  app.patch("/api/supplies/items/:id", async (request) => {
    // Only what the request names changes: zod fills a default in for a field left out, even of a partial object.
    const given = Object.keys((request.body ?? {}) as object);
    const parsed = itemSchema.partial().parse(request.body) as Record<string, unknown>;
    const changes = Object.fromEntries(Object.entries(parsed).filter(([key]) => given.includes(key)));
    return { item: service.update(idParams.parse(request.params).id, changes) };
  });
  app.post("/api/supplies/items/:id/adjust", async (request) => {
    const { by } = z.object({ by: z.number().finite().min(-SUPPLY_LIMITS.quantity).max(SUPPLY_LIMITS.quantity) }).parse(request.body);
    return { item: service.adjust(idParams.parse(request.params).id, by) };
  });
  app.delete("/api/supplies/items/:id", async (request) => {
    service.remove(idParams.parse(request.params).id);
    return { ok: true };
  });

  app.put("/api/supplies/household", async (request) => ({ household: service.setHousehold(householdSchema.parse(request.body)) }));

  app.get("/api/supplies/barcodes/:code", async (request) => {
    const { code } = z.object({ code: z.string().min(1).max(SUPPLY_LIMITS.barcode) }).parse(request.params);
    return service.lookup(code);
  });

  /** How long the supplies last, and what is missing to reach the days wanted. Asked by other screens (the scenario planner). */
  app.get("/api/supplies/outlook", async (request): Promise<SupplyOutlookResponse> => {
    const today = todayOf(request.query);
    const items = service.items();
    const household = service.household();
    const outlook = supplyOutlook(items, household, today);
    return { outlook, missing: shoppingSuggestions(items, household, today), energy: energySummary(outlook, household) };
  });

  /** Foods in USDA FoodData Central's table that match a name typed, best first, with energy per 100 g. Local; nothing is fetched. */
  // Foods by id, for the ration calculator's protein and fat of what Supplies holds (the id is in an item's energy note).
  app.get("/api/supplies/foods/by-id", async (request) => {
    const { ids } = z
      .object({
        ids: z
          .string()
          .regex(/^\d{1,9}(,\d{1,9}){0,199}$/, "Give `ids` as up to 200 food numbers, separated by commas.")
          .transform((text) => text.split(",").map(Number)),
      })
      .parse(request.query);
    return foodsById(ids);
  });

  app.get("/api/supplies/foods", async (request) => {
    const { q, limit } = z
      .object({ q: z.string().max(100), limit: z.coerce.number().int().min(1).max(20).default(8) })
      .parse(request.query);
    return findFoods(q, limit);
  });

  // ── The shopping list ──

  app.get("/api/supplies/shopping", async () => service.shopping());
  app.post("/api/supplies/shopping/work-out", async (request) => service.workOutShopping(todayOf(request.query)));
  app.post("/api/supplies/shopping", async (request) => ({ line: service.addShoppingLine(shoppingLineSchema.parse(request.body)) }));
  app.patch("/api/supplies/shopping/:id", async (request) => {
    const given = Object.keys((request.body ?? {}) as object);
    const parsed = shoppingLineSchema.partial().parse(request.body) as Record<string, unknown>;
    return {
      line: service.updateShoppingLine(
        idParams.parse(request.params).id,
        Object.fromEntries(Object.entries(parsed).filter(([key]) => given.includes(key))),
      ),
    };
  });
  app.delete("/api/supplies/shopping/:id", async (request) => {
    service.removeShoppingLine(idParams.parse(request.params).id);
    return { ok: true };
  });
  app.post("/api/supplies/shopping/:id/bought", async (request) =>
    service.bought(idParams.parse(request.params).id, boughtSchema.parse(request.body)),
  );

  // ── CSV ──

  /** A plain GET, so that a phone's browser saves it. */
  app.get("/api/supplies/export.csv", async (request, reply) => {
    const today = todayOf(request.query);
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", contentDisposition("attachment", `Supplies ${today}.csv`))
      .send(toCsv(service.items()));
  });

  /** Reads a file and says what it would do. Changes nothing. */
  app.post("/api/supplies/import/preview", async (request) => {
    const { text } = z.object({ text: z.string().max(SUPPLY_LIMITS.csvBytes) }).parse(request.body);
    return previewCsv(text, service.items());
  });

  app.post("/api/supplies/import/apply", async (request): Promise<ImportResult> => {
    const { rows } = importSchema.parse(request.body);
    const chosen = rows.filter((row) => row.action !== "skip") as Array<{
      action: "add" | "update";
      id?: string;
      item: z.infer<typeof itemSchema>;
    }>;
    const { added, updated } = service.importRows(chosen);
    return { added, updated, skipped: rows.length - chosen.length };
  });
}

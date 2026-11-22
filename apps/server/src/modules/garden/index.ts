/**
 * Garden, under Tools: the household's record of what it sowed, and its usual last-frost
 * date. The calendar itself (what to sow, plant and harvest in a month) is pure and lives
 * in `@outpost/shared` (garden.ts), so the screen works it out without asking here.
 *
 * All of it is the person's own: counted and erased with the rest by modules/manage,
 * counted in the database's figures, and in every backup. See docs/garden.md.
 */
import {
  GARDEN_CROP_IDS,
  GARDEN_CROPS,
  GARDEN_LIMITS,
  type GardenKept,
  type GardenResponse,
  type GardenSettings,
  type GardenSowing,
  type GardenSowingInput,
  parseMonthDay,
} from "@outpost/shared";
import { asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { gardenSettings, gardenSowings } from "../../db/schema.ts";

export interface GardenService {
  get(): GardenResponse;
  saveSettings(input: { lastFrost: string | null; baseUpdatedAt?: number | null }): GardenSettings;
  create(input: GardenSowingInput): GardenSowing;
  update(id: string, input: GardenSowingInput): GardenSowing;
  remove(id: string): void;
  kept: { count(): GardenKept; eraseAll(): GardenKept };
}

declare module "../../core/context.ts" {
  interface Services {
    garden: GardenService;
  }
}

const L = GARDEN_LIMITS;
const ROW = "household";
const day = (message: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((value) => {
      const at = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
    }, message);
const optionalDay = (message: string) => day(message).nullable().default(null);
const text = (max: number) => z.string().trim().max(max).default("");

const sowingSchema = z
  .object({
    cropId: z.enum(GARDEN_CROP_IDS).nullable().default(null),
    name: text(L.name),
    sownOn: day("Give the day it was sown as a date."),
    place: text(L.short),
    amount: text(L.short),
    plantedOutOn: optionalDay("Give the day it was planted out as a date, or leave it empty."),
    harvestedOn: optionalDay("Give the day the first was picked as a date, or leave it empty."),
    notes: text(L.text),
    baseUpdatedAt: z.number().int().optional(),
  })
  .strict()
  .refine((input) => input.cropId !== null || input.name.length > 0, {
    message: "Say what was sown: choose a crop or write its name.",
    path: ["name"],
  });

const settingsSchema = z
  .object({
    lastFrost: z
      .string()
      .refine((value) => parseMonthDay(value) !== null, "Give the last frost as a day of the year, such as 05-12 for 12 May.")
      .nullable(),
    /** The `updatedAt` the screen showed (null: never saved). A newer stored setting refuses it with 409. */
    baseUpdatedAt: z.number().int().nullable().optional(),
  })
  .strict();

const idParams = z.object({ id: z.string().min(1).max(64) });

type Row = typeof gardenSowings.$inferSelect;

const toSowing = (row: Row): GardenSowing => ({
  id: row.id,
  cropId: (GARDEN_CROP_IDS as readonly string[]).includes(row.cropId ?? "") ? (row.cropId as GardenSowing["cropId"]) : null,
  name: row.name,
  sownOn: row.sownOn,
  place: row.place,
  amount: row.amount,
  plantedOutOn: row.plantedOutOn,
  harvestedOn: row.harvestedOn,
  notes: row.notes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export async function registerGarden(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, sqlite } = ctx;
  const changed = () => ctx.events.publish({ type: "garden.changed" });

  const rowOf = (id: string): Row => {
    const row = db.select().from(gardenSowings).where(eq(gardenSowings.id, id)).get();
    if (!row) throw notFound("That sowing is no longer in the garden record.");
    return row;
  };

  const columns = (input: GardenSowingInput) => ({
    cropId: input.cropId,
    // A sowing of a calendar crop with no name of its own is called by the crop's name.
    name: input.name || (input.cropId ? GARDEN_CROPS[input.cropId].name : ""),
    sownOn: input.sownOn,
    place: input.place,
    amount: input.amount,
    plantedOutOn: input.plantedOutOn,
    harvestedOn: input.harvestedOn,
    notes: input.notes,
  });

  const settings = (): GardenSettings => {
    const row = db.select().from(gardenSettings).where(eq(gardenSettings.id, ROW)).get();
    return { lastFrost: row?.lastFrost ?? null, updatedAt: row?.updatedAt ?? null };
  };
  const count = (table: string) => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

  const service: GardenService = {
    get: () => ({
      settings: settings(),
      sowings: db.select().from(gardenSowings).orderBy(desc(gardenSowings.sownOn), asc(gardenSowings.createdAt)).all().map(toSowing),
    }),
    saveSettings(input) {
      const before = settings().updatedAt;
      if (input.baseUpdatedAt !== undefined && before !== null && (input.baseUpdatedAt === null || before > input.baseUpdatedAt))
        throw conflict(
          "The last frost was changed somewhere else after you opened it. Yours was not saved over it; look at it again.",
          { current: settings() },
        );
      const now = before === null ? Date.now() : Math.max(Date.now(), before + 1);
      db.insert(gardenSettings)
        .values({ id: ROW, lastFrost: input.lastFrost, updatedAt: now })
        .onConflictDoUpdate({ target: gardenSettings.id, set: { lastFrost: input.lastFrost, updatedAt: now } })
        .run();
      changed();
      return settings();
    },
    create(input) {
      if (count("garden_sowings") >= L.sowings) throw badRequest(`The garden record holds up to ${L.sowings} sowings.`);
      const now = Date.now();
      const id = newId();
      db.insert(gardenSowings)
        .values({ id, ...columns(input), createdAt: now, updatedAt: now })
        .run();
      changed();
      return toSowing(rowOf(id));
    },
    update(id, input) {
      const row = rowOf(id);
      if (input.baseUpdatedAt !== undefined && row.updatedAt > input.baseUpdatedAt)
        throw conflict(
          "This sowing was changed somewhere else after you opened it. Your changes were not saved over it; open it again to see the newer version.",
          { current: { updatedAt: row.updatedAt, name: row.name } },
        );
      db.update(gardenSowings)
        .set({ ...columns(input), updatedAt: Math.max(Date.now(), row.updatedAt + 1) })
        .where(eq(gardenSowings.id, id))
        .run();
      changed();
      return toSowing(rowOf(id));
    },
    remove(id) {
      rowOf(id);
      db.delete(gardenSowings).where(eq(gardenSowings.id, id)).run();
      changed();
    },
    kept: {
      count: () => ({ sowings: count("garden_sowings"), settings: count("garden_settings") }),
      eraseAll() {
        const before = service.kept.count();
        sqlite.prepare("DELETE FROM garden_sowings").run();
        sqlite.prepare("DELETE FROM garden_settings").run();
        if (before.sowings + before.settings > 0) changed();
        return before;
      },
    },
  };
  ctx.services.garden = service;

  const id = (request: { params: unknown }) => idParams.parse(request.params).id;

  app.get("/api/garden", async () => service.get());
  app.put("/api/garden/settings", async (request) => ({ settings: service.saveSettings(settingsSchema.parse(request.body)) }));
  app.post("/api/garden/sowings", async (request) => ({ sowing: service.create(sowingSchema.parse(request.body)) }));
  app.put("/api/garden/sowings/:id", async (request) => ({ sowing: service.update(id(request), sowingSchema.parse(request.body)) }));
  app.delete("/api/garden/sowings/:id", async (request) => {
    service.remove(id(request));
    return { ok: true };
  });
}

/**
 * Power plans (Tools → Power and batteries): a battery bank, the loads on it and what
 * charges it, kept under a name so that a person can come back to it, copy it and
 * compare it with another.
 *
 * The server only keeps them. It checks that what it is given is a plan, within limits
 * that keep the figures physical, and works nothing out: the answers are arithmetic done
 * in the browser where they are shown (apps/web/src/features/power/calc). A plan is a
 * person's own data, so it is counted and erased with the rest of it
 * (`ctx.services.power.kept`, used by modules/manage), and is in the database a backup
 * copies.
 */
import { POWER_PLAN_MAX_LOADS, POWER_PLANS_MAX, type PowerPlan, type PowerPlanInput } from "@outpost/shared";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { powerPlans } from "../../db/schema.ts";
import { planFileBody, readPlanFile } from "../export-all/plan-file.ts";
import { registerPowerDevices } from "./devices.ts";
import { checkBase, nextUpdatedAt, withoutBase } from "./versions.ts";

export interface PowerService {
  list(): PowerPlan[];
  get(id: string): PowerPlan;
  create(input: PowerPlanInput): PowerPlan;
  /** `baseUpdatedAt`, when given, is the version the change was made from: an older one than is kept is refused (409). */
  update(id: string, input: PowerPlanInput, baseUpdatedAt?: number): PowerPlan;
  copy(id: string): PowerPlan;
  remove(id: string): void;
  /** The person's own: counted for "what is stored", and erased with everything else. */
  kept: { count(): number; eraseAll(): number };
}

declare module "../../core/context.ts" {
  interface Services {
    power: PowerService;
  }
}

const share = z.number().min(0).max(1);
const watts = z.number().min(0).max(1_000_000);
const hours = z.number().min(0).max(24);
const hour = z.number().int().min(0).max(23);
const amps = z.number().positive().max(100_000).nullable();
const name = z.string().trim().min(1, "Give it a name.").max(120);

// Where a load's figures came from: an entry in the library of common devices, or one of the person's own. Older loads have none.
const origin = z
  .object({
    library: z.enum(["common", "own"]),
    id: z.string().min(1).max(64),
    name: z.string().max(120),
    state: z.string().max(64).nullable(),
    figures: z.record(z.string().max(32), z.number().min(0).max(10_000_000)).refine((figures) => Object.keys(figures).length <= 12),
  })
  .strict()
  .nullable()
  .optional();

const loadBase = {
  id: z.string().min(1).max(64),
  name,
  supply: z.enum(["dc", "usb", "ac"]),
  quantity: z.number().int().min(1).max(1000),
  startHour: hour,
  origin,
};
const load = z.discriminatedUnion("kind", [
  z.object({ ...loadBase, kind: z.literal("device"), watts, hoursPerDay: hours }),
  z
    .object({
      ...loadBase,
      kind: z.literal("radio"),
      transmitW: watts,
      receiveW: watts,
      standbyW: watts,
      onAirHours: hours,
      standbyHours: hours,
      transmitShare: share,
      modeFactor: share,
      mode: z.enum(["ssb", "ssb-processed", "cw", "ft8", "fm", "custom"]),
    })
    .refine((radio) => radio.onAirHours + radio.standbyHours <= 24, {
      message: "A radio's hours on the air and on standby add up to more than a day.",
      path: ["standbyHours"],
    }),
  z.object({
    ...loadBase,
    kind: z.literal("charge"),
    wattHours: z.number().gt(0).max(10_000_000),
    chargesPerDay: z.number().min(0).max(100),
    chargeEfficiency: z.number().gt(0).max(1),
    chargeHours: z.number().gt(0).max(24),
  }),
]);
const percent = z.number().min(0).max(100);

const planInput = z.object({
  name,
  notes: z.string().max(20_000).default(""),
  battery: z.object({
    chemistry: z.enum(["lifepo4", "agm", "flooded", "li-ion"]),
    volts: z.number().positive().max(1000),
    ampHours: z.number().positive().max(100_000),
    series: z.number().int().min(1).max(100),
    parallel: z.number().int().min(1).max(100),
    usableDod: z.number().gt(0, "The usable share of the battery must be more than nothing.").max(1),
    roundTrip: z.number().gt(0).max(1),
    maxDischargeA: amps,
    maxChargeA: amps,
  }),
  loads: z.array(load).max(POWER_PLAN_MAX_LOADS),
  inverter: z.object({ efficiency: z.number().gt(0).max(1), idleW: watts, hoursOn: hours }),
  // The converter from the battery to USB; plans from before it have none.
  usb: z
    .object({ efficiency: z.number().gt(0).max(1) })
    .strict()
    .optional(),
  solar: z.object({
    arrayWatts: watts,
    controller: z.enum(["mppt", "pwm"]),
    mpptEfficiency: z.number().gt(0).max(1),
    pwmBatteryVolts: z.number().positive().max(1000),
    pwmPanelVmp: z.number().positive().max(1000),
    losses: z.object({
      soiling: percent,
      shading: percent,
      snow: percent,
      mismatch: percent,
      wiring: percent,
      connections: percent,
      lightInducedDegradation: percent,
      nameplate: percent,
      age: percent,
      availability: percent,
    }),
    // The most sun any place gets is about 8 kWh/m² a day; 12 leaves room for a figure typed for a tracking array.
    sunHours: z.array(z.number().min(0).max(12).nullable()).length(12),
    // Where the sun hours came from, when filled in from Weather and hazards; older plans and clients send none.
    sunHoursSource: z
      .object({
        kind: z.literal("pvgis"),
        attribution: z.string().max(200),
        place: z.string().max(200),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        tilt: z.enum(["optimal", "level"]),
        slope: z.number().min(0).max(90).nullable(),
        firstYear: z.number().int().min(1900).max(2200),
        lastYear: z.number().int().min(1900).max(2200),
        databases: z.string().max(200),
        fetchedAt: z.number().int().nonnegative(),
        filledAt: z.number().int().nonnegative(),
        edited: z.boolean(),
      })
      .strict()
      .nullable()
      .default(null),
  }),
  charger: z.object({ enabled: z.boolean(), name: z.string().trim().max(80), watts, hoursPerDay: hours, startHour: hour }),
  cableRatingA: amps,
});

type Row = typeof powerPlans.$inferSelect;
type System = Omit<PowerPlanInput, "name" | "notes">;

export async function registerPower(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db } = ctx;
  const changed = () => ctx.events.publish({ type: "power.changed" });
  const countPlans = ctx.sqlite.prepare<[], { n: number }>("SELECT count(*) AS n FROM power_plans");
  const deletePlans = ctx.sqlite.prepare("DELETE FROM power_plans");
  const toPlan = (row: Row): PowerPlan => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    ...(row.system as unknown as System),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  const split = ({ name: planName, notes, ...system }: PowerPlanInput) => ({
    name: planName,
    notes,
    system: system as unknown as Record<string, unknown>,
  });

  const service: PowerService = {
    list: () => db.select().from(powerPlans).orderBy(asc(powerPlans.name)).all().map(toPlan),
    get(id) {
      const row = db.select().from(powerPlans).where(eq(powerPlans.id, id)).get();
      if (!row) throw notFound("The power plan");
      return toPlan(row);
    },
    create(input) {
      if (service.kept.count() >= POWER_PLANS_MAX) throw badRequest(`There are already ${POWER_PLANS_MAX} power plans. Delete one first.`);
      const now = Date.now();
      const id = newId();
      db.insert(powerPlans)
        .values({ id, ...split(input), createdAt: now, updatedAt: now })
        .run();
      changed();
      return service.get(id);
    },
    update(id, input, baseUpdatedAt) {
      const current = service.get(id);
      checkBase("plan", current.updatedAt, baseUpdatedAt);
      db.update(powerPlans)
        .set({ ...split(input), updatedAt: nextUpdatedAt(current.updatedAt) })
        .where(eq(powerPlans.id, id))
        .run();
      changed();
      return service.get(id);
    },
    copy(id) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = service.get(id);
      return service.create({ ...input, name: `${input.name} (copy)`.slice(0, 120) });
    },
    remove(id) {
      service.get(id);
      db.delete(powerPlans).where(eq(powerPlans.id, id)).run();
      changed();
    },
    kept: {
      count: () => countPlans.get()!.n,
      eraseAll() {
        const had = service.kept.count();
        deletePlans.run();
        changed();
        return had;
      },
    },
  };
  ctx.services.power = service;
  registerPowerDevices(app, ctx);

  type IdParams = { Params: { id: string } };
  app.get("/api/power/plans", async () => ({ plans: service.list() }));
  app.post("/api/power/plans", async (request) => ({ plan: service.create(planInput.parse(request.body)) }));
  /** A plan file from "Take everything out" (or a bare plan), added as a new plan beside the others. */
  app.post("/api/power/plans/import", async (request) => {
    const { text } = planFileBody.parse(request.body);
    const {
      baseUpdatedAt: _base,
      id: _id,
      createdAt: _created,
      updatedAt: _updated,
      ...plan
    } = (readPlanFile("power", text) ?? {}) as Record<string, unknown>;
    return { plan: service.create(planInput.parse(plan)) };
  });
  app.get<IdParams>("/api/power/plans/:id", async (request) => ({ plan: service.get(request.params.id) }));
  app.put<IdParams>("/api/power/plans/:id", async (request) => {
    const { body, baseUpdatedAt } = withoutBase(request.body);
    return { plan: service.update(request.params.id, planInput.parse(body), baseUpdatedAt) };
  });
  app.post<IdParams>("/api/power/plans/:id/copy", async (request) => ({ plan: service.copy(request.params.id) }));
  app.delete<IdParams>("/api/power/plans/:id", async (request) => {
    service.remove(request.params.id);
    return { ok: true };
  });
}

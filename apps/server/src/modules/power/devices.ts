/**
 * A person's own devices for the battery calculators (Tools → Power and batteries): a
 * name, its figure (watts while on, a battery's watt-hours, or a radio's draw) and a
 * note of where the figure came from, kept so that their own radio or lamp is one press
 * next time. The library of common devices is bundled data in @outpost/shared; these
 * are the person's own, so they are counted and erased with the rest of what they keep,
 * and are in the database a backup copies.
 */
import { OWN_DEVICES_MAX, type OwnDevice, type OwnDeviceInput } from "@outpost/shared";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { powerDevices } from "../../db/schema.ts";

export interface PowerDevicesService {
  list(): OwnDevice[];
  get(id: string): OwnDevice;
  create(input: OwnDeviceInput): OwnDevice;
  update(id: string, input: OwnDeviceInput): OwnDevice;
  remove(id: string): void;
  count(): number;
  eraseAll(): number;
}

declare module "../../core/context.ts" {
  interface Services {
    powerDevices: PowerDevicesService;
  }
}

const watts = z.number().min(0).max(1_000_000).nullable().default(null);

const deviceInput = z
  .object({
    name: z.string().trim().min(1, "Give it a name.").max(120),
    kind: z.enum(["run", "charge", "radio"]),
    supply: z.enum(["dc", "usb", "ac"]),
    watts,
    wattHours: z.number().min(0).max(10_000_000).nullable().default(null),
    receiveW: watts,
    transmitW: watts,
    standbyW: watts,
    note: z.string().max(2000).default(""),
  })
  .strict()
  .superRefine((device, check) => {
    const need = (value: number | null, path: string, message: string) => {
      if (value === null) check.addIssue({ code: "custom", path: [path], message });
    };
    if (device.kind === "run") need(device.watts, "watts", "Give its power in watts.");
    if (device.kind === "charge") need(device.wattHours, "wattHours", "Give its battery's watt-hours.");
    if (device.kind === "radio") {
      need(device.receiveW, "receiveW", "Give the power it draws receiving.");
      need(device.transmitW, "transmitW", "Give the power it draws transmitting.");
    }
  });

type Row = typeof powerDevices.$inferSelect;

const toDevice = (row: Row): OwnDevice => ({
  id: row.id,
  name: row.name,
  kind: row.kind as OwnDevice["kind"],
  supply: row.supply as OwnDevice["supply"],
  watts: row.watts,
  wattHours: row.wattHours,
  receiveW: row.receiveW,
  transmitW: row.transmitW,
  standbyW: row.standbyW,
  note: row.note,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Only the figures that belong to its kind are kept, so a device changed from one kind to another carries nothing over. */
function tidy(input: OwnDeviceInput): OwnDeviceInput {
  return {
    ...input,
    watts: input.kind === "run" ? input.watts : null,
    wattHours: input.kind === "charge" ? input.wattHours : null,
    receiveW: input.kind === "radio" ? input.receiveW : null,
    transmitW: input.kind === "radio" ? input.transmitW : null,
    standbyW: input.kind === "radio" ? input.standbyW : null,
  };
}

export function registerPowerDevices(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;
  const changed = () => ctx.events.publish({ type: "power.changed" });

  const service: PowerDevicesService = {
    list: () => db.select().from(powerDevices).orderBy(asc(powerDevices.name)).all().map(toDevice),
    get(id) {
      const row = db.select().from(powerDevices).where(eq(powerDevices.id, id)).get();
      if (!row) throw notFound("The device");
      return toDevice(row);
    },
    create(input) {
      if (service.count() >= OWN_DEVICES_MAX)
        throw badRequest(`There are already ${OWN_DEVICES_MAX} devices of your own. Remove one first.`);
      const now = Date.now();
      const id = newId();
      db.insert(powerDevices)
        .values({ id, ...tidy(input), createdAt: now, updatedAt: now })
        .run();
      changed();
      return service.get(id);
    },
    update(id, input) {
      service.get(id);
      db.update(powerDevices)
        .set({ ...tidy(input), updatedAt: Date.now() })
        .where(eq(powerDevices.id, id))
        .run();
      changed();
      return service.get(id);
    },
    remove(id) {
      service.get(id);
      db.delete(powerDevices).where(eq(powerDevices.id, id)).run();
      changed();
    },
    count: () => (ctx.sqlite.prepare("SELECT count(*) AS n FROM power_devices").get() as { n: number }).n,
    eraseAll() {
      const had = service.count();
      ctx.sqlite.prepare("DELETE FROM power_devices").run();
      changed();
      return had;
    },
  };
  ctx.services.powerDevices = service;

  type IdParams = { Params: { id: string } };
  app.get("/api/power/devices", async () => ({ devices: service.list() }));
  app.post("/api/power/devices", async (request) => ({ device: service.create(deviceInput.parse(request.body)) }));
  app.put<IdParams>("/api/power/devices/:id", async (request) => ({
    device: service.update(request.params.id, deviceInput.parse(request.body)),
  }));
  app.delete<IdParams>("/api/power/devices/:id", async (request) => {
    service.remove(request.params.id);
    return { ok: true };
  });
}

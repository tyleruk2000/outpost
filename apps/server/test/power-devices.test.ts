/**
 * A person's own devices for the battery calculators are their own data: kept as typed,
 * changed and removed on request, counted where Outpost says what is stored, in the
 * database a backup copies, and erased with everything else. Plans keep where a load's
 * figures came from, and plans from before that read as they did.
 */
import fs from "node:fs";
import path from "node:path";
import { type CleanupResult, newPowerPlan, type OwnDevice, type OwnDeviceInput, type PowerPlanInput } from "@outpost/shared";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

const lamp: OwnDeviceInput = {
  name: "Shed lamp",
  kind: "run",
  supply: "dc",
  watts: 6,
  wattHours: null,
  receiveW: null,
  transmitW: null,
  standbyW: null,
  note: "From its label.",
};

describe("devices of a person's own", () => {
  let device: OwnDevice;

  it("keeps a device as it was typed and gives it back", async () => {
    const created = await app.api("POST", "/api/power/devices", lamp);
    expect(created.status).toBe(200);
    device = created.body.device;
    expect(device).toMatchObject({ name: "Shed lamp", kind: "run", watts: 6, note: "From its label." });
    expect((await app.api("GET", "/api/power/devices")).body.devices).toEqual([device]);
  });

  it("changes a device, keeping only the figures of its kind", async () => {
    const changed = await app.api("PUT", `/api/power/devices/${device.id}`, {
      ...lamp,
      name: "Handheld",
      kind: "radio",
      receiveW: 1.2,
      transmitW: 14,
      standbyW: 0.3,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.device).toMatchObject({ name: "Handheld", kind: "radio", watts: null, receiveW: 1.2, transmitW: 14 });
  });

  it("refuses a device without its figure, saying why", async () => {
    const refused = await app.api("POST", "/api/power/devices", { ...lamp, kind: "charge", watts: 6 });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("watt-hours");
    expect((await app.api("POST", "/api/power/devices", { ...lamp, name: " " })).status).toBe(400);
    expect((await app.api("POST", "/api/power/devices", { ...lamp, colour: "red" })).status).toBe(400);
    expect((await app.api("PUT", "/api/power/devices/nothing-here", lamp)).status).toBe(404);
  });

  it("removes a device", async () => {
    const other = (await app.api("POST", "/api/power/devices", { ...lamp, name: "Spare" })).body.device as OwnDevice;
    expect((await app.api("DELETE", `/api/power/devices/${other.id}`)).status).toBe(200);
    expect((await app.api("GET", "/api/power/devices")).body.devices).toHaveLength(1);
    expect((await app.api("DELETE", `/api/power/devices/${other.id}`)).status).toBe(404);
  });

  it("is counted on the Storage screen and where erasing everything is planned", async () => {
    await app.api("POST", "/api/power/devices", { ...lamp, name: "Power bank", kind: "charge", wattHours: 74 });
    expect(app.ctx.services.powerDevices.count()).toBe(2);
    const planned = await app.api("POST", "/api/manage/plan", { scope: "everything" });
    expect(planned.body.personal.powerDevices).toBe(2);
  });

  it("is in the snapshot of the database that a backup is made of", async () => {
    const snapshot = path.join(app.dir, "snapshot-devices.db");
    await app.ctx.sqlite.backup(snapshot);
    const copy = new Database(snapshot, { readonly: true });
    try {
      expect((copy.prepare("SELECT count(*) AS n FROM power_devices").get() as { n: number }).n).toBe(2);
    } finally {
      copy.close();
      fs.rmSync(snapshot, { force: true });
    }
  });

  it("keeps where a plan's loads came from, and reads a plan from before that as it was", async () => {
    const base = newPowerPlan("From the library");
    const withOrigin: PowerPlanInput = {
      ...base,
      usb: { efficiency: 0.85 },
      loads: [
        {
          id: "pi",
          kind: "device",
          name: "Raspberry Pi 5",
          supply: "usb",
          quantity: 1,
          startHour: 0,
          watts: 4,
          hoursPerDay: 24,
          origin: { library: "common", id: "raspberry-pi-5", name: "Raspberry Pi 5", state: "typical", figures: { watts: 4 } },
        },
        {
          id: "phones",
          kind: "charge",
          name: "Phone",
          supply: "usb",
          quantity: 2,
          startHour: 20,
          wattHours: 13,
          chargesPerDay: 1,
          chargeEfficiency: 0.8,
          chargeHours: 2,
          origin: null,
        },
      ],
    };
    const saved = await app.api("POST", "/api/power/plans", withOrigin);
    expect(saved.status).toBe(200);
    expect(saved.body.plan.loads[0].origin).toEqual(withOrigin.loads[0]!.origin);
    expect(saved.body.plan.usb).toEqual({ efficiency: 0.85 });
    expect(saved.body.plan.loads[1]).toMatchObject({ kind: "charge", wattHours: 13 });

    const older = await app.api("POST", "/api/power/plans", {
      ...base,
      loads: [{ id: "pi", kind: "device", name: "Pi", supply: "dc", quantity: 1, startHour: 0, watts: 15, hoursPerDay: 24 }],
    });
    expect(older.status).toBe(200);
    expect(older.body.plan.loads[0].origin).toBeUndefined();
    expect(older.body.plan.usb).toBeUndefined();

    const bad = { ...withOrigin, loads: [{ ...withOrigin.loads[1]!, chargeEfficiency: 0 }] };
    expect((await app.api("POST", "/api/power/plans", bad)).status).toBe(400);
  });

  it("is erased with everything else", async () => {
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect((job!.result as CleanupResult).personal?.powerDevices).toBe(2);
    expect((await app.api("GET", "/api/power/devices")).body.devices).toEqual([]);
  });
});

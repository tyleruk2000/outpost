/**
 * Plans and readiness per household on a real server: emergency plans, the log of
 * events, routine checks, the offline drill, the garden and power plans each work on the
 * current household, with one household as before and with several.
 */
import {
  type EmergencyPlanInput,
  type EmergencyPlanResponse,
  emergencyNumberFor,
  emptyPlanBody,
  type HouseholdDto,
  newPowerPlan,
  type OfflineDrillResponse,
  ROUTINE_CHECK_TEMPLATE,
} from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterEach(async () => {
  await app?.close();
});

// biome-ignore lint/suspicious/noExplicitAny: answers are checked by the assertions.
const ok = async (method: string, url: string, body?: unknown): Promise<any> => {
  const response = await app.api(method, url, body);
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
};
const place = async (name: string, lat: number, lon: number, icon = "pin"): Promise<string> =>
  (await ok("POST", "/api/maps/markers", { name, lat, lon, icon })).marker.id;
const household = async (body: Record<string, unknown>): Promise<HouseholdDto> => (await ok("POST", "/api/households", body)).household;
const use = (id: string) => ok("PUT", "/api/households/current", { id });
const plan = (name: string, number?: string): Omit<EmergencyPlanInput, "emergencyNumber"> & { emergencyNumber?: string } => ({
  name,
  kind: "other",
  kindText: "",
  templateId: null,
  ...(number ? { emergencyNumber: number } : {}),
  reviewEveryDays: 180,
  body: emptyPlanBody(),
});
const planNames = async () => ((await ok("GET", "/api/emergency-plans")).plans as Array<{ name: string }>).map((each) => each.name);

/** A second household, in Berlin, made current. */
async function berlin(): Promise<HouseholdDto> {
  const flat = await place("Flat", 52.52, 13.4);
  const second = await household({ name: "Berlin flat", homePlaceId: flat });
  await use(second.id);
  return second;
}

describe("emergency plans", () => {
  it("with one household, says nothing of households and takes home's emergency number", async () => {
    await place("Cottage", 51.5, -0.12, "home");
    const made: EmergencyPlanResponse = await ok("POST", "/api/emergency-plans", plan("Power cut"));
    expect(made.plan.emergencyNumber).toBe(emergencyNumberFor("GB"));
    expect(made.household).toEqual({ id: "household", name: "Home", several: false });
    expect(await planNames()).toEqual(["Power cut"]);
  });

  it("lists the current household's, takes its country's number, and says which household a plan is for", async () => {
    await place("Cottage", 51.5, -0.12, "home");
    const home: EmergencyPlanResponse = await ok("POST", "/api/emergency-plans", plan("Power cut"));
    const second = await berlin();
    expect(await planNames()).toEqual([]);
    const there: EmergencyPlanResponse = await ok("POST", "/api/emergency-plans", plan("Stromausfall"));
    expect(there.plan.emergencyNumber).toBe(emergencyNumberFor("DE"));
    expect(there.household).toEqual({ id: second.id, name: "Berlin flat", several: true });
    expect(await planNames()).toEqual(["Stromausfall"]);
    // A plan of another household is still answered by its id, saying whose it is (a copy kept on a phone).
    const other: EmergencyPlanResponse = await ok("GET", `/api/emergency-plans/${home.plan.id}`);
    expect(other.household).toMatchObject({ name: "Home", several: true });
    // A copy goes to the current household.
    await ok("POST", `/api/emergency-plans/${home.plan.id}/copy`);
    expect(await planNames()).toEqual(["Power cut (copy)", "Stromausfall"]);
    await use("household");
    expect(await planNames()).toEqual(["Power cut"]);
    // The chat tool and the drill see the current household's.
    expect(app.ctx.services.emergencyPlans.list().map((each) => each.name)).toEqual(["Power cut"]);
  });
});

describe("the log of events", () => {
  it("keeps each household's entries, and links to its own plan in use", async () => {
    await ok("POST", "/api/event-log", { author: "Sam", text: "Power went off at home" });
    const homePlan: EmergencyPlanResponse = await ok("POST", "/api/emergency-plans", plan("Power cut", "999"));
    await ok("POST", `/api/emergency-plans/${homePlan.plan.id}/start`);
    expect((await ok("GET", "/api/event-log")).planInUse).toMatchObject({ id: homePlan.plan.id });
    const homeLine = (await ok("GET", "/api/event-log")).lines[0];

    await berlin();
    const there = await ok("GET", "/api/event-log");
    expect(there.lines).toEqual([]);
    expect(there.planInUse).toBeNull();
    await ok("POST", "/api/event-log", { author: "Sam", text: "Water off in the flat" });
    expect((await ok("GET", "/api/event-log")).lines.map((line: { text: string }) => line.text)).toEqual(["Water off in the flat"]);
    // Another household's entry is not changed from here.
    expect((await app.api("DELETE", `/api/event-log/${homeLine.id}`)).status).toBe(404);
    // A plan of another household is not linked to.
    expect((await app.api("POST", "/api/event-log", { author: "Sam", text: "x", planId: homePlan.plan.id })).status).toBe(404);

    await use("household");
    expect((await ok("GET", "/api/event-log")).lines.map((line: { text: string }) => line.text)).toEqual(["Power went off at home"]);
    expect(app.ctx.services.readiness.log.count()).toBe(2);
  });
});

describe("routine checks", () => {
  it("gives each household its own checks, the suggested ones too", async () => {
    await ok("POST", "/api/routine-checks/suggested");
    await ok("POST", "/api/routine-checks", { name: "Bleed the radiators", everyDays: 365 });
    expect((await ok("GET", "/api/routine-checks")).checks).toHaveLength(ROUTINE_CHECK_TEMPLATE.length + 1);
    const ownId = (await ok("GET", "/api/routine-checks")).checks.at(-1).id;

    await berlin();
    expect((await ok("GET", "/api/routine-checks")).checks).toEqual([]);
    const added = (await ok("POST", "/api/routine-checks/suggested")).added;
    expect(added).toHaveLength(ROUTINE_CHECK_TEMPLATE.length);
    expect(added[0].position).toBe(0);
    expect((await app.api("POST", `/api/routine-checks/${ownId}/done`, { by: "Sam" })).status).toBe(404);

    await use("household");
    expect((await ok("GET", "/api/routine-checks")).checks).toHaveLength(ROUTINE_CHECK_TEMPLATE.length + 1);
    expect(app.ctx.services.readiness.checks.count()).toBe(ROUTINE_CHECK_TEMPLATE.length * 2 + 1);
  });
});

describe("the offline drill", () => {
  const homeLine = async () => ((await ok("GET", "/api/offline-drill")) as OfflineDrillResponse).lines.find((line) => line.id === "home")!;

  it("reads as before with one household", async () => {
    expect(await homeLine()).toMatchObject({ state: "missing", link: { to: "/maps" } });
    await place("Cottage", 51.5, -0.12, "home");
    expect(await homeLine()).toMatchObject({ state: "held", summary: "Cottage is the home place." });
  });

  it("is checked against the current household's home, fixed or portable", async () => {
    await place("Cottage", 51.5, -0.12, "home");
    await berlin();
    expect(await homeLine()).toMatchObject({ state: "held", summary: "Flat is the home place of Berlin flat." });

    const caravan = await household({ name: "Caravan", kind: "portable" });
    await use(caravan.id);
    expect(await homeLine()).toMatchObject({ state: "missing", link: { to: "/prepare/households" } });
    expect((await homeLine()).summary).toContain("Caravan");
    await ok("PUT", `/api/households/${caravan.id}/here`, { lat: 50.6, lon: -3.4, name: "Campsite", source: "map" });
    expect(await homeLine()).toMatchObject({ state: "held", summary: "Campsite, as of just now." });

    const empty = await household({ name: "Gran's" });
    await use(empty.id);
    expect(await homeLine()).toMatchObject({ state: "missing", summary: expect.stringContaining("Gran's has no home place") });
  });
});

describe("the garden", () => {
  it("keeps each household's sowings and last frost", async () => {
    await ok("PUT", "/api/garden/settings", { lastFrost: "04-20" });
    await ok("POST", "/api/garden/sowings", { cropId: "carrots", sownOn: "2026-04-12" });
    const sowingId = (await ok("GET", "/api/garden")).sowings[0].id;

    await berlin();
    expect(await ok("GET", "/api/garden")).toEqual({ settings: { lastFrost: null, updatedAt: null }, sowings: [] });
    await ok("PUT", "/api/garden/settings", { lastFrost: "05-10" });
    expect((await app.api("DELETE", `/api/garden/sowings/${sowingId}`)).status).toBe(404);

    await use("household");
    const garden = await ok("GET", "/api/garden");
    expect(garden.settings.lastFrost).toBe("04-20");
    expect(garden.sowings).toHaveLength(1);
    expect(app.ctx.services.garden.kept.count()).toEqual({ sowings: 1, settings: 2 });
  });
});

describe("power plans", () => {
  it("are shared unless tied to a household, and a tied one is listed only for it", async () => {
    const shared = (await ok("POST", "/api/power/plans", newPowerPlan("House battery"))).plan;
    expect(shared.householdId).toBeNull();
    const caravan = await household({ name: "Caravan", kind: "portable" });
    const tied = (await ok("POST", "/api/power/plans", { ...newPowerPlan("Leisure battery"), householdId: caravan.id })).plan;
    expect(tied.householdId).toBe(caravan.id);
    const names = async () => ((await ok("GET", "/api/power/plans")).plans as Array<{ name: string }>).map((each) => each.name);
    expect(await names()).toEqual(["House battery"]);
    await use(caravan.id);
    expect(await names()).toEqual(["House battery", "Leisure battery"]);
    // Any plan is still answered by its id (an emergency plan links one).
    await use("household");
    expect((await ok("GET", `/api/power/plans/${tied.id}`)).plan.name).toBe("Leisure battery");

    // A change that names no household keeps the plan's; null shares it.
    const { id, createdAt, updatedAt, householdId, ...input } = tied;
    const kept = (await ok("PUT", `/api/power/plans/${id}`, { ...input, notes: "12 V", baseUpdatedAt: updatedAt })).plan;
    expect(kept.householdId).toBe(caravan.id);
    expect((await ok("PUT", `/api/power/plans/${id}`, { ...input, householdId: null })).plan.householdId).toBeNull();
    expect(await names()).toEqual(["House battery", "Leisure battery"]);
    expect((await app.api("POST", "/api/power/plans", { ...newPowerPlan("Lost"), householdId: "no-such" })).status).toBe(400);
    expect(app.ctx.services.power.listAll()).toHaveLength(2);
    expect(createdAt).toBeGreaterThan(0);
    expect(householdId).toBe(caravan.id);
  });
});

/**
 * Households and people on a real server: the first household made when needed, the
 * current one for the whole Outpost, where each one's home is and what country it takes,
 * a portable household's position, who is in each, and what removing one takes with it.
 */
import type { HouseholdDto, HouseholdsResponse } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
let events: string[];
beforeEach(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
  events = [];
  app.ctx.events.subscribe((event) => {
    if (event.type === "households.changed") events.push(JSON.stringify(event.data ?? {}));
  });
});
afterEach(async () => {
  await app?.close();
});

const ok = async (method: string, url: string, body?: unknown) => {
  const response = await app.api(method, url, body);
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
};
const list = async (): Promise<HouseholdsResponse> => ok("GET", "/api/households");
const place = async (name: string, lat: number, lon: number, icon = "pin"): Promise<string> =>
  (await ok("POST", "/api/maps/markers", { name, lat, lon, icon })).marker.id;
const create = async (body: Record<string, unknown>): Promise<HouseholdDto> => (await ok("POST", "/api/households", body)).household;
const person = async (name: string, extra: Record<string, unknown> = {}) =>
  (await ok("POST", "/api/people", { kind: "person", name, band: "19-64", sex: "female", ...extra })).person;
const storedCount = () => app.ctx.sqlite.prepare("SELECT count(*) FROM households").pluck().get() as number;

describe("the first household", () => {
  it("is there from the start, called Home, and current", async () => {
    const body = await list();
    expect(body.currentId).toBe("household");
    expect(body.households).toHaveLength(1);
    expect(body.households[0]).toMatchObject({ id: "household", name: "Home", kind: "fixed", home: null, country: null, personIds: [] });
  });

  it("is seen but not stored after Erase everything, and stored again by the first change", async () => {
    app.ctx.services.households.kept.eraseAll();
    expect(storedCount()).toBe(0);
    expect((await list()).households.map((h) => h.id)).toEqual(["household"]);
    // A GET never writes.
    expect(storedCount()).toBe(0);
    await ok("PUT", "/api/households/household", { name: "Our house" });
    expect(storedCount()).toBe(1);
    expect((await list()).households[0]!.name).toBe("Our house");
  });

  it("takes the first saved place with the home icon when it has no home of its own", async () => {
    await place("Cottage", 51.5, -0.12, "home");
    await place("Later home", 52.52, 13.4, "home");
    const first = (await list()).households[0]!;
    expect(first.home).toMatchObject({ kind: "place", name: "Cottage", country: "GB", at: null });
    expect(first.country).toBe("GB");
    expect(app.ctx.services.households.country()).toBe("GB");
  });
});

describe("home and country", () => {
  it("is the household's own place while it exists, then none for a household that is not the first", async () => {
    const paris = await place("Flat", 52.52, 13.4);
    const second = await create({ name: "Berlin flat", homePlaceId: paris });
    expect(second.home).toMatchObject({ kind: "place", id: paris, name: "Flat", country: "DE" });
    expect(app.ctx.services.households.home(second.id)?.name).toBe("Flat");
    await ok("DELETE", `/api/maps/markers/${paris}`);
    expect(app.ctx.services.households.home(second.id)).toBeNull();
    expect(app.ctx.services.households.country(second.id)).toBeNull();
  });

  it("falls back for the first household when its own place is removed", async () => {
    const own = await place("Own", 52.52, 13.4);
    await ok("PUT", "/api/households/household", { homePlaceId: own });
    await place("Home icon", 51.5, -0.12, "home");
    expect(app.ctx.services.households.home()?.name).toBe("Own");
    await ok("DELETE", `/api/maps/markers/${own}`);
    expect(app.ctx.services.households.home()?.name).toBe("Home icon");
  });

  it("takes a country the person chose over the one home is in", async () => {
    await place("Cottage", 51.5, -0.12, "home");
    const changed = (await ok("PUT", "/api/households/household", { countryOverride: "ie" })).household;
    expect(changed).toMatchObject({ countryOverride: "IE", country: "IE" });
    expect(changed.home.country).toBe("GB");
    expect((await app.api("PUT", "/api/households/household", { countryOverride: "Ireland" })).status).toBe(400);
  });

  it("refuses a home that is not a saved place", async () => {
    expect((await app.api("POST", "/api/households", { name: "Nowhere", homePlaceId: "no-such" })).status).toBe(400);
  });

  it("gives the energy table of Supplies from the current household's country", async () => {
    const paris = await place("Flat", 52.52, 13.4);
    await place("Cottage", 51.5, -0.12, "home");
    expect((await ok("GET", "/api/supplies")).household.energyBasis).toEqual({ table: "uk", country: "GB" });
    const second = await create({ name: "Berlin flat", homePlaceId: paris });
    await ok("PUT", "/api/households/current", { id: second.id });
    expect((await ok("GET", "/api/supplies")).household.energyBasis).toEqual({ table: "international", country: "DE" });
  });
});

describe("a portable household", () => {
  it("has no home until a person says where it is, then that position with when it was set", async () => {
    const caravan = await create({ name: "Caravan", kind: "portable" });
    expect(caravan.home).toBeNull();
    const before = Date.now();
    const moved = (await ok("PUT", `/api/households/${caravan.id}/here`, { lat: 54.45, lon: -3.21, source: "device" })).household;
    expect(moved.home).toMatchObject({ kind: "here", id: null, name: "Where Caravan is now", country: "GB", source: "device" });
    expect(moved.home.at).toBeGreaterThanOrEqual(before);
    const named = (await ok("PUT", `/api/households/${caravan.id}/here`, { lat: 52.52, lon: 13.4, name: "Camp site", source: "map" }))
      .household;
    expect(named.home).toMatchObject({ name: "Camp site", country: "DE", source: "map" });
    const { positions } = await ok("GET", `/api/households/${caravan.id}/positions`);
    expect(positions.map((p: { name: string | null }) => p.name)).toEqual(["Camp site", null]);
  });

  it("keeps the last 50 positions", async () => {
    const caravan = await create({ name: "Caravan", kind: "portable" });
    for (let i = 0; i < 53; i++) app.ctx.services.households.setHere(caravan.id, { lat: 50 + i / 100, lon: 0, source: "map" });
    expect((await ok("GET", `/api/households/${caravan.id}/positions`)).positions).toHaveLength(50);
  });

  it("refuses a position for a fixed household, and keeps both when the kind changes", async () => {
    const shed = await place("Shed", 51.5, -0.12);
    const van = await create({ name: "Van", kind: "fixed", homePlaceId: shed });
    expect((await app.api("PUT", `/api/households/${van.id}/here`, { lat: 1, lon: 1, source: "map" })).status).toBe(400);
    await ok("PUT", `/api/households/${van.id}`, { kind: "portable", basePlaceId: shed });
    await ok("PUT", `/api/households/${van.id}/here`, { lat: 52.52, lon: 13.4, source: "place" });
    const back = (await ok("PUT", `/api/households/${van.id}`, { kind: "fixed" })).household;
    expect(back).toMatchObject({ kind: "fixed", homePlaceId: shed, basePlaceId: shed, here: { lat: 52.52, lon: 13.4 } });
    expect(back.home).toMatchObject({ kind: "place", name: "Shed" });
  });
});

describe("the current household", () => {
  it("is one for the whole Outpost, says so on the live events, and falls back to the first when removed", async () => {
    const second = await create({ name: "Mum's" });
    events.length = 0;
    expect((await ok("PUT", "/api/households/current", { id: second.id })).currentId).toBe(second.id);
    expect(events).toEqual([JSON.stringify({ currentChanged: true })]);
    expect(app.ctx.services.households.current().name).toBe("Mum's");
    expect((await app.api("PUT", "/api/households/current", { id: "nope" })).status).toBe(404);
    await ok("DELETE", `/api/households/${second.id}?confirm=true`);
    expect((await list()).currentId).toBe("household");
  });
});

describe("people", () => {
  it("adds a person to the current household, and puts them in several", async () => {
    const ann = await person("Ann");
    expect(ann.householdIds).toEqual(["household"]);
    const second = await create({ name: "Second", copyPeopleFrom: "household" });
    expect(second.personIds).toEqual([ann.id]);
    const bob = await person("Bob", { householdIds: [second.id] });
    const reordered = (await ok("PUT", `/api/households/${second.id}/people`, { personIds: [bob.id, ann.id] })).household;
    expect(reordered.personIds).toEqual([bob.id, ann.id]);
    expect((await ok("GET", `/api/people/${ann.id}`)).person.householdIds).toEqual(["household", second.id]);
    expect((await app.api("PUT", `/api/households/${second.id}/people`, { personIds: ["ghost"] })).status).toBe(400);
    expect((await app.api("PUT", `/api/households/${second.id}/people`, { personIds: [bob.id, bob.id] })).status).toBe(400);
  });

  it("asks before removing someone with a medical sheet, and keeps the sheet", async () => {
    const ann = await person("Ann");
    await ok("PUT", `/api/people/${ann.id}`, { kind: "person", name: "Ann B", band: "19-64", sex: "female" });
    expect((await ok("GET", "/api/people")).people.map((p: { name: string }) => p.name)).toEqual(["Ann B"]);
    app.ctx.sqlite
      .prepare("INSERT INTO medical_sheets (id, member_id, name, record, created_at, updated_at) VALUES ('s1', ?, 'Ann', '{}', 1, 1)")
      .run(ann.id);
    const refused = await app.api("DELETE", `/api/people/${ann.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toMatchObject({ medicalSheets: 1, householdIds: ["household"] });
    await ok("DELETE", `/api/people/${ann.id}?confirm=true`);
    expect(app.ctx.sqlite.prepare("SELECT member_id, household_id FROM medical_sheets WHERE id = 's1'").get()).toEqual({
      member_id: null,
      household_id: "household",
    });
    expect((await ok("GET", "/api/people")).people).toEqual([]);
  });

  it("keeps Supplies' household screen working: its people are the current household's", async () => {
    const household = {
      daysWanted: 3,
      drinkingLitres: 2,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [
        { kind: "person", name: "Ann", band: "19-64", sex: "female" },
        { kind: "pet", name: "Rex", kcalPerDay: 800 },
      ],
    };
    const saved = (await ok("PUT", "/api/supplies/household", household)).household;
    const ids = saved.members.map((m: { id: string }) => m.id);
    expect((await list()).households[0]!.personIds).toEqual(ids);
    // Ann is also in a second household; taken out of the first she stays on the People list.
    const second = await create({ name: "Second" });
    await ok("PUT", `/api/households/${second.id}/people`, { personIds: [ids[0]] });
    await ok("PUT", "/api/supplies/household", { ...household, members: [saved.members[1]] });
    const people = (await ok("GET", "/api/people")).people;
    expect(people.map((p: { name: string; householdIds: string[] }) => [p.name, p.householdIds])).toEqual([
      ["Ann", [second.id]],
      ["Rex", ["household"]],
    ]);
    expect((await ok("GET", "/api/supplies")).household.members.map((m: { name: string }) => m.name)).toEqual(["Rex"]);
    // Rex, in no other household, goes from the People list when taken out here.
    await ok("PUT", "/api/supplies/household", { ...household, members: [] });
    expect((await ok("GET", "/api/people")).people.map((p: { name: string }) => p.name)).toEqual(["Ann"]);
  });
});

describe("removing a household", () => {
  it("refuses the last one", async () => {
    const refused = await app.api("DELETE", "/api/households/household?confirm=true");
    expect(refused.status).toBe(409);
  });

  it("says what it holds first, then removes its things but no person and no person's sheet", async () => {
    const ann = await person("Ann");
    const second = await create({ name: "Second", copyPeopleFrom: "household" });
    const only = await person("Only here", { householdIds: [second.id] });
    const db = app.ctx.sqlite;
    db.prepare(
      "INSERT INTO supply_items (id, household_id, name, category, quantity, created_at, updated_at) VALUES ('i1', ?, 'Rice', 'food', 1, 1, 1), ('i2', 'household', 'Beans', 'food', 1, 1, 1)",
    ).run(second.id);
    db.prepare(
      "INSERT INTO emergency_plans (id, household_id, name, kind, body, use, reviewed_at, created_at, updated_at) VALUES ('p1', ?, 'Flood', 'flood', '{}', '{}', 1, 1, 1)",
    ).run(second.id);
    db.prepare("INSERT INTO comms_plans (id, body, updated_at) VALUES (?, '{}', 1)").run(second.id);
    db.prepare(
      "INSERT INTO medical_sheets (id, member_id, household_id, name, record, created_at, updated_at) VALUES ('unlinked', NULL, ?, 'Visitor', '{}', 1, 1), ('theirs', ?, NULL, 'Only', '{}', 1, 1)",
    ).run(second.id, only.id);

    const refused = await app.api("DELETE", `/api/households/${second.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.holds).toMatchObject({
      supplies: 1,
      emergencyPlans: 1,
      papers: 1,
      medicalSheets: 1,
      people: 2,
      peopleOnlyHere: 1,
      theirMedicalSheets: 1,
    });
    expect(storedCount()).toBe(2);

    const after = await ok("DELETE", `/api/households/${second.id}?confirm=true`);
    expect(after.households.map((h: HouseholdDto) => h.id)).toEqual(["household"]);
    expect(db.prepare("SELECT id FROM supply_items").pluck().all()).toEqual(["i2"]);
    expect(db.prepare("SELECT count(*) FROM emergency_plans").pluck().get()).toBe(0);
    expect(db.prepare("SELECT count(*) FROM comms_plans").pluck().get()).toBe(0);
    expect(db.prepare("SELECT id FROM medical_sheets").pluck().all()).toEqual(["theirs"]);
    const people = (await ok("GET", "/api/people")).people;
    expect(people.map((p: { id: string; householdIds: string[] }) => [p.id, p.householdIds])).toEqual([
      [ann.id, ["household"]],
      [only.id, []],
    ]);
  });
});

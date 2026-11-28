/**
 * Each household's papers on a real server: medical sheets that stay with their person (one
 * sheet in both households of someone in two), a plan for keeping in touch, a book and a
 * binder record for each household, and the book read round a portable household's
 * position. With one household everything is as it was.
 */
import type {
  BinderStatus,
  BookFacts,
  BookResponse,
  CommsResponse,
  HouseholdDto,
  HouseholdResponse,
  MedicalSheet,
  MedicalSheetsResponse,
  PersonResponse,
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

const ok = async <T = unknown>(method: string, url: string, body?: unknown): Promise<T> => {
  const response = await app.api(method, url, body);
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body as T;
};
const person = async (name: string, householdIds?: string[]) =>
  (
    await ok<PersonResponse>("POST", "/api/people", {
      kind: "person",
      name,
      band: "19-64",
      sex: "female",
      ...(householdIds ? { householdIds } : {}),
    })
  ).person.id;
const household = async (body: Record<string, unknown>): Promise<HouseholdDto> =>
  (await ok<HouseholdResponse>("POST", "/api/households", body)).household;
const use = (id: string) => ok("PUT", "/api/households/current", { id });
const sheet = async (name: string, memberId: string | null) =>
  (await ok<{ sheet: MedicalSheet }>("POST", "/api/medical-sheets", { name, memberId, record: { bloodGroup: "O+" } })).sheet.id;
const names = async () => (await ok<MedicalSheetsResponse>("GET", "/api/medical-sheets")).sheets.map((each) => each.name).sort();
const comms = (notes: string, baseUpdatedAt?: number | null) =>
  ok<CommsResponse>("PUT", "/api/keeping-in-touch", { notes, ...(baseUpdatedAt === undefined ? {} : { baseUpdatedAt }) });

describe("one household", () => {
  it("keeps every paper under the household's id, as before, and says there is only one", async () => {
    const ana = await person("Ana");
    await sheet("Ana", ana);
    await sheet("Visitor", null);
    const body = await ok<MedicalSheetsResponse>("GET", "/api/medical-sheets");
    expect(body.sheets.map((each) => each.name)).toEqual(["Ana", "Visitor"]);
    expect(body.household).toEqual({ id: "household", name: "Home", several: false });
    await comms("Ring at six");
    await ok("PUT", "/api/household-book", { householdName: "The Rowans" });
    await ok("POST", "/api/household-binder/made", { parts: ["plans"], contentAt: 1, pages: 2 });
    const ids = (table: string) => app.ctx.sqlite.prepare(`SELECT id FROM ${table}`).pluck().all();
    expect(ids("comms_plans")).toEqual(["household"]);
    expect(ids("household_book")).toEqual(["household"]);
    expect(ids("household_binder")).toEqual(["household"]);
    // A person's sheet goes with the person; one for nobody in particular is kept with the household.
    expect(app.ctx.sqlite.prepare("SELECT name, household_id AS h FROM medical_sheets ORDER BY name").all()).toEqual([
      { name: "Ana", h: null },
      { name: "Visitor", h: "household" },
    ]);
  });
});

describe("several households", () => {
  it("lists a household's people's sheets and its own, with a person in two households in both", async () => {
    const ana = await person("Ana");
    const ben = await person("Ben");
    const family = await household({ name: "Family" });
    const cat = await person("Cat", [family.id]);
    await ok("PUT", `/api/households/${family.id}/people`, { personIds: [ana, cat] });
    await sheet("Ana", ana);
    await sheet("Ben", ben);
    await sheet("Lodger", null);
    await use(family.id);
    await sheet("Cat", cat);
    await sheet("Neighbour", null);

    expect(await names()).toEqual(["Ana", "Cat", "Neighbour"]);
    const body = await ok<MedicalSheetsResponse>("GET", "/api/medical-sheets");
    expect(body.household).toEqual({ id: family.id, name: "Family", several: true });
    await use("household");
    expect(await names()).toEqual(["Ana", "Ben", "Lodger"]);
    // One sheet for Ana, not one in each household.
    expect(app.ctx.sqlite.prepare("SELECT count(*) FROM medical_sheets WHERE member_id = ?").pluck().get(ana)).toBe(1);
    // The model's tools read the current household's, as the screen does; search holds every plain sheet.
    expect(app.ctx.services.householdPapers.medical.list().map((each) => each.name)).toEqual(["Ana", "Ben", "Lodger"]);
    expect(app.ctx.services.householdPapers.medical.listAll()).toHaveLength(5);
    // A phone bringing its copy of the family's sheets up to date asks for that household by name, whichever is current.
    const theirs = await ok<MedicalSheetsResponse>("GET", `/api/medical-sheets?household=${family.id}`);
    expect(theirs.sheets.map((each) => each.name).sort()).toEqual(["Ana", "Cat", "Neighbour"]);
    expect(theirs.household).toEqual({ id: family.id, name: "Family", several: true });
    expect((await app.api("GET", "/api/medical-sheets?household=gone")).status).toBe(404);
  });

  it("keeps a sheet whose person left every household where it was kept, and the sheets of someone removed with their household", async () => {
    const ana = await person("Ana");
    const family = await household({ name: "Family" });
    await sheet("Ana", ana);
    // Taken out of every household, Ana is still on the People list: her sheet stays in this household.
    await ok("PUT", "/api/households/household/people", { personIds: [] });
    expect(await names()).toEqual(["Ana"]);
    await use(family.id);
    expect(await names()).toEqual([]);
    // Put in Family, her sheet goes with her.
    await ok("PUT", `/api/households/${family.id}/people`, { personIds: [ana] });
    expect(await names()).toEqual(["Ana"]);
    await use("household");
    expect(await names()).toEqual([]);
  });

  it("keeps a plan for keeping in touch, a book and a binder record for each household", async () => {
    const family = await household({ name: "Family" });
    const home = await comms("Ring at six");
    await ok("PUT", "/api/household-book", { householdName: "The Rowans", days: 7 });
    await ok("POST", "/api/household-binder/made", { parts: ["plans"], contentAt: 1, pages: 2 });

    await use(family.id);
    const fresh = await ok<CommsResponse>("GET", "/api/keeping-in-touch");
    expect(fresh.plan.updatedAt).toBeNull();
    expect(fresh.plan.notes).toBe("");
    // A plan read before it was ever saved in this household saves, whatever the other household holds.
    await comms("Meet at the church", null);
    expect((await ok<BookResponse>("GET", "/api/household-book")).answers.householdName).toBe("");
    expect((await ok<BinderStatus>("GET", "/api/household-binder")).made).toBeNull();
    await ok("PUT", "/api/household-book", { householdName: "Gran's", days: 3 });

    await use("household");
    expect((await ok<CommsResponse>("GET", "/api/keeping-in-touch")).plan).toMatchObject({
      notes: "Ring at six",
      updatedAt: home.plan.updatedAt,
    });
    expect((await ok<BookResponse>("GET", "/api/household-book")).answers).toMatchObject({ householdName: "The Rowans", days: 7 });
    expect((await ok<BinderStatus>("GET", "/api/household-binder")).made?.pages).toBe(2);
    expect(app.ctx.sqlite.prepare("SELECT id FROM comms_plans ORDER BY id = 'household' DESC").pluck().all()).toEqual([
      "household",
      family.id,
    ]);
    // Counted and erased in every household.
    expect(app.ctx.services.householdPapers.kept.count()).toBe(5);
    app.ctx.services.householdPapers.kept.eraseAll();
    expect(app.ctx.services.householdPapers.kept.count()).toBe(0);
  });

  it("says one household's book is out of date for its own sheets, not another's", async () => {
    const ana = await person("Ana");
    const family = await household({ name: "Family" });
    await ok("POST", "/api/household-book/made", { pages: 10, sections: ["people"], summary: {} });
    await use(family.id);
    await ok("POST", "/api/household-book/made", { pages: 10, sections: ["people"], summary: {} });
    await use("household");
    await sheet("Ana", ana);
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toContain("medical");
    await use(family.id);
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).not.toContain("medical");
  });

  it("removes a household's own papers and unlinked sheets with it, and keeps its people's sheets", async () => {
    const ana = await person("Ana");
    const family = await household({ name: "Family", copyPeopleFrom: "household" });
    await use(family.id);
    await sheet("Ana", ana);
    await sheet("Neighbour", null);
    await comms("Family plan");
    await ok("DELETE", `/api/households/${family.id}?confirm=true`);
    expect(await names()).toEqual(["Ana"]);
    expect(app.ctx.sqlite.prepare("SELECT id FROM comms_plans").pluck().all()).toEqual([]);
  });

  it("reads the book round a portable household's position, saying when it was set", async () => {
    await ok("POST", "/api/maps/markers", { name: "Cottage", lat: 51.5, lon: -1, icon: "home" });
    const van = await household({ name: "The van", kind: "portable" });
    await use(van.id);
    expect((await ok<BookFacts>("GET", "/api/household-book/facts")).home).toBeNull();
    const before = Date.now();
    await ok("PUT", `/api/households/${van.id}/here`, { lat: 56.8, lon: -5.1, source: "map" });
    const facts = await ok<BookFacts>("GET", "/api/household-book/facts");
    expect(facts.home).toMatchObject({ kind: "here", name: "Where The van is now", lat: 56.8, lon: -5.1, country: "GB" });
    expect(facts.home!.at).toBeGreaterThanOrEqual(before);
    await use("household");
    expect((await ok<BookFacts>("GET", "/api/household-book/facts")).home).toMatchObject({ kind: "place", name: "Cottage", at: null });
  });
});

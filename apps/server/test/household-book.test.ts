/**
 * The household book: the wizard's answers kept as a draft (refused over a newer copy),
 * the record of the last book made with its summary, and what the book reads round home
 * from what is held: the nearest help and the places to keep away from in the reference
 * layers, the climate kept for home with the wind's direction, and each journey's straight
 * line with a stop for each day's walking. Nothing reaches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import {
  type BookFacts,
  type BookResponse,
  bookChanges,
  DEFAULT_BOOK_ANSWERS,
  type EmergencyPlanResponse,
  emptyPlanBody,
  walkLine,
  withinDegrees,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { weatherCache, weatherPlaces } from "../src/db/schema.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

async function ok<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await app.api<T>(method, url, body);
  if (response.status !== 200) throw new Error(`${method} ${url}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body;
}

describe("walking a straight line", () => {
  it("takes Tobler's 5 km/h on level ground and ends each day where the hours run out", () => {
    // 30 km of level ground, sampled every kilometre.
    const level = walkLine(Array(31).fill(100), 1000, 1, 3);
    expect(level.hours).toBeCloseTo(30 / (6 * Math.exp(-3.5 * 0.05)), 6);
    expect(level.stopsAt).toHaveLength(1);
    expect(level.stopsAt[0]).toBeCloseTo(3 * 6 * Math.exp(-3.5 * 0.05) * 1000, 0);
  });

  it("is slower uphill, slower again at half the pace, and has no stop at the very end", () => {
    const climb = Array.from({ length: 11 }, (_, index) => index * 100);
    expect(walkLine(climb, 1000, 1, 8).hours).toBeGreaterThan(walkLine(Array(11).fill(0), 1000, 1, 8).hours);
    const half = walkLine(Array(11).fill(0), 1000, 0.5, 8);
    expect(half.hours).toBeCloseTo(2 * walkLine(Array(11).fill(0), 1000, 1, 8).hours, 6);
    // Exactly two days of walking: one stop, not two.
    const twoDays = walkLine(Array(11).fill(0), 1000, 1, walkLine(Array(11).fill(0), 1000, 1, 8).hours / 2);
    expect(twoDays.stopsAt).toHaveLength(1);
  });
});

describe("what changed since the last book", () => {
  it("lists the lines added and taken out of each section both books have", () => {
    expect(bookChanges(null, { people: ["Ana"] })).toEqual([]);
    expect(
      bookChanges({ people: ["Ana", "Sam"], water: ["9 litres"], notes: ["2 pages"] }, { people: ["Ana", "Kit"], water: ["9 litres"] }),
    ).toEqual([{ section: "people", added: ["Kit"], removed: ["Sam"] }]);
  });

  it("knows a site upwind of home from the wind's direction", () => {
    expect(withinDegrees(250, 246)).toBe(true);
    expect(withinDegrees(10, 350)).toBe(true);
    expect(withinDegrees(66, 246)).toBe(false);
  });
});

describe("the book's answers", () => {
  it("are the defaults before they are saved, and are kept as a draft", async () => {
    const first = await ok<BookResponse>("GET", "/api/household-book");
    expect(first).toMatchObject({ answers: DEFAULT_BOOK_ANSWERS, answersAt: null, made: null, stale: [] });
    expect(Object.keys(first.fingerprints).sort()).toEqual(["answers", "comms", "contacts", "medical", "places", "plans", "supplies"]);
    const saved = await ok<BookResponse>("PUT", "/api/household-book", {
      ...DEFAULT_BOOK_ANSWERS,
      householdName: "The Rowans",
      days: 7,
      vehicles: [{ id: "v1", name: "The van", rangeKm: 600, seats: 3, note: "" }],
      baseAnswersAt: null,
    });
    expect(saved.answers.householdName).toBe("The Rowans");
    expect(saved.answers.vehicles[0]).toMatchObject({ name: "The van", rangeKm: 600 });
    expect(saved.answersAt).toBeGreaterThan(0);

    // Saved over a copy older than the one kept: refused, and nothing is lost.
    const stale = await app.api("PUT", "/api/household-book", { ...saved.answers, days: 2, baseAnswersAt: saved.answersAt! - 1 });
    expect(stale.status).toBe(409);
    expect((await ok<BookResponse>("GET", "/api/household-book")).answers.days).toBe(7);
  });

  it("refuses what makes no sense, saying what to do", async () => {
    const bad = await app.api("PUT", "/api/household-book", { ...DEFAULT_BOOK_ANSWERS, emergencyNumber: "call mum" });
    expect(bad.status).toBe(400);
    const unnamed = await app.api("PUT", "/api/household-book", {
      ...DEFAULT_BOOK_ANSWERS,
      destinations: [{ id: "d1", name: " ", markerId: null, contactId: null, note: "" }],
    });
    expect(unnamed.status).toBe(400);
  });

  it("records the book made with its summary, and is counted and erased with the household's papers", async () => {
    const made = await ok<BookResponse>("POST", "/api/household-book/made", {
      pages: 40,
      sections: ["people", "water"],
      summary: { people: ["Ana"], water: ["21 litres for 7 days"] },
    });
    expect(made.made).toMatchObject({ pages: 40, summary: { people: ["Ana"] } });
    expect(made.answers.householdName).toBe("The Rowans");
    expect(made.stale).toEqual([]);
    expect(app.ctx.services.householdPapers.book.count()).toBe(1);
  });

  it("says what changed since the book was made, a deletion included", async () => {
    const marker = await ok<{ marker: { id: string } }>("POST", "/api/maps/markers", { name: "Shed", lat: 54, lon: -2 });
    const before = await ok<BookResponse>("GET", "/api/household-book");
    expect(before.stale).toContain("places");
    await ok("POST", "/api/household-book/made", { pages: 41, sections: ["people"], summary: {}, fingerprints: before.fingerprints });
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toEqual([]);
    await ok("DELETE", `/api/maps/markers/${marker.marker.id}`);
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toEqual(["places"]);
    const saved = await ok<BookResponse>("GET", "/api/household-book");
    await ok("PUT", "/api/household-book", { ...saved.answers, days: 5, baseAnswersAt: saved.answersAt });
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toEqual(["answers", "places"]);
  });

  it("says the book is older than the plans when a plan is added, changed or deleted", async () => {
    const madeNow = async () => {
      const now = await ok<BookResponse>("GET", "/api/household-book");
      await ok("POST", "/api/household-book/made", { pages: 41, sections: ["situations"], summary: {}, fingerprints: now.fingerprints });
      expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toEqual([]);
    };
    const plan = {
      name: "Street party",
      kind: "other",
      kindText: "",
      templateId: null,
      emergencyNumber: "999",
      reviewEveryDays: 180,
      body: emptyPlanBody(),
    };
    await madeNow();
    const added = await ok<EmergencyPlanResponse>("POST", "/api/emergency-plans", plan);
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toEqual(["plans"]);
    await madeNow();
    await ok("PUT", `/api/emergency-plans/${added.plan.id}`, { ...plan, name: "Street party, changed" });
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toEqual(["plans"]);
    await madeNow();
    await ok("DELETE", `/api/emergency-plans/${added.plan.id}`);
    expect((await ok<BookResponse>("GET", "/api/household-book")).stale).toEqual(["plans"]);
  });

  it("keeps which plans go in the book", async () => {
    const saved = await ok<BookResponse>("GET", "/api/household-book");
    expect(saved.answers.planChoice).toBe("all");
    const some = await ok<BookResponse>("PUT", "/api/household-book", {
      ...saved.answers,
      planChoice: "some",
      planIds: ["p1"],
      baseAnswersAt: saved.answersAt,
    });
    expect(some.answers).toMatchObject({ planChoice: "some", planIds: ["p1"] });
    expect((await app.api("PUT", "/api/household-book", { ...some.answers, planChoice: "most" })).status).toBe(400);
  });
});

describe("what the book reads round home", () => {
  it("says there is no home until one is marked", async () => {
    const facts = await ok<BookFacts>("GET", "/api/household-book/facts");
    expect(facts.home).toBeNull();
  });

  it("finds the nearest help, the places to keep away from, the wind kept for home and the journey with its stops", async () => {
    const home = (await ok<{ marker: { id: string } }>("POST", "/api/maps/markers", { name: "Home", lat: 51.5, lon: -1, icon: "home" }))
      .marker;
    const gran = (await ok<{ marker: { id: string } }>("POST", "/api/maps/markers", { name: "Gran's", lat: 51.5, lon: -1.6 })).marker;

    const location = app.ctx.services.storage.getDefault();
    const root = app.ctx.services.storage.resolve(location.id, "");
    fs.mkdirSync(path.join(root, "imports"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "imports/near-home.csv"),
      [
        "name,lat,lon,layer,kind,country,provenance,publisher,license,accuracy",
        "Town Hospital,51.52,-1,hospitals,amenity=hospital,GB,public-record,Example,ODbL,To the building",
        "Far Hospital,52.3,-1,hospitals,amenity=hospital,GB,public-record,Example,ODbL,To the building",
        "Old Reactor,51.5,-1.2,nuclear,wikidata:nuclear-power-plant,GB,public-record,Example,CC0,To the site",
        "Midway,51.5,-1.3,towns,ne:populated-place,GB,public-record,Example,Public domain,To the place",
      ].join("\n"),
    );
    const started = await app.api("POST", "/api/reference/imports/from-storage", {
      format: "features-csv",
      locationId: location.id,
      relPath: "imports/near-home.csv",
      title: "Near home",
      options: {},
    });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();

    // The climate kept for home, as NASA POWER gives it, with the wind's direction.
    const placeId = "wp-home";
    app.ctx.db
      .insert(weatherPlaces)
      .values({
        id: placeId,
        markerId: home.id,
        name: "Home",
        lat: 51.5,
        lon: -1,
        region: null,
        position: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    const month = { meanC: 5, precipMmPerDay: 2, precipMmMonth: 60, windMs: 5, windFromDeg: 240, sunKwhLevel: 1 };
    app.ctx.db
      .insert(weatherCache)
      .values({
        id: "wc-climate",
        kind: "climate",
        source: "nasa-power",
        placeId,
        fetchedAt: Date.parse("2026-11-01T00:00:00Z"),
        validFrom: null,
        validUntil: null,
        bytes: 100,
        sent: "test",
        data: { service: "NASA POWER", period: "2001 to 2025", months: Array(12).fill(month), windFromDeg: 246 },
      })
      .run();

    const current = await ok<BookResponse>("GET", "/api/household-book");
    await ok<BookResponse>("PUT", "/api/household-book", {
      ...current.answers,
      walkHoursPerDay: 6,
      destinations: [
        { id: "d1", name: "Gran's", markerId: gran.id, contactId: null, note: "" },
        { id: "d2", name: "Nowhere", markerId: null, contactId: null, note: "" },
      ],
      baseAnswersAt: current.answersAt,
    });

    const facts = await ok<BookFacts>("GET", "/api/household-book/facts");
    expect(facts.home).toMatchObject({ name: "Home", lat: 51.5, lon: -1 });

    const hospitals = facts.help.find((group) => group.id === "hospitals")!;
    expect(hospitals.held).toBe(true);
    // The far one is listed too (within 100 km), nearest first.
    expect(hospitals.places.map((place) => place.name)).toEqual(["Town Hospital", "Far Hospital"]);
    expect(hospitals.places[0]!.bearingDegrees).toBe(0);
    // A layer that holds nothing is said to be not held, so the book can say how to get it.
    expect(facts.help.find((group) => group.id === "pharmacies")!.held).toBe(false);
    expect(facts.floodZones).toBeNull();

    const nuclear = facts.keepAway.find((group) => group.id === "nuclear")!;
    expect(nuclear.places[0]).toMatchObject({ name: "Old Reactor" });
    expect(Math.round(nuclear.places[0]!.bearingDegrees)).toBeGreaterThan(260);
    expect(facts.climate?.wind?.fromDegrees).toBe(246);

    // About 41.6 km due west, all level as far as Outpost knows (no terrain here): just under 9 hours at Tobler's pace.
    const journey = facts.journeys[0]!;
    expect(journey.name).toBe("Gran's");
    expect(journey.distanceMeters / 1000).toBeCloseTo(41.6, 0);
    expect(Math.round(journey.bearingDegrees)).toBe(270);
    expect(journey.ground).toBeNull();
    const fit = journey.walks.find((walk) => walk.pace === "standard")!;
    expect(fit.days).toBe(2);
    expect(fit.stops).toHaveLength(1);
    expect(fit.stops[0]!.near).toBe("Midway");
    const slow = journey.walks.find((walk) => walk.pace === "slowest")!;
    expect(slow.hours).toBeCloseTo(fit.hours * 2, 6);
    expect(journey.towns.map((town) => town.name)).toContain("Midway");
    expect(facts.notMeasured).toEqual([{ destinationId: "d2", name: "Nowhere", why: expect.stringMatching(/No saved place/) }]);
  });
});

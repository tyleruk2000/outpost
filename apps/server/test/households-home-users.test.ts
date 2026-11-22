/**
 * The features that work from home follow the current household's home on a real server:
 * weather's national warnings and its Home badge, and the chat tools' "home", with one
 * household (as before), several, and a portable one; the mesh root topic and the
 * allotment stay with the first household. Nothing here reaches the internet.
 */
import type { HouseholdDto } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterEach(async () => {
  await app?.close();
});

const ok = async (method: string, url: string, body?: unknown) => {
  const response = await app.api(method, url, body);
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
};
const place = async (name: string, lat: number, lon: number, icon = "pin"): Promise<string> =>
  (await ok("POST", "/api/maps/markers", { name, lat, lon, icon })).marker.id;
const create = async (body: Record<string, unknown>): Promise<HouseholdDto> => (await ok("POST", "/api/households", body)).household;
const makeCurrent = (id: string) => ok("PUT", "/api/households/current", { id });
const alerts = async () => (await ok("GET", "/api/weather")).alerts;
const tool = (name: string, args: unknown) => app.ctx.services.tools.call(name, args, { signal: new AbortController().signal });
const meshRoot = async () => (await ok("GET", "/api/mesh")).meshtastic.config.client.rootTopic as string;
const hemisphere = async () => (await ok("GET", "/api/games/allotment")).hemisphere as string;

describe("one household", () => {
  it("works from the saved place with the home icon, as before", async () => {
    const id = await place("Cottage", 51.5, -0.12, "home");
    expect(await alerts()).toMatchObject({
      home: { name: "Cottage", lat: 51.5, lon: -0.12, at: null },
      homeCountry: "GB",
    });
    expect((await alerts()).household).toBeUndefined();
    await ok("POST", "/api/weather/places", { markerId: id });
    expect((await ok("GET", "/api/weather")).places).toMatchObject([{ name: "Cottage", isHome: true }]);
    const sun = await tool("sun_and_compass", {});
    expect(sun.text).toContain("At Cottage (the saved place with the home icon)");
    expect((await tool("radio_frequencies", {})).text).toContain("United Kingdom, where the home place is");
  });

  it("says how to mark home when there is none", async () => {
    expect((await alerts()).home).toBeNull();
    const sun = await tool("sun_and_compass", {});
    expect(sun.text).toContain("No saved place has the home icon.");
    expect(sun.url).toBe("/prepare/households");
  });
});

describe("several households", () => {
  it("follow the current one's home, and keep the mesh root topic and the allotment with the first", async () => {
    await place("Cottage", 51.5, -0.12, "home");
    const flat = await place("Flat", 40.71, -74.0);
    const second = await create({ name: "New York flat", homePlaceId: flat });
    await ok("POST", "/api/weather/places", { markerId: flat });
    expect(await meshRoot()).toBe("msh/EU_868");
    expect(await hemisphere()).toBe("north");

    await makeCurrent(second.id);
    expect(await alerts()).toMatchObject({ home: { name: "Flat" }, household: "New York flat", homeCountry: "US", national: "nws" });
    expect((await ok("GET", "/api/weather")).places).toMatchObject([{ name: "Flat", isHome: true }]);
    expect((await tool("sun_and_compass", {})).text).toContain("At Flat (the home place of New York flat)");
    expect((await tool("sun_and_compass", { near: "home" })).text).toContain("At Flat");
    // The radio and the game are the whole Outpost's: they stay with the first household.
    expect(await meshRoot()).toBe("msh/EU_868");
  });

  it("take a country the household chose over the one its home is in", async () => {
    const flat = await place("Flat", 40.71, -74.0);
    const second = await create({ name: "Flat", homePlaceId: flat });
    await ok("PUT", `/api/households/${second.id}`, { countryOverride: "CA" });
    await makeCurrent(second.id);
    expect(await alerts()).toMatchObject({ homeCountry: "CA", national: "eccc" });
  });

  it("say plainly when the current one has no home", async () => {
    await place("Cottage", 51.5, -0.12, "home");
    const second = await create({ name: "Gran's" });
    await makeCurrent(second.id);
    expect((await alerts()).home).toBeNull();
    expect((await tool("sun_and_compass", {})).text).toContain("Gran's has no home place. Choose one on the Households page.");
    const update = await ok("POST", "/api/weather/update", { kinds: ["nws"] });
    expect(update.outcomes[0].message).toContain("Gran's has no home place.");
  });
});

describe("a portable household", () => {
  it("is home where it was last said to be, with its age, and asks for it until then", async () => {
    await place("Cottage", -41.29, 174.78, "home");
    const caravan = await create({ name: "Caravan", kind: "portable" });
    await makeCurrent(caravan.id);
    expect((await tool("sun_and_compass", {})).text).toContain("Where Caravan is now has not been set.");

    await ok("PUT", `/api/households/${caravan.id}/here`, { lat: 54.45, lon: -3.21, name: "Lakes camp", source: "map" });
    const plan = await alerts();
    expect(plan).toMatchObject({ home: { name: "Lakes camp", lat: 54.45, lon: -3.21 }, household: "Caravan", homeCountry: "GB" });
    expect(plan.home.at).toBeGreaterThan(0);
    expect((await tool("sun_and_compass", {})).text).toContain(
      "At Lakes camp (where Caravan was said to be, as of just now; it may have moved since)",
    );
    // A position is not a saved place: no weather place is badged Home for it.
    const camp = await place("Camp", 54.45, -3.21);
    await ok("POST", "/api/weather/places", { markerId: camp });
    expect((await ok("GET", "/api/weather")).places).toMatchObject([{ isHome: false }]);
    // The allotment stays with the first household's home, south of the equator.
    expect(await hemisphere()).toBe("south");
  });
});

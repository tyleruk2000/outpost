/**
 * The food and supplies layer: kinds from OpenStreetMap's tags (a place with two roles
 * among them), the scope a public server is asked about, the Food Standards Agency's list
 * joined to the mapped shops without doubling them, a record's card, the nearest list and
 * search. Real answers trimmed from both sources stand in for them
 * (fixtures/layers/food-stand-in.ts); nothing reaches the internet.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { NearestResponse, ReferenceFeatureDetail, ReferenceOverlayResponse, ReferencePackDto } from "@outpost/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classifyFood, foodFacts, sameShop, sameShopName } from "../src/modules/layers/adapters/food-tags.ts";
import { circleAround } from "../src/modules/layers/adapters/fsa.ts";
import type { ReferenceMeta } from "../src/modules/layers/types.ts";
import { createFsaStandIn, KESWICK_BOX, OVERPASS_FOOD_ANSWER } from "./fixtures/layers/food-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("kinds from OpenStreetMap's tags", () => {
  it("files each tag under the kind a household would look for", () => {
    expect(classifyFood({ shop: "supermarket" })?.kind).toBe("food:supermarket");
    expect(classifyFood({ shop: "convenience" })?.kind).toBe("food:small-shop");
    expect(classifyFood({ shop: "general" })?.kind).toBe("food:small-shop");
    expect(classifyFood({ shop: "bakery" })?.kind).toBe("food:baker");
    expect(classifyFood({ shop: "farm" })?.kind).toBe("food:farm-shop");
    expect(classifyFood({ amenity: "marketplace" })?.kind).toBe("food:market");
    expect(classifyFood({ amenity: "social_facility", social_facility: "food_bank" })?.kind).toBe("food:food-bank");
    expect(classifyFood({ amenity: "drinking_water" })?.kind).toBe("food:water");
    expect(classifyFood({ man_made: "water_tap" })?.kind).toBe("food:water");
    expect(classifyFood({ amenity: "pharmacy" })?.kind).toBe("food:pharmacy");
  });

  it("keeps a place with two roles once, under its amenity, and knows it is both", () => {
    expect(classifyFood({ amenity: "fuel", shop: "convenience", brand: "Spar" })).toEqual({
      kind: "food:fuel",
      kinds: ["food:fuel", "food:small-shop"],
    });
  });

  it("leaves out taps marked not drinkable, restaurants and takeaways", () => {
    expect(classifyFood({ man_made: "water_tap", drinking_water: "no" })).toBeNull();
    expect(classifyFood({ amenity: "water_point", drinking_water: "no" })).toBeNull();
    expect(classifyFood({ amenity: "restaurant" })).toBeNull();
    expect(classifyFood({ amenity: "fast_food" })).toBeNull();
    expect(classifyFood({ shop: "clothes" })).toBeNull();
  });
});

describe("one shop in two sources", () => {
  const osm = (name: string, props: Record<string, string> = {}) => ({ provider: "osm", name, props });
  const fsa = (name: string, postcode?: string) => ({ provider: "fsa", name, props: postcode ? { PostCode: postcode } : {} });

  it("compares names without company words, brackets and numbers", () => {
    expect(sameShopName("Booths", "Booths Supermarket & Cafe 1847")).toBe(true);
    expect(sameShopName("Boots", "Boots UK Ltd (Keswick)")).toBe(true);
    expect(sameShopName("Keswick Mini Market", "Harpers Newsagents")).toBe(false);
    expect(sameShopName("Co-op", "Coop Food")).toBe(false);
  });

  it("joins only close records whose names agree; postcodes widen or narrow how close", () => {
    // Keswick, from the real answers: 76 m apart, postcodes CA12 5EA and CA12 5ED.
    expect(sameShop(osm("Booths", { "addr:postcode": "CA12 5EA" }), fsa("Booths Supermarket & Cafe 1847", "CA12 5ED"), 76)).toBe(true);
    expect(sameShop(osm("Booths", { "addr:postcode": "CA12 5EA" }), fsa("Booths Supermarket & Cafe 1847", "CA12 5ED"), 130)).toBe(false);
    expect(sameShop(osm("Boots", { "addr:postcode": "CA12 5BL" }), fsa("Boots UK Ltd (Keswick)", "CA12 5BL"), 3)).toBe(true);
    // Two metres apart with the same postcode, but different names: both are shown.
    expect(sameShop(osm("Keswick Mini Market", { "addr:postcode": "CA12 5BL" }), fsa("Harpers Newsagents", "CA12 5BL"), 2)).toBe(false);
    // Two shops of one chain in a town.
    expect(sameShop(osm("Tesco Express"), fsa("Tesco Express"), 600)).toBe(false);
    expect(sameShop(osm("Tesco Express"), fsa("Tesco Express"), 120)).toBe(true);
    // The Agency's name can be the mapped brand.
    expect(sameShop(osm("Open All Hours", { brand: "Premier" }), fsa("Premier"), 40)).toBe(true);
  });
});

describe("what a card says", () => {
  it("gives the mapped address, hours and brand as mapped, and the caution", () => {
    const facts = foodFacts("osm", "food:supermarket", {
      shop: "supermarket",
      name: "Booths",
      brand: "Booths",
      "addr:street": "Tithebarn Street",
      "addr:postcode": "CA12 5EA",
      opening_hours: "Mo-Sa 08:00-22:00; Su 09:30-16:00",
    });
    expect(facts).toMatchObject({
      address: "Tithebarn Street, CA12 5EA",
      openingHours: "Mo-Sa 08:00-22:00; Su 09:30-16:00",
      brand: "Booths",
      water: null,
      alsoKinds: [],
    });
    expect(facts.caution).toMatch(/does not say a place is open, has anything in stock or is still there/);
  });

  it("says whether water is marked drinkable or seasonal, and nothing it is not told", () => {
    expect(foodFacts("osm", "food:water", { amenity: "drinking_water" }).water).toEqual({
      drinkable: "Mapped as a drinking water point",
      seasonal: null,
    });
    expect(foodFacts("osm", "food:water", { man_made: "water_tap" }).water?.drinkable).toMatch(/Not marked as drinkable or not/);
    expect(foodFacts("osm", "food:water", { man_made: "water_tap", drinking_water: "yes", seasonal: "yes" }).water).toEqual({
      drinkable: "Marked as drinking water",
      seasonal: "Marked as seasonal: it may be turned off for part of the year",
    });
    expect(foodFacts("osm", "food:water", { amenity: "water_point", seasonal: "summer" }).water?.seasonal).toBe(
      "Marked as seasonal (summer)",
    );
  });

  it("names a second role, and an Agency record's type and address", () => {
    expect(foodFacts("osm", "food:fuel", { amenity: "fuel", shop: "convenience" }).alsoKinds).toEqual(["Small shop"]);
    const agency = foodFacts("fsa", "food:retailer", {
      BusinessType: "Retailers - other",
      AddressLine1: "35 MAIN STREET",
      AddressLine3: "KESWICK",
      PostCode: "CA12 5BL",
    });
    expect(agency).toMatchObject({ businessType: "Retailers - other", address: "35 MAIN STREET, KESWICK, CA12 5BL", openingHours: null });
    expect(agency.caution).toMatch(/registered with its council as selling food/);
  });
});

describe("the circle the Agency is asked about", () => {
  it("holds the whole box", () => {
    const circle = circleAround(KESWICK_BOX);
    expect(circle).toMatchObject({ lat: 54.602, lon: -3.135, miles: 1 });
    expect(circleAround([-1, 52, 0, 53]).miles).toBe(41);
  });
});

describe("the layer on a real test server", () => {
  let app: TestApp;
  let server: http.Server;
  const fsaStandIn = createFsaStandIn();
  const overpass: string[] = [];
  /** Made up for the tests: a fuel station with a shop, and a tap, beside Keswick. */
  const MADE_UP = {
    osm3s: { timestamp_osm_base: "2026-11-16T21:22:36Z" },
    elements: [
      {
        type: "node",
        id: 900001,
        lat: 54.6008,
        lon: -3.13,
        tags: { amenity: "fuel", shop: "convenience", name: "Made-up garage (test)", opening_hours: "24/7" },
      },
      { type: "node", id: 900002, lat: 54.6045, lon: -3.131, tags: { man_made: "water_tap", drinking_water: "yes", seasonal: "yes" } },
    ],
  };
  let answer: unknown = OVERPASS_FOOD_ANSWER;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      if (request.url?.startsWith("/fsa/")) return fsaStandIn.handle(request, response);
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const query = new URLSearchParams(body).get("data") ?? "";
        overpass.push(query);
        response.setHeader("content-type", "application/json");
        if (query.includes("out count")) {
          const count = { type: "count", id: 0, tags: { nodes: "3", ways: "9", relations: "0", total: "12" } };
          response.end(
            JSON.stringify({
              elements: query
                .split("out count")
                .slice(1)
                .map(() => count),
            }),
          );
        } else response.end(JSON.stringify(answer));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    app = await createTestApp({ OUTPOST_FSA_URL: `http://127.0.0.1:${port}/fsa` });
    const file = path.join(app.ctx.config.dataDir, "catalog", "routes", "route-sources.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        replaceShipped: true,
        sources: [
          {
            id: "local-test",
            name: "Local test server",
            type: "overpass",
            endpoint: `http://127.0.0.1:${port}/api/interpreter`,
            operator: "The tests",
            coverage: "Anywhere",
            termsUrl: "https://example.org/",
            lastVerified: "2026-11-17",
          },
        ],
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const packs = async () => (await app.api("GET", "/api/reference/packs")).body.packs as ReferencePackDto[];
  const removeAll = async () => {
    for (const pack of await packs()) await app.api("DELETE", `/api/reference/packs/${pack.id}?deleteFiles=1`);
  };
  beforeEach(async () => {
    answer = OVERPASS_FOOD_ANSWER;
    await removeAll();
  });

  async function fetchArea(provider: "osm" | "fsa", bbox = KESWICK_BOX) {
    const estimate = await app.api("POST", "/api/reference/estimate", {
      provider,
      scope: { bbox },
      layers: ["food"],
      ...(provider === "osm" ? { clientNameAgreed: true } : {}),
    });
    expect(estimate.status, JSON.stringify(estimate.body)).toBe(200);
    const keys = estimate.body.items.map((item: { key: string }) => item.key);
    const started = await app.api("POST", "/api/reference/downloads", { estimateId: estimate.body.estimateId, keys });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    for (const download of started.body.downloads) expect(app.ctx.services.downloads.get(download.id)!.state).toBe("completed");
    return estimate.body;
  }

  const view = async (extra = "") =>
    (await app.api("GET", `/api/reference/features?bbox=-3.15,54.59,-3.12,54.61&zoom=15&layers=food${extra}`))
      .body as ReferenceOverlayResponse;
  const detail = async (id: number) => (await app.api("GET", `/api/reference/features/${id}`)).body.feature as ReferenceFeatureDetail;
  const byName = (overlay: ReferenceOverlayResponse, name: string) => overlay.points.find((point) => point.name === name);

  it("refuses a country, and an area larger than a county, before asking anything", async () => {
    overpass.length = 0;
    const country = await app.api("POST", "/api/reference/estimate", {
      provider: "osm",
      clientNameAgreed: true,
      scope: { countries: ["GB"] },
      layers: ["food"],
    });
    expect(country.status).toBe(400);
    expect(JSON.stringify(country.body)).toMatch(/not for a whole country/);
    const wide = await app.api("POST", "/api/reference/estimate", {
      provider: "fsa",
      scope: { bbox: [-4, 53, -1, 54] },
    });
    expect(wide.status).toBe(400);
    expect(JSON.stringify(wide.body)).toMatch(/too large to ask a public server/);
    const abroad = await app.api("POST", "/api/reference/estimate", { provider: "fsa", scope: { bbox: [4.3, 50.8, 4.4, 50.9] } });
    expect(JSON.stringify(abroad.body)).toMatch(/United Kingdom only/);
    expect(overpass).toEqual([]);
    expect(fsaStandIn.requests).toEqual([]);
    // "All layers" for a country still means the five it always meant: food is never asked for unless chosen.
    const all = await app.api("POST", "/api/reference/estimate", { provider: "osm", clientNameAgreed: true, scope: { countries: ["LU"] } });
    expect(all.status).toBe(200);
    expect(all.body.items.map((item: { layers: string[] }) => item.layers[0])).not.toContain("food");
  });

  it("fetches an area from OpenStreetMap on a press, with each kind, and updating replaces the pack", async () => {
    overpass.length = 0;
    const estimate = await fetchArea("osm");
    expect(estimate.items).toEqual([expect.objectContaining({ key: expect.stringMatching(/^osm:food:/), records: 12 })]);
    expect(overpass[0]).toMatch(/\["shop"~"\^\(supermarket\|convenience/);
    expect(overpass[0]).toMatch(/\(54\.59850,-3\.14200,54\.60550,-3\.12800\)/);
    const shown = await view();
    expect(shown.points).toHaveLength(12);
    expect(byName(shown, "Booths")?.kind).toBe("food:supermarket");
    expect(byName(shown, "Boots")?.kind).toBe("food:pharmacy");
    expect(byName(shown, "Cornish Bakery")?.kind).toBe("food:baker");
    expect(shown.points.filter((point) => point.kind === "food:water")).toHaveLength(1);

    // Drinking water alone.
    const water = await view("&kinds=food:water");
    expect(water.points.map((point) => point.kind)).toEqual(["food:water"]);

    const summary = (await app.api("GET", "/api/reference/layers")).body;
    expect(summary.layers.find((layer: { id: string }) => layer.id === "food").kinds).toContainEqual({
      kind: "food:small-shop",
      label: "Small shop",
      count: 3,
    });
    expect(summary.credits).toContainEqual(expect.objectContaining({ text: "© OpenStreetMap contributors, ODbL" }));

    await fetchArea("osm");
    expect(await packs()).toHaveLength(1);
  });

  it("finds a place with two roles under each, and lists the nearest of each kind with distance and bearing", async () => {
    await fetchArea("osm");
    answer = MADE_UP;
    await fetchArea("osm", [-3.135, 54.6, -3.125, 54.606]);
    const shops = await view("&kinds=food:small-shop");
    expect(shops.points.map((point) => point.name).sort()).toEqual([
      "Go Local",
      "Keswick Mini Market",
      "Made-up garage (test)",
      "Open All Hours",
    ]);

    // From where the Agency places Booths: the nearest of each kind, nearest first.
    const nearest = (await app.api("GET", "/api/reference/nearest?lat=54.6019&lon=-3.1404")).body as NearestResponse;
    expect(nearest.kind).toBeNull();
    const kinds = nearest.hits.map((hit) => hit.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    const supermarket = nearest.hits.find((hit) => hit.kind === "food:supermarket")!;
    // Booths' outline is mapped, so its mark is the middle of the building; the Co-op's is nearer that point.
    expect(supermarket.name).toBe("Lakes & Dales Co-operative");
    expect(supermarket.distanceMeters).toBeLessThan(150);
    expect(nearest.hits.map((hit) => hit.distanceMeters)).toEqual([...nearest.hits.map((hit) => hit.distanceMeters)].sort((a, b) => a - b));
    const fuel = nearest.hits.find((hit) => hit.kind === "food:fuel")!;
    expect(fuel.name).toBe("Made-up garage (test)");
    expect(fuel.distanceMeters).toBeGreaterThan(600);
    expect(fuel.distanceMeters).toBeLessThan(700);
    expect(fuel.bearingDegrees).toBeGreaterThan(90);
    expect(fuel.bearingDegrees).toBeLessThan(120);

    // One kind: the nearest few, the garage among the small shops.
    const small = (await app.api("GET", "/api/reference/nearest?lat=54.6019&lon=-3.1404&kind=food:small-shop&limit=5"))
      .body as NearestResponse;
    expect(small.hits.map((hit) => hit.name)).toContain("Made-up garage (test)");
    expect(small.hits.every((hit) => hit.kindLabel === "Small shop")).toBe(true);
    const water = (await app.api("GET", "/api/reference/nearest?lat=54.6019&lon=-3.1404&kind=food:water&limit=5")).body as NearestResponse;
    expect(water.hits).toHaveLength(2);

    // Far from anything held: nothing, and no source was asked.
    const asked = overpass.length;
    const far = (await app.api("GET", "/api/reference/nearest?lat=51.5&lon=-0.1")).body as NearestResponse;
    expect(far.hits).toEqual([]);
    expect(overpass.length).toBe(asked);

    const garage = await detail(byName(shops, "Made-up garage (test)")!.id);
    expect(garage.food).toMatchObject({ alsoKinds: ["Small shop"], openingHours: "24/7" });
    const tap = (await view("&kinds=food:water")).points.find((point) => point.name === "")!;
    expect(tap).toBeDefined();
  });

  it("joins the Agency's shops to the mapped ones without doubling them, whichever comes first", async () => {
    await fetchArea("osm");
    fsaStandIn.requests.length = 0;
    const estimate = await fetchArea("fsa");
    expect(estimate.items.map((item: { key: string }) => item.key.split(":")[1])).toEqual(["7840", "4613"]);
    expect(fsaStandIn.requests.every((request) => request.headers["x-api-version"] === "2")).toBe(true);
    expect(fsaStandIn.requests.every((request) => request.headers["user-agent"] === "Outpost (self-hosted offline library)")).toBe(true);
    const agency = (await packs()).filter((pack) => pack.provider === "fsa");
    expect(agency).toHaveLength(2);
    // Two of the eight kept businesses are outside the box: not kept, and said.
    expect(agency.find((pack) => pack.title.startsWith("Other"))!.notes).toContainEqual(
      expect.stringMatching(/^2 businesses round the area/),
    );

    const shown = await view();
    const names = shown.points.map((point) => point.name);
    // Booths, Boots and Open All Hours are in both: drawn once, as mapped.
    expect(names.filter((name) => /Booths|Boots|Open All Hours/.test(name)).sort()).toEqual(["Booths", "Boots", "Open All Hours"]);
    // A newsagent two metres from a mapped shop of another name, and shops only the Agency lists: shown.
    expect(names).toEqual(expect.arrayContaining(["Harpers Newsagents", "Grape Tree", "Greggs PLC (Keswick)"]));
    expect(names).not.toContain("Spar (High Hill Garage)");

    const booths = await detail(byName(shown, "Booths")!.id);
    expect(booths.source.provider).toBe("osm");
    expect(booths.alsoFrom.map((source) => source.provider)).toEqual(["fsa"]);
    expect(booths.food?.openingHours).toBe("Mo-Sa 08:00-22:00; Su 09:30-16:00");
    const harpers = await detail(byName(shown, "Harpers Newsagents")!.id);
    expect(harpers.source).toMatchObject({ provider: "fsa", license: "Open Government Licence v3.0" });
    expect(harpers.source.sourceUrl).toMatch(/^https:\/\/ratings\.food\.gov\.uk\/business\/\d+$/);
    expect(harpers.food).toMatchObject({ businessType: "Retailers - other", openingHours: null });
    // The hygiene rating is not kept.
    expect(JSON.stringify(harpers)).not.toMatch(/Rating/);
    const credits = (await app.api("GET", "/api/reference/layers")).body.credits;
    expect(credits).toContainEqual(
      expect.objectContaining({ text: expect.stringMatching(/Food Standards Agency, Open Government Licence/) }),
    );

    // The other way round: the mapped record still leads.
    await removeAll();
    await fetchArea("fsa");
    await fetchArea("osm");
    const again = await view();
    expect(
      again.points
        .filter((point) => /Booths|Boots|Open All Hours/.test(point.name))
        .map((point) => point.name)
        .sort(),
    ).toEqual(["Booths", "Boots", "Open All Hours"]);
    const lead = await detail(byName(again, "Boots")!.id);
    expect(lead.source.provider).toBe("osm");
    expect(lead.alsoFrom.map((source) => source.provider)).toEqual(["fsa"]);

    // Removing the mapped pack shows the Agency's records it hid.
    const mapped = (await packs()).find((pack) => pack.provider === "osm")!;
    await app.api("DELETE", `/api/reference/packs/${mapped.id}?deleteFiles=1`);
    const left = await view();
    expect(left.points.map((point) => point.name)).toEqual(
      expect.arrayContaining(["Booths Supermarket & Cafe 1847", "Boots UK Ltd (Keswick)"]),
    );
  });

  it("is found by the search across everything, like the other layers' places", async () => {
    await fetchArea("osm");
    const found = await app.api("GET", "/api/search?q=Bryson");
    const hits = JSON.stringify(found.body);
    expect(hits).toMatch(/Bryson's Bakery/);
    expect(hits).toMatch(/\/maps\?feature=\d+/);
    expect(hits).toMatch(/Baker/);
  });

  it("reads a file installed as if downloaded, and refuses an answer with nothing in the box", async () => {
    const location = app.ctx.services.storage.getDefault();
    const relPath = "collections/reference/fsa/empty.json";
    const filePath = path.join(app.ctx.services.storage.resolve(location.id, ""), relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        meta: { totalCount: 1 },
        establishments: [{ FHRSID: 1, BusinessName: "Far away", BusinessTypeID: 7840, geocode: { latitude: "51.5", longitude: "-0.1" } }],
      }),
    );
    const reference: ReferenceMeta = {
      provider: "fsa",
      key: "fsa:7840:test",
      title: "Test",
      layers: ["food"],
      request: null,
      countries: ["GB"],
      bbox: KESWICK_BOX,
      sourceUrl: null,
      origin: "download",
    };
    await expect(
      app.ctx.services.layers.installer({
        download: { id: "t1", kind: "dataset", locationId: location.id, relPath, meta: { reference } } as never,
        filePath,
        sizeBytes: fs.statSync(filePath).size,
        sha256: "0".repeat(64),
        signal: new AbortController().signal,
        progress: () => {},
      }),
    ).rejects.toThrow(/None of the businesses the Agency sent is inside the area/);
  });
});

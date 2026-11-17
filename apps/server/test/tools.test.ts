/**
 * The tools a language model may call, each against a server with something in every
 * area (test/fixtures/tools/filled.ts) and against an empty one: what each answers, that
 * it says where the answer came from and how old it is, that a list says when there is
 * more, that it says plainly when nothing is held and where to get it, that the schemas a
 * model is sent are well formed, and that an area switched off takes its tools away.
 */
import fs from "node:fs";
import path from "node:path";
import { sunDay } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dayOf, MAX_ANSWER_CHARS } from "../src/modules/tools/types.ts";
import { type Filled, filledServer } from "./fixtures/tools/filled.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let filled: Filled;
beforeAll(async () => {
  filled = await filledServer();
}, 120_000);
afterAll(async () => {
  await filled?.close();
});

const call = (name: string, args: unknown, app: TestApp = filled.app) =>
  app.ctx.services.tools.call(name, args, { signal: new AbortController().signal });

const today = () => dayOf(Date.now());

describe("find_places", () => {
  it("reads a query that names a kind held as that kind, as bonsai-2:2b sent it", async () => {
    const both = await call("find_places", { query: "supermarket", kind: "supermarket", near: "home" });
    expect(both.held).toBe(true);
    expect(both.text).toContain("Iceland Gold Street");
    const alone = await call("find_places", { query: "supermarkets", near: "home" });
    expect(alone.held).toBe(true);
    expect(alone.text).toContain("Iceland Gold Street");
    // Words in a name are still words in a name.
    expect((await call("find_places", { query: "Tesco", near: "Northampton" })).text).toContain("Tesco Extra Mereway");
  });

  it("lists supermarkets near a town by its place name, nearest first, with address, distance, direction and source", async () => {
    const result = await call("find_places", { kind: "supermarket", near: "Northampton" });
    expect(result.ok).toBe(true);
    expect(result.held).toBe(true);
    const lines = result.text.split("\n");
    expect(lines[0]).toMatch(/^Near Northampton, United Kingdom \(the map's place names \(GeoNames\), a city\), 52\.2500, -0\.8833/);
    expect(lines[1]).toBe(
      "1. Morrisons Kettering Road (Supermarket) at 52.2541, -0.8789, Kettering Road, Northampton, NN3 6AA, 550 m NNE.",
    );
    expect(lines.filter((line) => /^\d+\. /.test(line))).toHaveLength(10);
    expect(result.text).toContain("Showing 1 to 10 of 12. Ask again with page 2 for more.");
    expect(result.text).toContain(
      `From: Police, fire and ambulance layer, OpenStreetMap contributors (test) ("Supermarkets (test)"), fetched ${today()}.`,
    );
    expect(result.text).not.toContain("Bedford");
    expect(result.label).toMatch(/^Police, fire and ambulance, fetched \d+ \w+$/);
    expect(result.url).toBe("/maps");
  });

  it("gives the rest on the next page, and says when it is the last", async () => {
    const result = await call("find_places", { kind: "supermarket", near: "Northampton", page: 2 });
    expect(result.text).toContain("1. Sainsbury's Weston Favell");
    expect(result.text).toContain("2. Tesco Extra Mereway");
    expect(result.text).toContain("Showing 11 to 12 of 12; that is the last page.");
  });

  it("takes the kind forgivingly: grocery and shops find the supermarkets", async () => {
    for (const kind of ["grocery", "shops", "Supermarkets"]) {
      const result = await call("find_places", { kind, near: "Northampton" });
      expect(result.held, kind).toBe(true);
      expect(result.text, kind).toContain("of 12");
    }
  });

  it("reads near as a saved place, home, a layer record, or a latitude and longitude, and says which", async () => {
    expect((await call("find_places", { kind: "supermarket", near: "Spring at the allotment", radius_km: 2 })).text).toMatch(
      /^Near Spring at the allotment \(a saved place\)/,
    );
    expect((await call("find_places", { kind: "supermarket", near: "home", radius_km: 1 })).text).toMatch(
      /^Near Home \(the saved place with the home icon\), 52\.2405, -0\.8936/,
    );
    expect((await call("find_places", { kind: "supermarket", near: "Northampton General Hospital", radius_km: 1 })).text).toMatch(
      /^Near Northampton General Hospital \(a record in the reference layers \(Hospital\)\)/,
    );
    const numbers = await call("find_places", { kind: "supermarket", near: "52.2132,-0.8915", radius_km: 0.5 });
    expect(numbers.text).toMatch(/^Near 52\.2132, -0\.8915 \(the latitude and longitude given\)/);
    expect(numbers.text).toContain("1. Tesco Extra Mereway (Supermarket)");
  });

  it("says when the place itself is not known", async () => {
    const result = await call("find_places", { kind: "supermarket", near: "Atlantis" });
    expect(result).toMatchObject({ ok: true, held: false });
    expect(result.text).toMatch(/^"Atlantis" is not a place Outpost knows/);
  });

  it("says when nothing of that kind is held there, and where to get it", async () => {
    const elsewhere = await call("find_places", { kind: "supermarket", near: "Bedford", radius_km: 0.5 });
    expect(elsewhere.held).toBe(false);
    expect(elsewhere.text).toBe(
      'Nothing "supermarket" is held within 0.5 km of Bedford, United Kingdom: fetch that area under Maps → Layers → Get reference data.',
    );
    const never = await call("find_places", { kind: "pharmacy", near: "Northampton" });
    expect(never.held).toBe(false);
    expect(never.text).toContain("fetch that area under Maps → Layers → Get reference data. No layer held has that kind at all.");
    expect(never.text).toContain("Layers held: Police, fire and ambulance (13), Hospitals (2).");
  });

  it("finds saved places by their icon, and records by name anywhere", async () => {
    const water = await call("find_places", { kind: "water", near: "home" });
    expect(water.text).toContain("1. Spring at the allotment (saved place, water) at 52.2475, -0.9052, 1.1 km NW. Note: Clear all year");
    expect(water.text).toContain("From: saved on this Outpost.");
    const tesco = await call("find_places", { query: "Tesco" });
    expect(tesco.text.match(/^\d\. Tesco/gm)).toHaveLength(3);
    expect(tesco.text).toContain("Tesco Bedford Interchange");
  });

  it("says what is held and asks where, given only a kind", async () => {
    const result = await call("find_places", { kind: "hospital" });
    expect(result.held).toBe(true);
    expect(result.text).toBe('Held of "hospital": Hospital (2, Hospitals). Ask again with near (a place) to list them.');
  });

  it("picks up a layer added later with no change: drinking water imported now is found", async () => {
    const { app } = filled;
    // Before: only the saved place with the water icon.
    const before = await call("find_places", { kind: "drinking water", near: "Northampton" });
    expect(before.text).toContain("1. Spring at the allotment (saved place, water)");
    expect(before.text).not.toContain("fountain");
    const location = app.ctx.services.storage.getDefault();
    const relPath = "imports/water.geojson";
    fs.writeFileSync(
      path.join(app.ctx.services.storage.resolve(location.id, ""), relPath),
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { name: "Market Square fountain" }, geometry: { type: "Point", coordinates: [-0.8954, 52.2389] } },
        ],
      }),
    );
    const started = await app.api("POST", "/api/reference/imports/from-storage", {
      format: "geojson",
      locationId: location.id,
      relPath,
      title: "Drinking water (test)",
      options: {
        layer: "shelters",
        kind: "Drinking water",
        provenance: "public-record",
        publisher: "A council (test)",
        license: "OGL",
        accuracy: "As mapped",
      },
    });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const after = await call("find_places", { kind: "drinking water", near: "Northampton" });
    expect(after.held).toBe(true);
    expect(after.text).toMatch(
      /^\d\. Market Square fountain \(Drinking water\) at 52\.2389, -0\.8954, [\d.]+ km \w+\. From: Shelters and assembly points layer, A council \(test\)/m,
    );
  });
});

describe("nearest_place", () => {
  it("gives the nearest of a kind to home, however far", async () => {
    const result = await call("nearest_place", { kind: "hospital", near: "home" });
    expect(result.held).toBe(true);
    expect(result.text).toContain("1. Northampton General Hospital (Hospital) at 52.2353, -0.8836, 890 m SE.");
    expect(result.text).toContain("2. Bedford Hospital (Hospital) at 52.1290, -0.4697, 31 km ESE.");
    expect(result.text).toContain(`From: Hospitals layer, OpenStreetMap contributors (test) ("Hospitals (test)"), fetched ${today()}.`);
  });

  it("gives as many as asked, and refuses more than ten", async () => {
    const two = await call("nearest_place", { kind: "supermarket", near: "Bedford", count: 2 });
    expect(two.text.match(/^\d\. /gm)).toHaveLength(2);
    expect(two.text).toContain("1. Tesco Bedford Interchange");
    expect((await call("nearest_place", { kind: "supermarket", near: "Bedford", count: 11 })).ok).toBe(false);
  });

  it("says when no record of the kind is held", async () => {
    const result = await call("nearest_place", { kind: "pharmacy", near: "Northampton" });
    expect(result.held).toBe(false);
    expect(result.text).toMatch(/^Nothing of the kind "pharmacy" is held within 250 km of Northampton, United Kingdom: fetch that area/);
  });
});

describe("supplies", () => {
  it("reads a query that names a kind of supply as that kind, and always gives the days", async () => {
    const result = await call("supplies", { query: "food" });
    expect(result.held).toBe(true);
    expect(result.text).toContain("Baked beans");
    expect(result.text).toMatch(/Outlook for all stock: food 4\.9 days, water 2\.0 days, of 7 days wanted\./);
  });

  it("gives the outlook from the same arithmetic as the Supplies screen", async () => {
    const result = await call("supplies", {});
    const outlook = (await filled.app.api("GET", "/api/supplies/outlook")).body.outlook;
    expect(result.held).toBe(true);
    expect(result.text).toContain("1 person, 0 pets, 7 days wanted.");
    expect(result.text).toContain(`Food: ${outlook.food.days.toFixed(1)} days`);
    expect(result.text).toContain("Water: 2.0 days at 3.0 litres a day (drinking).");
    expect(result.text).toContain("Runs out first: water, after 2.0 days.");
    expect(result.text).toContain("Missing, to reach the days wanted: 5 tin Baked beans; 3 pack Pasta; 8 bottle Bottled water.");
    expect(result.url).toBe("/prepare/supplies");
  });

  it("lists stock by category or by name, and says when a category is not one", async () => {
    expect((await call("supplies", { category: "medical" })).text).toContain("- Plasters: 40 plaster (Medical)");
    expect((await call("supplies", { query: "beans" })).text).toContain("- Baked beans: 10 tin (Food)");
    const odd = await call("supplies", { category: "sweets" });
    expect(odd.held).toBe(false);
    expect(odd.text).toContain("The kinds are: food, water, pet food");
  });
});

describe("emergency_plans", () => {
  it("lists the plans, and reads one's steps a page at a time with its meeting places", async () => {
    expect((await call("emergency_plans", {})).text).toMatch(/- Power cut \(Power cut\): 18 steps/);
    const first = await call("emergency_plans", { plan: "power cut" });
    expect(first.text).toContain("1. (Before) Step 1: Put the torches where everyone can find them.");
    expect(first.text).toContain("Showing 1 to 15 of 18. Ask again with page 2 for more.");
    expect(first.text).toContain("- Number 12's porch (If the home cannot be used): Knock twice");
    expect(first.text).toContain("Keeping in touch: Meet at the church at noon each day; PMR446 channel 3");
    expect(first.url).toMatch(/^\/prepare\/plans\/\w+$/);
    const second = await call("emergency_plans", { plan: "Power cut", page: 2 });
    expect(second.text).toContain("18. (After) Step 18");
    expect(second.text).toContain("that is the last page");
  });

  it("names the plans held when the one asked for is not", async () => {
    const result = await call("emergency_plans", { plan: "earthquake" });
    expect(result.held).toBe(false);
    expect(result.text).toBe('No plan called "earthquake" is held. The plans are: Power cut.');
  });
});

describe("weather", () => {
  it("gives each part as last fetched, with its age and source", async () => {
    const result = await call("weather", {});
    expect(result.held).toBe(true);
    expect(result.text).toContain("Forecast for Home, from Open-Meteo. Fetched just now.");
    expect(result.text).toContain("Met Office weather warnings, from Met Office.");
    expect(result.text).toContain("For East Midlands:");
    expect(result.text).toContain("Flood warnings within");
    expect(result.text).toContain("River and sea levels near Home, from Environment Agency.");
    expect(result.label).toBe("fetched just now");
  });

  it("gives one part when asked", async () => {
    const result = await call("weather", { what: "forecast" });
    expect(result.text).toMatch(/^Forecast for Home/);
    expect(result.text).not.toContain("Met Office");
  });
});

describe("sun_and_compass", () => {
  it("answers from the shared sun and compass arithmetic at home", async () => {
    const result = await call("sun_and_compass", { date: "2026-11-17 12:00" });
    const day = sunDay(52.2405, -0.8936, "2026-11-17");
    const rise = new Date((day.sun as { begin: number }).begin).toISOString().slice(11, 16);
    expect(result.held).toBe(true);
    expect(result.text).toMatch(/^At Home \(the saved place with the home icon\), 52\.2405, -0\.8936, on 2026-11-17:/);
    expect(result.text).toContain(`Sunrise ${rise} UTC (${rise} GMT local)`);
    expect(result.text).toContain("At 12:00 UTC (12:00 GMT local) the sun is");
    expect(result.text).toMatch(/Magnetic declination \d\.\d° east \(WMM2025\)\./);
    expect(result.text).toContain("Grid magnetic angle on an OS map:");
    expect(result.url).toBe("/tools/compass?lat=52.2405&lon=-0.8936");
  });

  it("says when a place is outside the National Grid, and refuses a date that is not one", async () => {
    const paris = await call("sun_and_compass", { near: "48.8566,2.3522", date: "2026-06-21" });
    expect(paris.text).toContain("No grid magnetic angle: the place is outside the National Grid.");
    expect(paris.text).not.toContain("local)");
    expect((await call("sun_and_compass", { date: "2026-02-30" })).held).toBe(false);
    expect((await call("sun_and_compass", { date: "next week" })).ok).toBe(false);
    // "today" and "tomorrow" are what small models send (docs/ai.md, "Tried with a real model: tools").
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await call("sun_and_compass", { near: "home", date: "tomorrow" })).text).toContain(`on ${tomorrow}:`);
  });
});

describe("radio", () => {
  it("lists frequencies to listen to, filtered as the Frequencies screen filters", async () => {
    const result = await call("radio_frequencies", { kind: "emergency", near: "United Kingdom" });
    expect(result.held).toBe(true);
    expect(result.text).toContain("BBC Radio 2 and Radio 4");
    expect(result.url).toBe("/radio/frequencies?kind=emergency&place=GB");
    const fromPlace = await call("radio_frequencies", { kind: "emergency", near: "Northampton" });
    expect(fromPlace.label).toBe("Emergency broadcasting, for United Kingdom, where Northampton, United Kingdom is");
    const anywhere = await call("radio_frequencies", {});
    expect(anywhere.text).toMatch(/Showing 1 to 8 of \d+\. Ask again with page 2 for more\./);
    expect((await call("radio_frequencies", { band: "no such band" })).held).toBe(false);
  });

  it("lists repeaters near a place, nearest first, and by band", async () => {
    const result = await call("repeaters_near", { near: "Northampton" });
    expect(result.text).toContain("- GB3NH 145.7125 MHz, shift -0.6 MHz, tone 77.0 Hz, FM, Northampton: 1.4 km bearing 39°.");
    expect(result.text.indexOf("GB3NH")).toBeLessThan(result.text.indexOf("GB3BF"));
    const uhf = await call("repeaters_near", { near: "Northampton", band: "70cm" });
    expect(uhf.text).toContain("GB3BF");
    expect(uhf.text).not.toContain("GB3NH");
    expect((await call("repeaters_near", { near: "48.8566,2.3522" })).held).toBe(false);
  });

  it("lists saved predictions without working any out", async () => {
    const result = await call("saved_predictions", {});
    expect(result.text).toContain("- Home to Birmingham, 40 m: Home to Birmingham, 2026-11-16, 7.1 MHz ssb, 5 W.");
    expect(result.text).toContain("A new prediction is worked out on the Radio screen under HF propagation");
  });
});

describe("search_catalogue", () => {
  it("says what could be downloaded, its size, and whether it is held", async () => {
    const result = await call("search_catalogue", { subject: "first aid" });
    expect(result.text).toContain(
      "- First aid manual (History and general reference, Test Press): A field guide to first aid and casualty care. Held: no; in Explore, about 14.0 MB.",
    );
    const loose = await call("search_catalogue", { subject: "rope rescue gear" });
    expect(loose.text).toContain("(no entry has every word; these have some)");
    expect(loose.text).toContain("Knots by example");
    expect((await call("search_catalogue", { subject: "astronomy" })).held).toBe(false);
  });
});

describe("board_messages", () => {
  it("gives the board newest first, with who and when, paged", async () => {
    const result = await call("board_messages", {});
    expect(result.text).toContain("Latest check-ins: Alex: safe (just now).");
    const lines = result.text.split("\n").filter((line) => line.startsWith("- "));
    expect(lines[0]).toMatch(/Alex checked in: safe, at Mum's$/);
    expect(lines[1]).toMatch(/Sam: "Message 11"$/);
    expect(result.text).toContain("Showing 1 to 10 of 12. Ask again with page 2 for more.");
    expect((await call("board_messages", { page: 2 })).text).toContain('Sam: "Message 1"');
  });
});

describe("every tool", () => {
  it("keeps every answer within the limit", async () => {
    for (const [name, args] of [
      ["find_places", { kind: "supermarket", near: "Northampton", radius_km: 100 }],
      ["radio_frequencies", {}],
      ["weather", {}],
      ["board_messages", {}],
    ] as const) {
      const result = await call(name, args);
      expect(result.text.length, name).toBeLessThanOrEqual(MAX_ANSWER_CHARS);
    }
  });

  it("sends a well-formed JSON Schema for its arguments: an object, each property typed and described", () => {
    const { tools } = filled.app.ctx.services;
    for (const tool of tools.all) {
      const schema = tools.schemaOf(tool) as {
        type: string;
        properties: Record<string, { type?: string; description?: string; enum?: unknown[] }>;
        required?: string[];
        $schema?: string;
      };
      expect(schema.type, tool.name).toBe("object");
      expect(schema.$schema, tool.name).toBeUndefined();
      expect(typeof schema.properties, tool.name).toBe("object");
      for (const [key, property] of Object.entries(schema.properties)) {
        expect(typeof property.type, `${tool.name}.${key}`).toBe("string");
        expect(["string", "number", "integer", "boolean"]).toContain(property.type);
        expect(property.description?.trim().length, `${tool.name}.${key} has no description`).toBeGreaterThan(0);
      }
      for (const key of schema.required ?? []) expect(Object.keys(schema.properties), tool.name).toContain(key);
      // Few arguments, and a short description: every schema is sent with every turn to a small model.
      expect(Object.keys(schema.properties).length, tool.name).toBeLessThanOrEqual(5);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(300);
    }
  });
});

describe("an area switched off", () => {
  it("takes its tools out of what is offered, and refuses a call to them", async () => {
    const { app } = filled;
    const { tools } = app.ctx.services;
    expect(tools.offered().map((tool) => tool.name)).toContain("find_places");
    expect((await app.api("PATCH", "/api/settings", { "tools.places": false })).status).toBe(200);
    try {
      const offered = tools.offered().map((tool) => tool.name);
      expect(offered).not.toContain("find_places");
      expect(offered).not.toContain("nearest_place");
      expect(offered).toContain("supplies");
      const refused = await call("find_places", { kind: "supermarket", near: "Northampton" });
      expect(refused.ok).toBe(false);
      expect(refused.text).toMatch(/^There is no tool called "find_places"/);
    } finally {
      await app.api("PATCH", "/api/settings", { "tools.places": true });
    }
  });
});

describe("on an empty server", () => {
  let empty: TestApp;
  beforeAll(async () => {
    empty = await createTestApp({}, undefined, { voacapData: false });
    expect((await empty.api("PATCH", "/api/settings", { "tools.board": true })).status).toBe(200);
  });
  afterAll(async () => {
    await empty?.close();
  });

  it("the board's tool is off until a person turns it on", async () => {
    const fresh = await createTestApp({}, undefined, { voacapData: false });
    try {
      expect(fresh.ctx.services.tools.offered().map((tool) => tool.name)).not.toContain("board_messages");
      expect((await call("board_messages", {}, fresh)).ok).toBe(false);
    } finally {
      await fresh.close();
    }
  });

  it("each tool says that nothing is held, and where to get it", async () => {
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      [
        "find_places",
        { kind: "supermarket", near: "52.24,-0.89" },
        /fetch that area under Maps → Layers → Get reference data\. No layer held has that kind at all\. No reference layers are held yet\./,
      ],
      ["nearest_place", { kind: "hospital", near: "52.24,-0.89" }, /^Nothing of the kind "hospital" is held/],
      ["supplies", {}, /^No supplies are recorded in Outpost\. They are added under Preparedness → Supplies\.$/],
      ["emergency_plans", {}, /^No emergency plans are held\. Plans are made under Preparedness → Emergency plans\.$/],
      ["weather", {}, /not fetched yet: press Update now under Preparedness → Weather and hazards\./],
      ["sun_and_compass", {}, /^No place was given, and No saved place has the home icon/],
      ["repeaters_near", { near: "52.24,-0.89" }, /^No repeater lists are held\. Import or fetch one under Radio → Repeaters\.$/],
      ["saved_predictions", {}, /^No propagation predictions are saved\./],
      ["search_catalogue", { subject: "first aid" }, /^Nothing in Outpost's catalogue is about "first aid"/],
      ["board_messages", {}, /^No messages are on the household board\./],
    ];
    for (const [name, args, words] of cases) {
      const result = await call(name, args, empty);
      expect(result.ok, `${name}: ${result.text}`).toBe(true);
      expect(result.held, name).toBe(false);
      expect(result.text, name).toMatch(words);
    }
  });

  it("names a place it cannot find before anything else", async () => {
    const result = await call("find_places", { kind: "supermarket", near: "Northampton" }, empty);
    expect(result.held).toBe(false);
    expect(result.text).toMatch(/^"Northampton" is not a place Outpost knows/);
  });
});

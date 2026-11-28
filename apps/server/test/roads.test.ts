/**
 * Road routes: a main-roads network read from made-up extracts in Geofabrik's format
 * (fixtures/roads/channel-trip.ts, shaped like the owner's London to Chamonix list),
 * joined across extracts and across the Channel, routed through and written as
 * directions. Nothing reaches the internet: the one Geofabrik install is from a local
 * stand-in.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  directionsAsPlainText,
  type RoadCoverageResponse,
  type RoadCrossingDto,
  type RoadNetworksResponse,
  type RoadRouteProblem,
  type RoadRouteResult,
  roadAsciiText,
  type SavedRoadRouteDto,
  wrapRoadText,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.ts";
import { buildNetwork, CLASS, parseDuration, parseMaxspeed, SIGN_SEPARATOR } from "../src/modules/roads/build.ts";
import { reachesNorthernIreland } from "../src/modules/roads/countries.ts";
import { coverageOf } from "../src/modules/roads/coverage.ts";
import { placeQuality, samePlace } from "../src/modules/roads/directions.ts";
import { buildGraph } from "../src/modules/roads/graph.ts";
import { readNetworkFile, writeNetworkFile } from "../src/modules/roads/network-file.ts";
import { planRoute } from "../src/modules/roads/plan.ts";
import { ownName } from "../src/modules/roads/service.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { buildPbf, type PbfWay } from "./fixtures/layers/builders.ts";
import { createGeofabrikStandIn } from "./fixtures/layers/geofabrik-stand-in.ts";
import {
  CHAMONIX,
  FERRY_WAY,
  franceNorth,
  franceSouth,
  greatBritain,
  LEATHERHEAD,
  OWNER_LINES_AFTER_CROSSING,
  REIMS,
} from "./fixtures/roads/channel-trip.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const dir = tempDir("outpost-roads-");
const write = (name: string, body: Buffer) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
};

async function network(name: string, body: Buffer, country: string) {
  const data = await buildNetwork(write(`${name}.osm.pbf`, body));
  const file = path.join(dir, `${name}.roads`);
  await writeNetworkFile(file, data, { country, name });
  return { network: { id: name, name, country, dataDate: "2026-11-20" }, data: await readNetworkFile(file) };
}

describe("reading an extract", () => {
  it("keeps the main roads, their numbers, junctions and signs, and nothing else", async () => {
    const data = await buildNetwork(write("north.osm.pbf", franceNorth()));
    const strings = (indices: Uint32Array) => [...indices].map((i) => data.strings[i]!);
    // The footway and the bakery are not read; the D243, N216, the slip roads and the motorways are.
    expect(new Set(strings(data.edgeRef))).toEqual(new Set(["D243", "N216", "N44", "", "A26", "A5"]));
    expect(new Set(strings(data.edgeIntRef))).toEqual(new Set(["", "E17", "E54"]));
    expect(data.header.timestamp).toBe("2026-11-20T21:00:00.000Z");
    // A junction number and name, as mapped.
    const junctions = [...data.junctionNode].map((n, i) => [
      data.nodeId[n],
      data.strings[data.junctionRef[i]!],
      data.strings[data.junctionName[i]!],
    ]);
    expect(junctions).toContainEqual([48, "21", "Troyes-Nord"]);
    // The slip road's sign: the place, the road with it.
    expect(strings(data.edgeSignF)).toContain(["Reims", "A4", ""].join(SIGN_SEPARATOR));
    // A sign on a two-way road is read for the direction it says.
    expect(
      data.edgeMaxspeed[
        [...data.edgeRef].findIndex((r, e) => data.strings[r] === "A26" && data.strings[data.edgeSignF[e]!]!.startsWith("Troyes"))
      ],
    ).toBe(130);
  });

  it("reads car ferries and the Channel Tunnel shuttle as crossings, and leaves foot ferries out", async () => {
    const data = await buildNetwork(write("gb.osm.pbf", greatBritain()));
    expect(data.crossings.map((c) => [c.id, c.kind, c.durationS])).toEqual(
      expect.arrayContaining([
        ["way/801", "shuttle", 35 * 60],
        ["way/802", "shuttle", 35 * 60],
        [`way/${FERRY_WAY}`, "ferry", 90 * 60],
      ]),
    );
    expect(data.crossings).toHaveLength(3);
    expect(data.crossings.find((c) => c.kind === "ferry")).toMatchObject({ from: "Dover", to: "Calais", operator: "P&O Ferries" });
    const ferryEdges = [...data.edgeClass].filter((c) => c === CLASS.ferry).length;
    expect(ferryEdges).toBeGreaterThan(0);
  });

  it("reads speed limits and durations as they are written", () => {
    expect(parseMaxspeed("70 mph")).toBe(113);
    expect(parseMaxspeed("GB:nsl_single")).toBe(97);
    expect(parseMaxspeed("FR:rural")).toBe(80);
    expect(parseMaxspeed("none")).toBe(255);
    expect(parseMaxspeed("walk")).toBe(0);
    expect(parseDuration("1:30")).toBe(5400);
    expect(parseDuration("PT1H35M")).toBe(5700);
    expect(parseDuration("35")).toBe(2100);
    expect(parseDuration("soon")).toBeNull();
  });

  it("takes one place spelt two ways on the signs as one place, and road numbers as no place", () => {
    expect(samePlace("Chamonix-Mont Blanc", "Chamonix-Mᵗ Blanc")).toBe(true);
    expect(samePlace("Genève", "Geneve")).toBe(true);
    expect(samePlace("Reims", "Troyes")).toBe(false);
    expect(placeQuality("M6(N)")).toBe(0);
    expect(placeQuality("(M20, M23)")).toBe(0);
    expect(placeQuality("The SOUTH")).toBe(1);
    expect(placeQuality("Folkestone")).toBe(2);
  });

  it("refuses a file that is not an extract", async () => {
    await expect(buildNetwork(write("not.osm.pbf", Buffer.from("hello world, not a pbf")))).rejects.toThrow(
      /not an OpenStreetMap PBF file/,
    );
  });
});

describe("directions as the owner writes them, on British roads", () => {
  // Made up, shaped like real routes planned on the Pi: an A road with no sign of its own onto
  // the M6, whose signs name the next city as its European routes change, then the A6.
  const N: Record<number, [number, number]> = {
    1: [52.4, -1.9],
    2: [52.5, -1.9],
    3: [52.55, -1.9],
    4: [52.552, -1.9],
    5: [52.95, -1.9],
    6: [53.35, -1.9],
    7: [53.75, -1.9],
    8: [53.752, -1.9],
    9: [53.95, -1.9],
  };
  const ways: PbfWay[] = [
    { id: 1, refs: [1, 2, 3], tags: { highway: "primary", ref: "A501" } },
    { id: 2, refs: [3, 4], tags: { highway: "motorway_link" } },
    { id: 3, refs: [4, 5], tags: { highway: "motorway", ref: "M6", int_ref: "E05", destination: "Birmingham (C & N);Preston" } },
    { id: 4, refs: [5, 6], tags: { highway: "motorway", ref: "M6", int_ref: "E05;E22", destination: "Birmingham (C & N)" } },
    { id: 5, refs: [6, 7], tags: { highway: "motorway", ref: "M6", int_ref: "E05;E18", destination: "Preston" } },
    { id: 6, refs: [7, 8], tags: { highway: "motorway_link" } },
    { id: 7, refs: [8, 9], tags: { highway: "trunk", ref: "A6" } },
  ];
  const at = (id: number, name: string | null) => ({ lat: N[id]![0], lon: N[id]![1], name });
  const graphOf = async (name: string, list: PbfWay[]) => {
    const body = buildPbf({
      nodes: Object.entries(N).map(([id, [lat, lon]]) => ({ id: Number(id), lat, lon })),
      ways: list,
      relations: [],
      timestamp: Date.parse("2026-11-20T21:00:00Z") / 1000,
    });
    const data = await buildNetwork(write(`${name}.osm.pbf`, body));
    const file = path.join(dir, `${name}.roads`);
    await writeNetworkFile(file, data, { country: "GB", name });
    return buildGraph([{ network: { id: name, name, country: "GB", dataDate: "2026-11-20" }, data: await readNetworkFile(file) }]);
  };
  let graph: ReturnType<typeof buildGraph>;
  beforeAll(async () => {
    graph = await graphOf("north-west", ways);
  });
  const linesOn = (on: ReturnType<typeof buildGraph>, points: Array<{ lat: number; lon: number; name: string | null }>) =>
    planRoute(on, points, { crossing: "any", units: "km", request: { points: [] }, now: Date.parse("2026-11-22") }).legs.map(
      (leg) => leg.title,
    );
  const lines = (points: Array<{ lat: number; lon: number; name: string | null }>) => linesOn(graph, points);

  it("keeps one line for one motorway signed again for a place its signs gave before, its European routes together", () => {
    // "Birmingham (C & N);Preston", then "Birmingham (C & N)", then "Preston": one line, not three.
    // The A501 has no sign of its own: it takes the place the next road is signed for. The A6 has none to take.
    expect(lines([at(1, "Start"), at(9, "End")])).toEqual(["A501 - Preston", "M6 (E05 - E22 - E18) - Preston", "A6"]);
  });

  it("keeps one line for one motorway whose first signs give only its own number, as its European route changes", async () => {
    // "M6(N)" for the first 44 km is no place to follow: the M6 is one line for Preston, not "M6 (E05)" then "M6 (E05 - E22) - Preston".
    const unsigned = await graphOf(
      "north-west-unsigned",
      ways.map((way) =>
        way.id === 3
          ? { ...way, tags: { ...way.tags, destination: "M6(N)" } }
          : way.id === 4
            ? { ...way, tags: { ...way.tags, destination: "Preston" } }
            : way,
      ),
    );
    expect(linesOn(unsigned, [at(1, "Start"), at(9, "End")])).toEqual(["A501 - Preston", "M6 (E05 - E22 - E18) - Preston", "A6"]);
  });

  it("gives an A road with no sign of its own the place the motorway after it is signed for", async () => {
    // Shaped like the A5103 out of Manchester onto the M56: Princess Road carries no destination.
    const a5103 = await graphOf("manchester", [
      { id: 11, refs: [1, 2, 3], tags: { highway: "primary", ref: "A5103", name: "Princess Road" } },
      { id: 12, refs: [3, 4], tags: { highway: "motorway_link" } },
      { id: 13, refs: [4, 5, 6], tags: { highway: "motorway", ref: "M56", destination: "Manchester Airport;Chester" } },
      { id: 14, refs: [6, 7], tags: { highway: "motorway_link" } },
      { id: 15, refs: [7, 8, 9], tags: { highway: "trunk", ref: "A556" } },
    ]);
    expect(linesOn(a5103, [at(1, "Start"), at(9, "End")])).toEqual(["A5103 - Manchester Airport", "M56 - Manchester Airport", "A556"]);
  });

  it("names a via point with no name of its own by the place its road was signed for", () => {
    expect(lines([at(1, "Start"), at(7, null), at(9, "End")])).toEqual([
      "A501 - Preston",
      "M6 (E05 - E22 - E18) - Preston",
      "Via Preston",
      "A6",
    ]);
    expect(ownName("via")).toBeNull();
    expect(ownName("Via 2")).toBeNull();
    expect(ownName(" Oxford ")).toBe("Oxford");
    // A point pressed on the map has only its position for a name: its place says more.
    expect(ownName("Point at 51.7520, -1.2577")).toBeNull();
  });
});

describe("Great Britain's roads and Northern Ireland", () => {
  it("never joins a point in Northern Ireland to a road across the sea in Great Britain, and says Ireland's roads bring it", async () => {
    // The A77 from Portpatrick: Donaghadee, on the Ards peninsula, is 35 km away over the North Channel.
    const body = buildPbf({
      nodes: [
        { id: 1, lat: 54.842, lon: -5.117 },
        { id: 2, lat: 54.903, lon: -5.024 },
        { id: 3, lat: 55.0, lon: -5.0 },
      ],
      ways: [{ id: 1, refs: [1, 2, 3], tags: { highway: "trunk", ref: "A77" } }],
      relations: [],
      timestamp: Date.parse("2026-11-20T21:00:00Z") / 1000,
    });
    const data = await buildNetwork(write("galloway.osm.pbf", body));
    const file = path.join(dir, "galloway.roads");
    await writeNetworkFile(file, data, { country: "GB", name: "Galloway" });
    const graph = buildGraph([
      { network: { id: "g", name: "Galloway", country: "GB", dataDate: "2026-11-20" }, data: await readNetworkFile(file) },
    ]);
    const points = [
      { lat: 54.643, lon: -5.537, name: "Donaghadee" },
      { lat: 55.0, lon: -5.0, name: "Ballantrae road" },
    ];
    let error: unknown;
    try {
      planRoute(graph, points, {
        crossing: "any",
        units: "km",
        request: { points },
        regionOf: (code) => (code === "IE" ? "ireland-and-northern-ireland" : null),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).toMatch(/“Donaghadee” is in Northern Ireland.*Add roads for Ireland/);
    expect((error as AppError).details).toMatchObject({
      far: [{ index: 0, country: { code: "IE", regionId: "ireland-and-northern-ireland" } }],
    });
    expect(reachesNorthernIreland(data.nodeLat, data.nodeLon)).toBe(false);
  });
});

describe("joining networks and routing", () => {
  let gb: Awaited<ReturnType<typeof network>>;
  let north: Awaited<ReturnType<typeof network>>;
  let south: Awaited<ReturnType<typeof network>>;
  beforeAll(async () => {
    gb = await network("gb", greatBritain(), "GB");
    north = await network("north", franceNorth(), "FR");
    south = await network("south", franceSouth(), "FR");
  });
  const plan = (sources: Array<typeof gb>, points: Array<{ lat: number; lon: number; name: string }>, crossing = "any") =>
    planRoute(buildGraph(sources), points, { crossing, units: "km", request: { points, crossing }, now: Date.parse("2026-11-22") });

  it("joins two extracts at the nodes they share, keeping the way they both hold once", () => {
    const graph = buildGraph([north, south]);
    expect(graph.nodeCount).toBe(north.data.nodeId.length + south.data.nodeId.length - 2);
    const a5 = [...graph.ref].filter((r) => graph.strings[r] === "A5").length;
    expect(a5).toBe(2);
    const route = plan([north, south], [REIMS, CHAMONIX]);
    expect(route.legs.map((leg) => leg.title)).toEqual(OWNER_LINES_AFTER_CROSSING.slice(1));
  });

  it("joins Great Britain to France across the Channel, and lets the person choose how", () => {
    const sources = [gb, north, south];
    const quickest = plan(sources, [LEATHERHEAD, CHAMONIX]);
    expect(quickest.legs.map((leg) => leg.title)).toEqual([
      "M25",
      "M20 - Folkestone",
      "Eurotunnel, Folkestone – Calais",
      ...OWNER_LINES_AFTER_CROSSING,
    ]);
    expect(quickest.summary.crossings).toMatchObject([
      { kind: "shuttle", from: "Folkestone", to: "Calais", durationS: 2100, durationSource: "tagged" },
    ]);
    expect(quickest.summary.countries).toEqual(["GB", "FR"]);
    expect(plan(sources, [LEATHERHEAD, CHAMONIX], "eurotunnel").legs.map((l) => l.title)).toEqual(quickest.legs.map((l) => l.title));

    const byFerry = plan(sources, [LEATHERHEAD, CHAMONIX], `way/${FERRY_WAY}`);
    const titles = byFerry.legs.map((leg) => leg.title);
    expect(titles.slice(0, 4)).toEqual(["M25", "M20 - Folkestone", "A20 - Dover", "Ferry, Dover – Calais"]);
    expect(titles).not.toContain("Eurotunnel, Folkestone – Calais");
    expect(byFerry.summary.durationS).toBeGreaterThan(quickest.summary.durationS);
    expect(byFerry.legs.find((leg) => leg.kind === "crossing")!.detail).toMatch(
      /^P&O Ferries\. Booked and timetabled: 1 h 30 min on board/,
    );
  });

  it("goes through via points in order, with a line for each", () => {
    const route = plan([gb, north, south], [LEATHERHEAD, REIMS, CHAMONIX]);
    const titles = route.legs.map((leg) => leg.title);
    expect(titles).toContain("Via Reims");
    expect(titles.indexOf("Via Reims")).toBeGreaterThan(titles.indexOf("Eurotunnel, Folkestone – Calais"));
    expect(route.snapped).toHaveLength(3);
    expect(route.geometry.coordinates).toHaveLength(2);
  });

  it("says where each point joined the network, and the junctions to join and leave at", () => {
    const route = plan([gb, north, south], [LEATHERHEAD, CHAMONIX]);
    expect(route.snapped[0]).toMatchObject({ road: "A24", country: "GB" });
    expect(route.snapped[0]!.distanceM).toBeLessThan(50);
    const m25 = route.legs[0]!;
    expect(m25.joinAt?.label).toBe("J9 (Leatherhead)");
    expect(m25.leaveAt?.label).toBe("J3 (Swanley)");
    expect(m25.direction).toBe("anticlockwise");
    const a5 = route.legs.find((leg) => leg.road === "A5")!;
    expect(a5.leaveAt?.label).toBe("exit 6 (Langres)");
    expect(a5.europeanRoutes).toEqual([["E17"], ["E54"]]);
    expect(route.credit.line).toMatch(/© OpenStreetMap contributors, Open Database Licence/);
  });

  const problem = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return error as AppError;
    }
    throw new Error("It planned");
  };

  it("says plainly which country is missing, and gives each as data", () => {
    const zurich = problem(() => plan([gb, north], [LEATHERHEAD, { lat: 47.37, lon: 8.54, name: "Zürich" }]));
    // The line to Zürich crosses a corner of Germany for more than 40 km: both are named.
    expect(zurich.message).toMatch(/^Germany and Switzerland have no roads yet\. Add roads for Germany and Switzerland, then plan again\./);
    expect(zurich.details).toMatchObject({
      missing: [{ code: "DE" }, { code: "CH", name: "Switzerland", regionId: null }],
      far: [],
      reason: "point",
    });
    const reims = problem(() => plan([gb], [LEATHERHEAD, REIMS]));
    expect(reims.message).toMatch(/France has no roads yet/);
    expect((reims.details as unknown as RoadRouteProblem).missing.map((m) => m.code)).toEqual(["FR"]);
    // Several, named together.
    const both = problem(() => plan([gb], [LEATHERHEAD, { lat: 47.37, lon: 8.54, name: "Zürich" }]));
    expect(both.message).toMatch(/^France, Germany and Switzerland have no roads yet/);
    expect((both.details as unknown as RoadRouteProblem).missing.map((m) => m.code)).toEqual(["FR", "DE", "CH"]);
    // Nothing kept at all: the countries the route needs, still.
    const empty = problem(() => plan([], [LEATHERHEAD, CHAMONIX]));
    expect(empty.message).toMatch(/^United Kingdom and France have no roads yet/);
    expect(empty.details).toMatchObject({ reason: "empty", missing: [{ code: "GB" }, { code: "FR" }] });
    // France is there in part: the point is too far from what is, said with the country named.
    const far = problem(() => plan([gb, north], [LEATHERHEAD, CHAMONIX]));
    expect(far.message).toMatch(
      /“Chamonix” is more than 40 km from any main road kept for France: only north is kept\. Add roads for all of France/,
    );
    expect(far.details).toMatchObject({ missing: [], far: [{ index: 1, name: "Chamonix", country: { code: "FR" }, distanceM: 40_000 }] });
  });

  it("says which countries a route needs before it is planned, without reading a network", () => {
    const none = coverageOf([LEATHERHEAD, CHAMONIX], [], [], () => null);
    expect(none.points).toEqual([{ country: "GB" }, { country: "FR" }]);
    expect(none.countries.map((c) => [c.code, c.state])).toEqual([
      ["GB", "missing"],
      ["FR", "missing"],
    ]);
    // The Channel is in the way.
    expect(none.seaCrossing).toBe(true);
    expect(coverageOf([REIMS, CHAMONIX], [], [], () => null).seaCrossing).toBe(false);
  });

  it("reads like the owner's own list, junctions and times beside each line", () => {
    const route = plan([gb, north, south], [LEATHERHEAD, CHAMONIX]);
    expect(route.legs.map((leg) => `${leg.title} | ${leg.detail}`)).toMatchInlineSnapshot(`
      [
        "M25 | Anticlockwise, join at J9 (Leatherhead), leave at J3 (Swanley) for Folkestone, 36 km, 22 min",
        "M20 - Folkestone | Heading south-east, join at J3 (Swanley), leave at J11A (Cheriton) for Channel Tunnel, 75 km, 45 min",
        "Eurotunnel, Folkestone – Calais | Booked and timetabled: 35 min on board, check-in not included",
        "A26 (E17) - Reims (A4) | Heading south-east, 247 km, 2 h 23 min",
        "A26 (E17) - Troyes | Heading south, leave at exit 21 (Troyes-Nord), 105 km, 54 min",
        "A5 (E17 - E54) | Heading south-east, leave at exit 6 (Langres) for Dijon, 105 km, 1 h 01 min",
        "A31 - Dijon | Heading south, join at exit 6 (Langres), leave at exit 1 (Dijon-Est) for Geneve, 64 km, 37 min",
        "A39 - Geneve | Heading south, join at exit 1 (Dijon-Est), leave at exit 7 (Bourg-en-Bresse) for Geneve, 126 km, 1 h 13 min",
        "A40 (E21 E62) - Geneve | Heading east, 63 km, 37 min",
        "A40 (E25) - Chamonix | Heading south-east, leave at exit 21 (Le Fayet) for Chamonix, 53 km, 30 min",
        "N205 - Chamonix | Heading east, 16 km, 12 min, then local roads to the end",
      ]
    `);
  });
});

describe("condensed plain text", () => {
  let route: RoadRouteResult;
  beforeAll(async () => {
    const sources = [
      await network("gb2", greatBritain(), "GB"),
      await network("n2", franceNorth(), "FR"),
      await network("s2", franceSouth(), "FR"),
    ];
    route = planRoute(buildGraph(sources), [LEATHERHEAD, CHAMONIX], {
      crossing: "any",
      units: "miles",
      request: { points: [LEATHERHEAD, CHAMONIX], crossing: "any", units: "miles" },
      now: Date.parse("2026-11-22T10:00:00Z"),
    });
  });

  it("is never wider than asked, with the owner's lines in it", () => {
    for (const width of [48, 32, 20]) {
      const text = directionsAsPlainText(route, { width });
      for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(width);
    }
    const text = directionsAsPlainText(route);
    expect(text.split("\n").slice(0, 3)).toEqual([
      "Leatherhead to Chamonix",
      "Planned 22 Nov 2026",
      expect.stringMatching(/^\d+ miles, about \d+ h/),
    ]);
    for (const line of ["M25", "M20 - Folkestone", "Eurotunnel, Folkestone - Calais", ...OWNER_LINES_AFTER_CROSSING])
      expect(text.split("\n")).toContain(line);
    expect(text).toMatch(/Follow the signs and check closures/);
    expect(text).toMatch(/OpenStreetMap contributors/);
    // Plain marks only: no typographic dashes.
    expect(text).not.toMatch(/[–—‘’“”]/);
  });

  it("wraps at words and breaks a word longer than a line", () => {
    expect(wrapRoadText("Join at J9 (Leatherhead), leave at J3 (Swanley)", 20, "  ")).toEqual([
      "  Join at J9",
      "  (Leatherhead),",
      "  leave at J3",
      "  (Swanley)",
    ]);
    expect(wrapRoadText("Rhein-Main-Donau-Schnellweg", 10)).toEqual(["Rhein-Main", "-Donau-Sch", "nellweg"]);
  });

  it("writes accented places without their accents when asked", () => {
    expect(roadAsciiText("Genève – Straße “Chamonix”")).toBe('Geneve - Strasse "Chamonix"');
    const text = directionsAsPlainText({ ...route, legs: [{ ...route.legs[0]!, title: "A40 - Genève" }] }, { ascii: true });
    expect(text).toContain("A40 - Geneve");
    expect(text).toMatch(/^[\x20-\x7e\n]*$/);
  });
});

describe("the road routes API", () => {
  let app: TestApp;
  let server: http.Server;
  const standIn = createGeofabrikStandIn();
  const monaco = franceSouth();
  standIn.files.set("europe/monaco", { path: "europe/monaco", body: monaco, md5: crypto.createHash("md5").update(monaco).digest("hex") });

  beforeAll(async () => {
    server = http.createServer((request, response) => standIn.handle(request, response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    app = await createTestApp({ OUTPOST_GEOFABRIK_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  });
  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const networks = async () => (await app.api("GET", "/api/roads/networks")).body as RoadNetworksResponse;
  const location = () => app.ctx.services.storage.getDefault();

  it("builds networks from files already in storage, and keeps those files", async () => {
    fs.mkdirSync(path.join(location().path, "maps"), { recursive: true });
    for (const [name, body, country] of [
      ["gb", greatBritain(), "gb"],
      ["france-north", franceNorth(), "FR"],
    ] as const) {
      fs.writeFileSync(path.join(location().path, "maps", `${name}.osm.pbf`), body);
      const { status, body: started } = await app.api("POST", "/api/roads/networks", {
        locationId: location().id,
        relPath: `maps/${name}.osm.pbf`,
        name,
        country,
      });
      expect(status).toBe(200);
      expect(started.jobId).toBeTruthy();
    }
    await app.ctx.jobs.whenIdle();
    const list = await networks();
    expect(list.networks.map((n) => [n.name, n.country, n.dataDate, n.extract.kept])).toEqual([
      ["france-north", "FR", "2026-11-20", true],
      ["gb", "GB", "2026-11-20", true],
    ]);
    expect(fs.existsSync(path.join(location().path, "maps", "gb.osm.pbf"))).toBe(true);
    expect(list.credit.line).toMatch(/OpenStreetMap/);
  });

  it("refuses a route that reaches a country with no network, saying which", async () => {
    const { status, body } = await app.api("POST", "/api/roads/route", { points: [LEATHERHEAD, CHAMONIX] });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/Chamonix/);
    // France is kept in part (its north): the point is named, with its country, as data too.
    expect(body.error.details).toMatchObject({ missing: [], far: [{ index: 1, country: { code: "FR", name: "France" } }] });
  });

  it("says which countries a route needs and where their roads stand, from what is kept here alone", async () => {
    const { status, body } = await app.api("POST", "/api/roads/coverage", { points: [LEATHERHEAD, CHAMONIX] });
    expect(status).toBe(200);
    const coverage = body as RoadCoverageResponse;
    expect(coverage.points).toEqual([{ country: "GB" }, { country: "FR" }]);
    expect(coverage.countries.map((c) => [c.code, c.name, c.state, c.parts])).toEqual([
      ["GB", "Great Britain", "ready", []],
      ["FR", "France", "part", ["france-north"]],
    ]);
    expect(coverage.seaCrossing).toBe(true);
    // Through France to Zürich: Switzerland has none.
    const zurich = (await app.api("POST", "/api/roads/coverage", { points: [REIMS, { lat: 47.37, lon: 8.54 }] }))
      .body as RoadCoverageResponse;
    expect(zurich.countries.find((c) => c.code === "CH")).toMatchObject({ state: "missing", name: "Switzerland", progress: null });
    expect(zurich.seaCrossing).toBe(false);
    // One point is enough (Reachable from here); none, or too many, is refused.
    expect((await app.api("POST", "/api/roads/coverage", { points: [REIMS] })).body.points).toEqual([{ country: "FR" }]);
    expect((await app.api("POST", "/api/roads/coverage", { points: [] })).status).toBe(400);
    expect((await app.api("POST", "/api/roads/coverage", { points: Array(13).fill(REIMS) })).status).toBe(400);
    expect((await app.api("POST", "/api/roads/coverage", { points: [{ lat: 91, lon: 0 }] })).status).toBe(400);
  });

  it("installs a region from Geofabrik, deleting the extract once read", async () => {
    // Before Geofabrik's list is read there is nothing to choose; once read, it is there at once.
    const early = await app.api("POST", "/api/roads/networks", { regionId: "monaco" });
    expect(early.status).toBe(400);
    expect(early.body.error.message).toMatch(/Read Geofabrik's list of regions first/);
    expect((await app.api("POST", "/api/reference/regions")).status).toBe(200);
    const { status, body } = await app.api("POST", "/api/roads/networks", { regionId: "monaco" });
    expect(status).toBe(200);
    const done = await waitFor(async () => (await networks()).networks.find((n) => n.regionId === "monaco"), "the network to be built");
    expect(done).toMatchObject({ name: "Monaco", country: "MC", extract: { kept: false } });
    const download = app.ctx.services.downloads.get(body.downloadId)!;
    await waitFor(() => !fs.existsSync(app.ctx.services.storage.resolve(download.locationId, download.relPath)), "the extract to go");
  });

  it("plans a route on what is installed, lists the crossings, and saves the route with its directions", async () => {
    const crossings = (await app.api("GET", "/api/roads/crossings")).body.crossings as RoadCrossingDto[];
    expect(crossings.map((c) => [c.id, c.kind, c.joined])).toEqual([
      ["eurotunnel", "shuttle", true],
      [`way/${FERRY_WAY}`, "ferry", true],
    ]);
    const { status, body } = await app.api("POST", "/api/roads/route", {
      points: [LEATHERHEAD, { ...CHAMONIX, name: "Chamonix" }],
      crossing: `way/${FERRY_WAY}`,
      units: "miles",
    });
    expect(status).toBe(200);
    const route = body as RoadRouteResult;
    expect(route.legs.map((leg) => leg.title)).toContain("Ferry, Dover – Calais");
    expect(route.legs.at(-1)!.title).toBe("N205 - Chamonix");
    expect(route.legs[0]!.detail).toMatch(/miles/);

    const saved = (await app.api("POST", "/api/roads/routes", { name: "Chamonix by ferry", route })).body as SavedRoadRouteDto;
    expect(saved).toMatchObject({ name: "Chamonix by ferry", fromTo: "Leatherhead to Chamonix" });
    expect((await app.api("GET", "/api/roads/routes")).body.routes).toHaveLength(1);
    // Kept with its directions: it reads back with no network loaded.
    for (const n of (await networks()).networks) await app.api("DELETE", `/api/roads/networks/${n.id}`);
    expect((await networks()).networks).toEqual([]);
    const back = (await app.api("GET", `/api/roads/routes/${saved.id}`)).body as SavedRoadRouteDto;
    expect((back.route as RoadRouteResult).legs).toEqual(route.legs);
    expect(back).toMatchObject({ mode: "drive", plannedAt: route.plannedAt });
    expect((await app.api("PATCH", `/api/roads/routes/${saved.id}`, { name: "Alps" })).body.name).toBe("Alps");
    expect((await app.api("DELETE", `/api/roads/routes/${saved.id}`)).status).toBe(200);
    expect((await app.api("GET", `/api/roads/routes/${saved.id}`)).status).toBe(404);
  });

  it("says which countries the installed map regions cover, passing over a world overview", async () => {
    // Kent and the Pas-de-Calais in one box, Luxembourg in another; and the whole world.
    const { status, body } = await app.api("POST", "/api/roads/countries", {
      boxes: [
        [0.2, 50.6, 2.2, 51.4],
        [6.0, 49.6, 6.2, 49.8],
        [-180, -85, 180, 85],
      ],
    });
    expect(status).toBe(200);
    expect(new Set(body.countries)).toEqual(new Set(["GB", "FR", "LU"]));
    expect((await app.api("POST", "/api/roads/countries", { boxes: [[0, 0, 400, 0]] })).status).toBe(400);
  });

  it("checks what it is given", async () => {
    expect((await app.api("POST", "/api/roads/route", { points: [LEATHERHEAD] })).status).toBe(400);
    expect((await app.api("POST", "/api/roads/route", { points: [LEATHERHEAD, { placeId: "nope" }] })).status).toBe(400);
    expect((await app.api("POST", "/api/roads/route", { points: [LEATHERHEAD, CHAMONIX], crossing: "../etc" })).status).toBe(400);
    expect(
      (await app.api("POST", "/api/roads/networks", { locationId: location().id, relPath: "../../etc/passwd", name: "x" })).status,
    ).toBe(400);
    expect((await app.api("POST", "/api/roads/route", { points: [LEATHERHEAD, CHAMONIX] })).body.error.message).toMatch(
      /^United Kingdom and France have no roads yet/,
    );
  });
});

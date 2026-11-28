/**
 * Streets for routes: the optional streets service (Valhalla) beside Outpost's own road
 * router. A stand-in answers with replies recorded from a real Valhalla serving Great
 * Britain (fixtures/streets/valhalla-stand-in.ts), and the test plays the service's side
 * of the shared folder (status.json, request.json). Nothing reaches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import type { MapDataResponse, SavedRoadRouteDto, StreetsReachResult, StreetsRouteResult, StreetsStatusResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import type { RouteReply } from "../src/modules/streets/client.ts";
import { addressProblem } from "../src/modules/streets/connection.ts";
import { MAX_CELLS_ACROSS, mainRoadsReach, traceRings } from "../src/modules/streets/main-roads-reach.ts";
import { streetDirections, streetDistanceText, wayName } from "../src/modules/streets/narrative.ts";
import { estimateBuild, timeLeftText } from "../src/modules/streets/tiles.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { buildArchive } from "./fixtures/maps/archive.ts";
import { type Ground, groundTiles, worldOf } from "./fixtures/maps/terrain.ts";
import { greatBritain } from "./fixtures/roads/channel-trip.ts";
import {
  createValhallaStandIn,
  GB_TILESET,
  sidecarStatus,
  type ValhallaStandIn,
  writeSidecarStatus,
} from "./fixtures/streets/valhalla-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const FETCHAM = { lat: 51.2905, lon: -0.3555, name: "Fetcham" };
const DOVER = { lat: 51.1265, lon: 1.3135, name: "Dover" };
const LEATHERHEAD = { lat: 51.2965, lon: -0.3303, name: "Leatherhead" };
const BOX_HILL = { lat: 51.2556, lon: -0.3106, name: "Box Hill" };
const REIMS = { lat: 49.27, lon: 4.06, name: "Reims" };

/** Valhalla's shape encoding (polyline at six decimal places) of [lon, lat] pairs. */
function encodePolyline6(points: Array<[number, number]>): string {
  let out = "";
  let lastLat = 0;
  let lastLon = 0;
  const put = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const la = Math.round(lat * 1e6);
    const lo = Math.round(lon * 1e6);
    put(la - lastLat);
    put(lo - lastLon);
    lastLat = la;
    lastLon = lo;
  }
  return out;
}

async function installGreatBritainRoads(app: TestApp) {
  const location = app.ctx.services.storage.getDefault();
  fs.mkdirSync(path.join(location.path, "maps"), { recursive: true });
  fs.writeFileSync(path.join(location.path, "maps", "gb.osm.pbf"), greatBritain());
  const { status } = await app.api("POST", "/api/roads/networks", {
    locationId: location.id,
    relPath: "maps/gb.osm.pbf",
    name: "Great Britain",
    country: "GB",
  });
  expect(status).toBe(200);
  await app.ctx.jobs.whenIdle();
}

/** A kept country file, as Map data would have kept it. */
async function keepCountryFile(app: TestApp, regionId: string, name: string, country: string, bytes: number) {
  const location = app.ctx.services.storage.getDefault();
  const relPath = `collections/country-files/${regionId.replace(/\//g, "-")}.osm.pbf`;
  fs.mkdirSync(path.join(location.path, "collections/country-files"), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), Buffer.alloc(16));
  const row = await app.ctx.services.collections.create({
    kind: "extract",
    title: `Country file: ${name}`,
    locationId: location.id,
    relPath,
    sizeBytes: bytes,
    version: "2026-11-22",
    meta: {
      countryFile: {
        regionId,
        name,
        country,
        dataDate: "2026-11-22",
        fileName: `${regionId}.osm.pbf`,
        sourceUrl: "http://stand-in/",
        md5: null,
      },
    },
  } as never);
  return { row, file: path.join(location.path, relPath) };
}

describe("words for streets", () => {
  it("names a street the way a British driver reads it", () => {
    expect(wayName(["Guildford Road", "B2122"])).toBe("Guildford Road (B2122)");
    expect(wayName(["A24", "Leatherhead Road"])).toBe("Leatherhead Road (A24)");
    // Valhalla calls a stretch of the M6 "E 05" alone: never the road's whole name where it has another.
    expect(wayName(["M42", "E 05"])).toBe("M42 (E05)");
    expect(wayName(["E 05"])).toBe("E05");
    expect(wayName([])).toBeNull();
  });

  it("gives distances in metres or yards", () => {
    expect(streetDistanceText(312, "km")).toBe("300 m");
    expect(streetDistanceText(47, "km")).toBe("50 m");
    expect(streetDistanceText(5533, "km")).toBe("5.5 km");
    expect(streetDistanceText(183, "miles")).toBe("200 yards");
    expect(streetDistanceText(5533, "miles")).toBe("3.4 miles");
  });

  it("writes exits, roundabouts and stays from Valhalla's manoeuvres", () => {
    const m = (type: number, extra: Record<string, unknown> = {}) => ({
      type,
      instruction: "",
      length: 1,
      time: 60,
      begin_shape_index: 0,
      end_shape_index: 0,
      ...extra,
    });
    const reply = {
      trip: {
        summary: { length: 10, time: 600 },
        legs: [
          {
            summary: { length: 10, time: 600 },
            shape: "",
            maneuvers: [
              m(1, { street_names: ["Upper Fairfield Road"], bearing_after: 42 }),
              m(26, { roundabout_exit_count: 2 }),
              m(27, { street_names: ["A24"], begin_street_names: ["A24", "Leatherhead Road"] }),
              m(21, {
                street_names: ["M40"],
                sign: {
                  exit_number_elements: [{ text: "16" }],
                  exit_name_elements: [{ text: "Denham" }],
                  exit_toward_elements: [{ text: "Birmingham" }, { text: "Oxford" }],
                },
              }),
              m(23, { street_names: ["M40"] }),
              m(23, { street_names: ["E 05"] }),
              m(4),
            ],
          },
        ],
      },
    } as unknown as RouteReply;
    const lines = streetDirections(reply, { units: "km", costing: "auto" }).lines;
    expect(lines.map((l) => l.text)).toEqual([
      "Drive north-east on Upper Fairfield Road",
      "At the roundabout, take the 2nd exit onto Leatherhead Road (A24)",
      "Take exit 16 (Denham) onto M40 towards Birmingham, Oxford",
      "Keep right onto E05",
      "Arrive at the end",
    ]);
    // Leaving the roundabout and staying on the M40 count with the line before.
    expect(lines[1]!.distanceM).toBe(2000);
    expect(lines[2]!.distanceM).toBe(2000);
  });

  it("ends the streets from a door where they join the main road, not at 'the end'", () => {
    const m = (type: number, extra: Record<string, unknown> = {}) => ({
      type,
      instruction: "",
      length: 0.5,
      time: 30,
      begin_shape_index: 0,
      end_shape_index: 0,
      ...extra,
    });
    const reply = (maneuvers: unknown[]) =>
      ({
        trip: { summary: { length: 1, time: 60 }, legs: [{ summary: { length: 1, time: 60 }, shape: "", maneuvers }] },
      }) as unknown as RouteReply;
    const toMainRoad = streetDirections(
      reply([m(1, { street_names: ["Bell Lane"], bearing_after: 42 }), m(15, { street_names: ["Kingston Road", "B2430"] }), m(4)]),
      { units: "km", costing: "auto", endsOnMainRoad: "B2430" },
    );
    expect(toMainRoad.lines.map((l) => l.text)).toEqual([
      "Drive north-east on Bell Lane",
      "Turn left onto Kingston Road (B2430)",
      "Join Kingston Road (B2430), then the main roads below",
    ]);
    expect(toMainRoad.lines.at(-1)!.kind).toBe("arrive");
    // A last street with no name: the main road's number.
    const unnamed = streetDirections(reply([m(1, { bearing_after: 42 }), m(4)]), { units: "km", costing: "auto", endsOnMainRoad: "B2430" });
    expect(unnamed.lines.at(-1)!.text).toBe("Join the B2430, then the main roads below");
    // The last turn on a side street just short of the main road: the main road is named, not the side street.
    const sideStreet = streetDirections(
      reply([m(1, { street_names: ["Bell Lane"], bearing_after: 42 }), m(15, { street_names: ["Cobham Road"] }), m(4)]),
      { units: "km", costing: "auto", endsOnMainRoad: "A24" },
    );
    expect(sideStreet.lines.at(-1)!.text).toBe("Join the A24, then the main roads below");
    const onIt = streetDirections(reply([m(1, { bearing_after: 42 }), m(10, { street_names: ["A24", "Leatherhead Road"] }), m(4)]), {
      units: "km",
      costing: "auto",
      endsOnMainRoad: "A24",
    });
    expect(onIt.lines.at(-1)!.text).toBe("Join Leatherhead Road (A24), then the main roads below");
    // A via point with no name of its own: the street it is on, else its number.
    const viaReply = {
      trip: {
        summary: { length: 2, time: 120 },
        legs: [
          { summary: { length: 1, time: 60 }, shape: "", maneuvers: [m(1, { street_names: ["Bell Lane"] }), m(4)] },
          { summary: { length: 1, time: 60 }, shape: "", maneuvers: [m(1, { street_names: ["Bell Lane"] }), m(4)] },
        ],
      },
    } as unknown as RouteReply;
    expect(streetDirections(viaReply, { units: "km", costing: "pedestrian", viaNames: ["via"] }).lines[1]!.text).toBe("Via Bell Lane");
    expect(streetDirections(viaReply, { units: "km", costing: "pedestrian", viaNames: ["Mickleham"] }).lines[1]!.text).toBe(
      "Via Mickleham",
    );
    const nothing = streetDirections(reply([m(1, { bearing_after: 42 }), m(4)]), { units: "km", costing: "auto", endsOnMainRoad: null });
    expect(nothing.lines.at(-1)!.text).toBe("Then the main roads below");
  });

  it("traces areas from cells, keeping cells that touch at a corner apart", () => {
    const size = 4;
    const mask = new Uint8Array(size * size);
    mask[1 * size + 1] = 1;
    mask[2 * size + 2] = 1;
    const rings = traceRings(mask, size);
    expect(rings).toHaveLength(2);
    for (const ring of rings) expect(ring).toHaveLength(5);
    const block = new Uint8Array(size * size);
    for (const at of [5, 6, 9, 10]) block[at] = 1;
    expect(traceRings(block, size)).toEqual([
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1],
      ],
    ]);
  });

  it("says what a build costs, from the figures measured on a Pi 5", () => {
    const gb = estimateBuild([], 2_205_301_182, false, 8e9);
    expect(gb.minutes).toBe(56);
    expect(Math.round(gb.writtenBytes / 1e9)).toBe(53);
    expect(gb.measured).toBe(true);
    expect(gb.warnings.join(" ")).toMatch(/about an hour/);
    expect(gb.warnings.join(" ")).toMatch(/53 GB/);
    const france = estimateBuild([], 5_120_429_922, false, 8e9);
    expect(france.measured).toBe(false);
    expect(france.warnings.join(" ")).toMatch(/guesses/);
    const kentAndSussex = estimateBuild([], 76_786_201, true, 8e9);
    expect(kentAndSussex.minutes).toBeLessThan(5);
    expect(kentAndSussex.freeSpaceBytes).toBe(76_786_201 * 4);
    expect(estimateBuild([], 2_205_301_182, false, 4e9).warnings.join(" ")).toMatch(/4 GB of memory/);
  });

  it("counts down a build, and says it is taking longer than usual once past the estimate", () => {
    const stages = ["admins", "tiles", "extract", "swap"];
    const hour = 60 * 60_000;
    const tiles = (elapsedMs: number) => timeLeftText("Building walking and cycling (the long part)", stages, 1, hour, elapsedMs);
    expect(tiles(20 * 60_000)).toBe("Building walking and cycling (the long part): about 40 minutes left of the build");
    // The Pi's Great Britain build past an hour, the long stage still going: not "about 2 minutes left".
    expect(tiles(65 * 60_000)).toBe("Building walking and cycling (the long part): taking longer than usual");
    expect(tiles(59 * 60_000)).toBe("Building walking and cycling (the long part): taking longer than usual");
    // Packing on time, then late.
    expect(timeLeftText("Packing the streets", stages, 2, hour, 58 * 60_000)).toBe(
      "Packing the streets: about 2 minutes left of the build",
    );
    expect(timeLeftText("Packing the streets", stages, 2, hour, 70 * 60_000)).toBe("Packing the streets: taking longer than usual");
  });

  it("keeps the streets service's address on this computer or its network", () => {
    expect(addressProblem("http://valhalla:8002")).toBeUndefined();
    expect(addressProblem("http://127.0.0.1:8002")).toBeUndefined();
    expect(addressProblem("http://192.168.1.20:8002")).toBeUndefined();
    expect(addressProblem("http://valhalla.example.com:8002")).toMatch(/not this computer/);
    expect(addressProblem("ftp://valhalla")).toMatch(/http/);
  });
});

describe("without the streets service", () => {
  let app: TestApp;
  let standIn: ValhallaStandIn;
  beforeAll(async () => {
    standIn = await createValhallaStandIn();
    app = await createTestApp({ OUTPOST_VALHALLA_URL: standIn.url });
  });
  afterAll(async () => {
    await app.close();
    await standIn.close();
  });

  it("says it is not installed, offers nothing, and asks nothing of anyone", async () => {
    const { status, body } = await app.api("GET", "/api/streets/status");
    expect(status).toBe(200);
    const s = body as StreetsStatusResponse;
    expect(s.state).toBe("not-installed");
    expect(s.installed).toBe(false);
    expect(s.modes).toEqual({ driveDoor: false, walk: false, cycle: false, reach: { drive: null, walk: false, cycle: false } });
    const route = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
    expect(route.status).toBe(415);
    expect(route.body.error.message).toMatch(/optional add-on/);
    const build = await app.api("POST", "/api/streets/tiles", { regions: ["europe/great-britain"] });
    expect(build.status).toBe(400);
    expect(build.body.error.message).toMatch(/not installed/);
    const walk = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [30] });
    expect(walk.status).toBe(415);
    expect(standIn.requests).toEqual([]);
  });

  it("checks what is asked", async () => {
    const bad = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [20] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toBe("By car, choose 15, 30, 60, 90 or 120 minutes.");
    // Each way has its own times: up to 2 hours by car or bicycle, 8 hours on foot.
    const longDrive = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [240] });
    expect(longDrive.body.error.message).toBe("By car, choose 15, 30, 60, 90 or 120 minutes.");
    const longRide = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "cycle", minutes: [480] });
    expect(longRide.body.error.message).toBe("By bicycle, choose 15, 30, 60, 90 or 120 minutes.");
    const shortWalk = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [15] });
    expect(shortWalk.body.error.message).toBe("On foot, choose 30 minutes, or 1, 2, 4, 6 or 8 hours.");
    const four = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [30, 60, 120, 480] });
    expect(four.body.error.message).toMatch(/up to 3 times/);
    // An 8 hour walk is a fair question; here it fails only for want of streets.
    const longWalk = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [120, 240, 480] });
    expect(longWalk.body.error.message).toMatch(/need walking and cycling/);
    const one = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD], mode: "walk" });
    expect(one.status).toBe(400);
  });

  it("draws a drive's reach over Outpost's own main roads, labelled so", async () => {
    const none = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [15] });
    expect(none.status).toBe(400);
    expect(none.body.error.message).toMatch(/United Kingdom has no roads yet/);
    expect(none.body.error.details).toMatchObject({ missing: [{ code: "GB" }] });

    await installGreatBritainRoads(app);
    expect(((await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse).modes.reach.drive).toBe("main-roads");
    const { status, body } = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [60, 15] });
    expect(status).toBe(200);
    const reach = body as StreetsReachResult;
    expect(reach.source).toBe("main-roads");
    expect(reach.label).toBe("Main roads only");
    expect(reach.note).toMatch(/Free-flowing traffic/);
    expect(reach.settings.gridM).toBe(375);
    expect(reach.areas.features.map((f) => f.properties.minutes)).toEqual([15, 60]);
    const polygons = (f: StreetsReachResult["areas"]["features"][number]) =>
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const feature of reach.areas.features)
      for (const polygon of polygons(feature)) {
        const ring = polygon[0]!;
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
      }
    // The hour reaches along the M25 and M20 towards Folkestone (the fixture's roads); a quarter of an hour does not.
    const east = (f: StreetsReachResult["areas"]["features"][number]) =>
      Math.max(
        ...polygons(f)
          .flat(2)
          .map((p) => p[0]),
      );
    expect(east(reach.areas.features[0]!)).toBeLessThan(0.2);
    expect(east(reach.areas.features[1]!)).toBeGreaterThan(0.5);
    expect(standIn.requests).toEqual([]);
  });

  it("keeps a 2 hour drive over main roads bounded", async () => {
    const graph = await app.ctx.services.roads.loadGraph();
    const started = performance.now();
    const both = mainRoadsReach(graph, LEATHERHEAD, [15, 60, 120])!;
    const ms = performance.now() - started;
    // The 15 minute cell would make a grid about 1,280 cells across for 2 hours: it is held to 1,200 across.
    expect(both.gridM).toBeGreaterThan(375);
    expect(Math.ceil((2 * (both.join.distanceM + 120 * 60 * (120 / 3.6))) / both.gridM)).toBeLessThanOrEqual(MAX_CELLS_ACROSS);
    expect(ms).toBeLessThan(5_000);
    const alone = mainRoadsReach(graph, LEATHERHEAD, [120])!;
    expect(alone.gridM).toBe(3_000);
    // The same 2 hours whether or not 15 minutes is asked with it: drawn at its own 3 km.
    const extent = (reach: typeof alone) => {
      const area = reach.areas.at(-1)!.polygons.flat();
      return Math.max(...area.map((p) => p[0])) - Math.min(...area.map((p) => p[0]));
    };
    expect(Math.abs(extent(both) - extent(alone))).toBeLessThan(0.1);
    const { status, body } = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [30, 60, 120] });
    expect(status).toBe(200);
    const reach = body as StreetsReachResult;
    expect(reach.areas.features.map((f) => f.properties.minutes)).toEqual([30, 60, 120]);
    expect(JSON.stringify(reach).length).toBeLessThan(200_000);
  });

  it("shows no streets row in Map data", async () => {
    const data = (await app.api("GET", "/api/maps/data")).body as MapDataResponse;
    const gb = data.countries.find((c) => c.country === "GB");
    expect(gb?.rows.map((r) => r.kind)).not.toContain("streets");
  });
});

describe("with the streets service", () => {
  let app: TestApp;
  let standIn: ValhallaStandIn;
  let dir: string;
  beforeAll(async () => {
    standIn = await createValhallaStandIn();
    dir = tempDir("outpost-valhalla-");
    writeSidecarStatus(dir, sidecarStatus());
    app = await createTestApp({ OUTPOST_VALHALLA_URL: standIn.url, OUTPOST_VALHALLA_DIR: dir });
  });
  afterAll(async () => {
    await app.close();
    await standIn.close();
  });

  it("is ready, with the streets in use described", async () => {
    const s = (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;
    expect(s.state).toBe("ready");
    expect(s.tileset).toMatchObject({
      name: "Great Britain",
      countries: ["GB"],
      sizeBytes: GB_TILESET.tarBytes,
      valhalla: "3.9.3",
      dataDate: "2026-11-22",
    });
    expect(s.modes).toMatchObject({ driveDoor: true, walk: true, cycle: true, reach: { drive: "streets", walk: true, cycle: true } });
    expect(standIn.requests.map((r) => r.path)).toEqual(["/status"]);
  });

  it("walks and cycles turn by turn", async () => {
    const { status, body } = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
    expect(status).toBe(200);
    const walk = body as StreetsRouteResult;
    expect(walk.spine).toBeNull();
    expect(walk.streets!.lines[0]!.text).toBe("Take the steps");
    expect(walk.streets!.lines.map((l) => l.text)).toContain("Turn left onto Church Street (B2450)");
    expect(walk.streets!.lines.at(-1)!.text).toBe("Arrive at the end, on the left");
    expect(walk.summary.distanceM).toBe(6331);
    expect(walk.geometry.coordinates[0]!.length).toBeGreaterThan(10);
    expect(walk.credit).toMatch(/Valhalla/);
    const sent = standIn.requests.find((r) => r.path === "/route")!.body!;
    expect(sent).toMatchObject({ costing: "pedestrian", language: "en-GB", units: "kilometers" });

    const ride = (
      await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, { lat: 51.2325, lon: -0.3305 }], mode: "cycle", units: "miles" })
    ).body as StreetsRouteResult;
    expect(ride.streets!.lines[0]!.text).toMatch(/^Cycle /);
    expect(ride.streets!.lines.some((l) => /miles|yards/.test(l.distanceText))).toBe(true);
    // No terrain is installed: the time is the streets service's, on the flat, and the route says why.
    expect(walk.hills).toBeNull();
    expect(walk.warnings).toContain(
      "No terrain on this Outpost, so hills aren't counted: the time is at a steady walking pace on the flat, with no stops.",
    );
  });

  it("re-times a walk and a ride over installed terrain, with the climb, the descent and the steepest stretch", async () => {
    const flat = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" }))
      .body as StreetsRouteResult;
    // Ground rising 4% to the south of Leatherhead, towards Box Hill.
    const [, startY] = worldOf(LEATHERHEAD.lat, LEATHERHEAD.lon);
    const metresPerWorld = 40_075_016.7 * Math.cos((51.28 * Math.PI) / 180);
    const ground: Ground = (_x, y) => Math.max(0, 50 + 0.04 * (y - startY) * metresPerWorld);
    const box: [number, number, number, number] = [-0.4, 51.22, -0.26, 51.33];
    const archive = buildArchive({
      tiles: groundTiles(ground, { minZoom: 12, maxZoom: 12, bbox: box, size: 256 }),
      bounds: box,
      tileType: TileType.Png,
      tileCompression: Compression.None,
    });
    const location = app.ctx.services.storage.getDefault();
    fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
    fs.writeFileSync(path.join(location.path, "imports/hills.pmtiles"), archive.bytes);
    const imported = await app.api("POST", "/api/maps/import", {
      locationId: location.id,
      relPath: "imports/hills.pmtiles",
      name: "Surrey hills",
      tileType: "terrain",
    });
    expect(imported.status).toBe(200);

    const walk = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" }))
      .body as StreetsRouteResult;
    // The same line, the same distance; a longer time, uphill all the way.
    expect(walk.geometry).toEqual(flat.geometry);
    expect(walk.summary.distanceM).toBe(flat.summary.distanceM);
    expect(walk.hills).toMatchObject({ coverage: "terrain", flatDurationS: flat.summary.durationS, terrain: "Surrey hills" });
    // Box Hill is about 4.5 km south of the start: some 180 m up at 4%, more where the way wanders north and back.
    expect(walk.hills!.climbM).toBeGreaterThan(150);
    expect(walk.hills!.climbM - walk.hills!.descentM).toBeGreaterThan(150);
    expect(walk.hills!.climbM - walk.hills!.descentM).toBeLessThan(200);
    expect(walk.summary.durationS).toBeGreaterThan(flat.summary.durationS * 1.05);
    expect(walk.summary.durationS).toBe(walk.streets!.durationS);
    expect(walk.streets!.lines.reduce((sum, line) => sum + line.durationS, 0)).toBe(walk.summary.durationS);
    expect(walk.hills!.steepest!.gradePercent).toBeGreaterThanOrEqual(3);
    expect(walk.warnings).toContain(
      "The time counts the hills over the installed terrain (Tobler's hiking function), but no stops or rests.",
    );

    const ride = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "cycle" }))
      .body as StreetsRouteResult;
    expect(ride.hills!.climbM).toBeGreaterThan(150);
    expect(ride.warnings).toContain("The time counts the hills over the installed terrain, but no stops.");
  });

  it("asks for routes without ferries, and says so plainly when one still takes a ferry", async () => {
    // Battersea to Chelsea: the walk Valhalla's default pedestrian costing sent by river bus.
    const shape: Array<[number, number]> = [
      [-0.1854, 51.4635],
      [-0.183, 51.4655],
      [-0.1816, 51.4669],
      [-0.174, 51.475],
      [-0.1664, 51.4829],
      [-0.165, 51.484],
    ];
    const reply = {
      trip: {
        legs: [
          {
            shape: encodePolyline6(shape),
            summary: { length: 3.2, time: 1500 },
            maneuvers: [
              {
                type: 1,
                instruction: "",
                street_names: ["Lombard Road"],
                bearing_after: 20,
                length: 0.5,
                time: 360,
                begin_shape_index: 0,
                end_shape_index: 2,
              },
              {
                type: 28,
                instruction: "",
                street_names: ["RB6"],
                length: 2.0,
                time: 600,
                begin_shape_index: 2,
                end_shape_index: 4,
                ferry: true,
                travel_mode: "pedestrian",
              },
              {
                type: 29,
                instruction: "",
                begin_street_names: ["Cadogan Pier"],
                street_names: ["Cheyne Walk"],
                length: 0.7,
                time: 540,
                begin_shape_index: 4,
                end_shape_index: 5,
              },
              { type: 4, instruction: "", length: 0, time: 0, begin_shape_index: 5, end_shape_index: 5 },
            ],
          },
        ],
        summary: { length: 3.2, time: 1500, has_ferry: true },
      },
    };
    const before = standIn.requests.length;
    standIn.override = (p) => (p === "/route" ? { status: 200, body: JSON.stringify(reply) } : null);
    try {
      const walk = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" }))
        .body as StreetsRouteResult;
      const sent = standIn.requests.slice(before).find((r) => r.path === "/route")!.body!;
      expect(sent.costing_options).toEqual({ pedestrian: { use_ferry: 0 } });
      expect(walk.streets!.lines.map((l) => l.text)).toContain(
        "Take the ferry (RB6) from Lombard Road to Cadogan Pier. Check it is running: it may not be in a power cut",
      );
      expect(walk.streets!.ferries).toEqual([
        { from: "Lombard Road", to: "Cadogan Pier", name: "RB6", distanceM: 2000, coordinates: shape.slice(2, 5) },
      ]);
      expect(walk.warnings[0]).toBe(
        "This walk takes a ferry (RB6) from Lombard Road to Cadogan Pier, 2 km on the water: Outpost avoids ferries, so there is no other way on the streets built, or only a much longer one. Check the ferry is running before you set off; it may not be in a power cut.",
      );

      await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "cycle" });
      const ride = standIn.requests.filter((r) => r.path === "/route").at(-1)!.body!;
      expect(ride.costing_options).toEqual({ bicycle: { use_ferry: 0 } });
    } finally {
      standIn.override = null;
    }
    // A walk with no ferry says nothing of one.
    const plain = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" }))
      .body as StreetsRouteResult;
    expect(plain.streets!.ferries).toEqual([]);
    expect(plain.warnings.join(" ")).not.toMatch(/ferry/);
  });

  it("saves a walk with a via point as it was planned, and opens, renames and deletes it", async () => {
    const via = { lat: 51.27, lon: -0.32, name: "Mickleham" };
    const walk = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, via, BOX_HILL], mode: "walk" }))
      .body as StreetsRouteResult;
    const asked = standIn.requests.length;
    const saved = (await app.api("POST", "/api/roads/routes", { name: "Box Hill walk", route: walk })).body as SavedRoadRouteDto;
    expect(saved).toMatchObject({ name: "Box Hill walk", mode: "walk", fromTo: "Leatherhead to Box Hill", plannedAt: walk.plannedAt });
    const listed = (await app.api("GET", "/api/roads/routes")).body.routes as SavedRoadRouteDto[];
    expect(listed.find((r) => r.id === saved.id)).toMatchObject({ mode: "walk", distanceM: walk.summary.distanceM });
    const back = (await app.api("GET", `/api/roads/routes/${saved.id}`)).body as SavedRoadRouteDto;
    expect(back.route).toEqual(walk);
    // Opening it asked nothing of the streets service: the plan as made.
    expect(standIn.requests.length).toBe(asked);
    expect((await app.api("PATCH", `/api/roads/routes/${saved.id}`, { name: "Downs" })).body).toMatchObject({
      name: "Downs",
      mode: "walk",
    });
    expect((await app.api("DELETE", `/api/roads/routes/${saved.id}`)).status).toBe(200);
    // A ride and a door-to-door drive save alike, each as planned and with its way of travelling.
    const ride = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "cycle" }))
      .body as StreetsRouteResult;
    const savedRide = await app.api("POST", "/api/roads/routes", { name: "Box Hill ride", route: ride });
    expect(savedRide.status).toBe(200);
    expect(savedRide.body).toMatchObject({ mode: "cycle", fromTo: "Leatherhead to Box Hill" });
    await installGreatBritainRoads(app);
    const door = (await app.api("POST", "/api/streets/route", { points: [FETCHAM, DOVER], mode: "drive-door" })).body as StreetsRouteResult;
    expect(door.spine).toBe("main-roads");
    const savedDoor = (await app.api("POST", "/api/roads/routes", { name: "To Dover", route: door })).body as SavedRoadRouteDto;
    expect(savedDoor).toMatchObject({ mode: "drive-door", distanceM: door.summary.distanceM });
    expect((await app.api("GET", `/api/roads/routes/${savedDoor.id}`)).body.route).toEqual(door);
    for (const id of [(savedRide.body as SavedRoadRouteDto).id, savedDoor.id])
      expect((await app.api("DELETE", `/api/roads/routes/${id}`)).status).toBe(200);
    // A via point named only for its role, or pressed on the map, is named by where it is: never "Via via".
    // The recorded walk is one leg; through a via point Valhalla answers with two.
    const recordedWalk = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/streets/walk.json"), "utf8"));
    const twoLegs = { ...recordedWalk, trip: { ...recordedWalk.trip, legs: [recordedWalk.trip.legs[0], recordedWalk.trip.legs[0]] } };
    standIn.override = (p) => (p === "/route" ? { status: 200, body: JSON.stringify(twoLegs) } : null);
    try {
      for (const name of ["via", "Point at 51.2700, -0.3200"]) {
        const viaWalk = (await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, { ...via, name }, BOX_HILL], mode: "walk" }))
          .body as StreetsRouteResult;
        const viaLine = viaWalk.streets!.lines.find((l) => l.kind === "via")!;
        expect(viaLine.text).toMatch(/^Via /);
        expect(viaLine.text).not.toMatch(/^Via (via|Point at)/i);
      }
    } finally {
      standIn.override = null;
    }
    // Something not a route at all is refused.
    const odd = await app.api("POST", "/api/roads/routes", { name: "x", route: { mode: "walk" } });
    expect(odd.status).toBe(400);
  });

  it("says plainly when a point is outside the streets built", async () => {
    const { status, body } = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, REIMS], mode: "cycle" });
    expect(status).toBe(400);
    expect(body.error.message).toBe("Walking and cycling is not added for France. Add it under Offline maps.");
    const reach = await app.api("POST", "/api/streets/reach", { point: REIMS, mode: "walk", minutes: [30] });
    expect(reach.body.error.message).toMatch(/not added for France/);
  });

  it("drives door to door: Outpost's route as the spine, streets at each end", async () => {
    await installGreatBritainRoads(app);
    const before = standIn.requests.length;
    const { status, body } = await app.api("POST", "/api/streets/route", { points: [FETCHAM, DOVER], mode: "drive-door" });
    expect(status).toBe(200);
    const trip = body as StreetsRouteResult;
    expect(trip.spine).toBe("main-roads");
    expect(trip.road!.legs.map((l) => l.title)).toEqual(["M25", "M20 - Folkestone", "A20 - Dover"]);
    expect(trip.road!.legs.at(-1)!.detail).toMatch(/then the streets to the door$/);
    expect(trip.start!.lines[0]!.text).toBe("Drive north-east on Bell Lane");
    expect(trip.start!.lines.at(-1)!.kind).toBe("arrive");
    expect(trip.start!.lines.at(-1)!.text).toMatch(/^Join .+, then the main roads below$/);
    expect(trip.end!.lines.at(-1)!.text).toMatch(/^Arrive at the end/);
    expect(trip.end!.lines.map((l) => l.text)).toContain("At the roundabout, take the 3rd exit onto York Street (A256)");
    expect(trip.summary.distanceM).toBe(trip.road!.summary.distanceM + trip.start!.distanceM + trip.end!.distanceM);
    expect(trip.geometry.coordinates.length).toBe(2 + trip.road!.geometry.coordinates.length);
    // The streets service was asked for the two ends, from the doors to the joins Outpost's route made.
    const asked = standIn.requests
      .slice(before)
      .filter((r) => r.path === "/route")
      .map((r) => r.body!.locations);
    expect(asked).toContainEqual([
      { lat: FETCHAM.lat, lon: FETCHAM.lon, type: "break" },
      { lat: trip.road!.snapped[0]!.lat, lon: trip.road!.snapped[0]!.lon, type: "break" },
    ]);
    // The streets at each end avoid ferries too.
    for (const r of standIn.requests.slice(before).filter((each) => each.path === "/route"))
      expect(r.body!.costing_options).toEqual({ auto: { use_ferry: 0 } });
    expect(trip.warnings.join(" ")).not.toMatch(/straight line from the nearest main road/);
  });

  it("drives a short trip on streets all the way", async () => {
    const { body } = await app.api("POST", "/api/streets/route", { points: [FETCHAM, { lat: 51.296, lon: -0.33 }], mode: "drive-door" });
    const trip = body as StreetsRouteResult;
    expect(trip.spine).toBe("streets");
    expect(trip.road).toBeNull();
    expect(trip.streets!.lines.length).toBeGreaterThan(3);
  });

  it("draws reachable areas from the streets", async () => {
    const { status, body } = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [30, 15] });
    expect(status).toBe(200);
    const reach = body as StreetsReachResult;
    expect(reach.source).toBe("streets");
    expect(reach.label).toBe("Streets");
    expect(reach.areas.features.map((f) => f.properties.minutes)).toEqual([15, 30]);
    expect(reach.settings).toEqual({ denoise: 0.5, generalizeM: 100, gridM: null });
    const sent = standIn.requests.filter((r) => r.path === "/isochrone").at(-1)!.body!;
    expect(sent).toMatchObject({ costing: "auto", contours: [{ time: 15 }, { time: 30 }], polygons: true, denoise: 0.5, generalize: 100 });
    expect(reach.note).toBe("Free-flowing traffic, no stops: real journeys take longer.");
    // Asked for Outpost's own instead, it gives that.
    const own = (await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [15], source: "main-roads" }))
      .body as StreetsReachResult;
    expect(own.source).toBe("main-roads");
  });

  it("asks Valhalla for long walks and rides with outlines simplified for the distance, and says what the times leave out", async () => {
    const isochrone = () => standIn.requests.filter((r) => r.path === "/isochrone").at(-1)!.body!;
    const walk = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [480, 120, 240] });
    expect(walk.status).toBe(200);
    expect(isochrone()).toMatchObject({
      costing: "pedestrian",
      contours: [{ time: 120 }, { time: 240 }, { time: 480 }],
      denoise: 0.5,
      generalize: 200,
    });
    const walked = walk.body as StreetsReachResult;
    expect(walked.areas.features.map((f) => f.properties.minutes)).toEqual([120, 240, 480]);
    expect(walked.settings.generalizeM).toBe(200);
    expect(walked.note).toMatch(/steady walking pace on the flat with no stops, and no rests counted/);
    const short = (await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [30, 60] }))
      .body as StreetsReachResult;
    expect(isochrone()).toMatchObject({ contours: [{ time: 30 }, { time: 60 }], generalize: 50 });
    expect(short.note).not.toMatch(/rests/);
    await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "cycle", minutes: [30, 60, 120] });
    expect(isochrone()).toMatchObject({ costing: "bicycle", contours: [{ time: 30 }, { time: 60 }, { time: 120 }], generalize: 150 });
    await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "drive", minutes: [30, 60, 120] });
    expect(isochrone()).toMatchObject({ costing: "auto", contours: [{ time: 30 }, { time: 60 }, { time: 120 }], generalize: 200 });
    // A streets service from an older image refuses over 2 hours (Valhalla's own default): said plainly, with what to do.
    standIn.override = (p) =>
      p === "/isochrone" ? { status: 400, body: JSON.stringify({ error_code: 151, error: "Exceeded max time: 120" }) } : null;
    const old = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [480] });
    standIn.override = null;
    expect(old.status).toBe(400);
    expect(old.body.error.message).toMatch(/older than Outpost and stops at 2 hours/);
  });

  it("stops at a reply too large or too slow", async () => {
    standIn.override = (p) => (p === "/route" ? { status: 200, body: `{"trip":"${"x".repeat(5 * 1024 * 1024)}"}` } : null);
    const big = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
    expect(big.status).toBe(502);
    expect(big.body.error.message).toMatch(/too large/);
    standIn.override = (p) => (p === "/route" ? { status: 200, body: "{}" } : null);
    const odd = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
    expect(odd.body.error.message).toMatch(/not in the shape/);
    standIn.override = null;
  });

  it("lists the streets in Map data under each country they cover", async () => {
    const data = (await app.api("GET", "/api/maps/data")).body as MapDataResponse;
    const gb = data.countries.find((c) => c.country === "GB")!;
    expect(gb.rows.map((r) => r.kind)).toEqual(["map", "terrain", "names", "roads", "places", "extract", "streets"]);
    const row = gb.rows.at(-1)!.items[0]!;
    expect(row).toMatchObject({
      kind: "streets",
      state: "ready",
      sizeBytes: GB_TILESET.tarBytes,
      dataDate: "2026-11-22",
      title: "Streets for routes: Great Britain",
    });
  });
});

describe("building streets", () => {
  let app: TestApp;
  let standIn: ValhallaStandIn;
  let dir: string;
  beforeAll(async () => {
    standIn = await createValhallaStandIn();
    dir = tempDir("outpost-valhalla-");
    writeSidecarStatus(dir, sidecarStatus({ state: "idle", current: null }));
    app = await createTestApp({ OUTPOST_VALHALLA_URL: standIn.url, OUTPOST_VALHALLA_DIR: dir });
  });
  afterAll(async () => {
    await app.close();
    await standIn.close();
  });

  const status = async () => (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;

  it("has no streets yet, and offers the kept country files", async () => {
    expect((await status()).state).toBe("no-streets");
    const refused = await app.api("POST", "/api/streets/tiles", { regions: ["europe/great-britain/england/kent"] });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/no kept source file/);
    await keepCountryFile(app, "europe/great-britain/england/kent", "Kent", "GB", 54_460_111);
    await keepCountryFile(app, "europe/great-britain/england/east-sussex", "East Sussex", "GB", 22_326_090);
    expect((await status()).countryFiles.map((f) => f.name)).toEqual(["East Sussex", "Kent"]);
  });

  it("says what a build will cost before it starts", async () => {
    const { status: code, body } = await app.api("POST", "/api/streets/tiles/estimate", {
      regions: ["europe/great-britain/england/kent", "europe/great-britain/england/east-sussex"],
    });
    expect(code).toBe(200);
    expect(body).toMatchObject({ joined: true, inputBytes: 54_460_111 + 22_326_090, measured: true });
    expect(body.regions.map((r: { name: string }) => r.name)).toEqual(["Kent", "East Sussex"]);
  });

  it("asks the service to build, follows it stage by stage, and shows the new streets", async () => {
    const { status: code, body } = await app.api("POST", "/api/streets/tiles", {
      regions: ["europe/great-britain/england/kent", "europe/great-britain/england/east-sussex"],
    });
    expect(code).toBe(200);
    const jobId = body.jobId as string;
    expect(body.estimate.minutes).toBeGreaterThan(0);
    // The service takes the request.
    const requestFile = path.join(dir, "request.json");
    await waitFor(() => fs.existsSync(requestFile), "the streets service's side", 5_000);
    const request = JSON.parse(fs.readFileSync(requestFile, "utf8"));
    expect(request).toMatchObject({ id: jobId, name: "Kent and East Sussex" });
    expect(request.extracts).toHaveLength(2);
    expect(request.extracts[0]).toMatch(/kent\.osm\.pbf$/);
    expect(request.regions.map((r: { country: string }) => r.country)).toEqual(["GB", "GB"]);
    expect(request.work).toBeUndefined();
    fs.renameSync(requestFile, path.join(dir, "last-request.json"));
    const startedAt = Date.now();
    writeSidecarStatus(
      dir,
      sidecarStatus({ state: "building", id: jobId, name: "Kent and East Sussex", stage: "merge", startedAt, current: null }),
    );
    await waitFor(() => app.ctx.jobs.get(jobId)?.progressMessage?.startsWith("Joining") === true, "the streets service's side", 10_000);
    writeSidecarStatus(
      dir,
      sidecarStatus({ state: "building", id: jobId, name: "Kent and East Sussex", stage: "tiles", startedAt, current: null }),
    );
    await waitFor(
      () => app.ctx.jobs.get(jobId)?.progressMessage?.startsWith("Building walking and cycling") === true,
      "the streets service's side",
      10_000,
    );
    const during = await status();
    expect(during.build).toMatchObject({ jobId, state: "building", stage: "tiles", step: { at: 3, of: 5 } });
    const data = (await app.api("GET", "/api/maps/data")).body as MapDataResponse;
    expect(data.countries.find((c) => c.country === "GB")!.rows.at(-1)!.items[0]).toMatchObject({
      kind: "streets",
      state: "processing",
      taskId: jobId,
    });
    // Another build waits for this one.
    expect((await app.api("POST", "/api/streets/tiles", { regions: ["europe/great-britain/england/kent"] })).status).toBe(409);

    const built = {
      name: "Kent and East Sussex",
      extracts: [
        { file: "kent.osm.pbf", bytes: 54_460_111 },
        { file: "east-sussex.osm.pbf", bytes: 22_326_090 },
      ],
      builtAt: Date.now(),
      tarBytes: 102_860_800,
      valhalla: "3.9.3",
      regions: request.regions,
    };
    writeSidecarStatus(
      dir,
      sidecarStatus({ state: "ready", id: jobId, name: "Kent and East Sussex", startedAt, finishedAt: Date.now(), current: built }),
    );
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(jobId)!.state).toBe("succeeded");
    const after = await status();
    expect(after.state).toBe("ready");
    expect(after.tileset).toMatchObject({ name: "Kent and East Sussex", sizeBytes: 102_860_800, countries: ["GB"] });
    expect(after.build).toBeNull();
  });

  it("says why a build failed, with the streets in use as they were", async () => {
    const before = (await status()).tileset;
    const { body } = await app.api("POST", "/api/streets/tiles", { regions: ["europe/great-britain/england/kent"] });
    const jobId = body.jobId as string;
    await waitFor(() => fs.existsSync(path.join(dir, "request.json")), "the streets service's side", 5_000);
    fs.rmSync(path.join(dir, "request.json"));
    writeSidecarStatus(dir, {
      ...sidecarStatus({ current: before ? { ...GB_TILESET, ...{ name: before.name, tarBytes: before.sizeBytes } } : null }),
      state: "failed",
      id: jobId,
      message: "Not enough free space: building needs about 1 GB, and 0 GB is free.",
    });
    await app.ctx.jobs.whenIdle();
    const job = app.ctx.jobs.get(jobId)!;
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/Not enough free space/);
    const s = await status();
    expect(s.build).toMatchObject({ state: "failed", message: expect.stringMatching(/Not enough free space/) });
    expect(s.tileset?.name).toBe("Kent and East Sussex");
  });

  it("stops a build when the task is cancelled", async () => {
    writeSidecarStatus(dir, sidecarStatus({ state: "ready", current: { ...GB_TILESET, name: "Kent and East Sussex" } }));
    const { body } = await app.api("POST", "/api/streets/tiles", { regions: ["europe/great-britain/england/kent"] });
    const jobId = body.jobId as string;
    await waitFor(() => fs.existsSync(path.join(dir, "request.json")), "the streets service's side", 5_000);
    fs.rmSync(path.join(dir, "request.json"));
    writeSidecarStatus(
      dir,
      sidecarStatus({
        state: "building",
        id: jobId,
        stage: "tiles",
        startedAt: Date.now(),
        current: { ...GB_TILESET, name: "Kent and East Sussex" },
      }),
    );
    await waitFor(() => app.ctx.jobs.get(jobId)?.state === "running", "the streets service's side", 5_000);
    app.ctx.jobs.cancel(jobId);
    await waitFor(() => fs.existsSync(path.join(dir, "cancel")), "the streets service's side", 5_000);
    writeSidecarStatus(
      dir,
      sidecarStatus({ state: "failed", id: jobId, message: "Stopped.", current: { ...GB_TILESET, name: "Kent and East Sussex" } }),
    );
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(jobId)!.state).toBe("cancelled");
    fs.rmSync(path.join(dir, "cancel"), { force: true });
  });

  it("removes the streets in use on request", async () => {
    const pending = app.api("DELETE", "/api/streets/tiles");
    await waitFor(() => fs.existsSync(path.join(dir, "request.json")), "the streets service's side", 5_000);
    const request = JSON.parse(fs.readFileSync(path.join(dir, "request.json"), "utf8"));
    expect(request.remove).toBe(true);
    fs.rmSync(path.join(dir, "request.json"));
    writeSidecarStatus(dir, sidecarStatus({ state: "idle", id: request.id, current: null }));
    expect((await pending).status).toBe(200);
    expect((await status()).state).toBe("no-streets");
  });
});

describe("a build asked for while another runs", () => {
  let app: TestApp;
  let standIn: ValhallaStandIn;
  let dir: string;
  let data: string;
  const KENT = "europe/great-britain/england/kent";
  const SUSSEX = "europe/great-britain/england/east-sussex";
  const request = () => path.join(dir, "request.json");
  const open = async () => {
    app = await createTestApp({ OUTPOST_VALHALLA_URL: standIn.url, OUTPOST_VALHALLA_DIR: dir }, data);
  };
  beforeAll(async () => {
    standIn = await createValhallaStandIn();
    dir = tempDir("outpost-valhalla-");
    data = tempDir("outpost-queued-");
    writeSidecarStatus(dir, sidecarStatus({ state: "ready", current: GB_TILESET }));
    await open();
    await keepCountryFile(app, KENT, "Kent", "GB", 54_460_111);
    await keepCountryFile(app, SUSSEX, "East Sussex", "GB", 22_326_090);
  });
  afterAll(async () => {
    await app.close();
    await standIn.close();
  });

  /** Starts a build and has the service say it is building it. */
  async function running(regions: string[]): Promise<string> {
    const { status, body } = await app.api("POST", "/api/streets/tiles", { regions });
    expect(status, JSON.stringify(body)).toBe(200);
    const id = body.jobId as string;
    await waitFor(() => fs.existsSync(request()), "the streets service's side", 5_000);
    fs.rmSync(request());
    writeSidecarStatus(dir, sidecarStatus({ state: "building", id, stage: "tiles", startedAt: Date.now(), current: GB_TILESET }));
    await waitFor(() => app.ctx.jobs.get(id)?.state === "running", "the build to run", 5_000);
    return id;
  }
  async function finish(id: string) {
    writeSidecarStatus(dir, sidecarStatus({ state: "ready", id, finishedAt: Date.now(), current: GB_TILESET }));
  }
  const streetsItems = async () => {
    const answer = (await app.api("GET", "/api/maps/data")).body as MapDataResponse;
    return answer.countries.find((c) => c.country === "GB")?.rows.find((r) => r.kind === "streets")?.items ?? [];
  };

  it("is a task of its own, waiting and said so, that starts once the build in front has finished", async () => {
    const first = await running([KENT]);
    const asked = app.ctx.services.streets.tiles.buildOrWait({ regions: [SUSSEX] });
    expect(asked.waiting).toBe(true);
    const second = asked.jobId!;
    expect(app.ctx.jobs.get(second)).toMatchObject({ state: "queued", title: "East Sussex: walking and cycling" });
    expect((await streetsItems()).find((item) => item.taskId === second)).toMatchObject({
      state: "waiting",
      title: "Streets for routes: East Sussex",
      progress: { message: "Starts once the walking and cycling build under way (Kent) has finished." },
    });
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "streets-waiting.json"))).toBe(false);

    await finish(first);
    await waitFor(() => fs.existsSync(request()), "the waiting build's request", 10_000);
    const asked2 = JSON.parse(fs.readFileSync(request(), "utf8"));
    expect(asked2.id).toBe(second);
    expect(asked2.name).toBe("East Sussex");
    fs.rmSync(request());
    await finish(second);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(second)!.state).toBe("succeeded");
  });

  it("says what is already being built or already waiting, and queues no rebuild of it", async () => {
    const first = await running([KENT]);
    const again = await app.api("POST", "/api/streets/tiles", { regions: [KENT] });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("Walking and cycling for Kent are already being built.");
    const queued = app.ctx.services.streets.tiles.buildOrWait({ regions: [SUSSEX] });
    expect(() => app.ctx.services.streets.tiles.buildOrWait({ regions: [SUSSEX] })).toThrow(
      "Walking and cycling for East Sussex are already waiting to be built.",
    );
    expect(app.ctx.jobs.list({ states: ["queued", "running"], types: ["streets.build"] })).toHaveLength(2);
    // The one waiting can be cancelled: it never asks the service for anything.
    app.ctx.jobs.cancel(queued.jobId!);
    expect((await streetsItems()).some((item) => item.taskId === queued.jobId)).toBe(false);
    await finish(first);
    await app.ctx.jobs.whenIdle();
    expect(fs.existsSync(request())).toBe(false);
  });

  it("waits for the service to be free when the build in front is cancelled and the service is slow to stop", async () => {
    const first = await running([KENT]);
    const second = app.ctx.services.streets.tiles.buildOrWait({ regions: [SUSSEX] }).jobId!;
    app.ctx.jobs.cancel(first);
    await waitFor(() => fs.existsSync(path.join(dir, "cancel")), "the cancel", 5_000);
    // Still stopping: the second runs, waits, and says why, without writing a request over the build being stopped.
    await waitFor(() => app.ctx.jobs.get(second)?.state === "running", "the second to start", 10_000);
    await waitFor(
      () => /Waiting for the streets service to finish/.test(app.ctx.jobs.get(second)?.progressMessage ?? ""),
      "the second to say it is waiting",
      10_000,
    );
    expect(fs.existsSync(request())).toBe(false);
    fs.rmSync(path.join(dir, "cancel"), { force: true });
    writeSidecarStatus(dir, sidecarStatus({ state: "failed", id: first, message: "Stopped.", current: GB_TILESET }));
    await waitFor(() => fs.existsSync(request()), "the second's request", 15_000);
    expect(JSON.parse(fs.readFileSync(request(), "utf8")).id).toBe(second);
    fs.rmSync(request());
    await finish(second);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(second)!.state).toBe("succeeded");
  });

  it("ends with words naming the place when its source file was removed while it waited, and can be dismissed", async () => {
    const first = await running([KENT]);
    const second = app.ctx.services.streets.tiles.buildOrWait({ regions: [SUSSEX] }).jobId!;
    const kept = app.ctx.services.countryFiles.keptFiles().find(({ meta }) => meta.regionId === SUSSEX)!;
    await app.ctx.services.collections.remove(kept.row.id, { deleteFiles: true });
    await finish(first);
    await app.ctx.jobs.whenIdle();
    const failed = app.ctx.jobs.get(second)!;
    expect(failed.state).toBe("failed");
    expect(failed.error).toBe(
      "East Sussex's source file is no longer kept on a connected storage location, so walking and cycling for it cannot be built. Add East Sussex again with its source file kept, then try again.",
    );
    expect(failed.error).not.toContain(SUSSEX);
    const row = (await streetsItems()).find((item) => item.taskId === second);
    expect(row).toMatchObject({ state: "failed", reason: failed.error });
    expect((await app.api("POST", `/api/streets/builds/${second}/dismiss`)).status).toBe(200);
    expect((await streetsItems()).some((item) => item.taskId === second)).toBe(false);
    await keepCountryFile(app, SUSSEX, "East Sussex", "GB", 22_326_090);
  });

  it("is still waiting after a restart, and starts once the build in front has finished", async () => {
    const first = await running([KENT]);
    const second = app.ctx.services.streets.tiles.buildOrWait({ regions: [SUSSEX] }).jobId!;
    await app.close();
    await open();
    expect(app.ctx.jobs.get(second)!.state).toBe("queued");
    expect((await streetsItems()).find((item) => item.taskId === second)?.state).toBe("waiting");
    await waitFor(() => app.ctx.jobs.get(first)?.state === "running", "the first followed again", 10_000);
    await finish(first);
    await waitFor(() => fs.existsSync(request()), "the waiting build's request", 15_000);
    expect(JSON.parse(fs.readFileSync(request(), "utf8")).id).toBe(second);
    fs.rmSync(request());
    await finish(second);
    await app.ctx.jobs.whenIdle();
    expect(app.ctx.jobs.get(second)!.state).toBe("succeeded");
  });

  it("deletes a waiting file left by an earlier build of Outpost, and says so in the log", async () => {
    const left = path.join(app.ctx.config.dataDir, "streets-waiting.json");
    fs.writeFileSync(left, "{ not json");
    await app.close();
    await open();
    expect(fs.existsSync(left)).toBe(false);
  });
});

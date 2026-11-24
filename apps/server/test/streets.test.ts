/**
 * Streets for routes: the optional streets service (Valhalla) beside Outpost's own road
 * router. A stand-in answers with replies recorded from a real Valhalla serving Great
 * Britain (fixtures/streets/valhalla-stand-in.ts), and the test plays the service's side
 * of the shared folder (status.json, request.json). Nothing reaches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import type { MapDataResponse, StreetsReachResult, StreetsRouteResult, StreetsStatusResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RouteReply } from "../src/modules/streets/client.ts";
import { addressProblem } from "../src/modules/streets/connection.ts";
import { MAX_CELLS_ACROSS, mainRoadsReach, traceRings } from "../src/modules/streets/main-roads-reach.ts";
import { streetDirections, streetDistanceText, wayName } from "../src/modules/streets/narrative.ts";
import { estimateBuild } from "../src/modules/streets/tiles.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
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

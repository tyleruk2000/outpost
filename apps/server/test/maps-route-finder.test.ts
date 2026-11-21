import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import zlib from "node:zlib";
import {
  haversineMeters,
  pickRouteSource,
  type RoutePreview,
  type RouteSaveResponse,
  type RouteSearchResponse,
  type RouteSourcesResponse,
  readTrackSource,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.ts";
import { createHttpClient } from "../src/core/http.ts";
import { type AnnotationsService, createAnnotationsService } from "../src/modules/maps/annotations.ts";
import type { TrackCollection } from "../src/modules/maps/gpx.ts";
import { Compression, TileType } from "../src/modules/maps/pmtiles/header.ts";
import { arrangeLines, clusterLines, describeLines, joinWays, lengthOf, type Point } from "../src/modules/maps/route-finder/assemble.ts";
import { ROUTE_FINDER_USER_AGENT } from "../src/modules/maps/route-finder/index.ts";
import {
  AnswerTooLarge,
  BUSY_PAUSE_MS,
  cleanText,
  createOverpassClient,
  HANDOVER_WAIT_MS,
  namePattern,
  readAnswer,
  relationQuery,
  searchQuery,
} from "../src/modules/maps/route-finder/overpass.ts";
import { createRouteFinder, MAX_HELD_POINTS, MAX_ROUTE_POINTS } from "../src/modules/maps/route-finder/service.ts";
import { loadRouteSources, type RouteSource, routeSourcesSchema } from "../src/modules/maps/route-finder/sources.ts";
import { buildArchive, type FixtureTile } from "./fixtures/maps/archive.ts";
import {
  A,
  B,
  C,
  createOverpassStandIn,
  D,
  DATA_AS_OF,
  E,
  F,
  G,
  H,
  hugeAnswer,
  type OverpassStandIn,
  PATH_NAME,
  ROUTE_ID,
  ROUTE_NAME,
  relationAnswer,
  SECTIONED_ROUTE_ID,
  X,
} from "./fixtures/maps/overpass-answers.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const p = (point: { lat: number; lon: number }): Point => [point.lon, point.lat];
const limits = { maxRelations: 10, maxWays: 10, maxMembers: 100, maxPoints: 1000 };

// ── Joining ways into lines ─────────────────────────────────────────────────

describe("joining the ways of a route", () => {
  const a: Point = [0, 0];
  const b: Point = [0.01, 0];
  const c: Point = [0.02, 0];
  const d: Point = [0.03, 0];
  const e: Point = [0.04, 0];

  it("joins ways in order into one line", () => {
    expect(
      joinWays(
        [
          [a, b],
          [b, c],
          [c, d],
        ],
        { ordered: true },
      ),
    ).toEqual([[a, b, c, d]]);
  });

  it("turns a way that was drawn the other way round", () => {
    expect(
      joinWays(
        [
          [a, b],
          [c, b],
          [c, d],
        ],
        { ordered: true },
      ),
    ).toEqual([[a, b, c, d]]);
  });

  it("turns the first way when it is the one drawn backwards", () => {
    expect(
      joinWays(
        [
          [b, a],
          [b, c],
        ],
        { ordered: true },
      ),
    ).toEqual([[a, b, c]]);
    expect(
      joinWays(
        [
          [b, a],
          [c, b],
        ],
        { ordered: true },
      ),
    ).toEqual([[a, b, c]]);
  });

  it("joins ways that are listed out of order", () => {
    expect(
      joinWays(
        [
          [a, b],
          [c, d],
          [b, c],
        ],
        { ordered: true },
      ),
    ).toEqual([[a, b, c, d]]);
    expect(
      joinWays(
        [
          [d, e],
          [a, b],
          [c, d],
          [c, b],
        ],
        { ordered: true },
      ),
    ).toHaveLength(1);
    expect(
      joinWays(
        [
          [d, e],
          [a, b],
          [c, d],
          [c, b],
        ],
        { ordered: true },
      )[0],
    ).toHaveLength(5);
  });

  it("never draws across a gap: ways that do not meet stay two lines", () => {
    const lines = joinWays(
      [
        [a, b],
        [c, d],
      ],
      { ordered: true },
    );
    expect(lines).toEqual([
      [a, b],
      [c, d],
    ]);
    expect(describeLines(lines)).toEqual({ gaps: 1, largestGapMeters: Math.round(haversineMeters(0, 0.01, 0, 0.02)), branches: 0 });
    // The straight line from b to c is in neither.
    expect(lengthOf(lines)).toBeCloseTo(haversineMeters(0, 0, 0, 0.01) * 2, 3);
  });

  it("treats ends that are nearly, but not exactly, the same point as a gap", () => {
    const nearlyB: Point = [0.0100001, 0];
    expect(
      joinWays(
        [
          [a, b],
          [nearlyB, c],
        ],
        { ordered: true },
      ),
    ).toHaveLength(2);
  });

  it("keeps a branch as a line of its own, touching the line it leaves", () => {
    const spur: Point = [0.02, 0.01];
    const lines = joinWays(
      [
        [a, b],
        [b, c],
        [c, d],
        [c, spur],
      ],
      { ordered: true },
    );
    expect(lines).toEqual([
      [a, b, c, d],
      [c, spur],
    ]);
    expect(describeLines(lines)).toEqual({ gaps: 0, largestGapMeters: 0, branches: 1 });
  });

  it("joins two of three ends that meet at a fork and leaves the third", () => {
    const fork: Point = [0.02, 0.01];
    const lines = joinWays(
      [
        [a, b],
        [b, c],
        [b, fork],
      ],
      { ordered: false },
    );
    expect(lines).toHaveLength(2);
    expect(lines.reduce((total, line) => total + line.length, 0)).toBe(5);
    expect(describeLines(lines).branches).toBe(1);
  });

  it("joins ways that only share a name, whatever order they come in", () => {
    const lines = joinWays(
      [
        [c, d],
        [b, a],
        [c, b],
      ],
      { ordered: false },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(4);
  });

  it("leaves a loop closed and does not join anything to a way with fewer than two points", () => {
    expect(
      joinWays(
        [
          [a, b],
          [b, c],
          [c, a],
        ],
        { ordered: true },
      ),
    ).toEqual([[a, b, c, a]]);
    expect(joinWays([[a], [], [a, b]], { ordered: true })).toEqual([[a, b]]);
  });

  it("puts lines in walking order and turns them to follow on, without joining them", () => {
    const far: Point = [0.05, 0];
    const farther: Point = [0.06, 0];
    // The second line is listed last and drawn backwards.
    const arranged = arrangeLines([
      [a, b],
      [farther, far],
      [d, c],
    ]);
    expect(arranged).toEqual([
      [a, b],
      [c, d],
      [far, farther],
    ]);
  });

  it("tells paths with the same name on different hills apart", () => {
    const near: Point = [0.0105, 0]; // about 55 m beyond b
    const elsewhere: Point[] = [
      [1, 1],
      [1.01, 1],
    ];
    const clusters = clusterLines([[a, b], [near, c], elsewhere], 300);
    expect(clusters.map((cluster) => cluster.sort())).toEqual([[0, 1], [2]]);
  });

  it("joins ten thousand ways listed backwards in well under a second", () => {
    const ways: Point[][] = [];
    for (let index = 9999; index >= 0; index -= 1)
      ways.push([
        [index * 0.0001, 0],
        [(index + 1) * 0.0001, 0],
      ]);
    const started = performance.now();
    const lines = joinWays(ways, { ordered: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(10001);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

// ── What is sent, and how an answer is read ─────────────────────────────────

describe("the question sent to a route source", () => {
  it("sends letters, digits, spaces, apostrophes and hyphens, and turns everything else into 'any character'", () => {
    expect(namePattern("Llanberis Path")).toBe("Llanberis Path");
    expect(namePattern("  Miners’   Track ")).toBe("Miners' Track");
    expect(namePattern("Coast-to-Coast")).toBe("Coast-to-Coast");
    expect(namePattern('x"];out;node(1);//')).toBe("x...out.node.1....");
    expect(namePattern("a\\b[c]{2}(d)|e*+?^$")).toBe("a.b.c..2..d..e.....");
    expect(namePattern("Čertova stěna")).toBe("Čertova stěna");
  });

  it("cannot be made to end the quoted name or add a statement", () => {
    const query = searchQuery({
      pattern: namePattern('"];relation(1);out geom;//'),
      bbox: [-3.2, 54.4, -3, 54.6],
      maxRoutes: 41,
      maxWays: 400,
    });
    // What was typed sits inside the two quoted patterns Outpost wrote, and added no statement of its own.
    expect(query).toContain('~"...relation.1..out geom...",i]');
    const statements = query.split("\n").map((line) => /^[.a-z]+/.exec(line)?.[0] ?? line);
    expect(statements).toEqual(["[out:json][timeout:25][maxsize:67108864];", "relation", ".routes", ".routes", "out", "way", "out"]);
    expect(query.match(/;/g)).toHaveLength(7);
    expect(query.match(/"/g)).toHaveLength(
      searchQuery({ pattern: "abc", bbox: [-3.2, 54.4, -3, 54.6], maxRoutes: 41, maxWays: 400 }).match(/"/g)!.length,
    );
  });

  it("asks for routes by name and view, their lengths, and named paths only inside a view", () => {
    const both = searchQuery({ pattern: "Kestrel", bbox: [-3.2, 54.4, -3, 54.6], maxRoutes: 41, maxWays: 400 });
    expect(both).toContain("[out:json][timeout:25][maxsize:67108864];");
    expect(both).toContain("(54.40000,-3.20000,54.60000,-3.00000)");
    expect(both).toContain('"route"~"^(hiking|foot|walking|running|bicycle|mtb|horse)$"');
    expect(both).toContain("convert length");
    expect(both).toContain('way["highway"~"^(path|footway|bridleway|cycleway|track|steps)$"]["name"~"Kestrel",i]');
    const byName = searchQuery({ pattern: "Kestrel", maxRoutes: 41, maxWays: 400 });
    expect(byName).not.toContain("way[");
    const byView = searchQuery({ bbox: [-3.2, 54.4, -3, 54.6], maxRoutes: 41, maxWays: 400 });
    expect(byView).not.toContain("way[");
    expect(byView).not.toContain("name");
    expect(relationQuery(9001, 101)).toContain('relation(9001)["type"~"^(route|superroute)$"];');
  });

  it("makes names plain text of a sensible length", () => {
    expect(cleanText("  Miners'\u0000 Track\n\t(east)  ")).toBe("Miners' Track (east)");
    expect(cleanText("abc‮dcba")).toBe("abc dcba");
    expect(cleanText("x".repeat(500))).toHaveLength(200);
    expect(cleanText(42)).toBeNull();
    expect(cleanText("   ")).toBeNull();
  });
});

describe("reading an answer", () => {
  it("keeps what was asked for and passes over the rest", () => {
    const answer = readAnswer(relationAnswer, limits);
    expect(answer.dataAsOf).toBe(DATA_AS_OF);
    expect(answer.relations).toHaveLength(1);
    const relation = answer.relations[0]!;
    // Only the tags Outpost reads are kept; markup in a tag it does not read never gets in.
    expect(Object.keys(relation.tags).sort()).toEqual(["from", "name", "name:cy", "network", "route", "to", "type"]);
    expect(relation.members.map((member) => member.type)).toEqual(["node", "way", "way", "way", "way", "way", "way", "way", "way"]);
    // The point that is nowhere on Earth is dropped, and counted.
    const broken = relation.members.find((member) => member.ref === 15)!;
    expect(broken.runs).toHaveLength(1);
    expect(broken.runs[0]).toHaveLength(3);
    expect(broken.dropped).toBe(1);
    expect(relation.members.find((member) => member.ref === 19)!.runs).toEqual([]);
  });

  it("splits a way at a point that cannot be, and draws nothing across it", () => {
    const answer = readAnswer(
      { elements: [{ type: "way", id: 5, geometry: [A, B, { lat: "54.5", lon: -3 }, null, C, D, { lat: 91, lon: 0 }, E] }] },
      limits,
    );
    expect(answer.ways[0]!.runs).toEqual([
      [p(A), p(B)],
      [p(C), p(D)],
    ]);
    // Three unusable points, and E, which was left on its own with nothing to join.
    expect(answer.ways[0]!.dropped).toBe(4);
  });

  it("refuses ids, boxes and lengths that cannot be", () => {
    const answer = readAnswer(
      {
        osm3s: { timestamp_osm_base: "yesterday" },
        elements: [
          { type: "relation", id: 1.5, tags: { name: "fractional" } },
          { type: "relation", id: "7", tags: { name: "a string" } },
          { type: "relation", id: 2 ** 60, tags: { name: "too big" } },
          { type: "relation", id: 3, bounds: { minlat: 10, minlon: 5, maxlat: 9, maxlon: 6 }, tags: { name: 7, route: "hiking" } },
          { type: "length", id: 3, tags: { m: "-4" } },
          { type: "length", id: 3, tags: { m: "NaN" } },
          { type: "length", id: 4, tags: { m: "12.5" } },
        ],
      },
      limits,
    );
    expect(answer.dataAsOf).toBeNull();
    expect(answer.relations).toEqual([{ id: 3, tags: { route: "hiking" }, bounds: null, members: [] }]);
    expect([...answer.lengths]).toEqual([[4, 12.5]]);
  });

  it("stops at its limits instead of reading on", () => {
    const way = (id: number, points: number) => ({
      type: "way",
      id,
      geometry: Array.from({ length: points }, (_unused, index) => ({ lat: index * 0.001, lon: 0 })),
    });
    expect(() => readAnswer({ elements: [way(1, 600), way(2, 600)] }, limits)).toThrow(AnswerTooLarge);
    expect(() => readAnswer({ elements: Array.from({ length: 11 }, (_unused, index) => way(index + 1, 2)) }, limits)).toThrow(
      AnswerTooLarge,
    );
    const members = Array.from({ length: 101 }, (_unused, index) => ({ type: "way", ref: index + 1, role: "" }));
    expect(() => readAnswer({ elements: [{ type: "relation", id: 1, members }] }, limits)).toThrow(AnswerTooLarge);
    expect(() => readAnswer("<html>", limits)).toThrow(AppError);
    expect(() => readAnswer({ remark: "no elements" }, limits)).toThrow(AppError);
  });
});

// ── Where a search may be sent ──────────────────────────────────────────────

describe("route sources", () => {
  const repoCatalog = path.resolve(import.meta.dirname, "../../../catalog");
  let dir: string;
  beforeEach(() => {
    dir = tempDir("outpost-route-sources-");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const writeOwn = (content: unknown) => {
    fs.mkdirSync(path.join(dir, "data", "catalog", "routes"), { recursive: true });
    fs.writeFileSync(path.join(dir, "data", "catalog", "routes", "route-sources.json"), JSON.stringify(content));
  };
  const own = (id: string, endpoint: string) => ({
    id,
    name: `Own ${id}`,
    type: "overpass",
    endpoint,
    operator: "Me",
    coverage: "My valley",
    termsUrl: "https://example.org/terms",
    lastVerified: "2026-11-16",
  });

  it("ships a file that is valid, https only, with a default that exists", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(repoCatalog, "route-sources.json"), "utf8"));
    expect(() => routeSourcesSchema.parse(raw)).not.toThrow();
    const loaded = loadRouteSources({ catalogDir: repoCatalog, dataDir: path.join(dir, "data") });
    expect(loaded.problems).toEqual([]);
    expect(loaded.sources.length).toBeGreaterThan(0);
    // No default is named: the source is chosen by where the map is.
    expect(loaded.defaultId).toBeNull();
    const pick = (lat: number, lon: number) => pickRouteSource(loaded.sources, loaded.defaultId, { lat, lon })?.id;
    expect(pick(53.07, -4.08)).toBe("dresel-europe"); // Snowdon
    expect(pick(36.1, -112.1)).toBe("dresel-north-america"); // the Grand Canyon
    expect(pick(-43.6, 170.1)).toBe("private-coffee"); // Aoraki / Mount Cook
    expect(pick(19.4, -99.1)).toBe("private-coffee"); // Mexico City: outside the box drawn for North America
    expect(pickRouteSource(loaded.sources, null, null)?.id).toBe("private-coffee");
    expect(pickRouteSource(loaded.sources, "dresel-europe", { lat: -43.6, lon: 170.1 })?.id).toBe("dresel-europe");
    expect(pickRouteSource([], null, null)).toBeNull();
    for (const source of loaded.sources) {
      expect(source.endpoint.startsWith("https://")).toBe(true);
      expect(source.data.attribution).toBe("© OpenStreetMap contributors");
      expect(raw.sources.find((item: { id: string }) => item.id === source.id).termsNote.length).toBeGreaterThan(40);
    }
  });

  it("adds a person's own sources after the shipped ones, and lets them choose the default", () => {
    writeOwn({
      schemaVersion: 1,
      defaultSource: "valley",
      sources: [own("valley", "http://overpass.lan:12345/api/interpreter"), own("private-coffee", "https://elsewhere.example/api")],
    });
    const loaded = loadRouteSources({ catalogDir: repoCatalog, dataDir: path.join(dir, "data") });
    expect(loaded.defaultId).toBe("valley");
    const valley = loaded.sources.find((source) => source.id === "valley")!;
    expect(valley).toMatchObject({
      host: "overpass.lan:12345",
      allowHost: "overpass.lan",
      endpoint: "http://overpass.lan:12345/api/interpreter",
    });
    // A shipped source cannot be replaced by one that takes its id.
    expect(loaded.sources.find((source) => source.id === "private-coffee")!.host).toBe("overpass.private.coffee");
    expect(loaded.problems).toEqual(['Two route sources use the id "private-coffee"; the second was skipped.']);
  });

  it("can leave the shipped sources out altogether", () => {
    writeOwn({ schemaVersion: 1, replaceShipped: true, sources: [own("valley", "https://overpass.example.org/api/interpreter")] });
    const loaded = loadRouteSources({ catalogDir: repoCatalog, dataDir: path.join(dir, "data") });
    expect(loaded.sources.map((source) => source.id)).toEqual(["valley"]);
    expect(loaded.defaultId).toBeNull();
    expect(pickRouteSource(loaded.sources, loaded.defaultId, null)?.id).toBe("valley");
  });

  it("says what is wrong with a file it cannot use, and uses none of it", () => {
    writeOwn({ schemaVersion: 1, sources: [own("valley", "ftp://overpass.example.org/api")] });
    const loaded = loadRouteSources({ catalogDir: path.join(dir, "no-catalog"), dataDir: path.join(dir, "data") });
    expect(loaded.sources).toEqual([]);
    expect(loaded.defaultId).toBeNull();
    expect(loaded.problems).toHaveLength(1);
    expect(loaded.problems[0]).toContain("is not a route source file Outpost can use");
    for (const endpoint of ["https://user:secret@overpass.example.org/api", "https://overpass.example.org/api?key=1", "not a url"]) {
      writeOwn({ schemaVersion: 1, sources: [own("valley", endpoint)] });
      expect(loadRouteSources({ catalogDir: path.join(dir, "no-catalog"), dataDir: path.join(dir, "data") }).sources).toEqual([]);
    }
  });
});

// ── The whole thing, against a stand-in source ──────────────────────────────

let standIn: OverpassStandIn;
let server: http.Server;
let port: number;

beforeAll(async () => {
  standIn = createOverpassStandIn({ slowMs: 1500 });
  server = http.createServer((request, response) => standIn.handle(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

/** A server whose only route source is the stand-in (or whatever `endpoint` says). */
async function appWithSource(
  endpoint = `http://127.0.0.1:${port}/overpass/api/interpreter`,
  env: Record<string, string> = {},
): Promise<TestApp> {
  const dir = tempDir("outpost-test-");
  fs.mkdirSync(path.join(dir, "data", "catalog", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "data", "catalog", "routes", "route-sources.json"),
    JSON.stringify({
      schemaVersion: 1,
      sources: [
        {
          id: "stand-in",
          name: "Stand-in",
          type: "overpass",
          endpoint,
          operator: "Outpost tests",
          coverage: "A made-up hillside",
          bbox: [-4, 54, -2, 55],
          termsUrl: "https://example.org/terms",
          lastVerified: "2026-11-16",
        },
      ],
    }),
  );
  const app = await createTestApp(env, dir);
  return {
    ...app,
    async close() {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const VIEW = [-3.3, 54.35, -3, 54.6];

describe("finding a route and adding it", () => {
  let app: TestApp;
  beforeEach(async () => {
    standIn.requests.length = 0;
    app = await appWithSource();
  });
  afterEach(() => app.close());

  it("lists the declared sources with the credit their data needs, and never the address a question is posted to", async () => {
    const { status, body } = await app.api<RouteSourcesResponse>("GET", "/api/maps/route-sources");
    expect(status).toBe(200);
    expect(body.defaultId).toBeNull();
    expect(body.sources).toEqual([
      {
        id: "stand-in",
        name: "Stand-in",
        host: `127.0.0.1:${port}`,
        operator: "Outpost tests",
        coverage: "A made-up hillside",
        bbox: [-4, 54, -2, 55],
        termsUrl: "https://example.org/terms",
        data: {
          name: "OpenStreetMap",
          attribution: "© OpenStreetMap contributors",
          license: "Open Database Licence (ODbL) 1.0",
          licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
          url: "https://www.openstreetmap.org/copyright",
        },
      },
    ]);
    expect(standIn.requests).toHaveLength(0);
  });

  it("searches with one request that says who is asking and nothing about the person", async () => {
    const { status, body } = await app.api<RouteSearchResponse>("POST", "/api/maps/route-search", { text: " kestrel ", bbox: VIEW });
    expect(status).toBe(200);
    expect(standIn.requests).toHaveLength(1);
    const sent = standIn.requests[0]!;
    expect(sent.method).toBe("POST");
    expect(sent.path).toBe("/overpass/api/interpreter");
    expect(sent.headers["user-agent"]).toBe(ROUTE_FINDER_USER_AGENT);
    expect(sent.headers["user-agent"]).toMatch(/^Outpost\/\d+\.\d+\.\d+ \(/);
    expect(sent.headers["content-type"]).toContain("application/x-www-form-urlencoded");
    expect(sent.headers.cookie).toBeUndefined();
    expect(sent.headers.referer).toBeUndefined();
    expect(sent.query).toContain('~"kestrel",i](54.35000,-3.30000,54.60000,-3.00000)');

    expect(body.source).toEqual({ id: "stand-in", name: "Stand-in", host: `127.0.0.1:${port}` });
    expect(body.dataAsOf).toBe(DATA_AS_OF);
    expect(body.includedPaths).toBe(true);
    expect(body.truncated).toBe(false);
    expect(body.results.map((result) => [result.name, result.kind, result.lengthMeters, result.wayCount])).toEqual([
      // Both names start with what was typed; the one centred nearer the middle of the view comes first.
      ["Kestrel Valley Cycleway", "cycling", 48211, null],
      [ROUTE_NAME, "walking", 3413, null],
      // The three ways that make one path, then the way of the same name on another hill.
      [PATH_NAME, "path", expect.any(Number), 3],
      [PATH_NAME, "path", expect.any(Number), 1],
    ]);
    const route = body.results[1]!;
    expect(route).toMatchObject({
      ref: { type: "relation", id: ROUTE_ID },
      network: "local",
      from: "Kestrel Bridge",
      to: "The Cairn",
      otherNames: [],
    });
    expect(route.bounds).toEqual([-3.105, 54.5, -3.09, 54.523]);
    expect(body.results[0]).toMatchObject({ network: "regional" });
    expect(body.results[2]!.ref).toEqual({ type: "ways", ids: [21, 22, 23] });
    // Ways named like the route, lying along it, are not listed as a second "Kestrel Ridge Path".
    expect(body.results.filter((result) => result.name === ROUTE_NAME)).toHaveLength(1);
  });

  it("shows a name in another language when that is the one that matched", async () => {
    const { body } = await app.api<RouteSearchResponse>("POST", "/api/maps/route-search", { text: "Llwybr Crib", bbox: VIEW });
    expect(body.results.find((result) => result.name === ROUTE_NAME)).toMatchObject({ otherNames: ["Llwybr Crib y Cudyll"] });
  });

  it("says plainly what it will not search for", async () => {
    const cases: Array<[unknown, string]> = [
      [{}, "Type part of a route's name, or search the map view."],
      [{ text: "ab" }, "Type at least 3 letters of the route's name."],
      [{ text: "?? !!" }, "Type at least 3 letters of the route's name."],
      [{ text: "x".repeat(81) }, "Search for at most 80 characters of a name."],
      [{ bbox: [-6, 50, 2, 56] }, "That is too much of the map to search at once. Zoom in, or search by name without the map view."],
      [{ text: "kestrel", sourceId: "somewhere-else" }, "That route source is not one of the sources declared for this Outpost."],
    ];
    for (const [body, message] of cases) {
      const response = await app.api("POST", "/api/maps/route-search", body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.message).toContain(message);
    }
    expect(standIn.requests).toHaveLength(0);
  });

  it("only searches for a request from Outpost's own pages", async () => {
    const response = await app.app.inject({
      method: "POST",
      url: "/api/maps/route-search",
      payload: { text: "kestrel" },
      headers: { host: "localhost", origin: "https://elsewhere.example", "sec-fetch-site": "cross-site" },
    });
    expect(response.statusCode).toBe(403);
    expect(standIn.requests).toHaveLength(0);
  });

  it("previews a route as lines: ways turned and put in order, a gap left open, a branch kept apart", async () => {
    const { status, body } = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", {
      ref: { type: "relation", id: ROUTE_ID },
    });
    expect(status).toBe(200);
    expect(standIn.requests).toHaveLength(1);
    expect(standIn.requests[0]!.query).toContain(`relation(${ROUTE_ID})`);
    expect(body).toMatchObject({ name: ROUTE_NAME, kind: "walking", gaps: 1, branches: 1, wayCount: 8, dataAsOf: DATA_AS_OF });
    expect(body.lines).toHaveLength(3);
    // A to E as one line through the reversed and the out-of-order ways, in walking order.
    const main = body.lines[0]!;
    expect(main).toHaveLength(9);
    for (const [index, junction] of [A, B, C, D, E].entries()) expect(main[index * 2]).toEqual(p(junction));
    // Then the part beyond the gap, starting at the end nearer to E, and nothing between E and F.
    expect(body.lines[1]![0]).toEqual(p(F));
    expect(body.lines[1]!.at(-1)).toEqual(p(G));
    expect(body.largestGapMeters).toBe(Math.round(haversineMeters(E.lat, E.lon, F.lat, F.lon)));
    // The spur from D is its own line.
    expect(new Set([JSON.stringify(body.lines[2]![0]), JSON.stringify(body.lines[2]!.at(-1))])).toEqual(
      new Set([JSON.stringify(p(D)), JSON.stringify(p(H))]),
    );
    // The length is the length of the ways and no more: the gap is not counted.
    const waysOnly = lengthOf(body.lines as Point[][]);
    expect(body.lengthMeters).toBe(Math.round(waysOnly));
    // The alternative leg is offered separately.
    expect(body.alternatives.lines).toEqual([[p(B), p(X), p(C)]]);
    // What was left out is said: the impossible point, and the way with no points.
    expect(body.skipped).toEqual({ points: 1, unusableWays: 1 });
    expect(body.credit).toMatchObject({
      provider: "openstreetmap",
      attribution: "© OpenStreetMap contributors",
      license: "Open Database Licence (ODbL) 1.0",
      url: `https://www.openstreetmap.org/relation/${ROUTE_ID}`,
      element: `relation ${ROUTE_ID}`,
      relationId: ROUTE_ID,
      dataAsOf: DATA_AS_OF,
      server: `127.0.0.1:${port}`,
    });
    expect(body.token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("adds a previewed route as a track like any other, without asking the source again, and its credit travels with it", async () => {
    const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
    const added = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token, color: "violet" });
    expect(added.status).toBe(200);
    expect(standIn.requests).toHaveLength(1);
    // No terrain is installed in this test, so there are no heights, and that is said.
    expect(added.body.elevation).toBe("none");
    expect(added.body.track).toMatchObject({ name: ROUTE_NAME, color: "violet", ascentMeters: null, sourceFilename: null });
    expect(added.body.track.distanceMeters).toBeCloseTo(preview.body.lengthMeters, -1);
    expect(added.body.track.description).toMatch(
      /^From OpenStreetMap \(relation 9001\), fetched \d{1,2} \w+ \d{4} from 127\.0\.0\.1:\d+\. © OpenStreetMap contributors, Open Database Licence \(ODbL\) 1\.0: https:\/\/www\.openstreetmap\.org\/copyright$/,
    );

    const list = await app.api<{ tracks: Array<{ id: string }> }>("GET", "/api/maps/tracks");
    expect(list.body.tracks.map((track) => track.id)).toEqual([added.body.track.id]);
    const stored = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${added.body.track.id}`);
    const collection = stored.body.track.geojson as unknown as TrackCollection;
    // The alternative leg was not asked for.
    expect(collection.features).toHaveLength(3);
    expect(collection.features.every((feature) => feature.geometry.type === "LineString")).toBe(true);
    expect(readTrackSource(collection)).toEqual(preview.body.credit);

    // It is found by the app-wide search, like any route.
    await app.ctx.jobs.whenIdle();
    const found = await app.api("GET", "/api/search?q=Kestrel");
    expect(JSON.stringify(found.body)).toContain(added.body.track.id);

    // The same preview cannot be added twice: asking again gives the route that was made, not a second one.
    const again = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token });
    expect(again.status).toBe(200);
    expect(again.body.track.id).toBe(added.body.track.id);
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toHaveLength(1);
  });

  it("makes one route when the same preview is added twice at once, and gives both the same route", async () => {
    const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
    // A double click, or a retry while a long route's heights are still being read.
    const [first, second] = await Promise.all([
      app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token, includeAlternatives: true }),
      app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token, includeAlternatives: true }),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.track.id).toBe(first.body.track.id);
    const list = await app.api<{ tracks: Array<{ id: string }> }>("GET", "/api/maps/tracks");
    expect(list.body.tracks.map((track) => track.id)).toEqual([first.body.track.id]);

    // Asked again after it is done (the first answer was lost on the way), it is the same route still, as it is now.
    await app.api("PATCH", `/api/maps/tracks/${first.body.track.id}`, { name: "Renamed since" });
    const later = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token });
    expect(later.status).toBe(200);
    expect(later.body.track).toMatchObject({ id: first.body.track.id, name: "Renamed since" });
    expect(later.body.elevation).toBe(first.body.elevation);
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toHaveLength(1);
    expect(standIn.requests).toHaveLength(1);

    // Once that route has been removed there is nothing to give, and nothing is made in its place.
    expect((await app.api("DELETE", `/api/maps/tracks/${first.body.track.id}`)).status).toBeLessThan(300);
    const gone = await app.api("POST", "/api/maps/route-search/add", { token: preview.body.token });
    expect(gone.status).toBe(409);
    expect(gone.body.error.message).toBe("That preview is no longer held. Choose the route again to fetch it afresh, then add it.");
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
  });

  it("still holds the first preview after a person has stepped through the sections of a long trail", async () => {
    // The screen offers "Add" for every preview it fetched in the last quarter of an hour, so the server holds them all.
    const tokens: string[] = [];
    for (let section = 0; section < 6; section += 1) {
      const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
      tokens.push(preview.body.token);
    }
    expect(new Set(tokens).size).toBe(6);
    const added = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: tokens[0] });
    expect(added.status).toBe(200);
    // The source was asked for each preview and not again for the add.
    expect(standIn.requests).toHaveLength(6);
  });

  it("writes the credit into the GPX export in the fields GPX has for it", async () => {
    const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
    const added = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", {
      token: preview.body.token,
      includeAlternatives: true,
    });
    const exported = await app.app.inject({
      method: "GET",
      url: `/api/maps/tracks/${added.body.track.id}/export.gpx`,
      headers: { host: "localhost" },
    });
    const gpx = exported.body;
    const year = new Date().getUTCFullYear();
    expect(gpx).toContain(
      `    <copyright author="OpenStreetMap contributors">\n      <year>${year}</year>\n      <license>https://opendatacommons.org/licenses/odbl/1-0/</license>\n    </copyright>\n` +
        `    <link href="https://www.openstreetmap.org/copyright">\n      <text>© OpenStreetMap contributors, Open Database Licence (ODbL) 1.0</text>\n    </link>\n  </metadata>`,
    );
    // Four tracks (three lines and the alternative leg), each saying where its points came from.
    expect(gpx.match(/<trk>/g)).toHaveLength(4);
    expect(gpx.match(/<src>From OpenStreetMap \(relation 9001\), fetched [^<]+<\/src>/g)).toHaveLength(4);
    expect(
      gpx.match(/<link href="https:\/\/www\.openstreetmap\.org\/relation\/9001">\n {6}<text>OpenStreetMap relation 9001<\/text>/g),
    ).toHaveLength(4);
    expect(gpx).toContain("<name>Alternative leg</name>");
    // The gap is two tracks, not one line with a jump in it.
    expect(gpx).not.toMatch(new RegExp(`lat="${E.lat}" lon="${E.lon}"/>\\s*<trkpt lat="${F.lat}"`));
    // The description says it too, for programs that read nothing else.
    expect(gpx).toContain("<desc>From OpenStreetMap (relation 9001), fetched ");

    // Imported again as a plain GPX file, the words of the credit come back with it.
    const boundary = "----outpost-test";
    const upload = await app.app.inject({
      method: "POST",
      url: "/api/maps/tracks/import",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="kestrel.gpx"\r\nContent-Type: application/gpx+xml\r\n\r\n${gpx}\r\n--${boundary}--\r\n`,
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().track.description).toContain("© OpenStreetMap contributors, Open Database Licence (ODbL) 1.0");
  });

  it("marks a file of several routes as OpenStreetMap's only when all of it is", async () => {
    const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
    const found = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token });
    const drawn = await app.api<RouteSaveResponse>("POST", "/api/maps/tracks", {
      name: "My own way",
      points: [
        { lat: 54, lon: -3 },
        { lat: 54.01, lon: -3 },
      ],
    });
    const get = async (query: string) =>
      (await app.app.inject({ method: "GET", url: `/api/maps/export.gpx?${query}`, headers: { host: "localhost" } })).body;

    const mixed = await get(`tracks=${found.body.track.id},${drawn.body.track.id}`);
    expect(mixed).not.toContain("<copyright");
    expect(mixed).toContain(
      "<desc>Some of the routes in this file contain information from OpenStreetMap, which is made available under the Open Database Licence (ODbL) 1.0: https://www.openstreetmap.org/copyright. Each says so in its own source.</desc>",
    );
    expect(mixed.match(/<src>/g)).toHaveLength(3);
    // The person's own route is not credited to anyone else.
    expect(mixed.split("<name>My own way</name>")[1]).not.toContain("<src>");

    const alone = await get(`tracks=${found.body.track.id}`);
    expect(alone).toContain('<copyright author="OpenStreetMap contributors">');
    expect(await get(`tracks=${drawn.body.track.id}`)).not.toMatch(/copyright|OpenStreetMap/);
  });

  it("keeps the credit when the route's shape is edited by hand", async () => {
    const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
    const added = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token });
    const id = added.body.track.id;
    const edited = await app.api("PUT", `/api/maps/tracks/${id}/points`, {
      points: [
        { lat: A.lat, lon: A.lon },
        { lat: B.lat, lon: B.lon },
        { lat: C.lat, lon: C.lon },
      ],
    });
    expect(edited.status).toBe(200);
    const stored = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${id}`);
    expect(readTrackSource(stored.body.track.geojson)).toEqual(preview.body.credit);
    const exported = await app.app.inject({ method: "GET", url: `/api/maps/tracks/${id}/export.gpx`, headers: { host: "localhost" } });
    expect(exported.body).toContain('<copyright author="OpenStreetMap contributors">');
  });

  it("finds a name that is only ways with no route, and joins them without bridging the gap between them", async () => {
    const search = await app.api<RouteSearchResponse>("POST", "/api/maps/route-search", { text: "heron beck", bbox: VIEW });
    const path = search.body.results.find((result) => result.kind === "path")!;
    standIn.requests.length = 0;
    const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: path.ref });
    expect(preview.status).toBe(200);
    expect(standIn.requests[0]!.query).toContain('way(id:21,22,23)["highway"];');
    expect(preview.body).toMatchObject({ name: PATH_NAME, kind: "path", gaps: 1, branches: 0, wayCount: 3, sections: [] });
    // Ways 22 and 21 meet and are joined (21 turned round); way 23 starts 78 m further on and stays apart.
    expect(preview.body.lines.map((line) => line.length)).toEqual([3, 2]);
    expect(preview.body.largestGapMeters).toBe(78);
    expect(preview.body.credit).toMatchObject({ url: null, element: `3 ways named ${PATH_NAME}`, relationId: null, wayIds: [21, 22, 23] });

    const added = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", {
      token: preview.body.token,
      name: "Heron Beck, my walk",
    });
    expect(added.body.track.name).toBe("Heron Beck, my walk");
    const exported = await app.app.inject({
      method: "GET",
      url: `/api/maps/tracks/${added.body.track.id}/export.gpx`,
      headers: { host: "localhost" },
    });
    expect(exported.body).toContain(`<src>From OpenStreetMap (3 ways named ${PATH_NAME}), fetched `);
    // A path has no page of its own in OpenStreetMap, so its tracks carry no link.
    expect(exported.body.match(/<link /g)).toHaveLength(1);
  });

  it("lists the sections of a long route kept as sections, each of which can be previewed itself", async () => {
    const { status, body } = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", {
      ref: { type: "relation", id: SECTIONED_ROUTE_ID },
    });
    expect(status).toBe(200);
    expect(body.lines).toEqual([]);
    expect(body.token).toBe("");
    expect(body.sections.map((section) => [section.name, section.ref])).toEqual([
      [ROUTE_NAME, { type: "relation", id: ROUTE_ID }],
      ["Kestrel Way, northern section", { type: "relation", id: 9002 }],
    ]);
  });

  it("refuses a route too large to add, and says how large is too large and what to do instead", async () => {
    const { status, body } = await app.api("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: 9500 } });
    expect(status).toBe(413);
    expect(body.error.code).toBe("too_large");
    expect(body.error.message).toBe(
      "That route is too large to add in one piece: Outpost adds a route of up to 10,000 ways and 200,000 points, about 2,000 km. Long trails are usually also mapped section by section: search for a section by name, or zoom in to where you will walk and search that view.",
    );
    expect(MAX_ROUTE_POINTS).toBe(200_000);
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
  });

  it("says when the route is no longer there, and refuses things that are not route numbers", async () => {
    const gone = await app.api("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: 9404 } });
    expect(gone.status).toBe(404);
    expect(gone.body.error.message).toContain("has no route with that number any more");
    for (const ref of [
      { type: "relation", id: -1 },
      { type: "relation", id: 1.5 },
      { type: "relation", id: "9001; out;" },
      { type: "ways", ids: [] },
      { type: "node", id: 1 },
    ]) {
      expect((await app.api("POST", "/api/maps/route-search/preview", { ref })).status).toBe(400);
    }
    expect((await app.api("POST", "/api/maps/route-search/add", { token: "nothing-held" })).status).toBe(409);
  });

  it("runs one search at a time: a second one waits a moment for its turn and is never asked alongside the first", async () => {
    const slow = app.api("POST", "/api/maps/route-search", { text: "slow" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    let firstDone = false;
    void slow.then(() => {
      firstDone = true;
    });
    const waiting = app.api("POST", "/api/maps/route-search", { text: "kestrel" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    // The source has been asked one question, and the second is still waiting for it to be over.
    expect(standIn.requests).toHaveLength(1);
    expect(firstDone).toBe(false);
    const second = await waiting;
    expect(firstDone).toBe(true);
    expect((await slow).status).toBe(200);
    expect(second.status).toBe(200);
    expect(standIn.requests).toHaveLength(2);
    // What is said when the wait runs out is in "gives up on a source that does not answer in time", below.
    expect(HANDOVER_WAIT_MS).toBe(2000);
  });

  it("lets a new search follow one that was just cancelled, as the screen does when a person changes their mind", async () => {
    await app.app.listen({ port: 0, host: "127.0.0.1" });
    const appPort = (app.app.server.address() as AddressInfo).port;
    const send = (agent: http.Agent, method: string, url: string, body?: unknown) => {
      const request = http.request({
        host: "127.0.0.1",
        port: appPort,
        agent,
        method,
        path: url,
        headers: { "content-type": "application/json", "x-outpost-request": "1" },
      });
      const answer = new Promise<{ status: number; body: string }>((resolve, reject) => {
        request.on("error", reject);
        request.on("response", (response) => {
          let text = "";
          response.on("data", (chunk) => {
            text += chunk;
          });
          response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
        });
      });
      request.end(body === undefined ? undefined : JSON.stringify(body));
      return { request, answer };
    };
    // A browser keeps several connections open: the new question needs no new one, so it is not behind the old one's closing.
    const one = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const other = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      expect((await send(other, "GET", "/api/maps/route-sources").answer).status).toBe(200);
      const statuses: number[] = [];
      for (let round = 0; round < 8; round += 1) {
        const old = send(one, "POST", "/api/maps/route-search", { text: "slow" });
        old.answer.catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 60));
        // The old question is dropped and the new one sent in the same moment.
        old.request.destroy();
        const next = await send(other, "POST", "/api/maps/route-search", { text: "kestrel" }).answer;
        statuses.push(next.status);
      }
      expect(statuses).toEqual(statuses.map(() => 200));
    } finally {
      one.destroy();
      other.destroy();
    }
  });

  it("backs off for thirty seconds when the source says it is busy, without asking it again", async () => {
    const busy = await app.api("POST", "/api/maps/route-search", { text: "busy" });
    expect(busy.status).toBe(502);
    expect(busy.body.error.message).toBe(
      `127.0.0.1:${port} is busy and turned the search away. Outpost will wait 30 seconds before asking it again.`,
    );
    const soon = await app.api("POST", "/api/maps/route-search", { text: "kestrel" });
    expect(soon.status).toBe(502);
    expect(soon.body.error.message).toMatch(
      /said it was busy a moment ago\. Outpost waits before asking it again: try in (29|30) seconds\./,
    );
    expect(standIn.requests).toHaveLength(1);
    expect(BUSY_PAUSE_MS).toBe(30_000);
  });

  it("says so when the source answers with something that is not route data, or gives up", async () => {
    const broken = await app.api("POST", "/api/maps/route-search", { text: "broken" });
    expect(broken.status).toBe(502);
    expect(broken.body.error.message).toBe(
      `127.0.0.1:${port} answered with something that is not route data. Try again in a little while.`,
    );
    const gaveUp = await app.api("POST", "/api/maps/route-search", { text: "gaveup" });
    expect(gaveUp.status).toBe(502);
    expect(gaveUp.body.error.message).toContain("is busy and turned the search away");
  });

  it("does not follow a redirect: the question goes to the host that was named and to no other", async () => {
    const moved = await app.api("POST", "/api/maps/route-search", { text: "moved" });
    expect(moved.status).toBe(502);
    expect(moved.body.error.message).toBe("127.0.0.1 answered with a redirect, which Outpost does not follow for a search.");
    expect(standIn.requests.map((request) => request.path)).toEqual(["/overpass/api/interpreter"]);
  });
});

describe("when the source cannot be reached or may not be asked", () => {
  it("says plainly that the server is offline", async () => {
    // A port nothing listens on: the connection is refused, as it is with no network.
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const closedPort = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const app = await appWithSource(`http://127.0.0.1:${closedPort}/api/interpreter`);
    try {
      const { status, body } = await app.api("POST", "/api/maps/route-search", { text: "kestrel" });
      expect(status).toBe(503);
      expect(body.error.code).toBe("offline");
      expect(body.error.message).toBe(
        `Outpost could not reach 127.0.0.1:${closedPort}. Finding a route needs an internet connection; the routes already on your map do not.`,
      );
      // Everything that is already there still works.
      expect((await app.api("GET", "/api/maps/tracks")).status).toBe(200);
      expect((await app.api("GET", "/api/maps/route-sources")).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("will not ask an address on this computer or a private network unless the server was started to allow it", async () => {
    for (const host of ["127.0.0.1", "localhost"]) {
      standIn.requests.length = 0;
      const app = await appWithSource(`http://${host}:${port}/overpass/api/interpreter`, { OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "false" });
      try {
        for (const [url, body] of [
          ["/api/maps/route-search", { text: "kestrel" }],
          ["/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } }],
        ] as const) {
          const response = await app.api("POST", url, body);
          expect(response.status).toBe(403);
          expect(response.body.error.message).toBe(
            `Outpost did not ask ${host}:${port} because it is on this computer or a private network. A route source on your own network needs the server started with OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true.`,
          );
        }
        expect(standIn.requests).toHaveLength(0);
      } finally {
        await app.close();
      }
    }
  });

  it("gives up on a source that does not answer in time", async () => {
    const client = createHttpClient({ allowPrivate: true });
    const overpass = createOverpassClient(client);
    const source = {
      id: "stand-in",
      host: `127.0.0.1:${port}`,
      allowHost: "127.0.0.1",
      endpoint: `http://127.0.0.1:${port}/api/interpreter`,
    } as RouteSource;
    const ask = { maxBytes: 1_000_000, tooLarge: "too large", userAgent: "test" };
    try {
      const started = Date.now();
      await expect(
        overpass.ask(source, searchQuery({ pattern: "slow", maxRoutes: 5, maxWays: 5 }), { ...ask, timeoutMs: 200 }),
      ).rejects.toThrow(`127.0.0.1:${port} did not answer within 0 seconds. It may be busy: try again in a minute, or ask another server.`);
      expect(Date.now() - started).toBeLessThan(1200);
      // An answer larger than will be read is stopped part of the way, not swallowed whole.
      await expect(
        overpass.ask(source, searchQuery({ pattern: "kestrel", maxRoutes: 5, maxWays: 5 }), { ...ask, maxBytes: 500 }),
      ).rejects.toThrow("too large");
      // A question that follows one just cancelled waits for the cancelling to land: it is not turned away.
      const first = new AbortController();
      const dropped = overpass.ask(source, searchQuery({ pattern: "slow", maxRoutes: 5, maxWays: 5 }), { ...ask, signal: first.signal });
      dropped.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const asked = standIn.requests.length;
      first.abort();
      await expect(overpass.ask(source, searchQuery({ pattern: "kestrel", maxRoutes: 5, maxWays: 5 }), ask)).resolves.toBeDefined();
      await expect(dropped).rejects.toThrow("The search was cancelled.");
      expect(standIn.requests).toHaveLength(asked + 1);
      // A question that is still wanted is not pushed aside: the newer one waits a moment, then is told to wait.
      const wanted = overpass.ask(source, searchQuery({ pattern: "slow", maxRoutes: 5, maxWays: 5 }), ask);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const began = Date.now();
      await expect(
        overpass.ask(source, searchQuery({ pattern: "kestrel", maxRoutes: 5, maxWays: 5 }), { ...ask, handoverMs: 200 }),
      ).rejects.toThrow("Another route search is still running. Wait for it to finish, then try again.");
      expect(Date.now() - began).toBeGreaterThanOrEqual(190);
      // And one that waits while the older one finishes is asked next, never alongside it.
      const queued = overpass.ask(source, searchQuery({ pattern: "kestrel", maxRoutes: 5, maxWays: 5 }), { ...ask, handoverMs: 5000 });
      await expect(wanted).resolves.toBeDefined();
      await expect(queued).resolves.toBeDefined();
      // A person who gives up while waiting their turn is not asked for at all.
      const second = overpass.ask(source, searchQuery({ pattern: "slow", maxRoutes: 5, maxWays: 5 }), ask);
      const leaving = new AbortController();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const before = standIn.requests.length;
      setTimeout(() => leaving.abort(), 50);
      await expect(
        overpass.ask(source, searchQuery({ pattern: "kestrel", maxRoutes: 5, maxWays: 5 }), {
          ...ask,
          signal: leaving.signal,
          handoverMs: 5000,
        }),
      ).rejects.toThrow("The search was cancelled.");
      await second;
      expect(standIn.requests).toHaveLength(before);
      // And a person who goes away takes their question with them.
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      await expect(
        overpass.ask(source, searchQuery({ pattern: "slow", maxRoutes: 5, maxWays: 5 }), { ...ask, signal: controller.signal }),
      ).rejects.toThrow("The search was cancelled.");
    } finally {
      await client.close();
    }
  });
});

// ── Heights ─────────────────────────────────────────────────────────────────

/** Made-up ground that rises to the east and to the south, as a plain function of where on the world map a point is. */
const groundAt = (worldX: number, worldY: number) => 200 + 800 * worldX + 400 * worldY;
const heightAt = (lat: number, lon: number) =>
  groundAt((lon + 180) / 360, (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2);

/** A PNG of 8-bit RGB pixels, unfiltered: enough to write terrain tiles for a test. */
function png(size: number, rgb: (x: number, y: number) => number): Buffer {
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) rows.writeUIntBE(rgb(x, y) & 0xffffff, y * (size * 3 + 1) + 1 + x * 3, 3);
  }
  const chunk = (kind: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(kind, "latin1"), data]);
    const framed = Buffer.alloc(body.length + 8);
    framed.writeUInt32BE(data.length, 0);
    body.copy(framed, 4);
    framed.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return framed;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Terrain for the whole world down to zoom 3, in the encoding the map's terrain uses, installed as a person would. */
async function installTerrain(app: TestApp) {
  const size = 64;
  const tiles: FixtureTile[] = [];
  for (let z = 0; z <= 3; z += 1) {
    for (let x = 0; x < 2 ** z; x += 1) {
      for (let y = 0; y < 2 ** z; y += 1) {
        const data = png(size, (i, j) =>
          Math.round((groundAt((x + (i + 0.5) / size) / 2 ** z, (y + (j + 0.5) / size) / 2 ** z) + 32768) * 256),
        );
        tiles.push({ z, x, y, data });
      }
    }
  }
  const archive = buildArchive({
    tiles,
    bounds: [-180, -85.0511, 180, 85.0511],
    tileType: TileType.Png,
    tileCompression: Compression.None,
  });
  const location = app.ctx.services.storage.getDefault();
  fs.mkdirSync(path.join(location.path, "imports"), { recursive: true });
  fs.writeFileSync(path.join(location.path, "imports/terrain.pmtiles"), archive.bytes);
  const imported = await app.api("POST", "/api/maps/import", {
    locationId: location.id,
    relPath: "imports/terrain.pmtiles",
    name: "Terrain",
    tileType: "terrain",
  });
  expect(imported.status).toBe(200);
}

describe("heights from the terrain that is installed", () => {
  it("gives a found route its heights and its ascent when it is added, and later for one added before there was terrain", async () => {
    standIn.requests.length = 0;
    const app = await appWithSource();
    try {
      // Added with no terrain: no heights.
      const before = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
      const early = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: before.body.token });
      expect(early.body.elevation).toBe("none");
      expect(early.body.track.ascentMeters).toBeNull();

      await installTerrain(app);

      // Added with terrain: every point has the height of the ground beneath it.
      const preview = await app.api<RoutePreview>("POST", "/api/maps/route-search/preview", { ref: { type: "relation", id: ROUTE_ID } });
      const added = await app.api<RouteSaveResponse>("POST", "/api/maps/route-search/add", { token: preview.body.token });
      expect(added.body.elevation).toBe("terrain");
      const stored = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${added.body.track.id}`);
      const lines = (stored.body.track.geojson as unknown as TrackCollection).features.map(
        (feature) => feature.geometry.coordinates as number[][],
      );
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        for (const [lon, lat, height] of line) expect(Math.abs(height! - heightAt(lat!, lon!))).toBeLessThan(1.5);
      }
      // The made-up ground falls to the north, so a walk north climbs nothing worth counting.
      expect(added.body.track.ascentMeters).not.toBeNull();
      expect(added.body.track.ascentMeters!).toBeLessThan(5);

      // The earlier one is given its heights from the terrain, and the source is not asked again.
      const asked = standIn.requests.length;
      const filled = await app.api<RouteSaveResponse>("POST", `/api/maps/tracks/${early.body.track.id}/heights`);
      expect(filled.status).toBe(200);
      expect(filled.body.elevation).toBe("terrain");
      expect(filled.body.track.ascentMeters).not.toBeNull();
      expect(standIn.requests).toHaveLength(asked);
      const refilled = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${early.body.track.id}`);
      expect(readTrackSource(refilled.body.track.geojson)).toEqual(before.body.credit);

      // A route that was drawn or imported is not touched this way.
      const drawn = await app.api<RouteSaveResponse>("POST", "/api/maps/tracks", {
        name: "Mine",
        points: [
          { lat: 54, lon: -3 },
          { lat: 54.01, lon: -3 },
        ],
      });
      const refused = await app.api("POST", `/api/maps/tracks/${drawn.body.track.id}/heights`);
      expect(refused.status).toBe(400);
      expect(refused.body.error.message).toContain("only filled in this way for a route found in a route source");
    } finally {
      await app.close();
    }
  });
});

describe("heights for a found route", () => {
  /** Terrain that knows the ground south of 54.51 and nothing north of it. */
  const notAsked = async (): Promise<never> => {
    throw new Error("the route finder does not ask for this");
  };
  const sampler = {
    calls: 0,
    async sample(positions: ReadonlyArray<readonly [number, number]>) {
      this.calls += 1;
      return positions.map(([lon, lat]) => (lat < 54.51 ? Math.round((lat - 54.5) * 100_000 + lon * 0) + 100 : null));
    },
    // The route finder asks only for heights; how fine the terrain was is the line-of-sight check's question.
    sampleWithCells: notAsked,
    sampleGrid: notAsked,
  };
  const source = {
    id: "stand-in",
    name: "Stand-in",
    host: "example.org",
    allowHost: "example.org",
    endpoint: "https://example.org/api",
  } as RouteSource;
  const saved: Array<{ collection: TrackCollection; elevation: string }> = [];
  const annotations = {
    createFromCollection(input: { collection: TrackCollection; elevation: string }) {
      saved.push(input);
      return { track: { id: "t1" }, elevation: input.elevation };
    },
    getTrack: () => ({ geojson: saved.at(-1)!.collection }),
    replaceCollection(_id: string, collection: TrackCollection, elevation: string) {
      saved.push({ collection, elevation });
      return { track: { id: "t1" }, elevation };
    },
  } as unknown as AnnotationsService;

  it("reads heights from installed terrain where there is any, and says when it covers only part", async () => {
    const finder = createRouteFinder({
      loaded: { sources: [source], defaultId: "stand-in", problems: [] },
      overpass: { ask: async () => relationAnswer },
      annotations,
      elevation: sampler,
      userAgent: "test",
    });
    const preview = await finder.preview({ ref: { type: "relation", id: ROUTE_ID } });
    const added = await finder.add({ token: preview.token });
    expect(added.elevation).toBe("partial");
    const lines = saved[0]!.collection.features.map((feature) => feature.geometry.coordinates as number[][]);
    // A, B and C are over the terrain and have a height; D and beyond are not, and nothing is invented for them.
    expect(lines[0]![0]).toEqual([A.lon, A.lat, 100]);
    expect(lines[0]![2]).toEqual([B.lon, B.lat, 500]);
    expect(lines[0]!.at(-1)).toEqual([E.lon, E.lat]);
    expect(lines[1]!.every((position) => position.length === 2)).toBe(true);

    // Later, with terrain everywhere, the same route is given the rest of its heights without being fetched again.
    const everywhere = {
      sample: async (positions: ReadonlyArray<readonly [number, number]>) => positions.map(() => 321),
      sampleWithCells: notAsked,
      sampleGrid: notAsked,
    };
    const later = createRouteFinder({
      loaded: { sources: [source], defaultId: "stand-in", problems: [] },
      overpass: {
        ask: async () => {
          throw new Error("the source must not be asked");
        },
      },
      annotations,
      elevation: everywhere,
      userAgent: "test",
    });
    const filled = await later.fillHeights("t1");
    expect(filled.elevation).toBe("terrain");
    const refilled = saved.at(-1)!.collection;
    expect(refilled.features).toHaveLength(3);
    expect((refilled.features[0]!.geometry.coordinates as number[][]).every((position) => position[2] === 321)).toBe(true);
    expect(readTrackSource(refilled)).toEqual(preview.credit);
  });

  /** A route finder over a real server's routes, with terrain that answers as the test says. */
  const finderOver = (app: TestApp, sample: (positions: ReadonlyArray<readonly [number, number]>) => Promise<Array<number | null>>) =>
    createRouteFinder({
      loaded: { sources: [source], defaultId: "stand-in", problems: [] },
      overpass: { ask: async () => relationAnswer },
      annotations: createAnnotationsService(app.ctx, { elevation: { sample, sampleWithCells: notAsked, sampleGrid: notAsked } }),
      elevation: { sample, sampleWithCells: notAsked, sampleGrid: notAsked },
      userAgent: "test",
    });
  const storedLines = async (app: TestApp, id: string) => {
    const stored = await app.api<{ track: TrackWithGeometryDto }>("GET", `/api/maps/tracks/${id}`);
    return (stored.body.track.geojson as unknown as TrackCollection).features.filter((feature) => feature.geometry.type === "LineString");
  };

  it("holds previews up to three of the largest routes' worth of points, and lets the oldest go first", async () => {
    expect(MAX_HELD_POINTS).toBe(3 * MAX_ROUTE_POINTS);
    const made: TrackCollection[] = [];
    const finder = createRouteFinder({
      loaded: { sources: [source], defaultId: "stand-in", problems: [] },
      // The largest route there can be: 200,000 points.
      overpass: { ask: async () => hugeAnswer(MAX_ROUTE_POINTS) },
      annotations: {
        createFromCollection(input: { collection: TrackCollection; elevation: string }) {
          made.push(input.collection);
          return { track: { id: `t${made.length}` }, elevation: input.elevation };
        },
        listTracks: () => made.map((_collection, index) => ({ id: `t${index + 1}` })),
      } as unknown as AnnotationsService,
      elevation: { sample: async (positions) => positions.map(() => null), sampleWithCells: notAsked, sampleGrid: notAsked },
      userAgent: "test",
    });
    const tokens: string[] = [];
    for (let count = 0; count < 4; count += 1) {
      const preview = await finder.preview({ ref: { type: "relation", id: 9500 } });
      expect(preview.pointCount).toBe(MAX_ROUTE_POINTS);
      tokens.push(preview.token);
    }
    // Four do not fit: the first was let go, and what is said about it is true whatever the reason.
    await expect(finder.add({ token: tokens[0]! })).rejects.toThrow(
      "That preview is no longer held. Choose the route again to fetch it afresh, then add it.",
    );
    // The other three are held. Once one is added its points are in the route, and it no longer takes up room.
    expect((await finder.add({ token: tokens[1]! })).track.id).toBe("t1");
    tokens.push((await finder.preview({ ref: { type: "relation", id: 9500 } })).token);
    expect((await finder.add({ token: tokens[2]! })).track.id).toBe("t2");
    expect((await finder.add({ token: tokens[1]! })).track.id).toBe("t1");
  });

  it("makes one route when the same preview is added again while the first is still reading heights", async () => {
    const app = await createTestApp();
    try {
      let release = () => {};
      const terrainRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reads = 0;
      const finder = finderOver(app, async (positions) => {
        reads += 1;
        await terrainRead;
        return positions.map(() => 321);
      });
      const preview = await finder.preview({ ref: { type: "relation", id: ROUTE_ID } });
      // A double click, a second tab, or a retry on a long route: both arrive before the first has finished.
      const first = finder.add({ token: preview.token, includeAlternatives: true });
      const second = finder.add({ token: preview.token, includeAlternatives: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
      release();
      const [one, two] = await Promise.all([first, second]);
      expect(two.track.id).toBe(one.track.id);
      expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toHaveLength(1);
      // Terrain was read for one of them only: the main line, then the alternative leg.
      expect(reads).toBe(2);
    } finally {
      await app.close();
    }
  });

  it("does not write over a route that was redrawn while its heights were being read", async () => {
    const app = await createTestApp();
    try {
      let release = () => {};
      const terrainRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reading = () => {};
      const started = new Promise<void>((resolve) => {
        reading = resolve;
      });
      const adder = finderOver(app, async (positions) => positions.map(() => null));
      const added = await adder.add({ token: (await adder.preview({ ref: { type: "relation", id: ROUTE_ID } })).token });
      const id = added.track.id;

      // Terrain takes its time, as it does for a long route.
      const slow = finderOver(app, async (positions) => {
        reading();
        await terrainRead;
        return positions.map(() => 321);
      });
      const filling = slow.fillHeights(id);
      filling.catch(() => undefined);
      await started;
      // Meanwhile the shape is redrawn and saved, from another tab or another device.
      const redrawn = await app.api("PUT", `/api/maps/tracks/${id}/points`, {
        points: [
          { lat: 54.4, lon: -3.2 },
          { lat: 54.41, lon: -3.2 },
        ],
      });
      expect(redrawn.status).toBe(200);
      release();

      await expect(filling).rejects.toThrow("This route's shape has been redrawn by hand.");
      const lines = await storedLines(app, id);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.properties._drawn).toBe(true);
      expect((lines[0]!.geometry.coordinates as number[][]).map(([lon, lat]) => [lon, lat])).toEqual([
        [-3.2, 54.4],
        [-3.2, 54.41],
      ]);
    } finally {
      await app.close();
    }
  });

  it("gives up when the route's heights were filled in by someone else meanwhile, and says so", async () => {
    const app = await createTestApp();
    try {
      let release = () => {};
      const terrainRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reading = () => {};
      const started = new Promise<void>((resolve) => {
        reading = resolve;
      });
      const adder = finderOver(app, async (positions) => positions.map(() => null));
      const added = await adder.add({ token: (await adder.preview({ ref: { type: "relation", id: ROUTE_ID } })).token });
      const slow = finderOver(app, async (positions) => {
        reading();
        await terrainRead;
        return positions.map(() => 321);
      });
      const filling = slow.fillHeights(added.track.id);
      filling.catch(() => undefined);
      await started;
      await finderOver(app, async (positions) => positions.map(() => 999)).fillHeights(added.track.id);
      release();
      await expect(filling).rejects.toThrow("This route was changed while its heights were being read, so nothing was written. Try again.");
      const lines = await storedLines(app, added.track.id);
      expect(lines.flatMap((line) => line.geometry.coordinates as number[][]).every((position) => position[2] === 999)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("keeps the heights a route already has where terrain has none to give now", async () => {
    const app = await createTestApp();
    try {
      // Added when terrain covered the south of the route only.
      const south = finderOver(app, async (positions) => positions.map(([, lat]) => (lat < 54.51 ? 100 : null)));
      const added = await south.add({ token: (await south.preview({ ref: { type: "relation", id: ROUTE_ID } })).token });
      expect(added.elevation).toBe("partial");
      const before = (await storedLines(app, added.track.id)).flatMap((line) => line.geometry.coordinates as number[][]);
      expect(before.some((position) => position.length === 3)).toBe(true);
      expect(before.some((position) => position.length === 2)).toBe(true);

      // Since then the southern terrain was removed and the northern installed.
      const north = finderOver(app, async (positions) => positions.map(([, lat]) => (lat < 54.51 ? null : 700)));
      const filled = await north.fillHeights(added.track.id);
      expect(filled.elevation).toBe("terrain");
      const after = (await storedLines(app, added.track.id)).flatMap((line) => line.geometry.coordinates as number[][]);
      expect(after.map(([lon, lat]) => [lon, lat])).toEqual(before.map(([lon, lat]) => [lon, lat]));
      expect(after.map((position) => position[2])).toEqual(before.map((position) => (position.length === 3 ? 100 : 700)));

      // With no terrain at all, nothing is taken away either.
      const nowhere = finderOver(app, async (positions) => positions.map(() => null));
      expect((await nowhere.fillHeights(added.track.id)).elevation).toBe("terrain");
      expect((await storedLines(app, added.track.id)).flatMap((line) => line.geometry.coordinates as number[][])).toEqual(after);
    } finally {
      await app.close();
    }
  });
});

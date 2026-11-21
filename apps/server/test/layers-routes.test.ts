/**
 * Walking and cycling routes, and rights of way, read from an OpenStreetMap extract: route
 * relations become one line of all their ways, tagged paths become lines, and the map is
 * given them as lines from close enough in, never as marks.
 */
import fs from "node:fs";
import path from "node:path";
import type { ReferenceFeatureDetail, ReferenceOverlayResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { osmFeature } from "../src/modules/layers/adapters/osm-read.ts";
import { classifyOsm, routeWords } from "../src/modules/layers/adapters/osm-tags.ts";
import { buildPbf } from "./fixtures/layers/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
let storageRoot: string;
let locationId: string;

beforeAll(async () => {
  app = await createTestApp();
  locationId = app.ctx.services.storage.getDefault().id;
  storageRoot = app.ctx.services.storage.resolve(locationId, "");
});

afterAll(async () => {
  await app.close();
});

describe("which objects are routes and rights of way", () => {
  it("takes waymarked route relations and tagged rights of way, and nothing near them", () => {
    expect(classifyOsm({ type: "route", route: "hiking", network: "nwn", name: "Pennine Way" })).toEqual({
      layer: "routes",
      kind: "route=hiking",
    });
    expect(classifyOsm({ type: "route", route: "bicycle", network: "ncn", ref: "4" })?.layer).toBe("routes");
    expect(classifyOsm({ type: "route", route: "mtb" })?.kind).toBe("route=mtb");
    // A bus route or a road is not a walking route.
    expect(classifyOsm({ type: "route", route: "bus" })).toBeNull();
    expect(classifyOsm({ type: "route", route: "road" })).toBeNull();
    expect(classifyOsm({ highway: "footway", designation: "public_footpath" })).toEqual({
      layer: "rights-of-way",
      kind: "designation=public_footpath",
    });
    expect(classifyOsm({ highway: "track", designation: "byway_open_to_all_traffic" })?.layer).toBe("rights-of-way");
    expect(classifyOsm({ highway: "path", designation: "core_path" })?.layer).toBe("rights-of-way");
    // A permissive path is not a right of way; a national park is a designation of land.
    expect(classifyOsm({ highway: "path", designation: "permissive_footpath" })).toBeNull();
    expect(classifyOsm({ boundary: "protected_area", designation: "national_park" })).toBeNull();
  });

  it("names a route by its network", () => {
    expect(routeWords({ route: "hiking", network: "iwn" })).toBe("International walking route");
    expect(routeWords({ route: "bicycle", network: "lcn" })).toBe("Local cycle route");
    expect(routeWords({ route: "mtb" })).toBe("Mountain-bike route");
  });

  it("keeps a closed path as a line, not an area, and names an unnamed route by its number", () => {
    const loop = osmFeature(
      {
        type: "way",
        id: 7,
        tags: { highway: "footway", designation: "public_footpath", prow_ref: "FP 12" },
        lat: 0,
        lon: 0,
        points: [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      },
      { layers: new Set(["rights-of-way"]), country: "GB", publishedAt: null },
    );
    expect(loop?.geometry?.type).toBe("LineString");
    expect(loop?.name).toBe("FP 12");
    const route = osmFeature(
      {
        type: "relation",
        id: 8,
        tags: { type: "route", route: "bicycle", network: "ncn", ref: "4" },
        lat: 0,
        lon: 0,
        lines: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      },
      { layers: new Set(["routes"]), country: "GB", publishedAt: null },
    );
    expect(route?.name).toBe("National cycle route 4");
    expect(route?.accuracy).toMatch(/route's line/);
    // Not read unless the layer was asked for.
    expect(
      osmFeature(
        {
          type: "relation",
          id: 8,
          tags: { type: "route", route: "hiking" },
          lat: 0,
          lon: 0,
          lines: [
            [
              [0, 0],
              [1, 1],
            ],
          ],
        },
        { layers: new Set(["hospitals"]), country: null, publishedAt: null },
      ),
    ).toBeNull();
  });
});

describe("an extract read for routes", () => {
  it("draws a route and a footpath as lines from close in, and says to zoom in from further out", async () => {
    const relPath = "imports/dales.osm.pbf";
    const file = path.join(storageRoot, relPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      buildPbf({
        timestamp: Date.UTC(2026, 10, 20) / 1000,
        nodes: [
          { id: 1, lat: 54.2, lon: -2.2 },
          { id: 2, lat: 54.21, lon: -2.19 },
          { id: 3, lat: 54.22, lon: -2.18 },
          { id: 4, lat: 54.2, lon: -2.25 },
          { id: 5, lat: 54.205, lon: -2.24 },
          { id: 6, lat: 54.3, lon: -2.3, tags: { amenity: "hospital", name: "Dales hospital (test)" } },
        ],
        ways: [
          { id: 10, refs: [1, 2], tags: { highway: "path" } },
          { id: 11, refs: [2, 3], tags: { highway: "track" } },
          { id: 12, refs: [4, 5], tags: { highway: "footway", designation: "public_footpath", name: "Field path (test)" } },
        ],
        relations: [
          {
            id: 500,
            members: [
              { ref: 10, role: "" },
              { ref: 11, role: "" },
            ],
            tags: { type: "route", route: "hiking", network: "nwn", name: "Pennine Way (test)" },
          },
        ],
      }),
    );
    const started = await app.api("POST", "/api/reference/imports/from-storage", {
      format: "osm-pbf",
      locationId,
      relPath,
      title: "Dales extract",
      options: { country: "GB", lines: "routes,rights-of-way" },
    });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();

    const view = async (zoom: number, layers: string) =>
      (await app.api("GET", `/api/reference/features?bbox=-2.4,54.1,-2.1,54.4&zoom=${zoom}&layers=${layers}`))
        .body as ReferenceOverlayResponse;

    const near = await view(13, "routes,rights-of-way,hospitals");
    const lines = near.shapes.filter((shape) => shape.layer === "routes" || shape.layer === "rights-of-way");
    expect(lines.map((shape) => `${shape.layer}:${shape.name}:${shape.geometry.type}`).sort()).toEqual([
      "rights-of-way:Field path (test):LineString",
      "routes:Pennine Way (test):MultiLineString",
    ]);
    // Lines are never marks; the hospital still is.
    expect(near.points.map((point) => point.name)).toEqual(["Dales hospital (test)"]);
    expect(near.lines).toBeNull();

    // Routes from zoom 8, rights of way from zoom 12.
    const middle = await view(10, "routes,rights-of-way");
    expect(middle.shapes.map((shape) => shape.layer)).toEqual(["routes"]);
    expect(middle.lines).toBe("zoom-in");
    const far = await view(6, "routes");
    expect(far.shapes).toEqual([]);
    expect(far.lines).toBe("zoom-in");

    const route = near.shapes.find((shape) => shape.layer === "routes")!;
    const detail = (await app.api("GET", `/api/reference/features/${route.id}`)).body.feature as ReferenceFeatureDetail;
    expect(detail.kindLabel).toBe("Walking route");
  });

  it("reads the five layers alone, as before, when no lines are asked for", async () => {
    const relPath = "imports/dales-plain.osm.pbf";
    const file = path.join(storageRoot, relPath);
    fs.writeFileSync(
      file,
      buildPbf({
        nodes: [
          { id: 1, lat: 54.2, lon: -2.2 },
          { id: 2, lat: 54.21, lon: -2.19 },
        ],
        ways: [{ id: 12, refs: [1, 2], tags: { highway: "footway", designation: "public_footpath" } }],
        relations: [],
      }),
    );
    const started = await app.api("POST", "/api/reference/imports/from-storage", {
      format: "osm-pbf",
      locationId,
      relPath,
      title: "Plain extract",
      options: { country: "GB" },
    });
    await app.ctx.jobs.whenIdle();
    const job = (await app.api("GET", `/api/jobs/${started.body.jobId}`)).body;
    const ended = job.job ?? job;
    // A footpath is not one of the five: nothing was read, and the import says so.
    expect(ended.result?.imported ?? 0).toBe(0);
    const held = (await app.api("GET", "/api/reference/features?bbox=-2.4,54.1,-2.1,54.4&zoom=13&layers=rights-of-way")).body;
    expect(held.shapes.filter((shape: { name: string }) => shape.name === "")).toEqual([]);
  });
});

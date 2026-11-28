/**
 * Whether a road network reaches Northern Ireland is worked out from its own junctions,
 * never from its Geofabrik region's name: Geofabrik's United Kingdom holds Northern
 * Ireland, its Great Britain does not. A network built before that was recorded has it
 * worked out once from its file, and kept.
 */
import fs from "node:fs";
import path from "node:path";
import type { RoadCoverageResponse, RoadNetworksResponse } from "@outpost/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roadNetworks } from "../src/db/schema.ts";
import { buildPbf } from "./fixtures/layers/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

/** A main road from London to Dover; with `ulster`, one through Belfast too. */
function extract(ulster: boolean): Buffer {
  const britain = [
    { id: 1, lat: 51.5074, lon: -0.1278 },
    { id: 2, lat: 51.3, lon: 0.5 },
    { id: 3, lat: 51.1279, lon: 1.3134 },
  ];
  const belfast = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, lat: 54.5 + i * 0.03, lon: -5.95 }));
  return buildPbf({
    nodes: [...britain, ...(ulster ? belfast : [])],
    ways: [
      { id: 1, refs: [1, 2, 3], tags: { highway: "trunk", ref: "A2" } },
      ...(ulster ? [{ id: 2, refs: belfast.map((n) => n.id), tags: { highway: "trunk", ref: "A1" } }] : []),
    ],
    relations: [],
    timestamp: Date.UTC(2026, 10, 21) / 1000,
  });
}

describe("a United Kingdom network and Northern Ireland", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  const location = () => app.ctx.services.storage.getDefault();
  const networks = async () => (await app.api("GET", "/api/roads/networks")).body as RoadNetworksResponse;
  const build = async (file: string, body: Buffer) => {
    fs.mkdirSync(path.join(location().path, "maps"), { recursive: true });
    fs.writeFileSync(path.join(location().path, "maps", file), body);
    const started = await app.api("POST", "/api/roads/networks", {
      locationId: location().id,
      relPath: `maps/${file}`,
      name: "United Kingdom",
      country: "GB",
    });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    await app.ctx.jobs.whenIdle();
  };
  const coverage = async () =>
    (
      await app.api("POST", "/api/roads/coverage", {
        points: [
          { lat: 51.5074, lon: -0.1278 },
          { lat: 54.5973, lon: -5.9301 },
        ],
      })
    ).body as RoadCoverageResponse;

  it("is the United Kingdom, and covers Belfast, when its roads reach Northern Ireland", async () => {
    await build("uk.osm.pbf", extract(true));
    const [network] = (await networks()).networks;
    expect(network).toMatchObject({ name: "United Kingdom", northernIreland: true });
    expect((await coverage()).countries.find((c) => c.code === "GB")).toMatchObject({ name: "United Kingdom", state: "ready" });
  });

  it("is Great Britain, and leaves Belfast uncovered, when they do not, whatever its region is called", async () => {
    for (const row of app.ctx.db.select().from(roadNetworks).all()) await app.ctx.services.roads!.remove(row.id);
    await build("gb.osm.pbf", extract(false));
    const [row] = app.ctx.db.select().from(roadNetworks).all();
    // Called united-kingdom by its region: it is still its roads that say.
    app.ctx.db.update(roadNetworks).set({ regionId: "united-kingdom" }).where(eq(roadNetworks.id, row!.id)).run();
    expect((await networks()).networks[0]).toMatchObject({ name: "Great Britain", northernIreland: false });
    expect((await coverage()).countries.find((c) => c.code === "GB")).toMatchObject({ name: "United Kingdom", state: "part" });
  });

  it("works out once, from the network's own file, what a network built before it was recorded reaches", async () => {
    await build("uk2.osm.pbf", extract(true));
    const rows = app.ctx.db.select().from(roadNetworks).all();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const { northernIreland: _gone, ...stats } = (row.stats ?? {}) as Record<string, unknown>;
      app.ctx.db.update(roadNetworks).set({ stats, regionId: "united-kingdom" }).where(eq(roadNetworks.id, row.id)).run();
    }
    expect(await app.ctx.services.roads!.recordNorthernIreland()).toBe(2);
    const recorded = app.ctx.db.select().from(roadNetworks).all();
    expect(recorded.map((row) => (row.stats as { northernIreland?: boolean }).northernIreland).sort()).toEqual([false, true]);
    expect((await networks()).networks.map((n) => n.name).sort()).toEqual(["Great Britain", "United Kingdom"]);
    // Once: nothing is left to work out.
    expect(await app.ctx.services.roads!.recordNorthernIreland()).toBe(0);
  });
});

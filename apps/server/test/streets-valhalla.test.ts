/**
 * Streets for routes against a real streets service: the sidecar image
 * (docker/valhalla, `outpost-valhalla:local` unless OUTPOST_TEST_VALHALLA_IMAGE says
 * otherwise) started here with Docker, building from the made-up Great Britain country
 * file of the road-route tests (fixtures/roads/channel-trip.ts), then routing, drawing a
 * reachable area and removing the streets. Nothing reaches the internet: the image must
 * already be built (`docker build -t outpost-valhalla:local docker/valhalla`).
 *
 * Off unless OUTPOST_TEST_VALHALLA=1: it needs Docker, and takes a minute or two.
 *
 *   OUTPOST_TEST_VALHALLA=1 pnpm --filter @outpost/server exec vitest run test/streets-valhalla.test.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { StreetsReachResult, StreetsRouteResult, StreetsStatusResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { greatBritain } from "./fixtures/roads/channel-trip.ts";
import { freePort } from "./free-port.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const enabled = process.env.OUTPOST_TEST_VALHALLA === "1";
const IMAGE = process.env.OUTPOST_TEST_VALHALLA_IMAGE ?? "outpost-valhalla:local";

describe.skipIf(!enabled)("a real streets service", () => {
  let app: TestApp;
  let dir: string;
  let container = "";
  let port = 0;

  beforeAll(async () => {
    // One folder holds Outpost's data, its storage and the streets' volume, mounted at the same path in the
    // container, as the Compose file mounts /storage at the same path in both.
    dir = fs.realpathSync(tempDir("outpost-valhalla-real-"));
    const tiles = path.join(dir, "tiles");
    fs.mkdirSync(tiles, { recursive: true });
    port = await freePort();
    container = `outpost-test-valhalla-${port}`;
    execFileSync("docker", [
      "run",
      "-d",
      "--rm",
      "--name",
      container,
      "--user",
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      "-e",
      "VALHALLA_HOME=/tiles",
      "-e",
      "VALHALLA_MIN_AVAILABLE_MB=200",
      "-p",
      `127.0.0.1:${port}:8002`,
      "-v",
      `${tiles}:/tiles`,
      "-v",
      `${dir}:${dir}`,
      IMAGE,
      "serve",
    ]);
    await waitFor(() => fs.existsSync(path.join(tiles, "status.json")), "the streets service to start", 30_000);
    app = await createTestApp(
      { OUTPOST_VALHALLA_URL: `http://127.0.0.1:${port}`, OUTPOST_VALHALLA_DIR: tiles, OUTPOST_STORAGE_ROOTS: path.join(dir, "storage") },
      dir,
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (container) execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("builds streets from a kept country file, on another storage location's folder", async () => {
    expect(((await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse).state).toBe("no-streets");
    const location = app.ctx.services.storage.getDefault();
    const relPath = "collections/country-files/great-britain.osm.pbf";
    fs.mkdirSync(path.join(location.path, "collections/country-files"), { recursive: true });
    fs.writeFileSync(path.join(location.path, relPath), greatBritain());
    await app.ctx.services.collections.create({
      kind: "extract",
      title: "Country file: Great Britain",
      locationId: location.id,
      relPath,
      sizeBytes: fs.statSync(path.join(location.path, relPath)).size,
      meta: {
        countryFile: {
          regionId: "europe/great-britain",
          name: "Great Britain",
          country: "GB",
          dataDate: "2026-11-20",
          fileName: "great-britain.osm.pbf",
          sourceUrl: "http://stand-in/",
          md5: null,
        },
      },
    } as never);
    const { status, body } = await app.api("POST", "/api/streets/tiles", {
      regions: ["europe/great-britain"],
      workLocationId: location.id,
    });
    expect(status).toBe(200);
    await waitFor(() => ["succeeded", "failed"].includes(app.ctx.jobs.get(body.jobId)?.state ?? ""), "the build", 240_000);
    expect(app.ctx.jobs.get(body.jobId)!.error).toBeNull();
    // The work folder on the storage location is gone once the streets are in.
    expect(fs.existsSync(path.join(location.path, "outpost-streets-work", "build"))).toBe(false);
    await waitFor(
      async () => ((await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse).state === "ready",
      "the streets to be served",
      30_000,
    );
    const s = (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;
    expect(s.tileset).toMatchObject({ name: "Great Britain", countries: ["GB"], valhalla: "3.9.3", dataDate: "2026-11-20" });
  }, 300_000);

  it("walks, drives door to door and draws a reachable area", async () => {
    const walk = await app.api("POST", "/api/streets/route", {
      points: [
        { lat: 51.296, lon: -0.33 },
        { lat: 51.3, lon: -0.32 },
      ],
      mode: "walk",
    });
    expect(walk.status).toBe(200);
    expect((walk.body as StreetsRouteResult).streets!.lines.map((l) => l.text)[0]).toMatch(/^Walk .* on Epsom Road \(A24\)$/);

    const location = app.ctx.services.storage.getDefault();
    fs.mkdirSync(path.join(location.path, "maps"), { recursive: true });
    fs.writeFileSync(path.join(location.path, "maps", "gb.osm.pbf"), greatBritain());
    await app.api("POST", "/api/roads/networks", {
      locationId: location.id,
      relPath: "maps/gb.osm.pbf",
      name: "Great Britain",
      country: "GB",
    });
    await app.ctx.jobs.whenIdle();
    const drive = await app.api("POST", "/api/streets/route", {
      points: [
        { lat: 51.298, lon: -0.325, name: "On the A24" },
        { lat: 51.123, lon: 1.31, name: "Dover" },
      ],
      mode: "drive-door",
    });
    expect(drive.status).toBe(200);
    const trip = drive.body as StreetsRouteResult;
    expect(trip.spine).toBe("main-roads");
    expect(trip.road!.legs.map((l) => l.title)).toContain("M20 - Folkestone");
    expect(trip.start!.lines.length).toBeGreaterThanOrEqual(2);

    const reach = await app.api("POST", "/api/streets/reach", { point: { lat: 51.33, lon: -0.1 }, mode: "drive", minutes: [15] });
    expect(reach.status).toBe(200);
    expect((reach.body as StreetsReachResult).areas.features).toHaveLength(1);
  }, 60_000);

  it("removes the streets", async () => {
    expect((await app.api("DELETE", "/api/streets/tiles")).status).toBe(200);
    expect(((await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse).state).toBe("no-streets");
  }, 60_000);
});

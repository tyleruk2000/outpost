/**
 * Heard on the radio, against input that is not what it should be: a station sending
 * far more than a radio could, and a status file from the Pi's helper that is not the
 * shape it should be.
 */
import fs from "node:fs";
import path from "node:path";
import type { HeardReceiversResponse, HeardStationsResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOST_REPORTS_KEPT, MOST_STATIONS_KEPT } from "../src/modules/heard/store.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("heard on the radio, untrusted input", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
  });
  afterAll(() => app.close());

  it("holds only so many positions of one station between writes, however fast they come", async () => {
    const heard = app.ctx.services.heard;
    const at = Date.now();
    for (let i = 0; i < 20_000; i += 1)
      heard.recordMesh({ id: "!flood", name: "Flood", lat: 51, lon: 0, altitude: null, at: at + i, hops: 0, snr: null, rssi: null });
    heard.flushNow();
    const { body } = await app.api<HeardStationsResponse>("GET", "/api/heard/stations?source=mesh");
    expect(body.stations).toHaveLength(1);
    expect(body.stations[0]!.reports).toBeLessThanOrEqual(100);
  });

  it("still lists the receivers when the Pi's status file is not the shape it should be", async () => {
    const dir = path.join(app.ctx.config.dataDir, "decoders");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "helper"), "Written by deploy/pi/install.sh\n");
    for (const text of ["null", "[1,2]", '"text"', JSON.stringify({ decoders: [null, 3, "x"], devices: [null, 7, { id: 5 }] })]) {
      fs.writeFileSync(path.join(dir, "status.json"), text);
      const response = await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers");
      expect(response.status).toBe(200);
      expect(response.body.pi?.decoders.every((decoder) => !decoder.installed)).toBe(true);
      expect(response.body.pi?.devices).toEqual([]);
    }
  });
});

describe("heard on the radio, what is kept", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
  });
  afterAll(() => app.close());

  const mesh = (id: string, at: number) => ({ id, name: id, lat: 51, lon: 0, altitude: null, at, hops: 0, snr: null, rssi: null });
  const count = (sql: string, ...args: unknown[]) => (app.ctx.sqlite.prepare(sql).get(...args) as { n: number }).n;

  it("keeps at most so many stations of one source, dropping the longest unheard first, never a pinned one", async () => {
    const heard = app.ctx.services.heard;
    heard.recordMesh(mesh("!pinned", Date.now()));
    heard.flushNow();
    const pinned = heard.stations("mesh")[0]!;
    heard.pin(pinned.id, true, null);
    app.ctx.sqlite.prepare("UPDATE heard_stations SET last_at = 1 WHERE id = ?").run(pinned.id);
    for (let i = 0; i < MOST_STATIONS_KEPT + 50; i += 1) {
      heard.recordMesh(mesh(`!s${i}`, Date.now()));
      if (i % 4000 === 0) {
        heard.flushNow();
        // Heard in order, each flush later than the one before.
        app.ctx.sqlite.prepare("UPDATE heard_stations SET last_at = last_at - 1000000 WHERE source = 'mesh' AND pinned = 0").run();
      }
    }
    heard.flushNow();
    expect(count("SELECT count(*) AS n FROM heard_stations WHERE source = 'mesh'")).toBeLessThanOrEqual(MOST_STATIONS_KEPT);
    const keys = new Set(
      (app.ctx.sqlite.prepare("SELECT key FROM heard_stations WHERE source = 'mesh'").all() as Array<{ key: string }>).map(
        (row) => row.key,
      ),
    );
    expect(keys.has("!pinned")).toBe(true);
    expect(keys.has("!s0")).toBe(false);
    expect(keys.has(`!s${MOST_STATIONS_KEPT + 49}`)).toBe(true);
    // No position is left behind for a station taken off.
    expect(count("SELECT count(*) AS n FROM heard_reports WHERE station_id NOT IN (SELECT id FROM heard_stations)")).toBe(0);
  }, 120_000);

  it("keeps at most so many positions of one station, dropping the oldest", async () => {
    const heard = app.ctx.services.heard;
    const at = Date.now() - 10_000_000;
    for (let i = 0; i < MOST_REPORTS_KEPT + 200; i += 1) {
      heard.recordMesh(mesh("!chatty", at + i));
      if (i % 90 === 0) heard.flushNow();
    }
    heard.flushNow();
    const station = heard.stations("mesh").find((entry) => entry.key === "!chatty")!;
    const rows = app.ctx.sqlite
      .prepare("SELECT count(*) AS n, min(at) AS first FROM heard_reports WHERE station_id = ?")
      .get(station.id) as {
      n: number;
      first: number;
    };
    expect(rows.n).toBeLessThanOrEqual(MOST_REPORTS_KEPT);
    expect(rows.first).toBeGreaterThan(at);
    expect(station.reports).toBe(rows.n);
  }, 120_000);

  it("a flush that fails on its timer does not throw out of it, which would stop the server", () => {
    const heard = app.ctx.services.heard;
    const stop = app.ctx.events.subscribe((event) => {
      if (event.type === "heard.changed") throw new Error("a listener that fails");
    });
    try {
      heard.recordMesh(mesh("!timer", Date.now()));
      expect(() => heard.flushNow()).not.toThrow();
    } finally {
      stop();
    }
  });
});

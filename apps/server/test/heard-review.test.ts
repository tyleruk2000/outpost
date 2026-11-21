/**
 * Heard on the radio, against input that is not what it should be: a station sending
 * far more than a radio could, and a status file from the Pi's helper that is not the
 * shape it should be.
 */
import fs from "node:fs";
import path from "node:path";
import type { HeardReceiversResponse, HeardStationsResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

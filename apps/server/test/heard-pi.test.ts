/**
 * The decoders on the Pi (outpost-ywbh.3), as Outpost sees them: a folder the installer's
 * helper writes `helper` and `status.json` into, and Outpost leaves `request` in. The
 * helper itself (deploy/pi/decoders.sh) is not run here; status.json is what it wrote for
 * a stand-in folder.
 */
import fs from "node:fs";
import path from "node:path";
import type { HeardReceiversResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("decoders on the Pi", () => {
  let app: TestApp;
  let dir: string;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
    dir = path.join(app.ctx.config.dataDir, "decoders");
  });
  afterAll(() => app.close());

  it("is not offered where the installer did not set it up", async () => {
    expect((await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers")).body.pi).toBeNull();
    expect((await app.api("POST", "/api/heard/pi", { decoder: "direwolf", action: "refresh" })).status).toBe(404);
  });

  it("shows what the helper wrote, and leaves it three words of request", async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "helper"), "Written by deploy/pi/install.sh\n");
    fs.writeFileSync(
      path.join(dir, "status.json"),
      JSON.stringify({
        at: 1795269250,
        error: null,
        decoders: [
          { id: "direwolf", installed: true, running: true, device: "plughw:1,0", log: ["M0ABC-9 audio level = 52(13/8)"] },
          { id: "readsb", installed: true, running: false, device: null, log: [] },
          { id: "nonsense", installed: true },
        ],
        devices: [
          { id: "plughw:1,0", name: "USB Audio Device", kind: "sound" },
          { id: "sdr:0", name: "RTL-SDR 0", kind: "sdr" },
          { id: "../../etc", name: "bad", kind: "sound" },
        ],
      }),
    );
    const { body } = await app.api<HeardReceiversResponse>("GET", "/api/heard/receivers");
    expect(body.pi?.at).toBe(1795269250_000);
    expect(body.pi?.decoders.map((decoder) => [decoder.id, decoder.running])).toEqual([
      ["direwolf", true],
      ["readsb", false],
      ["ais-catcher", false],
    ]);
    expect(body.pi?.decoders[0]?.log).toEqual(["M0ABC-9 audio level = 52(13/8)"]);
    expect(body.pi?.devices.map((device) => device.id)).toEqual(["plughw:1,0", "sdr:0"]);

    expect((await app.api("POST", "/api/heard/pi", { decoder: "readsb", action: "start", device: "sdr:7" })).status).toBe(400);
    expect((await app.api("POST", "/api/heard/pi", { decoder: "readsb", action: "start", device: "sdr:0; rm -rf /" })).status).toBe(400);
    const started = await app.api<HeardReceiversResponse>("POST", "/api/heard/pi", { decoder: "readsb", action: "start", device: "sdr:0" });
    expect(started.body.pi?.pending).toBe(true);
    expect(fs.readFileSync(path.join(dir, "request"), "utf8")).toBe("start readsb sdr:0\n");
  });
});

/**
 * Each radio's last reported position (outpost-xeu3): kept as heard, sent nowhere until a
 * person switches that radio on for the map, and gone with the radios' names when the
 * board is emptied. The radio is a stand-in: Outpost's own broker publishing the JSON a
 * Meshtastic radio would, with latitude_i and longitude_i in 1e-7 degrees.
 */
import type { MeshPositionsResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseUplink } from "../src/modules/mesh/meshtastic/json.ts";
import { createBroker, type MqttBroker } from "../src/modules/mesh/mqtt/broker.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const quiet = { info() {}, warn() {}, debug() {} };
const ROOT = "msh/EU_868";
const PASSWORD = "household-outpost-pw-1";
const RADIO = 0xa1b2c3d4;

async function waitFor<T>(check: () => T | undefined | null | false, ms = 4000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > until) throw new Error("Waited too long");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const position = (latI: number, lonI: number, extra: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify({ from: RADIO, id: 9, type: "position", payload: { latitude_i: latI, longitude_i: lonI, ...extra }, to: -1 }));

describe("each radio's last position", () => {
  let app: TestApp;
  let broker: MqttBroker;
  beforeAll(async () => {
    app = await createTestApp({}, undefined, { voacapData: false });
    broker = createBroker({
      host: "127.0.0.1",
      port: 0,
      checkLogin: (user, password) => user === "outpost" && password.toString() === PASSWORD,
      allowAddress: () => true,
      log: quiet,
    });
    const { port } = await broker.listen();
    await app.api("PUT", "/api/mesh/meshtastic", {
      mode: "client",
      client: { host: "127.0.0.1", port, userName: "outpost", password: PASSWORD, rootTopic: ROOT },
      channels: [{ name: "LongFast", index: 0 }],
    });
    await waitFor(() => app.ctx.services.mesh.meshtastic.status().state === "connected");
  });
  afterAll(async () => {
    await app.close();
    await broker.close();
  });

  it("reads a position as documented, and nothing that is not one", () => {
    expect(parseUplink(position(515_007_000, -1_246_000, { altitude: 12, time: 1_763_380_000 }))).toEqual({
      type: "position",
      from: "!a1b2c3d4",
      lat: 51.5007,
      lon: -0.1246,
      altitude: 12,
      time: 1_763_380_000_000,
    });
    expect(parseUplink(position(0, 0))).toEqual({ type: "other" });
    expect(parseUplink(position(1_000_000_000, 0))).toEqual({ type: "other" });
    expect(parseUplink(Buffer.from(JSON.stringify({ from: RADIO, type: "position", payload: {} })))).toEqual({ type: "other" });
  });

  it("keeps the position but sends it nowhere until the radio is switched on; a name heard later keeps the switch", async () => {
    await broker.publish(`${ROOT}/2/json/LongFast/!a1b2c3d4`, position(515_007_000, -1_246_000), 0);
    const off = await waitFor(() => app.ctx.services.mesh.meshtastic.positions()[0]);
    expect(off).toMatchObject({ id: "!a1b2c3d4", onMap: false, position: null });
    const listed = await app.api<MeshPositionsResponse>("GET", "/api/mesh/positions");
    expect(JSON.stringify(listed.body)).not.toContain("51.5");

    const on = await app.api<MeshPositionsResponse>("PUT", "/api/mesh/radios/!a1b2c3d4/map", { onMap: true });
    expect(on.body.radios[0]?.position).toMatchObject({ lat: 51.5007, lon: -0.1246 });

    const nodeinfo = { from: RADIO, type: "nodeinfo", payload: { id: "!a1b2c3d4", longname: "Kitchen radio", shortname: "KIT" } };
    await broker.publish(`${ROOT}/2/json/LongFast/!a1b2c3d4`, Buffer.from(JSON.stringify(nodeinfo)), 0);
    const named = await waitFor(() => app.ctx.services.mesh.meshtastic.positions().find((radio) => radio.longName === "Kitchen radio"));
    expect(named.onMap).toBe(true);
    expect(named.position).not.toBeNull();

    expect((await app.api("PUT", "/api/mesh/radios/!00000001/map", { onMap: true })).status).toBe(404);
    expect((await app.api("PUT", "/api/mesh/radios/not-a-radio/map", { onMap: true })).status).toBe(400);
  });

  it("forgets the positions with the radios' names when the board is emptied", async () => {
    app.ctx.services.mesh.meshtastic.forgetNodes();
    expect((await app.api<MeshPositionsResponse>("GET", "/api/mesh/positions")).body.radios).toEqual([]);
  });
});

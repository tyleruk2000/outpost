/**
 * The settings held to the computer Outpost runs on (the mesh radio set-up, the switch for
 * other programs' tools), and the start-up option that allows them from every device.
 *
 * The cause found for outpost-x9dm: Outpost in Docker with LAN access on, opened from a
 * phone. No request looks local in a container, so every mesh control was disabled, and
 * the screen never named the option. The answer now says why and which line to set.
 */
import type { MeshResponse, ToolsStatus } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { settingRefusal, settingRight } from "../src/core/setting-right.ts";
import { createTestApp } from "./helpers.ts";

const phone = { remoteAddress: "192.168.1.20" };
const lan = { OUTPOST_LAN_ACCESS: "true", OUTPOST_HOST: "0.0.0.0" };
const body = { mode: "client", client: { host: "127.0.0.1", port: 9, userName: "", rootTopic: "msh/EU_868" } };
const config = { lanAccess: true, ownAddressIsLocal: true, allowRemoteSettings: false, allowRemoteErase: false };
const origin = { headers: {}, socket: { remoteAddress: "192.168.1.20" } };

describe("who may change the settings held to this computer", () => {
  it("in a container, says that no request looks local and names the line to set", () => {
    const right = settingRight(origin, config, { inContainer: true });
    expect(right).toEqual({ allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_SETTINGS", inContainer: true });
    const refusal = settingRefusal("The mesh radio set-up", "it opens a port", true);
    expect(refusal.message).toMatch(/Outpost runs in a container, where no request looks as if it comes from the computer itself/);
    expect(refusal.message).toMatch(
      /add OUTPOST_ALLOW_REMOTE_SETTINGS=true to Outpost's \.env file and restart Outpost \(in Docker: sudo docker compose up -d\)/,
    );
  });

  it("says which option allowed it: the new one, or the older erase option for the mesh radio only", () => {
    expect(settingRight(origin, { ...config, allowRemoteSettings: true }, { inContainer: true })).toMatchObject({
      allowed: true,
      reason: "option",
      option: "OUTPOST_ALLOW_REMOTE_SETTINGS",
    });
    expect(settingRight(origin, { ...config, allowRemoteErase: true }, { legacy: true, inContainer: true })).toMatchObject({
      allowed: true,
      option: "OUTPOST_ALLOW_REMOTE_ERASE",
    });
    expect(settingRight(origin, { ...config, allowRemoteErase: true }, { inContainer: true }).allowed).toBe(false);
  });

  it("refuses a phone without the option, saying why and what to do, and accepts it with the option", async () => {
    const closed = await createTestApp(lan, undefined, { voacapData: false });
    try {
      const seen = await closed.api<MeshResponse>("GET", "/api/mesh", undefined, phone);
      expect(seen.body.right).toMatchObject({ allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_SETTINGS" });
      const refused = await closed.api("PUT", "/api/mesh/meshtastic", body, phone);
      expect(refused.status).toBe(403);
      expect(refused.body.error.message).toMatch(/OUTPOST_ALLOW_REMOTE_SETTINGS=true/);
      const mcp = await closed.api("PUT", "/api/tools/mcp", { enabled: true }, phone);
      expect(mcp.status).toBe(403);
      expect(mcp.body.error.message).toMatch(/OUTPOST_ALLOW_REMOTE_SETTINGS=true/);
      const tools = await closed.api<ToolsStatus>("GET", "/api/tools", undefined, phone);
      expect(tools.body.mcp.right).toMatchObject({ allowed: false, option: "OUTPOST_ALLOW_REMOTE_SETTINGS" });
    } finally {
      await closed.close();
    }

    const open = await createTestApp({ ...lan, OUTPOST_ALLOW_REMOTE_SETTINGS: "true" }, undefined, { voacapData: false });
    try {
      const seen = await open.api<MeshResponse>("GET", "/api/mesh", undefined, phone);
      expect(seen.body.right).toMatchObject({ allowed: true, reason: "option", option: "OUTPOST_ALLOW_REMOTE_SETTINGS" });
      const saved = await open.api<MeshResponse>("PUT", "/api/mesh/meshtastic", { mode: "off" }, phone);
      expect(saved.status).toBe(200);
      const mcp = await open.api<ToolsStatus>("PUT", "/api/tools/mcp", { enabled: true }, phone);
      expect(mcp.status).toBe(200);
      expect(mcp.body.mcp).toMatchObject({ enabled: true, canChange: true });
    } finally {
      await open.close();
    }
  });

  it("keeps the older OUTPOST_ALLOW_REMOTE_ERASE working for the mesh radio, as before", async () => {
    const app = await createTestApp({ ...lan, OUTPOST_ALLOW_REMOTE_ERASE: "true" }, undefined, { voacapData: false });
    try {
      expect((await app.api<MeshResponse>("GET", "/api/mesh", undefined, phone)).body.right).toMatchObject({
        allowed: true,
        option: "OUTPOST_ALLOW_REMOTE_ERASE",
      });
      expect((await app.api("PUT", "/api/mesh/meshtastic", { mode: "off" }, phone)).status).toBe(200);
      expect((await app.api("PUT", "/api/tools/mcp", { enabled: true }, phone)).status).toBe(403);
    } finally {
      await app.close();
    }
  });
});

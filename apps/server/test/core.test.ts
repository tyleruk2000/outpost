import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { resolveInside, safeFileName } from "../src/core/fs-safe.ts";
import { isPublicAddress } from "../src/core/http.ts";
import { retryDelayMs } from "../src/core/jobs.ts";
import { isAllowedHost } from "../src/modules/auth/index.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("configuration", () => {
  it("binds to localhost with sign-in off by default", () => {
    const config = loadConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.lanAccess).toBe(false);
    expect(config.authRequired).toBe(false);
  });

  it("turns sign-in on when LAN access is enabled", () => {
    expect(loadConfig({ OUTPOST_LAN_ACCESS: "true" }).authRequired).toBe(true);
  });

  it("refuses to listen beyond this computer unless LAN access was chosen", () => {
    expect(() => loadConfig({ OUTPOST_HOST: "0.0.0.0" })).toThrow(/OUTPOST_LAN_ACCESS is not set/);
    expect(() => loadConfig({ OUTPOST_HOST: "192.168.1.20" })).toThrow(/OUTPOST_LAN_ACCESS is not set/);
    expect(loadConfig({ OUTPOST_HOST: "0.0.0.0", OUTPOST_LAN_ACCESS: "true" }).authRequired).toBe(true);
    // In a container the listening address says nothing; the published address decides.
    expect(() => loadConfig({ OUTPOST_HOST: "0.0.0.0", OUTPOST_IN_CONTAINER: "true" })).toThrow(/published only to this computer/);
    expect(() => loadConfig({ OUTPOST_HOST: "0.0.0.0", OUTPOST_IN_CONTAINER: "true", OUTPOST_PUBLISHED_ADDRESS: "0.0.0.0" })).toThrow(/published only to this computer/);
    expect(loadConfig({ OUTPOST_HOST: "0.0.0.0", OUTPOST_IN_CONTAINER: "true", OUTPOST_PUBLISHED_ADDRESS: "127.0.0.1" }).authRequired).toBe(false);
    expect(loadConfig({ OUTPOST_HOST: "0.0.0.0", OUTPOST_IN_CONTAINER: "true", OUTPOST_PUBLISHED_ADDRESS: "0.0.0.0", OUTPOST_LAN_ACCESS: "true" }).authRequired).toBe(true);
  });

  it("refuses LAN access without sign-in unless that is stated explicitly", () => {
    expect(() => loadConfig({ OUTPOST_LAN_ACCESS: "true", OUTPOST_AUTH: "off" })).toThrow(/OUTPOST_AUTH is off/);
    expect(
      loadConfig({ OUTPOST_LAN_ACCESS: "true", OUTPOST_AUTH: "off", OUTPOST_ALLOW_UNAUTHENTICATED_LAN: "true" }).authRequired,
    ).toBe(false);
  });
});

describe("path safety", () => {
  it("keeps paths inside their root", () => {
    expect(resolveInside("/srv/lib", "a/b.txt")).toBe("/srv/lib/a/b.txt");
    expect(() => resolveInside("/srv/lib", "../etc/passwd")).toThrow();
    expect(() => resolveInside("/srv/lib", "/etc/passwd")).toThrow();
    expect(() => resolveInside("/srv/lib", "a/../../x")).toThrow();
    expect(() => resolveInside("/srv/lib", "a\0b")).toThrow();
  });

  it("makes file names safe on every supported filesystem", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etc passwd");
    expect(safeFileName('re:port?*"<>|.pdf')).toBe("re port .pdf");
    expect(safeFileName("CON.txt")).toBe("file");
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName("Zürich guide.pdf")).toBe("Zürich guide.pdf");
    expect(safeFileName(`${"a".repeat(300)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});

describe("network guards", () => {
  it("treats private, loopback and link-local addresses as non-public", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.10", "172.20.0.1", "169.254.169.254", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    for (const address of ["1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("accepts only names that belong to this server as Host", () => {
    const local = { lanAccess: false, allowedHosts: ["outpost.example"] };
    expect(isAllowedHost("localhost", local)).toBe(true);
    expect(isAllowedHost("127.0.0.1", local)).toBe(true);
    expect(isAllowedHost("outpost.example", local)).toBe(true);
    expect(isAllowedHost("evil.example", local)).toBe(false);
    expect(isAllowedHost("192.168.1.20", local)).toBe(false);
    const lan = { lanAccess: true, allowedHosts: [] };
    expect(isAllowedHost("192.168.1.20", lan)).toBe(true);
    expect(isAllowedHost("outpost.local", lan)).toBe(true);
    expect(isAllowedHost("raspberrypi", lan)).toBe(true);
    expect(isAllowedHost("evil.example", lan)).toBe(false);
  });

  it("backs off exponentially between retries", () => {
    const fixed = () => 0.5;
    expect(retryDelayMs(1, fixed)).toBe(2000);
    expect(retryDelayMs(2, fixed)).toBe(4000);
    expect(retryDelayMs(5, fixed)).toBe(32000);
    expect(retryDelayMs(20, fixed)).toBe(300000);
  });
});

describe("request security", () => {
  it("serves health without sign-in and rejects unknown hosts", async () => {
    app = await createTestApp();
    expect((await app.api("GET", "/api/health")).body.status).toBe("ok");
    const rebind = await app.app.inject({ method: "GET", url: "/api/health", headers: { host: "attacker.example" } });
    expect(rebind.statusCode).toBe(403);
  });

  it("rejects state-changing requests that do not come from the app", async () => {
    app = await createTestApp();
    const missingHeader = await app.app.inject({ method: "PATCH", url: "/api/settings", headers: { host: "localhost" }, payload: {} });
    expect(missingHeader.statusCode).toBe(403);
    const crossSite = await app.api("PATCH", "/api/settings", {}, { headers: { origin: "https://evil.example" } });
    expect(crossSite.status).toBe(403);
    const fetchMetadata = await app.api("PATCH", "/api/settings", {}, { headers: { "sec-fetch-site": "cross-site" } });
    expect(fetchMetadata.status).toBe(403);
    const ok = await app.api("PATCH", "/api/settings", { "downloads.concurrency": 3 });
    expect(ok.status).toBe(200);
    expect(ok.body.settings["downloads.concurrency"]).toBe(3);
  });

  it("changes only the settings it is given", async () => {
    app = await createTestApp();
    await app.api("PATCH", "/api/settings", { "downloads.concurrency": 5, "maps.tileSource": "https://tiles.example/planet.pmtiles" });
    const { body } = await app.api("PATCH", "/api/settings", { "indexing.chunkSize": 900 });
    expect(body.settings).toMatchObject({ "downloads.concurrency": 5, "maps.tileSource": "https://tiles.example/planet.pmtiles", "indexing.chunkSize": 900 });
    // And they are still there after a restart.
    const dir = app.dir;
    await app.app.close();
    app = await createTestApp({}, dir);
    expect((await app.api("GET", "/api/settings")).body.settings).toMatchObject({ "downloads.concurrency": 5, "indexing.chunkSize": 900 });
  });

  it("validates settings and ignores nothing silently", async () => {
    app = await createTestApp();
    expect((await app.api("PATCH", "/api/settings", { "downloads.concurrency": 99 })).status).toBe(400);
    expect((await app.api("PATCH", "/api/settings", { "no.such.setting": 1 })).status).toBe(400);
  });
});

describe("sign-in", () => {
  it("requires an account once sign-in is on, and protects admin operations", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    expect((await app.api("GET", "/api/settings")).status).toBe(401);
    const session = await app.api("GET", "/api/auth/session");
    expect(session.body).toMatchObject({ authRequired: true, setupRequired: true, user: null });

    expect((await app.api("POST", "/api/auth/setup", { username: "tyler", password: "short" })).status).toBe(400);
    const setup = await app.api("POST", "/api/auth/setup", { username: "tyler", password: "correct horse battery" });
    expect(setup.status).toBe(200);
    const cookie = String(setup.headers["set-cookie"]).split(";")[0]!;
    expect(String(setup.headers["set-cookie"])).toMatch(/HttpOnly/i);
    expect((await app.api("POST", "/api/auth/setup", { username: "second", password: "correct horse battery" })).status).toBe(409);

    const asAdmin = { headers: { cookie } };
    expect((await app.api("GET", "/api/settings", undefined, asAdmin)).status).toBe(200);

    const member = await app.api("POST", "/api/users", { username: "guest", password: "a long enough password", role: "member" }, asAdmin);
    expect(member.status).toBe(200);
    const login = await app.api("POST", "/api/auth/login", { username: "guest", password: "a long enough password" });
    const memberCookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const asMember = { headers: { cookie: memberCookie } };
    expect((await app.api("GET", "/api/settings", undefined, asMember)).status).toBe(200);
    expect((await app.api("PATCH", "/api/settings", { "downloads.concurrency": 1 }, asMember)).status).toBe(403);
    expect((await app.api("GET", "/api/users", undefined, asMember)).status).toBe(403);

    expect((await app.api("POST", "/api/auth/login", { username: "guest", password: "wrong password!!" })).status).toBe(401);
    await app.api("POST", "/api/auth/logout", {}, asMember);
    expect((await app.api("GET", "/api/settings", undefined, asMember)).status).toBe(401);
  });

  it("asks for a setup token when the first-run form is reachable from the network", async () => {
    app = await createTestApp({ OUTPOST_LAN_ACCESS: "true" });
    const token = app.ctx.services.auth.setupToken;
    expect(token).toBeTruthy();
    const without = await app.api("POST", "/api/auth/setup", { username: "tyler", password: "correct horse battery" });
    expect(without.status).toBe(403);
    const withToken = await app.api("POST", "/api/auth/setup", { username: "tyler", password: "correct horse battery", setupToken: token });
    expect(withToken.status).toBe(200);
  });
});

describe("storage locations", () => {
  it("creates an internal location on first start and reports capacity", async () => {
    app = await createTestApp();
    const { body } = await app.api("GET", "/api/storage/locations");
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0]).toMatchObject({ name: "Internal storage", isDefault: true, status: "available" });
    expect(body.locations[0].totalBytes).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(body.locations[0].path, ".outpost-location.json"))).toBe(true);
  });

  it("only allows locations inside the configured roots", async () => {
    app = await createTestApp();
    const outside = await app.api("POST", "/api/storage/locations", { name: "Etc", path: "/etc/outpost", kind: "external" });
    expect(outside.status).toBe(403);
    const traversal = await app.api("POST", "/api/storage/locations", { name: "Up", path: path.join(app.dir, "storage", "..", "..", "x"), kind: "external" });
    expect(traversal.status).toBe(403);
    expect((await app.api("GET", `/api/storage/browse?path=${encodeURIComponent("/etc")}`)).status).toBe(403);
    const inside = await app.api("POST", "/api/storage/locations", { name: "USB", path: path.join(app.dir, "storage", "usb"), kind: "external" });
    expect(inside.status).toBe(200);
    const overlap = await app.api("POST", "/api/storage/locations", { name: "Nested", path: path.join(app.dir, "storage", "usb", "deeper"), kind: "external" });
    expect(overlap.status).toBe(409);
  });

  it("notices a disconnected drive, keeps its record, and reconnects it at a new path", async () => {
    app = await createTestApp();
    const usbPath = path.join(app.dir, "storage", "usb");
    const created = await app.api("POST", "/api/storage/locations", { name: "USB", path: usbPath, kind: "external" });
    const id = created.body.location.id as string;

    // Unplug: the mount point disappears.
    const parked = path.join(app.dir, "parked");
    fs.renameSync(usbPath, parked);
    let refreshed = await app.api("POST", "/api/storage/refresh");
    let usb = refreshed.body.locations.find((location: { id: string }) => location.id === id);
    expect(usb.status).toBe("unavailable");
    expect(usb.statusDetail).toMatch(/not reachable/);
    expect(() => app!.ctx.services.storage.resolve(id, "x")).toThrow(/not connected/);

    // Plug back in under a different mount name.
    const remounted = path.join(app.dir, "storage", "usb-renamed");
    fs.renameSync(parked, remounted);
    refreshed = await app.api("POST", "/api/storage/refresh");
    usb = refreshed.body.locations.find((location: { id: string }) => location.id === id);
    expect(usb.status).toBe("available");
    expect(usb.path).toBe(remounted);
  });

  it("does not mistake a different drive at the same path for the original", async () => {
    app = await createTestApp();
    const usbPath = path.join(app.dir, "storage", "usb");
    const created = await app.api("POST", "/api/storage/locations", { name: "USB", path: usbPath, kind: "external" });
    fs.rmSync(path.join(usbPath, ".outpost-location.json"));
    const refreshed = await app.api("POST", "/api/storage/refresh");
    const usb = refreshed.body.locations.find((location: { id: string }) => location.id === created.body.location.id);
    expect(usb.status).toBe("unavailable");
    expect(usb.statusDetail).toMatch(/different one/);
  });

  it("refuses to drop the last location or one that still holds content", async () => {
    app = await createTestApp();
    const { body } = await app.api("GET", "/api/storage/locations");
    expect((await app.api("DELETE", `/api/storage/locations/${body.locations[0].id}`)).status).toBe(409);
  });
});

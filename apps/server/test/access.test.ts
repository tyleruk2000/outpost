import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { READ_BY_POST } from "../src/modules/access/index.ts";
import { createAttemptLimit } from "../src/modules/access/service.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** The device cookie from a Set-Cookie header. */
function cookieFrom(headers: Record<string, unknown>): string {
  const header = String(headers["set-cookie"] ?? "");
  const value = /outpost_device=([^;]*)/.exec(header)?.[1] ?? "";
  return `outpost_device=${value}`;
}

const withCookie = (cookie: string, remoteAddress?: string) => ({ headers: { cookie }, ...(remoteAddress ? { remoteAddress } : {}) });

describe("the household PIN", () => {
  it("changes nothing until a PIN is set", async () => {
    app = await createTestApp();
    const state = await app.api("GET", "/api/access");
    expect(state.body.access).toMatchObject({ mode: "open", canChange: true, pinSetAt: null });
    expect((await app.api("POST", "/api/notes", { title: "Open" })).status).toBe(200);
  });

  it("lets every device read, and only an unlocked one change or delete", async () => {
    app = await createTestApp();
    const note = (await app.api("POST", "/api/notes", { title: "Before" })).body.note;
    const set = await app.api("POST", "/api/access/pin", { pin: "2468" });
    expect(set.status).toBe(200);
    expect(set.body.access).toMatchObject({ mode: "pin", canChange: true, unlockedDevices: 1 });
    expect(JSON.stringify(set.headers["set-cookie"])).toContain("HttpOnly");
    const unlocked = cookieFrom(set.headers);

    // A guest: reads, and is refused every kind of change.
    expect((await app.api("GET", `/api/notes/${note.id}`)).status).toBe(200);
    expect((await app.api("GET", "/api/access")).body.access).toMatchObject({ mode: "pin", canChange: false });
    for (const [method, url, body] of [
      ["POST", "/api/notes", { title: "Guest" }],
      ["PATCH", `/api/notes/${note.id}`, { title: "Changed" }],
      ["DELETE", `/api/notes/${note.id}`, undefined],
      ["PATCH", "/api/settings", { "downloads.concurrency": 3 }],
      ["POST", "/%61pi/notes", { title: "Escaped" }],
    ] as const) {
      const refused = await app.api(method, url, body);
      expect(refused.status, `${method} ${url}`).toBe(403);
      expect(refused.body.error.code).toBe("locked");
    }
    // A question asked by POST is still a read.
    expect((await app.api("POST", "/api/manage/plan", { action: "remove", items: [] })).body.error?.code).not.toBe("locked");

    // The device that set the PIN changes things.
    const changed = await app.api("PATCH", `/api/notes/${note.id}`, { title: "Changed" }, withCookie(unlocked));
    expect(changed.status).toBe(200);
    // The guard's own checks still apply to it.
    const noHeader = await app.app.inject({
      method: "POST",
      url: "/api/notes",
      headers: { host: "localhost", cookie: unlocked },
      payload: {},
    });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json().error.code).toBe("forbidden");
  });

  it("unlocks with the PIN, locks again, and says which is which", async () => {
    app = await createTestApp();
    await app.api("POST", "/api/access/pin", { pin: "13579" });
    const wrong = await app.api("POST", "/api/access/unlock", { pin: "0000" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.details.wrongPin).toBe(true);

    const right = await app.api("POST", "/api/access/unlock", { pin: "13579" });
    expect(right.body.access).toMatchObject({ canChange: true, unlockedDevices: 2 });
    const cookie = cookieFrom(right.headers);
    expect((await app.api("POST", "/api/notes", { title: "Unlocked" }, withCookie(cookie))).status).toBe(200);

    const locked = await app.api("POST", "/api/access/lock", {}, withCookie(cookie));
    expect(locked.body.access.canChange).toBe(false);
    expect((await app.api("POST", "/api/notes", { title: "Locked" }, withCookie(cookie))).body.error.code).toBe("locked");
  });

  it("asks for the PIN in use to change or remove it, and a new PIN locks every other device", async () => {
    app = await createTestApp();
    const first = cookieFrom((await app.api("POST", "/api/access/pin", { pin: "1111" })).headers);
    const second = cookieFrom((await app.api("POST", "/api/access/unlock", { pin: "1111" })).headers);

    expect((await app.api("POST", "/api/access/pin", { pin: "2222" }, withCookie(first))).status).toBe(400);
    expect((await app.api("POST", "/api/access/pin", { pin: "2222", current: "9999" }, withCookie(first))).status).toBe(403);
    // A guest cannot change it even knowing it: it unlocks first.
    expect((await app.api("POST", "/api/access/pin", { pin: "2222", current: "1111" })).body.error.code).toBe("locked");

    const changed = await app.api("POST", "/api/access/pin", { pin: "2222", current: "1111" }, withCookie(first));
    expect(changed.body.access).toMatchObject({ canChange: true, unlockedDevices: 1 });
    const firstNow = cookieFrom(changed.headers);
    expect((await app.api("POST", "/api/notes", {}, withCookie(second))).body.error.code).toBe("locked");
    expect((await app.api("POST", "/api/notes", {}, withCookie(firstNow))).status).toBe(200);

    expect((await app.api("POST", "/api/access/remove", { current: "1111" }, withCookie(firstNow))).status).toBe(403);
    const removed = await app.api("POST", "/api/access/remove", { current: "2222" }, withCookie(firstNow));
    expect(removed.body.access).toMatchObject({ mode: "open", canChange: true });
    expect((await app.api("POST", "/api/notes", {})).status).toBe(200);
  });

  it("refuses a PIN that is not 4 to 12 digits, and never shows it in the settings", async () => {
    app = await createTestApp();
    expect((await app.api("POST", "/api/access/pin", { pin: "12" })).status).toBe(400);
    expect((await app.api("POST", "/api/access/pin", { pin: "12ab" })).status).toBe(400);
    await app.api("POST", "/api/access/pin", { pin: "864213" });
    const settings = await app.api("GET", "/api/settings");
    expect(JSON.stringify(settings.body)).not.toContain("access.");
    const row = app.ctx.sqlite.prepare("SELECT value FROM settings WHERE key = 'access.pin'").get() as { value: string };
    expect(row.value).not.toContain("864213");
  });

  it("counts wrong PINs by address, an IPv6 device by its /64", async () => {
    app = await createTestApp();
    await app.api("POST", "/api/access/pin", { pin: "4321" });
    const from = (address: string) => ({ remoteAddress: address });
    for (let i = 0; i < 5; i += 1) {
      const wrong = await app.api("POST", "/api/access/unlock", { pin: "0000" }, from(`2001:db8:1:2::${i + 10}`));
      expect(wrong.status).toBe(403);
    }
    // The next address in the same /64 is the same device, and waits: even with the right PIN.
    const waiting = await app.api("POST", "/api/access/unlock", { pin: "4321" }, from("2001:db8:1:2::99"));
    expect(waiting.status).toBe(429);
    expect(Number(waiting.headers["retry-after"])).toBeGreaterThan(0);
    // Another network is not held up by it.
    expect((await app.api("POST", "/api/access/unlock", { pin: "4321" }, from("2001:db8:1:3::1"))).status).toBe(200);
  });

  it("allows a try a minute once the first few are spent", () => {
    const limit = createAttemptLimit({ burst: 2, perMinute: 1 });
    limit.failed("a", 0);
    limit.failed("a", 0);
    expect(limit.wait("a", 0)).toBe(60);
    expect(limit.wait("a", 60_000)).toBe(0);
    expect(limit.wait("b", 0)).toBe(0);
  });

  it("is forgotten when Outpost starts with OUTPOST_FORGET_PIN", async () => {
    app = await createTestApp();
    await app.api("POST", "/api/access/pin", { pin: "5555" });
    const dir = app.dir;
    await app.app.close();
    app = undefined;
    const again = await createTestApp({ OUTPOST_FORGET_PIN: "true" }, dir);
    try {
      expect((await again.api("GET", "/api/access")).body.access.mode).toBe("open");
    } finally {
      await again.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets through by POST only routes that exist", async () => {
    app = await createTestApp();
    for (const url of READ_BY_POST) expect(app.app.hasRoute({ method: "POST", url }), url).toBe(true);
  });
});

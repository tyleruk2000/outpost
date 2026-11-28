/**
 * Streets for routes when something is wrong: the streets service installed but not
 * answering, answering badly, or refusing a route. A stand-in plays Valhalla
 * (fixtures/streets/valhalla-stand-in.ts) and the test writes the service's status.json.
 * Nothing reaches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import type { StreetsStatusResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createValhallaStandIn, sidecarStatus, type ValhallaStandIn, writeSidecarStatus } from "./fixtures/streets/valhalla-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const LEATHERHEAD = { lat: 51.2965, lon: -0.3303, name: "Leatherhead" };
const BOX_HILL = { lat: 51.2556, lon: -0.3106, name: "Box Hill" };

/** An address on this computer where nothing listens: a stand-in started and closed again. */
async function deadAddress(): Promise<string> {
  const gone = await createValhallaStandIn();
  await gone.close();
  return gone.url;
}

describe("the streets service installed, with streets built, but not answering", () => {
  let app: TestApp;
  beforeAll(async () => {
    const dir = tempDir("outpost-valhalla-");
    writeSidecarStatus(dir, sidecarStatus());
    app = await createTestApp({ OUTPOST_VALHALLA_URL: await deadAddress(), OUTPOST_VALHALLA_DIR: dir });
  });
  afterAll(async () => {
    await app.close();
  });

  it("says so, with where to look, and offers no way that needs it", async () => {
    const s = (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;
    expect(s.state).toBe("not-answering");
    expect(s.installed).toBe(true);
    expect(s.message).toMatch(
      /is not answering\. It may still be starting; otherwise check its container \(“docker compose ps valhalla”\)/,
    );
    expect(s.modes).toEqual({ driveDoor: false, walk: false, cycle: false, reach: { drive: null, walk: false, cycle: false } });
  });

  it("refuses each way of travelling with that sentence, not as if walking and cycling were missing", async () => {
    for (const mode of ["walk", "cycle", "drive-door"] as const) {
      const route = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode });
      expect(route.status, mode).toBe(503);
      expect(route.body.error.message, mode).toMatch(/is not answering/);
    }
    for (const mode of ["walk", "cycle"] as const) {
      const reach = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode, minutes: [30] });
      expect(reach.status, mode).toBe(503);
      expect(reach.body.error.message, mode).toMatch(/is not answering/);
      expect(reach.body.error.message, mode).not.toMatch(/add it for the place/);
    }
  });
});

describe("the streets service answering badly", () => {
  let standIn: ValhallaStandIn;
  const apps: TestApp[] = [];
  beforeAll(async () => {
    standIn = await createValhallaStandIn();
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    await standIn.close();
  });
  async function appWith(status: Record<string, unknown> | string) {
    const dir = tempDir("outpost-valhalla-");
    if (typeof status === "string") fs.writeFileSync(path.join(dir, "status.json"), status);
    else writeSidecarStatus(dir, status);
    const app = await createTestApp({ OUTPOST_VALHALLA_URL: standIn.url, OUTPOST_VALHALLA_DIR: dir });
    apps.push(app);
    return app;
  }

  it("says what answered when its health check fails", async () => {
    standIn.override = (p) => (p === "/status" ? { status: 500, body: "{}" } : null);
    const app = await appWith(sidecarStatus());
    const s = (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;
    standIn.override = null;
    expect(s.state).toBe("not-answering");
    expect(s.message).toBe("The streets service answered 500.");
  });

  it("says when something other than Valhalla answers at its address", async () => {
    standIn.override = (p) => (p === "/status" ? { status: 200, body: JSON.stringify({ hello: "world" }) } : null);
    const app = await appWith(sidecarStatus());
    const s = (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;
    standIn.override = null;
    expect(s.state).toBe("not-answering");
    expect(s.message).toMatch(/not Valhalla/);
  });

  it("says when its status file cannot be read, and plans nothing", async () => {
    const app = await appWith("{ not json");
    const s = (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;
    expect(s.state).toBe("problem");
    expect(s.message).toBe("The streets service's status cannot be read. Restart its container.");
    const route = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
    expect(route.status).toBe(400);
    expect(route.body.error.message).toMatch(/cannot be read/);
  });

  it("says when it is installed but nothing is built yet", async () => {
    const app = await appWith(sidecarStatus({ state: "idle", current: null }));
    const s = (await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse;
    expect(s.state).toBe("no-streets");
    const route = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "cycle" });
    expect(route.status).toBe(400);
    expect(route.body.error.message).toBe("Walking and cycling is not built yet. Add it for a place under Offline maps.");
  });
});

describe("the streets service refusing a route", () => {
  let app: TestApp;
  let standIn: ValhallaStandIn;
  beforeAll(async () => {
    standIn = await createValhallaStandIn();
    const dir = tempDir("outpost-valhalla-");
    writeSidecarStatus(dir, sidecarStatus());
    app = await createTestApp({ OUTPOST_VALHALLA_URL: standIn.url, OUTPOST_VALHALLA_DIR: dir });
  });
  afterAll(async () => {
    await app.close();
    await standIn.close();
  });

  const refuse = (code: number, error: string) => (p: string) =>
    p === "/route" || p === "/isochrone" ? { status: 400, body: JSON.stringify({ error_code: code, error }) } : null;

  it("puts Valhalla's refusals into words", async () => {
    const cases: Array<[number, string, RegExp]> = [
      [442, "No path could be found for input", /^No way joins these points on the streets built/],
      [443, "Exact route match algorithm failed to find path", /^No way joins these points/],
      [154, "Path distance exceeds the max distance limit", /^That is too far for this way of travelling/],
      [155, "Outside the valid walking distance", /^That is too far for this way of travelling/],
      [
        171,
        "No suitable edges near location",
        /away from every street in the streets built \(Great Britain\)\. Move it onto a street or path\.$/,
      ],
    ];
    for (const [code, said, words] of cases) {
      standIn.override = refuse(code, said);
      const route = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
      expect(route.status, String(code)).toBe(400);
      expect(route.body.error.message, String(code)).toMatch(words);
    }
    // One with no words of Outpost's own keeps Valhalla's, as a fault of the service rather than of the question.
    standIn.override = refuse(199, "Unknown failure");
    const odd = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "cycle" });
    expect(odd.status).toBe(502);
    expect(odd.body.error.message).toBe("The streets service could not plan this: Unknown failure");
    // A reachable area is refused the same way.
    standIn.override = refuse(171, "No suitable edges near location");
    const reach = await app.api("POST", "/api/streets/reach", { point: LEATHERHEAD, mode: "walk", minutes: [30] });
    expect(reach.status).toBe(400);
    expect(reach.body.error.message).toMatch(/away from every street/);
    standIn.override = null;
  });

  it("says when its answer cannot be read", async () => {
    standIn.override = (p) => (p === "/route" ? { status: 500, body: "<html>Internal Server Error</html>" } : null);
    const route = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
    standIn.override = null;
    expect(route.status).toBe(502);
    expect(route.body.error.message).toBe("The streets service's answer could not be read.");
  });

  it("says when it stops answering between two questions", async () => {
    // The health check passed a moment ago and is not asked again for a few seconds.
    expect(((await app.api("GET", "/api/streets/status")).body as StreetsStatusResponse).state).toBe("ready");
    await standIn.close();
    const route = await app.api("POST", "/api/streets/route", { points: [LEATHERHEAD, BOX_HILL], mode: "walk" });
    expect(route.status).toBe(502);
    expect(route.body.error.message).toBe("The streets service is not answering. Check that it is running (Map data shows its state).");
  });
});

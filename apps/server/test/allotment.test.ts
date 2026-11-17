/**
 * The allotment on a real server: one plot for the household, read without being
 * changed, changed only by actions the server stamps with its own clock, refused in
 * words a person can read, unharmed by a clock that jumps back, and counted and erased
 * with the rest of a person's own data.
 */
import type { AllotmentResponse } from "@outpost/shared/games/allotment";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppEvent } from "../src/core/events.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The plot's answer, or an error's (`{ error: { code, message, details } }`). */
type Answer = AllotmentResponse & { error: { code: string; message: string; details?: unknown } };
const get = () => app.api<Answer>("GET", "/api/games/allotment");
const act = (action: Record<string, unknown>) => app.api<Answer>("POST", "/api/games/allotment/actions", action);

describe("the plot", () => {
  it("is a new plot, not kept, until its first action", async () => {
    const first = await get();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ started: false, awayMs: 0, hemisphere: "north", hemisphereFrom: "default" });
    expect(first.body.plot.coins).toBe(10);
    expect(app.ctx.services.games.kept.count()).toEqual({ saves: 0 });
    expect((await app.api("GET", "/api/games")).body.allotmentStarted).toBe(false);
  });

  it("keeps a sowing and reads it back, and says the event", async () => {
    const events: AppEvent[] = [];
    const stop = app.ctx.events.subscribe((event) => events.push(event));
    try {
      const sown = await act({ type: "sow", bed: 0, crop: "radishes" });
      expect(sown.status).toBe(200);
      expect(sown.body.plot.beds[0]).toMatchObject({ crop: "radishes", watered: false });
      expect(sown.body.started).toBe(true);
    } finally {
      stop();
    }
    expect(events).toContainEqual(expect.objectContaining({ type: "games.changed", id: "allotment" }));
    const read = await get();
    expect(read.body.plot.beds[0]?.crop).toBe("radishes");
    expect(read.body.started).toBe(true);
    expect(app.ctx.services.games.kept.count()).toEqual({ saves: 1 });
  });

  it("is not changed by reading it", async () => {
    const before = app.ctx.services.games.saves.read("allotment");
    await get();
    await get();
    expect(app.ctx.services.games.saves.read("allotment")).toEqual(before);
  });

  it("refuses an action that cannot be done, saying why, and changes nothing", async () => {
    const before = app.ctx.services.games.saves.read("allotment");
    const refused = await act({ type: "sow", bed: 0, crop: "carrots" });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "conflict", message: "That bed already has radishes in it." });
    const poor = await act({ type: "buy", thing: "greenhouse" });
    expect(poor.body.error.message).toBe("The greenhouse costs 500 coins; you have 10.");
    expect(app.ctx.services.games.saves.read("allotment")?.version).toBe(before?.version);
  });

  it("checks every field of an action", async () => {
    for (const body of [
      { type: "sow", bed: 14, crop: "radishes" },
      { type: "sow", bed: -1, crop: "radishes" },
      { type: "sow", bed: 1.5, crop: "radishes" },
      { type: "sow", bed: 1, crop: "turnips" },
      { type: "sell", item: "radishes", count: 0 },
      { type: "sell", item: "radishes", count: 10_000 },
      { type: "buy", thing: "tractor" },
      { type: "collect", thing: "greenhouse" },
      { type: "setHemisphere", hemisphere: "east" },
      { type: "harvestAll", extra: true },
      { type: "plough" },
    ]) {
      expect((await act(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("is unharmed by a clock that jumps backwards", async () => {
    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + 10 * 60_000);
    const ripe = await get();
    expect(ripe.body.plot.beds[0]?.grown).toBe(4 * 60_000);
    // Stamped at the plot's clock, ten minutes ahead.
    await act({ type: "sow", bed: 1, crop: "radishes" });
    vi.spyOn(Date, "now").mockReturnValue(real - 24 * 3600_000);
    const back = await get();
    expect(back.body.plot.beds[0]?.grown).toBe(4 * 60_000);
    expect(back.body.now).toBeGreaterThanOrEqual(real + 10 * 60_000);
    const harvested = await act({ type: "harvest", bed: 0 });
    expect(harvested.status).toBe(200);
    expect(harvested.body.plot.basket.radishes).toBe(3);
    expect(harvested.body.plot.clock).toBe(real + 10 * 60_000);
  });

  it("applies two actions sent at once, one after the other", async () => {
    const [a, b] = await Promise.all([act({ type: "sow", bed: 2, crop: "radishes" }), act({ type: "sow", bed: 3, crop: "radishes" })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const plot = (await get()).body.plot;
    expect(plot.beds[2]?.crop).toBe("radishes");
    expect(plot.beds[3]?.crop).toBe("radishes");
  });

  it("says how long the household was away after six hours", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 7 * 3600_000);
    const away = await get();
    expect(away.body.awayMs).toBeGreaterThan(6 * 3600_000);
    // Everything waited: the radishes are ripe and still in their beds.
    expect(away.body.plot.beds.filter((bed) => bed.crop === "radishes")).toHaveLength(3);
  });
});

describe("the hemisphere", () => {
  it("comes from a home place south of the equator, and a setting overrides it", async () => {
    const marker = await app.api("POST", "/api/maps/markers", { name: "Home", lat: -41.29, lon: 174.78, icon: "home" });
    expect(marker.status).toBe(200);
    const read = await get();
    expect(read.body).toMatchObject({ hemisphere: "south", hemisphereFrom: "home place" });
    const set = await act({ type: "setHemisphere", hemisphere: "north" });
    expect(set.body).toMatchObject({ hemisphere: "north", hemisphereFrom: "setting" });
    await act({ type: "setHemisphere", hemisphere: "auto" });
    expect((await get()).body.hemisphere).toBe("south");
  });
});

describe("a damaged plot", () => {
  it("is not replaced: it is answered with an error saying so, and Start again clears it", async () => {
    app.ctx.sqlite.prepare("UPDATE game_saves SET state = ? WHERE id = 'allotment'").run(JSON.stringify({ v: 1, coins: "lots" }));
    const read = await get();
    expect(read.status).toBe(409);
    expect(read.body.error.message).toMatch(/could not be read.*Start again/);
    expect(read.body.error.details).toEqual({ damaged: true });
    expect((await act({ type: "harvestAll" })).status).toBe(409);
    expect((await app.api("DELETE", "/api/games/allotment")).body).toEqual({ removed: true });
    expect((await get()).body.started).toBe(false);
  });
});

describe("a person's own data", () => {
  it("counts the plot and erases it with everything else", async () => {
    await act({ type: "sow", bed: 0, crop: "radishes" });
    expect(app.ctx.services.games.kept.count()).toEqual({ saves: 1 });
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    let job = app.ctx.jobs.get(started.body.job.id);
    for (let tries = 0; tries < 400 && job && !["succeeded", "failed", "cancelled"].includes(job.state); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = app.ctx.jobs.get(started.body.job.id);
    }
    expect(job?.state).toBe("succeeded");
    expect(app.ctx.services.games.kept.count()).toEqual({ saves: 0 });
    expect((await get()).body.started).toBe(false);
  });
});

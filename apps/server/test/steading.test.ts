/**
 * The Steading on a real server: one settlement for the household, read without being
 * changed, changed only by actions the server stamps with its own clock, refused in words
 * a person can read, unharmed by a clock that jumps back, and forgotten with Start again.
 */
import type { SteadingResponse } from "@outpost/shared/games/steading";
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

type Answer = SteadingResponse & { error: { code: string; message: string; details?: unknown } };
const get = () => app.api<Answer>("GET", "/api/games/steading");
const act = (action: Record<string, unknown>) => app.api<Answer>("POST", "/api/games/steading/actions", action);

describe("the settlement", () => {
  it("is a new settlement, not kept, until its first action", async () => {
    const first = await get();
    expect(first.status).toBe(200);
    expect(first.body.started).toBe(false);
    expect(first.body.settlement.buildings.map((b) => b.kind)).toEqual(["storehouse", "house", "house", "well"]);
    expect(app.ctx.services.games.saves.read("steading")).toBeNull();
  });

  it("keeps a building and a route, and says the event", async () => {
    const events: AppEvent[] = [];
    const stop = app.ctx.events.subscribe((event) => events.push(event));
    try {
      const built = await act({ type: "build", kind: "woodcutter", x: 1, y: 8 });
      expect(built.status).toBe(200);
      const woodcutter = built.body.settlement.buildings.find((b) => b.kind === "woodcutter");
      expect(woodcutter).toBeDefined();
      const routed = await act({ type: "route", from: woodcutter?.id, to: 1, good: "logs", mode: "hand" });
      expect(routed.status).toBe(200);
      expect(routed.body.settlement.routes).toHaveLength(1);
      expect(routed.body.started).toBe(true);
    } finally {
      stop();
    }
    expect(events).toContainEqual(expect.objectContaining({ type: "games.changed", id: "steading" }));
    expect((await get()).body.settlement.routes).toHaveLength(1);
  });

  it("is not changed by reading it", async () => {
    const before = app.ctx.services.games.saves.read("steading");
    await get();
    expect(app.ctx.services.games.saves.read("steading")).toEqual(before);
  });

  it("refuses what cannot be done, in words, and changes nothing", async () => {
    const before = app.ctx.services.games.saves.read("steading");
    const refused = await act({ type: "build", kind: "house", x: 0, y: 0 });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe("Buildings stand on meadow.");
    const malformed = await act({ type: "build", kind: "castle", x: 0, y: 0 });
    expect(malformed.status).toBe(400);
    expect(app.ctx.services.games.saves.read("steading")?.version).toBe(before?.version);
  });

  it("works the settlement out to the server's time, and a clock that jumps back changes nothing", async () => {
    const real = Date.now();
    const later = real + 2 * 3600_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const ahead = await get();
    expect(ahead.body.settlement.clock).toBe(later);
    expect(ahead.body.settlement.stock.logs).toBeGreaterThan(10);
    await act({ type: "build", kind: "field", x: 3, y: 6 });
    vi.spyOn(Date, "now").mockReturnValue(real);
    const back = await act({ type: "build", kind: "quarry", x: 4, y: 5 });
    expect(back.status).toBe(200);
    expect(back.body.settlement.clock).toBe(later);
    expect(back.body.settlement.stock.logs).toBe(ahead.body.settlement.stock.logs);
  });

  it("says plainly when the kept settlement cannot be read, and Start again forgets it", async () => {
    app.ctx.services.games.saves.update("steading", () => ({ state: { v: 99 }, result: null }));
    const read = await get();
    expect(read.status).toBe(409);
    expect(read.body.error.details).toEqual({ damaged: true });
    const cleared = await app.api<{ removed: boolean }>("DELETE", "/api/games/steading");
    expect(cleared.body.removed).toBe(true);
    expect((await get()).body.started).toBe(false);
  });
});

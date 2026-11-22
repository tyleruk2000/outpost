/** An emergency plan kept on a phone: the copy, ticks made out of reach, and sending them when the server is back. */
import { type EmergencyPlanResponse, PLAN_TEMPLATES, type PlanTickMerge, planFromTemplate } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeCaches } from "./fake-caches";
import { refreshKept } from "./keep";
import { keepPlan, readKeptPlan, tickOnPhone, ticksOnPhone, withTick } from "./plan-copy";
import { forgetKeptSnapshot, getKept, listKept } from "./store";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const T = Date.UTC(2026, 10, 16, 14);

function answer(ticks: Record<string, number> = {}, startedAt: number | null = null): EmergencyPlanResponse {
  let n = 0;
  const input = planFromTemplate(PLAN_TEMPLATES.find((each) => each.id === "power-cut")!, () => `s${++n}`);
  return {
    plan: { ...input, id: "p1", use: { startedAt, ticks }, reviewedAt: T, openedAt: null, createdAt: T, updatedAt: T },
    resolved: { contacts: {}, places: {}, commPlan: undefined, powerPlan: undefined, links: [] },
  };
}

let restore: () => void;
let server: { plan: EmergencyPlanResponse | null; merges: PlanTickMerge[]; down: boolean };

beforeEach(() => {
  ({ restore } = installFakeCaches());
  forgetKeptSnapshot();
  server = { plan: answer({ s1: T }, T), merges: [], down: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (server.down) throw new TypeError("Failed to fetch");
      const path = new URL(String(input), window.location.origin).pathname;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (!server.plan) return json({ error: { code: "not_found", message: "Not found." } }, 404);
      if (path === "/api/emergency-plans/p1" && (init?.method ?? "GET") === "GET") return json(server.plan);
      if (path === "/api/emergency-plans/p1/ticks/merge") {
        const merge = JSON.parse(String(init?.body)) as PlanTickMerge;
        server.merges.push(merge);
        const ticks = { ...server.plan.plan.use.ticks };
        for (const [step, at] of Object.entries(merge.ticks)) ticks[step] = Math.min(ticks[step] ?? at, at);
        for (const [step, at] of Object.entries(merge.unticks)) if (ticks[step] === at) delete ticks[step];
        server.plan = { ...server.plan, plan: { ...server.plan.plan, use: { ...server.plan.plan.use, ticks } } };
        return json({ ...server.plan, applied: 1, dropped: 0 });
      }
      return json({ ok: true });
    }),
  );
});
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

describe("ticking on the phone", () => {
  it("adds, takes away and puts back, keeping the server's tick as the server had it", () => {
    const copy = answer({ s1: T }, T);
    let pending: PlanTickMerge = { knownStartedAt: T, ticks: {}, unticks: {} };
    pending = withTick(copy, pending, "s2", true, T + 5);
    expect(pending.ticks).toEqual({ s2: T + 5 });
    pending = withTick(copy, pending, "s1", false, T + 6);
    expect(pending.unticks).toEqual({ s1: T });
    expect(ticksOnPhone(copy, pending).ticks).toEqual({ s2: T + 5 });
    // Ticked again: the server's own tick, with its own time, comes back.
    pending = withTick(copy, pending, "s1", true, T + 7);
    expect(pending.unticks).toEqual({});
    expect(ticksOnPhone(copy, pending).ticks).toEqual({ s1: T, s2: T + 5 });
    pending = withTick(copy, pending, "s2", false, T + 8);
    expect(pending).toEqual({ knownStartedAt: T, ticks: {}, unticks: {} });
  });

  it("starts the plan on the phone at the first tick made there when it was not started", () => {
    const copy = answer();
    const pending = withTick(copy, { knownStartedAt: null, ticks: {}, unticks: {} }, "s3", true, T + 9);
    expect(ticksOnPhone(copy, pending).startedAt).toBe(T + 9);
  });
});

describe("a plan kept on the phone", () => {
  it("keeps the server's answer, keeps two quick ticks made out of reach, and sends them once when the server is back", async () => {
    const item = await keepPlan("p1");
    expect(item).toMatchObject({ kind: "plan", id: "p1", title: "Power cut", pending: 0 });
    expect((await readKeptPlan("p1"))?.answer.plan.use.ticks).toEqual({ s1: T });

    server.down = true;
    await Promise.all([tickOnPhone("p1", "s2", true), tickOnPhone("p1", "s3", true)]);
    const kept = await readKeptPlan("p1");
    expect(Object.keys(kept!.pending.ticks).sort()).toEqual(["s2", "s3"]);
    expect((await getKept("plan", "p1"))?.pending).toBe(2);
    // Still out of reach: nothing is lost.
    await expect(refreshKept()).rejects.toThrow();
    expect((await getKept("plan", "p1"))?.pending).toBe(2);

    // Meanwhile another phone in reach ticked s2 earlier.
    server.down = false;
    server.plan = answer({ s1: T, s2: T - 1000 }, T);
    await refreshKept();
    expect(server.merges).toHaveLength(1);
    expect(server.merges[0]).toMatchObject({ knownStartedAt: T, unticks: {} });
    const after = await readKeptPlan("p1");
    expect(after?.answer.plan.use.ticks).toMatchObject({ s1: T, s2: T - 1000 });
    expect(after?.pending).toEqual({ knownStartedAt: T, ticks: {}, unticks: {} });
    expect((await getKept("plan", "p1"))?.pending).toBe(0);
    await refreshKept();
    expect(server.merges).toHaveLength(1);
  });

  it("is marked gone, with its ticks kept, when the plan has been deleted on the server", async () => {
    await keepPlan("p1");
    server.down = true;
    await tickOnPhone("p1", "s2", true);
    server.down = false;
    server.plan = null;
    await refreshKept();
    const item = (await listKept()).find((entry) => entry.kind === "plan");
    expect(item).toMatchObject({ gone: true, pending: 1 });
  });
});

describe("a plan of one of several households", () => {
  it("keeps the household's name with the copy and its line, and none with one household", async () => {
    server.plan = { ...answer(), household: { id: "caravan", name: "Caravan", several: true } };
    const item = await keepPlan("p1");
    expect(item.household).toBe("Caravan");
    expect((await readKeptPlan("p1"))?.answer.household?.name).toBe("Caravan");

    server.plan = { ...answer(), household: { id: "household", name: "Home", several: false } };
    expect((await keepPlan("p1")).household).toBeUndefined();
  });
});

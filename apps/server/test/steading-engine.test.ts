/**
 * The Steading's engine (packages/shared/src/games/steading), run with the server's tests
 * as the allotment's is. Work flows along routes; a building with nothing coming in makes
 * nothing; a yard or a store that fills stops the work that fills it; households move in
 * only to houses with water, food and firewood to hand. Above all: time away never makes
 * anything worse, and a long time worked out at once is the same as in small steps.
 */
import {
  advance,
  applyAction,
  type Building,
  DAY_MS,
  flowsOf,
  GOOD_IDS,
  HOUSE_NEEDS,
  HOUSE_TAKES,
  KCAL_PER_LOAF,
  KINDS,
  KWH_PER_BUNDLE,
  newSteading,
  peopleOf,
  readSteading,
  STORE_CAP,
  type SteadingAction,
  SteadingRefusal,
  type SteadingState,
  solve,
  terrainAt,
  VALLEY_HEIGHT,
  VALLEY_ROWS,
  VALLEY_WIDTH,
  YARD_CAP,
} from "@outpost/shared/games/steading";
import { describe, expect, it } from "vitest";

const T0 = Date.UTC(2027, 0, 1);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The thing asked for, which the test knows is there. */
function there<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}
const act = (state: SteadingState, action: SteadingAction, at = state.clock) => applyAction(state, action, at);
const idAt = (state: SteadingState, x: number, y: number) => {
  const found = state.buildings.find((b) => b.x === x && b.y === y);
  if (!found) throw new Error(`nothing at ${x},${y}`);
  return found.id;
};
/** A settlement with plenty in the store, for building without waiting. */
const stocked = (now = T0, amount = 150): SteadingState => {
  const state = newSteading(now);
  return { ...state, stock: Object.fromEntries(GOOD_IDS.map((good) => [good, amount])) as SteadingState["stock"] };
};
/** Adds occupied houses on the given squares (for tests that need more people than a new settlement has). */
function withHouseholds(state: SteadingState, squares: [number, number][]): SteadingState {
  let next = state;
  for (const [x, y] of squares) {
    const house: Building = { id: next.nextId, kind: "house", x, y, paused: false, yard: {}, occupied: true };
    next = { ...next, nextId: next.nextId + 1, buildings: [...next.buildings, house] };
  }
  return next;
}

/** The food chain and the timber chain, laid out round the first storehouse. */
function village(now = T0): SteadingState {
  let s = stocked(now);
  s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 8 });
  s = act(s, { type: "build", kind: "woodyard", x: 2, y: 7 });
  s = act(s, { type: "build", kind: "field", x: 3, y: 6 });
  s = act(s, { type: "build", kind: "mill", x: 4, y: 6 });
  s = act(s, { type: "build", kind: "bakery", x: 5, y: 6 });
  s = act(s, { type: "build", kind: "quarry", x: 4, y: 5 });
  const [wc, wy, field, mill, bakery, quarry] = [idAt(s, 1, 8), idAt(s, 2, 7), idAt(s, 3, 6), idAt(s, 4, 6), idAt(s, 5, 6), idAt(s, 4, 5)];
  s = act(s, { type: "route", from: wc, to: wy, good: "logs", mode: "cart" });
  s = act(s, { type: "route", from: wc, to: 1, good: "logs", mode: "cart" });
  s = act(s, { type: "route", from: field, to: mill, good: "grain", mode: "cart" });
  s = act(s, { type: "route", from: mill, to: bakery, good: "flour", mode: "cart" });
  s = act(s, { type: "route", from: wy, to: bakery, good: "firewood", mode: "hand" });
  s = act(s, { type: "route", from: wy, to: 1, good: "firewood", mode: "cart" });
  s = act(s, { type: "route", from: bakery, to: 1, good: "bread", mode: "cart" });
  s = act(s, { type: "route", from: quarry, to: 1, good: "stone", mode: "hand" });
  return s;
}

describe("the valley", () => {
  it("is a grid of known ground, with the first buildings on meadow", () => {
    expect(VALLEY_ROWS.every((row) => row.length === VALLEY_WIDTH)).toBe(true);
    const { map } = newSteading(T0);
    for (let y = 0; y < VALLEY_HEIGHT; y++) for (let x = 0; x < VALLEY_WIDTH; x++) expect(terrainAt(map, x, y)).not.toBeNull();
    for (const b of newSteading(T0).buildings) expect(terrainAt(map, b.x, b.y)).toBe("meadow");
    expect(terrainAt(map, -1, 0)).toBeNull();
  });

  it("holds the real figures for a household's day", () => {
    expect(KCAL_PER_LOAF).toBe(2128);
    expect(HOUSE_NEEDS.kcal).toBe(9000);
    expect(HOUSE_NEEDS.litres).toBe(60);
    expect(HOUSE_NEEDS.heatKwh).toBeCloseTo(26.03, 2);
    expect(HOUSE_NEEDS.electricityKwh).toBeCloseTo(6.85, 2);
    expect(KWH_PER_BUNDLE).toBeCloseTo(41, 6);
    expect(HOUSE_TAKES.bread).toBeCloseTo(4.23, 2);
  });
});

describe("work flows along routes", () => {
  it("carries by hand only so much, and keeps the rest in the yard until the yard is full", () => {
    let s = act(newSteading(T0), { type: "build", kind: "woodcutter", x: 1, y: 8 });
    const wc = idAt(s, 1, 8);
    s = act(s, { type: "route", from: wc, to: 1, good: "logs", mode: "hand" });
    const flows = solve(s);
    expect(there(flows.routes[there(s.routes[0]).id])).toBe(12);
    expect(there(flows.buildings[wc]).toYard.logs).toBe(12);
    // 20 logs fit in the yard: full after 20/12 of a day, then the woodcutter works at the route's pace.
    s = advance(s, T0 + 2 * DAY_MS);
    expect(s.buildings.find((b) => b.id === wc)?.yard.logs).toBe(YARD_CAP);
    expect(s.stock.logs).toBeCloseTo(10 + 24, 9);
    const after = there(solve(s).buildings[wc]);
    expect(after.makes.logs).toBe(12);
    expect(after.limit).toEqual({ kind: "room", good: "logs" });
  });

  it("makes nothing in a bakery with no flour, and says so", () => {
    let s = act(stocked(), { type: "build", kind: "bakery", x: 5, y: 6 });
    const bakery = there(solve(s).buildings[idAt(s, 5, 6)]);
    expect(bakery.makes.bread ?? 0).toBe(0);
    expect(bakery.limit.kind).toBe("input");
    s = advance(s, T0 + 30 * DAY_MS);
    expect(s.stock.bread).toBe(150);
  });

  it("fills a quarry's yard when it has no route, then stops", () => {
    let s = act(newSteading(T0), { type: "build", kind: "quarry", x: 4, y: 5 });
    s = advance(s, T0 + 10 * DAY_MS);
    const quarry = s.buildings.find((b) => b.kind === "quarry") as Building;
    expect(quarry.yard.stone).toBe(YARD_CAP);
    expect(there(solve(s).buildings[quarry.id]).makes.stone).toBe(0);
    expect(s.stock.stone).toBe(20);
  });

  it("runs a chain at the pace of its narrowest part", () => {
    const s = village();
    const flows = solve(s);
    const bakery = there(flows.buildings[idAt(s, 5, 6)]);
    // The mill makes 20 flour a day; the bakery uses 10 of them and bakes 20 loaves.
    expect(bakery.uses.flour).toBeCloseTo(10, 9);
    expect(bakery.makes.bread).toBeCloseTo(20, 9);
    const mill = there(flows.buildings[idAt(s, 4, 6)]);
    expect(mill.makes.flour).toBeCloseTo(20, 9);
    expect(mill.toYard.flour).toBeCloseTo(10, 9);
    // What reaches the store goes first to the households, the rest into stock.
    expect(flows.store.bread.inflow).toBeCloseTo(20, 9);
    expect(flows.store.bread.toHouses).toBeCloseTo(2 * (HOUSE_TAKES.bread ?? 0), 9);
  });

  it("sends along a building's first route first", () => {
    let s = village();
    const wc = idAt(s, 1, 8);
    const toStore = s.routes.find((r) => r.from === wc && r.to === 1);
    if (!toStore) throw new Error("no route");
    const before = there(solve(s).routes[toStore.id]);
    s = act(s, { type: "routeFirst", id: toStore.id });
    expect(there(solve(s).routes[toStore.id])).toBeGreaterThan(before);
  });

  it("stops filling a full store, keeping everything", () => {
    let s = act(newSteading(T0), { type: "build", kind: "woodcutter", x: 1, y: 8 });
    s = act(s, { type: "route", from: idAt(s, 1, 8), to: 1, good: "logs", mode: "cart" });
    s = advance(s, T0 + 100 * DAY_MS);
    expect(s.stock.logs).toBe(STORE_CAP);
    expect(there(solve(s).routes[there(s.routes[0]).id])).toBe(0);
  });

  it("runs a powered workshop twice as fast with a water wheel in reach", () => {
    let s = withHouseholds(stocked(), [
      [6, 8],
      [7, 8],
      [6, 9],
      [7, 9],
    ]);
    expect(peopleOf(s)).toBe(24);
    s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 10 });
    s = act(s, { type: "build", kind: "sawmill", x: 5, y: 10 });
    s = act(s, { type: "route", from: idAt(s, 1, 10), to: idAt(s, 5, 10), good: "logs", mode: "cart" });
    s = act(s, { type: "route", from: idAt(s, 5, 10), to: 1, good: "planks", mode: "cart" });
    const sawmill = idAt(s, 5, 10);
    expect(there(solve(s).buildings[sawmill]).makes.planks).toBeCloseTo(24, 9);
    s = act(s, { type: "build", kind: "wheel", x: 8, y: 10 });
    const powered = there(solve(s).buildings[sawmill]);
    expect(powered.power).toBe(40);
    expect(powered.makes.planks).toBeCloseTo(48, 9);
    expect(powered.uses.logs).toBeCloseTo(24, 9);
  });
});

describe("households", () => {
  it("move in once a house has water, food and firewood to hand, and never leave", () => {
    let s = village();
    s = act(s, { type: "build", kind: "house", x: 4, y: 8 });
    const house = idAt(s, 4, 8);
    expect(s.buildings.find((b) => b.id === house)?.occupied).toBe(true);
    expect(peopleOf(s)).toBe(12);
    expect(s.milestones["first-household"]).toBe(T0);
    // A house far from any well waits.
    s = act(s, { type: "build", kind: "house", x: 2, y: 2 });
    const far = idAt(s, 2, 2);
    expect(s.buildings.find((b) => b.id === far)?.occupied).toBe(false);
    expect(flowsOf(s).households.waiting.find((w) => w.id === far)?.for).toContain("well");
    // Taking the bakery away leaves everyone at home.
    s = act(s, { type: "remove", id: idAt(s, 5, 6) });
    s = advance(s, s.clock + 400 * DAY);
    expect(peopleOf(s)).toBe(12);
  });

  it("refuses to take down a house a household lives in", () => {
    expect(() => act(newSteading(T0), { type: "remove", id: 2 })).toThrow(SteadingRefusal);
  });
});

describe("time away never makes anything worse", () => {
  const snapshot = (s: SteadingState) => ({
    stock: { ...s.stock },
    made: { ...s.made },
    credit: s.credit,
    people: peopleOf(s),
    buildings: s.buildings.map((b) => ({ id: b.id, kind: b.kind, yard: { ...b.yard }, occupied: b.occupied })),
    routes: s.routes.map((r) => r.id),
    milestones: { ...s.milestones },
  });

  function expectNoWorse(before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>) {
    for (const good of GOOD_IDS) {
      expect(after.stock[good]).toBeGreaterThanOrEqual(before.stock[good]);
      expect(after.made[good]).toBeGreaterThanOrEqual(before.made[good]);
      expect(Number.isFinite(after.stock[good])).toBe(true);
    }
    expect(after.credit).toBeGreaterThanOrEqual(before.credit);
    expect(after.people).toBeGreaterThanOrEqual(before.people);
    expect(after.routes).toEqual(before.routes);
    expect(after.buildings.map((b) => b.id)).toEqual(before.buildings.map((b) => b.id));
    for (const [i, b] of before.buildings.entries()) {
      const later = there(after.buildings[i]);
      if (b.occupied) expect(later.occupied).toBe(true);
      for (const good of GOOD_IDS) expect(later.yard[good] ?? 0).toBeGreaterThanOrEqual(b.yard[good] ?? 0);
    }
    for (const [id, at] of Object.entries(before.milestones)) expect(after.milestones[id as keyof typeof after.milestones]).toBe(at);
  }

  for (const [name, away] of [
    ["a day", DAY],
    ["a month", 30 * DAY],
    ["a year", 365 * DAY],
  ] as const) {
    it(`left ${name} with no one playing, no stock, building, person or score is lower`, () => {
      let s = village();
      s = act(s, { type: "build", kind: "house", x: 4, y: 8 });
      s = act(s, { type: "build", kind: "house", x: 3, y: 9 });
      s = act(s, { type: "build", kind: "claypit", x: 7, y: 5 });
      const before = snapshot(s);
      const after = advance(s, s.clock + away);
      expectNoWorse(before, snapshot(after));
      expect(after.clock).toBe(s.clock + away);
      // And it was not idle: something was made.
      expect(after.made.bread).toBeGreaterThan(before.made.bread);
    });
  }

  it("is the same worked out in one step as in many", () => {
    const s = village();
    const once = advance(s, s.clock + 7 * DAY);
    let steps = s;
    for (let hour = 1; hour <= 7 * 24; hour++) steps = advance(steps, s.clock + hour * HOUR);
    for (const good of GOOD_IDS) {
      expect(steps.stock[good]).toBeCloseTo(once.stock[good], 6);
      expect((steps.made[good] - once.made[good]) / Math.max(1, once.made[good])).toBeCloseTo(0, 9);
    }
    for (const [i, b] of once.buildings.entries())
      for (const good of GOOD_IDS) expect(there(steps.buildings[i]).yard[good] ?? 0).toBeCloseTo(b.yard[good] ?? 0, 6);
  });

  it("changes nothing when the clock goes backwards", () => {
    const s = advance(village(), T0 + DAY);
    expect(advance(s, T0)).toEqual(s);
  });

  it("works out a year in moments", () => {
    const s = village();
    const started = performance.now();
    advance(s, s.clock + 365 * DAY);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("actions", () => {
  it("refuses what cannot be done, with words, and changes nothing", () => {
    const s = newSteading(T0);
    expect(() => act(s, { type: "build", kind: "house", x: 0, y: 0 })).toThrow("Buildings stand on meadow.");
    expect(() => act(s, { type: "build", kind: "quarry", x: 3, y: 6 })).toThrow(/beside rock/);
    expect(() => act(s, { type: "build", kind: "landing", x: 8, y: 2 })).toThrow(/12 people/);
    const poor = { ...s, stock: { ...s.stock, stone: 0 } };
    expect(() => act(poor, { type: "build", kind: "well", x: 6, y: 6 })).toThrow(/not enough stone/);
    expect(() => act(s, { type: "route", from: 1, to: 2, good: "logs", mode: "hand" })).toThrow(SteadingRefusal);
  });

  it("gives back in full what a building and its routes cost, and its yard", () => {
    let s = act(stocked(), { type: "build", kind: "sawmill", x: 2, y: 9 });
    s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 9 });
    s = act(s, { type: "route", from: idAt(s, 1, 9), to: idAt(s, 2, 9), good: "logs", mode: "cart" });
    const before = stocked().stock;
    s = act(s, { type: "remove", id: idAt(s, 2, 9) });
    expect(s.stock.stone).toBe(before.stone);
    expect(s.stock.planks).toBe(before.planks);
    expect(s.routes).toEqual([]);
  });

  it("trades at the landing once there are 12 people", () => {
    let s = withHouseholds(stocked(), [[6, 8]]);
    s = act(s, { type: "build", kind: "landing", x: 8, y: 8 });
    s = act(s, { type: "sell", good: "planks", count: 10 });
    expect(s.credit).toBe(20);
    expect(s.stock.planks).toBe(150 - 30 - 10);
    s = act(s, { type: "buy", good: "iron", count: 1 });
    expect(s.credit).toBe(8);
    expect(s.stock.iron).toBe(151);
    expect(s.milestones["first-trade"]).toBeDefined();
    expect(() => act(s, { type: "buy", good: "bread", count: 1 })).toThrow(/makes its own/);
    s = act(s, { type: "contract", id: idAt(s, 8, 8), contract: "planks-ore" });
    expect(there(flowsOf(s).buildings[idAt(s, 8, 8)]).limit.kind).toBe("input");
  });

  it("only rests places of work", () => {
    const s = act(newSteading(T0), { type: "build", kind: "woodcutter", x: 1, y: 8 });
    const rested = act(s, { type: "pause", id: idAt(s, 1, 8), paused: true });
    expect(there(solve(rested).buildings[idAt(s, 1, 8)]).makes.logs ?? 0).toBe(0);
    expect(() => act(s, { type: "pause", id: 2, paused: true })).toThrow(SteadingRefusal);
  });
});

describe("a stored settlement", () => {
  it("reads back as it was written", () => {
    const s = advance(village(), T0 + DAY);
    expect(readSteading(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("is refused when damaged", () => {
    const s = newSteading(T0);
    expect(readSteading(null)).toBeNull();
    expect(readSteading({ ...s, v: 3 })).toBeNull();
    expect(readSteading({ ...s, stock: { ...s.stock, logs: -1 } })).toBeNull();
    expect(readSteading({ ...s, buildings: [...s.buildings, { ...s.buildings[0], id: 99 }] })).toBeNull();
    expect(readSteading({ ...s, buildings: [{ ...s.buildings[0], kind: "castle" }] })).toBeNull();
  });

  it("keeps every kind's numbers sound", () => {
    for (const kind of Object.values(KINDS)) {
      for (const n of [...Object.values(kind.inputs), ...Object.values(kind.outputs), ...Object.values(kind.cost)])
        expect(n).toBeGreaterThan(0);
    }
  });
});

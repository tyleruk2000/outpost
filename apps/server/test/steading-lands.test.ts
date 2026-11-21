/**
 * The Steading's lands, maps, belts and power (packages/shared/src/games/steading): a
 * map drawn up from a seed is the same every time and never leaves a settlement stuck;
 * each land changes what it can do; belts carry along their squares at their pace, merge
 * and cross; the line shares out sun, wind, batteries and a generator as a real system
 * would; a settlement kept before all this reads back unchanged; and above all, time away
 * never makes anything worse, with belts and batteries as with everything else.
 */
import {
  advance,
  applyAction,
  BANKS,
  type Building,
  bankOf,
  CAN_LITRES,
  costOf,
  DAY_MS,
  FUEL_L_PER_KWH,
  FUEL_NO_LOAD_L_PER_KW_H,
  fuelPerDay,
  GOOD_IDS,
  groundOf,
  HOUSE_NEEDS,
  heatFactor,
  houseTakes,
  KINDS,
  LAND_IDS,
  LANDS,
  MAP_SIZE,
  newSteading,
  peopleOf,
  readSteading,
  recipeOf,
  type SteadingAction,
  type SteadingState,
  seedFromNumber,
  siteProblem,
  solve,
  TANK_LITRES,
  terrainAt,
  weatherOf,
} from "@outpost/shared/games/steading";
import { describe, expect, it } from "vitest";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Midnight UTC at the start of a June day: the settlement's day begins with the sun up. */
const JUNE = Date.UTC(2027, 5, 1);
const DECEMBER = Date.UTC(2027, 11, 1);

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
const stocked = (state: SteadingState, amount = 400): SteadingState => ({
  ...state,
  stock: Object.fromEntries(GOOD_IDS.map((good) => [good, amount])) as SteadingState["stock"],
});
function withHouseholds(state: SteadingState, squares: [number, number][]): SteadingState {
  let next = state;
  for (const [x, y] of squares) {
    const house: Building = { id: next.nextId, kind: "house", x, y, paused: false, yard: {}, occupied: true };
    next = { ...next, nextId: next.nextId + 1, buildings: [...next.buildings, house] };
  }
  return next;
}

describe("a map drawn up from a seed", () => {
  it("is the same every time for the same land and seed, and different for another seed", () => {
    const a = groundOf({ land: "valley", seed: "tarn-oak-417" });
    const b = groundOf({ land: "valley", seed: "tarn-oak-417" });
    const c = groundOf({ land: "valley", seed: "fell-ash-002" });
    expect(a.width).toBe(MAP_SIZE);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(Array.from(a.tiles)).not.toEqual(Array.from(c.tiles));
  });

  for (const land of LAND_IDS) {
    it(`founds a ${LANDS[land].name.toLowerCase()} settlement on open ground with woods, rock and clay in reach`, () => {
      for (const n of [1, 77, 4242]) {
        const s = newSteading(JUNE, { land, seed: seedFromNumber(n) });
        for (const b of s.buildings) expect(terrainAt(s.map, b.x, b.y)).toBe("meadow");
        const start = there(s.buildings[0]);
        for (const kind of ["woods", "rock", "clay"] as const) {
          let near = 0;
          for (let dy = -7; dy <= 7; dy++)
            for (let dx = -7; dx <= 7; dx++) if (terrainAt(s.map, start.x + dx, start.y + dy) === kind) near++;
          expect(near, `${land} ${n} ${kind}`).toBeGreaterThan(0);
        }
        expect(peopleOf(s)).toBe(8);
      }
    });
  }

  it("draws up a map in moments", () => {
    const started = performance.now();
    for (let n = 0; n < 12; n++) groundOf({ land: LAND_IDS[n % LAND_IDS.length] ?? "valley", seed: `speed-${n}` });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("gives seeds that read out easily", () => {
    expect(seedFromNumber(0)).toBe("ash-ash-000");
    expect(seedFromNumber(123456)).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
  });
});

describe("each land has its consequences", () => {
  it("has the sun, wind and cold of its real place", () => {
    // Davos is calm, Belmullet very windy; Ouarzazate sunny even in December, Kiruna dark.
    expect(weatherOf("coast", 0).turbineKwh).toBeGreaterThan(100);
    expect(weatherOf("mountains", 0).turbineKwh).toBe(0);
    expect(weatherOf("desert", 11).arrayKwh).toBeGreaterThan(20 * weatherOf("snow", 11).arrayKwh);
    expect(weatherOf("snow", 5).daylight).toBe(1);
    expect(heatFactor("valley")).toBeCloseTo(1, 9);
    expect(heatFactor("snow")).toBeGreaterThan(1.6);
    expect(heatFactor("desert")).toBeLessThan(0.6);
  });

  it("needs more firewood in the cold, more bricks for a house, and water by a field in the desert", () => {
    const snow = newSteading(JUNE, { land: "snow", seed: "a" });
    const desert = newSteading(JUNE, { land: "desert", seed: "a" });
    expect(houseTakes(snow).firewood).toBeGreaterThan(houseTakes(desert).firewood * 2);
    expect(costOf(snow, "house").bricks).toBe((KINDS.house.cost.bricks ?? 0) + LANDS.snow.houseExtraBricks);
    // A field in the desert must be within two squares of water.
    const g = groundOf(desert.map);
    let dry: { x: number; y: number } | null = null;
    for (let y = 0; y < g.height && !dry; y++)
      for (let x = 0; x < g.width && !dry; x++) {
        if (terrainAt(desert.map, x, y) !== "meadow") continue;
        let wet = false;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) wet ||= ["river", "water"].includes(terrainAt(desert.map, x + dx, y + dy) ?? "");
        if (!wet) dry = { x, y };
      }
    expect(siteProblem(desert, "field", there(dry ?? undefined).x, there(dry ?? undefined).y)).toMatch(/within 2 squares of water/);
    // Grain grows slowly in the mountains, well on the coast.
    const field = (s: SteadingState) => recipeOf({ id: 1, kind: "field", x: 0, y: 0, paused: false, yard: {} }, s).outputs.grain ?? 0;
    expect(field(newSteading(JUNE, { land: "mountains", seed: "a" }))).toBeLessThan(10);
    expect(field(newSteading(JUNE, { land: "coast", seed: "a" }))).toBeGreaterThan(20);
    expect(field(newSteading(JUNE))).toBe(20);
  });
});

/** Ashgill with a woodcutter at (1,6) and a belt east along row 6, then south into the storehouse at (4,7). */
function belted(): SteadingState {
  let s = stocked(newSteading(JUNE), 150);
  s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 6 });
  s = act(s, {
    type: "belts",
    tier: "roller",
    squares: [
      { x: 2, y: 6, dir: "e" },
      { x: 3, y: 6, dir: "e" },
      { x: 4, y: 6, dir: "s" },
    ],
  });
  return s;
}

describe("belts", () => {
  it("carry what a building makes along their squares into the building they lead to, and cost a plank a square", () => {
    const s = belted();
    expect(s.stock.planks).toBe(150 - 3);
    const flows = solve(s);
    expect(flows.belts).toHaveLength(1);
    expect(there(flows.belts[0]).carries).toBeCloseTo(24, 9);
    expect(flows.beltSquares["3,6"]).toBeCloseTo(24, 9);
    expect(flows.store.logs.inflow).toBeCloseTo(24, 9);
    expect(s.milestones["first-belt"]).toBe(JUNE);
  });

  it("carry no more than a square takes in a day, shared where belts merge", () => {
    let s = belted();
    // Woodcutters at (2,4) and (2,8) feed south and north onto (2,6), where the first belt runs: they merge.
    s = act(s, { type: "build", kind: "woodcutter", x: 2, y: 4 });
    s = act(s, { type: "build", kind: "woodcutter", x: 2, y: 8 });
    s = act(s, { type: "belts", tier: "roller", squares: [{ x: 2, y: 5, dir: "s" }] });
    s = act(s, { type: "belts", tier: "roller", squares: [{ x: 2, y: 7, dir: "n" }] });
    const flows = solve(s);
    // Three woodcutters make 72 logs a day; a roller belt carries 60.
    expect(flows.beltSquares["4,6"]).toBeCloseTo(60, 9);
    expect(flows.store.logs.inflow).toBeCloseTo(60, 9);
  });

  it("cross at a junction without mixing", () => {
    let s = stocked(newSteading(JUNE), 150);
    // Logs east along row 6, straight through a junction at (4,6), into a woodyard at (5,6).
    s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 6 });
    s = act(s, { type: "build", kind: "woodyard", x: 5, y: 6 });
    s = act(s, {
      type: "belts",
      tier: "roller",
      squares: [
        { x: 2, y: 6, dir: "e" },
        { x: 3, y: 6, dir: "e" },
        { x: 4, y: 6, dir: "x" },
      ],
    });
    // Stone south from a quarry at (4,4), through the same junction, into the storehouse at (4,7).
    s = act(s, { type: "build", kind: "quarry", x: 4, y: 4 });
    s = act(s, { type: "belts", tier: "roller", squares: [{ x: 4, y: 5, dir: "s" }] });
    const flows = solve(s);
    const toYard = flows.belts.find((b) => b.to === idAt(s, 5, 6));
    expect(there(toYard).good).toBe("logs");
    expect(there(toYard).carries).toBeCloseTo(12, 9);
    expect(flows.store.stone.inflow).toBeCloseTo(12, 9);
    expect(flows.store.logs.inflow).toBe(0);
    // A junction costs two squares' worth.
    expect(s.stock.planks).toBe(150 - 1 - 1 - 2 - 1);
  });

  it("give back what they cost when taken up, and run into nothing carry nothing", () => {
    let s = belted();
    s = act(s, { type: "removeBelts", squares: [{ x: 4, y: 6 }] });
    expect(s.stock.planks).toBe(150 - 2);
    expect(solve(s).belts).toHaveLength(0);
    expect(() => act(s, { type: "belts", tier: "roller", squares: [{ x: 0, y: 0, dir: "e" }] })).toThrow(/open|meadow/);
    expect(() => act(s, { type: "belts", tier: "chain", squares: [{ x: 4, y: 6, dir: "s" }] })).toThrow(/24 people/);
    expect(() => act(s, { type: "build", kind: "well", x: 2, y: 6 })).toThrow(/belt runs over/);
  });
});

const SOLAR: [number, number][] = [
  [6, 6],
  [5, 5],
  [6, 5],
  [7, 5],
  [7, 4],
];

/** Ashgill with 24 people, five solar arrays, a lithium battery and a sawmill fed by a woodcutter. */
function powered(at = JUNE): SteadingState {
  let s = withHouseholds(stocked(newSteading(at), 400), [
    [6, 8],
    [7, 8],
    [6, 9],
    [7, 9],
  ]);
  s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 10 });
  s = act(s, { type: "build", kind: "sawmill", x: 5, y: 10 });
  s = act(s, { type: "route", from: idAt(s, 1, 10), to: idAt(s, 5, 10), good: "logs", mode: "cart" });
  s = act(s, { type: "route", from: idAt(s, 5, 10), to: 1, good: "planks", mode: "cart" });
  for (const [x, y] of SOLAR) s = act(s, { type: "build", kind: "solar", x, y });
  s = act(s, { type: "build", kind: "lithiumbank", x: 7, y: 6 });
  return s;
}

describe("power", () => {
  it("rates batteries in amp-hours at a voltage, and in watt-hours, from Tools → Power's figures", () => {
    expect(BANKS.lithiumbank.volts).toBeCloseTo(51.2, 9);
    expect(BANKS.lithiumbank.kwh).toBeCloseTo(14.336, 9);
    expect(BANKS.lithiumbank.usable).toBe(0.8);
    expect(BANKS.lithiumbank.roundTrip).toBe(0.92);
    expect(BANKS.leadbank.volts).toBe(48);
    expect(BANKS.leadbank.kwh).toBe(48);
    expect(BANKS.leadbank.usable).toBe(0.5);
    expect(BANKS.leadbank.roundTrip).toBe(0.8);
  });

  it("burns diesel on HOMER's straight line, scaled to a 10 kW generator", () => {
    expect(FUEL_NO_LOAD_L_PER_KW_H).toBeCloseTo(0.0331, 9);
    expect(FUEL_L_PER_KWH).toBeCloseTo(0.2729, 9);
    // At full load for a day: 24 h × (0.331 + 2.729) L/h = 73.44 L.
    expect(fuelPerDay(240)).toBeCloseTo(73.44, 6);
    expect(fuelPerDay(0)).toBe(0);
  });

  it("charges the battery by day and draws on it at night, with each way's losses", () => {
    const s = powered();
    const day = solve(s);
    const w = weatherOf("valley", 5);
    expect(day.power.weather.day).toBe(true);
    expect(day.power.sun).toBeCloseTo((SOLAR.length * w.arrayKwh) / w.daylight, 9);
    const load = 6 * HOUSE_NEEDS.electricityKwh + 40;
    expect(day.power.line.want).toBeCloseTo(load, 9);
    expect(day.power.line.charging).toBeCloseTo((day.power.sun - load) * Math.sqrt(0.92), 9);
    // Night: a little after sunset, with some charge in hand.
    const night = advance(s, s.clock + w.daylight * DAY_MS + 60_000);
    expect(night.stored).toBeGreaterThan(0);
    const dark = solve(night);
    expect(dark.power.weather.day).toBe(false);
    expect(dark.power.line.discharging).toBeCloseTo(load / Math.sqrt(0.92), 9);
    expect(there(dark.buildings[idAt(s, 5, 10)]).power).toBeCloseTo(40, 9);
  });

  it("starts the generator only when the battery is at its floor, and sheds the machines before the lights", () => {
    let s = powered(DECEMBER);
    s = act(s, { type: "build", kind: "generator", x: 7, y: 7 });
    const gen = idAt(s, 7, 7);
    // With an empty tank, the sawmill goes without at night once the battery is flat.
    const dark = advance(s, s.clock + DAY_MS - 1000);
    expect(dark.stored).toBe(0);
    const flat = solve(dark);
    expect(flat.power.line.bank).toBe("empty");
    expect(there(flat.buildings[idAt(s, 5, 10)]).power).toBe(0);
    expect(flat.households.electricity.lit).toBeGreaterThanOrEqual(0);
    // Fill the tank (a can is 20 litres): the generator follows the load.
    let fuelled = act(dark, { type: "fillTank", id: gen });
    expect(there(fuelled.buildings.find((b) => b.id === gen)).tank).toBe(TANK_LITRES);
    expect(fuelled.stock.diesel).toBe(400 - TANK_LITRES / CAN_LITRES);
    const running = solve(fuelled);
    expect(there(running.buildings[idAt(s, 5, 10)]).power).toBeCloseTo(40, 9);
    expect(there(running.power.line.burning.get(gen))).toBeCloseTo(fuelPerDay(running.power.generator), 9);
    // Left long enough the tank runs dry, and nothing else is the worse for it.
    fuelled = advance(fuelled, fuelled.clock + 30 * DAY);
    expect(there(fuelled.buildings.find((b) => b.id === gen)).tank).toBeGreaterThanOrEqual(0);
    expect(fuelled.stock.planks).toBeGreaterThanOrEqual(dark.stock.planks);
  });

  it("gives back the diesel in a tank and the cells of a battery taken down", () => {
    let s = powered();
    s = act(s, { type: "build", kind: "generator", x: 7, y: 7 });
    s = act(s, { type: "fillTank", id: idAt(s, 7, 7) });
    const diesel = s.stock.diesel;
    s = act(s, { type: "remove", id: idAt(s, 7, 7) });
    expect(s.stock.diesel).toBeCloseTo(diesel + TANK_LITRES / CAN_LITRES, 9);
    const cells = s.stock.lifecells;
    s = act(s, { type: "remove", id: idAt(s, 7, 6) });
    expect(s.stock.lifecells).toBe(cells + 16);
    expect(s.stored).toBe(0);
    expect(bankOf(s).capacity).toBe(0);
  });
});

describe("a settlement kept before lands, belts and batteries", () => {
  it("reads back as the same settlement on Ashgill, working as it did", () => {
    let s = stocked(newSteading(JUNE), 150);
    s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 8 });
    s = act(s, { type: "route", from: idAt(s, 1, 8), to: 1, good: "logs", mode: "cart" });
    // The shape of version 1: no map, belts, battery or kWh, and only the first thirteen goods.
    const { map: _map, belts: _belts, stored: _stored, kwhMade: _kwh, ...rest } = s;
    const first = ["logs", "stone", "clay", "grain", "planks", "firewood", "bricks", "flour", "bread", "coal", "ore", "iron", "tools"];
    const pick = (goods: Record<string, number>) => Object.fromEntries(first.map((g) => [g, goods[g] ?? 0]));
    const v1 = JSON.parse(JSON.stringify({ ...rest, v: 1, stock: pick(s.stock), made: pick(s.made) }));
    const read = there(readSteading(v1) ?? undefined);
    expect(read.v).toBe(2);
    expect(read.map.legacy).toBe(true);
    expect(read.belts).toEqual([]);
    expect(read.stored).toBe(0);
    expect(read.buildings).toEqual(s.buildings);
    expect(read.routes).toEqual(s.routes);
    for (const good of first) expect(read.stock[good as keyof typeof read.stock]).toBe(s.stock[good as keyof typeof s.stock]);
    expect(read.stock.diesel).toBe(0);
    expect(solve(read).store.logs).toEqual(solve(s).store.logs);
    // And a version 2 settlement round-trips exactly.
    expect(readSteading(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("refuses a damaged map or belt", () => {
    const s = newSteading(JUNE, { land: "coast", seed: "a" });
    expect(readSteading({ ...s, map: { land: "moon", seed: "a" } })).toBeNull();
    expect(readSteading({ ...s, belts: [{ x: 0, y: 0, dir: "q", tier: "roller" }] })).toBeNull();
    expect(readSteading({ ...s, stored: -1 })).toBeNull();
  });
});

/** Everything at once: chains on belts and routes, households, sun, a battery, a turbine and a fuelled generator. */
function busy(at = JUNE): SteadingState {
  let s = powered(at);
  s = act(s, { type: "build", kind: "woodcutter", x: 1, y: 6 });
  s = act(s, {
    type: "belts",
    tier: "roller",
    squares: [
      { x: 2, y: 6, dir: "e" },
      { x: 3, y: 6, dir: "e" },
      { x: 4, y: 6, dir: "s" },
    ],
  });
  s = act(s, { type: "build", kind: "field", x: 3, y: 5 });
  s = act(s, { type: "build", kind: "turbine", x: 8, y: 1 });
  s = act(s, { type: "build", kind: "generator", x: 7, y: 7 });
  s = act(s, { type: "fillTank", id: idAt(s, 7, 7) });
  s = act(s, { type: "build", kind: "leadbank", x: 8, y: 7 });
  return { ...s, stock: { ...s.stock, logs: 10, planks: 30, grain: 0 } };
}

describe("time away never makes anything worse, with belts and power", () => {
  const snapshot = (s: SteadingState) => ({
    stock: { ...s.stock },
    made: { ...s.made },
    credit: s.credit,
    kwhMade: s.kwhMade,
    people: peopleOf(s),
    buildings: s.buildings.map((b) => ({ id: b.id, yard: { ...b.yard }, occupied: b.occupied })),
    routes: s.routes.map((r) => r.id),
    belts: s.belts.map((b) => `${b.x},${b.y},${b.dir},${b.tier}`),
    milestones: { ...s.milestones },
  });

  for (const [name, away] of [
    ["a day", DAY],
    ["a month", 30 * DAY],
    ["a year", 365 * DAY],
  ] as const) {
    it(`left ${name}, nothing is lower, nothing is gone, and a battery stays within its floor and its top`, () => {
      const s = busy();
      const before = snapshot(s);
      const later = advance(s, s.clock + away);
      const after = snapshot(later);
      expect(later.clock).toBe(s.clock + away);
      for (const good of GOOD_IDS) {
        expect(after.stock[good], good).toBeGreaterThanOrEqual(before.stock[good]);
        expect(after.made[good]).toBeGreaterThanOrEqual(before.made[good]);
        expect(Number.isFinite(after.stock[good])).toBe(true);
      }
      expect(after.credit).toBe(before.credit);
      expect(after.kwhMade).toBeGreaterThan(before.kwhMade);
      expect(after.people).toBeGreaterThanOrEqual(before.people);
      expect(after.routes).toEqual(before.routes);
      expect(after.belts).toEqual(before.belts);
      expect(after.buildings.map((b) => b.id)).toEqual(before.buildings.map((b) => b.id));
      for (const [i, b] of before.buildings.entries()) {
        const now = there(after.buildings[i]);
        if (b.occupied) expect(now.occupied).toBe(true);
        for (const good of GOOD_IDS) expect(now.yard[good] ?? 0).toBeGreaterThanOrEqual(b.yard[good] ?? 0);
      }
      for (const [id, at] of Object.entries(before.milestones)) expect(after.milestones[id as keyof typeof after.milestones]).toBe(at);
      expect(later.stored).toBeGreaterThanOrEqual(0);
      expect(later.stored).toBeLessThanOrEqual(bankOf(later).capacity + 1e-9);
      for (const b of later.buildings) if (b.kind === "generator") expect(b.tank).toBeGreaterThanOrEqual(0);
      expect(after.made.logs).toBeGreaterThan(before.made.logs);
    });
  }

  it("is the same worked out in one step as in many, with the sun rising and setting", () => {
    const s = busy();
    const once = advance(s, s.clock + 7 * DAY);
    let steps = s;
    for (let hour = 1; hour <= 7 * 24; hour++) steps = advance(steps, s.clock + hour * HOUR);
    let odd = s;
    for (let t = 0; t < 7 * DAY; ) {
      t = Math.min(7 * DAY, t + 17 * 60_000 + 13_000);
      odd = advance(odd, s.clock + t);
    }
    for (const other of [steps, odd]) {
      for (const good of GOOD_IDS) expect(other.stock[good]).toBeCloseTo(once.stock[good], 5);
      expect(other.stored).toBeCloseTo(once.stored, 5);
      expect(other.kwhMade / once.kwhMade).toBeCloseTo(1, 8);
      for (const [i, b] of once.buildings.entries()) {
        for (const good of GOOD_IDS) expect(there(other.buildings[i]).yard[good] ?? 0).toBeCloseTo(b.yard[good] ?? 0, 5);
        expect(there(other.buildings[i]).tank ?? 0).toBeCloseTo(b.tank ?? 0, 5);
      }
    }
  });

  it("works out a year with the sun in moments", () => {
    const s = busy(DECEMBER);
    const started = performance.now();
    advance(s, s.clock + 365 * DAY);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("on a generated land too", () => {
    let s = stocked(newSteading(JUNE, { land: "coast", seed: "rigg-moss-221" }), 400);
    const start = there(s.buildings[0]);
    s = withHouseholds(s, [
      [start.x - 2, start.y + 2],
      [start.x + 2, start.y + 2],
      [start.x - 1, start.y + 3],
      [start.x + 1, start.y + 3],
    ]);
    s = act(s, { type: "build", kind: "solar", x: start.x - 2, y: start.y });
    s = act(s, { type: "build", kind: "turbine", x: start.x + 2, y: start.y });
    s = act(s, { type: "build", kind: "leadbank", x: start.x - 1, y: start.y - 1 });
    const later = advance(s, s.clock + 30 * DAY);
    for (const good of GOOD_IDS) expect(later.stock[good]).toBeGreaterThanOrEqual(s.stock[good]);
    expect(later.kwhMade).toBeGreaterThan(0);
  });
});

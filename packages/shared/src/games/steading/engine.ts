/**
 * The Steading's engine: the settlement's state, how its work flows, how time moves it
 * on, and each thing a person can do to it, all as pure functions.
 *
 * The one rule over all of it: time can only help or do nothing. The work is a set of
 * steady flows along routes and belts; a building takes only what flows to it, so nothing
 * time does ever draws a stock down. A stock or a building's yard that fills simply stops
 * the work that fills it, with everything kept. People come only to houses that have
 * water, food and firewood to hand, and never leave. The one thing that can go down while
 * nobody plays is the charge in the batteries and the diesel in a generator's tank, which
 * are there to be used: a battery that runs flat at night only slows the machines until
 * the sun or the wind comes back, and nothing breaks or is lost.
 *
 * Between two moments when something changes (a store or yard fills, the batteries fill
 * or reach their floor, a tank runs dry, the sun rises or sets, a month turns, a household
 * moves in) every flow is constant, so `advance` steps from one such moment to the next
 * and the result is exact, the same whether worked out in one step or many. Within a month
 * every settlement day is the same as the one before, so once a day has repeated itself it
 * is carried forward a stretch of whole days at once.
 */
import { BANKS, CAN_LITRES, isBank, type LineFlow, monthOf, shareLine, TANK_LITRES, type Weather, weatherOf } from "./electric.ts";
import { harvestFactor, heatFactor, LANDS, type LandId } from "./lands.ts";
import { ASHGILL, cleanSeed, distance, FOUNDING_LAYOUT, groundNear, groundOf, LAND_IDS_SET, type SteadingMap, terrainAt } from "./map.ts";
import {
  type Amounts,
  BELTS,
  type BeltTier,
  CONTRACTS,
  type ContractId,
  CREDIT_CAP,
  DAY_MS,
  GOOD_IDS,
  GOODS,
  type GoodId,
  HOUSE_NEEDS,
  HOUSE_TAKES,
  HOUSEHOLD,
  isWorkplace,
  KINDS,
  type KindId,
  MADE_CAP,
  MILESTONE_IDS,
  type MilestoneId,
  MODES,
  type ModeId,
  POWERED_KWH,
  STORE_CAP,
  STORE_REACH,
  TERRAIN_NAMES,
  WATERWORKS_LITRES,
  WELL_REACH,
  WHEEL_KWH,
  WORK_REACH,
  YARD_CAP,
} from "./numbers.ts";

export const STEADING_VERSION = 2;

export interface Building {
  id: number;
  kind: KindId;
  x: number;
  y: number;
  /** Set to rest by the player: it works not at all and needs nobody. */
  paused: boolean;
  /** What it has made and could not send on, waiting in its own yard. */
  yard: Amounts;
  /** Houses only: whether its household has moved in. */
  occupied?: boolean;
  /** The landing only: the trade it runs, or none yet. */
  contract?: ContractId | null;
  /** Generators only: litres of diesel in its tank. */
  tank?: number;
}

export interface Route {
  id: number;
  from: number;
  to: number;
  good: GoodId;
  mode: ModeId;
}

/** Which way a belt square carries: north, east, south, west, or a junction where two belts cross. */
export const BELT_DIRS = ["n", "e", "s", "w", "x"] as const;
export type BeltDir = (typeof BELT_DIRS)[number];
export const STEP: Record<Exclude<BeltDir, "x">, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};

/** The most belt squares a settlement keeps (so that it fits in its saved row). */
export const MAX_BELTS = 600;

export interface Belt {
  x: number;
  y: number;
  dir: BeltDir;
  tier: BeltTier;
}

export interface SteadingState {
  v: typeof STEADING_VERSION;
  /** The ground: a kind of land and a seed, or Ashgill's small valley. */
  map: SteadingMap;
  startedAt: number;
  /** The time the settlement has been worked out to. Never runs backwards. */
  clock: number;
  lastActionAt: number;
  nextId: number;
  buildings: Building[];
  /** In the order they are filled: a building sends along its first route first. */
  routes: Route[];
  belts: Belt[];
  stock: Record<GoodId, number>;
  /** Everything made, of each good, since the settlement was founded. */
  made: Record<GoodId, number>;
  credit: number;
  milestones: Partial<Record<MilestoneId, number>>;
  /** kWh held in the batteries, counted from their floor (so 0 is as low as they are let go). */
  stored: number;
  /** kWh made on the line since the settlement was founded. */
  kwhMade: number;
}

const zeroGoods = (): Record<GoodId, number> => Object.fromEntries(GOOD_IDS.map((good) => [good, 0])) as Record<GoodId, number>;

/**
 * A new settlement: a storehouse, two houses with their households, a well, and a little
 * to build with. With no land given it is Ashgill, the small valley of the first
 * settlements; with a land and a seed, it is that land, drawn up from the seed.
 */
export function newSteading(now: number, found?: { land: LandId; seed: string }): SteadingState {
  const map: SteadingMap = found ? { land: found.land, seed: cleanSeed(found.seed) || "steading" } : ASHGILL;
  const { start } = groundOf(map);
  const stock = zeroGoods();
  stock.planks = 30;
  stock.stone = 20;
  stock.bricks = 30;
  stock.logs = 10;
  const buildings: Building[] = FOUNDING_LAYOUT.map((place, i) => {
    const b: Building = { id: i + 1, kind: place.kind, x: start.x + place.dx, y: start.y + place.dy, paused: false, yard: {} };
    if (place.kind === "house") b.occupied = true;
    return b;
  });
  return {
    v: STEADING_VERSION,
    map,
    startedAt: now,
    clock: now,
    lastActionAt: now,
    nextId: buildings.length + 1,
    buildings,
    routes: [],
    belts: [],
    stock,
    made: zeroGoods(),
    credit: 0,
    milestones: {},
    stored: 0,
    kwhMade: 0,
  };
}

export class SteadingRefusal extends Error {}
const refuse = (message: string): never => {
  throw new SteadingRefusal(message);
};

// ── Reading a stored settlement ─────────────────────────────────────────────

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

function readAmounts(value: unknown): Amounts | null {
  if (!value || typeof value !== "object") return null;
  const out: Amounts = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!(GOOD_IDS as readonly string[]).includes(key) || !isCount(amount)) return null;
    out[key as GoodId] = amount;
  }
  return out;
}

function readGoods(value: unknown): Record<GoodId, number> | null {
  const amounts = readAmounts(value);
  if (!amounts) return null;
  const out = zeroGoods();
  for (const good of GOOD_IDS) out[good] = amounts[good] ?? 0;
  return out;
}

function readMap(value: unknown): SteadingMap | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (m.legacy === true) return ASHGILL;
  if (typeof m.land !== "string" || !LAND_IDS_SET.has(m.land)) return null;
  if (typeof m.seed !== "string" || m.seed !== cleanSeed(m.seed) || m.seed.length === 0) return null;
  return { land: m.land as LandId, seed: m.seed };
}

/**
 * The settlement as stored, checked field by field; null when it is not a sound one. A
 * settlement kept before version 2 (Ashgill, with no belts or batteries) is read as
 * version 2: the same buildings, routes, stock and milestones on the same valley.
 */
export function readSteading(raw: unknown): SteadingState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.v !== 1 && s.v !== STEADING_VERSION) return null;
  const old = s.v === 1;
  const map = old ? ASHGILL : readMap(s.map);
  if (!map) return null;
  if (!isCount(s.startedAt) || !isCount(s.clock) || !isCount(s.lastActionAt) || !isId(s.nextId) || !isCount(s.credit)) return null;
  if (!Array.isArray(s.buildings) || !Array.isArray(s.routes)) return null;
  if (!old && (!Array.isArray(s.belts) || !isCount(s.stored) || !isCount(s.kwhMade))) return null;
  const stock = readGoods(s.stock);
  const made = readGoods(s.made);
  if (!stock || !made) return null;
  const buildings: Building[] = [];
  const seen = new Set<string>();
  const ids = new Set<number>();
  for (const item of s.buildings) {
    if (!item || typeof item !== "object") return null;
    const b = item as Record<string, unknown>;
    if (!isId(b.id) || ids.has(b.id) || b.id >= (s.nextId as number)) return null;
    if (typeof b.kind !== "string" || !(b.kind in KINDS)) return null;
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || terrainAt(map, b.x as number, b.y as number) === null) return null;
    const square = `${b.x},${b.y}`;
    if (seen.has(square) || typeof b.paused !== "boolean") return null;
    const yard = readAmounts(b.yard);
    if (!yard) return null;
    const building: Building = { id: b.id, kind: b.kind as KindId, x: b.x as number, y: b.y as number, paused: b.paused, yard };
    if (b.kind === "house") {
      if (typeof b.occupied !== "boolean") return null;
      building.occupied = b.occupied;
    }
    if (b.kind === "landing") {
      if (b.contract !== null && b.contract !== undefined && !(typeof b.contract === "string" && b.contract in CONTRACTS)) return null;
      building.contract = (b.contract as ContractId | null | undefined) ?? null;
    }
    if (b.kind === "generator") {
      if (!isCount(b.tank) || b.tank > TANK_LITRES + 1e-6) return null;
      building.tank = b.tank;
    }
    seen.add(square);
    ids.add(b.id);
    buildings.push(building);
  }
  const routes: Route[] = [];
  for (const item of s.routes) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    if (!isId(r.id) || r.id >= (s.nextId as number) || !isId(r.from) || !isId(r.to) || !ids.has(r.from) || !ids.has(r.to)) return null;
    if (typeof r.good !== "string" || !(GOOD_IDS as readonly string[]).includes(r.good)) return null;
    if (typeof r.mode !== "string" || !(r.mode in MODES)) return null;
    routes.push({ id: r.id, from: r.from, to: r.to, good: r.good as GoodId, mode: r.mode as ModeId });
  }
  const belts: Belt[] = [];
  for (const item of old ? [] : (s.belts as unknown[])) {
    if (!item || typeof item !== "object") return null;
    const belt = item as Record<string, unknown>;
    if (!Number.isInteger(belt.x) || !Number.isInteger(belt.y) || terrainAt(map, belt.x as number, belt.y as number) !== "meadow")
      return null;
    const square = `${belt.x},${belt.y}`;
    if (seen.has(square)) return null;
    if (typeof belt.dir !== "string" || !(BELT_DIRS as readonly string[]).includes(belt.dir)) return null;
    if (typeof belt.tier !== "string" || !(belt.tier in BELTS)) return null;
    seen.add(square);
    belts.push({ x: belt.x as number, y: belt.y as number, dir: belt.dir as BeltDir, tier: belt.tier as BeltTier });
  }
  const milestones: Partial<Record<MilestoneId, number>> = {};
  if (s.milestones && typeof s.milestones === "object") {
    for (const [key, at] of Object.entries(s.milestones)) {
      if ((MILESTONE_IDS as readonly string[]).includes(key) && isCount(at)) milestones[key as MilestoneId] = at;
    }
  }
  const state: SteadingState = {
    v: STEADING_VERSION,
    map,
    startedAt: s.startedAt,
    clock: s.clock,
    lastActionAt: s.lastActionAt,
    nextId: s.nextId as number,
    buildings,
    routes,
    belts,
    stock,
    made,
    credit: s.credit,
    milestones,
    stored: old ? 0 : (s.stored as number),
    kwhMade: old ? 0 : (s.kwhMade as number),
  };
  return { ...state, stored: Math.min(state.stored, bankOf(state).capacity) };
}

// ── What a building makes from what ─────────────────────────────────────────

export function recipeOf(building: Building, state?: SteadingState): { inputs: Amounts; outputs: Amounts } {
  if (building.kind === "landing") {
    const contract = building.contract ? CONTRACTS[building.contract] : null;
    return contract ? { inputs: contract.inputs, outputs: contract.outputs } : { inputs: {}, outputs: {} };
  }
  if (building.kind === "field" && state && !state.map.legacy) {
    const f = harvestFactor(state.map.land);
    return { inputs: {}, outputs: { grain: (KINDS.field.outputs.grain ?? 0) * f } };
  }
  return { inputs: KINDS[building.kind].inputs, outputs: KINDS[building.kind].outputs };
}

const entries = (amounts: Amounts) => Object.entries(amounts) as [GoodId, number][];

/** Whether `to` takes `good` along a route or belt: a storehouse takes anything, a workplace what it uses. */
export function takes(to: Building, good: GoodId): boolean {
  if (to.kind === "storehouse") return true;
  return (recipeOf(to).inputs[good] ?? 0) > 0;
}

/** Whether `to` is a later step of the chain than `from`, or a storehouse: things only go onwards. */
export const onward = (from: Building, to: Building) => to.kind === "storehouse" || KINDS[to.kind].stage > KINDS[from.kind].stage;

export const storeCap = (state: SteadingState) => STORE_CAP * state.buildings.filter((b) => b.kind === "storehouse").length;
export const peopleOf = (state: SteadingState) => HOUSEHOLD * state.buildings.filter((b) => b.kind === "house" && b.occupied).length;

/** What a household takes from the storehouse in a day on this land: loaves, and firewood for the land's cold. */
export function houseTakes(state: SteadingState): { bread: number; firewood: number } {
  const factor = state.map.legacy ? 1 : heatFactor(state.map.land);
  return { bread: HOUSE_TAKES.bread ?? 0, firewood: (HOUSE_TAKES.firewood ?? 0) * factor };
}
/** kWh of heat a household needs in a day on this land. */
export const heatNeed = (state: SteadingState) => HOUSE_NEEDS.heatKwh * (state.map.legacy ? 1 : heatFactor(state.map.land));
export const wellLitres = (state: SteadingState) => LANDS[state.map.land].wellLitres;

/** What a kind costs to build on this land (houses need thicker walls in the cold). */
export function costOf(state: SteadingState, kind: KindId): Amounts {
  const cost = KINDS[kind].cost;
  const extra = kind === "house" && !state.map.legacy ? LANDS[state.map.land].houseExtraBricks : 0;
  return extra ? { ...cost, bricks: (cost.bricks ?? 0) + extra } : cost;
}

// ── Belts ───────────────────────────────────────────────────────────────────

/** A belt line: from a building, along belt squares, into another building. */
export interface BeltLine {
  from: number;
  to: number;
  /** The squares it runs over, in order, each with the way through it ("x,y" or "x,y:h" / "x,y:v" at a junction). */
  lanes: string[];
  squares: { x: number; y: number }[];
}

const squareKey = (x: number, y: number) => `${x},${y}`;

/**
 * Every belt line laid: each starts at a belt square beside a building that leads away
 * from it, follows each square's way (straight on through a junction), and ends in the
 * building the last square leads into. A belt that runs into nothing, off the map, or
 * round in a loop carries nothing.
 */
export function beltLines(state: SteadingState): BeltLine[] {
  if (state.belts.length === 0) return [];
  const beltAt = new Map(state.belts.map((b) => [squareKey(b.x, b.y), b]));
  const buildingAt = new Map(state.buildings.map((b) => [squareKey(b.x, b.y), b]));
  const lines: BeltLine[] = [];
  for (const source of state.buildings) {
    for (const dir of ["n", "e", "s", "w"] as const) {
      const step = STEP[dir];
      let x = source.x + step.dx;
      let y = source.y + step.dy;
      const first = beltAt.get(squareKey(x, y));
      if (!first || first.dir !== dir) continue;
      let heading: Exclude<BeltDir, "x"> = dir;
      const lanes: string[] = [];
      const squares: { x: number; y: number }[] = [];
      const seen = new Set<string>();
      let end: Building | null = null;
      for (let guard = 0; guard < 10_000; guard++) {
        const key = squareKey(x, y);
        const belt = beltAt.get(key);
        if (!belt) {
          const b = buildingAt.get(key);
          if (b && b.id !== source.id) end = b;
          break;
        }
        if (belt.dir !== "x") heading = belt.dir;
        const lane = belt.dir === "x" ? `${key}:${heading === "n" || heading === "s" ? "v" : "h"}` : key;
        if (seen.has(lane)) break;
        seen.add(lane);
        lanes.push(lane);
        squares.push({ x, y });
        x += STEP[heading].dx;
        y += STEP[heading].dy;
      }
      if (end) lines.push({ from: source.id, to: end.id, lanes, squares });
    }
  }
  return lines;
}

const beltCarries = (state: SteadingState) => {
  const cap = new Map<string, number>();
  for (const b of state.belts) {
    const key = squareKey(b.x, b.y);
    const carries = BELTS[b.tier].carries;
    if (b.dir === "x") {
      cap.set(`${key}:h`, carries);
      cap.set(`${key}:v`, carries);
    } else cap.set(key, carries);
  }
  return cap;
};

// ── Power ───────────────────────────────────────────────────────────────────

/** The batteries together: usable kWh, and each way's efficiency (the square root of the round trip, weighted by size). */
export function bankOf(state: SteadingState): { capacity: number; oneWay: number; nominalKwh: number; ampHours: number } {
  let capacity = 0;
  let weighted = 0;
  let nominalKwh = 0;
  let ampHours = 0;
  for (const b of state.buildings) {
    if (!isBank(b.kind)) continue;
    const kind = BANKS[b.kind];
    capacity += kind.kwh * kind.usable;
    weighted += kind.kwh * kind.usable * Math.sqrt(kind.roundTrip);
    nominalKwh += kind.kwh;
    ampHours += kind.ampHours;
  }
  return { capacity, oneWay: capacity > 0 ? weighted / capacity : 1, nominalKwh, ampHours };
}

/** The sun and wind at a moment: the month's, and whether it is daylight in the settlement's day. */
export function weatherAt(state: SteadingState, at: number): Weather & { day: boolean } {
  const w = weatherOf(state.map.land, monthOf(at));
  const phase = (((at % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
  return { ...w, day: phase < w.daylight };
}

const count = (state: SteadingState, kind: KindId) => state.buildings.filter((b) => b.kind === kind).length;

// ── The flows ───────────────────────────────────────────────────────────────

export type Limit =
  /** Works at full pace. */
  | { kind: "full" }
  | { kind: "paused" }
  | { kind: "workers"; have: number; need: number }
  | { kind: "input"; good: GoodId }
  | { kind: "room"; good: GoodId }
  | { kind: "no-contract" };

export interface BuildingFlow {
  /** People working there, and the number it needs. */
  staff: number;
  workersNeeded: number;
  /** kWh a day it draws from the line (a house's light, a workshop's machines), or makes (a source). */
  power: number;
  /** Its pace, from 0 to 1, of what it could do with every worker and nothing short (2 when powered and in full work). */
  pace: number;
  /** In a day: what it uses of each input, what it makes of each output, and what of it goes to its own yard. */
  uses: Amounts;
  makes: Amounts;
  toYard: Amounts;
  /** What holds it back the most, or full. */
  limit: Limit;
}

export interface HouseholdsFlow {
  people: number;
  houses: number;
  occupied: number;
  /** Houses built and waiting for their household, with what they wait for. */
  waiting: { id: number; for: ("water" | "food" | "firewood" | "storehouse" | "well")[] }[];
  /** Litres, kcal, kWh of heat and kWh of electricity a day: what the households need, and what reaches them. */
  water: { need: number; supply: number };
  food: { need: number; supply: number };
  heat: { need: number; supply: number };
  electricity: { need: number; supply: number; lit: number };
}

export interface BeltFlow {
  from: number;
  to: number;
  /** What it carries; null for a line into a building that takes nothing the first one makes. */
  good: GoodId | null;
  carries: number;
  squares: { x: number; y: number }[];
}

export interface PowerFlow {
  weather: Weather & { day: boolean };
  line: LineFlow;
  /** kWh a day now from each kind of source. */
  sun: number;
  wind: number;
  wheel: number;
  generator: number;
  /** The batteries: usable kWh, what they hold, nominal kWh and amp-hours. */
  capacity: number;
  stored: number;
  nominalKwh: number;
  ampHours: number;
}

export interface Flows {
  buildings: Record<number, BuildingFlow>;
  /** What each route carries in a day. */
  routes: Record<number, number>;
  /** What each belt line carries, and what each belt square carries in all ("x,y"). */
  belts: BeltFlow[];
  beltSquares: Record<string, number>;
  /** In a day, of each good: what comes into the storehouses, what the households take of it, what is kept. */
  store: Record<GoodId, { inflow: number; toHouses: number; toStock: number }>;
  households: HouseholdsFlow;
  power: PowerFlow;
}

const EPS = 1e-9;

function assignWorkers(state: SteadingState): Map<number, number> {
  const free = new Map<number, number>();
  const homes = state.buildings.filter((b) => b.kind === "house" && b.occupied);
  for (const home of homes) free.set(home.id, HOUSEHOLD);
  const staff = new Map<number, number>();
  for (const b of state.buildings) {
    const need = KINDS[b.kind].workers;
    if (need === 0 || b.paused) continue;
    const near = homes.filter((home) => distance(home, b) <= WORK_REACH).sort((a, c) => distance(a, b) - distance(c, b) || a.id - c.id);
    let got = 0;
    for (const home of near) {
      const left = free.get(home.id) ?? 0;
      const take = Math.min(left, need - got);
      if (take > 0) {
        free.set(home.id, left - take);
        got += take;
      }
      if (got >= need) break;
    }
    staff.set(b.id, got);
  }
  return staff;
}

function powerAt(state: SteadingState, at: number, staff: Map<number, number>): PowerFlow {
  const weather = weatherAt(state, at);
  const sun = weather.day && weather.daylight > 0 ? (count(state, "solar") * weather.arrayKwh) / weather.daylight : 0;
  const wind = count(state, "turbine") * weather.turbineKwh;
  const wheel = count(state, "wheel") * WHEEL_KWH;
  const bank = bankOf(state);
  const houses = state.buildings
    .filter((b) => b.kind === "house" && b.occupied)
    .map((b) => ({ id: b.id, want: HOUSE_NEEDS.electricityKwh }));
  const machines: { id: number; want: number }[] = [];
  for (const b of state.buildings) {
    const kind = KINDS[b.kind];
    if (!kind.powered || b.paused) continue;
    const crew = (staff.get(b.id) ?? 0) / kind.workers;
    if (crew > 0) machines.push({ id: b.id, want: POWERED_KWH * crew });
  }
  const line = shareLine({
    renewable: sun + wind + wheel,
    capacity: bank.capacity,
    stored: Math.min(state.stored, bank.capacity),
    oneWay: bank.oneWay,
    generators: state.buildings.filter((b) => b.kind === "generator").map((b) => ({ id: b.id, tank: b.tank ?? 0 })),
    houses,
    machines,
  });
  let generator = 0;
  for (const kwh of line.generated.values()) generator += kwh;
  return {
    weather,
    line,
    sun,
    wind,
    wheel,
    generator,
    capacity: bank.capacity,
    stored: Math.min(state.stored, bank.capacity),
    nominalKwh: bank.nominalKwh,
    ampHours: bank.ampHours,
  };
}

/** A way out of a building: a route, or a belt line, with what it carries at most. */
interface Lane {
  route?: Route;
  line?: number;
  to: number;
  good: GoodId;
  carries: number;
}

/**
 * The steady flows of the settlement as it stands at a moment (its own clock unless
 * `at` is given). With `open`, the storehouses are treated as taking everything sent,
 * full or not: that says what the settlement could supply, which is what a waiting
 * household is judged by.
 */
export function solve(state: SteadingState, open = false, at = state.clock): Flows {
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const staff = assignWorkers(state);
  const power = powerAt(state, at, staff);
  const cap = storeCap(state);
  const occupied = state.buildings.filter((b) => b.kind === "house" && b.occupied);
  const takesEach = houseTakes(state);

  // The households' daily take from the storehouses, for the houses within reach of one.
  const stores = state.buildings.filter((b) => b.kind === "storehouse");
  const served = occupied.filter((home) => stores.some((store) => distance(store, home) <= STORE_REACH));
  const houseTake: Amounts = { bread: takesEach.bread * served.length, firewood: takesEach.firewood * served.length };

  const storeDemand = (good: GoodId) => (open || state.stock[good] < cap - EPS ? Number.POSITIVE_INFINITY : (houseTake[good] ?? 0));

  // Workplaces in the order the chains run: a building only takes from lower stages.
  const work = state.buildings.filter((b) => isWorkplace(b.kind)).sort((a, b) => KINDS[a.kind].stage - KINDS[b.kind].stage || a.id - b.id);
  const potential = new Map<number, number>();
  for (const b of work) {
    const need = KINDS[b.kind].workers;
    const crew = b.paused ? 0 : need === 0 ? 1 : (staff.get(b.id) ?? 0) / need;
    const boost = KINDS[b.kind].powered ? (power.line.given.get(b.id) ?? 0) / POWERED_KWH : 0;
    potential.set(b.id, crew * (1 + boost));
  }
  const recipe = new Map(state.buildings.map((b) => [b.id, recipeOf(b, state)]));
  const recipeFor = (b: Building) => recipe.get(b.id) as { inputs: Amounts; outputs: Amounts };

  // Every way out of each building: its routes in order, then its belt lines.
  const lines = beltLines(state);
  const lanesFrom = new Map<number, Lane[]>();
  const addLane = (from: number, lane: Lane) => {
    const list = lanesFrom.get(from) ?? [];
    list.push(lane);
    lanesFrom.set(from, list);
  };
  for (const route of state.routes) {
    const from = byId.get(route.from);
    const to = byId.get(route.to);
    if (!from || !to || !takes(to, route.good) || !(recipeFor(from).outputs[route.good] ?? 0)) continue;
    addLane(route.from, { route, to: route.to, good: route.good, carries: MODES[route.mode].carries });
  }
  for (const [index, line] of lines.entries()) {
    const from = byId.get(line.from) as Building;
    const to = byId.get(line.to) as Building;
    if (!onward(from, to)) continue;
    for (const [good] of entries(recipeFor(from).outputs))
      if (takes(to, good)) addLane(line.from, { line: index, to: line.to, good, carries: 0 });
  }
  const laneKey = (lane: Lane) => (lane.route ? `r${lane.route.id}` : `b${lane.line}:${lane.good}`);
  const capacityOfSquares = beltCarries(state);

  /** What a building would use of each input at its potential. */
  const fullNeed = (b: Building, good: GoodId) => (potential.get(b.id) ?? 0) * (recipeFor(b).inputs[good] ?? 0);
  let received = new Map<number, Amounts>();
  let roomShare = new Map<number, number>(work.map((b) => [b.id, 1]));
  // To start, every input is taken to be there in full.
  for (const b of work) {
    const all: Amounts = {};
    for (const [good] of entries(recipeFor(b).inputs)) all[good] = fullNeed(b, good);
    received.set(b.id, all);
  }

  let pace = new Map<number, number>();
  let flow = new Map<string, number>();
  let toYard = new Map<number, Amounts>();
  let storeIn: Amounts = {};

  for (let round = 0; round < 200; round += 1) {
    // What each building asks for of each input: as much as its other inputs and its room let it use.
    const demand = new Map<number, Amounts>();
    for (const b of work) {
      const inputs = entries(recipeFor(b).inputs);
      const got = received.get(b.id) ?? {};
      const asks: Amounts = {};
      for (const [good] of inputs) {
        let share = Math.min(1, roomShare.get(b.id) ?? 1);
        for (const [other] of inputs) {
          if (other === good) continue;
          const need = fullNeed(b, other);
          share = Math.min(share, need > EPS ? (got[other] ?? 0) / need : 0);
        }
        asks[good] = fullNeed(b, good) * Math.max(0, share);
      }
      demand.set(b.id, asks);
    }
    const storeLeft: Amounts = {};
    for (const good of GOOD_IDS) storeLeft[good] = storeDemand(good);
    const squareLeft = new Map(capacityOfSquares);

    const nextReceived = new Map<number, Amounts>(work.map((b) => [b.id, {}]));
    const nextPace = new Map<number, number>();
    const nextRoom = new Map<number, number>();
    const nextFlow = new Map<string, number>();
    const nextYard = new Map<number, Amounts>();
    const nextStoreIn: Amounts = {};

    for (const b of work) {
      const { inputs, outputs } = recipeFor(b);
      const pot = potential.get(b.id) ?? 0;
      const got = nextReceived.get(b.id) ?? {};
      let share = Math.min(1, roomShare.get(b.id) ?? 1);
      for (const [good] of entries(inputs)) {
        const need = fullNeed(b, good);
        share = Math.min(share, need > EPS ? (got[good] ?? 0) / need : 0);
      }
      if (pot <= EPS) share = 0;
      nextPace.set(b.id, share);
      let room = 1;
      const yard: Amounts = {};
      for (const [good, perDay] of entries(outputs)) {
        const most = pot * perDay;
        let left = share * most;
        let canPlace = 0;
        for (const lane of lanesFrom.get(b.id) ?? []) {
          if (lane.good !== good) continue;
          const to = byId.get(lane.to) as Building;
          const asks =
            to.kind === "storehouse" ? (storeLeft[good] ?? 0) : (demand.get(to.id)?.[good] ?? 0) - (nextReceived.get(to.id)?.[good] ?? 0);
          let carries = lane.carries;
          if (lane.line !== undefined) {
            carries = Number.POSITIVE_INFINITY;
            for (const key of lines[lane.line]?.lanes ?? []) carries = Math.min(carries, squareLeft.get(key) ?? 0);
          }
          const width = Math.max(0, Math.min(carries, asks));
          canPlace += width;
          const sent = Math.min(width, left);
          left -= sent;
          nextFlow.set(laneKey(lane), sent);
          if (sent <= 0) continue;
          if (lane.line !== undefined)
            for (const key of lines[lane.line]?.lanes ?? []) squareLeft.set(key, (squareLeft.get(key) ?? 0) - sent);
          if (to.kind === "storehouse") {
            storeLeft[good] = (storeLeft[good] ?? 0) - sent;
            nextStoreIn[good] = (nextStoreIn[good] ?? 0) + sent;
          } else {
            const theirs = nextReceived.get(to.id) as Amounts;
            theirs[good] = (theirs[good] ?? 0) + sent;
          }
        }
        const yardFull = (b.yard[good] ?? 0) >= YARD_CAP - EPS;
        if (!yardFull) {
          yard[good] = Math.max(0, left);
          canPlace = Number.POSITIVE_INFINITY;
        }
        if (most > EPS) room = Math.min(room, canPlace / most);
      }
      nextRoom.set(b.id, Math.min(1, room));
      nextYard.set(b.id, yard);
    }

    let moved = 0;
    for (const b of work) {
      moved = Math.max(moved, Math.abs((nextPace.get(b.id) ?? 0) - (pace.get(b.id) ?? 0)));
      moved = Math.max(moved, Math.abs((nextRoom.get(b.id) ?? 0) - (roomShare.get(b.id) ?? 0)));
    }
    received = nextReceived;
    pace = nextPace;
    roomShare = nextRoom;
    flow = nextFlow;
    toYard = nextYard;
    storeIn = nextStoreIn;
    if (round > 0 && moved < 1e-12) break;
  }

  // What each building really uses: no more than its pace allows of what reached it.
  const buildings: Record<number, BuildingFlow> = {};
  for (const b of state.buildings) {
    const kind = KINDS[b.kind];
    const crew = staff.get(b.id) ?? 0;
    const flowOf: BuildingFlow = {
      staff: crew,
      workersNeeded: b.paused ? 0 : kind.workers,
      power: power.line.given.get(b.id) ?? power.line.generated.get(b.id) ?? 0,
      pace: 0,
      uses: {},
      makes: {},
      toYard: {},
      limit: { kind: "full" },
    };
    buildings[b.id] = flowOf;
    if (!isWorkplace(b.kind)) continue;
    const { inputs, outputs } = recipeFor(b);
    const pot = potential.get(b.id) ?? 0;
    const share = pace.get(b.id) ?? 0;
    flowOf.pace = share * pot;
    for (const [good, perDay] of entries(inputs)) flowOf.uses[good] = share * pot * perDay;
    for (const [good] of entries(outputs)) {
      let sent = 0;
      for (const lane of lanesFrom.get(b.id) ?? []) if (lane.good === good) sent += flow.get(laneKey(lane)) ?? 0;
      const yard = toYard.get(b.id)?.[good] ?? 0;
      flowOf.toYard[good] = yard;
      flowOf.makes[good] = sent + yard;
    }
    flowOf.limit = limitOf(b, recipeFor(b), share, pot, received.get(b.id) ?? {}, fullNeed, roomShare.get(b.id) ?? 1, crew);
  }

  const store = {} as Flows["store"];
  for (const good of GOOD_IDS) {
    const inflow = storeIn[good] ?? 0;
    const toHouses = Math.min(inflow, houseTake[good] ?? 0);
    store[good] = { inflow, toHouses, toStock: state.stock[good] < cap - EPS || open ? inflow - toHouses : 0 };
  }

  const routes: Record<number, number> = {};
  for (const route of state.routes) routes[route.id] = flow.get(`r${route.id}`) ?? 0;
  const belts: BeltFlow[] = [];
  const beltSquares: Record<string, number> = {};
  for (const [index, line] of lines.entries()) {
    const goods = new Set((lanesFrom.get(line.from) ?? []).filter((l) => l.line === index).map((l) => l.good));
    if (goods.size === 0) belts.push({ from: line.from, to: line.to, good: null, carries: 0, squares: line.squares });
    for (const good of goods) {
      const carries = flow.get(`b${index}:${good}`) ?? 0;
      belts.push({ from: line.from, to: line.to, good, carries, squares: line.squares });
      for (const sq of line.squares) beltSquares[squareKey(sq.x, sq.y)] = (beltSquares[squareKey(sq.x, sq.y)] ?? 0) + carries;
    }
  }

  return {
    buildings,
    routes,
    belts,
    beltSquares,
    store,
    households: households(state, store, power, served.length),
    power,
  };
}

function limitOf(
  b: Building,
  recipe: { inputs: Amounts; outputs: Amounts },
  share: number,
  pot: number,
  got: Amounts,
  fullNeed: (b: Building, good: GoodId) => number,
  room: number,
  crew: number,
): Limit {
  if (b.paused) return { kind: "paused" };
  if (b.kind === "landing" && !b.contract) return { kind: "no-contract" };
  const need = KINDS[b.kind].workers;
  if (need > 0 && crew === 0) return { kind: "workers", have: 0, need };
  if (share >= 1 - 1e-6) return need > 0 && crew < need ? { kind: "workers", have: crew, need } : { kind: "full" };
  // The tightest of its inputs, else its room to send on what it makes.
  let worst: GoodId | null = null;
  let worstShare = 1;
  for (const [good] of entries(recipe.inputs)) {
    const full = fullNeed(b, good);
    const s = full > EPS ? (got[good] ?? 0) / full : 0;
    if (s < worstShare - 1e-9) {
      worst = good;
      worstShare = s;
    }
  }
  if (worst && worstShare <= room + 1e-9) return { kind: "input", good: worst };
  const out = entries(recipe.outputs)[0];
  if (out && pot > 0) return { kind: "room", good: out[0] };
  return need > 0 && crew < need ? { kind: "workers", have: crew, need } : { kind: "full" };
}

function households(state: SteadingState, store: Flows["store"], power: PowerFlow, served: number): HouseholdsFlow {
  const houses = state.buildings.filter((b) => b.kind === "house");
  const occupied = houses.filter((b) => b.occupied);
  const water = waterFor(state, occupied);
  const waiting = houses.filter((b) => !b.occupied).map((b) => ({ id: b.id, for: [] as HouseholdsFlow["waiting"][number]["for"] }));
  const takesEach = houseTakes(state);
  const heat = heatNeed(state);
  return {
    people: occupied.length * HOUSEHOLD,
    houses: houses.length,
    occupied: occupied.length,
    waiting,
    water: { need: occupied.length * HOUSE_NEEDS.litres, supply: Math.min(water.reaching, occupied.length * HOUSE_NEEDS.litres) },
    food: {
      need: occupied.length * HOUSE_NEEDS.kcal,
      supply: Math.min(store.bread.inflow, takesEach.bread * served) * (HOUSE_NEEDS.kcal / takesEach.bread),
    },
    heat: {
      need: occupied.length * heat,
      supply: Math.min(store.firewood.inflow, takesEach.firewood * served) * (heat / takesEach.firewood),
    },
    electricity: {
      need: occupied.length * HOUSE_NEEDS.electricityKwh,
      supply: occupied.reduce((sum, b) => sum + (power.line.given.get(b.id) ?? 0), 0),
      lit: occupied.filter((b) => (power.line.given.get(b.id) ?? 0) >= HOUSE_NEEDS.electricityKwh - EPS).length,
    },
  };
}

/** The water that reaches the given houses: each well's for the houses within its reach, and the waterworks' for all. */
function waterFor(state: SteadingState, homes: Building[]): { reaching: number; reaches: (home: Building) => boolean } {
  const wells = state.buildings.filter((b) => b.kind === "well");
  const works = state.buildings.filter((b) => b.kind === "waterworks" && !b.paused);
  const staff = assignWorkers(state);
  const worksLitres = works.reduce((sum, b) => sum + (WATERWORKS_LITRES * (staff.get(b.id) ?? 0)) / KINDS.waterworks.workers, 0);
  const reaches = (home: Building) => worksLitres > 0 || wells.some((well) => distance(well, home) <= WELL_REACH);
  const reachingWells = wells.filter((well) => homes.some((home) => distance(well, home) <= WELL_REACH));
  return { reaching: reachingWells.length * wellLitres(state) + worksLitres, reaches };
}

/**
 * Moves in every household whose house has water, food and firewood to hand: a well in
 * reach and a storehouse in reach, and enough coming in to feed and warm it as well as
 * those already there. Says what each house still waits for.
 */
function settle(state: SteadingState, at: number): { state: SteadingState; waiting: HouseholdsFlow["waiting"] } {
  let current = state;
  const takesEach = houseTakes(state);
  for (let pass = 0; pass < 200; pass += 1) {
    const houses = current.buildings.filter((b) => b.kind === "house");
    if (!houses.some((b) => !b.occupied)) return { state: current, waiting: [] };
    const flows = solve(current, true, at);
    const occupied = houses.filter((b) => b.occupied);
    const stores = current.buildings.filter((b) => b.kind === "storehouse");
    const water = waterFor(current, houses);
    let spareWater = water.reaching - occupied.length * HOUSE_NEEDS.litres;
    let spareBread = flows.store.bread.inflow - takesEach.bread * occupied.length;
    let spareWood = flows.store.firewood.inflow - takesEach.firewood * occupied.length;
    const waiting: HouseholdsFlow["waiting"] = [];
    let movedIn: number | null = null;
    for (const home of houses) {
      if (home.occupied) continue;
      const wants: HouseholdsFlow["waiting"][number]["for"] = [];
      if (!water.reaches(home)) wants.push("well");
      else if (spareWater < HOUSE_NEEDS.litres - EPS) wants.push("water");
      if (!stores.some((store) => distance(store, home) <= STORE_REACH)) wants.push("storehouse");
      else {
        if (spareBread < takesEach.bread - EPS) wants.push("food");
        if (spareWood < takesEach.firewood - EPS) wants.push("firewood");
      }
      if (wants.length === 0 && movedIn === null) {
        movedIn = home.id;
        spareWater -= HOUSE_NEEDS.litres;
        spareBread -= takesEach.bread;
        spareWood -= takesEach.firewood;
      } else if (wants.length > 0) waiting.push({ id: home.id, for: wants });
    }
    if (movedIn === null) return { state: current, waiting };
    // One household at a time, since each one brings workers who change the flows.
    const id = movedIn;
    current = {
      ...current,
      buildings: current.buildings.map((b) => (b.id === id ? { ...b, occupied: true } : b)),
    };
    current = markMilestones(current, at, id);
  }
  return { state: current, waiting: [] };
}

function markMilestones(state: SteadingState, at: number, movedIn?: number): SteadingState {
  const milestones = { ...state.milestones };
  const people = peopleOf(state);
  const mark = (id: MilestoneId, when: boolean) => {
    if (when && milestones[id] === undefined) milestones[id] = at;
  };
  if (movedIn !== undefined) mark("first-household", true);
  mark("people-12", people >= 12);
  mark("people-24", people >= 24);
  mark("people-40", people >= 40);
  mark("people-64", people >= 64);
  mark("people-100", people >= 100);
  mark("first-iron", state.made.iron > 0);
  mark("first-tools", state.made.tools > 0);
  mark(
    "first-power",
    state.buildings.some((b) => b.kind === "wheel" || b.kind === "solar" || b.kind === "turbine" || b.kind === "generator"),
  );
  mark(
    "first-track",
    state.routes.some((r) => r.mode === "track"),
  );
  mark("first-belt", state.belts.length > 0);
  mark(
    "first-sun",
    state.buildings.some((b) => b.kind === "solar"),
  );
  mark("first-battery", state.stored > EPS);
  mark("first-trade", state.made.ore > 0 && state.buildings.some((b) => b.kind === "landing" && b.contract));
  const changed = MILESTONE_IDS.some((id) => milestones[id] !== state.milestones[id]);
  return changed ? { ...state, milestones } : state;
}

/** The flows as they stand, with what each waiting house waits for. */
export function flowsOf(state: SteadingState): Flows {
  const flows = solve(state);
  flows.households.waiting = settle(state, state.clock).waiting;
  return flows;
}

// ── Time ────────────────────────────────────────────────────────────────────

/** The next moment the sun or the month changes for this settlement, after `at`. */
function nextTurn(state: SteadingState, at: number): number {
  const date = new Date(at);
  const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  if (!state.buildings.some((b) => b.kind === "solar")) {
    return state.buildings.some((b) => b.kind === "turbine") ? monthEnd : Number.POSITIVE_INFINITY;
  }
  const dayStart = Math.floor(at / DAY_MS) * DAY_MS;
  const sunset = dayStart + weatherOf(state.map.land, monthOf(at)).daylight * DAY_MS;
  const next = sunset > at + 1e-6 ? sunset : dayStart + DAY_MS;
  return Math.min(next, monthEnd);
}

interface Span {
  state: SteadingState;
  /** The batteries' least and most during the span, and whether they sat full or at their floor. */
  low: number;
  high: number;
  bounded: boolean;
}

/** One stretch of time worked out exactly, from one change to the next, up to `until`. */
function run(state: SteadingState, until: number, budget: { steps: number }): Span {
  let current = state;
  let low = current.stored;
  let high = current.stored;
  let bounded = false;
  while (current.clock < until && budget.steps > 0) {
    budget.steps -= 1;
    const flows = solve(current);
    const cap = storeCap(current);
    const line = flows.power.line;
    if (line.bank === "full" || line.bank === "empty") bounded = true;
    const turn = nextTurn(current, current.clock);
    const end = Math.min(until, turn);
    // How long until the first thing fills or empties, in settlement days.
    let days = (end - current.clock) / DAY_MS;
    for (const good of GOOD_IDS) {
      const rate = flows.store[good].toStock;
      if (rate > EPS && current.stock[good] < cap) days = Math.min(days, (cap - current.stock[good]) / rate);
    }
    for (const b of current.buildings) {
      for (const [good, rate] of entries(flows.buildings[b.id]?.toYard ?? {})) {
        const has = b.yard[good] ?? 0;
        if (rate > EPS && has < YARD_CAP) days = Math.min(days, (YARD_CAP - has) / rate);
      }
      const burn = line.burning.get(b.id) ?? 0;
      if (burn > EPS) days = Math.min(days, (b.tank ?? 0) / burn);
    }
    const net = line.charging - line.discharging;
    if (net > EPS) days = Math.min(days, (flows.power.capacity - current.stored) / net);
    if (net < -EPS) days = Math.min(days, current.stored / -net);
    days = Math.max(0, days);
    const reachedEnd = days >= (end - current.clock) / DAY_MS - 1e-12;
    const clock = reachedEnd ? end : current.clock + days * DAY_MS;

    const stock = { ...current.stock };
    const made = { ...current.made };
    for (const good of GOOD_IDS) {
      const rate = flows.store[good].toStock;
      if (rate > EPS && stock[good] < cap) stock[good] = snap(stock[good] + rate * days, cap);
    }
    const buildings = current.buildings.map((b) => {
      const f = flows.buildings[b.id];
      if (!f) return b;
      for (const [good, rate] of entries(f.makes)) made[good] = Math.min(MADE_CAP, made[good] + rate * days);
      const burn = line.burning.get(b.id) ?? 0;
      const yardRates = entries(f.toYard).filter(([good, rate]) => rate > EPS && (b.yard[good] ?? 0) < YARD_CAP);
      if (yardRates.length === 0 && burn <= EPS) return b;
      const next = { ...b };
      if (yardRates.length) {
        next.yard = { ...b.yard };
        for (const [good, rate] of yardRates) next.yard[good] = snap((next.yard[good] ?? 0) + rate * days, YARD_CAP);
      }
      if (burn > EPS) next.tank = floorAt(Math.max(0, (b.tank ?? 0) - burn * days));
      return next;
    });
    let stored = current.stored + net * days;
    stored = stored >= flows.power.capacity - 1e-7 ? flows.power.capacity : floorAt(Math.max(0, stored));
    const madeNow = flows.power.sun + flows.power.wind + flows.power.wheel + flows.power.generator - line.spilled;
    const kwhMade = Math.min(MADE_CAP, current.kwhMade + Math.max(0, madeNow) * days);
    current = { ...current, clock, stock, made, buildings, stored, kwhMade };
    low = Math.min(low, stored);
    high = Math.max(high, stored);
    current = markMilestones(current, clock);
    current = settle(current, clock).state;
  }
  return { state: current, low, high, bounded };
}

/** A value run down to nothing: exactly nothing once within a hair of it. */
const floorAt = (value: number) => (value <= 1e-7 ? 0 : value);

/** What is full, filled or moved in: when none of it changes over a day, the next day is the same. */
function signature(state: SteadingState): string {
  const cap = storeCap(state);
  const full = GOOD_IDS.filter((g) => state.stock[g] >= cap - EPS).join();
  const yards = state.buildings
    .map(
      (b) =>
        `${b.id}:${entries(b.yard)
          .filter(([, n]) => n >= YARD_CAP - EPS)
          .map(([g]) => g)
          .join("/")}:${b.occupied ? 1 : 0}:${(b.tank ?? 1) > EPS ? 1 : 0}`,
    )
    .join();
  const made = GOOD_IDS.filter((g) => state.made[g] > 0).join();
  return `${full}|${yards}|${made}|${Object.keys(state.milestones).length}`;
}

/**
 * The settlement worked out to `now`. Time only adds: each stock and yard grows at its
 * rate until it is full, then that work rests; the batteries charge and run down with the
 * sun, the wind and the load. A clock earlier than the settlement's changes nothing.
 */
export function advance(state: SteadingState, now: number): SteadingState {
  let current = settle(state, state.clock).state;
  if (!(now > current.clock)) return current;
  const budget = { steps: 40_000 };
  const daily = current.buildings.some((b) => b.kind === "solar");
  while (current.clock < now && budget.steps > 0) {
    const atDayStart = current.clock % DAY_MS === 0;
    if (!daily || !atDayStart || now - current.clock < 2 * DAY_MS) {
      const until = daily ? Math.min(now, (Math.floor(current.clock / DAY_MS) + 1) * DAY_MS) : now;
      current = run(current, until, budget).state;
      continue;
    }
    // A whole day, worked out exactly; and if it changed nothing but amounts, the same again.
    const before = current;
    const day = run(current, current.clock + DAY_MS, budget);
    current = day.state;
    if (signature(before) !== signature(current) || current.clock !== before.clock + DAY_MS) continue;
    const date = new Date(current.clock);
    const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    let k = Math.floor((Math.min(now, monthEnd) - current.clock) / DAY_MS);
    const dStored = current.stored - before.stored;
    if (Math.abs(dStored) > 1e-9) {
      if (day.bounded) continue;
      const capacity = bankOf(current).capacity;
      // Each day moves the batteries the same: as many days as keep them off both ends.
      const lowRel = day.low - before.stored;
      const highRel = day.high - before.stored;
      for (let guard = 0; guard < 64 && k > 0; guard++) {
        const start = current.stored + (k - 1) * dStored;
        if (start + lowRel > 1e-6 && start + highRel < capacity - 1e-6) break;
        k = Math.floor(k / 2);
      }
    }
    const cap = storeCap(current);
    const limit = (value: number, delta: number, top: number) => (delta > EPS ? Math.ceil((top - EPS - value) / delta) - 1 : k);
    for (const good of GOOD_IDS) {
      if (current.stock[good] < cap) k = Math.min(k, limit(current.stock[good], current.stock[good] - before.stock[good], cap));
    }
    for (const [i, b] of current.buildings.entries()) {
      const was = before.buildings[i] as Building;
      for (const good of GOOD_IDS) {
        const has = b.yard[good] ?? 0;
        if (has < YARD_CAP) k = Math.min(k, limit(has, has - (was.yard[good] ?? 0), YARD_CAP));
      }
      const burnt = (was.tank ?? 0) - (b.tank ?? 0);
      if (burnt > EPS) k = Math.min(k, Math.ceil((b.tank ?? 0) / burnt) - 1);
    }
    if (k < 1) continue;
    const times = k;
    const stock = { ...current.stock };
    const made = { ...current.made };
    for (const good of GOOD_IDS) {
      stock[good] = current.stock[good] + times * (current.stock[good] - before.stock[good]);
      made[good] = Math.min(MADE_CAP, current.made[good] + times * (current.made[good] - before.made[good]));
    }
    const buildings = current.buildings.map((b, i) => {
      const was = before.buildings[i] as Building;
      const yard = { ...b.yard };
      for (const [good, n] of entries(b.yard)) yard[good] = n + times * (n - (was.yard[good] ?? 0));
      const next: Building = { ...b, yard };
      if (b.tank !== undefined) next.tank = floorAt(b.tank + times * (b.tank - (was.tank ?? 0)));
      return next;
    });
    current = {
      ...current,
      clock: current.clock + times * DAY_MS,
      stock,
      made,
      buildings,
      stored: current.stored + times * dStored,
      kwhMade: Math.min(MADE_CAP, current.kwhMade + times * (current.kwhMade - before.kwhMade)),
    };
  }
  return { ...current, clock: Math.max(current.clock, now) };
}

/** A value grown towards its cap: exactly the cap once within a hair of it, never past it. */
const snap = (value: number, cap: number) => (value >= cap - 1e-7 ? Math.max(cap, Math.min(value, cap)) : value);

// ── Actions ─────────────────────────────────────────────────────────────────

export interface BeltSquare {
  x: number;
  y: number;
  dir: BeltDir;
}

export type SteadingAction =
  | { type: "found"; land: LandId; seed: string }
  | { type: "build"; kind: KindId; x: number; y: number }
  | { type: "remove"; id: number }
  | { type: "route"; from: number; to: number; good: GoodId; mode: ModeId }
  | { type: "changeRoute"; id: number; mode: ModeId }
  | { type: "removeRoute"; id: number }
  | { type: "routeFirst"; id: number }
  | { type: "pause"; id: number; paused: boolean }
  | { type: "contract"; id: number; contract: ContractId | null }
  | { type: "clearYard"; id: number }
  | { type: "sell"; good: GoodId; count: number }
  | { type: "buy"; good: GoodId; count: number }
  | { type: "belts"; tier: BeltTier; squares: BeltSquare[] }
  | { type: "removeBelts"; squares: { x: number; y: number }[] }
  | { type: "fillTank"; id: number };

export const scaled = (amounts: Amounts, times: number): Amounts => {
  const out: Amounts = {};
  for (const [good, n] of entries(amounts)) if (n * times > 0) out[good] = n * times;
  return out;
};

export function routeCost(mode: ModeId, length: number): Amounts {
  return scaled(MODES[mode].perSquare, length);
}

/** What a belt square costs: a junction twice a plain square. */
export const beltCost = (tier: BeltTier, dir: BeltDir) => scaled(BELTS[tier].perSquare, dir === "x" ? 2 : 1);

const addAmounts = (a: Amounts, b: Amounts): Amounts => {
  const out = { ...a };
  for (const [good, n] of entries(b)) out[good] = (out[good] ?? 0) + n;
  return out;
};

const short = (state: SteadingState, cost: Amounts): GoodId | null => {
  for (const [good, n] of entries(cost)) if (state.stock[good] < n - EPS) return good;
  return null;
};

function pay(state: SteadingState, cost: Amounts): Record<GoodId, number> {
  const lacking = short(state, cost);
  if (lacking) refuse(`There is not enough ${GOODS[lacking].name} in the store: it needs ${Math.ceil(cost[lacking] ?? 0)}.`);
  const stock = { ...state.stock };
  for (const [good, n] of entries(cost)) stock[good] = Math.max(0, stock[good] - n);
  return stock;
}

/** Goods given back (a building taken down, a yard carried in): kept in full, even past the store's size. */
function giveBack(stock: Record<GoodId, number>, amounts: Amounts): Record<GoodId, number> {
  const out = { ...stock };
  for (const [good, n] of entries(amounts)) out[good] += n;
  return out;
}

const groundWords = (t: string) =>
  t === "river"
    ? "the river"
    : t === "water"
      ? "water"
      : t === "coal"
        ? "the coal seam"
        : t === "clay"
          ? "a clay bank"
          : t === "ore"
            ? "an ore deposit"
            : TERRAIN_NAMES[t as keyof typeof TERRAIN_NAMES];

/** Why a building cannot stand on a square, or null when it can. */
export function siteProblem(state: SteadingState, kind: KindId, x: number, y: number): string | null {
  const ground = terrainAt(state.map, x, y);
  if (ground === null) return "That square is outside the land.";
  const def = KINDS[kind];
  const on = def.on ?? ["meadow"];
  const open = LANDS[state.map.land].ground;
  if (!on.includes(ground))
    return on.length > 1 ? `A ${def.name.toLowerCase()} stands on ${open} or a fell.` : `Buildings stand on ${open}.`;
  if (state.buildings.some((b) => b.x === x && b.y === y)) return "Something already stands there.";
  if (state.belts.some((b) => b.x === x && b.y === y)) return "A belt runs over that square: take it up first.";
  if (peopleOf(state) < def.unlockAt) return `${def.name}s can be built once ${def.unlockAt} people live here.`;
  if (def.beside) {
    const kinds = typeof def.beside === "string" ? [def.beside] : def.beside;
    if (!groundNear(state.map, x, y, kinds, 1))
      return `A ${def.name.toLowerCase()} must stand beside ${kinds.map(groundWords).join(" or ")}.`;
  }
  if (kind === "field" && !state.map.legacy) {
    const reach = LANDS[state.map.land].fieldsNearWater;
    if (reach !== null && !groundNear(state.map, x, y, ["river", "water"], reach))
      return `The land is dry: a field must be within ${reach} squares of water.`;
  }
  return null;
}

/** Why a route cannot be laid, or null. */
export function routeProblem(state: SteadingState, from: number, to: number, good: GoodId, mode: ModeId): string | null {
  const a = state.buildings.find((b) => b.id === from);
  const b = state.buildings.find((c) => c.id === to);
  if (!a || !b) return "That building is not there any more.";
  if (a.id === b.id) return "A building cannot send to itself.";
  if (!(recipeOf(a, state).outputs[good] ?? 0)) return `The ${KINDS[a.kind].name.toLowerCase()} does not make ${GOODS[good].name}.`;
  if (!takes(b, good)) return `The ${KINDS[b.kind].name.toLowerCase()} does not use ${GOODS[good].name}.`;
  if (!onward(a, b)) return "Things are sent on to a later step of the chain.";
  if (state.routes.some((r) => r.from === from && r.to === to && r.good === good)) return "That route is already laid.";
  if (peopleOf(state) < MODES[mode].unlockAt) return `Track can be laid once ${MODES[mode].unlockAt} people live here.`;
  if (distance(a, b) > MODES[mode].reach) return `${MODES[mode].name} reaches ${MODES[mode].reach} squares; that is ${distance(a, b)}.`;
  return null;
}

/** Why belts cannot be laid on these squares, or null; and what they cost (less what is given back for belts replaced). */
export function beltProblem(
  state: SteadingState,
  tier: BeltTier,
  squares: BeltSquare[],
): { problem: string | null; cost: Amounts; back: Amounts } {
  const cost: Amounts = {};
  let back: Amounts = {};
  if (squares.length === 0) return { problem: "Choose where the belt goes.", cost, back };
  if (peopleOf(state) < BELTS[tier].unlockAt)
    return { problem: `${BELTS[tier].name}s can be laid once ${BELTS[tier].unlockAt} people live here.`, cost, back };
  const seen = new Set<string>();
  const adding = squares.filter((sq) => !state.belts.some((b) => b.x === sq.x && b.y === sq.y)).length;
  if (state.belts.length + adding > MAX_BELTS) return { problem: `A settlement keeps at most ${MAX_BELTS} squares of belt.`, cost, back };
  for (const sq of squares) {
    const key = squareKey(sq.x, sq.y);
    if (seen.has(key)) return { problem: "The belt crosses itself: lay a junction instead.", cost, back };
    seen.add(key);
    const ground = terrainAt(state.map, sq.x, sq.y);
    if (ground === null) return { problem: "That square is outside the land.", cost, back };
    if (ground !== "meadow")
      return {
        problem: `Belts run over ${LANDS[state.map.land].ground}; column ${sq.x + 1}, row ${sq.y + 1} is ${TERRAIN_NAMES[ground]}.`,
        cost,
        back,
      };
    if (state.buildings.some((b) => b.x === sq.x && b.y === sq.y))
      return { problem: `A building stands at column ${sq.x + 1}, row ${sq.y + 1}.`, cost, back };
    const old = state.belts.find((b) => b.x === sq.x && b.y === sq.y);
    if (old) back = addAmounts(back, beltCost(old.tier, old.dir));
    for (const [good, n] of entries(beltCost(tier, sq.dir))) cost[good] = (cost[good] ?? 0) + n;
  }
  return { problem: null, cost, back };
}

/**
 * The settlement after an action at `at` (the server's clock): first worked out to then,
 * then changed. An action that cannot be done throws a `SteadingRefusal` with words for
 * the person, and nothing changes.
 */
export function applyAction(state: SteadingState, action: SteadingAction, at: number): SteadingState {
  if (action.type === "found") {
    if (!(LAND_IDS_SET as Set<string>).has(action.land)) refuse("Choose a kind of land.");
    return newSteading(at, { land: action.land, seed: action.seed });
  }
  const now = advance(state, at);
  const next = act(now, action);
  const marked = markMilestones({ ...next, lastActionAt: now.clock }, now.clock);
  return settle(marked, now.clock).state;
}

function find(state: SteadingState, id: number): Building {
  return state.buildings.find((b) => b.id === id) ?? refuse("That building is not there any more.");
}

function act(state: SteadingState, action: Exclude<SteadingAction, { type: "found" }>): SteadingState {
  switch (action.type) {
    case "build": {
      const problem = siteProblem(state, action.kind, action.x, action.y);
      if (problem) refuse(problem);
      const stock = pay(state, costOf(state, action.kind));
      const building: Building = { id: state.nextId, kind: action.kind, x: action.x, y: action.y, paused: false, yard: {} };
      if (action.kind === "house") building.occupied = false;
      if (action.kind === "landing") building.contract = null;
      if (action.kind === "generator") building.tank = 0;
      return { ...state, stock, nextId: state.nextId + 1, buildings: [...state.buildings, building] };
    }
    case "remove": {
      const b = find(state, action.id);
      if (b.kind === "house" && b.occupied) refuse("A household lives in that house, so it stays.");
      if (b.kind === "storehouse" && state.buildings.filter((c) => c.kind === "storehouse").length === 1)
        refuse("The settlement needs one storehouse; build another before taking this one down.");
      const gone = state.routes.filter((r) => r.from === b.id || r.to === b.id);
      let stock = giveBack(state.stock, costOf(state, b.kind));
      stock = giveBack(stock, b.yard);
      // Diesel left in a tank goes back to the store, in whole cans and the part of one.
      if (b.tank) stock = giveBack(stock, { diesel: b.tank / CAN_LITRES });
      for (const route of gone) stock = giveBack(stock, routeCost(route.mode, routeLength(state, route)));
      const rest = { ...state, buildings: state.buildings.filter((c) => c.id !== b.id) };
      // Taking a battery away takes its share of the charge with it.
      const stored = isBank(b.kind) ? state.stored * (bankOf(rest).capacity / Math.max(EPS, bankOf(state).capacity)) : state.stored;
      return {
        ...rest,
        stock,
        stored: Math.min(stored, bankOf(rest).capacity),
        routes: state.routes.filter((r) => !gone.includes(r)),
      };
    }
    case "route": {
      const problem = routeProblem(state, action.from, action.to, action.good, action.mode);
      if (problem) refuse(problem);
      const length = distance(find(state, action.from), find(state, action.to));
      const stock = pay(state, routeCost(action.mode, length));
      const route: Route = { id: state.nextId, from: action.from, to: action.to, good: action.good, mode: action.mode };
      return { ...state, stock, nextId: state.nextId + 1, routes: [...state.routes, route] };
    }
    case "changeRoute": {
      const route = state.routes.find((r) => r.id === action.id) ?? refuse("That route is not there any more.");
      if (route.mode === action.mode) return state;
      const length = routeLength(state, route);
      if (peopleOf(state) < MODES[action.mode].unlockAt) refuse(`Track can be laid once ${MODES[action.mode].unlockAt} people live here.`);
      if (length > MODES[action.mode].reach)
        refuse(`${MODES[action.mode].name} reaches ${MODES[action.mode].reach} squares; that is ${length}.`);
      const back = giveBack(state.stock, routeCost(route.mode, length));
      const stock = pay({ ...state, stock: back }, routeCost(action.mode, length));
      return { ...state, stock, routes: state.routes.map((r) => (r.id === route.id ? { ...r, mode: action.mode } : r)) };
    }
    case "removeRoute": {
      const route = state.routes.find((r) => r.id === action.id) ?? refuse("That route is not there any more.");
      const stock = giveBack(state.stock, routeCost(route.mode, routeLength(state, route)));
      return { ...state, stock, routes: state.routes.filter((r) => r.id !== route.id) };
    }
    case "routeFirst": {
      const route = state.routes.find((r) => r.id === action.id) ?? refuse("That route is not there any more.");
      return { ...state, routes: [route, ...state.routes.filter((r) => r.id !== route.id)] };
    }
    case "pause": {
      const b = find(state, action.id);
      if (!isWorkplace(b.kind) && b.kind !== "waterworks") refuse("Only a place of work can be rested.");
      return { ...state, buildings: state.buildings.map((c) => (c.id === b.id ? { ...c, paused: action.paused } : c)) };
    }
    case "contract": {
      const b = find(state, action.id);
      if (b.kind !== "landing") refuse("Only the landing trades.");
      return {
        ...state,
        buildings: state.buildings.map((c) => (c.id === b.id ? { ...c, contract: action.contract } : c)),
        // Routes that no longer fit the trade are kept: they carry again if the trade is changed back.
      };
    }
    case "clearYard": {
      const b = find(state, action.id);
      return {
        ...state,
        stock: giveBack(state.stock, b.yard),
        buildings: state.buildings.map((c) => (c.id === b.id ? { ...c, yard: {} } : c)),
      };
    }
    case "sell": {
      if (!state.buildings.some((b) => b.kind === "landing")) refuse("Build a landing first: the barge is what buys.");
      const n = Math.floor(action.count);
      if (n < 1) refuse("Choose how many to sell.");
      if (state.stock[action.good] < n - EPS)
        refuse(`There are only ${Math.floor(state.stock[action.good])} ${GOODS[action.good].name} in the store.`);
      const room = CREDIT_CAP - state.credit;
      const selling = Math.min(n, Math.floor(room / GOODS[action.good].sells));
      if (selling < 1) refuse("The landing holds as much credit as it can.");
      return {
        ...state,
        stock: { ...state.stock, [action.good]: Math.max(0, state.stock[action.good] - selling) },
        credit: state.credit + selling * GOODS[action.good].sells,
        milestones: state.milestones["first-trade"] === undefined ? { ...state.milestones, "first-trade": state.clock } : state.milestones,
      };
    }
    case "buy": {
      if (!state.buildings.some((b) => b.kind === "landing")) refuse("Build a landing first: the barge is what brings goods.");
      const price = GOODS[action.good].buys;
      if (price === null) refuse(`The barge does not bring ${GOODS[action.good].name}: the settlement makes its own.`);
      const n = Math.floor(action.count);
      if (n < 1) refuse("Choose how many to buy.");
      const cost = n * (price as number);
      if (state.credit < cost) refuse(`That costs ${cost} credit; the landing holds ${Math.floor(state.credit)}.`);
      const made = state.milestones["first-trade"] === undefined ? { ...state.milestones, "first-trade": state.clock } : state.milestones;
      return {
        ...state,
        credit: state.credit - cost,
        stock: { ...state.stock, [action.good]: state.stock[action.good] + n },
        milestones: made,
      };
    }
    case "belts": {
      const { problem, cost, back } = beltProblem(state, action.tier, action.squares);
      if (problem) refuse(problem);
      const stock = pay({ ...state, stock: giveBack(state.stock, back) }, cost);
      const laid = new Set(action.squares.map((sq) => squareKey(sq.x, sq.y)));
      const belts = [
        ...state.belts.filter((b) => !laid.has(squareKey(b.x, b.y))),
        ...action.squares.map((sq) => ({ x: sq.x, y: sq.y, dir: sq.dir, tier: action.tier })),
      ];
      return { ...state, stock, belts };
    }
    case "removeBelts": {
      const taking = new Set(action.squares.map((sq) => squareKey(sq.x, sq.y)));
      const gone = state.belts.filter((b) => taking.has(squareKey(b.x, b.y)));
      if (gone.length === 0) refuse("There is no belt there.");
      let stock = state.stock;
      for (const b of gone) stock = giveBack(stock, beltCost(b.tier, b.dir));
      return { ...state, stock, belts: state.belts.filter((b) => !taking.has(squareKey(b.x, b.y))) };
    }
    case "fillTank": {
      const b = find(state, action.id);
      if (b.kind !== "generator") refuse("Only a generator has a tank.");
      const room = TANK_LITRES - (b.tank ?? 0);
      const cans = Math.min(Math.floor(state.stock.diesel + EPS), Math.floor((room + EPS) / CAN_LITRES));
      if (room < CAN_LITRES - EPS) refuse("The tank is full.");
      if (cans < 1) refuse("There is no diesel in the store: the barge sells it at the landing.");
      return {
        ...state,
        stock: { ...state.stock, diesel: Math.max(0, state.stock.diesel - cans) },
        buildings: state.buildings.map((c) => (c.id === b.id ? { ...c, tank: (c.tank ?? 0) + cans * CAN_LITRES } : c)),
      };
    }
  }
}

export function routeLength(state: SteadingState, route: Route): number {
  const a = state.buildings.find((b) => b.id === route.from);
  const b = state.buildings.find((c) => c.id === route.to);
  return a && b ? distance(a, b) : 0;
}

/** The kinds that can be built on a square now, with why each other one cannot. */
export function buildable(state: SteadingState, x: number, y: number): { kind: KindId; problem: string | null }[] {
  return (Object.keys(KINDS) as KindId[]).map((kind) => {
    const problem = siteProblem(state, kind, x, y);
    const cost = costOf(state, kind);
    const lacking = problem ? null : short(state, cost);
    return { kind, problem: problem ?? (lacking ? `Needs ${Math.ceil(cost[lacking] ?? 0)} ${GOODS[lacking].name}.` : null) };
  });
}

/** Where a building's output can be sent: every building that takes it and is a later step, nearest first. */
export function destinationsFor(state: SteadingState, from: number, good: GoodId): Building[] {
  const a = state.buildings.find((b) => b.id === from);
  if (!a) return [];
  return state.buildings
    .filter((b) => b.id !== a.id && takes(b, good) && onward(a, b))
    .sort((p, q) => distance(a, p) - distance(a, q) || p.id - q.id);
}

/** GET /api/games/steading and each action's answer: the settlement worked out to the server's now. */
export interface SteadingResponse {
  settlement: SteadingState;
  /** The server's clock when it answered. */
  now: number;
  /** Whether the settlement is kept yet: a new one is not, until its first action. */
  started: boolean;
}

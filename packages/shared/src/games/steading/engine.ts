/**
 * The Steading's engine: the settlement's state, how its work flows, how time moves it
 * on, and each thing a person can do to it, all as pure functions.
 *
 * The one rule over all of it: time can only help or do nothing. The work is a set of
 * steady flows along routes; a building takes only what flows to it, so nothing time does
 * ever draws a stock down. A stock or a building's yard that fills simply stops the work
 * that fills it, with everything kept. People come only to houses that have water, food
 * and firewood to hand, and never leave. So a settlement left a day, a month or a year is
 * found as it was left, with whatever was made in the meantime waiting.
 *
 * Between two moments when something fills (or a household moves in) every flow is
 * constant, so `advance` steps from one such moment to the next and the result is exact,
 * the same whether worked out in one step or many.
 */
import {
  type Amounts,
  CONTRACTS,
  type ContractId,
  CREDIT_CAP,
  DAY_MS,
  distance,
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
  terrainAt,
  WATERWORKS_LITRES,
  WELL_LITRES,
  WELL_REACH,
  WHEEL_KWH,
  WHEEL_REACH,
  WORK_REACH,
  YARD_CAP,
} from "./numbers.ts";

export const STEADING_VERSION = 1;

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
}

export interface Route {
  id: number;
  from: number;
  to: number;
  good: GoodId;
  mode: ModeId;
}

export interface SteadingState {
  v: typeof STEADING_VERSION;
  startedAt: number;
  /** The time the settlement has been worked out to. Never runs backwards. */
  clock: number;
  lastActionAt: number;
  nextId: number;
  buildings: Building[];
  /** In the order they are filled: a building sends along its first route first. */
  routes: Route[];
  stock: Record<GoodId, number>;
  /** Everything made, of each good, since the settlement was founded. */
  made: Record<GoodId, number>;
  credit: number;
  milestones: Partial<Record<MilestoneId, number>>;
}

const zeroGoods = (): Record<GoodId, number> => Object.fromEntries(GOOD_IDS.map((good) => [good, 0])) as Record<GoodId, number>;

/** A new settlement: a storehouse, two houses with their households, a well, and a little to build with. */
export function newSteading(now: number): SteadingState {
  const stock = zeroGoods();
  stock.planks = 30;
  stock.stone = 20;
  stock.bricks = 30;
  stock.logs = 10;
  return {
    v: STEADING_VERSION,
    startedAt: now,
    clock: now,
    lastActionAt: now,
    nextId: 5,
    buildings: [
      { id: 1, kind: "storehouse", x: 4, y: 7, paused: false, yard: {} },
      { id: 2, kind: "house", x: 3, y: 8, paused: false, yard: {}, occupied: true },
      { id: 3, kind: "house", x: 5, y: 8, paused: false, yard: {}, occupied: true },
      { id: 4, kind: "well", x: 4, y: 9, paused: false, yard: {} },
    ],
    routes: [],
    stock,
    made: zeroGoods(),
    credit: 0,
    milestones: {},
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

/** The settlement as stored, checked field by field; null when it is not a sound one. */
export function readSteading(raw: unknown): SteadingState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.v !== STEADING_VERSION) return null;
  if (!isCount(s.startedAt) || !isCount(s.clock) || !isCount(s.lastActionAt) || !isId(s.nextId) || !isCount(s.credit)) return null;
  if (!Array.isArray(s.buildings) || !Array.isArray(s.routes)) return null;
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
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || terrainAt(b.x as number, b.y as number) === null) return null;
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
  const milestones: Partial<Record<MilestoneId, number>> = {};
  if (s.milestones && typeof s.milestones === "object") {
    for (const [key, at] of Object.entries(s.milestones)) {
      if ((MILESTONE_IDS as readonly string[]).includes(key) && isCount(at)) milestones[key as MilestoneId] = at;
    }
  }
  return {
    v: STEADING_VERSION,
    startedAt: s.startedAt,
    clock: s.clock,
    lastActionAt: s.lastActionAt,
    nextId: s.nextId as number,
    buildings,
    routes,
    stock,
    made,
    credit: s.credit,
    milestones,
  };
}

// ── What a building makes from what ─────────────────────────────────────────

export function recipeOf(building: Building): { inputs: Amounts; outputs: Amounts } {
  if (building.kind === "landing") {
    const contract = building.contract ? CONTRACTS[building.contract] : null;
    return contract ? { inputs: contract.inputs, outputs: contract.outputs } : { inputs: {}, outputs: {} };
  }
  return { inputs: KINDS[building.kind].inputs, outputs: KINDS[building.kind].outputs };
}

const entries = (amounts: Amounts) => Object.entries(amounts) as [GoodId, number][];

/** Whether `to` takes `good` along a route: a storehouse takes anything, a workplace what it uses. */
export function takes(to: Building, good: GoodId): boolean {
  if (to.kind === "storehouse") return true;
  return (recipeOf(to).inputs[good] ?? 0) > 0;
}

export const storeCap = (state: SteadingState) => STORE_CAP * state.buildings.filter((b) => b.kind === "storehouse").length;
export const peopleOf = (state: SteadingState) => HOUSEHOLD * state.buildings.filter((b) => b.kind === "house" && b.occupied).length;

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
  /** kWh a day it draws from a water wheel (a house's light, a workshop's machines). */
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

export interface Flows {
  buildings: Record<number, BuildingFlow>;
  /** What each route carries in a day. */
  routes: Record<number, number>;
  /** In a day, of each good: what comes into the storehouses, what the households take of it, what is kept. */
  store: Record<GoodId, { inflow: number; toHouses: number; toStock: number }>;
  households: HouseholdsFlow;
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
    const near = homes
      .filter((home) => distance(home, b) <= WORK_REACH)
      .sort((a, c) => distance(a, b) - distance(c, b) || a.id - c.id);
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

interface PowerShare {
  /** kWh a day each building is given. */
  given: Map<number, number>;
  made: number;
  litHouses: number;
}

function sharePower(state: SteadingState): PowerShare {
  const wheels = state.buildings.filter((b) => b.kind === "wheel");
  const made = wheels.length * WHEEL_KWH;
  let left = made;
  const given = new Map<number, number>();
  let litHouses = 0;
  const inReach = (b: Building) => wheels.some((wheel) => distance(wheel, b) <= WHEEL_REACH);
  // Light in the homes first, then the machines.
  for (const b of state.buildings) {
    if (b.kind !== "house" || !b.occupied || !inReach(b)) continue;
    const take = Math.min(left, HOUSE_NEEDS.electricityKwh);
    if (take <= EPS) break;
    given.set(b.id, take);
    left -= take;
    if (take >= HOUSE_NEEDS.electricityKwh - EPS) litHouses += 1;
  }
  for (const b of state.buildings) {
    if (!KINDS[b.kind].powered || b.paused || !inReach(b)) continue;
    const take = Math.min(left, POWERED_KWH);
    if (take <= EPS) break;
    given.set(b.id, take);
    left -= take;
  }
  return { given, made, litHouses };
}

/**
 * The steady flows of the settlement as it stands. With `open`, the storehouses are
 * treated as taking everything sent, full or not: that says what the settlement could
 * supply, which is what a waiting household is judged by.
 */
export function solve(state: SteadingState, open = false): Flows {
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const staff = assignWorkers(state);
  const power = sharePower(state);
  const cap = storeCap(state);
  const occupied = state.buildings.filter((b) => b.kind === "house" && b.occupied);

  // The households' daily take from the storehouses, for the houses within reach of one.
  const stores = state.buildings.filter((b) => b.kind === "storehouse");
  const served = occupied.filter((home) => stores.some((store) => distance(store, home) <= STORE_REACH));
  const houseTake: Amounts = {};
  for (const [good, each] of entries(HOUSE_TAKES)) houseTake[good] = each * served.length;

  const storeDemand = (good: GoodId) => (open || state.stock[good] < cap - EPS ? Number.POSITIVE_INFINITY : (houseTake[good] ?? 0));

  // Workplaces in the order the chains run: a building only takes from lower stages.
  const work = state.buildings
    .filter((b) => isWorkplace(b.kind))
    .sort((a, b) => KINDS[a.kind].stage - KINDS[b.kind].stage || a.id - b.id);
  const potential = new Map<number, number>();
  for (const b of work) {
    const need = KINDS[b.kind].workers;
    const crew = b.paused ? 0 : need === 0 ? 1 : (staff.get(b.id) ?? 0) / need;
    const boost = KINDS[b.kind].powered ? (power.given.get(b.id) ?? 0) / POWERED_KWH : 0;
    potential.set(b.id, crew * (1 + boost));
  }
  const routesFrom = new Map<number, Route[]>();
  for (const route of state.routes) {
    const from = byId.get(route.from);
    const to = byId.get(route.to);
    if (!from || !to || !takes(to, route.good) || !(recipeOf(from).outputs[route.good] ?? 0)) continue;
    const list = routesFrom.get(route.from) ?? [];
    list.push(route);
    routesFrom.set(route.from, list);
  }

  /** What a building would use of each input at its potential. */
  const fullNeed = (b: Building, good: GoodId) => (potential.get(b.id) ?? 0) * (recipeOf(b).inputs[good] ?? 0);
  let received = new Map<number, Amounts>();
  let roomShare = new Map<number, number>(work.map((b) => [b.id, 1]));
  // To start, every input is taken to be there in full.
  for (const b of work) {
    const all: Amounts = {};
    for (const [good] of entries(recipeOf(b).inputs)) all[good] = fullNeed(b, good);
    received.set(b.id, all);
  }

  let pace = new Map<number, number>();
  let flow = new Map<number, number>();
  let toYard = new Map<number, Amounts>();
  let storeIn: Amounts = {};

  for (let round = 0; round < 200; round += 1) {
    // What each building asks for of each input: as much as its other inputs and its room let it use.
    const demand = new Map<number, Amounts>();
    for (const b of work) {
      const inputs = entries(recipeOf(b).inputs);
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

    const nextReceived = new Map<number, Amounts>(work.map((b) => [b.id, {}]));
    const nextPace = new Map<number, number>();
    const nextRoom = new Map<number, number>();
    const nextFlow = new Map<number, number>();
    const nextYard = new Map<number, Amounts>();
    const nextStoreIn: Amounts = {};

    for (const b of work) {
      const { inputs, outputs } = recipeOf(b);
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
        for (const route of routesFrom.get(b.id) ?? []) {
          if (route.good !== good) continue;
          const to = byId.get(route.to) as Building;
          const asks = to.kind === "storehouse" ? (storeLeft[good] ?? 0) : (demand.get(to.id)?.[good] ?? 0) - (nextReceived.get(to.id)?.[good] ?? 0);
          const lane = Math.max(0, Math.min(MODES[route.mode].carries, asks));
          canPlace += lane;
          const sent = Math.min(lane, left);
          left -= sent;
          nextFlow.set(route.id, sent);
          if (sent <= 0) continue;
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
      power: power.given.get(b.id) ?? 0,
      pace: 0,
      uses: {},
      makes: {},
      toYard: {},
      limit: { kind: "full" },
    };
    buildings[b.id] = flowOf;
    if (!isWorkplace(b.kind)) continue;
    const { inputs, outputs } = recipeOf(b);
    const pot = potential.get(b.id) ?? 0;
    const share = pace.get(b.id) ?? 0;
    flowOf.pace = share * pot;
    for (const [good, perDay] of entries(inputs)) flowOf.uses[good] = share * pot * perDay;
    for (const [good] of entries(outputs)) {
      let sent = 0;
      for (const route of routesFrom.get(b.id) ?? []) if (route.good === good) sent += flow.get(route.id) ?? 0;
      const yard = toYard.get(b.id)?.[good] ?? 0;
      flowOf.toYard[good] = yard;
      flowOf.makes[good] = sent + yard;
    }
    flowOf.limit = limitOf(b, share, pot, received.get(b.id) ?? {}, fullNeed, roomShare.get(b.id) ?? 1, crew);
  }

  const store = {} as Flows["store"];
  for (const good of GOOD_IDS) {
    const inflow = storeIn[good] ?? 0;
    const toHouses = Math.min(inflow, houseTake[good] ?? 0);
    store[good] = { inflow, toHouses, toStock: state.stock[good] < cap - EPS || open ? inflow - toHouses : 0 };
  }

  const routes: Record<number, number> = {};
  for (const route of state.routes) routes[route.id] = flow.get(route.id) ?? 0;

  return { buildings, routes, store, households: households(state, store, power, served.length) };
}

function limitOf(
  b: Building,
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
  for (const [good] of entries(recipeOf(b).inputs)) {
    const full = fullNeed(b, good);
    const s = full > EPS ? (got[good] ?? 0) / full : 0;
    if (s < worstShare - 1e-9) {
      worst = good;
      worstShare = s;
    }
  }
  if (worst && worstShare <= room + 1e-9) return { kind: "input", good: worst };
  const out = entries(recipeOf(b).outputs)[0];
  if (out && pot > 0) return { kind: "room", good: out[0] };
  return need > 0 && crew < need ? { kind: "workers", have: crew, need } : { kind: "full" };
}

function households(state: SteadingState, store: Flows["store"], power: PowerShare, served: number): HouseholdsFlow {
  const houses = state.buildings.filter((b) => b.kind === "house");
  const occupied = houses.filter((b) => b.occupied);
  const water = waterFor(state, occupied);
  const waiting = houses
    .filter((b) => !b.occupied)
    .map((b) => ({ id: b.id, for: [] as HouseholdsFlow["waiting"][number]["for"] }));
  const breadIn = store.bread.inflow;
  const woodIn = store.firewood.inflow;
  return {
    people: occupied.length * HOUSEHOLD,
    houses: houses.length,
    occupied: occupied.length,
    waiting,
    water: { need: occupied.length * HOUSE_NEEDS.litres, supply: Math.min(water.reaching, occupied.length * HOUSE_NEEDS.litres) },
    food: {
      need: occupied.length * HOUSE_NEEDS.kcal,
      supply: Math.min(breadIn, (HOUSE_TAKES.bread ?? 0) * served) * (HOUSE_NEEDS.kcal / (HOUSE_TAKES.bread ?? 1)),
    },
    heat: {
      need: occupied.length * HOUSE_NEEDS.heatKwh,
      supply: Math.min(woodIn, (HOUSE_TAKES.firewood ?? 0) * served) * (HOUSE_NEEDS.heatKwh / (HOUSE_TAKES.firewood ?? 1)),
    },
    electricity: {
      need: occupied.length * HOUSE_NEEDS.electricityKwh,
      supply: occupied.reduce((sum, b) => sum + (power.given.get(b.id) ?? 0), 0),
      lit: power.litHouses,
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
  return { reaching: reachingWells.length * WELL_LITRES + worksLitres, reaches };
}

/**
 * Moves in every household whose house has water, food and firewood to hand: a well in
 * reach and a storehouse in reach, and enough coming in to feed and warm it as well as
 * those already there. Says what each house still waits for.
 */
function settle(state: SteadingState, at: number): { state: SteadingState; waiting: HouseholdsFlow["waiting"] } {
  let current = state;
  for (let pass = 0; pass < 200; pass += 1) {
    const flows = solve(current, true);
    const houses = current.buildings.filter((b) => b.kind === "house");
    const occupied = houses.filter((b) => b.occupied);
    const stores = current.buildings.filter((b) => b.kind === "storehouse");
    const water = waterFor(current, houses);
    let spareWater = water.reaching - occupied.length * HOUSE_NEEDS.litres;
    let spareBread = flows.store.bread.inflow - (HOUSE_TAKES.bread ?? 0) * occupied.length;
    let spareWood = flows.store.firewood.inflow - (HOUSE_TAKES.firewood ?? 0) * occupied.length;
    const waiting: HouseholdsFlow["waiting"] = [];
    let movedIn: number | null = null;
    for (const home of houses) {
      if (home.occupied) continue;
      const wants: HouseholdsFlow["waiting"][number]["for"] = [];
      if (!water.reaches(home)) wants.push("well");
      else if (spareWater < HOUSE_NEEDS.litres - EPS) wants.push("water");
      if (!stores.some((store) => distance(store, home) <= STORE_REACH)) wants.push("storehouse");
      else {
        if (spareBread < (HOUSE_TAKES.bread ?? 0) - EPS) wants.push("food");
        if (spareWood < (HOUSE_TAKES.firewood ?? 0) - EPS) wants.push("firewood");
      }
      if (wants.length === 0 && movedIn === null) {
        movedIn = home.id;
        spareWater -= HOUSE_NEEDS.litres;
        spareBread -= HOUSE_TAKES.bread ?? 0;
        spareWood -= HOUSE_TAKES.firewood ?? 0;
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
  mark("first-power", state.buildings.some((b) => b.kind === "wheel"));
  mark("first-track", state.routes.some((r) => r.mode === "track"));
  mark("first-trade", state.made.ore > 0);
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

/**
 * The settlement worked out to `now`. Time only adds: each stock and yard grows at its
 * rate until it is full, then that work rests. A clock earlier than the settlement's
 * changes nothing.
 */
export function advance(state: SteadingState, now: number): SteadingState {
  let current = settle(state, state.clock).state;
  if (!(now > current.clock)) return current;
  for (let step = 0; step < 10_000 && current.clock < now; step += 1) {
    const flows = solve(current);
    const cap = storeCap(current);
    // How long until the first thing fills.
    let until = (now - current.clock) / DAY_MS;
    for (const good of GOOD_IDS) {
      const rate = flows.store[good].toStock;
      if (rate > EPS && current.stock[good] < cap) until = Math.min(until, (cap - current.stock[good]) / rate);
    }
    for (const b of current.buildings) {
      for (const [good, rate] of entries(flows.buildings[b.id]?.toYard ?? {})) {
        const has = b.yard[good] ?? 0;
        if (rate > EPS && has < YARD_CAP) until = Math.min(until, (YARD_CAP - has) / rate);
      }
    }
    const days = Math.max(0, until);
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
      const yardRates = entries(f.toYard).filter(([good, rate]) => rate > EPS && (b.yard[good] ?? 0) < YARD_CAP);
      if (yardRates.length === 0) return b;
      const yard = { ...b.yard };
      for (const [good, rate] of yardRates) yard[good] = snap((yard[good] ?? 0) + rate * days, YARD_CAP);
      return { ...b, yard };
    });
    const clock = until >= (now - current.clock) / DAY_MS ? now : current.clock + days * DAY_MS;
    const traded = days > 0 && current.buildings.some((b) => b.kind === "landing" && entries(flows.buildings[b.id]?.makes ?? {}).some(([, n]) => n > EPS));
    current = { ...current, clock, stock, made, buildings };
    if (traded && current.milestones["first-trade"] === undefined) current = { ...current, milestones: { ...current.milestones, "first-trade": current.clock } };
    current = markMilestones(current, clock);
    current = settle(current, clock).state;
  }
  return { ...current, clock: Math.max(current.clock, now) };
}

/** A value grown towards its cap: exactly the cap once within a hair of it, never past it. */
const snap = (value: number, cap: number) => (value >= cap - 1e-7 ? Math.max(cap, Math.min(value, cap)) : value);

// ── Actions ─────────────────────────────────────────────────────────────────

export type SteadingAction =
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
  | { type: "buy"; good: GoodId; count: number };

export const scaled = (amounts: Amounts, times: number): Amounts => {
  const out: Amounts = {};
  for (const [good, n] of entries(amounts)) if (n * times > 0) out[good] = n * times;
  return out;
};

export function routeCost(mode: ModeId, length: number): Amounts {
  return scaled(MODES[mode].perSquare, length);
}

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

/** Why a building cannot stand on a square, or null when it can. */
export function siteProblem(state: SteadingState, kind: KindId, x: number, y: number): string | null {
  const ground = terrainAt(x, y);
  if (ground === null) return "That square is outside the valley.";
  if (ground !== "meadow") return "Buildings stand on meadow.";
  if (state.buildings.some((b) => b.x === x && b.y === y)) return "Something already stands there.";
  const def = KINDS[kind];
  if (peopleOf(state) < def.unlockAt) return `${def.name}s can be built once ${def.unlockAt} people live here.`;
  if (def.beside) {
    let near = false;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (terrainAt(x + dx, y + dy) === def.beside) near = true;
    if (!near) return `A ${def.name.toLowerCase()} must stand beside ${def.beside === "river" ? "the river" : def.beside === "coal" ? "the coal seam" : def.beside === "clay" ? "a clay bank" : def.beside}.`;
  }
  return null;
}

/** Why a route cannot be laid, or null. */
export function routeProblem(state: SteadingState, from: number, to: number, good: GoodId, mode: ModeId): string | null {
  const a = state.buildings.find((b) => b.id === from);
  const b = state.buildings.find((c) => c.id === to);
  if (!a || !b) return "That building is not there any more.";
  if (a.id === b.id) return "A building cannot send to itself.";
  if (!(recipeOf(a).outputs[good] ?? 0)) return `The ${KINDS[a.kind].name.toLowerCase()} does not make ${GOODS[good].name}.`;
  if (!takes(b, good)) return `The ${KINDS[b.kind].name.toLowerCase()} does not use ${GOODS[good].name}.`;
  if (KINDS[b.kind].stage <= KINDS[a.kind].stage && b.kind !== "storehouse") return "Things are sent on to a later step of the chain.";
  if (state.routes.some((r) => r.from === from && r.to === to && r.good === good)) return "That route is already laid.";
  if (peopleOf(state) < MODES[mode].unlockAt) return `Track can be laid once ${MODES[mode].unlockAt} people live here.`;
  if (distance(a, b) > MODES[mode].reach) return `${MODES[mode].name} reaches ${MODES[mode].reach} squares; that is ${distance(a, b)}.`;
  return null;
}

/**
 * The settlement after an action at `at` (the server's clock): first worked out to then,
 * then changed. An action that cannot be done throws a `SteadingRefusal` with words for
 * the person, and nothing changes.
 */
export function applyAction(state: SteadingState, action: SteadingAction, at: number): SteadingState {
  const now = advance(state, at);
  const next = act(now, action);
  const marked = markMilestones({ ...next, lastActionAt: now.clock }, now.clock);
  return settle(marked, now.clock).state;
}

function find(state: SteadingState, id: number): Building {
  return state.buildings.find((b) => b.id === id) ?? refuse("That building is not there any more.");
}

function act(state: SteadingState, action: SteadingAction): SteadingState {
  switch (action.type) {
    case "build": {
      const problem = siteProblem(state, action.kind, action.x, action.y);
      if (problem) refuse(problem);
      const stock = pay(state, KINDS[action.kind].cost);
      const building: Building = { id: state.nextId, kind: action.kind, x: action.x, y: action.y, paused: false, yard: {} };
      if (action.kind === "house") building.occupied = false;
      if (action.kind === "landing") building.contract = null;
      return { ...state, stock, nextId: state.nextId + 1, buildings: [...state.buildings, building] };
    }
    case "remove": {
      const b = find(state, action.id);
      if (b.kind === "house" && b.occupied) refuse("A household lives in that house, so it stays.");
      if (b.kind === "storehouse" && state.buildings.filter((c) => c.kind === "storehouse").length === 1)
        refuse("The settlement needs one storehouse; build another before taking this one down.");
      const gone = state.routes.filter((r) => r.from === b.id || r.to === b.id);
      let stock = giveBack(state.stock, KINDS[b.kind].cost);
      stock = giveBack(stock, b.yard);
      for (const route of gone) stock = giveBack(stock, routeCost(route.mode, routeLength(state, route)));
      return {
        ...state,
        stock,
        buildings: state.buildings.filter((c) => c.id !== b.id),
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
      if (length > MODES[action.mode].reach) refuse(`${MODES[action.mode].name} reaches ${MODES[action.mode].reach} squares; that is ${length}.`);
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
      const count = Math.floor(action.count);
      if (count < 1) refuse("Choose how many to sell.");
      if (state.stock[action.good] < count - EPS) refuse(`There are only ${Math.floor(state.stock[action.good])} ${GOODS[action.good].name} in the store.`);
      const room = CREDIT_CAP - state.credit;
      const selling = Math.min(count, Math.floor(room / GOODS[action.good].sells));
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
      if (price === null) refuse(`The barge does not bring ${GOODS[action.good].name}: the valley makes its own.`);
      const count = Math.floor(action.count);
      if (count < 1) refuse("Choose how many to buy.");
      const cost = count * (price as number);
      if (state.credit < cost) refuse(`That costs ${cost} credit; the landing holds ${Math.floor(state.credit)}.`);
      const made = state.milestones["first-trade"] === undefined ? { ...state.milestones, "first-trade": state.clock } : state.milestones;
      return {
        ...state,
        credit: state.credit - cost,
        stock: { ...state.stock, [action.good]: state.stock[action.good] + count },
        milestones: made,
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
    const lacking = problem ? null : short(state, KINDS[kind].cost);
    return { kind, problem: problem ?? (lacking ? `Needs ${Math.ceil(KINDS[kind].cost[lacking] ?? 0)} ${GOODS[lacking].name}.` : null) };
  });
}

/** Where a building's output can be sent: every building that takes it and is a later step, nearest first. */
export function destinationsFor(state: SteadingState, from: number, good: GoodId): Building[] {
  const a = state.buildings.find((b) => b.id === from);
  if (!a) return [];
  return state.buildings
    .filter((b) => b.id !== a.id && takes(b, good) && (b.kind === "storehouse" || KINDS[b.kind].stage > KINDS[a.kind].stage))
    .sort((p, q) => distance(a, p) - distance(a, q) || p.id - q.id);
}

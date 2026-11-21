/**
 * The Steading's words: amounts, what holds a building back, what an action did, and the
 * spoken name of each square of the valley.
 */
import {
  type Amounts,
  BELTS,
  type Building,
  type BuildingFlow,
  type Flows,
  GOODS,
  type GoodId,
  KINDS,
  LANDS,
  type Limit,
  MODES,
  type SteadingAction,
  type SteadingState,
  TERRAIN_NAMES,
  terrainAt,
  WORK_REACH,
  YARD_CAP,
} from "@outpost/shared/games/steading";
import { formatNumber } from "@/lib/utils";

/** A rate or a stock, as a person reads it: whole numbers, or one place for a small amount. */
export function amount(value: number): string {
  if (value > 0 && value < 10 && Math.abs(value - Math.round(value)) > 0.05) return formatNumber(Math.round(value * 10) / 10);
  return formatNumber(Math.round(value));
}

/** A stock as held: only whole things count. */
export const held = (value: number) => formatNumber(Math.floor(value + 1e-9));

/** "12 planks, 16 bricks and 4 stone". */
export function amountsWords(amounts: Amounts, round: (n: number) => string = amount): string {
  const parts = (Object.entries(amounts) as [GoodId, number][])
    .filter(([, n]) => n > 0)
    .map(([good, n]) => `${round(n)} ${GOODS[good].name}`);
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const kindName = (b: Building) => KINDS[b.kind].name;
export const lowerName = (b: Building) => KINDS[b.kind].name.toLowerCase();

/** "the sawmill at 3, 6": a building named with its square, columns and rows counted from 1. */
export const placeName = (b: Building) => `${lowerName(b)} at ${b.x + 1}, ${b.y + 1}`;

/** One sentence on what holds a building back, and what would help. */
export function limitWords(b: Building, flow: BuildingFlow | undefined, limit: Limit = flow?.limit ?? { kind: "full" }): string {
  switch (limit.kind) {
    case "full":
      return flow && flow.pace > 1.01
        ? flow.pace > 1.99
          ? "Working at full pace, twice as fast with power from the line."
          : "Working at full pace, and faster with what power the line can give."
        : "Working at full pace.";
    case "paused":
      return "Resting. It needs no one while it rests.";
    case "no-contract":
      return "No trade chosen yet: choose what the barge takes and brings.";
    case "workers":
      return limit.have === 0
        ? `No one lives within ${WORK_REACH} squares to work here: build a house nearby.`
        : `Short-handed: ${limit.have} of ${limit.need} workers live within ${WORK_REACH} squares.`;
    case "input":
      return `Waiting for ${GOODS[limit.good].name}: send more to it along a route.`;
    case "room": {
      const yard = b.yard[limit.good] ?? 0;
      return yard >= YARD_CAP - 1e-6
        ? `Its yard is full of ${GOODS[limit.good].name}: lay a route to send them on, or carry the yard to the store.`
        : `Sends on all the ${GOODS[limit.good].name} it can.`;
    }
  }
}

/** A short word or two for the plan's spoken names and the list of buildings. */
export function limitShort(limit: Limit): string {
  switch (limit.kind) {
    case "full":
      return "working";
    case "paused":
      return "resting";
    case "no-contract":
      return "no trade chosen";
    case "workers":
      return limit.have === 0 ? "no workers" : "short-handed";
    case "input":
      return `waiting for ${GOODS[limit.good].name}`;
    case "room":
      return `${GOODS[limit.good].name} piling up`;
  }
}

/** Whether a building is held back by anything (drawn with a mark on the plan). */
export const heldUp = (limit: Limit) => limit.kind !== "full" && limit.kind !== "paused";

/** What a house is doing, in a few words. */
export function houseShort(b: Building, flows: Flows): string {
  if (b.occupied) return "a household of four";
  const waiting = flows.households.waiting.find((w) => w.id === b.id);
  if (!waiting) return "empty";
  return `waiting for ${waitWords(waiting.for)}`;
}

const WAIT_WORDS = {
  well: "a well in reach",
  water: "more water",
  storehouse: "a storehouse in reach",
  food: "more bread",
  firewood: "more firewood",
} as const;

export function waitWords(wants: (keyof typeof WAIT_WORDS)[]): string {
  const words = wants.map((want) => WAIT_WORDS[want]);
  if (words.length <= 1) return words[0] ?? "nothing";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** The spoken name of a square: where it is, its ground, and what stands on it. */
export function groundName(state: SteadingState, x: number, y: number): string {
  const ground = terrainAt(state.map, x, y) ?? "meadow";
  return ground === "meadow" ? LANDS[state.map.land].ground : TERRAIN_NAMES[ground];
}

const WAY = { n: "north", e: "east", s: "south", w: "west" } as const;

/** "a roller belt heading east, carrying 24 a day" */
export function beltWords(state: SteadingState, flows: Flows, x: number, y: number): string | null {
  const belt = state.belts.find((b) => b.x === x && b.y === y);
  if (!belt) return null;
  const name = BELTS[belt.tier].name.toLowerCase();
  const way = belt.dir === "x" ? `${name} junction` : `${name} heading ${WAY[belt.dir]}`;
  const carries = flows.beltSquares[`${x},${y}`] ?? 0;
  return carries > 0 ? `${way}, carrying ${amount(carries)} a day` : `${way}, carrying nothing`;
}

export function squareName(state: SteadingState, flows: Flows, x: number, y: number): string {
  const where = `Column ${x + 1}, row ${y + 1}`;
  const b = state.buildings.find((c) => c.x === x && c.y === y);
  const ground = groundName(state, x, y);
  if (!b) {
    const belt = beltWords(state, flows, x, y);
    return belt ? `${where}, ${belt}` : `${where}, ${ground}`;
  }
  const flow = flows.buildings[b.id];
  const state_ = b.kind === "house" ? houseShort(b, flows) : flow && KINDS[b.kind].stage < 9 ? limitShort(flow.limit) : null;
  return [where, kindName(b), state_].filter(Boolean).join(", ");
}

/** What an action did, said once in the live region. */
export function doneWords(action: SteadingAction, before: SteadingState, after: SteadingState): string {
  const at = (id: number) => before.buildings.find((b) => b.id === id) ?? after.buildings.find((b) => b.id === id);
  switch (action.type) {
    case "build": {
      const built = after.buildings.at(-1);
      const moved = built?.kind === "house" && built.occupied ? " A household has moved in." : "";
      return `Built a ${KINDS[action.kind].name.toLowerCase()}.${moved}`;
    }
    case "remove": {
      const b = at(action.id);
      return b ? `Took down the ${lowerName(b)}; everything it cost is back in the store.` : "Taken down.";
    }
    case "route": {
      const to = at(action.to);
      return `Laid a route: ${GOODS[action.good].name} go to the ${to ? lowerName(to) : "building"} ${MODES[action.mode].name.toLowerCase()}.`;
    }
    case "changeRoute":
      return `The route is now ${MODES[action.mode].name.toLowerCase()}.`;
    case "removeRoute":
      return "Took up the route.";
    case "routeFirst":
      return "That route is now filled first.";
    case "pause":
      return action.paused ? "Resting it." : "Back at work.";
    case "contract":
      return action.contract ? "The barge has its orders." : "The barge has no orders.";
    case "clearYard":
      return "Carried the yard to the store.";
    case "sell":
      return `Sold ${formatNumber(action.count)} ${GOODS[action.good].name} to the barge.`;
    case "buy":
      return `Bought ${formatNumber(action.count)} ${GOODS[action.good].name} from the barge.`;
    case "found":
      return `Founded a settlement: ${LANDS[action.land].name.toLowerCase()}, seed ${action.seed}.`;
    case "belts":
      return `Laid ${action.squares.length} ${action.squares.length === 1 ? "square" : "squares"} of ${BELTS[action.tier].name.toLowerCase()}.`;
    case "removeBelts":
      return "Took up the belt; what it cost is back in the store.";
    case "fillTank":
      return "Filled the generator's tank from the store.";
  }
}

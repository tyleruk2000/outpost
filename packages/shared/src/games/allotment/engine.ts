/**
 * The allotment's engine. Pure: there is no clock in here, so every function is given
 * `now` in milliseconds, and the server, which is the authority, stamps each action with
 * its own. The web app calls `advance` too, but only to draw growth between fetches.
 *
 * Nothing in here can be lost by waiting. Growth is kept as effective milliseconds of
 * growth per bed, capped at the crop's time (ripe), so a ripe crop waits for ever; the
 * hens, the hive and the tree stop at a small cap; time never runs backwards (a clock
 * that jumps back changes nothing, it never un-grows).
 */
import {
  BASKET_CAP,
  bedPrice,
  COIN_CAP,
  COMPOST_BONUS,
  COMPOST_CAP,
  COUNT_CAP,
  CROP_IDS,
  CROPS,
  type CropId,
  DAY,
  GLASS_BEDS,
  IN_SEASON_RATE,
  ITEM_IDS,
  type ItemId,
  itemPrice,
  KEEPING_IDS,
  KEEPING_NAMES,
  type KeepingId,
  MAX_OPEN_BEDS,
  PRODUCER,
  PRODUCERS,
  type ProducerId,
  type Season,
  START_BEDS,
  START_COINS,
  THING_IDS,
  THINGS,
  type ThingId,
  WATERED_RATE,
} from "./numbers.ts";

export type Hemisphere = "north" | "south";
export type HemisphereSetting = "auto" | Hemisphere;
export const HEMISPHERE_SETTINGS = ["auto", "north", "south"] as const;

export interface Bed {
  crop: CropId | null;
  /** Effective milliseconds of growth so far, at most the crop's time. */
  grown: number;
  watered: boolean;
  /** Sown with compost: the harvest gives `COMPOST_BONUS` more. */
  composted: boolean;
  sownAt: number | null;
}

export interface CropRecord {
  harvests: number;
  produce: number;
  /** When it was first harvested, or null. */
  firstAt: number | null;
}

export const MILESTONE_IDS = [
  "firstHarvest",
  "tenHarvests",
  "hundredHarvests",
  "everyCrop",
  "allBeds",
  "everyThing",
  "thousandCoins",
  "aYear",
] as const;
export type MilestoneId = (typeof MILESTONE_IDS)[number];

export const MILESTONES: Record<MilestoneId, string> = {
  firstHarvest: "The first harvest.",
  tenHarvests: "Ten harvests.",
  hundredHarvests: "A hundred harvests.",
  everyCrop: "Every crop grown at least once.",
  allBeds: "All 12 beds dug.",
  everyThing: "Every lasting thing from the stall.",
  thousandCoins: "1,000 coins earned in all.",
  aYear: "A year since the plot was started.",
};

export interface AllotmentState {
  v: 1;
  startedAt: number;
  /** The moment the plot has been advanced to. Never moves backwards. */
  clock: number;
  lastActionAt: number;
  hemisphere: HemisphereSetting;
  coins: number;
  /** The open beds, 4 to 12; actions name them 0 to 11. */
  beds: Bed[];
  /** The two beds under glass, once there is a greenhouse; actions name them 12 and 13. */
  glassBeds: Bed[];
  things: Record<ThingId, boolean>;
  compost: number;
  /** Milliseconds towards the next egg, jar or apple. */
  producing: Record<ProducerId, number>;
  waiting: Record<KeepingId, number>;
  basket: Record<ItemId, number>;
  almanac: { crops: Record<CropId, CropRecord>; harvests: number; coinsEarned: number };
  /** When each milestone was reached. */
  milestones: Partial<Record<MilestoneId, number>>;
}

export type AllotmentAction =
  | { type: "sow"; bed: number; crop: CropId }
  | { type: "water"; bed: number }
  | { type: "harvest"; bed: number }
  | { type: "harvestAll" }
  | { type: "collect"; thing?: ProducerId }
  | { type: "sell"; item: ItemId; count: number | "all" }
  | { type: "sellAll" }
  | { type: "buyBed" }
  | { type: "buy"; thing: ThingId }
  | { type: "setHemisphere"; hemisphere: HemisphereSetting };

/** An action that cannot be done, with a message for a person. Nothing is changed. */
export class AllotmentRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllotmentRefusal";
  }
}

export const FIRST_GLASS_BED = MAX_OPEN_BEDS;
export const MAX_BED_INDEX = MAX_OPEN_BEDS + GLASS_BEDS - 1;

const YEAR = 365 * DAY;
const number = (value: number) => value.toLocaleString("en-GB");
const count = (n: number, one: string, many = `${one}s`) => `${number(n)} ${n === 1 ? one : many}`;

const emptyBed = (): Bed => ({ crop: null, grown: 0, watered: false, composted: false, sownAt: null });
const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

export function newAllotment(now: number): AllotmentState {
  return {
    v: 1,
    startedAt: now,
    clock: now,
    lastActionAt: now,
    hemisphere: "auto",
    coins: START_COINS,
    beds: Array.from({ length: START_BEDS }, emptyBed),
    glassBeds: [],
    things: Object.fromEntries(THING_IDS.map((id) => [id, false])) as Record<ThingId, boolean>,
    compost: 0,
    producing: zeros(PRODUCERS),
    waiting: zeros(KEEPING_IDS),
    basket: zeros(ITEM_IDS),
    almanac: {
      crops: Object.fromEntries(CROP_IDS.map((id) => [id, { harvests: 0, produce: 0, firstAt: null }])) as Record<CropId, CropRecord>,
      harvests: 0,
      coinsEarned: 0,
    },
    milestones: {},
  };
}

const copy = (state: AllotmentState): AllotmentState => JSON.parse(JSON.stringify(state)) as AllotmentState;

// ── Seasons ────────────────────────────────────────────────────────────────

/** The season at a moment, from the UTC month: March to May is spring in the north, autumn in the south. */
export function seasonAt(now: number, hemisphere: Hemisphere): Season {
  const month = new Date(now).getUTCMonth();
  const shifted = hemisphere === "south" ? (month + 6) % 12 : month;
  if (shifted >= 2 && shifted <= 4) return "spring";
  if (shifted >= 5 && shifted <= 7) return "summer";
  if (shifted >= 8 && shifted <= 10) return "autumn";
  return "winter";
}

/** The start of the next UTC month after `t`: seasons only change there. */
function nextMonthStart(t: number): number {
  const date = new Date(t);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** Which hemisphere the plot uses, and why: its own setting, the home place's latitude, or the north by default. */
export function resolveHemisphere(
  setting: HemisphereSetting,
  homeLatitude: number | null,
): { hemisphere: Hemisphere; from: "setting" | "home place" | "default" } {
  if (setting !== "auto") return { hemisphere: setting, from: "setting" };
  if (homeLatitude !== null && Number.isFinite(homeLatitude))
    return { hemisphere: homeLatitude < 0 ? "south" : "north", from: "home place" };
  return { hemisphere: "north", from: "default" };
}

export function inSeason(crop: CropId, season: Season, underGlass = false): boolean {
  return underGlass || CROPS[crop].seasons.includes(season);
}

/** How fast a bed grows now: 1, ×1.25 in season, ×1.5 watered. */
export function growthRate(bed: Bed, season: Season, underGlass: boolean): number {
  if (!bed.crop) return 0;
  return (inSeason(bed.crop, season, underGlass) ? IN_SEASON_RATE : 1) * (bed.watered ? WATERED_RATE : 1);
}

// ── Time ───────────────────────────────────────────────────────────────────

function growBeds(beds: Bed[], underGlass: boolean, season: Season, ms: number) {
  for (const bed of beds) {
    if (!bed.crop) continue;
    const growMs = CROPS[bed.crop].growMs;
    if (bed.grown >= growMs) continue;
    bed.grown = Math.min(growMs, bed.grown + ms * growthRate(bed, season, underGlass));
  }
}

/**
 * The plot at `now`. Growth is integrated piecewise, split where the month (and so maybe
 * the season) changes, so a year away gives exactly what a year of small steps would.
 * A `now` before the plot's clock changes nothing.
 */
export function advance(state: AllotmentState, now: number, hemisphere: Hemisphere): AllotmentState {
  if (!Number.isFinite(now) || !(now > state.clock)) return state;
  const next = copy(state);
  let t = next.clock;
  while (t < now) {
    const end = Math.min(now, nextMonthStart(t));
    const season = seasonAt(t, hemisphere);
    growBeds(next.beds, false, season, end - t);
    growBeds(next.glassBeds, true, season, end - t);
    t = end;
  }
  const elapsed = now - next.clock;
  for (const producer of PRODUCERS) {
    if (!next.things[producer]) continue;
    const { gives, everyMs, cap } = PRODUCER[producer];
    const waiting = next.waiting[gives];
    if (waiting >= cap) {
      next.producing[producer] = 0;
      continue;
    }
    const progress = next.producing[producer] + elapsed;
    const made = Math.floor(progress / everyMs);
    if (waiting + made >= cap) {
      next.waiting[gives] = cap;
      next.producing[producer] = 0;
    } else {
      next.waiting[gives] = waiting + made;
      next.producing[producer] = progress - made * everyMs;
    }
  }
  next.clock = now;
  if (next.milestones.aYear === undefined && now - next.startedAt >= YEAR) next.milestones.aYear = next.startedAt + YEAR;
  return next;
}

// ── Beds ───────────────────────────────────────────────────────────────────

/** The indices of the beds the plot has: the open ones, then the two under glass. */
export function bedIndices(state: AllotmentState): number[] {
  const open = state.beds.map((_, index) => index);
  const glass = state.glassBeds.map((_, index) => FIRST_GLASS_BED + index);
  return [...open, ...glass];
}

export function bedAt(state: AllotmentState, index: number): Bed | null {
  if (!Number.isInteger(index)) return null;
  if (index >= FIRST_GLASS_BED) return state.glassBeds[index - FIRST_GLASS_BED] ?? null;
  return state.beds[index] ?? null;
}

export const isGlassBed = (index: number) => index >= FIRST_GLASS_BED;

/** "Bed 3", or "Greenhouse bed 1". */
export function bedName(index: number): string {
  return isGlassBed(index) ? `Greenhouse bed ${index - FIRST_GLASS_BED + 1}` : `Bed ${index + 1}`;
}

export type BedStage = "empty" | "sown" | "shoots" | "growing" | "ripe";

export function stageOf(bed: Bed): BedStage {
  if (!bed.crop) return "empty";
  const share = bed.grown / CROPS[bed.crop].growMs;
  if (share >= 1) return "ripe";
  if (share < 0.15) return "sown";
  if (share < 0.5) return "shoots";
  return "growing";
}

/** How long until a bed is ripe from `now`, through any change of season; 0 when ripe, null when empty. */
export function readyInMs(state: AllotmentState, index: number, hemisphere: Hemisphere): number | null {
  const bed = bedAt(state, index);
  if (!bed?.crop) return null;
  let left = CROPS[bed.crop].growMs - bed.grown;
  let t = state.clock;
  let ms = 0;
  // A crop takes at most a few days, so this loop runs once or twice.
  while (left > 0) {
    const end = nextMonthStart(t);
    const rate = growthRate(bed, seasonAt(t, hemisphere), isGlassBed(index));
    const can = (end - t) * rate;
    if (can >= left) return ms + left / rate;
    left -= can;
    ms += end - t;
    t = end;
  }
  return 0;
}

/** What is ready: the ripe beds and what is waiting to be collected. */
export function readyCounts(state: AllotmentState): { ripeBeds: number; waiting: Record<KeepingId, number> } {
  const ripeBeds = [...state.beds, ...state.glassBeds].filter((bed) => stageOf(bed) === "ripe").length;
  return { ripeBeds, waiting: { ...state.waiting } };
}

/** The price of the next bed, or null when all 12 are dug. */
export function nextBedPrice(state: AllotmentState): number | null {
  return state.beds.length >= MAX_OPEN_BEDS ? null : bedPrice(state.beds.length);
}

export function itemName(item: ItemId, n: number): string {
  if ((KEEPING_IDS as readonly string[]).includes(item)) {
    const names = KEEPING_NAMES[item as KeepingId];
    return n === 1 ? names.one : names.many;
  }
  const crop = CROPS[item as CropId];
  // Salad leaves, beetroot and squash are counted as they are said: "1 squash", "3 beetroot".
  if (n === 1)
    return (
      { radishes: "radish", salad: "salad leaf", peas: "pea pod", carrots: "carrot", potatoes: "potato", leeks: "leek" }[item as string] ??
      crop.name
    );
  return item === "peas" ? "pea pods" : crop.name;
}

// ── Actions ────────────────────────────────────────────────────────────────

function needBed(state: AllotmentState, index: number): Bed {
  const bed = bedAt(state, index);
  if (!bed) {
    if (isGlassBed(index)) throw new AllotmentRefusal("The greenhouse beds come with the greenhouse, at the stall.");
    throw new AllotmentRefusal(`There is no ${bedName(index).toLowerCase()} yet: more beds are at the stall.`);
  }
  return bed;
}

function pay(state: AllotmentState, price: number, what: string) {
  if (state.coins < price) throw new AllotmentRefusal(`${what} costs ${count(price, "coin")}; you have ${number(state.coins)}.`);
  state.coins -= price;
}

const capCount = (n: number) => Math.min(COUNT_CAP, n);

/** Harvests one ripe bed into the basket, or says why not. */
function harvestBed(state: AllotmentState, index: number, now: number) {
  const bed = needBed(state, index);
  if (!bed.crop) throw new AllotmentRefusal(`${bedName(index)} has nothing in it to harvest.`);
  const crop = CROPS[bed.crop];
  if (bed.grown < crop.growMs) throw new AllotmentRefusal(`The ${crop.name} in ${bedName(index).toLowerCase()} are not ripe yet.`);
  const gives = crop.yield + (bed.composted ? COMPOST_BONUS : 0);
  if (state.basket[crop.id] + gives > BASKET_CAP)
    throw new AllotmentRefusal(`The basket holds ${number(state.basket[crop.id])} ${crop.name} already: sell some first.`);
  state.basket[crop.id] += gives;
  const record = state.almanac.crops[crop.id];
  record.harvests = capCount(record.harvests + 1);
  record.produce = capCount(record.produce + gives);
  record.firstAt ??= now;
  state.almanac.harvests = capCount(state.almanac.harvests + 1);
  if (state.things.compostBin) state.compost = Math.min(COMPOST_CAP, state.compost + 1);
  Object.assign(bed, emptyBed());
}

/** Moves what is waiting from one producer into the basket, as much as fits. Returns how many moved. */
function collectFrom(state: AllotmentState, producer: ProducerId): number {
  const { gives } = PRODUCER[producer];
  const moved = Math.min(state.waiting[gives], BASKET_CAP - state.basket[gives]);
  state.waiting[gives] -= moved;
  state.basket[gives] += moved;
  return moved;
}

/** Sells up to `want` of an item, as many as the coin box has room for. Returns how many sold. */
function sellItem(state: AllotmentState, item: ItemId, want: number): number {
  const price = itemPrice(item);
  const sold = Math.min(want, state.basket[item], Math.floor((COIN_CAP - state.coins) / price));
  state.basket[item] -= sold;
  state.coins += sold * price;
  state.almanac.coinsEarned = capCount(state.almanac.coinsEarned + sold * price);
  return sold;
}

function noteMilestones(state: AllotmentState, now: number) {
  const reach = (id: MilestoneId, reached: boolean) => {
    if (reached && state.milestones[id] === undefined) state.milestones[id] = now;
  };
  const { harvests, coinsEarned, crops } = state.almanac;
  reach("firstHarvest", harvests >= 1);
  reach("tenHarvests", harvests >= 10);
  reach("hundredHarvests", harvests >= 100);
  reach(
    "everyCrop",
    CROP_IDS.every((id) => crops[id].harvests > 0),
  );
  reach("allBeds", state.beds.length >= MAX_OPEN_BEDS);
  reach(
    "everyThing",
    THING_IDS.every((id) => state.things[id]),
  );
  reach("thousandCoins", coinsEarned >= 1000);
}

/**
 * Applies one action at `now`: the plot is advanced first, then changed. A refused action
 * throws `AllotmentRefusal` and changes nothing. Every action counts as the household
 * having been there, which ends the "you were away" line.
 */
export function applyAction(state: AllotmentState, action: AllotmentAction, now: number, hemisphere: Hemisphere): AllotmentState {
  const at = Math.max(now, state.clock);
  const next = copy(advance(state, at, hemisphere));
  switch (action.type) {
    case "sow": {
      const bed = needBed(next, action.bed);
      const crop = CROPS[action.crop];
      if (!crop) throw new AllotmentRefusal("That is not a crop the stall has seed for.");
      if (bed.crop) throw new AllotmentRefusal(`That bed already has ${CROPS[bed.crop].name} in it.`);
      if (crop.seed > 0) pay(next, crop.seed, `${crop.name[0]!.toUpperCase()}${crop.name.slice(1)} seed`);
      const composted = next.compost > 0;
      if (composted) next.compost -= 1;
      Object.assign(bed, { crop: crop.id, grown: 0, watered: next.things.waterButt, composted, sownAt: at });
      break;
    }
    case "water": {
      const bed = needBed(next, action.bed);
      if (!bed.crop) throw new AllotmentRefusal(`${bedName(action.bed)} has nothing sown in it to water.`);
      if (bed.watered) throw new AllotmentRefusal(`${bedName(action.bed)} has been watered already.`);
      if (stageOf(bed) === "ripe")
        throw new AllotmentRefusal(`The ${CROPS[bed.crop].name} in ${bedName(action.bed).toLowerCase()} are ripe already.`);
      bed.watered = true;
      break;
    }
    case "harvest":
      harvestBed(next, action.bed, at);
      break;
    case "harvestAll": {
      const ripe = bedIndices(next).filter((index) => stageOf(bedAt(next, index)!) === "ripe");
      if (ripe.length === 0) throw new AllotmentRefusal("Nothing is ripe yet.");
      let done = 0;
      let refusal: AllotmentRefusal | null = null;
      for (const index of ripe) {
        try {
          harvestBed(next, index, at);
          done += 1;
        } catch (error) {
          if (!(error instanceof AllotmentRefusal)) throw error;
          refusal ??= error;
        }
      }
      // Only a full basket stops a bed; when it stops all of them, say so.
      if (done === 0 && refusal) throw refusal;
      break;
    }
    case "collect": {
      const from = action.thing ? [action.thing] : PRODUCERS.filter((producer) => next.things[producer]);
      if (action.thing) {
        const producer = action.thing;
        if (!PRODUCER[producer]) throw new AllotmentRefusal("That is not something that can be collected from.");
        const name = THINGS[producer].name;
        if (!next.things[producer]) throw new AllotmentRefusal(`There is no ${name.toLowerCase()} yet: it is at the stall.`);
        const gives = PRODUCER[producer].gives;
        if (next.waiting[gives] === 0) throw new AllotmentRefusal(`No ${KEEPING_NAMES[gives].many} are waiting yet.`);
      }
      const waiting = from.some((producer) => next.waiting[PRODUCER[producer].gives] > 0);
      if (!waiting) throw new AllotmentRefusal("Nothing is waiting to be collected.");
      const moved = from.reduce((sum, producer) => sum + collectFrom(next, producer), 0);
      if (moved === 0) throw new AllotmentRefusal("The basket is full of those already: sell some first.");
      break;
    }
    case "sell": {
      if (!(ITEM_IDS as readonly string[]).includes(action.item)) throw new AllotmentRefusal("That is not something the stall buys.");
      const have = next.basket[action.item];
      if (have === 0) throw new AllotmentRefusal(`There are no ${itemName(action.item, 2)} in the basket to sell.`);
      const want = action.count === "all" ? have : action.count;
      if (!Number.isInteger(want) || want < 1) throw new AllotmentRefusal("Say how many to sell, 1 or more.");
      if (want > have)
        throw new AllotmentRefusal(
          `The basket has ${count(have, itemName(action.item, 1), itemName(action.item, 2))}, not ${number(want)}.`,
        );
      if (sellItem(next, action.item, want) === 0) throw new AllotmentRefusal(`The coin box is full at ${number(COIN_CAP)} coins.`);
      break;
    }
    case "sellAll": {
      if (ITEM_IDS.every((item) => next.basket[item] === 0)) throw new AllotmentRefusal("The basket is empty.");
      const sold = ITEM_IDS.reduce((sum, item) => sum + sellItem(next, item, next.basket[item]), 0);
      if (sold === 0) throw new AllotmentRefusal(`The coin box is full at ${number(COIN_CAP)} coins.`);
      break;
    }
    case "buyBed": {
      const price = nextBedPrice(next);
      if (price === null) throw new AllotmentRefusal(`All ${MAX_OPEN_BEDS} beds are dug already.`);
      pay(next, price, "The next bed");
      next.beds.push(emptyBed());
      break;
    }
    case "buy": {
      const thing = THINGS[action.thing];
      if (!thing) throw new AllotmentRefusal("The stall does not sell that.");
      if (next.things[thing.id])
        throw new AllotmentRefusal(`The plot has ${thing.id === "hens" ? "hens" : `a ${thing.name.toLowerCase()}`} already.`);
      pay(next, thing.price, `The ${thing.name.toLowerCase()}`);
      next.things[thing.id] = true;
      if (thing.id === "greenhouse") next.glassBeds = Array.from({ length: GLASS_BEDS }, emptyBed);
      if ((PRODUCERS as readonly string[]).includes(thing.id)) next.producing[thing.id as ProducerId] = 0;
      break;
    }
    case "setHemisphere":
      if (!(HEMISPHERE_SETTINGS as readonly string[]).includes(action.hemisphere)) throw new AllotmentRefusal("That is not a hemisphere.");
      next.hemisphere = action.hemisphere;
      break;
    default:
      throw new AllotmentRefusal("That is not something that can be done on the plot.");
  }
  next.lastActionAt = at;
  noteMilestones(next, at);
  return next;
}

// ── Reading a stored plot ──────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
const isTime = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const hasCounts = (value: unknown, keys: readonly string[], max: number) =>
  isRecord(value) && keys.every((key) => isCount(value[key], max));

function isBed(value: unknown): value is Bed {
  if (!isRecord(value) || typeof value.watered !== "boolean" || typeof value.composted !== "boolean") return false;
  if (value.crop === null) return value.grown === 0 && value.sownAt === null;
  if (typeof value.crop !== "string" || !(CROP_IDS as readonly string[]).includes(value.crop)) return false;
  const grown = value.grown;
  return (
    typeof grown === "number" && Number.isFinite(grown) && grown >= 0 && grown <= CROPS[value.crop as CropId].growMs && isTime(value.sownAt)
  );
}

/**
 * A plot read back from storage, checked field by field, or null if any of it is not
 * sound. The server never silently replaces a plot that fails this: it says so.
 */
export function readAllotment(value: unknown): AllotmentState | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const v = value;
  if (![v.startedAt, v.clock, v.lastActionAt].every(isTime)) return null;
  if (!(HEMISPHERE_SETTINGS as readonly unknown[]).includes(v.hemisphere)) return null;
  if (!isCount(v.coins, COIN_CAP)) return null;
  if (!Array.isArray(v.beds) || v.beds.length < START_BEDS || v.beds.length > MAX_OPEN_BEDS || !v.beds.every(isBed)) return null;
  if (!isRecord(v.things) || !THING_IDS.every((id) => typeof (v.things as Record<string, unknown>)[id] === "boolean")) return null;
  const things = v.things as Record<ThingId, boolean>;
  if (!Array.isArray(v.glassBeds) || v.glassBeds.length !== (things.greenhouse ? GLASS_BEDS : 0) || !v.glassBeds.every(isBed)) return null;
  if (!isCount(v.compost, COMPOST_CAP)) return null;
  if (
    !isRecord(v.producing) ||
    !PRODUCERS.every(
      (id) =>
        isTime((v.producing as Record<string, unknown>)[id]) && ((v.producing as Record<string, number>)[id] ?? 0) < PRODUCER[id].everyMs,
    )
  )
    return null;
  if (
    !isRecord(v.waiting) ||
    !PRODUCERS.every((id) => isCount((v.waiting as Record<string, unknown>)[PRODUCER[id].gives], PRODUCER[id].cap))
  )
    return null;
  if (!hasCounts(v.basket, ITEM_IDS, BASKET_CAP)) return null;
  const almanac = v.almanac;
  if (!isRecord(almanac) || !isCount(almanac.harvests, COUNT_CAP) || !isCount(almanac.coinsEarned, COUNT_CAP) || !isRecord(almanac.crops))
    return null;
  const crops = almanac.crops;
  const soundRecord = (record: unknown) =>
    isRecord(record) &&
    isCount(record.harvests, COUNT_CAP) &&
    isCount(record.produce, COUNT_CAP) &&
    (record.firstAt === null || isTime(record.firstAt));
  if (!CROP_IDS.every((id) => soundRecord(crops[id]))) return null;
  if (
    !isRecord(v.milestones) ||
    !Object.entries(v.milestones).every(([key, at]) => (MILESTONE_IDS as readonly string[]).includes(key) && isTime(at))
  )
    return null;
  return value as unknown as AllotmentState;
}

/** What the server answers for the plot: as it is now on the server's clock. */
export interface AllotmentResponse {
  plot: AllotmentState;
  /** The server's clock when it answered, so a device with a wrong clock still draws growth right. */
  now: number;
  hemisphere: Hemisphere;
  hemisphereFrom: "setting" | "home place" | "default";
  season: Season;
  /** How long since the last action: the plot says so when it is more than 6 hours. 0 for a plot not yet started. */
  awayMs: number;
  /** Whether the plot is kept yet: a first visit is answered with a new plot that is not stored until the first action. */
  started: boolean;
}

/**
 * The allotment's engine. Pure: there is no clock in here, so every function is given
 * `now` in milliseconds, and the server, which is the authority, stamps each action with
 * its own. The web app calls `advance` too, but only to draw growth between fetches.
 *
 * A crop grows only while it is in its own months (`grows` in numbers.ts, the real
 * British months, moved on six for the south) and its bed is moist. Otherwise it waits,
 * keeping all the growth it has. A bed is moist while the watering can's water lasts,
 * and, if it is in the open, on a wet day and for a while after (longer with the water
 * butt). Whether a day is wet comes from the date alone. Under glass every month is in
 * season, but no rain falls.
 *
 * Nothing in here can be lost by waiting. Growth is kept as milliseconds of growth per
 * bed, capped at the crop's time (ripe), so a ripe crop waits for ever; nothing dries
 * out, wilts or goes back; the hens, the hive and the tree stop at a small cap; time
 * never runs backwards (a clock that jumps back changes nothing, it never un-grows).
 */
import {
  BASKET_CAP,
  BUTT_KEEPS_MS,
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
  ITEM_IDS,
  type ItemId,
  itemPrice,
  KEEPING_IDS,
  KEEPING_NAMES,
  type KeepingId,
  MAX_OPEN_BEDS,
  type Month,
  PRODUCER,
  PRODUCERS,
  type ProducerId,
  RAIN_CHANCE,
  RAIN_SOAKS_MS,
  type Season,
  START_BEDS,
  START_COINS,
  THING_IDS,
  THINGS,
  type ThingId,
  WATER_LASTS_MS,
} from "./numbers.ts";

export type Hemisphere = "north" | "south";
export type HemisphereSetting = "auto" | Hemisphere;
export const HEMISPHERE_SETTINGS = ["auto", "north", "south"] as const;

export interface Bed {
  crop: CropId | null;
  /** Milliseconds of growth so far, at most the crop's time. */
  grown: number;
  /** Watered with the can: moist until this moment (0 when never). */
  wetUntil: number;
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

/** The version of the stored plot. 1 was the first; 2 has water that runs out, rain and real seasons. */
export const ALLOTMENT_STATE_VERSION = 2;

export interface AllotmentState {
  v: 2;
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

const emptyBed = (): Bed => ({ crop: null, grown: 0, wetUntil: 0, composted: false, sownAt: null });
const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
const freshRecords = () =>
  Object.fromEntries(CROP_IDS.map((id) => [id, { harvests: 0, produce: 0, firstAt: null }])) as Record<CropId, CropRecord>;

export function newAllotment(now: number): AllotmentState {
  return {
    v: 2,
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
    almanac: { crops: freshRecords(), harvests: 0, coinsEarned: 0 },
    milestones: {},
  };
}

const copy = (state: AllotmentState): AllotmentState => JSON.parse(JSON.stringify(state)) as AllotmentState;

// ── Months and seasons ─────────────────────────────────────────────────────

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * The month at a moment as Britain has it, 1 to 12: the UTC month in the north, six on in
 * the south, so that a southern November counts as a British May. Every crop's months are
 * in these terms.
 */
export function monthAt(now: number, hemisphere: Hemisphere): Month {
  const month = new Date(now).getUTCMonth();
  return ((hemisphere === "south" ? (month + 6) % 12 : month) + 1) as Month;
}

/** The calendar month a British month falls in for this hemisphere: May is November in the south. */
export const calendarMonth = (month: Month, hemisphere: Hemisphere): Month =>
  (hemisphere === "south" ? ((month + 5) % 12) + 1 : month) as Month;

/** The season of a British month: March to May is spring. */
export function seasonOf(month: Month): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/** The season at a moment, from the UTC month: March to May is spring in the north, autumn in the south. */
export function seasonAt(now: number, hemisphere: Hemisphere): Season {
  return seasonOf(monthAt(now, hemisphere));
}

/** The start of the next UTC month after `t`: the months, and so the seasons, only change there. */
export function nextMonthStart(t: number): number {
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

/** Whether a crop grows in a British month: its own months in the open, every month under glass. */
export function inSeason(crop: CropId, month: Month, underGlass = false): boolean {
  return underGlass || CROPS[crop].grows.includes(month);
}

/** Whether a crop is sown (or planted) in a British month, by the RHS calendar. */
export const sowingMonth = (crop: CropId, month: Month) => CROPS[crop].sow.includes(month);

/** The next British month, after `month`, that the crop grows in; `month` itself if it grows all year. */
export function nextGrowingMonth(crop: CropId, month: Month): Month {
  for (let step = 1; step <= 12; step++) {
    const m = (((month - 1 + step) % 12) + 1) as Month;
    if (CROPS[crop].grows.includes(m)) return m;
  }
  return month;
}

/** The last month of the run of growing months that `month` is in. */
export function lastGrowingMonth(crop: CropId, month: Month): Month {
  let last = month;
  for (let step = 1; step < 12; step++) {
    const m = (((month - 1 + step) % 12) + 1) as Month;
    if (!CROPS[crop].grows.includes(m)) return last;
    last = m;
  }
  return last;
}

// ── Rain ───────────────────────────────────────────────────────────────────

/** A well-mixed 32-bit hash of a whole number (Chris Wellons's "lowbias32"), from 0 to 1. */
function unit(n: number): number {
  let x = (n ^ 0x5bd1e995) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4_294_967_296;
}

/**
 * Whether the UTC day numbered `day` (days since 1970) is wet on the plot. It comes from
 * the date alone, against that month's chance (`RAIN_CHANCE`, wetter in the household's
 * autumn and winter), so it is the same on every device, after any absence and after a
 * reload.
 */
export function wetDay(day: number, hemisphere: Hemisphere): boolean {
  const month = monthAt(day * DAY, hemisphere);
  return unit(day) < RAIN_CHANCE[month - 1]!;
}

/** Whether it is raining on the plot at a moment: all through a wet day. */
export const rainingAt = (now: number, hemisphere: Hemisphere) => wetDay(Math.floor(now / DAY), hemisphere);

/** How long a bed in the open stays moist after a wet day ends: longer with the water butt. */
export const soaksFor = (state: AllotmentState) => (state.things.waterButt ? BUTT_KEEPS_MS : RAIN_SOAKS_MS);

type Span = readonly [number, number];

/**
 * The stretches of [a, b) in which a bed is moist, in order and not overlapping: from the
 * can until `wetUntil`, and, in the open, from the start of each wet day until `soak`
 * after it ends.
 */
function moistSpans(a: number, b: number, wetUntil: number, open: boolean, soak: number, hemisphere: Hemisphere): Span[] {
  const spans: Span[] = [];
  let reach = a;
  const add = (start: number, end: number) => {
    const from = Math.max(start, reach);
    const to = Math.min(end, b);
    if (to <= from) return;
    const last = spans.at(-1);
    if (last && last[1] === from) spans[spans.length - 1] = [last[0], to];
    else spans.push([from, to]);
    reach = to;
  };
  // The can's water started before `a` or at it, so it comes first in order of start.
  if (wetUntil > a) add(a, wetUntil);
  if (open) {
    const first = Math.floor((a - soak) / DAY) - 1;
    const last = Math.floor((b - 1) / DAY);
    for (let day = first; day <= last; day++) {
      if (wetDay(day, hemisphere)) add(day * DAY, (day + 1) * DAY + soak);
    }
  }
  return spans;
}

const spanTotal = (spans: Span[]) => spans.reduce((sum, [from, to]) => sum + (to - from), 0);

// ── Time ───────────────────────────────────────────────────────────────────

function growBeds(beds: Bed[], open: boolean, month: Month, a: number, b: number, soak: number, hemisphere: Hemisphere) {
  for (const bed of beds) {
    if (!bed.crop || !inSeason(bed.crop, month, !open)) continue;
    const growMs = CROPS[bed.crop].growMs;
    if (bed.grown >= growMs) continue;
    bed.grown = Math.min(growMs, bed.grown + spanTotal(moistSpans(a, b, bed.wetUntil, open, soak, hemisphere)));
  }
}

/**
 * The plot at `now`. Growth is integrated exactly, month by month (the season can only
 * change at a month's start) and over the moist stretches inside each month, so a year
 * away gives exactly what a year of small steps would, wherever the beds dry and the rain
 * comes. A `now` before the plot's clock changes nothing.
 */
export function advance(state: AllotmentState, now: number, hemisphere: Hemisphere): AllotmentState {
  if (!Number.isFinite(now) || !(now > state.clock)) return state;
  const next = copy(state);
  const soak = soaksFor(next);
  let t = next.clock;
  while (t < now) {
    const end = Math.min(now, nextMonthStart(t));
    const month = monthAt(t, hemisphere);
    growBeds(next.beds, true, month, t, end, soak, hemisphere);
    growBeds(next.glassBeds, false, month, t, end, soak, hemisphere);
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

/** How far ahead the engine looks for the next rain or the next change: it never needs more. */
const LOOK_AHEAD_MS = 60 * DAY;

/** Why a bed is moist now: the can, the rain falling, the soil still wet from it, or the water butt. */
export type Moisture = "can" | "raining" | "rain" | "butt";

export interface BedNow {
  stage: BedStage;
  /** Why the soil is moist, or null when it is dry. */
  moist: Moisture | null;
  /** When the soil will next be dry, if it is moist now (within two months; null if not). */
  dryAt: number | null;
  /** When rain will next wet it, if it is dry and in the open (within two months). */
  rainAt: number | null;
  /** What a crop that is not ripe waits for, or null while it grows. Out of season, only the season will do. */
  waitsFor: "season" | "water" | null;
  /** The British month the crop grows again from, when it waits for its season. */
  resumes: Month | null;
}

/** What a bed is doing at the plot's clock: moist or dry and why, growing or waiting and for what. */
export function bedNow(state: AllotmentState, index: number, hemisphere: Hemisphere): BedNow {
  const bed = bedAt(state, index);
  const t = state.clock;
  const stage = bed ? stageOf(bed) : "empty";
  const none: BedNow = { stage, moist: null, dryAt: null, rainAt: null, waitsFor: null, resumes: null };
  if (!bed) return none;
  const open = !isGlassBed(index);
  const soak = soaksFor(state);
  const spans = moistSpans(t, t + LOOK_AHEAD_MS, bed.wetUntil, open, soak, hemisphere);
  const first = spans[0];
  const moistNow = first !== undefined && first[0] === t;
  let moist: Moisture | null = null;
  if (moistNow) {
    const day = Math.floor(t / DAY);
    if (open && wetDay(day, hemisphere)) moist = "raining";
    else if (bed.wetUntil > t) moist = "can";
    else if (open && wetDay(day - 1, hemisphere) && t < day * DAY + RAIN_SOAKS_MS) moist = "rain";
    else moist = state.things.waterButt ? "butt" : "rain";
  }
  const dryAt = moistNow ? (first[1] < t + LOOK_AHEAD_MS ? first[1] : null) : null;
  const wet = open ? spans.find(([from]) => from > t) : undefined;
  const rainAt = !moistNow && wet ? wet[0] : null;
  let waitsFor: BedNow["waitsFor"] = null;
  let resumes: Month | null = null;
  if (bed.crop && stage !== "ripe") {
    const month = monthAt(t, hemisphere);
    if (!inSeason(bed.crop, month, !open)) {
      waitsFor = "season";
      resumes = nextGrowingMonth(bed.crop, month);
    } else if (!moistNow) waitsFor = "water";
  }
  return { stage, moist, dryAt, rainAt, waitsFor, resumes };
}

/**
 * How long until a bed is ripe from the plot's clock, if nobody waters it again: through
 * the coming rain and any change of season. 0 when ripe; null when empty, or when it will
 * not ripen in the coming year without water (a dry bed under glass).
 */
export function readyInMs(state: AllotmentState, index: number, hemisphere: Hemisphere): number | null {
  const bed = bedAt(state, index);
  if (!bed?.crop) return null;
  let left = CROPS[bed.crop].growMs - bed.grown;
  if (left <= 0) return 0;
  const open = !isGlassBed(index);
  const soak = soaksFor(state);
  const horizon = state.clock + YEAR;
  for (let t = state.clock; t < horizon; ) {
    const end = Math.min(horizon, nextMonthStart(t));
    if (inSeason(bed.crop, monthAt(t, hemisphere), !open)) {
      for (const [from, to] of moistSpans(t, end, bed.wetUntil, open, soak, hemisphere)) {
        if (to - from >= left) return from + left - state.clock;
        left -= to - from;
      }
    }
    // Under glass nothing but the can wets a bed: once its water is used, it will not ripen alone.
    if (!open && bed.wetUntil <= end) return null;
    t = end;
  }
  return null;
}

/**
 * How long from the plot's clock until something on it changes that the screen should
 * show: a bed ripens, dries or is wetted, the rain starts or stops, the month turns, or an
 * egg, a jar or an apple is ready. Null if nothing will change within two months.
 */
export function untilChangeMs(state: AllotmentState, hemisphere: Hemisphere): number | null {
  const t = state.clock;
  let soonest = nextMonthStart(t) - t;
  const take = (at: number | null) => {
    if (at !== null && at > t) soonest = Math.min(soonest, at - t);
  };
  for (const index of bedIndices(state)) {
    const now = bedNow(state, index, hemisphere);
    take(now.dryAt);
    take(now.rainAt);
    if (now.stage !== "empty" && now.stage !== "ripe" && now.waitsFor === null) {
      const ready = readyInMs(state, index, hemisphere);
      if (ready !== null) take(t + ready);
    }
  }
  const day = Math.floor(t / DAY);
  if (wetDay(day, hemisphere) !== wetDay(day + 1, hemisphere)) take((day + 1) * DAY);
  for (const producer of PRODUCERS) {
    const { gives, everyMs, cap } = PRODUCER[producer];
    if (state.things[producer] && state.waiting[gives] < cap) take(t + everyMs - state.producing[producer]);
  }
  return soonest > LOOK_AHEAD_MS ? null : soonest;
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

const ONE: Partial<Record<CropId, string>> = {
  radishes: "radish",
  salad: "salad leaf",
  onions: "onion",
  peas: "pea pod",
  carrots: "carrot",
  kale: "bunch of kale",
  broadBeans: "broad bean pod",
  potatoes: "potato",
  leeks: "leek",
  garlic: "bulb of garlic",
};
const MANY: Partial<Record<CropId, string>> = {
  peas: "pea pods",
  kale: "bunches of kale",
  broadBeans: "broad bean pods",
  garlic: "bulbs of garlic",
};

export function itemName(item: ItemId, n: number): string {
  if ((KEEPING_IDS as readonly string[]).includes(item)) {
    const names = KEEPING_NAMES[item as KeepingId];
    return n === 1 ? names.one : names.many;
  }
  const crop = item as CropId;
  // Beetroot and squash are counted as they are said: "1 squash", "3 beetroot".
  if (n === 1) return ONE[crop] ?? CROPS[crop].name;
  return MANY[crop] ?? CROPS[crop].name;
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

/** Harvests one ripe bed into the basket, or says why not. The soil keeps its water. */
function harvestBed(state: AllotmentState, index: number, now: number) {
  const bed = needBed(state, index);
  if (!bed.crop) throw new AllotmentRefusal(`${bedName(index)} has nothing in it to harvest.`);
  const crop = CROPS[bed.crop];
  if (bed.grown < crop.growMs) throw new AllotmentRefusal(`The ${crop.name} in ${bedName(index).toLowerCase()} ${crop.be} not ripe yet.`);
  const gives = crop.yield + (bed.composted ? COMPOST_BONUS : 0);
  if (state.basket[crop.id] + gives > BASKET_CAP)
    throw new AllotmentRefusal(`The basket holds ${number(state.basket[crop.id])} ${itemName(crop.id, 2)} already: sell some first.`);
  state.basket[crop.id] += gives;
  const record = state.almanac.crops[crop.id];
  record.harvests = capCount(record.harvests + 1);
  record.produce = capCount(record.produce + gives);
  record.firstAt ??= now;
  state.almanac.harvests = capCount(state.almanac.harvests + 1);
  if (state.things.compostBin) state.compost = Math.min(COMPOST_CAP, state.compost + 1);
  Object.assign(bed, { ...emptyBed(), wetUntil: bed.wetUntil });
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
 * having been there, which ends the "you were away" line. Sowing out of season is never
 * refused: the seed waits in the ground for its months.
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
      Object.assign(bed, { crop: crop.id, grown: 0, composted, sownAt: at });
      break;
    }
    case "water": {
      const bed = needBed(next, action.bed);
      if (!bed.crop) throw new AllotmentRefusal(`${bedName(action.bed)} has nothing sown in it to water.`);
      if (stageOf(bed) === "ripe")
        throw new AllotmentRefusal(
          `The ${CROPS[bed.crop].name} in ${bedName(action.bed).toLowerCase()} ${CROPS[bed.crop].be} ripe already.`,
        );
      // Watering again tops it up: the bed is moist for the full time from now. Never refused.
      bed.wetUntil = Math.max(bed.wetUntil, at + WATER_LASTS_MS);
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

/** The crops of the first version of the plot (v1): every one of them is still grown. */
const V1_CROPS = ["radishes", "salad", "peas", "carrots", "beetroot", "potatoes", "leeks", "squash"] as const;
const V1_ITEMS = [...V1_CROPS, ...KEEPING_IDS] as const;

function isBed(value: unknown, version: 1 | 2, crops: readonly string[]): boolean {
  if (!isRecord(value) || typeof value.composted !== "boolean") return false;
  if (version === 1 ? typeof value.watered !== "boolean" : !isTime(value.wetUntil)) return false;
  if (value.crop === null) return value.grown === 0 && value.sownAt === null;
  if (typeof value.crop !== "string" || !crops.includes(value.crop)) return false;
  const grown = value.grown;
  return (
    typeof grown === "number" && Number.isFinite(grown) && grown >= 0 && grown <= CROPS[value.crop as CropId].growMs && isTime(value.sownAt)
  );
}

/** Whether a stored value is a sound plot of the given version, field by field. */
function sound(v: Record<string, unknown>, version: 1 | 2): boolean {
  const crops = version === 1 ? V1_CROPS : CROP_IDS;
  const items = version === 1 ? V1_ITEMS : ITEM_IDS;
  const bed = (value: unknown) => isBed(value, version, crops);
  if (![v.startedAt, v.clock, v.lastActionAt].every(isTime)) return false;
  if (!(HEMISPHERE_SETTINGS as readonly unknown[]).includes(v.hemisphere)) return false;
  if (!isCount(v.coins, COIN_CAP)) return false;
  if (!Array.isArray(v.beds) || v.beds.length < START_BEDS || v.beds.length > MAX_OPEN_BEDS || !v.beds.every(bed)) return false;
  if (!isRecord(v.things) || !THING_IDS.every((id) => typeof (v.things as Record<string, unknown>)[id] === "boolean")) return false;
  const things = v.things as Record<ThingId, boolean>;
  if (!Array.isArray(v.glassBeds) || v.glassBeds.length !== (things.greenhouse ? GLASS_BEDS : 0) || !v.glassBeds.every(bed)) return false;
  if (!isCount(v.compost, COMPOST_CAP)) return false;
  const producing = v.producing;
  if (!isRecord(producing) || !PRODUCERS.every((id) => isTime(producing[id]) && (producing[id] as number) < PRODUCER[id].everyMs))
    return false;
  const waiting = v.waiting;
  if (!isRecord(waiting) || !PRODUCERS.every((id) => isCount(waiting[PRODUCER[id].gives], PRODUCER[id].cap))) return false;
  const basket = v.basket;
  if (!isRecord(basket) || !items.every((key) => isCount(basket[key], BASKET_CAP))) return false;
  const almanac = v.almanac;
  if (!isRecord(almanac) || !isCount(almanac.harvests, COUNT_CAP) || !isCount(almanac.coinsEarned, COUNT_CAP) || !isRecord(almanac.crops))
    return false;
  const records = almanac.crops;
  const soundRecord = (record: unknown) =>
    isRecord(record) &&
    isCount(record.harvests, COUNT_CAP) &&
    isCount(record.produce, COUNT_CAP) &&
    (record.firstAt === null || isTime(record.firstAt));
  if (!crops.every((id) => soundRecord(records[id]))) return false;
  if (
    !isRecord(v.milestones) ||
    !Object.entries(v.milestones).every(([key, at]) => (MILESTONE_IDS as readonly string[]).includes(key) && isTime(at))
  )
    return false;
  return true;
}

/**
 * A plot of the first version brought into the current rules, losing nothing: every coin,
 * bed, thing bought, crop's growth, basket, almanac count and milestone is kept. A bed
 * that had been watered is moist for the full `WATER_LASTS_MS` from the plot's clock. The
 * new crops start with empty records. No crop was dropped, so nothing needs harvesting.
 */
function fromVersion1(old: Record<string, unknown>): AllotmentState {
  const clock = old.clock as number;
  const bed = (value: unknown): Bed => {
    const b = value as { crop: CropId | null; grown: number; watered: boolean; composted: boolean; sownAt: number | null };
    const wet = b.watered && b.crop !== null && b.grown < CROPS[b.crop].growMs;
    return { crop: b.crop, grown: b.grown, wetUntil: wet ? clock + WATER_LASTS_MS : 0, composted: b.composted, sownAt: b.sownAt };
  };
  const almanac = old.almanac as { crops: Record<string, CropRecord>; harvests: number; coinsEarned: number };
  const basket = old.basket as Record<string, number>;
  return {
    v: 2,
    startedAt: old.startedAt as number,
    clock,
    lastActionAt: old.lastActionAt as number,
    hemisphere: old.hemisphere as HemisphereSetting,
    coins: old.coins as number,
    beds: (old.beds as unknown[]).map(bed),
    glassBeds: (old.glassBeds as unknown[]).map(bed),
    things: Object.fromEntries(THING_IDS.map((id) => [id, (old.things as Record<string, boolean>)[id]])) as Record<ThingId, boolean>,
    compost: old.compost as number,
    producing: Object.fromEntries(PRODUCERS.map((id) => [id, (old.producing as Record<string, number>)[id]])) as Record<ProducerId, number>,
    waiting: Object.fromEntries(KEEPING_IDS.map((id) => [id, (old.waiting as Record<string, number>)[id] ?? 0])) as Record<
      KeepingId,
      number
    >,
    basket: Object.fromEntries(ITEM_IDS.map((id) => [id, basket[id] ?? 0])) as Record<ItemId, number>,
    almanac: {
      crops: Object.fromEntries(
        CROP_IDS.map((id) => {
          const record = almanac.crops[id];
          return [
            id,
            record
              ? { harvests: record.harvests, produce: record.produce, firstAt: record.firstAt }
              : { harvests: 0, produce: 0, firstAt: null },
          ];
        }),
      ) as Record<CropId, CropRecord>,
      harvests: almanac.harvests,
      coinsEarned: almanac.coinsEarned,
    },
    milestones: { ...(old.milestones as Partial<Record<MilestoneId, number>>) },
  };
}

/**
 * A plot read back from storage, checked field by field, or null if any of it is not
 * sound. A plot of the first version is brought into the current rules. The server never
 * silently replaces a plot that fails this: it says so.
 */
export function readAllotment(value: unknown): AllotmentState | null {
  if (!isRecord(value)) return null;
  if (value.v === 1) return sound(value, 1) ? fromVersion1(value) : null;
  if (value.v !== 2 || !sound(value, 2)) return null;
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

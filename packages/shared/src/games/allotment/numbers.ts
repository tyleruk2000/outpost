/**
 * The allotment's numbers: what each crop costs, how long it takes and what it sells for,
 * when it is sown and harvested, how long water lasts and how often it rains, the lasting
 * things at the stall, and the caps that keep every count small. All of them are here, so
 * that one can be changed without hunting for it.
 *
 * Two kinds of number live here, and the difference matters:
 *
 * - **Real:** the months each crop is sown, planted and harvested in Britain, from the
 *   Royal Horticultural Society's grow-your-own page for that crop (`CROP_SOURCES` in
 *   `notes.ts`, read on 17 November 2026; see docs/games.md). The game uses them as they
 *   are: a crop grows only in its own months.
 * - **Made up for the game:** how fast things grow (minutes to days, not months), the
 *   prices, how long water lasts, and how often it rains.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** In the order the stall lists them: quickest first. */
export const CROP_IDS = [
  "radishes",
  "salad",
  "onions",
  "peas",
  "carrots",
  "beetroot",
  "kale",
  "broadBeans",
  "potatoes",
  "leeks",
  "garlic",
  "squash",
] as const;
export type CropId = (typeof CROP_IDS)[number];

/** A month of the year, 1 for January to 12 for December, as it is in Britain. */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface Crop {
  id: CropId;
  /** The crop's name, lower case, as it is said in a sentence: "carrots", "kale". */
  name: string;
  /** "are" for carrots, "is" for kale and garlic: "The kale in bed 1 is not ripe yet." */
  be: "is" | "are";
  /** Milliseconds of growth to ripen: time in season with the bed moist. Made up. */
  growMs: number;
  /** Coins for the seed, paid at sowing. Made up. */
  seed: number;
  /** How many a harvest gives. Made up. */
  yield: number;
  /** Coins each, at the stall. Made up. */
  sells: number;
  /** The months it is sown, planted or planted out in Britain (the RHS calendar's rows together). Real. */
  sow: readonly Month[];
  /** The months it is harvested in Britain (RHS). Real. */
  harvest: readonly Month[];
  /**
   * The months it grows in the open in the game: from its earliest sowing to its last
   * harvest, for each way of growing it the RHS gives (so overwintering sowings carry it
   * through the winter). Taken from `sow` and `harvest`; a test checks that every one of
   * those months is in here.
   */
  grows: readonly Month[];
}

const ALL_YEAR: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const months = (from: Month, to: Month): Month[] => {
  const out: Month[] = [];
  for (let m = from; ; m = ((m % 12) + 1) as Month) {
    out.push(m);
    if (m === to) return out.sort((a, b) => a - b);
  }
};

export const CROPS: Record<CropId, Crop> = {
  // Salad radishes: sown March to September, ready four to six weeks later. The RHS
  // calendar also marks winter months, which are for winter radishes, a different kind.
  radishes: {
    id: "radishes",
    name: "radishes",
    be: "are",
    growMs: 4 * MINUTE,
    seed: 0,
    yield: 3,
    sells: 1,
    sow: months(3, 9),
    harvest: months(4, 10),
    grows: months(3, 10),
  },
  salad: {
    id: "salad",
    name: "salad leaves",
    be: "are",
    growMs: 25 * MINUTE,
    seed: 4,
    yield: 4,
    sells: 2,
    sow: months(2, 9),
    harvest: months(4, 12),
    grows: months(2, 12),
  },
  // From sets: spring sets for a summer crop, overwintering sets in autumn for an early one.
  onions: {
    id: "onions",
    name: "onions",
    be: "are",
    growMs: HOUR,
    seed: 0,
    yield: 3,
    sells: 2,
    sow: [...months(1, 4), ...months(8, 11)],
    harvest: months(6, 9),
    grows: ALL_YEAR,
  },
  peas: {
    id: "peas",
    name: "peas",
    be: "are",
    growMs: 2 * HOUR,
    seed: 10,
    yield: 5,
    sells: 4,
    sow: months(2, 6),
    harvest: months(6, 10),
    grows: months(2, 10),
  },
  carrots: {
    id: "carrots",
    name: "carrots",
    be: "are",
    growMs: 6 * HOUR,
    seed: 15,
    yield: 6,
    sells: 5,
    sow: months(2, 7),
    harvest: months(5, 11),
    grows: months(2, 11),
  },
  beetroot: {
    id: "beetroot",
    name: "beetroot",
    be: "are",
    growMs: 12 * HOUR,
    seed: 20,
    yield: 5,
    sells: 8,
    sow: months(3, 7),
    harvest: months(6, 10),
    grows: months(3, 10),
  },
  kale: {
    id: "kale",
    name: "kale",
    be: "is",
    growMs: 18 * HOUR,
    seed: 20,
    yield: 6,
    sells: 7,
    sow: months(3, 7),
    harvest: [...months(10, 12), ...months(1, 4)],
    grows: ALL_YEAR,
  },
  broadBeans: {
    id: "broadBeans",
    name: "broad beans",
    be: "are",
    growMs: DAY,
    seed: 25,
    yield: 6,
    sells: 9,
    sow: [...months(2, 5), 10, 11],
    harvest: months(5, 8),
    grows: months(10, 8),
  },
  potatoes: {
    id: "potatoes",
    name: "potatoes",
    be: "are",
    growMs: DAY,
    seed: 30,
    yield: 8,
    sells: 7,
    sow: months(3, 5),
    harvest: months(6, 10),
    grows: months(3, 10),
  },
  leeks: {
    id: "leeks",
    name: "leeks",
    be: "are",
    growMs: 2 * DAY,
    seed: 40,
    yield: 5,
    sells: 18,
    sow: months(2, 7),
    harvest: [...months(8, 12), ...months(1, 3)],
    grows: ALL_YEAR,
  },
  // Cloves, planted in autumn to have their spell of cold, or in late winter.
  garlic: {
    id: "garlic",
    name: "garlic",
    be: "is",
    growMs: 2.5 * DAY,
    seed: 35,
    yield: 6,
    sells: 16,
    sow: [2, 3, 10, 11, 12],
    harvest: months(5, 8),
    grows: months(10, 8),
  },
  // Tender: sown in April and May (the RHS starts them indoors), planted out in May and June.
  squash: {
    id: "squash",
    name: "squash",
    be: "are",
    growMs: 3 * DAY,
    seed: 60,
    yield: 3,
    sells: 45,
    sow: months(4, 6),
    harvest: months(7, 10),
    grows: months(4, 10),
  },
};

// ── Water and rain ───────────────────────────────────────────────────────
// Made up for the game, chosen so that someone who looks in once a day in season always
// finds something has happened, and someone who waters gets on clearly faster than
// someone who waits for the rain (docs/games.md has the figures).

/** A bed watered with the can stays moist this long. */
export const WATER_LASTS_MS = 12 * HOUR;
/** On a wet day it rains on the open beds all day (UTC), and the soil stays moist this long after. */
export const RAIN_SOAKS_MS = 12 * HOUR;
/** With the water butt, the open beds are kept watered this long after a wet day ends. */
export const BUTT_KEEPS_MS = 2 * DAY;

/**
 * The chance of a wet day in each month, January first, as the north has it: wetter in
 * autumn and winter, drier from April to July, roughly as in Britain. In the south the
 * months are moved on by six, as the seasons are. Whether a given day is wet comes from
 * the date alone, so it is the same on every device and after any absence.
 */
export const RAIN_CHANCE: readonly number[] = [0.45, 0.4, 0.35, 0.3, 0.3, 0.3, 0.3, 0.35, 0.35, 0.45, 0.5, 0.5];

// ── The plot and the stall ───────────────────────────────────────────────

export const START_COINS = 10;
export const START_BEDS = 4;
export const MAX_OPEN_BEDS = 12;
/** The beds under glass that come with the greenhouse. */
export const GLASS_BEDS = 2;
/** The 5th bed costs 25 coins, the 6th 50 … the 12th 225. */
export const bedPrice = (owned: number) => 25 * (owned - 3);

export const THING_IDS = ["waterButt", "compostBin", "hens", "beehive", "appleTree", "greenhouse"] as const;
export type ThingId = (typeof THING_IDS)[number];

export interface Thing {
  id: ThingId;
  /** "The water butt", as it starts a sentence. */
  name: string;
  price: number;
  /** What it does, in one plain sentence for the stall. */
  does: string;
}

export const THINGS: Record<ThingId, Thing> = {
  waterButt: {
    id: "waterButt",
    name: "Water butt",
    price: 40,
    does: "Fills when it rains, and keeps the open beds watered for 2 days after each wet day.",
  },
  compostBin: {
    id: "compostBin",
    name: "Compost bin",
    price: 80,
    does: "Each harvest makes a little compost; a bed sown with it gives 2 more.",
  },
  hens: { id: "hens", name: "Hens", price: 120, does: "An egg every 3 hours, up to 6 waiting. Eggs sell for 3 coins." },
  beehive: { id: "beehive", name: "Beehive", price: 200, does: "A jar of honey every 8 hours, up to 4 waiting. Honey sells for 12 coins." },
  appleTree: {
    id: "appleTree",
    name: "Apple tree",
    price: 300,
    does: "An apple every 6 hours, up to 12 waiting. Apples sell for 3 coins.",
  },
  greenhouse: {
    id: "greenhouse",
    name: "Greenhouse",
    price: 500,
    does: "Two more beds, under glass, where every crop grows all year. No rain falls in there: water them.",
  },
};

/** The compost bin: one per harvest, at most this many kept; a sowing with compost yields this many more. */
export const COMPOST_CAP = 8;
export const COMPOST_BONUS = 2;

/** What the hens, the hive and the tree give, how often, and how many wait at most. */
export const PRODUCERS = ["hens", "beehive", "appleTree"] as const;
export type ProducerId = (typeof PRODUCERS)[number];
export const KEEPING_IDS = ["eggs", "honey", "apples"] as const;
export type KeepingId = (typeof KEEPING_IDS)[number];

export const PRODUCER: Record<ProducerId, { gives: KeepingId; everyMs: number; cap: number; sells: number }> = {
  hens: { gives: "eggs", everyMs: 3 * HOUR, cap: 6, sells: 3 },
  beehive: { gives: "honey", everyMs: 8 * HOUR, cap: 4, sells: 12 },
  appleTree: { gives: "apples", everyMs: 6 * HOUR, cap: 12, sells: 3 },
};

/** Everything the basket can hold: each crop, and eggs, honey and apples. */
export const ITEM_IDS = [...CROP_IDS, ...KEEPING_IDS] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const KEEPING_NAMES: Record<KeepingId, { one: string; many: string }> = {
  eggs: { one: "egg", many: "eggs" },
  honey: { one: "jar of honey", many: "jars of honey" },
  apples: { one: "apple", many: "apples" },
};

export function itemPrice(item: ItemId): number {
  if (item === "eggs") return PRODUCER.hens.sells;
  if (item === "honey") return PRODUCER.beehive.sells;
  if (item === "apples") return PRODUCER.appleTree.sells;
  return CROPS[item].sells;
}

/** Caps, so that nothing overflows however long the plot is left. */
export const COIN_CAP = 999_999;
export const BASKET_CAP = 9_999;
export const COUNT_CAP = 999_999;

/** The last action longer ago than this, and the plot says how long you were away. */
export const AWAY_AFTER_MS = 6 * HOUR;

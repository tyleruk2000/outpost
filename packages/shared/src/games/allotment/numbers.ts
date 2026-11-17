/**
 * The allotment's numbers: what each crop costs, how long it takes and what it sells for,
 * the lasting things at the stall, and the caps that keep every count small. They are
 * made up for the game and are not growing advice. All of them are here, so that one
 * can be changed without hunting for it.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const CROP_IDS = ["radishes", "salad", "peas", "carrots", "beetroot", "potatoes", "leeks", "squash"] as const;
export type CropId = (typeof CROP_IDS)[number];

export interface Crop {
  id: CropId;
  /** The crop's name, plural and lower case, as it is said in a sentence: "carrots". */
  name: string;
  /** Effective milliseconds of growth to ripen. */
  growMs: number;
  /** Coins for the seed, paid at sowing. */
  seed: number;
  /** How many a harvest gives. */
  yield: number;
  /** Coins each, at the stall. */
  sells: number;
  /** The seasons it grows faster in. */
  seasons: readonly Season[];
}

export const CROPS: Record<CropId, Crop> = {
  radishes: { id: "radishes", name: "radishes", growMs: 4 * MINUTE, seed: 0, yield: 3, sells: 1, seasons: ["spring", "autumn"] },
  salad: { id: "salad", name: "salad leaves", growMs: 25 * MINUTE, seed: 4, yield: 4, sells: 2, seasons: ["spring", "summer"] },
  peas: { id: "peas", name: "peas", growMs: 2 * HOUR, seed: 10, yield: 5, sells: 4, seasons: ["summer"] },
  carrots: { id: "carrots", name: "carrots", growMs: 6 * HOUR, seed: 15, yield: 6, sells: 5, seasons: ["summer", "autumn"] },
  beetroot: { id: "beetroot", name: "beetroot", growMs: 12 * HOUR, seed: 20, yield: 5, sells: 8, seasons: ["autumn", "winter"] },
  potatoes: { id: "potatoes", name: "potatoes", growMs: DAY, seed: 30, yield: 8, sells: 7, seasons: ["spring", "summer"] },
  leeks: { id: "leeks", name: "leeks", growMs: 2 * DAY, seed: 40, yield: 5, sells: 18, seasons: ["autumn", "winter"] },
  squash: { id: "squash", name: "squash", growMs: 3 * DAY, seed: 60, yield: 3, sells: 45, seasons: ["summer", "autumn"] },
};

/** In season a crop grows this much faster; a watered bed this much. They multiply. */
export const IN_SEASON_RATE = 1.25;
export const WATERED_RATE = 1.5;

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
  waterButt: { id: "waterButt", name: "Water butt", price: 40, does: "Every new sowing starts watered." },
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
  greenhouse: { id: "greenhouse", name: "Greenhouse", price: 500, does: "Two more beds, under glass, where every crop is in season." },
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

/**
 * Every number in the Steading: the goods, the buildings and what each makes from what,
 * the routes things are carried along, the valley's ground, what a household uses in a
 * day, and the trade at the landing.
 *
 * What a household uses is real, from the figures Outpost already holds with their
 * sources (Supplies' food energy and water, USDA's figure for bread) and two read for
 * this game (Ofgem's typical household electricity and heating, Forest Research's
 * calorific value of logs). How fast things are made, what they cost and the prices at
 * the landing are made up for the game.
 */

/** A day in the settlement passes in an hour of ours: every rate in the game is per such day. */
export const DAY_MS = 60 * 60 * 1000;

// ── Goods ───────────────────────────────────────────────────────────────────

export const GOOD_IDS = [
  "logs",
  "stone",
  "clay",
  "grain",
  "planks",
  "firewood",
  "bricks",
  "flour",
  "bread",
  "coal",
  "ore",
  "iron",
  "tools",
] as const;
export type GoodId = (typeof GOOD_IDS)[number];

export interface Good {
  name: string;
  /** "a log", "a loaf": one of it, for sentences. */
  one: string;
  /** What the landing gives for one, in credit. */
  sells: number;
  /** What the landing asks for one, or null when it does not sell it. */
  buys: number | null;
}

export const GOODS: Record<GoodId, Good> = {
  logs: { name: "logs", one: "a log", sells: 1, buys: null },
  stone: { name: "stone", one: "a block of stone", sells: 1, buys: null },
  clay: { name: "clay", one: "a barrow of clay", sells: 1, buys: null },
  grain: { name: "grain", one: "a sack of grain", sells: 1, buys: null },
  planks: { name: "planks", one: "a plank", sells: 2, buys: null },
  firewood: { name: "firewood", one: "a bundle of firewood", sells: 2, buys: null },
  bricks: { name: "bricks", one: "a hod of bricks", sells: 2, buys: null },
  flour: { name: "flour", one: "a sack of flour", sells: 2, buys: null },
  bread: { name: "bread", one: "a loaf", sells: 3, buys: null },
  coal: { name: "coal", one: "a sack of coal", sells: 3, buys: 5 },
  ore: { name: "ore", one: "a basket of ore", sells: 4, buys: 6 },
  iron: { name: "iron", one: "a bar of iron", sells: 8, buys: 12 },
  tools: { name: "tools", one: "a set of tools", sells: 16, buys: 24 },
};

/** What a storehouse holds of each good; each one built adds as much again. */
export const STORE_CAP = 200;
/** What a building's own yard holds of each thing it makes, before it stops for want of room. */
export const YARD_CAP = 20;
/** The most credit the landing keeps for the settlement. */
export const CREDIT_CAP = 999_999;
/** The most a count of things made in all may reach. */
export const MADE_CAP = 999_999_999;

// ── The ground ──────────────────────────────────────────────────────────────

export const TERRAIN_IDS = ["meadow", "woods", "rock", "clay", "river", "hill", "coal"] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

export const TERRAIN_NAMES: Record<TerrainId, string> = {
  meadow: "meadow",
  woods: "woods",
  rock: "rock",
  clay: "clay bank",
  river: "river",
  hill: "fell",
  coal: "coal seam",
};

const TERRAIN_CHARS: Record<string, TerrainId> = {
  ".": "meadow",
  T: "woods",
  R: "rock",
  C: "clay",
  "~": "river",
  "^": "hill",
  K: "coal",
};

/**
 * Ashgill, the valley the settlement is in, west to east and north to south: woods on the
 * west side, a rock outcrop or two, clay banks along the river on the east, and a coal
 * seam in the fell at the head of the valley. There is no ore: it comes up the river.
 */
export const VALLEY_ROWS = [
  "TTT..^K^^~",
  "TT.....^.~",
  "T........~",
  "TT...RR..~",
  "T....R...~",
  "........C~",
  "T.......C~",
  "TT.......~",
  "T........~",
  ".........~",
  "T........~",
  "RR......C~",
  "R.......C~",
  "TT.......~",
] as const;

export const VALLEY_WIDTH = 10;
export const VALLEY_HEIGHT = VALLEY_ROWS.length;

export function terrainAt(x: number, y: number): TerrainId | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= VALLEY_WIDTH || y >= VALLEY_HEIGHT) return null;
  return TERRAIN_CHARS[VALLEY_ROWS[y]?.[x] ?? ""] ?? null;
}

/** Squares apart, a step to any of the eight neighbours counting one. */
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ── Buildings ───────────────────────────────────────────────────────────────

export const KIND_IDS = [
  "storehouse",
  "house",
  "well",
  "woodcutter",
  "quarry",
  "claypit",
  "field",
  "woodyard",
  "sawmill",
  "kiln",
  "mill",
  "bakery",
  "landing",
  "coalpit",
  "smelter",
  "smithy",
  "wheel",
  "waterworks",
] as const;
export type KindId = (typeof KIND_IDS)[number];

export type Amounts = Partial<Record<GoodId, number>>;

export interface Kind {
  name: string;
  /** One sentence: what it is for. */
  about: string;
  /** People it needs to work at full pace; 0 for one that needs nobody. */
  workers: number;
  /** What it uses in a day at full pace. */
  inputs: Amounts;
  /** What it makes in a day at full pace. */
  outputs: Amounts;
  cost: Amounts;
  /** Where it may stand: on meadow, and next to this ground (one of the eight squares round it). */
  beside: TerrainId | null;
  /** The people the settlement must have before it can be built. */
  unlockAt: number;
  /**
   * The order things are worked out in: a building takes only from buildings of a lower
   * stage, so the chains have no loops.
   */
  stage: number;
  /** Runs twice as fast with power from a water wheel in reach. */
  powered?: boolean;
}

export const KINDS: Record<KindId, Kind> = {
  storehouse: {
    name: "Storehouse",
    about: "Keeps what is sent to it for building and trade, and hands food and firewood to the households within reach.",
    workers: 0,
    inputs: {},
    outputs: {},
    cost: { planks: 20, stone: 10 },
    beside: null,
    unlockAt: 0,
    stage: 9,
  },
  house: {
    name: "House",
    about: "A home for a household of four. They move in once the house has water, food and firewood to hand.",
    workers: 0,
    inputs: {},
    outputs: {},
    cost: { planks: 12, bricks: 16, stone: 4 },
    beside: null,
    unlockAt: 0,
    stage: 9,
  },
  well: {
    name: "Well",
    about: "Draws water for the houses within reach.",
    workers: 0,
    inputs: {},
    outputs: {},
    cost: { stone: 6 },
    beside: null,
    unlockAt: 0,
    stage: 9,
  },
  woodcutter: {
    name: "Woodcutter",
    about: "Fells and logs timber from the woods beside it.",
    workers: 1,
    inputs: {},
    outputs: { logs: 24 },
    cost: {},
    beside: "woods",
    unlockAt: 0,
    stage: 0,
  },
  quarry: {
    name: "Quarry",
    about: "Cuts stone from the rock beside it.",
    workers: 1,
    inputs: {},
    outputs: { stone: 12 },
    cost: {},
    beside: "rock",
    unlockAt: 0,
    stage: 0,
  },
  claypit: {
    name: "Clay pit",
    about: "Digs clay from the bank beside it.",
    workers: 1,
    inputs: {},
    outputs: { clay: 16 },
    cost: {},
    beside: "clay",
    unlockAt: 0,
    stage: 0,
  },
  field: {
    name: "Field",
    about: "Grows grain. The year's harvest is kept in its barn and sent on steadily.",
    workers: 1,
    inputs: {},
    outputs: { grain: 20 },
    cost: {},
    beside: null,
    unlockAt: 0,
    stage: 0,
  },
  woodyard: {
    name: "Woodyard",
    about: "Saws and splits logs into firewood and stacks it to dry.",
    workers: 1,
    inputs: { logs: 12 },
    outputs: { firewood: 12 },
    cost: { logs: 6 },
    beside: null,
    unlockAt: 0,
    stage: 1,
  },
  sawmill: {
    name: "Sawmill",
    about: "Saws logs into planks.",
    workers: 2,
    inputs: { logs: 12 },
    outputs: { planks: 24 },
    cost: { stone: 8, logs: 6 },
    beside: null,
    unlockAt: 0,
    stage: 1,
    powered: true,
  },
  mill: {
    name: "Mill",
    about: "Grinds grain into flour.",
    workers: 1,
    inputs: { grain: 20 },
    outputs: { flour: 20 },
    cost: { stone: 10, planks: 10 },
    beside: null,
    unlockAt: 0,
    stage: 1,
    powered: true,
  },
  kiln: {
    name: "Brick kiln",
    about: "Fires clay into bricks, burning firewood.",
    workers: 2,
    inputs: { clay: 16, firewood: 4 },
    outputs: { bricks: 32 },
    cost: { stone: 10, planks: 6 },
    beside: null,
    unlockAt: 0,
    stage: 2,
  },
  bakery: {
    name: "Bakery",
    about: "Bakes flour into bread in a wood-fired oven.",
    workers: 2,
    inputs: { flour: 10, firewood: 4 },
    outputs: { bread: 20 },
    cost: { bricks: 12, planks: 6 },
    beside: null,
    unlockAt: 0,
    stage: 2,
  },
  landing: {
    name: "Landing",
    about: "Where the barge calls: sends a surplus downriver and brings back what the valley lacks.",
    workers: 1,
    inputs: {},
    outputs: {},
    cost: { planks: 30, stone: 20 },
    beside: "river",
    unlockAt: 12,
    stage: 3,
  },
  coalpit: {
    name: "Coal pit",
    about: "Digs coal from the seam beside it.",
    workers: 2,
    inputs: {},
    outputs: { coal: 12 },
    cost: { planks: 10, stone: 6 },
    beside: "coal",
    unlockAt: 12,
    stage: 0,
  },
  smelter: {
    name: "Smelter",
    about: "Smelts ore into iron with coal.",
    workers: 2,
    inputs: { ore: 8, coal: 8 },
    outputs: { iron: 8 },
    cost: { bricks: 30, stone: 20 },
    beside: null,
    unlockAt: 24,
    stage: 4,
  },
  smithy: {
    name: "Smithy",
    about: "Makes tools from iron and planks.",
    workers: 2,
    inputs: { iron: 4, planks: 4 },
    outputs: { tools: 4 },
    cost: { bricks: 20, planks: 10, iron: 4 },
    beside: null,
    unlockAt: 24,
    stage: 5,
    powered: true,
  },
  wheel: {
    name: "Water wheel",
    about: "Turns a generator in the river's flow, for the houses and workshops within reach.",
    workers: 0,
    inputs: {},
    outputs: {},
    cost: { planks: 30, stone: 10, iron: 6 },
    beside: "river",
    unlockAt: 24,
    stage: 9,
  },
  waterworks: {
    name: "Waterworks",
    about: "Pumps and pipes water to every house in the valley.",
    workers: 2,
    inputs: {},
    outputs: {},
    cost: { bricks: 40, stone: 30, iron: 10, tools: 6 },
    beside: "river",
    unlockAt: 40,
    stage: 9,
  },
};

/** The kinds that make something from something along routes (not houses, stores, wells or wheels). */
export const isWorkplace = (kind: KindId) => KINDS[kind].stage < 9;

/** Squares from home to work that a worker will walk. */
export const WORK_REACH = 4;
/** Squares from a house to the storehouse it takes its food and firewood from. */
export const STORE_REACH = 5;
/** Squares from a house to its well. */
export const WELL_REACH = 3;
/** Squares a water wheel's line reaches. */
export const WHEEL_REACH = 5;

/** People in each house. */
export const HOUSEHOLD = 4;
/** Water a well draws in a day, in litres (made up for the game). */
export const WELL_LITRES = 1_000;
/** Water the waterworks pumps in a day, in litres (made up for the game). */
export const WATERWORKS_LITRES = 6_000;
/** Electricity a water wheel makes in a day, in kWh (made up for the game). */
export const WHEEL_KWH = 120;
/** What a powered workshop draws in a day to run twice as fast, in kWh (made up for the game). */
export const POWERED_KWH = 40;

// ── Routes ──────────────────────────────────────────────────────────────────

export const MODE_IDS = ["hand", "cart", "track"] as const;
export type ModeId = (typeof MODE_IDS)[number];

export interface Mode {
  name: string;
  /** How far, in squares. */
  reach: number;
  /** What it carries in a day. */
  carries: number;
  /** What each square of it costs to lay. */
  perSquare: Amounts;
  unlockAt: number;
}

export const MODES: Record<ModeId, Mode> = {
  hand: { name: "By hand", reach: 3, carries: 12, perSquare: {}, unlockAt: 0 },
  cart: { name: "Cart road", reach: 8, carries: 40, perSquare: { planks: 1, stone: 1 }, unlockAt: 0 },
  track: { name: "Track", reach: 20, carries: 160, perSquare: { iron: 1, planks: 1 }, unlockAt: 40 },
};

// ── Trade at the landing ────────────────────────────────────────────────────

export const CONTRACT_IDS = ["planks-ore", "bricks-ore", "bread-ore", "grain-coal"] as const;
export type ContractId = (typeof CONTRACT_IDS)[number];

export interface Contract {
  name: string;
  /** What the landing sends downriver in a day at full pace, and what comes back. */
  inputs: Amounts;
  outputs: Amounts;
}

export const CONTRACTS: Record<ContractId, Contract> = {
  "planks-ore": { name: "Planks for ore", inputs: { planks: 24 }, outputs: { ore: 8 } },
  "bricks-ore": { name: "Bricks for ore", inputs: { bricks: 16 }, outputs: { ore: 8 } },
  "bread-ore": { name: "Bread for ore", inputs: { bread: 20 }, outputs: { ore: 8 } },
  "grain-coal": { name: "Grain for coal", inputs: { grain: 20 }, outputs: { coal: 8 } },
};

// ── What a household uses in a day: real figures ────────────────────────────

/**
 * Food energy for an adult, kcal a day: the middle of Public Health England's estimated
 * average requirements for ages 19 to 64, 2,500 (men) and 2,000 (women), the table
 * Supplies uses (Government Dietary Recommendations, 2016).
 */
export const KCAL_PER_PERSON = 2_250;
/**
 * A loaf is 800 g of white bread, at 266 kcal per 100 g (USDA FoodData Central, SR Legacy,
 * "Bread, white, commercially prepared", FDC 174924, the table Supplies uses).
 */
export const LOAF_GRAMS = 800;
export const BREAD_KCAL_PER_100G = 266;
export const KCAL_PER_LOAF = (LOAF_GRAMS / 100) * BREAD_KCAL_PER_100G;
/**
 * Water for drinking, cooking and basic hygiene, litres a person a day: the top of WHO's
 * 7.5 to 15 litres (Technical notes on drinking-water, sanitation and hygiene in
 * emergencies, note 9, 2013, table 9.1), the figure Supplies quotes.
 */
export const LITRES_PER_PERSON = 15;
/**
 * A typical British household's electricity and gas in a year, kWh: Ofgem's typical
 * domestic consumption values from 1 July 2026, medium use (electricity on a single-rate
 * meter 2,500; gas 9,500). The gas is what heats the home and its water and cooks; here
 * the household burns firewood for the same heat.
 */
export const HOUSEHOLD_ELECTRICITY_KWH_A_YEAR = 2_500;
export const HOUSEHOLD_HEAT_KWH_A_YEAR = 9_500;
/** Log wood, stacked and air dry (20% moisture): 4.1 kWh per kg (Forest Research, Typical calorific values of fuels). */
export const LOG_KWH_PER_KG = 4.1;
/** A bundle of firewood weighs 10 kg (the game's measure). */
export const BUNDLE_KG = 10;
export const KWH_PER_BUNDLE = BUNDLE_KG * LOG_KWH_PER_KG;

/** What one house of four uses in a day. */
export const HOUSE_NEEDS = {
  kcal: HOUSEHOLD * KCAL_PER_PERSON,
  litres: HOUSEHOLD * LITRES_PER_PERSON,
  heatKwh: HOUSEHOLD_HEAT_KWH_A_YEAR / 365,
  electricityKwh: HOUSEHOLD_ELECTRICITY_KWH_A_YEAR / 365,
} as const;
/** The same in goods: loaves and bundles a house takes from the storehouse in a day. */
export const HOUSE_TAKES: Amounts = {
  bread: HOUSE_NEEDS.kcal / KCAL_PER_LOAF,
  firewood: HOUSE_NEEDS.heatKwh / KWH_PER_BUNDLE,
};

export const NEED_SOURCES = [
  {
    what: "Food energy",
    says: "2,000 kcal a day for a woman and 2,500 for a man aged 19 to 64; the game takes the middle, 2,250.",
    from: "Public Health England, Government Dietary Recommendations (2016), tables 1 and 2",
  },
  {
    what: "Bread",
    says: "White bread holds 266 kcal in 100 g, so the game's 800 g loaf holds 2,128 kcal.",
    from: "USDA FoodData Central, SR Legacy (April 2018), Bread, white, commercially prepared",
  },
  {
    what: "Water",
    says: "7.5 to 15 litres a person a day for drinking, cooking and basic hygiene; the game takes 15.",
    from: "WHO, Technical notes on drinking-water, sanitation and hygiene in emergencies, note 9 (2013), table 9.1",
  },
  {
    what: "Heat and electricity",
    says: "A typical household in Great Britain uses 9,500 kWh of gas and 2,500 kWh of electricity a year (medium use, from 1 July 2026).",
    from: "Ofgem, Review of typical domestic consumption values: decision (27 May 2026), table 1",
  },
  {
    what: "Firewood",
    says: "Stacked, air-dry log wood gives 4.1 kWh per kilogram; house coal 7.5 to 8.6.",
    from: "Forest Research, Typical calorific values of fuels (read 21 Nov 2026)",
  },
] as const;

// ── Milestones ──────────────────────────────────────────────────────────────

export const MILESTONE_IDS = [
  "first-household",
  "people-12",
  "people-24",
  "people-40",
  "people-64",
  "people-100",
  "first-trade",
  "first-iron",
  "first-tools",
  "first-power",
  "first-track",
] as const;
export type MilestoneId = (typeof MILESTONE_IDS)[number];

export const MILESTONE_NAMES: Record<MilestoneId, string> = {
  "first-household": "A new household moved in",
  "people-12": "12 people: the landing and the coal pit can be built",
  "people-24": "24 people: the smelter, the smithy and the water wheel",
  "people-40": "40 people: track and the waterworks",
  "people-64": "64 people",
  "people-100": "100 people",
  "first-trade": "The first barge came up the river",
  "first-iron": "The first iron smelted",
  "first-tools": "The first tools made",
  "first-power": "The first power from the river",
  "first-track": "The first track laid",
};

/** The people at which the larger works are unlocked, in order. */
export const UNLOCK_STEPS = [12, 24, 40] as const;

/**
 * Garden (under Tools): what to sow, plant and harvest in a month in the UK, moved for the
 * household's own last frost, and the household's record of what it sowed.
 *
 * The months are the Royal Horticultural Society's: the "Sow", "Plant" or "Plant out" and
 * "Harvest" rows of the calendar on each crop's grow-your-own page, read on 21 November
 * 2026 (docs/garden.md lists the pages). The Allotment game holds the same calendar with
 * sowing and planting together (`CROPS` in games/allotment/numbers.ts); a server test
 * holds the two to each other. The words about frost are the RHS's advice in Outpost's
 * own words.
 *
 * How the last frost moves the calendar, and nothing more: the RHS says to plant tender
 * crops out only after the last frost. With a last-frost date set, a tender crop's
 * planting months are kept back until the day after it. A last frost earlier than the
 * RHS months does not bring planting forward, because the RHS gives no rule for that.
 * Sowing and harvest months, and every hardy crop, stay as the RHS gives them.
 */
import { CROP_NOTES } from "./games/allotment/notes.ts";
import type { CropId, Month } from "./games/allotment/numbers.ts";

/** A month, 1 for January to 12 for December. */
export type CalendarMonth = Month;

/** Where the calendar is from, as the screen says it. */
export const GARDEN_CALENDAR_SOURCE = {
  name: "Royal Horticultural Society, Grow your own: the calendar on each crop's page",
  url: "https://www.rhs.org.uk/vegetables",
  read: "2026-11-21",
  region: "the UK",
} as const;

/** What the Met Office says about when the last frost comes, for the guide line under the date. */
export const LAST_FROST_SOURCE = {
  name: "Met Office, Why frost can still occur in late spring (2026)",
  url: "https://www.metoffice.gov.uk/blog/2026/why-frost-can-still-occur-in-late-spring",
  read: "2026-11-21",
} as const;

export const GARDEN_CROP_IDS = [
  "beetroot",
  "broadBeans",
  "cabbages",
  "carrots",
  "courgettes",
  "cucumbers",
  "frenchBeans",
  "garlic",
  "kale",
  "leeks",
  "lettuce",
  "onions",
  "parsnips",
  "peas",
  "potatoes",
  "radishes",
  "runnerBeans",
  "salad",
  "spinach",
  "squash",
  "sweetcorn",
  "tomatoes",
] as const;
export type GardenCropId = (typeof GARDEN_CROP_IDS)[number];

export interface GardenCrop {
  id: GardenCropId;
  /** As it is written at the start of a line: "Broad beans". */
  name: string;
  /** The RHS grow-your-own page the months come from. */
  source: string;
  sow: readonly Month[];
  /** The RHS "Plant" or "Plant out" row; empty for a crop sown where it grows. */
  plant: readonly Month[];
  /** Which of the two the RHS calls it. */
  plantWord: "Plant" | "Plant out";
  harvest: readonly Month[];
  /** The RHS calls it tender: frost kills it, so it goes outside only after the last frost. */
  tender: boolean;
  /** For a tender crop, what the RHS says about it and frost, in Outpost's words. */
  frostNote?: string;
  /** The same crop in the Allotment game, whose calendar holds sowing and planting together. */
  allotment?: CropId;
}

const rhs = (path: string) => `https://www.rhs.org.uk/vegetables/${path}/grow-your-own`;
const from = (id: CropId) => CROP_NOTES[id].source;

/** The RHS calendar rows, read on 21 November 2026, crop by crop. */
export const GARDEN_CROPS: Record<GardenCropId, GardenCrop> = {
  beetroot: {
    id: "beetroot",
    name: "Beetroot",
    source: from("beetroot"),
    sow: [3, 4, 5, 6, 7],
    plant: [],
    plantWord: "Plant out",
    harvest: [6, 7, 8, 9, 10],
    tender: false,
    allotment: "beetroot",
  },
  broadBeans: {
    id: "broadBeans",
    name: "Broad beans",
    source: from("broadBeans"),
    sow: [2, 3, 4, 5, 10, 11],
    plant: [4, 5],
    plantWord: "Plant out",
    harvest: [5, 6, 7, 8],
    tender: false,
    allotment: "broadBeans",
  },
  cabbages: {
    id: "cabbages",
    name: "Cabbages",
    source: rhs("cabbages"),
    sow: [2, 3, 4, 5, 6, 7],
    plant: [3, 4, 5, 6, 7, 8, 9, 10],
    plantWord: "Plant out",
    harvest: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    tender: false,
  },
  carrots: {
    id: "carrots",
    name: "Carrots",
    source: from("carrots"),
    sow: [2, 3, 4, 5, 6, 7],
    plant: [],
    plantWord: "Plant out",
    harvest: [5, 6, 7, 8, 9, 10, 11],
    tender: false,
    allotment: "carrots",
  },
  courgettes: {
    id: "courgettes",
    name: "Courgettes",
    source: rhs("courgettes"),
    sow: [4, 5, 6],
    plant: [5, 6],
    plantWord: "Plant out",
    harvest: [7, 8, 9, 10],
    tender: true,
    frostNote:
      "Tender. Best sown indoors; sow outside in late May or early June once the soil is warm, and plant out after the last frost.",
  },
  cucumbers: {
    id: "cucumbers",
    name: "Cucumbers",
    source: rhs("cucumbers"),
    sow: [2, 3, 4, 5, 6],
    plant: [5, 6],
    plantWord: "Plant out",
    harvest: [7, 8, 9, 10],
    tender: true,
    frostNote:
      "Tender. The early sowings are for a heated greenhouse; outdoor kinds are sown outside in late May or early June, in milder places.",
  },
  frenchBeans: {
    id: "frenchBeans",
    name: "French beans",
    source: rhs("french-beans"),
    sow: [4, 5, 6, 7],
    plant: [5, 6],
    plantWord: "Plant out",
    harvest: [7, 8, 9, 10],
    tender: true,
    frostNote: "Tender. Sow outside, or plant out, only once all risk of frost has passed: usually late May or early June.",
  },
  garlic: {
    id: "garlic",
    name: "Garlic",
    source: from("garlic"),
    sow: [],
    plant: [2, 3, 10, 11, 12],
    plantWord: "Plant",
    harvest: [5, 6, 7, 8],
    tender: false,
    allotment: "garlic",
  },
  kale: {
    id: "kale",
    name: "Kale",
    source: from("kale"),
    sow: [3, 4, 5, 6],
    plant: [5, 6, 7],
    plantWord: "Plant out",
    harvest: [1, 2, 3, 4, 10, 11, 12],
    tender: false,
    allotment: "kale",
  },
  leeks: {
    id: "leeks",
    name: "Leeks",
    source: from("leeks"),
    sow: [2, 3, 4, 5, 6],
    plant: [5, 6, 7],
    plantWord: "Plant",
    harvest: [1, 2, 3, 8, 9, 10, 11, 12],
    tender: false,
    allotment: "leeks",
  },
  lettuce: {
    id: "lettuce",
    name: "Lettuce",
    source: rhs("lettuce"),
    sow: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    plant: [3, 4],
    plantWord: "Plant out",
    harvest: [5, 6, 7, 8, 9, 10, 11],
    tender: false,
  },
  onions: {
    id: "onions",
    name: "Onions",
    source: from("onions"),
    sow: [1, 2, 3, 4, 8, 9],
    plant: [3, 4, 9, 10, 11],
    plantWord: "Plant",
    harvest: [6, 7, 8, 9],
    tender: false,
    allotment: "onions",
  },
  parsnips: {
    id: "parsnips",
    name: "Parsnips",
    source: rhs("parsnips"),
    sow: [3, 4, 5],
    plant: [],
    plantWord: "Plant out",
    harvest: [1, 2, 3, 9, 10, 11, 12],
    tender: false,
  },
  peas: {
    id: "peas",
    name: "Peas",
    source: from("peas"),
    sow: [2, 3, 4, 5, 6],
    plant: [3, 4],
    plantWord: "Plant out",
    harvest: [6, 7, 8, 9, 10],
    tender: false,
    allotment: "peas",
  },
  potatoes: {
    id: "potatoes",
    name: "Potatoes",
    source: from("potatoes"),
    sow: [],
    plant: [3, 4, 5],
    plantWord: "Plant",
    harvest: [6, 7, 8, 9, 10],
    tender: false,
    allotment: "potatoes",
  },
  radishes: {
    id: "radishes",
    name: "Radishes",
    source: from("radishes"),
    sow: [3, 4, 5, 6, 7, 8, 9],
    plant: [],
    plantWord: "Plant out",
    // The winter months of the RHS row are for winter radishes, a different kind.
    harvest: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    tender: false,
    allotment: "radishes",
  },
  runnerBeans: {
    id: "runnerBeans",
    name: "Runner beans",
    source: rhs("runner-beans"),
    sow: [4, 5, 6, 7],
    plant: [5, 6, 7],
    plantWord: "Plant out",
    harvest: [7, 8, 9, 10],
    tender: true,
    frostNote:
      "Tender: frost kills them. Sow indoors in late spring, or outside once all risk of frost has passed and the soil is 12°C, usually mid-May in the south and early June in the north.",
  },
  salad: {
    id: "salad",
    name: "Salad leaves",
    source: from("salad"),
    sow: [2, 3, 4, 5, 6, 7, 8, 9],
    plant: [],
    plantWord: "Plant out",
    harvest: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    tender: false,
    allotment: "salad",
  },
  spinach: {
    id: "spinach",
    name: "Spinach",
    source: rhs("spinach"),
    sow: [3, 4, 5, 8, 9],
    plant: [],
    plantWord: "Plant out",
    harvest: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    tender: false,
  },
  squash: {
    id: "squash",
    name: "Squash",
    source: from("squash"),
    sow: [4, 5],
    plant: [5, 6],
    plantWord: "Plant out",
    harvest: [7, 8, 9, 10],
    tender: true,
    frostNote:
      "Tender. Sow indoors for a head start, or outside not before late May or early June; plant out after the last frost, and bring the fruit in before the first one in autumn.",
  },
  sweetcorn: {
    id: "sweetcorn",
    name: "Sweetcorn",
    source: rhs("sweetcorn"),
    sow: [4, 5, 6],
    plant: [5, 6],
    plantWord: "Plant out",
    harvest: [8, 9, 10],
    tender: true,
    frostNote: "Tender. Best sown indoors and planted out after all risk of frost has passed, by late May or early June.",
  },
  tomatoes: {
    id: "tomatoes",
    name: "Tomatoes",
    source: rhs("tomatoes"),
    sow: [2, 3, 4],
    plant: [5, 6],
    plantWord: "Plant",
    harvest: [7, 8, 9, 10],
    tender: true,
    frostNote:
      "Tender: they need keeping from frost. Sow late February to mid-March for a greenhouse, late March to early April for growing outside, in a warm, sheltered, sunny place.",
  },
};

export const MONTH_NAMES_LONG = [
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

/** A day of the year as "MM-DD", the same every year: the household's usual last frost. 29 February is not one. */
export type MonthDay = string;

const MONTH_DAY = /^(\d{2})-(\d{2})$/;
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The month and day of an "MM-DD", or null if it is not a day of an ordinary year. */
export function parseMonthDay(text: string): { month: Month; day: number } | null {
  const match = MONTH_DAY.exec(text);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > (DAYS_IN[month - 1] ?? 0)) return null;
  return { month: month as Month, day };
}

/** "12 May". */
export function monthDayText(value: MonthDay): string {
  const parsed = parseMonthDay(value);
  return parsed ? `${parsed.day} ${MONTH_NAMES_LONG[parsed.month - 1]}` : value;
}

/** The day after an "MM-DD" (the first day a tender crop may go out), staying in the same year. */
function dayAfter(value: { month: Month; day: number }): { month: Month; day: number } | null {
  if (value.day < (DAYS_IN[value.month - 1] ?? 0)) return { month: value.month, day: value.day + 1 };
  return value.month === 12 ? null : { month: (value.month + 1) as Month, day: 1 };
}

export interface PlantLine {
  crop: GardenCrop;
  /** Planting starts part-way through the month, on this day (the day after the last frost). */
  fromDay?: number;
}

export interface HeldBack {
  crop: GardenCrop;
  /** The day it may go out, "MM-DD", or null when the last frost falls after every RHS planting month. */
  from: MonthDay | null;
}

export interface GardenMonth {
  month: Month;
  sow: GardenCrop[];
  plant: PlantLine[];
  harvest: GardenCrop[];
  /** Tender crops the RHS plants out this month, kept back because the household's last frost is later. */
  heldBack: HeldBack[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * What the calendar gives for a month, with tender crops' planting kept back until the
 * day after the household's last frost (see the top of this file). With no last frost
 * given, the RHS months stand as they are.
 */
export function gardenMonth(month: Month, lastFrost: MonthDay | null): GardenMonth {
  const frost = lastFrost ? parseMonthDay(lastFrost) : null;
  const first = frost ? dayAfter(frost) : null;
  const crops = GARDEN_CROP_IDS.map((id) => GARDEN_CROPS[id]);
  const out: GardenMonth = {
    month,
    sow: crops.filter((crop) => crop.sow.includes(month)),
    plant: [],
    harvest: crops.filter((crop) => crop.harvest.includes(month)),
    heldBack: [],
  };
  for (const crop of crops) {
    if (!crop.plant.includes(month)) continue;
    if (!crop.tender || !frost) {
      out.plant.push({ crop });
      continue;
    }
    // The first day it may go out, if one of the RHS months is left for it.
    const lastPlantMonth = Math.max(...crop.plant);
    const allowed = first && first.month <= lastPlantMonth ? first : null;
    const fromText = allowed ? `${pad(allowed.month)}-${pad(allowed.day)}` : null;
    if (!allowed || month < allowed.month) out.heldBack.push({ crop, from: fromText });
    else if (month === allowed.month && allowed.day > 1) out.plant.push({ crop, fromDay: allowed.day });
    else out.plant.push({ crop });
  }
  return out;
}

/** Months as a phrase: "April to June", "February, March and October to December". */
export function monthsText(months: readonly Month[]): string {
  if (months.length === 0) return "";
  if (months.length === 12) return "all year";
  const sorted = [...months].sort((a, b) => a - b);
  const runs: Array<[Month, Month]> = [];
  for (const m of sorted) {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else runs.push([m, m]);
  }
  // A run through December joins one from January: "October to February".
  if (runs.length > 1 && runs[0]?.[0] === 1 && runs[runs.length - 1]?.[1] === 12) {
    const head = runs.shift() as [Month, Month];
    (runs[runs.length - 1] as [Month, Month])[1] = head[1];
  }
  const words = runs.map(([a, b]) => (a === b ? MONTH_NAMES_LONG[a - 1] : `${MONTH_NAMES_LONG[a - 1]} to ${MONTH_NAMES_LONG[b - 1]}`));
  return words.length === 1 ? (words[0] as string) : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// ── The household's record ──────────────────────────────────────────────────

export const GARDEN_LIMITS = { sowings: 5000, name: 120, text: 2000, short: 200 } as const;

/** One thing the household sowed or planted, and what came of it. */
export interface GardenSowing {
  id: string;
  /** A crop of the calendar, or null for something else, named in `name`. */
  cropId: GardenCropId | null;
  /** What was sown, as the person wrote it ("Carrots, Nantes 2"); the crop's name when left blank. */
  name: string;
  /** The day it was sown or planted, "2026-04-12". */
  sownOn: string;
  /** Where: "Bed 3", "Greenhouse", "Pots by the back door". */
  place: string;
  /** How much: "One row", "12 modules". */
  amount: string;
  /** The day it was planted out, if it was raised indoors first. */
  plantedOutOn: string | null;
  /** The day the first of it was picked or lifted. */
  harvestedOn: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type GardenSowingInput = Omit<GardenSowing, "id" | "createdAt" | "updatedAt"> & {
  /** For `PUT`: the `updatedAt` the change was based on. A newer stored sowing refuses it with 409. */
  baseUpdatedAt?: number;
};

export interface GardenSettings {
  /** The household's usual last frost, "MM-DD", or null when none is given. */
  lastFrost: MonthDay | null;
  updatedAt: number | null;
}

/** GET /api/garden. */
export interface GardenResponse {
  settings: GardenSettings;
  sowings: GardenSowing[];
}

/** What the garden keeps, for "Manage and clean up": the sowings recorded, and the last-frost date if one is set. */
export interface GardenKept {
  sowings: number;
  settings: number;
}

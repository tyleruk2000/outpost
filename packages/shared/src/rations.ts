/**
 * The sums of the ration calculator under Tools: a day's energy for each person, how long
 * a store of food lasts, what to store for a number of days, and a common stock shared by
 * need. Plain code on figures from named bodies, so it can be tested on its own and used
 * by the screen and anything else that asks.
 *
 * Every figure here is from one of the documents in `RATION_SOURCES`, read on 21 November
 * 2026; nothing is invented. In particular, no body named publishes a "three-quarter" or
 * "half" ration as safe, nor a floor below which a ration must not go. The reduced
 * figures are therefore arithmetic only, and the two ways of reducing are the ones the
 * bodies describe: everyone reduced, or a full ration kept for those who need it and the
 * rest reduced. A planning aid, not dietary or medical advice.
 */
import { type AgeBand, ENERGY_BANDS, type MemberSex, tableKcal } from "./supplies.ts";

export const RATIONS_READ = "2026-11-21";

export const RATION_SOURCES = {
  sphere: {
    name: "Sphere Association, The Sphere Handbook (2018), Food security and nutrition: food security standard 6.1 and appendix 6",
    url: "https://emergency.unhcr.org/sites/default/files/2024-05/SphereFS%2BN.pdf",
    read: RATIONS_READ,
  },
  fnne: {
    name: "UNHCR, UNICEF, WFP and WHO, Food and Nutrition Needs in Emergencies (2002), sections 2 and 4, table 12 and annex 1",
    url: "https://iris.who.int/server/api/core/bitstreams/c6f336b9-0c36-4431-80fd-840c05344817/content",
    read: RATIONS_READ,
  },
  phe: {
    name: "Public Health England, Government Dietary Recommendations (2016), tables 1 and 2",
    url: "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/618167/government_dietary_recommendations.pdf",
    read: RATIONS_READ,
  },
  sacn: {
    name: "Scientific Advisory Committee on Nutrition, Dietary Reference Values for Energy (2011), paragraphs S50 and S51",
    url: "https://assets.publishing.service.gov.uk/media/5a7edb37ed915d74e33f2d8f/SACN_Dietary_Reference_Values_for_Energy.pdf",
    read: RATIONS_READ,
  },
  usda: {
    name: "USDA FoodData Central, SR Legacy (April 2018), as Supplies holds it",
    url: "https://fdc.nal.usda.gov/",
    read: RATIONS_READ,
  },
  beReady: {
    name: "UK Government, Be ready: get prepared for emergencies",
    url: "https://beready.campaign.gov.uk/be-ready-for-emergencies/",
    read: RATIONS_READ,
  },
} as const;

/** The bodies' own words, for the screen to quote. */
export const RATION_QUOTES = {
  spherePlanning: "2,100 kCal per person per day with 10–12 per cent of total energy provided by protein and 17 per cent provided by fat",
  sphereNotIndividual: "should not be used as requirements for an individual",
  sphereReduce:
    "reducing the rations to all recipients; giving a full ration to vulnerable individuals and a reduced ration to the general population; or postponing the distribution (as a last resort)",
  fnneCold: "adjust energy requirements upward by 100 kcal for every 5° below 20° C",
  fnneWork: "is engaged in moderate or heavy work, an increase in ration should be considered",
  fnneAcrossTheBoard:
    "Reducing the ration across the board may mean that a significant proportion of the population receives insufficient food to meet its needs.",
  fnneSafetyNet:
    "Reduce ration amount for whole population while maintaining a safety net programme of full distribution to separate subgroups such as identified vulnerable members.",
  fnneVulnerable: "the most vulnerable, including the elderly, the chronically ill, under-5-year-olds",
  beReady: "Non-perishable food for 3 days",
} as const;

/** Sphere's planning figure, and its protein and fat for that energy (appendix 6). */
export const SPHERE_PLANNING = { kcal: 2100, proteinG: 53, fatG: 40 } as const;

// ── A day's energy for one person ───────────────────────────────────────────

export type RationBasis = "uk" | "international" | "sphere";

export interface RationPerson {
  id: string;
  name: string;
  /** Whole years. */
  age: number;
  sex: MemberSex;
  pregnant: boolean;
  breastfeeding: boolean;
  /** Ill: never put on a reduced ration by a calculator. */
  ill: boolean;
  /** A figure the person gives instead of the table's: for heavy work, a baby, a doctor's figure. */
  ownKcal: number | null;
}

/**
 * FNNE annex 1: energy requirements per caput, kcal a day, male, female and both, for a
 * developing-country profile at a "light" activity level (adult weights 60 kg and 52 kg).
 * Ages 1 to 4 are years of their own.
 */
export const FNNE_ROWS: ReadonlyArray<{ from: number; to: number; male: number; female: number; both: number }> = [
  { from: 0, to: 0, male: 850, female: 780, both: 820 },
  { from: 1, to: 1, male: 1250, female: 1190, both: 1220 },
  { from: 2, to: 2, male: 1430, female: 1330, both: 1380 },
  { from: 3, to: 3, male: 1560, female: 1440, both: 1500 },
  { from: 4, to: 4, male: 1690, female: 1540, both: 1620 },
  { from: 5, to: 9, male: 1980, female: 1730, both: 1860 },
  { from: 10, to: 14, male: 2370, female: 2040, both: 2210 },
  { from: 15, to: 19, male: 2700, female: 2120, both: 2420 },
  { from: 20, to: 59, male: 2460, female: 1990, both: 2230 },
  { from: 60, to: 200, male: 2010, female: 1780, both: 1890 },
];
export const FNNE_PREGNANT_KCAL = 285;
export const FNNE_LACTATING_KCAL = 500;
/** SACN: 191 kcal a day in the last trimester only; 330 kcal a day in the first six months of breastfeeding. */
export const SACN_PREGNANT_KCAL = 191;
export const SACN_BREASTFEEDING_KCAL = 330;

/** The UK table's age band for an age in years. */
export function ukBandOf(age: number): AgeBand {
  if (age < 1) return "under-1";
  if (age < 2) return "1";
  if (age < 4) return "2-3";
  if (age < 7) return "4-6";
  if (age < 11) return "7-10";
  if (age < 15) return "11-14";
  if (age < 19) return "15-18";
  if (age < 65) return "19-64";
  if (age < 75) return "65-74";
  return "75+";
}

/** The youngest age of a UK band: how a household from Supplies is read here. */
export function ageOfBand(band: AgeBand | null): number {
  const ages: Record<AgeBand, number> = {
    "under-1": 0,
    "1": 1,
    "2-3": 2,
    "4-6": 4,
    "7-10": 7,
    "11-14": 11,
    "15-18": 15,
    "19-64": 19,
    "65-74": 65,
    "75+": 75,
  };
  return band ? ages[band] : 19;
}

/**
 * FNNE's cold allowance: 100 kcal for every whole 5 °C of the mean daily temperature
 * below 20 °C, as its box gives it (15 °C +100 … 0 °C +400). The box stops at 0 °C, so
 * colder is given the 0 °C figure and said to be beyond it.
 */
export function coldAllowance(meanC: number | null): { kcal: number; beyond: boolean } {
  if (meanC === null || meanC >= 20) return { kcal: 0, beyond: false };
  const steps = Math.min(4, Math.floor((20 - Math.max(meanC, 0)) / 5));
  return { kcal: steps * 100, beyond: meanC < 0 };
}

export interface NeedPart {
  label: string;
  kcal: number;
  source: keyof typeof RATION_SOURCES | "own";
}

export interface PersonNeed {
  id: string;
  name: string;
  /** Null where the basis gives no figure (a baby under one on the UK table) and none was given. */
  kcal: number | null;
  parts: NeedPart[];
  /** Kept on a full ration in every sum: a child, an older person, pregnant, breastfeeding or ill. */
  protected: boolean;
  why: string[];
}

/** Whether a person is one the screen says must not be put on a reduced ration by a calculator, and why. */
export function protectedReasons(person: RationPerson): string[] {
  const why: string[] = [];
  if (person.age < 18) why.push("a child");
  if (person.age >= 65) why.push("an older person");
  if (person.pregnant) why.push("pregnant");
  if (person.breastfeeding) why.push("breastfeeding");
  if (person.ill) why.push("ill");
  return why;
}

export function personNeed(person: RationPerson, basis: RationBasis, meanC: number | null): PersonNeed {
  const why = protectedReasons(person);
  const base = { id: person.id, name: person.name, protected: why.length > 0, why };
  if (person.ownKcal !== null)
    return { ...base, kcal: person.ownKcal, parts: [{ label: "Your own figure", kcal: person.ownKcal, source: "own" }] };
  const parts: NeedPart[] = [];
  if (basis === "uk") {
    const band = ukBandOf(person.age);
    const kcal = tableKcal(band, person.sex);
    if (kcal === null) return { ...base, kcal: null, parts };
    const label = ENERGY_BANDS.find((entry) => entry.id === band)?.label ?? band;
    parts.push({ label: `${label}, ${sexWords(person.sex)}`, kcal, source: "phe" });
    if (person.pregnant) parts.push({ label: "Pregnant, last three months only", kcal: SACN_PREGNANT_KCAL, source: "sacn" });
    if (person.breastfeeding) parts.push({ label: "Breastfeeding, first six months", kcal: SACN_BREASTFEEDING_KCAL, source: "sacn" });
  } else if (basis === "international") {
    const row = FNNE_ROWS.find((entry) => person.age >= entry.from && person.age <= entry.to) ?? FNNE_ROWS.at(-1)!;
    const kcal = person.sex === "male" ? row.male : person.sex === "female" ? row.female : row.both;
    const ages = row.from === row.to ? `${row.from} years` : row.to > 120 ? `${row.from} and over` : `${row.from} to ${row.to} years`;
    parts.push({ label: `${ages}, ${sexWords(person.sex)}`, kcal, source: "fnne" });
    if (person.pregnant) parts.push({ label: "Pregnant", kcal: FNNE_PREGNANT_KCAL, source: "fnne" });
    if (person.breastfeeding) parts.push({ label: "Breastfeeding", kcal: FNNE_LACTATING_KCAL, source: "fnne" });
  } else {
    // Sphere's figure already "take[s] into account the additional needs of pregnant and breastfeeding women".
    parts.push({ label: "Sphere planning figure, the same for everyone", kcal: SPHERE_PLANNING.kcal, source: "sphere" });
  }
  // The UK figures give no allowance for cold; FNNE's is used with its own figures and with Sphere's, which refers to it.
  if (basis !== "uk") {
    const cold = coldAllowance(meanC);
    if (cold.kcal > 0) parts.push({ label: `Cold: mean ${meanC} °C`, kcal: cold.kcal, source: "fnne" });
  }
  return { ...base, kcal: parts.reduce((sum, part) => sum + part.kcal, 0), parts };
}

const sexWords = (sex: MemberSex) => (sex === "male" ? "male" : sex === "female" ? "female" : "sex not given");

// ── How long a store lasts ──────────────────────────────────────────────────

export const RATION_LEVELS = [
  { id: "full", share: 1, label: "Full need" },
  { id: "three-quarters", share: 0.75, label: "Three quarters" },
  { id: "half", share: 0.5, label: "Half" },
] as const;

export interface LevelDays {
  id: (typeof RATION_LEVELS)[number]["id"];
  share: number;
  /** kcal a day for the household at this level, those kept on full counted in full. */
  perDay: number;
  days: number | null;
  /** Whether anyone is on less than their need at this level. */
  anyoneReduced: boolean;
}

/**
 * Days a store of energy lasts at each level, with those who must not be on a reduced ration
 * kept at their full need (FNNE table 12; Sphere standard 6.3). People with no figure are
 * not counted, and the screen says so.
 */
export function daysAtLevels(storeKcal: number, needs: PersonNeed[]): LevelDays[] {
  return RATION_LEVELS.map((level) => {
    let perDay = 0;
    let anyoneReduced = false;
    for (const need of needs) {
      if (need.kcal === null) continue;
      if (need.protected || level.share === 1) perDay += need.kcal;
      else {
        perDay += need.kcal * level.share;
        anyoneReduced = true;
      }
    }
    return { id: level.id, share: level.share, perDay, days: perDay > 0 ? storeKcal / perDay : null, anyoneReduced };
  });
}

/** The day a store runs out, as a calendar day: the last whole day it covers, counting today as day one. */
export function runsOutOn(today: string, days: number): string {
  const start = Date.parse(`${today}T12:00:00Z`);
  const whole = Math.max(0, Math.floor(days) - 1);
  return new Date(start + whole * 86_400_000).toISOString().slice(0, 10);
}

// ── What to store ───────────────────────────────────────────────────────────

/** Staple foods, with their figures per 100 g from the USDA table Supplies ships (each checked against it in the server's tests). */
export const STAPLES = [
  { id: "rice", label: "Rice, white, dry", fdcId: 168877, kcalPer100g: 365, proteinG: 7.13, fatG: 0.66 },
  { id: "pasta", label: "Pasta, dry", fdcId: 169736, kcalPer100g: 371, proteinG: 13.04, fatG: 1.51 },
  { id: "oats", label: "Oats, dry", fdcId: 173904, kcalPer100g: 379, proteinG: 13.15, fatG: 6.52 },
  { id: "flour", label: "Plain flour", fdcId: 168894, kcalPer100g: 364, proteinG: 10.33, fatG: 0.98 },
  { id: "maize", label: "Maize flour", fdcId: 170290, kcalPer100g: 361, proteinG: 6.93, fatG: 3.86 },
  { id: "lentils", label: "Lentils, dry", fdcId: 172420, kcalPer100g: 352, proteinG: 24.63, fatG: 1.06 },
  { id: "beans", label: "Kidney beans, dry", fdcId: 175193, kcalPer100g: 333, proteinG: 23.58, fatG: 0.83 },
  { id: "milk-powder", label: "Skimmed milk powder", fdcId: 172195, kcalPer100g: 362, proteinG: 36.16, fatG: 0.77 },
  { id: "peanut-butter", label: "Peanut butter", fdcId: 172470, kcalPer100g: 598, proteinG: 22.21, fatG: 51.36 },
  { id: "tuna", label: "Tinned tuna, drained", fdcId: 173709, kcalPer100g: 86, proteinG: 19.44, fatG: 0.96 },
  { id: "oil", label: "Rapeseed oil", fdcId: 172336, kcalPer100g: 884, proteinG: 0, fatG: 100 },
  { id: "sugar", label: "Sugar", fdcId: 169655, kcalPer100g: 387, proteinG: 0, fatG: 0 },
] as const;
export type StapleId = (typeof STAPLES)[number]["id"];

export interface RationFood {
  label: string;
  kcalPer100g: number;
  /** Null where the figure is not known (a food from Supplies with no USDA match). */
  proteinG: number | null;
  fatG: number | null;
}

export interface PlanLine {
  label: string;
  /** Share of the energy, 0 to 1. */
  share: number;
  kcal: number;
  grams: number;
}

export interface FoodBalance {
  kcal: number;
  proteinG: number | null;
  fatG: number | null;
  /** Share of the energy from protein and fat, against Sphere's 10% and 17%. */
  proteinShare: number | null;
  fatShare: number | null;
  /** Protein and fat Sphere gives for this much energy (53 g and 40 g for 2,100 kcal). */
  proteinWanted: number;
  fatWanted: number;
  /** The food giving more than four fifths of the energy, if one does. */
  oneFood: string | null;
}

/** Above this share of the energy from one food, the screen says the ration is nearly all one food. */
export const ONE_FOOD_SHARE = 0.8;

/**
 * Protein and fat in a ration against Sphere's planning figures. Energy shares use the
 * figures Sphere states together (53 g of protein is 10% of 2,100 kcal, 40 g of fat 17%),
 * so that no conversion factor is brought in from elsewhere.
 */
export function balanceOf(lines: Array<{ food: RationFood; grams: number }>): FoodBalance {
  let kcal = 0;
  let protein: number | null = 0;
  let fat: number | null = 0;
  const byFood = new Map<string, number>();
  for (const { food, grams } of lines) {
    const energy = (food.kcalPer100g * grams) / 100;
    kcal += energy;
    byFood.set(food.label, (byFood.get(food.label) ?? 0) + energy);
    protein = protein === null || food.proteinG === null ? null : protein + (food.proteinG * grams) / 100;
    fat = fat === null || food.fatG === null ? null : fat + (food.fatG * grams) / 100;
  }
  const proteinWanted = (SPHERE_PLANNING.proteinG * kcal) / SPHERE_PLANNING.kcal;
  const fatWanted = (SPHERE_PLANNING.fatG * kcal) / SPHERE_PLANNING.kcal;
  let oneFood: string | null = null;
  for (const [label, energy] of byFood) if (kcal > 0 && energy / kcal > ONE_FOOD_SHARE) oneFood = label;
  return {
    kcal,
    proteinG: protein,
    fatG: fat,
    proteinShare: protein === null || kcal === 0 ? null : (protein / proteinWanted) * 0.1,
    fatShare: fat === null || kcal === 0 ? null : (fat / fatWanted) * 0.17,
    proteinWanted,
    fatWanted,
    oneFood,
  };
}

/** The amount of each food that makes up `kcal`, shared by energy as given (shares need not add to one: they are scaled). */
export function planFoods(kcal: number, shares: Array<{ food: RationFood; share: number }>): PlanLine[] {
  const total = shares.reduce((sum, entry) => sum + Math.max(0, entry.share), 0);
  if (total <= 0) return [];
  return shares
    .filter((entry) => entry.share > 0)
    .map(({ food, share }) => {
      const part = share / total;
      const energy = kcal * part;
      return { label: food.label, share: part, kcal: energy, grams: (energy / food.kcalPer100g) * 100 };
    });
}

// ── Sharing a common stock ──────────────────────────────────────────────────

export interface ShareLine {
  id: string;
  name: string;
  need: number;
  /** kcal a day from the stock. */
  kcal: number;
  /** The same as a share of that person's need. */
  ofNeed: number;
}

/**
 * A stock to last a number of days, shared out by each person's need rather than equally.
 * Those kept on a full ration have their need met first while the stock allows; the rest
 * share what is left in proportion to their needs. Nobody is given more than their need.
 */
export function shareByNeed(storeKcal: number, days: number, needs: PersonNeed[]): { perDay: number; lines: ShareLine[] } {
  const perDay = days > 0 ? storeKcal / days : 0;
  const counted = needs.filter((need): need is PersonNeed & { kcal: number } => need.kcal !== null && need.kcal > 0);
  const protectedNeed = counted.filter((need) => need.protected).reduce((sum, need) => sum + need.kcal, 0);
  const otherNeed = counted.filter((need) => !need.protected).reduce((sum, need) => sum + need.kcal, 0);
  const protectedShare = protectedNeed === 0 ? 0 : Math.min(1, perDay / protectedNeed);
  const left = Math.max(0, perDay - protectedNeed * protectedShare);
  const otherShare = otherNeed === 0 ? 0 : Math.min(1, left / otherNeed);
  return {
    perDay,
    lines: counted.map((need) => {
      const share = need.protected ? protectedShare : otherShare;
      return { id: need.id, name: need.name, need: need.kcal, kcal: need.kcal * share, ofNeed: share };
    }),
  };
}

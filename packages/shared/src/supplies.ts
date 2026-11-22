/**
 * Supplies: stored food, water and the rest, who they are for, and how long they last.
 *
 * Everything here is plain arithmetic on what a person typed, so that the server (for
 * the routes, and for the scenario planner that asks "how many days") and the web app
 * work out the same figures. The planning figures are official ones, each named with
 * where it comes from; docs/supplies.md quotes them. They are planning figures for a
 * store cupboard, not dietary advice.
 */

import type { EnergySummary } from "./supplies-energy.ts";

// ── What an item is ─────────────────────────────────────────────────────────

export const SUPPLY_CATEGORIES = [
  { id: "food", label: "Food" },
  { id: "water", label: "Water" },
  { id: "pet-food", label: "Pet food" },
  { id: "fuel", label: "Fuel" },
  { id: "medical", label: "Medical" },
  { id: "hygiene", label: "Hygiene" },
  { id: "batteries", label: "Batteries" },
  { id: "equipment", label: "Equipment" },
  { id: "other", label: "Other" },
] as const;
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number]["id"];
export const SUPPLY_CATEGORY_IDS = SUPPLY_CATEGORIES.map((category) => category.id) as [SupplyCategory, ...SupplyCategory[]];
export const categoryLabel = (id: string): string => SUPPLY_CATEGORIES.find((category) => category.id === id)?.label ?? id;

/** The units offered first for each category. A unit is free text; these are suggestions. */
export const SUPPLY_UNITS: Record<SupplyCategory, string[]> = {
  food: ["tin", "pack", "jar", "bag", "box", "pouch"],
  water: ["bottle", "container", "pack"],
  "pet-food": ["tin", "pouch", "bag"],
  fuel: ["canister", "bottle", "bag"],
  medical: ["pack", "box", "bottle"],
  hygiene: ["pack", "roll", "bottle"],
  batteries: ["battery", "pack"],
  equipment: ["item"],
  other: ["item"],
};

/**
 * Use-by is about safety, best before about quality (GOV.UK, "Best before and use-by
 * dates", updated 25 June 2026). Food past its use-by is not counted and is listed to be
 * thrown away or replaced; food past its best before still counts, and is listed to be
 * checked and eaten first.
 */
export type SupplyDateKind = "use-by" | "best-before";

export interface SupplyItem {
  id: string;
  name: string;
  category: SupplyCategory;
  quantity: number;
  unit: string;
  location: string;
  dateKind: SupplyDateKind | null;
  /** A calendar day, "2027-03-31". */
  date: string | null;
  kcalPerUnit: number | null;
  kcalPer100g: number | null;
  gramsPerUnit: number | null;
  litresPerUnit: number | null;
  minimum: number | null;
  barcode: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type SupplyItemInput = Omit<SupplyItem, "id" | "createdAt" | "updatedAt">;

export const SUPPLY_LIMITS = {
  name: 200,
  unit: 40,
  location: 80,
  notes: 4000,
  barcode: 64,
  items: 5000,
  members: 40,
  shoppingLines: 500,
  quantity: 1_000_000,
  csvBytes: 2 * 1024 * 1024,
} as const;

/** The largest figure an item takes for each of its numbers, so that a slip (kJ for kcal) is refused where it is typed. */
export const SUPPLY_FIGURE_MAX = {
  quantity: SUPPLY_LIMITS.quantity,
  kcalPerUnit: 100_000,
  kcalPer100g: 1_000,
  gramsPerUnit: 1_000_000,
  litresPerUnit: 10_000,
  minimum: SUPPLY_LIMITS.quantity,
} as const;

/** Energy in one unit, from the label's figure per pack, or per 100 g and the weight of the pack. */
export function kcalOfUnit(item: Pick<SupplyItem, "kcalPerUnit" | "kcalPer100g" | "gramsPerUnit">): number | null {
  if (item.kcalPerUnit !== null && item.kcalPerUnit >= 0) return item.kcalPerUnit;
  if (item.kcalPer100g !== null && item.gramsPerUnit !== null && item.kcalPer100g >= 0 && item.gramsPerUnit > 0)
    return (item.kcalPer100g * item.gramsPerUnit) / 100;
  return null;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
export const isCalendarDay = (text: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};
/** Whole days from `from` to `to`, both calendar days: 0 for the same day, negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
/** The calendar day of this moment where the device is. */
export function localDay(at: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
/** Past its use-by: the last day it may be eaten was before today. On the day itself it may still be eaten. */
export const pastUseBy = (item: Pick<SupplyItem, "dateKind" | "date">, today: string): boolean =>
  item.dateKind === "use-by" && item.date !== null && daysBetween(today, item.date) < 0;
export const pastBestBefore = (item: Pick<SupplyItem, "dateKind" | "date">, today: string): boolean =>
  item.dateKind === "best-before" && item.date !== null && daysBetween(today, item.date) < 0;

// ── Who it is for ───────────────────────────────────────────────────────────

/**
 * Estimated average requirements for energy, kcal a day, from Public Health England,
 * "Government Dietary Recommendations" (August 2016), tables 1 and 2, which take them
 * from SACN, "Dietary Reference Values for Energy" (2011). The table's own notes: the
 * figures are averaged across each age group; those for ages 11 to 18 and 19 to 64 are
 * capped at 2,500 kcal (males) and 2,000 kcal (females); they relate to the general
 * population and individual requirements may vary. There is no figure for a baby under
 * one: give that need yourself.
 */
export const ENERGY_BANDS = [
  { id: "under-1", label: "Under 1", male: null, female: null },
  { id: "1", label: "1 year", male: 765, female: 717 },
  { id: "2-3", label: "2 to 3 years", male: 1088, female: 1004 },
  { id: "4-6", label: "4 to 6 years", male: 1482, female: 1378 },
  { id: "7-10", label: "7 to 10 years", male: 1817, female: 1703 },
  { id: "11-14", label: "11 to 14 years", male: 2500, female: 2000 },
  { id: "15-18", label: "15 to 18 years", male: 2500, female: 2000 },
  { id: "19-64", label: "19 to 64 years", male: 2500, female: 2000 },
  { id: "65-74", label: "65 to 74 years", male: 2342, female: 1912 },
  { id: "75+", label: "75 and over", male: 2294, female: 1840 },
] as const;
export type AgeBand = (typeof ENERGY_BANDS)[number]["id"];
export const AGE_BAND_IDS = ENERGY_BANDS.map((band) => band.id) as [AgeBand, ...AgeBand[]];
export const ENERGY_SOURCE =
  "Public Health England, Government Dietary Recommendations (2016), tables 1 and 2, from SACN Dietary Reference Values for Energy (2011)";

/**
 * FNNE annex 1 (UNHCR, UNICEF, WFP and WHO, Food and Nutrition Needs in Emergencies,
 * 2002): energy requirements per caput, kcal a day, male, female and both, for a
 * developing-country profile at a "light" activity level (adult weights 60 kg and 52 kg).
 * Ages 1 to 4 are years of their own. The ration calculator uses the same rows.
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
export const FNNE_SOURCE = "UNHCR, UNICEF, WFP and WHO, Food and Nutrition Needs in Emergencies (2002), annex 1, light activity";

/**
 * Which table a household's energy comes from: the UK's (Public Health England, by the
 * age bands Supplies asks for) or the international one (FNNE annex 1), which is meant
 * for anywhere. A household that has not chosen takes the UK's where Home is in the
 * UK, the international one everywhere else.
 */
export type EnergyTable = "uk" | "international";
export const ENERGY_TABLES: ReadonlyArray<{ id: EnergyTable; label: string; source: string }> = [
  { id: "international", label: "International (UNHCR, UNICEF, WFP, WHO)", source: FNNE_SOURCE },
  { id: "uk", label: "UK (Public Health England)", source: ENERGY_SOURCE },
];
export const energyTableSource = (table: EnergyTable): string => (table === "uk" ? ENERGY_SOURCE : FNNE_SOURCE);

/** The table for a household that has not chosen one, by Home's country (ISO 3166 code). */
export function energyTableFor(country: string | null | undefined): EnergyTable {
  const code = country?.toUpperCase();
  return code === "GB" || code === "UK" || code === "IM" || code === "JE" || code === "GG" ? "uk" : "international";
}

/** The whole years each UK band covers, to read the international table by year. The last band is read at 75. */
const BAND_YEARS: Record<string, readonly [number, number]> = {
  "under-1": [0, 0],
  "1": [1, 1],
  "2-3": [2, 3],
  "4-6": [4, 6],
  "7-10": [7, 10],
  "11-14": [11, 14],
  "15-18": [15, 18],
  "19-64": [19, 64],
  "65-74": [65, 74],
  "75+": [75, 75],
};

/**
 * Water a person needs a day, in litres. Two figures, because official bodies plan for
 * two different things:
 *
 * - Drinking: 3 litres, the UK government's "Be ready" guidance ("3 litres per person per
 *   day for drinking. More would be needed for other tasks such as cooking and
 *   washing"). WHO's technical note 9 (2013) gives 2.5 to 3 litres for survival
 *   (drinking and food); FEMA (ready.gov) says a normally active person needs about
 *   three quarters of a US gallon (2.8 litres) of fluid a day.
 * - Drinking, cooking and basic hygiene: 7.5 litres, the low end of the 7.5 to 15
 *   litres of WHO technical note 9, table 9.1 (adapted from Sphere: 2.5 to 3 for
 *   survival, 2 to 6 for basic hygiene, 3 to 6 for basic cooking). FEMA asks for one US
 *   gallon (3.8 litres) a day for drinking and sanitation.
 *
 * Hot weather, illness, pregnancy and breastfeeding raise the need: FEMA says that in
 * very hot temperatures water needs can double.
 */
export const WATER_FIGURES = {
  drinking: {
    litres: 3,
    range: [2.5, 3] as const,
    source: "UK government, Be ready: get prepared for emergencies (3 litres a day for drinking)",
  },
  allUses: {
    litres: 7.5,
    range: [7.5, 15] as const,
    source: "WHO, Technical notes on drinking-water, sanitation and hygiene in emergencies, note 9 (2013), table 9.1",
  },
  fema: { litres: 3.785, source: "FEMA, ready.gov/water (one US gallon a day for drinking and sanitation)" },
} as const;

export type WaterBasis = "drinking" | "all";
export type MemberKind = "person" | "pet";
export type MemberSex = "male" | "female" | "unstated";

export interface HouseholdMember {
  id: string;
  kind: MemberKind;
  name: string;
  /** People only. */
  band: AgeBand | null;
  sex: MemberSex | null;
  /** A need the person stated, in place of the table's; for a pet, the only figure there is. */
  kcalPerDay: number | null;
  drinkingLitres: number | null;
  allUsesLitres: number | null;
  note: string;
}

export interface Household {
  daysWanted: number;
  /** The energy table the household chose; null to take it from Home's country (`energyTableFor`). */
  energyTable: EnergyTable | null;
  /**
   * What a null choice comes to, as the server works it out from Home's country. Left
   * out of what is saved; absent on a household made on the screen, which then takes the
   * international table.
   */
  energyBasis?: { table: EnergyTable; country: string | null };
  /** For everyone without a figure of their own. */
  drinkingLitres: number;
  allUsesLitres: number;
  waterBasis: WaterBasis;
  members: HouseholdMember[];
  updatedAt: number | null;
}

/** The supplies settings of a household (`Household` is this type's older name; a household itself is `HouseholdDto`). */
export type SupplyHousehold = Household;

export type HouseholdInput = Omit<Household, "updatedAt" | "members" | "energyBasis"> & {
  members: Array<Omit<HouseholdMember, "id"> & { id?: string }>;
};

export const DEFAULT_HOUSEHOLD: Household = {
  daysWanted: 3,
  energyTable: null,
  drinkingLitres: WATER_FIGURES.drinking.litres,
  allUsesLitres: WATER_FIGURES.allUses.litres,
  waterBasis: "drinking",
  members: [],
  updatedAt: null,
};

/** The table a household's energy is worked to: its choice, else what Home's country gives, else the international one. */
export const energyTableOf = (household: Pick<Household, "energyTable" | "energyBasis">): EnergyTable =>
  household.energyTable ?? household.energyBasis?.table ?? "international";

/**
 * A person's energy a day from the international table for a UK age band: the mean of
 * the FNNE figures over each whole year the band covers, so that "2 to 3 years" is the
 * mean of the figures at 2 and at 3. Rounded to the kcal.
 */
export function internationalKcal(band: AgeBand | null, sex: MemberSex | null): number | null {
  const years = band ? BAND_YEARS[band] : undefined;
  if (!years) return null;
  let total = 0;
  for (let age = years[0]; age <= years[1]; age++) {
    const row = FNNE_ROWS.find((entry) => age >= entry.from && age <= entry.to) ?? FNNE_ROWS.at(-1)!;
    total += sex === "male" ? row.male : sex === "female" ? row.female : row.both;
  }
  return Math.round(total / (years[1] - years[0] + 1));
}

/**
 * A person's energy a day from a table (the UK's unless another is named): on the UK
 * table the average of the two figures when sex is not stated, and nothing for a baby
 * under one.
 */
export function tableKcal(band: AgeBand | null, sex: MemberSex | null, table: EnergyTable = "uk"): number | null {
  if (table === "international") return internationalKcal(band, sex);
  const row = ENERGY_BANDS.find((entry) => entry.id === band);
  if (!row || row.male === null || row.female === null) return null;
  if (sex === "male") return row.male;
  if (sex === "female") return row.female;
  return Math.round((row.male + row.female) / 2);
}

export interface MemberNeed {
  id: string;
  name: string;
  kind: MemberKind;
  kcal: number | null;
  kcalFrom: "table" | "stated" | "none";
  drinking: number | null;
  allUses: number | null;
}

/** What each member needs a day, and where the figure comes from. */
export function memberNeeds(household: Household): MemberNeed[] {
  return household.members.map((member) => {
    if (member.kind === "pet") {
      return {
        id: member.id,
        name: member.name,
        kind: "pet",
        kcal: member.kcalPerDay,
        kcalFrom: member.kcalPerDay === null ? "none" : "stated",
        drinking: member.drinkingLitres,
        allUses: member.allUsesLitres ?? member.drinkingLitres,
      };
    }
    const fromTable = tableKcal(member.band, member.sex, energyTableOf(household));
    return {
      id: member.id,
      name: member.name,
      kind: "person",
      kcal: member.kcalPerDay ?? fromTable,
      kcalFrom: member.kcalPerDay !== null ? "stated" : fromTable !== null ? "table" : "none",
      drinking: member.drinkingLitres ?? household.drinkingLitres,
      allUses: member.allUsesLitres ?? household.allUsesLitres,
    };
  });
}

// ── How long it lasts ───────────────────────────────────────────────────────

export type LeftOutReason = "no-energy" | "no-litres" | "past-use-by" | "none-left";
export interface LeftOut {
  id: string;
  name: string;
  reason: LeftOutReason;
}

export interface Stretch {
  /** A day's need for the household: kcal, or litres. Zero when there is nobody to feed. */
  perDay: number;
  /** What counts towards it: kcal, or litres. */
  counted: number;
  /** Rows counted. */
  items: number;
  /** Days it lasts, eaten in date order; null with no need to divide by. */
  days: number | null;
  /** Of what was counted, what reaches its use-by before it would be eaten. */
  lost: number;
  leftOut: LeftOut[];
}

export interface DatedRow {
  id: string;
  name: string;
  category: SupplyCategory;
  quantity: number;
  unit: string;
  location: string;
  date: string;
  dateKind: SupplyDateKind;
  /** Days from today to the date: negative once it has passed. */
  daysLeft: number;
}

export interface SupplyOutlook {
  today: string;
  daysWanted: number;
  people: number;
  pets: number;
  /** People with no energy figure (a baby with none given): their need is not in the total. */
  peopleWithoutFigure: string[];
  food: Stretch;
  water: Stretch & {
    basis: WaterBasis;
    drinkingPerDay: number;
    allUsesPerDay: number;
    daysDrinking: number | null;
    daysAllUses: number | null;
  };
  /** Pet food against the pets' stated needs; null when no pet has a figure. */
  petFood: Stretch | null;
  /** What runs out first of food and water, and when; null when neither can be worked out. */
  runsOutFirst: { what: "food" | "water"; days: number } | null;
  /** Past its use-by (do not eat), and past its best before (check, eat first). */
  expired: DatedRow[];
  pastBestBefore: DatedRow[];
  /** Dated within 30, 90 and 180 days, in date order, each list holding the shorter ones too. */
  within: { 30: DatedRow[]; 90: DatedRow[]; 180: DatedRow[] };
  byCategory: Array<{ category: SupplyCategory; rows: number; kcal: number; litres: number }>;
  byLocation: Array<{ location: string; rows: number; categories: SupplyCategory[] }>;
}

interface Portion {
  amount: number;
  /** Days from today until the end of the last day it may be used; Infinity with no use-by. */
  until: number;
  order: number;
}

/**
 * How many days a store lasts at `perDay`, used in date order: what reaches its use-by
 * first is eaten first, and what reaches its use-by before its turn is lost. Today is
 * day 0, and a use-by of today can still be eaten today.
 */
export function lastDays(portions: Portion[], perDay: number): { days: number; lost: number } {
  if (perDay <= 0) return { days: 0, lost: 0 };
  const sorted = [...portions].sort((a, b) => a.until - b.until || a.order - b.order);
  let t = 0;
  let lost = 0;
  for (const portion of sorted) {
    if (portion.amount <= 0) continue;
    if (t >= portion.until) {
      lost += portion.amount;
      continue;
    }
    const eaten = Math.min(portion.amount, (portion.until - t) * perDay);
    t += eaten / perDay;
    lost += portion.amount - eaten;
  }
  return { days: t, lost };
}

function stretch(
  rows: SupplyItem[],
  today: string,
  perDay: number,
  amountOf: (item: SupplyItem) => number | null,
  missing: LeftOutReason,
): Stretch {
  const leftOut: LeftOut[] = [];
  const portions: Portion[] = [];
  let counted = 0;
  rows.forEach((item, order) => {
    const reason: LeftOutReason | null =
      item.quantity <= 0 ? "none-left" : pastUseBy(item, today) ? "past-use-by" : amountOf(item) === null ? missing : null;
    if (reason) {
      leftOut.push({ id: item.id, name: item.name, reason });
      return;
    }
    const amount = amountOf(item)! * item.quantity;
    counted += amount;
    const until = item.dateKind === "use-by" && item.date ? daysBetween(today, item.date) + 1 : Number.POSITIVE_INFINITY;
    portions.push({ amount, until, order });
  });
  const lasting = perDay > 0 ? lastDays(portions, perDay) : null;
  return { perDay, counted, items: portions.length, days: lasting ? lasting.days : null, lost: lasting ? lasting.lost : 0, leftOut };
}

const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);

export function supplyOutlook(items: SupplyItem[], household: Household, today: string): SupplyOutlook {
  const needs = memberNeeds(household);
  const people = needs.filter((need) => need.kind === "person");
  const pets = needs.filter((need) => need.kind === "pet");
  const kcalPerDay = sum(people.map((need) => need.kcal));
  const drinkingPerDay = sum(needs.map((need) => need.drinking));
  const allUsesPerDay = sum(needs.map((need) => need.allUses));
  const waterPerDay = household.waterBasis === "all" ? allUsesPerDay : drinkingPerDay;

  const of = (category: SupplyCategory) => items.filter((item) => item.category === category);
  const food = stretch(of("food"), today, kcalPerDay, kcalOfUnit, "no-energy");
  const litres = (item: SupplyItem) => item.litresPerUnit;
  const water = stretch(of("water"), today, waterPerDay, litres, "no-litres");
  // The basis not chosen, worked out as well; the chosen one is `water` itself.
  const daysAt = (perDay: number) =>
    perDay === waterPerDay ? water.days : perDay > 0 ? stretch(of("water"), today, perDay, litres, "no-litres").days : null;
  const petKcal = sum(pets.map((need) => need.kcal));
  const petFood = pets.some((need) => need.kcal !== null) ? stretch(of("pet-food"), today, petKcal, kcalOfUnit, "no-energy") : null;

  let runsOutFirst: SupplyOutlook["runsOutFirst"] = null;
  if (food.days !== null && water.days !== null)
    runsOutFirst = food.days <= water.days ? { what: "food", days: food.days } : { what: "water", days: water.days };
  else if (food.days !== null) runsOutFirst = { what: "food", days: food.days };
  else if (water.days !== null) runsOutFirst = { what: "water", days: water.days };

  const dated: DatedRow[] = items
    .filter((item) => item.date !== null && item.dateKind !== null && item.quantity > 0)
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      date: item.date!,
      dateKind: item.dateKind!,
      daysLeft: daysBetween(today, item.date!),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  const upcoming = dated.filter((row) => row.daysLeft >= 0);

  const categories = new Map<SupplyCategory, { rows: number; kcal: number; litres: number }>();
  const locations = new Map<string, { rows: number; categories: Set<SupplyCategory> }>();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const entry = categories.get(item.category) ?? { rows: 0, kcal: 0, litres: 0 };
    entry.rows += 1;
    const kcal = kcalOfUnit(item);
    if ((item.category === "food" || item.category === "pet-food") && kcal !== null && !pastUseBy(item, today))
      entry.kcal += kcal * item.quantity;
    if (item.category === "water" && item.litresPerUnit !== null && !pastUseBy(item, today))
      entry.litres += item.litresPerUnit * item.quantity;
    categories.set(item.category, entry);
    const where = item.location.trim();
    const place = locations.get(where) ?? { rows: 0, categories: new Set() };
    place.rows += 1;
    place.categories.add(item.category);
    locations.set(where, place);
  }

  return {
    today,
    daysWanted: household.daysWanted,
    people: people.length,
    pets: pets.length,
    peopleWithoutFigure: people.filter((need) => need.kcal === null).map((need) => need.name || "Someone"),
    food,
    water: {
      ...water,
      basis: household.waterBasis,
      drinkingPerDay,
      allUsesPerDay,
      daysDrinking: daysAt(drinkingPerDay),
      daysAllUses: daysAt(allUsesPerDay),
    },
    petFood,
    runsOutFirst,
    expired: dated.filter((row) => row.daysLeft < 0 && row.dateKind === "use-by"),
    pastBestBefore: dated.filter((row) => row.daysLeft < 0 && row.dateKind === "best-before"),
    within: {
      30: upcoming.filter((row) => row.daysLeft <= 30),
      90: upcoming.filter((row) => row.daysLeft <= 90),
      180: upcoming.filter((row) => row.daysLeft <= 180),
    },
    byCategory: SUPPLY_CATEGORIES.filter((category) => categories.has(category.id)).map((category) => ({
      category: category.id,
      ...categories.get(category.id)!,
    })),
    byLocation: [...locations]
      .map(([location, entry]) => ({ location, rows: entry.rows, categories: [...entry.categories] }))
      .sort((a, b) => (a.location === "" ? 1 : b.location === "" ? -1 : a.location.localeCompare(b.location))),
  };
}

/**
 * A number of days as it is said: "about" it, to one decimal under ten days and whole
 * days from there, never more than the figures behind it support. Rounded down, so that
 * a store is never said to last longer than it does.
 */
export function daysWords(days: number | null): string {
  if (days === null) return "not worked out";
  if (days <= 0) return "none";
  if (days < 0.1) return "less than a tenth of a day";
  if (days < 10) {
    const tenths = Math.floor(days * 10) / 10;
    return `about ${tenths.toFixed(tenths % 1 === 0 ? 0 : 1)} ${tenths === 1 ? "day" : "days"}`;
  }
  return `about ${Math.floor(days)} days`;
}

// ── The shopping list ───────────────────────────────────────────────────────

export type ShoppingReason = "energy" | "water" | "minimum" | "expired" | "own";

export interface ShoppingSuggestion {
  /** The product it buys more of: a barcode, or a name and unit. */
  key: string;
  /** The newest stock row of that product, which a purchase is modelled on. */
  itemId: string | null;
  name: string;
  /** Whole packs; null where no pack can be named (a shortfall with nothing in stock to buy more of). */
  quantity: number | null;
  unit: string;
  reasons: ShoppingReason[];
  note: string;
}

/** The key a product is grouped by: its barcode when it has one, otherwise its name and unit. */
export function productKey(item: Pick<SupplyItem, "barcode" | "name" | "unit">): string {
  const code = item.barcode ? barcodeKey(item.barcode) : null;
  return code ? `b:${code}` : `n:${item.name.trim().toLowerCase().replace(/\s+/g, " ")}|${item.unit.trim().toLowerCase()}`;
}

/**
 * What to buy: replacements for what is past its use-by, enough of each product to reach
 * the minimum set on it, and then, for the days wanted, the shortfall in energy and in
 * water turned into whole packs of what the household already stocks. The shortfall is
 * shared out over those products in proportion to how much of each is held now (the
 * same mix, more of it), or evenly when none is held. What the first two already buy is
 * taken off the shortfall.
 */
export function shoppingSuggestions(items: SupplyItem[], household: Household, today: string): ShoppingSuggestion[] {
  const outlook = supplyOutlook(items, household, today);
  const groups = new Map<string, SupplyItem[]>();
  for (const item of items) {
    const key = productKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const lines = new Map<string, ShoppingSuggestion & { packs: number }>();
  const newest = (rows: SupplyItem[]) => [...rows].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0]!;
  const lineOf = (key: string, rows: SupplyItem[]) => {
    let line = lines.get(key);
    if (!line) {
      const model = newest(rows);
      line = { key, itemId: model.id, name: model.name, quantity: 0, packs: 0, unit: model.unit, reasons: [], note: "" };
      lines.set(key, line);
    }
    return line;
  };
  const add = (line: ShoppingSuggestion & { packs: number }, packs: number, reason: ShoppingReason) => {
    if (packs <= 0) return;
    line.packs += packs;
    if (!line.reasons.includes(reason)) line.reasons.push(reason);
  };

  for (const [key, rows] of groups) {
    const usable = sum(rows.filter((item) => !pastUseBy(item, today)).map((item) => Math.max(0, item.quantity)));
    const expired = sum(rows.filter((item) => pastUseBy(item, today)).map((item) => Math.max(0, item.quantity)));
    const minimum = Math.max(0, ...rows.map((item) => item.minimum ?? 0));
    const toMinimum = minimum > usable ? Math.ceil(minimum - usable - 1e-9) : 0;
    const replace = Math.ceil(expired - 1e-9);
    // A replacement also counts towards the minimum: buy the larger of the two, once.
    const packs = Math.max(toMinimum, replace);
    if (packs > 0) {
      const line = lineOf(key, rows);
      add(line, packs, replace >= toMinimum ? "expired" : "minimum");
      if (toMinimum > 0 && replace > 0) {
        if (!line.reasons.includes("minimum")) line.reasons.push("minimum");
        if (!line.reasons.includes("expired")) line.reasons.push("expired");
      }
    }
  }

  const shortfall = (
    category: SupplyCategory,
    perDay: number,
    days: number | null,
    each: (item: SupplyItem) => number | null,
    reason: ShoppingReason,
    words: (amount: number) => string,
  ) => {
    if (perDay <= 0 || days === null) return;
    let missing = Math.max(0, household.daysWanted - days) * perDay;
    if (missing <= 0) return;
    const products = [...groups].filter(([, rows]) => rows[0]!.category === category && rows.some((item) => (each(item) ?? 0) > 0));
    // What the lines above already buy.
    for (const [key, rows] of products) {
      const line = lines.get(key);
      if (line) missing -= line.packs * (each(newest(rows.filter((item) => (each(item) ?? 0) > 0))) ?? 0);
    }
    if (missing <= 1e-9) return;
    if (products.length === 0) {
      lines.set(`short:${reason}`, {
        key: `short:${reason}`,
        itemId: null,
        name: categoryLabel(category),
        quantity: null,
        packs: 0,
        unit: "",
        reasons: [reason],
        note: words(missing),
      });
      return;
    }
    const held = products.map(([, rows]) =>
      sum(rows.filter((item) => !pastUseBy(item, today)).map((item) => Math.max(0, item.quantity) * (each(item) ?? 0))),
    );
    const total = sum(held);
    products.forEach(([key, rows], index) => {
      const share = total > 0 ? (missing * held[index]!) / total : missing / products.length;
      const unitAmount = each(newest(rows.filter((item) => (each(item) ?? 0) > 0)))!;
      add(lineOf(key, rows), Math.ceil(share / unitAmount - 1e-9), reason);
    });
  };
  const waterPerDay = outlook.water.perDay;
  shortfall(
    "food",
    outlook.food.perDay,
    outlook.food.days,
    kcalOfUnit,
    "energy",
    (kcal) => `About ${Math.ceil(kcal / 100) * 100} kcal more`,
  );
  shortfall(
    "water",
    waterPerDay,
    outlook.water.days,
    (item) => item.litresPerUnit,
    "water",
    (litres) => `About ${Math.ceil(litres)} litres more`,
  );

  return [...lines.values()]
    .filter((line) => line.packs > 0 || line.quantity === null)
    .map(({ packs, ...line }) => ({ ...line, quantity: line.quantity === null ? null : packs }));
}

// ── Barcodes ────────────────────────────────────────────────────────────────

/** The GS1 check digit of the digits before it (EAN-8, UPC-A, EAN-13, GTIN-14 alike). */
export function gs1CheckDigit(body: string): number {
  let total = 0;
  for (let index = 0; index < body.length; index += 1) {
    const digit = body.charCodeAt(body.length - 1 - index) - 48;
    total += digit * (index % 2 === 0 ? 3 : 1);
  }
  return (10 - (total % 10)) % 10;
}

export const validGtin = (code: string): boolean =>
  /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) && gs1CheckDigit(code.slice(0, -1)) === Number(code.at(-1));

/**
 * The form a barcode is matched by. A retail number (EAN-8, UPC-A, EAN-13, GTIN-14) with
 * a right check digit is written as 14 digits, as GS1 stores GTINs, so that a UPC-A read
 * as 12 digits by one scanner and as 13 by another is the same product. Anything else is
 * matched as typed, without spaces.
 */
export function barcodeKey(code: string): string | null {
  const text = code.replace(/\s+/g, "");
  if (!text) return null;
  if (validGtin(text)) return text.padStart(14, "0");
  return text;
}

// ── What the routes answer ──────────────────────────────────────────────────

export interface SuppliesResponse {
  items: SupplyItem[];
  household: Household;
  /** Every location in use, for choosing one. */
  locations: string[];
}

export interface SupplyProduct {
  barcode: string;
  name: string;
  category: SupplyCategory;
  unit: string;
  kcalPerUnit: number | null;
  kcalPer100g: number | null;
  gramsPerUnit: number | null;
  litresPerUnit: number | null;
}

/** `GET /api/supplies/barcodes/:code`: what the inventory knows of a barcode. Nothing is looked up anywhere else. */
export interface BarcodeLookup {
  code: string;
  key: string;
  items: SupplyItem[];
  /** Remembered from an item that had it, which may since have been used up or removed. */
  product: SupplyProduct | null;
}

export interface ShoppingLine {
  id: string;
  source: "worked" | "own";
  itemId: string | null;
  name: string;
  quantity: number | null;
  unit: string;
  reasons: ShoppingReason[];
  note: string;
}

export interface ShoppingList {
  lines: ShoppingLine[];
  workedOutAt: number | null;
  /** The stock or the household changed after the list was worked out. */
  stale: boolean;
}

/** `POST /api/supplies/shopping/:id/bought` */
export interface BoughtInput {
  quantity: number;
  dateKind: SupplyDateKind | null;
  date: string | null;
  location?: string;
  /** For a line with no stock row behind it. */
  category?: SupplyCategory;
}

/**
 * `GET /api/supplies/outlook`: for the scenario planner and anything else that asks how
 * long the supplies last and what is missing.
 */
export interface SupplyOutlookResponse {
  outlook: SupplyOutlook;
  /** What it would take to reach the days wanted, worked out now (not the stored shopping list). */
  missing: ShoppingSuggestion[];
  /** Days of energy said in sentences, with what is not counted (supplies-energy.ts). */
  energy: EnergySummary;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** The columns of Outpost's supplies CSV, in order. A file from elsewhere needs a `name` column; the rest may be missing. */
export const SUPPLY_CSV_COLUMNS = [
  "name",
  "category",
  "quantity",
  "unit",
  "location",
  "date_kind",
  "date",
  "kcal_per_unit",
  "kcal_per_100g",
  "grams_per_unit",
  "litres_per_unit",
  "minimum",
  "barcode",
  "notes",
  "id",
] as const;

export type ImportAction = "add" | "update" | "skip";

export interface ImportPreviewRow {
  /** The line of the file, counting the header as 1. */
  line: number;
  item: SupplyItemInput | null;
  /** Why the row cannot be brought in. */
  error: string | null;
  /** Words about a value that was read with a change (an unknown category taken as "other"). */
  warnings: string[];
  /** An item already in the inventory that this row is the same as: by its id, or the same product, place and date. */
  duplicateOf: { id: string; name: string; by: "id" | "same" } | null;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  /** Columns the file has that are not read. */
  ignoredColumns: string[];
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

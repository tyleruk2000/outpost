/**
 * Energy per food, for Supplies: finding a food in USDA FoodData Central's SR Legacy table
 * by the words a person types, turning its figure per 100 g into a figure for what they
 * hold, keeping a note of where a figure came from, and saying how many days of energy the
 * household holds.
 *
 * The table itself is the server's (apps/server/src/modules/supplies/foods/, made by
 * scripts/build-food-energy.mjs); everything here is plain code on it, so that it can be
 * tested on its own. Energy, not nutrition: a day's kcal says nothing about protein,
 * vitamins or a diet anyone could live on for long.
 */
import { daysWords, type Household, type LeftOut, memberNeeds, type SupplyOutlook } from "./supplies.ts";

// ── The table ───────────────────────────────────────────────────────────────

/** One food as the table holds it: id, description, food group, then per 100 g kcal, protein, fat, carbohydrate (g). */
export type FoodRow = [number, string, number, number, number | null, number | null, number | null];

export interface FoodTable {
  source: string;
  dataset: string;
  release: string;
  releaseWords: string;
  groups: string[];
  foods: FoodRow[];
}

/** A food offered for a name typed: its figures per 100 g of the food as described. */
export interface FoodMatch {
  fdcId: number;
  description: string;
  group: string;
  kcalPer100g: number;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
}

/** `GET /api/supplies/foods?q=`. */
export interface FoodSearchResponse {
  /** "USDA FoodData Central, SR Legacy (April 2018)". */
  source: string;
  matches: FoodMatch[];
}

export const FOOD_SOURCE_NAME = "USDA FoodData Central";

// ── Words ───────────────────────────────────────────────────────────────────

/** Lower case, accents off, anything but letters and digits a space. */
export function plainWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** The plural made singular, the plain English way, so that "tomatoes" finds "Tomatoes" and "tomato" alike. */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

/**
 * British names that the American table spells another way. Each is tried as well as what
 * was typed, never instead of it. Kept short on purpose: a word that both countries use
 * for different things (chips, biscuits) is mapped to the British meaning.
 */
export const BRITISH_NAMES: ReadonlyArray<readonly [british: string, american: string]> = [
  ["aubergine", "eggplant"],
  ["courgette", "zucchini"],
  ["coriander leaves", "coriander cilantro leaves"],
  ["fresh coriander", "coriander cilantro leaves"],
  ["mince", "beef ground"],
  ["minced beef", "beef ground"],
  ["beef mince", "beef ground"],
  ["minced lamb", "lamb ground"],
  ["lamb mince", "lamb ground"],
  ["pork mince", "pork ground"],
  ["plain flour", "wheat flour white all purpose"],
  ["self raising flour", "wheat flour white self rising"],
  ["wholemeal flour", "wheat flour whole grain"],
  ["strong flour", "wheat flour white bread"],
  ["bread flour", "wheat flour white bread"],
  ["cornflour", "cornstarch"],
  ["porridge oats", "cereals oats regular quick"],
  ["porridge", "cereals oats regular quick"],
  ["rolled oats", "cereals oats regular quick"],
  ["oats", "cereals oats regular quick"],
  ["crisps", "snacks potato chips"],
  ["chips", "potatoes french fried"],
  ["biscuits", "cookies"],
  ["digestive biscuits", "cookies graham crackers"],
  ["digestives", "cookies graham crackers"],
  ["sweets", "candies"],
  ["tinned", "canned"],
  ["tin", "canned"],
  ["swede", "rutabagas"],
  ["rocket", "arugula"],
  ["spring onions", "onions spring scallions"],
  ["mangetout", "peas edible podded"],
  ["beetroot", "beets"],
  ["double cream", "cream heavy whipping"],
  ["single cream", "cream light coffee"],
  ["icing sugar", "sugars powdered"],
  ["caster sugar", "sugars granulated"],
  ["sugar", "sugars granulated"],
  ["treacle", "molasses"],
  ["jam", "jams preserves"],
  ["haricot beans", "beans navy"],
  ["sultanas", "raisins golden seedless"],
  ["prawns", "crustaceans shrimp"],
  ["gammon", "pork cured ham"],
  ["sweetcorn", "corn sweet yellow"],
  ["skimmed milk", "milk nonfat"],
  ["semi skimmed milk", "milk reduced fat 2"],
  ["whole milk", "milk whole 3 25"],
  ["milk powder", "milk dry nonfat"],
  ["powdered milk", "milk dry nonfat"],
  ["dried milk", "milk dry nonfat"],
  ["cornflakes", "cereals ready eat corn flakes"],
  ["tomato puree", "tomato products canned paste"],
  ["passata", "tomato products canned puree"],
  ["chopped tomatoes", "tomatoes red ripe canned"],
  ["tinned tomatoes", "tomatoes red ripe canned"],
  ["pilchards", "fish sardine"],
  ["corned beef", "beef cured corned canned"],
  ["spam", "luncheon meat pork canned"],
  ["rapeseed oil", "oil canola"],
];

const lowGroups = new Set([
  "Baby Foods",
  "Fast Foods",
  "Meals, Entrees, and Side Dishes",
  "Restaurant Foods",
  "American Indian/Alaska Native Foods",
  "Branded Food Products Database",
  "Quality Control Materials",
]);

interface Indexed {
  row: FoodRow;
  /** Words of each comma-separated part, singular, leaving out what is in brackets. */
  parts: string[][];
  /** Every word, the bracketed ones too ("garbanzo", "cilantro"). */
  all: Set<string>;
  allList: string[];
  count: number;
  /** As a store cupboard holds it: a part of its own saying raw, dry, dried or uncooked, or one starting "canned". */
  stored: boolean;
  /** The plain kind: "regular", "plain". */
  plain: boolean;
  low: boolean;
  brand: boolean;
}

export interface FoodIndex {
  table: FoodTable;
  foods: Indexed[];
}

/** Words read once, when the table is first asked, so that each search is a pass over arrays. */
export function indexFoods(table: FoodTable): FoodIndex {
  return {
    table,
    foods: table.foods.map((row) => {
      const outside = row[1].replace(/\([^)]*\)/g, " ");
      const parts = outside.split(",").map((part) => plainWords(part).map(singular));
      const words = plainWords(row[1]).map(singular);
      return {
        row,
        parts,
        all: new Set(words),
        allList: [...new Set(words)],
        count: words.length,
        stored: parts.some((part) => (part.length === 1 && ["raw", "dry", "dried", "uncooked"].includes(part[0]!)) || part[0] === "canned"),
        plain: words.includes("regular") || words.includes("plain"),
        low: lowGroups.has(table.groups[row[2]] ?? ""),
        // A maker's name, in capitals in SR Legacy ("KELLOGG'S", "CAMPBELL'S"), but not USDA's own.
        brand: /\b(?!USDA\b|NFS\b)[A-Z]{3,}/.test(row[1]),
      };
    }),
  };
}

/** What was typed, and what its British names stand for in the table (marked, since the list says what they mean). */
export function queryForms(query: string): Array<{ words: string[]; british: boolean }> {
  const typed = plainWords(query);
  if (typed.length === 0) return [];
  const forms = [{ words: typed.map(singular), british: false }];
  const joined = ` ${typed.join(" ")} `;
  const found = BRITISH_NAMES.map(([british, american]) => ({ needle: ` ${plainWords(british).join(" ")} `, american })).filter(
    ({ needle }) => joined.includes(needle),
  );
  // "tinned tomatoes" is one name: "tinned" alone is not tried as well.
  for (const { needle, american } of found) {
    if (found.some((other) => other.needle !== needle && other.needle.includes(needle))) continue;
    forms.push({ words: plainWords(joined.replace(needle, ` ${american} `)).map(singular), british: true });
  }
  return forms;
}

const sameWords = (part: string[] | undefined, words: string[]) =>
  !!part && part.length === words.length && words.every((word) => part.includes(word));
const COVER_BONUS = [30, 15, 8, 4];

function scoreOf(food: Indexed, words: string[]): number | null {
  const last = words.length - 1;
  const fits = (have: string, word: string, at: number) => have === word || (at === last && word.length >= 3 && have.startsWith(word));
  let exact = 0;
  for (const [at, word] of words.entries()) {
    if (food.all.has(word)) exact += 1;
    // The last word may be part typed: "lent" finds "lentils".
    else if (!food.allList.some((have) => fits(have, word, at))) return null;
  }
  // How far into the description the words are all found: "Rice, white" before "Pudding, rice".
  let cover = food.parts.length;
  const seen = new Set<number>();
  for (const [index, part] of food.parts.entries()) {
    words.forEach((word, at) => {
      if (part.some((have) => fits(have, word, at))) seen.add(at);
    });
    if (seen.size === words.length) {
      cover = index;
      break;
    }
  }
  let score = 100 + exact * 5 + (COVER_BONUS[cover] ?? 0);
  // The food itself, not a dish of it: "Rice", "Lentils", "Honey" as the whole first part; "Fish, tuna" as the second.
  if (sameWords(food.parts[0], words)) score += 40;
  else if (sameWords(food.parts[1], words)) score += 20;
  else if (sameWords([...(food.parts[0] ?? []), ...(food.parts[1] ?? [])], words)) score += 40;
  score -= food.parts.length * 2 + food.count * 0.3;
  if (food.stored) score += 10;
  if (food.plain) score += 4;
  if (food.low) score -= 40;
  if (food.brand) score -= 25;
  return score;
}

/** The foods that match the words typed, best first: the plain food before a dish of it. */
export function searchFoods(index: FoodIndex, query: string, limit = 8): FoodMatch[] {
  const forms = queryForms(query).slice(0, 4);
  if (forms.length === 0 || forms[0]!.words.join("").length < 2) return [];
  const scored: Array<{ food: Indexed; score: number }> = [];
  for (const food of index.foods) {
    let best: number | null = null;
    for (const form of forms) {
      const found = scoreOf(food, form.words);
      const score = found === null ? null : found + (form.british ? 20 : 0);
      if (score !== null && (best === null || score > best)) best = score;
    }
    if (best !== null) scored.push({ food, score: best });
  }
  scored.sort((a, b) => b.score - a.score || a.food.row[1].length - b.food.row[1].length || a.food.row[0] - b.food.row[0]);
  return scored.slice(0, limit).map(({ food }) => matchOf(index.table, food.row));
}

export function matchOf(table: FoodTable, row: FoodRow): FoodMatch {
  return {
    fdcId: row[0],
    description: row[1],
    group: table.groups[row[2]] ?? "",
    kcalPer100g: row[3],
    proteinG: row[4],
    fatG: row[5],
    carbohydrateG: row[6],
  };
}

// ── Units ───────────────────────────────────────────────────────────────────

export const GRAMS_PER_POUND = 453.59237;
export const GRAMS_PER_OUNCE = 28.349523125;

/**
 * Grams in one of a unit, where the unit is itself a weight: "g", "kg", "lb", "oz", or a
 * weight with a number ("500 g", "1.5kg"). Null for anything else: a tin, a pack, a litre
 * (a litre of oil and of honey weigh different amounts). Never guessed.
 */
export function gramsInUnit(unit: string): number | null {
  const match =
    /^\s*(\d+(?:[.,]\d+)?)?\s*(g|gs|gr|grams?|grammes?|kg|kgs|kilos?|kilograms?|kilogrammes?|lb|lbs|pounds?|oz|ounces?)\.?\s*$/i.exec(unit);
  if (!match) return null;
  const count = match[1] ? Number(match[1].replace(",", ".")) : 1;
  if (!Number.isFinite(count) || count <= 0) return null;
  const word = match[2]!.toLowerCase();
  const each = /^k/.test(word) ? 1000 : /^(lb|pound)/.test(word) ? GRAMS_PER_POUND : /^(oz|ounce)/.test(word) ? GRAMS_PER_OUNCE : 1;
  return Math.round(count * each * 1000) / 1000;
}

// ── Where a figure came from ────────────────────────────────────────────────

/**
 * A figure taken from the table is recorded as one line of the item's notes, so that it
 * travels with the item (its page, the CSV, a backup) without a column of its own. The line
 * goes as soon as the figure is changed by hand: the label always wins.
 */
export interface EnergyNote {
  dataset: string;
  release: string;
  fdcId: number;
  description: string;
  kcalPer100g: number;
}

const NOTE_LINE =
  /^Energy from USDA FoodData Central, (.+?) \((.+?)\), food (\d+), “(.+)”: ([\d.]+) kcal per 100 g\. Check the label; products differ\.$/;

export function energyNoteLine(note: EnergyNote): string {
  return `Energy from USDA FoodData Central, ${note.dataset} (${note.release}), food ${note.fdcId}, “${note.description}”: ${note.kcalPer100g} kcal per 100 g. Check the label; products differ.`;
}

export function readEnergyNote(notes: string): EnergyNote | null {
  for (const line of notes.split("\n")) {
    const match = NOTE_LINE.exec(line.trim());
    if (match)
      return { dataset: match[1]!, release: match[2]!, fdcId: Number(match[3]), description: match[4]!, kcalPer100g: Number(match[5]) };
  }
  return null;
}

/** The notes with the line about the table taken out. */
export function withoutEnergyNote(notes: string): string {
  return notes
    .split("\n")
    .filter((line) => !NOTE_LINE.test(line.trim()))
    .join("\n")
    .replace(/\n+$/, "");
}

/** The notes with the line put back, last, when the figure is still the table's. */
export function withEnergyNote(notes: string, note: EnergyNote | null): string {
  const own = withoutEnergyNote(notes);
  if (!note) return own;
  return own ? `${own}\n${energyNoteLine(note)}` : energyNoteLine(note);
}

// ── Days of energy ──────────────────────────────────────────────────────────

export interface EnergySummary {
  days: number | null;
  perDay: number;
  people: number;
  /** People whose need is the table's, and people whose need was given by the household. */
  fromTable: number;
  stated: number;
  /** Food rows counted, and those not counted because they have no energy figure. */
  counted: number;
  uncounted: LeftOut[];
  sentences: {
    /** "The food holds about 4.2 days of energy for 2 people." */
    days: string;
    /** "That is 18,250 kcal against 4,500 kcal a day: …" */
    basis: string;
    /** "3 food items have no energy figure and are not counted: …"; null when every one has. */
    uncounted: string | null;
    /** Energy, not nutrition. */
    caveat: string;
  };
}

const thousands = (value: number) => Math.round(value).toLocaleString("en-GB");
const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
const listed = (names: string[], most = 6) =>
  names.length <= most ? names.join(", ") : `${names.slice(0, most).join(", ")} and ${names.length - most} more`;

/** Whose daily figures the table under Household is: the same table as ENERGY_SOURCE, said shortly. */
export const DAILY_ENERGY_SOURCE = "Public Health England, Government Dietary Recommendations (August 2016)";

export const ENERGY_CAVEAT =
  "This is energy only: it says nothing about protein, vitamins or a diet to live on for long, and the figures are averages, not your packets.";

/** How many days of energy the household holds, on what daily figure, and what is not counted: the sentences the screen and the API both say. */
export function energySummary(outlook: SupplyOutlook, household: Household): EnergySummary {
  const people = memberNeeds(household).filter((need) => need.kind === "person");
  const fromTable = people.filter((need) => need.kcalFrom === "table").length;
  const stated = people.filter((need) => need.kcalFrom === "stated").length;
  const { food } = outlook;
  const uncounted = food.leftOut.filter((row) => row.reason === "no-energy");
  const wanted = outlook.daysWanted;

  let days: string;
  if (people.length === 0) days = "There is nobody in the household to work the days of energy out for.";
  else if (food.days === null) days = "The days of energy cannot be worked out: nobody in the household has an energy figure.";
  else
    days = `The food holds ${daysWords(food.days)} of energy for ${count(people.length, "person", "people")}${
      food.days < wanted ? `, of the ${count(wanted, "day", "days")} wanted` : ""
    }.`;

  const whose: string[] = [];
  if (fromTable > 0)
    whose.push(
      `${fromTable === people.length ? "each person's" : count(fromTable, "person's", "people's")} figure for their age and sex from ${DAILY_ENERGY_SOURCE}`,
    );
  if (stated > 0) whose.push(`${count(stated, "figure", "figures")} you gave under Household`);
  const basis =
    food.perDay > 0
      ? `That is ${thousands(food.counted)} kcal in ${count(food.items, "item", "items")} against ${thousands(food.perDay)} kcal a day: ${whose.join(", and ")}.`
      : `${thousands(food.counted)} kcal is counted in ${count(food.items, "item", "items")}.`;

  const unique = [...new Set(uncounted.map((row) => row.name))];
  const uncountedWords =
    uncounted.length === 0
      ? null
      : `${count(uncounted.length, "food item has", "food items have")} no energy figure and ${uncounted.length === 1 ? "is" : "are"} not counted: ${listed(unique)}.`;

  return {
    days: food.days,
    perDay: food.perDay,
    people: people.length,
    fromTable,
    stated,
    counted: food.items,
    uncounted,
    sentences: { days, basis, uncounted: uncountedWords, caveat: ENERGY_CAVEAT },
  };
}

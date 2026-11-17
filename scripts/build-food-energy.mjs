#!/usr/bin/env node
/**
 * Makes the table of energy per food that Supplies offers when a person types a food's
 * name (apps/server/src/modules/supplies/foods/fdc-sr-legacy.json), from USDA FoodData
 * Central's SR Legacy download as USDA publishes it.
 *
 *   1. Download "SR Legacy, April 2018, CSV" from https://fdc.nal.usda.gov/download-datasets/
 *      (FoodData_Central_sr_legacy_food_csv_2018-04.zip, 6.1 MB) and unzip it.
 *   2. node scripts/build-food-energy.mjs <the unzipped folder> [--zip <the .zip, to record its checksum>]
 *
 * For each of the 7,793 foods it keeps the description, the food group, and four figures
 * per 100 g of the food as described (raw, dry, cooked, canned and drained: whatever the
 * description says): energy in kcal (nutrient 1008, "Energy", KCAL), protein (1003), fat
 * (1004, "Total lipid (fat)") and carbohydrate (1005, "Carbohydrate, by difference"), in
 * grams. Figures are copied as published, not recalculated. A food with no energy figure is
 * left out, and the script says how many.
 *
 * The data are public domain, published under CC0 1.0 (the FoodData Central home page,
 * read 17 November 2026); USDA asks that FoodData Central be named as the source, which the
 * file and the screen do. The script reads only the folder it is given and writes only the
 * table. It needs nothing but Node 24.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  const text = fs.readFileSync(import.meta.filename, "utf8");
  console.log(text.slice(text.indexOf("/**") + 3, text.indexOf("*/")).replace(/^ \* ?/gm, ""));
  process.exit(args.length === 0 ? 1 : 0);
}
const fail = (message) => {
  console.error(`[food energy] ${message}`);
  process.exit(1);
};
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const folder = path.resolve(args[0]);
const zip = option("--zip");
const out = path.resolve(import.meta.dirname, "../apps/server/src/modules/supplies/foods/fdc-sr-legacy.json");
const file = (name) => {
  const full = path.join(folder, name);
  if (!fs.existsSync(full)) fail(`${name} is not in ${folder}. Give the folder the SR Legacy CSV download unzips to.`);
  return full;
};

/** One line of USDA's CSV: every field in double quotes, a quote inside one doubled. */
function fields(line) {
  const values = [];
  let at = 0;
  while (at < line.length) {
    if (line[at] === '"') {
      let value = "";
      at += 1;
      for (;;) {
        const next = line.indexOf('"', at);
        if (next < 0) throw new Error(`An unclosed quote: ${line.slice(0, 80)}`);
        value += line.slice(at, next);
        if (line[next + 1] === '"') {
          value += '"';
          at = next + 2;
        } else {
          at = next + 1;
          break;
        }
      }
      values.push(value);
    } else {
      const next = line.indexOf(",", at);
      values.push(line.slice(at, next < 0 ? line.length : next));
      at = next < 0 ? line.length : next;
    }
    if (line[at] === ",") {
      at += 1;
      if (at === line.length) values.push("");
    }
  }
  return values;
}

async function* rows(name) {
  const lines = readline.createInterface({ input: fs.createReadStream(file(name), "utf8"), crlfDelay: Number.POSITIVE_INFINITY });
  let header = null;
  for await (const line of lines) {
    if (!line) continue;
    const values = fields(line);
    if (!header) {
      header = values;
      continue;
    }
    yield Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]));
  }
}

const NUTRIENTS = { 1008: "kcal", 1003: "protein", 1004: "fat", 1005: "carbohydrate" };

// The nutrients file names the four, so that a renumbered release is caught rather than misread.
for await (const row of rows("nutrient.csv")) {
  const expected = {
    1008: ["Energy", "KCAL"],
    1003: ["Protein", "G"],
    1004: ["Total lipid (fat)", "G"],
    1005: ["Carbohydrate, by difference", "G"],
  }[row.id];
  if (expected && (row.name !== expected[0] || row.unit_name !== expected[1]))
    fail(`Nutrient ${row.id} is "${row.name}" in ${row.unit_name}, not "${expected[0]}" in ${expected[1]}.`);
}

const groups = [];
const groupIndex = new Map();
for await (const row of rows("food_category.csv")) {
  groupIndex.set(row.id, groups.length);
  groups.push(row.description);
}

const foods = new Map();
for await (const row of rows("food.csv")) {
  if (row.data_type !== "sr_legacy_food") continue;
  foods.set(row.fdc_id, { id: Number(row.fdc_id), description: row.description.trim(), group: groupIndex.get(row.food_category_id) ?? -1 });
}

const figures = new Map();
for await (const row of rows("food_nutrient.csv")) {
  const what = NUTRIENTS[row.nutrient_id];
  if (!what || !foods.has(row.fdc_id)) continue;
  const value = Number(row.amount);
  if (row.amount === "" || !Number.isFinite(value) || value < 0) continue;
  const entry = figures.get(row.fdc_id) ?? {};
  if (entry[what] !== undefined && entry[what] !== value) fail(`Food ${row.fdc_id} has two figures for ${what}.`);
  entry[what] = value;
  figures.set(row.fdc_id, entry);
}

const kept = [];
let noEnergy = 0;
for (const [id, food] of foods) {
  const entry = figures.get(id) ?? {};
  if (entry.kcal === undefined) {
    noEnergy += 1;
    continue;
  }
  kept.push([food.id, food.description, food.group, entry.kcal, entry.protein ?? null, entry.fat ?? null, entry.carbohydrate ?? null]);
}
kept.sort((a, b) => a[1].localeCompare(b[1], "en") || a[0] - b[0]);

const table = {
  source: "USDA FoodData Central",
  dataset: "SR Legacy",
  release: "2018-04",
  releaseWords: "April 2018",
  download: "FoodData_Central_sr_legacy_food_csv_2018-04.zip",
  downloadSha256: zip ? createHash("sha256").update(fs.readFileSync(zip)).digest("hex") : null,
  page: "https://fdc.nal.usda.gov/download-datasets/",
  licence: "Public domain, CC0 1.0 Universal",
  citation:
    "U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. Available from https://fdc.nal.usda.gov/.",
  made: "scripts/build-food-energy.mjs",
  per: "100 g of the food as described",
  columns: ["fdcId", "description", "group", "kcal", "proteinG", "fatG", "carbohydrateG"],
  groups,
  foods: kept,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
// One food to a line, so that a later run's changes read plainly in a diff.
const body = JSON.stringify({ ...table, foods: [] }, null, 2).replace(
  '"foods": []',
  `"foods": [\n${kept.map((food) => `    ${JSON.stringify(food)}`).join(",\n")}\n  ]`,
);
fs.writeFileSync(out, `${body}\n`);
console.log(
  `[food energy] ${kept.length} foods written to ${path.relative(process.cwd(), out)}; ${noEnergy} with no energy figure left out.`,
);

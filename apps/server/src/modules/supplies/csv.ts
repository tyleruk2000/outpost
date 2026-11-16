/**
 * Supplies as a CSV file, out and in, so that a person can start from a spreadsheet and
 * keep a copy in one.
 *
 * Out: Outpost's columns (`SUPPLY_CSV_COLUMNS`), one row of stock to a line, with each
 * row's id last, so that a file exported, changed in a spreadsheet and brought back in
 * updates the same rows instead of adding them twice.
 *
 * In: read first, change nothing. Each row is read into an item or refused with the
 * reason, and matched against the inventory: by its id when it has one of ours, or as
 * the same product (barcode, or name and unit) kept in the same place with the same
 * date. The person then chooses, for each duplicate, to skip it, update the item, or add
 * it as another. Headers are matched loosely ("Best before", "Qty", "kcal") so that a
 * spreadsheet someone made themselves is read without renaming its columns.
 */
import {
  barcodeKey,
  type ImportPreview,
  type ImportPreviewRow,
  isCalendarDay,
  productKey,
  SUPPLY_CATEGORIES,
  SUPPLY_CSV_COLUMNS,
  SUPPLY_LIMITS,
  type SupplyCategory,
  type SupplyItem,
  type SupplyItemInput,
} from "@outpost/shared";
import { parse } from "csv-parse/sync";
import { badRequest } from "../../core/errors.ts";

/** One cell: quoted when it holds a comma, a quote or a line break, and never starting a formula in a spreadsheet. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d.]+$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(items: SupplyItem[]): string {
  const lines = [SUPPLY_CSV_COLUMNS.join(",")];
  for (const item of items) {
    lines.push(
      [
        item.name,
        item.category,
        item.quantity,
        item.unit,
        item.location,
        item.dateKind,
        item.date,
        item.kcalPerUnit,
        item.kcalPer100g,
        item.gramsPerUnit,
        item.litresPerUnit,
        item.minimum,
        item.barcode,
        item.notes,
        item.id,
      ]
        .map((value) => cell(value as string | number | null))
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

type Column = (typeof SUPPLY_CSV_COLUMNS)[number];

/** Header words a spreadsheet may use for each column, lower case with spaces and punctuation taken out. */
const ALIASES: Record<Column, string[]> = {
  name: ["name", "item", "product", "description", "what"],
  category: ["category", "type", "kind"],
  quantity: ["quantity", "qty", "count", "number", "amount", "howmany"],
  unit: ["unit", "units", "pack", "packtype"],
  location: ["location", "where", "place", "keptin", "storedin", "store"],
  date_kind: ["datekind", "kindofdate", "datetype"],
  date: ["date", "expiry", "expires", "expirydate", "bestbefore", "bestbeforedate", "bbe", "useby", "usebydate"],
  kcal_per_unit: ["kcalperunit", "kcalperpack", "kcal", "calories", "caloriesperpack", "energy", "energykcal"],
  kcal_per_100g: ["kcalper100g", "caloriesper100g", "energyper100g"],
  grams_per_unit: ["gramsperunit", "grams", "weight", "weightg", "packweight", "g"],
  litres_per_unit: ["litresperunit", "litres", "liters", "volume", "volumel", "l"],
  minimum: ["minimum", "min", "keepatleast", "reorderat"],
  barcode: ["barcode", "ean", "upc", "gtin", "code"],
  notes: ["notes", "note", "comments", "comment"],
  id: ["id", "outpostid"],
};

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

const CATEGORY_WORDS: Array<[RegExp, SupplyCategory]> = [
  [/^(pet ?food|pet|pets|dog food|cat food)$/, "pet-food"],
  [/^(food|tins?|cans?|tinned|dried|pantry|groceries)$/, "food"],
  [/^(water|drink|drinks|bottled water)$/, "water"],
  [/^(fuel|gas|petrol|diesel|paraffin|fuels)$/, "fuel"],
  [/^(medical|medicine|medicines|first aid|first-aid|meds)$/, "medical"],
  [/^(hygiene|toiletries|sanitation|cleaning)$/, "hygiene"],
  [/^(batteries|battery|power)$/, "batteries"],
  [/^(equipment|kit|tools|gear)$/, "equipment"],
  [/^(other|misc|miscellaneous)$/, "other"],
];

function readCategory(text: string): { category: SupplyCategory; warning: string | null } {
  const word = text.trim().toLowerCase();
  if (!word) return { category: "food", warning: null };
  const exact = SUPPLY_CATEGORIES.find((category) => category.id === word || category.label.toLowerCase() === word);
  if (exact) return { category: exact.id, warning: null };
  for (const [pattern, category] of CATEGORY_WORDS) if (pattern.test(word)) return { category, warning: null };
  return { category: "other", warning: `The category “${text.trim()}” is not one Outpost has: read as Other.` };
}

/** A number as people write one in a spreadsheet: "1,250", "2.5", "330 g". Null when the cell is empty; NaN when it is not a number. */
function readNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^([+-]?\d[\d,]*(?:\.\d+)?|[+-]?\.\d+)\s*[a-zA-Z%]*$/.exec(trimmed);
  return match ? Number(match[1]!.replaceAll(",", "")) : Number.NaN;
}

/** A date as a calendar day: 2027-03-31, 31/03/2027 (day first, as in the UK), or 03/2027 (the last day of the month, as a "best before end" reads). */
function readDate(text: string): string | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isCalendarDay(trimmed)) return trimmed;
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(trimmed);
  if (iso && isCalendarDay(`${iso[1]}-${iso[2]}-${iso[3]}`)) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(trimmed);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    const day = `${year}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
    return isCalendarDay(day) ? day : undefined;
  }
  const my = /^(\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (my) {
    const month = Number(my[1]);
    if (month < 1 || month > 12) return undefined;
    const last = new Date(Date.UTC(Number(my[2]), month, 0)).getUTCDate();
    return `${my[2]}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }
  return undefined;
}

export function previewCsv(text: string, existing: SupplyItem[]): ImportPreview {
  if (Buffer.byteLength(text, "utf8") > SUPPLY_LIMITS.csvBytes)
    throw badRequest("That file is larger than Outpost reads as a list of supplies (2 MB).");
  if (/^\s*</.test(text)) throw badRequest("That file looks like a web page, not a CSV file of supplies.");
  let records: string[][];
  try {
    // Semicolons are what a spreadsheet set to European number formats writes.
    const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
    const delimiter =
      (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
        ? ";"
        : firstLine.includes("\t") && !firstLine.includes(",")
          ? "\t"
          : ",";
    records = parse(text, { bom: true, delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true }) as string[][];
  } catch (error) {
    throw badRequest(`That file could not be read as CSV: ${(error as Error).message}`);
  }
  if (records.length === 0) throw badRequest("That file is empty.");
  if (records.length - 1 > SUPPLY_LIMITS.items)
    throw badRequest(`That file has more than ${SUPPLY_LIMITS.items.toLocaleString("en-GB")} rows.`);
  const header = records[0]!.map(squash);
  const index = new Map<Column, number>();
  const ignored: string[] = [];
  header.forEach((word, position) => {
    const column = (Object.keys(ALIASES) as Column[]).find((key) => !index.has(key) && ALIASES[key].includes(word));
    if (column) index.set(column, position);
    else if (records[0]![position]?.trim()) ignored.push(records[0]![position]!.trim());
  });
  if (!index.has("name"))
    throw badRequest("The first row of the file must name its columns, and one of them must be the name of each item (“name”).");
  // A date column headed "Use by" says what kind of date it holds.
  const dateHeader = index.has("date") ? header[index.get("date")!]! : "";
  const headerKind = /useby/.test(dateHeader) ? "use-by" : /bestbefore|bbe/.test(dateHeader) ? "best-before" : null;

  const byId = new Map(existing.map((item) => [item.id, item]));
  const sameKey = (item: Pick<SupplyItem, "barcode" | "name" | "unit" | "location" | "date">) =>
    `${productKey(item)}|${item.location.trim().toLowerCase()}|${item.date ?? ""}`;
  const bySame = new Map(existing.map((item) => [sameKey(item), item]));
  const seenInFile = new Set<string>();

  const rows: ImportPreviewRow[] = records.slice(1).map((record, offset) => {
    const line = offset + 2;
    const get = (column: Column) => (index.has(column) ? (record[index.get(column)!] ?? "").trim() : "");
    const warnings: string[] = [];
    const fail = (error: string): ImportPreviewRow => ({ line, item: null, error, warnings, duplicateOf: null });

    const name = get("name").replace(/^'(?=[=+\-@])/, "");
    if (!name) return fail("It has no name.");
    if (name.length > SUPPLY_LIMITS.name) return fail(`Its name is longer than ${SUPPLY_LIMITS.name} characters.`);
    const { category, warning } = readCategory(get("category"));
    if (warning) warnings.push(warning);
    const numbers: Partial<Record<Column, number | null>> = {};
    for (const column of ["quantity", "kcal_per_unit", "kcal_per_100g", "grams_per_unit", "litres_per_unit", "minimum"] as const) {
      const value = readNumber(get(column));
      if (value !== null && (Number.isNaN(value) || value < 0 || value > SUPPLY_LIMITS.quantity))
        return fail(`“${get(column)}” in the ${column.replaceAll("_", " ")} column is not a number Outpost can use.`);
      numbers[column] = value;
    }
    const date = readDate(get("date"));
    if (date === undefined) return fail(`“${get("date")}” is not a date Outpost can read: write it as 2027-03-31 or 31/03/2027.`);
    const kindText = squash(get("date_kind"));
    const dateKind = !date
      ? null
      : kindText === "useby" || kindText === "expiry"
        ? "use-by"
        : kindText === "bestbefore"
          ? "best-before"
          : (headerKind ?? "best-before");
    if (date && !kindText && !headerKind)
      warnings.push("The file does not say whether the date is a use-by or a best before: read as best before.");
    const barcode = get("barcode").replace(/^'/, "").replace(/\s+/g, "") || null;
    if (barcode && barcode.length > SUPPLY_LIMITS.barcode) return fail("Its barcode is too long.");
    const item: SupplyItemInput = {
      name,
      category,
      quantity: numbers.quantity ?? 1,
      unit: get("unit").slice(0, SUPPLY_LIMITS.unit),
      location: get("location")
        .replace(/^'(?=[=+\-@])/, "")
        .slice(0, SUPPLY_LIMITS.location),
      dateKind,
      date,
      kcalPerUnit: numbers.kcal_per_unit ?? null,
      kcalPer100g: numbers.kcal_per_100g ?? null,
      gramsPerUnit: numbers.grams_per_unit ?? null,
      litresPerUnit: numbers.litres_per_unit ?? null,
      minimum: numbers.minimum ?? null,
      barcode,
      notes: get("notes")
        .replace(/^'(?=[=+\-@])/, "")
        .slice(0, SUPPLY_LIMITS.notes),
    };
    if (barcode && !barcodeKey(barcode)) warnings.push("Its barcode is empty once spaces are taken out.");
    const id = get("id");
    const same = byId.get(id);
    const key = sameKey(item);
    let duplicateOf: ImportPreviewRow["duplicateOf"] = null;
    if (same) duplicateOf = { id: same.id, name: same.name, by: "id" };
    else if (bySame.has(key)) duplicateOf = { id: bySame.get(key)!.id, name: bySame.get(key)!.name, by: "same" };
    if (seenInFile.has(key)) warnings.push("The file has this item more than once.");
    seenInFile.add(key);
    return { line, item, error: null, warnings, duplicateOf };
  });
  return { rows, ignoredColumns: ignored };
}

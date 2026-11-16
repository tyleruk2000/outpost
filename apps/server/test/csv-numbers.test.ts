/**
 * Decimal commas and thousands separators in the CSV importers: the file decides which
 * mark is the decimal one, every numeric column is read the same way, and a cell the file
 * does not settle is reported, not guessed.
 */
import { describe, expect, it } from "vitest";
import { decimalMarkOfCells, readSpreadsheetNumber } from "../src/core/spreadsheet-number.ts";
import { previewCsv } from "../src/modules/supplies/csv.ts";
import { readReadingsCsv } from "../src/modules/weather/csv.ts";

const readCell = (text: string, mark: "," | "." | null) => {
  const read = readSpreadsheetNumber(text, mark);
  return read.kind === "number" ? read.value : read.kind;
};

describe("reading a number from a spreadsheet", () => {
  it.each([
    ["2", ",", 2],
    ["2.5", ".", 2.5],
    ["1,5", ",", 1.5],
    ["1,5", ".", 1.5],
    ["1.234,5", ".", 1234.5],
    ["1.234,5", ",", 1234.5],
    ["1,234.5", ",", 1234.5],
    ["1,234.5", ".", 1234.5],
    ["1,234", ",", 1.234],
    ["1,234", ".", 1234],
    ["1.234", ",", 1234],
    ["1.234", ".", 1.234],
    ["1,234,567", ".", 1234567],
    ["1.234.567", ",", 1234567],
    ["0,250", ".", 0.25],
    ["330 g", ",", 330],
    ["1,5 l", ",", 1.5],
    ["-2,5", ",", -2.5],
    [",5", ",", 0.5],
    ["", ",", "empty"],
    ["1,234", null, "ambiguous"],
    ["1.234", null, "ambiguous"],
    ["2,5", null, 2.5],
    ["1,2,3", ",", "invalid"],
    ["12,34.5", ".", "invalid"],
    ["1.234,5.6", ",", "invalid"],
    ["two", ",", "invalid"],
  ] as const)("%s with %s for decimals is %s", (text, mark, expected) => {
    expect(readCell(text, mark)).toBe(expected);
  });

  it("says how a number was read when it was not plain, and nothing when it was", () => {
    expect(readSpreadsheetNumber("1,5", ",")).toMatchObject({ note: "“1,5” read as 1.5." });
    expect(readSpreadsheetNumber("2.5", ".")).toMatchObject({ note: null });
  });

  it("finds the decimal mark from a file's own cells when the separator does not say", () => {
    expect(decimalMarkOfCells(["Water", "2", "1,5"])).toBe(",");
    expect(decimalMarkOfCells(["Water", "2", "1.5"])).toBe(".");
    expect(decimalMarkOfCells(["1,234.5"])).toBe(".");
    expect(decimalMarkOfCells(["1,234"])).toBe(null);
    expect(decimalMarkOfCells(["1,5", "2.5"])).toBe(null);
  });
});

describe("the supplies importer", () => {
  it("reads a decimal comma in a semicolon file as a decimal, not ten times as much", () => {
    const preview = previewCsv("name;quantity;litres_per_unit\nWater bottle;2;1,5", []);
    expect(preview.rows[0]!.error).toBeNull();
    expect(preview.rows[0]!.item!.litresPerUnit).toBe(1.5);
    expect(preview.rows[0]!.warnings).toContain("“1,5” in the litres per unit column read as 1.5.");
  });

  it("reads every numeric column the same way", () => {
    const preview = previewCsv(
      "name;quantity;kcal_per_unit;kcal_per_100g;grams_per_unit;litres_per_unit;minimum\nRice;1,5;1.234,5;350,5;1.000;0,5;2,5",
      [],
    );
    expect(preview.rows[0]!.item).toMatchObject({
      quantity: 1.5,
      kcalPerUnit: 1234.5,
      kcalPer100g: 350.5,
      gramsPerUnit: 1000,
      litresPerUnit: 0.5,
      minimum: 2.5,
    });
  });

  it("reads thousands separators in a comma file", () => {
    const preview = previewCsv('name,quantity,grams_per_unit\nRice,2,"1,250"', []);
    expect(preview.rows[0]!.item!.gramsPerUnit).toBe(1250);
  });

  it("refuses a value a tab file does not settle, with the reason, rather than guess", () => {
    const preview = previewCsv("name\tquantity\tgrams_per_unit\nRice\t2\t1,250", []);
    expect(preview.rows[0]!.item).toBeNull();
    expect(preview.rows[0]!.error).toContain("could be 1250 or 1.25");
  });

  it("settles a tab file from its other cells", () => {
    const preview = previewCsv("name\tquantity\tgrams_per_unit\nRice\t2\t1,250\nOats\t1\t0,5", []);
    expect(preview.rows[0]!.item!.gramsPerUnit).toBe(1.25);
  });
});

describe("the barometer importer", () => {
  const options = { unit: "hPa" as const, heightM: 0, zone: "UTC", existing: new Set<number>(), now: Date.UTC(2026, 10, 16) };

  it("reads pressures with a thousands separator and a decimal comma", () => {
    const result = readReadingsCsv("time;pressure\n2026-11-01 09:00;1.013,2\n2026-11-01 10:00;1012,5", options);
    expect(result.problems).toEqual([]);
    expect(result.rows.map((row) => row.value)).toEqual([1013.2, 1012.5]);
  });

  it("reads a quoted thousands separator in a comma file", () => {
    const result = readReadingsCsv('time,pressure\n2026-11-01 09:00,"1,013.2"', options);
    expect(result.rows.map((row) => row.value)).toEqual([1013.2]);
  });
});

/**
 * Barometer readings from a CSV file: for a person with a logging barometer or a
 * weather station, so that its data can be brought in without Outpost talking to the
 * device.
 *
 * A header row names the columns, matched loosely: a time ("time", "date", "datetime",
 * "timestamp", or a "date" and a "time" column), a pressure ("pressure", "hpa", "mb",
 * "mbar", "inhg", "value"), and optionally its unit ("unit") and the barometer's height
 * above sea level in metres ("height", "altitude", "elevation"). What a row leaves out
 * comes from what the person chose beside the file. A time with no zone (as a logger
 * writes it) is read in the zone the person's device is in.
 */
import {
  HEIGHT_RANGE,
  type PressureUnit,
  type ReadingImportResult,
  type ReadingImportRow,
  SEA_LEVEL_RANGE,
  seaLevelPressure,
  toHpa,
  WEATHER_LIMITS,
} from "@outpost/shared";
import { parse } from "csv-parse/sync";
import { badRequest } from "../../core/errors.ts";
import { type DecimalMark, decimalMarkOfCells, decimalMarkOfDelimiter, readSpreadsheetNumber } from "../../core/spreadsheet-number.ts";

const squash = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

const TIME = ["time", "datetime", "timestamp", "date", "observationtime", "when", "datetimeutc", "timeutc"];
const PRESSURE = [
  "pressure",
  "pressurehpa",
  "pressuremb",
  "pressureinhg",
  "hpa",
  "mb",
  "mbar",
  "millibars",
  "inhg",
  "value",
  "barometer",
  "baro",
];
const UNIT = ["unit", "units", "pressureunit"];
const HEIGHT = ["height", "heightm", "altitude", "altitudem", "elevation", "elevationm"];

/** Minutes ahead of UTC that a zone is at a moment. */
function zoneOffsetMinutes(at: number, zone: string): number {
  const name =
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(new Date(at))
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** A time as a logger or a spreadsheet writes it, as a moment; null when it is not one. */
export function readTime(text: string, zone: string): number | null {
  const value = text.trim();
  if (/^\d{9,10}$/.test(value)) return Number(value) * 1000;
  if (/^\d{12,13}$/.test(value)) return Number(value);
  // 2026-11-16T09:00Z, 2026-11-16 09:00:00+01:00, 16/11/2026 09:00
  let match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(value);
  let parts: number[];
  let zonePart: string | undefined;
  if (match) {
    parts = [1, 2, 3, 4, 5, 6].map((index) => Number(match![index] ?? 0));
    zonePart = match[7];
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!match) return null;
    // Day first, as in Britain.
    parts = [3, 2, 1, 4, 5, 6].map((index) => Number(match![index] ?? 0));
  }
  const [y, mo, d, h, mi, s] = parts as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (new Date(wall).getUTCDate() !== d) return null;
  if (zonePart) {
    if (zonePart.toUpperCase() === "Z") return wall;
    const sign = zonePart.startsWith("-") ? -1 : 1;
    const digits = zonePart.replace(/[+:-]/g, "");
    return wall - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  const first = wall - zoneOffsetMinutes(wall, zone) * 60_000;
  return wall - zoneOffsetMinutes(first, zone) * 60_000;
}

/** A pressure or a height, with the file's decimal mark; a message when the file does not settle which number it is. */
function readNumber(text: string, mark: DecimalMark | null): number | string | null {
  const cleaned = text.trim().replace(/\s*(hpa|mb|mbar|inhg|in|m)$/i, "");
  const read = readSpreadsheetNumber(cleaned, mark);
  if (read.kind === "ambiguous") return read.message;
  return read.kind === "number" ? read.value : null;
}

function readUnit(text: string): PressureUnit | null {
  const word = squash(text);
  if (word === "hpa" || word === "mb" || word === "mbar" || word === "millibar" || word === "millibars") return "hPa";
  if (word === "inhg" || word === "in" || word === "inches") return "inHg";
  return null;
}

export interface ReadCsvOptions {
  unit: PressureUnit;
  heightM: number;
  zone: string;
  /** Times already kept, to mark rows that would add the same reading twice. */
  existing: Set<number>;
  now: number;
}

export function readReadingsCsv(text: string, options: ReadCsvOptions): ReadingImportResult {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : firstLine.includes("\t") && !firstLine.includes(",")
        ? "\t"
        : ",";
  let records: string[][];
  try {
    records = parse(text, { bom: true, delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true }) as string[][];
  } catch (error) {
    throw badRequest(`That file could not be read as CSV: ${(error as Error).message}`);
  }
  if (records.length < 2) throw badRequest("That file has no readings under its header row.");
  if (records.length - 1 > WEATHER_LIMITS.readings)
    throw badRequest(`That file has more than ${WEATHER_LIMITS.readings.toLocaleString("en-GB")} rows.`);
  const header = records[0]!.map(squash);
  const find = (names: string[]) => header.findIndex((name) => names.includes(name));
  const dateColumn = header.indexOf("date");
  const timeOnlyColumn = header.indexOf("time");
  const separateDateAndTime = dateColumn !== -1 && timeOnlyColumn !== -1;
  const timeColumn = separateDateAndTime ? -1 : find(TIME);
  const pressureColumn = find(PRESSURE);
  const unitColumn = find(UNIT);
  const heightColumn = find(HEIGHT);
  if (pressureColumn === -1) throw badRequest('That file has no column of pressures. Name it "pressure", "hPa", "mb" or "inHg".');
  if (timeColumn === -1 && !separateDateAndTime)
    throw badRequest('That file has no column of times. Name it "time", or have a "date" and a "time" column.');
  const headerUnit = readUnit(header[pressureColumn]!.replace(/^pressure/, ""));

  const mark: DecimalMark | null =
    decimalMarkOfDelimiter(delimiter) ??
    decimalMarkOfCells(
      records.slice(1).flatMap((record) => [record[pressureColumn] ?? "", heightColumn === -1 ? "" : (record[heightColumn] ?? "")]),
    );

  const rows: ReadingImportRow[] = [];
  const problems: ReadingImportResult["problems"] = [];
  const seen = new Set<number>();
  for (const [index, record] of records.slice(1).entries()) {
    const line = index + 2;
    const problem = (message: string) => problems.push({ line, message });
    const cell = (column: number) => (column === -1 ? "" : (record[column] ?? "").trim());
    const timeText = separateDateAndTime ? `${cell(dateColumn)} ${cell(timeOnlyColumn)}` : cell(timeColumn);
    const takenAt = readTime(timeText, options.zone);
    if (takenAt === null) {
      problem(`"${timeText.slice(0, 40)}" is not a date and time Outpost can read.`);
      continue;
    }
    if (takenAt > options.now + 10 * 60_000) {
      problem("The time is in the future.");
      continue;
    }
    const value = readNumber(cell(pressureColumn), mark);
    if (typeof value === "string") {
      problem(value);
      continue;
    }
    if (value === null) {
      problem(`"${cell(pressureColumn).slice(0, 20)}" is not a pressure.`);
      continue;
    }
    const unitText = cell(unitColumn);
    const unit = unitText ? readUnit(unitText) : (headerUnit ?? options.unit);
    if (!unit) {
      problem(`"${unitText.slice(0, 20)}" is not a unit Outpost knows; use hPa, mb or inHg.`);
      continue;
    }
    const heightText = cell(heightColumn);
    const heightM = heightText ? readNumber(heightText, mark) : options.heightM;
    if (typeof heightM === "string") {
      problem(heightM);
      continue;
    }
    if (heightM === null || heightM < HEIGHT_RANGE.min || heightM > HEIGHT_RANGE.max) {
      problem(`The height must be between ${HEIGHT_RANGE.min} and ${HEIGHT_RANGE.max} metres.`);
      continue;
    }
    const seaLevelHpa = seaLevelPressure(toHpa(value, unit), heightM);
    if (seaLevelHpa < SEA_LEVEL_RANGE.min || seaLevelHpa > SEA_LEVEL_RANGE.max) {
      problem(
        `${value} ${unit} at ${heightM} m is ${seaLevelHpa.toFixed(0)} hPa at sea level, outside ${SEA_LEVEL_RANGE.min} to ${SEA_LEVEL_RANGE.max}. Check the unit and the height.`,
      );
      continue;
    }
    if (seen.has(takenAt)) {
      problem("Another row of the file has the same time.");
      continue;
    }
    seen.add(takenAt);
    rows.push({ line, takenAt, value, unit, heightM, seaLevelHpa, duplicate: options.existing.has(takenAt) });
  }
  return { rows, problems, added: 0 };
}

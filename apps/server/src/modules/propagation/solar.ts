/**
 * The solar cycle table: the smoothed sunspot number predicted for each month, which is
 * the one figure about the Sun the engine takes.
 *
 * A copy ships with Outpost (`engines/solar/`), as NOAA's Space Weather Prediction
 * Center published it on the date recorded beside it. A person can fetch a newer one
 * through the download manager; that copy is checked, recorded as a collection in the
 * storage location they chose, and a second copy (17 kB) is kept in the data directory
 * so that predictions do not depend on a network share being connected.
 *
 * The table is a forecast of a monthly smoothed number. Nothing here knows what the
 * Sun is doing today.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SolarMonth } from "@outpost/shared";
import { appRoot } from "../../core/paths.ts";

export interface SolarTable {
  months: SolarMonth[];
  /** The day the table was published or fetched, YYYY-MM-DD. */
  dataDate: string;
  /** "included" for the copy that ships with Outpost, "downloaded" for one a person fetched. */
  origin: "included" | "downloaded";
  sha256: string;
  bytes: number;
  source: string;
}

interface IncludedManifest {
  file: string;
  bytes: number;
  sha256: string;
  dataDate: string;
  source: string;
  publisher: string;
  licence: string;
  terms: string;
}

/** The most a table may hold. NOAA's has 56 months; this is room for decades. */
const MAX_MONTHS = 1200;
export const MAX_TABLE_BYTES = 1024 * 1024;

export class SolarTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolarTableError";
  }
}

/**
 * Reads NOAA's `predicted-solar-cycle.json`: a list of months, each with `time-tag`
 * ("2026-11") and `predicted_ssn`. Every value is checked; a file that is not this is
 * refused whole rather than partly used.
 */
export function parseSolarTable(text: string): SolarMonth[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SolarTableError("The solar cycle table is not JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new SolarTableError("The solar cycle table holds no months.");
  if (parsed.length > MAX_MONTHS) throw new SolarTableError("The solar cycle table holds more months than Outpost will read.");
  const months: SolarMonth[] = [];
  const seen = new Set<string>();
  const number = (value: unknown, low: number, high: number): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= low && value <= high ? value : null;
  for (const row of parsed) {
    if (typeof row !== "object" || row === null) throw new SolarTableError("The solar cycle table has a row that is not a month.");
    const record = row as Record<string, unknown>;
    const month = record["time-tag"];
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new SolarTableError("The solar cycle table has a row with no month.");
    const ssn = number(record.predicted_ssn, 0, 500);
    if (ssn === null) throw new SolarTableError(`The solar cycle table has no usable sunspot number for ${month}.`);
    if (seen.has(month)) throw new SolarTableError(`The solar cycle table lists ${month} twice.`);
    seen.add(month);
    months.push({ month, ssn, low: number(record.low75_ssn, 0, 500), high: number(record.high75_ssn, 0, 500) });
  }
  return months.sort((a, b) => a.month.localeCompare(b.month));
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function includedManifest(): IncludedManifest {
  return JSON.parse(fs.readFileSync(path.join(appRoot, "engines/solar/solar.json"), "utf8")) as IncludedManifest;
}

/** The table that ships with Outpost. Throws if it is missing or is not the file recorded. */
export function includedSolarTable(): SolarTable {
  const manifest = includedManifest();
  const bytes = fs.readFileSync(path.join(appRoot, "engines/solar", manifest.file));
  const sum = sha256(bytes);
  if (sum !== manifest.sha256) throw new SolarTableError("The solar cycle table that ships with Outpost does not match its checksum.");
  return {
    months: parseSolarTable(bytes.toString("utf8")),
    dataDate: manifest.dataDate,
    origin: "included",
    sha256: sum,
    bytes: bytes.length,
    source: manifest.source,
  };
}

/** Where the working copy of a downloaded table is kept. */
export const downloadedTablePath = (dataDir: string) => path.join(dataDir, "propagation/solar-cycle.json");
const downloadedInfoPath = (dataDir: string) => path.join(dataDir, "propagation/solar-cycle.info.json");

/** Keeps a checked table as the working copy. `dataDate` is the day it was fetched. */
export function keepDownloadedTable(dataDir: string, text: string, info: { dataDate: string; source: string; collectionId: string }): void {
  parseSolarTable(text);
  fs.mkdirSync(path.dirname(downloadedTablePath(dataDir)), { recursive: true });
  fs.writeFileSync(downloadedTablePath(dataDir), text);
  fs.writeFileSync(downloadedInfoPath(dataDir), JSON.stringify(info));
}

export function forgetDownloadedTable(dataDir: string, collectionId: string): void {
  if (downloadedInfo(dataDir)?.collectionId !== collectionId) return;
  fs.rmSync(downloadedTablePath(dataDir), { force: true });
  fs.rmSync(downloadedInfoPath(dataDir), { force: true });
}

function downloadedInfo(dataDir: string): { dataDate: string; source: string; collectionId: string } | null {
  try {
    const info = JSON.parse(fs.readFileSync(downloadedInfoPath(dataDir), "utf8")) as Record<string, unknown>;
    if (typeof info.dataDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(info.dataDate)) return null;
    return { dataDate: info.dataDate, source: String(info.source ?? ""), collectionId: String(info.collectionId ?? "") };
  } catch {
    return null;
  }
}

/** The downloaded table, if there is a good one. A damaged copy is ignored, not trusted. */
export function downloadedSolarTable(dataDir: string): (SolarTable & { collectionId: string }) | null {
  const info = downloadedInfo(dataDir);
  if (!info) return null;
  try {
    const bytes = fs.readFileSync(downloadedTablePath(dataDir));
    if (bytes.length > MAX_TABLE_BYTES) return null;
    return {
      months: parseSolarTable(bytes.toString("utf8")),
      dataDate: info.dataDate,
      origin: "downloaded",
      sha256: sha256(bytes),
      bytes: bytes.length,
      source: info.source,
      collectionId: info.collectionId,
    };
  } catch {
    return null;
  }
}

/** The table predictions use: the newer of the downloaded copy and the included one. */
export function currentSolarTable(dataDir: string): SolarTable {
  const included = includedSolarTable();
  const downloaded = downloadedSolarTable(dataDir);
  return downloaded && downloaded.dataDate >= included.dataDate ? downloaded : included;
}

export const monthOf = (table: SolarTable, month: string): SolarMonth | null => table.months.find((row) => row.month === month) ?? null;

/** Whole days from one YYYY-MM-DD to another (negative when the second is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

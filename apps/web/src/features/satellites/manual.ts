/**
 * Elements a person pastes in (Satellites → Paste elements), ported from LogBook73's
 * manualElements.ts: one two- or three-line TLE, one OMM JSON object, or one OMM KVN
 * block, checked strictly. They stay in this browser tab, are never sent to the server
 * and never mixed with the elements CelesTrak publishes.
 */
import { elementsAgeWarning, hasValidTleChecksum, type OmmElements, ommEpoch, tleEpoch } from "@outpost/shared";
import { satrecOf } from "./engine";

export type ManualFormat = "TLE" | "OMM JSON" | "OMM KVN";

export interface ManualSatellite {
  noradId: number;
  name: string;
  epoch: number;
  format: ManualFormat;
  /** One of the two orbit shapes the engine takes. */
  orbit: { noradId: number; epoch: number } & ({ elements: OmmElements } | { line1: string; line2: string });
  warnings: string[];
}

const DAY_MS = 86_400_000;

function checkEpoch(epoch: number, now: number): void {
  if (epoch > now + DAY_MS) throw new Error("The epoch is more than a day in the future. Check the year and the time zone.");
}

function parseTle(input: string, now: number): ManualSatellite {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
  if (lines.length !== 2 && lines.length !== 3) throw new Error("Paste exactly two TLE lines, with or without a name line before them.");
  const offset = lines.length === 3 ? 1 : 0;
  const line1 = lines[offset] ?? "";
  const line2 = lines[offset + 1] ?? "";
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) throw new Error("TLE line 1 must begin with “1 ” and line 2 with “2 ”.");
  if (line1.length !== 69 || line2.length !== 69) throw new Error("Each TLE line must be exactly 69 characters, its checksum included.");
  if (!hasValidTleChecksum(line1)) throw new Error("TLE line 1 fails its checksum. Copy the whole line again.");
  if (!hasValidTleChecksum(line2)) throw new Error("TLE line 2 fails its checksum. Copy the whole line again.");
  const noradId = Number(line1.slice(2, 7));
  if (!Number.isInteger(noradId) || noradId <= 0 || Number(line2.slice(2, 7)) !== noradId) {
    throw new Error("The catalogue numbers on TLE lines 1 and 2 do not match.");
  }
  const epoch = tleEpoch(line1);
  checkEpoch(epoch, now);
  const orbit = { noradId, epoch, line1, line2 };
  satrecOf(orbit);
  const name = offset === 1 ? (lines[0] ?? "").replace(/^0 /, "").trim() : "";
  const warning = elementsAgeWarning(epoch, now);
  return { noradId, name: name || `NORAD ${noradId}`, epoch, format: "TLE", orbit, warnings: warning ? [warning] : [] };
}

function parseKvn(input: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("COMMENT") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim().toUpperCase();
    if (key) out[key] = line.slice(at + 1).trim();
  }
  if (Object.keys(out).length === 0) throw new Error("OMM KVN must be lines of KEY = VALUE.");
  return out;
}

function needText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`The OMM field ${key} is needed, as text.`);
  return value.trim();
}

function needNumber(row: Record<string, unknown>, key: string, range: { min?: number; max?: number; integer?: boolean } = {}): number {
  const value = Number(row[key]);
  if (row[key] === undefined || row[key] === "" || !Number.isFinite(value)) throw new Error(`The OMM field ${key} must be a number.`);
  if (range.integer && !Number.isInteger(value)) throw new Error(`The OMM field ${key} must be a whole number.`);
  if (range.min !== undefined && value < range.min) throw new Error(`The OMM field ${key} must be at least ${range.min}.`);
  if (range.max !== undefined && value > range.max) throw new Error(`The OMM field ${key} must be no more than ${range.max}.`);
  return value;
}

function parseOmm(input: string, now: number): ManualSatellite {
  let row: Record<string, unknown>;
  let format: ManualFormat;
  const trimmed = input.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`The OMM JSON is not well formed: ${(error as Error).message}`);
    }
    if (Array.isArray(parsed)) {
      if (parsed.length !== 1) throw new Error("The OMM JSON must hold exactly one object.");
      parsed = parsed[0];
    }
    if (!parsed || typeof parsed !== "object") throw new Error("The OMM JSON must be an object.");
    row = parsed as Record<string, unknown>;
    format = "OMM JSON";
  } else {
    row = parseKvn(trimmed);
    format = "OMM KVN";
  }
  const version = row.CCSDS_OMM_VERS;
  if (version !== undefined && !String(version).startsWith("3.") && !String(version).startsWith("2."))
    throw new Error("Only CCSDS OMM versions 2 and 3 are read.");
  const expect = (key: string, wanted: string) => {
    if (row[key] !== undefined && String(row[key]).toUpperCase() !== wanted) throw new Error(`OMM ${key} must be ${wanted} for SGP4.`);
  };
  expect("CENTER_NAME", "EARTH");
  expect("REF_FRAME", "TEME");
  expect("TIME_SYSTEM", "UTC");
  expect("MEAN_ELEMENT_THEORY", "SGP4");
  if (row.EPHEMERIS_TYPE !== undefined && Number(row.EPHEMERIS_TYPE) !== 0) throw new Error("OMM EPHEMERIS_TYPE must be 0 (SGP4).");
  const name = needText(row, "OBJECT_NAME");
  const epochText = needText(row, "EPOCH");
  const epoch = ommEpoch(epochText);
  checkEpoch(epoch, now);
  const noradId = needNumber(row, "NORAD_CAT_ID", { min: 1, integer: true });
  const elements: OmmElements = {
    OBJECT_NAME: name,
    OBJECT_ID: typeof row.OBJECT_ID === "string" ? row.OBJECT_ID.trim() : "",
    EPOCH: epochText,
    MEAN_MOTION: needNumber(row, "MEAN_MOTION", { min: 0.000001, max: 20 }),
    ECCENTRICITY: needNumber(row, "ECCENTRICITY", { min: 0, max: 0.999999 }),
    INCLINATION: needNumber(row, "INCLINATION", { min: 0, max: 180 }),
    RA_OF_ASC_NODE: needNumber(row, "RA_OF_ASC_NODE", { min: 0, max: 360 }),
    ARG_OF_PERICENTER: needNumber(row, "ARG_OF_PERICENTER", { min: 0, max: 360 }),
    MEAN_ANOMALY: needNumber(row, "MEAN_ANOMALY", { min: 0, max: 360 }),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: String(row.CLASSIFICATION_TYPE ?? "U").toUpperCase(),
    NORAD_CAT_ID: noradId,
    ELEMENT_SET_NO: row.ELEMENT_SET_NO === undefined ? 999 : needNumber(row, "ELEMENT_SET_NO", { min: 0, integer: true }),
    REV_AT_EPOCH: row.REV_AT_EPOCH === undefined ? 0 : needNumber(row, "REV_AT_EPOCH", { min: 0, integer: true }),
    BSTAR: needNumber(row, "BSTAR"),
    MEAN_MOTION_DOT: needNumber(row, "MEAN_MOTION_DOT"),
    MEAN_MOTION_DDOT: needNumber(row, "MEAN_MOTION_DDOT"),
  };
  const orbit = { noradId, epoch, elements };
  satrecOf(orbit);
  const warning = elementsAgeWarning(epoch, now);
  return { noradId, name, epoch, format, orbit, warnings: warning ? [warning] : [] };
}

/** One element set, checked, from what a person pasted; throws with the reason in words. */
export function parseManualElements(input: string, now = Date.now()): ManualSatellite {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste a two-line TLE or one OMM object first.");
  return /(^|\n)\s*1 \d{5}/.test(trimmed) ? parseTle(trimmed, now) : parseOmm(trimmed, now);
}

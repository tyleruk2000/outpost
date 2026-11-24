/**
 * What actually happened on the air: contacts made, stations heard, attempts that
 * failed, typed in or read from a logging program's ADIF file, and how they compare
 * with what the engine predicted for the same path and hour.
 *
 * A position is only ever what a person or their log stated. Nothing here, and nothing
 * on the server, works a position out from a callsign or anything else.
 */
import type { JobDto } from "./common.ts";
import type { AntennaSpec, EngineDescription, ModeId, NoiseEnvironment } from "./propagation.ts";

/** "contact": worked both ways. "heard": one station heard the other. "failed": a call that got no answer. */
export type ObservationOutcome = "contact" | "heard" | "failed";

export const OBSERVATION_OUTCOMES: ReadonlyArray<{ id: ObservationOutcome; label: string; meaning: string }> = [
  { id: "contact", label: "A contact", meaning: "Worked both ways. The first station is yours." },
  { id: "heard", label: "Heard, no contact", meaning: "The first station was heard at the second. Yours is the second." },
  { id: "failed", label: "Called, not heard", meaning: "The first station called and the second did not answer. Yours is the first." },
];

export interface ObservationEnd {
  call: string;
  /** Null when no position was stated. */
  lat: number | null;
  lon: number | null;
  /** Where the position came from: "coordinates", "locator IO91WM", or "" for none. */
  from: string;
}

export interface Observation {
  id: string;
  /** When, UTC, in milliseconds. */
  at: number;
  frequencyMhz: number | null;
  band: string;
  /** As logged: "SSB", "FT8", "MFSK/JS8". */
  mode: string;
  outcome: ObservationOutcome;
  /** The transmitting end, and the receiving end. For a contact the transmitting end is the station whose log this is. */
  tx: ObservationEnd;
  rx: ObservationEnd;
  /** The transmitting end's power, watts; null when not logged. */
  powerWatts: number | null;
  antenna: string;
  reportSent: string;
  reportReceived: string;
  notes: string;
  /** How the signal travelled, when the log says. */
  propMode: string;
  source: "manual" | "adif";
  importId: string | null;
  createdAt: number;
}

/** `POST /api/radio/observations` */
export interface ObservationInput {
  /** UTC, as an ISO date and time ("2026-11-16T13:37:00Z"). */
  at: string;
  frequencyMhz: number | null;
  band: string;
  mode: string;
  outcome: ObservationOutcome;
  /** `locator`: the Maidenhead locator the position was typed as, said back in the log as given. */
  tx: { call: string; lat: number | null; lon: number | null; locator?: string };
  rx: { call: string; lat: number | null; lon: number | null; locator?: string };
  powerWatts: number | null;
  antenna: string;
  reportSent: string;
  reportReceived: string;
  notes: string;
}

export interface ObservationImport {
  id: string;
  fileName: string;
  /** What the file's header says of itself. */
  adifVersion: string;
  program: string;
  /** Records in the file, how many were brought in, and how many were already in the log. */
  records: number;
  imported: number;
  duplicates: number;
  /** Records not brought in, by reason. */
  skipped: Array<{ reason: string; count: number }>;
  /** Things read with a loss: an end left without a position, and why. */
  notes: Array<{ reason: string; count: number }>;
  createdAt: number;
}

/**
 * What `POST /api/radio/observations/import` answers: the import, for a small file
 * brought in while the request waited, or the job bringing a larger one in. The job's
 * result, when it has succeeded, is `{ kind: "adif-import", import: ObservationImport }`.
 */
export type ObservationImportResponse = { import: ObservationImport; job?: undefined } | { job: JobDto; import?: undefined };

/** `GET /api/radio/observations` */
export interface ObservationList {
  observations: Observation[];
  total: number;
  imports: ObservationImport[];
  /** The job bringing a large file in, while there is one. None of what it has read is in the lists above until it has finished. */
  importing: JobDto | null;
}

/** The ADIF version read for this importer, and the fields it reads. Shown on the screen and in the docs. */
export const ADIF_READ = {
  version: "3.1.8",
  status: "Released ADIF Version 3.1.8, updated 2026-10-12",
  source: "adif.org/318/ADIF_318.htm",
  read: "16 November 2026",
  fields: [
    "QSO_DATE",
    "TIME_ON",
    "CALL",
    "STATION_CALLSIGN",
    "OPERATOR",
    "FREQ",
    "BAND",
    "MODE",
    "SUBMODE",
    "RST_SENT",
    "RST_RCVD",
    "TX_PWR",
    "GRIDSQUARE",
    "MY_GRIDSQUARE",
    "LAT",
    "LON",
    "MY_LAT",
    "MY_LON",
    "MY_ANTENNA",
    "COMMENT",
    "NOTES",
    "SWL",
    "PROP_MODE",
  ],
  header: ["ADIF_VER", "PROGRAMID", "PROGRAMVERSION"],
} as const;

/**
 * The mode a logged contact is compared as: the engine needs a stated requirement, and
 * only these have one. ADIF gives FT8 as a mode, JS8 as a submode of MFSK, and USB and
 * LSB as submodes of SSB. Anything else has no published figure here and is left out
 * of a comparison.
 */
export function comparableMode(logged: string): ModeId | null {
  const [mode = "", submode = ""] = logged.toUpperCase().split("/");
  if (mode === "SSB" || mode === "USB" || mode === "LSB") return "ssb";
  if (mode === "CW") return "cw";
  if (mode === "FT8") return "ft8";
  if (mode === "JS8" || (mode === "MFSK" && submode === "JS8")) return "js8";
  return null;
}

// ── Comparing with predictions ──────────────────────────────────────────────

/** `POST /api/radio/observations/compare` */
export interface ComparisonRequest {
  /** The antenna assumed at your end of every contact, and at the other station's. */
  myAntenna: AntennaSpec;
  theirAntenna: AntennaSpec;
  /** Man-made noise assumed where every receiving station is. */
  noise: NoiseEnvironment;
  /** The power assumed where the log gives none; null leaves those contacts out. */
  defaultPowerWatts: number | null;
  /** Smoothed sunspot numbers for months the solar table does not reach, by "YYYY-MM". */
  ssnByMonth: Record<string, number>;
}

export type ComparisonLevel = "low" | "middling" | "high";

/** Where the three levels start: reliability below 30% of days is low, from 70% it is high. */
export const COMPARISON_LEVELS: ReadonlyArray<{ id: ComparisonLevel; label: string; from: number }> = [
  { id: "low", label: "Low: under 30% of days", from: 0 },
  { id: "middling", label: "Middling: 30 to 69%", from: 0.3 },
  { id: "high", label: "High: 70% of days or more", from: 0.7 },
];

export const comparisonLevel = (reliability: number): ComparisonLevel =>
  reliability >= 0.7 ? "high" : reliability >= 0.3 ? "middling" : "low";

/** Below this many compared, shares are not shown at all: a percentage of a handful says nothing. */
export const COMPARISON_MIN_FOR_SHARES = 30;
/** The most paths put to the engine for one comparison, newest first. */
export const COMPARISON_MAX_PATHS = 500;

export interface ComparedObservation {
  id: string;
  at: number;
  /** The whole hour the engine's figure is for, 1 to 24. */
  utcHour: number;
  frequencyMhz: number;
  mode: ModeId;
  outcome: ObservationOutcome;
  txCall: string;
  rxCall: string;
  distanceKm: number;
  /** The engine's figures for that path, month, hour and frequency. */
  reliability: number;
  snrDbHz: number;
  ssn: number;
  level: ComparisonLevel;
  /**
   * Set when an antenna of the comparison is a level wire longer than a half-wave on this
   * frequency, so that the engine's figure is approximate. Such entries are counted in
   * `approximateLevels`, not in `levels`: reality against an approximate model says less.
   */
  approximate?: true;
}

export interface ComparisonResult {
  computedAt: number;
  tookMs: number;
  engine: EngineDescription;
  request: ComparisonRequest;
  /** How many observations there are, and how many were compared. */
  total: number;
  compared: number;
  /** For each level, how many of each outcome fell in it. Entries whose figure is approximate are not among them. */
  levels: Array<{ id: ComparisonLevel; contact: number; heard: number; failed: number }>;
  /**
   * The same for the entries on frequencies where an antenna is run as an approximation
   * (`ComparedObservation.approximate`), counted apart. `compared` includes them.
   */
  approximateLevels?: Array<{ id: ComparisonLevel; contact: number; heard: number; failed: number }>;
  /** How many of `compared` are approximate. */
  comparedApproximate?: number;
  /** Observations left out, by reason. */
  excluded: Array<{ reason: string; count: number }>;
  /** Months the solar table does not reach and no number was given for, with how many observations wait on each. */
  monthsWithoutSsn: Array<{ month: string; count: number }>;
  rows: ComparedObservation[];
  /** What the comparison can and cannot show. */
  reading: string[];
}

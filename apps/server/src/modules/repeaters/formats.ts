/**
 * Reading a file of repeaters: which layout it is, which column holds what, and each
 * row as Outpost keeps it. Nothing here touches the database, so all of it can be
 * tested with a string.
 *
 * A file is a CSV with a row of headings, or a JSON list of records, which is read as
 * the same thing: its field names are the headings. Some layouts are recognised by
 * their headings (three files the RSGB's ETCC offers, CHIRP's, the Wireless Institute
 * of Australia's directory, and the list hearham.com offers to applications); anything
 * else is read by matching its headings to what they usually mean, and the person can
 * correct the matching before anything is kept.
 *
 * The ETCC layouts were learned from one copy of each file, fetched from
 * ukrepeater.net on 16 November 2026 to read their headings and the forms their values
 * take. CHIRP's columns and its words for tones and modes are from `chirp_common.py` in
 * CHIRP's own source, read the same day. The Hearham and WIA layouts were learned the
 * same way, from one copy of each file fetched on 16 November 2026 from the address its
 * publisher offers it at. No row of any of them is in this repository: the tests use
 * made-up stations. See docs/sources.md.
 */
import {
  bandOfHz,
  formatMHz,
  isGuessedRepeaterFormat,
  MAX_REPEATER_ROWS,
  ownValue,
  parseBand,
  parseMaidenhead,
  REPEATER_COLUMN_FIELDS,
  REPEATER_MODE_IDS,
  REPEATER_STATUSES,
  type RepeaterBand,
  type RepeaterColumnField,
  type RepeaterColumnMap,
  type RepeaterFields,
  type RepeaterFormatId,
  type RepeaterMode,
  type RepeaterStatus,
} from "@outpost/shared";
import { parse } from "csv-parse";
import { AppError, badRequest } from "../../core/errors.ts";

// ── The file as a table ─────────────────────────────────────────────────────

export interface RepeaterTable {
  /** What the file was: rows and columns, or a JSON list of records. */
  kind: "csv" | "json";
  columns: string[];
  rows: Array<{ line: number; cells: string[] }>;
}

/** No more field names than this are taken from a JSON list. */
const MAX_JSON_COLUMNS = 200;

const tooManyRows = () =>
  new AppError(
    "too_large",
    `That file has more than ${MAX_REPEATER_ROWS.toLocaleString("en-GB")} rows. Split it, or export a smaller area, and import the parts as separate lists.`,
  );

/**
 * A JSON file as a table: a list of records, or an object with one such list in it.
 * Each record's own simple values become cells (a number as it is written, true and
 * false as "1" and "0"); a list or a record inside a record is passed over. The "line"
 * of a row is its place in the list, counting from 2 as a CSV's first row of data does.
 */
function readJsonTable(source: string): RepeaterTable {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw badRequest(
      "That file starts like JSON but could not be read as JSON. Outpost reads repeater lists as CSV, or as a JSON list of records.",
    );
  }
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const listOf = (value: unknown): unknown[] | null => (Array.isArray(value) && value.some(isRecord) ? value : null);
  let list = listOf(parsed);
  if (!list && isRecord(parsed)) {
    for (const key of Object.keys(parsed).slice(0, 50)) {
      list = listOf(parsed[key]);
      if (list) break;
    }
  }
  if (!list) throw badRequest("That JSON file is not a list of records, so there are no rows to read.");
  if (list.length > MAX_REPEATER_ROWS) throw tooManyRows();
  const columns: string[] = [];
  const position = new Map<string, number>();
  for (const record of list.slice(0, 500)) {
    if (!isRecord(record)) continue;
    for (const key of Object.keys(record)) {
      const name = key.trim().slice(0, 80);
      if (!name || position.has(name) || columns.length >= MAX_JSON_COLUMNS) continue;
      position.set(name, columns.length);
      columns.push(name);
    }
  }
  if (columns.length < 2) throw badRequest("The records in that JSON file have no named fields to read.");
  const rows: RepeaterTable["rows"] = [];
  for (const [index, record] of list.entries()) {
    if (!isRecord(record)) continue;
    const cells = columns.map(() => "");
    for (const key of Object.keys(record)) {
      const at = position.get(key.trim().slice(0, 80));
      if (at === undefined) continue;
      const value = record[key];
      if (typeof value === "string") cells[at] = value.slice(0, 4000).trim();
      else if (typeof value === "number" && Number.isFinite(value)) cells[at] = String(value);
      else if (typeof value === "boolean") cells[at] = value ? "1" : "0";
    }
    if (cells.every((cell) => cell === "")) continue;
    rows.push({ line: index + 2, cells });
  }
  return { kind: "json", columns, rows };
}

/** The separator a file uses, judged from its first line: a comma unless semicolons or tabs outnumber them. */
function delimiterOf(text: string): string {
  const first = text.slice(0, 4000).split(/\r?\n/, 1)[0] ?? "";
  const count = (mark: string) => first.split(mark).length - 1;
  const commas = count(",");
  if (count("\t") > commas && count("\t") >= count(";")) return "\t";
  if (count(";") > commas) return ";";
  return ",";
}

/**
 * Reads a CSV into its headings and rows. The parser hands rows over a few hundred at a
 * time, so a large file never holds the server up for longer than one batch.
 */
export async function readTable(text: string): Promise<RepeaterTable> {
  const source = text.replace(/^﻿/, "");
  if (!source.trim()) throw badRequest("That file is empty.");
  // A file that is not text at all (a spreadsheet, a radio's memory image) shows as control characters.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: looking for exactly these
  if (/[\x00-\x08\x0e-\x1f]/.test(source.slice(0, 2000))) {
    throw new AppError(
      "unsupported",
      "That is not a text file. Outpost reads repeater lists as CSV: export the list as CSV from the program or website that holds it.",
    );
  }
  // A page of a website saved in place of the file, or sent in its place by a server that wanted something else.
  if (/^\s*<(!doctype|html|head|body|\?xml)\b/i.test(source.slice(0, 400))) {
    throw new AppError(
      "unsupported",
      "That is a web page, not a list of repeaters. If it was saved from a website, look for the link to the file itself (CSV) on that page.",
    );
  }
  if (/^\s*[[{]/.test(source.slice(0, 200))) return readJsonTable(source);
  const parser = parse(source, {
    delimiter: delimiterOf(source),
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
    info: true,
  });
  let columns: string[] | undefined;
  const rows: RepeaterTable["rows"] = [];
  try {
    for await (const item of parser as AsyncIterable<{ record: string[]; info: { lines: number } }>) {
      if (!columns) {
        columns = item.record.map((cell) => cell.trim());
        continue;
      }
      if (item.record.every((cell) => cell === "")) continue;
      if (rows.length >= MAX_REPEATER_ROWS) throw tooManyRows();
      rows.push({ line: item.info.lines, cells: item.record });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw badRequest(
      `That file could not be read as CSV: ${error instanceof Error ? error.message : "it is not laid out as rows and columns"}.`,
    );
  }
  // Trailing commas, as in the ETCC's files, make an empty last column.
  while (columns && columns.length > 0 && columns.at(-1) === "") columns.pop();
  if (!columns || columns.length < 2) {
    throw badRequest("That file has no row of column headings. Outpost needs the first row to name the columns.");
  }
  return { kind: "csv", columns, rows };
}

// ── Which layout, and which column is what ──────────────────────────────────

const fold = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** The headings of Outpost's own export, in order. Importing one back loses nothing. */
export const OUTPOST_COLUMNS = [
  "callsign",
  "output_mhz",
  "input_mhz",
  "band",
  "modes",
  "ctcss_hz",
  "dcs_code",
  "dmr_colour_code",
  "talkgroups",
  "access_note",
  "channel",
  "place",
  "region",
  "country",
  "latitude",
  "longitude",
  "locator",
  "position_precision_m",
  "antenna_m",
  "keeper",
  "status",
  "status_as_listed",
  "notes",
  "source",
  "data_date",
] as const;

/** CHIRP's columns, in order, from `Memory.CSV_FORMAT` in its source. */
export const CHIRP_COLUMNS = [
  "Location",
  "Name",
  "Frequency",
  "Duplex",
  "Offset",
  "Tone",
  "rToneFreq",
  "cToneFreq",
  "DtcsCode",
  "DtcsPolarity",
  "RxDtcsCode",
  "CrossMode",
  "Mode",
  "TStep",
  "Skip",
  "Power",
  "Comment",
  "URCALL",
  "RPT1CALL",
  "RPT2CALL",
  "DVCODE",
] as const;

interface KnownFormat {
  id: RepeaterFormatId;
  /** Headings that must all be there, lower case. */
  needs: string[];
  /** Field to heading, lower case; resolved to the file's own spelling when matched. */
  map: Partial<Record<RepeaterColumnField, string>>;
}

const KNOWN_FORMATS: KnownFormat[] = [
  {
    id: "outpost",
    needs: ["callsign", "output_mhz", "input_mhz", "status_as_listed", "position_precision_m"],
    map: {
      callsign: "callsign",
      output: "output_mhz",
      input: "input_mhz",
      band: "band",
      modes: "modes",
      ctcss: "ctcss_hz",
      dcs: "dcs_code",
      colourCode: "dmr_colour_code",
      talkgroups: "talkgroups",
      accessNote: "access_note",
      channel: "channel",
      place: "place",
      region: "region",
      country: "country",
      lat: "latitude",
      lon: "longitude",
      locator: "locator",
      antenna: "antenna_m",
      keeper: "keeper",
      status: "status_as_listed",
      notes: "notes",
    },
  },
  {
    id: "etcc-status",
    needs: ["callsign", "band", "channel", "tx mhz", "rx mhz", "modes", "qthr", "where", "status"],
    map: {
      id: "id",
      callsign: "callsign",
      band: "band",
      channel: "channel",
      output: "tx mhz",
      input: "rx mhz",
      antenna: "magl",
      modes: "modes",
      locator: "qthr",
      place: "where",
      region: "etcc region",
      ctcss: "ctcss",
      colourCode: "dmrcc",
      keeper: "keeper",
      lat: "lat",
      lon: "lon",
      status: "status",
    },
  },
  {
    id: "etcc-voice",
    needs: ["repeater", "band", "channel", "tx", "rx", "modes", "qthr", "where", "ctcss/cc"],
    map: {
      callsign: "repeater",
      band: "band",
      channel: "channel",
      output: "tx",
      input: "rx",
      modes: "modes",
      locator: "qthr",
      place: "where",
      region: "region",
      toneOrColourCode: "ctcss/cc",
      keeper: "keeper",
      lat: "lat",
      lon: "lon",
    },
  },
  {
    id: "etcc-all",
    needs: ["call", "band", "chan", "txmhz", "rxmhz", "qthr", "where", "analog", "dmr", "dstar", "fusion"],
    map: {
      callsign: "call",
      band: "band",
      channel: "chan",
      output: "txmhz",
      input: "rxmhz",
      ctcss: "ctcss",
      locator: "qthr",
      place: "where",
      lat: "lat",
      lon: "lon",
    },
  },
  {
    // The JSON list hearham.com offers: frequencies and shifts in whole hertz, the shift with its sign.
    id: "hearham",
    needs: ["id", "callsign", "latitude", "longitude", "frequency", "offset", "encode", "operational"],
    map: {
      id: "id",
      callsign: "callsign",
      output: "frequency",
      offset: "offset",
      modes: "mode",
      ctcss: "encode",
      place: "city",
      lat: "latitude",
      lon: "longitude",
      status: "operational",
      accessNote: "restriction",
      notes: "description",
    },
  },
  {
    // The Wireless Institute of Australia's directory. It gives no positions.
    id: "wia",
    needs: ["output", "input", "call", "location", "service area", "s", "sp", "tone"],
    map: {
      callsign: "call",
      output: "output",
      input: "input",
      place: "location",
      region: "service area",
      status: "s",
      keeper: "sp",
      ctcss: "tone",
    },
  },
  {
    id: "chirp",
    needs: ["location", "name", "frequency", "duplex", "offset", "tone", "rtonefreq", "ctonefreq"],
    map: {
      callsign: "name",
      output: "frequency",
      duplex: "duplex",
      offset: "offset",
      toneMode: "tone",
      ctcss: "rtonefreq",
      dcs: "dtcscode",
      modes: "mode",
      notes: "comment",
    },
  },
];

/** What a heading usually means, most telling first. Used only for a file that is none of the known layouts. */
const SYNONYMS: Array<[RepeaterColumnField, string[]]> = [
  ["callsign", ["callsign", "call sign", "call", "repeater", "station", "name"]],
  [
    "output",
    ["output", "output frequency", "output freq", "output mhz", "frequency", "freq", "tx mhz", "txmhz", "tx", "downlink", "tx frequency"],
  ],
  ["input", ["input", "input frequency", "input freq", "input mhz", "rx mhz", "rxmhz", "rx", "uplink", "rx frequency"]],
  ["offset", ["offset", "shift", "split"]],
  ["duplex", ["duplex", "offset direction", "shift direction", "direction"]],
  ["band", ["band"]],
  ["modes", ["modes", "mode", "type"]],
  ["ctcss", ["ctcss", "ctcss tone", "tone", "pl", "pl tone", "access tone", "uplink tone", "tone up", "ctcss hz", "rtonefreq"]],
  ["toneOrColourCode", ["ctcss/cc"]],
  ["dcs", ["dcs", "dcs code", "dtcs", "dtcscode"]],
  ["colourCode", ["colour code", "color code", "dmr colour code", "dmr color code", "dmrcc", "dmr cc", "cc"]],
  ["talkgroups", ["talkgroups", "talk groups", "talkgroup", "tg", "tgs"]],
  ["accessNote", ["access", "access note", "access notes"]],
  ["channel", ["channel", "chan"]],
  ["place", ["where", "location", "town", "city", "nearest city", "place", "site", "qth", "landmark"]],
  ["region", ["region", "etcc region", "state", "county", "province"]],
  ["country", ["country"]],
  ["lat", ["lat", "latitude"]],
  ["lon", ["lon", "long", "lng", "longitude"]],
  ["locator", ["locator", "qthr", "grid", "grid square", "gridsquare", "maidenhead", "loc"]],
  ["antenna", ["magl", "antenna height", "aerial height", "agl", "height agl"]],
  ["keeper", ["keeper", "sponsor", "trustee", "owner", "operator"]],
  ["status", ["status", "operational status", "use"]],
  ["notes", ["notes", "note", "comment", "comments", "remarks"]],
  ["id", ["id"]],
];

export function detectFormat(columns: string[], kind: "csv" | "json" = "csv"): { format: RepeaterFormatId; mapping: RepeaterColumnMap } {
  const byFolded = new Map<string, string>();
  for (const column of columns) if (!byFolded.has(fold(column))) byFolded.set(fold(column), column);

  for (const known of KNOWN_FORMATS) {
    if (!known.needs.every((heading) => byFolded.has(heading))) continue;
    const mapping: RepeaterColumnMap = {};
    for (const [field, heading] of Object.entries(known.map) as Array<[RepeaterColumnField, string]>) {
      const column = byFolded.get(heading);
      if (column !== undefined) mapping[field] = column;
    }
    return { format: known.id, mapping };
  }

  const mapping: RepeaterColumnMap = {};
  const used = new Set<string>();
  for (const [field, names] of SYNONYMS) {
    for (const name of names) {
      const column = byFolded.get(name);
      if (column === undefined || used.has(column)) continue;
      mapping[field] = column;
      used.add(column);
      break;
    }
  }
  return { format: kind, mapping };
}

/** A mapping sent by the browser, kept to fields that exist and columns that are in the file. */
export function cleanMapping(input: unknown, columns: string[]): RepeaterColumnMap {
  const mapping: RepeaterColumnMap = {};
  if (!input || typeof input !== "object") return mapping;
  for (const field of REPEATER_COLUMN_FIELDS) {
    const column = (input as Record<string, unknown>)[field];
    if (typeof column === "string" && columns.includes(column)) mapping[field] = column;
  }
  return mapping;
}

// ── One value at a time ─────────────────────────────────────────────────────

const numberOf = (text: string): number | null => {
  const tidy = text
    .trim()
    .replace(/^(\d+),(\d+)$/, "$1.$2")
    .replace(/\s*(ghz|mhz|khz|hz|m|w|dbw)$/i, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tidy)) return null;
  const value = Number(tidy);
  return Number.isFinite(value) ? value : null;
};

export type FrequencyUnit = "hz" | "khz" | "mhz" | "ghz";
const UNIT_HZ: Record<FrequencyUnit, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };
/** What is kept as a frequency: 1 MHz to 250 GHz, the top of the highest band in the table. */
const LOWEST_HZ = 1e6;
const HIGHEST_HZ = 250e9;

/** The unit written after a number ("145.5 MHz"), if one is. */
const unitWritten = (text: string): FrequencyUnit | null =>
  (/(ghz|mhz|khz|hz)\s*$/i.exec(text)?.[1]?.toLowerCase() as FrequencyUnit | undefined) ?? null;

/** The unit a column's heading names: "TX MHz", "Frequency (kHz)", "output_mhz", "RXMHz". Null when it names none. */
export function unitOfHeading(heading: string): FrequencyUnit | null {
  // No word ends in "mhz", "khz" or "ghz" by chance; a bare "hz" has to stand by itself.
  const match = /(ghz|mhz|khz)(?![a-z])/i.exec(heading) ?? /(?<![a-z])(hz)(?![a-z])/i.exec(heading);
  return match ? (match[1]!.toLowerCase() as FrequencyUnit) : null;
}

/** A frequency in hertz, or why there is none: `readings` holds what it could be when it cannot be told apart. */
export type FrequencyReading = { hz: number } | { hz: null; readings: number[] };

/**
 * A frequency as lists write it, in hertz.
 *
 * The unit is taken, in this order, from what is written after the number, from
 * `unit` (what the column's heading or the file's layout says), and only then from
 * the number itself. Without a unit a number is read as megahertz, kilohertz and
 * hertz; readings outside 1 MHz to 250 GHz are dropped. If one is left, that is it.
 * If more than one is left, the one that falls in an amateur band is it (the band
 * table is built so that there is never more than one). Otherwise nothing tells them
 * apart, and no frequency is returned: a wrong one a thousand times out would look
 * as sound in the list as a right one.
 */
export function readFrequency(text: string, unit: FrequencyUnit | null = null): FrequencyReading {
  const value = numberOf(text);
  if (value === null || value <= 0) return { hz: null, readings: [] };
  const kept = (hz: number) => hz >= LOWEST_HZ && hz <= HIGHEST_HZ;
  const said = unitWritten(text) ?? unit;
  if (said) {
    const hz = Math.round(value * UNIT_HZ[said]);
    return kept(hz) ? { hz } : { hz: null, readings: [] };
  }
  const readings = [1e6, 1e3, 1].map((scale) => Math.round(value * scale)).filter(kept);
  if (readings.length === 1) return { hz: readings[0]! };
  const inBand = readings.filter((hz) => bandOfHz(hz) !== "other");
  return inBand.length === 1 ? { hz: inBand[0]! } : { hz: null, readings };
}

/** `readFrequency`, for when why there is no frequency does not matter. */
export function parseFrequencyHz(text: string, unit: FrequencyUnit | null = null): number | null {
  return readFrequency(text, unit).hz;
}

/** A shift between output and input, in hertz, without its sign: megahertz unless the number is too large to be. */
function parseShiftHz(text: string, columnUnit: FrequencyUnit | null = null): number | null {
  const value = numberOf(text.replace(/^[+-]/, ""));
  if (value === null) return null;
  const size = Math.abs(value);
  const said = unitWritten(text) ?? columnUnit;
  const unit = said ? UNIT_HZ[said] : null;
  if (unit) return Math.round(size * unit);
  if (size < 100) return Math.round(size * 1e6);
  if (size < 100_000) return Math.round(size * 1e3);
  return Math.round(size);
}

const MODE_WORDS: Record<string, RepeaterMode> = {
  fm: "fm",
  nfm: "fm",
  wfm: "fm",
  analog: "fm",
  analogue: "fm",
  a: "fm",
  dmr: "dmr",
  mototrbo: "dmr",
  dstar: "dstar",
  "d-star": "dstar",
  dv: "dstar",
  fusion: "fusion",
  c4fm: "fusion",
  ysf: "fusion",
  dn: "fusion",
  nxdn: "nxdn",
  p25: "p25",
  apco25: "p25",
  m17: "m17",
  tetra: "tetra",
};

/** The ETCC's one-letter mode flags, from the notes on its API page. Packet and regenerative nodes have no mode here. */
const ETCC_FLAGS: Record<string, RepeaterMode> = {
  A: "fm",
  D: "dstar",
  M: "dmr",
  F: "fusion",
  E: "tetra",
  P: "p25",
  "7": "m17",
  N: "nxdn",
};

const inOrder = (modes: Set<RepeaterMode>) => REPEATER_MODE_IDS.filter((mode) => modes.has(mode));

/** Modes named anywhere in a run of letters, for a list that writes several with nothing between them ("P25YSFD-STAR/FM"). */
const MODES_WITHIN: Array<[RegExp, RepeaterMode]> = [
  [/FM|ANALOG/, "fm"],
  [/DMR/, "dmr"],
  [/D-?STAR/, "dstar"],
  [/YSF|C4FM|FUSION/, "fusion"],
  [/NXDN/, "nxdn"],
  [/P25/, "p25"],
  [/M17/, "m17"],
  [/TETRA/, "tetra"],
];

export function parseModes(text: string, style: "words" | "etcc-letters" | "within"): RepeaterMode[] {
  const found = new Set<RepeaterMode>();
  if (style === "within") {
    const upper = text.toUpperCase();
    for (const [pattern, mode] of MODES_WITHIN) if (pattern.test(upper)) found.add(mode);
    return inOrder(found);
  }
  if (style === "etcc-letters") {
    // "AF", "ADM", and with an access code after a colon ("M:1").
    for (const letter of text.toUpperCase().replace(/:\d+/g, "").replace(/PX/g, "")) {
      const mode = ownValue(ETCC_FLAGS, letter);
      if (mode) found.add(mode);
    }
    return inOrder(found);
  }
  for (const word of text.toLowerCase().split(/[\s,;/|+&]+/)) {
    const mode = ownValue(MODE_WORDS, word);
    if (mode) found.add(mode);
  }
  return inOrder(found);
}

/** A sub-audible tone in hertz, if the text is one. */
function parseTone(text: string): number | null {
  const value = numberOf(text);
  if (value === null || value < 60 || value > 260) return null;
  return Math.round(value * 10) / 10;
}

function parseDcs(text: string): string | null {
  const match = /^(?:d(?:cs|tcs)?\s*)?(\d{1,3})\s*[nri]?$/i.exec(text.trim());
  if (!match || !/^[0-7]+$/.test(match[1]!)) return null;
  return match[1]!.padStart(3, "0");
}

export function parseStatus(text: string): RepeaterStatus {
  const tidy = fold(text);
  if (!tidy) return "unknown";
  if (/^(not operational|off[ -]?air|closed|qrt|inactive|off|no|withdrawn|licen[cs]e (lapsed|expired))$/.test(tidy)) return "off-air";
  if (/reduced/.test(tidy)) return "reduced";
  if (/^(operational|on[ -]?air|active|open|yes|ok|licen[cs]ed)$/.test(tidy)) return "operational";
  return "unknown";
}

const decimalsOf = (text: string): number => /\.(\d+)\s*$/.exec(text.trim())?.[1]?.length ?? 0;

/** Half the last decimal place of a coordinate, in metres: a position written to one place may be 5.6 km out. */
export function precisionOfDecimals(decimals: number): number {
  return Math.max(1, Math.round((111_195 * 10 ** -Math.min(decimals, 6)) / 2));
}

/** Half the diagonal of a locator's cell, in metres. */
export function precisionOfLocator(square: { west: number; south: number; east: number; north: number; lat: number }): number {
  const height = (square.north - square.south) * 111_195;
  const width = (square.east - square.west) * 111_195 * Math.cos((square.lat * Math.PI) / 180);
  return Math.round(Math.hypot(width, height) / 2);
}

const looksLikeCallsign = (text: string) => /^[A-Za-z0-9]{1,3}\d[A-Za-z0-9]*(?:[/-][A-Za-z0-9]+)?$/.test(text);

const clip = (text: string, length: number) => (text.length > length ? text.slice(0, length) : text);

// ── One row ─────────────────────────────────────────────────────────────────

export interface ReadRow extends RepeaterFields {
  line: number;
  band: RepeaterBand;
  /** What ties this row to the same entry in a later copy of the list. */
  key: string;
}

export type RowOutcome =
  | { ok: true; row: ReadRow }
  | { ok: false; line: number; reason: string; text: string }
  /** A row that is not an entry and not a fault: a heading inside the file, or a second listing of a row already read. */
  | { ok: false; ignored: true };

export interface RowReader {
  read(row: { line: number; cells: string[] }): RowOutcome;
  /** Why no row can be read with this mapping, or null when it will do. */
  problem: string | null;
}

/**
 * A reader for the rows of one file. It holds the keys already seen, so that two rows
 * for the same callsign and frequency are still told apart.
 */
export function createRowReader(columns: string[], mapping: RepeaterColumnMap, format: RepeaterFormatId): RowReader {
  const index = new Map(columns.map((column, position) => [column, position]));
  const byFolded = new Map(columns.map((column, position) => [fold(column), position]));
  const seen = new Map<string, number>();
  const etcc = format.startsWith("etcc-");
  const guessed = isGuessedRepeaterFormat(format);
  /** The WIA's file is in sections, each headed by a row that names a mode; and it lists a repeater once for each of its modes. */
  let sectionMode: RepeaterMode | null = null;
  const wiaRows = new Map<string, ReadRow>();

  const problem = !mapping.callsign
    ? "No column is set as the callsign. Choose which column holds it."
    : !mapping.output
      ? "No column is set as the output frequency. Choose which column holds it."
      : null;

  // What says which unit a frequency column is in: its own heading first, then the layout.
  // Every layout Outpost knows by name writes megahertz; a file it does not know says so in a heading or not at all.
  const units = new Map<RepeaterColumnField, FrequencyUnit | null>();
  for (const field of ["output", "input", "offset"] as const) {
    const column = mapping[field];
    units.set(field, (column === undefined ? null : unitOfHeading(column)) ?? (guessed ? null : format === "hearham" ? "hz" : "mhz"));
  }
  const unitOf = (field: "output" | "input" | "offset") => units.get(field) ?? null;
  const notAFrequency = (which: string, text: string, readings: number[]) =>
    readings.length > 1
      ? `The ${which} frequency “${clip(text, 30)}” could be ${readings.map((hz) => `${formatMHz(hz)} MHz`).join(" or ")}, and nothing says which. Name the unit in the column's heading (such as “Output MHz”) or after the number.`
      : `The ${which} frequency “${clip(text, 30)}” is not a frequency.`;

  return {
    problem,
    read({ line, cells }) {
      const get = (field: RepeaterColumnField): string => {
        const column = mapping[field];
        const position = column === undefined ? undefined : index.get(column);
        return position === undefined ? "" : (cells[position] ?? "").trim();
      };
      /** A column this layout always has, read by its heading whatever the mapping says. */
      const raw = (heading: string): string => (cells[byFolded.get(heading) ?? -1] ?? "").trim();
      const skip = (reason: string): RowOutcome => ({ ok: false, line, reason, text: clip(cells.join(", "), 160) });

      if (format === "wia") {
        // "{{2M;FM;VK3}}" heads a section; "{;;}" ends the file.
        const section = /^\{\{?([^;{}]*);([^;{}]*);[^{}]*\}?\}$/.exec(raw("notes"));
        if (section && !get("callsign")) {
          sectionMode = parseModes(section[2] ?? "", "within")[0] ?? null;
          return { ok: false, ignored: true };
        }
      }

      const name = get("callsign").replace(/\s+/g, " ");
      if (!name) return skip("No callsign.");
      let callsign = clip(looksLikeCallsign(name) ? name.toUpperCase() : name, 40);
      // CHIRP has one column for a channel's name, and lists put the town after the callsign in it ("QZ3AB Thornwick").
      let placeFromName = "";
      if (format === "chirp") {
        const parts = /^(\S+)\s+(.+)$/.exec(name);
        if (parts && looksLikeCallsign(parts[1]!)) {
          callsign = clip(parts[1]!.toUpperCase(), 40);
          placeFromName = parts[2]!;
        }
      }

      const outputText = get("output");
      const output = readFrequency(outputText, unitOf("output"));
      if (output.hz === null) return skip(outputText ? notAFrequency("output", outputText, output.readings) : "No output frequency.");
      const outputHz = output.hz;

      // The input: given outright, or as a shift with its direction.
      let inputHz: number | null = null;
      const inputText = format === "wia" && !/\d/.test(get("input")) ? "" : get("input");
      if (inputText) {
        const input = readFrequency(inputText, unitOf("input"));
        if (input.hz === null) return skip(notAFrequency("input", inputText, input.readings));
        inputHz = input.hz;
      } else if (mapping.offset || mapping.duplex) {
        const offsetText = get("offset");
        const duplex = get("duplex").toLowerCase();
        if (mapping.duplex) {
          if (duplex === "split") {
            const transmit = readFrequency(offsetText, unitOf("offset"));
            if (transmit.hz === null) return skip(notAFrequency("transmit", offsetText, transmit.readings));
            inputHz = transmit.hz;
          } else if (duplex === "+" || duplex === "-") {
            const shift = parseShiftHz(offsetText, unitOf("offset"));
            if (shift === null) return skip(`The shift “${clip(offsetText, 30)}” is not a number.`);
            inputHz = outputHz + (duplex === "+" ? shift : -shift);
          } else if (duplex === "" || duplex === "off" || duplex === "simplex" || duplex === "none") {
            // CHIRP's "off" means the radio must not transmit there; with nothing, it transmits where it listens.
            inputHz = duplex === "off" ? null : outputHz;
          } else {
            return skip(`The shift direction “${clip(duplex, 20)}” is not +, - or split.`);
          }
        } else if (offsetText) {
          const shift = parseShiftHz(offsetText, unitOf("offset"));
          if (shift === null) return skip(`The shift “${clip(offsetText, 30)}” is not a number.`);
          inputHz = outputHz + (offsetText.trim().startsWith("-") ? -shift : shift);
        }
        if (inputHz !== null && inputHz < 1e6) {
          // A shift that cannot be right says nothing about where to transmit; in Hearham's list the repeater is still worth having.
          if (format !== "hearham") return skip("The shift takes the input below 1 MHz.");
          inputHz = null;
        }
      }

      // Modes.
      let modes: RepeaterMode[];
      if (format === "etcc-all") {
        const flagged = new Set<RepeaterMode>();
        const flags: Array<[string, RepeaterMode]> = [
          ["analog", "fm"],
          ["dmr", "dmr"],
          ["dstar", "dstar"],
          ["fusion", "fusion"],
        ];
        for (const [heading, mode] of flags) if (/^y/i.test(raw(heading))) flagged.add(mode);
        modes = inOrder(flagged);
      } else if (format === "hearham") {
        modes = parseModes(get("modes"), "within");
      } else if (format === "wia") {
        modes = sectionMode ? [sectionMode] : [];
      } else {
        modes = parseModes(get("modes"), etcc ? "etcc-letters" : "words");
      }

      // Access.
      let ctcssHz: number | null = null;
      let dcsCode: string | null = null;
      let dmrColourCode: number | null = null;
      const accessNotes: string[] = [];
      const accessText = get("accessNote");
      if (accessText) accessNotes.push(accessText);

      const toneText = get("ctcss");
      if (format === "chirp") {
        // CHIRP fills the tone columns with defaults; the Tone column says which of them is in use.
        const toneMode = get("toneMode");
        const cross = raw("crossmode");
        if (toneMode === "Tone") ctcssHz = parseTone(toneText);
        else if (toneMode === "TSQL" || toneMode === "TSQL-R") {
          ctcssHz = parseTone(raw("ctonefreq"));
          accessNotes.push("Tone squelch: the same tone is sent back.");
        } else if (toneMode === "DTCS" || toneMode === "DTCS-R") dcsCode = parseDcs(get("dcs"));
        else if (toneMode === "Cross") {
          if (cross.startsWith("Tone->")) ctcssHz = parseTone(toneText);
          else if (cross.startsWith("DTCS->")) dcsCode = parseDcs(get("dcs"));
          accessNotes.push(`CHIRP cross mode ${cross}: check the tone each way.`);
        }
      } else if (format === "hearham") {
        // One field holds whatever is needed to get in, parts divided by "/": a tone, "CC1", "DCS023", "NAC293".
        for (const part of toneText.split("/").map((item) => item.trim())) {
          if (!part || /^0+(\.0+)?$/.test(part)) continue;
          const colour = /^CC\s*(\d{1,2})$/i.exec(part);
          const dcs = /^D(?:CS)?\s*\d{3}[NRI]?$/i.test(part) ? parseDcs(part) : null;
          if (colour && Number(colour[1]) <= 15) dmrColourCode = Number(colour[1]);
          else if (dcs) dcsCode = dcs;
          else if (parseTone(part) !== null) ctcssHz = parseTone(part);
          else accessNotes.push(`Access as listed: ${clip(part, 40)}.`);
        }
        const node = raw("internet_node");
        if (node) accessNotes.push(`Internet node ${clip(node, 40)}.`);
      } else if (toneText) {
        const tone = parseTone(toneText);
        const dcs = /d(cs|tcs)/i.test(toneText) ? parseDcs(toneText) : null;
        if (dcs) dcsCode = dcs;
        else if (tone !== null) ctcssHz = tone;
        else if (numberOf(toneText) === 1750) accessNotes.push("1750 Hz tone burst.");
        else if (!/^(n\/?a|none|not applicable|-|no)$/i.test(toneText)) accessNotes.push(`Tone as listed: ${clip(toneText, 60)}.`);
      }
      if (format !== "chirp") {
        const dcsText = get("dcs");
        if (dcsText) dcsCode = parseDcs(dcsText) ?? dcsCode;
      }
      const colourText = get("colourCode");
      if (colourText) {
        const value = numberOf(colourText);
        if (value !== null && Number.isInteger(value) && value >= 0 && value <= 15) dmrColourCode = value;
      }
      // The ETCC's voice list puts a tone or a colour code in one column: 0 to 15 with no decimal point is a colour code.
      const either = get("toneOrColourCode");
      if (either) {
        const value = numberOf(either);
        if (value !== null && /^\d{1,2}$/.test(either) && value <= 15) dmrColourCode = value;
        else if (parseTone(either) !== null) ctcssHz = parseTone(either);
        else if (value === 1750) accessNotes.push("1750 Hz tone burst.");
      }

      // Position: coordinates where the list gives them, otherwise the middle of its locator square.
      const locatorText = get("locator").toUpperCase().replace(/\s+/g, "");
      const square = locatorText ? parseMaidenhead(locatorText) : null;
      const latText = get("lat");
      const lonText = get("lon");
      let lat: number | null = null;
      let lon: number | null = null;
      let positionPrecisionMeters: number | null = null;
      if (latText || lonText) {
        const latValue = numberOf(latText);
        const lonValue = numberOf(lonText);
        if (latValue === null || lonValue === null || Math.abs(latValue) > 90 || Math.abs(lonValue) > 180) {
          return skip(`The position “${clip(`${latText}, ${lonText}`, 40)}” is not a latitude and longitude in degrees.`);
        }
        // 0, 0 is how lists write "no position".
        if (latValue !== 0 || lonValue !== 0) {
          lat = latValue;
          lon = lonValue;
          positionPrecisionMeters = precisionOfDecimals(Math.max(decimalsOf(latText), decimalsOf(lonText)));
        }
      }
      if (lat === null && square) {
        lat = Number(square.lat.toFixed(6));
        lon = Number(square.lon.toFixed(6));
        positionPrecisionMeters = precisionOfLocator(square);
      }

      const antennaValue = numberOf(get("antenna"));
      let statusText = clip(get("status"), 80);
      let status = parseStatus(statusText);
      if (format === "hearham") {
        // 1 and 0, for in use and not.
        status = statusText === "1" ? "operational" : statusText === "0" ? "off-air" : "unknown";
        statusText = status === "operational" ? "operational" : status === "off-air" ? "not operational" : "";
      } else if (format === "wia") {
        // The page that offers the file says O is operational and W is operational and carries the weekly broadcast.
        // What its other letters mean is in a document that was not read, so they are kept as written and not interpreted.
        status = statusText === "O" || statusText === "W" ? "operational" : "unknown";
        statusText = statusText ? `status ${statusText} in the directory` : "";
      }
      const bandText = get("band");

      const fields: RepeaterFields = {
        callsign,
        outputHz,
        inputHz,
        modes,
        ctcssHz,
        dcsCode,
        dmrColourCode,
        talkgroups: clip(get("talkgroups"), 500),
        accessNote: clip(accessNotes.join(" "), 500),
        channel: clip(get("channel"), 40),
        place: clip((get("place") || placeFromName).replace(/\s+/g, " "), 120),
        region: clip(get("region"), 80),
        country: clip(get("country") || (format === "wia" ? "Australia" : ""), 80),
        lat,
        lon,
        locator: square ? square.locator : "",
        positionPrecisionMeters,
        antennaMeters: antennaValue !== null && antennaValue >= 0 && antennaValue <= 1000 ? antennaValue : null,
        keeper: clip(get("keeper"), 80),
        status,
        statusText,
        notes: clip(get("notes"), 2000),
      };

      // Outpost's own export says outright what a list can only imply.
      if (format === "outpost") {
        const status = raw("status") as RepeaterStatus;
        if (REPEATER_STATUSES.includes(status)) fields.status = status;
        const precision = numberOf(raw("position_precision_m"));
        if (lat !== null && precision !== null && precision >= 0) fields.positionPrecisionMeters = Math.round(precision);
      }

      // The list's own number for the entry where it has one; otherwise what identifies a repeater on the air.
      // (The whole of a CHIRP name, as before the town was told apart from it, so that lists already held still match.)
      const own = get("id");
      const base = own ? `id:${own}` : `${(format === "chirp" ? name : callsign).toUpperCase()}|${outputHz}`;
      if (format === "wia") {
        // Listed again under another mode: one repeater, with both modes.
        const earlier = wiaRows.get(`${base}|${inputHz}`);
        if (earlier) {
          earlier.modes = inOrder(new Set([...earlier.modes, ...modes]));
          return { ok: false, ignored: true };
        }
      }
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const key = count === 1 ? base : `${base}#${count}`;
      const row: ReadRow = { ...fields, line, band: (bandText && parseBand(bandText)) || bandOfHz(outputHz), key };
      if (format === "wia") wiaRows.set(`${base}|${inputHz}`, row);
      return { ok: true, row };
    },
  };
}

// ── Comparing ───────────────────────────────────────────────────────────────

const FIELD_NAMES: Array<keyof RepeaterFields> = [
  "callsign",
  "outputHz",
  "inputHz",
  "modes",
  "ctcssHz",
  "dcsCode",
  "dmrColourCode",
  "talkgroups",
  "accessNote",
  "channel",
  "place",
  "region",
  "country",
  "lat",
  "lon",
  "locator",
  "positionPrecisionMeters",
  "antennaMeters",
  "keeper",
  "status",
  "statusText",
  "notes",
];

/** Just the fields, in a fixed order: what is kept as "what the list said". */
export function fieldsOf(row: RepeaterFields): RepeaterFields {
  const fields = {} as Record<string, unknown>;
  for (const name of FIELD_NAMES) fields[name] = row[name];
  return fields as unknown as RepeaterFields;
}

export function sameFields(a: RepeaterFields, b: RepeaterFields): boolean {
  return FIELD_NAMES.every((name) => {
    const left = a[name];
    const right = b[name];
    if (Array.isArray(left) && Array.isArray(right)) return left.join(",") === right.join(",");
    return (left ?? null) === (right ?? null);
  });
}

/** What a stored `sourceRow` is, if it is whole: older or damaged rows read as "nothing known". */
export function storedFields(value: unknown): RepeaterFields | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<RepeaterFields>;
  if (typeof row.callsign !== "string" || typeof row.outputHz !== "number" || !Array.isArray(row.modes)) return null;
  return fieldsOf(row as RepeaterFields);
}

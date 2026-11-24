/**
 * Satellite tracking (Radio → Satellites), brought over from LogBook73's tracker.
 *
 * The server keeps the orbital elements and the published transmitters, fetched only
 * when a person presses "Get orbital elements": CelesTrak's general perturbations
 * element sets (the "stations", "amateur" and "weather" groups, in CelesTrak's CSV form
 * of the CCSDS Orbit Mean-Elements Message) and SatNOGS DB's transmitter list. Everything else (positions, passes, the sky track,
 * Doppler) is worked out in the browser from those elements with SGP4.
 *
 * LogBook73 asked CelesTrak for two-line elements (FORMAT=tle). CelesTrak's usage policy
 * (updated 16 November 2026) says that format no longer carries newly catalogued objects,
 * since the five-digit catalogue numbers ran out in July 2026, and asks for FORMAT=csv;
 * so Outpost asks for that, and keeps the fields as published. Two-line elements are
 * still read when a person pastes them in (the helpers below).
 *
 * This file has the API's shapes and the small pure helpers both sides use: reading
 * CelesTrak's CSV, the TLE checksum and epoch, and how old elements may be before the
 * screen says not to trust them.
 */

/** CelesTrak's groups that Outpost keeps, as LogBook73 does. */
export type SatelliteGroup = "stations" | "amateur" | "weather";

export const SATELLITE_GROUPS: ReadonlyArray<{ id: SatelliteGroup; label: string }> = [
  { id: "amateur", label: "Amateur satellites" },
  { id: "stations", label: "Crewed stations" },
  { id: "weather", label: "Weather satellites" },
];

/** A transmitter, transceiver or transponder as SatNOGS DB lists it. Frequencies in Hz. */
export interface SatelliteTransmitter {
  id: string;
  noradId: number;
  description: string;
  /** SatNOGS's "alive": the record says it is in use. */
  alive: boolean;
  /** SatNOGS's status: "active", "inactive", "invalid". */
  status: string;
  /** "Transmitter", "Transceiver" or "Transponder", as SatNOGS gives it. */
  type: string | null;
  /** The mode as SatNOGS names it: "FM", "CW", "USB", "BPSK", "APRS (AFSK 1k2)". */
  mode: string | null;
  uplinkLowHz: number | null;
  uplinkHighHz: number | null;
  downlinkLowHz: number | null;
  downlinkHighHz: number | null;
  /** A linear transponder that turns the band over (an uplink at the bottom comes down at the top). */
  invert: boolean;
  baud: number | null;
  /** When SatNOGS last changed the record, ISO 8601. */
  updatedAt: string | null;
}

/** The OMM mean elements SGP4 needs, under CCSDS's own field names, as CelesTrak's CSV gives them. */
export interface OmmElements {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  /** UTC, ISO 8601 without a zone: "2026-11-21T04:54:08.875296". */
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

export interface SatelliteElements {
  noradId: number;
  name: string;
  /** The international designator, "1998-067A". */
  designator: string | null;
  /** The epoch of the element set, milliseconds. */
  epoch: number;
  elements: OmmElements;
  groups: SatelliteGroup[];
}

/**
 * What SatNOGS DB's satellite list (`/api/satellites/`) says of a satellite, for the
 * "About this satellite" part. Facts only: SatNOGS DB has no free-text description.
 */
export interface SatelliteAbout {
  noradId: number;
  /** SatNOGS's own name: "ISS". */
  name: string;
  /** Its other names, as SatNOGS lists them: ["ZARYA", "RS0ISS", "NA1SS"]. */
  otherNames: string[];
  /** "in orbit", "re-entered" or "future", as SatNOGS gives it. */
  status: string;
  /** ISO 8601 dates, or null where SatNOGS gives none. */
  launched: string | null;
  deployed: string | null;
  decayed: string | null;
  /** An http(s) address, or null. */
  website: string | null;
  /** Who runs it, or null (SatNOGS often writes the word "None"). */
  operator: string | null;
  /** ISO 3166 codes: ["RU", "US"]. */
  countries: string[];
  /** Where SatNOGS's record comes from, as it gives it, or null. */
  citation: string | null;
  /** SatNOGS flags it as sending on frequencies not coordinated for it. */
  frequencyViolator: boolean;
  /** The names of satellites SatNOGS links to this one. */
  associated: string[];
}

/**
 * How a satellite's article was matched to it, strongest first:
 * - "number": a Wikidata item, or the article's own infobox, carries its NORAD catalogue number;
 * - "cospar": the same by its international (COSPAR) designator;
 * - "name": an article goes by one of its names and is about a spacecraft, carrying no other number;
 * - "search": the same, found by a search;
 * - "series": the article is about the series it belongs to (MetOp for METOP-B), and says so.
 */
export type SatelliteWikipediaMatch = "number" | "cospar" | "name" | "search" | "series";

/** An English Wikipedia article's summary, fetched for a satellite when a person pressed for it, and kept. CC BY-SA 4.0. */
export interface SatelliteWikipedia {
  noradId: number;
  /** The article's title: "Fox-1B". */
  title: string;
  /** The article's address on en.wikipedia.org, or in the reader for the copy kept on this Outpost. */
  url: string;
  /** Wikipedia's short description: "American amateur radio satellite", or null. */
  description: string | null;
  /** The summary, as plain text. */
  extract: string;
  foundBy: SatelliteWikipediaMatch;
  /** What it was matched by: "NORAD 39444", "COSPAR 2013-066B", a name ("NA1SS"), or the words searched for. */
  searchedFor: string;
  /** The Wikidata item that tied the article to the satellite ("Q15261051"), or null. */
  wikidataId: string | null;
  /** The Wikipedia copy on this Outpost it was read from, or null when it was read from Wikipedia online. */
  archive: { collectionId: string; title: string; date: string | null } | null;
  /** When the article was last edited, as the summary gives it (ISO 8601), or null. */
  editedAt: string | null;
  fetchedAt: number;
}

/** An article a person discarded for a satellite: it is not offered for that satellite again. */
export interface SatelliteWikipediaDiscarded {
  noradId: number;
  title: string;
}

export interface SatelliteSourceState {
  id: "celestrak" | "satnogs" | "satnogs-satellites";
  label: string;
  url: string;
  /** When the last fetch that worked finished, or null if it never has. */
  fetchedAt: number | null;
  /** How many records that fetch kept. */
  count: number;
  /** What went wrong the last time it was tried, in words, or null. */
  error: string | null;
  /** When it was last tried. */
  triedAt: number | null;
}

export interface SatellitesResponse {
  satellites: SatelliteElements[];
  transmitters: SatelliteTransmitter[];
  /** What SatNOGS DB says of each kept satellite it lists. */
  about: SatelliteAbout[];
  /** The Wikipedia summaries a person fetched, one a satellite at most. */
  wikipedia: SatelliteWikipedia[];
  /** Articles a person discarded, not offered again for that satellite. */
  wikipediaDiscarded: SatelliteWikipediaDiscarded[];
  sources: SatelliteSourceState[];
  /** A fetch is running now. */
  fetching: boolean;
  now: number;
}

export interface SatellitesFetchResponse {
  sources: SatelliteSourceState[];
  /** What was done, in words: "Got 182 satellites from CelesTrak.", "CelesTrak was asked less than 2 hours ago: kept what there is." */
  said: string[];
}

/** Where elements and transmitters come from, and the terms they are kept on. */
export const SATELLITE_SOURCES = {
  celestrak: {
    label: "CelesTrak GP orbital elements",
    url: "https://celestrak.org/NORAD/elements/gp.php",
    terms: "https://celestrak.org/usage-policy.php",
    attribution: "Orbital elements: CelesTrak.",
    /** CelesTrak updates GP data every 2 hours and asks for it once per update at most. */
    updatesEveryMs: 2 * 60 * 60_000,
  },
  satnogs: {
    label: "SatNOGS DB transmitters",
    url: "https://db.satnogs.org/api/transmitters/",
    terms: "https://db.satnogs.org/",
    attribution: "Transmitters: SatNOGS DB, CC BY-SA 4.0.",
    /** About 4 MB; LogBook73 asked once a day at most. */
    updatesEveryMs: 24 * 60 * 60_000,
  },
  "satnogs-satellites": {
    label: "SatNOGS DB satellites",
    url: "https://db.satnogs.org/api/satellites/",
    terms: "https://db.satnogs.org/about",
    attribution: "Satellite details: SatNOGS DB, CC BY-SA 4.0.",
    /** About 1.6 MB; asked once a day at most, as the transmitters are. */
    updatesEveryMs: 24 * 60 * 60_000,
  },
} as const;

/** Where a satellite's Wikipedia summary comes from: asked only when a person presses "Read about it on Wikipedia". */
export const WIKIPEDIA_SOURCE = {
  search: "https://en.wikipedia.org/w/api.php",
  /** Wikidata's Action API: the item that carries a satellite's catalogue number (P377) or COSPAR designator (P247). CC0. */
  wikidata: "https://www.wikidata.org/w/api.php",
  summary: "https://en.wikipedia.org/api/rest_v1/page/summary/",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

// The Earth's gravitational parameter, equatorial radius (WGS 84) and J2 (EGM96), and the sidereal day.
const EARTH_MU_KM3_S2 = 398_600.4418;
const EARTH_RADIUS_KM = 6_378.137;
const SIDEREAL_DAY_S = 86_164.0905;

/** What the elements say of an orbit's shape, for words on screen (not for tracking: SGP4 does that). */
export interface OrbitFacts {
  /** Minutes for one turn. */
  periodMinutes: number;
  /** Mean height above the equator's radius, km (from the semi-major axis). */
  meanHeightKm: number;
  /** Lowest and highest heights, km. */
  perigeeKm: number;
  apogeeKm: number;
  inclinationDeg: number;
  /** It goes round the other way to the Earth's turning (inclination over 90°). */
  retrograde: boolean;
  /** The furthest north and south it passes over: the inclination, or 180° less it when retrograde. */
  latitudeReachDeg: number;
  geostationary: boolean;
  /** Its plane turns with the Sun through the year (J2 nodal precession within 10% of 360° a year). */
  sunSynchronous: boolean;
}

/**
 * The orbit's size from Kepler's third law (a³ = μ / n²), and whether its plane keeps pace
 * with the Sun from the J2 precession, dΩ/dt = −3/2 · J2 · (R/p)² · n · cos i.
 */
export function orbitFacts(elements: Pick<OmmElements, "MEAN_MOTION" | "ECCENTRICITY" | "INCLINATION">): OrbitFacts {
  const n = (elements.MEAN_MOTION * 2 * Math.PI) / 86_400; // radians a second
  const a = Math.cbrt(EARTH_MU_KM3_S2 / (n * n));
  const e = elements.ECCENTRICITY;
  const i = elements.INCLINATION;
  const p = a * (1 - e * e);
  const J2 = 1.082_626_68e-3;
  const nodeDegPerYear = ((-1.5 * J2 * (EARTH_RADIUS_KM / p) ** 2 * n * Math.cos((i * Math.PI) / 180) * 180) / Math.PI) * 365.2422 * 86_400;
  const periodSeconds = 86_400 / elements.MEAN_MOTION;
  return {
    periodMinutes: periodSeconds / 60,
    meanHeightKm: a - EARTH_RADIUS_KM,
    perigeeKm: a * (1 - e) - EARTH_RADIUS_KM,
    apogeeKm: a * (1 + e) - EARTH_RADIUS_KM,
    inclinationDeg: i,
    retrograde: i > 90,
    latitudeReachDeg: i > 90 ? 180 - i : i,
    geostationary: Math.abs(periodSeconds - SIDEREAL_DAY_S) < 0.01 * SIDEREAL_DAY_S && e < 0.01 && i < 5,
    sunSynchronous: Math.abs(nodeDegPerYear - 360) < 36,
  };
}

// ── Two-line elements ────────────────────────────────────────────────────────

/** TLE checksum: the digits, plus one for every minus sign, modulo ten, in column 69. */
export function hasValidTleChecksum(line: string): boolean {
  if (line.length < 69 || !/^\d$/.test(line[68] ?? "")) return false;
  let sum = 0;
  for (const char of line.slice(0, 68)) {
    if (char >= "0" && char <= "9") sum += Number(char);
    else if (char === "-") sum += 1;
  }
  return sum % 10 === Number(line[68]);
}

/** The epoch on line 1 (columns 19 to 32, YYDDD.dddddddd) in milliseconds; years 57 to 99 are 19xx. */
export function tleEpoch(line1: string): number {
  const raw = line1.slice(18, 32).trim();
  if (!/^\d{5}\.\d{1,8}$/.test(raw)) throw new Error(`The epoch "${raw || "blank"}" is not in the form YYDDD.dddddddd.`);
  const year2 = Number(raw.slice(0, 2));
  const day = Number(raw.slice(2));
  if (day < 1 || day >= 367) throw new Error(`The epoch day ${day} is outside 1 to 366.`);
  const year = year2 >= 57 ? 1900 + year2 : 2000 + year2;
  return Date.UTC(year, 0, 1) + (day - 1) * 86_400_000;
}

const NUMBER_FIELDS = [
  "MEAN_MOTION",
  "ECCENTRICITY",
  "INCLINATION",
  "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER",
  "MEAN_ANOMALY",
  "EPHEMERIS_TYPE",
  "NORAD_CAT_ID",
  "ELEMENT_SET_NO",
  "REV_AT_EPOCH",
  "BSTAR",
  "MEAN_MOTION_DOT",
  "MEAN_MOTION_DDOT",
] as const;
const TEXT_FIELDS = ["OBJECT_NAME", "OBJECT_ID", "EPOCH", "CLASSIFICATION_TYPE"] as const;

/** One line of CSV into its cells; a cell may be in double quotes, with "" for a quote inside. */
function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

/** An OMM epoch, which CelesTrak writes without a zone and means as UTC, in milliseconds. */
export function ommEpoch(epoch: string): number {
  const at = Date.parse(/(Z|[+-]\d{2}:\d{2})$/i.test(epoch) ? epoch : `${epoch}Z`);
  if (!Number.isFinite(at)) throw new Error(`The epoch "${epoch}" is not a date and time.`);
  return at;
}

/** CelesTrak's FORMAT=csv answer. Every row must be good, or none is kept. */
export function parseCelestrakCsv(text: string, group: SatelliteGroup): SatelliteElements[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = csvCells(lines[0] ?? "").map((cell) => cell.trim());
  for (const field of [...TEXT_FIELDS, ...NUMBER_FIELDS]) {
    if (!header.includes(field)) throw new Error(`CelesTrak's ${group} list has no ${field} column.`);
  }
  return lines.slice(1).map((line, index) => {
    const cells = csvCells(line);
    const value = (field: string) => (cells[header.indexOf(field)] ?? "").trim();
    const row: Record<string, string | number> = {};
    for (const field of TEXT_FIELDS) row[field] = value(field);
    for (const field of NUMBER_FIELDS) {
      const number = Number(value(field));
      if (value(field) === "" || !Number.isFinite(number))
        throw new Error(`CelesTrak's ${group} list, row ${index + 1}: ${field} is not a number.`);
      row[field] = number;
    }
    const elements = row as unknown as OmmElements;
    if (!Number.isInteger(elements.NORAD_CAT_ID) || elements.NORAD_CAT_ID <= 0)
      throw new Error(`CelesTrak's ${group} list, row ${index + 1}: no catalogue number.`);
    if (!(elements.MEAN_MOTION > 0) || elements.ECCENTRICITY < 0 || elements.ECCENTRICITY >= 1) {
      throw new Error(`CelesTrak's ${group} list, row ${index + 1}: the orbit's elements are out of range.`);
    }
    return {
      noradId: elements.NORAD_CAT_ID,
      name: elements.OBJECT_NAME || `NORAD ${elements.NORAD_CAT_ID}`,
      designator: elements.OBJECT_ID || null,
      epoch: ommEpoch(elements.EPOCH),
      elements,
      groups: [group],
    };
  });
}

// ── How old is too old ─────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** LogBook73's thresholds: past a week, low-orbit pass times may already be off by minutes; past a month, badly. */
export const ELEMENTS_OLD_DAYS = 7;
export const ELEMENTS_VERY_OLD_DAYS = 30;

export type ElementsAge = "fresh" | "old" | "very-old" | "ahead";

export function elementsAge(epoch: number, now: number): ElementsAge {
  const days = (now - epoch) / DAY_MS;
  if (days < -0.05) return "ahead";
  if (days > ELEMENTS_VERY_OLD_DAYS) return "very-old";
  if (days > ELEMENTS_OLD_DAYS) return "old";
  return "fresh";
}

/** The warning for one element set's age, in words, or null when it is recent enough. */
export function elementsAgeWarning(epoch: number, now: number): string | null {
  const days = Math.floor((now - epoch) / DAY_MS);
  switch (elementsAge(epoch, now)) {
    case "very-old":
      return `These elements are ${days} days old. Pass times may be wrong by a lot: get fresh elements before relying on them.`;
    case "old":
      return `These elements are ${days} days old. Pass times of a low satellite may already be minutes out.`;
    case "ahead":
      return "These elements are dated ahead of this server's clock. Check the server's clock (Server status).";
    default:
      return null;
  }
}

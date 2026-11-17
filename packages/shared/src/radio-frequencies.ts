/**
 * Frequencies to listen to (Radio → Frequencies to listen to): where to tune to hear
 * the time, news, warnings, weather and other people when the internet is out.
 *
 * A reference set bundled with the app, like the common devices of the battery
 * calculators (power-devices.ts): every entry names the page it was checked against
 * and the day it was checked, and nothing is fetched. The data is in
 * `radio-frequencies-data.ts` and the files under `radio-frequencies/`; this file has
 * its shape and the small pure helpers the screen and its tests use (formatting a
 * frequency, whether a schedule has run out, the filters). docs/radio-frequencies.md
 * says how the set is kept.
 */

// ── Kinds ───────────────────────────────────────────────────────────────────

export type FrequencyKindId = "time-signals" | "emergency" | "broadcasters" | "weather" | "distress" | "amateur" | "licence-free" | "bands";

export const FREQUENCY_KINDS: ReadonlyArray<{ id: FrequencyKindId; label: string; about: string }> = [
  {
    id: "time-signals",
    label: "Time signals",
    about: "Standard-frequency and time stations, and time on ordinary broadcast radio: set a clock by ear.",
  },
  {
    id: "emergency",
    label: "Emergency broadcasting",
    about: "What each country tells its public to tune to in an emergency, where it says.",
  },
  {
    id: "broadcasters",
    label: "News broadcasters",
    about: "National and international broadcasters on long wave, medium wave and shortwave, and how to find FM and DAB.",
  },
  {
    id: "weather",
    label: "Weather",
    about: "Weather radio, marine forecasts, NAVTEX, weather fax and aviation weather (VOLMET).",
  },
  {
    id: "distress",
    label: "Distress and calling",
    about: "Marine and aviation distress, safety and calling frequencies, to listen on.",
  },
  {
    id: "amateur",
    label: "Amateur radio",
    about: "Emergency centres of activity, nets, calling frequencies, beacons and digital-mode dial frequencies.",
  },
  {
    id: "licence-free",
    label: "Licence-free radio",
    about: "PMR446, CB, FRS, GMRS, MURS, UHF CB and the like: the channels people will actually be using.",
  },
  {
    id: "bands",
    label: "Bands, for hunting",
    about: "What lives where across the spectrum a home radio covers.",
  },
];

export const FREQUENCY_KIND_IDS = FREQUENCY_KINDS.map((kind) => kind.id);

export function kindLabel(id: FrequencyKindId): string {
  return FREQUENCY_KINDS.find((kind) => kind.id === id)?.label ?? id;
}

// ── Modes ───────────────────────────────────────────────────────────────────

/**
 * How a mode can be received: `am` and `fm` (broadcast FM, wide) and `nfm` (narrow
 * FM, two-way radio) on an ordinary set; `ssb` and `cw` need a set with SSB (a BFO);
 * `digital` needs a decoder (a computer with an SDR or a receiver's audio, or a
 * dedicated receiver such as a NAVTEX set); `dab` needs a DAB set; `none` cannot be
 * listened to usefully at all (a 406 MHz beacon).
 */
export type ModeFamily = "am" | "fm" | "nfm" | "ssb" | "cw" | "digital" | "dab" | "none";

export const FREQUENCY_MODES = {
  AM: { label: "AM", family: "am" },
  FM: { label: "FM (broadcast)", family: "fm" },
  NFM: { label: "FM (narrow)", family: "nfm" },
  USB: { label: "SSB, upper sideband (USB)", family: "ssb" },
  LSB: { label: "SSB, lower sideband (LSB)", family: "ssb" },
  CW: { label: "Morse (CW)", family: "cw" },
  /** A carrier switched or keyed to carry a time code, heard as ticks on an AM set or a beat on an SSB set. */
  "TIME-CODE": { label: "Time code on a carrier", family: "am" },
  /** A carrier whose time code is only read by a decoder (phase modulation, a long-wave clock signal). */
  "TIME-CODE-DIGITAL": { label: "Time code for clocks (decoder)", family: "digital" },
  DAB: { label: "DAB digital radio", family: "dab" },
  DRM: { label: "DRM digital radio", family: "digital" },
  "HD-RADIO": { label: "HD Radio", family: "digital" },
  NAVTEX: { label: "NAVTEX (SITOR-B text)", family: "digital" },
  "SITOR-B": { label: "SITOR-B text", family: "digital" },
  RTTY: { label: "RTTY", family: "digital" },
  FAX: { label: "Radiofax (HF weather fax)", family: "digital" },
  DSC: { label: "DSC (digital selective calling)", family: "digital" },
  AIS: { label: "AIS (ship positions)", family: "digital" },
  FT8: { label: "FT8", family: "digital" },
  FT4: { label: "FT4", family: "digital" },
  JS8: { label: "JS8 (JS8Call)", family: "digital" },
  WSPR: { label: "WSPR", family: "digital" },
  PSK31: { label: "PSK31", family: "digital" },
  OLIVIA: { label: "Olivia", family: "digital" },
  WINLINK: { label: "Winlink (VARA, ARDOP or PACTOR)", family: "digital" },
  APRS: { label: "APRS (packet)", family: "digital" },
  DMR: { label: "DMR", family: "digital" },
  DPMR: { label: "dPMR", family: "digital" },
  BEACON: { label: "Distress beacon (not for listening)", family: "none" },
} as const satisfies Record<string, { label: string; family: ModeFamily }>;

export type FrequencyModeId = keyof typeof FREQUENCY_MODES;

export const modeLabel = (mode: FrequencyModeId): string => FREQUENCY_MODES[mode].label;
export const modeFamily = (mode: FrequencyModeId): ModeFamily => FREQUENCY_MODES[mode].family;

// ── Bands ───────────────────────────────────────────────────────────────────

/** A stretch of spectrum an entry says it is in. Edges in kHz, inclusive. */
export interface FrequencyBand {
  id: string;
  name: string;
  fromKhz: number;
  toKhz: number;
  /** Shown in the band filter under this heading. */
  group: "itu" | "broadcast" | "marine" | "aviation" | "amateur" | "licence-free" | "other";
}

/**
 * The bands an entry may name. The edges are wide enough to hold every region's version
 * of a band (medium wave is 526.5 to 1606.5 kHz in Regions 1 and 3 and 525 to 1705 kHz
 * in Region 2): this list is for filtering and for the data test's check that a
 * frequency is in the band it says, not a band plan. The bands themselves, region by
 * region and with their sources, are entries of the kind "bands".
 */
export const FREQUENCY_BANDS: readonly FrequencyBand[] = [
  // ITU designations (ITU-R V.431): any entry may use one when no narrower band fits.
  { id: "vlf", name: "VLF (3 to 30 kHz)", fromKhz: 3, toKhz: 30, group: "itu" },
  { id: "lf", name: "LF (30 to 300 kHz)", fromKhz: 30, toKhz: 300, group: "itu" },
  { id: "mf", name: "MF (300 kHz to 3 MHz)", fromKhz: 300, toKhz: 3000, group: "itu" },
  { id: "hf", name: "HF, shortwave (3 to 30 MHz)", fromKhz: 3000, toKhz: 30_000, group: "itu" },
  { id: "vhf", name: "VHF (30 to 300 MHz)", fromKhz: 30_000, toKhz: 300_000, group: "itu" },
  { id: "uhf", name: "UHF (300 MHz to 3 GHz)", fromKhz: 300_000, toKhz: 3_000_000, group: "itu" },
  // Broadcasting.
  { id: "lw", name: "Long wave broadcasting", fromKhz: 148.5, toKhz: 283.5, group: "broadcast" },
  { id: "mw", name: "Medium wave broadcasting", fromKhz: 525, toKhz: 1705, group: "broadcast" },
  { id: "sw-120m", name: "120 m broadcast band", fromKhz: 2300, toKhz: 2495, group: "broadcast" },
  { id: "sw-90m", name: "90 m broadcast band", fromKhz: 3200, toKhz: 3400, group: "broadcast" },
  { id: "sw-75m", name: "75 m broadcast band", fromKhz: 3900, toKhz: 4000, group: "broadcast" },
  { id: "sw-60m", name: "60 m broadcast band", fromKhz: 4750, toKhz: 5060, group: "broadcast" },
  { id: "sw-49m", name: "49 m broadcast band", fromKhz: 5900, toKhz: 6200, group: "broadcast" },
  { id: "sw-41m", name: "41 m broadcast band", fromKhz: 7200, toKhz: 7450, group: "broadcast" },
  { id: "sw-31m", name: "31 m broadcast band", fromKhz: 9400, toKhz: 9900, group: "broadcast" },
  { id: "sw-25m", name: "25 m broadcast band", fromKhz: 11_600, toKhz: 12_100, group: "broadcast" },
  { id: "sw-22m", name: "22 m broadcast band", fromKhz: 13_570, toKhz: 13_870, group: "broadcast" },
  { id: "sw-19m", name: "19 m broadcast band", fromKhz: 15_100, toKhz: 15_800, group: "broadcast" },
  { id: "sw-16m", name: "16 m broadcast band", fromKhz: 17_480, toKhz: 17_900, group: "broadcast" },
  { id: "sw-15m", name: "15 m broadcast band", fromKhz: 18_900, toKhz: 19_020, group: "broadcast" },
  { id: "sw-13m", name: "13 m broadcast band", fromKhz: 21_450, toKhz: 21_850, group: "broadcast" },
  { id: "sw-11m", name: "11 m broadcast band", fromKhz: 25_670, toKhz: 26_100, group: "broadcast" },
  { id: "fm-oirt", name: "FM, the old OIRT band", fromKhz: 65_800, toKhz: 74_000, group: "broadcast" },
  { id: "fm-japan", name: "FM in Japan", fromKhz: 76_000, toKhz: 95_000, group: "broadcast" },
  { id: "fm", name: "FM broadcasting", fromKhz: 87_500, toKhz: 108_000, group: "broadcast" },
  { id: "dab", name: "DAB, Band III", fromKhz: 174_000, toKhz: 240_000, group: "broadcast" },
  // Time and standard frequencies (ITU allocations round 2.5, 5, 10, 15, 20 and 25 MHz).
  { id: "sfts", name: "Standard frequency and time signal bands", fromKhz: 2498, toKhz: 25_010, group: "other" },
  // Marine.
  { id: "marine-mf", name: "Marine MF (NAVTEX, 2182 kHz and coast stations)", fromKhz: 415, toKhz: 4000, group: "marine" },
  { id: "marine-hf", name: "Marine HF (4 to 27.5 MHz)", fromKhz: 4000, toKhz: 27_500, group: "marine" },
  { id: "marine-vhf", name: "Marine VHF", fromKhz: 156_000, toKhz: 174_000, group: "marine" },
  { id: "weather-vhf", name: "VHF weather radio (162.400 to 162.550 MHz)", fromKhz: 162_400, toKhz: 162_550, group: "other" },
  // Aviation.
  { id: "air-hf", name: "Aeronautical HF", fromKhz: 2850, toKhz: 23_350, group: "aviation" },
  { id: "air-vhf", name: "Air band, VHF (118 to 137 MHz)", fromKhz: 108_000, toKhz: 137_000, group: "aviation" },
  { id: "air-uhf", name: "Military air band, UHF (225 to 400 MHz)", fromKhz: 225_000, toKhz: 400_000, group: "aviation" },
  { id: "beacon-406", name: "406 MHz distress beacons", fromKhz: 406_000, toKhz: 406_100, group: "other" },
  // Amateur (edges wide enough for every region).
  { id: "ham-2200m", name: "Amateur 2200 m", fromKhz: 135.7, toKhz: 137.8, group: "amateur" },
  { id: "ham-630m", name: "Amateur 630 m", fromKhz: 472, toKhz: 479, group: "amateur" },
  { id: "ham-160m", name: "Amateur 160 m", fromKhz: 1800, toKhz: 2000, group: "amateur" },
  { id: "ham-80m", name: "Amateur 80 m", fromKhz: 3500, toKhz: 4000, group: "amateur" },
  { id: "ham-60m", name: "Amateur 60 m", fromKhz: 5250, toKhz: 5450, group: "amateur" },
  { id: "ham-40m", name: "Amateur 40 m", fromKhz: 7000, toKhz: 7300, group: "amateur" },
  { id: "ham-30m", name: "Amateur 30 m", fromKhz: 10_100, toKhz: 10_150, group: "amateur" },
  { id: "ham-20m", name: "Amateur 20 m", fromKhz: 14_000, toKhz: 14_350, group: "amateur" },
  { id: "ham-17m", name: "Amateur 17 m", fromKhz: 18_068, toKhz: 18_168, group: "amateur" },
  { id: "ham-15m", name: "Amateur 15 m", fromKhz: 21_000, toKhz: 21_450, group: "amateur" },
  { id: "ham-12m", name: "Amateur 12 m", fromKhz: 24_890, toKhz: 24_990, group: "amateur" },
  { id: "ham-10m", name: "Amateur 10 m", fromKhz: 28_000, toKhz: 29_700, group: "amateur" },
  { id: "ham-6m", name: "Amateur 6 m", fromKhz: 50_000, toKhz: 54_000, group: "amateur" },
  { id: "ham-4m", name: "Amateur 4 m", fromKhz: 70_000, toKhz: 70_500, group: "amateur" },
  { id: "ham-2m", name: "Amateur 2 m", fromKhz: 144_000, toKhz: 148_000, group: "amateur" },
  { id: "ham-1.25m", name: "Amateur 1.25 m", fromKhz: 219_000, toKhz: 225_000, group: "amateur" },
  { id: "ham-70cm", name: "Amateur 70 cm", fromKhz: 420_000, toKhz: 450_000, group: "amateur" },
  { id: "ham-23cm", name: "Amateur 23 cm", fromKhz: 1_240_000, toKhz: 1_300_000, group: "amateur" },
  // Licence-free and citizens' radio.
  { id: "cb", name: "CB, 27 MHz", fromKhz: 26_500, toKhz: 28_000, group: "licence-free" },
  { id: "murs", name: "MURS (USA)", fromKhz: 151_800, toKhz: 154_600, group: "licence-free" },
  { id: "lpd433", name: "LPD433 and 433 MHz short range devices", fromKhz: 433_050, toKhz: 434_790, group: "licence-free" },
  { id: "pmr446", name: "PMR446", fromKhz: 446_000, toKhz: 446_200, group: "licence-free" },
  { id: "frs-gmrs", name: "FRS and GMRS (USA)", fromKhz: 462_550, toKhz: 467_725, group: "licence-free" },
  { id: "uhf-cb", name: "UHF CB (Australia and New Zealand)", fromKhz: 476_400, toKhz: 477_420, group: "licence-free" },
];

const BANDS_BY_ID = new Map(FREQUENCY_BANDS.map((band) => [band.id, band]));
export const bandById = (id: string): FrequencyBand | undefined => BANDS_BY_ID.get(id);

// ── Places ──────────────────────────────────────────────────────────────────

/** A region an entry may apply to instead of (or as well as) a country. */
export interface FrequencyRegion {
  id: string;
  name: string;
  /**
   * The countries (ISO 3166-1 alpha-2) inside it, where that is a list: an entry for
   * the region is then shown to someone who chose one of them. A region with no list
   * (a sea area) is shown only when it is chosen itself, or with "everywhere".
   */
  countries?: readonly string[];
}

// ITU Region 2: the Americas and Greenland (Radio Regulations, No. 5.3 and the map of the regions).
const ITU_2: readonly string[] = (
  "AG AI AR AW BB BL BM BO BQ BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GF GL GP GT GY HN HT " +
  "JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC VE VG VI"
).split(" ");
// ITU Region 3: Asia east of the Region 1 line (Iran included), and Oceania.
const ITU_3: readonly string[] = (
  "AF AS AU BD BN BT CC CK CN CX FJ FM GU HK ID IN IO IR JP KH KI KP KR LA LK MH MM MO MP MV " +
  "MY NC NF NP NR NU NZ PF PG PH PK PN PW SB SG TH TK TL TO TV TW UM VN VU WF WS"
).split(" ");
// ITU Region 1: Europe, Africa, the Middle East west of the Persian Gulf, the former Soviet Union and Mongolia.
const ITU_1: readonly string[] = (
  "AD AE AL AM AO AT AX AZ BA BE BF BG BH BI BJ BW BY CD CF CG CH CI CM CV CY CZ DE DJ DK DZ " +
  "EE EG EH ER ES ET FI FO FR GA GB GE GG GH GI GM GN GQ GR GW HR HU IE IL IM IQ IS IT JE JO " +
  "KE KG KM KW KZ LB LI LR LS LT LU LV LY MA MC MD ME MG MK ML MN MR MT MU MW MZ NA NE NG NL " +
  "NO OM PL PS PT QA RE RO RS RU RW SA SC SD SE SH SI SJ SK SL SM SN SO SS ST SY SZ TD TG TJ " +
  "TM TN TR TZ UA UG UZ VA XK YE YT ZA ZM ZW"
).split(" ");
// CEPT's member administrations (where PMR446 and CEPT CB are harmonised), as listed by CEPT.
const CEPT: readonly string[] = (
  "AL AD AT AZ BE BA BG HR CY CZ DK EE FI FR GE DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL " +
  "MK NO PL PT RO SM RS SK SI ES SE CH TR UA GB VA"
).split(" ");

export const FREQUENCY_REGIONS: readonly FrequencyRegion[] = [
  { id: "world", name: "Worldwide" },
  { id: "itu-1", name: "ITU Region 1 (Europe, Africa, the Middle East, Russia)", countries: ITU_1 },
  { id: "itu-2", name: "ITU Region 2 (the Americas)", countries: ITU_2 },
  { id: "itu-3", name: "ITU Region 3 (Asia and the Pacific)", countries: ITU_3 },
  { id: "cept", name: "CEPT countries (most of Europe)", countries: CEPT },
  { id: "north-atlantic", name: "North Atlantic" },
  { id: "south-atlantic", name: "South Atlantic" },
  { id: "north-pacific", name: "North Pacific" },
  { id: "south-pacific", name: "South Pacific" },
  { id: "indian-ocean", name: "Indian Ocean" },
  { id: "mediterranean", name: "Mediterranean" },
  { id: "caribbean", name: "Caribbean" },
  { id: "arctic", name: "Arctic" },
  { id: "antarctica", name: "Antarctica and the Southern Ocean" },
];

const REGIONS_BY_ID = new Map(FREQUENCY_REGIONS.map((region) => [region.id, region]));
export const regionById = (id: string): FrequencyRegion | undefined => REGIONS_BY_ID.get(id);

/** A country code as an entry gives it: two capital letters. Regions are lower case with hyphens. */
export const isCountryCode = (code: string): boolean => /^[A-Z]{2}$/.test(code);

let regionNames: Intl.DisplayNames | null | undefined;
/** "United Kingdom" for "GB", the region's name for a region; the code itself if neither is known. */
export function placeName(code: string): string {
  const region = regionById(code);
  if (region) return region.name;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en-GB"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

// ── Entries ─────────────────────────────────────────────────────────────────

export interface FrequencySource {
  /** Who publishes the page: "NIST", "Ofcom", "BBC". */
  publisher: string;
  /** The page or document's title, as the publisher gives it. */
  title: string;
  url: string;
  /** The day it was read, YYYY-MM-DD. */
  checked: string;
}

/** One frequency or channel, or a stretch of spectrum (`toKhz`). Always in kHz; shown in kHz below 30 MHz and MHz above. */
export interface Frequency {
  khz: number;
  /** The upper edge, for a band or a range of channels. */
  toKhz?: number;
  /** The channel's name or number where people know it by one: "16", "WX2", "CH 9". */
  channel?: string;
  /** Hours on this frequency, in UTC, where they differ from the entry's. */
  hours?: string;
  /** Power where it is published: "10 kW". */
  power?: string;
  /** Anything else about this one frequency: "night only", "upper sideband". */
  note?: string;
}

/** A published schedule that runs out: shortwave seasons. */
export interface FrequencySchedule {
  /** The season as the broadcaster names it: "B26 (winter 2026 to 2027)". */
  season: string;
  /** The first and last days it is good for, YYYY-MM-DD. After `until` the screen shows it as expired. */
  from: string;
  until: string;
}

export type FrequencyStatus =
  /** On the air as the source says. */
  | "on-air"
  /** Closed: kept so that nobody hunts for it. `closed` gives the date. */
  | "closed"
  /** On the air only some of the time, or only when activated (an emergency net, a station in tests). */
  | "occasional"
  /** Could not be checked against a primary source: kept out of the default view. */
  | "not-verified";

export interface FrequencyEntry {
  /** Unique, lower case with hyphens: "wwv", "noaa-weather-radio", "pmr446-analogue". */
  id: string;
  kind: FrequencyKindId;
  /** What it is, in a few words: "WWV, NIST time signal station". */
  name: string;
  /** Who runs it, where that is not in the name. */
  operator?: string;
  /** One or two sentences: what it is, for someone who has never heard of it. */
  what: string;
  frequencies: Frequency[];
  modes: FrequencyModeId[];
  /** Ids from FREQUENCY_BANDS. Every frequency lies in at least one of them. */
  bands: string[];
  /** ISO 3166-1 alpha-2 country codes and region ids from FREQUENCY_REGIONS. */
  where: string[];
  /** Where it is transmitted from, if that matters for hearing it: "Fort Collins, Colorado". */
  site?: string;
  /** When it is on the air, in UTC, saying so: "Continuous", "00:48 and 05:20 UTC daily". */
  hours?: string;
  /** A broadcaster's published schedule that runs out. */
  schedule?: FrequencySchedule;
  /** What a listener hears. */
  expect: string;
  /** Roughly where and when it can be heard. */
  reception?: string;
  /** For a time signal: how the signal is laid out, so a clock can be set by ear. One paragraph each. */
  layout?: string[];
  /** For a time signal: which time it gives (UTC or local civil time) and how to get local time from it. */
  timeGiven?: string;
  /** Whether listening needs a licence or is restricted, where that is commonly so, and whose rules those are. */
  listening?: string;
  status: FrequencyStatus;
  /** When it closed, YYYY-MM-DD or YYYY-MM, for a closed entry. */
  closed?: string;
  notes?: string[];
  /** Screens of Outpost that go further: Repeaters, HF propagation. */
  links?: Array<{ to: string; label: string }>;
  sources: FrequencySource[];
  /** Other words someone might search for it by. */
  aliases?: string[];
}

/** A short guide shown with a kind: "Set a clock from a time signal", "How to hunt". */
export interface FrequencyGuide {
  id: string;
  kind: FrequencyKindId;
  title: string;
  paragraphs: string[];
  sources: FrequencySource[];
}

// ── Formatting ──────────────────────────────────────────────────────────────

const trim = (text: string) => (text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text);

/** One value as a radio shows it: kHz below 30 MHz, MHz from 30 MHz up with at least three decimals. */
export function formatKhz(khz: number): string {
  if (khz < 30_000) return `${trim(khz.toFixed(3))} kHz`;
  const mhz = trim((khz / 1000).toFixed(5));
  const [whole, decimals = ""] = mhz.split(".");
  return `${whole}.${decimals.padEnd(3, "0")} MHz`;
}

const mhzText = (khz: number) => trim((khz / 1000).toFixed(5));

/** A frequency, or a stretch: "87.5 to 108 MHz", "5900 to 6200 kHz", "1.6 to 30 MHz" written as "1600 kHz to 30 MHz". */
export function formatFrequency(frequency: Pick<Frequency, "khz" | "toKhz">): string {
  const { khz, toKhz } = frequency;
  if (toKhz === undefined) return formatKhz(khz);
  if (toKhz <= 30_000) return `${trim(khz.toFixed(3))} to ${trim(toKhz.toFixed(3))} kHz`;
  if (khz >= 30_000) return `${mhzText(khz)} to ${mhzText(toKhz)} MHz`;
  return `${formatKhz(khz)} to ${mhzText(toKhz)} MHz`;
}

/** "17 November 2026" from "2026-11-17". */
export function checkedOn(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (!year || !month) return day;
  return date ? `${date} ${months[month - 1]} ${year}` : `${months[month - 1]} ${year}`;
}

/** The latest day any source of the entry was checked. */
export function entryChecked(entry: Pick<FrequencyEntry, "sources">): string {
  return entry.sources.map((source) => source.checked).sort().at(-1) ?? "";
}

/** The earliest day any entry in a set was last checked: the set is no fresher than that. */
export function setChecked(entries: readonly Pick<FrequencyEntry, "sources">[]): { from: string; to: string } {
  const days = entries.map(entryChecked).filter(Boolean).sort();
  return { from: days[0] ?? "", to: days[days.length - 1] ?? "" };
}

// ── Schedules that run out ──────────────────────────────────────────────────

export const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Whether a YYYY-MM-DD day is a real one. */
export function isDay(day: string): boolean {
  if (!DAY_PATTERN.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const value = new Date(Date.UTC(year, month - 1, date));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === date;
}

export type ScheduleState = "none" | "not-yet" | "current" | "expired";

/** Whether an entry's schedule is good for `today` (YYYY-MM-DD). An entry with no schedule has none to run out. */
export function scheduleState(entry: Pick<FrequencyEntry, "schedule">, today: string): ScheduleState {
  if (!entry.schedule) return "none";
  if (today > entry.schedule.until) return "expired";
  if (today < entry.schedule.from) return "not-yet";
  return "current";
}

// ── Sets and what they receive ──────────────────────────────────────────────

export interface ReceiverProfile {
  id: string;
  label: string;
  /** What is assumed about the set, in a line. */
  about: string;
  /** The stretches it tunes, in kHz. */
  ranges: ReadonlyArray<readonly [number, number]>;
  families: readonly ModeFamily[];
}

/**
 * What a typical set of each kind tunes. These are general descriptions, not one maker's
 * specification: a particular set may tune more or less, and its own manual is what
 * counts. A digital mode is counted only for a set that can be joined to a decoder.
 */
export const RECEIVER_PROFILES: readonly ReceiverProfile[] = [
  {
    id: "portable",
    label: "FM, MW and LW portable",
    about: "An ordinary portable or kitchen radio: FM (and in some, the Japanese band), medium wave, and long wave in Europe.",
    ranges: [
      [148.5, 283.5],
      [520, 1710],
      [76_000, 108_000],
    ],
    families: ["am", "fm"],
  },
  {
    id: "dab",
    label: "DAB radio",
    about: "A digital radio with DAB and, usually, FM.",
    ranges: [
      [87_500, 108_000],
      [174_000, 240_000],
    ],
    families: ["fm", "dab"],
  },
  {
    id: "shortwave",
    label: "Shortwave portable",
    about: "A world-band portable: long, medium and shortwave on AM, and FM. Without SSB, so no sideband or Morse.",
    ranges: [
      [148.5, 30_000],
      [76_000, 108_000],
    ],
    families: ["am", "fm"],
  },
  {
    id: "shortwave-ssb",
    label: "Shortwave portable with SSB",
    about: "A world-band portable with an SSB or BFO control: as above, and sideband and Morse too.",
    ranges: [
      [148.5, 30_000],
      [76_000, 108_000],
    ],
    families: ["am", "fm", "ssb", "cw"],
  },
  {
    id: "scanner",
    label: "Scanner (air band and VHF/UHF)",
    about: "A handheld or desktop scanner from about 25 MHz to 1.3 GHz, AM and FM: air band, marine, weather, PMR446, CB on many.",
    ranges: [[25_000, 1_300_000]],
    families: ["am", "fm", "nfm"],
  },
  {
    id: "marine-vhf",
    label: "Marine VHF set",
    about: "A ship's or handheld marine VHF: the marine channels, and in North America the weather channels.",
    ranges: [[156_000, 163_000]],
    families: ["nfm"],
  },
  {
    id: "cb",
    label: "CB radio",
    about: "A 27 MHz CB set: AM and FM, and on some sets SSB.",
    ranges: [[26_500, 28_000]],
    families: ["am", "nfm", "ssb"],
  },
  {
    id: "pmr446",
    label: "PMR446, FRS or UHF CB handheld",
    about: "A licence-free walkie-talkie: PMR446 in Europe, FRS/GMRS in North America, UHF CB in Australia and New Zealand.",
    ranges: [
      [446_000, 446_200],
      [462_550, 467_725],
      [476_400, 477_420],
    ],
    families: ["nfm"],
  },
  {
    id: "ham-hf",
    label: "Amateur HF transceiver",
    about:
      "An HF transceiver with general-coverage receive, about 0.1 to 30 MHz (and often 6 m): every mode, digital ones with a computer.",
    ranges: [
      [100, 30_000],
      [50_000, 54_000],
    ],
    families: ["am", "nfm", "ssb", "cw", "digital"],
  },
  {
    id: "ham-vhf",
    label: "Amateur VHF/UHF handheld",
    about: "A dual-band handheld: 2 m and 70 cm, and on most the stretches round them (about 136 to 174 and 400 to 480 MHz), FM.",
    ranges: [
      [136_000, 174_000],
      [400_000, 480_000],
    ],
    families: ["nfm"],
  },
  {
    id: "sdr",
    label: "SDR",
    about:
      "A software-defined radio on a computer (an RTL-SDR or similar, with an upconverter or direct sampling for HF): almost everything, with decoders.",
    ranges: [[10, 1_766_000]],
    families: ["am", "fm", "nfm", "ssb", "cw", "digital", "dab"],
  },
];

export const receiverById = (id: string): ReceiverProfile | undefined => RECEIVER_PROFILES.find((profile) => profile.id === id);

/** Whether a set of this kind could receive this frequency in this mode. */
export function receives(profile: ReceiverProfile, frequency: Pick<Frequency, "khz" | "toKhz">, mode: FrequencyModeId): boolean {
  const family = modeFamily(mode);
  if (family === "none") return false;
  // Broadcast FM is heard on a narrow-FM set only badly, and narrow FM on a broadcast set not at all; a set that does one does not do the other.
  if (!profile.families.includes(family)) return false;
  const low = frequency.khz;
  const high = frequency.toKhz ?? frequency.khz;
  return profile.ranges.some(([from, to]) => low <= to && high >= from);
}

/** Whether any frequency of the entry can be received in any of its modes on the set. */
export const entryReceivable = (profile: ReceiverProfile, entry: Pick<FrequencyEntry, "frequencies" | "modes">): boolean =>
  entry.frequencies.some((frequency) => entry.modes.some((mode) => receives(profile, frequency, mode)));

// ── Filters ─────────────────────────────────────────────────────────────────

export interface FrequencyFilter {
  kind?: FrequencyKindId | null;
  /** A country code or region id. */
  place?: string | null;
  band?: string | null;
  receiver?: string | null;
  text?: string;
  /** Show entries not checked against a primary source (hidden by default). */
  showUnverified?: boolean;
}

/** Lower case, accents gone, so "reunion" finds "Réunion". */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Whether the entry applies to a place: named itself, through a region with that country in it, or worldwide. */
export function appliesTo(entry: Pick<FrequencyEntry, "where">, place: string): boolean {
  if (entry.where.includes(place)) return true;
  if (entry.where.includes("world")) return true;
  if (!isCountryCode(place)) return false;
  return entry.where.some((code) => regionById(code)?.countries?.includes(place) ?? false);
}

/** Every word typed is somewhere in the entry; a number typed finds frequencies that start with it in kHz or MHz. */
export function matchesText(entry: FrequencyEntry, text: string): boolean {
  const words = foldText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldText(
    [
      entry.name,
      entry.operator,
      entry.what,
      entry.expect,
      entry.site,
      entry.hours,
      entry.reception,
      ...(entry.aliases ?? []),
      ...entry.where.map(placeName),
      ...entry.where,
      ...entry.modes.map(modeLabel),
      ...entry.bands.map((id) => bandById(id)?.name),
      ...entry.frequencies.flatMap((frequency) => [frequency.channel, frequency.note, formatFrequency(frequency)]),
    ]
      .filter(Boolean)
      .join(" \u0000 "),
  );
  return words.every((word) => {
    if (/^\d+(\.\d+)?$/.test(word)) {
      const typed = word;
      const hit = entry.frequencies.some((frequency) => {
        const khz = String(frequency.khz);
        const mhz = String(frequency.khz / 1000);
        return khz.startsWith(typed) || mhz.startsWith(typed) || (frequency.channel !== undefined && foldText(frequency.channel) === typed);
      });
      if (hit) return true;
    }
    return haystack.includes(word);
  });
}

export function filterFrequencies(entries: readonly FrequencyEntry[], filter: FrequencyFilter): FrequencyEntry[] {
  const profile = filter.receiver ? receiverById(filter.receiver) : undefined;
  return entries.filter((entry) => {
    if (!filter.showUnverified && entry.status === "not-verified") return false;
    if (filter.kind && entry.kind !== filter.kind) return false;
    if (filter.place && !appliesTo(entry, filter.place)) return false;
    if (filter.band && !entry.bands.includes(filter.band)) return false;
    if (profile && !entryReceivable(profile, entry)) return false;
    if (filter.text && !matchesText(entry, filter.text)) return false;
    return true;
  });
}

/** Places named in the entries, countries by name and then regions in their table's order. */
export function placesIn(entries: readonly Pick<FrequencyEntry, "where">[]): Array<{ code: string; name: string }> {
  const codes = new Set(entries.flatMap((entry) => entry.where));
  const countries = [...codes]
    .filter(isCountryCode)
    .map((code) => ({ code, name: placeName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  const regions = FREQUENCY_REGIONS.filter((region) => codes.has(region.id) || region.countries).map((region) => ({
    code: region.id,
    name: region.name,
  }));
  return [...regions, ...countries];
}

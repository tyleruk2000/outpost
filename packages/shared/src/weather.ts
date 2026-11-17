/**
 * Weather and hazards, under Preparedness: forecasts, warnings, flood data and climate
 * averages fetched when a person presses "Update now" and kept on the server, and the
 * person's own barometer readings.
 *
 * What is here is shared by the server and the web app: the shapes of what is kept, how
 * old a copy may be before it is called old, and the barometer's arithmetic. Every
 * figure and threshold names its source; docs/weather.md quotes them.
 *
 * Nothing kept is current by being kept. A forecast is as good as the moment it was
 * fetched, and `freshness` is the one place that decides what may be said about it.
 */

// ── What is fetched, and from whom ──────────────────────────────────────────

/** The kinds of thing kept, each fetched and replaced on its own. */
export const WEATHER_KINDS = ["forecast", "warnings", "flood", "climate", "solar"] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** The kinds "Update now" fetches. Climate averages and sunshine change over decades and are fetched on a press of their own. */
export const LIVE_KINDS: WeatherKind[] = ["forecast", "warnings", "flood"];

export type WeatherSourceId = "open-meteo" | "met-office-warnings" | "ea-flood" | "nasa-power" | "pvgis";

export interface WeatherSourceInfo {
  id: WeatherSourceId;
  kind: WeatherKind;
  /** Who publishes it. */
  publisher: string;
  /** What it is, in a few words. */
  name: string;
  /** Where it covers. */
  covers: string;
  /** The host a request goes to. */
  host: string;
  /** What is sent, in words: the position and how coarsely. */
  sends: string;
  licence: string;
  licenceUrl: string;
  /** The credit the publisher asks for, in its words where it gives them. */
  attribution: string;
  /** The publisher's own page for the same thing, live. */
  liveUrl: string;
  termsUrl: string;
  /** When Outpost's account of the terms was last read from the publisher's pages. */
  termsRead: string;
}

/**
 * Decimal places a position is rounded to before it is sent. Two places is about 1.1 km
 * north to south: finer than any of these services resolves (Open-Meteo's finest model
 * over Britain has a 2 km grid; NASA POWER's is about 50 km), and no closer to a house.
 */
export const SENT_DECIMALS = 2;
export const roundForSending = (value: number): number => Number(value.toFixed(SENT_DECIMALS));

// ── Places ──────────────────────────────────────────────────────────────────

/**
 * The Met Office's warning regions, as its feeds name them (read from each region's feed
 * on 16 November 2026). Outpost cannot tell which region a position is in, so a person
 * chooses it for each place.
 */
export const MET_OFFICE_REGIONS = [
  { id: "se", name: "London & South East England" },
  { id: "sw", name: "South West England" },
  { id: "ee", name: "East of England" },
  { id: "em", name: "East Midlands" },
  { id: "wm", name: "West Midlands" },
  { id: "yh", name: "Yorkshire & Humber" },
  { id: "ne", name: "North East England" },
  { id: "nw", name: "North West England" },
  { id: "wl", name: "Wales" },
  { id: "ni", name: "Northern Ireland" },
  { id: "dg", name: "Dumfries, Galloway, Lothian & Borders" },
  { id: "st", name: "Strathclyde" },
  { id: "ta", name: "Central, Tayside & Fife" },
  { id: "gr", name: "Grampian" },
  { id: "he", name: "Highlands & Eilean Siar" },
  { id: "os", name: "Orkney & Shetland" },
] as const;
export type MetOfficeRegionId = (typeof MET_OFFICE_REGIONS)[number]["id"];
export const MET_OFFICE_REGION_IDS = MET_OFFICE_REGIONS.map((region) => region.id) as [MetOfficeRegionId, ...MetOfficeRegionId[]];
export const regionName = (id: string | null): string | null => MET_OFFICE_REGIONS.find((region) => region.id === id)?.name ?? null;

export interface WeatherPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** The saved place it was chosen from, while that still exists. */
  markerId: string | null;
  /** The saved place it came from is home: it carries the home icon, and is the first saved that does (`homePlaceOf`). */
  isHome: boolean;
  region: MetOfficeRegionId | null;
  createdAt: number;
}

export const WEATHER_LIMITS = { places: 12, name: 120, readings: 50_000, csvBytes: 4 * 1024 * 1024, note: 400 } as const;

// ── What is kept ────────────────────────────────────────────────────────────

export interface ForecastHour {
  /** Start of the hour, ms since 1970 (UTC). */
  t: number;
  tempC: number | null;
  precipMm: number | null;
  /** Chance of precipitation, 0 to 100. */
  precipChance: number | null;
  /** WMO weather code, as Open-Meteo gives it. */
  code: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  /** Where the wind comes from, degrees. */
  windFrom: number | null;
  pressureHpa: number | null;
}

export interface ForecastDay {
  /** The calendar day in UTC, "2026-11-16". */
  date: string;
  code: number | null;
  maxC: number | null;
  minC: number | null;
  precipMm: number | null;
  precipChance: number | null;
  windMaxKmh: number | null;
  gustMaxKmh: number | null;
}

export interface ForecastData {
  /** The service, and the model when it names one. */
  service: string;
  model: string;
  /** Height of the model's grid point, metres, as the service gives it. */
  elevation: number | null;
  /** The grid point the figures are for. */
  gridLat: number;
  gridLon: number;
  hours: ForecastHour[];
  days: ForecastDay[];
}

export type WarningLevel = "yellow" | "amber" | "red";

export interface WarningItem {
  /** The publisher's own id, where it gives one. */
  id: string;
  /** The publisher's words, unaltered. */
  title: string;
  description: string;
  link: string;
  /** Read from the title, for sorting and for the badge: the title is what is shown. */
  level: WarningLevel | null;
  /** The region the warning names. */
  region: string;
  /** The period the publisher states, read from its words; null where they could not be read, and then the words are what there is. */
  validFrom: number | null;
  validUntil: number | null;
}

export interface WarningsData {
  publisher: string;
  feedTitle: string;
  /** When the publisher says it made the feed. */
  publishedAt: number | null;
  items: WarningItem[];
}

export interface FloodWarning {
  id: string;
  /** The publisher's name for the area. */
  area: string;
  county: string;
  riverOrSea: string;
  /** The publisher's words: "Severe flood warning", "Flood warning", "Flood alert", "Warning no longer in force". */
  severity: string;
  /** 1 (most severe) to 4, as the publisher numbers them. */
  severityLevel: number;
  message: string;
  isTidal: boolean | null;
  raisedAt: number | null;
  changedAt: number | null;
}

export interface RiverStation {
  id: string;
  label: string;
  river: string | null;
  town: string | null;
  lat: number;
  lon: number;
  distanceKm: number;
  latest: { value: number; unit: string; at: number } | null;
  typicalLow: number | null;
  typicalHigh: number | null;
  highestRecent: { value: number; at: number | null } | null;
}

export interface FloodData {
  /** How far from the place warnings and stations were asked for, km. */
  warningsWithinKm: number;
  stationsWithinKm: number;
  warnings: FloodWarning[];
  stations: RiverStation[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTH_NAMES = MONTHS;

export interface ClimateMonth {
  /** Mean air temperature at 2 m, °C. */
  meanC: number | null;
  /** Precipitation, mm a day on average, and over the month (a day's mean times the days in the month). */
  precipMmPerDay: number | null;
  precipMmMonth: number | null;
  /** Mean wind speed at 10 m, m/s. */
  windMs: number | null;
  /** Sunshine energy on level ground, kWh/m² a day. */
  sunKwhLevel: number | null;
}

export interface ClimateData {
  service: string;
  /** The period averaged, in the publisher's words. */
  period: string;
  months: ClimateMonth[];
}

export interface SolarData {
  service: string;
  /** The databases the figures come from, as the publisher names them. */
  databases: string;
  firstYear: number;
  lastYear: number;
  /** The tilt PVGIS found best for a panel facing south, degrees. */
  optimalSlope: number | null;
  /** kWh/m² a day, by month: on level ground, and on a panel at the best tilt facing south. Peak sun hours are the same number. */
  level: Array<number | null>;
  optimal: Array<number | null>;
}

export interface WeatherDataByKind {
  forecast: ForecastData;
  warnings: WarningsData;
  flood: FloodData;
  climate: ClimateData;
  solar: SolarData;
}

export interface KeptCopy<K extends WeatherKind = WeatherKind> {
  id: string;
  kind: K;
  source: WeatherSourceId;
  /** null for what is not for one place (the UK's warnings). */
  placeId: string | null;
  fetchedAt: number;
  /** The period the copy covers, where it has one. */
  validFrom: number | null;
  validUntil: number | null;
  /** What arrived from the publisher. */
  bytes: number;
  /** What was sent to get it, in words. */
  sent: string;
  data: WeatherDataByKind[K];
}

export interface WeatherResponse {
  places: WeatherPlace[];
  kept: KeptCopy[];
  sources: WeatherSourceInfo[];
  updateOnOpen: boolean;
  /** The server's clock, so that ages are worked out against one time. */
  now: number;
}

export interface UpdateOutcome {
  kind: WeatherKind;
  placeId: string | null;
  placeName: string | null;
  source: WeatherSourceId;
  ok: boolean;
  /** What went wrong, for a person. */
  message: string | null;
  bytes: number;
}

export interface UpdateResponse {
  outcomes: UpdateOutcome[];
}

/** What the scenario planner asks: the warnings in force for the home place when they were last fetched. */
export interface HomeWarningsResponse {
  place: { id: string; name: string; region: string | null } | null;
  /** The saved place with the home icon (`homePlaceOf`), in the weather list or not; null when none has it. */
  homeMarker: { id: string; name: string } | null;
  /** When the warnings were fetched; null when they never were. */
  fetchedAt: number | null;
  /** Met Office warnings for the home place's region whose stated period had not ended at `now`. */
  weather: WarningItem[];
  /** Environment Agency flood warnings near the home place that were in force when fetched, and when those were fetched. */
  flood: FloodWarning[];
  floodFetchedAt: number | null;
  /** True when either copy is older than it is good for (see `freshness`). */
  stale: boolean;
  /** A sentence that says how old this is and where the live source is. */
  note: string;
  now: number;
}

// ── How old is too old ──────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * How long a copy is called fresh. These are Outpost's choices, not any publisher's:
 * Open-Meteo runs its models every hour to every few hours, the Met Office issues and
 * changes warnings at any time, and the Environment Agency's readings come every 15
 * minutes. After this a copy is "old": still shown, always with its age.
 */
export const FRESH_FOR: Record<WeatherKind, number> = {
  forecast: 6 * HOUR,
  warnings: 3 * HOUR,
  flood: 1 * HOUR,
  climate: Number.POSITIVE_INFINITY,
  solar: Number.POSITIVE_INFINITY,
};

export type FreshState = "fresh" | "old" | "ran-out" | "averages";

export interface Freshness {
  state: FreshState;
  ageMs: number;
  /** "3 days ago", "just now". */
  age: string;
  /** One sentence about what the copy can be taken for now. */
  sentence: string;
}

/** "less than a minute", "5 minutes", "3 hours", "2 days". */
export function ageWords(ms: number): string {
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  if (ms < 60_000) return "less than a minute";
  if (ms < HOUR) return n(Math.floor(ms / 60_000), "minute");
  if (ms < 2 * DAY) return n(Math.floor(ms / HOUR), "hour");
  return n(Math.floor(ms / DAY), "day");
}

const KIND_WORDS: Record<WeatherKind, string> = {
  forecast: "forecast",
  warnings: "list of warnings",
  flood: "flood information",
  climate: "set of averages",
  solar: "set of averages",
};

/**
 * What may be said about a copy at `now`. A forecast whose last hour has passed has run
 * out; one whose hours are still ahead but which is older than `FRESH_FOR` is old; a
 * list of warnings or flood readings past `FRESH_FOR` is old (new warnings may have been
 * issued since). Averages do not go out of date in days.
 */
export function freshness(copy: Pick<KeptCopy, "kind" | "fetchedAt" | "validUntil">, now: number): Freshness {
  const ageMs = Math.max(0, now - copy.fetchedAt);
  const age = ageMs < 60_000 ? "just now" : `${ageWords(ageMs)} ago`;
  const fetched = `Fetched ${age}`;
  if (copy.kind === "climate" || copy.kind === "solar") {
    return { state: "averages", ageMs, age, sentence: `${fetched}. These are averages over many years, not a forecast.` };
  }
  if (copy.kind === "forecast" && copy.validUntil !== null && now >= copy.validUntil) {
    return { state: "ran-out", ageMs, age, sentence: `${fetched}: this forecast has run out. Update it to see what is expected now.` };
  }
  if (ageMs >= FRESH_FOR[copy.kind]) {
    const why =
      copy.kind === "forecast"
        ? "a newer forecast will have been made since, and the nearer hours of this one may have changed"
        : copy.kind === "warnings"
          ? "warnings may have been issued, changed or ended since"
          : "rivers and warnings may have changed since";
    return { state: "old", ageMs, age, sentence: `${fetched}: this ${KIND_WORDS[copy.kind]} is old, and ${why}.` };
  }
  return { state: "fresh", ageMs, age, sentence: `${fetched}.` };
}

/** A warning's own period, at `now`: not begun, in force, or ended. Unknown when its words could not be read into times. */
export function warningState(item: Pick<WarningItem, "validFrom" | "validUntil">, now: number): "ahead" | "in-force" | "ended" | "unknown" {
  if (item.validUntil === null || item.validFrom === null) return "unknown";
  if (now >= item.validUntil) return "ended";
  if (now < item.validFrom) return "ahead";
  return "in-force";
}

// ── Forecast words ──────────────────────────────────────────────────────────

/**
 * The WMO weather codes Open-Meteo uses, in the words of its documentation
 * (https://open-meteo.com/en/docs, "WMO Weather interpretation codes (WW)").
 */
const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};
export const weatherWords = (code: number | null): string =>
  code === null ? "No description" : (WEATHER_CODES[code] ?? `Weather code ${code}`);

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
export const compassWord = (degrees: number): string => COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]!;

export const KMH_PER_MPH = 1.609344;
export const kmhToMph = (kmh: number): number => kmh / KMH_PER_MPH;
export const cToF = (c: number): number => (c * 9) / 5 + 32;

// ── The barometer ───────────────────────────────────────────────────────────

/** 1 inch of mercury in hectopascals (the conventional value at 0 °C and standard gravity, NIST SP 811, B.8). */
export const HPA_PER_INHG = 33.8639;
export type PressureUnit = "hPa" | "inHg";
export const PRESSURE_UNITS: PressureUnit[] = ["hPa", "inHg"];
/** A millibar is a hectopascal; files may say either. */
export function toHpa(value: number, unit: PressureUnit): number {
  return unit === "inHg" ? value * HPA_PER_INHG : value;
}
export const hpaToInHg = (hpa: number): number => hpa / HPA_PER_INHG;

/**
 * Reduces a pressure read at a height to sea level with the barometric formula of the
 * International Standard Atmosphere (ICAO Doc 7488; the same relation as the U.S.
 * Standard Atmosphere 1976 below 11 km):
 *
 *     p0 = p × (1 − L·h / T0) ^ −(g·M / (R·L))
 *
 * with T0 = 288.15 K, L = 0.0065 K/m, and g·M/(R·L) = 5.25588. It assumes the standard
 * atmosphere's temperature, so it gives the figure an altimeter setting (QNH) would, not
 * the Met Office's own sea-level reduction, which uses the temperature at the station.
 * Good to a fraction of a hectopascal up to a few hundred metres; less so higher up, and
 * in very cold or hot weather.
 */
export const ISA = { T0: 288.15, L: 0.0065, exponent: 5.25588 } as const;
export function seaLevelPressure(stationHpa: number, heightM: number): number {
  return stationHpa * (1 - (ISA.L * heightM) / ISA.T0) ** -ISA.exponent;
}

/** Heights the formula is offered for, metres: below the Dead Sea shore to above the highest town in Britain by a margin. */
export const HEIGHT_RANGE = { min: -450, max: 3000 } as const;
/** Pressures accepted at sea level, hPa: wider than any recorded (870 to 1084). */
export const SEA_LEVEL_RANGE = { min: 850, max: 1100 } as const;

export interface PressureReading {
  id: string;
  takenAt: number;
  value: number;
  unit: PressureUnit;
  stationHpa: number;
  heightM: number;
  seaLevelHpa: number;
  note: string;
  origin: "typed" | "file";
  createdAt: number;
}

/**
 * The words for a three-hour change, as the Met Office uses them in its forecasts for
 * shipping (thresholds quoted in docs/weather.md). `max` is the largest change, in hPa
 * over three hours, that takes the word; above the last is "very rapidly".
 */
export const TENDENCY_STEPS = [
  { max: 0.1, word: "steady" },
  { max: 1.5, word: "slowly" },
  { max: 3.5, word: "" },
  { max: 6.0, word: "quickly" },
  { max: Number.POSITIVE_INFINITY, word: "very rapidly" },
] as const;

export interface Tendency {
  /** Change over the three hours, hPa (sea-level figures). */
  change: number;
  /** Rounded to a tenth, as the thresholds are written. */
  rounded: number;
  /** "rising slowly", "falling very rapidly", "steady", or "now rising" after a turn. */
  words: string;
  direction: "rising" | "falling" | "steady";
  /** It fell then rose (or the other way) within the three hours. */
  turned: boolean;
  from: { takenAt: number; hpa: number; interpolated: boolean };
  to: { takenAt: number; hpa: number };
}

export type TendencyResult = { ok: true; tendency: Tendency } | { ok: false; reason: string };

const THREE_HOURS = 3 * HOUR;
/** How far from exactly three hours before the latest reading a reading may be and still be used as it is. */
export const TENDENCY_SLACK_MS = 20 * 60_000;
/** The longest gap between two readings that a value three hours back may be worked out across. */
export const TENDENCY_GAP_MS = 2 * HOUR;

/** The words for a change (positive is rising), rounded to a tenth first as the thresholds are written. */
export function tendencyWords(change: number): { words: string; direction: Tendency["direction"]; rounded: number } {
  const rounded = Math.round(change * 10) / 10;
  const size = Math.abs(rounded);
  if (size < TENDENCY_STEPS[0].max) return { words: "steady", direction: "steady", rounded };
  const direction = rounded > 0 ? "rising" : "falling";
  const step = TENDENCY_STEPS.slice(1).find((candidate) => size <= candidate.max)!;
  return { words: step.word ? `${direction} ${step.word}` : direction, direction, rounded };
}

/**
 * The three-hour tendency at the latest reading: its sea-level pressure against the
 * reading three hours before it, or the value worked out between the two readings either
 * side of that time when they are close enough together. Readings may be in any order.
 */
export function pressureTendency(readings: Array<Pick<PressureReading, "takenAt" | "seaLevelHpa">>): TendencyResult {
  if (readings.length < 2) return { ok: false, reason: "A tendency needs two readings about three hours apart." };
  const sorted = [...readings].sort((a, b) => a.takenAt - b.takenAt);
  const latest = sorted[sorted.length - 1]!;
  const target = latest.takenAt - THREE_HOURS;
  let from: Tendency["from"] | null = null;
  const near = sorted
    .filter((reading) => Math.abs(reading.takenAt - target) <= TENDENCY_SLACK_MS)
    .sort((a, b) => Math.abs(a.takenAt - target) - Math.abs(b.takenAt - target))[0];
  if (near) from = { takenAt: near.takenAt, hpa: near.seaLevelHpa, interpolated: false };
  else {
    const before = [...sorted].reverse().find((reading) => reading.takenAt < target);
    const after = sorted.find((reading) => reading.takenAt > target && reading !== latest);
    if (before && after && after.takenAt - before.takenAt <= TENDENCY_GAP_MS) {
      const share = (target - before.takenAt) / (after.takenAt - before.takenAt);
      from = { takenAt: target, hpa: before.seaLevelHpa + share * (after.seaLevelHpa - before.seaLevelHpa), interpolated: true };
    }
  }
  if (!from) {
    return {
      ok: false,
      reason:
        "There is no reading about three hours before the latest one (within 20 minutes of it, or two readings no more than two hours apart either side of it).",
    };
  }
  const change = latest.seaLevelHpa - from.hpa;
  const { words, direction, rounded } = tendencyWords(change);
  // A turn: within the three hours the pressure went the other way by at least the "steady" margin.
  const inside = sorted.filter((reading) => reading.takenAt > from.takenAt && reading.takenAt < latest.takenAt);
  let turned = false;
  if (direction !== "steady" && inside.length > 0) {
    const extreme =
      direction === "rising"
        ? Math.min(...inside.map((reading) => reading.seaLevelHpa))
        : Math.max(...inside.map((reading) => reading.seaLevelHpa));
    turned = direction === "rising" ? from.hpa - extreme >= 0.1 : extreme - from.hpa >= 0.1;
  }
  return {
    ok: true,
    tendency: {
      change,
      rounded,
      words: turned ? `now ${direction}` : words,
      direction,
      turned,
      from,
      to: { takenAt: latest.takenAt, hpa: latest.seaLevelHpa },
    },
  };
}

// ── Climate and sunshine ────────────────────────────────────────────────────

export const daysInMonth = (month: number, year = 2001): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// ── Readings from a file ────────────────────────────────────────────────────

export interface ReadingImportRow {
  /** Line of the file, counting the header as 1. */
  line: number;
  takenAt: number;
  value: number;
  unit: PressureUnit;
  heightM: number;
  seaLevelHpa: number;
  /** A reading at the same time is already kept; it is not added again. */
  duplicate: boolean;
  /** How the pressure or the height was read where the cell was not a plain number ("“1.013,2” read as 1013.2."). */
  notes: string[];
}

export interface ReadingImportResult {
  rows: ReadingImportRow[];
  problems: Array<{ line: number; message: string }>;
  /** How many were added: 0 for a preview. */
  added: number;
}

export interface ReadingsResponse {
  readings: PressureReading[];
}

/** The person's own things here, as "Manage and clean up" counts them; and the fetched copies, which can be fetched again. */
export interface WeatherKept {
  places: number;
  readings: number;
  copies: number;
  copyBytes: number;
}

/** Where the tendency words and thresholds come from (quoted in docs/weather.md). */
export const TENDENCY_SOURCE = {
  name: "Met Office, Glossary of terms used in the shipping forecast and other marine forecasts: “Pressure tendency in station reports”",
  url: "https://weather.metoffice.gov.uk/guides/coast-and-sea/glossary",
  read: "2026-11-16",
} as const;

/**
 * What a tendency is conventionally taken to suggest, in the Met Office's own words.
 * A rule of thumb, not a forecast: shown with that label, and never instead of one.
 */
export const PRESSURE_RULES_OF_THUMB = [
  {
    quote: "Generally, low pressure brings unsettled weather, while high pressure leads to settled conditions.",
    source: "Met Office, “High and low pressure”",
    url: "https://weather.metoffice.gov.uk/learn-about/weather/how-weather-works/high-and-low-pressure",
  },
  {
    quote: "As a warm front approaches, temperature and dew-point within the cold air gradually rise and pressure falls more quickly.",
    source: "Met Office for schools, “Understanding weather”",
    url: "https://weather.metoffice.gov.uk/learn-about/met-office-for-schools/other-content/other-resources/understanding-weather",
  },
  {
    quote:
      "You can tell when a cold front has passed by a rise of pressure, a fall of temperature and dew point, and a change in wind direction.",
    source: "Met Office for schools, “Understanding weather”",
    url: "https://weather.metoffice.gov.uk/learn-about/met-office-for-schools/other-content/other-resources/understanding-weather",
  },
] as const;

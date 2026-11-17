/**
 * River and sea levels, under Weather and hazards: the Environment Agency's measuring
 * stations near a place, their latest levels, and a station's last few days of readings,
 * fetched on a press and kept with the time they were fetched and measured.
 *
 * Every judgement here is either the Agency's own or labelled as Outpost's. Whether a
 * level is within, above or below the typical range uses the range the Agency publishes
 * for the station ("the measurement exceeded this for 5% of the relevant data on record",
 * and 95% for the bottom). Whether it is rising, steady or falling is Outpost's rule, on
 * the readings held (`levelTrend`); the Agency's API publishes no trend. Nothing here is
 * a forecast, and nothing says a place is safe.
 *
 * docs/weather.md ("River and sea levels") quotes the Agency's definitions.
 */

/** One reading as the Agency gives it: when it was measured (ms since 1970) and the level, metres. */
export interface LevelReading {
  t: number;
  v: number;
}

/** A level the Agency marks on a station's scale, with when it happened where it says. */
export interface LevelMark {
  value: number;
  at: number | null;
}

export type StationStatus = "active" | "suspended" | "closed";

export interface RiverLevelStation {
  /** The Agency's station reference ("E21183"). */
  id: string;
  /** Its River Levels on the Internet number, which its "Check for flooding" pages use; null where it gives none. */
  rloiId: string | null;
  label: string;
  river: string | null;
  town: string | null;
  lat: number;
  lon: number;
  distanceKm: number;
  /** The Agency's qualifier for the measure shown: "Stage", "Downstream Stage" or "Tidal Level". */
  qualifier: string;
  /** The measure is a tidal level: it rises and falls with the tide, and has no typical range to be judged against. */
  tidal: boolean;
  /** The Agency's id for the measure shown ("E21183-level-stage-i-15_min-mAOD"). */
  measureId: string;
  /** As the Agency names it: "mAOD", "mASD", or "m" where it names no datum. */
  unit: string;
  /** Seconds between readings, as the Agency gives it. */
  periodS: number | null;
  /** As the Agency gives it; null where it gives none. */
  status: StationStatus | null;
  statusReason: string | null;
  /** The Agency's typical range for this measure, in the same unit; null where it publishes none. */
  typicalLow: number | null;
  typicalHigh: number | null;
  /** "The highest reading for this measurement in recent times (typically the last 5 years)". */
  highestRecent: LevelMark | null;
  /** "The highest reading for this measurement on record". */
  maxOnRecord: LevelMark | null;
  /** The latest readings held, oldest first, as fetched. Empty when the Agency gave none. */
  recent: LevelReading[];
  /** Why there are no readings, when there are none: in words for a person. */
  readingsNote: string | null;
}

export interface RiversData {
  /** How far round the place stations were asked for, km. */
  withinKm: number;
  /** How many level stations the Agency listed within that distance (it may approximate by a box; only those truly within are kept). */
  listed: number;
  /** The nearest, nearest first, at most `MAX_RIVER_STATIONS`. */
  stations: RiverLevelStation[];
}

/** One station's last few days, fetched on a press on its own view. */
export interface StationReadings {
  stationId: string;
  measureId: string;
  unit: string;
  fetchedAt: number;
  /** The start of the period asked for. */
  since: number;
  bytes: number;
  /** Oldest first. */
  readings: LevelReading[];
}

export interface RiverReadingsData {
  /** Most recently fetched first, at most `HELD_STATION_HISTORIES` for a place. */
  stations: StationReadings[];
}

/** The distances a person may choose, km, and the one used until they choose. */
export const RIVER_DISTANCES_KM = [3, 8, 15, 25] as const;
export type RiverDistanceKm = (typeof RIVER_DISTANCES_KM)[number];
export const DEFAULT_RIVER_KM: RiverDistanceKm = 8;
/** The most stations kept for one place, nearest first: each is one more request. */
export const MAX_RIVER_STATIONS = 10;
/** How far back a station's own view asks for, days. The Agency keeps readings "up to the last four weeks". */
export const STATION_HISTORY_DAYS = 3;
/** The most station histories kept for one place. */
export const HELD_STATION_HISTORIES = 10;
/**
 * A station whose latest reading is this much older than the moment it was fetched is
 * said to have stopped reporting. The Agency says data is "typically" sent back "once or
 * twice per day", so a reading half a day old is ordinary; two days is not.
 */
export const STATION_QUIET_MS = 48 * 3_600_000;

export const KM_PER_MILE = 1.609344;
/** "8 km (5 miles)". */
export const distanceWords = (km: number): string => {
  const miles = Math.round(km / KM_PER_MILE);
  return `${km} km (${miles} ${miles === 1 ? "mile" : "miles"})`;
};

// ── What a level is measured from ───────────────────────────────────────────

export type LevelDatum = "AOD" | "ASD" | "unstated";

/** From the Agency's unit name: "mAOD" (Ordnance Datum), "mASD" (the station's own datum), "m" (no datum named). */
export function datumOf(unit: string): LevelDatum {
  if (/AOD$/i.test(unit)) return "AOD";
  if (/ASD$/i.test(unit)) return "ASD";
  return "unstated";
}

/** What the figure is, in words, because a level means nothing without what it is measured from. */
export const DATUM_WORDS: Record<LevelDatum, string> = {
  AOD: "metres above Ordnance Datum, the level heights on Ordnance Survey maps are measured from",
  ASD: "metres above the station's own datum, a fixed point chosen for that gauge",
  unstated: "metres; the Agency does not say what this station measures from",
};

/** "m above Ordnance Datum", short, for beside a figure. */
export const DATUM_SHORT: Record<LevelDatum, string> = {
  AOD: "m above Ordnance Datum",
  ASD: "m above the station's datum",
  unstated: "m",
};

// ── Against the Agency's typical range ──────────────────────────────────────

export type RangeState = "above" | "within" | "below" | "tidal" | "no-range";

/**
 * Where a level sits against the typical range the Agency publishes for the station. A
 * tidal level is not judged against a river's range, and a station with no published
 * range is not judged at all. The ends belong to the range.
 */
export function rangeState(station: Pick<RiverLevelStation, "tidal" | "typicalLow" | "typicalHigh">, value: number): RangeState {
  if (station.tidal) return "tidal";
  if (station.typicalLow === null || station.typicalHigh === null) return "no-range";
  if (value > station.typicalHigh) return "above";
  if (value < station.typicalLow) return "below";
  return "within";
}

export const RANGE_WORDS: Record<RangeState, string> = {
  above: "Above the typical range the Agency gives for this station",
  within: "Within the typical range the Agency gives for this station",
  below: "Below the typical range the Agency gives for this station",
  tidal: "A tidal level: it rises and falls with the tide, and is not judged against a typical range",
  "no-range": "The Agency publishes no typical range for this station",
};

// ── Rising, steady or falling: Outpost's rule ───────────────────────────────

/**
 * Outpost's rule, not the Agency's (its API publishes no trend): the latest reading held
 * against the earliest held within the three hours before it. The two must be at least
 * 45 minutes apart. A change of less than 2 cm either way, after rounding to the
 * millimetre the Agency gives, is "steady".
 */
export const TREND_RULE = { windowMs: 3 * 3_600_000, minSpanMs: 45 * 60_000, steadyM: 0.02 } as const;

export type TrendResult =
  | { ok: true; direction: "rising" | "steady" | "falling"; change: number; from: LevelReading; to: LevelReading }
  | { ok: false; reason: string };

/** Sorts by time and keeps one reading for each time (the last given), so readings may arrive in any order. */
export function orderReadings(readings: LevelReading[]): LevelReading[] {
  const byTime = new Map<number, LevelReading>();
  for (const reading of readings) if (Number.isFinite(reading.t) && Number.isFinite(reading.v)) byTime.set(reading.t, reading);
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function levelTrend(readings: LevelReading[]): TrendResult {
  const sorted = orderReadings(readings);
  if (sorted.length < 2) return { ok: false, reason: "Too few readings are held to say whether it is rising or falling." };
  const to = sorted[sorted.length - 1]!;
  const from = sorted.find((reading) => reading.t >= to.t - TREND_RULE.windowMs)!;
  if (to.t - from.t < TREND_RULE.minSpanMs)
    return { ok: false, reason: "The readings held do not span long enough to say whether it is rising or falling." };
  const change = Math.round((to.v - from.v) * 1000) / 1000;
  const direction = Math.abs(change) < TREND_RULE.steadyM ? "steady" : change > 0 ? "rising" : "falling";
  return { ok: true, direction, change, from, to };
}

/** The latest reading held, or null. */
export const latestReading = (readings: LevelReading[]): LevelReading | null => orderReadings(readings).at(-1) ?? null;

/** A station has stopped reporting: its latest reading is more than two days older than the moment it was fetched, or there is none. */
export const stoppedReporting = (readings: LevelReading[], fetchedAt: number): boolean => {
  const latest = latestReading(readings);
  return latest === null || fetchedAt - latest.t > STATION_QUIET_MS;
};

/** The Agency's "Check for flooding" page for a station, where it has an RLOI number. */
export const stationLiveUrl = (rloiId: string | null): string | null =>
  rloiId && /^\d{1,8}$/.test(rloiId) ? `https://check-for-flooding.service.gov.uk/station/${rloiId}` : null;
export const LEVELS_LIVE_URL = "https://check-for-flooding.service.gov.uk/river-and-sea-levels";

/**
 * The Environment Agency's flood advice line, as given on its "Check for flooding"
 * station pages (read 17 November 2026): "Floodline helpline Telephone: 0345 988 1188 …
 * Open 24 hours a day, 7 days a week".
 */
export const FLOODLINE = { phone: "0345 988 1188", read: "2026-11-17" } as const;

/**
 * Reading what each publisher sends into the shapes Outpost keeps. Everything that comes
 * back is untrusted: each value is checked, a figure that is not a number becomes "no
 * figure" rather than nought, and an answer that is not the publisher's format is
 * refused whole with a message for a person.
 *
 * Words that are safety information (a warning's title and description, a flood
 * message) are kept exactly as the publisher wrote them. Times are read out of them only
 * to sort and to say whether a period has ended; the words are what is shown.
 */
import {
  type ClimateData,
  type ClimateMonth,
  daysInMonth,
  type FloodWarning,
  type ForecastData,
  type ForecastDay,
  type ForecastHour,
  type LevelMark,
  type LevelReading,
  orderReadings,
  type RiverLevelStation,
  type SolarData,
  type StationStatus,
  type WarningItem,
  type WarningLevel,
  type WarningsData,
} from "@outpost/shared";
import { XML_CLOSE, XML_END, XML_OPEN, XML_TEXT, XmlTokenizer } from "../maps/gpx-xml.ts";

export class SourceFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceFormatError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, low = -1e9, high = 1e9): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high ? value : null;
const str = (value: unknown, max = 20_000): string => (typeof value === "string" ? value.slice(0, max) : "");

function json(text: string, who: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceFormatError(`${who} did not answer with JSON.`);
  }
}

// ── Open-Meteo ──────────────────────────────────────────────────────────────

/** "2026-11-16T00:00" with `timezone=UTC` asked for, so the hour is UTC. */
function utcHour(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}:00Z`);
  return Number.isFinite(time) ? time : null;
}

export const OPEN_METEO_HOURLY = [
  "temperature_2m",
  "precipitation",
  "precipitation_probability",
  "weather_code",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "pressure_msl",
] as const;
export const OPEN_METEO_DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
] as const;

/** The model asked for: the Met Office's, which Open-Meteo serves as "UK Met Office Seamless". */
export const OPEN_METEO_MODEL = "ukmo_seamless";
export const OPEN_METEO_MODEL_WORDS = "Met Office UKV (2 km) over the UK and Ireland, Met Office global (10 km) elsewhere";

export interface Parsed<T> {
  data: T;
  validFrom: number | null;
  validUntil: number | null;
}

export function parseOpenMeteo(text: string): Parsed<ForecastData> {
  const body = json(text, "Open-Meteo");
  if (!isRecord(body)) throw new SourceFormatError("Open-Meteo's answer is not a forecast.");
  if (body.error === true) throw new SourceFormatError(`Open-Meteo refused the request: ${str(body.reason, 300) || "no reason given"}.`);
  const hourly = body.hourly;
  const daily = body.daily;
  if (!isRecord(hourly) || !Array.isArray(hourly.time)) throw new SourceFormatError("Open-Meteo's answer has no hours in it.");
  const column = (record: Record<string, unknown>, name: string): unknown[] =>
    Array.isArray(record[name]) ? (record[name] as unknown[]) : [];
  const times = hourly.time.slice(0, 24 * 16);
  const hours: ForecastHour[] = [];
  times.forEach((value, index) => {
    const t = utcHour(value);
    if (t === null) return;
    hours.push({
      t,
      tempC: num(column(hourly, "temperature_2m")[index], -90, 60),
      precipMm: num(column(hourly, "precipitation")[index], 0, 500),
      precipChance: num(column(hourly, "precipitation_probability")[index], 0, 100),
      code: num(column(hourly, "weather_code")[index], 0, 99),
      windKmh: num(column(hourly, "wind_speed_10m")[index], 0, 500),
      gustKmh: num(column(hourly, "wind_gusts_10m")[index], 0, 600),
      windFrom: num(column(hourly, "wind_direction_10m")[index], 0, 360),
      pressureHpa: num(column(hourly, "pressure_msl")[index], 800, 1100),
    });
  });
  if (hours.length === 0) throw new SourceFormatError("Open-Meteo's answer has no hours in it.");
  hours.sort((a, b) => a.t - b.t);
  const days: ForecastDay[] = [];
  if (isRecord(daily) && Array.isArray(daily.time)) {
    daily.time.slice(0, 16).forEach((value, index) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
      days.push({
        date: value,
        code: num(column(daily, "weather_code")[index], 0, 99),
        maxC: num(column(daily, "temperature_2m_max")[index], -90, 60),
        minC: num(column(daily, "temperature_2m_min")[index], -90, 60),
        precipMm: num(column(daily, "precipitation_sum")[index], 0, 2000),
        precipChance: num(column(daily, "precipitation_probability_max")[index], 0, 100),
        windMaxKmh: num(column(daily, "wind_speed_10m_max")[index], 0, 500),
        gustMaxKmh: num(column(daily, "wind_gusts_10m_max")[index], 0, 600),
      });
    });
  }
  return {
    data: {
      service: "Open-Meteo",
      model: OPEN_METEO_MODEL_WORDS,
      elevation: num(body.elevation, -500, 9000),
      gridLat: num(body.latitude, -90, 90) ?? 0,
      gridLon: num(body.longitude, -180, 180) ?? 0,
      hours,
      days,
    },
    validFrom: hours[0]!.t,
    // The last hour's figures stand for that hour; the forecast runs out at its end.
    validUntil: hours[hours.length - 1]!.t + 3_600_000,
  };
}

// ── The Met Office's warnings feed ──────────────────────────────────────────

/** The offset of UK time from UTC at a moment, minutes: 0 in winter, 60 in summer. */
function londonOffsetMinutes(at: number): number {
  const name =
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" })
      .formatToParts(new Date(at))
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** A UK wall-clock time as a moment. */
export function londonTime(year: number, month: number, day: number, hour: number, minute: number): number {
  const wall = Date.UTC(year, month, day, hour, minute);
  const first = wall - londonOffsetMinutes(wall) * 60_000;
  return wall - londonOffsetMinutes(first) * 60_000;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * "valid from 0000 Tue 17 Nov to 1100 Tue 17 Nov": UK times with no year. The year is
 * the feed's, or the next one for a month that is more than six months before the feed's.
 */
export function readValidity(description: string, publishedAt: number | null): { from: number; until: number } | null {
  const match = /valid from (\d{2})(\d{2}) \w{3} (\d{1,2}) (\w{3}) to (\d{2})(\d{2}) \w{3} (\d{1,2}) (\w{3})/i.exec(description);
  if (!match) return null;
  const reference = new Date(publishedAt ?? Date.now());
  const baseYear = reference.getUTCFullYear();
  const baseMonth = reference.getUTCMonth();
  const at = (hh: string, mm: string, dd: string, mon: string): number | null => {
    const month = MONTH_INDEX[mon.toLowerCase()];
    if (month === undefined) return null;
    const year = month < baseMonth - 6 ? baseYear + 1 : month > baseMonth + 6 ? baseYear - 1 : baseYear;
    return londonTime(year, month, Number(dd), Number(hh), Number(mm));
  };
  const from = at(match[1]!, match[2]!, match[3]!, match[4]!);
  let until = at(match[5]!, match[6]!, match[7]!, match[8]!);
  if (from === null || until === null) return null;
  // A period over the new year: the end is in the year after the start.
  if (until < from) until = at(match[5]!, match[6]!, match[7]!, match[8]!)! + 365 * 86_400_000;
  return { from, until };
}

interface RssItem {
  title: string;
  link: string;
  description: string;
  guid: string;
}

/** The channel's title and date and its items, read strictly; anything that is not RSS is refused. */
function readRss(text: string): { title: string; pubDate: string; items: RssItem[] } {
  const reader = new XmlTokenizer(text);
  const path: string[] = [];
  let buffer = "";
  const channel = { title: "", pubDate: "" };
  const items: RssItem[] = [];
  let item: RssItem | null = null;
  let sawRss = false;
  const wanted = new Set(["title", "link", "description", "guid", "pubDate"]);
  for (let event = reader.next(); event !== XML_END; event = reader.next()) {
    if (event === XML_OPEN) {
      const name = ["rss", "channel", "item", ...wanted].find((candidate) => reader.is(candidate)) ?? "?";
      if (path.length === 0 && name === "rss") sawRss = true;
      path.push(name);
      buffer = "";
      if (name === "item" && path[path.length - 2] === "channel") item = { title: "", link: "", description: "", guid: "" };
      if (items.length > 500) throw new SourceFormatError("The warnings feed lists more warnings than Outpost will read.");
    } else if (event === XML_TEXT) {
      if (buffer.length < 20_000) buffer += reader.text();
    } else if (event === XML_CLOSE) {
      const name = path.pop();
      const parent = path[path.length - 1];
      if (name === "item" && item) {
        items.push(item);
        item = null;
      } else if (item && parent === "item" && name && name in item) {
        (item as unknown as Record<string, string>)[name] = buffer.trim();
      } else if (parent === "channel" && (name === "title" || name === "pubDate")) {
        channel[name] = buffer.trim();
      }
      buffer = "";
    }
  }
  if (!sawRss) throw new SourceFormatError("The Met Office's answer is not its warnings feed.");
  return { ...channel, items };
}

export function parseMetOfficeWarnings(text: string): Parsed<WarningsData> {
  let feed: ReturnType<typeof readRss>;
  try {
    feed = readRss(text);
  } catch (error) {
    if (error instanceof SourceFormatError) throw error;
    throw new SourceFormatError("The Met Office's answer is not its warnings feed.");
  }
  const published = Date.parse(feed.pubDate);
  const publishedAt = Number.isFinite(published) ? published : null;
  const items: WarningItem[] = feed.items.map((entry) => {
    const level = (/^(yellow|amber|red) warning/i.exec(entry.title)?.[1]?.toLowerCase() ?? null) as WarningLevel | null;
    // The guid ends "&region=<name>", the name not escaped ("Lothian & Borders"); the title says "affecting <name>".
    const region = (/[?&]region=(.+)$/.exec(entry.guid)?.[1] ?? /affecting (.+)$/i.exec(entry.title)?.[1] ?? "").trim();
    const validity = readValidity(entry.description, publishedAt);
    return {
      id: entry.guid || `${entry.title}|${entry.description}`,
      title: entry.title,
      description: entry.description,
      link: /^https:\/\/www\.metoffice\.gov\.uk\//.test(entry.link) ? entry.link : "",
      level,
      region,
      validFrom: validity?.from ?? null,
      validUntil: validity?.until ?? null,
    };
  });
  return {
    data: { publisher: "Met Office", feedTitle: feed.title, publishedAt, items },
    validFrom: null,
    validUntil: null,
  };
}

// ── The Environment Agency ──────────────────────────────────────────────────

/** "2026-11-16T16:06:00": the flood-monitoring API's times without a zone are UK times. With a Z, UTC. */
export function eaTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z)?$/.exec(value);
  if (!match) return null;
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((index) => Number(match[index]));
  if (match[7]) return Date.UTC(y!, mo! - 1, d!, h!, mi!, Number(match[6] ?? 0));
  return londonTime(y!, mo! - 1, d!, h!, mi!) + Number(match[6] ?? 0) * 1000;
}

function eaItems(text: string, what: string, most = 500): unknown[] {
  const body = json(text, "The Environment Agency");
  if (!isRecord(body) || !Array.isArray(body.items))
    throw new SourceFormatError(`The Environment Agency's answer is not a list of ${what}.`);
  return body.items.slice(0, most);
}

export function parseEaFloods(text: string): FloodWarning[] {
  return eaItems(text, "flood warnings")
    .filter(isRecord)
    .map((item) => {
      const area = isRecord(item.floodArea) ? item.floodArea : {};
      return {
        id: str(item.floodAreaID, 60) || str(item["@id"], 300),
        area: str(item.description, 300),
        county: str(area.county, 300),
        riverOrSea: str(area.riverOrSea, 300),
        severity: str(item.severity, 80),
        severityLevel: num(item.severityLevel, 1, 4) ?? 4,
        message: str(item.message),
        isTidal: typeof item.isTidal === "boolean" ? item.isTidal : null,
        raisedAt: eaTime(item.timeRaised),
        changedAt: eaTime(item.timeMessageChanged),
      };
    })
    .sort((a, b) => a.severityLevel - b.severityLevel);
}

/** A level station from the Agency's list (`_view=full`), before its readings are asked for. */
export type EaLevelStation = Omit<RiverLevelStation, "distanceKm" | "recent" | "readingsNote">;

const QUALIFIER_RANK = ["Stage", "Tidal Level", "Downstream Stage"];
const STATUS: Record<string, StationStatus> = { statusActive: "active", statusSuspended: "suspended", statusClosed: "closed" };

const mark = (value: unknown): LevelMark | null => {
  if (!isRecord(value)) return null;
  const level = num(value.value, -100, 1000);
  return level === null ? null : { value: level, at: eaTime(value.dateTime) };
};

/**
 * The level stations the Agency lists near a point, with the scale of each. A station
 * gives several measures; the one shown is its river level ("Stage"), else its tidal
 * level, else the level below a weir ("Downstream Stage"); groundwater is left out. Of
 * two measures with the same qualifier, the one read every 15 minutes, then the one whose
 * unit names a datum, is taken. A station with no level measure, no position or an
 * unexpected reference is left out.
 */
export function parseEaLevelStations(text: string): EaLevelStation[] {
  const stations: EaLevelStation[] = [];
  for (const item of eaItems(text, "stations").filter(isRecord)) {
    const lat = num(item.lat, -90, 90);
    const lon = num(item.long, -180, 180);
    const id = str(item.stationReference, 40);
    if (lat === null || lon === null || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
    const measures = (Array.isArray(item.measures) ? item.measures : [item.measures])
      .filter(isRecord)
      .map((measure) => ({
        id: str(measure["@id"], 400).split("/").pop() ?? "",
        parameter: str(measure.parameter, 40),
        qualifier: str(measure.qualifier, 60),
        unit: str(measure.unitName, 20),
        period: num(measure.period, 1, 86_400),
      }))
      .filter(
        (measure) => measure.parameter === "level" && QUALIFIER_RANK.includes(measure.qualifier) && /^[A-Za-z0-9_.-]+$/.test(measure.id),
      )
      .sort(
        (a, b) =>
          QUALIFIER_RANK.indexOf(a.qualifier) - QUALIFIER_RANK.indexOf(b.qualifier) ||
          Number(a.period !== 900) - Number(b.period !== 900) ||
          Number(a.unit === "m") - Number(b.unit === "m"),
      );
    const measure = measures[0];
    if (!measure) continue;
    const scaleOf = measure.qualifier === "Downstream Stage" ? item.downstageScale : item.stageScale;
    const scale = isRecord(scaleOf) ? scaleOf : {};
    const tidal = measure.qualifier === "Tidal Level";
    const status = typeof item.status === "string" ? (STATUS[item.status.split("/").pop() ?? ""] ?? null) : null;
    const rloi = str(item.RLOIid, 12);
    stations.push({
      id,
      rloiId: /^\d{1,8}$/.test(rloi) ? rloi : null,
      label: str(item.label, 200) || id,
      river: str(item.riverName, 200) || null,
      town: str(item.town, 200) || null,
      lat,
      lon,
      qualifier: measure.qualifier,
      tidal,
      measureId: measure.id,
      unit: measure.unit || "m",
      periodS: measure.period,
      status,
      statusReason: str(item.statusReason, 300) || null,
      typicalLow: tidal ? null : num(scale.typicalRangeLow, -100, 1000),
      typicalHigh: tidal ? null : num(scale.typicalRangeHigh, -100, 1000),
      highestRecent: mark(scale.highestRecent),
      maxOnRecord: mark(scale.maxOnRecord),
    });
  }
  return stations;
}

/**
 * A measure's readings, oldest first, one for each time. A reading the Agency sends with
 * no value (it omits NaN in JSON), or with a time or value that cannot be read, is left
 * out. The Agency may send them newest first, or in no order.
 */
export function parseEaReadings(text: string): LevelReading[] {
  const readings: LevelReading[] = [];
  for (const item of eaItems(text, "readings", 10_000).filter(isRecord)) {
    const v = num(item.value, -100, 1000);
    const t = eaTime(item.dateTime);
    if (v !== null && t !== null) readings.push({ t, v });
  }
  return orderReadings(readings);
}

// ── NASA POWER ──────────────────────────────────────────────────────────────

export const NASA_POWER_PARAMETERS = ["T2M", "PRECTOTCORR", "WS10M", "ALLSKY_SFC_SW_DWN"] as const;
const POWER_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function parseNasaPower(text: string): Parsed<ClimateData> {
  const body = json(text, "NASA POWER");
  if (!isRecord(body) || !isRecord(body.properties) || !isRecord(body.properties.parameter)) {
    const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages.map((message) => str(message, 300)).join(" ") : "";
    throw new SourceFormatError(`NASA POWER's answer holds no averages.${messages ? ` It said: ${messages}` : ""}`);
  }
  const parameter = body.properties.parameter;
  const header = isRecord(body.header) ? body.header : {};
  const fill = num(header.fill_value) ?? -999;
  const value = (name: string, month: number, low: number, high: number): number | null => {
    const series = parameter[name];
    if (!isRecord(series)) return null;
    const raw = series[POWER_MONTHS[month]!];
    return raw === fill ? null : num(raw, low, high);
  };
  const months: ClimateMonth[] = POWER_MONTHS.map((_, month) => {
    const perDay = value("PRECTOTCORR", month, 0, 200);
    return {
      meanC: value("T2M", month, -90, 60),
      precipMmPerDay: perDay,
      precipMmMonth: perDay === null ? null : Math.round(perDay * daysInMonth(month) * 10) / 10,
      windMs: value("WS10M", month, 0, 100),
      sunKwhLevel: value("ALLSKY_SFC_SW_DWN", month, 0, 15),
    };
  });
  if (months.every((month) => month.meanC === null && month.sunKwhLevel === null))
    throw new SourceFormatError("NASA POWER's answer holds no averages.");
  return {
    data: { service: "NASA POWER", period: str(header.range, 200) || "the period NASA POWER averages over", months },
    validFrom: null,
    validUntil: null,
  };
}

// ── PVGIS ───────────────────────────────────────────────────────────────────

export function parsePvgis(text: string): Parsed<SolarData> {
  const body = json(text, "PVGIS");
  if (!isRecord(body) || !isRecord(body.outputs) || !Array.isArray(body.outputs.monthly)) {
    const message = isRecord(body) ? str(body.message, 300) : "";
    throw new SourceFormatError(`PVGIS's answer holds no monthly figures.${message ? ` It said: ${message}` : ""}`);
  }
  const sums = { level: Array<number>(12).fill(0), optimal: Array<number>(12).fill(0) };
  const counts = { level: Array<number>(12).fill(0), optimal: Array<number>(12).fill(0) };
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const row of body.outputs.monthly.slice(0, 12 * 60)) {
    if (!isRecord(row)) continue;
    const year = num(row.year, 1900, 2200);
    const month = num(row.month, 1, 12);
    if (year === null || month === null) continue;
    first = Math.min(first, year);
    last = Math.max(last, year);
    const days = daysInMonth(month - 1, year);
    for (const [key, field] of [
      ["level", "H(h)_m"],
      ["optimal", "H(i_opt)_m"],
    ] as const) {
      const total = num(row[field], 0, 500);
      if (total === null) continue;
      sums[key][month - 1]! += total / days;
      counts[key][month - 1]! += 1;
    }
  }
  if (!Number.isFinite(first)) throw new SourceFormatError("PVGIS's answer holds no monthly figures.");
  const average = (key: "level" | "optimal") =>
    sums[key].map((sum, month) => (counts[key][month]! > 0 ? Math.round((sum / counts[key][month]!) * 100) / 100 : null));
  const inputs = isRecord(body.inputs) ? body.inputs : {};
  const meteo = isRecord(inputs.meteo_data) ? inputs.meteo_data : {};
  const plane = isRecord(inputs.plane) && isRecord(inputs.plane.fixed_inclined_optimal) ? inputs.plane.fixed_inclined_optimal : {};
  const slope = isRecord(plane.slope) ? num(plane.slope.value, 0, 90) : null;
  return {
    data: {
      service: "PVGIS",
      databases: [str(meteo.radiation_db, 60), str(meteo.meteo_db, 60)].filter(Boolean).join(" and "),
      firstYear: first,
      lastYear: last,
      optimalSlope: slope,
      level: average("level"),
      optimal: average("optimal"),
    },
    validFrom: null,
    validUntil: null,
  };
}

/** Great-circle distance, km (spherical Earth of radius 6371 km). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

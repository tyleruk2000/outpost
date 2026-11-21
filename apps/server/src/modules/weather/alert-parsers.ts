/**
 * Readers for the alert feeds and the space weather files, each from the publisher's
 * format as it was on 21 November 2026 (the recorded answers in test/fixtures/weather).
 * Each reads what it needs and checks it; an answer that is not the publisher's format
 * is refused whole, and what was kept before stays.
 */
import type {
  GdacsData,
  GdacsEvent,
  MeteoalarmData,
  MeteoalarmItem,
  NwsAlert,
  NwsData,
  QuakeItem,
  QuakesData,
  ScaleNow,
  SpaceWeatherData,
} from "@outpost/shared";
import { XML_CLOSE, XML_END, XML_OPEN, XML_TEXT, XmlTokenizer } from "../maps/gpx-xml.ts";
import { type Parsed, SourceFormatError } from "./parsers.ts";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, low = -1e9, high = 1e9): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high ? value : null;
const str = (value: unknown, max = 20_000): string => (typeof value === "string" ? value.slice(0, max) : "");
const time = (value: unknown): number | null => {
  if (typeof value !== "string" || value === "") return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
};
/** A time with no zone, as SWPC writes them ("2026-11-20T20:00:00"), is UTC. */
const utc = (value: unknown): number | null =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) ? time(`${value}Z`) : time(value);
/** Only an https address on the publisher's own site is kept as a link. */
const linkOn = (value: string, host: RegExp): string => {
  try {
    const url = new URL(value);
    return host.test(url.hostname) ? url.toString().replace(/^http:/, "https:") : "";
  } catch {
    return "";
  }
};

function json(text: string, who: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceFormatError(`${who} did not answer with JSON.`);
  }
}

interface XmlRecord {
  /** The text of each direct child, by local name, in order. */
  text: Map<string, string[]>;
  /** The `link` children's attributes. */
  links: Array<{ href: string; type: string; rel: string; title: string }>;
}

/**
 * The repeated elements of a feed (`item` in RSS, `entry` in Atom), each read as the text
 * of its direct children. Children of children are left out: GDACS nests titles of its own
 * inside an item, and those are not the item's title.
 */
function readXmlRecords(text: string, root: string, record: string, who: string, max: number): { root: XmlRecord; records: XmlRecord[] } {
  const reader = new XmlTokenizer(text);
  const fresh = (): XmlRecord => ({ text: new Map(), links: [] });
  const top = fresh();
  const records: XmlRecord[] = [];
  let current: XmlRecord | null = null;
  let recordDepth = 0;
  let child: string | null = null;
  let childDepth = 0;
  let buffer = "";
  let sawRoot = false;
  try {
    for (let event = reader.next(); event !== XML_END; event = reader.next()) {
      if (event === XML_OPEN) {
        if (reader.depth === 1) {
          if (!reader.is(root)) throw new SourceFormatError(`${who}'s answer is not its feed.`);
          sawRoot = true;
        }
        if (!current && reader.is(record)) {
          if (records.length >= max) throw new SourceFormatError(`${who}'s feed lists more than Outpost will read.`);
          current = fresh();
          recordDepth = reader.depth;
          continue;
        }
        const holder = current ?? top;
        const parentDepth = current ? recordDepth : 2;
        if (reader.depth === parentDepth + 1 || (!current && reader.depth === 2)) {
          child = reader.local;
          childDepth = reader.depth;
          buffer = "";
          if (child === "link")
            holder.links.push({
              href: reader.attribute("href") ?? "",
              type: reader.attribute("type") ?? "",
              rel: reader.attribute("rel") ?? "",
              title: reader.attribute("title") ?? "",
            });
        }
      } else if (event === XML_TEXT) {
        if (child !== null && reader.depth === childDepth && buffer.length < 200_000) buffer += reader.text();
      } else if (event === XML_CLOSE) {
        if (current && reader.depth === recordDepth - 1) {
          records.push(current);
          current = null;
          child = null;
        } else if (child !== null && reader.depth === childDepth - 1) {
          const holder = current ?? top;
          const list = holder.text.get(child) ?? [];
          list.push(buffer.trim());
          holder.text.set(child, list);
          child = null;
        }
      }
    }
  } catch (error) {
    if (error instanceof SourceFormatError) throw error;
    throw new SourceFormatError(`${who}'s answer is not its feed.`);
  }
  if (!sawRoot) throw new SourceFormatError(`${who}'s answer is not its feed.`);
  return { root: top, records };
}

const first = (record: XmlRecord, name: string): string => record.text.get(name)?.[0] ?? "";

// ── GDACS ───────────────────────────────────────────────────────────────────

export function parseGdacs(text: string): Parsed<GdacsData> {
  // The RSS root is `rss`; its items sit in `channel`, so the channel's own children are one deeper.
  const { records } = readXmlRecords(text, "rss", "item", "GDACS", 2000);
  const channelDate = /<pubDate>([^<]+)<\/pubDate>/.exec(text.slice(0, 4000))?.[1] ?? "";
  const events: GdacsEvent[] = records.map((item) => {
    const point = /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/.exec(first(item, "point"));
    const level = first(item, "alertlevel");
    return {
      id: first(item, "guid").slice(0, 80) || first(item, "title").slice(0, 80),
      type: first(item, "eventtype").slice(0, 4),
      level: level === "Green" || level === "Orange" || level === "Red" ? level : null,
      title: first(item, "title").slice(0, 600),
      description: first(item, "description").slice(0, 4000),
      country: first(item, "country").slice(0, 400),
      from: time(first(item, "fromdate")),
      to: time(first(item, "todate")),
      lat: point ? num(Number(point[1]), -90, 90) : null,
      lon: point ? num(Number(point[2]), -180, 180) : null,
      current: first(item, "iscurrent") !== "false",
      link: linkOn(first(item, "link"), /(^|\.)gdacs\.org$/),
    };
  });
  return { data: { publishedAt: time(channelDate), events }, validFrom: null, validUntil: null };
}

// ── The USGS ────────────────────────────────────────────────────────────────

const PAGER = new Set(["green", "yellow", "orange", "red"]);

export function parseUsgsQuakes(text: string): Parsed<QuakesData> {
  const answer = json(text, "The USGS");
  if (!isRecord(answer) || answer.type !== "FeatureCollection" || !Array.isArray(answer.features))
    throw new SourceFormatError("The USGS's answer is not its earthquake feed.");
  if (answer.features.length > 20_000) throw new SourceFormatError("The USGS's feed lists more earthquakes than Outpost will read.");
  const quakes: QuakeItem[] = [];
  for (const feature of answer.features) {
    if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) continue;
    const p = feature.properties;
    const at = Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates : [];
    const lon = num(at[0], -180, 180);
    const lat = num(at[1], -90, 90);
    const when = num(p.time, 0, 1e14);
    if (lat === null || lon === null || when === null) continue;
    quakes.push({
      id: str(feature.id, 40),
      mag: num(p.mag, -2, 11),
      place: str(p.place, 300),
      time: when,
      lat,
      lon,
      depthKm: num(at[2], -20, 1000),
      url: linkOn(str(p.url, 400), /^earthquake\.usgs\.gov$/),
      pager: PAGER.has(str(p.alert)) ? (str(p.alert) as QuakeItem["pager"]) : null,
      tsunami: p.tsunami === 1,
    });
  }
  const metadata = isRecord(answer.metadata) ? answer.metadata : {};
  quakes.sort((a, b) => b.time - a.time);
  return {
    data: { title: str(metadata.title, 200), generatedAt: num(metadata.generated, 0, 1e14), quakes },
    validFrom: null,
    validUntil: null,
  };
}

// ── MeteoAlarm ──────────────────────────────────────────────────────────────

/** Whether a point is inside a CAP polygon, "lat,lon lat,lon …" (even-odd rule). */
export function insideCapPolygon(polygon: string, point: { lat: number; lon: number }): boolean {
  const corners = polygon
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number) as [number, number])
    .filter((pair) => pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (corners.length < 3) return false;
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [latI, lonI] = corners[i]!;
    const [latJ, lonJ] = corners[j]!;
    if (latI > point.lat !== latJ > point.lat && point.lon < ((lonJ - lonI) * (point.lat - latI)) / (latJ - latI) + lonI) inside = !inside;
  }
  return inside;
}

export function parseMeteoalarm(
  text: string,
  country: { code: string; name: string },
  home: { lat: number; lon: number } | null,
): Parsed<MeteoalarmData> {
  const { root, records } = readXmlRecords(text, "feed", "entry", "MeteoAlarm", 20_000);
  const items: MeteoalarmItem[] = [];
  for (const entry of records) {
    if (first(entry, "status") && first(entry, "status") !== "Actual") continue;
    const title = first(entry, "title");
    const polygons = entry.text.get("polygon") ?? [];
    const area = entry.links.find((link) => link.href.includes("geocode=") || link.title === first(entry, "areaDesc"));
    items.push({
      id: (first(entry, "identifier") || first(entry, "id")).slice(0, 200),
      title: title.slice(0, 400),
      event: first(entry, "event").slice(0, 200),
      area: first(entry, "areaDesc").slice(0, 400),
      level: (/^(yellow|orange|red)\b/i.exec(title)?.[1]?.toLowerCase() ?? null) as MeteoalarmItem["level"],
      severity: first(entry, "severity").slice(0, 40),
      urgency: first(entry, "urgency").slice(0, 40),
      certainty: first(entry, "certainty").slice(0, 40),
      sent: time(first(entry, "sent")),
      onset: time(first(entry, "onset")),
      expires: time(first(entry, "expires")),
      coversHome: home && polygons.length > 0 ? polygons.some((polygon) => insideCapPolygon(polygon, home)) : null,
      link: linkOn(area?.href ?? "https://meteoalarm.org/", /(^|\.)meteoalarm\.org$/),
    });
  }
  const order = { red: 0, orange: 1, yellow: 2 } as const;
  items.sort((a, b) => (a.level ? order[a.level] : 3) - (b.level ? order[b.level] : 3) || (a.onset ?? 0) - (b.onset ?? 0));
  return {
    data: { country: country.code, countryName: country.name, updatedAt: time(first(root, "updated")), items },
    validFrom: null,
    validUntil: null,
  };
}

// ── The National Weather Service ────────────────────────────────────────────

export function parseNwsAlerts(text: string): Parsed<NwsData> {
  const answer = json(text, "The National Weather Service");
  if (!isRecord(answer) || !Array.isArray(answer.features))
    throw new SourceFormatError("The National Weather Service's answer is not its list of alerts.");
  const alerts: NwsAlert[] = [];
  for (const feature of answer.features.slice(0, 500)) {
    if (!isRecord(feature) || !isRecord(feature.properties)) continue;
    const p = feature.properties;
    if (p.status !== undefined && p.status !== "Actual") continue;
    alerts.push({
      id: str(p.id, 200),
      event: str(p.event, 200),
      headline: str(p.headline, 600),
      description: str(p.description, 8000),
      instruction: str(p.instruction, 4000),
      severity: str(p.severity, 40),
      urgency: str(p.urgency, 40),
      certainty: str(p.certainty, 40),
      area: str(p.areaDesc, 2000),
      sender: str(p.senderName, 200),
      sent: time(p.sent),
      onset: time(p.onset),
      ends: time(p.ends),
      expires: time(p.expires),
    });
  }
  return { data: { title: str(answer.title, 200), updatedAt: time(answer.updated), alerts }, validFrom: null, validUntil: null };
}

// ── NOAA's Space Weather Prediction Center ──────────────────────────────────

/** `noaa-scales.json`: an object keyed "-1" (yesterday), "0" (now) and "1" to "3" (forecasts). Values are strings. */
export function parseSwpcScales(text: string): SpaceWeatherData["scales"] {
  const answer = json(text, "NOAA's Space Weather Prediction Center");
  const now = isRecord(answer) ? answer["0"] : null;
  if (!isRecord(now)) throw new SourceFormatError("NOAA's answer is not its table of space weather scales.");
  const scale = (value: unknown): ScaleNow | null => {
    if (!isRecord(value)) return null;
    const level = Number(value.Scale);
    return Number.isInteger(level) && level >= 0 && level <= 5 ? { level, text: str(value.Text, 40) } : null;
  };
  return { at: utc(`${str(now.DateStamp)}T${str(now.TimeStamp)}`), r: scale(now.R), s: scale(now.S), g: scale(now.G) };
}

/** `products/summary/10cm-flux.json`: `[{ flux, time_tag }]`. */
export function parseSwpcFlux(text: string): SpaceWeatherData["flux"] {
  const answer = json(text, "NOAA's Space Weather Prediction Center");
  const row = Array.isArray(answer) ? answer[answer.length - 1] : null;
  const value = isRecord(row) ? num(Number(row.flux), 0, 2000) : null;
  const at = isRecord(row) ? utc(row.time_tag) : null;
  if (value === null || at === null) throw new SourceFormatError("NOAA's answer is not its solar flux.");
  return { value, at };
}

/** `noaa-planetary-k-index.json`: since March 2026 `[{ time_tag, Kp, a_running, station_count }]`, oldest first. */
export function parseSwpcKp(text: string): SpaceWeatherData["kp"] {
  const answer = json(text, "NOAA's Space Weather Prediction Center");
  if (!Array.isArray(answer)) throw new SourceFormatError("NOAA's answer is not its planetary K index.");
  for (let index = answer.length - 1; index >= 0; index -= 1) {
    const row = answer[index];
    if (!isRecord(row)) continue;
    const value = num(row.Kp, 0, 9);
    const at = utc(row.time_tag);
    if (value !== null && at !== null) return { value, at, a: num(row.a_running, 0, 400) };
  }
  throw new SourceFormatError("NOAA's answer is not its planetary K index.");
}

/** `wwv.txt`: the geophysical alert message, kept as written without its header lines. */
export function parseSwpcWwv(text: string): SpaceWeatherData["wwv"] {
  if (!text.includes(":Product: Geophysical Alert Message"))
    throw new SourceFormatError("NOAA's answer is not its geophysical alert message.");
  const issued = /^:Issued:\s*(\d{4}) (\w{3}) (\d{1,2}) (\d{2})(\d{2}) UTC/m.exec(text);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = issued ? months.indexOf(issued[2]!) : -1;
  const body = text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(":") && !line.startsWith("#"))
    .join("\n")
    .trim()
    .slice(0, 2000);
  return {
    text: body,
    issuedAt: issued && month >= 0 ? Date.UTC(Number(issued[1]), month, Number(issued[3]), Number(issued[4]), Number(issued[5])) : null,
  };
}

/** `daily-solar-indices.txt`: the last row of the table; its third column is the SESC sunspot number. */
export function parseSwpcSunspots(text: string): SpaceWeatherData["sunspots"] {
  const rows = text.split(/\r?\n/).filter((line) => /^\d{4} \d{2} \d{2}\s/.test(line));
  const last = rows[rows.length - 1];
  if (!last) throw new SourceFormatError("NOAA's answer is not its daily solar data.");
  const cells = last.trim().split(/\s+/);
  const value = num(Number(cells[4]), 0, 1000);
  if (value === null) throw new SourceFormatError("NOAA's daily solar data has no sunspot number for its last day.");
  return { value, day: `${cells[0]}-${cells[1]}-${cells[2]}` };
}

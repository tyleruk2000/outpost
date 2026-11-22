/**
 * The weather as last fetched, and the sun and the compass at a place.
 *
 * `weather` reads the copies Weather and hazards keeps (`ctx.services.weather.kept()`),
 * and never fetches: a copy is only ever fetched by a person pressing Update now. Each
 * part says how old it is in the words the screen uses (`freshness`), and filters the
 * way the screen does: warnings for each place's Met Office region, flood warnings still
 * in force (`homeWarnings` keeps the same rule), and river levels with the shared
 * trend and range rules.
 *
 * `sun_and_compass` answers from the shared arithmetic the map's Sun panel and the
 * Compass screen use: `sunDay` and `sunAt` (sun.ts), and `northsAt` and `compassRule`
 * (compass.ts, with the World Magnetic Model in wmm.ts).
 */
import {
  angleInWords,
  compassPoint,
  compassRule,
  dateToUtc,
  type FloodData,
  type ForecastData,
  freshness,
  type KeptCopy,
  latestReading,
  levelTrend,
  northsAt,
  RANGE_WORDS,
  type RiversData,
  rangeState,
  regionName,
  sunAt,
  sunDay,
  utcToDate,
  type WarningsData,
  type WeatherKind,
  type WeatherPlace,
  warningState,
  weatherWords,
} from "@outpost/shared";
import { z } from "zod";
import { WEATHER_SOURCES } from "../weather/sources.ts";
import { ageOf, defineTool, type ToolDefinition } from "./types.ts";
import { at4, homePlace, noHomeText, resolveNear, unknownPlace, type Where } from "./where.ts";

const NOT_FETCHED = "not fetched yet: press Update now under Preparedness → Weather and hazards.";

const PARTS = { forecast: "forecast", warnings: "warnings", floods: "flood", levels: "rivers" } as const satisfies Record<
  string,
  WeatherKind
>;
type Part = keyof typeof PARTS;

const round = (value: number | null, unit: string) => (value === null ? "?" : `${Math.round(value)}${unit}`);

function header(copy: KeptCopy, what: string, now: number): string {
  const source = WEATHER_SOURCES[copy.source];
  return `${what}, from ${source.publisher}. ${freshness(copy, now).sentence}`;
}

function forecastLines(copy: KeptCopy, place: WeatherPlace, days: number, now: number): string[] {
  const data = copy.data as ForecastData;
  const today = utcToDate(now);
  const ahead = data.days.filter((day) => day.date >= today).slice(0, days);
  return [
    header(copy, `Forecast for ${place.name}`, now),
    ...(ahead.length === 0
      ? ["The days this copy covers have passed."]
      : ahead.map(
          (day) =>
            `- ${day.date}: ${weatherWords(day.code)}, ${round(day.maxC, "°C")} high, ${round(day.minC, "°C")} low, rain ${day.precipMm ?? "?"} mm (${round(day.precipChance, "%")} chance), wind to ${round(day.windMaxKmh, " km/h")}, gusts ${round(day.gustMaxKmh, " km/h")}.`,
        )),
  ];
}

function warningLines(copy: KeptCopy, places: WeatherPlace[], now: number): string[] {
  const data = copy.data as WarningsData;
  const regions = [...new Set(places.map((place) => regionName(place.region)).filter((name): name is string => name !== null))];
  const current = data.items.filter((item) => warningState(item, now) !== "ended");
  const mine = regions.length > 0 ? current.filter((item) => regions.includes(item.region)) : current;
  const lines = [header(copy, "Met Office weather warnings", now)];
  if (regions.length > 0) lines.push(`For ${regions.join(", ")}:`);
  if (mine.length === 0) lines.push("None in force or ahead, as fetched.");
  for (const item of mine.slice(0, 8)) lines.push(`- ${item.title}${regions.length === 0 ? ` (${item.region})` : ""}`);
  if (mine.length > 8) lines.push(`and ${mine.length - 8} more.`);
  const elsewhere = current.length - mine.length;
  if (elsewhere > 0) lines.push(`${elsewhere} more elsewhere in the UK.`);
  return lines;
}

function floodLines(copy: KeptCopy, place: WeatherPlace, now: number): string[] {
  const data = copy.data as FloodData;
  const inForce = data.warnings.filter((warning) => warning.severityLevel <= 3);
  return [
    header(copy, `Flood warnings within ${data.warningsWithinKm} km of ${place.name}`, now),
    ...(inForce.length === 0
      ? ["None in force, as fetched."]
      : inForce
          .slice(0, 6)
          .map((warning) => `- ${warning.severity}: ${warning.area}${warning.riverOrSea ? ` (${warning.riverOrSea})` : ""}`)),
  ];
}

function levelLines(copy: KeptCopy, place: WeatherPlace, now: number): string[] {
  const data = copy.data as RiversData;
  return [
    header(copy, `River and sea levels near ${place.name}`, now),
    ...(data.stations.length === 0
      ? [`No level stations within ${data.withinKm} km.`]
      : data.stations.slice(0, 5).map((station) => {
          const latest = latestReading(station.recent);
          if (!latest)
            return `- ${station.label}${station.river ? ` (${station.river})` : ""}, ${station.distanceKm} km: no readings held.`;
          const trend = levelTrend(station.recent);
          return `- ${station.label}${station.river ? ` (${station.river})` : ""}, ${station.distanceKm} km: ${latest.v} ${station.unit}, ${trend.ok ? trend.direction : "trend not known"}. ${RANGE_WORDS[rangeState(station, latest.v)]}.`;
        })),
  ];
}

export const weather = defineTool({
  name: "weather",
  title: "the weather as last fetched",
  area: "weather",
  description:
    "The forecast, Met Office warnings, flood warnings and river levels for the household's places, as last fetched (never fetched now), each with its age. what: forecast, warnings, floods, levels or all.",
  input: z.object({
    what: z.enum(["forecast", "warnings", "floods", "levels", "all"]).optional().describe("Which part. Default all."),
  }),
  run({ what }, { ctx, now }) {
    const asked: Part[] = !what || what === "all" ? ["forecast", "warnings", "floods", "levels"] : [what];
    const service = ctx.services.weather;
    const places = service.places();
    const copies = service.kept();
    const placeCopy = (kind: WeatherKind, place: WeatherPlace) => copies.find((copy) => copy.kind === kind && copy.placeId === place.id);
    const lines: string[] = [];
    let held = false;
    let oldest: number | null = null;
    const note = (copy: KeptCopy) => {
      held = true;
      oldest = oldest === null ? copy.fetchedAt : Math.min(oldest, copy.fetchedAt);
    };
    for (const part of asked) {
      const kind = PARTS[part];
      if (part === "warnings") {
        const copy = copies.find((entry) => entry.kind === "warnings");
        if (copy) {
          note(copy);
          lines.push(...warningLines(copy, places, now));
        } else lines.push(`Weather warnings: ${NOT_FETCHED}`);
        continue;
      }
      const withCopy = places.filter((place) => placeCopy(kind, place));
      if (withCopy.length === 0) {
        lines.push(`${part === "forecast" ? "Forecast" : part === "floods" ? "Flood warnings" : "River levels"}: ${NOT_FETCHED}`);
        continue;
      }
      // The home place first, then the rest as the screen lists them.
      const ordered = [...withCopy.filter((place) => place.isHome), ...withCopy.filter((place) => !place.isHome)].slice(
        0,
        asked.length > 1 ? 2 : 4,
      );
      for (const place of ordered) {
        const copy = placeCopy(kind, place)!;
        note(copy);
        if (part === "forecast") lines.push(...forecastLines(copy, place, asked.length > 1 ? 2 : 5, now));
        if (part === "floods") lines.push(...floodLines(copy, place, now));
        if (part === "levels") lines.push(...levelLines(copy, place, now));
      }
      if (withCopy.length > ordered.length) lines.push(`(${withCopy.length - ordered.length} more places; ask for one part at a time.)`);
    }
    if (!held) {
      const why = places.length === 0 ? "No places are chosen for the weather, and nothing has been fetched" : "Nothing is held";
      return {
        held: false,
        url: "/prepare/weather",
        text: `${why}: ${NOT_FETCHED} Places are added there too.`,
      };
    }
    return {
      held: true,
      label: oldest !== null ? `fetched ${ageOf(oldest, now)}` : undefined,
      url: "/prepare/weather",
      text: lines.join("\n"),
    };
  },
});

// ── The sun and the compass ──────────────────────────────────────────────────

/** Places whose clocks keep UK time, by the country the point is in. */
const ZONES: Record<string, string> = {
  GB: "Europe/London",
  IM: "Europe/London",
  JE: "Europe/London",
  GG: "Europe/London",
  IE: "Europe/Dublin",
};

function clock(ms: number | null, where: Where): string {
  if (ms === null) return "none";
  const utc = `${new Date(ms).toISOString().slice(11, 16)} UTC`;
  const zone = where.country ? ZONES[where.country] : undefined;
  if (!zone) return utc;
  const local = new Date(ms).toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return `${utc} (${local} local)`;
}

const hoursMinutes = (ms: number) => `${Math.floor(ms / 3_600_000)} h ${Math.round((ms % 3_600_000) / 60_000)} min`;

const WHEN = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?$/;
/** Words a small model sends for a date, tried with llama3.2:3b: "now" and "today" mean today. */
const DAY_WORDS: Record<string, number> = { now: 0, today: 0, tonight: 0, tomorrow: 1, yesterday: -1 };

export const sunAndCompass = defineTool({
  name: "sun_and_compass",
  title: "the sun and the compass",
  area: "weather",
  description:
    "Sunrise, sunset, daylight, where the sun is in the sky, and magnetic declination and the grid magnetic angle at a place. near defaults to the home place.",
  input: z.object({
    near: z.string().trim().min(1).max(120).optional().describe('A place name, a postcode, "home", or "lat,lon". Default: home.'),
    date: z
      .string()
      .trim()
      .refine(
        (value) => WHEN.test(value) || value.toLowerCase() in DAY_WORDS,
        "Give the date as YYYY-MM-DD, or YYYY-MM-DD HH:MM in UTC, or today or tomorrow.",
      )
      .optional()
      .describe('YYYY-MM-DD, "today" or "tomorrow"; or YYYY-MM-DD HH:MM (UTC) for the sun\'s position then. Default: now.'),
  }),
  run({ near, date }, { ctx, now }) {
    let where: Where | null;
    if (near) {
      where = resolveNear(ctx, near);
      if (!where) return { held: false, text: unknownPlace(near), url: "/tools/compass" };
    } else {
      where = homePlace(ctx);
      if (!where)
        return { held: false, text: `No place was given, and ${noHomeText(ctx)} Ask again with near.`, url: "/prepare/households" };
    }
    const parts = date ? WHEN.exec(date) : null;
    const offset = date && !parts ? (DAY_WORDS[date.toLowerCase()] ?? 0) : 0;
    const day = parts ? parts[1]! : utcToDate(now + offset * 86_400_000);
    if (!Number.isFinite(dateToUtc(day))) return { held: false, text: `${day} is not a date. Give it as YYYY-MM-DD.` };
    const instant = parts?.[2]
      ? dateToUtc(day) + Number(parts[2]) * 3_600_000 + Number(parts[3]) * 60_000
      : day === utcToDate(now)
        ? now
        : null;

    const sun = sunDay(where.lat, where.lon, day);
    const rise = sun.sun.kind === "crosses" ? sun.sun.begin : null;
    const set = sun.sun.kind === "crosses" ? sun.sun.end : null;
    const lines = [
      `At ${where.name} (${where.how}), ${at4(where.lat, where.lon)}, on ${day}:`,
      sun.sun.kind === "below"
        ? "The sun does not rise (polar night)."
        : sun.sun.kind === "above"
          ? "The sun does not set (midnight sun)."
          : `Sunrise ${clock(rise, where)}${sun.sunriseBearing !== null ? ` in the ${compassPoint(sun.sunriseBearing)}` : ""}; sunset ${clock(set, where)}${sun.sunsetBearing !== null ? ` in the ${compassPoint(sun.sunsetBearing)}` : ""}. Daylight ${hoursMinutes(sun.dayLength)}.`,
      sun.civil.kind === "crosses"
        ? `First light ${clock(sun.civil.begin, where)}, last light ${clock(sun.civil.end, where)} (civil twilight).`
        : null,
      `Solar noon ${clock(sun.noon, where)}, the sun ${sun.noonAltitude.toFixed(0)}° high.`,
    ];
    if (instant !== null) {
      const position = sunAt(instant, where.lat, where.lon);
      lines.push(
        `At ${clock(instant, where)} the sun is ${position.apparentAltitude.toFixed(1)}° ${position.apparentAltitude >= 0 ? "above" : "below"} the horizon, bearing ${position.azimuth.toFixed(0)}° true (${compassPoint(position.azimuth)}).`,
      );
    }
    const norths = northsAt(where.lat, where.lon, instant ?? dateToUtc(day));
    const fromMap = norths.gridMagneticAngle ?? norths.declination;
    const rule = compassRule(fromMap);
    lines.push(
      `Magnetic declination ${angleInWords(norths.declination)} (${norths.field.model}${norths.field.outsideYears !== null ? ", outside the years the model is for" : ""}).`,
      norths.gridMagneticAngle !== null
        ? `Grid magnetic angle on an OS map: ${angleInWords(norths.gridMagneticAngle)}.`
        : "No grid magnetic angle: the place is outside the National Grid.",
      rule.mapToCompass
        ? `Map bearing to compass: ${rule.mapToCompass} ${rule.degrees}°; compass to map: ${rule.compassToMap} ${rule.degrees}°.`
        : "Map and compass bearings agree to the nearest degree.",
      norths.field.zone ? `Near a magnetic pole (${norths.field.zone} zone): a compass cannot be trusted here.` : null,
      "Worked out on this computer: the sun from NOAA's method, the declination from the World Magnetic Model.",
    );
    return {
      held: true,
      label: `${where.name}, ${day}`,
      url: `/tools/compass?lat=${where.lat.toFixed(4)}&lon=${where.lon.toFixed(4)}`,
      text: lines.filter(Boolean).join("\n"),
    };
  },
});

export const WEATHER_TOOLS: ToolDefinition[] = [weather, sunAndCompass];

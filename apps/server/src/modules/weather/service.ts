/**
 * Weather and hazards: the places chosen, what was fetched for them, and the person's
 * barometer readings.
 *
 * `update` is the only thing here that contacts anybody, and it is only ever called from
 * a route a person's press causes. A copy that fails to update is left as it was: a
 * failed fetch never takes away what was kept, and the copy keeps saying how old it is.
 */
import {
  type AlertsPlan,
  alertCountryName,
  type CapAlert,
  countryAt,
  type FloodData,
  freshness,
  HELD_STATION_HISTORIES,
  HOUSEHOLD_KINDS,
  type HomeWarningsResponse,
  homePlaceOf,
  type KeptCopy,
  type LevelReading,
  MAX_RIVER_STATIONS,
  METEOALARM_COUNTRIES,
  type MetOfficeRegionId,
  NATIONAL_SERVICE_NAMES,
  type NationalService,
  nationalServiceOf,
  type PressureReading,
  type PressureUnit,
  type ReadingImportResult,
  type ReadingsClearResult,
  type ReadingsRange,
  type RiverLevelStation,
  type RiverReadingsData,
  type RiversData,
  regionName,
  SEA_LEVEL_RANGE,
  type SpaceWeatherData,
  STATION_HISTORY_DAYS,
  type StationReadings,
  seaLevelPressure,
  toHpa,
  type UpdateOutcome,
  type WarningsData,
  WEATHER_LIMITS,
  type WeatherKept,
  type WeatherKind,
  type WeatherPlace,
  type WeatherSourceId,
  type WindPoint,
  warningState,
} from "@outpost/shared";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";

/** A thing asked for that is not there, said as a whole sentence. */
const gone = (message: string) => new AppError("not_found", message);

import { newId } from "../../core/ids.ts";
import { weatherCache, weatherPlaces, weatherReadings } from "../../db/schema.ts";
import { COUNTRIES } from "../layers/countries.ts";
import {
  capAlertOf,
  parseCapDocument,
  parseEcccAlerts,
  parseGdacs,
  parseJmaFeed,
  parseMeteoalarm,
  parseMetserviceFeed,
  parseNwsAlerts,
  parseSwpcFlux,
  parseSwpcKp,
  parseSwpcScales,
  parseSwpcSunspots,
  parseSwpcWwv,
  parseUsgsQuakes,
} from "./alert-parsers.ts";
import { readReadingsCsv } from "./csv.ts";
import {
  distanceKm,
  type Parsed,
  parseEaFloods,
  parseEaLevelStations,
  parseEaReadings,
  parseMetOfficeWarnings,
  parseNasaPower,
  parseOpenMeteo,
  parsePvgis,
  SourceFormatError,
} from "./parsers.ts";
import {
  FLOOD_WARNINGS_KM,
  MAX_METSERVICE_ALERTS,
  type SourceFetcher,
  SWPC_FILES,
  sentWords,
  sourceUrls,
  WEATHER_SOURCES,
} from "./sources.ts";

/** Readings asked for with each station's latest, enough for three hours at the usual 15 minutes and a margin. */
const LATEST_COUNT = 16;

export interface PlaceInput {
  markerId?: string | null;
  name?: string;
  lat?: number;
  lon?: number;
  region?: MetOfficeRegionId | null;
}

export interface ReadingInput {
  takenAt: number;
  value: number;
  unit: PressureUnit;
  heightM: number;
  note: string;
  windFrom: WindPoint | null;
}

export interface WeatherService {
  places(): WeatherPlace[];
  addPlace(input: PlaceInput): WeatherPlace;
  updatePlace(id: string, patch: { name?: string; region?: MetOfficeRegionId | null }): WeatherPlace;
  removePlace(id: string): void;
  kept(): KeptCopy[];
  removeCopy(id: string): void;
  /** Fetches, from the publishers, the kinds asked for, for the places asked for (all of them when none are named). */
  update(input: { kinds: WeatherKind[]; placeIds?: string[] }, signal?: AbortSignal): Promise<UpdateOutcome[]>;
  /** Fetches one station's last few days of readings, for a station held in a place's river and sea levels. */
  stationReadings(input: { placeId: string; stationId: string }, signal?: AbortSignal): Promise<StationReadings>;
  homeWarnings(now?: number): HomeWarningsResponse;
  /** Where Home is taken to be for alerts, and which national service covers it. Fetches nothing. */
  alertsPlan(): AlertsPlan;
  readings(): PressureReading[];
  addReading(input: ReadingInput): PressureReading;
  removeReading(id: string): void;
  /**
   * Removes the readings in a range, and nothing else: not places, not fetched copies.
   * With `expected`, removes nothing unless that many are in the range, so that what the
   * person was told is what goes.
   */
  clearReadings(range: ReadingsRange, expected?: number): ReadingsClearResult;
  importReadings(text: string, options: { unit: PressureUnit; heightM: number; zone: string; apply: boolean }): ReadingImportResult;
  count(): WeatherKept;
  /** Removes every fetched copy; places and readings stay. Returns what went. */
  clearCopies(): { count: number; bytes: number };
  /** Erases everything here, for "erase everything". */
  eraseAll(): WeatherKept;
}

const SOURCE_OF: Record<WeatherKind, WeatherSourceId> = {
  forecast: "open-meteo",
  warnings: "met-office-warnings",
  flood: "ea-flood",
  rivers: "ea-levels",
  "river-readings": "ea-levels",
  climate: "nasa-power",
  solar: "pvgis",
  gdacs: "gdacs",
  quakes: "usgs-quakes",
  meteoalarm: "meteoalarm",
  nws: "nws-alerts",
  eccc: "eccc-alerts",
  metservice: "metservice-alerts",
  jma: "jma-warnings",
  "space-weather": "swpc",
};

const NATIONAL_KINDS: readonly WeatherKind[] = ["meteoalarm", "nws", "eccc", "metservice", "jma"] satisfies NationalService[];

export function createWeatherService(
  ctx: AppContext,
  fetcher: SourceFetcher,
  options: { riversKm: () => number; alertCountry: () => string | null },
): WeatherService {
  const { db, sqlite } = ctx;
  // Copies kept for places that are no longer in the list (an update an earlier version
  // finished after the place was removed) are counted as fetched with nowhere to show
  // them: they go at start-up.
  const orphans = sqlite
    .prepare("DELETE FROM weather_cache WHERE place_id <> '' AND place_id NOT IN (SELECT id FROM weather_places)")
    .run().changes;
  if (orphans > 0) ctx.log.info({ removed: orphans }, "weather copies of removed places cleared");
  const changed = () => ctx.events.publish({ type: "weather.changed" });
  let updating = false;

  /** The saved place with the home icon, the first saved if several (`homePlaceOf`), or null. */
  const homeMarker = (): { id: string; name: string } | null => {
    try {
      const home = homePlaceOf(ctx.services.maps.annotations.listMarkers());
      return home ? { id: home.id, name: home.name } : null;
    } catch {
      return null;
    }
  };
  const homeMarkers = (): Set<string> => {
    const home = homeMarker();
    return new Set(home ? [home.id] : []);
  };

  const toPlace = (row: typeof weatherPlaces.$inferSelect, homes: Set<string>): WeatherPlace => ({
    id: row.id,
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    markerId: row.markerId,
    isHome: row.markerId !== null && homes.has(row.markerId),
    region: (row.region as MetOfficeRegionId | null) ?? null,
    createdAt: row.createdAt,
  });

  function places(): WeatherPlace[] {
    const homes = homeMarkers();
    return db
      .select()
      .from(weatherPlaces)
      .orderBy(asc(weatherPlaces.position))
      .all()
      .map((row) => toPlace(row, homes));
  }

  function place(id: string): WeatherPlace {
    const found = places().find((candidate) => candidate.id === id);
    if (!found) throw gone("That place is not in the list any more.");
    return found;
  }

  const toCopy = (row: typeof weatherCache.$inferSelect): KeptCopy => ({
    id: row.id,
    kind: row.kind as WeatherKind,
    source: row.source as WeatherSourceId,
    placeId: row.placeId === "" ? null : row.placeId,
    fetchedAt: row.fetchedAt,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    bytes: row.bytes,
    sent: row.sent,
    data: row.data as KeptCopy["data"],
  });

  /** Whether a place is still in the list. */
  const stillThere = (placeId: string) => sqlite.prepare("SELECT 1 FROM weather_places WHERE id = ?").get(placeId) !== undefined;

  /** Said of a place removed while its answer was on the way: what arrived for it is not kept. */
  const REMOVED = "The place was removed while this was being fetched, so nothing was kept for it.";

  /**
   * Keeps an answer. For a place, only while the place is still in the list: removing a
   * place during an update wins, and the answer that arrives after is dropped. The check
   * and the write happen together, with nothing awaited between them.
   */
  function keep(kind: WeatherKind, placeId: string | null, parsed: Parsed<unknown>, bytes: number, sent: string): void {
    if (placeId !== null && !stillThere(placeId)) throw gone(REMOVED);
    const values = {
      kind,
      source: SOURCE_OF[kind],
      placeId: placeId ?? "",
      fetchedAt: Date.now(),
      validFrom: parsed.validFrom,
      validUntil: parsed.validUntil,
      bytes,
      sent,
      data: parsed.data,
    };
    db.insert(weatherCache)
      .values({ id: newId(), ...values })
      .onConflictDoUpdate({ target: [weatherCache.kind, weatherCache.placeId], set: values })
      .run();
  }

  const failure = (error: unknown): string => {
    if (error instanceof AppError) return error.message;
    if (error instanceof SourceFormatError) return `${error.message} Nothing was changed.`;
    if ((error as Error).name === "AbortError") return "Stopped before it finished.";
    return "Something went wrong reading the answer. Nothing was changed.";
  };

  async function fetchForPlace(kind: WeatherKind, target: WeatherPlace, signal?: AbortSignal): Promise<{ bytes: number }> {
    const source = SOURCE_OF[kind];
    if (kind === "flood") {
      const floodsUrl = sourceUrls.floods(target.lat, target.lon);
      const floods = await fetcher.get(source, floodsUrl, signal);
      const data: FloodData = { warningsWithinKm: FLOOD_WARNINGS_KM, warnings: parseEaFloods(floods.text) };
      keep(kind, target.id, { data, validFrom: null, validUntil: null }, floods.bytes, sentWords(floodsUrl));
      return { bytes: floods.bytes };
    }
    if (kind === "rivers") return fetchRivers(target, signal);
    const url =
      kind === "forecast"
        ? sourceUrls.forecast(target.lat, target.lon)
        : kind === "climate"
          ? sourceUrls.climate(target.lat, target.lon)
          : sourceUrls.solar(target.lat, target.lon);
    const answer = await fetcher.get(source, url, signal);
    const parsed =
      kind === "forecast" ? parseOpenMeteo(answer.text) : kind === "climate" ? parseNasaPower(answer.text) : parsePvgis(answer.text);
    keep(kind, target.id, parsed, answer.bytes, sentWords(url));
    return { bytes: answer.bytes };
  }

  /**
   * The level stations within the chosen distance, nearest first, each with its latest
   * readings: one request for the list (with every station's scale), then one for each
   * station's readings. A station whose readings cannot be had is kept with a note; a list
   * that cannot be had changes nothing.
   */
  async function fetchRivers(target: WeatherPlace, signal?: AbortSignal): Promise<{ bytes: number }> {
    const km = options.riversKm();
    const listUrl = sourceUrls.levelStations(target.lat, target.lon, km);
    const list = await fetcher.get("ea-levels", listUrl, signal);
    let bytes = list.bytes;
    const within = parseEaLevelStations(list.text)
      .map((station) => ({ station, km: distanceKm(target, station) }))
      // The Agency says its distance "may be approximated by a bounding box".
      .filter((entry) => entry.km <= km)
      .sort((a, b) => a.km - b.km);
    const stations: RiverLevelStation[] = [];
    for (const { station, km: away } of within.slice(0, MAX_RIVER_STATIONS)) {
      if (signal?.aborted) break;
      let recent: LevelReading[] = [];
      let readingsNote: string | null = null;
      try {
        const answer = await fetcher.get("ea-levels", sourceUrls.latestReadings(station.measureId, LATEST_COUNT), signal);
        bytes += answer.bytes;
        recent = parseEaReadings(answer.text);
        if (recent.length === 0) readingsNote = "The Agency gave no recent readings for this station.";
      } catch (error) {
        if ((error as Error).name === "AbortError") throw error;
        readingsNote = `Its readings could not be fetched. ${error instanceof AppError ? error.message : "The answer could not be read."}`;
      }
      stations.push({ ...station, distanceKm: Math.round(away * 10) / 10, recent, readingsNote });
    }
    const data: RiversData = { withinKm: km, listed: within.length, stations };
    const at = new URL(listUrl).searchParams;
    const sent = `environment.data.gov.uk: latitude ${at.get("lat")}, longitude ${at.get("long")}, within ${km} km; then the level measure of ${stations.length === 1 ? "the one station" : `each of ${stations.length} stations`}`;
    keep("rivers", target.id, { data, validFrom: null, validUntil: null }, bytes, sent);
    return { bytes };
  }

  /** Where Home is, the country it is taken to be in, the country chosen instead if any, and the national service asked. */
  function alertsPlan(): AlertsPlan {
    let marker: { name: string; lat: number; lon: number } | null = null;
    try {
      const home = homePlaceOf(ctx.services.maps.annotations.listMarkers());
      marker = home ? { name: home.name || "Home", lat: home.lat, lon: home.lon } : null;
    } catch {
      marker = null;
    }
    const homeCountry = marker ? countryAt(marker, COUNTRIES) : null;
    const nameOf = (code: string | null) =>
      code ? (alertCountryName(code) ?? COUNTRIES.find((entry) => entry.code === code)?.name ?? code) : null;
    const chosen = options.alertCountry();
    const chosenCountry = chosen && nationalServiceOf(chosen) ? chosen : null;
    const country = chosenCountry ?? homeCountry;
    return {
      home: marker,
      homeCountry,
      homeCountryName: nameOf(homeCountry),
      chosenCountry,
      country,
      countryName: nameOf(country),
      national: nationalServiceOf(country),
    };
  }

  /** MetService's feed, then each alert's CAP document on the same host; an alert whose document cannot be had keeps the feed's words. */
  async function fetchMetservice(
    home: { lat: number; lon: number },
    signal?: AbortSignal,
  ): Promise<{ data: unknown; bytes: number; read: number }> {
    const feed = await fetcher.get("metservice-alerts", sourceUrls.metservice(), signal);
    const parsed = parseMetserviceFeed(feed.text);
    let bytes = feed.bytes;
    let unread = 0;
    let read = 0;
    const alerts: CapAlert[] = [];
    for (const item of parsed.items.slice(0, MAX_METSERVICE_ALERTS)) {
      if (signal?.aborted) throw Object.assign(new Error("Stopped"), { name: "AbortError" });
      let cap = null;
      if (item.link) {
        try {
          const answer = await fetcher.get("metservice-alerts", item.link, signal);
          bytes += answer.bytes;
          cap = parseCapDocument(answer.text, home);
          read += 1;
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
        }
      }
      if (!cap) unread += 1;
      if (cap?.status && cap.status !== "Actual") continue;
      alerts.push(capAlertOf(item, cap));
    }
    unread += Math.max(0, parsed.items.length - MAX_METSERVICE_ALERTS);
    const rank = (alert: CapAlert) => (alert.coversHome ? 0 : 1);
    alerts.sort((a, b) => rank(a) - rank(b) || (a.onset ?? a.sent ?? 0) - (b.onset ?? b.sent ?? 0));
    return { data: { title: parsed.title, publishedAt: parsed.publishedAt, alerts, unread }, bytes, read };
  }

  /** Fetches and keeps one of the kinds that are one copy for the household. Returns the bytes received. */
  async function fetchForHousehold(kind: WeatherKind, signal?: AbortSignal): Promise<number> {
    if (kind === "warnings") {
      const url = sourceUrls.warnings();
      const answer = await fetcher.get("met-office-warnings", url, signal);
      keep("warnings", null, parseMetOfficeWarnings(answer.text), answer.bytes, sentWords(url));
      return answer.bytes;
    }
    if (kind === "gdacs" || kind === "quakes") {
      const url = kind === "gdacs" ? sourceUrls.gdacs() : sourceUrls.quakes();
      const answer = await fetcher.get(SOURCE_OF[kind], url, signal);
      keep(kind, null, kind === "gdacs" ? parseGdacs(answer.text) : parseUsgsQuakes(answer.text), answer.bytes, sentWords(url));
      return answer.bytes;
    }
    if (NATIONAL_KINDS.includes(kind)) {
      const plan = alertsPlan();
      const who = NATIONAL_SERVICE_NAMES[kind as NationalService];
      if (plan.national !== kind)
        throw badRequest(
          plan.country
            ? `Warnings are fetched for ${plan.countryName}, which ${who} does not cover.`
            : "No saved place has the home icon and no country is chosen, so Outpost does not know which country's warnings to fetch.",
        );
      if (kind === "meteoalarm") {
        const country = METEOALARM_COUNTRIES[plan.country!]!;
        const url = sourceUrls.meteoalarm(country.slug);
        const answer = await fetcher.get("meteoalarm", url, signal);
        const parsed = parseMeteoalarm(answer.text, { code: plan.country!, name: country.name }, plan.home);
        keep(kind, null, parsed, answer.bytes, `feeds.meteoalarm.org: the feed for ${country.name}; no position`);
        return answer.bytes;
      }
      if (kind === "jma") {
        const url = sourceUrls.jma();
        const answer = await fetcher.get("jma-warnings", url, signal);
        keep(kind, null, parseJmaFeed(answer.text), answer.bytes, sentWords(url));
        return answer.bytes;
      }
      // The rest are asked about Home's position, or check their areas against it.
      if (!plan.home) throw badRequest(`No saved place has the home icon, so Outpost cannot ask ${who} about it. Mark Home on the map.`);
      if (kind === "metservice") {
        const { data, bytes, read } = await fetchMetservice(plan.home, signal);
        const sent = `alerts.metservice.com: the feed for New Zealand${read > 0 ? `, then ${read === 1 ? "the one alert" : `each of ${read} alerts`} it lists` : ""}; no position`;
        keep(kind, null, { data, validFrom: null, validUntil: null }, bytes, sent);
        return bytes;
      }
      if (kind === "eccc") {
        const url = sourceUrls.eccc(plan.home.lat, plan.home.lon);
        const answer = await fetcher.get("eccc-alerts", url, signal);
        const box = new URL(url).searchParams.get("bbox");
        keep(
          kind,
          null,
          parseEcccAlerts(answer.text, plan.home),
          answer.bytes,
          `api.weather.gc.ca: the box ${box} (west, south, east, north)`,
        );
        return answer.bytes;
      }
      const url = sourceUrls.nws(plan.home.lat, plan.home.lon);
      const answer = await fetcher.get("nws-alerts", url, signal);
      keep(kind, null, parseNwsAlerts(answer.text), answer.bytes, sentWords(url));
      return answer.bytes;
    }
    if (kind === "space-weather") {
      // The scales are what must be had; each other file is kept when it comes, and left out when it does not.
      let bytes = 0;
      const get = async <T>(url: string, read: (text: string) => T, needed: boolean): Promise<T | null> => {
        try {
          const answer = await fetcher.get("swpc", url, signal);
          bytes += answer.bytes;
          return read(answer.text);
        } catch (error) {
          if (needed || (error as Error).name === "AbortError") throw error;
          return null;
        }
      };
      const scales = (await get(SWPC_FILES.scales, parseSwpcScales, true))!;
      const data: SpaceWeatherData = {
        scales,
        flux: await get(SWPC_FILES.flux, parseSwpcFlux, false),
        kp: await get(SWPC_FILES.kp, parseSwpcKp, false),
        wwv: await get(SWPC_FILES.wwv, parseSwpcWwv, false),
        sunspots: await get(SWPC_FILES.sunspots, parseSwpcSunspots, false),
      };
      keep(
        kind,
        null,
        { data, validFrom: null, validUntil: null },
        bytes,
        "services.swpc.noaa.gov: five files for the whole Earth; no position",
      );
      return bytes;
    }
    throw badRequest("That is fetched for a place.");
  }

  const copyFor = <K extends WeatherKind>(kind: K, placeId: string): KeptCopy<K> | null => {
    const row = db
      .select()
      .from(weatherCache)
      .all()
      .find((candidate) => candidate.kind === kind && candidate.placeId === placeId);
    return row ? (toCopy(row) as KeptCopy<K>) : null;
  };

  function readings(): PressureReading[] {
    return db
      .select()
      .from(weatherReadings)
      .orderBy(asc(weatherReadings.takenAt))
      .all()
      .map((row) => ({
        ...row,
        unit: row.unit as PressureUnit,
        windFrom: (row.windFrom as WindPoint | null) ?? null,
        origin: row.origin as PressureReading["origin"],
      }));
  }

  function readingValues(input: ReadingInput) {
    const stationHpa = toHpa(input.value, input.unit);
    const seaLevelHpa = seaLevelPressure(stationHpa, input.heightM);
    if (seaLevelHpa < SEA_LEVEL_RANGE.min || seaLevelHpa > SEA_LEVEL_RANGE.max) {
      throw badRequest(
        `${input.value} ${input.unit} at ${input.heightM} m comes to ${seaLevelHpa.toFixed(0)} hPa at sea level, which is outside ${SEA_LEVEL_RANGE.min} to ${SEA_LEVEL_RANGE.max}. Check the unit and the height.`,
      );
    }
    return { stationHpa, seaLevelHpa };
  }

  function count(): WeatherKept {
    const one = (sql: string) => (sqlite.prepare(sql).get() as { n: number }).n;
    return {
      places: one("SELECT count(*) AS n FROM weather_places"),
      readings: one("SELECT count(*) AS n FROM weather_readings"),
      copies: one("SELECT count(*) AS n FROM weather_cache"),
      copyBytes: one("SELECT coalesce(sum(length(data) + length(sent)), 0) AS n FROM weather_cache"),
    };
  }

  return {
    places,

    addPlace(input) {
      if (places().length >= WEATHER_LIMITS.places) throw badRequest(`Keep forecasts for at most ${WEATHER_LIMITS.places} places.`);
      let values: { markerId: string | null; name: string; lat: number; lon: number };
      if (input.markerId) {
        const marker = ctx.services.maps.annotations.listMarkers().find((candidate) => candidate.id === input.markerId);
        if (!marker) throw gone("That saved place is not on the map any more.");
        if (places().some((existing) => existing.markerId === marker.id))
          throw conflict(`${marker.name || "That place"} is in the list already.`);
        values = {
          markerId: marker.id,
          name: (marker.name || "Saved place").slice(0, WEATHER_LIMITS.name),
          lat: marker.lat,
          lon: marker.lon,
        };
      } else {
        if (input.lat === undefined || input.lon === undefined) throw badRequest("Choose a saved place, or give a position.");
        values = {
          markerId: null,
          name: (input.name?.trim() || "A position").slice(0, WEATHER_LIMITS.name),
          lat: input.lat,
          lon: input.lon,
        };
      }
      const now = Date.now();
      const id = newId();
      const position = (sqlite.prepare("SELECT coalesce(max(position), -1) + 1 AS n FROM weather_places").get() as { n: number }).n;
      db.insert(weatherPlaces)
        .values({ id, ...values, region: input.region ?? null, position, createdAt: now, updatedAt: now })
        .run();
      changed();
      return place(id);
    },

    updatePlace(id, patch) {
      place(id);
      const set: Partial<typeof weatherPlaces.$inferInsert> = { updatedAt: Date.now() };
      if (patch.name !== undefined) set.name = patch.name.trim().slice(0, WEATHER_LIMITS.name) || "A place";
      if (patch.region !== undefined) set.region = patch.region;
      db.update(weatherPlaces).set(set).where(eq(weatherPlaces.id, id)).run();
      changed();
      return place(id);
    },

    removePlace(id) {
      place(id);
      sqlite.transaction(() => {
        db.delete(weatherCache).where(eq(weatherCache.placeId, id)).run();
        db.delete(weatherPlaces).where(eq(weatherPlaces.id, id)).run();
      })();
      changed();
    },

    kept() {
      return db.select().from(weatherCache).all().map(toCopy);
    },

    removeCopy(id) {
      const removed = db.delete(weatherCache).where(eq(weatherCache.id, id)).run().changes;
      if (removed === 0) throw gone("That copy has already gone.");
      changed();
    },

    async stationReadings({ placeId, stationId }, signal) {
      const target = place(placeId);
      const rivers = copyFor("rivers", target.id);
      const station = rivers?.data.stations.find((candidate) => candidate.id === stationId);
      if (!station) throw gone("That station is not among the river and sea levels kept for this place. Fetch them again.");
      const fetchedAt = Date.now();
      const since = fetchedAt - STATION_HISTORY_DAYS * 86_400_000;
      const url = sourceUrls.readingsSince(station.measureId, since);
      let answer: { text: string; bytes: number };
      let readings: LevelReading[];
      try {
        answer = await fetcher.get("ea-levels", url, signal);
        readings = parseEaReadings(answer.text);
      } catch (error) {
        throw error instanceof AppError ? error : new AppError("upstream", failure(error));
      }
      const entry: StationReadings = {
        stationId,
        measureId: station.measureId,
        unit: station.unit,
        fetchedAt,
        since,
        bytes: answer.bytes,
        readings,
      };
      // Read, merge and write with nothing awaited between, so two presses cannot lose each other's.
      if (!stillThere(target.id)) throw gone(REMOVED);
      const held = copyFor("river-readings", target.id)?.data.stations ?? [];
      const data: RiverReadingsData = {
        stations: [entry, ...held.filter((other) => other.stationId !== stationId)].slice(0, HELD_STATION_HISTORIES),
      };
      const bytes = data.stations.reduce((sum, other) => sum + other.bytes, 0);
      keep(
        "river-readings",
        target.id,
        { data, validFrom: null, validUntil: null },
        bytes,
        `environment.data.gov.uk: the level measure of station ${stationId}; no position`,
      );
      changed();
      return entry;
    },

    async update(input, signal) {
      if (updating) throw conflict("An update is already under way. Wait for it to finish.");
      updating = true;
      const outcomes: UpdateOutcome[] = [];
      try {
        const all = places();
        const chosen = input.placeIds ? all.filter((candidate) => input.placeIds!.includes(candidate.id)) : all;
        if (input.placeIds && chosen.length !== input.placeIds.length) throw gone("One of those places is not in the list any more.");
        if (input.kinds.includes("river-readings")) throw badRequest("A station's readings are fetched from its own view.");
        const perPlace = input.kinds.filter((kind) => !HOUSEHOLD_KINDS.includes(kind));
        if (perPlace.length > 0 && chosen.length === 0)
          throw badRequest("Choose a place first: forecasts are fetched for the places in the list.");
        for (const kind of HOUSEHOLD_KINDS.filter((candidate) => input.kinds.includes(candidate))) {
          if (signal?.aborted) break;
          const source = SOURCE_OF[kind];
          try {
            const bytes = await fetchForHousehold(kind, signal);
            outcomes.push({ kind, placeId: null, placeName: null, source, ok: true, message: null, bytes });
          } catch (error) {
            outcomes.push({ kind, placeId: null, placeName: null, source, ok: false, message: failure(error), bytes: 0 });
          }
        }
        for (const target of chosen) {
          for (const kind of perPlace) {
            if (signal?.aborted) break;
            // Removed since the update began: nothing more is asked about it.
            if (!stillThere(target.id)) {
              outcomes.push({
                kind,
                placeId: target.id,
                placeName: target.name,
                source: SOURCE_OF[kind],
                ok: false,
                message: REMOVED,
                bytes: 0,
              });
              continue;
            }
            try {
              const { bytes } = await fetchForPlace(kind, target, signal);
              outcomes.push({ kind, placeId: target.id, placeName: target.name, source: SOURCE_OF[kind], ok: true, message: null, bytes });
            } catch (error) {
              outcomes.push({
                kind,
                placeId: target.id,
                placeName: target.name,
                source: SOURCE_OF[kind],
                ok: false,
                message: failure(error),
                bytes: 0,
              });
            }
          }
        }
      } finally {
        updating = false;
        changed();
      }
      return outcomes;
    },

    alertsPlan,

    homeWarnings(now = Date.now()) {
      const all = places();
      const home = all.find((candidate) => candidate.isHome) ?? null;
      const copies = db.select().from(weatherCache).all().map(toCopy);
      const warningsCopy = copies.find((copy) => copy.kind === "warnings") ?? null;
      const floodCopy = home ? (copies.find((copy) => copy.kind === "flood" && copy.placeId === home.id) ?? null) : null;
      const region = home ? regionName(home.region) : null;
      const weather =
        warningsCopy && region
          ? (warningsCopy.data as WarningsData).items.filter((item) => item.region === region && warningState(item, now) !== "ended")
          : [];
      const flood = floodCopy ? (floodCopy.data as FloodData).warnings.filter((warning) => warning.severityLevel <= 3) : [];
      const stale =
        (warningsCopy !== null && freshness(warningsCopy, now).state !== "fresh") ||
        (floodCopy !== null && freshness(floodCopy, now).state !== "fresh");
      const live = `${WEATHER_SOURCES["met-office-warnings"].liveUrl} and ${WEATHER_SOURCES["ea-flood"].liveUrl}`;
      const marked = homeMarker();
      const note = !marked
        ? "No saved place has the home icon, so Outpost does not know which place is home."
        : !home
          ? `${marked.name || "The saved place with the home icon"} is home, but it is not in the weather list, so no warnings are matched to it.`
          : !warningsCopy
            ? `Warnings have not been fetched. The live warnings are at ${live}.`
            : `${freshness(warningsCopy, now).sentence} Outpost's copy may be out of date; the live warnings are at ${live}.${region ? "" : " No Met Office region is chosen for the home place, so no weather warning is matched to it."}`;
      return {
        place: home ? { id: home.id, name: home.name, region } : null,
        homeMarker: marked,
        fetchedAt: warningsCopy?.fetchedAt ?? null,
        weather,
        flood,
        floodFetchedAt: floodCopy?.fetchedAt ?? null,
        stale,
        note,
        now,
      };
    },

    readings,

    addReading(input) {
      if (count().readings >= WEATHER_LIMITS.readings)
        throw badRequest(`Outpost keeps at most ${WEATHER_LIMITS.readings.toLocaleString("en-GB")} readings.`);
      const { stationHpa, seaLevelHpa } = readingValues(input);
      const row = {
        id: newId(),
        takenAt: input.takenAt,
        value: input.value,
        unit: input.unit,
        stationHpa,
        heightM: input.heightM,
        seaLevelHpa,
        note: input.note.slice(0, WEATHER_LIMITS.note),
        windFrom: input.windFrom,
        origin: "typed" as const,
        createdAt: Date.now(),
      };
      db.insert(weatherReadings).values(row).run();
      changed();
      return row;
    },

    removeReading(id) {
      if (db.delete(weatherReadings).where(eq(weatherReadings.id, id)).run().changes === 0) throw gone("That reading has already gone.");
      changed();
    },

    clearReadings(range, expected) {
      const where =
        range.range === "all"
          ? sql`1 = 1`
          : range.range === "before"
            ? lt(weatherReadings.takenAt, range.before)
            : and(gte(weatherReadings.takenAt, range.from), lt(weatherReadings.takenAt, range.to));
      const removed = sqlite.transaction(() => {
        if (expected !== undefined) {
          const found = db.select({ n: sql<number>`count(*)` }).from(weatherReadings).where(where).get()?.n ?? 0;
          if (found !== expected)
            throw conflict(
              `The readings have changed since this was asked: ${found === 1 ? "1 reading is" : `${found} readings are`} in that range now. Nothing was removed; look again and choose.`,
            );
        }
        return db.delete(weatherReadings).where(where).run().changes;
      })();
      if (removed > 0) changed();
      return { removed };
    },

    importReadings(text, options) {
      const existing = new Set(readings().map((reading) => reading.takenAt));
      const result = readReadingsCsv(text, { ...options, existing, now: Date.now() });
      if (!options.apply) return result;
      const fresh = result.rows.filter((row) => !row.duplicate);
      if (count().readings + fresh.length > WEATHER_LIMITS.readings)
        throw badRequest(`That would make more than ${WEATHER_LIMITS.readings.toLocaleString("en-GB")} readings.`);
      const now = Date.now();
      sqlite.transaction(() => {
        for (const row of fresh) {
          db.insert(weatherReadings)
            .values({
              id: newId(),
              takenAt: row.takenAt,
              value: row.value,
              unit: row.unit,
              stationHpa: toHpa(row.value, row.unit),
              heightM: row.heightM,
              seaLevelHpa: row.seaLevelHpa,
              note: "",
              windFrom: row.windFrom,
              origin: "file",
              createdAt: now,
            })
            .run();
        }
      })();
      if (fresh.length > 0) changed();
      return { ...result, added: fresh.length };
    },

    count,

    clearCopies() {
      const before = count();
      db.delete(weatherCache).run();
      changed();
      return { count: before.copies, bytes: before.copyBytes };
    },

    eraseAll() {
      const before = count();
      sqlite.transaction(() => {
        db.delete(weatherCache).run();
        db.delete(weatherReadings).run();
        db.delete(weatherPlaces).run();
      })();
      changed();
      return before;
    },
  };
}

/**
 * Weather and hazards: the places chosen, what was fetched for them, and the person's
 * barometer readings.
 *
 * `update` is the only thing here that contacts anybody, and it is only ever called from
 * a route a person's press causes. A copy that fails to update is left as it was: a
 * failed fetch never takes away what was kept, and the copy keeps saying how old it is.
 */
import {
  type FloodData,
  type FloodWarning,
  freshness,
  type HomeWarningsResponse,
  type KeptCopy,
  type MetOfficeRegionId,
  type PressureReading,
  type PressureUnit,
  type ReadingImportResult,
  type RiverStation,
  regionName,
  SEA_LEVEL_RANGE,
  seaLevelPressure,
  toHpa,
  type UpdateOutcome,
  type WarningsData,
  WEATHER_LIMITS,
  type WeatherKept,
  type WeatherKind,
  type WeatherPlace,
  type WeatherSourceId,
  warningState,
} from "@outpost/shared";
import { asc, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";

/** A thing asked for that is not there, said as a whole sentence. */
const gone = (message: string) => new AppError("not_found", message);

import { newId } from "../../core/ids.ts";
import { weatherCache, weatherPlaces, weatherReadings } from "../../db/schema.ts";
import { readReadingsCsv } from "./csv.ts";
import {
  distanceKm,
  type Parsed,
  parseEaFloods,
  parseEaStation,
  parseEaStations,
  parseMetOfficeWarnings,
  parseNasaPower,
  parseOpenMeteo,
  parsePvgis,
  SourceFormatError,
} from "./parsers.ts";
import { FLOOD_WARNINGS_KM, MAX_STATIONS, type SourceFetcher, STATIONS_KM, sentWords, sourceUrls, WEATHER_SOURCES } from "./sources.ts";

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
  homeWarnings(now?: number): HomeWarningsResponse;
  readings(): PressureReading[];
  addReading(input: ReadingInput): PressureReading;
  removeReading(id: string): void;
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
  climate: "nasa-power",
  solar: "pvgis",
};

export function createWeatherService(ctx: AppContext, fetcher: SourceFetcher): WeatherService {
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

  const homeMarkers = (): Set<string> => {
    try {
      return new Set(
        ctx.services.maps.annotations
          .listMarkers()
          .filter((marker) => marker.icon === "home")
          .map((marker) => marker.id),
      );
    } catch {
      return new Set();
    }
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
      const warnings: FloodWarning[] = parseEaFloods(floods.text);
      const stationsUrl = sourceUrls.stations(target.lat, target.lon);
      const list = await fetcher.get(source, stationsUrl, signal);
      let bytes = floods.bytes + list.bytes;
      const nearest = parseEaStations(list.text)
        .map((station) => ({ station, km: distanceKm(target, station) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, MAX_STATIONS);
      const stations: RiverStation[] = [];
      for (const { station, km } of nearest) {
        const full = await fetcher.get(source, sourceUrls.station(station.id), signal);
        bytes += full.bytes;
        try {
          stations.push(parseEaStation(full.text, station, Math.round(km * 10) / 10));
        } catch {
          // One station's odd answer does not lose the others; it is left out.
        }
      }
      const data: FloodData = { warningsWithinKm: FLOOD_WARNINGS_KM, stationsWithinKm: STATIONS_KM, warnings, stations };
      keep(kind, target.id, { data, validFrom: null, validUntil: null }, bytes, sentWords(floodsUrl));
      return { bytes };
    }
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

  function readings(): PressureReading[] {
    return db
      .select()
      .from(weatherReadings)
      .orderBy(asc(weatherReadings.takenAt))
      .all()
      .map((row) => ({ ...row, unit: row.unit as PressureUnit, origin: row.origin as PressureReading["origin"] }));
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

    async update(input, signal) {
      if (updating) throw conflict("An update is already under way. Wait for it to finish.");
      updating = true;
      const outcomes: UpdateOutcome[] = [];
      try {
        const all = places();
        const chosen = input.placeIds ? all.filter((candidate) => input.placeIds!.includes(candidate.id)) : all;
        if (input.placeIds && chosen.length !== input.placeIds.length) throw gone("One of those places is not in the list any more.");
        const perPlace = input.kinds.filter((kind) => kind !== "warnings");
        if (perPlace.length > 0 && chosen.length === 0)
          throw badRequest("Choose a place first: forecasts are fetched for the places in the list.");
        if (input.kinds.includes("warnings")) {
          try {
            const url = sourceUrls.warnings();
            const answer = await fetcher.get("met-office-warnings", url, signal);
            keep("warnings", null, parseMetOfficeWarnings(answer.text), answer.bytes, sentWords(url));
            outcomes.push({
              kind: "warnings",
              placeId: null,
              placeName: null,
              source: "met-office-warnings",
              ok: true,
              message: null,
              bytes: answer.bytes,
            });
          } catch (error) {
            outcomes.push({
              kind: "warnings",
              placeId: null,
              placeName: null,
              source: "met-office-warnings",
              ok: false,
              message: failure(error),
              bytes: 0,
            });
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
      const note = !home
        ? "No place in the weather list is a saved place with the home icon."
        : !warningsCopy
          ? `Warnings have not been fetched. The live warnings are at ${live}.`
          : `${freshness(warningsCopy, now).sentence} Outpost's copy may be out of date; the live warnings are at ${live}.${region ? "" : " No Met Office region is chosen for the home place, so no weather warning is matched to it."}`;
      return {
        place: home ? { id: home.id, name: home.name, region } : null,
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

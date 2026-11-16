/**
 * The log of what actually happened on the air, and its comparison with predictions.
 *
 * An observation is a contact, a station heard, or a call that got no answer, typed in
 * or read from an ADIF file. A position is only what the person or the file stated: an
 * explicit latitude and longitude, or a Maidenhead locator of four characters or more.
 * An end with neither has no position, and is left out of any comparison.
 *
 * The comparison asks the engine for each logged path at its month, hour and frequency
 * and counts how many contacts fell where the engine gave a low, middling or high
 * reliability. It adjusts nothing in the engine, and it says what a log cannot show.
 */
import { createHash } from "node:crypto";
import fastifyMultipart from "@fastify/multipart";
import {
  ADIF_READ,
  bandOf,
  COMPARISON_LEVELS,
  COMPARISON_MAX_PATHS,
  type ComparedObservation,
  type ComparisonRequest,
  type ComparisonResult,
  comparableMode,
  comparisonLevel,
  HF_BANDS,
  HF_MAX_MHZ,
  HF_MIN_MHZ,
  noiseSetting,
  type Observation,
  type ObservationImport,
  type ObservationList,
  type ObservationOutcome,
  parseMaidenhead,
} from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { observationImports, radioObservations } from "../../db/schema.ts";
import { adifInstant, adifLocation, looksLikeAdif, MAX_ADIF_RECORDS, parseAdif } from "./adif.ts";
import { EngineRefused } from "./host.ts";
import { engineProblem, modeLine, type PropagationService } from "./service.ts";
import { antenna, noise, power } from "./shapes.ts";

/** An ADIF file larger than this is refused. A log of 100,000 contacts is about 30 MB. */
export const MAX_ADIF_BYTES = 64 * 1024 * 1024;

type Row = typeof radioObservations.$inferSelect;
type NewRow = typeof radioObservations.$inferInsert;

const tally = (counts: Map<string, number>) => [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
const bump = (counts: Map<string, number>, reason: string) => counts.set(reason, (counts.get(reason) ?? 0) + 1);

/** The band a frequency is in by the ADIF specification's own table, for the HF bands and the two beside them. */
const ADIF_BANDS: Array<[string, number, number]> = [
  ["160m", 1.8, 2.0],
  ["80m", 3.5, 4.0],
  ["60m", 5.06, 5.45],
  ["40m", 7.0, 7.3],
  ["30m", 10.1, 10.15],
  ["20m", 14.0, 14.35],
  ["17m", 18.068, 18.168],
  ["15m", 21.0, 21.45],
  ["12m", 24.89, 24.99],
  ["10m", 28.0, 29.7],
  ["6m", 50, 54],
];
const adifBandOf = (mhz: number) => ADIF_BANDS.find(([, from, to]) => mhz >= from && mhz <= to)?.[0] ?? "";

/**
 * What makes two entries the same contact: the minute, the two callsigns (or, where
 * there is none, the position), the band and the mode. The same contact exported twice,
 * or by two programs, lands on the same value.
 */
function sameAs(
  row: Pick<NewRow, "at" | "txCall" | "rxCall" | "txLat" | "txLon" | "rxLat" | "rxLon" | "band" | "frequencyMhz" | "mode" | "outcome">,
) {
  const end = (call: string | undefined, lat: number | null | undefined, lon: number | null | undefined) =>
    call
      ? call.toUpperCase()
      : lat !== null && lat !== undefined && lon !== null && lon !== undefined
        ? `${lat.toFixed(2)},${lon.toFixed(2)}`
        : "";
  const band = row.band || (row.frequencyMhz ? adifBandOf(row.frequencyMhz) || row.frequencyMhz.toFixed(3) : "");
  return createHash("sha256")
    .update(
      JSON.stringify([
        Math.floor(row.at / 60_000),
        end(row.txCall, row.txLat, row.txLon),
        end(row.rxCall, row.rxLat, row.rxLon),
        band.toLowerCase(),
        (row.mode ?? "").toUpperCase(),
        row.outcome,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

const dto = (row: Row): Observation => ({
  id: row.id,
  at: row.at,
  frequencyMhz: row.frequencyMhz,
  band: row.band,
  mode: row.mode,
  outcome: row.outcome,
  tx: { call: row.txCall, lat: row.txLat, lon: row.txLon, from: row.txFrom },
  rx: { call: row.rxCall, lat: row.rxLat, lon: row.rxLon, from: row.rxFrom },
  powerWatts: row.powerWatts,
  antenna: row.antenna,
  reportSent: row.reportSent,
  reportReceived: row.reportReceived,
  notes: row.notes,
  propMode: row.propMode,
  source: row.source,
  importId: row.importId,
  createdAt: row.createdAt,
});

const importDto = (row: typeof observationImports.$inferSelect): ObservationImport => {
  const kept = row.skipped as { skipped?: ObservationImport["skipped"]; notes?: ObservationImport["notes"] };
  return {
    id: row.id,
    fileName: row.fileName,
    adifVersion: row.adifVersion,
    program: row.program,
    records: row.records,
    imported: row.imported,
    duplicates: row.duplicates,
    skipped: kept.skipped ?? [],
    notes: kept.notes ?? [],
    createdAt: row.createdAt,
  };
};

const coordinate = (limit: number) => z.number().min(-limit).max(limit).nullable();
const end = z
  .object({ call: z.string().trim().max(20).default(""), lat: coordinate(90), lon: coordinate(180) })
  .refine((value) => (value.lat === null) === (value.lon === null), "Give both the latitude and the longitude of a place, or neither.");
const observation = z.object({
  at: z
    .string()
    .refine(
      (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)),
      "Give the date and time in UTC.",
    ),
  frequencyMhz: z.number().min(0.1).max(250_000).nullable(),
  band: z.string().trim().max(12).default(""),
  mode: z.string().trim().min(1, "Give the mode: SSB, CW, FT8.").max(24),
  outcome: z.enum(["contact", "heard", "failed"]),
  tx: end,
  rx: end,
  powerWatts: power.nullable(),
  antenna: z.string().trim().max(120).default(""),
  reportSent: z.string().trim().max(20).default(""),
  reportReceived: z.string().trim().max(20).default(""),
  notes: z.string().max(4000).default(""),
});

const comparison = z.object({
  myAntenna: antenna,
  theirAntenna: antenna,
  noise,
  defaultPowerWatts: power.nullable().default(null),
  ssnByMonth: z.record(z.string().regex(/^\d{4}-\d{2}$/), z.number().min(0).max(300)).default({}),
});

/** A stated position from a pair of ADIF location fields, or from a locator of four characters or more. */
function statedPosition(
  fields: Map<string, string>,
  names: { lat: string; lon: string; grid: string },
  notes: Map<string, number>,
  whose: string,
): { lat: number | null; lon: number | null; from: string } {
  const [latText, lonText] = [fields.get(names.lat), fields.get(names.lon)];
  if (latText && lonText) {
    const lat = adifLocation(latText, "lat");
    const lon = adifLocation(lonText, "lon");
    if (lat !== null && lon !== null) return { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)), from: "coordinates" };
    bump(notes, `${whose} latitude and longitude were not in the form the specification gives (XDDD MM.MMM) and were not used`);
  }
  const grid = (fields.get(names.grid) ?? "").toUpperCase();
  if (grid) {
    // Characters 9 and 10 of a longer locator (the _EXT fields) are not read: the first eight are already within 500 m.
    const square = grid.length >= 4 ? parseMaidenhead(grid.slice(0, 8)) : null;
    if (square) return { lat: Number(square.lat.toFixed(5)), lon: Number(square.lon.toFixed(5)), from: `locator ${square.locator}` };
    bump(
      notes,
      grid.length < 4
        ? `${whose} locator had two characters, a field 20° wide: too coarse to be a position, so that end was left without one`
        : `${whose} locator was not a Maidenhead locator and was not used`,
    );
  }
  return { lat: null, lon: null, from: "" };
}

const READING = [
  "A log holds the contacts that were made. It does not hold the calls that went unanswered, unless you logged them as such, so it cannot show how often a low prediction was right to be low.",
  "Each entry is compared in one direction only, from the transmitting end, with the same assumed antenna at every other station and the same assumed noise at every receiver. The other stations' real antennas, power and noise are not known.",
  "The engine gives a monthly median. A contact happened on one day, which may have been a good or a bad one for that month.",
  "A position read from a four-character locator is the middle of a square two degrees wide and one tall: the real station may be 100 km from it.",
  "These counts do not adjust the engine in any way.",
];

export interface ObservationsService {
  list(limit: number, offset: number): ObservationList;
  create(body: unknown): Observation;
  remove(id: string): void;
  importAdif(fileName: string, bytes: Buffer): ObservationImport;
  removeImport(id: string): number;
  compare(body: unknown): Promise<ComparisonResult>;
  count(): number;
  eraseAll(): number;
}

export async function registerObservations(
  app: FastifyInstance,
  ctx: AppContext,
  service: PropagationService,
): Promise<ObservationsService> {
  const { db, sqlite } = ctx;
  const { internals } = service;
  const changed = () => ctx.events.publish({ type: "propagation.changed" });
  const count = () => (sqlite.prepare("SELECT count(*) AS n FROM radio_observations").get() as { n: number }).n;
  const exists = (same: string) =>
    db.select({ id: radioObservations.id }).from(radioObservations).where(eq(radioObservations.sameAs, same)).get();

  function importAdif(fileName: string, bytes: Buffer): ObservationImport {
    if (!looksLikeAdif(bytes)) {
      throw badRequest(
        "That is not an ADIF file Outpost can read: it has no <EOH> or <EOR> tag. Export the log from your logging program as ADIF (a .adi file); the XML form (.adx) is not read.",
        { reason: "not-adif" },
      );
    }
    let file: ReturnType<typeof parseAdif>;
    try {
      file = parseAdif(bytes);
    } catch {
      throw new AppError(
        "too_large",
        `That file holds more than ${MAX_ADIF_RECORDS.toLocaleString("en-GB")} contacts. Export it in parts and import each.`,
      );
    }
    const skipped = new Map<string, number>();
    const notes = new Map<string, number>();
    const rows: NewRow[] = [];
    const seen = new Set<string>();
    let duplicates = 0;
    const importId = newId();
    const now = Date.now();
    if (file.truncated > 0) skipped.set("The file ends in the middle of a record", file.truncated);

    for (const { fields } of file.records) {
      const get = (name: string) => fields.get(name) ?? "";
      const call = get("CALL").toUpperCase();
      if (!call) {
        bump(skipped, "No callsign for the station contacted (CALL)");
        continue;
      }
      const at = adifInstant(get("QSO_DATE"), get("TIME_ON"));
      if (at === null) {
        bump(
          skipped,
          get("QSO_DATE") && get("TIME_ON")
            ? "The date or the time is not one the specification allows"
            : "No date or no time (QSO_DATE, TIME_ON)",
        );
        continue;
      }
      const freqText = get("FREQ");
      const frequency = freqText && /^\d+(\.\d+)?$/.test(freqText) && Number(freqText) > 0 ? Number(freqText) : null;
      if (freqText && frequency === null) bump(notes, "A frequency that is not a number of megahertz was left out");
      const band = (get("BAND") || (frequency === null ? "" : adifBandOf(frequency))).toLowerCase();
      if (frequency === null && !band) {
        bump(skipped, "Neither a frequency nor a band (FREQ, BAND)");
        continue;
      }
      const mode = get("MODE").toUpperCase();
      if (!mode) {
        bump(skipped, "No mode (MODE)");
        continue;
      }
      const submode = get("SUBMODE").toUpperCase();
      const mine = statedPosition(fields, { lat: "MY_LAT", lon: "MY_LON", grid: "MY_GRIDSQUARE" }, notes, "The logging station's");
      const theirs = statedPosition(fields, { lat: "LAT", lon: "LON", grid: "GRIDSQUARE" }, notes, "The contacted station's");
      if (mine.lat === null) bump(notes, "No position was given for the logging station, so that end has none");
      if (theirs.lat === null) bump(notes, "No position was given for the contacted station, so that end has none");
      const myCall = (get("STATION_CALLSIGN") || get("OPERATOR")).toUpperCase();
      const powerText = get("TX_PWR");
      const watts = powerText && /^\d+(\.\d+)?$/.test(powerText) && Number(powerText) > 0 ? Number(powerText) : null;
      // An SWL report is a station heard, not worked: the station heard is the transmitter and its power is not in the file.
      const heard = get("SWL").toUpperCase() === "Y";
      const [tx, rx] = heard
        ? [
            { call, ...theirs },
            { call: myCall, ...mine },
          ]
        : [
            { call: myCall, ...mine },
            { call, ...theirs },
          ];
      const row: NewRow = {
        id: newId(),
        at,
        frequencyMhz: frequency,
        band,
        mode: submode ? `${mode}/${submode}` : mode,
        outcome: heard ? "heard" : "contact",
        txCall: tx.call.slice(0, 20),
        txLat: tx.lat,
        txLon: tx.lon,
        txFrom: tx.from,
        rxCall: rx.call.slice(0, 20),
        rxLat: rx.lat,
        rxLon: rx.lon,
        rxFrom: rx.from,
        powerWatts: heard ? null : watts,
        antenna: get("MY_ANTENNA").slice(0, 120),
        reportSent: get("RST_SENT").slice(0, 20),
        reportReceived: get("RST_RCVD").slice(0, 20),
        notes: [get("COMMENT"), get("NOTES")].filter(Boolean).join("\n").slice(0, 4000),
        propMode: get("PROP_MODE").toUpperCase().slice(0, 12),
        source: "adif",
        importId,
        sameAs: "",
        createdAt: now,
        updatedAt: now,
      };
      row.sameAs = sameAs(row);
      // The same contact twice in the file, or already in the log from an earlier import or by hand.
      if (seen.has(row.sameAs) || exists(row.sameAs)) {
        duplicates += 1;
        continue;
      }
      seen.add(row.sameAs);
      rows.push(row);
    }

    const record = {
      id: importId,
      fileName: fileName.slice(0, 200) || "log.adi",
      adifVersion: (file.header.get("ADIF_VER") ?? "").slice(0, 20),
      program: [file.header.get("PROGRAMID"), file.header.get("PROGRAMVERSION")].filter(Boolean).join(" ").slice(0, 80),
      records: file.records.length + file.truncated,
      imported: rows.length,
      duplicates,
      skipped: { skipped: tally(skipped), notes: tally(notes) },
      createdAt: now,
    };
    sqlite.transaction(() => {
      db.insert(observationImports).values(record).run();
      for (let start = 0; start < rows.length; start += 200)
        db.insert(radioObservations)
          .values(rows.slice(start, start + 200))
          .run();
    })();
    changed();
    return importDto(db.select().from(observationImports).where(eq(observationImports.id, importId)).get()!);
  }

  async function compare(body: unknown): Promise<ComparisonResult> {
    const request = comparison.parse(body) as ComparisonRequest;
    const started = Date.now();
    const excluded = new Map<string, number>();
    const months = new Map<string, number>();
    const levels = new Map(COMPARISON_LEVELS.map((level) => [level.id, { id: level.id, contact: 0, heard: 0, failed: 0 }]));
    const rows: ComparedObservation[] = [];
    try {
      const { description } = await internals.host.describe();
      /** The engine's day for one path, month, frequency, power and requirement, asked once however many contacts share it. */
      const asked = new Map<
        string,
        Promise<{ distanceKm: number; hours: Array<{ reliability: number; snrDbHz: number; path: string | null; notModelled?: true }> } | string>
      >();
      const ssnOf = new Map<string, number | null>();
      const all = db.select().from(radioObservations).orderBy(desc(radioObservations.at)).all();
      for (const row of all) {
        const out = (reason: string) => bump(excluded, reason);
        if (row.propMode && row.propMode !== "F2") {
          out(`Logged as travelling another way (PROP_MODE ${row.propMode}), which is not a path the engine predicts`);
          continue;
        }
        if (row.txLat === null || row.txLon === null || row.rxLat === null || row.rxLon === null) {
          out("One end or both have no stated position");
          continue;
        }
        const band = HF_BANDS.find((item) => item.id === row.band);
        // A contact logged with a band and no frequency is compared at the band's middle, as the planner compares bands.
        const mhz = row.frequencyMhz ?? band?.mhz ?? null;
        if (mhz === null || mhz < HF_MIN_MHZ || mhz > HF_MAX_MHZ) {
          out(`Outside the ${HF_MIN_MHZ} to ${HF_MAX_MHZ} MHz the engine covers`);
          continue;
        }
        const modeId = comparableMode(row.mode);
        if (!modeId) {
          out("A mode with no published requirement here, so no reliability to compare (only SSB, CW, FT8 and JS8 have one)");
          continue;
        }
        // The transmitting end's power: the logging station's for a contact or a call, unknown for a station heard.
        const watts = row.powerWatts ?? request.defaultPowerWatts;
        if (watts === null) {
          out("No power was logged, and none was given to assume");
          continue;
        }
        const tx = { name: row.txCall, lat: Number(row.txLat.toFixed(2)), lon: Number(row.txLon.toFixed(2)) };
        const rx = { name: row.rxCall, lat: Number(row.rxLat.toFixed(2)), lon: Number(row.rxLon.toFixed(2)) };
        if (tx.lat === rx.lat && tx.lon === rx.lon) {
          out("Both ends are in the same place, to a hundredth of a degree");
          continue;
        }
        const when = new Date(row.at);
        const month = when.toISOString().slice(0, 7);
        if (!ssnOf.has(month)) {
          const given = request.ssnByMonth[month];
          try {
            const { basis } = await internals.basis(
              `${month}-15`,
              given === undefined ? { source: "table" } : { source: "manual", ssn: given },
            );
            ssnOf.set(month, basis.ssn);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            ssnOf.set(month, null);
          }
        }
        const ssn = ssnOf.get(month)!;
        if (ssn === null) {
          bump(months, month);
          out("The solar table has no sunspot number for that month, and none was given");
          continue;
        }
        const line = modeLine(modeId);
        const power = Number(watts.toFixed(1));
        const frequency = Number(mhz.toFixed(2));
        // The logging station is the transmitter of a contact or a call, and the receiver of a station heard.
        const [txAntenna, rxAntenna] =
          row.outcome === "heard" ? [request.theirAntenna, request.myAntenna] : [request.myAntenna, request.theirAntenna];
        const key = JSON.stringify([
          tx.lat,
          tx.lon,
          rx.lat,
          rx.lon,
          month,
          ssn,
          frequency,
          power,
          line.requiredSnrDbHz,
          row.outcome === "heard",
        ]);
        if (!asked.has(key)) {
          if (asked.size >= COMPARISON_MAX_PATHS) {
            out(`Beyond the ${COMPARISON_MAX_PATHS} most recent paths compared at once`);
            continue;
          }
          asked.set(
            key,
            internals.host
              .circuit({
                tx,
                rx,
                year: when.getUTCFullYear(),
                month: when.getUTCMonth() + 1,
                ssn,
                powerWatts: power,
                frequenciesMhz: [frequency],
                requiredSnrDbHz: line.requiredSnrDbHz!,
                noiseDbwAt3Mhz: noiseSetting(request.noise).dbwAt3Mhz,
                txAntenna,
                rxAntenna,
              })
              .then(
                (circuit) => ({ distanceKm: circuit.distanceKm, hours: circuit.hours.map((hour) => hour.cells[0]!) }),
                (error) => {
                  if (error instanceof EngineRefused) return error.message;
                  throw error;
                },
              ),
          );
        }
        const answer = await asked.get(key)!;
        if (typeof answer === "string") {
          out("The engine could not work the path out");
          continue;
        }
        // The engine's hours are the whole hours 01:00 to 24:00; a contact is compared at the nearest.
        const nearest = Math.round((when.getUTCHours() * 60 + when.getUTCMinutes()) / 60);
        const utcHour = nearest === 0 ? 24 : nearest;
        const cell = answer.hours[utcHour - 1]!;
        if (cell.notModelled) {
          out("One of the antennas chosen is a wire the engine's model does not describe on that frequency");
          continue;
        }
        if (cell.path === null) {
          out("The engine found no path at that hour, so it gives no figures for it");
          continue;
        }
        const level = comparisonLevel(cell.reliability);
        levels.get(level)![row.outcome as ObservationOutcome] += 1;
        rows.push({
          id: row.id,
          at: row.at,
          utcHour,
          frequencyMhz: frequency,
          mode: modeId,
          outcome: row.outcome,
          txCall: row.txCall,
          rxCall: row.rxCall,
          distanceKm: answer.distanceKm,
          reliability: cell.reliability,
          snrDbHz: cell.snrDbHz,
          ssn,
          level,
        });
      }
      return {
        computedAt: Date.now(),
        tookMs: Date.now() - started,
        engine: description,
        request,
        total: all.length,
        compared: rows.length,
        levels: [...levels.values()],
        excluded: tally(excluded),
        monthsWithoutSsn: [...months].map(([month, n]) => ({ month, count: n })).sort((a, b) => a.month.localeCompare(b.month)),
        rows,
        reading: READING,
      };
    } catch (error) {
      engineProblem(error);
    }
  }

  const observations: ObservationsService = {
    list(limit, offset) {
      return {
        observations: db
          .select()
          .from(radioObservations)
          .orderBy(desc(radioObservations.at), desc(radioObservations.id))
          .limit(limit)
          .offset(offset)
          .all()
          .map(dto),
        total: count(),
        imports: db.select().from(observationImports).orderBy(desc(observationImports.createdAt)).all().map(importDto),
      };
    },
    create(body) {
      const input = observation.parse(body);
      const at = Date.parse(input.at);
      const band =
        input.band.toLowerCase() || (input.frequencyMhz === null ? "" : (bandOf(input.frequencyMhz)?.id ?? adifBandOf(input.frequencyMhz)));
      if (input.frequencyMhz === null && !band) throw badRequest("Give the frequency or the band.");
      const now = Date.now();
      const row: NewRow = {
        id: newId(),
        at,
        frequencyMhz: input.frequencyMhz,
        band,
        mode: input.mode.toUpperCase(),
        outcome: input.outcome,
        txCall: input.tx.call.toUpperCase(),
        txLat: input.tx.lat,
        txLon: input.tx.lon,
        txFrom: input.tx.lat === null ? "" : "coordinates",
        rxCall: input.rx.call.toUpperCase(),
        rxLat: input.rx.lat,
        rxLon: input.rx.lon,
        rxFrom: input.rx.lat === null ? "" : "coordinates",
        powerWatts: input.powerWatts,
        antenna: input.antenna,
        reportSent: input.reportSent,
        reportReceived: input.reportReceived,
        notes: input.notes,
        propMode: "",
        source: "manual",
        importId: null,
        sameAs: "",
        createdAt: now,
        updatedAt: now,
      };
      row.sameAs = sameAs(row);
      if (exists(row.sameAs)) {
        throw conflict("That entry is already in the log: the same minute, stations, band and mode. Nothing was added.", {
          reason: "duplicate",
        });
      }
      db.insert(radioObservations).values(row).run();
      changed();
      return dto(db.select().from(radioObservations).where(eq(radioObservations.id, row.id!)).get()!);
    },
    remove(id) {
      const row = db.select({ id: radioObservations.id }).from(radioObservations).where(eq(radioObservations.id, id)).get();
      if (!row) throw notFound("That entry of the log");
      db.delete(radioObservations).where(eq(radioObservations.id, id)).run();
      changed();
    },
    importAdif,
    removeImport(id) {
      const row = db.select().from(observationImports).where(eq(observationImports.id, id)).get();
      if (!row) throw notFound("That import");
      const held = (sqlite.prepare("SELECT count(*) AS n FROM radio_observations WHERE import_id = ?").get(id) as { n: number }).n;
      sqlite.transaction(() => {
        db.delete(radioObservations).where(eq(radioObservations.importId, id)).run();
        db.delete(observationImports).where(eq(observationImports.id, id)).run();
      })();
      changed();
      return held;
    },
    compare,
    count,
    eraseAll() {
      const held = count();
      sqlite.transaction(() => {
        db.delete(radioObservations).run();
        db.delete(observationImports).run();
      })();
      return held;
    },
  };

  // ── Routes ────────────────────────────────────────────────────────────────

  // Another module may have registered the multipart parser already; twice is an error.
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(fastifyMultipart, { limits: { fileSize: ctx.config.maxUploadBytes } });
  }

  async function receive(request: FastifyRequest): Promise<{ fileName: string; bytes: Buffer }> {
    if (!request.isMultipart()) throw badRequest("Send the file as a multipart/form-data upload.");
    let upload: { fileName: string; bytes: Buffer } | undefined;
    try {
      for await (const part of request.parts({ limits: { fileSize: MAX_ADIF_BYTES, files: 1, fields: 4, fieldSize: 400 } })) {
        if (part.type === "field") continue;
        // Bounded by the size limit above, so reading it whole is safe.
        upload = { fileName: part.filename ?? "", bytes: await part.toBuffer() };
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE")
        throw new AppError("too_large", "That file is larger than 64 MB. Export the log in parts and import each.");
      if (code === "FST_FILES_LIMIT") throw badRequest("Import one file at a time.");
      throw error;
    }
    if (!upload) throw badRequest("No file was sent. Choose an ADIF file to import.");
    return upload;
  }

  const page = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) });
  type IdParams = { Params: { id: string } };

  app.get("/api/radio/observations", async (request) => {
    const { limit, offset } = page.parse(request.query);
    return { ...observations.list(limit, offset), adif: ADIF_READ };
  });
  app.post("/api/radio/observations", async (request) => ({ observation: observations.create(request.body) }));
  app.delete<IdParams>("/api/radio/observations/:id", async (request) => {
    observations.remove(request.params.id);
    return { ok: true };
  });
  app.post("/api/radio/observations/import", async (request) => {
    const { fileName, bytes } = await receive(request);
    return { import: observations.importAdif(fileName, bytes) };
  });
  app.delete<IdParams>("/api/radio/observations/imports/:id", async (request) => ({
    removed: observations.removeImport(request.params.id),
  }));
  app.post("/api/radio/observations/compare", async (request) => ({ comparison: await observations.compare(request.body) }));

  return observations;
}

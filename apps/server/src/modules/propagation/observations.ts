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
  type ObservationImportResponse,
  type ObservationList,
  type ObservationOutcome,
  parseMaidenhead,
} from "@outpost/shared";
import { desc, eq, isNull, notInArray, or } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, notFound } from "../../core/errors.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { registerMultipart } from "../../core/multipart.ts";
import { observationImports, radioObservations } from "../../db/schema.ts";
import { adifInstant, adifLocation, adifReader, looksLikeAdif, MAX_ADIF_RECORDS } from "./adif.ts";
import { EngineRefused } from "./host.ts";
import { engineProblem, modeLine, type PropagationService } from "./service.ts";
import { antenna, noise, power } from "./shapes.ts";

/** An ADIF file larger than this is refused. A log of 100,000 contacts is about 30 MB. */
export const MAX_ADIF_BYTES = 64 * 1024 * 1024;
/**
 * A file no larger than this is brought in while the request waits; a larger one is a
 * job. Set by measurement (docs/hf-propagation.md has the figures): reading and writing
 * a contact takes about 17 millionths of a second, so at the usual 300 bytes a contact
 * this is some 450 contacts and 8 ms, and a file of the barest contacts (70 bytes) about
 * 25 ms.
 */
export const ADIF_DIRECT_BYTES = 128 * 1024;
export const ADIF_IMPORT_JOB = "propagation.adif-import";
/** Records read and written before a job looks up from the work. */
const IMPORT_BATCH = 200;
/** Rows taken out at a time when an import is undone. */
const UNDO_BATCH = 1000;

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

const isPending = (row: typeof observationImports.$inferSelect) => (row.skipped as { pending?: boolean }).pending === true;

const coordinate = (limit: number) => z.number().min(-limit).max(limit).nullable();
const end = z
  .object({
    call: z.string().trim().max(20).default(""),
    lat: coordinate(90),
    lon: coordinate(180),
    /** The locator the position was typed as, so the log can say it back as given: "IO84NE". */
    locator: z
      .string()
      .trim()
      .max(10)
      .refine((value) => parseMaidenhead(value) !== null, "That is not a Maidenhead locator.")
      .optional(),
  })
  .refine((value) => (value.lat === null) === (value.lon === null), "Give both the latitude and the longitude of a place, or neither.");

/** Where an end's position came from, for an entry typed in: the locator it was given as, or coordinates. */
const typedFrom = (value: z.infer<typeof end>) =>
  value.lat === null ? "" : value.locator ? `locator ${parseMaidenhead(value.locator)!.locator}` : "coordinates";
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

export interface Unhurried {
  /** The id the import is to have, when something outside already knows it by one. */
  importId?: string;
  signal?: AbortSignal;
  progress?(readBytes: number, totalBytes: number): void;
  /** The most contacts taken from one file: `MAX_ADIF_RECORDS` unless a test asks for fewer. */
  mostRecords?: number;
}

export interface ObservationsService {
  list(limit: number, offset: number): ObservationList;
  create(body: unknown): Observation;
  /** An entry put right: the same fields as one typed in. It keeps where it came from, so one from a file still goes back with it. */
  update(id: string, body: unknown): Observation;
  remove(id: string): void;
  /**
   * Reads a file into the log, all of it or none. Given `unhurried`, it looks up from the
   * work between batches, reports how far it has read, and stops when the signal says so.
   */
  importAdif(fileName: string, bytes: Buffer, unhurried?: Unhurried): Promise<ObservationImport>;
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
  // ── Imports under way ─────────────────────────────────────────────────────
  //
  // A file is written in batches, and for a large one the server answers other requests
  // between them. Until the last batch is in, the import's row is marked `pending`, and
  // nothing here shows it or the entries it has brought in so far: the log has all of a
  // file or none of it. The mark is in the row's JSON, so it needed no change of schema.

  const pendingImports = sqlite.prepare("SELECT id FROM observation_imports WHERE json_extract(skipped, '$.pending') = 1").pluck();
  const pending = () => pendingImports.all() as string[];
  /** What a reading of the log is narrowed by, so that an import under way is not in it. Nothing, when none is. */
  const settled = () => {
    const ids = pending();
    return ids.length === 0 ? undefined : or(isNull(radioObservations.importId), notInArray(radioObservations.importId, ids));
  };
  const countAll = sqlite.prepare("SELECT count(*) FROM radio_observations").pluck();
  const countSettled = sqlite
    .prepare(
      "SELECT count(*) FROM radio_observations WHERE import_id IS NULL OR import_id NOT IN (SELECT id FROM observation_imports WHERE json_extract(skipped, '$.pending') = 1)",
    )
    .pluck();
  const count = () => (pending().length === 0 ? countAll.get() : countSettled.get()) as number;
  const sameEntry = sqlite.prepare("SELECT id, import_id AS importId FROM radio_observations WHERE same_as = ?");
  const exists = (same: string) => sameEntry.get(same) as { id: string; importId: string | null } | undefined;

  const startImport = sqlite.prepare(
    `INSERT INTO observation_imports (id, file_name, records, imported, duplicates, skipped, created_at)
     VALUES (@id, @fileName, 0, 0, 0, '{"pending":true}', @now)`,
  );
  const finishImport = sqlite.prepare(
    `UPDATE observation_imports SET adif_version = @adifVersion, program = @program, records = @records,
            imported = @imported, duplicates = @duplicates, skipped = @skipped WHERE id = @id`,
  );
  // The same contact twice in the file, or already in the log from an earlier import or by hand,
  // meets the unique index on `same_as` and is left out: no look-up of its own for each record.
  const insertEntry = sqlite.prepare(
    `INSERT INTO radio_observations (id, at, frequency_mhz, band, mode, outcome, tx_call, tx_lat, tx_lon, tx_from,
            rx_call, rx_lat, rx_lon, rx_from, power_watts, antenna, report_sent, report_received, notes, prop_mode,
            source, import_id, same_as, created_at, updated_at)
     VALUES (@id, @at, @frequencyMhz, @band, @mode, @outcome, @txCall, @txLat, @txLon, @txFrom,
            @rxCall, @rxLat, @rxLon, @rxFrom, @powerWatts, @antenna, @reportSent, @reportReceived, @notes, @propMode,
            @source, @importId, @sameAs, @createdAt, @updatedAt)
     ON CONFLICT (same_as) DO NOTHING`,
  );
  /** Writes a batch as one transaction and says how many of it were new. */
  const writeBatch = sqlite.transaction((rows: NewRow[]): number => {
    let added = 0;
    for (const row of rows) added += insertEntry.run(row).changes;
    return added;
  });
  const undoEntries = sqlite.prepare(
    `DELETE FROM radio_observations WHERE id IN (SELECT id FROM radio_observations WHERE import_id = ? LIMIT ${UNDO_BATCH})`,
  );
  const undoImport = sqlite.prepare("DELETE FROM observation_imports WHERE id = ? AND json_extract(skipped, '$.pending') = 1");
  /** Takes out everything an import that never finished has written, a batch at a time. An import that finished is not touched. */
  async function undo(importId: string, pause: boolean): Promise<void> {
    if (!pending().includes(importId)) return;
    while (undoEntries.run(importId).changes > 0) if (pause) await yieldToEventLoop();
    undoImport.run(importId);
  }

  const notAdif = () =>
    badRequest(
      "That is not an ADIF file Outpost can read: it has no <EOH> or <EOR> tag. Export the log from your logging program as ADIF (a .adi file); the XML form (.adx) is not read.",
      { reason: "not-adif" },
    );

  /** What a record of the file becomes in the log, or nothing, with the reason counted. */
  function entryOf(
    fields: Map<string, string>,
    importId: string,
    now: number,
    skipped: Map<string, number>,
    notes: Map<string, number>,
  ): NewRow | null {
    const get = (name: string) => fields.get(name) ?? "";
    const call = get("CALL").toUpperCase();
    if (!call) {
      bump(skipped, "No callsign for the station contacted (CALL)");
      return null;
    }
    const at = adifInstant(get("QSO_DATE"), get("TIME_ON"));
    if (at === null) {
      bump(
        skipped,
        get("QSO_DATE") && get("TIME_ON")
          ? "The date or the time is not one the specification allows"
          : "No date or no time (QSO_DATE, TIME_ON)",
      );
      return null;
    }
    const freqText = get("FREQ");
    const frequency = freqText && /^\d+(\.\d+)?$/.test(freqText) && Number(freqText) > 0 ? Number(freqText) : null;
    if (freqText && frequency === null) bump(notes, "A frequency that is not a number of megahertz was left out");
    const band = (get("BAND") || (frequency === null ? "" : adifBandOf(frequency))).toLowerCase();
    if (frequency === null && !band) {
      bump(skipped, "Neither a frequency nor a band (FREQ, BAND)");
      return null;
    }
    const mode = get("MODE").toUpperCase();
    if (!mode) {
      bump(skipped, "No mode (MODE)");
      return null;
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
    return row;
  }

  /**
   * Reads the file a batch of records at a time and writes each batch as it is read, so
   * that no step is longer than a batch whatever the size of the file. All of the file
   * is brought in or none of it: stopped, refused or failed part of the way, what was
   * written is taken out again (unless the server is stopping, when the job that runs
   * again at the next start does it).
   */
  async function importAdif(fileName: string, bytes: Buffer, unhurried?: Unhurried): Promise<ObservationImport> {
    const pause = unhurried ? yieldToEventLoop : undefined;
    if (!(await looksLikeAdif(bytes, pause))) throw notAdif();
    const importId = unhurried?.importId ?? newId();
    const now = Date.now();
    const reader = adifReader(bytes);
    const most = unhurried?.mostRecords ?? MAX_ADIF_RECORDS;
    const skipped = new Map<string, number>();
    const notes = new Map<string, number>();
    let imported = 0;
    let duplicates = 0;
    startImport.run({ id: importId, fileName: fileName.slice(0, 200) || "log.adi", now });
    try {
      while (!reader.done) {
        const records = reader.read(IMPORT_BATCH);
        if (reader.count > most) {
          throw new AppError(
            "too_large",
            `That file holds more than ${most.toLocaleString("en-GB")} contacts. Export it in parts and import each.`,
          );
        }
        const rows: NewRow[] = [];
        for (const { fields } of records) {
          const row = entryOf(fields, importId, now, skipped, notes);
          if (row) rows.push(row);
        }
        if (rows.length > 0) {
          const added = writeBatch(rows);
          imported += added;
          duplicates += rows.length - added;
        }
        if (pause) {
          unhurried?.progress?.(reader.position, bytes.length);
          await pause();
          if (unhurried?.signal?.aborted) throw new Error("The import was stopped.");
        }
      }
      // A file with not one whole record in it is refused in words. Recorded as an import of
      // nothing, it would read as a log that had been looked through and found empty.
      if (reader.count === 0) {
        const nothing = (message: string) => badRequest(`${message} Nothing was brought in.`, { reason: "nothing-to-read" });
        if (reader.headerNeverEnds) {
          throw nothing(
            "This file begins with text, which ADIF takes as a header, but has no <EOH> tag to end the header, so its contacts cannot be told from it. Export the log again, or delete the text before the first < in the file.",
          );
        }
        if (reader.truncated > 0)
          throw nothing("This file ends in the middle of its first contact: it has no <EOR> tag that ends a whole one.");
        throw nothing(
          reader.headerEnded
            ? "This file has a header and no contacts after it."
            : "This file has no contacts in it: no fields come before any of its <EOR> tags.",
        );
      }
      const left = new Map(reader.truncated > 0 ? [["The file ends in the middle of a record", reader.truncated]] : []);
      for (const [reason, n] of skipped) left.set(reason, n);
      // The one write that makes the import, and everything it brought in, part of the log.
      finishImport.run({
        id: importId,
        adifVersion: (reader.header.get("ADIF_VER") ?? "").slice(0, 20),
        program: [reader.header.get("PROGRAMID"), reader.header.get("PROGRAMVERSION")].filter(Boolean).join(" ").slice(0, 80),
        records: reader.count + reader.truncated,
        imported,
        duplicates,
        skipped: JSON.stringify({ skipped: tally(left), notes: tally(notes) }),
      });
    } catch (error) {
      if (unhurried?.signal?.reason !== "shutdown") await undo(importId, pause !== undefined);
      throw error;
    }
    changed();
    return importDto(db.select().from(observationImports).where(eq(observationImports.id, importId)).get()!);
  }

  async function compare(body: unknown): Promise<ComparisonResult> {
    const request = comparison.parse(body) as ComparisonRequest;
    const started = Date.now();
    const excluded = new Map<string, number>();
    const months = new Map<string, number>();
    const levels = new Map(COMPARISON_LEVELS.map((level) => [level.id, { id: level.id, contact: 0, heard: 0, failed: 0 }]));
    // Entries whose figure is approximate (a level wire longer than a half-wave) are counted apart.
    const approximateLevels = new Map(COMPARISON_LEVELS.map((level) => [level.id, { id: level.id, contact: 0, heard: 0, failed: 0 }]));
    const rows: ComparedObservation[] = [];
    try {
      const { description } = await internals.host.describe();
      /** The engine's day for one path, month, frequency, power and requirement, asked once however many contacts share it. */
      const asked = new Map<
        string,
        Promise<
          | {
              distanceKm: number;
              hours: Array<{ reliability: number; snrDbHz: number; path: string | null; notModelled?: true; approximate?: true }>;
            }
          | string
        >
      >();
      const ssnOf = new Map<string, number | null>();
      const all = db.select().from(radioObservations).where(settled()).orderBy(desc(radioObservations.at)).all();
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
        (cell.approximate ? approximateLevels : levels).get(level)![row.outcome as ObservationOutcome] += 1;
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
          ...(cell.approximate ? { approximate: true as const } : {}),
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
        approximateLevels: [...approximateLevels.values()],
        comparedApproximate: rows.filter((item) => item.approximate).length,
        excluded: tally(excluded),
        monthsWithoutSsn: [...months].map(([month, n]) => ({ month, count: n })).sort((a, b) => a.month.localeCompare(b.month)),
        rows,
        reading: READING,
      };
    } catch (error) {
      engineProblem(error);
    }
  }

  /** The fields of an entry as typed in, checked, with the band worked out from the frequency where none was given. */
  function typedRow(body: unknown) {
    const input = observation.parse(body);
    const band =
      input.band.toLowerCase() || (input.frequencyMhz === null ? "" : (bandOf(input.frequencyMhz)?.id ?? adifBandOf(input.frequencyMhz)));
    if (input.frequencyMhz === null && !band) throw badRequest("Give the frequency or the band.");
    const fields = {
      at: Date.parse(input.at),
      frequencyMhz: input.frequencyMhz,
      band,
      mode: input.mode.toUpperCase(),
      outcome: input.outcome,
      txCall: input.tx.call.toUpperCase(),
      txLat: input.tx.lat,
      txLon: input.tx.lon,
      txFrom: typedFrom(input.tx),
      rxCall: input.rx.call.toUpperCase(),
      rxLat: input.rx.lat,
      rxLon: input.rx.lon,
      rxFrom: typedFrom(input.rx),
      powerWatts: input.powerWatts,
      antenna: input.antenna,
      reportSent: input.reportSent,
      reportReceived: input.reportReceived,
      notes: input.notes,
    };
    return { ...fields, sameAs: sameAs(fields) };
  }
  const duplicate = (same: { importId: string | null }, outcome: string) =>
    conflict(
      same.importId !== null && pending().includes(same.importId)
        ? `The same entry is in the file being brought in at the moment: the same minute, stations, band and mode. ${outcome}`
        : `That entry is already in the log: the same minute, stations, band and mode. ${outcome}`,
      { reason: "duplicate" },
    );

  const observations: ObservationsService = {
    list(limit, offset) {
      return {
        observations: db
          .select()
          .from(radioObservations)
          .where(settled())
          .orderBy(desc(radioObservations.at), desc(radioObservations.id))
          .limit(limit)
          .offset(offset)
          .all()
          .map(dto),
        total: count(),
        imports: db
          .select()
          .from(observationImports)
          .orderBy(desc(observationImports.createdAt))
          .all()
          .filter((row) => !isPending(row))
          .map(importDto),
        importing: importsWaiting().map(toJobDto)[0] ?? null,
      };
    },
    create(body) {
      const now = Date.now();
      const row: NewRow = {
        ...typedRow(body),
        id: newId(),
        propMode: "",
        source: "manual",
        importId: null,
        createdAt: now,
        updatedAt: now,
      };
      const same = exists(row.sameAs!);
      if (same) throw duplicate(same, "Nothing was added.");
      db.insert(radioObservations).values(row).run();
      changed();
      return dto(db.select().from(radioObservations).where(eq(radioObservations.id, row.id!)).get()!);
    },
    update(id, body) {
      const held = db.select().from(radioObservations).where(eq(radioObservations.id, id)).get();
      if (!held) throw notFound("That entry of the log");
      // Where it came from (typed in, or a file it goes back with) and how the log says it travelled are kept.
      const fields = typedRow(body);
      const same = exists(fields.sameAs);
      if (same && same.id !== id) throw duplicate(same, "Nothing was changed.");
      db.update(radioObservations)
        .set({ ...fields, updatedAt: Date.now() })
        .where(eq(radioObservations.id, id))
        .run();
      changed();
      return dto(db.select().from(radioObservations).where(eq(radioObservations.id, id)).get()!);
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
      // One still being brought in is stopped as the job it is, not taken back from here.
      if (!row || isPending(row)) throw notFound("That import");
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

  // ── The job a large file is brought in by ─────────────────────────────────

  /**
   * The files of imports waiting or under way. They are held in memory, at most one at a
   * time and at most 64 MB: a file is not written to the person's disk to be read back.
   * The cost is that an import does not outlast the server: started again, its job finds
   * no file, clears what was written and says so.
   */
  const files = new Map<string, Buffer>();
  const importsWaiting = () => ctx.jobs.list({ states: ["queued", "running", "paused"], types: [ADIF_IMPORT_JOB], limit: 1 });
  const busy = () =>
    conflict("Another log is being brought in. Wait for it to finish, or stop it, then import this one.", { reason: "import-busy" });

  ctx.jobs.register<{ importId: string; fileName: string }>(ADIF_IMPORT_JOB, {
    queue: "import",
    async run({ payload, signal, progress }) {
      const bytes = files.get(payload.importId);
      if (!bytes) {
        await undo(payload.importId, true);
        throw new PermanentJobError(
          "Outpost was restarted before this log had been brought in, and the file was held in memory only. Nothing was brought in: import the file again.",
          "import",
        );
      }
      progress({ current: 0, total: bytes.length, message: "Reading the log" });
      const done = await importAdif(payload.fileName, bytes, {
        importId: payload.importId,
        signal,
        progress: (current, total) => progress({ current, total }),
      });
      return { kind: "adif-import", import: done as unknown as Record<string, unknown> };
    },
    onSettled(job) {
      files.delete((job.payload as { importId: string }).importId);
    },
  });

  // An import left part written by a server that stopped, whose job is no longer there to clear it.
  {
    const waiting = new Set(
      ctx.jobs
        .list({ states: ["queued", "running", "paused"], types: [ADIF_IMPORT_JOB], limit: 1000 })
        .map((job) => (job.payload as { importId: string }).importId),
    );
    for (const id of pending()) {
      if (!waiting.has(id)) void undo(id, true).catch((error) => ctx.log.error({ err: error }, "clearing an unfinished log import failed"));
    }
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  // The limits are the routes' own, given with each request (see core/multipart.ts).
  await registerMultipart(app);

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
  app.put<IdParams>("/api/radio/observations/:id", async (request) => ({
    observation: observations.update(request.params.id, request.body),
  }));
  app.delete<IdParams>("/api/radio/observations/:id", async (request) => {
    observations.remove(request.params.id);
    return { ok: true };
  });
  app.post("/api/radio/observations/import", async (request): Promise<ObservationImportResponse> => {
    const { fileName, bytes } = await receive(request);
    if (importsWaiting().length > 0) throw busy();
    if (bytes.length <= ADIF_DIRECT_BYTES) return { import: await observations.importAdif(fileName, bytes) };
    // Refused here, in the answer, when it is not a log at all; anything else wrong with it the job says.
    if (!(await looksLikeAdif(bytes, yieldToEventLoop))) throw notAdif();
    // Asked again: the look through the file let other requests in.
    if (importsWaiting().length > 0) throw busy();
    const importId = newId();
    const name = fileName.slice(0, 200) || "log.adi";
    files.set(importId, bytes);
    const job = ctx.jobs.enqueue(
      ADIF_IMPORT_JOB,
      { importId, fileName: name },
      { title: `Contact log from ${name}`, subject: `adif-import:${importId}`, maxAttempts: 1 },
    );
    return { job: toJobDto(job) };
  });
  app.delete<IdParams>("/api/radio/observations/imports/:id", async (request) => ({
    removed: observations.removeImport(request.params.id),
  }));
  app.post("/api/radio/observations/compare", async (request) => ({ comparison: await observations.compare(request.body) }));

  return observations;
}

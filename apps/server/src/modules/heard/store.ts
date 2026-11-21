/**
 * What was heard, in the database: the receivers, each station with what was last heard
 * of it, and each position heard (a trail, and the range view). Raw SQL on `ctx.sqlite`:
 * reports arrive many a second from a busy aircraft decoder, and are written in one
 * transaction a flush.
 */
import {
  HEARD_SOURCE_IDS,
  type HeardClearInput,
  type HeardDetails,
  type HeardReceiverInput,
  type HeardReport,
  type HeardSourceId,
  type HeardSpace,
  type HeardStation,
  type RangeTest,
  type RangeTestInput,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { newId } from "../../core/ids.ts";
import { hasDbstat } from "../database/inspect.ts";

export interface StoredReceiver extends HeardReceiverInput {
  id: string;
  createdAt: number;
}

interface StationRow {
  id: string;
  source: string;
  key: string;
  name: string;
  kind_words: string | null;
  symbol: string | null;
  receiver_id: string | null;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  course: number | null;
  speed: number | null;
  comment: string | null;
  direct: number;
  via: string | null;
  details: string;
  first_at: number;
  last_at: number;
  position_at: number | null;
  reports: number;
  pinned: number;
  pin_name: string | null;
}

interface ReportRow {
  station_id: string;
  receiver_id: string | null;
  at: number;
  lat: number;
  lon: number;
  altitude: number | null;
  direct: number;
  via: string | null;
  snr: number | null;
  rssi: number | null;
  hops: number | null;
}

const toStation = (row: StationRow): HeardStation => ({
  id: row.id,
  source: row.source as HeardSourceId,
  key: row.key,
  name: row.name,
  kindWords: row.kind_words,
  symbol: row.symbol,
  receiverId: row.receiver_id,
  lat: row.lat,
  lon: row.lon,
  altitude: row.altitude,
  course: row.course,
  speed: row.speed,
  comment: row.comment,
  direct: row.direct === 1,
  via: row.via,
  firstAt: row.first_at,
  lastAt: row.last_at,
  positionAt: row.position_at,
  reports: row.reports,
  pinned: row.pinned === 1,
  pinName: row.pin_name,
  details: JSON.parse(row.details) as HeardDetails,
});

const toReport = (row: ReportRow): HeardReport => ({
  at: row.at,
  lat: row.lat,
  lon: row.lon,
  altitude: row.altitude,
  receiverId: row.receiver_id,
  direct: row.direct === 1,
  via: row.via,
  snr: row.snr,
  rssi: row.rssi,
  hops: row.hops,
});

/** What a flush writes for one station: the fields that changed, and the positions to add. */
export interface StationWrite {
  source: HeardSourceId;
  key: string;
  at: number;
  receiverId: string | null;
  fields: Partial<Omit<HeardStation, "id" | "source" | "key" | "details" | "firstAt" | "lastAt" | "reports" | "pinned" | "pinName">>;
  details: HeardDetails;
  reports: Array<Omit<HeardReport, "receiverId">>;
}

export const MOST_STATIONS_LISTED = 5000;
export const MOST_TRAIL = 500;
export const MOST_REPORTS = 20_000;

export function createHeardStore(ctx: AppContext) {
  const sqlite = ctx.sqlite;
  const selectByKey = sqlite.prepare("SELECT * FROM heard_stations WHERE source = ? AND key = ?");
  const insertStation = sqlite.prepare(
    `INSERT INTO heard_stations (id, source, key, name, kind_words, symbol, receiver_id, lat, lon, altitude, course, speed, comment,
       direct, via, details, first_at, last_at, position_at, reports, pinned, pin_name)
     VALUES (@id, @source, @key, @name, @kind_words, @symbol, @receiver_id, @lat, @lon, @altitude, @course, @speed, @comment,
       @direct, @via, @details, @first_at, @last_at, @position_at, @reports, 0, NULL)`,
  );
  const updateStation = sqlite.prepare(
    `UPDATE heard_stations SET name = @name, kind_words = @kind_words, symbol = @symbol, receiver_id = @receiver_id, lat = @lat,
       lon = @lon, altitude = @altitude, course = @course, speed = @speed, comment = @comment, direct = @direct, via = @via,
       details = @details, last_at = @last_at, position_at = @position_at, reports = @reports WHERE id = @id`,
  );
  const insertReport = sqlite.prepare(
    `INSERT INTO heard_reports (station_id, receiver_id, at, lat, lon, altitude, direct, via, snr, rssi, hops)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const write = sqlite.transaction((writes: StationWrite[]) => {
    for (const entry of writes) {
      const row = selectByKey.get(entry.source, entry.key) as StationRow | undefined;
      const f = entry.fields;
      const pick = <K extends keyof StationWrite["fields"]>(key: K, old: StationWrite["fields"][K] | null) =>
        f[key] !== undefined ? f[key] : old;
      const details = { ...(row ? (JSON.parse(row.details) as HeardDetails) : {}) } as Record<string, unknown>;
      for (const [key, value] of Object.entries(entry.details)) {
        const before = details[key];
        details[key] =
          value && typeof value === "object" && before && typeof before === "object" && key !== "weather" ? { ...before, ...value } : value;
      }
      const next = {
        id: row?.id ?? newId(),
        source: entry.source,
        key: entry.key,
        name: pick("name", row?.name ?? null) ?? entry.key,
        kind_words: pick("kindWords", row?.kind_words ?? null),
        symbol: pick("symbol", row?.symbol ?? null),
        receiver_id: entry.receiverId ?? row?.receiver_id ?? null,
        lat: pick("lat", row?.lat ?? null),
        lon: pick("lon", row?.lon ?? null),
        altitude: pick("altitude", row?.altitude ?? null),
        course: pick("course", row?.course ?? null),
        speed: pick("speed", row?.speed ?? null),
        comment: pick("comment", row?.comment ?? null),
        direct: (pick("direct", row ? row.direct === 1 : true) ?? true) ? 1 : 0,
        via: pick("via", row?.via ?? null),
        details: JSON.stringify(details),
        first_at: row?.first_at ?? entry.at,
        last_at: Math.max(row?.last_at ?? 0, entry.at),
        position_at: f.positionAt !== undefined ? f.positionAt : (row?.position_at ?? null),
        reports: (row?.reports ?? 0) + entry.reports.length,
      };
      if (row) updateStation.run(next);
      else insertStation.run(next);
      for (const report of entry.reports)
        insertReport.run(
          next.id,
          entry.receiverId,
          report.at,
          report.lat,
          report.lon,
          report.altitude,
          report.direct ? 1 : 0,
          report.via,
          report.snr,
          report.rssi,
          report.hops,
        );
    }
  });

  return {
    write,

    receivers(): StoredReceiver[] {
      const rows = sqlite.prepare("SELECT * FROM heard_receivers ORDER BY created_at").all() as Array<{
        id: string;
        kind: string;
        name: string;
        host: string;
        port: number;
        transport: string;
        enabled: number;
        created_at: number;
      }>;
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind as StoredReceiver["kind"],
        name: row.name,
        host: row.host,
        port: row.port,
        transport: row.transport === "udp" ? "udp" : "tcp",
        enabled: row.enabled === 1,
        createdAt: row.created_at,
      }));
    },

    addReceiver(input: HeardReceiverInput): StoredReceiver {
      const now = Date.now();
      const id = newId();
      sqlite
        .prepare(
          "INSERT INTO heard_receivers (id, kind, name, host, port, transport, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, input.kind, input.name, input.host, input.port, input.transport, input.enabled ? 1 : 0, now, now);
      return { ...input, id, createdAt: now };
    },

    updateReceiver(id: string, input: HeardReceiverInput): boolean {
      return (
        sqlite
          .prepare(
            "UPDATE heard_receivers SET kind = ?, name = ?, host = ?, port = ?, transport = ?, enabled = ?, updated_at = ? WHERE id = ?",
          )
          .run(input.kind, input.name, input.host, input.port, input.transport, input.enabled ? 1 : 0, Date.now(), id).changes > 0
      );
    },

    removeReceiver(id: string): boolean {
      return sqlite.prepare("DELETE FROM heard_receivers WHERE id = ?").run(id).changes > 0;
    },

    /** The stations of one source (every source but the mesh radios, which have their own list, when none is given). */
    stations(source?: HeardSourceId): HeardStation[] {
      const rows = (
        source
          ? sqlite.prepare("SELECT * FROM heard_stations WHERE source = ? ORDER BY last_at DESC LIMIT ?").all(source, MOST_STATIONS_LISTED)
          : sqlite.prepare("SELECT * FROM heard_stations WHERE source != 'mesh' ORDER BY last_at DESC LIMIT ?").all(MOST_STATIONS_LISTED)
      ) as StationRow[];
      return rows.map(toStation);
    },

    station(id: string): HeardStation | null {
      const row = sqlite.prepare("SELECT * FROM heard_stations WHERE id = ?").get(id) as StationRow | undefined;
      return row ? toStation(row) : null;
    },

    stationByKey(source: HeardSourceId, key: string): HeardStation | null {
      const row = selectByKey.get(source, key) as StationRow | undefined;
      return row ? toStation(row) : null;
    },

    trail(id: string): HeardReport[] {
      const rows = sqlite
        .prepare("SELECT * FROM (SELECT * FROM heard_reports WHERE station_id = ? ORDER BY at DESC LIMIT ?) ORDER BY at")
        .all(id, MOST_TRAIL) as ReportRow[];
      return rows.map(toReport);
    },

    reports(query: { receiverId?: string; stationId?: string; from?: number; to?: number }) {
      const where: string[] = ["s.source IN ('aprs', 'mesh')"];
      const values: Array<string | number> = [];
      if (query.receiverId) {
        where.push("r.receiver_id = ?");
        values.push(query.receiverId);
      }
      if (query.stationId) {
        where.push("r.station_id = ?");
        values.push(query.stationId);
      }
      if (query.from !== undefined) {
        where.push("r.at >= ?");
        values.push(query.from);
      }
      if (query.to !== undefined) {
        where.push("r.at <= ?");
        values.push(query.to);
      }
      const rows = sqlite
        .prepare(
          `SELECT r.*, s.name AS name, s.pin_name AS pin_name, s.source AS source FROM heard_reports r JOIN heard_stations s ON s.id = r.station_id
           WHERE ${where.join(" AND ")} ORDER BY r.at DESC LIMIT ?`,
        )
        .all(...values, MOST_REPORTS + 1) as Array<ReportRow & { name: string; pin_name: string | null; source: string }>;
      const limited = rows.length > MOST_REPORTS;
      return {
        reports: rows
          .slice(0, MOST_REPORTS)
          .reverse()
          .map((row) => ({
            ...toReport(row),
            stationId: row.station_id,
            name: row.pin_name ?? row.name,
            source: row.source as HeardSourceId,
          })),
        limited,
      };
    },

    pin(id: string, pinned: boolean, name: string | null): HeardStation | null {
      sqlite.prepare("UPDATE heard_stations SET pinned = ?, pin_name = ? WHERE id = ?").run(pinned ? 1 : 0, pinned ? name : null, id);
      return this.station(id);
    },

    /** Clears what was heard: all of it, one source, what was last heard before a time, or both. */
    clear(input: HeardClearInput): { stations: number; reports: number } {
      return sqlite.transaction(() => {
        const sourceSql = input.source ? "source = ?" : "1 = 1";
        const sourceArgs = input.source ? [input.source] : [];
        if (input.before === undefined) {
          const reports = sqlite
            .prepare(`DELETE FROM heard_reports WHERE station_id IN (SELECT id FROM heard_stations WHERE ${sourceSql})`)
            .run(...sourceArgs).changes;
          const stations = sqlite.prepare(`DELETE FROM heard_stations WHERE ${sourceSql}`).run(...sourceArgs).changes;
          return { stations, reports };
        }
        // Older than a time: the positions heard before it, and the stations not heard since.
        const reports = sqlite
          .prepare(`DELETE FROM heard_reports WHERE at < ? AND station_id IN (SELECT id FROM heard_stations WHERE ${sourceSql})`)
          .run(input.before, ...sourceArgs).changes;
        const gone = sqlite
          .prepare(`SELECT id FROM heard_stations WHERE last_at < ? AND ${sourceSql}`)
          .all(input.before, ...sourceArgs) as Array<{ id: string }>;
        const removeReports = sqlite.prepare("DELETE FROM heard_reports WHERE station_id = ?");
        const removeStation = sqlite.prepare("DELETE FROM heard_stations WHERE id = ?");
        let extra = 0;
        for (const { id } of gone) {
          extra += removeReports.run(id).changes;
          removeStation.run(id);
        }
        sqlite
          .prepare(
            `UPDATE heard_stations SET reports = (SELECT count(*) FROM heard_reports WHERE station_id = heard_stations.id) WHERE ${sourceSql}`,
          )
          .run(...sourceArgs);
        return { stations: gone.length, reports: reports + extra };
      })();
    },

    removeStation(id: string): { stations: number; reports: number } | null {
      return sqlite.transaction(() => {
        const reports = sqlite.prepare("DELETE FROM heard_reports WHERE station_id = ?").run(id).changes;
        const stations = sqlite.prepare("DELETE FROM heard_stations WHERE id = ?").run(id).changes;
        return stations ? { stations, reports } : null;
      })();
    },

    /** Aircraft older than the hours kept, except any pinned. */
    pruneAircraft(before: number): number {
      return sqlite.transaction(() => {
        const reports = sqlite
          .prepare(
            "DELETE FROM heard_reports WHERE at < ? AND station_id IN (SELECT id FROM heard_stations WHERE source = 'adsb' AND pinned = 0)",
          )
          .run(before).changes;
        sqlite.prepare("DELETE FROM heard_stations WHERE source = 'adsb' AND pinned = 0 AND last_at < ?").run(before);
        return reports;
      })();
    },

    space(): HeardSpace {
      const bySource = Object.fromEntries(HEARD_SOURCE_IDS.map((id) => [id, { stations: 0, reports: 0 }])) as HeardSpace["bySource"];
      for (const row of sqlite
        .prepare("SELECT source, count(*) AS n, sum(reports) AS r FROM heard_stations GROUP BY source")
        .all() as Array<{
        source: HeardSourceId;
        n: number;
        r: number | null;
      }>) {
        if (bySource[row.source]) bySource[row.source] = { stations: row.n, reports: row.r ?? 0 };
      }
      let bytes: number | null = null;
      if (hasDbstat(sqlite)) {
        const row = sqlite
          .prepare(
            "SELECT sum(pgsize) AS bytes FROM dbstat WHERE name IN (SELECT name FROM sqlite_schema WHERE tbl_name IN ('heard_stations', 'heard_reports'))",
          )
          .get() as { bytes: number | null };
        bytes = row.bytes ?? 0;
      }
      const stations = Object.values(bySource).reduce((sum, entry) => sum + entry.stations, 0);
      const reports = Object.values(bySource).reduce((sum, entry) => sum + entry.reports, 0);
      return { stations, reports, bytes, bySource };
    },

    rangeTests(): RangeTest[] {
      const rows = sqlite.prepare("SELECT * FROM heard_range_tests ORDER BY created_at DESC").all() as Array<{
        id: string;
        name: string;
        receiver_id: string | null;
        station_id: string | null;
        from_at: number;
        to_at: number;
        created_at: number;
      }>;
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        receiverId: row.receiver_id,
        stationId: row.station_id,
        from: row.from_at,
        to: row.to_at,
        createdAt: row.created_at,
      }));
    },

    addRangeTest(input: RangeTestInput): RangeTest {
      const test = { ...input, id: newId(), createdAt: Date.now() };
      sqlite
        .prepare(
          "INSERT INTO heard_range_tests (id, name, receiver_id, station_id, from_at, to_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(test.id, test.name, test.receiverId, test.stationId, test.from, test.to, test.createdAt);
      return test;
    },

    removeRangeTest(id: string): boolean {
      return sqlite.prepare("DELETE FROM heard_range_tests WHERE id = ?").run(id).changes > 0;
    },

    count(): number {
      return (sqlite.prepare("SELECT count(*) AS n FROM heard_stations").get() as { n: number }).n;
    },

    eraseAll(): number {
      return sqlite.transaction(() => {
        const stations = sqlite.prepare("DELETE FROM heard_stations").run().changes;
        sqlite.prepare("DELETE FROM heard_reports").run();
        sqlite.prepare("DELETE FROM heard_range_tests").run();
        sqlite.prepare("DELETE FROM heard_receivers").run();
        return stations;
      })();
    },
  };
}

export type HeardStore = ReturnType<typeof createHeardStore>;

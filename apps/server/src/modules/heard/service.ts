/**
 * Heard on the radio: one service for every receiver. Each receiver is a decoder's port
 * (`link.ts`) and a reader for what it sends (KISS for APRS, SBS for aircraft, NMEA for
 * ships); what is read becomes a station, kept until a person clears it, and positions
 * along its trail.
 *
 * Writing: what arrives is gathered in memory and written once a flush (every two
 * seconds while something arrives, never otherwise), in one transaction, and the screens
 * are told then with one `heard.changed`. Aircraft send several messages a second, and a
 * ship every few seconds: a point of their trail is kept at most every 30 seconds; every
 * APRS and mesh position is kept.
 *
 * Outpost only listens. No receiver is ever written to.
 */
import type {
  AircraftDetails,
  HeardClearInput,
  HeardDetails,
  HeardReceiver,
  HeardReceiverInput,
  HeardReport,
  HeardSourceId,
  HeardStation,
  ReceiverStatus,
  ShipDetails,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AisReader, MAX_NMEA_LINE, shipTypeWords } from "./ais.ts";
import { decodeAprs, symbolWords } from "./aprs.ts";
import { addressText, decodeAx25, pathOf } from "./ax25.ts";
import { KissReader } from "./kiss.ts";
import { LineReader, openLink, type ReceiverLink } from "./link.ts";
import { MAX_SBS_LINE, parseSbs, type SbsUpdate } from "./sbs.ts";
import { createHeardStore, type StationWrite, type StoredReceiver } from "./store.ts";

const FLUSH_MS = 2_000;
/** A point of an aircraft's or a ship's trail at most this often. */
const TRAIL_EVERY_MS = 30_000;
/** Aircraft older than the hours kept are taken off at most this often. */
const PRUNE_EVERY_MS = 10 * 60_000;
const MOST_PENDING = 5_000;
/** Positions of one station held between flushes: far more than a radio sends, so a flood cannot fill memory. */
const MOST_PENDING_REPORTS = 100;

const OFF: ReceiverStatus = {
  state: "off",
  since: null,
  lastPacketAt: null,
  packets: 0,
  positions: 0,
  malformed: 0,
  refused: 0,
  lastError: null,
  retryAt: null,
};

export interface MeshPositionHeard {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altitude: number | null;
  at: number;
  hops: number | null;
  snr: number | null;
  rssi: number | null;
}

export function createHeardService(ctx: AppContext) {
  const store = createHeardStore(ctx);
  const links = new Map<string, ReceiverLink>();
  const pending = new Map<string, StationWrite>();
  const lastTrailAt = new Map<string, number>();
  const sourcesChanged = new Set<HeardSourceId>();
  let statusChanged = false;
  let timer: NodeJS.Timeout | undefined;
  let lastPrune = 0;
  let closed = false;

  function schedule(): void {
    if (timer || closed) return;
    timer = setTimeout(flush, FLUSH_MS);
    timer.unref();
  }

  /** Run from a timer: anything thrown out of it would be uncaught and stop the server. */
  function flush(): void {
    timer = undefined;
    try {
      flushPending();
    } catch (error) {
      ctx.log.warn({ err: error }, "Could not finish writing what the receivers heard");
    }
  }

  function flushPending(): void {
    const writes = [...pending.values()];
    pending.clear();
    if (writes.length > 0) {
      try {
        store.write(writes);
      } catch (error) {
        ctx.log.warn({ err: error }, "Could not keep what the receivers heard");
      }
    }
    const hours = ctx.services.settings.get("heard.aircraftHours");
    if (hours > 0 && Date.now() - lastPrune > PRUNE_EVERY_MS && writes.some((entry) => entry.source === "adsb")) {
      lastPrune = Date.now();
      store.pruneAircraft(Date.now() - hours * 3_600_000);
    }
    if (sourcesChanged.size > 0 || statusChanged) {
      const sources = [...sourcesChanged];
      sourcesChanged.clear();
      statusChanged = false;
      ctx.events.publish({ type: "heard.changed", data: { sources } });
    }
  }

  /** Gathers what was heard of one station until the next flush. */
  function heard(entry: StationWrite, trail: "every" | "sometimes"): void {
    const id = `${entry.source}:${entry.key}`;
    const report = entry.reports[0];
    if (report && trail === "sometimes") {
      const last = lastTrailAt.get(id) ?? 0;
      if (report.at - last < TRAIL_EVERY_MS) entry.reports = [];
      else lastTrailAt.set(id, report.at);
      if (lastTrailAt.size > 20_000) lastTrailAt.clear();
    }
    const before = pending.get(id);
    if (before) {
      before.at = Math.max(before.at, entry.at);
      before.receiverId = entry.receiverId ?? before.receiverId;
      before.fields = { ...before.fields, ...entry.fields };
      for (const [key, value] of Object.entries(entry.details)) {
        const old = (before.details as Record<string, unknown>)[key];
        (before.details as Record<string, unknown>)[key] =
          value && typeof value === "object" && old && typeof old === "object" && key !== "weather" ? { ...old, ...value } : value;
      }
      for (const report of entry.reports) if (before.reports.length < MOST_PENDING_REPORTS) before.reports.push(report);
    } else if (pending.size < MOST_PENDING) {
      entry.reports = entry.reports.slice(0, MOST_PENDING_REPORTS);
      pending.set(id, entry);
    }
    sourcesChanged.add(entry.source);
    schedule();
  }

  /** Values that are known, leaving out the ones a message did not carry. */
  const known = <T extends object>(value: T): Partial<T> =>
    Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)) as Partial<T>;

  // ── APRS, from KISS ──

  function aprsReader(receiver: StoredReceiver, link: () => ReceiverLink | undefined) {
    const reader = new KissReader((frame) => {
      const counter = link();
      counter?.count("packets");
      const ax25 = decodeAx25(frame.data);
      if ("error" in ax25) {
        counter?.count("malformed");
        return;
      }
      const now = Date.now();
      const result = decodeAprs({ source: addressText(ax25.source), destination: addressText(ax25.destination), info: ax25.info }, now);
      if ("error" in result) {
        counter?.count("malformed");
        return;
      }
      if (result.kind === "other") return;
      const path = pathOf(ax25.digipeaters);
      const at = Math.min(result.timestamp ?? now, now);
      const object = result.kind === "object" || result.kind === "item";
      const located = result.lat !== null && result.lon !== null;
      if (located) counter?.count("positions");
      const details: HeardDetails = {};
      if (result.weather) details.weather = { ...result.weather, at };
      if (object) {
        details.sentBy = result.sentBy;
        details.killed = result.killed;
      }
      heard(
        {
          source: "aprs",
          // An object or item is kept apart from a station of the same name.
          key: object ? `;${result.name}` : result.name,
          at: now,
          receiverId: receiver.id,
          fields: {
            name: result.name,
            direct: path.direct,
            via: path.via,
            ...(result.comment !== null || !result.weather ? { comment: result.comment } : {}),
            ...(located
              ? {
                  lat: result.lat,
                  lon: result.lon,
                  symbol: result.symbol,
                  kindWords: result.kind === "weather" ? "Weather station" : symbolWords(result.symbol),
                  course: result.course,
                  speed: result.speed,
                  altitude: result.altitude,
                  positionAt: at,
                }
              : result.weather
                ? { kindWords: "Weather station" }
                : {}),
          },
          details,
          reports: located
            ? [
                {
                  at,
                  lat: result.lat!,
                  lon: result.lon!,
                  altitude: result.altitude,
                  direct: path.direct,
                  via: path.via,
                  snr: null,
                  rssi: null,
                  hops: null,
                },
              ]
            : [],
        },
        "every",
      );
    });
    return { push: (chunk: Buffer) => reader.push(chunk), reset: () => undefined };
  }

  // ── Aircraft, from SBS ──

  function sbsReader(receiver: StoredReceiver, link: () => ReceiverLink | undefined) {
    const lines = new LineReader(MAX_SBS_LINE, (line) => {
      const update = parseSbs(line);
      if (update === null) return;
      const counter = link();
      counter?.count("packets");
      if ("error" in update) {
        counter?.count("malformed");
        return;
      }
      if (update.lat !== undefined) counter?.count("positions");
      aircraft(receiver, update);
    });
    return { push: (chunk: Buffer) => lines.push(chunk), reset: () => lines.reset() };
  }

  function aircraft(receiver: StoredReceiver, update: SbsUpdate): void {
    const now = Date.now();
    const located = update.lat !== undefined && update.lon !== undefined;
    heard(
      {
        source: "adsb",
        key: update.icao,
        at: now,
        receiverId: receiver.id,
        fields: known({
          name: update.callsign,
          kindWords: "Aircraft",
          altitude: update.altitude,
          speed: update.speed,
          course: update.course,
          lat: update.lat,
          lon: update.lon,
          positionAt: located ? now : undefined,
          direct: true,
        }),
        details: {
          aircraft: {
            icao: update.icao,
            ...known({ squawk: update.squawk, onGround: update.onGround, verticalRate: update.verticalRate }),
          } as AircraftDetails,
        },
        reports: located
          ? [
              {
                at: now,
                lat: update.lat!,
                lon: update.lon!,
                altitude: update.altitude ?? null,
                direct: true,
                via: null,
                snr: null,
                rssi: null,
                hops: null,
              },
            ]
          : [],
      },
      "sometimes",
    );
  }

  // ── Ships, from NMEA ──

  function aisReader(receiver: StoredReceiver, link: () => ReceiverLink | undefined) {
    const reader = new AisReader();
    let malformed = 0;
    const lines = new LineReader(MAX_NMEA_LINE, (line) => {
      const counter = link();
      if (/^\s*[!\\]/.test(line)) counter?.count("packets");
      const report = reader.read(line);
      if (reader.malformed !== malformed) {
        counter?.count("malformed", reader.malformed - malformed);
        malformed = reader.malformed;
      }
      if (!report) return;
      const now = Date.now();
      const located = report.lat !== null && report.lon !== null;
      if (located) counter?.count("positions");
      const kindWords =
        report.kind === "aid"
          ? "Aid to navigation"
          : report.kind === "base"
            ? "Shore station"
            : (shipTypeWords(report.shipType) ?? undefined);
      const ship: Partial<ShipDetails> = known({
        mmsi: report.mmsi,
        kind: report.kind,
        aisClass: report.aisClass,
        callsign: report.callsign,
        imo: report.imo,
        shipType: report.shipType,
        typeWords: shipTypeWords(report.shipType),
        lengthM: report.lengthM,
        beamM: report.beamM,
        draughtM: report.draughtM,
        destination: report.destination,
        status: report.status,
        heading: report.heading,
      });
      heard(
        {
          source: "ais",
          key: report.mmsi,
          at: now,
          receiverId: receiver.id,
          fields: known({
            name: report.name ?? undefined,
            kindWords,
            speed: located ? report.speed : undefined,
            course: located ? report.course : undefined,
            lat: report.lat,
            lon: report.lon,
            positionAt: located ? now : undefined,
            direct: true,
          }),
          details: { ship: ship as ShipDetails },
          reports: located
            ? [{ at: now, lat: report.lat!, lon: report.lon!, altitude: null, direct: true, via: null, snr: null, rssi: null, hops: null }]
            : [],
        },
        "sometimes",
      );
    });
    return { push: (chunk: Buffer) => lines.push(chunk), reset: () => lines.reset() };
  }

  // ── Receivers ──

  function open(receiver: StoredReceiver): void {
    links.get(receiver.id)?.stop();
    links.delete(receiver.id);
    if (!receiver.enabled || closed) return;
    let link: ReceiverLink | undefined;
    const current = () => link;
    const reader =
      receiver.kind === "aprs"
        ? aprsReader(receiver, current)
        : receiver.kind === "adsb"
          ? sbsReader(receiver, current)
          : aisReader(receiver, current);
    const udp = receiver.transport === "udp";
    link = openLink(
      { host: receiver.host, port: receiver.port, transport: receiver.transport },
      {
        // A datagram is whole lines; one that does not end its last line is ended here.
        onData: (chunk) => reader.push(udp ? Buffer.concat([chunk, Buffer.from("\n")]) : chunk),
        onOpen: () => reader.reset(),
        changed: () => {
          statusChanged = true;
          schedule();
        },
      },
    );
    links.set(receiver.id, link);
  }

  const withStatus = (receiver: StoredReceiver): HeardReceiver => ({
    ...receiver,
    status: links.get(receiver.id)?.status() ?? OFF,
  });

  function changed(): void {
    statusChanged = true;
    schedule();
  }

  return {
    start(): void {
      for (const receiver of store.receivers()) open(receiver);
    },

    receivers: (): HeardReceiver[] => store.receivers().map(withStatus),

    addReceiver(input: HeardReceiverInput): HeardReceiver {
      const receiver = store.addReceiver(input);
      open(receiver);
      changed();
      return withStatus(receiver);
    },

    updateReceiver(id: string, input: HeardReceiverInput): HeardReceiver | null {
      if (!store.updateReceiver(id, input)) return null;
      const receiver = store.receivers().find((entry) => entry.id === id)!;
      open(receiver);
      changed();
      return withStatus(receiver);
    },

    removeReceiver(id: string): boolean {
      links.get(id)?.stop();
      links.delete(id);
      const removed = store.removeReceiver(id);
      if (removed) changed();
      return removed;
    },

    stations: (source?: HeardSourceId): HeardStation[] => store.stations(source),

    station(id: string): { station: HeardStation; trail: HeardReport[] } | null {
      const station = store.station(id);
      return station ? { station, trail: store.trail(id) } : null;
    },

    reports: store.reports,
    space: store.space,
    rangeTests: store.rangeTests,
    addRangeTest: store.addRangeTest,
    removeRangeTest: store.removeRangeTest,

    pin(id: string, pinned: boolean, name: string | null): HeardStation | null {
      const station = store.pin(id, pinned, name);
      if (station) {
        sourcesChanged.add(station.source);
        schedule();
      }
      return station;
    },

    clear(input: HeardClearInput) {
      // What is waiting to be written goes too, or it would come back at the next flush.
      for (const [key, entry] of pending) if (!input.source || entry.source === input.source) pending.delete(key);
      const result = store.clear(input);
      lastTrailAt.clear();
      for (const source of input.source ? [input.source] : (["aprs", "adsb", "ais", "mesh"] as const)) sourcesChanged.add(source);
      schedule();
      return result;
    },

    removeStation(id: string) {
      const station = store.station(id);
      if (!station) return null;
      pending.delete(`${station.source}:${station.key}`);
      const result = store.removeStation(id);
      sourcesChanged.add(station.source);
      schedule();
      return result;
    },

    /** A mesh radio's position, from the mesh link, kept for the range view; only for radios switched on for the map. */
    recordMesh(position: MeshPositionHeard): void {
      heard(
        {
          source: "mesh",
          key: position.id,
          at: Date.now(),
          receiverId: "mesh",
          fields: {
            name: position.name,
            lat: position.lat,
            lon: position.lon,
            altitude: position.altitude,
            positionAt: position.at,
            direct: position.hops === 0 || position.hops === null,
            via: null,
          },
          details: { mesh: { hops: position.hops, snr: position.snr, rssi: position.rssi } },
          reports: [
            {
              at: position.at,
              lat: position.lat,
              lon: position.lon,
              altitude: position.altitude,
              direct: position.hops === 0,
              via: null,
              snr: position.snr,
              rssi: position.rssi,
              hops: position.hops,
            },
          ],
        },
        "every",
      );
    },

    /** Writes what is waiting now (tests, and closing). */
    flushNow(): void {
      clearTimeout(timer);
      flush();
    },

    kept: {
      count: () => store.count(),
      eraseAll(): number {
        for (const link of links.values()) link.stop();
        links.clear();
        pending.clear();
        lastTrailAt.clear();
        const stations = store.eraseAll();
        changed();
        return stations;
      },
    },

    stop(): void {
      closed = true;
      for (const link of links.values()) link.stop();
      links.clear();
      clearTimeout(timer);
      timer = undefined;
      const writes = [...pending.values()];
      pending.clear();
      if (writes.length > 0) {
        try {
          store.write(writes);
        } catch {
          // The database may already be closed.
        }
      }
    },
  };
}

export type HeardService = ReturnType<typeof createHeardService>;

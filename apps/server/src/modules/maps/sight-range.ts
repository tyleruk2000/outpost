/**
 * The estimated range of an aerial (a viewshed) for the repeaters on the map, any point
 * on the map and the relay planner. The work is the shared package's (`viewshed.ts`), so
 * that a phone out of reach works it out the same way from the terrain it kept; this file
 * gives it the installed terrain and keeps answers. Nothing is ever downloaded: where no
 * terrain is installed the answer says so and gives the smooth-Earth horizon.
 *
 * Reading the ground is nearly all of the work (about two seconds on a Raspberry Pi, most
 * of it decoding terrain tiles); the sums over it for a pair of heights take a few tens of
 * milliseconds. So the ground read for a place is kept, for the place and the terrain
 * installed, and another pair of heights there (a person trying 1.5 m, then 5 m, then 10
 * m) costs only the sums. Answers are kept too, so asking again (another device, the same
 * repeater opened twice) costs nothing.
 *
 * Reading the ground is shared by everyone asking about the same place at once, and
 * stopped once nobody is waiting for it any more: the person changed the height again,
 * or closed the range.
 */

import zlib from "node:zlib";
import {
  RANGE_MAX_HEIGHT_METERS,
  type RangeBandRead,
  type RangeGround,
  type RoutePoint,
  rangeFromGround,
  rangeWorkDone,
  readRangeGround,
  type SightRange,
  type SightRangeEvent,
  type Viewshed,
} from "@outpost/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { chooseEncoding } from "../../core/compress.ts";
import { AppError } from "../../core/errors.ts";
import type { ElevationSampler } from "./elevation.ts";
import { position } from "./terrain-profile.ts";
import type { TileServer } from "./tile-server.ts";

export { positionsAlong, type Viewshed, viewshedOf } from "@outpost/shared";

/** Answers kept, most recently asked last. Each is about 190 kB. */
const KEPT = 32;
/** Viewsheds kept with their heights, for the relay planner: each holds the ground's heights (shared with `GROUNDS`) and its bits. */
const KEPT_GRIDS = 4;
/** The ground read for a place, kept for other heights there: each is about 3 MB. */
const KEPT_GROUNDS = 4;
/** Ground read at least this far out (25 km, then 50 km) is sent as a part of the answer while the rest is read. */
const PART_FROM_BAND = 2;

const height = (name: string) =>
  z.coerce
    .number({ error: `Give \`${name}\` as a height in metres.` })
    .min(0, `\`${name}\` is a height above the ground, from 0 to ${RANGE_MAX_HEIGHT_METERS} m.`)
    .max(RANGE_MAX_HEIGHT_METERS, `\`${name}\` is a height above the ground, from 0 to ${RANGE_MAX_HEIGHT_METERS} m.`)
    .transform((value) => Math.round(value * 10) / 10);

export const sightRangeQuery = z.object({ at: position("at"), aerial: height("aerial"), station: height("station") });

/** What is said while a range is worked out: the share done, and the range out to as far as the ground is read. */
export interface SightRangePart {
  done: number;
  range?: SightRange;
}

export interface SightRangeOptions {
  /** Aborted when the answer is no longer wanted: the work stops, unless someone else is waiting for the same ground. */
  signal?: AbortSignal;
  /** Told as each band of the ground is read. Not called for an answer already known. */
  onPart?: (part: SightRangePart) => void;
}

export interface SightRanger {
  (at: RoutePoint, aerialMeters: number, stationMeters: number, options?: SightRangeOptions): Promise<SightRange>;
  /** The same, with the heights and bits it was worked out from. */
  viewshed(at: RoutePoint, aerialMeters: number, stationMeters: number, options?: SightRangeOptions): Promise<Viewshed>;
  /** Whether the answer for these is already known, so that it is sent at once. */
  known(at: RoutePoint, aerialMeters: number, stationMeters: number): boolean;
  /** How long the last ground read from scratch took, in milliseconds, or null before the first. */
  lastReadMs(): number | null;
}

/** The ground being read for one place, shared by everyone waiting for it. */
interface Reading {
  promise: Promise<RangeGround | null>;
  controller: AbortController;
  waiting: number;
  /** The bands read so far, for someone who starts waiting part of the way through. */
  bands: RangeBandRead[];
  listeners: Set<(read: RangeBandRead) => void>;
}

/** Keeps `value` under `key`, most recently used last, and forgets the oldest beyond `most`. */
function keep<T>(list: Map<string, T>, most: number, key: string, value: T) {
  list.delete(key);
  list.set(key, value);
  while (list.size > most) list.delete(list.keys().next().value!);
}

function recall<T>(list: Map<string, T>, key: string): T | undefined {
  if (!list.has(key)) return undefined;
  const value = list.get(key)!;
  keep(list, Number.POSITIVE_INFINITY, key, value);
  return value;
}

export function createSightRanger(sampler: ElevationSampler, tiles: Pick<TileServer, "sources" | "regions">): SightRanger {
  const kept = new Map<string, SightRange>();
  const grids = new Map<string, Viewshed>();
  const grounds = new Map<string, RangeGround | null>();
  const reading = new Map<string, Reading>();
  let lastReadMs: number | null = null;

  const placeKey = (at: RoutePoint) => {
    // The terrain installed is part of the question: a region added or removed answers differently.
    const edition = tiles
      .regions()
      .filter((region) => region.tileType === "terrain")
      .map((region) => `${region.id}:${region.installedAt}:${region.status}:${region.available}`)
      .join(",");
    return `${at.lat.toFixed(5)},${at.lon.toFixed(5)}|${edition}`;
  };
  const answerKey = (place: string, aerialMeters: number, stationMeters: number) => `${place}|${aerialMeters}|${stationMeters}`;

  function startReading(key: string, at: RoutePoint): Reading {
    const controller = new AbortController();
    const started = performance.now();
    const entry: Reading = {
      controller,
      waiting: 0,
      bands: [],
      listeners: new Set(),
      promise: readRangeGround(sampler, tiles.sources().sources.terrain ?? null, at, {
        signal: controller.signal,
        onBand: (read) => {
          entry.bands.push(read);
          for (const listener of entry.listeners) listener(read);
        },
      }),
    };
    entry.promise.then(
      (ground) => {
        if (reading.get(key) === entry) reading.delete(key);
        keep(grounds, KEPT_GROUNDS, key, ground);
        if (ground) lastReadMs = Math.round(performance.now() - started);
      },
      () => {
        // A failure or a stop is not kept: the next ask reads the ground again.
        if (reading.get(key) === entry) reading.delete(key);
      },
    );
    reading.set(key, entry);
    return entry;
  }

  /** The ground for a place: kept, being read (waited for alongside the others), or read now. */
  async function groundOf(key: string, at: RoutePoint, options: SightRangeOptions & { onBand?: (read: RangeBandRead) => void }) {
    const { signal, onBand } = options;
    signal?.throwIfAborted();
    if (grounds.has(key)) return recall(grounds, key)!;
    const entry = reading.get(key) ?? startReading(key, at);
    entry.waiting += 1;
    for (const read of entry.bands) onBand?.(read);
    if (onBand) entry.listeners.add(onBand);
    let leave = () => {};
    const gone = new Promise<never>((_, reject) => {
      const stop = () => reject(signal!.reason);
      signal?.addEventListener("abort", stop, { once: true });
      leave = () => signal?.removeEventListener("abort", stop);
    });
    try {
      return await (signal ? Promise.race([entry.promise, gone]) : entry.promise);
    } finally {
      leave();
      if (onBand) entry.listeners.delete(onBand);
      entry.waiting -= 1;
      // Nobody is waiting for this ground any more: reading the rest of it would be work for nobody.
      if (entry.waiting === 0 && reading.get(key) === entry) {
        reading.delete(key);
        entry.controller.abort();
      }
    }
  }

  const viewshed = async (at: RoutePoint, aerialMeters: number, stationMeters: number, options: SightRangeOptions = {}) => {
    const place = placeKey(at);
    const key = answerKey(place, aerialMeters, stationMeters);
    const known = recall(grids, key);
    if (known) return known;
    const ground = await groundOf(place, at, {
      ...options,
      onBand: options.onPart
        ? (read) =>
            options.onPart!({
              done: rangeWorkDone(read.done),
              ...(read.done >= PART_FROM_BAND ? { range: rangeFromGround(read.ground, at, aerialMeters, stationMeters).range } : {}),
            })
        : undefined,
    });
    const shed = rangeFromGround(ground, at, aerialMeters, stationMeters);
    keep(grids, KEPT_GRIDS, key, shed);
    keep(kept, KEPT, key, shed.range);
    return shed;
  };

  const ranger = (async (at: RoutePoint, aerialMeters: number, stationMeters: number, options: SightRangeOptions = {}) => {
    const known = recall(kept, answerKey(placeKey(at), aerialMeters, stationMeters));
    if (known) return known;
    return (await viewshed(at, aerialMeters, stationMeters, options)).range;
  }) as SightRanger;
  ranger.viewshed = viewshed;
  ranger.known = (at, aerialMeters, stationMeters) => {
    const place = placeKey(at);
    return kept.has(answerKey(place, aerialMeters, stationMeters)) || grounds.has(place);
  };
  ranger.lastReadMs = () => lastReadMs;
  return ranger;
}

/** True when the request asks for the answer a line at a time. */
export function wantsLines(request: FastifyRequest): boolean {
  return /application\/x-ndjson/i.test(request.headers.accept ?? "");
}

/** Fires when the browser that asked has gone away (or asked something else instead), so the work stops too. */
export function goneSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}

/**
 * The range a line of JSON at a time (`SightRangeEvent`): how long the last one took, the share done as each band of
 * the ground is read with the range out to there, then the whole answer. Compressed as the plain answer is (each line
 * flushed as it is written, so it is not held back), since a range is about 190 kB of JSON and a tenth of that packed.
 */
export async function sendRangeLines(
  request: FastifyRequest,
  reply: FastifyReply,
  ranger: SightRanger,
  query: z.infer<typeof sightRangeQuery>,
): Promise<FastifyReply> {
  const signal = goneSignal(reply);
  const raw = reply.raw;
  const encoding = chooseEncoding(request.headers["accept-encoding"]);
  reply.hijack();
  raw.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    // Tells a reverse proxy in front of Outpost not to hold the lines back until the answer is whole.
    "X-Accel-Buffering": "no",
    Vary: "accept, accept-encoding",
    ...(encoding ? { "Content-Encoding": encoding } : {}),
  });
  const packer =
    encoding === "br"
      ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
      : encoding === "gzip"
        ? zlib.createGzip({ level: 6 })
        : null;
  packer?.pipe(raw);
  packer?.on("error", () => raw.destroy());
  const out = packer ?? raw;
  const send = (event: SightRangeEvent) => {
    if (raw.destroyed || raw.writableEnded) return;
    out.write(`${JSON.stringify(event)}\n`);
    packer?.flush();
  };
  const known = ranger.known(query.at, query.aerial, query.station);
  send({ type: "start", done: 0, expectMs: known ? null : ranger.lastReadMs() });
  try {
    const range = await ranger(query.at, query.aerial, query.station, {
      signal,
      onPart: (part) => send(part.range ? { type: "part", done: part.done, range: part.range } : { type: "progress", done: part.done }),
    });
    send({ type: "end", done: 1, range });
  } catch (error) {
    if (!signal.aborted) {
      request.log.error({ err: error }, "sight range failed");
      send({
        type: "error",
        error:
          error instanceof AppError
            ? { code: error.code, message: error.message }
            : { code: "internal", message: "The range could not be worked out just now." },
      });
    }
  }
  out.end();
  return reply;
}

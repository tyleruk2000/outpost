/**
 * Asking an Overpass API server a question, and reading its answer as the untrusted
 * thing it is.
 *
 * One question at a time, each the direct result of a person pressing a button. The
 * request goes through the guarded HTTP client to the host of a declared route source
 * and nowhere else (a redirect is refused, not followed). The answer is capped in
 * size before it is read, and every number and word in it is checked before it is
 * used: an id must be a positive whole number, a position must be on Earth, a name is
 * cut to length and stripped of control characters.
 */
import type { Bbox } from "@outpost/shared";
import { AppError, classifyNetworkError } from "../../../core/errors.ts";
import { BlockedAddressError, type HttpClient } from "../../../core/http.ts";
import type { Point } from "./assemble.ts";
import type { RouteSource } from "./sources.ts";

/** How long the source is given to work on a question, and how long Outpost waits for the whole answer. */
export const OVERPASS_TIMEOUT_SECONDS = 25;
export const ANSWER_TIMEOUT_MS = 45_000;
/** After a source says it is busy, it is not asked again for this long. Its operators ask for the pause. */
export const BUSY_PAUSE_MS = 30_000;

/** The route kinds looked for, as OpenStreetMap tags them. */
export const ROUTE_VALUES = ["hiking", "foot", "walking", "running", "bicycle", "mtb", "horse"] as const;
/** Ways that can be a named path when nobody has made a route of them. */
export const PATH_VALUES = ["path", "footway", "bridleway", "cycleway", "track", "steps"] as const;
/** The tags a name may be in. */
const NAME_KEYS = "^(name|name:[a-z]{2,3}|alt_name|official_name)$";

/** Tag keys that are read. Everything else in an answer is passed over. */
const KEPT_TAGS = new Set(["type", "route", "highway", "name", "alt_name", "official_name", "ref", "network", "from", "to", "m"]);
const MAX_TAG_LENGTH = 200;

/**
 * Text fit to show a person: no control characters, no characters that change the
 * direction of the text around them, runs of white space made one space, cut to length.
 */
export function cleanText(value: unknown, max = MAX_TAG_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return cleaned || null;
}

/**
 * A person's search words as a pattern for the source. Letters, digits, spaces,
 * apostrophes and hyphens are sent as they are; every other character becomes "any one
 * character", so nothing typed can end the quoted string or change the question.
 */
export function namePattern(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N} '-]/gu, ".")
    .replace(/\s+/g, " ")
    .trim();
}

const coordinate = (value: number) => (Math.round(value * 1e5) / 1e5).toFixed(5);
/** A box as Overpass wants it: south, west, north, east. */
const boxOf = ([west, south, east, north]: Bbox) => `(${coordinate(south)},${coordinate(west)},${coordinate(north)},${coordinate(east)})`;
const header = (maxMegabytes: number) => `[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}][maxsize:${maxMegabytes * 1024 * 1024}];`;
const routeFilter = `["type"="route"]["route"~"^(${ROUTE_VALUES.join("|")})$"]`;

export interface SearchQueryOptions {
  pattern?: string;
  bbox?: Bbox;
  /** How many routes and how many ways may come back; one more than is shown, to tell "there are more". */
  maxRoutes: number;
  maxWays: number;
}

/** Routes by name, by map view or both, with their lengths; and named paths, inside a view, with a name. */
export function searchQuery(options: SearchQueryOptions): string {
  const name = options.pattern ? `[~"${NAME_KEYS}"~"${options.pattern}",i]` : "";
  const box = options.bbox ? boxOf(options.bbox) : "";
  const lines = [
    header(64),
    `relation${routeFilter}${name}${box}->.routes;`,
    `.routes out tags bb ${options.maxRoutes};`,
    // The length of each, measured by the source, so the list can say how long a route is without fetching it.
    ".routes convert length ::id=id(),m=length();",
    `out ${options.maxRoutes};`,
  ];
  if (options.pattern && options.bbox) {
    lines.push(`way["highway"~"^(${PATH_VALUES.join("|")})$"]["name"~"${options.pattern}",i]${box};`, `out tags geom ${options.maxWays};`);
  }
  return lines.join("\n");
}

/** One route with the points of its ways, and the names of the sections it is made of, if it is kept as sections. */
export function relationQuery(id: number, maxSections: number): string {
  return [header(128), `relation(${id})["type"~"^(route|superroute)$"];`, "out geom;", "rel(r);", `out tags bb ${maxSections};`].join("\n");
}

export function waysQuery(ids: number[]): string {
  return [header(64), `way(id:${ids.join(",")})["highway"];`, "out tags geom;"].join("\n");
}

// ── Reading an answer ───────────────────────────────────────────────────────

export interface OsmWay {
  id: number;
  tags: Record<string, string>;
  bounds: Bbox | null;
  /** Runs of usable points. A way with an unusable point in the middle becomes two runs; nothing is drawn across. */
  runs: Point[][];
  /** Points that could not be used. */
  dropped: number;
}

export interface OsmMember {
  type: "way" | "node" | "relation";
  ref: number;
  role: string;
  runs: Point[][];
  dropped: number;
}

export interface OsmRelation {
  id: number;
  tags: Record<string, string>;
  bounds: Bbox | null;
  members: OsmMember[];
}

export interface OverpassAnswer {
  relations: OsmRelation[];
  ways: OsmWay[];
  /** Lengths in metres by relation id, from the `convert length` statement. */
  lengths: Map<number, number>;
  dataAsOf: string | null;
}

export interface AnswerLimits {
  maxRelations: number;
  maxWays: number;
  /** Members of one relation. */
  maxMembers: number;
  /** Points in the whole answer. */
  maxPoints: number;
}

/** Thrown while reading an answer that holds more than the limits allow. The caller words the message. */
export class AnswerTooLarge extends Error {
  readonly what: keyof AnswerLimits;
  constructor(what: keyof AnswerLimits) {
    super(`The answer holds more than ${what} allows.`);
    this.what = what;
  }
}

const isId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readTags(value: unknown): Record<string, string> {
  const tags: Record<string, string> = {};
  if (!isRecord(value)) return tags;
  let read = 0;
  for (const key in value) {
    // A relation can carry hundreds of tags; only names and a handful of others are looked at.
    read += 1;
    if (read > 2000) break;
    if (!KEPT_TAGS.has(key) && !/^name:[a-z]{2,3}$/.test(key)) continue;
    const text = cleanText(value[key]);
    if (text) tags[key] = text;
  }
  return tags;
}

function readBounds(value: unknown): Bbox | null {
  if (!isRecord(value)) return null;
  const { minlon: west, minlat: south, maxlon: east, maxlat: north } = value;
  const box = [west, south, east, north];
  if (!box.every((edge): edge is number => typeof edge === "number" && Number.isFinite(edge))) return null;
  const [w, s, e, n] = box as [number, number, number, number];
  if (w < -180 || e > 180 || s < -90 || n > 90 || w > e || s > n) return null;
  return [w, s, e, n];
}

function readPoint(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const { lat, lon } = value;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

function readGeometry(value: unknown, budget: { points: number }, limits: AnswerLimits): { runs: Point[][]; dropped: number } {
  const runs: Point[][] = [];
  let dropped = 0;
  if (!Array.isArray(value)) return { runs, dropped };
  let run: Point[] = [];
  const close = () => {
    if (run.length >= 2) runs.push(run);
    else dropped += run.length;
    run = [];
  };
  for (const raw of value) {
    const point = readPoint(raw);
    if (!point) {
      // Not a place on Earth: the way stops here and starts again after it.
      dropped += 1;
      close();
      continue;
    }
    budget.points += 1;
    if (budget.points > limits.maxPoints) throw new AnswerTooLarge("maxPoints");
    const previous = run.at(-1);
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    run.push(point);
  }
  close();
  return { runs, dropped };
}

/** Reads the parsed JSON of an answer. Anything that is not what was asked for is passed over. */
export function readAnswer(body: unknown, limits: AnswerLimits): OverpassAnswer {
  const answer: OverpassAnswer = { relations: [], ways: [], lengths: new Map(), dataAsOf: null };
  if (!isRecord(body) || !Array.isArray(body.elements)) {
    throw new AppError("upstream", "The route source answered with something that is not route data. Try again in a little while.");
  }
  const stamp = isRecord(body.osm3s) ? body.osm3s.timestamp_osm_base : undefined;
  if (typeof stamp === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(stamp) && !Number.isNaN(Date.parse(stamp))) {
    answer.dataAsOf = stamp;
  }
  const budget = { points: 0 };
  for (const element of body.elements) {
    if (!isRecord(element) || !isId(element.id)) continue;
    if (element.type === "length") {
      const metres = isRecord(element.tags) ? Number(element.tags.m) : Number.NaN;
      if (Number.isFinite(metres) && metres >= 0 && metres < 1e8) answer.lengths.set(element.id, metres);
    } else if (element.type === "relation") {
      if (answer.relations.length >= limits.maxRelations) throw new AnswerTooLarge("maxRelations");
      const members: OsmMember[] = [];
      for (const raw of Array.isArray(element.members) ? element.members : []) {
        if (!isRecord(raw) || !isId(raw.ref)) continue;
        if (raw.type !== "way" && raw.type !== "node" && raw.type !== "relation") continue;
        if (members.length >= limits.maxMembers) throw new AnswerTooLarge("maxMembers");
        const geometry = raw.type === "way" ? readGeometry(raw.geometry, budget, limits) : { runs: [], dropped: 0 };
        members.push({ type: raw.type, ref: raw.ref, role: cleanText(raw.role, 40) ?? "", ...geometry });
      }
      answer.relations.push({ id: element.id, tags: readTags(element.tags), bounds: readBounds(element.bounds), members });
    } else if (element.type === "way") {
      if (answer.ways.length >= limits.maxWays) throw new AnswerTooLarge("maxWays");
      answer.ways.push({
        id: element.id,
        tags: readTags(element.tags),
        bounds: readBounds(element.bounds),
        ...readGeometry(element.geometry, budget, limits),
      });
    }
  }
  return answer;
}

// ── Asking ──────────────────────────────────────────────────────────────────

export interface AskOptions {
  /** Fires when the person who asked has gone away. */
  signal?: AbortSignal;
  /** The largest answer that will be read, in bytes. */
  maxBytes: number;
  /** Said when the answer is larger than that. */
  tooLarge: string;
  userAgent: string;
  /** For tests: how long to wait for the whole answer. */
  timeoutMs?: number;
}

export interface OverpassClient {
  /** Posts one question and returns the parsed JSON of the answer. */
  ask(source: RouteSource, query: string, options: AskOptions): Promise<unknown>;
}

async function readCapped(response: { body: AsyncIterable<Uint8Array> | null }, maxBytes: number): Promise<Buffer | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!response.body) return Buffer.alloc(0);
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createOverpassClient(http: HttpClient, options: { now?: () => number } = {}): OverpassClient {
  const now = options.now ?? Date.now;
  /** Sources that said they were busy, and when they may be asked again. */
  const pausedUntil = new Map<string, number>();
  let asking = false;

  return {
    async ask(source, query, ask) {
      const wait = (pausedUntil.get(source.id) ?? 0) - now();
      if (wait > 0) {
        throw new AppError(
          "upstream",
          `${source.host} said it was busy a moment ago. Outpost waits before asking it again: try in ${Math.ceil(wait / 1000)} seconds.`,
        );
      }
      if (asking) throw new AppError("conflict", "Another route search is still running. Wait for it to finish, then try again.");
      asking = true;
      const timeoutMs = ask.timeoutMs ?? ANSWER_TIMEOUT_MS;
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = ask.signal ? AbortSignal.any([ask.signal, timeout]) : timeout;
      const busy = () => {
        pausedUntil.set(source.id, now() + BUSY_PAUSE_MS);
        return new AppError(
          "upstream",
          `${source.host} is busy and turned the search away. Outpost will wait ${BUSY_PAUSE_MS / 1000} seconds before asking it again.`,
        );
      };
      try {
        const { response } = await http.fetch(source.endpoint, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            accept: "application/json",
            "user-agent": ask.userAgent,
          },
          allowedHosts: [source.allowHost],
          everyHop: true,
          signal,
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          if ([429, 502, 503, 504].includes(response.status)) throw busy();
          throw new AppError(
            "upstream",
            `${source.host} could not answer the search (HTTP ${response.status}). Try again in a little while.`,
          );
        }
        const bytes = await readCapped(response as { body: AsyncIterable<Uint8Array> | null }, ask.maxBytes);
        if (bytes === null) throw new AppError("too_large", ask.tooLarge);
        let body: unknown;
        try {
          body = JSON.parse(bytes.toString("utf8"));
        } catch {
          throw new AppError("upstream", `${source.host} answered with something that is not route data. Try again in a little while.`);
        }
        const remark = isRecord(body) && typeof body.remark === "string" ? body.remark : "";
        // Overpass reports a question it gave up on inside an answer that otherwise looks fine.
        if (/timed out|out of memory|runtime error/i.test(remark)) {
          if (/out of memory/i.test(remark)) throw new AppError("too_large", ask.tooLarge);
          throw busy();
        }
        return body;
      } catch (error) {
        if (error instanceof BlockedAddressError) {
          throw new AppError(
            "forbidden",
            `Outpost did not ask ${source.host} because it is on this computer or a private network. A route source on your own network needs the server started with OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true.`,
          );
        }
        if (error instanceof AppError) throw error;
        // The person who asked has gone: there is nobody to tell, and nothing went wrong.
        if (ask.signal?.aborted) throw new AppError("bad_request", "The search was cancelled.");
        if (timeout.aborted) {
          throw new AppError(
            "upstream",
            `${source.host} did not answer within ${Math.round(timeoutMs / 1000)} seconds. It may be busy: try again in a minute.`,
          );
        }
        const kind = classifyNetworkError(error);
        if (kind === "offline") {
          throw new AppError(
            "offline",
            `Outpost could not reach ${source.host}. Finding a route needs an internet connection; the routes already on your map do not.`,
          );
        }
        throw new AppError("upstream", `The connection to ${source.host} failed part of the way through. Try again in a little while.`);
      } finally {
        asking = false;
      }
    },
  };
}

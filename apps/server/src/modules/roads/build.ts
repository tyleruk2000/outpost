/**
 * Building a main-roads network from an OpenStreetMap extract (`.osm.pbf`).
 *
 * Read, in three straight passes over the file and nothing else kept:
 *  1. motorway junction nodes (their number and name); the ways a road route needs
 *     (motorways, trunk, primary and secondary roads and their slip roads, car ferries,
 *     the Channel Tunnel shuttle) with the tags that matter (ref, int_ref, name, oneway,
 *     maxspeed, toll, junction, destination signs), and every node id they use, into
 *     typed arrays; ferry route relations, which say a ferry carries cars when its ways
 *     do not;
 *  2. (in memory) the node ids sorted and made unique, each way's ids turned into
 *     positions in that list, and the nodes where ways meet, end or have a junction
 *     marked as the network's nodes;
 *  3. the positions of those nodes only, read by walking the file's nodes and the sorted
 *     list together (Geofabrik's files are sorted by id).
 * Ways are then cut at the network's nodes into edges, each with its length and a
 * simplified shape for drawing. Memory is a few typed arrays the size of the roads read:
 * the rest of the file streams past (see docs/development/road-routes.md for figures).
 */
import fs from "node:fs";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { type Block, blobs, PbfError, type PbfHeader, Proto, readBlock, readHeader } from "../layers/adapters/pbf.ts";

// ── Road classes ─────────────────────────────────────────────────────────────

export const CLASS = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  motorway_link: 4,
  trunk_link: 5,
  primary_link: 6,
  secondary_link: 7,
  ferry: 8,
  shuttle: 9,
  /** Added when networks are joined: from a crossing's end to the nearest road. */
  connector: 10,
} as const;
export type RoadClass = (typeof CLASS)[keyof typeof CLASS];
const HIGHWAY_CLASS: Record<string, number> = {
  motorway: CLASS.motorway,
  trunk: CLASS.trunk,
  primary: CLASS.primary,
  secondary: CLASS.secondary,
  motorway_link: CLASS.motorway_link,
  trunk_link: CLASS.trunk_link,
  primary_link: CLASS.primary_link,
  secondary_link: CLASS.secondary_link,
};
export const isLink = (cls: number) => cls >= CLASS.motorway_link && cls <= CLASS.secondary_link;
export const isCrossing = (cls: number) => cls === CLASS.ferry || cls === CLASS.shuttle;

export const FLAG = { oneway: 1, roundabout: 2, toll: 4 } as const;
/** A maxspeed of "none" (a German Autobahn without a limit). */
export const SPEED_NONE = 255;

// ── Growing typed arrays ─────────────────────────────────────────────────────

type TypedArray = Float64Array | Float32Array | Uint32Array | Int32Array | Uint8Array | Uint16Array;
class Grow<T extends TypedArray> {
  data: T;
  length = 0;
  private readonly make: (n: number) => T;
  constructor(make: (n: number) => T, initial = 1024) {
    this.make = make;
    this.data = make(initial);
  }
  push(value: number): void {
    if (this.length === this.data.length) {
      const next = this.make(this.data.length * 2);
      next.set(this.data as never);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
  done(): T {
    return this.data.slice(0, this.length) as T;
  }
}

// ── Strings ──────────────────────────────────────────────────────────────────

export class StringTable {
  readonly list: string[] = [""];
  private readonly index = new Map<string, number>([["", 0]]);
  add(value: string | null | undefined): number {
    if (!value) return 0;
    const text = value.trim().slice(0, 300);
    if (!text) return 0;
    let at = this.index.get(text);
    if (at === undefined) {
      at = this.list.length;
      this.list.push(text);
      this.index.set(text, at);
    }
    return at;
  }
}

/** A sign as one string: places, the roads with them, the junction's number ("Reims;Laon\u0001A4;A26\u000121"). */
export const SIGN_SEPARATOR = "\u0001";

// ── Tags ─────────────────────────────────────────────────────────────────────

const MPH = 1.609344;
/** Speed limits written as a country's code for a kind of road, in km/h, from the OpenStreetMap wiki (see speeds.ts). */
const IMPLICIT: Record<string, number> = {
  "GB:nsl_single": Math.round(60 * MPH),
  "GB:nsl_dual": Math.round(70 * MPH),
  "GB:motorway": Math.round(70 * MPH),
  "UK:nsl_single": Math.round(60 * MPH),
  "UK:nsl_dual": Math.round(70 * MPH),
  "UK:motorway": Math.round(70 * MPH),
  "FR:urban": 50,
  "FR:rural": 80,
  "FR:motorway": 130,
  "DE:urban": 50,
  "DE:rural": 100,
  "DE:motorway": SPEED_NONE,
  "AT:urban": 50,
  "AT:rural": 100,
  "AT:motorway": 130,
  "BE:urban": 50,
  "BE-VLG:rural": 70,
  "BE-WAL:rural": 90,
  "BE:motorway": 120,
  "NL:urban": 50,
  "NL:rural": 80,
  "NL:motorway": 100,
  "CH:urban": 50,
  "CH:rural": 80,
  "CH:motorway": 120,
  "IT:urban": 50,
  "IT:rural": 90,
  "IT:motorway": 130,
  "LU:urban": 50,
  "LU:rural": 90,
  "LU:motorway": 130,
};

/** km/h from a maxspeed tag; 0 when unknown, SPEED_NONE for no limit. */
export function parseMaxspeed(value: string | undefined): number {
  if (!value) return 0;
  const text = value.trim();
  if (text === "none") return SPEED_NONE;
  const implicit = IMPLICIT[text];
  if (implicit !== undefined) return implicit;
  const generic = /^[A-Z]{2}(?:-[A-Z]+)?:(urban|rural|motorway|trunk)$/.exec(text);
  if (generic) return generic[1] === "urban" ? 50 : generic[1] === "rural" ? 90 : 120;
  const match = /^(\d{1,3})(?:\s*(mph|km\/h|kmh))?$/.exec(text.split(";")[0]!.trim());
  if (!match) return 0;
  const n = Number(match[1]);
  const kmh = match[2] === "mph" ? Math.round(n * MPH) : n;
  return kmh > 0 && kmh < SPEED_NONE ? kmh : 0;
}

/** Seconds from a ferry's duration tag: "1:30", "01:30:00", "PT1H30M", "35" (minutes). Null when unreadable. */
export function parseDuration(value: string | undefined): number | null {
  if (!value) return null;
  const text = value.trim();
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(text);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  m = /^(\d{1,4})$/.exec(text);
  if (m) return Number(m[1]) * 60;
  return null;
}

/** "E 17" as "E17"; a list as written, each tidied. */
export function tidyRefs(value: string | undefined): string {
  if (!value) return "";
  return value
    .split(";")
    .map((part) => part.trim().replace(/^([A-Z]{1,3})\s+(\d)/, "$1$2"))
    .filter(Boolean)
    .join(";");
}

const yes = (value: string | undefined) => value === "yes" || value === "designated" || value === "permissive";
const no = (value: string | undefined) => value === "no" || value === "private";

// ── Low-level reading ────────────────────────────────────────────────────────

/** Varints of a packed field, delta-decoded and zigzag when asked, into `out` (grown as needed). */
function unpack(buf: Uint8Array, start: number, end: number, signed: boolean, delta: boolean, out: Float64Array[]): number {
  let target = out[0]!;
  let n = 0;
  let last = 0;
  let pos = start;
  while (pos < end) {
    let result = 0;
    let shift = 1;
    let byte: number;
    do {
      byte = buf[pos++]!;
      result += (byte & 0x7f) * shift;
      shift *= 128;
    } while (byte >= 0x80 && pos <= end);
    let value = result;
    if (signed) value = result % 2 === 1 ? -(result + 1) / 2 : result / 2;
    last = delta ? last + value : value;
    if (n === target.length) {
      const grown = new Float64Array(target.length * 2);
      grown.set(target);
      target = grown;
      out[0] = target;
    }
    target[n++] = last;
  }
  return n;
}

const scratch = {
  ids: [new Float64Array(8192)],
  lats: [new Float64Array(8192)],
  lons: [new Float64Array(8192)],
  kv: [new Float64Array(16384)],
};

/** Each dense node of a block: id, raw lat and lon (in block units), and its tags as positions in `kv` when asked. */
function eachDenseNode(
  block: Block,
  wantTags: boolean,
  visit: (id: number, lat: number, lon: number, kv: Float64Array, kvStart: number) => void,
  visitPlain: (id: number, lat: number, lon: number) => void,
): void {
  const { buf } = block;
  for (const [start, end] of block.groups) {
    const group = new Proto(buf, start, end);
    for (let field = group.field(); field; field = group.field()) {
      if (field.no === 2 && field.wire === 2) {
        const [ds, de] = group.span();
        const dense = new Proto(buf, ds, de);
        let count = 0;
        let kvCount = 0;
        for (let f = dense.field(); f; f = dense.field()) {
          if (f.wire === 2 && (f.no === 1 || f.no === 8 || f.no === 9 || (f.no === 10 && wantTags))) {
            const [s, e] = dense.span();
            if (f.no === 1) count = unpack(buf, s, e, true, true, scratch.ids);
            else if (f.no === 8) unpack(buf, s, e, true, true, scratch.lats);
            else if (f.no === 9) unpack(buf, s, e, true, true, scratch.lons);
            else kvCount = unpack(buf, s, e, false, false, scratch.kv);
          } else dense.skip(f.wire);
        }
        const ids = scratch.ids[0]!;
        const lats = scratch.lats[0]!;
        const lons = scratch.lons[0]!;
        if (wantTags && kvCount > 0) {
          const kv = scratch.kv[0]!;
          let k = 0;
          for (let i = 0; i < count; i += 1) {
            visit(ids[i]!, lats[i]!, lons[i]!, kv, k);
            while (k < kvCount && kv[k] !== 0) k += 2;
            k += 1;
          }
        } else for (let i = 0; i < count; i += 1) visitPlain(ids[i]!, lats[i]!, lons[i]!);
      } else if (field.no === 1 && field.wire === 2) {
        // A plain (not dense) node: rare in extracts.
        const [ns, ne] = group.span();
        const node = new Proto(buf, ns, ne);
        let id = 0;
        let lat = 0;
        let lon = 0;
        for (let f = node.field(); f; f = node.field()) {
          if (f.no === 1 && f.wire === 0) id = node.svarint();
          else if (f.no === 8 && f.wire === 0) lat = node.svarint();
          else if (f.no === 9 && f.wire === 0) lon = node.svarint();
          else node.skip(f.wire);
        }
        visitPlain(id, lat, lon);
      } else group.skip(field.wire);
    }
  }
}

interface RawWay {
  id: number;
  keys: number[];
  values: number[];
  refs: [number, number] | null;
}

const wayScratch = { keys: [new Float64Array(64)], values: [new Float64Array(64)] };

/**
 * Each way of a block whose tags `prefilter` accepts (given as string-table positions, in
 * reused arrays, so the many ways not wanted cost no allocation), with its tags and where
 * its node ids are.
 */
function eachRawWay(
  block: Block,
  prefilter: (keys: Float64Array, values: Float64Array, count: number) => boolean,
  visit: (way: RawWay) => void,
): void {
  const { buf } = block;
  for (const [start, end] of block.groups) {
    const group = new Proto(buf, start, end);
    for (let field = group.field(); field; field = group.field()) {
      if (field.no !== 3 || field.wire !== 2) {
        group.skip(field.wire);
        continue;
      }
      const [ws, we] = group.span();
      const way = new Proto(buf, ws, we);
      let id = 0;
      let keys: [number, number] | null = null;
      let values: [number, number] | null = null;
      let refs: [number, number] | null = null;
      for (let f = way.field(); f; f = way.field()) {
        if (f.no === 1 && f.wire === 0) id = way.varint();
        else if (f.no === 2 && f.wire === 2) keys = way.span();
        else if (f.no === 3 && f.wire === 2) values = way.span();
        else if (f.no === 8 && f.wire === 2) refs = way.span();
        else way.skip(f.wire);
      }
      if (!keys || !values || !refs) continue;
      const count = unpack(buf, keys[0], keys[1], false, false, wayScratch.keys);
      unpack(buf, values[0], values[1], false, false, wayScratch.values);
      const k = wayScratch.keys[0]!;
      const v = wayScratch.values[0]!;
      if (!prefilter(k, v, count)) continue;
      visit({ id, keys: Array.from(k.subarray(0, count)), values: Array.from(v.subarray(0, count)), refs });
    }
  }
}

function eachRawRelation(
  block: Block,
  visit: (tags: Record<string, string>, wayIds: number[]) => void,
  wanted: (keys: number[], values: number[]) => boolean,
): void {
  const { buf, strings } = block;
  for (const [start, end] of block.groups) {
    const group = new Proto(buf, start, end);
    for (let field = group.field(); field; field = group.field()) {
      if (field.no !== 4 || field.wire !== 2) {
        group.skip(field.wire);
        continue;
      }
      const [rs, re] = group.span();
      const relation = new Proto(buf, rs, re);
      let keys: number[] = [];
      let values: number[] = [];
      let members: number[] = [];
      let types: number[] = [];
      for (let f = relation.field(); f; f = relation.field()) {
        if (f.no === 2 && f.wire === 2) keys = relation.packed(false, false);
        else if (f.no === 3 && f.wire === 2) values = relation.packed(false, false);
        else if (f.no === 9 && f.wire === 2) members = relation.packed(true, true);
        else if (f.no === 10 && f.wire === 2) types = relation.packed(false, false);
        else relation.skip(f.wire);
      }
      if (!wanted(keys, values)) continue;
      const tags: Record<string, string> = {};
      for (let i = 0; i < keys.length; i += 1) tags[strings[keys[i]!] ?? ""] = strings[values[i]!] ?? "";
      visit(
        tags,
        members.filter((_, i) => types[i] === 1),
      );
    }
  }
}

// ── The network ──────────────────────────────────────────────────────────────

/** A crossing as read: a group of ferry or shuttle ways that meet. */
export interface CrossingInfo {
  /** "way/<id>" of its longest way: the same in every extract that holds it. */
  id: string;
  kind: "ferry" | "shuttle";
  name: string;
  operator: string | null;
  from: string | null;
  to: string | null;
  /** Seconds on board as tagged (the longest of its ways' durations), or null. */
  durationS: number | null;
  lengthM: number;
}

export interface RoadNetworkData {
  header: PbfHeader;
  strings: string[];
  /** Nodes: OpenStreetMap id (sorted ascending), position in 1e-7 degrees. */
  nodeId: Float64Array;
  nodeLat: Int32Array;
  nodeLon: Int32Array;
  /** Motorway junctions: node index, number, name (string indices). */
  junctionNode: Uint32Array;
  junctionRef: Uint32Array;
  junctionName: Uint32Array;
  /** Edges between nodes, in the direction of travel the way's geometry gives. */
  edgeFrom: Uint32Array;
  edgeTo: Uint32Array;
  edgeLength: Float32Array;
  /** Seconds fixed by the data (a crossing's duration, shared out by length), or 0. */
  edgeFixed: Float32Array;
  edgeClass: Uint8Array;
  edgeFlags: Uint8Array;
  edgeMaxspeed: Uint8Array;
  edgeRef: Uint32Array;
  edgeIntRef: Uint32Array;
  edgeName: Uint32Array;
  /** Signs for travel along the geometry and against it (string indices, see SIGN_SEPARATOR). */
  edgeSignF: Uint32Array;
  edgeSignB: Uint32Array;
  /** Shape points between the ends, as lat/lon pairs in 1e-7 degrees: edge e's are shape[2*shapeStart[e] ... 2*shapeStart[e+1]). */
  shapeStart: Uint32Array;
  shape: Int32Array;
  crossings: CrossingInfo[];
  /** The crossing each crossing edge belongs to (index into `crossings`), for edges of class ferry or shuttle; -1 otherwise. */
  edgeCrossing: Int32Array;
  stats: BuildStats;
}

export interface BuildStats {
  ways: number;
  refs: number;
  uniqueNodes: number;
  missingNodes: number;
  bytesRead: number;
  seconds: number;
  /** Peak resident set seen while building (bytes). */
  peakRss: number;
  byClass: Record<string, number>;
}

export interface BuildOptions {
  signal?: AbortSignal;
  progress?: (message: string, bytes: number, total: number) => void;
  /** Leave out secondary roads (for measuring only). */
  withoutSecondary?: boolean;
}

const RAD = Math.PI / 180;
function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Douglas–Peucker on points [lat7, lon7, ...]: indices of points to keep (ends always). */
export function simplifyIndices(points: number[], toleranceM: number): number[] {
  const n = points.length / 2;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const lat0 = points[0]! * 1e-7 * RAD;
  const kx = Math.cos(lat0) * 111_320 * 1e-7;
  const ky = 110_574 * 1e-7;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const ax = points[2 * a + 1]! * kx;
    const ay = points[2 * a]! * ky;
    const bx = points[2 * b + 1]! * kx;
    const by = points[2 * b]! * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = toleranceM;
    for (let i = a + 1; i < b; i += 1) {
      const px = points[2 * i + 1]! * kx - ax;
      const py = points[2 * i]! * ky - ay;
      let d: number;
      if (len2 === 0) d = Math.hypot(px, py);
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        d = Math.hypot(px - t * dx, py - t * dy);
      }
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(i);
  return out;
}

/** How closely a drawn edge follows the road: good enough for a whole-route map and a printed overview. */
const SHAPE_TOLERANCE_M = 12;
/** Seconds between yields to the event loop while working in memory. */
const BLOCKS_PER_YIELD = 8;

function lowerBound(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export async function buildNetwork(filePath: string, options: BuildOptions = {}): Promise<RoadNetworkData> {
  const started = performance.now();
  const { signal } = options;
  let peakRss = process.memoryUsage().rss;
  const sampleRss = () => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRss) peakRss = rss;
  };
  const strings = new StringTable();
  const { size: total } = await fs.promises.stat(filePath);

  // Ways as read.
  const wayId = new Grow((n) => new Float64Array(n));
  const wayStart = new Grow((n) => new Uint32Array(n));
  const wayClass = new Grow((n) => new Uint8Array(n));
  const wayFlags = new Grow((n) => new Uint8Array(n));
  const wayMaxspeed = new Grow((n) => new Uint8Array(n));
  const wayRef = new Grow((n) => new Uint32Array(n));
  const wayIntRef = new Grow((n) => new Uint32Array(n));
  const wayName = new Grow((n) => new Uint32Array(n));
  const waySignF = new Grow((n) => new Uint32Array(n));
  const waySignB = new Grow((n) => new Uint32Array(n));
  const refs = new Grow((n) => new Float64Array(n), 1 << 16);
  /** Ferry ways not yet known to carry cars, by way index, with their tags for the crossing's details. */
  const ferryTags = new Map<number, Record<string, string>>();
  const ferryPending = new Set<number>();
  const ferryWayIndex = new Map<number, number>();
  const ferryRelations: Array<{ tags: Record<string, string>; ways: number[] }> = [];
  const junctions = new Map<number, { ref: number; name: number }>();
  const byClass: Record<string, number> = {};
  let header: PbfHeader | null = null;

  const withoutSecondary = options.withoutSecondary === true;

  // Pass 1.
  let blocks = 0;
  for await (const blob of blobs(filePath, signal)) {
    if (blob.type === "OSMHeader") {
      header = readHeader(blob.data);
      continue;
    }
    if (blob.type !== "OSMData") continue;
    if (!header) throw new PbfError("This is not an OpenStreetMap PBF file: it has no header.");
    const block = readBlock(blob.data);
    const s = block.strings;
    const idx = (text: string) => s.indexOf(text);
    const kHighway = idx("highway");
    const vJunction = idx("motorway_junction");
    if (kHighway > 0 && vJunction > 0) {
      const kRef = idx("ref");
      const kName = idx("name");
      eachDenseNode(
        block,
        true,
        (id, _lat, _lon, kv, k) => {
          let found = false;
          let ref = "";
          let name = "";
          for (let j = k; kv[j] !== 0 && j < kv.length; j += 2) {
            const key = kv[j]!;
            const value = kv[j + 1]!;
            if (key === kHighway && value === vJunction) found = true;
            else if (key === kRef) ref = s[value] ?? "";
            else if (key === kName) name = s[value] ?? "";
          }
          if (found) junctions.set(id, { ref: strings.add(ref), name: strings.add(name) });
        },
        () => {},
      );
    }
    const kRoute = idx("route");
    const wantedValues = new Set<number>();
    for (const value of [...Object.keys(HIGHWAY_CLASS), "ferry", "shuttle_train"]) {
      const at = idx(value);
      if (at > 0) wantedValues.add(at);
    }
    // A quick look first: most ways are not roads this network wants.
    const prefilter = (keys: Float64Array, values: Float64Array, count: number) => {
      if (wantedValues.size === 0) return false;
      for (let i = 0; i < count; i += 1) if ((keys[i] === kHighway || keys[i] === kRoute) && wantedValues.has(values[i]!)) return true;
      return false;
    };
    eachRawWay(block, prefilter, (raw) => {
      let wanted = false;
      for (let i = 0; i < raw.keys.length; i += 1) {
        const key = s[raw.keys[i]!];
        if (key === "highway" && HIGHWAY_CLASS[s[raw.values[i]!] ?? ""] !== undefined) wanted = true;
        else if (key === "route" && (s[raw.values[i]!] === "ferry" || s[raw.values[i]!] === "shuttle_train")) wanted = true;
      }
      if (!wanted || !raw.refs) return;
      const t: Record<string, string> = {};
      for (let i = 0; i < raw.keys.length; i += 1) t[s[raw.keys[i]!] ?? ""] = s[raw.values[i]!] ?? "";
      let cls: number | undefined;
      let pending = false;
      if (t.route === "shuttle_train") {
        if (no(t.motorcar) || no(t.motor_vehicle)) return;
        cls = CLASS.shuttle;
      } else if (t.route === "ferry") {
        if (no(t.motorcar) || no(t.motor_vehicle) || no(t.vehicle)) return;
        cls = CLASS.ferry;
        pending = !(yes(t.motorcar) || yes(t.motor_vehicle) || yes(t.vehicle));
      } else {
        cls = HIGHWAY_CLASS[t.highway ?? ""];
        if (cls === undefined) return;
        if (withoutSecondary && (cls === CLASS.secondary || cls === CLASS.secondary_link)) return;
        if (no(t.access) && !yes(t.motor_vehicle) && !yes(t.motorcar)) return;
        if (no(t.motor_vehicle) || no(t.motorcar) || t.area === "yes") return;
      }
      // The ids, delta-coded.
      const startRef = refs.length;
      const [rs, re] = raw.refs;
      const inner = new Proto(block.buf, rs, re);
      let last = 0;
      while (inner.pos < re) {
        last += inner.svarint();
        refs.push(last);
      }
      if (refs.length - startRef < 2) {
        refs.length = startRef;
        return;
      }
      // oneway=-1: travel runs against the geometry, so the ids are turned round.
      const ow = t.oneway;
      if (ow === "-1" || ow === "reverse") {
        const data = refs.data;
        for (let a = startRef, b = refs.length - 1; a < b; a += 1, b -= 1) {
          const tmp = data[a]!;
          data[a] = data[b]!;
          data[b] = tmp;
        }
      }
      const roundabout = t.junction === "roundabout" || t.junction === "circular";
      const oneway =
        ow === "yes" ||
        ow === "1" ||
        ow === "true" ||
        ow === "-1" ||
        ow === "reverse" ||
        (ow !== "no" && (roundabout || cls === CLASS.motorway || cls === CLASS.motorway_link || cls === CLASS.shuttle));
      const flags = (oneway ? FLAG.oneway : 0) | (roundabout ? FLAG.roundabout : 0) | (t.toll === "yes" ? FLAG.toll : 0);
      const reversed = ow === "-1" || ow === "reverse";
      const sign = (dir: "forward" | "backward") => {
        const pick = (key: string) => {
          const directed = t[`${key}:${dir}`];
          if (directed) return directed;
          // Plain tags are for the way's travel direction: only meaningful on a one-way road.
          return oneway && dir === "forward" ? t[key] : undefined;
        };
        const place = pick("destination") ?? pick("destination:street") ?? "";
        const roads = tidyRefs(pick("destination:ref"));
        const junction = t["junction:ref"] ?? "";
        if (!place && !roads && !junction) return 0;
        return strings.add([place, roads, junction].join(SIGN_SEPARATOR));
      };
      let signF = sign(reversed ? "backward" : "forward");
      let signB = oneway ? 0 : sign(reversed ? "forward" : "backward");
      if (reversed && oneway) {
        // destination on a oneway=-1 way is for the way's travel direction, which is now forward.
        signF = sign("forward") || signF;
        signB = 0;
      }
      let maxspeed = parseMaxspeed(t.maxspeed) || parseMaxspeed(t["maxspeed:type"]) || parseMaxspeed(t["source:maxspeed"]);
      if (!maxspeed) {
        const f = parseMaxspeed(t["maxspeed:forward"]);
        const b = parseMaxspeed(t["maxspeed:backward"]);
        maxspeed = f && b ? Math.min(f, b) : f || b;
      }
      const index = wayId.length;
      wayId.push(raw.id);
      wayStart.push(startRef);
      wayClass.push(cls);
      wayFlags.push(flags);
      wayMaxspeed.push(maxspeed);
      wayRef.push(strings.add(tidyRefs(t.ref)));
      wayIntRef.push(strings.add(tidyRefs(t.int_ref)));
      wayName.push(strings.add(t.name));
      waySignF.push(signF);
      waySignB.push(signB);
      byClass[Object.keys(CLASS)[cls] ?? String(cls)] = (byClass[Object.keys(CLASS)[cls] ?? String(cls)] ?? 0) + 1;
      if (isCrossing(cls)) {
        ferryTags.set(index, t);
        ferryWayIndex.set(raw.id, index);
        if (pending) ferryPending.add(index);
      }
    });
    eachRawRelation(
      block,
      (tags, ways) => ferryRelations.push({ tags, ways }),
      (keys, values) => {
        for (let i = 0; i < keys.length; i += 1)
          if (s[keys[i]!] === "route" && (s[values[i]!] === "ferry" || s[values[i]!] === "shuttle_train")) return true;
        return false;
      },
    );
    blocks += 1;
    if (blocks % BLOCKS_PER_YIELD === 0) {
      sampleRss();
      options.progress?.("Reading the roads (pass 1 of 2)", blob.offset, total);
      await yieldToEventLoop();
    }
  }
  if (!header) throw new PbfError("This is not an OpenStreetMap PBF file: it has no header.");
  wayStart.push(refs.length);

  // A ferry whose route relation carries cars carries them; the relation's name and duration fill gaps.
  for (const relation of ferryRelations) {
    const t = relation.tags;
    const cars = yes(t.motorcar) || yes(t.motor_vehicle) || yes(t.vehicle) || t.route === "shuttle_train";
    for (const id of relation.ways) {
      const index = ferryWayIndex.get(id);
      if (index === undefined) continue;
      if (cars) ferryPending.delete(index);
      const own = ferryTags.get(index)!;
      for (const key of ["name", "duration", "operator", "from", "to"]) if (!own[key] && t[key]) own[key] = t[key]!;
    }
  }
  const dropped = new Uint8Array(wayId.length);
  for (const index of ferryPending) dropped[index] = 1;

  // Pass 2, in memory: unique ids, and each way's ids as positions in that list.
  options.progress?.("Sorting the junctions", total, total);
  const allRefs = refs.done();
  refs.data = new Float64Array(0);
  const sorted = allRefs.slice().sort();
  let unique = 0;
  for (let i = 0; i < sorted.length; i += 1) if (i === 0 || sorted[i] !== sorted[unique - 1]) sorted[unique++] = sorted[i]!;
  const ids = sorted.slice(0, unique);
  sampleRss();
  const refIndex = new Uint32Array(allRefs.length);
  const uses = new Uint8Array(unique);
  const starts = wayStart.done();
  const isNode = new Uint8Array(unique);
  for (let w = 0; w < wayId.length; w += 1) {
    const a = starts[w]!;
    const b = starts[w + 1]!;
    for (let i = a; i < b; i += 1) {
      const at = lowerBound(ids, allRefs[i]!);
      refIndex[i] = at;
      if (!dropped[w] && uses[at]! < 255) uses[at] = uses[at]! + 1;
    }
    if (!dropped[w]) {
      isNode[refIndex[a]!] = 1;
      isNode[refIndex[b - 1]!] = 1;
    }
    if (w % 50_000 === 0) await yieldToEventLoop();
  }
  for (let i = 0; i < unique; i += 1) if (uses[i]! >= 2) isNode[i] = 1;
  for (const id of junctions.keys()) {
    const at = lowerBound(ids, id);
    if (ids[at] === id) isNode[at] = 1;
  }
  sampleRss();

  // Pass 3: positions.
  const lat7 = new Int32Array(unique).fill(-0x80000000);
  const lon7 = new Int32Array(unique);
  let cursor = 0;
  let found = 0;
  blocks = 0;
  for await (const blob of blobs(filePath, signal)) {
    if (blob.type !== "OSMData") continue;
    const block = readBlock(blob.data);
    const { granularity, latOffset, lonOffset } = block;
    const place = (id: number, lat: number, lon: number) => {
      // The file's nodes come in id order: walk both lists together, and look up anything out of order.
      if (cursor > 0 && ids[cursor - 1]! > id) cursor = lowerBound(ids, id);
      while (cursor < unique && ids[cursor]! < id) cursor += 1;
      if (cursor < unique && ids[cursor] === id) {
        lat7[cursor] = Math.round((latOffset + granularity * lat) / 100);
        lon7[cursor] = Math.round((lonOffset + granularity * lon) / 100);
        found += 1;
      }
    };
    eachDenseNode(block, false, () => {}, place);
    blocks += 1;
    if (blocks % BLOCKS_PER_YIELD === 0) {
      sampleRss();
      options.progress?.("Reading the roads' positions (pass 2 of 2)", blob.offset, total);
      await yieldToEventLoop();
    }
  }
  const has = (u: number) => lat7[u] !== -0x80000000;

  // A way the extract cut off (its next node missing) ends where its last known node is.
  for (let w = 0; w < wayId.length; w += 1) {
    if (dropped[w]) continue;
    for (let i = starts[w]!; i < starts[w + 1]!; i += 1) {
      const u = refIndex[i]!;
      if (has(u)) continue;
      if (i > starts[w]! && has(refIndex[i - 1]!)) isNode[refIndex[i - 1]!] = 1;
      if (i + 1 < starts[w + 1]! && has(refIndex[i + 1]!)) isNode[refIndex[i + 1]!] = 1;
    }
  }

  // The network's nodes, numbered in id order.
  const nodeOf = new Int32Array(unique).fill(-1);
  let nodes = 0;
  for (let u = 0; u < unique; u += 1) if (isNode[u] && has(u)) nodeOf[u] = nodes++;
  const nodeId = new Float64Array(nodes);
  const nodeLat = new Int32Array(nodes);
  const nodeLon = new Int32Array(nodes);
  for (let u = 0; u < unique; u += 1) {
    const n = nodeOf[u]!;
    if (n < 0) continue;
    nodeId[n] = ids[u]!;
    nodeLat[n] = lat7[u]!;
    nodeLon[n] = lon7[u]!;
  }

  // Edges.
  const eFrom = new Grow((n) => new Uint32Array(n));
  const eTo = new Grow((n) => new Uint32Array(n));
  const eLen = new Grow((n) => new Float32Array(n));
  const eFixed = new Grow((n) => new Float32Array(n));
  const eClass = new Grow((n) => new Uint8Array(n));
  const eFlags = new Grow((n) => new Uint8Array(n));
  const eMax = new Grow((n) => new Uint8Array(n));
  const eRef = new Grow((n) => new Uint32Array(n));
  const eInt = new Grow((n) => new Uint32Array(n));
  const eName = new Grow((n) => new Uint32Array(n));
  const eSignF = new Grow((n) => new Uint32Array(n));
  const eSignB = new Grow((n) => new Uint32Array(n));
  const eShapeStart = new Grow((n) => new Uint32Array(n));
  const eWay = new Grow((n) => new Uint32Array(n));
  const shape = new Grow((n) => new Int32Array(n), 1 << 16);
  const wayLength = new Float64Array(wayId.length);
  const points: number[] = [];

  for (let w = 0; w < wayId.length; w += 1) {
    if (dropped[w]) continue;
    let from = -1;
    let length = 0;
    points.length = 0;
    let prev = -1;
    const emit = (to: number) => {
      if (from === to && length < 1) return;
      eFrom.push(nodeOf[from]!);
      eTo.push(nodeOf[to]!);
      eLen.push(length);
      eFixed.push(0);
      eClass.push(wayClass.data[w]!);
      eFlags.push(wayFlags.data[w]!);
      eMax.push(wayMaxspeed.data[w]!);
      eRef.push(wayRef.data[w]!);
      eInt.push(wayIntRef.data[w]!);
      eName.push(wayName.data[w]!);
      eSignF.push(waySignF.data[w]!);
      eSignB.push(waySignB.data[w]!);
      eShapeStart.push(shape.length / 2);
      eWay.push(w);
      // Simplify the points between the ends.
      const all = [lat7[from]!, lon7[from]!, ...points, lat7[to]!, lon7[to]!];
      const keep = simplifyIndices(all, SHAPE_TOLERANCE_M);
      for (let k = 1; k < keep.length - 1; k += 1) {
        shape.push(all[2 * keep[k]!]!);
        shape.push(all[2 * keep[k]! + 1]!);
      }
      wayLength[w] = wayLength[w]! + length;
    };
    for (let i = starts[w]!; i < starts[w + 1]!; i += 1) {
      const u = refIndex[i]!;
      if (!has(u)) {
        from = -1;
        prev = -1;
        continue;
      }
      if (from < 0) {
        from = u;
        prev = u;
        length = 0;
        points.length = 0;
        continue;
      }
      length += metersBetween(lat7[prev]! * 1e-7, lon7[prev]! * 1e-7, lat7[u]! * 1e-7, lon7[u]! * 1e-7);
      if (nodeOf[u]! >= 0) {
        emit(u);
        from = u;
        length = 0;
        points.length = 0;
      } else points.push(lat7[u]!, lon7[u]!);
      prev = u;
    }
    if (w % 20_000 === 0) await yieldToEventLoop();
  }
  eShapeStart.push(shape.length / 2);
  sampleRss();

  // Crossings: the ferry and shuttle ways that meet, as one each.
  const edgeClass = eClass.done();
  const edgeWay = eWay.done();
  const edgeFrom = eFrom.done();
  const edgeTo = eTo.done();
  const edgeLength = eLen.done();
  const edgeFixed = eFixed.done();
  const edgeCrossing = new Int32Array(edgeClass.length).fill(-1);
  const parent = new Map<number, number>();
  const findRoot = (x: number): number => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const crossingEdges: number[] = [];
  for (let e = 0; e < edgeClass.length; e += 1) {
    if (!isCrossing(edgeClass[e]!)) continue;
    crossingEdges.push(e);
    const a = findRoot(edgeFrom[e]!);
    const b = findRoot(edgeTo[e]!);
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<number, number[]>();
  for (const e of crossingEdges) {
    const root = findRoot(edgeFrom[e]!);
    groups.set(root, [...(groups.get(root) ?? []), e]);
  }
  const crossings: CrossingInfo[] = [];
  for (const edges of groups.values()) {
    const ways = [...new Set(edges.map((e) => edgeWay[e]!))];
    ways.sort((a, b) => wayLength[b]! - wayLength[a]! || wayId.data[a]! - wayId.data[b]!);
    const main = ways[0]!;
    const t = ferryTags.get(main) ?? {};
    const shuttle = ways.some((w) => wayClass.data[w] === CLASS.shuttle);
    let durationS: number | null = null;
    for (const w of ways) {
      const d = parseDuration(ferryTags.get(w)?.duration);
      if (d !== null && (durationS === null || d > durationS)) durationS = d;
    }
    const index = crossings.length;
    for (const e of edges) edgeCrossing[e] = index;
    // Each way's duration is shared among its edges by length; a way without one is left to the assumed speed.
    for (const w of ways) {
      const d = parseDuration(ferryTags.get(w)?.duration);
      if (d === null || wayLength[w]! <= 0) continue;
      for (const e of edges) if (edgeWay[e] === w) edgeFixed[e] = (d * edgeLength[e]!) / wayLength[w]!;
    }
    const [fromName, toName] = endsFromName(t.name ?? "");
    crossings.push({
      id: `way/${wayId.data[main]}`,
      kind: shuttle ? "shuttle" : "ferry",
      name: t["name:en"] ?? t.name ?? (shuttle ? "Le Shuttle" : "Ferry"),
      operator: t.operator ?? null,
      from: t.from ?? fromName,
      to: t.to ?? toName,
      durationS,
      lengthM: Math.round(wayLength[main]!),
    });
  }

  // Junctions on the network.
  const jNode = new Grow((n) => new Uint32Array(n));
  const jRef = new Grow((n) => new Uint32Array(n));
  const jName = new Grow((n) => new Uint32Array(n));
  for (const [id, info] of junctions) {
    const u = lowerBound(ids, id);
    if (ids[u] !== id || nodeOf[u]! < 0) continue;
    jNode.push(nodeOf[u]!);
    jRef.push(info.ref);
    jName.push(info.name);
  }
  sampleRss();

  return {
    header,
    strings: strings.list,
    nodeId,
    nodeLat,
    nodeLon,
    junctionNode: jNode.done(),
    junctionRef: jRef.done(),
    junctionName: jName.done(),
    edgeFrom,
    edgeTo,
    edgeLength,
    edgeFixed,
    edgeClass,
    edgeFlags: eFlags.done(),
    edgeMaxspeed: eMax.done(),
    edgeRef: eRef.done(),
    edgeIntRef: eInt.done(),
    edgeName: eName.done(),
    edgeSignF: eSignF.done(),
    edgeSignB: eSignB.done(),
    shapeStart: eShapeStart.done(),
    shape: shape.done(),
    crossings,
    edgeCrossing,
    stats: {
      ways: wayId.length,
      refs: allRefs.length,
      uniqueNodes: unique,
      missingNodes: unique - found,
      bytesRead: total,
      seconds: Math.round((performance.now() - started) / 100) / 10,
      peakRss,
      byClass,
    },
  };
}

/** "Dover (UK) - Calais (F)" as ["Dover", "Calais"]; nothing when the name is not two places. */
export function endsFromName(name: string): [string | null, string | null] {
  const parts = name.split(/\s+[-–—↔]\s+|\s*<->\s*/);
  if (parts.length !== 2) return [null, null];
  const tidy = (part: string) =>
    part
      .replace(/\s*\([^)]*\)\s*$/, "")
      .split("/")[0]!
      .trim() || null;
  return [tidy(parts[0]!), tidy(parts[1]!)];
}

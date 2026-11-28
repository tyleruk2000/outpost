/**
 * A stand-in for download.geofabrik.de, for the server tests and the end-to-end suite: its
 * index shaped as the real `index-v1-nogeom.json` was on 17 November 2026 (a country with
 * parts, a part with parts of its own, the United States' states under `north-america`
 * with ids `us/<state>` and names the same), and small made-up extracts in its format.
 *
 * As the real server does, a `-latest` address answers with a redirect to a dated file,
 * each file has an `.md5` beside it, HEAD gives the size, and a range is honoured.
 * Kentucky's MD5 is wrong on purpose; Texas says it is far larger than any disk; Germany's
 * file is sent from another host, as the real one is from a mirror.
 */
import crypto from "node:crypto";
import type http from "node:http";
import { buildPbf, type PbfNode, type PbfRelation, type PbfWay } from "./builders.ts";

/** Columbus, Ohio, where the made-up places are. */
export const COLUMBUS = { lat: 39.9612, lon: -82.9988 };
export const INDIANAPOLIS = { lat: 39.7684, lon: -86.1581 };
export const MUNICH = { lat: 48.1372, lon: 11.5756 };

const square = (id: number, lat: number, lon: number, d = 0.0004): PbfNode[] => [
  { id, lat: lat - d, lon: lon - d },
  { id: id + 1, lat: lat - d, lon: lon + d },
  { id: id + 2, lat: lat + d, lon: lon + d },
  { id: id + 3, lat: lat + d, lon: lon - d },
];

/** Untagged nodes that make a file long enough to pause half-way, as most of a real extract is. */
function filler(from: number, count: number, lat: number, lon: number): PbfNode[] {
  // Scattered as real nodes are, so that the file does not compress to nothing.
  let seed = 12_345;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: from + i * 3 + Math.floor(next() * 3),
    lat: lat + next() * 0.5,
    lon: lon + next() * 0.5,
  }));
}

/** The pharmacy on the Ohio and Indiana line, in both files, as Geofabrik's extracts overlap at their edges. */
const BORDER: PbfNode = { id: 1_900, lat: 39.9, lon: -84.81, tags: { amenity: "pharmacy", name: "State Line Pharmacy (test)" } };

function ohio(): Buffer {
  const supermarket = square(3_001, 39.965, -83.005);
  const market = square(3_011, 39.955, -82.99, 0.0008);
  const nodes: PbfNode[] = [
    {
      id: 1_001,
      ...COLUMBUS,
      lat: COLUMBUS.lat + 0.001,
      tags: { amenity: "pharmacy", name: "High Street Pharmacy (test)", opening_hours: "Mo-Fr 09:00-19:00", "addr:street": "High Street" },
    },
    { id: 1_002, lat: 39.97, lon: -83.01, tags: { amenity: "fuel", shop: "convenience", name: "Made-up Fuel (test)" } },
    { id: 1_003, lat: 39.958, lon: -83.0, tags: { amenity: "drinking_water" } },
    { id: 1_004, lat: 39.962, lon: -83.001, tags: { amenity: "restaurant", name: "A restaurant (left out)" } },
    { id: 1_005, lat: 39.963, lon: -83.002, tags: { man_made: "water_tap", drinking_water: "no" } },
    { id: 1_006, lat: 39.95, lon: -83.02, tags: { amenity: "hospital", name: "Made-up Hospital (test)" } },
    { id: 1_007, lat: 40.01, lon: -82.95, tags: { amenity: "pharmacy", name: "Far Pharmacy (test)" } },
    BORDER,
    ...supermarket,
    ...market,
    ...filler(100_000, 30_000, 39.5, -83.5),
  ];
  const ways: PbfWay[] = [
    // A supermarket mapped as its building: no point of its own.
    {
      id: 2_001,
      refs: [3_001, 3_002, 3_003, 3_004, 3_001],
      tags: { building: "retail", shop: "supermarket", name: "Made-up Supermarket (test)" },
    },
    // The two halves of a market's outline, untagged: the relation says what they are.
    { id: 2_002, refs: [3_011, 3_012, 3_013] },
    { id: 2_003, refs: [3_013, 3_014, 3_011] },
  ];
  const relations: PbfRelation[] = [
    {
      id: 4_001,
      members: [
        { ref: 2_002, role: "outer" },
        { ref: 2_003, role: "outer" },
      ],
      tags: { type: "multipolygon", amenity: "marketplace", name: "Made-up Market (test)" },
    },
  ];
  return buildPbf({ nodes, ways, relations, timestamp: Date.UTC(2026, 10, 16) / 1000 });
}

function indiana(): Buffer {
  return buildPbf({
    nodes: [
      { id: 5_001, ...INDIANAPOLIS, tags: { amenity: "pharmacy", name: "Monument Pharmacy (test)" } },
      { id: 5_002, lat: INDIANAPOLIS.lat + 0.01, lon: INDIANAPOLIS.lon, tags: { shop: "supermarket", name: "Circle Grocery (test)" } },
      BORDER,
    ],
    ways: [],
    relations: [],
    timestamp: Date.UTC(2026, 10, 16) / 1000,
  });
}

function bayern(): Buffer {
  return buildPbf({
    nodes: [
      { id: 6_001, ...MUNICH, tags: { shop: "bakery", name: "Bäckerei am Marienplatz (test)" } },
      { id: 6_002, lat: MUNICH.lat + 0.002, lon: MUNICH.lon, tags: { amenity: "pharmacy", name: "Marien-Apotheke (test)" } },
      { id: 6_003, lat: MUNICH.lat - 0.003, lon: MUNICH.lon, tags: { amenity: "hospital", name: "Klinikum (test)" } },
    ],
    ways: [],
    relations: [],
    timestamp: Date.UTC(2026, 10, 16) / 1000,
  });
}

const md5 = (body: Buffer) => crypto.createHash("md5").update(body).digest("hex");

interface StandInFile {
  /** Path under the base, without `-latest.osm.pbf`. */
  path: string;
  body: Buffer;
  md5: string;
  /** What HEAD says, when it should say something else. */
  claimedBytes?: number;
  /** Sent from another host, as Geofabrik sends Germany's file from a mirror. */
  mirror?: boolean;
  /** The day `-latest` leads to, as Geofabrik writes it (261116 when not said). */
  latest?: string;
  /**
   * The dated files there are, all with the same bytes (just 261116 when not said). One that `latest` leads to and is
   * not here answers 404, as Geofabrik's did on 23 November 2026; the region's page (`<path>/`) lists those that are.
   */
  dated?: string[];
}

export interface GeofabrikStandIn {
  files: Map<string, StandInFile>;
  index(base: string): string;
  /** Requests seen, as "METHOD path". */
  requests: string[];
  /** The Range header of each file request that had one ("bytes=10-19"). */
  ranges: string[];
  /** Bytes a file is sent in, with a pause between, so that a download can be stopped half-way. */
  slow: { chunkBytes: number; delayMs: number } | null;
  handle(request: http.IncomingMessage, response: http.ServerResponse, prefix?: string): void;
}

const ENTRIES: Array<{ id: string; parent?: string; name: string; alpha2?: string[]; sub?: string[]; path: string }> = [
  { id: "europe", name: "Europe", path: "europe" },
  { id: "north-america", name: "North America", path: "north-america" },
  { id: "germany", parent: "europe", name: "Germany", alpha2: ["DE"], path: "europe/germany" },
  { id: "bayern", parent: "germany", name: "Bayern", path: "europe/germany/bayern" },
  { id: "oberbayern", parent: "bayern", name: "Oberbayern", path: "europe/germany/bayern/oberbayern" },
  { id: "berlin", parent: "germany", name: "Berlin", path: "europe/germany/berlin" },
  { id: "united-kingdom", parent: "europe", name: "United Kingdom", alpha2: ["GB"], path: "europe/united-kingdom" },
  { id: "great-britain", parent: "europe", name: "Great Britain", path: "europe/great-britain" },
  { id: "england", parent: "united-kingdom", name: "England", path: "europe/united-kingdom/england" },
  { id: "cumbria", parent: "england", name: "Cumbria", path: "europe/united-kingdom/england/cumbria" },
  { id: "monaco", parent: "europe", name: "Monaco", alpha2: ["MC"], path: "europe/monaco" },
  { id: "us", parent: "north-america", name: "United States of America", alpha2: ["US"], path: "north-america/us" },
  { id: "us-midwest", parent: "north-america", name: "US Midwest", path: "north-america/us-midwest" },
  { id: "us/ohio", parent: "north-america", name: "us/ohio", sub: ["US-OH"], path: "north-america/us/ohio" },
  { id: "us/indiana", parent: "north-america", name: "us/indiana", sub: ["US-IN"], path: "north-america/us/indiana" },
  { id: "us/kentucky", parent: "north-america", name: "us/kentucky", sub: ["US-KY"], path: "north-america/us/kentucky" },
  { id: "us/new-york", parent: "north-america", name: "us/new-york", sub: ["US-NY"], path: "north-america/us/new-york" },
  { id: "us/texas", parent: "north-america", name: "us/texas", sub: ["US-TX"], path: "north-america/us/texas" },
  {
    id: "us/puerto-rico",
    parent: "north-america",
    name: "us/puerto-rico",
    alpha2: ["PR"],
    sub: ["US-PR"],
    path: "north-america/us/puerto-rico",
  },
];

export function createGeofabrikStandIn(): GeofabrikStandIn {
  const files = new Map<string, StandInFile>();
  const put = (path: string, body: Buffer, extra: Partial<StandInFile> = {}) => files.set(path, { path, body, md5: md5(body), ...extra });
  put("north-america/us/ohio", ohio());
  put("north-america/us/indiana", indiana());
  put("north-america/us/kentucky", indiana(), { md5: "0".repeat(32) });
  put("north-america/us/texas", indiana(), { claimedBytes: 4e15 });
  put("europe/germany/bayern", bayern());
  put("europe/germany", bayern(), { mirror: true });
  const requests: string[] = [];
  const ranges: string[] = [];
  const standIn: GeofabrikStandIn = {
    files,
    requests,
    ranges,
    slow: null,
    index(base) {
      return JSON.stringify({
        type: "FeatureCollection",
        features: ENTRIES.map((entry) => ({
          type: "Feature",
          properties: {
            id: entry.id,
            ...(entry.parent ? { parent: entry.parent } : {}),
            name: entry.name,
            ...(entry.alpha2 ? { "iso3166-1:alpha2": entry.alpha2 } : {}),
            ...(entry.sub ? { "iso3166-2": entry.sub } : {}),
            urls: { pbf: `${base}/${entry.path}-latest.osm.pbf`, updates: `${base}/${entry.path}-updates` },
          },
        })),
      });
    },
    handle(request, response, prefix = "") {
      const url = new URL(request.url ?? "/", "http://stand-in");
      const route = url.pathname.slice(prefix.length);
      requests.push(`${request.method} ${route}`);
      const base = `http://${request.headers.host}${prefix}`;
      if (route === "/index-v1-nogeom.json") {
        response.writeHead(200, { "content-type": "application/json" }).end(standIn.index(base));
        return;
      }
      const latest = /^\/(.+)-latest\.osm\.pbf$/.exec(route);
      if (latest && files.has(latest[1]!)) {
        const elsewhere = files.get(latest[1]!)!.mirror ? base.replace("127.0.0.1", "localhost") : base;
        response.writeHead(302, { location: `${elsewhere}/${latest[1]}-${files.get(latest[1]!)!.latest ?? "261116"}.osm.pbf` }).end();
        return;
      }
      // The region's page, linking its dated files by relative addresses as Geofabrik's does.
      const page = /^\/(.+)\/$/.exec(route);
      if (page && files.has(page[1]!)) {
        const file = files.get(page[1]!)!;
        const name = file.path.split("/").at(-1);
        const links = (file.dated ?? ["261116"]).map(
          (day) =>
            `<tr><td><a href="../${name}-${day}.osm.pbf">${name}-${day}.osm.pbf</a></td><td><a href="../${name}-${day}.osm.pbf.md5">md5</a></td></tr>`,
        );
        response.writeHead(200, { "content-type": "text/html" }).end(`<html><body><table>${links.join("")}</table></body></html>`);
        return;
      }
      const dated = /^\/(.+)-(\d{6})\.osm\.pbf(\.md5)?$/.exec(route);
      const file = dated ? files.get(dated[1]!) : undefined;
      if (!dated || !file || !(file.dated ?? ["261116"]).includes(dated[2]!)) {
        response.writeHead(404).end();
        return;
      }
      if (dated[3]) {
        response.writeHead(200, { "content-type": "text/plain" }).end(`${file.md5}  ${file.path.split("/").at(-1)}-${dated[2]}.osm.pbf\n`);
        return;
      }
      const headers = {
        "content-type": "application/octet-stream",
        "last-modified": "Mon, 16 Nov 2026 21:00:00 GMT",
        etag: `"${file.md5}"`,
      };
      // "bytes=100-" to the end, or a bounded "bytes=100-199" (clipped to the file).
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
      if (request.headers.range) ranges.push(request.headers.range);
      const from = range ? Number(range[1]) : 0;
      const to = range?.[2] ? Math.min(Number(range[2]), file.body.length - 1) : file.body.length - 1;
      const body = file.body.subarray(from, to + 1);
      if (request.method === "HEAD") {
        response.writeHead(200, { ...headers, "content-length": String(file.claimedBytes ?? file.body.length) }).end();
        return;
      }
      response.writeHead(range ? 206 : 200, {
        ...headers,
        "content-length": String(body.length),
        ...(range ? { "content-range": `bytes ${from}-${to}/${file.body.length}` } : {}),
      });
      const slow = standIn.slow;
      if (!slow) {
        response.end(body);
        return;
      }
      let at = 0;
      const next = () => {
        if (response.destroyed) return;
        if (at >= body.length) return void response.end();
        response.write(body.subarray(at, at + slow.chunkBytes));
        at += slow.chunkBytes;
        setTimeout(next, slow.delayMs);
      };
      next();
    },
  };
  return standIn;
}

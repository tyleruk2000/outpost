/**
 * A stand-in for an Overpass API server, for tests. It is not Overpass: it does not
 * understand the question, it only recognises which of Outpost's three questions it
 * was asked and answers with the same made-up data every time, in the shape a real
 * server answers in. The places are invented; none of this is map data.
 *
 * Plain Node with no dependencies, so the end-to-end suite's file server can use it too.
 */
import type http from "node:http";
import { overpassFoodAnswer } from "../layers/food-stand-in.ts";

type LatLon = { lat: number; lon: number };
const at = (lat: number, lon: number): LatLon => ({ lat, lon });

// A made-up hillside. Each letter is a junction of the made-up route.
export const A = at(54.5, -3.1);
export const B = at(54.504, -3.1);
export const C = at(54.508, -3.097);
export const D = at(54.512, -3.097);
export const E = at(54.518, -3.094);
/** About 150 m beyond E: the route's ways do not meet here. */
export const F = at(54.5192, -3.0931);
export const G = at(54.523, -3.09);
/** A spur that leaves the route at D. */
export const H = at(54.512, -3.105);
/** The alternative leg from B to C goes round by X. */
export const X = at(54.506, -3.104);

const mid = (p: LatLon, q: LatLon): LatLon => at((p.lat + q.lat) / 2 + 0.0002, (p.lon + q.lon) / 2);

export const ROUTE_ID = 9001;
export const SECTIONED_ROUTE_ID = 9100;
export const ROUTE_NAME = "Kestrel Ridge Path";
export const PATH_NAME = "Heron Beck Track";
export const DATA_AS_OF = "2026-11-15T21:22:28Z";

const osm3s = { timestamp_osm_base: DATA_AS_OF, copyright: "Made-up data for tests. Not from OpenStreetMap." };
const boundsOf = (points: LatLon[]) => ({
  minlat: Math.min(...points.map((point) => point.lat)),
  minlon: Math.min(...points.map((point) => point.lon)),
  maxlat: Math.max(...points.map((point) => point.lat)),
  maxlon: Math.max(...points.map((point) => point.lon)),
});

const routeTags = {
  type: "route",
  route: "hiking",
  network: "lwn",
  name: ROUTE_NAME,
  "name:cy": "Llwybr Crib y Cudyll",
  from: "Kestrel Bridge",
  to: "The Cairn",
  // Tags Outpost has no use for, and one written to look like markup.
  website: "https://example.invalid/kestrel",
  note: "<script>alert(1)</script>",
};

/** The ways of the route, as its relation lists them: not in order, not all the same way round. */
const routeMembers = [
  { type: "node", ref: 1, role: "guidepost", lat: A.lat, lon: A.lon },
  { type: "way", ref: 11, role: "", geometry: [A, mid(A, B), B] },
  // Drawn from C back to B.
  { type: "way", ref: 12, role: "", geometry: [C, mid(B, C), B] },
  // Listed before the way that leads to it.
  { type: "way", ref: 14, role: "", geometry: [D, mid(D, E), E] },
  { type: "way", ref: 13, role: "", geometry: [C, mid(C, D), D] },
  // Does not meet E; and its last point is nowhere on Earth.
  { type: "way", ref: 15, role: "", geometry: [F, mid(F, G), G, { lat: 123.4, lon: -3.09 }] },
  // A spur from D.
  { type: "way", ref: 16, role: "", geometry: [D, mid(D, H), H] },
  { type: "way", ref: 17, role: "alternative", geometry: [B, X, C] },
  // A way the server sent no points for.
  { type: "way", ref: 19, role: "" },
];

export const relationAnswer = {
  version: 0.6,
  generator: "Outpost test stand-in",
  osm3s,
  elements: [{ type: "relation", id: ROUTE_ID, bounds: boundsOf([A, B, C, D, E, F, G, H, X]), tags: routeTags, members: routeMembers }],
};

/** A long route kept as sections: no ways of its own, two routes inside it. */
export const sectionedAnswer = {
  version: 0.6,
  osm3s,
  elements: [
    {
      type: "relation",
      id: SECTIONED_ROUTE_ID,
      tags: { type: "superroute", route: "hiking", network: "nwn", name: "Kestrel Way" },
      members: [
        { type: "relation", ref: ROUTE_ID, role: "" },
        { type: "relation", ref: 9002, role: "" },
      ],
    },
    { type: "relation", id: ROUTE_ID, bounds: boundsOf([A, G]), tags: routeTags },
    {
      type: "relation",
      id: 9002,
      bounds: boundsOf([G, at(54.6, -3.0)]),
      tags: { type: "route", route: "hiking", name: "Kestrel Way, northern section" },
    },
  ],
};

// A path that is only ways sharing a name. Three of them make one path (two touch, the
// third starts 80 m further on); a fourth with the same name is on another hill.
const P1 = at(54.45, -3.2);
const P2 = at(54.452, -3.2);
const P3 = at(54.454, -3.198);
const P4 = at(54.4547, -3.198);
const P5 = at(54.457, -3.196);
const FAR1 = at(54.4, -3.3);
const FAR2 = at(54.402, -3.3);
const pathTags = { highway: "path", name: PATH_NAME, surface: "gravel" };
export const pathWays = [
  // Sent in an order of the server's own: by number, which is not the order they are walked.
  { type: "way", id: 21, bounds: boundsOf([P2, P3]), tags: pathTags, geometry: [P3, P2] },
  { type: "way", id: 22, bounds: boundsOf([P1, P2]), tags: pathTags, geometry: [P1, P2] },
  { type: "way", id: 23, bounds: boundsOf([P4, P5]), tags: pathTags, geometry: [P4, P5] },
  { type: "way", id: 24, bounds: boundsOf([FAR1, FAR2]), tags: { ...pathTags, highway: "track" }, geometry: [FAR1, FAR2] },
];
/** Ways named like the route, lying along it: the route is listed once, not twice. */
const routeNamedWay = { type: "way", id: 12, bounds: boundsOf([B, C]), tags: { highway: "path", name: ROUTE_NAME }, geometry: [C, B] };

export const searchAnswer = {
  version: 0.6,
  osm3s,
  elements: [
    { type: "relation", id: ROUTE_ID, bounds: boundsOf([A, B, C, D, E, F, G, H, X]), tags: routeTags },
    {
      type: "relation",
      id: 9003,
      bounds: boundsOf([at(54.3, -3.4), at(54.7, -2.9)]),
      tags: { type: "route", route: "bicycle", network: "rcn", name: "Kestrel Valley Cycleway", ref: "7" },
    },
    { type: "length", id: ROUTE_ID, tags: { m: "3412.6" } },
    { type: "length", id: 9003, tags: { m: "48211.02" } },
    // Things a server should not send, each of which must be passed over.
    { type: "relation", id: -5, tags: { name: "A relation with an impossible number" } },
    { type: "area", id: 77, tags: { name: "Not something that was asked for" } },
    "not an element at all",
    ...pathWays,
    routeNamedWay,
  ],
};

export const waysAnswer = (ids: number[]) => ({
  version: 0.6,
  osm3s,
  elements: pathWays.filter((way) => ids.includes(way.id)),
});

/** One relation with more points than Outpost adds as a single route. */
export function hugeAnswer(points: number) {
  const geometry = Array.from({ length: points }, (_unused, index) => at(54 + index * 0.000001, -3));
  return {
    version: 0.6,
    osm3s,
    elements: [
      {
        type: "relation",
        id: 9500,
        tags: { type: "route", route: "hiking", name: "The Endless Way" },
        members: [{ type: "way", ref: 1, role: "", geometry }],
      },
    ],
  };
}

export interface OverpassRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  /** The question, decoded from the form body. */
  query: string;
}

export interface OverpassStandIn {
  /** Every request received, in order. */
  requests: OverpassRequest[];
  handle(request: http.IncomingMessage, response: http.ServerResponse): void;
}

/**
 * Answers Outpost's questions. A relation number or a word in the search decides how:
 *
 *   relation 9001          the made-up route        relation 9100   a route kept as sections
 *   relation 9500          a route too large to add relation 9404   no such route
 *   name "slow"            answers after `slowMs`   name "busy"     HTTP 429
 *   name "broken"          a web page, not JSON     name "moved"    a redirect
 *   name "gaveup"          Overpass's own "timed out" remark
 */
export function createOverpassStandIn(options: { slowMs?: number; hugePoints?: number } = {}): OverpassStandIn {
  const requests: OverpassRequest[] = [];
  return {
    requests,
    handle(request, response) {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const query = new URLSearchParams(Buffer.concat(chunks).toString("utf8")).get("data") ?? "";
        requests.push({ method: request.method ?? "", path: request.url ?? "", headers: request.headers, query });
        const json = (body: unknown, status = 200) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(body));
        };
        if (request.url?.endsWith("/elsewhere")) return json({ elements: [], reached: "a host that was never named" });
        if (request.method !== "POST") return json({ error: "Outpost asks with POST" }, 405);
        // The food and supplies layer's question is answered with real data for Keswick (layers/food-stand-in.ts).
        if (query.includes('["social_facility"="food_bank"]')) return json(overpassFoodAnswer(query));
        if (/"busy"/.test(query)) {
          response.writeHead(429, { "content-type": "text/plain" });
          return response.end("Too many requests");
        }
        if (/"broken"/.test(query)) {
          response.writeHead(200, { "content-type": "text/html" });
          return response.end("<html><body>The server is being looked after. Back soon.</body></html>");
        }
        if (/"moved"/.test(query)) {
          response.writeHead(302, { location: "/overpass/elsewhere" });
          return response.end();
        }
        if (/"gaveup"/.test(query))
          return json({
            version: 0.6,
            osm3s,
            elements: [],
            remark: 'runtime error: Query timed out in "query" at line 2 after 26 seconds.',
          });
        if (/"slow"/.test(query)) return void setTimeout(() => json(searchAnswer), options.slowMs ?? 1500);
        if (query.includes(`relation(${ROUTE_ID})`)) return json(relationAnswer);
        if (query.includes(`relation(${SECTIONED_ROUTE_ID})`)) return json(sectionedAnswer);
        if (query.includes("relation(9500)")) return json(hugeAnswer(options.hugePoints ?? 200_001));
        if (query.includes("relation(9404)")) return json({ version: 0.6, osm3s, elements: [] });
        const wayIds = /way\(id:([\d,]+)\)/.exec(query)?.[1];
        if (wayIds) return json(waysAnswer(wayIds.split(",").map(Number)));
        if (query.includes("->.routes")) return json(searchAnswer);
        return json({ error: "The stand-in does not know that question" }, 400);
      });
    },
  };
}

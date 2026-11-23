/**
 * Planning a road route: join each point to the network, find the quickest path from
 * each to the next with the crossing asked for, and write the directions. Works from
 * the graph in memory alone.
 */
import type {
  RoadCrossingOnRoute,
  RoadDataCredit,
  RoadDistanceUnit,
  RoadLeg,
  RoadRouteRequest,
  RoadRouteResult,
  RoadSnappedPoint,
} from "@outpost/shared";
import { roadDistanceText, countryAt as smallestBoxAt } from "@outpost/shared";
import { AppError } from "../../core/errors.ts";
import { COUNTRIES, countryOf } from "../layers/countries.ts";
import { OSM_CREDIT } from "../maps/route-finder/sources.ts";
import { simplifyIndices } from "./build.ts";
import { countryOfPoint } from "./countries.ts";
import { buildDirections, type CountryLookup } from "./directions.ts";
import { edgeShape, type Graph, type GraphNetwork, meters } from "./graph.ts";
import { chooseJoins, crossingFilter, quickestPath, SNAP_WITHIN_M, type SnapCandidate, type Step, snapCandidates } from "./route.ts";

/** A join further than this from the point asked is said in the warnings. */
const FAR_JOIN_M = 5_000;
/** Data older than this is said to be old. */
const OLD_DATA_MS = 365 * 86_400_000;
const GEOMETRY_TOLERANCE_M = 25;

export interface PlanPoint {
  lat: number;
  lon: number;
  name: string | null;
}

/** Which country a point is in: by Natural Earth's outlines, else the network's own country, else the smallest box that holds it. */
export const countryLookup: CountryLookup = (lat, lon, hint) => countryOfPoint(lat, lon) ?? hint ?? smallestBoxAt({ lat, lon }, COUNTRIES);

const countryName = (code: string | null) => (code ? (countryOf(code)?.name ?? code) : null);

function pointWords(point: PlanPoint, index: number, count: number): string {
  if (point.name) return `“${point.name}”`;
  if (index === 0) return "the start";
  if (index === count - 1) return "the end";
  return `via point ${index}`;
}

/** Countries a straight line between two points passes over that have no network installed. */
function missingBetween(graph: Graph, a: PlanPoint, b: PlanPoint): string[] {
  const installed = new Set(graph.networks.map((n) => n.country).filter(Boolean));
  const out: string[] = [];
  const steps = Math.max(2, Math.ceil(meters(a.lat, a.lon, b.lat, b.lon) / 20_000));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const code = countryLookup(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t, null);
    if (code && !installed.has(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

const listWords = (words: string[]) => (words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

export function roadCredit(networks: GraphNetwork[]): RoadDataCredit {
  const dates = [...new Set(networks.map((n) => n.dataDate).filter((d): d is string => Boolean(d)))].sort();
  const when = dates.length === 0 ? "" : dates.length === 1 ? ` as of ${dates[0]}` : ` as of ${dates[0]} to ${dates.at(-1)}`;
  return {
    attribution: OSM_CREDIT.attribution,
    license: OSM_CREDIT.license,
    licenseUrl: OSM_CREDIT.licenseUrl,
    url: OSM_CREDIT.url,
    line: `Road data ${OSM_CREDIT.attribution}, ${OSM_CREDIT.license}${when}, from Geofabrik's extracts: ${OSM_CREDIT.url}`,
  };
}

export function planRoute(
  graph: Graph,
  points: PlanPoint[],
  options: { crossing: string; units: RoadDistanceUnit; request: RoadRouteRequest; now?: number },
): RoadRouteResult {
  const { crossing, units } = options;
  const warnings: string[] = [];
  if (graph.nodeCount === 0)
    throw new AppError("bad_request", "No road network is installed. Install the country or region you are driving in from Road networks.");

  // Join each point.
  const candidates: SnapCandidate[][] = points.map((point) => snapCandidates(graph, point.lat, point.lon));
  const lost = points.map((point, index) => ({ point, index })).filter(({ index }) => candidates[index]!.length === 0);
  if (lost.length > 0) {
    const installed = new Set(graph.networks.map((n) => n.country));
    const sentences = lost.map(({ point, index }) => {
      const code = countryLookup(point.lat, point.lon, null);
      const where = pointWords(point, index, points.length);
      if (code && !installed.has(code))
        return `No road network is installed for ${countryName(code)}, where ${where} is: install it from Road networks.`;
      return `${where.charAt(0).toUpperCase()}${where.slice(1)} is more than ${roadDistanceText(SNAP_WITHIN_M, units)} from a main road in the networks installed${code ? ` (${countryName(code)})` : ""}.`;
    });
    throw new AppError("bad_request", sentences.join(" "));
  }
  const joins = chooseJoins(graph, candidates);
  if (!joins) {
    const missing = new Set<string>();
    for (let i = 0; i + 1 < points.length; i += 1) for (const code of missingBetween(graph, points[i]!, points[i + 1]!)) missing.add(code);
    const names = [...missing].map((code) => countryName(code)!);
    throw new AppError(
      "bad_request",
      names.length > 0
        ? `The road networks installed do not join these points. The way between runs through ${listWords(names)}, which ${names.length === 1 ? "has" : "have"} no network installed.`
        : "The road networks installed do not join these points: a country or region between them is missing, or a sea crossing reaches only one side.",
    );
  }

  // The quickest path from each point to the next.
  const allowed = crossingFilter(graph, crossing);
  const segments: Array<{ steps: Step[] }> = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = joins[i]!.node;
    const b = joins[i + 1]!.node;
    if (a === b) {
      segments.push({ steps: [] });
      continue;
    }
    const found = quickestPath(graph, a, b, allowed);
    if (!found) {
      const anyWay = crossing !== "any" ? quickestPath(graph, a, b, () => true) : null;
      if (anyWay) {
        const chosen =
          crossing === "eurotunnel"
            ? "the Channel Tunnel shuttle"
            : (graph.crossings.find((c) => c.id === crossing)?.name ?? "the crossing chosen");
        throw new AppError(
          "bad_request",
          `There is no way by ${chosen} with the networks installed: it does not reach both sides. Choose another crossing or let Outpost choose.`,
        );
      }
      const words = `${pointWords(points[i]!, i, points.length)} and ${pointWords(points[i + 1]!, i + 1, points.length)}`;
      throw new AppError(
        "bad_request",
        `No road route joins ${words} with the networks installed (one-way roads or a missing piece between them).`,
      );
    }
    segments.push({ steps: found.steps });
  }

  // Where each point joined.
  const snapped: RoadSnappedPoint[] = points.map((point, index) => {
    const join = joins[index]!;
    const node = join.node;
    let road: string | null = null;
    for (let i = graph.offsets[node]!; i < graph.offsets[node + 1]! && !road; i += 1) {
      const edge = graph.adjacency[i]! >>> 1;
      road = (graph.strings[graph.ref[edge]!] ?? "").split(";")[0] || graph.strings[graph.name[edge]!] || null;
    }
    const country = countryLookup(graph.lat[node]!, graph.lon[node]!, graph.networks[graph.nodeNetwork[node]!]?.country ?? null);
    if (join.distanceM > FAR_JOIN_M)
      warnings.push(
        `${pointWords(point, index, points.length).replace(/^t/, "T")} is ${roadDistanceText(join.distanceM, units)} in a straight line from the nearest main road the networks hold; the directions ${index === 0 ? "start" : "pass"} there.`,
      );
    return {
      input: { lat: point.lat, lon: point.lon, name: point.name },
      lat: graph.lat[node]!,
      lon: graph.lon[node]!,
      distanceM: Math.round(join.distanceM),
      road,
      country,
    };
  });

  const legs: RoadLeg[] = buildDirections({
    graph,
    segments,
    viaNames: points.slice(1, -1).map((p) => p.name),
    units,
    country: countryLookup,
    snapDistances: joins.map((j) => Math.round(j!.distanceM)),
  });

  // Geometry: each segment as one simplified line.
  const coordinates: Array<Array<[number, number]>> = [];
  for (const segment of segments) {
    const line: Array<[number, number]> = [];
    for (const step of segment.steps) {
      const shape = edgeShape(graph, step.edge, step.backward);
      line.push(...(line.length > 0 ? shape.slice(1) : shape));
    }
    if (line.length < 2) continue;
    const flat: number[] = [];
    for (const [lon, lat] of line) flat.push(Math.round(lat * 1e7), Math.round(lon * 1e7));
    const keep = simplifyIndices(flat, GEOMETRY_TOLERANCE_M);
    coordinates.push(keep.map((i) => [Math.round(line[i]![0] * 1e5) / 1e5, Math.round(line[i]![1] * 1e5) / 1e5]));
  }

  const crossings: RoadCrossingOnRoute[] = legs.filter((leg) => leg.crossing).map((leg) => leg.crossing!);
  if (crossing !== "any") {
    const chosenKey = crossing === "eurotunnel" ? "eurotunnel" : graph.crossings.find((c) => c.id === crossing)?.key;
    const used = crossings.some(
      (c) => (c.kind === "shuttle" ? "eurotunnel" : graph.crossings.find((g) => g.id === c.id)?.key) === chosenKey,
    );
    if (!used) warnings.push("The route does not use the crossing chosen: it needs no sea crossing, or none of its way is by that one.");
  }
  if (crossings.length > 0)
    warnings.push("Crossings are booked and timetabled: book ahead, and allow for check-in and waiting, which the time does not include.");
  const now = options.now ?? Date.now();
  for (const network of graph.networks) {
    if (network.dataDate && now - Date.parse(network.dataDate) > OLD_DATA_MS)
      warnings.push(
        `The road data for ${network.name} is from ${network.dataDate}: roads may have changed since. Update it from Road networks.`,
      );
  }

  const countries: string[] = [];
  for (const leg of legs) for (const c of leg.countries) if (!countries.includes(c)) countries.push(c);
  const used = new Set<number>();
  for (const segment of segments) for (const step of segment.steps) if (graph.network[step.edge]! >= 0) used.add(graph.network[step.edge]!);
  return {
    legs,
    summary: {
      distanceM: legs.reduce((sum, leg) => sum + leg.distanceM, 0),
      durationS: legs.reduce((sum, leg) => sum + leg.durationS, 0),
      countries,
      crossings,
    },
    geometry: { type: "MultiLineString", coordinates },
    snapped,
    warnings,
    credit: roadCredit(graph.networks),
    request: options.request,
    plannedAt: now,
    networks: [...used]
      .sort((a, b) => a - b)
      .map((s) => ({ id: graph.networks[s]!.id, name: graph.networks[s]!.name, dataDate: graph.networks[s]!.dataDate })),
  };
}

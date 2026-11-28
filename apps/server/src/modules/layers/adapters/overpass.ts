/**
 * OpenStreetMap by tag query, through a public Overpass API server whose operator allows
 * an application to ask, or through one the person declares. One layer of one country
 * (or one box) per question; questions go one at a time, paced (query-fetcher.ts).
 *
 * The servers are those of the route finder (`catalog/route-sources.json` and a
 * person's own file), less those whose terms rule this use out: Private.coffee's terms
 * exclude "projects related to warfare, military applications". A shipped server is
 * used only where its declared box holds the whole area asked about.
 */
import fs from "node:fs";
import type { Bbox, ReferenceEstimateItem, ReferenceEstimateRequest } from "@outpost/shared";
import { AppError } from "../../../core/errors.ts";
import type { HttpClient } from "../../../core/http.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { loadRouteSources, type RouteSource } from "../../maps/route-finder/sources.ts";
import { countryOf } from "../countries.ts";
import { PROVIDERS } from "../providers.ts";
import { QUERY_FETCHER, type QuerySpec } from "../query-fetcher.ts";
import type { AdapterDeps, ReferenceAdapter } from "../types.ts";
import { REFERENCE_USER_AGENT } from "./http.ts";
import { addOsm } from "./osm-read.ts";
import { OSM_LAYERS, type OsmLayer, OVERPASS_LAYERS, overpassFilters } from "./osm-tags.ts";

/** Servers not asked for reference layers, and why. */
export const EXCLUDED_SOURCES: Record<string, string> = {
  "private-coffee": "Its terms of use exclude projects related to warfare and military applications.",
};
const TIMEOUT = 25;
const MAX_ANSWER_BYTES = 96 * 1048576;
/**
 * Food and supplies is asked for an area about a county across at most (Devon is about
 * 1.6° by 1°), never a country: a country's shops, taps and fuel stations is more than a
 * public server should be asked for at once. Within that, an area that counts more than
 * this many places is refused too (a large city), and should be fetched in parts.
 */
export const FOOD_MAX_BOX = { lat: 1.5, lon: 2 } as const;
export const FOOD_MAX_RECORDS = 30_000;
/** Why food and supplies cannot be asked for in this area, or null. */
export function foodAreaRefusal(countries: string[], bbox: Bbox | null | undefined): string | null {
  if (countries.length > 0 || !bbox)
    return "Food and supplies are fetched for the area on screen, up to about a county across, not for a whole country: that is more than a public server should be asked for at once. Move the map to your area, choose “The area on screen” and try again.";
  if (bbox[3] - bbox[1] > FOOD_MAX_BOX.lat || bbox[2] - bbox[0] > FOOD_MAX_BOX.lon)
    return `The area on screen is too large to ask a public server for its shops (at most ${FOOD_MAX_BOX.lat}° north to south and ${FOOD_MAX_BOX.lon}° east to west, about a county). Zoom in and try again; several areas can be kept side by side.`;
  return null;
}
/** Rough sizes of one object in an answer, for the estimate: a node, a way with its points, a relation's centre. */
const BYTES = { nodes: 350, ways: 2_500, relations: 600 };

const provider = PROVIDERS.find((entry) => entry.id === "osm")!;

const coordinate = (value: number) => (Math.round(value * 1e5) / 1e5).toFixed(5);

/** Where the question is about: a country by its ISO code, or a box. */
function areaOf(country: string | null, bbox: Bbox | null): { prelude: string; filter: string } {
  if (country) return { prelude: `area["ISO3166-1"="${country}"][admin_level=2]->.a;`, filter: "(area.a)" };
  const [west, south, east, north] = bbox!;
  return { prelude: "", filter: `(${coordinate(south)},${coordinate(west)},${coordinate(north)},${coordinate(east)})` };
}

export function overpassDataQuery(layer: OsmLayer, country: string | null, bbox: Bbox | null): string {
  const area = areaOf(country, bbox);
  return [
    `[out:json][timeout:${TIMEOUT}][maxsize:${MAX_ANSWER_BYTES * 2}];`,
    area.prelude,
    `(${overpassFilters(layer)
      .map((filter) => `nwr${filter}${area.filter};`)
      .join(" ")})->.r;`,
    "way.r; out geom;",
    "node.r; out;",
    "rel.r; out center;",
  ]
    .filter(Boolean)
    .join("\n");
}

export function overpassCountQuery(parts: Array<{ layer: OsmLayer; country: string | null; bbox: Bbox | null }>): string {
  const lines = [`[out:json][timeout:${TIMEOUT}];`];
  parts.forEach((part, index) => {
    const area = areaOf(part.country, part.bbox);
    if (area.prelude) lines.push(area.prelude);
    lines.push(
      `(${overpassFilters(part.layer)
        .map((filter) => `nwr${filter}${area.filter};`)
        .join(" ")})->.c${index};`,
      `.c${index} out count;`,
    );
  });
  return lines.join("\n");
}

/** The servers that may be asked about a box, best first: a regional one that holds it, then one of the person's own with no box. */
export function sourcesFor(sources: RouteSource[], box: Bbox): RouteSource[] {
  const usable = sources.filter((source) => !EXCLUDED_SOURCES[source.id]);
  const holds = (outer: Bbox) => box[0] >= outer[0] && box[1] >= outer[1] && box[2] <= outer[2] && box[3] <= outer[3];
  return [...usable.filter((source) => source.bbox && holds(source.bbox)), ...usable.filter((source) => !source.bbox)];
}

interface Part {
  layer: OsmLayer;
  country: string | null;
  bbox: Bbox;
  key: string;
}

function partsOf(request: ReferenceEstimateRequest): Part[] {
  const layers = (request.layers?.length ? request.layers : OSM_LAYERS).filter((layer): layer is OsmLayer =>
    (OVERPASS_LAYERS as string[]).includes(layer),
  );
  const countries = request.scope.countries ?? [];
  if (countries.length > 10) throw new AppError("bad_request", "Choose at most ten countries at a time.");
  if (layers.includes("food")) {
    const refusal = foodAreaRefusal(countries, request.scope.bbox);
    if (refusal) throw new AppError("bad_request", refusal);
  }
  const parts: Part[] = [];
  for (const layer of layers) {
    if (countries.length > 0) {
      for (const code of countries) {
        const country = countryOf(code);
        if (!country) throw new AppError("bad_request", `${code} is not a country Outpost knows.`);
        parts.push({ layer, country: country.code, bbox: country.bbox, key: `osm:${layer}:${country.code}` });
      }
    } else if (request.scope.bbox) {
      const box = request.scope.bbox;
      if ((box[2] - box[0]) * (box[3] - box[1]) > 400) {
        throw new AppError(
          "bad_request",
          "That box is too large to ask a public server about. Draw a smaller one (up to about 20 by 20 degrees), or choose a country.",
        );
      }
      parts.push({ layer, country: null, bbox: box, key: `osm:${layer}:${box.map((value) => value.toFixed(3)).join(",")}` });
    }
  }
  if (parts.length === 0) throw new AppError("bad_request", "Choose a country or draw a box on the map.");
  return parts;
}

const LAYER_TITLES: Record<OsmLayer, string> = {
  military: "Military sites",
  nuclear: "Nuclear facilities",
  hospitals: "Hospitals",
  emergency: "Police, fire and ambulance stations",
  shelters: "Shelters and assembly points",
  food: "Food and supplies",
  routes: "Walking and cycling routes",
  "rights-of-way": "Rights of way",
};

export function createOverpassAdapter({ ctx, client }: AdapterDeps): ReferenceAdapter {
  const sources = () => loadRouteSources(ctx.config).sources;
  const pick = (parts: Part[]): RouteSource => {
    const box: Bbox = [
      Math.min(...parts.map((part) => part.bbox[0])),
      Math.min(...parts.map((part) => part.bbox[1])),
      Math.max(...parts.map((part) => part.bbox[2])),
      Math.max(...parts.map((part) => part.bbox[3])),
    ];
    const found = sourcesFor(sources(), box)[0];
    if (!found) {
      throw new AppError(
        "bad_request",
        "No public Overpass server whose terms allow this covers that area: the ones Outpost uses cover Europe and North America. Add the country's nearby places on Offline maps instead (read from its source file), or declare an Overpass server of your own in route-sources.json.",
      );
    }
    return found;
  };

  return {
    provider,
    async estimate(request, signal) {
      const parts = partsOf(request);
      const source = pick(parts);
      const body = await ask(client, source, overpassCountQuery(parts), signal);
      const counts = ((body as { elements?: unknown[] }).elements ?? []).filter(
        (element): element is { type: "count"; tags: Record<string, string> } => (element as { type?: unknown }).type === "count",
      );
      if (counts.length !== parts.length)
        throw new AppError("upstream", `${source.host} did not count every layer. Try again in a little while.`);
      parts.forEach((part, index) => {
        if (part.layer !== "food") return;
        const tags = counts[index]!.tags;
        const total = (Number(tags.nodes) || 0) + (Number(tags.ways) || 0) + (Number(tags.relations) || 0);
        if (total > FOOD_MAX_RECORDS)
          throw new AppError(
            "bad_request",
            `${source.host} counted ${total.toLocaleString("en-GB")} shops and other places in that area, more than the ${FOOD_MAX_RECORDS.toLocaleString("en-GB")} Outpost asks for at once. Zoom in and fetch it in parts.`,
          );
      });
      const items: ReferenceEstimateItem[] = parts.map((part, index) => {
        const tags = counts[index]!.tags;
        const nodes = Number(tags.nodes) || 0;
        const ways = Number(tags.ways) || 0;
        const relations = Number(tags.relations) || 0;
        return {
          key: part.key,
          title: `${LAYER_TITLES[part.layer]}: ${part.country ? (countryOf(part.country)?.name ?? part.country) : "the box drawn"} (OpenStreetMap)`,
          layers: [part.layer],
          bytes: Math.max(1_000, nodes * BYTES.nodes + ways * BYTES.ways + relations * BYTES.relations),
          exact: false,
          basis: `Worked out from what ${source.host} counted: ${nodes} points, ${ways} lines or outlines and ${relations} areas of several parts.`,
          records: nodes + ways + relations,
          host: source.host,
          replaces: null,
        };
      });
      return {
        items,
        notes: [
          `Asked of ${source.name} (${source.host}), run by ${source.operator}. One layer at a time, with a pause between.`,
          "What OpenStreetMap contributors have mapped: incomplete, and in some countries deliberately not mapped.",
        ],
      };
    },
    download(request, item) {
      const part = partsOf(request).find((entry) => entry.key === item.key);
      if (!part) throw new AppError("bad_request", "That item is not part of this request any more. Estimate again.");
      const source = pick([part]);
      const query: QuerySpec = {
        method: "POST",
        url: source.endpoint,
        body: `data=${encodeURIComponent(overpassDataQuery(part.layer, part.country, part.country ? null : part.bbox))}`,
        accept: "application/json",
        maxBytes: MAX_ANSWER_BYTES,
      };
      const where = part.country?.toLowerCase() ?? "box";
      return {
        url: source.endpoint,
        fetcher: QUERY_FETCHER,
        // To the thousandth of a second, so that an update, or a second box, on the same day is a file of its own.
        relPath: `collections/reference/osm/${part.layer}-${where}-${new Date().toISOString().slice(0, 23).replace(/[:.]/g, "-")}.json`,
        sizeBytes: item.bytes,
        allowedHosts: [source.allowHost],
        meta: {
          sourceUrl: "https://www.openstreetmap.org/copyright",
          countries: part.country ? [part.country] : [],
          bbox: part.bbox,
          layers: [part.layer],
          query,
        } as never,
      };
    },
    async read({ filePath, meta, sink }) {
      let body: { elements?: unknown[]; remark?: unknown; osm3s?: { timestamp_osm_base?: unknown } };
      try {
        body = JSON.parse(await fs.promises.readFile(filePath, "utf8")) as typeof body;
      } catch {
        throw new PermanentJobError("The answer from the Overpass server is not JSON. Remove the download and try again.");
      }
      if (typeof body.remark === "string" && /timed out|out of memory|runtime error/i.test(body.remark)) {
        throw new PermanentJobError(
          `The Overpass server gave up on the question (${body.remark.slice(0, 120)}). Try a smaller area, or add the country's nearby places on Offline maps.`,
        );
      }
      if (!Array.isArray(body.elements)) throw new PermanentJobError("The answer from the Overpass server holds no map data.");
      const stamp = typeof body.osm3s?.timestamp_osm_base === "string" ? body.osm3s.timestamp_osm_base.slice(0, 10) : null;
      const layers = new Set(meta.layers.filter((layer): layer is OsmLayer => (OVERPASS_LAYERS as string[]).includes(layer)));
      const country = meta.countries.length === 1 ? meta.countries[0]! : null;
      for (const raw of body.elements) {
        const element = raw as {
          type?: unknown;
          id?: unknown;
          tags?: Record<string, unknown>;
          lat?: unknown;
          lon?: unknown;
          center?: { lat?: unknown; lon?: unknown };
          geometry?: Array<{ lat?: unknown; lon?: unknown }>;
        };
        if ((element.type !== "node" && element.type !== "way" && element.type !== "relation") || typeof element.id !== "number") continue;
        const tags: Record<string, string> = {};
        for (const [key, value] of Object.entries(element.tags ?? {})) if (typeof value === "string") tags[key] = value;
        let points: Array<[number, number]> | undefined;
        if (element.type === "way" && Array.isArray(element.geometry)) {
          points = element.geometry
            .filter((point) => typeof point?.lat === "number" && typeof point?.lon === "number")
            .map((point) => [point.lon as number, point.lat as number]);
        }
        const at =
          element.type === "node"
            ? { lat: element.lat, lon: element.lon }
            : element.type === "relation"
              ? element.center
              : points && points.length > 0
                ? (() => {
                    const xs = points.map((point) => point[0]);
                    const ys = points.map((point) => point[1]);
                    return { lon: (Math.min(...xs) + Math.max(...xs)) / 2, lat: (Math.min(...ys) + Math.max(...ys)) / 2 };
                  })()
                : undefined;
        const lat = Number(at?.lat);
        const lon = Number(at?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          sink.skip(`${element.type}/${element.id} has no usable position.`);
          continue;
        }
        await addOsm(
          sink,
          { type: element.type, id: element.id, tags, lat, lon, points },
          { layers, country, publishedAt: stamp ? `Map data as of ${stamp}` : null },
        );
      }
      return { version: stamp, publishedAt: stamp, countries: meta.countries, bbox: meta.bbox };
    },
  };
}

/** Posts a small question (a count) and reads the answer; for estimates. */
async function ask(client: HttpClient, source: RouteSource, query: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const { response } = await client.fetch(source.endpoint, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        accept: "application/json",
        "user-agent": REFERENCE_USER_AGENT,
      },
      allowedHosts: [source.allowHost],
      everyHop: true,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(29_000)]) : AbortSignal.timeout(29_000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AppError("upstream", `${source.host} could not count (HTTP ${response.status}). It may be busy: try again in a minute.`);
    }
    const text = await response.text();
    if (text.length > 1_000_000) throw new AppError("upstream", `${source.host} sent far more than a count.`);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "upstream",
      `Outpost could not get an answer from ${source.host}. Estimating needs an internet connection; what is installed works without one.`,
    );
  }
}

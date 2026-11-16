/**
 * Finding a route in a route source and adding it to the map.
 *
 * Three steps, each one request made because a person pressed a button:
 *
 *  1. Search: by name, by the map view, or both. The answer is a short list.
 *  2. Preview: the one route chosen is fetched with its points and joined into lines
 *     (see `assemble.ts`). It is held in memory for a few minutes, so that adding it
 *     does not ask the source a second time. It is not written anywhere.
 *  3. Add: the held route is saved as a track like any other, with heights from
 *     installed terrain and with the credit it must keep.
 *
 * Nothing is fetched in the background, nothing is refreshed, and a route that is not
 * added is forgotten.
 */
import { randomUUID } from "node:crypto";
import {
  type Bbox,
  type FoundRouteRef,
  MARKER_COLORS,
  ownValue,
  pickRouteSource,
  ROUTE_SEARCH_MAX_SPAN,
  ROUTE_SEARCH_MAX_TEXT,
  ROUTE_SEARCH_MIN_TEXT,
  type RouteElevation,
  type RouteKind,
  type RouteLine,
  type RouteNetwork,
  type RoutePreview,
  type RouteSaveResponse,
  type RouteSearchResponse,
  type RouteSearchResult,
  type RouteSourcesResponse,
  readTrackSource,
  type TrackSource,
} from "@outpost/shared";
import type { Position } from "geojson";
import { z } from "zod";
import { AppError, badRequest } from "../../../core/errors.ts";
import type { AnnotationsService } from "../annotations.ts";
import type { ElevationSampler } from "../elevation.ts";
import type { TrackCollection, TrackFeature } from "../gpx.ts";
import { arrangeLines, clusterLines, describeLines, joinWays, lengthOf, type Point } from "./assemble.ts";
import { buildTrackSource, creditLine } from "./credit.ts";
import {
  type AnswerLimits,
  AnswerTooLarge,
  cleanText,
  namePattern,
  type OsmRelation,
  type OsmWay,
  type OverpassClient,
  readAnswer,
  relationQuery,
  searchQuery,
  waysQuery,
} from "./overpass.ts";
import { type LoadedRouteSources, type RouteSource, toSourceDto } from "./sources.ts";

// ── Limits ──────────────────────────────────────────────────────────────────
// A search answer is a list of names and boxes; a preview is one route's points. Both
// are capped before they are read and again as they are read.

/** Routes listed by one search. */
export const MAX_RESULTS = 40;
/** Ways read when looking for named paths in a view; the paths found are listed after the routes. */
export const MAX_PATH_WAYS = 400;
export const MAX_PATH_RESULTS = 20;
export const MAX_SEARCH_BYTES = 6 * 1024 * 1024;
/** One route may be this large and no larger: about 2,000 km of path. */
export const MAX_ROUTE_WAYS = 10_000;
export const MAX_ROUTE_POINTS = 200_000;
export const MAX_ROUTE_BYTES = 24 * 1024 * 1024;
/** Sections of a long route listed in its preview. */
export const MAX_SECTIONS = 100;
/** Ways with the same name whose ends are this near belong to one path; farther apart, they are two paths. */
const PATH_CLUSTER_METERS = 300;
/**
 * Previews are held so that "Add" need not ask the source again, for this long. The
 * screen offers "Add" for every preview it fetched in that time (stepping through the
 * sections of a long trail and back again), so all of them are held, up to a bound on
 * memory: a held point takes about 73 bytes (measured on Node 24, 16 November 2026: a
 * route of 190,001 points held 13.9 MB), so the largest route allowed is some 15 MB
 * and the most that is ever held, three of those, some 44 MB. Sections of a trail are
 * a few thousand points each. The oldest are let go first when there is no more room.
 */
const PREVIEW_HOLD_MS = 15 * 60_000;
export const MAX_HELD_POINTS = 3 * MAX_ROUTE_POINTS;
/** More than a person can step through in the time, whatever their size: a route lists at most 100 sections. */
const MAX_HELD_PREVIEWS = 200;
/** Heights are read at about this spacing on a long route, so it never touches thousands of terrain tiles. */
const HEIGHT_SAMPLES = 20_000;

const NOT_HELD = "That preview is no longer held. Choose the route again to fetch it afresh, then add it.";
const TOO_LARGE_SEARCH =
  "That search matched more than Outpost will read in one go. Add more of the name, or zoom in and search the map view.";
const tooLargeRoute = (name: string) =>
  `${name} is too large to add in one piece: Outpost adds a route of up to ${MAX_ROUTE_WAYS.toLocaleString("en-GB")} ways and ${MAX_ROUTE_POINTS.toLocaleString("en-GB")} points, about 2,000 km. Long trails are usually also mapped section by section: search for a section by name, or zoom in to where you will walk and search that view.`;

// ── What a request may say ──────────────────────────────────────────────────

const sourceId = z.string().max(60).optional();
const bboxSchema = z
  .tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ])
  .refine(([west, south, east, north]) => west < east && south < north, "The map view is given as [west, south, east, north].");
const osmId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const routeSearchSchema = z
  .object({
    sourceId,
    text: z.string().max(200).optional(),
    bbox: bboxSchema.optional(),
  })
  .refine((value) => Boolean(value.text?.trim()) || value.bbox, "Type part of a route's name, or search the map view.");

const refSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("relation"), id: osmId }),
  z.object({ type: z.literal("ways"), ids: z.array(osmId).min(1).max(MAX_PATH_WAYS) }),
]);
export const routePreviewSchema = z.object({ sourceId, ref: refSchema });

export const routeAddSchema = z.object({
  token: z.string().min(1).max(64),
  name: z.string().trim().min(1, "Give the route a name.").max(200).optional(),
  color: z.enum(MARKER_COLORS).optional(),
  includeAlternatives: z.boolean().optional(),
});

// ── Reading tags ────────────────────────────────────────────────────────────

const KINDS: Record<string, RouteKind> = {
  hiking: "walking",
  foot: "walking",
  walking: "walking",
  running: "running",
  bicycle: "cycling",
  mtb: "mountain-biking",
  horse: "riding",
};
const NETWORKS: Record<string, RouteNetwork> = { l: "local", r: "regional", n: "national", i: "international" };
/** Roles OpenStreetMap gives to legs that are not the route itself. */
const SIDE_ROLES = new Set([
  "alternative",
  "alternate",
  "alternation",
  "variant",
  "excursion",
  "approach",
  "connection",
  "shortcut",
  "detour",
]);

function networkOf(tags: Record<string, string>): RouteNetwork | null {
  const match = /^([lrni])[wch]n$/.exec(tags.network ?? "");
  return match ? NETWORKS[match[1]!]! : null;
}

function namesOf(tags: Record<string, string>, pattern: RegExp | null): { name: string; otherNames: string[] } {
  const name = tags.name ?? tags["name:en"] ?? (tags.ref ? `Route ${tags.ref}` : "Unnamed route");
  const others = new Set<string>();
  for (const key of ["name:en", "alt_name", "official_name"]) if (tags[key]) others.add(tags[key]!);
  // A name in another language is worth showing when it is the one that matched.
  if (pattern) for (const key in tags) if (key.startsWith("name:") && pattern.test(tags[key]!)) others.add(tags[key]!);
  others.delete(name);
  return { name, otherNames: [...others].slice(0, 3) };
}

function boundsOf(lines: Point[][]): Bbox | null {
  let box: Bbox | null = null;
  for (const line of lines) {
    for (const [lon, lat] of line) {
      box = box ? [Math.min(box[0], lon), Math.min(box[1], lat), Math.max(box[2], lon), Math.max(box[3], lat)] : [lon, lat, lon, lat];
    }
  }
  return box;
}

function relationResult(relation: OsmRelation, length: number | undefined, pattern: RegExp | null): RouteSearchResult {
  return {
    key: `r${relation.id}`,
    ref: { type: "relation", id: relation.id },
    ...namesOf(relation.tags, pattern),
    kind: ownValue(KINDS, relation.tags.route ?? "") ?? "walking",
    network: networkOf(relation.tags),
    from: relation.tags.from ?? null,
    to: relation.tags.to ?? null,
    lengthMeters: length === undefined ? null : Math.round(length),
    bounds: relation.bounds,
    wayCount: null,
  };
}

/** Ways that share a name, sorted into the separate paths they make. */
function pathResults(ways: OsmWay[]): RouteSearchResult[] {
  const byName = new Map<string, OsmWay[]>();
  for (const way of ways) {
    if (!way.tags.name || way.runs.length === 0) continue;
    byName.set(way.tags.name, [...(byName.get(way.tags.name) ?? []), way]);
  }
  const results: RouteSearchResult[] = [];
  for (const [name, named] of byName) {
    // One line per way for telling paths apart: a way broken by an unusable point still counts once.
    const lines = named.map((way) => way.runs.flat());
    for (const cluster of clusterLines(lines, PATH_CLUSTER_METERS)) {
      const members = cluster.map((index) => named[index]!);
      const runs = members.flatMap((way) => way.runs);
      results.push({
        key: `w${members.map((way) => way.id).join("-")}`.slice(0, 200),
        ref: { type: "ways", ids: members.map((way) => way.id) },
        name,
        otherNames: [],
        kind: "path",
        network: null,
        from: null,
        to: null,
        lengthMeters: Math.round(lengthOf(runs)),
        bounds: boundsOf(runs),
        wayCount: members.length,
      });
    }
  }
  return results.sort((a, b) => (b.lengthMeters ?? 0) - (a.lengthMeters ?? 0));
}

const union = (boxes: Bbox[]): Bbox | null =>
  boxes.length === 0
    ? null
    : boxes.reduce((all, box) => [Math.min(all[0], box[0]), Math.min(all[1], box[1]), Math.max(all[2], box[2]), Math.max(all[3], box[3])]);
const inside = (inner: Bbox, outer: Bbox, margin = 0.002) =>
  inner[0] >= outer[0] - margin && inner[1] >= outer[1] - margin && inner[2] <= outer[2] + margin && inner[3] <= outer[3] + margin;

// ── The service ─────────────────────────────────────────────────────────────

interface HeldPreview {
  expiresAt: number;
  name: string;
  lines: Point[][];
  alternatives: Point[][];
  credit: TrackSource;
  /** How many points it holds: what it counts for against `MAX_HELD_POINTS`. */
  points: number;
  /**
   * Set when "Add" is first asked for with this preview's token, before anything is
   * waited for. A second request with the same token (a double click, a retry while a
   * long route's heights are read) is given the route this one makes, not another.
   */
  adding?: Promise<RouteSaveResponse>;
}

export interface RouteFinderService {
  sources(): RouteSourcesResponse;
  search(input: z.infer<typeof routeSearchSchema>, signal?: AbortSignal): Promise<RouteSearchResponse>;
  preview(input: z.infer<typeof routePreviewSchema>, signal?: AbortSignal): Promise<RoutePreview>;
  add(input: z.infer<typeof routeAddSchema>): Promise<RouteSaveResponse>;
  /** Reads heights again for a route found earlier, once terrain has been installed where it runs. */
  fillHeights(trackId: string): Promise<RouteSaveResponse>;
}

export interface RouteFinderDeps {
  loaded: LoadedRouteSources;
  overpass: OverpassClient;
  annotations: AnnotationsService;
  elevation: ElevationSampler;
  userAgent: string;
  now?: () => number;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
/** How far apart heights are read along lines of this length. */
const heightSpacing = (lines: Point[][]) => Math.max(25, lengthOf(lines) / HEIGHT_SAMPLES);

/** Lines as they are stored: six decimal places, no point repeated, a height where terrain knows one. */
async function withHeights(lines: Point[][], sampler: ElevationSampler): Promise<{ lines: Position[][]; elevation: RouteElevation }> {
  const stored = lines
    .map((line) => {
      const cleaned: Point[] = [];
      for (const [lon, lat] of line) {
        const point: Point = [round6(lon), round6(lat)];
        const previous = cleaned.at(-1);
        if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
        cleaned.push(point);
      }
      return cleaned;
    })
    .filter((line) => line.length >= 2);
  const positions = stored.flat();
  const heights = await sampler.sample(positions, heightSpacing(stored));
  const known = heights.filter((height) => height !== null).length;
  const elevation: RouteElevation = known === 0 ? "none" : known === heights.length ? "terrain" : "partial";
  let index = 0;
  return {
    lines: stored.map((line) =>
      line.map((point) => {
        const height = heights[index] ?? null;
        index += 1;
        return height === null ? [...point] : [...point, height];
      }),
    ),
    elevation,
  };
}

export function createRouteFinder(deps: RouteFinderDeps): RouteFinderService {
  const now = deps.now ?? Date.now;
  const held = new Map<string, HeldPreview>();

  function sourceFor(id: string | undefined, view?: Bbox): RouteSource {
    if (id) {
      const named = deps.loaded.sources.find((candidate) => candidate.id === id);
      if (named) return named;
      throw badRequest("That route source is not one of the sources declared for this Outpost.");
    }
    const centre = view ? { lon: (view[0] + view[2]) / 2, lat: (view[1] + view[3]) / 2 } : null;
    const source = pickRouteSource(deps.loaded.sources, deps.loaded.defaultId, centre);
    if (source) return source;
    throw new AppError("not_found", "No route source is declared for this Outpost, so there is nowhere to look for routes.");
  }

  async function ask(
    source: RouteSource,
    query: string,
    limits: AnswerLimits,
    cap: { bytes: number; message: string },
    signal?: AbortSignal,
  ) {
    const body = await deps.overpass.ask(source, query, { signal, maxBytes: cap.bytes, tooLarge: cap.message, userAgent: deps.userAgent });
    try {
      return readAnswer(body, limits);
    } catch (error) {
      if (error instanceof AnswerTooLarge) throw new AppError("too_large", cap.message);
      throw error;
    }
  }

  function hold(preview: HeldPreview): string {
    for (const [token, item] of held) if (item.expiresAt <= now()) held.delete(token);
    let points = preview.points;
    for (const item of held.values()) points += item.points;
    // Oldest first, until there is room for this one.
    for (const [token, item] of held) {
      if (held.size < MAX_HELD_PREVIEWS && points <= MAX_HELD_POINTS) break;
      held.delete(token);
      points -= item.points;
    }
    const token = randomUUID();
    held.set(token, preview);
    return token;
  }

  async function save(preview: HeldPreview, input: z.infer<typeof routeAddSchema>): Promise<RouteSaveResponse> {
    const main = await withHeights(preview.lines, deps.elevation);
    const side = input.includeAlternatives
      ? await withHeights(preview.alternatives, deps.elevation)
      : { lines: [], elevation: "none" as const };
    const elevation: RouteElevation =
      side.lines.length === 0 || side.elevation === main.elevation
        ? main.elevation
        : main.elevation === "none" && side.elevation === "none"
          ? "none"
          : "partial";
    const feature = (coordinates: Position[], name?: string): TrackFeature => ({
      type: "Feature",
      properties: { _gpxType: "trk", ...(name ? { name } : {}) },
      geometry: { type: "LineString", coordinates },
    });
    const collection: TrackCollection = {
      type: "FeatureCollection",
      features: [
        ...main.lines.map((line) => feature(line)),
        ...side.lines.map((line, index) => feature(line, side.lines.length > 1 ? `Alternative leg ${index + 1}` : "Alternative leg")),
      ],
      source: preview.credit,
    };
    return deps.annotations.createFromCollection({
      name: (input.name ?? preview.name).slice(0, 200),
      // Every program that reads GPX keeps a description, so the credit is written there too.
      description: creditLine(preview.credit),
      color: input.color,
      collection,
      elevation,
    });
  }

  return {
    sources() {
      return {
        sources: deps.loaded.sources.map(toSourceDto),
        defaultId: deps.loaded.defaultId,
        problems: deps.loaded.problems,
        clientName: deps.userAgent,
      };
    },

    async search(input, signal) {
      const source = sourceFor(input.sourceId, input.bbox as Bbox | undefined);
      const text = cleanText(input.text ?? "", 200) ?? "";
      const pattern = text ? namePattern(text) : "";
      if (text) {
        if (text.length > ROUTE_SEARCH_MAX_TEXT) throw badRequest(`Search for at most ${ROUTE_SEARCH_MAX_TEXT} characters of a name.`);
        if ((pattern.match(/[\p{L}\p{N}]/gu) ?? []).length < ROUTE_SEARCH_MIN_TEXT) {
          throw badRequest(`Type at least ${ROUTE_SEARCH_MIN_TEXT} letters of the route's name.`);
        }
      }
      const bbox = input.bbox as Bbox | undefined;
      if (bbox && (bbox[2] - bbox[0] > ROUTE_SEARCH_MAX_SPAN || bbox[3] - bbox[1] > ROUTE_SEARCH_MAX_SPAN)) {
        throw badRequest("That is too much of the map to search at once. Zoom in, or search by name without the map view.");
      }

      const answer = await ask(
        source,
        searchQuery({ pattern: pattern || undefined, bbox, maxRoutes: MAX_RESULTS + 1, maxWays: MAX_PATH_WAYS }),
        { maxRelations: MAX_RESULTS + 1, maxWays: MAX_PATH_WAYS, maxMembers: 0, maxPoints: 400_000 },
        { bytes: MAX_SEARCH_BYTES, message: TOO_LARGE_SEARCH },
        signal,
      );

      // The pattern holds only letters, digits, spaces, apostrophes, hyphens and "any character" dots.
      const matcher = pattern ? new RegExp(pattern, "iu") : null;
      const routes = answer.relations
        .slice(0, MAX_RESULTS)
        .map((relation) => relationResult(relation, answer.lengths.get(relation.id), matcher));
      // A path that is already listed as a route is not listed again as loose ways.
      const paths = pathResults(answer.ways).filter(
        (path) =>
          !routes.some(
            (route) =>
              [route.name, ...route.otherNames].some((name) => name.toLowerCase() === path.name.toLowerCase()) &&
              route.bounds &&
              path.bounds &&
              inside(path.bounds, route.bounds),
          ),
      );

      // Best match first: the name as typed, then names that start with it, then the rest; nearer the middle of the view first.
      const wanted = text.toLowerCase();
      const rank = (result: RouteSearchResult) => {
        const names = [result.name, ...result.otherNames].map((name) => name.toLowerCase());
        return names.includes(wanted) ? 0 : names.some((name) => name.startsWith(wanted)) ? 1 : 2;
      };
      const centre = bbox ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : null;
      const away = (result: RouteSearchResult) =>
        centre && result.bounds
          ? Math.hypot((result.bounds[0] + result.bounds[2]) / 2 - centre[0]!, (result.bounds[1] + result.bounds[3]) / 2 - centre[1]!)
          : 0;
      const ordered = (list: RouteSearchResult[]) =>
        [...list].sort((a, b) => (wanted ? rank(a) - rank(b) : 0) || away(a) - away(b) || a.name.localeCompare(b.name));

      return {
        results: [...ordered(routes), ...ordered(paths).slice(0, MAX_PATH_RESULTS)],
        truncated: answer.relations.length > MAX_RESULTS || answer.ways.length >= MAX_PATH_WAYS || paths.length > MAX_PATH_RESULTS,
        dataAsOf: answer.dataAsOf,
        source: { id: source.id, name: source.name, host: source.host },
        includedPaths: Boolean(pattern && bbox),
      };
    },

    async preview(input, signal) {
      const source = sourceFor(input.sourceId);
      const ref = input.ref as FoundRouteRef;
      const limits: AnswerLimits = {
        maxRelations: MAX_SECTIONS + 2,
        maxWays: MAX_PATH_WAYS,
        maxMembers: MAX_ROUTE_WAYS,
        maxPoints: MAX_ROUTE_POINTS,
      };
      const label = ref.type === "relation" ? "That route" : "That path";
      const answer = await ask(
        source,
        ref.type === "relation" ? relationQuery(ref.id, MAX_SECTIONS + 1) : waysQuery(ref.ids),
        limits,
        { bytes: MAX_ROUTE_BYTES, message: tooLargeRoute(label) },
        signal,
      );

      let name: string;
      let otherNames: string[] = [];
      let kind: RouteKind = "path";
      let main: Point[][];
      let side: Point[][] = [];
      let wayIds: number[];
      let skippedPoints = 0;
      let unusableWays = 0;
      let sections: RouteSearchResult[] = [];

      if (ref.type === "relation") {
        const relation = answer.relations.find((candidate) => candidate.id === ref.id);
        if (!relation || (relation.tags.type !== "route" && relation.tags.type !== "superroute")) {
          throw new AppError(
            "not_found",
            `${source.host} has no route with that number any more. Search again: it may have been replaced.`,
          );
        }
        ({ name, otherNames } = namesOf(relation.tags, null));
        kind = ownValue(KINDS, relation.tags.route ?? "") ?? "walking";
        const ways = relation.members.filter((member) => member.type === "way");
        const mainRuns: Point[][] = [];
        const sideRuns: Point[][] = [];
        for (const way of ways) {
          skippedPoints += way.dropped;
          if (way.runs.length === 0) unusableWays += 1;
          (SIDE_ROLES.has(way.role.toLowerCase()) ? sideRuns : mainRuns).push(...way.runs);
        }
        main = arrangeLines(joinWays(mainRuns, { ordered: true }));
        side = arrangeLines(joinWays(sideRuns, { ordered: true }));
        wayIds = ways.map((way) => way.ref);
        const childIds = new Set(relation.members.filter((member) => member.type === "relation").map((member) => member.ref));
        sections = answer.relations
          .filter((candidate) => candidate.id !== ref.id && childIds.has(candidate.id))
          .filter((candidate) => candidate.tags.type === "route" || candidate.tags.type === "superroute")
          .slice(0, MAX_SECTIONS)
          .map((child) => relationResult(child, undefined, null));
        if (main.length === 0 && side.length > 0) [main, side] = [side, []];
      } else {
        const wanted = new Set(ref.ids);
        const ways = answer.ways.filter((way) => wanted.has(way.id));
        if (ways.length === 0) {
          throw new AppError("not_found", `${source.host} has none of those ways any more. Search again: the path may have been redrawn.`);
        }
        name = ways.find((way) => way.tags.name)?.tags.name ?? "Unnamed path";
        for (const way of ways) {
          skippedPoints += way.dropped;
          if (way.runs.length === 0) unusableWays += 1;
        }
        main = arrangeLines(
          joinWays(
            ways.flatMap((way) => way.runs),
            { ordered: false },
          ),
        );
        wayIds = ways.map((way) => way.id);
      }

      if (main.length === 0 && sections.length === 0) {
        throw new AppError("not_found", `${name} has no line that can be drawn: OpenStreetMap holds no usable ways for it.`);
      }

      const fetchedAt = new Date(now());
      const credit = buildTrackSource({ ref, name, wayIds, server: source.host, dataAsOf: answer.dataAsOf, fetchedAt });
      const facts = describeLines(main);
      const expiresAt = now() + PREVIEW_HOLD_MS;
      const count = (lines: Point[][]) => lines.reduce((total, line) => total + line.length, 0);
      const token =
        main.length > 0 ? hold({ expiresAt, name, lines: main, alternatives: side, credit, points: count(main) + count(side) }) : "";
      return {
        token,
        expiresAt,
        ref,
        name,
        otherNames,
        kind,
        lines: main as RouteLine[],
        lengthMeters: Math.round(lengthOf(main)),
        pointCount: count(main),
        wayCount: wayIds.length,
        bounds:
          boundsOf(main) ?? union(sections.flatMap((section) => (section.bounds ? [section.bounds] : []))) ?? ([0, 0, 0, 0] satisfies Bbox),
        ...facts,
        alternatives: { lines: side as RouteLine[], lengthMeters: Math.round(lengthOf(side)) },
        sections,
        skipped: { points: skippedPoints, unusableWays },
        dataAsOf: answer.dataAsOf,
        source: { id: source.id, name: source.name, host: source.host },
        credit,
      };
    },

    async add(input) {
      const preview = held.get(input.token);
      const notHeld = () => {
        held.delete(input.token);
        return new AppError("conflict", NOT_HELD);
      };
      if (!preview || preview.expiresAt <= now()) throw notHeld();
      if (preview.adding) {
        const made = await preview.adding;
        // The route as it is now: it may have been renamed since. If it has been removed, there is nothing to give.
        const track = deps.annotations.listTracks().find((candidate) => candidate.id === made.track.id);
        if (!track) throw notHeld();
        return { track, elevation: made.elevation };
      }
      // Claimed here, before the first wait: heights for a long route take seconds, and a second request may arrive in them.
      preview.adding = save(preview, input);
      try {
        const saved = await preview.adding;
        // The points are in the route now. The token is kept, so that asking again answers with that route.
        preview.lines = [];
        preview.alternatives = [];
        preview.points = 0;
        return saved;
      } catch (error) {
        // Nothing was made, so the preview can be added again.
        preview.adding = undefined;
        throw error;
      }
    },

    async fillHeights(trackId) {
      const read = () => {
        const track = deps.annotations.getTrack(trackId);
        const source = readTrackSource(track.geojson);
        if (!source) {
          throw badRequest(
            "Heights are only filled in this way for a route found in a route source. A recording keeps the heights it was recorded with.",
          );
        }
        const features = (track.geojson as unknown as TrackCollection).features ?? [];
        const lines = features.filter((feature) => feature.geometry?.type === "LineString");
        if (lines.length === 0 || lines.some((feature) => feature.properties?._drawn)) {
          throw badRequest("This route's shape has been redrawn by hand. Use “Fill in heights from terrain” on the route itself.");
        }
        return { source, features, lines: lines.map((feature) => feature.geometry.coordinates as Position[]) };
      };
      const before = read();
      const positions = before.lines.flat().map(([lon, lat]) => [lon!, lat!] as Point);
      const heights = await deps.elevation.sample(positions, heightSpacing(before.lines as Point[][]));
      // Read again: the terrain took a moment (seconds, for a long route), and the route may have been redrawn,
      // filled in or removed meanwhile. What is written is what is there now with heights added, or nothing.
      const current = read();
      const unchanged =
        current.lines.length === before.lines.length &&
        current.lines.every(
          (line, at) =>
            line.length === before.lines[at]!.length &&
            line.every((position, i) => {
              const was = before.lines[at]![i]!;
              return position[0] === was[0] && position[1] === was[1] && position[2] === was[2];
            }),
        );
      if (!unchanged) {
        throw new AppError("conflict", "This route was changed while its heights were being read, so nothing was written. Try again.");
      }
      // A point keeps the height it has where terrain has none to give now: terrain may have been removed since.
      let index = 0;
      let known = 0;
      const filled = current.lines.map((line) =>
        line.map((position): Position => {
          const height = heights[index++] ?? (typeof position[2] === "number" ? position[2] : null);
          if (height === null) return [position[0]!, position[1]!];
          known += 1;
          return [position[0]!, position[1]!, height];
        }),
      );
      const elevation: RouteElevation = known === 0 ? "none" : known === positions.length ? "terrain" : "partial";
      let line = 0;
      const collection: TrackCollection = {
        type: "FeatureCollection",
        features: current.features.map((feature) =>
          feature.geometry?.type === "LineString"
            ? { ...feature, geometry: { type: "LineString", coordinates: filled[line++]! } }
            : feature,
        ),
        source: current.source,
      };
      return deps.annotations.replaceCollection(trackId, collection, elevation);
    },
  };
}

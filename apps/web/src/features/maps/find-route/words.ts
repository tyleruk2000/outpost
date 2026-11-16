/** The words the "Find a route" view says about a result, a preview and a route's source. All pure. */
import {
  type Bbox,
  haversineMeters,
  ROUTE_SEARCH_MAX_SPAN,
  ROUTE_SEARCH_MIN_TEXT,
  type RouteKind,
  type RoutePreview,
  type RouteSearchResult,
  type TrackSource,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { formatDate, plural } from "@/lib/utils";
import { bboxCenter, formatDistance, initialBearing, type LatLon } from "../lib/geo";

export type SearchScope = "view" | "anywhere";

const KIND_LABELS: Record<RouteKind, string> = {
  walking: "Walking route",
  running: "Running route",
  cycling: "Cycle route",
  "mountain-biking": "Mountain bike route",
  riding: "Riding route",
  path: "Named path",
};
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;

export const kindLabel = (kind: RouteKind) => KIND_LABELS[kind];

/** "3.1 km north-east of the map centre", or "At the map centre" when it is on top of it. */
export function whereFrom(centre: LatLon, bounds: Bbox | null): string | null {
  if (!bounds) return null;
  const middle = bboxCenter(bounds);
  const meters = haversineMeters(centre.lat, centre.lon, middle.lat, middle.lon);
  if (meters < 250) return "At the map centre";
  const direction = COMPASS[Math.round(initialBearing(centre, middle) / 45) % 8];
  return `${formatDistance(meters)} ${direction} of the map centre`;
}

/** The line under a result's name: what it is, how far-reaching, and where. Length is shown apart, where numbers line up. */
export function resultSummary(result: RouteSearchResult, centre: LatLon | null): string {
  const parts = [result.kind === "path" && result.wayCount ? `Named path, ${plural(result.wayCount, "way")}` : kindLabel(result.kind)];
  if (result.network) parts.push(result.network);
  const where = centre ? whereFrom(centre, result.bounds) : null;
  if (where) parts.push(where);
  return parts.join(" · ");
}

/** Whether a view is small enough to ask a route source about. */
export const viewSearchable = (bounds: Bbox) =>
  bounds[2] - bounds[0] <= ROUTE_SEARCH_MAX_SPAN && bounds[3] - bounds[1] <= ROUTE_SEARCH_MAX_SPAN && bounds[0] < bounds[2];

/** Why the Search button would do nothing, in words; null when a search can be sent. */
export function searchBlocker(text: string, scope: SearchScope, view: Bbox | null): string | null {
  const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (text.trim() && letters < ROUTE_SEARCH_MIN_TEXT) return `Type at least ${ROUTE_SEARCH_MIN_TEXT} letters of the name.`;
  if (scope === "anywhere") return text.trim() ? null : "Type a name to search for it anywhere.";
  if (!view) return "The map is not ready yet.";
  if (!viewSearchable(view)) return "This view is too wide to search. Zoom in to about a day's walk across, or search by name anywhere.";
  return null;
}

/** How whole the previewed line is, said plainly. */
export function continuity(preview: Pick<RoutePreview, "lines" | "gaps" | "largestGapMeters" | "branches">): string {
  if (preview.lines.length === 0) return "No line of its own";
  if (preview.lines.length === 1) return "One unbroken line";
  const parts: string[] = [];
  if (preview.gaps > 0) parts.push(`${plural(preview.gaps, "gap")} (the widest ${formatDistance(preview.largestGapMeters)})`);
  if (preview.branches > 0) parts.push(plural(preview.branches, "branch", "branches"));
  return `${plural(preview.lines.length, "line")}: ${parts.join(" and ")}`;
}

/** What is said under the facts when the line is not whole. Null when there is nothing to explain. */
export function continuityNote(preview: Pick<RoutePreview, "gaps" | "branches">): string | null {
  if (preview.gaps > 0 && preview.branches > 0) {
    return "OpenStreetMap's ways for this route do not all meet, and some fork. Gaps are left open, never joined with a straight line, and each branch is kept as a line of its own.";
  }
  if (preview.gaps > 0) {
    return "OpenStreetMap's ways for this route do not all meet. The gaps are left open, never joined with a straight line; the length counts only what is mapped.";
  }
  if (preview.branches > 0) {
    return "This route forks or doubles back on itself in OpenStreetMap. Each branch is kept as a line of its own, and the length counts them all.";
  }
  return null;
}

/** "15 Nov 2026" from an ISO date-time; null when it is not one. */
export function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : formatDate(time);
}

/** A copy of the map more than this old is worth a word before someone relies on it. */
const STALE_DAYS = 30;
export function isStale(dataAsOf: string | null, now = Date.now()): boolean {
  const time = dataAsOf ? Date.parse(dataAsOf) : Number.NaN;
  return !Number.isNaN(time) && now - time > STALE_DAYS * 86_400_000;
}

/** The pseudo-track the map draws for a preview. Its id can never be a saved track's. */
export const PREVIEW_TRACK_ID = "find-route-preview";
export function previewTrack(preview: RoutePreview, withAlternatives: boolean): TrackWithGeometryDto {
  const lines = withAlternatives ? [...preview.lines, ...preview.alternatives.lines] : preview.lines;
  return {
    id: PREVIEW_TRACK_ID,
    name: preview.name,
    description: "",
    color: "teal",
    sourceFilename: null,
    distanceMeters: preview.lengthMeters,
    ascentMeters: null,
    pointCount: preview.pointCount,
    bounds: preview.bounds,
    createdAt: 0,
    updatedAt: 0,
    geojson: {
      type: "FeatureCollection",
      features: lines.map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } })),
    },
  };
}

/** "relation 4004181" with the first letter raised, for the start of a line. */
export const elementLabel = (source: TrackSource) => `OpenStreetMap ${source.element}`;

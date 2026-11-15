/**
 * The route being drawn: its points, and every step taken so that each can be undone
 * and redone. Pure functions over plain data, so the editing rules can be tested
 * without a map.
 *
 * A drawn route is straight lines between its points, in order. Nothing here follows
 * paths or roads.
 */
import { haversineMeters, MARKER_COLORS, MAX_ROUTE_POINTS, type MarkerColor, type TrackWithGeometryDto } from "@outpost/shared";
import type { LatLon } from "./geo";
import { trackLines } from "./profile";

/** Steps kept for undo. Older ones are forgotten. */
export const HISTORY_LIMIT = 200;
/** An imported recording is thinned to about this many points before it is edited by hand. */
export const EDITABLE_POINTS = 300;

export interface RouteEdit {
  points: LatLon[];
  /** The points as they were when editing began: what "changed" is measured against. */
  original: LatLon[];
  /** Earlier states, oldest first. */
  past: LatLon[][];
  /** States that were undone, the next one to redo last. */
  future: LatLon[][];
}

const DEG = Math.PI / 180;

/** Positions are kept to six decimal places (about ten centimetres), as the server stores them. */
export function roundPoint(position: LatLon): LatLon {
  return { lat: Number(position.lat.toFixed(6)), lon: Number(position.lon.toFixed(6)) };
}

const samePoint = (a: LatLon | undefined, b: LatLon | undefined) => Boolean(a && b && a.lat === b.lat && a.lon === b.lon);
const sameLine = (a: LatLon[], b: LatLon[]) => a.length === b.length && a.every((point, index) => samePoint(point, b[index]));

export function startEdit(points: LatLon[] = []): RouteEdit {
  const rounded = points.slice(0, MAX_ROUTE_POINTS).map(roundPoint);
  return { points: rounded, original: rounded, past: [], future: [] };
}

function commit(edit: RouteEdit, points: LatLon[]): RouteEdit {
  if (sameLine(points, edit.points)) return edit;
  return { ...edit, points, past: [...edit.past, edit.points].slice(-HISTORY_LIMIT), future: [] };
}

export const isFull = (edit: RouteEdit) => edit.points.length >= MAX_ROUTE_POINTS;

/** Adds a point at the end. A point on top of the last one, or one past the limit, is ignored. */
export function addPoint(edit: RouteEdit, position: LatLon): RouteEdit {
  const point = roundPoint(position);
  if (isFull(edit) || samePoint(edit.points.at(-1), point)) return edit;
  return commit(edit, [...edit.points, point]);
}

export function movePoint(edit: RouteEdit, index: number, position: LatLon): RouteEdit {
  if (!edit.points[index]) return edit;
  const point = roundPoint(position);
  return commit(
    edit,
    edit.points.map((current, at) => (at === index ? point : current)),
  );
}

/** Puts a new point into the line so that it becomes point number `index` (counting from 0). */
export function insertPoint(edit: RouteEdit, index: number, position: LatLon): RouteEdit {
  if (isFull(edit) || index < 0 || index > edit.points.length) return edit;
  return commit(edit, [...edit.points.slice(0, index), roundPoint(position), ...edit.points.slice(index)]);
}

export function removePoint(edit: RouteEdit, index: number): RouteEdit {
  if (!edit.points[index]) return edit;
  return commit(
    edit,
    edit.points.filter((_, at) => at !== index),
  );
}

/** The same line walked the other way. */
export function reversePoints(edit: RouteEdit): RouteEdit {
  return commit(edit, [...edit.points].reverse());
}

export const canUndo = (edit: RouteEdit) => edit.past.length > 0;
export const canRedo = (edit: RouteEdit) => edit.future.length > 0;

export function undo(edit: RouteEdit): RouteEdit {
  const previous = edit.past.at(-1);
  if (!previous) return edit;
  return { ...edit, points: previous, past: edit.past.slice(0, -1), future: [...edit.future, edit.points] };
}

export function redo(edit: RouteEdit): RouteEdit {
  const next = edit.future.at(-1);
  if (!next) return edit;
  return { ...edit, points: next, past: [...edit.past, edit.points], future: edit.future.slice(0, -1) };
}

/** Whether the line differs from the one editing began with. Undoing every step makes it unchanged again. */
export const isChanged = (edit: RouteEdit) => !sameLine(edit.points, edit.original);

/** Enough points to be a route. */
export const canSave = (edit: RouteEdit) => edit.points.length >= 2;

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * DEG) / 2));
const latitudeOf = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG;

/**
 * The middle of each leg, where the handle for adding a point there is shown. It is the
 * middle of the line as the map draws it, which near the poles is not quite the middle
 * in degrees.
 */
export function midpoints(points: LatLon[]): LatLon[] {
  const middles: LatLon[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    middles.push(roundPoint({ lat: latitudeOf((mercatorY(from.lat) + mercatorY(to.lat)) / 2), lon: (from.lon + to.lon) / 2 }));
  }
  return middles;
}

/** Distance from a point to the straight line between two others, in metres. Good for short legs. */
function offLine(point: LatLon, from: LatLon, to: LatLon): number {
  const scale = Math.cos(((from.lat + to.lat) / 2) * DEG);
  const x = (point.lon - from.lon) * scale;
  const y = point.lat - from.lat;
  const dx = (to.lon - from.lon) * scale;
  const dy = to.lat - from.lat;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, (x * dx + y * dy) / length));
  return haversineMeters(point.lat, point.lon, from.lat + dy * t, from.lon + (dx * t) / (scale || 1));
}

/** Drops the points that lie within `tolerance` metres of the line through their neighbours. */
function thin(points: LatLon[], tolerance: number): LatLon[] {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const spans: Array<[number, number]> = [[0, points.length - 1]];
  while (spans.length > 0) {
    const [first, last] = spans.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const off = offLine(points[index]!, points[first]!, points[last]!);
      if (off > distance) {
        distance = off;
        farthest = index;
      }
    }
    if (farthest === -1) continue;
    keep[farthest] = 1;
    spans.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, index) => keep[index] === 1);
}

/**
 * A line of at most `maxPoints` that keeps the shape of a longer one: the points that
 * matter least to the shape go first. A line already short enough comes back as it is.
 */
export function simplifyLine(points: LatLon[], maxPoints = EDITABLE_POINTS): LatLon[] {
  if (points.length <= maxPoints) return points;
  let simplified = points;
  for (let tolerance = 2; simplified.length > maxPoints && tolerance < 1e7; tolerance *= 1.6) simplified = thin(points, tolerance);
  return simplified;
}

/** What a stored track's lines are, for editing: every point in order, the parts joined end to end. */
export function editablePoints(geojson: TrackWithGeometryDto["geojson"]): {
  points: LatLon[];
  /** Points in the stored lines. */
  recorded: number;
  /** Separate lines (track segments and routes) the points came from. */
  parts: number;
} {
  const lines = trackLines(geojson);
  const all: LatLon[] = [];
  for (const line of lines) {
    for (const [lon, lat] of line) {
      const point = roundPoint({ lat, lon });
      if (!samePoint(all.at(-1), point)) all.push(point);
    }
  }
  return { points: simplifyLine(all), recorded: lines.reduce((sum, line) => sum + line.length, 0), parts: lines.length };
}

// ── Keeping an unsaved route across a reload or a visit to another screen ──

/** A route in the middle of being drawn or reshaped. */
export interface StoredRouteDraft {
  /** The saved route whose shape is being changed; absent for a new one. */
  trackId?: string;
  name: string;
  color: MarkerColor;
  points: LatLon[];
  /** The saved route is an imported recording, whose points saving will replace. */
  replacesRecording?: boolean;
}

export function isStoredRouteDraft(value: unknown): value is StoredRouteDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<StoredRouteDraft>;
  return (
    typeof draft.name === "string" &&
    (draft.trackId === undefined || typeof draft.trackId === "string") &&
    (draft.replacesRecording === undefined || typeof draft.replacesRecording === "boolean") &&
    (MARKER_COLORS as readonly unknown[]).includes(draft.color) &&
    Array.isArray(draft.points) &&
    draft.points.length <= MAX_ROUTE_POINTS &&
    draft.points.every(
      (point) =>
        point && typeof point.lat === "number" && typeof point.lon === "number" && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180,
    )
  );
}

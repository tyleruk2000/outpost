/**
 * Elevation profiles: turning a track's stored geometry into distance-against-height
 * samples, and those samples into the path an SVG draws.
 */
import { haversineMeters, type RouteElevation, type TrackWithGeometryDto } from "@outpost/shared";

export interface ProfileSample {
  /** Metres from the start of the track. */
  distance: number;
  elevation: number;
  lat: number;
  lon: number;
}

export interface Profile {
  samples: ProfileSample[];
  totalMeters: number;
  minElevation: number;
  maxElevation: number;
}

type Position = [lon: number, lat: number, elevation?: number];

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

/**
 * Every line of a track, in order: track segments and routes alike. Waypoints are left
 * out, and so are outlines (a polygon's rings from a KML or GeoJSON file), which are
 * drawn on the map (`outlines` true) but are not a way to walk.
 */
export function trackLines(geojson: TrackWithGeometryDto["geojson"], outlines = false): Position[][] {
  const lines: Position[][] = [];
  for (const feature of geojson.features) {
    const item = feature as { geometry?: { type?: string; coordinates?: unknown }; properties?: { _outline?: unknown } | null } | null;
    if (item?.properties?._outline && !outlines) continue;
    const geometry = item?.geometry;
    if (!geometry) continue;
    const parts =
      geometry.type === "LineString"
        ? [geometry.coordinates]
        : geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)
          ? geometry.coordinates
          : [];
    for (const part of parts) {
      if (!Array.isArray(part)) continue;
      const line = part.filter(isPosition);
      if (line.length >= 2) lines.push(line);
    }
  }
  return lines;
}

interface LineFeature {
  properties?: {
    _drawn?: unknown;
    _recorded?: unknown;
    _elevation?: unknown;
    _profile?: unknown;
    coordinateProperties?: { times?: unknown };
  } | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

const isLine = (feature: LineFeature | null) => feature?.geometry?.type === "LineString" || feature?.geometry?.type === "MultiLineString";

export interface RouteOrigin {
  /** The line was drawn (or reshaped) by hand on the map, not recorded. */
  drawn: boolean;
  /** For a drawn line: whether installed terrain could give it heights. Null for a recording. */
  elevation: RouteElevation | null;
  /** The recording carries a time at each point. */
  timed: boolean;
  /** The line was recorded on this map as its maker walked it, rather than imported from a file. */
  recorded: boolean;
}

/** How a stored track came to have its line, read from the line itself. */
export function routeOrigin(geojson: TrackWithGeometryDto["geojson"]): RouteOrigin {
  const lines = (geojson.features as LineFeature[]).filter(isLine);
  const drawn = lines.find((feature) => feature.properties?._drawn === true);
  const elevation = drawn?.properties?._elevation;
  return {
    drawn: Boolean(drawn),
    elevation: elevation === "terrain" || elevation === "partial" || elevation === "none" ? elevation : drawn ? "none" : null,
    timed: lines.some((feature) => Array.isArray(feature.properties?.coordinateProperties?.times)),
    recorded: !drawn && lines.some((feature) => feature.properties?._recorded === true),
  };
}

/**
 * The lines an elevation profile is read from. A drawn route carries its line sampled
 * every few tens of metres with a height at each sample, so the profile shows the
 * ground between its points; a recording is its own points.
 */
function profileLines(geojson: TrackWithGeometryDto["geojson"]): Position[][] {
  const lines: Position[][] = [];
  for (const feature of geojson.features as LineFeature[]) {
    const sampled = feature?.properties?._drawn === true ? feature.properties._profile : undefined;
    if (Array.isArray(sampled)) {
      const line = sampled.filter(isPosition);
      if (line.length >= 2) lines.push(line);
    } else {
      lines.push(...trackLines({ type: "FeatureCollection", features: [feature] }));
    }
  }
  return lines;
}

/** First and last point of what was recorded, for the start and end marks. */
export function trackEnds(lines: Position[][]): { start: Position; end: Position } | null {
  const first = lines[0]?.[0];
  const last = lines.at(-1)?.at(-1);
  return first && last ? { start: first, end: last } : null;
}

/**
 * The profile of a track, or null when it has no usable heights. Points without a
 * height are skipped but still count towards distance, so the x axis stays true. Long
 * recordings are thinned to `maxSamples`, always keeping the highest and lowest points.
 */
export function buildProfile(geojson: TrackWithGeometryDto["geojson"], maxSamples = 400): Profile | null {
  const samples: ProfileSample[] = [];
  let distance = 0;
  for (const line of profileLines(geojson)) {
    let previous: Position | undefined;
    for (const position of line) {
      // A gap between segments is not travelled, so distance only grows within a line.
      if (previous) distance += haversineMeters(previous[1], previous[0], position[1], position[0]);
      previous = position;
      const elevation = position[2];
      if (typeof elevation === "number" && Number.isFinite(elevation))
        samples.push({ distance, elevation, lat: position[1], lon: position[0] });
    }
  }
  if (samples.length < 2 || distance <= 0) return null;

  let min = samples[0]!;
  let max = samples[0]!;
  for (const sample of samples) {
    if (sample.elevation < min.elevation) min = sample;
    if (sample.elevation > max.elevation) max = sample;
  }

  let kept = samples;
  if (samples.length > maxSamples) {
    const step = (samples.length - 1) / (maxSamples - 1);
    const indexes = new Set<number>([samples.indexOf(min), samples.indexOf(max)]);
    for (let index = 0; index < maxSamples; index += 1) indexes.add(Math.round(index * step));
    kept = [...indexes].sort((a, b) => a - b).map((index) => samples[index]!);
  }
  return { samples: kept, totalMeters: distance, minElevation: min.elevation, maxElevation: max.elevation };
}

export interface ProfileGeometry {
  line: string;
  area: string;
  x(distance: number): number;
  y(elevation: number): number;
}

/**
 * SVG paths for a profile inside a box of `width` × `height`, with `pad` kept clear on
 * each side. A flat track is drawn mid-height rather than dividing by zero.
 */
export function profileGeometry(
  profile: Profile,
  width: number,
  height: number,
  pad: { top: number; right: number; bottom: number; left: number },
): ProfileGeometry {
  const innerWidth = Math.max(1, width - pad.left - pad.right);
  const innerHeight = Math.max(1, height - pad.top - pad.bottom);
  const range = profile.maxElevation - profile.minElevation;
  const x = (distance: number) => pad.left + (distance / profile.totalMeters) * innerWidth;
  const y = (elevation: number) =>
    range === 0 ? pad.top + innerHeight / 2 : pad.top + (1 - (elevation - profile.minElevation) / range) * innerHeight;
  const points = profile.samples.map((sample) => `${x(sample.distance).toFixed(1)},${y(sample.elevation).toFixed(1)}`);
  const line = `M${points.join("L")}`;
  const base = (pad.top + innerHeight).toFixed(1);
  const area = `${line}L${x(profile.samples.at(-1)!.distance).toFixed(1)},${base}L${x(profile.samples[0]!.distance).toFixed(1)},${base}Z`;
  return { line, area, x, y };
}

/** The sample closest to a distance along the track. */
export function sampleAt(profile: Profile, distance: number): ProfileSample {
  const { samples } = profile;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle]!.distance <= distance) low = middle;
    else high = middle;
  }
  const a = samples[low]!;
  const b = samples[high]!;
  return Math.abs(a.distance - distance) <= Math.abs(b.distance - distance) ? a : b;
}

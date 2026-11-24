/**
 * The ground track drawn flat: where on the Earth a satellite is overhead over a stretch of
 * time, on a plain latitude and longitude map (equirectangular, 84° N to 84° S), with
 * Home, the ring a satellite must be inside to be above Home's horizon, night as at one
 * moment, and the track's times every 10 minutes labelled where they fit.
 *
 * Pure: the screen (ground-track-map.tsx) and the paper (diagrams.ts, "Over the ground") both
 * draw from what is worked out here, each in its own colours. Positions come from the
 * engine (SGP4); night comes from the map's own grey line (maps/grey-line/geometry.ts).
 */
import { compassPoint } from "@outpost/shared";
import { greyLineData } from "@/features/maps/grey-line/geometry";
import type { LandShapes } from "@/features/propagation/print/radio-diagrams";
import { footprintRadiusKm, footprintRing, type ObserverLocation, type Orbit, satelliteState, satrecOf } from "./engine";
import { utcTime } from "./words";

export const NORTH = 84;
export const SOUTH = -84;
/** Ticks on the track, and the rows of its table, every this many minutes. */
export const TICK_MINUTES = 10;
const STEP_GRID_MS = 30_000;

export type LonLat = [lon: number, lat: number];
export type XY = [x: number, y: number];

export interface Box {
  width: number;
  height: number;
}

/** The height of the map for a width: 360° across, 168° down. */
export const heightFor = (width: number) => Math.round((width * (NORTH - SOUTH)) / 360);

export const boxOf = (width: number): Box => ({ width, height: heightFor(width) });

export function project([lon, lat]: LonLat, box: Box): XY {
  return [((lon + 180) / 360) * box.width, ((NORTH - lat) / (NORTH - SOUTH)) * box.height];
}

const r1 = (value: number) => Math.round(value * 10) / 10;

export const pathOf = (points: LonLat[], box: Box) =>
  points
    .map((point, index) => {
      const [x, y] = project(point, box);
      return `${index === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`;
    })
    .join("");

// ── Sampling ─────────────────────────────────────────────────────────────────

export interface TrackSample {
  at: Date;
  lat: number;
  lon: number;
  altitudeKm: number;
  /** Seen from the observer; null with no place. */
  azimuthDeg: number | null;
  elevationDeg: number | null;
}

/**
 * The satellite every `stepSeconds` (a whole number of 30 s) from `from` to `to`, on a grid
 * of whole 30 s from 1970, so every tick (each 10 minutes of UTC) is a sample itself.
 */
export function sampleTrack(orbit: Orbit, observer: ObserverLocation | null, from: Date, to: Date, stepSeconds = 30): TrackSample[] {
  const satrec = satrecOf(orbit);
  const step = Math.max(STEP_GRID_MS, Math.round((stepSeconds * 1000) / STEP_GRID_MS) * STEP_GRID_MS);
  const tick = TICK_MINUTES * 60_000;
  const start = Math.ceil(from.getTime() / STEP_GRID_MS) * STEP_GRID_MS;
  const times = new Set<number>();
  for (let time = start; time <= to.getTime(); time += step) times.add(time);
  // The ticks too, when the step is longer than 30 s.
  for (let time = Math.ceil(start / tick) * tick; time <= to.getTime(); time += tick) times.add(time);
  const samples: TrackSample[] = [];
  for (const time of [...times].sort((a, b) => a - b)) {
    try {
      const state = satelliteState(satrec, observer ?? { lat: 0, lon: 0 }, new Date(time));
      samples.push({
        at: state.at,
        lat: state.lat,
        lon: state.lon,
        altitudeKm: state.altitudeKm,
        azimuthDeg: observer ? state.azimuthDeg : null,
        elevationDeg: observer ? state.elevationDeg : null,
      });
    } catch {
      // A moment SGP4 will not give is left out; the line joins over it.
    }
  }
  return samples;
}

/** Turns a day, from the elements. */
export function revolutionsPerDay(orbit: Orbit): number {
  return (satrecOf(orbit).no * 1440) / (2 * Math.PI);
}

/** A geostationary satellite: once round a sidereal day, near the equator's plane. */
export function isStationary(revsPerDay: number, inclinationDeg: number): boolean {
  return Math.abs(revsPerDay - 1.0027) < 0.02 && inclinationDeg < 3;
}

export function stationary(orbit: Orbit): boolean {
  const satrec = satrecOf(orbit);
  return isStationary(revolutionsPerDay(orbit), (satrec.inclo * 180) / Math.PI);
}

// ── The date line ──────────────────────────────────────────────────────────────

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * A line of points cut where it crosses the date line, each piece between −180° and 180°
 * and reaching the edge where it is cut (the latitude there found along the line), so the
 * line runs off one side and on at the other with no gap and no stroke across the map.
 */
export function splitAtDateLine(points: LonLat[]): LonLat[][] {
  if (points.length === 0) return [];
  // Unwrapped: each point within half a turn of the one before.
  const line: LonLat[] = [];
  for (const [lon, lat] of points) {
    const previous = line.at(-1);
    let next = lon;
    if (previous) {
      while (next - previous[0] > 180) next -= 360;
      while (next - previous[0] < -180) next += 360;
    }
    line.push([next, lat]);
  }
  const pieces: LonLat[][] = [];
  const worldOf = (lon: number) => Math.floor((lon + 180) / 360);
  let world = worldOf(line[0]![0]);
  let piece: LonLat[] = [[line[0]![0] - world * 360, line[0]![1]]];
  for (let index = 1; index < line.length; index += 1) {
    const [lon0, lat0] = line[index - 1]!;
    const [lon1, lat1] = line[index]!;
    const next = worldOf(lon1);
    while (next !== world) {
      const goingEast = next > world;
      const edge = (goingEast ? world + 1 : world) * 360 - 180;
      const t = (edge - lon0) / (lon1 - lon0);
      const lat = lat0 + t * (lat1 - lat0);
      piece.push([goingEast ? 180 : -180, lat]);
      pieces.push(piece);
      world += goingEast ? 1 : -1;
      piece = [[goingEast ? -180 : 180, lat]];
    }
    piece.push([lon1 - world * 360, lat1]);
  }
  pieces.push(piece);
  return pieces.filter((item) => item.length > 1);
}

// ── The track in runs of one look ────────────────────────────────────────────

export interface Run {
  points: LonLat[];
  /** Above the observer's horizon: drawn heavier. */
  up: boolean;
  /** Before now: drawn broken. */
  past: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The track cut into runs that each look one way: above the horizon or not, before now
 * or not, then cut at the date line. Where it rises or sets, and where now falls, are
 * found between samples, so the heavy part starts where the satellite rises.
 */
export function trackRuns(samples: TrackSample[], now: Date | null): Run[] {
  const runs: Array<{ points: LonLat[]; up: boolean; past: boolean }> = [];
  const nowMs = now?.getTime() ?? Number.NEGATIVE_INFINITY;
  const add = (point: LonLat, up: boolean, past: boolean, joinPrevious: LonLat | null) => {
    const last = runs.at(-1);
    if (last && last.up === up && last.past === past) last.points.push(point);
    else runs.push({ points: joinPrevious ? [joinPrevious, point] : [point], up, past });
  };
  let previousPoint: LonLat | null = null;
  for (let index = 0; index < samples.length; index += 1) {
    const b = samples[index]!;
    const a = samples[index - 1];
    if (!a) {
      previousPoint = [b.lon, b.lat];
      continue;
    }
    // Unwrapped from the point before, so a cut between them is placed along the line.
    let lonB = b.lon;
    while (lonB - a.lon > 180) lonB -= 360;
    while (lonB - a.lon < -180) lonB += 360;
    const cuts = [0, 1];
    const t0 = a.at.getTime();
    const t1 = b.at.getTime();
    if (nowMs > t0 && nowMs < t1) cuts.push((nowMs - t0) / (t1 - t0));
    if (a.elevationDeg !== null && b.elevationDeg !== null && a.elevationDeg >= 0 !== b.elevationDeg >= 0)
      cuts.push(a.elevationDeg / (a.elevationDeg - b.elevationDeg));
    cuts.sort((x, y) => x - y);
    for (let cut = 1; cut < cuts.length; cut += 1) {
      const from = cuts[cut - 1]!;
      const to = cuts[cut]!;
      if (to - from < 1e-9) continue;
      const mid = (from + to) / 2;
      const up = a.elevationDeg !== null && b.elevationDeg !== null && lerp(a.elevationDeg, b.elevationDeg, mid) >= 0;
      const past = lerp(t0, t1, mid) < nowMs;
      const point: LonLat = [lerp(a.lon, lonB, to), lerp(a.lat, b.lat, to)];
      add(point, up, past, previousPoint);
      previousPoint = point;
    }
  }
  return runs.flatMap((run) => splitAtDateLine(run.points).map((points) => ({ points, up: run.up, past: run.past })));
}

// ── When it is above the horizon ────────────────────────────────────────────

export interface UpSpan {
  from: Date;
  to: Date;
  fromAzimuthDeg: number;
  toAzimuthDeg: number;
  /** It was up already when the stretch began, or still up when it ended. */
  openStart: boolean;
  openEnd: boolean;
}

function crossing(a: TrackSample, b: TrackSample): { at: Date; azimuthDeg: number } {
  const t = a.elevationDeg! / (a.elevationDeg! - b.elevationDeg!);
  let azB = b.azimuthDeg!;
  while (azB - a.azimuthDeg! > 180) azB -= 360;
  while (azB - a.azimuthDeg! < -180) azB += 360;
  return {
    at: new Date(lerp(a.at.getTime(), b.at.getTime(), t)),
    azimuthDeg: (lerp(a.azimuthDeg!, azB, t) + 360) % 360,
  };
}

/** Each stretch of the samples during which the satellite is above the observer's horizon. */
export function upSpans(samples: TrackSample[]): UpSpan[] {
  const spans: UpSpan[] = [];
  let open: { at: Date; azimuthDeg: number; openStart: boolean } | null = null;
  samples.forEach((sample, index) => {
    if (sample.elevationDeg === null || sample.azimuthDeg === null) return;
    const before = samples[index - 1];
    const up = sample.elevationDeg >= 0;
    if (!before || before.elevationDeg === null) {
      if (up) open = { at: sample.at, azimuthDeg: sample.azimuthDeg, openStart: true };
      return;
    }
    const wasUp = before.elevationDeg >= 0;
    if (up && !wasUp) open = { ...crossing(before, sample), openStart: false };
    else if (!up && wasUp && open) {
      const end = crossing(before, sample);
      spans.push({
        from: open.at,
        to: end.at,
        fromAzimuthDeg: open.azimuthDeg,
        toAzimuthDeg: end.azimuthDeg,
        openStart: open.openStart,
        openEnd: false,
      });
      open = null;
    }
  });
  const last = samples.at(-1);
  const still = open as { at: Date; azimuthDeg: number; openStart: boolean } | null;
  if (still && last?.azimuthDeg != null)
    spans.push({
      from: still.at,
      to: last.at,
      fromAzimuthDeg: still.azimuthDeg,
      toAzimuthDeg: last.azimuthDeg,
      openStart: still.openStart,
      openEnd: true,
    });
  return spans;
}

/** Where the satellite is overhead at a moment inside the samples, found between the two either side. */
export function pointAt(samples: TrackSample[], ms: number): { lat: number; lon: number; altitudeKm: number } | null {
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1]!;
    const b = samples[index]!;
    if (ms < a.at.getTime() || ms > b.at.getTime()) continue;
    const t = (ms - a.at.getTime()) / Math.max(1, b.at.getTime() - a.at.getTime());
    let lonB = b.lon;
    while (lonB - a.lon > 180) lonB -= 360;
    while (lonB - a.lon < -180) lonB += 360;
    return { lat: lerp(a.lat, b.lat, t), lon: wrap(lerp(a.lon, lonB, t)), altitudeKm: lerp(a.altitudeKm, b.altitudeKm, t) };
  }
  return null;
}

/** The samples on each whole 10 minutes of UTC: the ticks on the track and the rows of its table. */
export function ticksOf(samples: TrackSample[], everyMinutes = TICK_MINUTES): TrackSample[] {
  const every = everyMinutes * 60_000;
  return samples.filter((sample) => sample.at.getTime() % every === 0);
}

// ── Labels that keep out of each other's way ────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placed {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  text: string;
  box: Rect;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** A rough width for figures and a colon in the typeface: wide enough to keep labels apart. */
export const textWidth = (text: string, size: number) => text.length * size * 0.62;

/**
 * Labels beside points, in the order given (the most wanted first): each tried right,
 * left, above, below and at the corners, and kept at the first place that is inside the
 * box and clear of every label already placed and every obstacle (Home, now). A label
 * with no clear place is left out; its tick is still drawn and its time is in the table.
 */
export function placeLabels(
  items: Array<{ at: XY; text: string }>,
  obstacles: Rect[],
  box: Box,
  size: number,
  gap = 4,
): Array<Placed | null> {
  const placed: Rect[] = [];
  return items.map(({ at: [x, y], text }) => {
    const width = textWidth(text, size);
    const height = size;
    const candidates: Array<[number, number, Placed["anchor"]]> = [
      [x + gap + 2, y + size * 0.35, "start"],
      [x - gap - 2, y + size * 0.35, "end"],
      [x, y - gap - 2, "middle"],
      [x, y + gap + size, "middle"],
      [x + gap, y - gap, "start"],
      [x + gap, y + gap + size * 0.7, "start"],
      [x - gap, y - gap, "end"],
      [x - gap, y + gap + size * 0.7, "end"],
    ];
    for (const [tx, ty, anchor] of candidates) {
      const left = anchor === "start" ? tx : anchor === "end" ? tx - width : tx - width / 2;
      const rect = { x: left - 1, y: ty - height * 0.8 - 1, width: width + 2, height: height + 2 };
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > box.width || rect.y + rect.height > box.height) continue;
      if (placed.some((other) => overlaps(other, rect)) || obstacles.some((other) => overlaps(other, rect))) continue;
      placed.push(rect);
      return { x: tx, y: ty, anchor, text, box: rect };
    }
    return null;
  });
}

/** A square of `size` round a point, for an obstacle. */
export const around = ([x, y]: XY, size: number): Rect => ({ x: x - size / 2, y: y - size / 2, width: size, height: size });

// ── The world: land, night, the ring ────────────────────────────────────────

/** Natural Earth's land as one path, points closer than `minPx` to the one before skipped. */
export function landPath(land: LandShapes | null, box: Box, minPx = 0.7): string {
  if (!land) return "";
  let out = "";
  for (const feature of land.features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons)
      for (const ring of polygon) {
        let last: XY | null = null;
        let part = "";
        let kept = 0;
        ring.forEach((point, index) => {
          const xy = project([point[0]!, point[1]!], box);
          if (last && index < ring.length - 1 && Math.abs(xy[0] - last[0]) < minPx && Math.abs(xy[1] - last[1]) < minPx) return;
          part += `${last ? "L" : "M"}${r1(xy[0])} ${r1(xy[1])}`;
          last = xy;
          kept += 1;
        });
        if (kept >= 3) out += `${part}Z`;
      }
  }
  return out;
}

/** Everywhere the Sun has set at an instant (by sunrise's rule), as one path. */
export function nightPath(ms: number, box: Box): string {
  const data = greyLineData(ms);
  let out = "";
  for (const feature of data.features) {
    const properties = feature.properties as { kind: string; step?: number };
    const geometry = feature.geometry as { type: string; coordinates: unknown };
    if (properties.kind !== "shade" || properties.step !== 0 || geometry.type !== "MultiPolygon") continue;
    for (const polygon of geometry.coordinates as number[][][][])
      for (const ring of polygon) {
        // One point in four, but every corner the cut at the date line and the closing along a pole made.
        const points = ring.filter(
          (point, index) => index % 4 === 0 || index === ring.length - 1 || Math.abs(point[0]!) === 180 || Math.abs(point[1]!) >= 60,
        ) as unknown as LonLat[];
        out += `${pathOf(points, box)}Z`;
      }
  }
  return out;
}

/**
 * The ring round a place inside which a satellite at `altitudeKm` is above that place's
 * horizon, as pieces cut at the date line. A ring round a pole is not closed along it.
 */
export function horizonRing(centre: { lat: number; lon: number }, altitudeKm: number): LonLat[][] {
  return footprintPieces(centre, footprintRadiusKm(altitudeKm));
}

/** A ring `radiusKm` round a point on the ground, in pieces cut at the date line. */
export function footprintPieces(centre: { lat: number; lon: number }, radiusKm: number): LonLat[][] {
  const ring = footprintRing(centre, radiusKm, 3).slice(0, 121);
  return splitAtDateLine(ring.map(([lon, lat]) => [wrap(lon), lat] as LonLat));
}

// ── In words ────────────────────────────────────────────────────────────────

/** "7.6° S, 16.1° W". */
export const overWords = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(wrap(lon)).toFixed(1)}° ${wrap(lon) >= 0 ? "E" : "W"}`;

/** "25.8° E" for a longitude alone. */
export const longitudeWords = (lon: number) => `${Math.abs(wrap(lon)).toFixed(1)}° ${wrap(lon) >= 0 ? "E" : "W"}`;

/** "06:14 to 06:24 UTC, N to WSW". */
export function spanWords(span: UpSpan): string {
  const when = span.openEnd
    ? `from ${utcTime(span.from)} UTC (still up at ${utcTime(span.to)})`
    : `${utcTime(span.from)} to ${utcTime(span.to)} UTC`;
  return `${when}, ${compassPoint(span.fromAzimuthDeg)} to ${compassPoint(span.toAzimuthDeg)}`;
}

/**
 * The drawing said in words, for its caption: where it is now, and when in the stretch
 * drawn it is above the place ("Above Home 06:14 to 06:24 UTC, N to WSW."), or when next
 * if it is not.
 */
export function trackWords(input: {
  now: TrackSample | null;
  spans: UpSpan[];
  placeName: string | null;
  /** The first pass after the stretch, when none is inside it. */
  next: Date | null;
  stretch: string;
}): string {
  const said: string[] = [];
  if (input.now) said.push(`Now over ${overWords(input.now.lat, input.now.lon)}.`);
  if (input.placeName) {
    if (input.spans.length === 0)
      said.push(
        input.next
          ? `Not above ${input.placeName} in ${input.stretch}; next up at ${utcTime(input.next)} UTC.`
          : `Not above ${input.placeName} in ${input.stretch}, nor in the next 24 hours.`,
      );
    else if (input.spans.length === 1 && input.spans[0]!.openStart && input.spans[0]!.openEnd)
      said.push(`Above ${input.placeName} all through ${input.stretch}.`);
    else said.push(`Above ${input.placeName} ${input.spans.map(spanWords).join("; and ")}.`);
  }
  return said.join(" ");
}

// ── All of it for one drawing ────────────────────────────────────────────────

export interface TrackFigure {
  box: Box;
  land: string;
  night: string;
  runs: Array<{ d: string; up: boolean; past: boolean }>;
  ring: string[];
  home: XY | null;
  now: XY | null;
  ticks: Array<{ at: Date; xy: XY; label: Placed | null }>;
}

/**
 * What to draw, at a width: land, night as at `nightAt`, the track in its runs, the ring
 * round Home for the satellite's height at `ringAltitudeKm`, Home, now, and a tick each
 * 10 minutes with its time where it fits (fewer times on a narrow drawing). `marks` are points labels keep clear of
 * (the rise, highest and set marks on paper).
 */
export function trackFigure(input: {
  width: number;
  samples: TrackSample[];
  land: LandShapes | null;
  nightAt: number;
  home: { lat: number; lon: number } | null;
  now: TrackSample | null;
  ringAltitudeKm: number | null;
  labelSize: number;
  marks?: LonLat[];
  /** Times to label first (the rise and set), before the rest. */
  first?: number[];
}): TrackFigure {
  const box = boxOf(input.width);
  const home = input.home ? project([input.home.lon, input.home.lat], box) : null;
  const now = input.now ? project([input.now.lon, input.now.lat], box) : null;
  const ticks = ticksOf(input.samples);
  const obstacles: Rect[] = [];
  if (home) obstacles.push(around(home, 14));
  if (now) obstacles.push(around(now, 16));
  for (const mark of input.marks ?? []) obstacles.push(around(project(mark, box), 13));
  // Ticks keep each other's labels off themselves too.
  for (const tick of ticks) obstacles.push(around(project([tick.lon, tick.lat], box), 5));
  const first = new Set(input.first ?? []);
  // Time labels no closer than about one per 40 units of width: every tick on paper or a wide screen, fewer on a phone.
  const minutes = ticks.length > 1 ? (ticks.at(-1)!.at.getTime() - ticks[0]!.at.getTime()) / 60_000 : 0;
  const every = [10, 20, 30, 60, 120, 360].find((step) => minutes / step <= input.width / 40) ?? 720;
  const ordered = [...ticks].filter((tick) => first.has(tick.at.getTime()) || tick.at.getTime() % (every * 60_000) === 0);
  ordered.sort((a, b) => {
    const rank = (sample: TrackSample) =>
      first.has(sample.at.getTime()) ? 0 : sample.at.getTime() % 3_600_000 === 0 ? 1 : sample.at.getTime() % 1_800_000 === 0 ? 2 : 3;
    return rank(a) - rank(b) || a.at.getTime() - b.at.getTime();
  });
  const labels = placeLabels(
    ordered.map((tick) => ({ at: project([tick.lon, tick.lat], box), text: utcTime(tick.at) })),
    obstacles,
    box,
    input.labelSize,
  );
  const labelOf = new Map(ordered.map((tick, index) => [tick.at.getTime(), labels[index] ?? null]));
  return {
    box,
    land: landPath(input.land, box),
    night: nightPath(input.nightAt, box),
    runs: trackRuns(input.samples, input.now?.at ?? null).map((run) => ({ d: pathOf(run.points, box), up: run.up, past: run.past })),
    ring:
      input.home && input.ringAltitudeKm !== null ? horizonRing(input.home, input.ringAltitudeKm).map((piece) => pathOf(piece, box)) : [],
    home,
    now,
    ticks: ticks.map((tick) => ({ at: tick.at, xy: project([tick.lon, tick.lat], box), label: labelOf.get(tick.at.getTime()) ?? null })),
  };
}

/**
 * The pass drawn for paper, from the pass's own look angles (engine.ts, passSkyPath):
 * the sky track as the screen draws it (sky-plot.tsx), with where it rises, peaks and
 * sets marked and timed, and its height above the horizon minute by minute.
 */
import { compassPoint } from "@outpost/shared";
import { PRINT_COLOURS as C, chart, type Drawing, drawing, round, svgArrowHead, svgText } from "@/features/print-kit";
import type { LandShapes } from "@/features/propagation/print/radio-diagrams";
import type { SatellitePass, SatelliteState } from "./engine";
import { type LonLat, NORTH, pointAt, project, SOUTH, type TrackSample, trackFigure } from "./ground-track";
import { skyPoint } from "./sky-plot";
import { utcTime } from "./words";

/** Colours for the three moments, each also told apart by its mark's shape. */
export const MOMENT = { rise: C.accent, highest: C.act, set: C.know } as const;

const ring = (cx: number, cy: number, r: number, stroke: string, width: number, dash?: string) =>
  `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

/** An open circle where it rises, a filled diamond at its highest, a square where it sets. */
function momentMark(kind: keyof typeof MOMENT, [x, y]: [number, number]): string {
  const colour = MOMENT[kind];
  if (kind === "rise") return `<circle cx="${round(x)}" cy="${round(y)}" r="4" fill="#ffffff" stroke="${colour}" stroke-width="1.8"/>`;
  if (kind === "highest")
    return `<path d="M${round(x)},${round(y - 5.5)} L${round(x + 5.5)},${round(y)} L${round(x)},${round(y + 5.5)} L${round(x - 5.5)},${round(y)} Z" fill="${colour}" stroke="#ffffff" stroke-width="0.8"/>`;
  return `<rect x="${round(x - 4)}" y="${round(y - 4)}" width="8" height="8" fill="${colour}" stroke="#ffffff" stroke-width="0.8"/>`;
}

/**
 * The sky seen from below, north at the top and east to the right: the horizon as the
 * outer ring, 30° and 60° above it as the dashed rings, straight up at the centre. The
 * track runs from the rise to the set, with an arrowhead the way it goes and a dot each
 * minute.
 */
export function skyPlot(pass: SatellitePass, path: SatelliteState[], size = 236): Drawing {
  const pad = 30;
  const radius = size / 2 - pad;
  const cx = size / 2;
  const cy = size / 2;
  let body = `<circle cx="${cx}" cy="${cy}" r="${round(radius)}" fill="${C.accentSoft}"/>`;
  body += ring(cx, cy, radius, C.muted, 1);
  for (const elevation of [30, 60]) {
    const r = ((90 - elevation) / 90) * radius;
    body += ring(cx, cy, r, C.rule, 0.6, "3 2");
    body += svgText(cx + 3, cy - r - 2.5, `${elevation}°`, { size: 6.5, fill: C.muted });
  }
  body += `<line x1="${round(cx - radius)}" y1="${cy}" x2="${round(cx + radius)}" y2="${cy}" stroke="${C.rule}" stroke-width="0.5"/>`;
  body += `<line x1="${cx}" y1="${round(cy - radius)}" x2="${cx}" y2="${round(cy + radius)}" stroke="${C.rule}" stroke-width="0.5"/>`;
  const points = path.map((point) => skyPoint(point.azimuthDeg, point.elevationDeg, cx, cy, radius));
  // Always up (geostationary): one place in the sky, no track and no rise or set.
  const up = pass.alwaysUp === true;
  if (points.length > 1 && !up) {
    body += `<polyline points="${points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ")}" fill="none" stroke="${C.accent}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const [x, y] of points.slice(1, -1)) body += `<circle cx="${round(x)}" cy="${round(y)}" r="1.4" fill="${C.accent}"/>`;
    // An arrowhead a little past the middle, the way the satellite goes.
    const at = Math.min(points.length - 1, Math.max(1, Math.round(points.length * 0.62)));
    const [x1, y1] = points[at - 1]!;
    const [x2, y2] = points[at]!;
    if (Math.hypot(x2 - x1, y2 - y1) > 0.5) body += svgArrowHead(x2, y2, (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI, C.accent, 7);
  }
  const moments: Array<[keyof typeof MOMENT, number, number, Date]> = up
    ? [["highest", pass.tcaAzimuthDeg, pass.maxElevationDeg, pass.tca]]
    : [
        ["rise", pass.aosAzimuthDeg, 0, pass.aos],
        ["highest", pass.tcaAzimuthDeg, pass.maxElevationDeg, pass.tca],
        ["set", pass.losAzimuthDeg, 0, pass.los],
      ];
  const labels: Array<[number, number]> = [];
  for (const [kind, azimuth, elevation, at] of moments) {
    const [x, y] = skyPoint(azimuth, elevation, cx, cy, radius);
    body += momentMark(kind, [x, y]);
    // The time beside the mark, out from the centre (in from the edge for the highest, which may be near it).
    const angle = (azimuth * Math.PI) / 180;
    const away = kind === "highest" && elevation < 60 ? -13 : 13;
    const lx = x + Math.sin(angle) * away;
    const ly = y - Math.cos(angle) * away + 2.5;
    const anchor = Math.abs(Math.sin(angle)) < 0.3 ? "middle" : Math.sin(angle) * Math.sign(away) > 0 ? "start" : "end";
    const tx = Math.min(size - 2, Math.max(2, lx));
    const ty = Math.min(size - 2, Math.max(8, ly));
    labels.push([tx + (anchor === "start" ? 10 : anchor === "end" ? -10 : 0), ty]);
    body += svgText(tx, ty, up ? `${Math.round(elevation)}°` : utcTime(at), {
      anchor,
      bold: true,
      size: 7,
      fill: MOMENT[kind],
    });
  }
  // The compass letters, each left out where a moment's time is written over it.
  const letters: Array<[string, number, number, "start" | "middle" | "end"]> = [
    ["N", cx, cy - radius - 5, "middle"],
    ["S", cx, cy + radius + 12, "middle"],
    ["E", cx + radius + 5, cy + 3, "start"],
    ["W", cx - radius - 5, cy + 3, "end"],
  ];
  for (const [letter, x, y, anchor] of letters) {
    const near = labels.some(([lx, ly]) => Math.abs(lx - x) < 22 && Math.abs(ly - y) < 20);
    if (!near) body += svgText(x, y, letter, { anchor, bold: true, size: 9, fill: letter === "N" ? C.ink : C.muted });
  }
  return drawing(size, size, body);
}

/** How high the satellite stands, minute by minute, with the three moments marked. */
export function elevationChart(pass: SatellitePass, path: SatelliteState[], width: number, height = 190): Drawing {
  const start = pass.aos.getTime();
  const minutes = path.map((point) => (point.at.getTime() - start) / 60_000);
  const top = Math.max(30, Math.ceil(pass.maxElevationDeg / 10) * 10);
  const span = Math.max(1, (pass.los.getTime() - start) / 60_000);
  const step = span > 12 ? 3 : span > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let minute = 0; minute <= span + 0.01; minute += step) ticks.push(minute);
  return chart({
    width,
    height,
    xs: minutes,
    series: [
      {
        kind: "line",
        name: "Height above the horizon",
        values: path.map((point) => Math.max(0, point.elevationDeg)),
        colour: C.accent,
        smooth: true,
        dots: true,
      },
    ],
    yDomain: [0, top],
    xDomain: [0, span],
    xTicks: ticks,
    xTick: (minute) => utcTime(start + minute * 60_000),
    yTick: (degrees) => `${degrees}°`,
    xLabel: "UTC",
    rules: [{ y: pass.maxElevationDeg, words: `Highest ${Math.round(pass.maxElevationDeg)}°`, colour: MOMENT.highest }],
    key: false,
  });
}

/** "Rise: 14:22 UTC, 194° SSW", for words beside the drawing. */
export const momentWords = (at: Date, azimuth: number) => `${utcTime(at)} UTC, ${Math.round(azimuth)}° ${compassPoint(azimuth)}`;

/** The ground under the pass, for paper: what the figure needs besides the pass. */
export interface PassGround {
  /** From 45 minutes before the rise to 45 after the set (ground-track.ts, sampleTrack). */
  samples: TrackSample[];
  home: { lat: number; lon: number };
  land: LandShapes | null;
}

/** A house, for Home: the set's square is taken. */
const house = (x: number, y: number) =>
  `<path d="M${round(x)},${round(y - 5.5)} L${round(x + 5)},${round(y - 1)} L${round(x + 5)},${round(y + 4.5)} L${round(x - 5)},${round(y + 4.5)} L${round(x - 5)},${round(y - 1)} Z" fill="${C.ink}" stroke="#ffffff" stroke-width="0.9"/>`;

/**
 * Over the ground: the track from 45 minutes before the rise to 45 after the set on a
 * flat world, with night as at the highest point, the part above the horizon heavy,
 * Home, the ring inside which the satellite is above Home's horizon (dashed), a tick each
 * 10 minutes with its time, and the rise, highest and set marked as in the sky plot.
 * The same geometry as the screen's ground track (ground-track.ts). Greys apart: heavy
 * against thin, dashed against whole, and each mark its own shape.
 */
export function overTheGround(pass: SatellitePass, ground: PassGround, width: number): Drawing {
  const at = (ms: number): LonLat | null => {
    const point = pointAt(ground.samples, ms);
    return point ? [point.lon, point.lat] : null;
  };
  const moments: Array<[keyof typeof MOMENT, LonLat | null]> = pass.alwaysUp
    ? [["highest", at(pass.tca.getTime())]]
    : [
        ["rise", at(pass.aos.getTime())],
        ["highest", at(pass.tca.getTime())],
        ["set", at(pass.los.getTime())],
      ];
  const figure = trackFigure({
    width,
    samples: ground.samples,
    land: ground.land,
    nightAt: pass.tca.getTime(),
    home: ground.home,
    now: null,
    ringAltitudeKm: pointAt(ground.samples, pass.tca.getTime())?.altitudeKm ?? null,
    labelSize: 6.5,
    marks: moments.flatMap(([, point]) => (point ? [point] : [])),
  });
  const { box } = figure;
  const { width: w, height: h } = box;
  let body = `<clipPath id="ground"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath><g clip-path="url(#ground)">`;
  body += `<rect x="0" y="0" width="${w}" height="${h}" fill="#f3f6f7"/>`;
  if (figure.land) body += `<path d="${figure.land}" fill="#dcdfd6" stroke="#b3b8ab" stroke-width="0.3"/>`;
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = project([lon, 0], box);
    body += `<line x1="${round(x)}" y1="0" x2="${round(x)}" y2="${h}" stroke="#ffffff" stroke-width="0.5"/>`;
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    if (lat > NORTH || lat < SOUTH) continue;
    const [, y] = project([0, lat], box);
    body += `<line x1="0" y1="${round(y)}" x2="${w}" y2="${round(y)}" stroke="#ffffff" stroke-width="${lat === 0 ? 0.9 : 0.5}"/>`;
  }
  if (figure.night) body += `<path d="${figure.night}" fill="${C.ink}" fill-opacity="0.16"/>`;
  for (const d of figure.ring) body += `<path d="${d}" fill="none" stroke="${C.act}" stroke-width="0.9" stroke-dasharray="3 2"/>`;
  for (const run of figure.runs.filter((item) => !item.up))
    body += `<path d="${run.d}" fill="none" stroke="${C.muted}" stroke-width="0.9" stroke-linejoin="round"/>`;
  for (const run of figure.runs.filter((item) => item.up))
    body += `<path d="${run.d}" fill="none" stroke="${C.accent}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const tick of figure.ticks)
    body += `<circle cx="${round(tick.xy[0])}" cy="${round(tick.xy[1])}" r="1.8" fill="#ffffff" stroke="${C.ink}" stroke-width="0.7"/>`;
  for (const tick of figure.ticks) {
    if (!tick.label) continue;
    const label = tick.label.box;
    body += `<rect x="${round(label.x)}" y="${round(label.y)}" width="${round(label.width)}" height="${round(label.height)}" fill="#ffffff" fill-opacity="0.8"/>`;
    body += svgText(tick.label.x, tick.label.y, tick.label.text, { size: 6.5, bold: true, anchor: tick.label.anchor });
  }
  if (figure.home) body += house(figure.home[0], figure.home[1]);
  for (const [kind, point] of moments) if (point) body += momentMark(kind, project(point, box));
  body += `</g><rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${C.rule}" stroke-width="0.6"/>`;
  return drawing(w, h, body);
}

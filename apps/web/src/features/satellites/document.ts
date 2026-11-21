/**
 * One pass on paper, to take outside with a handheld and a compass: when it rises, peaks
 * and sets (UTC and local), where to point minute by minute, what to tune to through it
 * for each published transmitter, and how old the elements were. Set with the same blocks
 * as a communication plan, and made on this device.
 */
import { compassPoint, elementsAgeWarning, type SatelliteTransmitter } from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import { INK, MUTED, type Rgb, type SheetItem } from "@/features/maps/print/sheet";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { formatDate } from "@/lib/utils";
import { dopplerTuning, type SatellitePass, type SatelliteState } from "./engine";
import { skyPoint } from "./sky-plot";
import { bothTimes, frequencyWords, pathWords, utcTime } from "./words";

export interface PassSheet {
  name: string;
  noradId: number;
  epoch: number;
  place: string;
  pass: SatellitePass;
  /** Look angles through the pass, about one a minute. */
  path: SatelliteState[];
  transmitters: SatelliteTransmitter[];
  written: Date;
  licensed: boolean;
}

export const passTitle = (sheet: Pick<PassSheet, "name" | "pass">) =>
  `Satellite pass, ${sheet.name}, ${formatDate(sheet.pass.aos.getTime())} ${utcTime(sheet.pass.aos)} UTC`;

export function passBlocks(sheet: PassSheet): Block[] {
  const { pass, path } = sheet;
  const warning = elementsAgeWarning(sheet.epoch, sheet.written.getTime());
  const blocks: Block[] = [
    { kind: "title", text: `${sheet.name}: pass on ${formatDate(pass.aos.getTime())}` },
    {
      kind: "para",
      text: `Seen from ${sheet.place}. Rises ${bothTimes(pass.aos)}, highest ${bothTimes(pass.tca)}, sets ${bothTimes(pass.los)}: ${Math.round(pass.durationSeconds / 60)} minutes. ${pathWords(pass)}.`,
    },
    {
      kind: "para",
      text: `Worked out on this device with SGP4 from CelesTrak's elements for NORAD ${sheet.noradId}, dated ${formatDate(sheet.epoch)} ${utcTime(sheet.epoch)} UTC.${warning ? ` ${warning}` : ""} A wrong clock makes every time here wrong.`,
    },
    { kind: "heading", text: "Where to point" },
    {
      kind: "drawing",
      height: SKY_HEIGHT,
      words: `Sky track, north at the top, the horizon as the outer ring and straight up at the centre. ${skyWords(pass)}`,
      draw: (x0, y0, width) => skyDrawing(pass, path, x0, y0, width),
    },
    {
      kind: "table",
      head: ["UTC", "Bearing", "Elevation", "Distance"],
      right: [1, 2, 3],
      rows: path.map((point) => [
        utcTime(point.at),
        `${Math.round(point.azimuthDeg)}° ${compassPoint(point.azimuthDeg)}`,
        `${Math.max(0, Math.round(point.elevationDeg))}°`,
        `${Math.round(point.rangeKm).toLocaleString("en-GB")} km`,
      ]),
    },
  ];
  const marks = [
    path[0],
    path.reduce((best, point) => (point.elevationDeg > best.elevationDeg ? point : best), path[0]!),
    path.at(-1),
  ].filter((point): point is SatelliteState => Boolean(point));
  for (const transmitter of sheet.transmitters) {
    const down = transmitter.downlinkLowHz;
    const up = transmitter.uplinkLowHz;
    blocks.push({ kind: "heading", text: `${transmitter.description}${transmitter.mode ? `, ${transmitter.mode}` : ""}` });
    blocks.push({
      kind: "table",
      head: ["", "UTC", ...(down ? ["Listen on"] : []), ...(up ? [sheet.licensed ? "Send on" : "Uplink (licence needed to send)"] : [])],
      rows: marks.map((point, index) => {
        const tuned = dopplerTuning(point.rangeRateKmS, down, up);
        return [
          ["Rise", "Highest", "Set"][index] ?? "",
          utcTime(point.at),
          ...(tuned.downlinkHz ? [frequencyWords(tuned.downlinkHz)] : []),
          ...(tuned.uplinkHz ? [frequencyWords(tuned.uplinkHz)] : []),
        ];
      }),
    });
  }
  blocks.push({
    kind: "para",
    text: "Frequencies and modes from SatNOGS DB (CC BY-SA 4.0); orbital elements from CelesTrak. A transmitter listed as in use may still be off.",
  });
  return blocks;
}

const SKY_HEIGHT = 230;
const SKY_RADIUS = 95;
const TRACK: Rgb = [0.13, 0.42, 0.45];
const GRID: Rgb = [0.8, 0.82, 0.83];

const skyWords = (pass: SatellitePass) =>
  `Rises in the ${compassPoint(pass.aosAzimuthDeg)} at ${utcTime(pass.aos)} UTC, highest ${Math.round(pass.maxElevationDeg)}° in the ${compassPoint(pass.tcaAzimuthDeg)} at ${utcTime(pass.tca)} UTC, sets in the ${compassPoint(pass.losAzimuthDeg)} at ${utcTime(pass.los)} UTC.`;

/** A ring drawn as short straight lines; `dashed` leaves every other one out. */
function ring(cx: number, cy: number, radius: number, color: Rgb, width: number, dashed: boolean): SheetItem[] {
  const steps = 72;
  const items: SheetItem[] = [];
  for (let step = 0; step < steps; step += 1) {
    if (dashed && step % 2 === 1) continue;
    const a = (step / steps) * 2 * Math.PI;
    const b = ((step + 1) / steps) * 2 * Math.PI;
    items.push({
      kind: "line",
      x1: cx + Math.sin(a) * radius,
      y1: cy - Math.cos(a) * radius,
      x2: cx + Math.sin(b) * radius,
      y2: cy - Math.cos(b) * radius,
      color,
      width,
    });
  }
  return items;
}

/** A small mark: a filled diamond for the highest point, an open one where it rises. */
function mark([x, y]: [number, number], size: number, filled: boolean): SheetItem[] {
  const points: Array<readonly [number, number]> = [
    [x, y - size],
    [x + size, y],
    [x, y + size],
    [x - size, y],
  ];
  if (filled) return [{ kind: "polygon", points, fill: TRACK }];
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    return { kind: "line", x1: point[0], y1: point[1], x2: next[0], y2: next[1], color: TRACK, width: 1.2 };
  });
}

/**
 * The sky track as the screen draws it (sky-plot.tsx), in the PDF's own lines: the
 * horizon ring, rings at 30° and 60°, the compass points, the track, an open mark where it
 * rises and a filled one at its highest, with a key to the right.
 */
export function skyDrawing(pass: SatellitePass, path: SatelliteState[], x0: number, y0: number, width: number): SheetItem[] {
  const cx = x0 + SKY_RADIUS + 14;
  const cy = y0 + SKY_RADIUS + 16;
  const items: SheetItem[] = [
    ...ring(cx, cy, SKY_RADIUS, MUTED, 0.8, false),
    ...[30, 60].flatMap((elevation) => ring(cx, cy, ((90 - elevation) / 90) * SKY_RADIUS, GRID, 0.5, true)),
    { kind: "line", x1: cx - SKY_RADIUS, y1: cy, x2: cx + SKY_RADIUS, y2: cy, color: GRID, width: 0.5 },
    { kind: "line", x1: cx, y1: cy - SKY_RADIUS, x2: cx, y2: cy + SKY_RADIUS, color: GRID, width: 0.5 },
  ];
  const label = (text: string, x: number, y: number, anchor: "start" | "middle" | "end" = "middle") =>
    items.push({ kind: "text", x, y, text, size: 8, color: MUTED, anchor });
  label("N", cx, cy - SKY_RADIUS - 5);
  label("S", cx, cy + SKY_RADIUS + 11);
  label("E", cx + SKY_RADIUS + 4, cy + 3, "start");
  label("W", cx - SKY_RADIUS - 4, cy + 3, "end");
  label("30°", cx + 3, cy - ((90 - 30) / 90) * SKY_RADIUS - 3, "start");
  label("60°", cx + 3, cy - ((90 - 60) / 90) * SKY_RADIUS - 3, "start");
  for (let index = 1; index < path.length; index += 1) {
    const [x1, y1] = skyPoint(path[index - 1]!.azimuthDeg, path[index - 1]!.elevationDeg, cx, cy, SKY_RADIUS);
    const [x2, y2] = skyPoint(path[index]!.azimuthDeg, path[index]!.elevationDeg, cx, cy, SKY_RADIUS);
    items.push({ kind: "line", x1, y1, x2, y2, color: TRACK, width: 1.8 });
  }
  if (path[0]) items.push(...mark(skyPoint(path[0].azimuthDeg, 0, cx, cy, SKY_RADIUS), 4, false));
  items.push(...mark(skyPoint(pass.tcaAzimuthDeg, pass.maxElevationDeg, cx, cy, SKY_RADIUS), 4.5, true));
  // The key, to the right of the plot when there is room.
  const keyX = cx + SKY_RADIUS + 30;
  if (keyX + 120 <= x0 + width) {
    const lines = [
      "Seen from below, north at the top.",
      "Outer ring: the horizon. Centre: straight up.",
      "Open mark: where it rises.",
      "Filled mark: its highest point.",
    ];
    for (const [at, line] of lines.entries())
      items.push({
        kind: "text",
        x: keyX,
        y: y0 + 40 + at * 13,
        text: line,
        size: 8.5,
        color: at === 0 ? INK : MUTED,
        fit: x0 + width - keyX,
      });
  }
  return items;
}

export function passPdf(sheet: PassSheet): Uint8Array {
  return writePdfPages({
    pages: toSheets(passBlocks(sheet), `${sheet.name} · NORAD ${sheet.noradId} · Outpost`),
    title: passTitle(sheet),
    created: sheet.written,
  });
}

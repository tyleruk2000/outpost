/**
 * The maps of a scenario's PDF as blocks of the page: a picture of the map with its
 * frame, scale bar and north, and the lines under it; or, where no map can be drawn, the
 * rings to scale as a drawing with no map under it, and a line saying why.
 *
 * Pure: the pictures are drawn elsewhere (print-maps.ts) and arrive here as pieces with
 * their places in the box. Every word under a map is real text in the file, so a search
 * of it and a reader that speaks the page have the caveat as well as the eye does.
 */
import { EFFECTS_CAVEAT, type EffectFamily, type EffectsResult, roundDistance, type ScenarioLetter } from "@outpost/shared";
import { wrapText } from "@/features/maps/print/helvetica";
import { type Frame, formatScale, scaleBars, scaleForZoom } from "@/features/maps/print/scale";
import { bar, INK, MUTED, type Rgb, type SheetItem } from "@/features/maps/print/sheet";
import type { Block } from "@/features/propagation/plans/document";
import { printHue } from "./document";
import { destination, plumePolygon } from "./geometry";
import { DRAWN_FALLOUT_RATES, FAMILY_LINES } from "./layers";
import type { MapPart } from "./print-frames";
import { distanceText, listText } from "./words";

/** The words under every map of a pattern: the screen's, said again where the pattern is seen. */
export const PATTERN_CAVEAT =
  "The fallout pattern is an idealised shape for a steady wind, which real fallout never follows: it says nothing about where fallout would land on a real day.";
/** Where an offline map comes from, for the line that says there is none. */
export const GET_A_MAP = "Add a region for this area under Maps, Offline maps, and make the PDF again for a map here.";

const CAPTION = 7;
const CAPTION_LEADING = 8.6;
/** Room under the picture for the scale bar and north, in points: the miles' figures end about 30 below its top. */
const FURNITURE = 42;

/** A piece of a map's picture: its id among the PDF's pictures and its place in the box, in points. */
export interface PicturePiece {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapFigure {
  part: MapPart;
  /** The picture's size on the page, in points, and the pieces it was drawn in. */
  width: number;
  height: number;
  pieces: PicturePiece[];
  /** The view it was drawn at, for its scale. */
  frame: Frame;
  /** The lines under it, in order (see `mapCaptions`). */
  captions: string[];
}

/** The rates a scenario draws, as the map labels them. */
const rate = (value: number) => `${value.toLocaleString("en-GB")} rads per hour`;

/** What a map of a scenario says under itself, beyond the credits: which part it is, the caveat, and for a pattern what the frame reaches. */
export function mapCaptions(input: {
  part: MapPart;
  letters: ScenarioLetter[];
  /** The contour the frame reaches, for the pattern's map; null where the frame is the rings'. */
  reachesRate: number | null;
  /** Whether the scenario (or, on the overview, any of them) has a fallout pattern drawn. */
  pattern: boolean;
  /** Whether a pattern runs past this map's edges (the rings' map of a scenario that has a second map). */
  patternRunsOn: boolean;
  places: boolean;
  /** The credits, written out (credits.ts), and the date of the map's data where it is known. */
  credits: string;
  dataDate: string | null;
  /** A part of the area with no offline map installed, said as a sentence. */
  coverage: string | null;
}): string[] {
  const { part, letters, reachesRate } = input;
  const lines: string[] = [];
  if (part === "overview")
    lines.push(
      `The ${letters.length} scenarios shown, ${listText(letters)}, each at its ground zero with its letter, at a scale that takes them all in. Each is worked out on its own: nothing is added up across them.`,
    );
  else if (part === "pattern")
    lines.push(
      reachesRate === 1
        ? `${letters[0]}: the rings and the whole drawn fallout pattern, out to the contour of ${rate(1)} at one hour.`
        : `${letters[0]}: the rings and the fallout pattern, framed to reach the contour of ${rate(reachesRate ?? 100)} at one hour, as the screen first frames it. The contours of ${listText(
            DRAWN_FALLOUT_RATES.filter((each) => each < (reachesRate ?? 100)).map((each) => each.toLocaleString("en-GB")),
          )} rads per hour run on past the edge of this map; the table gives how far.`,
    );
  else
    lines.push(
      `${letters[0]}: the rings, framed to fill the map${
        input.patternRunsOn
          ? "; the fallout pattern runs on past the edge, and the next map shows it"
          : reachesRate === 1
            ? ", with the whole drawn fallout pattern"
            : ""
      }.`,
    );
  lines.push(EFFECTS_CAVEAT);
  if (input.pattern) lines.push(PATTERN_CAVEAT);
  if (input.places) lines.push("Your saved places are shown, as you chose when the PDF was made.");
  if (input.coverage) lines.push(input.coverage);
  lines.push(input.dataDate ? `Map: ${input.credits}. Map data of ${input.dataDate}.` : `Map: ${input.credits}.`);
  return lines;
}

/** A picture of a map and what goes round it, as one block that is never split across pages. */
export function mapFigureBlock(figure: MapFigure, innerWidth: number): Block {
  const wrapped = figure.captions.map((caption) => wrapText(caption, CAPTION, innerWidth));
  const lines = wrapped.reduce((sum, each) => sum + each.length, 0);
  const scale = scaleForZoom(figure.frame.zoom, figure.frame.center.lat);
  return {
    kind: "drawing",
    height: figure.height + FURNITURE + lines * CAPTION_LEADING + 2,
    words: figure.captions.join(" "),
    draw: (x, y) => {
      const items: SheetItem[] = figure.pieces.map((piece) => ({
        kind: "image",
        id: piece.id,
        x: x + piece.x,
        y: y + piece.y,
        width: piece.width,
        height: piece.height,
      }));
      items.push({ kind: "rect", x, y, width: figure.width, height: figure.height, stroke: INK, lineWidth: 0.6 });
      const top = y + figure.height + 5;
      const { metric, miles } = scaleBars(scale, Math.min(150, figure.width * 0.45));
      bar(items, metric, miles, x, top);
      const longest = Math.max(metric.length, miles.length);
      items.push({
        kind: "text",
        x: x + longest + 26,
        y: top + 13,
        text: `${formatScale(scale)} along the middle of the map`,
        size: 6.5,
        color: MUTED,
      });
      north(items, x + figure.width - 5, top);
      let baseline = top + FURNITURE - 2;
      wrapped.forEach((caption, index) => {
        const last = index === wrapped.length - 1;
        for (const line of caption) {
          items.push({ kind: "text", x, y: baseline, text: line, size: CAPTION, color: last ? INK : MUTED });
          baseline += CAPTION_LEADING;
        }
      });
      return items;
    },
  };
}

/** North: an arrowhead on a stem, with its letter, as on a printed map page. */
function north(items: SheetItem[], arrow: number, top: number): void {
  items.push({
    kind: "polygon",
    points: [
      [arrow, top + 1],
      [arrow + 4, top + 11],
      [arrow, top + 8.8],
      [arrow - 4, top + 11],
    ],
    fill: INK,
  });
  items.push({ kind: "line", x1: arrow, y1: top + 8.5, x2: arrow, y2: top + 24, color: INK, width: 0.8 });
  items.push({ kind: "text", x: arrow - 7, y: top + 10, text: "N", size: 8.5, bold: true, color: INK, anchor: "end" });
}

// ── The diagram, where there is no map ──

/** The drawing's side, in points: the size of the plan's picture on screen. */
export const DIAGRAM_SIZE = 200;

type Point = readonly [number, number];

/** A line drawn in dashes along a path of points: `dash` is the length of a dash and of the gap, in points; null is solid. */
function pathLines(points: Point[], colour: Rgb, width: number, dash: readonly [number, number] | null): SheetItem[] {
  const items: SheetItem[] = [];
  let phase = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1]!;
    const [x2, y2] = points[index]!;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (!(length > 0)) continue;
    if (!dash) {
      items.push({ kind: "line", x1, y1, x2, y2, color: colour, width });
      continue;
    }
    const period = dash[0] + dash[1];
    let at = 0;
    while (at < length) {
      const into = (phase + at) % period;
      // Never a step too small to move on: rounding can leave a sliver of a dash that adding would not change.
      const step = Math.max(1e-3, Math.min(length - at, into < dash[0] ? dash[0] - into : period - into));
      if (into < dash[0]) {
        const from = at / length;
        const to = (at + step) / length;
        items.push({
          kind: "line",
          x1: x1 + (x2 - x1) * from,
          y1: y1 + (y2 - y1) * from,
          x2: x1 + (x2 - x1) * to,
          y2: y1 + (y2 - y1) * to,
          color: colour,
          width,
        });
      }
      at += step;
    }
    phase = (phase + length) % period;
  }
  return items;
}

/** A polygon cut to a square box (Sutherland and Hodgman). */
function clipToBox(points: Point[], left: number, top: number, size: number): Point[] {
  const edges: Array<{ inside: (p: Point) => boolean; cross: (a: Point, b: Point) => Point }> = [
    { inside: (p) => p[0] >= left, cross: (a, b) => [left, a[1] + ((b[1] - a[1]) * (left - a[0])) / (b[0] - a[0])] },
    {
      inside: (p) => p[0] <= left + size,
      cross: (a, b) => [left + size, a[1] + ((b[1] - a[1]) * (left + size - a[0])) / (b[0] - a[0])],
    },
    { inside: (p) => p[1] >= top, cross: (a, b) => [a[0] + ((b[0] - a[0]) * (top - a[1])) / (b[1] - a[1]), top] },
    {
      inside: (p) => p[1] <= top + size,
      cross: (a, b) => [a[0] + ((b[0] - a[0]) * (top + size - a[1])) / (b[1] - a[1]), top + size],
    },
  ];
  let out = points;
  for (const edge of edges) {
    const input = out;
    out = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index + input.length - 1) % input.length]!;
      if (edge.inside(current)) {
        if (!edge.inside(previous)) out.push(edge.cross(previous, current));
        out.push(current);
      } else if (edge.inside(previous)) out.push(edge.cross(previous, current));
    }
    if (out.length === 0) break;
  }
  return out;
}

/** A path split where it leaves the box, keeping only what lies inside, for an edge that must not be drawn along the frame. */
function insideRuns(points: Point[], left: number, top: number, size: number): Point[][] {
  const inside = (p: Point) => p[0] >= left && p[0] <= left + size && p[1] >= top && p[1] <= top + size;
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const point of points) {
    if (inside(point)) run.push(point);
    else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs.filter((each) => each.length > 1);
}

/** A colour as it looks laid over white paper at an opacity. */
const overPaper = (colour: Rgb, opacity: number): Rgb => colour.map((part) => part * opacity + (1 - opacity)) as unknown as Rgb;

/**
 * The rings to scale round ground zero, in the map's hues and lines, the fallout pattern
 * cut at the frame: the same drawing an emergency plan shows (picture.tsx), drawn as
 * lines on the page.
 */
export function diagramBlock(letter: ScenarioLetter, result: EffectsResult): Block {
  const rings = result.rings.filter((ring) => ring.metres !== null);
  const widest = Math.max(1, ...rings.map((ring) => ring.metres!));
  const perMetre = (DIAGRAM_SIZE / 2 - 6) / widest;
  const centre = { lat: 0, lon: 0 };
  const east = destination(centre, 90, 1).lon;
  const north = destination(centre, 0, 1).lat;
  // Paper's 1:n for the drawing: metres of ground to a metre of paper.
  const scale = 1 / perMetre / (0.0254 / 72);
  const { metric, miles } = scaleBars(scale, 110);
  const words = `${letter}: the rings to scale round ground zero, with no map under them; the widest is ${distanceText(roundDistance(widest))} across its radius${result.fallout.drawn ? ", with the idealised fallout pattern cut at the frame" : ""}.`;
  return {
    kind: "drawing",
    height: DIAGRAM_SIZE + FURNITURE,
    words,
    draw: (x, y) => {
      const mid: Point = [x + DIAGRAM_SIZE / 2, y + DIAGRAM_SIZE / 2];
      const toPage = ([lon, lat]: [number, number]): Point => [mid[0] + (lon / east) * perMetre, mid[1] - (lat / north) * perMetre];
      const items: SheetItem[] = [];
      if (result.fallout.drawn) {
        // Paper's fills are solid, so they are laid outermost first, each stronger contour darker over the one outside it,
        // as the screen's translucent ones stack; the edges go on top of all of them.
        const contours = result.fallout.contours
          .filter((contour) => (DRAWN_FALLOUT_RATES as readonly number[]).includes(contour.rate))
          .sort((a, b) => a.rate - b.rate);
        const hue = printHue("fallout");
        const outlines = contours.map((contour) =>
          plumePolygon(centre, contour, result.fallout.drawn ? result.fallout.fromDegrees : 0, 48).map(toPage),
        );
        outlines.forEach((outline, index) => {
          const cut = clipToBox(outline, x, y, DIAGRAM_SIZE);
          if (cut.length > 2) items.push({ kind: "polygon", points: cut, fill: overPaper(hue, 0.1 + index * 0.08) });
        });
        for (const outline of outlines)
          for (const run of insideRuns(outline, x, y, DIAGRAM_SIZE)) items.push(...pathLines(run, hue, 0.6, [2.4, 1.2]));
      }
      for (const ring of [...rings].sort((a, b) => b.metres! - a.metres!)) {
        const line = FAMILY_LINES[ring.family as EffectFamily];
        const width = line.width * 0.5;
        const radius = ring.metres! * perMetre;
        const circle: Point[] = Array.from({ length: 97 }, (_, step) => {
          const angle = (step / 96) * 2 * Math.PI;
          return [mid[0] + radius * Math.sin(angle), mid[1] - radius * Math.cos(angle)];
        });
        const dash = line.dash ? ([Math.max(0.6, line.dash[0]! * width), Math.max(0.6, line.dash[1]! * width)] as const) : null;
        items.push(...pathLines(circle, printHue(ring.family), width, dash));
      }
      items.push({
        kind: "polygon",
        points: Array.from({ length: 12 }, (_, step) => {
          const angle = (step / 12) * 2 * Math.PI;
          return [mid[0] + 2 * Math.cos(angle), mid[1] + 2 * Math.sin(angle)] as const;
        }),
        fill: INK,
      });
      items.push({ kind: "text", x: mid[0] + 4, y: mid[1] - 4, text: letter, size: 8, bold: true, color: INK });
      items.push({ kind: "rect", x, y, width: DIAGRAM_SIZE, height: DIAGRAM_SIZE, stroke: MUTED, lineWidth: 0.5 });
      bar(items, metric, miles, x, y + DIAGRAM_SIZE + 5);
      return items;
    },
  };
}

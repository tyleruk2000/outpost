/**
 * The map of a place's repeaters in the household book: the offline map where one was
 * drawn (or a plain grid to scale where none is installed), the place or the journey's
 * line, each repeater as a triangle with its callsign, and round each the ground in sight
 * of its aerial for a handheld, worked out from the terrain installed as the map's
 * "Estimated radio range" shades it. Each repeater's ground has a tint, a hatching at its
 * own angle and an outline with its own dash, so that where they overlap each still reads,
 * in colour and in greyscale. Where no terrain is installed under a repeater, a circle at
 * its smooth-Earth radio horizon stands in, and the caption says so. The frame, the scale
 * bar and north are the nuclear and binder maps' own (`mapFigureBlock`).
 *
 * Pure: the picture and the ground in sight come in as data; nothing is fetched.
 */
import { destinationPoint, rangeGrid, rangeSampleIndex, type SightRange } from "@outpost/shared";
import type { Content } from "pdfmake/interfaces";
import { PT_PER_MAP_PX } from "@/features/maps/print/paper";
import { latitudeAt, longitudeAt, mercatorX, mercatorY, paperPoints, scaleForZoom } from "@/features/maps/print/scale";
import { mapFigureBlock, type PicturePiece } from "@/features/nuclear/print-figures";
import { PRINT_COLOURS as C, escapeSvg, figure, PRINT_FONT, round, sheetItemsToSvg } from "@/features/print-kit";
import {
  type BookRepeaterRange,
  horizonRange,
  placeLabel,
  type RepeaterGroup,
  type RepeaterLocation,
  repeaterMapFrame,
} from "./book-repeaters";

/** The offline map under a place's repeaters, drawn on the screen before the book is made. */
export interface BookRepeaterMap {
  pieces: PicturePiece[];
  /** Each piece's picture as a data address. */
  pictures: ReadonlyMap<string, string>;
  /** The map's credits, written out. */
  credits: string | null;
}

/**
 * How each repeater's ground is drawn, in the order the map lists them: a colour, the angle of its hatching and the
 * dash of its outline. The hatching's angle and the dash alone tell them apart in greyscale.
 */
export const REPEATER_STYLES = [
  { colour: C.accent, hatch: 45, dash: null },
  { colour: C.know, hatch: -45, dash: "6 2.5" },
  { colour: C.act, hatch: 0, dash: "2 1.6" },
  { colour: C.warn, hatch: 90, dash: "7 2 1.5 2" },
  { colour: C.muted, hatch: 22, dash: "4 3" },
  { colour: C.ink, hatch: -68, dash: "1 3" },
] as const;

export type RepeaterStyle = (typeof REPEATER_STYLES)[number];
export const repeaterStyle = (index: number): RepeaterStyle => REPEATER_STYLES[index % REPEATER_STYLES.length]!;

/** How solid each repeater's tint is: light, since several overlap round home. The hatching carries the shape. */
const TINT_OPACITY = 0.09;
const HATCH_GAP = 4.2;
/** The lattice the ground in sight is read on, in points: fine enough for a valley, coarse enough to stay quick. */
const CELL = 1.5;
/** Patches of ground in sight (or holes in it) smaller than this, in square points, are left out: specks on paper. */
const SPECK = 30;

const LABEL = 6.5;
const PLACE_LABEL = 7.5;

const text = (x: number, y: number, words: string, size: number, options: { bold?: boolean; fill?: string; anchor?: string } = {}) =>
  `<text x="${round(x)}" y="${round(y)}" font-family="${PRINT_FONT}" font-size="${size}"${options.bold ? ' font-weight="bold"' : ""} fill="${options.fill ?? C.ink}" text-anchor="${options.anchor ?? "start"}">${escapeSvg(words)}</text>`;

/**
 * How wide words are set, near enough: Atkinson Hyperlegible Next's capitals and figures are wide, its lower case
 * narrower. Erring wide keeps a label inside the frame.
 */
export function wordsWidth(words: string, size: number, bold = false): number {
  let ems = 0;
  for (const letter of words) ems += letter === " " ? 0.28 : /[A-Z0-9]/.test(letter) ? 0.66 : /[il.,'’:;]/.test(letter) ? 0.3 : 0.55;
  return ems * size * (bold ? 1.05 : 1);
}

/** A box on the page: x, y at its top left. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

export interface LabelWanted {
  /** The mark the label names: its middle, and how far its edge is from it. */
  x: number;
  y: number;
  radius: number;
  words: string;
  size: number;
  bold: boolean;
  /** Tried first: home's name sits to its left, as a meeting point is often just beside it. */
  prefer?: "left" | "right";
}

export interface PlacedLabel {
  words: string;
  size: number;
  bold: boolean;
  /** The text's baseline start. */
  x: number;
  y: number;
  box: Box;
}

/**
 * Places each label beside its mark: to the right, left, above, below or at a corner, the first spot wholly inside the
 * frame that covers no label already placed and no mark; failing that, the spot inside the frame that covers least.
 * In the order given, so that the first are placed best.
 */
export function placeLabels(wanted: readonly LabelWanted[], frame: Box, marks: readonly Box[] = []): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const inset = 1.5;
  for (const label of wanted) {
    const width = wordsWidth(label.words, label.size, label.bold) + 3;
    const height = label.size + 2;
    const gap = label.radius + 2;
    const spots: Array<[number, number]> = [
      [label.x + gap, label.y - height / 2],
      [label.x - gap - width, label.y - height / 2],
      [label.x - width / 2, label.y - gap - height],
      [label.x - width / 2, label.y + gap],
      [label.x + gap * 0.7, label.y - gap * 0.7 - height],
      [label.x - gap * 0.7 - width, label.y - gap * 0.7 - height],
      [label.x + gap * 0.7, label.y + gap * 0.7],
      [label.x - gap * 0.7 - width, label.y + gap * 0.7],
    ];
    if (label.prefer === "left") [spots[0], spots[1]] = [spots[1]!, spots[0]!];
    const own: Box = { x: label.x - label.radius, y: label.y - label.radius, width: label.radius * 2, height: label.radius * 2 };
    let best: { box: Box; cost: number } | null = null;
    for (const [x, y] of spots) {
      // Inside the frame, whatever else.
      const box: Box = {
        x: Math.min(Math.max(x, frame.x + inset), frame.x + frame.width - inset - width),
        y: Math.min(Math.max(y, frame.y + inset), frame.y + frame.height - inset - height),
        width,
        height,
      };
      let cost = 0;
      for (const other of placed) cost += overlapArea(box, other.box) * 4;
      for (const mark of marks) if (mark !== own) cost += overlapArea(box, mark) * 2;
      // Moved off its spot to stay in the frame: still beside its mark, but less so.
      cost += overlaps(box, own) ? 400 : 0;
      cost += Math.hypot(box.x - x, box.y - y) * 0.5;
      if (!best || cost < best.cost) best = { box, cost };
      if (cost === 0) break;
    }
    const box = best!.box;
    placed.push({ words: label.words, size: label.size, bold: label.bold, x: box.x + 1.5, y: box.y + label.size + 0.2, box });
  }
  return placed;
}

const labelSvg = (label: PlacedLabel) =>
  `<rect x="${round(label.box.x)}" y="${round(label.box.y)}" width="${round(label.box.width)}" height="${round(label.box.height)}" fill="#ffffff" fill-opacity="0.85"/>${text(label.x, label.y, label.words, label.size, { bold: label.bold })}`;

// ── The ground in sight, on the page ───────────────────────────────────────

const EARTH = 6_371_008.8;
const DEG = Math.PI / 180;

/**
 * The ground in sight of a repeater's aerial within a box on the page, as closed outlines in page points: the same
 * answer the map shades (`seenAt` in repeaters/map/range.ts), read on a lattice of `cell` points, smoothed a little
 * and traced where it crosses one half (marching squares). The lattice runs one cell past the box with nothing in
 * sight there, so every outline closes; the part outside is clipped by the frame. Outlines round ground in sight and
 * round holes in it alike: fill them even-odd.
 */
export function coverageOutlines(
  sight: SightRange,
  box: Box,
  fromPage: (x: number, y: number) => { lat: number; lon: number },
  cell = CELL,
): Array<Array<[number, number]>> {
  if (sight.coverage === "none" || sight.bearingCount === 0) return [];
  const extent = Math.max(0, ...sight.bearings.map((bearing) => bearing.furthestMeters));
  if (extent <= 0) return [];
  const grid = rangeGrid(sight);
  const columns = Math.ceil(box.width / cell);
  const rows = Math.ceil(box.height / cell);
  // Nodes 0 and columns + 2 are the empty border.
  const across = columns + 3;
  const down = rows + 3;
  const raw = new Float32Array(across * down);
  const { lat: lat0, lon: lon0 } = sight.at;
  const reach = extent + 300;
  const nodeX = (i: number) => box.x + (i - 1) * cell;
  const nodeY = (j: number) => box.y + (j - 1) * cell;
  for (let j = 1; j < down - 1; j += 1) {
    for (let i = 1; i < across - 1; i += 1) {
      const { lat, lon } = fromPage(nodeX(i), nodeY(j));
      const dy = (lat - lat0) * DEG * EARTH;
      const dx = (lon - lon0) * DEG * EARTH * Math.cos(((lat + lat0) / 2) * DEG);
      const meters = Math.hypot(dx, dy);
      if (meters > reach || meters > sight.maxMeters) continue;
      const position = ((((Math.atan2(dx, dy) / DEG) % 360) + 360) % 360) * (grid.bearingCount / 360);
      const first = Math.floor(position);
      const blend = position - first;
      const index = Math.max(0, rangeSampleIndex(meters, sight.bands));
      raw[j * across + i] = (grid.seen(first, index) ? 1 - blend : 0) + (grid.seen(first + 1, index) ? blend : 0);
    }
  }
  // Smoothed over the nodes round each, so that single readings do not speckle the page.
  const values = new Float32Array(across * down);
  for (let j = 1; j < down - 1; j += 1)
    for (let i = 1; i < across - 1; i += 1) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj += 1)
        for (let di = -1; di <= 1; di += 1)
          sum += raw[(j + dj) * across + i + di]! * (di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1);
      values[j * across + i] = sum / 16;
    }
  const value = (i: number, j: number) => (i <= 0 || j <= 0 || i >= across - 1 || j >= down - 1 ? 0 : values[j * across + i]!);
  // A crossing is named by the lattice edge it is on: across from node (i, j), or down from it.
  const point = new Map<number, [number, number]>();
  const crossing = (i: number, j: number, downward: boolean): number => {
    const id = (j * across + i) * 2 + (downward ? 1 : 0);
    if (!point.has(id)) {
      const a = value(i, j);
      const b = downward ? value(i, j + 1) : value(i + 1, j);
      const t = a === b ? 0.5 : Math.min(1, Math.max(0, (0.5 - a) / (b - a)));
      point.set(id, downward ? [nodeX(i), nodeY(j) + t * cell] : [nodeX(i) + t * cell, nodeY(j)]);
    }
    return id;
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let j = 0; j < down - 1; j += 1) {
    for (let i = 0; i < across - 1; i += 1) {
      const tl = value(i, j) >= 0.5 ? 8 : 0;
      const tr = value(i + 1, j) >= 0.5 ? 4 : 0;
      const br = value(i + 1, j + 1) >= 0.5 ? 2 : 0;
      const bl = value(i, j + 1) >= 0.5 ? 1 : 0;
      const corners = tl + tr + br + bl;
      if (corners === 0 || corners === 15) continue;
      const top = () => crossing(i, j, false);
      const bottom = () => crossing(i, j + 1, false);
      const left = () => crossing(i, j, true);
      const right = () => crossing(i + 1, j, true);
      switch (corners) {
        case 1:
        case 14:
          link(left(), bottom());
          break;
        case 2:
        case 13:
          link(bottom(), right());
          break;
        case 3:
        case 12:
          link(left(), right());
          break;
        case 4:
        case 11:
          link(top(), right());
          break;
        case 6:
        case 9:
          link(top(), bottom());
          break;
        case 7:
        case 8:
          link(left(), top());
          break;
        case 5:
          link(left(), top());
          link(bottom(), right());
          break;
        case 10:
          link(top(), right());
          link(left(), bottom());
          break;
      }
    }
  }
  // Every crossing has two neighbours: walk each loop once.
  const outlines: Array<Array<[number, number]>> = [];
  const done = new Set<number>();
  for (const start of links.keys()) {
    if (done.has(start)) continue;
    const loop: Array<[number, number]> = [];
    let previous = -1;
    let at = start;
    while (!done.has(at)) {
      done.add(at);
      loop.push(point.get(at)!);
      const next = (links.get(at) ?? []).find((each) => each !== previous && !done.has(each));
      if (next === undefined) break;
      previous = at;
      at = next;
    }
    if (loop.length >= 3 && Math.abs(areaOf(loop)) >= SPECK) outlines.push(loop);
  }
  return outlines;
}

function areaOf(loop: ReadonlyArray<[number, number]>): number {
  let sum = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const [x1, y1] = loop[index]!;
    const [x2, y2] = loop[(index + 1) % loop.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Loops as one SVG path, points rounded to a tenth of a point and runs along a straight line dropped. */
function pathOf(loops: ReadonlyArray<ReadonlyArray<[number, number]>>): string {
  const tenth = (value: number) => Math.round(value * 10) / 10;
  return loops
    .map((loop) => {
      const kept: Array<[number, number]> = [];
      for (const [x, y] of loop) {
        const here: [number, number] = [tenth(x), tenth(y)];
        const last = kept.at(-1);
        const before = kept.at(-2);
        if (last && last[0] === here[0] && last[1] === here[1]) continue;
        // Three in a row on one line: the middle one says nothing.
        if (
          last &&
          before &&
          Math.abs((last[0] - before[0]) * (here[1] - before[1]) - (last[1] - before[1]) * (here[0] - before[0])) < 0.01
        )
          kept[kept.length - 1] = here;
        else kept.push(here);
      }
      return `M${kept.map(([x, y]) => `${x},${y}`).join(" L")} Z`;
    })
    .join(" ");
}

/** A hatching to fill with: thin lines `HATCH_GAP` apart at the style's angle. */
const hatchPattern = (id: string, style: RepeaterStyle) =>
  `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${HATCH_GAP}" height="${HATCH_GAP}" patternTransform="rotate(${style.hatch})"><line x1="${HATCH_GAP / 2}" y1="-1" x2="${HATCH_GAP / 2}" y2="${HATCH_GAP + 1}" stroke="${style.colour}" stroke-width="0.55" stroke-opacity="0.8"/></pattern>`;

/** The ground drawn for one repeater: tint, hatching and outline. */
function groundSvg(d: string, style: RepeaterStyle, pattern: string): string {
  const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : "";
  return [
    `<path d="${d}" fill="${style.colour}" fill-opacity="${TINT_OPACITY}" fill-rule="evenodd" stroke="none"/>`,
    `<path d="${d}" fill="url(#${pattern})" fill-rule="evenodd" stroke="none"/>`,
    `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-opacity="0.7" stroke-linejoin="round"/>`,
    `<path d="${d}" fill="none" stroke="${style.colour}" stroke-width="1.1" stroke-linejoin="round"${dash}/>`,
  ].join("");
}

// ── The figure ─────────────────────────────────────────────────────────────

export interface RepeaterFigureInput {
  /** With `hidden`, how many further repeaters were left off this map. */
  group: RepeaterGroup & { hidden?: number };
  /** Every place in the book: those inside this map's frame are marked too. */
  locations: readonly RepeaterLocation[];
  ranges: Readonly<Record<string, BookRepeaterRange>>;
  map: BookRepeaterMap | null;
  /** Why there is no map under it, when none was drawn. */
  missing: string | null;
  measure: number;
}

/** The figure, with its title and caption. */
export function repeaterFigure(input: RepeaterFigureInput): Content {
  const { svg, caption } = repeaterMapSvg(input);
  return figure(svg, { title: `Repeaters: ${placeLabel(input.group.location)}`, caption, width: input.measure });
}

const KEY_ROW = 12;

export function repeaterMapSvg(input: RepeaterFigureInput): {
  svg: string;
  caption: string;
  height: number;
  /** Where the map is on the page, and where each label went: for the tests. */
  frame: Box;
  labels: PlacedLabel[];
} {
  const { group, measure } = input;
  const { size, frame } = repeaterMapFrame(group, measure);
  const block = mapFigureBlock(
    { part: "overview", width: size.width, height: size.height, frame, pieces: input.map?.pieces ?? [], captions: [] },
    measure,
  );
  if (block.kind !== "drawing") throw new Error("A map figure is a drawing.");
  const left = (measure - size.width) / 2;
  const box: Box = { x: left, y: 0, width: size.width, height: size.height };
  const world = 512 * 2 ** frame.zoom * PT_PER_MAP_PX;
  const at = (lat: number, lon: number): [number, number] => [
    left + size.width / 2 + (mercatorX(lon) - mercatorX(frame.center.lon)) * world,
    size.height / 2 + (mercatorY(lat) - mercatorY(frame.center.lat)) * world,
  ];
  const fromPage = (x: number, y: number) => ({
    lon: longitudeAt(mercatorX(frame.center.lon) + (x - left - size.width / 2) / world),
    lat: latitudeAt(mercatorY(frame.center.lat) + (y - size.height / 2) / world),
  });

  const shown = [...group.chosen, ...group.also].map((each) => each.repeater);
  const rangeOf = (repeater: (typeof shown)[number]) => input.ranges[repeater.id] ?? horizonRange(repeater);
  const styles = new Map(shown.map((repeater, index) => [repeater.id, repeaterStyle(index)]));

  const defs: string[] = [];
  const out: string[] = [];
  const clip = `rc-${group.location.key}`;
  defs.push(
    `<clipPath id="${clip}"><rect x="${round(left)}" y="0" width="${round(size.width)}" height="${round(size.height)}"/></clipPath>`,
  );
  out.push(`<g clip-path="url(#${clip})">`);

  // A grid to scale where there is no map under it: a line every round number of kilometres.
  const scale = scaleForZoom(frame.zoom, frame.center.lat);
  const gridNote = !input.map || input.map.pieces.length === 0;
  if (gridNote) {
    const spanMeters = (size.width / paperPoints(1000, scale)) * 1000;
    const stepKm = [1, 2, 5, 10, 20, 50, 100].find((step) => spanMeters / (step * 1000) <= 10) ?? 200;
    const step = paperPoints(stepKm * 1000, scale);
    const [cx, cy] = at(group.location.lat, group.location.lon);
    for (let x = cx - Math.ceil((cx - left) / step) * step; x <= left + size.width; x += step)
      out.push(`<line x1="${round(x)}" y1="0" x2="${round(x)}" y2="${round(size.height)}" stroke="${C.rule}" stroke-width="0.4"/>`);
    for (let y = cy - Math.ceil(cy / step) * step; y <= size.height; y += step)
      out.push(
        `<line x1="${round(left)}" y1="${round(y)}" x2="${round(left + size.width)}" y2="${round(y)}" stroke="${C.rule}" stroke-width="0.4"/>`,
      );
    out.push(text(left + size.width - 4, size.height - 4, `Grid lines ${stepKm} km apart`, 6, { fill: C.muted, anchor: "end" }));
  }

  // The ground in sight of each, under everything else; the furthest-reaching first, so the smaller lie on top.
  const byReach = [...shown].sort((a, b) => rangeOf(b).meters - rangeOf(a).meters);
  for (const repeater of byReach) {
    const style = styles.get(repeater.id)!;
    const range = rangeOf(repeater);
    const pattern = `rh-${group.location.key}-${shown.indexOf(repeater)}`;
    if (range.basis === "terrain" && range.sight) {
      const loops = coverageOutlines(range.sight, box, fromPage);
      if (loops.length === 0) continue;
      defs.push(hatchPattern(pattern, style));
      out.push(`<g data-coverage="${escapeSvg(repeater.callsign)}">${groundSvg(pathOf(loops), style, pattern)}</g>`);
    } else {
      // No terrain under it: its smooth-Earth radio horizon, as a circle with the repeater's dash and no hatching.
      const points = Array.from({ length: 120 }, (_, index) => {
        const point = destinationPoint({ lat: repeater.lat, lon: repeater.lon }, (index * 360) / 120, range.meters);
        return at(point.lat, point.lon);
      });
      out.push(
        `<path data-circle="${escapeSvg(repeater.callsign)}" d="M${points.map(([x, y]) => `${round(x)},${round(y)}`).join(" L")} Z" fill="none" stroke="${style.colour}" stroke-width="1.2"${style.dash ? ` stroke-dasharray="${style.dash}"` : ""}/>`,
      );
    }
  }

  // The marks: the journey's line and its end, the places in the frame, the repeaters.
  const marks: Box[] = [];
  const wanted: LabelWanted[] = [];
  const markBox = (x: number, y: number, r: number): Box => ({ x: x - r, y: y - r, width: r * 2, height: r * 2 });
  const inFrame = ([x, y]: [number, number]) => x >= left && x <= left + size.width && y >= 0 && y <= size.height;
  const location = group.location;
  if (location.to) {
    const [x1, y1] = at(location.lat, location.lon);
    const [x2, y2] = at(location.to.lat, location.to.lon);
    out.push(`<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${C.ink}" stroke-width="1.6"/>`);
    const end = location.to;
    if (!input.locations.some((each) => !each.to && Math.abs(each.lat - end.lat) < 1e-4 && Math.abs(each.lon - end.lon) < 1e-4)) {
      out.push(`<circle cx="${round(x2)}" cy="${round(y2)}" r="3.5" fill="#ffffff" stroke="${C.ink}" stroke-width="1.4"/>`);
      marks.push(markBox(x2, y2, 3.5));
      wanted.push({ x: x2, y: y2, radius: 3.5, words: location.name, size: PLACE_LABEL, bold: true });
    }
  }
  let homeShown = false;
  let placeShown = false;
  const ourPlaces: LabelWanted[] = [];
  for (const other of input.locations) {
    if (other.to) continue;
    const point = at(other.lat, other.lon);
    if (!inFrame(point)) continue;
    const mine = other.key === location.key || (location.to && other.kind === "home");
    const [x, y] = point;
    out.push(
      `<rect x="${round(x - 4.5)}" y="${round(y - 4.5)}" width="9" height="9" fill="${other.kind === "home" ? C.ink : "#ffffff"}" stroke="${C.ink}" stroke-width="1.2"/>`,
    );
    marks.push(markBox(x, y, 4.5));
    const words = other.kind === "home" ? placeLabel(other) : other.name;
    ourPlaces.push({
      x,
      y,
      radius: 4.5,
      words,
      size: mine ? PLACE_LABEL : LABEL,
      bold: Boolean(mine),
      prefer: other.kind === "home" ? "left" : "right",
    });
    if (other.kind === "home") homeShown = true;
    else placeShown = true;
  }
  const repeaterLabels: LabelWanted[] = [];
  for (const repeater of shown) {
    const style = styles.get(repeater.id)!;
    const [x, y] = at(repeater.lat, repeater.lon);
    out.push(
      `<path d="M${round(x)},${round(y - 5)} L${round(x + 4.6)},${round(y + 3)} L${round(x - 4.6)},${round(y + 3)} Z" fill="${style.colour}" stroke="${C.ink}" stroke-width="0.7"/>`,
    );
    marks.push(markBox(x, y - 1, 4.6));
    repeaterLabels.push({ x, y: y - 1, radius: 4.6, words: repeater.callsign, size: LABEL, bold: true });
  }
  // Our places first (they are what the page is about), then the repeaters, then a journey's end.
  const labels = placeLabels([...ourPlaces, ...repeaterLabels, ...wanted], box, marks);
  out.push(...labels.map(labelSvg));
  out.push("</g>");

  // The key, under the scale bar, wrapped to the width of the map: each repeater's ground, then the marks.
  const rows: Array<{ mark: string; words: string }> = shown.map((repeater, index) => {
    const style = styles.get(repeater.id)!;
    const range = rangeOf(repeater);
    const pattern = `rk-${group.location.key}-${index}`;
    if (range.basis === "terrain" && range.sight) {
      defs.push(hatchPattern(pattern, style));
      return { mark: groundSvg("M0,-7.5 L16,-7.5 L16,0.5 L0,0.5 Z", style, pattern), words: repeater.callsign };
    }
    return {
      mark: `<line x1="0" y1="-3" x2="16" y2="-3" stroke="${style.colour}" stroke-width="1.4"${style.dash ? ` stroke-dasharray="${style.dash}"` : ""}/>`,
      words: `${repeater.callsign} (circle)`,
    };
  });
  const home = input.locations.find((each) => each.kind === "home");
  rows.push(
    { mark: `<path d="M8,-7 L12,0 L4,0 Z" fill="${C.muted}"/>`, words: "Repeater" },
    ...(homeShown && home ? [{ mark: `<rect x="4" y="-7.5" width="8" height="8" fill="${C.ink}"/>`, words: placeLabel(home) }] : []),
    ...(placeShown
      ? [{ mark: `<rect x="4" y="-7.5" width="8" height="8" fill="#ffffff" stroke="${C.ink}" stroke-width="1"/>`, words: "Our place" }]
      : []),
    ...(location.to
      ? [{ mark: `<line x1="0" y1="-3" x2="16" y2="-3" stroke="${C.ink}" stroke-width="1.6"/>`, words: "The straight line" }]
      : []),
  );
  let keyX = left;
  let keyY = block.height + KEY_ROW - 4;
  for (const row of rows) {
    const width = 20 + wordsWidth(row.words, LABEL) + 10;
    if (keyX > left && keyX + width - 10 > left + size.width) {
      keyX = left;
      keyY += KEY_ROW;
    }
    out.push(`<g transform="translate(${round(keyX)} ${round(keyY)})">${row.mark}</g>`, text(keyX + 20, keyY, row.words, LABEL));
    keyX += width;
  }
  const height = keyY + 4;

  const base = sheetItemsToSvg(block.draw(left, 0, size.width), { x: 0, y: 0, width: measure, height }, input.map?.pictures ?? new Map());
  const svg = base.replace(/<\/svg>$/, `<defs>${defs.join("")}</defs>${out.join("")}</svg>`);
  return { svg, caption: captionOf(input, shown, rangeOf), height, frame: box, labels };
}

function captionOf(
  input: RepeaterFigureInput,
  shown: ReadonlyArray<RepeaterGroup["chosen"][number]["repeater"]>,
  rangeOf: (repeater: RepeaterGroup["chosen"][number]["repeater"]) => BookRepeaterRange,
): string {
  const ranges = shown.map((repeater) => ({ repeater, range: rangeOf(repeater) }));
  const terrain = ranges.filter((each) => each.range.basis === "terrain" && each.range.sight);
  const flat = ranges.filter((each) => !(each.range.basis === "terrain" && each.range.sight));
  const aerials = (list: typeof ranges) => {
    const guessed = list.filter((each) => !each.range.aerialListed);
    if (guessed.length === 0) return "its aerial at the height listed";
    const meters = guessed[0]!.range.aerialMeters;
    if (guessed.length === list.length) return `its aerial ${meters} m up (assumed: the list gives no height)`;
    return `its aerial at the height listed (${meters} m assumed for ${guessed.map((each) => each.repeater.callsign).join(", ")})`;
  };
  const lines: string[] = [];
  if (terrain.length > 0)
    lines.push(
      `Hatched: ground in sight of each repeater for a handheld at head height, from the terrain installed, with ${aerials(terrain)}.`,
    );
  if (flat.length > 0)
    lines.push(
      `${flat.map((each) => each.repeater.callsign).join(", ")}: no terrain installed there, so a circle at the radio horizon over flat ground, with ${aerials(flat)}.`,
    );
  const hidden = input.group.hidden ?? 0;
  if (hidden > 0)
    lines.push(
      `Only the nearest ${shown.length === 1 ? "repeater is" : `${shown.length} are`} drawn, as chosen for the book; ${hidden === 1 ? "the one further away is" : `the ${hidden} further away are`} in the tables.`,
    );
  lines.push("**A rough guide:** buildings and trees block more, and a signal often reaches a little past a ridge.");
  if (input.map?.credits) lines.push(`Map: ${input.map.credits}.`);
  else lines.push(input.missing ?? "No offline map was drawn under it: the places and repeaters are drawn to scale on a plain grid.");
  return lines.join(" ");
}

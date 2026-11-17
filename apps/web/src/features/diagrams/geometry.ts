/**
 * The arithmetic every diagram shares: angles as a compass gives them (degrees clockwise
 * from straight up), arcs, arrowheads, and a reckoning of how wide a label is, so that a
 * plate can keep its words clear of each other before it is drawn. Pure.
 */

export const DEG = Math.PI / 180;

export type Point = readonly [number, number];

/** A point at a distance and an angle clockwise from straight up, on a screen whose y grows downwards. */
export function polar(cx: number, cy: number, r: number, degrees: number): [number, number] {
  return [cx + r * Math.sin(degrees * DEG), cy - r * Math.cos(degrees * DEG)];
}

/** The angle of a line from one point to another, clockwise from straight up, 0 to 360. */
export function heading(from: Point, to: Point): number {
  return (((Math.atan2(to[0] - from[0], -(to[1] - from[1])) / DEG) % 360) + 360) % 360;
}

/** An SVG arc about a centre from one angle to another, the short way unless `clockwise` is set (then always turning clockwise, as a bearing is measured); both angles clockwise from up. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number, clockwiseOnly = false): string {
  const sweep = (((to - from) % 360) + 360) % 360;
  const clockwise = clockwiseOnly || sweep <= 180;
  const turn = clockwise ? sweep : 360 - sweep;
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)}A${r},${r} 0 ${turn > 180 ? 1 : 0} ${clockwise ? 1 : 0} ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

/** The middle of the short way round from one angle to the other (or of the clockwise way, with `clockwiseOnly`). */
export function bisector(from: number, to: number, clockwiseOnly = false): number {
  const sweep = (((to - from) % 360) + 360) % 360;
  return clockwiseOnly || sweep <= 180 ? (from + sweep / 2) % 360 : (from - (360 - sweep) / 2 + 360) % 360;
}

/** An open arrowhead (two strokes) at `tip`, for a line arriving from the direction of `from`. */
export function chevron(tip: Point, from: Point, size: number): string {
  const back = heading(tip, from);
  const [ax, ay] = polar(tip[0], tip[1], size, back - 28);
  const [bx, by] = polar(tip[0], tip[1], size, back + 28);
  return `M${ax.toFixed(2)},${ay.toFixed(2)}L${tip[0].toFixed(2)},${tip[1].toFixed(2)}L${bx.toFixed(2)},${by.toFixed(2)}`;
}

/** A path through points, as straight segments. */
export function polyline(points: readonly Point[]): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
}

/**
 * How wide a label is reckoned to be, in pixels, at a font size. Atkinson Hyperlegible
 * Next averages a little over half an em a character; 0.62 errs wide (its figures are wider), so that labels
 * placed by it never touch. The end-to-end suite measures the real boxes.
 */
export const textWidth = (text: string, font: number) => text.length * font * 0.62;

export type Anchor = "start" | "middle" | "end";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box a one-line label takes, set at (x, y) with its middle on y. */
export function labelBox(x: number, y: number, text: string, font: number, anchor: Anchor = "start"): Box {
  const width = textWidth(text, font);
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { x: left, y: y - font * 0.65, width, height: font * 1.3 };
}

export const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

/** Which way a label sits beside a point it names, for a label pushed out along an angle (clockwise from up). */
export function anchorFor(degrees: number): Anchor {
  const s = Math.sin(degrees * DEG);
  return s > 0.35 ? "start" : s < -0.35 ? "end" : "middle";
}

/**
 * How many times to enlarge small angles between lines (the three norths) so that they
 * can be told apart: the least of 1, 2, 3, 5 or 10 that opens the largest to at least
 * `least` degrees, and never past `most`. Said on every diagram that uses it.
 */
export function exaggeration(angles: readonly number[], least = 12, most = 40): number {
  const largest = Math.max(0, ...angles.map((angle) => Math.abs(angle)));
  let chosen = 1;
  for (const factor of [1, 2, 3, 5, 10]) {
    if (largest * factor > most) break;
    chosen = factor;
    if (largest * factor >= least) break;
  }
  return chosen;
}

/** A round step for the ticks of an axis spanning `span`, giving about `count` of them. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= raw) return step * power;
  return 10 * power;
}

export interface Placed {
  at: [number, number];
  anchor: Anchor;
  box: Box;
}

/**
 * Puts a label beside a point at the first of a few places (right, left, above, below,
 * then the corners) where it overlaps nothing already placed and stays inside the plate;
 * null if there is no such place, so the plate leaves it out rather than let it clash.
 * `clearance` is the radius of the mark at the point, which the label keeps off. What is
 * placed is added to `taken`.
 */
export function placeLabel(
  point: Point,
  text: string,
  font: number,
  taken: Box[],
  bounds: { width: number; height: number },
  clearance = 5,
): Placed | null {
  const [x, y] = point;
  const side = clearance + font * 0.4;
  const rise = clearance + font * 0.65 + 3;
  const tries: Array<[number, number, Anchor]> = [
    [x + side, y, "start"],
    [x - side, y, "end"],
    [x, y - rise, "middle"],
    [x, y + rise, "middle"],
    [x + side * 0.6, y - rise, "start"],
    [x - side * 0.6, y - rise, "end"],
    [x + side * 0.6, y + rise, "start"],
    [x - side * 0.6, y + rise, "end"],
  ];
  return firstFree(tries, text, font, taken, bounds);
}

/** The first of some places for a label where it is clear of everything taken and inside the plate; it is then taken. */
export function firstFree(
  tries: ReadonlyArray<readonly [number, number, Anchor]>,
  text: string,
  font: number,
  taken: Box[],
  bounds: { width: number; height: number },
): Placed | null {
  for (const [lx, ly, anchor] of tries) {
    const box = labelBox(lx, ly, text, font, anchor);
    if (box.x < 0 || box.y < 0 || box.x + box.width > bounds.width || box.y + box.height > bounds.height) continue;
    if (taken.some((other) => overlaps(box, other, 2))) continue;
    taken.push(box);
    return { at: [lx, ly], anchor, box };
  }
  return null;
}

/** Places round a group of points for its name: beside it, then above and below it. */
export function aroundGroup(points: readonly Point[], font: number): Array<[number, number, Anchor]> {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const gap = font * 0.7;
  const rise = font * 0.65 + 9;
  return [
    [midX, bottom + rise, "middle"],
    [left, bottom + rise, "start"],
    [right, bottom + rise, "end"],
    [midX, top - rise, "middle"],
    [left, top - rise, "start"],
    [right, top - rise, "end"],
    [right + gap, midY, "start"],
    [left - gap, midY, "end"],
    [right + gap, top, "start"],
    [left - gap, bottom, "end"],
    [right + gap, bottom, "start"],
    [left - gap, top, "end"],
  ];
}

/** The box round a point, so that labels keep clear of it. */
export const pointBox = ([x, y]: Point, r: number): Box => ({ x: x - r, y: y - r, width: 2 * r, height: 2 * r });

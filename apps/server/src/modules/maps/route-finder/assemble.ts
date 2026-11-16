/**
 * Turning the ways of a route into lines.
 *
 * OpenStreetMap keeps a route as a list of ways (short stretches of path), each a list
 * of points. The list is meant to be in walking order, but nothing enforces that: ways
 * are drawn in either direction, are sometimes listed out of order, sometimes do not
 * meet, and sometimes fork. This file joins what really joins and leaves the rest
 * apart:
 *
 *  - Two ways are joined only where an end of one is the same point as an end of the
 *    other. A way drawn the other way round is turned to fit.
 *  - Ways listed out of order are still joined, wherever their ends meet.
 *  - Where ways do not meet there is a gap. Nothing is ever drawn across a gap: the
 *    route becomes two lines, and the caller is told how many gaps there are and how
 *    wide the widest is.
 *  - Where three or more ends meet, or a way joins the middle of another, there is a
 *    branch. Two of the ends are joined (the earliest listed) and the others stay as
 *    lines of their own, touching it.
 *
 * Nothing here knows about the network or about OpenStreetMap's JSON.
 */
import { haversineMeters } from "@outpost/shared";

export type Point = [lon: number, lat: number];

/** OpenStreetMap stores seven decimal places: two ways meet when they share a point exactly. */
const keyOf = (point: Point) => `${point[0].toFixed(7)},${point[1].toFixed(7)}`;
const distance = (a: Point, b: Point) => haversineMeters(a[1], a[0], b[1], b[0]);

interface Part {
  points: Point[];
  reversed: boolean;
}

interface Chain {
  /** Position of its earliest way in the list, so results keep the list's order. */
  order: number;
  parts: Part[];
}

const firstOf = (chain: Chain): Point => {
  const part = chain.parts[0]!;
  return part.reversed ? part.points.at(-1)! : part.points[0]!;
};
const lastOf = (chain: Chain): Point => {
  const part = chain.parts.at(-1)!;
  return part.reversed ? part.points[0]! : part.points.at(-1)!;
};
const same = (a: Point, b: Point) => keyOf(a) === keyOf(b);
const isClosed = (chain: Chain) => same(firstOf(chain), lastOf(chain));

function turn(chain: Chain): void {
  chain.parts.reverse();
  for (const part of chain.parts) part.reversed = !part.reversed;
}

function flatten(chain: Chain): Point[] {
  const line: Point[] = [];
  for (const part of chain.parts) {
    const points = part.reversed ? [...part.points].reverse() : part.points;
    for (const point of points) {
      const previous = line.at(-1);
      if (previous && same(previous, point)) continue;
      line.push(point);
    }
  }
  return line;
}

/**
 * Joins ways into as few lines as their ends allow. With `ordered`, the list is taken
 * to be in walking order first (a route relation); without, only the ends decide (ways
 * that merely share a name).
 */
export function joinWays(ways: Point[][], options: { ordered: boolean }): Point[][] {
  const usable = ways.filter((points) => points.length >= 2);
  let chains: Chain[] = [];

  if (options.ordered) {
    let current: Chain | undefined;
    for (const [order, points] of usable.entries()) {
      const start = points[0]!;
      const end = points.at(-1)!;
      if (!current) {
        current = { order, parts: [{ points, reversed: false }] };
        continue;
      }
      const tail = lastOf(current);
      if (same(start, tail)) {
        current.parts.push({ points, reversed: false });
      } else if (same(end, tail)) {
        current.parts.push({ points, reversed: true });
      } else if (current.parts.length === 1 && (same(start, firstOf(current)) || same(end, firstOf(current)))) {
        // The first way of a stretch was drawn towards the start of the route: turn it, now that the second says so.
        turn(current);
        current.parts.push({ points, reversed: !same(start, lastOf(current)) });
      } else {
        chains.push(current);
        current = { order, parts: [{ points, reversed: false }] };
      }
    }
    if (current) chains.push(current);
  } else {
    chains = usable.map((points, order) => ({ order, parts: [{ points, reversed: false }] }));
  }

  // Whatever the list's order left apart is joined wherever two ends meet.
  const ends = new Map<string, Set<Chain>>();
  const register = (chain: Chain) => {
    if (isClosed(chain)) return;
    for (const key of [keyOf(firstOf(chain)), keyOf(lastOf(chain))]) {
      const set = ends.get(key) ?? new Set<Chain>();
      set.add(chain);
      ends.set(key, set);
    }
  };
  const unregister = (chain: Chain) => {
    for (const key of [keyOf(firstOf(chain)), keyOf(lastOf(chain))]) ends.get(key)?.delete(chain);
  };
  for (const chain of chains) register(chain);
  const alive = new Set(chains);
  const pending = [...ends.keys()];
  while (pending.length > 0) {
    const key = pending.pop()!;
    const here = [...(ends.get(key) ?? [])].sort((a, b) => a.order - b.order);
    if (here.length < 2) continue;
    const [a, b] = here as [Chain, Chain];
    unregister(a);
    unregister(b);
    if (keyOf(lastOf(a)) !== key) turn(a);
    if (keyOf(firstOf(b)) !== key) turn(b);
    a.parts.push(...b.parts);
    alive.delete(b);
    register(a);
    pending.push(key, keyOf(firstOf(a)), keyOf(lastOf(a)));
  }

  return [...alive]
    .sort((a, b) => a.order - b.order)
    .map(flatten)
    .filter((line) => line.length >= 2);
}

/**
 * Puts lines in the order they would be walked, as far as that can be told: the first
 * line first, then always the line whose end is nearest to where the last one stopped,
 * turned so that end comes first. Lines are never joined here.
 */
export function arrangeLines(lines: Point[][]): Point[][] {
  if (lines.length < 2) return lines.map((line) => [...line]);
  const remaining = lines.map((line) => [...line]);
  const first = remaining.shift()!;
  // A first line with nothing after it yet may point either way: start from the end further from everything else.
  const nearest = (point: Point) =>
    Math.min(...remaining.map((line) => Math.min(distance(point, line[0]!), distance(point, line.at(-1)!))));
  if (nearest(first[0]!) < nearest(first.at(-1)!)) first.reverse();
  const arranged = [first];
  while (remaining.length > 0) {
    const from = arranged.at(-1)!.at(-1)!;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestReversed = false;
    remaining.forEach((line, index) => {
      const toStart = distance(from, line[0]!);
      const toEnd = distance(from, line.at(-1)!);
      if (toStart < bestDistance) [best, bestDistance, bestReversed] = [index, toStart, false];
      if (toEnd < bestDistance) [best, bestDistance, bestReversed] = [index, toEnd, true];
    });
    const [next] = remaining.splice(best, 1) as [Point[]];
    if (bestReversed) next.reverse();
    arranged.push(next);
  }
  return arranged;
}

/** Groups of lines that touch: `groups[i]` is the group line `i` belongs to. */
function touching(lines: Point[][]): number[] {
  const parent = lines.map((_line, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[index] !== root) [parent[index], index] = [root, parent[index]!];
    return root;
  };
  const seen = new Map<string, number>();
  lines.forEach((line, index) => {
    for (const point of line) {
      const key = keyOf(point);
      const other = seen.get(key);
      if (other === undefined) seen.set(key, index);
      else parent[find(index)] = find(other);
    }
  });
  return lines.map((_line, index) => find(index));
}

export interface LineFacts {
  /** Places where one part of the route does not touch the rest. */
  gaps: number;
  largestGapMeters: number;
  /** Lines beyond the first in a group that touches: forks, loops, second carriageways. */
  branches: number;
}

/**
 * What to tell a person about lines that did not become one. A gap's width is how far
 * a part of the route is from the nearest other part, end to end.
 */
export function describeLines(lines: Point[][]): LineFacts {
  if (lines.length < 2) return { gaps: 0, largestGapMeters: 0, branches: 0 };
  const groups = touching(lines);
  const count = new Set(groups).size;
  let largest = 0;
  if (count > 1) {
    const nearest = new Map<number, number>();
    for (let a = 0; a < lines.length; a += 1) {
      for (let b = 0; b < lines.length; b += 1) {
        if (groups[a] === groups[b]) continue;
        const apart = Math.min(
          distance(lines[a]![0]!, lines[b]![0]!),
          distance(lines[a]![0]!, lines[b]!.at(-1)!),
          distance(lines[a]!.at(-1)!, lines[b]![0]!),
          distance(lines[a]!.at(-1)!, lines[b]!.at(-1)!),
        );
        nearest.set(groups[a]!, Math.min(nearest.get(groups[a]!) ?? Number.POSITIVE_INFINITY, apart));
      }
    }
    largest = Math.max(...nearest.values());
  }
  return { gaps: count - 1, largestGapMeters: Math.round(largest), branches: lines.length - count };
}

export function lengthOf(lines: Point[][]): number {
  let total = 0;
  for (const line of lines) for (let index = 1; index < line.length; index += 1) total += distance(line[index - 1]!, line[index]!);
  return total;
}

/**
 * Sorts lines into clusters that belong together: lines that touch, or whose ends are
 * within `meters` of each other. Two paths with the same name on different hills come
 * out as two clusters. Returns the indexes of the lines in each cluster.
 */
export function clusterLines(lines: Point[][], meters: number): number[][] {
  const group = touching(lines);
  const parent = new Map<number, number>();
  const find = (value: number): number => {
    let root = value;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
    return root;
  };
  for (let a = 0; a < lines.length; a += 1) {
    for (let b = a + 1; b < lines.length; b += 1) {
      if (find(group[a]!) === find(group[b]!)) continue;
      const ends: Array<[Point, Point]> = [
        [lines[a]![0]!, lines[b]![0]!],
        [lines[a]![0]!, lines[b]!.at(-1)!],
        [lines[a]!.at(-1)!, lines[b]![0]!],
        [lines[a]!.at(-1)!, lines[b]!.at(-1)!],
      ];
      if (ends.some(([p, q]) => distance(p, q) <= meters)) parent.set(find(group[a]!), find(group[b]!));
    }
  }
  const clusters = new Map<number, number[]>();
  lines.forEach((_line, index) => {
    const root = find(group[index]!);
    clusters.set(root, [...(clusters.get(root) ?? []), index]);
  });
  return [...clusters.values()];
}

/**
 * The area a drive reaches in a set time over Outpost's own main-roads network: for the
 * installations without the streets service, and labelled "Main roads only". Measured on
 * a Pi 5 over Great Britain's network: 0.35 s for an hour, against Valhalla's 5 s, and
 * the extent close to Valhalla's (docs/development/street-routes-measurements.md).
 *
 * How:
 *  1. Join the point to the nearest main road (as a road route does) and count the way
 *     there at 30 km/h, for the streets this network does not hold.
 *  2. Find the quickest time to everywhere along the main roads within the longest time
 *     asked (Dijkstra's method from the join), crossings left out.
 *  3. Mark a grid of square cells with the earliest time anything along a road reached
 *     it, sampling each road at half a cell's spacing, part-way along the last road.
 *  4. For each time: the cells reached, grown by one cell (the streets either side of a
 *     main road), with enclosed gaps filled, traced round into polygons and simplified.
 *
 * The grid's cell is set by the shortest time asked (`gridM`: 375 m for 15 minutes, 750 m
 * for 30, 1.5 km for an hour). Each area is grown and simplified by its own time's cell,
 * so an hour's area is the same shape whether or not a quarter of an hour is asked with
 * it, and an answer stays small.
 */
import { CLASS, simplifyIndices } from "../roads/build.ts";
import { edgeShape, type Graph, meters } from "../roads/graph.ts";
import { snapCandidates } from "../roads/route.ts";
import { MAX_KMH } from "../roads/speeds.ts";

/** The pace from the point to the main road, through streets the network does not hold. */
export const LOCAL_KMH = 30;
const DEG = Math.PI / 180;

export type Ring = Array<[number, number]>;

export interface MainRoadsReach {
  join: { lat: number; lon: number; distanceM: number };
  gridM: number;
  /** For each time asked, the polygons (outer rings only, anticlockwise), in [lon, lat]. */
  areas: Array<{ minutes: number; polygons: Ring[] }>;
}

/** The grid cell used for a reach of this many minutes. */
export const gridFor = (minutes: number) => Math.max(250, minutes * 25);

class MinHeap {
  keys = new Float64Array(1024);
  nodes = new Uint32Array(1024);
  size = 0;
  push(key: number, node: number) {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.keys = keys;
      const nodes = new Uint32Array(this.size * 2);
      nodes.set(this.nodes);
      this.nodes = nodes;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.keys[i] = this.keys[p]!;
      this.nodes[i] = this.nodes[p]!;
      i = p;
    }
    this.keys[i] = key;
    this.nodes[i] = node;
  }
  pop(): number {
    const top = this.nodes[0]!;
    const key = this.keys[--this.size]!;
    const node = this.nodes[this.size]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1]! < this.keys[c]!) c += 1;
      if (this.keys[c]! >= key) break;
      this.keys[i] = this.keys[c]!;
      this.nodes[i] = this.nodes[c]!;
      i = c;
    }
    this.keys[i] = key;
    this.nodes[i] = node;
    return top;
  }
}

/** Null when no main road is near enough the point to join. */
export function mainRoadsReach(graph: Graph, point: { lat: number; lon: number }, minutesAsked: number[]): MainRoadsReach | null {
  const minutes = [...new Set(minutesAsked)].sort((a, b) => a - b);
  const longest = minutes.at(-1)! * 60;
  const candidates = snapCandidates(graph, point.lat, point.lon);
  if (candidates.length === 0) return null;
  // The join in the largest piece of network near the point, nearest first.
  const piece = Math.max(...candidates.map((c) => graph.componentSize[c.component]!));
  const join = candidates.filter((c) => graph.componentSize[c.component]! === piece).sort((a, b) => a.distanceM - b.distanceM)[0]!;
  const t0 = join.distanceM / (LOCAL_KMH / 3.6);

  const gridM = gridFor(minutes[0]!);
  const lat0 = point.lat;
  const lon0 = point.lon;
  const kx = Math.cos(lat0 * DEG) * 111_320;
  const ky = 110_574;
  const reachM = Math.max(join.distanceM, 0) + longest * (MAX_KMH / 3.6) + 2 * gridM;
  const half = Math.ceil(reachM / gridM) + 2;
  const size = 2 * half;
  const time = new Float32Array(size * size).fill(Number.POSITIVE_INFINITY);
  const mark = (lon: number, lat: number, t: number) => {
    const i = Math.floor(((lon - lon0) * kx) / gridM) + half;
    const j = Math.floor(((lat - lat0) * ky) / gridM) + half;
    if (i < 0 || j < 0 || i >= size || j >= size) return;
    const at = j * size + i;
    if (t < time[at]!) time[at] = t;
  };
  // The way from the point to the join.
  mark(point.lon, point.lat, 0);
  sampleSegment([point.lon, point.lat], [graph.lon[join.node]!, graph.lat[join.node]!], 0, t0, longest, gridM, mark);

  // Dijkstra's method over the main roads, crossings left out.
  const g = new Float64Array(graph.nodeCount).fill(Number.POSITIVE_INFINITY);
  const heap = new MinHeap();
  g[join.node] = t0;
  if (t0 <= longest) heap.push(t0, join.node);
  const { offsets, adjacency, seconds, from, to, cls } = graph;
  while (heap.size > 0) {
    const key = heap.keys[0]!;
    const node = heap.pop();
    if (key > g[node]!) continue;
    for (let k = offsets[node]!; k < offsets[node + 1]!; k += 1) {
      const entry = adjacency[k]!;
      const edge = entry >>> 1;
      const c = cls[edge]!;
      if (c === CLASS.ferry || c === CLASS.shuttle) continue;
      const backward = (entry & 1) === 1;
      const next = backward ? from[edge]! : to[edge]!;
      const cost = key + seconds[edge]!;
      // Along the road as far as the time allows, whether or not its far end is reached.
      const shape = edgeShape(graph, edge, backward);
      sampleLine(shape, key, seconds[edge]!, longest, gridM, mark);
      if (cost <= longest && cost < g[next]!) {
        g[next] = cost;
        heap.push(cost, next);
      }
    }
  }

  const areas = minutes.map((m) => {
    const limit = m * 60;
    let mask: Uint8Array = new Uint8Array(size * size);
    for (let at = 0; at < mask.length; at += 1) if (time[at]! <= limit) mask[at] = 1;
    const own = gridFor(m);
    for (let k = Math.max(1, Math.round(own / gridM)); k > 0; k -= 1) mask = grow(mask, size);
    fillEnclosed(mask, size);
    const rings = traceRings(mask, size).map((ring) =>
      simplifyRing(
        ring.map(([i, j]) => [lon0 + ((i - half) * gridM) / kx, lat0 + ((j - half) * gridM) / ky] as [number, number]),
        own * 0.6,
      ),
    );
    return { minutes: m, polygons: rings.filter((ring) => ring.length >= 4) };
  });
  return {
    join: { lat: graph.lat[join.node]!, lon: graph.lon[join.node]!, distanceM: Math.round(join.distanceM) },
    gridM,
    areas,
  };
}

function sampleSegment(
  a: [number, number],
  b: [number, number],
  tA: number,
  tB: number,
  limit: number,
  gridM: number,
  mark: (lon: number, lat: number, t: number) => void,
) {
  const length = meters(a[1], a[0], b[1], b[0]);
  const steps = Math.max(1, Math.ceil(length / (gridM / 2)));
  for (let s = 0; s <= steps; s += 1) {
    const f = s / steps;
    const t = tA + (tB - tA) * f;
    if (t > limit) return false;
    mark(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, t);
  }
  return true;
}

/** A road's shape from its start at time `t0`, taking `seconds` in all, sampled until `limit`. */
function sampleLine(
  shape: Array<[number, number]>,
  t0: number,
  seconds: number,
  limit: number,
  gridM: number,
  mark: (lon: number, lat: number, t: number) => void,
) {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < shape.length; i += 1) {
    const d = meters(shape[i - 1]![1], shape[i - 1]![0], shape[i]![1], shape[i]![0]);
    lengths.push(d);
    total += d;
  }
  if (total === 0) return;
  let done = 0;
  for (let i = 1; i < shape.length; i += 1) {
    const tA = t0 + (seconds * done) / total;
    done += lengths[i - 1]!;
    const tB = t0 + (seconds * done) / total;
    if (!sampleSegment(shape[i - 1]!, shape[i]!, tA, tB, limit, gridM, mark)) return;
  }
}

/** Each marked cell and the eight round it. */
function grow(mask: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < size; j += 1)
    for (let i = 0; i < size; i += 1) {
      if (!mask[j * size + i]) continue;
      for (let dj = -1; dj <= 1; dj += 1)
        for (let di = -1; di <= 1; di += 1) {
          const x = i + di;
          const y = j + dj;
          if (x >= 0 && y >= 0 && x < size && y < size) out[y * size + x] = 1;
        }
    }
  return out;
}

/** Fills every unmarked cell the grid's edge cannot reach (four ways): an area has no holes. */
function fillEnclosed(mask: Uint8Array, size: number) {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= size || j >= size) return;
    const at = j * size + i;
    if (mask[at] || outside[at]) return;
    outside[at] = 1;
    stack.push(at);
  };
  for (let k = 0; k < size; k += 1) {
    push(k, 0);
    push(k, size - 1);
    push(0, k);
    push(size - 1, k);
  }
  while (stack.length > 0) {
    const at = stack.pop()!;
    const i = at % size;
    const j = (at - i) / size;
    push(i + 1, j);
    push(i - 1, j);
    push(i, j + 1);
    push(i, j - 1);
  }
  for (let at = 0; at < mask.length; at += 1) if (!outside[at]) mask[at] = 1;
}

/**
 * The outlines of the marked cells, as rings of grid corners, anticlockwise (the marked
 * side on the left). Where two cells touch only at a corner they are kept apart.
 */
export function traceRings(mask: Uint8Array, size: number): Array<Array<[number, number]>> {
  const W = size + 1;
  const vid = (i: number, j: number) => j * W + i;
  // Outgoing edges from each corner: a bit per direction (1 east, 2 north, 4 west, 8 south).
  const out = new Map<number, number>();
  const add = (i: number, j: number, dir: number) => out.set(vid(i, j), (out.get(vid(i, j)) ?? 0) | (1 << dir));
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size && mask[j * size + i] === 1;
  for (let j = 0; j < size; j += 1)
    for (let i = 0; i < size; i += 1) {
      if (!inside(i, j)) continue;
      if (!inside(i, j - 1)) add(i, j, 0);
      if (!inside(i + 1, j)) add(i + 1, j, 1);
      if (!inside(i, j + 1)) add(i + 1, j + 1, 2);
      if (!inside(i - 1, j)) add(i, j + 1, 3);
    }
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const single = (bits: number) => bits !== 0 && (bits & (bits - 1)) === 0;
  const rings: Array<Array<[number, number]>> = [];
  // Every ring passes a corner that is not where two cells meet diagonally: start only from those, so each ring closes where it began.
  for (const [start, bits] of [...out.entries()]) {
    if (!single(bits) || out.get(start) !== bits) continue;
    let dir = Math.log2(bits);
    let i = start % W;
    let j = (start - i) / W;
    const ring: Array<[number, number]> = [[i, j]];
    for (let guard = 0; guard < 4 * W * W; guard += 1) {
      const here = vid(i, j);
      out.set(here, (out.get(here) ?? 0) & ~(1 << dir));
      i += DX[dir]!;
      j += DY[dir]!;
      const there = vid(i, j);
      if (there === start) break;
      const left = out.get(there) ?? 0;
      // Turn left first, which keeps cells that touch only at a corner apart.
      const next = [(dir + 1) % 4, dir, (dir + 3) % 4].find((d) => left & (1 << d));
      if (next === undefined) break;
      if (next !== dir) ring.push([i, j]);
      dir = next;
    }
    ring.push(ring[0]!);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function simplifyRing(ring: Ring, toleranceM: number): Ring {
  if (ring.length <= 5) return ring.map(round5);
  const flat: number[] = [];
  for (const [lon, lat] of ring) flat.push(Math.round(lat * 1e7), Math.round(lon * 1e7));
  const keep = simplifyIndices(flat, toleranceM);
  const out = keep.map((k) => round5(ring[k]!));
  return out.length >= 4 ? out : ring.map(round5);
}

const round5 = ([lon, lat]: [number, number]): [number, number] => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];

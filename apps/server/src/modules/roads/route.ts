/**
 * The quickest way through the joined networks: A* from each point to the next, by time,
 * with straight-line distance at the fastest speed anything is driven (speeds.ts) as the
 * estimate, so the route found is the quickest the network knows. Nothing is asked of
 * any server: this reads only the networks in memory.
 */
import { CLASS } from "./build.ts";
import { type Graph, meters, nearbyInGrid } from "./graph.ts";
import { MAX_KMH } from "./speeds.ts";

export interface Step {
  edge: number;
  backward: boolean;
}

/** Reused between searches: one set of arrays the size of the graph. */
interface Workspace {
  graph: Graph;
  g: Float64Array;
  prev: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  current: number;
}
let workspace: Workspace | null = null;

function workspaceFor(graph: Graph): Workspace {
  if (workspace?.graph === graph) return workspace;
  const n = graph.nodeCount;
  workspace = { graph, g: new Float64Array(n), prev: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), current: 0 };
  return workspace;
}

/** Forgets the arrays of a graph no longer used. */
export function releaseWorkspace(): void {
  workspace = null;
}

class Heap {
  keys = new Float64Array(1024);
  nodes = new Uint32Array(1024);
  size = 0;
  push(key: number, node: number): void {
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
  /** The node with the smallest key; -1 when empty. */
  pop(): number {
    if (this.size === 0) return -1;
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

export interface SearchResult {
  steps: Step[];
  seconds: number;
  settled: number;
}

const MAX_MS = MAX_KMH / 3.6;

export function quickestPath(graph: Graph, source: number, target: number, allowed: (edge: number) => boolean): SearchResult | null {
  const w = workspaceFor(graph);
  w.current += 1;
  if (w.current === 0xffffffff) {
    w.stamp.fill(0);
    w.closed.fill(0);
    w.current = 1;
  }
  const { g, prev, stamp, closed } = w;
  const run = w.current;
  const tLat = graph.lat[target]!;
  const tLon = graph.lon[target]!;
  // A shade under the true distance, so the estimate never overstates.
  const h = (node: number) => (meters(graph.lat[node]!, graph.lon[node]!, tLat, tLon) * 0.995) / MAX_MS;
  const heap = new Heap();
  g[source] = 0;
  prev[source] = -1;
  stamp[source] = run;
  heap.push(h(source), source);
  let settled = 0;
  const { offsets, adjacency, seconds, from, to } = graph;
  for (;;) {
    const node = heap.pop();
    if (node < 0) return null;
    if (closed[node] === run) continue;
    closed[node] = run;
    settled += 1;
    if (node === target) break;
    const base = g[node]!;
    for (let i = offsets[node]!; i < offsets[node + 1]!; i += 1) {
      const entry = adjacency[i]!;
      const edge = entry >>> 1;
      if (!allowed(edge)) continue;
      const next = entry & 1 ? from[edge]! : to[edge]!;
      if (closed[next] === run) continue;
      const cost = base + seconds[edge]!;
      if (stamp[next] !== run || cost < g[next]!) {
        stamp[next] = run;
        g[next] = cost;
        prev[next] = entry;
        heap.push(cost + h(next), next);
      }
    }
  }
  const steps: Step[] = [];
  for (let node = target; node !== source; ) {
    const entry = prev[node]!;
    const edge = entry >>> 1;
    const backward = (entry & 1) === 1;
    steps.push({ edge, backward });
    node = backward ? to[edge]! : from[edge]!;
  }
  steps.reverse();
  return { steps, seconds: g[target]!, settled };
}

// ── Joining a point to the network ───────────────────────────────────────────

/** How far from a point its join to the network is looked for. */
export const SNAP_WITHIN_M = 40_000;
/** A piece of network smaller than this (nodes) is not joined to: an island of road the rest does not reach. */
const SMALL_PIECE = 200;

export interface SnapCandidate {
  node: number;
  distanceM: number;
  component: number;
}

export function snapCandidates(graph: Graph, lat: number, lon: number): SnapCandidate[] {
  const grid = { nodes: graph.snapNodes, cells: graph.snapCells };
  const smallest = Math.min(SMALL_PIECE, largestPiece(graph));
  return nearbyInGrid(
    grid,
    graph.lat,
    graph.lon,
    lat,
    lon,
    SNAP_WITHIN_M,
    (node) => graph.componentSize[graph.component[node]!]! >= smallest,
    40,
  ).map(({ node, distanceM }) => ({ node, distanceM, component: graph.component[node]! }));
}

let largestCache: { graph: Graph; size: number } | null = null;
function largestPiece(graph: Graph): number {
  if (largestCache?.graph === graph) return largestCache.size;
  let size = 0;
  for (let i = 0; i < graph.componentSize.length; i += 1) if (graph.componentSize[i]! > size) size = graph.componentSize[i]!;
  largestCache = { graph, size };
  return size;
}

/**
 * The piece of network every point can join, and each point's nearest node in it. Points
 * near no network come back as null, for the caller to say which country is missing.
 */
export function chooseJoins(graph: Graph, candidates: SnapCandidate[][]): Array<SnapCandidate | null> | null {
  const pieces = new Map<number, number>();
  for (const list of candidates) for (const c of list) pieces.set(c.component, graph.componentSize[c.component]!);
  const ordered = [...pieces.keys()].sort((a, b) => pieces.get(b)! - pieces.get(a)!);
  for (const piece of ordered) {
    const picks = candidates.map((list) => list.find((c) => c.component === piece) ?? null);
    if (picks.every(Boolean)) return picks;
  }
  return null;
}

// ── Crossings ────────────────────────────────────────────────────────────────

/** Which edges a route may use for a crossing choice: "any", "eurotunnel", or a ferry's id. */
export function crossingFilter(graph: Graph, choice: string): (edge: number) => boolean {
  if (choice === "any") return () => true;
  const wanted = choice === "eurotunnel" ? "eurotunnel" : (graph.crossings.find((c) => c.id === choice)?.key ?? choice);
  return (edge) => {
    const c = graph.cls[edge]!;
    if (c !== CLASS.ferry && c !== CLASS.shuttle) return true;
    const info = graph.crossings[graph.crossing[edge]!];
    if (!info) return true;
    if (info.key === wanted) return true;
    // River ferries are part of the road; only sea crossings are chosen between.
    return c === CLASS.ferry && !info.sea;
  };
}

/**
 * The installed networks joined into one graph to route on.
 *
 * Geofabrik's extracts hold every way that crosses their edge whole, with all its nodes
 * (measured: no node missing in Kent, Nord-Pas-de-Calais or Luxembourg), so two
 * neighbouring extracts share the OpenStreetMap ids of the nodes along and across their
 * border. Joining is therefore by id: nodes with the same id become one node, and an
 * edge both networks hold between two such nodes is kept once.
 *
 * Crossings join land to land. A ferry's or the shuttle's way ends in a port or terminal,
 * on its own service roads, which this network leaves out; so each end of a crossing is
 * joined to the nearest main-road node within `CONNECT_WITHIN_M` by a short edge said to
 * be local roads (speeds.ts gives its time). That is how Dover's ferries reach the A20
 * and the shuttle at Folkestone reaches the M20.
 */
import { CLASS, isCrossing, isLink } from "./build.ts";
import type { LoadedNetwork } from "./network-file.ts";
import { CONNECTOR_DETOUR, edgeSeconds } from "./speeds.ts";

export const CONNECT_WITHIN_M = 8000;
/** A ferry this long or longer crosses the sea; shorter ones (river ferries) are always allowed. */
export const SEA_CROSSING_M = 5000;

export interface GraphNetwork {
  id: string;
  name: string;
  country: string | null;
  dataDate: string | null;
}

export interface GraphCrossing {
  id: string;
  /** What a route's crossing choice is compared with: "eurotunnel" for the shuttle, else a ferry's id (one per named route). */
  key: string;
  kind: "ferry" | "shuttle";
  name: string;
  operator: string | null;
  from: string | null;
  to: string | null;
  durationS: number | null;
  lengthM: number;
  sea: boolean;
  /** Its two ends as node indices, once joined. */
  ends: number[];
  joined: boolean;
}

export interface Graph {
  networks: GraphNetwork[];
  strings: string[];
  nodeCount: number;
  nodeId: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  /** The network a node came from first: for its country. */
  nodeNetwork: Uint16Array;
  junctions: Map<number, { ref: string; name: string }>;
  edgeCount: number;
  from: Uint32Array;
  to: Uint32Array;
  length: Float32Array;
  seconds: Float32Array;
  cls: Uint8Array;
  flags: Uint8Array;
  ref: Uint32Array;
  intRef: Uint32Array;
  name: Uint32Array;
  signF: Uint32Array;
  signB: Uint32Array;
  /** Where an edge's shape is: its network and its index there (connectors: none). */
  network: Int16Array;
  local: Uint32Array;
  crossing: Int32Array;
  crossings: GraphCrossing[];
  /** Outgoing adjacency: for node n, entries adjacency[offsets[n] .. offsets[n+1]) are edge*2 + (1 when driven against its geometry). */
  offsets: Uint32Array;
  adjacency: Uint32Array;
  /** Weakly connected component of each node, and each component's size. */
  component: Int32Array;
  componentSize: Int32Array;
  /** Nodes a point may be joined at, sorted by grid cell; and each one's cell. */
  snapNodes: Uint32Array;
  snapCells: Float64Array;
  sources: LoadedNetwork[];
  /** Bytes the graph holds in typed arrays (not counting the networks' own). */
  bytes: number;
}

export const SNAP_CELL_DEG = 0.05;
/** Packs a cell and a node into one number for sorting: room for 67 million nodes. */
const CELL_SHIFT = 2 ** 26;
export const cellOf = (lat: number, lon: number) =>
  Math.floor((lat + 90) / SNAP_CELL_DEG) * 10_000 + Math.floor((lon + 180) / SNAP_CELL_DEG);

const RAD = Math.PI / 180;
export function meters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const normalName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();

export function buildGraph(sources: Array<{ network: GraphNetwork; data: LoadedNetwork }>): Graph {
  const k = sources.length;
  // Strings, merged.
  const strings: string[] = [""];
  const stringIndex = new Map<string, number>([["", 0]]);
  const stringMaps = sources.map(({ data }) =>
    Uint32Array.from(data.strings, (text) => {
      let at = stringIndex.get(text);
      if (at === undefined) {
        at = strings.length;
        strings.push(text);
        stringIndex.set(text, at);
      }
      return at;
    }),
  );

  // Nodes, merged by id: each network's ids are sorted, so walk them together.
  const globalOf = sources.map(({ data }) => new Uint32Array(data.nodeId.length));
  const heads = new Int32Array(k);
  let total = 0;
  for (const { data } of sources) total += data.nodeId.length;
  const ids = new Float64Array(total);
  const latArr = new Float64Array(total);
  const lonArr = new Float64Array(total);
  const nodeNetwork = new Uint16Array(total);
  const shared = new Uint8Array(total);
  let n = 0;
  for (;;) {
    let best = -1;
    let bestId = Infinity;
    for (let s = 0; s < k; s += 1) {
      const list = sources[s]!.data.nodeId;
      if (heads[s]! < list.length && list[heads[s]!]! < bestId) {
        bestId = list[heads[s]!]!;
        best = s;
      }
    }
    if (best < 0) break;
    const data = sources[best]!.data;
    ids[n] = bestId;
    latArr[n] = data.nodeLat[heads[best]!]! * 1e-7;
    lonArr[n] = data.nodeLon[heads[best]!]! * 1e-7;
    nodeNetwork[n] = best;
    let seen = 0;
    for (let s = 0; s < k; s += 1) {
      const list = sources[s]!.data.nodeId;
      if (heads[s]! < list.length && list[heads[s]!] === bestId) {
        globalOf[s]![heads[s]!] = n;
        heads[s] = heads[s]! + 1;
        seen += 1;
      }
    }
    if (seen > 1) shared[n] = 1;
    n += 1;
  }

  const junctions = new Map<number, { ref: string; name: string }>();
  sources.forEach(({ data }, s) => {
    for (let j = 0; j < data.junctionNode.length; j += 1) {
      const node = globalOf[s]![data.junctionNode[j]!]!;
      if (!junctions.has(node))
        junctions.set(node, { ref: data.strings[data.junctionRef[j]!] ?? "", name: data.strings[data.junctionName[j]!] ?? "" });
    }
  });

  // Crossings, merged by id.
  const crossings: GraphCrossing[] = [];
  const crossingById = new Map<string, number>();
  const crossingMaps = sources.map(({ data }) =>
    data.crossings.map((info) => {
      let at = crossingById.get(info.id);
      if (at === undefined) {
        at = crossings.length;
        crossingById.set(info.id, at);
        crossings.push({ ...info, key: info.id, sea: info.lengthM >= SEA_CROSSING_M, ends: [], joined: false });
      } else if (info.lengthM > crossings[at]!.lengthM)
        crossings[at] = { ...crossings[at]!, lengthM: info.lengthM, sea: info.lengthM >= SEA_CROSSING_M };
      return at;
    }),
  );

  // Edges, an edge between two shared nodes kept once.
  let edgeTotal = 0;
  for (const { data } of sources) edgeTotal += data.edgeFrom.length;
  const room = edgeTotal + 4096;
  const from = new Uint32Array(room);
  const to = new Uint32Array(room);
  const length = new Float32Array(room);
  const seconds = new Float32Array(room);
  const cls = new Uint8Array(room);
  const flags = new Uint8Array(room);
  const ref = new Uint32Array(room);
  const intRef = new Uint32Array(room);
  const name = new Uint32Array(room);
  const signF = new Uint32Array(room);
  const signB = new Uint32Array(room);
  const network = new Int16Array(room);
  const local = new Uint32Array(room);
  const crossing = new Int32Array(room).fill(-1);
  const seenEdges = new Set<string>();
  let e = 0;
  sources.forEach(({ data }, s) => {
    const map = globalOf[s]!;
    const sm = stringMaps[s]!;
    for (let i = 0; i < data.edgeFrom.length; i += 1) {
      const a = map[data.edgeFrom[i]!]!;
      const b = map[data.edgeTo[i]!]!;
      if (shared[a] && shared[b] && k > 1) {
        const key = `${a},${b},${Math.round(data.edgeLength[i]!)}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
      }
      from[e] = a;
      to[e] = b;
      length[e] = data.edgeLength[i]!;
      cls[e] = data.edgeClass[i]!;
      flags[e] = data.edgeFlags[i]!;
      seconds[e] = edgeSeconds(cls[e]!, length[e]!, data.edgeMaxspeed[i]!, flags[e]!, data.edgeFixed[i]!);
      ref[e] = sm[data.edgeRef[i]!]!;
      intRef[e] = sm[data.edgeIntRef[i]!]!;
      name[e] = sm[data.edgeName[i]!]!;
      signF[e] = sm[data.edgeSignF[i]!]!;
      signB[e] = sm[data.edgeSignB[i]!]!;
      network[e] = s;
      local[e] = i;
      const c = data.edgeCrossing[i]!;
      crossing[e] = c >= 0 ? crossingMaps[s]![c]! : -1;
      e += 1;
    }
  });
  seenEdges.clear();

  // Which nodes have road edges, and how many crossing edges meet at each.
  const roadDegree = new Uint8Array(n);
  const crossingDegree = new Uint8Array(n);
  for (let i = 0; i < e; i += 1) {
    const degree = isCrossing(cls[i]!) ? crossingDegree : roadDegree;
    if (degree[from[i]!]! < 255) degree[from[i]!] = degree[from[i]!]! + 1;
    if (degree[to[i]!]! < 255) degree[to[i]!] = degree[to[i]!]! + 1;
  }
  // Nodes a point may be joined at: on a road other than a motorway or a slip road.
  const snappable = new Uint8Array(n);
  for (let i = 0; i < e; i += 1) {
    const c = cls[i]!;
    if (c === CLASS.trunk || c === CLASS.primary || c === CLASS.secondary) {
      snappable[from[i]!] = 1;
      snappable[to[i]!] = 1;
    }
  }
  const grid = (filter: (node: number) => boolean) => {
    const keys: number[] = [];
    for (let node = 0; node < n; node += 1) if (filter(node)) keys.push(cellOf(latArr[node]!, lonArr[node]!) * CELL_SHIFT + node);
    const sorted = Float64Array.from(keys).sort();
    const nodes = new Uint32Array(sorted.length);
    const cells = new Float64Array(sorted.length);
    for (let i = 0; i < sorted.length; i += 1) {
      cells[i] = Math.floor(sorted[i]! / CELL_SHIFT);
      nodes[i] = sorted[i]! - cells[i]! * CELL_SHIFT;
    }
    return { nodes, cells };
  };
  const roadGrid = grid((node) => roadDegree[node]! > 0 && snappable[node] === 1);

  // Each crossing's ends joined to the nearest main road.
  const ends = new Map<number, number>();
  for (let i = 0; i < e; i += 1) {
    if (!isCrossing(cls[i]!)) continue;
    for (const node of [from[i]!, to[i]!]) if (crossingDegree[node] === 1 && roadDegree[node] === 0) ends.set(node, crossing[i]!);
  }
  for (const [node, c] of ends) {
    const near = nearestInGrid(roadGrid, latArr, lonArr, latArr[node]!, lonArr[node]!, CONNECT_WITHIN_M, () => true);
    const info = crossings[c];
    if (info) info.ends.push(node);
    if (!near) continue;
    if (e >= room) break;
    const straight = near.distanceM;
    from[e] = node;
    to[e] = near.node;
    length[e] = straight * CONNECTOR_DETOUR;
    cls[e] = CLASS.connector;
    flags[e] = 0;
    seconds[e] = edgeSeconds(CLASS.connector, length[e]!, 0, 0, 0);
    network[e] = -1;
    crossing[e] = -1;
    e += 1;
  }
  for (const info of crossings) {
    info.joined = info.ends.length >= 2;
  }
  // One key per crossing a person would name: the shuttle is "eurotunnel"; ferries of the same name whose ends are near are one.
  for (let i = 0; i < crossings.length; i += 1) {
    const c = crossings[i]!;
    if (c.kind === "shuttle") {
      c.key = "eurotunnel";
      continue;
    }
    for (let j = 0; j < i; j += 1) {
      const other = crossings[j]!;
      if (other.kind === "ferry" && normalName(other.name) === normalName(c.name)) {
        c.key = other.key;
        break;
      }
    }
  }

  // Adjacency.
  const count = new Uint32Array(n + 1);
  for (let i = 0; i < e; i += 1) {
    count[from[i]!] = count[from[i]!]! + 1;
    if (!(flags[i]! & 1)) count[to[i]!] = count[to[i]!]! + 1;
  }
  const offsets = new Uint32Array(n + 1);
  for (let node = 0; node < n; node += 1) offsets[node + 1] = offsets[node]! + count[node]!;
  const adjacency = new Uint32Array(offsets[n]!);
  const fill = offsets.slice(0, n);
  for (let i = 0; i < e; i += 1) {
    adjacency[fill[from[i]!]!] = i * 2;
    fill[from[i]!] = fill[from[i]!]! + 1;
    if (!(flags[i]! & 1)) {
      adjacency[fill[to[i]!]!] = i * 2 + 1;
      fill[to[i]!] = fill[to[i]!]! + 1;
    }
  }

  // Components.
  const parent = new Int32Array(n);
  for (let node = 0; node < n; node += 1) parent[node] = node;
  const find = (x: number) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (let i = 0; i < e; i += 1) {
    const a = find(from[i]!);
    const b = find(to[i]!);
    if (a !== b) parent[a] = b;
  }
  const component = new Int32Array(n);
  const componentSize = new Int32Array(n);
  for (let node = 0; node < n; node += 1) {
    const root = find(node);
    component[node] = root;
    componentSize[root] = componentSize[root]! + 1;
  }

  const graph: Graph = {
    networks: sources.map(({ network: net }) => net),
    strings,
    nodeCount: n,
    nodeId: ids.subarray(0, n),
    lat: latArr.subarray(0, n),
    lon: lonArr.subarray(0, n),
    nodeNetwork: nodeNetwork.subarray(0, n),
    junctions,
    edgeCount: e,
    from: from.subarray(0, e),
    to: to.subarray(0, e),
    length: length.subarray(0, e),
    seconds: seconds.subarray(0, e),
    cls: cls.subarray(0, e),
    flags: flags.subarray(0, e),
    ref: ref.subarray(0, e),
    intRef: intRef.subarray(0, e),
    name: name.subarray(0, e),
    signF: signF.subarray(0, e),
    signB: signB.subarray(0, e),
    network: network.subarray(0, e),
    local: local.subarray(0, e),
    crossing: crossing.subarray(0, e),
    crossings,
    offsets,
    adjacency,
    component,
    componentSize,
    snapNodes: roadGrid.nodes,
    snapCells: roadGrid.cells,
    sources: sources.map(({ data }) => data),
    bytes: 0,
  };
  graph.bytes = [
    ids,
    latArr,
    lonArr,
    nodeNetwork,
    shared,
    from,
    to,
    length,
    seconds,
    cls,
    flags,
    ref,
    intRef,
    name,
    signF,
    signB,
    network,
    local,
    crossing,
    offsets,
    adjacency,
    component,
    componentSize,
    roadGrid.nodes,
    roadGrid.cells,
    ...globalOf,
  ].reduce((sum, array) => sum + array.byteLength, 0);
  return graph;
}

function lowerBound(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Nodes of the grid within `withinM`, nearest first (at most `limit`). */
export function nearbyInGrid(
  grid: { nodes: Uint32Array; cells: Float64Array },
  latArr: Float64Array,
  lonArr: Float64Array,
  lat: number,
  lon: number,
  withinM: number,
  accept: (node: number) => boolean,
  limit = 1,
): Array<{ node: number; distanceM: number }> {
  const rings = Math.ceil(withinM / (SNAP_CELL_DEG * 111_000 * Math.max(0.2, Math.cos(lat * RAD)))) + 1;
  const found: Array<{ node: number; distanceM: number }> = [];
  const latCell = Math.floor((lat + 90) / SNAP_CELL_DEG);
  const lonCell = Math.floor((lon + 180) / SNAP_CELL_DEG);
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cell = (latCell + dy) * 10_000 + (lonCell + dx);
        for (let i = lowerBound(grid.cells, cell); i < grid.cells.length && grid.cells[i] === cell; i += 1) {
          const node = grid.nodes[i]!;
          if (!accept(node)) continue;
          const d = meters(lat, lon, latArr[node]!, lonArr[node]!);
          if (d <= withinM) found.push({ node, distanceM: d });
        }
      }
    }
    // Every node in a further ring is at least `ring` cells away: stop once enough are nearer than that.
    const reach = ring * SNAP_CELL_DEG * 111_000 * Math.max(0.2, Math.cos(lat * RAD)) * 0.9;
    if (found.length >= limit && found.filter((f) => f.distanceM <= reach).length >= limit) break;
  }
  return found.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

export function nearestInGrid(
  grid: { nodes: Uint32Array; cells: Float64Array },
  latArr: Float64Array,
  lonArr: Float64Array,
  lat: number,
  lon: number,
  withinM: number,
  accept: (node: number) => boolean,
): { node: number; distanceM: number } | null {
  return nearbyInGrid(grid, latArr, lonArr, lat, lon, withinM, accept, 1)[0] ?? null;
}

/** The shape of edge `e` as [lon, lat] points from its start to its end, in the direction asked. */
export function edgeShape(graph: Graph, e: number, backward: boolean): Array<[number, number]> {
  const points: Array<[number, number]> = [[graph.lon[graph.from[e]!]!, graph.lat[graph.from[e]!]!]];
  const s = graph.network[e]!;
  if (s >= 0) {
    const data = graph.sources[s]!;
    const i = graph.local[e]!;
    for (let p = data.shapeStart[i]!; p < data.shapeStart[i + 1]!; p += 1)
      points.push([data.shape[2 * p + 1]! * 1e-7, data.shape[2 * p]! * 1e-7]);
  }
  points.push([graph.lon[graph.to[e]!]!, graph.lat[graph.to[e]!]!]);
  return backward ? points.reverse() : points;
}

export const edgeIsLink = (graph: Graph, e: number) => isLink(graph.cls[e]!);

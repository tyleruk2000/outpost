/**
 * A made-up main-roads network shaped like the owner's own London to Chamonix list:
 *
 *     M25
 *     M20 - Folkestone
 *     (the Channel: Eurotunnel's shuttle, or the Dover to Calais ferry)
 *     A26 (E17) - Reims (A4)
 *     A26 (E17) - Troyes
 *     A5 (E17 - E54)
 *     A31 - Dijon
 *     A39 - Geneve
 *     A40 (E21 E62) - Geneve
 *     A40 (E25) - Chamonix
 *     N205 - Chamonix
 *
 * in three extracts as Geofabrik cuts them: Great Britain, and France in a northern and
 * a southern part. Each holds the ways that cross its edge whole, so the shuttle and the
 * ferry are in Great Britain's file and in northern France's, and the A5's second way is
 * in both parts of France, with the same node ids. Positions are near the real roads;
 * the roads themselves are a few points each.
 */
import { buildPbf, type PbfNode, type PbfWay } from "../layers/builders.ts";

export const LEATHERHEAD = { lat: 51.296, lon: -0.33, name: "Leatherhead" };
export const CHAMONIX = { lat: 45.9237, lon: 6.8694, name: "Chamonix" };
export const REIMS = { lat: 49.27, lon: 4.06, name: "Reims" };
export const FERRY_WAY = 900;
export const TIMESTAMP = Date.parse("2026-11-20T21:00:00Z") / 1000;

const N: Record<number, [number, number]> = {
  // Great Britain
  1: [51.296, -0.33],
  2: [51.3, -0.32],
  3: [51.305, -0.31],
  4: [51.33, -0.1],
  5: [51.39, 0.17],
  6: [51.39, 0.19],
  7: [51.27, 0.52],
  8: [51.1, 1.1],
  9: [51.096, 1.115],
  10: [51.094, 1.127],
  11: [51.123, 1.31],
  // The shuttle and the ferry
  20: [51.0942, 1.1312],
  21: [51.0, 1.5],
  22: [50.931, 1.811],
  23: [50.9305, 1.8125],
  24: [51.0, 1.51],
  25: [51.0938, 1.1318],
  30: [51.1235, 1.3175],
  31: [51.05, 1.6],
  32: [50.967, 1.862],
  // Northern France
  40: [50.932, 1.816],
  41: [50.935, 1.84],
  42: [50.94, 1.86],
  43: [50.963, 1.866],
  44: [50.3, 2.8],
  45: [49.6, 3.6],
  46: [49.27, 4.05],
  47: [48.8, 4.1],
  48: [48.33, 4.1],
  49: [48.31, 4.12],
  50: [48.1, 4.7],
  51: [47.87, 5.33],
  // Reims, off the A26
  66: [49.262, 4.035],
  67: [49.266, 4.045],
  // Southern France
  52: [47.86, 5.34],
  53: [47.6, 5.2],
  54: [47.33, 5.05],
  55: [47.32, 5.06],
  56: [46.8, 5.2],
  57: [46.21, 5.24],
  58: [46.2, 5.26],
  59: [46.15, 5.7],
  60: [46.14, 6.05],
  61: [46.05, 6.4],
  62: [45.93, 6.66],
  63: [45.928, 6.675],
  64: [45.93, 6.8],
  65: [45.924, 6.869],
};

const JUNCTIONS: Record<number, Record<string, string>> = {
  3: { highway: "motorway_junction", ref: "9", name: "Leatherhead" },
  5: { highway: "motorway_junction", ref: "3", name: "Swanley" },
  8: { highway: "motorway_junction", ref: "11A", name: "Cheriton" },
  46: { highway: "motorway_junction", ref: "23", name: "Reims-Centre" },
  48: { highway: "motorway_junction", ref: "21", name: "Troyes-Nord" },
  51: { highway: "motorway_junction", ref: "6", name: "Langres" },
  54: { highway: "motorway_junction", ref: "1", name: "Dijon-Est" },
  57: { highway: "motorway_junction", ref: "7", name: "Bourg-en-Bresse" },
  62: { highway: "motorway_junction", ref: "21", name: "Le Fayet" },
};

const motorway = (ref: string, extra: Record<string, string> = {}) => ({ highway: "motorway", ref, ...extra });
const link = (extra: Record<string, string> = {}) => ({ highway: "motorway_link", ...extra });

const GB_WAYS: PbfWay[] = [
  { id: 101, refs: [1, 2], tags: { highway: "primary", ref: "A24", name: "Epsom Road" } },
  { id: 102, refs: [2, 3], tags: link() },
  { id: 103, refs: [3, 4, 5], tags: motorway("M25") },
  { id: 104, refs: [5, 6], tags: link({ destination: "Folkestone" }) },
  { id: 105, refs: [6, 7, 8], tags: motorway("M20") },
  { id: 106, refs: [8, 9], tags: link({ destination: "Channel Tunnel" }) },
  { id: 107, refs: [9, 10], tags: { highway: "primary", name: "Ashford Road" } },
  { id: 108, refs: [8, 11], tags: { highway: "trunk", ref: "A20", "destination:forward": "Dover" } },
];

const CROSSING_WAYS: PbfWay[] = [
  {
    id: 801,
    refs: [20, 21, 22],
    tags: { route: "shuttle_train", name: "Le Shuttle", operator: "GetLink", motorcar: "yes", duration: "35", oneway: "yes" },
  },
  {
    id: 802,
    refs: [23, 24, 25],
    tags: { route: "shuttle_train", name: "Le Shuttle", operator: "GetLink", motorcar: "yes", duration: "35", oneway: "yes" },
  },
  {
    id: FERRY_WAY,
    refs: [30, 31, 32],
    tags: { route: "ferry", name: "Dover (UK) - Calais (F)", operator: "P&O Ferries", motorcar: "yes", duration: "1:30" },
  },
  // A ferry for people on foot only: never part of a road route.
  { id: 901, refs: [30, 32], tags: { route: "ferry", name: "Foot ferry", motor_vehicle: "no" } },
];

const NORTH_WAYS: PbfWay[] = [
  { id: 201, refs: [40, 41], tags: { highway: "primary", ref: "D243" } },
  { id: 202, refs: [43, 41], tags: { highway: "primary", ref: "N216" } },
  { id: 203, refs: [41, 42], tags: link({ destination: "Reims", "destination:ref": "A4" }) },
  { id: 204, refs: [42, 44, 45], tags: motorway("A26", { int_ref: "E 17" }) },
  { id: 205, refs: [45, 46], tags: motorway("A26", { int_ref: "E17", destination: "Reims;Arras" }) },
  { id: 206, refs: [46, 47, 48], tags: motorway("A26", { int_ref: "E17", destination: "Troyes", maxspeed: "130" }) },
  { id: 207, refs: [48, 49], tags: link() },
  { id: 210, refs: [46, 66], tags: link({ destination: "Reims-Centre" }) },
  { id: 211, refs: [66, 67], tags: { highway: "primary", ref: "N44", name: "Avenue de Laon" } },
  { id: 212, refs: [67, 46], tags: link({ destination: "Troyes" }) },
  { id: 208, refs: [49, 50], tags: motorway("A5", { int_ref: "E17" }) },
];

/** The way across the line between the two parts of France: in both files. */
const BORDER_WAYS: PbfWay[] = [{ id: 209, refs: [50, 51], tags: motorway("A5", { int_ref: "E54" }) }];

const SOUTH_WAYS: PbfWay[] = [
  { id: 301, refs: [51, 52], tags: link({ destination: "Dijon" }) },
  { id: 302, refs: [52, 53, 54], tags: motorway("A31") },
  { id: 303, refs: [54, 55], tags: link({ destination: "Geneve" }) },
  { id: 304, refs: [55, 56, 57], tags: motorway("A39") },
  { id: 305, refs: [57, 58], tags: link({ destination: "Geneve" }) },
  { id: 306, refs: [58, 59, 60], tags: motorway("A40", { int_ref: "E21;E62" }) },
  { id: 307, refs: [60, 61, 62], tags: motorway("A40", { int_ref: "E25", destination: "Chamonix" }) },
  { id: 308, refs: [62, 63], tags: link({ destination: "Chamonix" }) },
  { id: 309, refs: [63, 64, 65], tags: { highway: "trunk", ref: "N205", maxspeed: "90" } },
];

function file(ways: PbfWay[], extraNodes: PbfNode[] = []): Buffer {
  const ids = new Set<number>();
  for (const way of ways) for (const ref of way.refs) ids.add(ref);
  const nodes: PbfNode[] = [...ids]
    .sort((a, b) => a - b)
    .map((id) => ({ id, lat: N[id]![0], lon: N[id]![1], ...(JUNCTIONS[id] ? { tags: JUNCTIONS[id] } : {}) }));
  // Nodes nothing uses, and a shop, as every real extract has: none of them should be read.
  const others: PbfNode[] = [
    { id: 5_000, lat: 50, lon: 2, tags: { shop: "bakery", name: "Boulangerie" } },
    { id: 5_001, lat: 50.1, lon: 2.1 },
    ...extraNodes,
  ];
  const all = [...nodes, ...others].sort((a, b) => a.id - b.id);
  const footpath: PbfWay = { id: 9_000, refs: [5_000, 5_001], tags: { highway: "footway" } };
  return buildPbf({ nodes: all, ways: [...ways, footpath].sort((a, b) => a.id - b.id), relations: [], timestamp: TIMESTAMP });
}

export const greatBritain = () => file([...GB_WAYS, ...CROSSING_WAYS]);
export const franceNorth = () => file([...CROSSING_WAYS, ...NORTH_WAYS, ...BORDER_WAYS]);
export const franceSouth = () => file([...BORDER_WAYS, ...SOUTH_WAYS]);

/** The owner's list, as it should come out (the crossing between). */
export const OWNER_LINES_AFTER_CROSSING = [
  "A26 (E17) - Reims (A4)",
  "A26 (E17) - Troyes",
  "A5 (E17 - E54)",
  "A31 - Dijon",
  "A39 - Geneve",
  "A40 (E21 E62) - Geneve",
  "A40 (E25) - Chamonix",
  "N205 - Chamonix",
];

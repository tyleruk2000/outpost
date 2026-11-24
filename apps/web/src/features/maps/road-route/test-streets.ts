/**
 * Routes on streets and the streets service's state, as the server answers them, for the
 * web tests: a door-to-door drive (the channel trip with streets from Fetcham and to a
 * door in Chamonix), a walk, and the service installed, ready, with no streets, or absent.
 * The lines are the server's narrative's own words (apps/server/test/streets.test.ts).
 */
import {
  STREETS_REACH_MINUTES,
  type StreetDirections,
  type StreetLine,
  type StreetsReachResult,
  type StreetsRouteResult,
  type StreetsStatusResponse,
} from "@outpost/shared";
import { CHANNEL_TRIP } from "./test-route";

const line = (kind: StreetLine["kind"], text: string, distanceM: number, distanceText: string, at: [number, number]): StreetLine => ({
  kind,
  text,
  distanceM,
  durationS: Math.round(distanceM / 10),
  distanceText,
  at,
});

const directions = (lines: StreetLine[]): StreetDirections => ({
  lines,
  distanceM: lines.reduce((sum, each) => sum + each.distanceM, 0),
  durationS: lines.reduce((sum, each) => sum + each.durationS, 0),
  geometry: { type: "LineString", coordinates: lines.map((each) => each.at) },
});

export const DOOR_START = directions([
  line("start", "Drive north-east on Bell Lane", 300, "300 m", [-0.3555, 51.2905]),
  line("turn", "Turn left onto Guildford Road (B2122)", 800, "800 m", [-0.352, 51.292]),
  line("roundabout", "At the roundabout, take the 2nd exit onto Leatherhead Road (A24)", 1000, "1 km", [-0.34, 51.294]),
  line("arrive", "Arrive at the A24", 0, "", [-0.33, 51.296]),
]);

export const DOOR_END = directions([
  line("start", "Drive south on Route Blanche", 400, "400 m", [6.8694, 45.9237]),
  line("turn", "Turn right onto Rue du Lyret", 250, "250 m", [6.87, 45.922]),
  line("arrive", "Arrive at the end, on the left", 0, "", [6.871, 45.921]),
]);

export const DOOR_TRIP: StreetsRouteResult = {
  mode: "drive-door",
  spine: "main-roads",
  road: CHANNEL_TRIP,
  start: DOOR_START,
  end: DOOR_END,
  streets: null,
  summary: {
    distanceM: CHANNEL_TRIP.summary.distanceM + DOOR_START.distanceM + DOOR_END.distanceM,
    durationS: CHANNEL_TRIP.summary.durationS + DOOR_START.durationS + DOOR_END.durationS,
  },
  geometry: {
    type: "MultiLineString",
    coordinates: [DOOR_START.geometry.coordinates, ...CHANNEL_TRIP.geometry.coordinates, DOOR_END.geometry.coordinates],
  },
  warnings: [],
  credit: "Streets © OpenStreetMap contributors, ODbL 1.0 as of 2026-11-22, from Geofabrik's extracts; routed by Valhalla (MIT licence).",
  request: {
    points: [
      { lat: 51.2905, lon: -0.3555, name: "Fetcham" },
      { lat: 45.9237, lon: 6.8694, name: "Chamonix" },
    ],
    mode: "drive-door",
    units: "km",
  },
  plannedAt: Date.parse("2026-11-23T10:00:00Z"),
};

export const WALK_STREETS = directions([
  line("steps", "Take the steps", 40, "40 m", [-0.3303, 51.2965]),
  line("turn", "Turn left onto Church Street (B2450)", 600, "600 m", [-0.33, 51.296]),
  line("continue", "Continue onto Downs Lane", 3200, "3.2 km", [-0.325, 51.29]),
  line("arrive", "Arrive at the end, on the left", 0, "", [-0.3106, 51.2556]),
]);

export const WALK: StreetsRouteResult = {
  mode: "walk",
  spine: null,
  road: null,
  start: null,
  end: null,
  streets: WALK_STREETS,
  summary: { distanceM: WALK_STREETS.distanceM, durationS: 3600 },
  geometry: { type: "MultiLineString", coordinates: [WALK_STREETS.geometry.coordinates] },
  warnings: [],
  credit: DOOR_TRIP.credit,
  request: {
    points: [
      { lat: 51.2965, lon: -0.3303, name: "Leatherhead" },
      { lat: 51.2556, lon: -0.3106, name: "Box Hill" },
    ],
    mode: "walk",
    units: "km",
  },
  plannedAt: DOOR_TRIP.plannedAt,
};

const NO_MODES: StreetsStatusResponse["modes"] = {
  driveDoor: false,
  walk: false,
  cycle: false,
  reach: { drive: null, walk: false, cycle: false },
};

export const NOT_INSTALLED: StreetsStatusResponse = {
  state: "not-installed",
  installed: false,
  message: null,
  tileset: null,
  build: null,
  modes: { ...NO_MODES, reach: { drive: "main-roads", walk: false, cycle: false } },
  countryFiles: [],
  reachMinutes: STREETS_REACH_MINUTES,
};

export const GB_FILE = {
  regionId: "europe/great-britain",
  name: "Great Britain",
  country: "GB",
  dataDate: "2026-11-22",
  bytes: 2_205_301_182,
  locationId: "loc1",
  locationName: "SD card",
  collectionId: "c1",
};

export const NO_STREETS: StreetsStatusResponse = {
  ...NOT_INSTALLED,
  state: "no-streets",
  installed: true,
  message: "No streets are built yet.",
  countryFiles: [GB_FILE],
};

export const READY: StreetsStatusResponse = {
  state: "ready",
  installed: true,
  message: null,
  tileset: {
    name: "Great Britain",
    regions: [{ regionId: "europe/great-britain", name: "Great Britain", country: "GB", dataDate: "2026-11-22" }],
    countries: ["GB"],
    extracts: [{ file: "great-britain.osm.pbf", bytes: 2_205_301_182 }],
    builtAt: Date.parse("2026-11-23T10:32:00Z"),
    sizeBytes: 2_734_991_360,
    valhalla: "3.9.3",
    dataDate: "2026-11-22",
  },
  build: null,
  modes: { driveDoor: true, walk: true, cycle: true, reach: { drive: "streets", walk: true, cycle: true } },
  countryFiles: [GB_FILE],
  reachMinutes: STREETS_REACH_MINUTES,
};

const square = (size: number): Array<Array<[number, number]>> => [
  [
    [-0.33 - size, 51.296 - size],
    [-0.33 + size, 51.296 - size],
    [-0.33 + size, 51.296 + size],
    [-0.33 - size, 51.296 + size],
    [-0.33 - size, 51.296 - size],
  ],
];

export const REACH_MAIN_ROADS: StreetsReachResult = {
  mode: "drive",
  source: "main-roads",
  label: "Main roads only",
  note: "Free-flowing traffic, no stops. Over the main roads only: streets off them are not counted.",
  point: { lat: 51.296, lon: -0.33, name: null },
  areas: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { minutes: 15 }, geometry: { type: "Polygon", coordinates: square(0.05) } },
      { type: "Feature", properties: { minutes: 30 }, geometry: { type: "Polygon", coordinates: square(0.12) } },
    ],
  },
  settings: { denoise: null, generalizeM: null, gridM: 375 },
  credit: "Roads © OpenStreetMap contributors.",
  madeAt: 1,
};

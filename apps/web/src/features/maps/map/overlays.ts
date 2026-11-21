/**
 * Everything drawn on top of the basemap: saved places, tracks, the route being drawn,
 * the measuring line, the download box, installed coverage, the person's position. This module describes the
 * layers and turns app data into GeoJSON for them; the engine only hands the result to
 * MapLibre.
 */
import { type Bbox, haversineMeters, type InstalledRegion, type MarkerDto, type TrackWithGeometryDto } from "@outpost/shared";
import { celnavLayers } from "@/features/celestial-navigation/map-layers";
import { heardLayers } from "@/features/heard/heard";
import { floodZoneLayers, populationLayers, referenceLayers } from "@/features/layers/symbols";
import { nuclearLayers } from "@/features/nuclear/layers";
import { propagationLayers } from "@/features/propagation/map/layers";
import { repeaterLayers } from "@/features/repeaters/map/layers";
import { rangeLayers } from "@/features/repeaters/map/range";
import { greyLineLineLayers, greyLineShadeLayers } from "../grey-line/layers";
import { bboxRing, circleRing, formatDistance, type LatLon, metersPerPixel } from "../lib/geo";
import { measure } from "../lib/measure";
import { MAGNETIC_HEX, MARKER_HEX } from "../lib/palette";
import { BADGE, iconOf, isDrawn, PLACE_IMAGE_PREFIX, pageKey } from "../lib/place-icons";
import { trackEnds, trackLines } from "../lib/profile";
import { midpoints } from "../lib/route-edit";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification, SourceSpecification } from "../lib/style-types";
import { gridLayers, relayLayers, sightLayers } from "../radio/layers";
import { recordingLayers } from "../recording/overlay";
import { resectionLayers } from "../resection/layers";
import { walkLayers } from "../walk/walk-map";

export const OVERLAY_SOURCES = [
  "o-population",
  "o-grey-line",
  "o-propagation",
  "o-nuclear",
  "o-grid",
  "o-magnetic",
  "o-coverage",
  "o-box",
  "o-tracks",
  "o-track-ends",
  "o-measure",
  "o-walk",
  "o-range",
  "o-repeaters",
  "o-reference",
  "o-heard",
  "o-relay",
  "o-sight",
  // Resection: back-bearings from landmarks (resection/).
  "o-resection",
  // Celestial navigation: lines of position and the fix (features/celestial-navigation).
  "o-celnav",
  "o-draw",
  "o-recording",
  "o-location",
  "o-markers",
  "o-profile",
] as const;
export type OverlaySource = (typeof OVERLAY_SOURCES)[number];

export const OVERLAY_LAYERS = {
  markers: "o-markers",
  markerIcons: "o-markers-icon",
  /** The names of favourites, and the icons of those that have one. */
  favourites: "o-markers-favourite-label",
  tracks: "o-tracks-line",
  tracksHit: "o-tracks-hit",
  drawPoints: "o-draw-points",
  drawPointsSmall: "o-draw-points-small",
  drawMiddles: "o-draw-middles",
} as const;

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: number;
    properties: Record<string, string | number | boolean | null>;
    geometry: { type: string; coordinates: unknown };
  }>;
}

export const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const colorOf = (name: string) => MARKER_HEX[name as keyof typeof MARKER_HEX] ?? MARKER_HEX.teal;

export function overlaySources(data: Partial<Record<OverlaySource, FeatureCollection>>): Record<string, SourceSpecification> {
  const sources: Record<string, SourceSpecification> = {};
  for (const id of OVERLAY_SOURCES) sources[id] = { type: "geojson", data: (data[id] ?? EMPTY) as never };
  return sources;
}

/** The name of the picture drawn for a place with an icon, worked out by the map from the place and the theme. */
const placeImage = (theme: MapTheme): ["concat", string, ["get", string], string, ["get", string], string, string] => [
  "concat",
  PLACE_IMAGE_PREFIX,
  ["get", "icon"],
  "-",
  ["get", "tint"],
  "-",
  pageKey(theme.page),
];

export function overlayLayers(theme: MapTheme): LayerSpecification[] {
  const label = { "text-font": [MAP_FONTS.medium] as string[], "text-size": 12.5 };
  const halo = { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 } as const;
  /**
   * A place's name, under its marker and clear of it. The marker is larger when it carries an icon, and the name
   * has to start below the whole picture, or the map takes the two to overlap and leaves the name out.
   */
  const placeName = {
    ...label,
    "text-field": ["get", "name"] as ["get", string],
    "text-anchor": "top",
    "text-offset": ["case", ["has", "icon"], ["literal", [0, 1.45]], ["literal", [0, 0.9]]] as [
      "case",
      ["has", string],
      ["literal", [number, number]],
      ["literal", [number, number]],
    ],
    "text-max-width": 9,
  } as const;
  return [
    // Population density, when it is switched on (features/layers): beneath everything else drawn over the map.
    ...populationLayers(),
    // Day and night, when the grey line is switched on: its shading under everything, its lines over the coverage cells.
    // Flood zones (features/layers), under the names and under the night shading.
    ...floodZoneLayers(),
    ...greyLineShadeLayers(theme),
    // The cells of an HF coverage map and the place being chosen for the planner, on the maps of that feature.
    ...propagationLayers(theme),
    ...nuclearLayers(theme),
    ...greyLineLineLayers(theme),
    // The Maidenhead locator grid, when it is switched on.
    ...gridLayers(theme),
    // Magnetic north lines, when they are switched on (magnetic/): thin and blue, as on the printed sheet, cased so they hold on any ground.
    {
      id: "o-magnetic-casing",
      type: "line",
      source: "o-magnetic",
      paint: { "line-color": theme.page, "line-width": 3, "line-opacity": 0.5 },
    },
    { id: "o-magnetic-line", type: "line", source: "o-magnetic", paint: { "line-color": MAGNETIC_HEX, "line-width": 1.2 } },
    // Installed coverage, shown while the downloads panel is open.
    {
      id: "o-coverage-line",
      type: "line",
      source: "o-coverage",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "line-color": theme.primary, "line-width": 1.5, "line-dasharray": [3, 2], "line-opacity": 0.75 },
    },
    {
      id: "o-coverage-label",
      type: "symbol",
      source: "o-coverage",
      filter: ["==", ["geometry-type"], "Point"],
      layout: { ...label, "text-field": ["get", "name"], "text-anchor": "top-left", "text-offset": [0.4, 0.3], "text-max-width": 12 },
      paint: { ...halo, "text-color": theme.primary },
    },
    // The area being chosen for download.
    { id: "o-box-fill", type: "fill", source: "o-box", paint: { "fill-color": theme.primary, "fill-opacity": 0.1 } },
    { id: "o-box-line", type: "line", source: "o-box", paint: { "line-color": theme.primary, "line-width": 2 } },
    // Tracks: a casing in the page colour keeps the line readable on any ground.
    {
      id: "o-tracks-casing",
      type: "line",
      source: "o-tracks",
      layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["case", ["get", "selected"], 1, 0] },
      paint: { "line-color": theme.page, "line-width": ["case", ["get", "selected"], 8, 6], "line-opacity": 0.9 },
    },
    {
      id: OVERLAY_LAYERS.tracks,
      type: "line",
      source: "o-tracks",
      layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["case", ["get", "selected"], 1, 0] },
      paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "selected"], 4.5, 3] },
    },
    // Invisible and wide: makes a thin line easy to click or tap.
    {
      id: OVERLAY_LAYERS.tracksHit,
      type: "line",
      source: "o-tracks",
      paint: { "line-color": theme.page, "line-width": 18, "line-opacity": 0 },
    },
    {
      id: "o-track-ends",
      type: "circle",
      source: "o-track-ends",
      paint: {
        "circle-radius": 5.5,
        // Start is solid, end is hollow: told apart without relying on colour.
        "circle-color": ["case", ["==", ["get", "end"], "start"], ["get", "color"], theme.page],
        "circle-stroke-color": ["case", ["==", ["get", "end"], "start"], theme.page, ["get", "color"]],
        "circle-stroke-width": ["case", ["==", ["get", "end"], "start"], 2, 3],
      },
    },
    {
      id: "o-track-ends-label",
      type: "symbol",
      source: "o-track-ends",
      filter: ["==", ["get", "selected"], true],
      layout: {
        ...label,
        "text-field": ["case", ["==", ["get", "end"], "start"], "Start", "End"],
        "text-anchor": "left",
        "text-offset": [0.9, 0],
        "text-optional": true,
      },
      paint: halo,
    },
    // Measuring.
    {
      id: "o-measure-casing",
      type: "line",
      source: "o-measure",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": 5.5, "line-opacity": 0.9 },
    },
    {
      id: "o-measure-line",
      type: "line",
      source: "o-measure",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-join": "round" },
      paint: { "line-color": theme.ink, "line-width": 2, "line-dasharray": [2.5, 1.5] },
    },
    {
      id: "o-measure-points",
      type: "circle",
      source: "o-measure",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 4.5, "circle-color": theme.page, "circle-stroke-color": theme.ink, "circle-stroke-width": 2 },
    },
    {
      id: "o-measure-labels",
      type: "symbol",
      source: "o-measure",
      filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "label"]],
      layout: { ...label, "text-field": ["get", "label"], "text-anchor": "bottom", "text-offset": [0, -0.8], "text-allow-overlap": false },
      paint: halo,
    },
    // The estimated range of the repeater that is open, beneath the repeaters; see features/repeaters/map/range.ts.
    ...walkLayers(theme),
    ...rangeLayers(theme),
    // Repeaters, when they are switched on; see features/repeaters/map.
    ...repeaterLayers(theme),
    // Reference layers (features/layers): publicly mapped places, boundaries and historical records, under saved places.
    ...referenceLayers(theme),
    // What the household's receivers heard (features/heard): above the reference layers, under saved places.
    ...heardLayers(theme),
    // The path of a line-of-sight check.
    ...relayLayers(theme),
    ...sightLayers(theme),
    ...resectionLayers(theme),
    ...celnavLayers(theme),
    // A track being recorded; see recording/overlay.ts.
    ...recordingLayers(theme),
    // The person's own position.
    {
      id: "o-location-accuracy",
      type: "fill",
      source: "o-location",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": theme.primary, "fill-opacity": 0.14 },
    },
    {
      id: "o-location-dot",
      type: "circle",
      source: "o-location",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 7, "circle-color": theme.primary, "circle-stroke-color": theme.page, "circle-stroke-width": 3 },
    },
    // Saved places. Favourites carry a ring in the lamp colour and keep their name at every zoom. A plain pin is
    // the dot every place was before there were icons. A place with an icon is that same dot with a picture of
    // its marker over it: a larger disc of its colour with the icon on it (see map/place-images.ts).
    {
      id: "o-markers-favourite",
      type: "circle",
      source: "o-markers",
      filter: ["==", ["get", "favourite"], true],
      paint: {
        // Outside the larger disc of a favourite that has an icon.
        "circle-radius": ["case", ["has", "icon"], BADGE.radius + BADGE.ring + 2.5, 11],
        "circle-color": theme.lamp,
        "circle-stroke-color": theme.page,
        "circle-stroke-width": 1.5,
      },
    },
    // Every place is a dot here, with or without an icon: it is what a press on a place lands on, and what
    // shows where an icon has no room or its picture could not be drawn.
    {
      id: OVERLAY_LAYERS.markers,
      type: "circle",
      source: "o-markers",
      paint: { "circle-radius": 6.5, "circle-color": ["get", "color"], "circle-stroke-color": theme.page, "circle-stroke-width": 2.5 },
    },
    // Names and icons, in three layers. The map gives room to what is in a higher layer first, so the order
    // here is who gives way to whom: the names of ordinary places to every icon, and everything to a favourite.
    //
    // The names of places that are not favourites, from zoom 9.
    {
      id: "o-markers-label",
      type: "symbol",
      source: "o-markers",
      filter: ["all", ["!=", ["get", "favourite"], true], [">=", ["zoom"], 9]],
      layout: { ...placeName, "text-optional": true },
      paint: halo,
    },
    // Their icons. One picture a place. Where two would lie over each other only one is drawn and the other
    // place stays a dot, which is what keeps a map with thousands of places light: zoomed out over all of
    // them it draws a screenful of pictures at most, not one for every place. Zoomed in to where they stand
    // apart, every place has its icon.
    {
      id: OVERLAY_LAYERS.markerIcons,
      type: "symbol",
      source: "o-markers",
      filter: ["all", ["has", "icon"], ["!=", ["get", "favourite"], true]],
      layout: { "icon-image": placeImage(theme), "icon-padding": 0 },
    },
    // Favourites: named at every zoom, as before, and their icons always drawn whole. They are few.
    {
      id: OVERLAY_LAYERS.favourites,
      type: "symbol",
      source: "o-markers",
      filter: ["==", ["get", "favourite"], true],
      layout: {
        ...placeName,
        "text-optional": true,
        "icon-image": ["case", ["has", "icon"], placeImage(theme), ""],
        "icon-padding": 0,
        "icon-allow-overlap": true,
      },
      paint: halo,
    },
    // The point under the pointer on an elevation profile.
    {
      id: "o-profile-point",
      type: "circle",
      source: "o-profile",
      paint: { "circle-radius": 7, "circle-color": theme.page, "circle-stroke-color": theme.ink, "circle-stroke-width": 3 },
    },
    // The route being drawn or reshaped, above everything else so that its points can always be
    // taken hold of: its line, a handle in the middle of each leg, and the points themselves.
    {
      id: "o-draw-casing",
      type: "line",
      source: "o-draw",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.page, "line-width": 7.5, "line-opacity": 0.9 },
    },
    {
      id: "o-draw-line",
      type: "line",
      source: "o-draw",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 4 },
    },
    {
      id: OVERLAY_LAYERS.drawMiddles,
      type: "circle",
      source: "o-draw",
      // A handle is left out while its leg is too short on screen to hold one.
      filter: ["all", ["==", ["get", "kind"], "middle"], [">=", ["zoom"], ["get", "minZoom"]]],
      paint: {
        "circle-radius": 4.5,
        "circle-color": theme.page,
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95,
      },
    },
    // Points too close together on screen to be drawn whole (a recording, zoomed out) are drawn small,
    // so the line stays readable. They can still be taken hold of, and grow when zoomed in.
    {
      id: OVERLAY_LAYERS.drawPointsSmall,
      type: "circle",
      source: "o-draw",
      filter: ["all", ["==", ["get", "kind"], "point"], ["<", ["zoom"], ["get", "minZoom"]]],
      paint: { "circle-radius": 3, "circle-color": theme.page, "circle-stroke-color": ["get", "color"], "circle-stroke-width": 1.5 },
    },
    {
      id: OVERLAY_LAYERS.drawPoints,
      type: "circle",
      source: "o-draw",
      filter: ["all", ["==", ["get", "kind"], "point"], [">=", ["zoom"], ["get", "minZoom"]]],
      paint: {
        // The chosen point is larger and ringed in ink; the first is solid, as a route's start is.
        "circle-radius": ["case", ["get", "selected"], 9, 7],
        "circle-color": ["case", ["get", "first"], ["get", "color"], theme.page],
        "circle-stroke-color": ["case", ["get", "selected"], theme.ink, ["get", "first"], theme.page, ["get", "color"]],
        "circle-stroke-width": ["case", ["get", "selected"], 3.5, 3],
      },
    },
    {
      id: "o-draw-label",
      type: "symbol",
      source: "o-draw",
      filter: ["all", ["==", ["get", "kind"], "point"], ["has", "label"]],
      layout: { ...label, "text-field": ["get", "label"], "text-anchor": "bottom", "text-offset": [0, -1], "text-optional": true },
      paint: halo,
    },
  ];
}

const point = (lon: number, lat: number) => ({ type: "Point", coordinates: [lon, lat] });

/**
 * Saved places as points. The one being edited is left out: it is shown as a pin that can be dragged.
 * A place with an icon says which, and the name of its colour, which together name the picture drawn
 * for it; a plain pin says neither, and is drawn exactly as places were before there were icons.
 */
export function markersData(markers: MarkerDto[], editingId: string | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers
      .filter((marker) => marker.id !== editingId)
      .map((marker) => {
        const icon = iconOf(marker);
        const properties: FeatureCollection["features"][number]["properties"] = {
          id: marker.id,
          name: marker.name,
          color: colorOf(marker.color),
          favourite: marker.isFavorite,
        };
        if (isDrawn(icon)) {
          properties.icon = icon;
          properties.tint = marker.color in MARKER_HEX ? marker.color : "teal";
        }
        return { type: "Feature", properties, geometry: point(marker.lon, marker.lat) };
      }),
  };
}

export function tracksData(
  tracks: TrackWithGeometryDto[],
  selectedId: string | null,
): { lines: FeatureCollection; ends: FeatureCollection } {
  const lines: FeatureCollection = { type: "FeatureCollection", features: [] };
  const ends: FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const track of tracks) {
    const parts = trackLines(track.geojson);
    if (parts.length === 0) continue;
    const selected = track.id === selectedId;
    const color = colorOf(track.color);
    lines.features.push({
      type: "Feature",
      properties: { id: track.id, color, selected },
      geometry: { type: "MultiLineString", coordinates: parts.map((line) => line.map(([lon, lat]) => [lon, lat])) },
    });
    const tips = trackEnds(parts);
    if (!tips) continue;
    ends.features.push({
      type: "Feature",
      properties: { id: track.id, color, selected, end: "start" },
      geometry: point(tips.start[0], tips.start[1]),
    });
    ends.features.push({
      type: "Feature",
      properties: { id: track.id, color, selected, end: "end" },
      geometry: point(tips.end[0], tips.end[1]),
    });
  }
  return { lines, ends };
}

/** The measuring path: its line, a dot per point, and the running total written at each point after the first. */
export function measureData(points: LatLon[]): FeatureCollection {
  if (points.length === 0) return EMPTY;
  const { legs } = measure(points);
  const features: FeatureCollection["features"] = points.map((position, index) => {
    const properties: Record<string, string> = index === 0 ? {} : { label: formatDistance(legs[index - 1]!.totalMeters) };
    return { type: "Feature", properties, geometry: point(position.lon, position.lat) };
  });
  if (points.length > 1)
    features.unshift({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: points.map((position) => [position.lon, position.lat]) },
    });
  return { type: "FeatureCollection", features };
}

/** A mid-leg handle needs about this much of its leg on screen, or it crowds the points at either end. */
const MIDDLE_MIN_LEG_PIXELS = 44;
/** Points closer together on screen than this are drawn small. */
const POINT_MIN_GAP_PIXELS = 17;

/** The lowest whole zoom at which two positions are at least `pixels` apart on screen. */
function zoomWhereApart(from: LatLon, to: LatLon, pixels: number): number {
  const meters = haversineMeters(from.lat, from.lon, to.lat, to.lon);
  if (meters <= 0) return 99;
  return Math.max(0, Math.ceil(Math.log2((pixels * metersPerPixel((from.lat + to.lat) / 2, 0)) / meters)));
}

/** The lowest whole zoom at which a leg is long enough on screen to show the handle in its middle. */
export function middleMinZoom(from: LatLon, to: LatLon): number {
  return zoomWhereApart(from, to, MIDDLE_MIN_LEG_PIXELS);
}

export interface DrawState {
  points: LatLon[];
  /** Hex colour of the line. */
  color: string;
  /** The point chosen for removal or adjustment, if any. */
  selected: number | null;
}

/**
 * The route being drawn: its line, each point (numbered by `index`, so a press can be
 * traced back to it), a handle in the middle of each leg, and the length so far written
 * at the last point.
 */
export function drawData(state: DrawState | null): FeatureCollection {
  if (!state || state.points.length === 0) return EMPTY;
  const { points, color } = state;
  const features: FeatureCollection["features"] = [];
  if (points.length > 1) {
    features.push({
      type: "Feature",
      properties: { kind: "line", color },
      geometry: { type: "LineString", coordinates: points.map((position) => [position.lon, position.lat]) },
    });
    midpoints(points).forEach((position, index) => {
      features.push({
        type: "Feature",
        // `index` is where a point added here would go in the line.
        properties: { kind: "middle", index: index + 1, color, minZoom: middleMinZoom(points[index]!, points[index + 1]!) },
        geometry: point(position.lon, position.lat),
      });
    });
  }
  const total = measure(points).totalMeters;
  points.forEach((position, index) => {
    const ends = index === 0 || index === points.length - 1;
    const neighbours = [points[index - 1], points[index + 1]].filter((neighbour) => neighbour !== undefined);
    const properties: Record<string, string | number | boolean> = {
      kind: "point",
      index,
      color,
      first: index === 0,
      selected: index === state.selected,
      // The ends and the chosen point are always drawn whole; the rest once there is room for them.
      minZoom:
        ends || index === state.selected
          ? 0
          : Math.max(...neighbours.map((neighbour) => zoomWhereApart(position, neighbour, POINT_MIN_GAP_PIXELS))),
    };
    if (index === points.length - 1 && index > 0) properties.label = formatDistance(total);
    features.push({ type: "Feature", properties, geometry: point(position.lon, position.lat) });
  });
  return { type: "FeatureCollection", features };
}

export function boxData(bbox: Bbox | null): FeatureCollection {
  if (!bbox) return EMPTY;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [bboxRing(bbox)] } }],
  };
}

/** Outlines of what is installed, each named at its top-left corner. Whole-world regions are left out: there is nothing to outline. */
export function coverageData(regions: InstalledRegion[]): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  for (const region of regions) {
    if (region.tileType !== "vector") continue;
    const [west, south, east, north] = region.bounds;
    if (east - west >= 359) continue;
    features.push({
      type: "Feature",
      properties: { id: region.id },
      geometry: { type: "Polygon", coordinates: [bboxRing([west, south, east, north])] },
    });
    features.push({ type: "Feature", properties: { id: region.id, name: region.name }, geometry: point(west, north) });
  }
  return { type: "FeatureCollection", features };
}

export function locationData(position: (LatLon & { accuracy: number }) | null): FeatureCollection {
  if (!position) return EMPTY;
  const features: FeatureCollection["features"] = [{ type: "Feature", properties: {}, geometry: point(position.lon, position.lat) }];
  // A fix good to a few metres needs no ring; a poor one should look as vague as it is.
  if (position.accuracy > 15)
    features.unshift({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [circleRing(position, position.accuracy)] },
    });
  return { type: "FeatureCollection", features };
}

export function pointData(position: LatLon | null): FeatureCollection {
  return position
    ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: point(position.lon, position.lat) }] }
    : EMPTY;
}

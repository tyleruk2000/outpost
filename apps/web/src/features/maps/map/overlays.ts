/**
 * Everything drawn on top of the basemap: saved places, tracks, the measuring line, the
 * download box, installed coverage, the person's position. This module describes the
 * layers and turns app data into GeoJSON for them; the engine only hands the result to
 * MapLibre.
 */
import type { Bbox, InstalledRegion, MarkerDto, TrackWithGeometryDto } from "@outpost/shared";
import { bboxRing, circleRing, formatDistance, type LatLon } from "../lib/geo";
import { measure } from "../lib/measure";
import { MARKER_HEX } from "../lib/palette";
import { trackEnds, trackLines } from "../lib/profile";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification, SourceSpecification } from "../lib/style-types";

export const OVERLAY_SOURCES = [
  "o-coverage",
  "o-box",
  "o-tracks",
  "o-track-ends",
  "o-measure",
  "o-location",
  "o-markers",
  "o-profile",
] as const;
export type OverlaySource = (typeof OVERLAY_SOURCES)[number];

export const OVERLAY_LAYERS = {
  markers: "o-markers",
  tracks: "o-tracks-line",
  tracksHit: "o-tracks-hit",
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

export function overlayLayers(theme: MapTheme): LayerSpecification[] {
  const label = { "text-font": [MAP_FONTS.medium] as string[], "text-size": 12.5 };
  const halo = { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 } as const;
  return [
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
    // Saved places. Favourites carry a ring in the lamp colour and keep their name at every zoom.
    {
      id: "o-markers-favourite",
      type: "circle",
      source: "o-markers",
      filter: ["==", ["get", "favourite"], true],
      paint: { "circle-radius": 11, "circle-color": theme.lamp, "circle-stroke-color": theme.page, "circle-stroke-width": 1.5 },
    },
    {
      id: OVERLAY_LAYERS.markers,
      type: "circle",
      source: "o-markers",
      paint: { "circle-radius": 6.5, "circle-color": ["get", "color"], "circle-stroke-color": theme.page, "circle-stroke-width": 2.5 },
    },
    {
      id: "o-markers-label",
      type: "symbol",
      source: "o-markers",
      filter: ["any", ["==", ["get", "favourite"], true], [">=", ["zoom"], 9]],
      layout: {
        ...label,
        "text-field": ["get", "name"],
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-max-width": 9,
        "text-optional": true,
        "symbol-sort-key": ["case", ["get", "favourite"], 0, 1],
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
  ];
}

const point = (lon: number, lat: number) => ({ type: "Point", coordinates: [lon, lat] });

/** Saved places as points. The one being edited is left out: it is shown as a pin that can be dragged. */
export function markersData(markers: MarkerDto[], editingId: string | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers
      .filter((marker) => marker.id !== editingId)
      .map((marker) => ({
        type: "Feature",
        properties: { id: marker.id, name: marker.name, color: colorOf(marker.color), favourite: marker.isFavorite },
        geometry: point(marker.lon, marker.lat),
      })),
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

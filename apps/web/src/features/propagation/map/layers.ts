/**
 * What the HF planner draws on the map: the cells of a coverage map, the transmitter,
 * and the place being chosen. Described here and handed to the map with the other
 * overlays, as the repeaters' and the line-of-sight layers are.
 */
import {
  type CoverageQuantity,
  type CoverageResult,
  coverageCellBox,
  coverageClasses,
  coverageClassOf,
  coverageValue,
} from "@outpost/shared";
import { MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";

export const PROPAGATION_SOURCE = "o-propagation";

/**
 * How solid a shaded cell is. Low enough that roads, coasts and names show through it,
 * high enough that the five shades stay apart. The legend's swatches are drawn the same
 * way, so that a shade in the legend is the shade on the map.
 */
export const CELL_OPACITY = 0.62;

/**
 * Cells first, beneath every other thing drawn over the map; then the marks for cells
 * with no answer, the outline of the cell being read, and the two kinds of point. A
 * cell's colour travels with the cell (`fill`), so the layers hold no scale of their own.
 */
export function propagationLayers(theme: MapTheme): LayerSpecification[] {
  const kind = (name: string) => ["==", ["get", "kind"], name] as never;
  return [
    {
      id: "o-propagation-cells",
      type: "fill",
      source: PROPAGATION_SOURCE,
      filter: kind("cell"),
      paint: { "fill-color": ["get", "fill"], "fill-opacity": CELL_OPACITY, "fill-antialias": false },
    },
    {
      // A hairline between cells in the page colour: it shows the grid for what it is, and
      // tells the palest shade from open water, which is a wash of the same hue.
      id: "o-propagation-cell-lines",
      type: "line",
      source: PROPAGATION_SOURCE,
      filter: kind("cell"),
      paint: { "line-color": theme.page, "line-width": 1, "line-opacity": 0.7 },
    },
    {
      // The edge of the area that was worked out, so that "no shade" inside it is told from "not asked" outside it.
      id: "o-propagation-area",
      type: "line",
      source: PROPAGATION_SOURCE,
      filter: kind("area"),
      paint: { "line-color": theme.ink, "line-width": 1.2, "line-opacity": 0.6, "line-dasharray": [4, 3] },
    },
    {
      // A cell the engine did not answer: crossed through, never shaded.
      id: "o-propagation-none",
      type: "line",
      source: PROPAGATION_SOURCE,
      filter: kind("none"),
      paint: { "line-color": theme.ink, "line-width": 1.2, "line-opacity": 0.7 },
    },
    {
      id: "o-propagation-selected-casing",
      type: "line",
      source: PROPAGATION_SOURCE,
      filter: kind("selected"),
      paint: { "line-color": theme.page, "line-width": 5 },
    },
    {
      id: "o-propagation-selected",
      type: "line",
      source: PROPAGATION_SOURCE,
      filter: kind("selected"),
      paint: { "line-color": theme.ink, "line-width": 2.5 },
    },
    {
      id: "o-propagation-point",
      type: "circle",
      source: PROPAGATION_SOURCE,
      filter: ["in", ["get", "kind"], ["literal", ["tx", "pick", "station"]]] as never,
      paint: {
        "circle-radius": ["case", kind("pick"), 8, 6.5],
        "circle-color": ["case", kind("pick"), theme.lamp, theme.ink],
        "circle-stroke-color": theme.page,
        "circle-stroke-width": 2.5,
      },
    },
    {
      id: "o-propagation-point-label",
      type: "symbol",
      source: PROPAGATION_SOURCE,
      filter: ["in", ["get", "kind"], ["literal", ["tx", "pick", "station"]]] as never,
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-size": 13,
        "text-field": ["get", "name"],
        "text-anchor": "top",
        "text-offset": [0, 0.8],
        "text-max-width": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.8 },
    },
  ];
}

const ring = ([west, south, east, north]: [number, number, number, number]) => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];

export interface CoverageView {
  quantity: CoverageQuantity;
  /** 1 to 24. */
  utcHour: number;
  /** The five shades, lowest class first, as hex. */
  shades: string[];
  /** The cell being read, if any. */
  selected: number | null;
}

/**
 * A coverage map as features: one rectangle per cell that has a value in a class, in
 * that class's shade; a cross through each cell with no answer; the edge of the area;
 * the cell being read; and the transmitter. A cell below the lowest class, or whose hour
 * has no path, is left unshaded: nothing is drawn where there is nothing to show.
 */
export function coverageFeatures(result: CoverageResult, view: CoverageView): FeatureCollection {
  const { grid } = result;
  const classes = coverageClasses(view.quantity);
  const features: FeatureCollection["features"] = [];
  for (const [index, cell] of result.cells.entries()) {
    const box = coverageCellBox(grid, index);
    if (!cell) {
      const [west, south, east, north] = box;
      features.push({
        type: "Feature",
        properties: { kind: "none" },
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [west, south],
              [east, north],
            ],
            [
              [west, north],
              [east, south],
            ],
          ],
        },
      });
      continue;
    }
    const value = coverageValue(cell, view.quantity, view.utcHour, result.mode.requiredSnrDbHz);
    if (value === null) continue;
    const level = coverageClassOf(classes, value);
    if (level < 0) continue;
    features.push({
      type: "Feature",
      properties: { kind: "cell", fill: view.shades[level] ?? "#000000", level },
      geometry: { type: "Polygon", coordinates: [ring(box)] },
    });
  }
  const east = grid.west + grid.columns * grid.lonStep;
  const north = grid.south + grid.rows * grid.latStep;
  features.push({
    type: "Feature",
    properties: { kind: "area" },
    geometry: { type: "LineString", coordinates: ring([grid.west, grid.south, east, north]) },
  });
  if (view.selected !== null && view.selected >= 0 && view.selected < result.cells.length) {
    features.push({
      type: "Feature",
      properties: { kind: "selected" },
      geometry: { type: "LineString", coordinates: ring(coverageCellBox(grid, view.selected)) },
    });
  }
  features.push(pointFeature("tx", result.request.tx.name || "Transmitter", result.request.tx));
  return { type: "FeatureCollection", features };
}

export function pointFeature(
  kind: "tx" | "pick" | "station",
  name: string,
  position: { lat: number; lon: number },
): FeatureCollection["features"][number] {
  return { type: "Feature", properties: { kind, name }, geometry: { type: "Point", coordinates: [position.lon, position.lat] } };
}

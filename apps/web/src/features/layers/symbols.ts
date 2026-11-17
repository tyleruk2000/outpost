/**
 * The reference layers as the map draws them.
 *
 * Where a thing comes from is told by its mark, not by its colour: a published public
 * record is a filled dot; a historical document is a ring with an H in it; something
 * unverified or speculative is a ring with a question mark. Colour tells layers apart and
 * is always named in the legend. Patches of many features are counted per layer and per
 * provenance, so a historical record is never folded into the same mark as a mapped
 * building. Population is a shaded grid beneath everything else, in the one-hue ramp.
 */
import type { FeatureProvenance, PopulationGridResponse, ReferenceLayerId, ReferenceOverlayResponse } from "@outpost/shared";
import type { ExpressionSpecification } from "maplibre-gl";
import { tokenToHex } from "@/features/maps/lib/color";
import { pageKey } from "@/features/maps/lib/place-icons";
import { MAP_FONTS, type MapTheme, UNDER_LABELS } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
import { formatNumber } from "@/lib/utils";

export const REFERENCE_SOURCE = "o-reference";
export const POPULATION_SOURCE = "o-population";

/** Which colour token each layer is drawn in. Several layers share one; the legend names each. */
export const LAYER_TOKENS: Record<ReferenceLayerId, string> = {
  military: "--chart-3",
  nuclear: "--chart-2",
  airports: "--chart-other",
  hospitals: "--chart-4",
  emergency: "--chart-4",
  shelters: "--chart-1",
  "planning-zones": "--chart-2",
  boundaries: "--ink-muted",
  regions: "--ink-faint",
  towns: "--ink",
  historical: "--ink",
  "flood-zones": "--chart-1",
  food: "--chart-1",
};

const FALLBACK: Record<string, string> = {
  "--chart-1": "#00919f",
  "--chart-2": "#c8731a",
  "--chart-3": "#6f5bd6",
  "--chart-4": "#d4517f",
  "--chart-other": "#9aa3a8",
  "--ink": "#1d2a30",
  "--ink-muted": "#5b6a72",
  "--ink-faint": "#9aa5ab",
};

/** The colours as the browser has them now, in hex, for the map (which reads no CSS variables). */
export function layerColours(): Record<ReferenceLayerId, string> {
  const styles = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const out = {} as Record<ReferenceLayerId, string>;
  for (const [layer, token] of Object.entries(LAYER_TOKENS) as Array<[ReferenceLayerId, string]>) {
    out[layer] = tokenToHex(styles?.getPropertyValue(token) ?? "", FALLBACK[token] ?? "#5b6a72");
  }
  return out;
}

const SEQ_FALLBACK = ["#dceff2", "#b1dce3", "#6fb9c6", "#3a8e9e", "#1f5f6b"];
/** The five shades of the sequential ramp, lightest first. */
export function populationShades(): string[] {
  const styles = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  return SEQ_FALLBACK.map((fallback, index) => tokenToHex(styles?.getPropertyValue(`--chart-seq-${index + 1}`) ?? "", fallback));
}

/** The letter in a provenance's ring, or none for a filled dot. */
export const PROVENANCE_LETTER: Record<FeatureProvenance, string> = {
  "public-infrastructure": "",
  historical: "H",
  user: "",
  unverified: "?",
};

/**
 * Flood zones, from the reference source but drawn under the map's names, and under the
 * grey line's night shading (so they are mounted before it in `overlays.ts`).
 */
export function floodZoneLayers(): LayerSpecification[] {
  const isShape: ExpressionSpecification = ["==", ["get", "kind"], "shape"];
  const isFlood: ExpressionSpecification = ["==", ["get", "layer"], "flood-zones"];
  const zone3: ExpressionSpecification = ["==", ["get", "zone"], 3];
  return [
    // Flood zones: under the map's names, told apart by tone and edge, not by colour. Zone 3 is the deeper tone with a
    // solid edge; zone 2 the lighter tone with a broken edge. Where they overlap, zone 3 is drawn over zone 2.
    {
      id: "o-reference-flood-fill",
      type: "fill",
      source: REFERENCE_SOURCE,
      metadata: UNDER_LABELS,
      filter: ["all", isShape, isFlood],
      layout: { "fill-sort-key": ["get", "zone"] },
      paint: { "fill-color": ["get", "colour"], "fill-opacity": ["case", zone3, 0.42, 0.16] },
    },
    {
      id: "o-reference-flood-edge-3",
      type: "line",
      source: REFERENCE_SOURCE,
      metadata: UNDER_LABELS,
      filter: ["all", isShape, isFlood, zone3],
      paint: { "line-color": ["get", "colour"], "line-width": 1.2, "line-opacity": 0.9 },
    },
    {
      id: "o-reference-flood-edge-2",
      type: "line",
      source: REFERENCE_SOURCE,
      metadata: UNDER_LABELS,
      filter: ["all", isShape, isFlood, ["!", zone3]],
      paint: { "line-color": ["get", "colour"], "line-width": 1, "line-opacity": 0.8, "line-dasharray": [3, 2] },
    },
  ];
}

export function referenceLayers(theme: MapTheme): LayerSpecification[] {
  const label = { "text-font": [MAP_FONTS.medium] as string[] };
  const isShape: ExpressionSpecification = ["==", ["get", "kind"], "shape"];
  const ring: ExpressionSpecification = ["!=", ["get", "letter"], ""];
  const notFlood: ExpressionSpecification = ["!=", ["get", "layer"], "flood-zones"];
  return [
    {
      id: "o-reference-area-fill",
      type: "fill",
      source: REFERENCE_SOURCE,
      filter: [
        "all",
        isShape,
        notFlood,
        ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        ["!=", ["get", "layer"], "boundaries"],
      ],
      paint: { "fill-color": ["get", "colour"], "fill-opacity": ["case", ["==", ["get", "layer"], "planning-zones"], 0.14, 0.08] },
    },
    {
      id: "o-reference-area-line",
      type: "line",
      source: REFERENCE_SOURCE,
      filter: ["all", isShape, notFlood, ["==", ["get", "letter"], ""]],
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["get", "colour"],
        "line-width": ["case", ["==", ["get", "layer"], "boundaries"], 1.2, ["==", ["get", "layer"], "regions"], 0.8, 1.6],
        "line-opacity": 0.9,
      },
    },
    {
      // An area that is unverified or historical is outlined in dashes, as its mark is a ring.
      id: "o-reference-area-dashed",
      type: "line",
      source: REFERENCE_SOURCE,
      filter: ["all", isShape, notFlood, ring],
      paint: { "line-color": ["get", "colour"], "line-width": 1.6, "line-dasharray": [3, 2] },
    },
    {
      id: "o-reference-cell",
      type: "circle",
      source: REFERENCE_SOURCE,
      filter: ["==", ["get", "kind"], "cell"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "count"], 2, 11, 100, 15, 1000, 19, 10000, 23],
        "circle-color": theme.page,
        "circle-opacity": 0.94,
        "circle-stroke-color": ["get", "colour"],
        "circle-stroke-width": ["case", ring, 1.5, 2.5],
      },
    },
    {
      id: "o-reference-cell-label",
      type: "symbol",
      source: REFERENCE_SOURCE,
      filter: ["==", ["get", "kind"], "cell"],
      layout: { ...label, "text-field": ["get", "label"], "text-size": 11.5, "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": theme.ink },
    },
    {
      id: "o-reference-selected",
      type: "circle",
      source: REFERENCE_SOURCE,
      filter: ["==", ["get", "kind"], "selected"],
      paint: { "circle-radius": 12, "circle-opacity": 0, "circle-stroke-color": theme.primary, "circle-stroke-width": 2.5 },
    },
    {
      id: "o-reference-point",
      type: "circle",
      source: REFERENCE_SOURCE,
      filter: ["all", ["==", ["get", "kind"], "point"], ["!=", ["get", "layer"], "food"]],
      paint: {
        "circle-radius": ["case", ring, 7.5, 5],
        "circle-color": ["case", ring, theme.page, ["get", "colour"]],
        "circle-stroke-color": ["case", ring, ["get", "colour"], theme.page],
        "circle-stroke-width": ["case", ring, 2, 1.5],
      },
    },
    {
      // Food and supplies: a small square in the layer's colour with the kind drawn on it (food-symbols.tsx).
      id: "o-reference-food",
      type: "symbol",
      source: REFERENCE_SOURCE,
      filter: ["all", ["==", ["get", "kind"], "point"], ["==", ["get", "layer"], "food"]],
      layout: {
        "icon-image": ["concat", "food-", ["get", "glyph"], "-", ["downcase", ["slice", ["get", "colour"], 1]], "-", pageKey(theme.page)],
        "icon-allow-overlap": true,
        "icon-padding": 0,
      },
    },
    {
      id: "o-reference-point-letter",
      type: "symbol",
      source: REFERENCE_SOURCE,
      filter: ["all", ["==", ["get", "kind"], "point"], ring],
      layout: { ...label, "text-field": ["get", "letter"], "text-size": 10, "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": theme.ink },
    },
    {
      id: "o-reference-label",
      type: "symbol",
      source: REFERENCE_SOURCE,
      filter: ["all", ["==", ["get", "kind"], "point"], ["!=", ["get", "name"], ""]],
      minzoom: 9,
      layout: {
        ...label,
        "text-field": ["get", "name"],
        "text-size": 11.5,
        "text-anchor": "top",
        // Below the dot, or below a food and supplies square, which is larger.
        "text-offset": ["case", ["==", ["get", "layer"], "food"], ["literal", [0, 1.1]], ["literal", [0, 0.8]]],
        "text-max-width": 9,
        "text-optional": true,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.5 },
    },
  ];
}

export function populationLayers(): LayerSpecification[] {
  return [
    {
      id: "o-population-fill",
      type: "fill",
      source: POPULATION_SOURCE,
      paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.55, "fill-antialias": false },
    },
  ];
}

export function referenceData(
  overlay: ReferenceOverlayResponse | undefined,
  selected: { lat: number; lon: number } | null,
  colours: Record<ReferenceLayerId, string>,
): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  const at = (lon: number, lat: number) => ({ type: "Point", coordinates: [lon, lat] });
  for (const shape of overlay?.shapes ?? []) {
    features.push({
      type: "Feature",
      properties: {
        kind: "shape",
        id: shape.id,
        zone: shape.kind === "ea:flood-zone-3" ? 3 : shape.kind === "ea:flood-zone-2" ? 2 : 0,
        layer: shape.layer,
        colour: colours[shape.layer],
        letter: PROVENANCE_LETTER[shape.provenance],
        name: shape.name,
      },
      geometry: shape.geometry,
    });
  }
  for (const cell of overlay?.cells ?? []) {
    const letter = PROVENANCE_LETTER[cell.provenance];
    features.push({
      type: "Feature",
      properties: {
        kind: "cell",
        layer: cell.layer,
        count: cell.count,
        label: `${formatNumber(cell.count)}${letter ? ` ${letter}` : ""}`,
        colour: colours[cell.layer],
        letter,
      },
      geometry: at(cell.lon, cell.lat),
    });
  }
  for (const point of overlay?.points ?? []) {
    features.push({
      type: "Feature",
      properties: {
        kind: "point",
        id: point.id,
        layer: point.layer,
        name: point.name,
        colour: colours[point.layer],
        letter: PROVENANCE_LETTER[point.provenance],
        ...(point.layer === "food" ? { glyph: point.kind.replace(/^food:/, "") } : {}),
      },
      geometry: at(point.lon, point.lat),
    });
  }
  if (selected) features.push({ type: "Feature", properties: { kind: "selected" }, geometry: at(selected.lon, selected.lat) });
  return { type: "FeatureCollection", features };
}

/** Which shade a density falls in: the legend's classes, from the server. */
export function shadeOf(density: number, classes: number[], shades: string[]): string {
  let index = 0;
  for (let i = 0; i < classes.length; i += 1) if (density >= classes[i]!) index = i;
  return shades[Math.min(index, shades.length - 1)]!;
}

export function populationData(grid: PopulationGridResponse | undefined, shades: string[]): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  for (const cell of grid?.cells ?? []) {
    features.push({
      type: "Feature",
      properties: { colour: shadeOf(cell.density, grid!.classes, shades) },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [cell.west, cell.south],
            [cell.east, cell.south],
            [cell.east, cell.north],
            [cell.west, cell.north],
            [cell.west, cell.south],
          ],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export interface ReferenceHit {
  kind: "point" | "cell";
  id?: number;
  lat: number;
  lon: number;
}

/** The record or patch nearest a press, if one is within reach; worked out from what was drawn. */
export function nearestReference(
  overlay: ReferenceOverlayResponse | undefined,
  press: { x: number; y: number },
  project: (position: { lat: number; lon: number }) => { x: number; y: number },
  reach = 22,
): ReferenceHit | null {
  let best: (ReferenceHit & { distance: number }) | null = null;
  const consider = (hit: ReferenceHit) => {
    const point = project(hit);
    const distance = Math.hypot(point.x - press.x, point.y - press.y);
    const weighted = hit.kind === "point" ? distance : distance + 4;
    if (distance <= reach && (!best || weighted < best.distance)) best = { ...hit, distance: weighted };
  };
  for (const point of overlay?.points ?? []) consider({ kind: "point", id: point.id, lat: point.lat, lon: point.lon });
  for (const cell of overlay?.cells ?? []) consider({ kind: "cell", lat: cell.lat, lon: cell.lon });
  if (!best) return null;
  const { distance: _distance, ...hit } = best as ReferenceHit & { distance: number };
  return hit;
}

export type { ReferenceOverlayResponse };

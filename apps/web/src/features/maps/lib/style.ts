/**
 * The map's style, assembled in the browser from what the server says is installed.
 *
 * Bottom to top: a water-coloured background; the world's land and country outlines
 * from two small files shipped with the app, so the map is never blank; the Protomaps
 * basemap layers over Outpost's own tile endpoint, when any region is installed; hill
 * shading and contour lines, when asked for and terrain is installed; then whatever
 * overlays the caller adds (tracks, saved places, the measuring line).
 *
 * Nothing here touches MapLibre itself, so the result can be checked in tests.
 */
import type { MapSources } from "@outpost/shared";
import { type Flavor, namedFlavor, layers as protomapsLayers } from "@protomaps/basemaps";
import { hasImagery, imageryStyle, withImagery } from "../imagery/style";
import {
  CONTOUR_ELEVATION_KEY,
  CONTOUR_LEVEL_KEY,
  CONTOUR_MAX_ZOOM,
  CONTOUR_MIN_ZOOM,
  CONTOUR_SOURCE_LAYER,
  contourTemplate,
} from "./contours";
import { type MapStyleId, roadNumberLayers, styleVariant } from "./map-styles";
import type { LayerSpecification, SourceSpecification, StyleSpecification } from "./style-types";
import { tileTemplate } from "./tiles";

export type MapFlavour = "light" | "dark";

/** Colours read from the design tokens, as hex. */
export interface MapTheme {
  land: string;
  water: string;
  outline: string;
  /** Road surface, and the line drawn either side of it. */
  road: string;
  roadCasing: string;
  /** Paths and tracks: thin lines that must not vanish into the land. */
  path: string;
  page: string;
  ink: string;
  inkMuted: string;
  primary: string;
  lamp: string;
  /** Contour lines and the heights written on them: an earth colour that is neither a path nor a stream. */
  contour: string;
  /** The kinds of effect the nuclear effects simulator draws, one hue each (tokens `--map-effect-*`). */
  effects: EffectHues;
  /** The ground in sight of an aerial: the estimated range, its rings and the relay planner (token `--map-range`). */
  range: string;
  /** The typical-range circle round an estimated range: its own hue, apart from the wash, the edge and the grey rings (token `--map-range-typical`). */
  rangeTypical: string;
  /** The ground a walk reaches in a set time (token `--map-walk`). */
  walk: string;
  /** What the household's receivers heard, one hue per source (the chart tokens `--chart-1` to `--chart-4`); features/heard. */
  heard?: { mesh: string; aprs: string; adsb: string; ais: string };
}

export interface EffectHues {
  fireball: string;
  blast: string;
  heat: string;
  radiation: string;
  fallout: string;
}

export interface StyleInput {
  sources: MapSources | undefined;
  flavour: MapFlavour;
  theme: MapTheme;
  /** Draw hill shading, if terrain is installed. */
  hillshade: boolean;
  /** Draw contour lines, traced on this device from the same terrain, if any is installed. */
  contours?: boolean;
  /** Draw installed satellite imagery beneath the roads and names (see imagery/style.ts). */
  satellite?: boolean;
  /** The style chosen (map-styles.ts). Left out, or "standard", the map is drawn as it always was. */
  mapStyle?: MapStyleId;
  /** Draw road numbers from the tiles' `ref` (map-styles.ts `roadNumberLayers`). */
  roadNumbers?: boolean;
  /** `location.origin`: MapLibre wants absolute addresses for glyphs, sprites and data files. */
  origin: string;
  /** Changes when the installed regions change; see `tileTemplate`. */
  cacheKey: string;
  overlays?: { sources: Record<string, SourceSpecification>; layers: LayerSpecification[] };
}

export const SOURCE_IDS = {
  land: "world-land",
  countries: "world-countries",
  countryLabels: "world-country-labels",
  basemap: "basemap",
  terrain: "terrain",
  contours: "contours",
} as const;
export const BASE_LAYER_IDS = {
  background: "background",
  land: "world-land",
  borders: "world-borders",
  countryLabels: "world-country-labels",
  hillshade: "hillshade",
  contourLines: "contour-lines",
  contourIndexLines: "contour-index-lines",
  contourLabels: "contour-labels",
} as const;

/** Fonts that exist under /map-assets/fonts; a style may name no others. */
export const MAP_FONTS = { regular: "Noto Sans Regular", medium: "Noto Sans Medium", italic: "Noto Sans Italic" } as const;

const FALLBACK_GLYPHS = "/map-assets/fonts/{fontstack}/{range}.pbf";

const absolute = (origin: string, path: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(path) ? path : `${origin}${path.startsWith("/") ? "" : "/"}${path}`;

/**
 * The Protomaps flavour with its land, water and label halos replaced by the token
 * colours, so the detailed map and the outline map underneath agree at their edges and
 * both sit in the page.
 */
export function tunedFlavor(flavour: MapFlavour, theme: MapTheme): Flavor {
  const base = namedFlavor(flavour);
  const { road, roadCasing: casing } = theme;
  return {
    ...base,
    background: theme.water,
    water: theme.water,
    earth: theme.land,
    // Roads as the stock flavour draws them all but disappear into the land colour.
    // A walker reads the map by its roads and paths, so they are drawn from the tokens.
    highway: road,
    major: road,
    link: road,
    minor_a: road,
    minor_b: road,
    minor_service: road,
    other: theme.path,
    bridges_highway: road,
    bridges_major: road,
    bridges_link: road,
    bridges_minor: road,
    bridges_other: theme.path,
    highway_casing_early: casing,
    highway_casing_late: casing,
    major_casing_early: casing,
    major_casing_late: casing,
    link_casing: casing,
    minor_casing: casing,
    minor_service_casing: casing,
    bridges_highway_casing: casing,
    bridges_major_casing: casing,
    bridges_link_casing: casing,
    bridges_minor_casing: casing,
    bridges_other_casing: casing,
    subplace_label_halo: theme.land,
    city_label_halo: theme.land,
    state_label_halo: theme.land,
    roads_label_minor_halo: theme.land,
    roads_label_major_halo: theme.land,
    address_label_halo: theme.land,
    roads_label_minor: theme.inkMuted,
    roads_label_major: theme.inkMuted,
    city_label: theme.ink,
    subplace_label: theme.inkMuted,
    country_label: theme.inkMuted,
    boundaries: theme.outline,
  };
}

export function buildStyle(input: StyleInput): StyleSpecification {
  const { sources: installed, origin } = input;
  // Every style but the standard one changes the flavour, the colours or the layers; the standard one changes nothing.
  const variant = styleVariant(input.mapStyle ?? "standard", input.flavour, input.theme, tunedFlavor);
  const { flavour, theme } = variant;
  const basemap = installed?.hasTiles ? installed.sources.basemap : undefined;
  const installedTerrain = installed?.hasTerrain ? installed.sources.terrain : undefined;
  const terrain = input.hillshade ? installedTerrain : undefined;
  const contours = input.contours ? installedTerrain : undefined;
  const versioned = (template: string) => template + (input.cacheKey ? `?v=${encodeURIComponent(input.cacheKey)}` : "");

  const sources: Record<string, SourceSpecification> = {
    [SOURCE_IDS.land]: { type: "geojson", data: `${origin}/world/land.json`, attribution: "Natural Earth" },
    [SOURCE_IDS.countries]: { type: "geojson", data: `${origin}/world/countries.json` },
    // Filled in by the caller once the country file has been read: one point per country.
    [SOURCE_IDS.countryLabels]: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  };

  const layers: LayerSpecification[] = [
    { id: BASE_LAYER_IDS.background, type: "background", paint: { "background-color": theme.water } },
    { id: BASE_LAYER_IDS.land, type: "fill", source: SOURCE_IDS.land, paint: { "fill-color": theme.land, "fill-antialias": true } },
    {
      id: BASE_LAYER_IDS.borders,
      type: "line",
      source: SOURCE_IDS.countries,
      paint: { "line-color": theme.outline, "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 6, 1.2] },
    },
  ];

  // Lines of equal height, traced in the browser from the installed terrain (see contours.ts).
  // They are a vector source like any other to MapLibre; the address never leaves this device.
  const contour = contours ? contourLayers(theme) : undefined;
  if (contours) {
    sources[SOURCE_IDS.contours] = {
      type: "vector",
      tiles: [contourTemplate({ dem: versioned(contours.tiles[0] ?? ""), encoding: contours.encoding, maxZoom: contours.maxzoom })],
      minzoom: CONTOUR_MIN_ZOOM,
      maxzoom: CONTOUR_MAX_ZOOM,
      bounds: contours.bounds,
    };
  }

  if (basemap) {
    sources[SOURCE_IDS.basemap] = {
      type: "vector",
      tiles: basemap.tiles.map((template) => tileTemplate(template, input.cacheKey)),
      minzoom: basemap.minzoom,
      maxzoom: basemap.maxzoom,
      bounds: basemap.bounds,
      // Regions differ in depth: where the view is deeper than the region underneath,
      // MapLibre draws the nearest coarser tile instead of leaving a hole. It takes
      // "not found" as the signal, which is what the tile protocol reports (see tiles.ts).
      sparse: true,
    };
    // Protomaps begins with an opaque background, which would hide the outline map
    // wherever no tile is installed. Ours is already underneath.
    let detailed = variant.basemap(
      (protomapsLayers(SOURCE_IDS.basemap, variant.flavor, { lang: "en" }) as LayerSpecification[]).filter(
        (layer) => layer.type !== "background",
      ),
    );
    if (input.roadNumbers) {
      // In place of Protomaps' own shields, which read fields these tiles do not have (see map-styles.ts).
      const shields = detailed.findIndex((layer) => layer.id === "roads_shields");
      const numbers = roadNumberLayers(theme, variant.shields);
      detailed = shields === -1 ? [...detailed, ...numbers] : [...detailed.slice(0, shields), ...numbers, ...detailed.slice(shields + 1)];
    }
    if (terrain) {
      sources[SOURCE_IDS.terrain] = {
        type: "raster-dem",
        tiles: terrain.tiles.map((template) => versioned(absolute(origin, template))),
        minzoom: terrain.minzoom,
        maxzoom: terrain.maxzoom,
        bounds: terrain.bounds,
        tileSize: terrain.tileSize,
        encoding: terrain.encoding,
      };
      const hillshade: LayerSpecification = {
        id: BASE_LAYER_IDS.hillshade,
        type: "hillshade",
        source: SOURCE_IDS.terrain,
        paint: {
          "hillshade-exaggeration": flavour === "dark" ? 0.5 : 0.38,
          "hillshade-shadow-color": flavour === "dark" ? "#000000" : theme.ink,
          "hillshade-highlight-color": flavour === "dark" ? theme.inkMuted : theme.page,
          "hillshade-accent-color": flavour === "dark" ? "#000000" : theme.inkMuted,
        },
      };
      // Shade the land and what grows on it, but not lakes, roads or labels.
      const water = detailed.findIndex((layer) => layer.id === "water");
      detailed.splice(water === -1 ? detailed.length : water, 0, hillshade);
    }
    if (contour) {
      // Lines over the shaded land and under the water, roads and buildings; the heights
      // under every other name on the map, so a place name always wins the room.
      const water = detailed.findIndex((layer) => layer.id === "water");
      detailed.splice(water === -1 ? detailed.length : water, 0, ...contour.lines);
      const firstLabel = detailed.findIndex((layer) => layer.type === "symbol");
      detailed.splice(firstLabel === -1 ? detailed.length : firstLabel, 0, contour.labels);
    }
    layers.push(...detailed);
  } else {
    // Terrain without a detailed map (an imported archive, say): the lines still have the outline map to sit on.
    if (contour) layers.push(...contour.lines, contour.labels);
    // With nothing downloaded there are no place labels at all; name the countries so the outline map can be read.
    layers.push({
      id: BASE_LAYER_IDS.countryLabels,
      type: "symbol",
      source: SOURCE_IDS.countryLabels,
      layout: {
        "text-field": ["get", "name"],
        "text-font": [MAP_FONTS.medium],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 14],
        "text-max-width": 7,
        "symbol-sort-key": ["-", 0, ["get", "rank"]],
      },
      paint: { "text-color": theme.inkMuted, "text-halo-color": theme.land, "text-halo-width": 1.4 },
    });
  }

  if (input.satellite && hasImagery(installed)) {
    const imagery = imageryStyle(installed, input.cacheKey);
    Object.assign(sources, imagery.sources);
    layers.splice(0, layers.length, ...withImagery(layers, imagery.layers, theme));
  }

  if (input.overlays) {
    Object.assign(sources, input.overlays.sources);
    // A layer that tints the map (the night of the grey line) goes under the map's own names, so they keep their contrast.
    const under = input.overlays.layers.filter(isUnderLabels);
    const firstLabel = layers.findIndex((layer) => layer.type === "symbol");
    layers.splice(firstLabel === -1 ? layers.length : firstLabel, 0, ...under);
    layers.push(...input.overlays.layers.filter((layer) => !isUnderLabels(layer)));
  }

  // Last, over the overlays too: the night style makes every colour drawn red.
  layers.splice(0, layers.length, ...variant.finish(layers));

  return {
    version: 8,
    name: input.mapStyle && input.mapStyle !== "standard" ? `Outpost ${input.mapStyle}` : `Outpost ${flavour}`,
    glyphs: absolute(origin, installed?.glyphs ?? FALLBACK_GLYPHS),
    sprite: absolute(origin, installed?.sprites[flavour] ?? `/map-assets/sprites/v4/${flavour}`),
    sources,
    layers,
  };
}

/** Marks an overlay's layer to be drawn under the map's own names rather than over everything. */
export const UNDER_LABELS = { "outpost:under-labels": true } as const;
const isUnderLabels = (layer: LayerSpecification) =>
  (layer.metadata as Record<string, unknown> | undefined)?.["outpost:under-labels"] === true;

/** Any layer but the background: one that draws data from a source. */
type DrawnLayer = Exclude<LayerSpecification, { type: "background" }>;
type FilterSpecification = NonNullable<DrawnLayer["filter"]>;

/**
 * Contour lines in three layers: every line, thin; index lines, heavier; and the height
 * in metres written along each index line. One colour throughout, kept quiet by weight
 * and opacity so that roads, paths and names stay in front.
 */
function contourLayers(theme: MapTheme): { lines: DrawnLayer[]; labels: DrawnLayer } {
  const shared = { source: SOURCE_IDS.contours, "source-layer": CONTOUR_SOURCE_LAYER } as const;
  const isIndex: FilterSpecification = ["==", ["get", CONTOUR_LEVEL_KEY], 1];
  // Sea level is left out. The coast is already drawn, from better data, and a line at 0 m
  // only traces tidal flats and the seams where the terrain's sources meet the sea.
  const aboveOrBelowSea: FilterSpecification = ["!=", ["get", CONTOUR_ELEVATION_KEY], 0];
  return {
    lines: [
      {
        id: BASE_LAYER_IDS.contourLines,
        type: "line",
        ...shared,
        filter: ["all", ["!", isIndex], aboveOrBelowSea],
        layout: { "line-join": "round" },
        paint: {
          "line-color": theme.contour,
          "line-opacity": 0.55,
          "line-width": ["interpolate", ["linear"], ["zoom"], CONTOUR_MIN_ZOOM, 0.5, 13, 0.7, 16, 1],
        },
      },
      {
        id: BASE_LAYER_IDS.contourIndexLines,
        type: "line",
        ...shared,
        filter: ["all", isIndex, aboveOrBelowSea],
        layout: { "line-join": "round" },
        paint: {
          "line-color": theme.contour,
          "line-opacity": 0.85,
          "line-width": ["interpolate", ["linear"], ["zoom"], CONTOUR_MIN_ZOOM, 1, 13, 1.4, 16, 1.9],
        },
      },
    ],
    labels: {
      id: BASE_LAYER_IDS.contourLabels,
      type: "symbol",
      ...shared,
      filter: ["all", isIndex, aboveOrBelowSea],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 280,
        "text-field": ["concat", ["to-string", ["get", CONTOUR_ELEVATION_KEY]], " m"],
        "text-font": [MAP_FONTS.regular],
        "text-size": ["interpolate", ["linear"], ["zoom"], CONTOUR_MIN_ZOOM, 10, 14, 11.5],
        "text-max-angle": 38,
        "text-padding": 6,
      },
      paint: { "text-color": theme.contour, "text-halo-color": theme.land, "text-halo-width": 1.5 },
    },
  };
}

type Ring = Array<[number, number]>;

function ringArea(ring: Ring): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1)
    area += ring[index]![0] * ring[index + 1]![1] - ring[index + 1]![0] * ring[index]![1];
  return Math.abs(area) / 2;
}

function ringCentroid(ring: Ring): [number, number] {
  let x = 0;
  let y = 0;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x0, y0] = ring[index]!;
    const [x1, y1] = ring[index + 1]!;
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  if (twiceArea === 0) return ring[0]!;
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

export interface CountryLabel {
  type: "Feature";
  properties: { name: string; rank: number };
  geometry: { type: "Point"; coordinates: [number, number] };
}

/**
 * One label point per country: the centre of its largest piece. Letting MapLibre place
 * labels on the polygons themselves repeats a name in every tile the country crosses.
 */
export function countryLabelPoints(collection: { features: unknown[] }): { type: "FeatureCollection"; features: CountryLabel[] } {
  const features: CountryLabel[] = [];
  for (const item of collection.features) {
    const feature = item as { properties?: { name?: unknown }; geometry?: { type?: string; coordinates?: unknown } } | null;
    const name = feature?.properties?.name;
    const geometry = feature?.geometry;
    if (typeof name !== "string" || !geometry) continue;
    const polygons = (
      geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : []
    ) as Ring[][];
    let best: { ring: Ring; area: number } | undefined;
    for (const polygon of polygons) {
      const outer = polygon?.[0];
      if (!outer || outer.length < 4) continue;
      const area = ringArea(outer);
      if (!best || area > best.area) best = { ring: outer, area };
    }
    if (!best) continue;
    const [lon, lat] = ringCentroid(best.ring);
    features.push({
      type: "Feature",
      properties: { name, rank: Number(best.area.toFixed(2)) },
      geometry: { type: "Point", coordinates: [Number(lon.toFixed(3)), Number(lat.toFixed(3))] },
    });
  }
  return { type: "FeatureCollection", features };
}

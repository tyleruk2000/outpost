/**
 * The map's styles: the standard map, which is the default and is drawn exactly as it
 * always was, and others built beside it from the same Protomaps tiles, so choosing one
 * downloads nothing.
 *
 * Each style is a variant of `buildStyle`'s input (style.ts): the flavour it is drawn in
 * (which also picks the sprite sheet), the colours it uses, the Protomaps flavour built
 * from them, and two finishing passes over the layers Protomaps makes. The standard map's
 * variant changes nothing, which the tests hold it to.
 *
 * Like palette.ts, this file holds literal colours. A map style is a fixed picture: a
 * road atlas's blue motorways or the night style's reds must not follow the app's theme,
 * and the design tokens do not describe them. The standard map still takes every colour
 * from the tokens.
 *
 * Road numbers: the tiles carry a road's number as `ref` ("M6", "A591", "A6;A34"), but not
 * the `shield_text` and `network` that Protomaps' own `roads_shields` layer reads, so that
 * layer draws nothing. `roadNumberLayers` draws `ref` instead, when asked for.
 */
import type { Flavor } from "@protomaps/basemaps";
import { FALLBACK_THEME } from "./palette";
import type { MapFlavour, MapTheme } from "./style";
import type { LayerSpecification } from "./style-types";

export const MAP_STYLE_IDS = ["standard", "road", "road-uk", "walking", "high-contrast", "night", "low-ink"] as const;
export type MapStyleId = (typeof MAP_STYLE_IDS)[number];
export const DEFAULT_MAP_STYLE: MapStyleId = "standard";

export const isMapStyleId = (value: unknown): value is MapStyleId =>
  typeof value === "string" && (MAP_STYLE_IDS as readonly string[]).includes(value);

/** Remembered in this browser: the style chosen for the map on screen, and whether road numbers are drawn. */
export const MAP_STYLE_KEY = "outpost.maps.style";
export const ROAD_NUMBERS_KEY = "outpost.maps.roadNumbers";

export interface MapStyleInfo {
  label: string;
  /** One line on what it is for. */
  hint: string;
  /** What choosing it switches on as well. Each can be switched off again afterwards. */
  turnsOn?: { hillshade?: true; contours?: true; roadNumbers?: true };
  /** Offered for a printed page. Night is not: a page of dark red is all ink and no use in daylight. */
  printable: boolean;
}

export const MAP_STYLES: Record<MapStyleId, MapStyleInfo> = {
  standard: { label: "Standard", hint: "The usual map, in the app's own colours.", printable: true },
  road: {
    label: "Road map",
    hint: "Roads coloured by class, from motorways to minor roads, with their numbers.",
    turnsOn: { roadNumbers: true },
    printable: true,
  },
  "road-uk": {
    label: "Road map, UK atlas colours",
    hint: "Motorways blue, primary routes green, other A roads red and B roads orange, as in a British road atlas.",
    turnsOn: { roadNumbers: true },
    printable: true,
  },
  walking: {
    label: "Walking",
    hint: "Woods, open land, paths and tracks stand out and roads are quieter. Switches on hill shading and contour lines.",
    turnsOn: { hillshade: true, contours: true },
    printable: true,
  },
  "high-contrast": {
    label: "High contrast",
    hint: "Strong land, water and roads with heavier names, for a screen in bright sun.",
    printable: true,
  },
  night: { label: "Night (red)", hint: "Dark, in reds only, so the map does not spoil your eyes for the dark.", printable: false },
  "low-ink": { label: "Low ink", hint: "White land, thin dark roads and no fills: the least ink for a printed page.", printable: true },
};

/** How a style changes what `buildStyle` draws. */
export interface StyleVariant {
  flavour: MapFlavour;
  theme: MapTheme;
  flavor: Flavor;
  /** Over the Protomaps layers alone, before hill shading and contours are put among them. */
  basemap: (layers: LayerSpecification[]) => LayerSpecification[];
  /**
   * Over every layer, the overlays (places, routes, tools) included. A colour an overlay takes
   * from its data (a route's own colour) is not in the layer, and is left as it is.
   */
  finish: (layers: LayerSpecification[]) => LayerSpecification[];
  /** Whether road numbers sit on the sprite's shields. The night style has none: they are white or black. */
  shields: boolean;
}

const same = (layers: LayerSpecification[]) => layers;

/**
 * The variant for a style. `tuned` is the standard map's flavour (style.ts `tunedFlavor`),
 * passed in rather than imported so that the two files do not import each other.
 */
export function styleVariant(
  id: MapStyleId,
  flavour: MapFlavour,
  theme: MapTheme,
  tuned: (flavour: MapFlavour, theme: MapTheme) => Flavor,
): StyleVariant {
  switch (id) {
    case "road":
    case "road-uk":
      return roadVariant(flavour, theme, tuned, id === "road-uk" ? UK_ROADS : WORLD_ROADS[flavour]);
    case "walking":
      return walkingVariant(flavour, theme, tuned);
    case "high-contrast":
      return highContrastVariant(theme, tuned);
    case "night":
      return nightVariant(flavour, theme, tuned);
    case "low-ink":
      return lowInkVariant(theme, tuned);
    default:
      return { flavour, theme, flavor: tuned(flavour, theme), basemap: same, finish: same, shields: true };
  }
}

// ── Helpers over layers ──

type Paint = Record<string, unknown>;

/** A copy of the layers with the paint of those named changed. */
function repaint(layers: LayerSpecification[], ids: readonly string[], paint: Paint): LayerSpecification[] {
  return layers.map((layer) =>
    ids.includes(layer.id) ? ({ ...layer, paint: { ...(layer as { paint?: Paint }).paint, ...paint } } as LayerSpecification) : layer,
  );
}

/** Puts layers straight after the one named, or at the end if it is not there. */
function insertAfter(layers: LayerSpecification[], id: string, added: LayerSpecification[]): LayerSpecification[] {
  const index = layers.findIndex((layer) => layer.id === id);
  const at = index === -1 ? layers.length : index + 1;
  return [...layers.slice(0, at), ...added, ...layers.slice(at)];
}

/** Every string in a value (a paint property, an expression) passed through `change`. */
function mapStrings(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === "string") return change(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, change));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, change)]));
  return value;
}

type Rgba = [number, number, number, number];

/** Reads "#rgb", "#rrggbb" and "rgb()"/"rgba()"; anything else (a property name, a font) is not a colour. */
export function parseColour(text: string): Rgba | null {
  const value = text.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((digit) => digit + digit).join("") : hex[1]!;
    return [0, 2, 4].map((at) => Number.parseInt(digits.slice(at, at + 2), 16)).concat(1) as Rgba;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  return null;
}

/**
 * A colour as the night style draws it: its lightness kept, its hue made red. Red light
 * leaves the eye's dark adaptation as it was; the lightness keeps land, water, roads and
 * names apart.
 */
export function nightRed(colour: string): string {
  const parsed = parseColour(colour);
  if (!parsed) return colour;
  const [r, g, b, a] = parsed;
  const lightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const red = Math.round(18 + lightness * 212);
  const green = Math.round(lightness * 22);
  const hex = `#${[red, green, 0].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return a < 1 ? `rgba(${red}, ${green}, 0, ${a})` : hex;
}

/** Each Protomaps landuse and landcover colour set to one value: for styles that leave the land plain. */
function plainLand(flavor: Flavor, colour: string): Flavor {
  const keys = [
    "park_a",
    "park_b",
    "hospital",
    "industrial",
    "school",
    "wood_a",
    "wood_b",
    "pedestrian",
    "scrub_a",
    "scrub_b",
    "glacier",
    "sand",
    "beach",
    "aerodrome",
    "runway",
    "zoo",
    "military",
    "pier",
  ] as const;
  const plain: Partial<Flavor> = Object.fromEntries(keys.map((key) => [key, colour]));
  const landcover = flavor.landcover
    ? (Object.fromEntries(Object.keys(flavor.landcover).map((key) => [key, colour])) as unknown as Flavor["landcover"])
    : undefined;
  return { ...flavor, ...plain, landcover };
}

// ── Road map ──

interface RoadPalette {
  motorway: string;
  trunk: string;
  primary: string;
  secondary: string;
  tertiary: string;
  /** The line either side of every coloured road. */
  casing: string;
}

/**
 * Colour by importance rather than by any one country's custom: the more important the
 * road, the deeper and warmer its colour, so it reads without a key anywhere in the world.
 */
const WORLD_ROADS: Record<MapFlavour, RoadPalette> = {
  light: { motorway: "#c23b4b", trunk: "#dd6f3a", primary: "#e9a23b", secondary: "#efd15b", tertiary: "#fbf2c8", casing: "#8a7a70" },
  dark: { motorway: "#d65a68", trunk: "#de8051", primary: "#d9a043", secondary: "#c9b452", tertiary: "#8c8466", casing: "#0d1112" },
};

/** The British road atlas: motorways blue, primary routes (trunk) green, other A roads red, B roads orange. */
const UK_ROADS: RoadPalette = {
  motorway: "#2f6bc0",
  trunk: "#2c8a4c",
  primary: "#d23b32",
  secondary: "#e8892b",
  tertiary: "#f4dc55",
  casing: "#5f5a55",
};

const CLASS_ROADS = [
  "roads_highway",
  "roads_major",
  "roads_link",
  "roads_bridges_highway",
  "roads_bridges_major",
  "roads_bridges_link",
  "roads_tunnels_highway",
  "roads_tunnels_major",
  "roads_tunnels_link",
] as const;
const CLASS_CASINGS = [
  "roads_highway_casing_early",
  "roads_highway_casing_late",
  "roads_major_casing_early",
  "roads_major_casing_late",
  "roads_link_casing",
  "roads_bridges_highway_casing",
  "roads_bridges_major_casing",
  "roads_bridges_link_casing",
] as const;

/** A road's colour from its class, which the tiles give as `kind_detail` the world over; links take their road's colour. */
export function roadClassColour(palette: RoadPalette, otherwise: string): unknown {
  return [
    "match",
    ["get", "kind_detail"],
    ["motorway", "motorway_link"],
    palette.motorway,
    ["trunk", "trunk_link"],
    palette.trunk,
    ["primary", "primary_link"],
    palette.primary,
    ["secondary", "secondary_link"],
    palette.secondary,
    ["tertiary", "tertiary_link"],
    palette.tertiary,
    ["match", ["get", "kind"], "highway", palette.motorway, otherwise],
  ];
}

function roadVariant(
  flavour: MapFlavour,
  theme: MapTheme,
  tuned: (flavour: MapFlavour, theme: MapTheme) => Flavor,
  palette: RoadPalette,
): StyleVariant {
  return {
    flavour,
    theme,
    flavor: tuned(flavour, theme),
    basemap: (layers) => {
      const coloured = repaint(layers, CLASS_ROADS, { "line-color": roadClassColour(palette, palette.tertiary) });
      const tunnels = repaint(coloured, ["roads_tunnels_highway", "roads_tunnels_major", "roads_tunnels_link"], { "line-opacity": 0.55 });
      return repaint(tunnels, CLASS_CASINGS, { "line-color": palette.casing });
    },
    finish: same,
    shields: true,
  };
}

// ── Walking ──

const WALKING = {
  light: {
    wood: "#a9d3a0",
    woodLow: "#c2dfba",
    open: "#dfe9c4",
    road: "#fbfaf6",
    casing: "#d3cdc4",
    path: "#b04a28",
  },
  dark: {
    wood: "#2c4a33",
    woodLow: "#263d2c",
    open: "#2f3a2a",
    road: "#363e41",
    casing: "#20272a",
    path: "#e58a68",
  },
} as const;

function walkingVariant(flavour: MapFlavour, theme: MapTheme, tuned: (flavour: MapFlavour, theme: MapTheme) => Flavor): StyleVariant {
  const colours = WALKING[flavour];
  const walkingTheme: MapTheme = { ...theme, road: colours.road, roadCasing: colours.casing, path: colours.path };
  const base = tuned(flavour, walkingTheme);
  const flavor: Flavor = {
    ...base,
    wood_a: colours.woodLow,
    wood_b: colours.wood,
    park_a: colours.woodLow,
    park_b: colours.wood,
    scrub_a: colours.open,
    scrub_b: colours.open,
    landcover: { ...base.landcover, forest: colours.wood, grassland: colours.open, scrub: colours.open } as Flavor["landcover"],
  };
  return {
    flavour,
    theme: walkingTheme,
    flavor,
    basemap: (layers) => {
      // Paths and tracks drawn dashed and heavier, as on a walker's map; other small ways (a living street) stay solid.
      const index = layers.findIndex((layer) => layer.id === "roads_other");
      if (index === -1) return layers;
      const other = layers[index] as Extract<LayerSpecification, { type: "line" }>;
      const filter = other.filter as unknown[];
      const solid: LayerSpecification = { ...other, filter: [...filter, ["==", "kind", "other"]] as never };
      const paths: LayerSpecification = {
        ...other,
        id: "walking-paths",
        filter: [...filter, ["==", "kind", "path"]] as never,
        layout: { ...other.layout, "line-cap": "butt" },
        paint: {
          "line-color": colours.path,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 14, 1.5, 16, 2.2, 18, 3.5],
          "line-dasharray": [3, 1.6],
        },
      };
      return [...layers.slice(0, index), solid, paths, ...layers.slice(index + 1)];
    },
    finish: same,
    shields: true,
  };
}

// ── High contrast ──

const HIGH_CONTRAST: Omit<MapTheme, "primary" | "lamp" | "effects"> = {
  land: "#ffffff",
  water: "#2f86d6",
  outline: "#000000",
  road: "#ffffff",
  roadCasing: "#000000",
  path: "#000000",
  page: "#ffffff",
  ink: "#000000",
  inkMuted: "#1f1f1f",
  contour: "#7a3e00",
};

/** Heavier names: medium weight for regular, and a wider halo. */
function heavierNames(layers: LayerSpecification[]): LayerSpecification[] {
  return layers.map((layer) => {
    if (layer.type !== "symbol" || layer.source !== "basemap") return layer;
    const layout = mapStrings(layer.layout ?? {}, (text) =>
      text === "Noto Sans Regular" ? "Noto Sans Medium" : text,
    ) as typeof layer.layout;
    const paint = { ...layer.paint, ...(layer.paint?.["text-halo-color"] ? { "text-halo-width": 2 } : {}) };
    return { ...layer, layout, paint };
  });
}

function highContrastVariant(theme: MapTheme, tuned: (flavour: MapFlavour, theme: MapTheme) => Flavor): StyleVariant {
  const strong: MapTheme = { ...theme, ...HIGH_CONTRAST };
  const base = tuned("light", strong);
  const flavor: Flavor = {
    ...base,
    wood_a: "#7cc67c",
    wood_b: "#4fae58",
    park_a: "#8fd08f",
    park_b: "#6fbf75",
    scrub_a: "#c8e39a",
    scrub_b: "#b5d97f",
    buildings: "#8c8c8c",
    railway: "#000000",
    boundaries: "#000000",
    ocean_label: "#00264d",
    roads_label_major: "#000000",
    roads_label_minor: "#000000",
    subplace_label: "#000000",
    country_label: "#000000",
    state_label: "#1f1f1f",
  };
  return { flavour: "light", theme: strong, flavor, basemap: heavierNames, finish: same, shields: true };
}

// ── Night ──

function nightVariant(flavour: MapFlavour, theme: MapTheme, tuned: (flavour: MapFlavour, theme: MapTheme) => Flavor): StyleVariant {
  // The dark map, made red. The app's own dark colours when it is in its dark theme, else the dark fallback.
  const dark: MapTheme = flavour === "dark" ? theme : { ...theme, ...FALLBACK_THEME.dark, effects: theme.effects };
  // Drawn in the dark colours; `finish` then makes every colour of the map red, hill shading and contours with it.
  return {
    flavour: "dark",
    theme: dark,
    flavor: tuned("dark", dark),
    basemap: (layers) =>
      layers.map((layer) => {
        // Place icons are pictures in colour, which no paint can make red: the names stay, the pictures go.
        if (layer.type !== "symbol" || !layer.layout?.["icon-image"]) return layer;
        const { "icon-image": _picture, ...layout } = layer.layout;
        return { ...layer, layout };
      }),
    finish: (layers) =>
      layers.map((layer) =>
        "paint" in layer && layer.paint ? ({ ...layer, paint: mapStrings(layer.paint, nightRed) } as LayerSpecification) : layer,
      ),
    shields: false,
  };
}

// ── Low ink ──

const LOW_INK: Omit<MapTheme, "primary" | "lamp" | "effects"> = {
  land: "#ffffff",
  water: "#ffffff",
  outline: "#8c8c8c",
  road: "#ffffff",
  roadCasing: "#4d4d4d",
  path: "#4d4d4d",
  page: "#ffffff",
  ink: "#1a1a1a",
  inkMuted: "#4d4d4d",
  contour: "#a07d55",
};
/** The edge of the sea, lakes and rivers: the only blue on the page, and a thin line of it. */
const LOW_INK_WATER = "#5f8fbd";

function lowInkVariant(theme: MapTheme, tuned: (flavour: MapFlavour, theme: MapTheme) => Flavor): StyleVariant {
  const plain: MapTheme = { ...theme, ...LOW_INK };
  const flavor: Flavor = {
    ...plainLand(tuned("light", plain), plain.land),
    buildings: "#ececec",
    railway: "#7a7a7a",
    ocean_label: LOW_INK_WATER,
    tunnel_other: "#ffffff",
    tunnel_minor: "#ffffff",
    tunnel_link: "#ffffff",
    tunnel_major: "#ffffff",
    tunnel_highway: "#ffffff",
    tunnel_other_casing: "#9a9a9a",
    tunnel_minor_casing: "#9a9a9a",
    tunnel_link_casing: "#9a9a9a",
    tunnel_major_casing: "#9a9a9a",
    tunnel_highway_casing: "#9a9a9a",
  };
  const edge = (id: string, source: string, sourceLayer?: string): LayerSpecification => ({
    id,
    type: "line",
    source,
    ...(sourceLayer ? { "source-layer": sourceLayer, filter: ["==", "$type", "Polygon"] as never } : {}),
    paint: { "line-color": LOW_INK_WATER, "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 8, 0.7, 14, 1] },
  });
  return {
    flavour: "light",
    theme: plain,
    flavor,
    basemap: (layers) => {
      const rivers = repaint(layers, ["water_river", "water_stream"], { "line-color": LOW_INK_WATER });
      // Land and water are both white: the coast and the shores are drawn as lines instead.
      const coast = insertAfter(rivers, "earth", [edge("low-ink-coast", "basemap", "earth")]);
      return insertAfter(coast, "water", [edge("low-ink-shore", "basemap", "water")]);
    },
    // The outline map under everything, for where no region is downloaded.
    finish: (layers) => insertAfter(layers, "world-land", [edge("low-ink-world-coast", "world-land")]),
    shields: true,
  };
}

// ── Road numbers ──

/** The first number of a road that has several ("A6;A34" is drawn "A6"). */
const FIRST_REF = [
  "let",
  "ref",
  ["to-string", ["get", "ref"]],
  ["case", [">", ["index-of", ";", ["var", "ref"]], 0], ["slice", ["var", "ref"], 0, ["index-of", ";", ["var", "ref"]]], ["var", "ref"]],
];

/** Classes whose numbers are drawn: motorways, trunk and primary roads, and secondary (B) roads. */
const NUMBERED = ["motorway", "trunk", "primary", "secondary"];

/**
 * Road numbers from the tiles' `ref`. On the sprite's shield where it fits (it has shields
 * for one to five characters), in plain text with a halo where it does not ("A1(M)").
 */
export function roadNumberLayers(theme: MapTheme, shields: boolean): LayerSpecification[] {
  const numbered = [
    "all",
    ["has", "ref"],
    ["!", ["has", "is_link"]],
    ["any", ["==", ["get", "kind"], "highway"], ["in", ["get", "kind_detail"], ["literal", NUMBERED]]],
  ];
  const fits = ["<=", ["length", FIRST_REF], 5];
  const layout = {
    "symbol-placement": "line",
    "symbol-spacing": 320,
    "symbol-sort-key": ["match", ["get", "kind_detail"], "motorway", 0, "trunk", 1, "primary", 2, 3],
    "text-field": FIRST_REF,
    "text-font": ["Noto Sans Medium"],
    "text-size": 10.5,
    "text-rotation-alignment": "viewport",
    "icon-rotation-alignment": "viewport",
  };
  const plain: LayerSpecification = {
    id: "road-numbers",
    type: "symbol",
    source: "basemap",
    "source-layer": "roads",
    minzoom: 7,
    filter: (shields ? [...numbered, ["!", fits]] : numbered) as never,
    layout: layout as never,
    paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.8 },
  };
  if (!shields) return [plain];
  return [
    {
      id: "road-numbers-shield",
      type: "symbol",
      source: "basemap",
      "source-layer": "roads",
      minzoom: 7,
      filter: [...numbered, fits] as never,
      layout: { ...layout, "icon-image": ["concat", "generic_shield-", ["length", FIRST_REF], "char"] } as never,
      // The shield is white on the light sheet and black on the dark one; the ink of the same theme reads on it.
      paint: { "text-color": theme.ink },
    },
    plain,
  ];
}

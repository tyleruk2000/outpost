import type { MapSources } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { rangeLayers } from "@/features/repeaters/map/range";
import { walkLayers } from "../walk/walk-map";
import { MAP_STYLE_IDS, MAP_STYLES, NIGHT_IMAGERY_PAINT, nightRed, parseColour, roadClassColour } from "./map-styles";
import { FALLBACK_NIGHT, FALLBACK_THEME } from "./palette";
import { buildStyle, type StyleInput } from "./style";
import type { LayerSpecification } from "./style-types";

const area = [-3.4, 54.3, -2.6, 54.75] as [number, number, number, number];
const installed: MapSources = {
  hasTiles: true,
  hasTerrain: true,
  sources: {
    basemap: { type: "vector", tiles: ["/api/maps/tiles/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 15, bounds: area, attribution: "x" },
    terrain: {
      type: "raster-dem",
      tiles: ["/api/maps/terrain/{z}/{x}/{y}.webp"],
      minzoom: 0,
      maxzoom: 12,
      bounds: area,
      tileSize: 512,
      encoding: "terrarium",
      attribution: "y",
    },
  },
  glyphs: "/map-assets/fonts/{fontstack}/{range}.pbf",
  sprites: { light: "/map-assets/sprites/v4/light", dark: "/map-assets/sprites/v4/dark" },
  bounds: area,
  minZoom: 0,
  maxZoom: 15,
  attribution: "",
  attributions: [],
};

const input = (overrides: Partial<StyleInput> = {}): StyleInput => ({
  sources: installed,
  flavour: "light",
  theme: FALLBACK_THEME.light,
  hillshade: true,
  contours: true,
  origin: "http://outpost.local",
  cacheKey: "k",
  ...overrides,
});
const layer = (style: ReturnType<typeof buildStyle>, id: string) =>
  style.layers.find((each) => each.id === id) as LayerSpecification & {
    filter?: unknown;
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
  };
const paintOf = (style: ReturnType<typeof buildStyle>, id: string) => layer(style, id)?.paint ?? {};

describe("the standard map", () => {
  it("is drawn exactly as before when the standard style is chosen, in both themes and with nothing installed", () => {
    for (const flavour of ["light", "dark"] as const)
      for (const sources of [installed, undefined]) {
        const before = buildStyle(input({ flavour, theme: FALLBACK_THEME[flavour], sources }));
        expect(buildStyle(input({ flavour, theme: FALLBACK_THEME[flavour], sources, mapStyle: "standard" }))).toEqual(before);
        expect(buildStyle(input({ flavour, theme: FALLBACK_THEME[flavour], sources, mapStyle: "standard", roadNumbers: false }))).toEqual(
          before,
        );
      }
  });

  it("is the default and the first choice", () => {
    expect(MAP_STYLE_IDS[0]).toBe("standard");
    expect(MAP_STYLES.standard.label).toBe("Standard");
  });
});

describe("road numbers", () => {
  it("draw the tiles' ref in place of the shields that read fields the tiles lack, only when asked", () => {
    const without = buildStyle(input());
    expect(without.layers.map((each) => each.id)).not.toContain("road-numbers");
    const style = buildStyle(input({ roadNumbers: true }));
    const ids = style.layers.map((each) => each.id);
    expect(ids).not.toContain("roads_shields");
    expect(ids).toEqual(expect.arrayContaining(["road-numbers-shield", "road-numbers"]));
    // Everything else is as it was.
    expect(ids.filter((id) => !id.startsWith("road-numbers"))).toEqual(
      without.layers.map((each) => each.id).filter((id) => id !== "roads_shields"),
    );
    const numbers = layer(style, "road-numbers");
    expect(JSON.stringify(numbers.layout?.["text-field"])).toContain('["get","ref"]');
    expect(JSON.stringify(numbers.filter)).toContain('["has","ref"]');
    expect(JSON.stringify(numbers.filter)).toContain("secondary");
    expect(layer(style, "road-numbers-shield").layout?.["icon-image"]).toEqual(["concat", "generic_shield-", expect.anything(), "char"]);
  });
});

describe("the road map", () => {
  it("colours roads by class from kind_detail, links with their roads", () => {
    const colour = roadClassColour(
      { motorway: "#m", trunk: "#t", primary: "#p", secondary: "#s", tertiary: "#3", casing: "#c" },
      "#other",
    ) as unknown[];
    expect(colour.slice(0, 4)).toEqual(["match", ["get", "kind_detail"], ["motorway", "motorway_link"], "#m"]);
    const style = buildStyle(input({ mapStyle: "road" }));
    expect(JSON.stringify(paintOf(style, "roads_major")["line-color"])).toContain("trunk");
    expect(paintOf(style, "roads_highway_casing_late")["line-color"]).toMatch(/^#/);
  });

  it("has a UK atlas preset: motorways blue, primary routes green, A roads red, B roads orange", () => {
    const colour = JSON.stringify(paintOf(buildStyle(input({ mapStyle: "road-uk" })), "roads_major")["line-color"]);
    expect(colour).toContain('["motorway","motorway_link"],"#2f6bc0"');
    expect(colour).toContain('["trunk","trunk_link"],"#2c8a4c"');
    expect(colour).toContain('["primary","primary_link"],"#d23b32"');
    expect(colour).toContain('["secondary","secondary_link"],"#e8892b"');
  });

  it("switches road numbers on when chosen", () => {
    expect(MAP_STYLES.road.turnsOn?.roadNumbers).toBe(true);
    expect(MAP_STYLES["road-uk"].turnsOn?.roadNumbers).toBe(true);
  });
});

describe("the walking map", () => {
  it("draws paths and tracks dashed and switches on hill shading and contours", () => {
    const style = buildStyle(input({ mapStyle: "walking" }));
    const paths = layer(style, "walking-paths");
    expect(paths.paint?.["line-dasharray"]).toEqual([3, 1.6]);
    expect(JSON.stringify(paths.filter)).toContain('["==","kind","path"]');
    expect(JSON.stringify(layer(style, "roads_other").filter)).toContain('["==","kind","other"]');
    expect(MAP_STYLES.walking.turnsOn).toEqual({ hillshade: true, contours: true });
  });
});

describe("the high-contrast map", () => {
  it("is light whatever the app's theme, with heavier names", () => {
    const style = buildStyle(input({ mapStyle: "high-contrast", flavour: "dark", theme: FALLBACK_THEME.dark }));
    expect(style.sprite).toBe("http://outpost.local/map-assets/sprites/v4/light");
    expect(paintOf(style, "background")["background-color"]).toBe("#2f86d6");
    const names = layer(style, "places_locality");
    expect(JSON.stringify(names.layout?.["text-font"])).not.toContain("Noto Sans Regular");
  });
});

describe("the names on the high-contrast map", () => {
  const luminance = (colour: string) => {
    const [r, g, b] = parseColour(colour)!
      .slice(0, 3)
      .map((value) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const coloursIn = (value: unknown): string[] =>
    typeof value === "string" ? (parseColour(value) ? [value] : []) : Array.isArray(value) ? value.flatMap(coloursIn) : [];

  it("are all at least 4.5:1 against their halo (WCAG 1.4.3)", () => {
    for (const flavour of ["light", "dark"] as const) {
      const style = buildStyle(input({ mapStyle: "high-contrast", flavour, theme: FALLBACK_THEME[flavour] }));
      for (const each of style.layers) {
        if (each.type !== "symbol") continue;
        const paint = paintOf(style, each.id);
        const halo = coloursIn(paint["text-halo-color"])[0];
        if (!halo) continue;
        // A name drawn in its halo's own colour is not a name that shows (a case colour in the Protomaps styles).
        for (const text of coloursIn(paint["text-color"]).filter((colour) => colour.toLowerCase() !== halo.toLowerCase()))
          expect(ratio(text, halo), `${each.id} ${text} on ${halo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("the night map", () => {
  it("is drawn in reds only, without the coloured place pictures", () => {
    const style = buildStyle(input({ mapStyle: "night", roadNumbers: true }));
    expect(style.sprite).toBe("http://outpost.local/map-assets/sprites/v4/dark");
    let colours = 0;
    for (const each of style.layers) {
      if (each.id.startsWith("o-")) continue;
      JSON.stringify((each as { paint?: unknown }).paint ?? {}, (_key, value) => {
        const parsed = typeof value === "string" ? parseColour(value) : null;
        if (parsed) {
          colours += 1;
          expect(parsed[1]).toBeLessThanOrEqual(22);
          expect(parsed[2]).toBe(0);
        }
        return value;
      });
      expect((each as { layout?: Record<string, unknown> }).layout?.["icon-image"]).toBeUndefined();
    }
    expect(colours).toBeGreaterThan(50);
    expect(MAP_STYLES.night.printable).toBe(false);
  });

  it("draws the typical-range circle as the lightest of the range's lines, so that it shows on the dark red land", () => {
    const theme = FALLBACK_THEME.light;
    const overlays = {
      sources: { "o-range": { type: "geojson", data: { type: "FeatureCollection", features: [] } } as never },
      layers: rangeLayers(theme),
    };
    const style = buildStyle(input({ mapStyle: "night", overlays }));
    const colourOf = (id: string) =>
      (style.layers.find((layer) => layer.id === id) as unknown as { paint: Record<string, string> }).paint["line-color"]!;
    const redness = (colour: string) => parseColour(colour)![0];
    expect(redness(colourOf("o-range-typical"))).toBeGreaterThan(redness(colourOf("o-range-edge")));
    expect(redness(colourOf("o-range-typical"))).toBeGreaterThan(redness(colourOf("o-range-ring")));
  });

  it("draws the range and the walk in the night reds their shading is painted in, the same in either theme", () => {
    for (const flavour of ["light", "dark"] as const) {
      const theme = { ...FALLBACK_THEME[flavour], night: FALLBACK_NIGHT };
      const overlays = {
        sources: {
          "o-range": { type: "geojson", data: { type: "FeatureCollection", features: [] } } as never,
          "o-walk": { type: "geojson", data: { type: "FeatureCollection", features: [] } } as never,
        },
        layers: [...rangeLayers(theme), ...walkLayers(theme)],
      };
      const style = buildStyle(input({ mapStyle: "night", flavour, theme, overlays }));
      const paintOf = (id: string) =>
        (style.layers.find((layer) => layer.id === id) as unknown as { paint: Record<string, unknown> }).paint;
      expect(paintOf("o-range-edge")["line-color"], flavour).toBe(FALLBACK_NIGHT.range);
      expect(paintOf("o-range-typical")["line-color"], flavour).toBe(FALLBACK_NIGHT.rangeTypical);
      const walkColours = style.layers
        .filter((layer) => layer.id.startsWith("o-walk"))
        .flatMap((layer) => Object.values((layer as { paint?: Record<string, unknown> }).paint ?? {}))
        .filter((value) => value === FALLBACK_NIGHT.walk);
      expect(walkColours.length, flavour).toBeGreaterThan(0);
    }
  });

  it("dims satellite imagery to grey, and leaves it as it is in the other styles", () => {
    const withImagery: MapSources = {
      ...installed,
      imagery: [
        { id: "world", name: "World", tiles: ["/api/maps/imagery/world/{z}/{x}/{y}"], minzoom: 0, maxzoom: 8, bounds: area },
      ] as never,
    };
    const imageryPaint = (mapStyle: StyleInput["mapStyle"]) =>
      (
        buildStyle(input({ sources: withImagery, satellite: true, mapStyle })).layers.find((layer) => layer.id === "imagery-world") as {
          paint: Record<string, unknown>;
        }
      ).paint;
    expect(imageryPaint("night")).toMatchObject(NIGHT_IMAGERY_PAINT);
    expect(imageryPaint("standard")["raster-brightness-max"]).toBeUndefined();
  });

  it("keeps a colour's lightness as a red", () => {
    expect(nightRed("#000000")).toBe("#120000");
    expect(nightRed("#ffffff")).toBe("#e61600");
    expect(nightRed("rgba(255, 255, 255, 0.5)")).toBe("rgba(230, 22, 0, 0.5)");
    expect(nightRed("kind")).toBe("kind");
  });
});

describe("the low-ink map", () => {
  it("leaves land and water white, drawing the coast and shores as thin lines", () => {
    const style = buildStyle(input({ mapStyle: "low-ink", hillshade: false, contours: false }));
    expect(paintOf(style, "background")["background-color"]).toBe("#ffffff");
    expect(paintOf(style, "earth")["fill-color"]).toBe("#ffffff");
    expect(paintOf(style, "water")["fill-color"]).toBe("#ffffff");
    expect(style.layers.map((each) => each.id)).toEqual(expect.arrayContaining(["low-ink-coast", "low-ink-shore", "low-ink-world-coast"]));
    // No green woods or parks: every landuse fill is the land's white.
    expect(JSON.stringify(paintOf(style, "landuse_park")["fill-color"])).not.toMatch(/#(9cd3b4|a0d9a0)/);
  });
});

describe("parseColour", () => {
  it("reads hex and rgb colours and nothing else", () => {
    expect(parseColour("#abc")).toEqual([170, 187, 204, 1]);
    expect(parseColour("#0a0B0c")).toEqual([10, 11, 12, 1]);
    expect(parseColour("rgb(1, 2, 3)")).toEqual([1, 2, 3, 1]);
    expect(parseColour("Noto Sans Regular")).toBeNull();
  });
});

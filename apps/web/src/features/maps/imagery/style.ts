/**
 * Satellite imagery in the map's style.
 *
 * Each installed set is a raster source of its own, with its own bounds and zooms, and
 * they are drawn coarsest first: the most detailed set lies on top, and wherever it has
 * nothing (outside its area, beyond the edge of a scene) its tiles are transparent or
 * absent, so the coarser one beneath shows through. MapLibre enlarges each set beyond
 * its deepest zoom by itself, so a world at zoom 8 still fills the screen at zoom 14
 * around a small area, blurred but never blank.
 *
 * The imagery goes above the land, water and buildings of the map and beneath its
 * roads, paths, boundaries, names and everything a person has put on it. Names are
 * given a wider halo in the page colour while imagery is on: over a picture the land
 * colour they are normally haloed with is not there to read them against.
 *
 * Tiles come from Outpost's own server through the same protocol as the map's, and
 * never from the internet.
 */
import type { MapSources } from "@outpost/shared";
import type { MapTheme } from "../lib/style";
import type { LayerSpecification, SourceSpecification } from "../lib/style-types";
import { tileTemplate } from "../lib/tiles";

export const IMAGERY_SOURCE_PREFIX = "imagery-";
export const IMAGERY_LAYER_PREFIX = "imagery-";

/** Halo for names over imagery: the page colour, wide enough to hold over any picture. */
export const IMAGERY_HALO_WIDTH = 2;

export function hasImagery(sources: MapSources | undefined): boolean {
  return (sources?.imagery?.length ?? 0) > 0;
}

/** A raster source and layer for each installed set, coarsest first. */
export function imageryStyle(
  sources: MapSources | undefined,
  cacheKey: string,
): { sources: Record<string, SourceSpecification>; layers: LayerSpecification[] } {
  const out: Record<string, SourceSpecification> = {};
  const layers: LayerSpecification[] = [];
  for (const set of sources?.imagery ?? []) {
    const id = `${IMAGERY_SOURCE_PREFIX}${set.id}`;
    out[id] = {
      type: "raster",
      tiles: set.tiles.map((template) => tileTemplate(template, cacheKey)),
      tileSize: 256,
      minzoom: set.minzoom,
      maxzoom: set.maxzoom,
      bounds: set.bounds,
    };
    layers.push({
      id: `${IMAGERY_LAYER_PREFIX}${set.id}`,
      type: "raster",
      source: id,
      minzoom: set.minzoom,
      // The picture as it is: no change of colour, brightness or contrast. A short fade, not the default
      // 300 ms, so panning on a phone does not show tiles swimming in.
      paint: { "raster-fade-duration": 100, "raster-resampling": "linear" },
    });
  }
  return { sources: out, layers };
}

/** Polygons of the map that a picture of the ground replaces: land, land use, water and buildings. */
const isGround = (layer: LayerSpecification) => layer.type === "fill" || layer.type === "hillshade";

/**
 * Lays the imagery into the map's own layers: every filled polygon (and hill shading)
 * first, in its order, then the imagery, then the lines and names. Lines that were
 * between fills (streams, runways) keep their order among the lines.
 */
export function withImagery(layers: LayerSpecification[], imagery: LayerSpecification[], theme: MapTheme): LayerSpecification[] {
  if (imagery.length === 0) return layers;
  const background = layers.filter((layer) => layer.type === "background");
  const ground = layers.filter((layer) => layer.type !== "background" && isGround(layer));
  const rest = layers.filter((layer) => layer.type !== "background" && !isGround(layer)).map((layer) => haloed(layer, theme));
  return [...background, ...ground, ...imagery, ...rest];
}

function haloed(layer: LayerSpecification, theme: MapTheme): LayerSpecification {
  if (layer.type !== "symbol") return layer;
  const paint = (layer.paint ?? {}) as Record<string, unknown>;
  if (!("text-color" in paint) && !layer.layout?.["text-field"]) return layer;
  return {
    ...layer,
    paint: { ...paint, "text-halo-color": theme.page, "text-halo-width": IMAGERY_HALO_WIDTH, "text-halo-blur": 0.5 },
  } as LayerSpecification;
}

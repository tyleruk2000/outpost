/**
 * The walk on a printed page (print/overlays.ts): the shading by the hour painted again in the light map's colours
 * (paper is always the light map; the picture on screen is in the theme's), the rings and their times, and the start.
 * Painted from the same answer as on screen, so the shape is the same; kept for each answer, so ticking boxes in the
 * print dialog does not paint it again. Every ring has its time written on it, so the page reads on a printer with no
 * colour.
 */
import type { InstalledRegion, WalkReach } from "@outpost/shared";
import { WALK_PACES } from "@outpost/shared";
import { formatDistance } from "../lib/geo";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification, SourceSpecification } from "../lib/style-types";
import { keepShade, releaseShade, type Shade } from "../map/shades";
import { encodeShadeNow } from "../print/range-paper";
import { formatWalkTime, ringStep, WALK_SHADE_OPACITY, walkData, walkGrid, walkShade } from "./walk-map";
import { paceSentence } from "./walk-reach";

const painted = new WeakMap<WalkReach, { colour: string; shade: Shade | null }>();

/** The shading in `colour`, ready for the print style; none where the page cannot paint one. */
export function walkPaperShade(reach: WalkReach, colour: string): Shade | null {
  const known = painted.get(reach);
  if (known && known.colour === colour) return known.shade;
  if (known?.shade) releaseShade(known.shade.url);
  const grid = walkGrid(reach);
  const picture = grid ? walkShade(grid, colour, 1536) : null;
  const png = picture ? encodeShadeNow(picture) : null;
  const shade = picture && png ? { url: keepShade(png), coordinates: picture.coordinates, opacity: WALK_SHADE_OPACITY } : null;
  painted.set(reach, { colour, shade });
  return shade;
}

export const WALK_PAPER_SOURCE = "print-walk";

/** The rings with their times, and the start as a ringed dot, in the page's colours. */
export function walkPaperLayers(reach: WalkReach, theme: MapTheme): { source: SourceSpecification; layers: LayerSpecification[] } {
  const grid = walkGrid(reach);
  const data = walkData(grid);
  data.features.push({
    type: "Feature",
    properties: { kind: "start" },
    geometry: { type: "Point", coordinates: [reach.at.lon, reach.at.lat] },
  });
  return {
    source: { type: "geojson", data: data as never },
    layers: [
      {
        id: "print-walk-casing",
        type: "line",
        source: WALK_PAPER_SOURCE,
        filter: ["==", ["get", "kind"], "ring"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": theme.page, "line-width": 3.5, "line-opacity": 0.7 },
      },
      {
        id: "print-walk-ring",
        type: "line",
        source: WALK_PAPER_SOURCE,
        filter: ["==", ["get", "kind"], "ring"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": theme.ink, "line-width": 1.2 },
      },
      {
        id: "print-walk-label",
        type: "symbol",
        source: WALK_PAPER_SOURCE,
        filter: ["==", ["get", "kind"], "label"],
        layout: {
          "text-font": [MAP_FONTS.medium],
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-anchor": "bottom",
          "text-offset": [0, -0.2],
          "text-allow-overlap": true,
        },
        paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.8 },
      },
      {
        id: "print-walk-start",
        type: "circle",
        source: WALK_PAPER_SOURCE,
        filter: ["==", ["get", "kind"], "start"],
        paint: { "circle-radius": 4.5, "circle-color": theme.ink, "circle-stroke-color": theme.page, "circle-stroke-width": 2 },
      },
    ],
  };
}

/** "Reachable on foot within 4 h from 54.43000, -3.01000": for the dialog's line and the page's note. */
export function walkSentence(reach: WalkReach): string {
  return `Reachable on foot within ${formatWalkTime(reach.minutes)} from ${reach.at.lat.toFixed(5)}, ${reach.at.lon.toFixed(5)}`;
}

/** The terrain read for the walk, by name and the date of its data where known. */
function terrainWords(reach: WalkReach, regions: readonly InstalledRegion[]): string {
  const holds = (region: InstalledRegion) =>
    region.tileType === "terrain" &&
    reach.at.lon >= region.bounds[0] &&
    reach.at.lon <= region.bounds[2] &&
    reach.at.lat >= region.bounds[1] &&
    reach.at.lat <= region.bounds[3];
  const region = regions.find(holds);
  if (!region) return "the installed terrain";
  const build = region.sourceBuild;
  const day = build && /^\d{8}$/.test(build) ? ` (data of ${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)})` : "";
  return `${region.name}${day}`;
}

/** The sentences under the printed map: the key in words, the pace, the terrain read and what the walk leaves out. */
export function walkNotes(reach: WalkReach, regions: readonly InstalledRegion[]): string[] {
  const step = ringStep(reach.minutes);
  const pace = WALK_PACES.find((one) => one.id === reach.pace) ?? WALK_PACES[0];
  return [
    `${walkSentence(reach)} (the ringed dot), as far as ${formatDistance(reach.furthestMeters)} straight-line. Shaded darkest nearest, with rings every ${step === 30 ? "half hour" : "hour"}, each with its time. ${paceSentence(pace.id)}`,
    // Short: the strip under the map holds a few lines, and the card on screen has the whole of WALK_METHOD.
    `Tobler's hiking function over ${terrainWords(reach, regions)} in ${formatDistance(reach.cellMeters)} squares: about 5 km/h on a flat path, slower uphill, three fifths of that ${reach.paths ? "off the paths and roads of the installed map" : "everywhere (no map with paths here)"}. Water, cliffs and slopes over 45° barred except at bridges. Not counted: fences, walls, private land, bog, woods, snow, darkness, weather or rests.`,
  ];
}

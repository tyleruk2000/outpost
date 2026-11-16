/**
 * What the nuclear preparedness workspace draws over the map: for each scenario on
 * screen (at most six, "A" to "F"), its rings, its fallout plume and its ground zero.
 *
 * Each kind of effect has a hue of its own (tokens `--map-effect-*`, validated for
 * colour-blind separation: docs/nuclear-preparedness.md), the same on the map, in the
 * legend, the results and the PDF. Within a kind, a stronger level is more opaque, never
 * another hue; scenario A's rings are also filled very lightly, so that the map reads as
 * zones, the stronger ones darker where they stack. Every line sits on a thin casing of
 * the page's colour, so that it reads over satellite imagery too.
 *
 * Nothing is told apart by colour alone. Each kind keeps its own line (blast solid, heat
 * long dashes, initial radiation dots, the fireball and crater thin), every ring carries
 * its scenario's letter, its level and its distance written along it, and the two
 * scenarios' ground zeros are marked with their letters. The scenario being worked on
 * is drawn at full strength; the others are thinner and fainter, with no fill: tracings
 * laid beside it in the same hues, so that a hue always means the same kind of effect
 * and the selected scenario always reads first. No scenario has a hue of its own.
 */
import { type EffectFamily, type EffectsResult, roundDistance, type ScenarioLetter } from "@outpost/shared";
import type { LatLon } from "@/features/maps/lib/geo";
import { type EffectHues, MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
import { groundCircle, plumePolygon } from "./geometry";
import { distanceText } from "./words";

export const NUCLEAR_SOURCE = "o-nuclear";

/** The fallout contours drawn: one in two of the book's, so that each can be read. */
export const DRAWN_FALLOUT_RATES = [1000, 100, 10, 1] as const;

export type Letter = ScenarioLetter;

/** Which kinds of thing are shown; each has a switch on the screen. */
export interface Visible {
  blast: boolean;
  thermal: boolean;
  radiation: boolean;
  fireball: boolean;
  fallout: boolean;
}

export const ALL_VISIBLE: Visible = { blast: true, thermal: true, radiation: true, fireball: true, fallout: true };

/** The line of each kind of effect: its dashes and width, the same on the map, in the legend and in the PDF. */
export const FAMILY_LINES: Record<EffectFamily, { dash: number[] | null; width: number }> = {
  blast: { dash: null, width: 2 },
  thermal: { dash: [5, 2.5], width: 2 },
  radiation: { dash: [0.6, 2], width: 2.6 },
  fireball: { dash: null, width: 1 },
  crater: { dash: [2, 2], width: 1 },
};

/** The hue of each kind of effect: the fireball and the crater share one. */
export const FAMILY_HUE: Record<EffectFamily | "fallout", keyof EffectHues> = {
  fireball: "fireball",
  crater: "fireball",
  blast: "blast",
  thermal: "heat",
  radiation: "radiation",
  fallout: "fallout",
};

/** The token that holds a kind's hue, for the screen: `var(--map-effect-blast)`. */
export const familyColour = (family: EffectFamily | "fallout") => `var(--map-effect-${FAMILY_HUE[family]})`;

/** The lines of a scenario that is not the one being worked on: thinner and fainter. */
export const COMPARED = { width: 0.6, opacity: 0.6 } as const;
/** How opaque the weakest level of a kind is drawn; the strongest is fully opaque. */
const WEAKEST = 0.5;
/** The fill inside each of the selected scenario's rings: faint, so that they stack into zones and the map stays legible. */
export const ZONE_OPACITY = 0.045;

const familyShown = (family: EffectFamily, visible: Visible) =>
  family === "crater" || family === "fireball" ? visible.fireball : visible[family];

export interface Drawn {
  letter: Letter;
  /** The scenario being worked on: drawn at full strength, its rings filled. */
  selected: boolean;
  at: LatLon;
  result: EffectsResult;
}

export function nuclearData(drawn: Drawn[], visible: Visible): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  // The selected scenario is drawn last, over the others.
  for (const { letter, at, result, selected } of [...drawn].sort((a, b) => Number(a.selected) - Number(b.selected))) {
    const quiet = !selected;
    if (visible.fallout && result.fallout.drawn) {
      const { fromDegrees } = result.fallout;
      const contours = result.fallout.contours.filter((contour) => (DRAWN_FALLOUT_RATES as readonly number[]).includes(contour.rate));
      contours.forEach((contour, index) => {
        features.push({
          type: "Feature",
          properties: {
            kind: "plume",
            scenario: letter,
            quiet,
            // Stronger contours stack darker: each is drawn over the one outside it. Another scenario's at half.
            // The outermost is still plainly visible on the light map, the dark map and imagery: it has its own edge on a casing.
            opacity: (0.12 + index * 0.06) * (quiet ? 0.5 : 1),
            label: `${letter} · ${contour.rate.toLocaleString("en-GB")} rads/h at 1 hour (idealised)`,
          },
          geometry: { type: "Polygon", coordinates: [plumePolygon(at, contour, fromDegrees)] },
        });
      });
    }
    for (const ring of result.rings) {
      if (ring.metres === null || !familyShown(ring.family, visible)) continue;
      // Within a kind, the smaller ring is the stronger level: more opaque.
      const kin = result.rings.filter((other) => other.family === ring.family && other.metres !== null).map((other) => other.metres!);
      const rank = kin.filter((metres) => metres > ring.metres!).length;
      const strength = kin.length <= 1 ? 1 : rank / (kin.length - 1);
      const opacity = WEAKEST + (1 - WEAKEST) * strength;
      const circle = groundCircle(at, ring.metres);
      if (selected)
        features.push({
          type: "Feature",
          properties: { kind: "zone", family: ring.family, scenario: letter },
          geometry: { type: "Polygon", coordinates: [circle] },
        });
      features.push({
        type: "Feature",
        properties: {
          kind: "ring",
          family: ring.family,
          scenario: letter,
          quiet,
          opacity: quiet ? opacity * COMPARED.opacity : opacity,
          label: `${letter} · ${ring.label} · ${distanceText(roundDistance(ring.metres))}`,
        },
        geometry: { type: "LineString", coordinates: circle },
      });
    }
    features.push({
      type: "Feature",
      properties: { kind: "zero", scenario: letter, quiet, label: letter },
      geometry: { type: "Point", coordinates: [at.lon, at.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function nuclearLayers(theme: MapTheme): LayerSpecification[] {
  const kind = (name: string) => ["==", ["get", "kind"], name];
  const quiet = ["==", ["get", "quiet"], true];
  const hue = (family: EffectFamily | "fallout") => theme.effects[FAMILY_HUE[family]];
  const families = Object.keys(FAMILY_LINES) as EffectFamily[];
  const zones = families.map(
    (family): LayerSpecification => ({
      id: `o-nuclear-zone-${family}`,
      type: "fill",
      source: NUCLEAR_SOURCE,
      filter: ["all", kind("zone"), ["==", ["get", "family"], family]] as never,
      paint: { "fill-color": hue(family), "fill-opacity": ZONE_OPACITY },
    }),
  );
  const width = (family: EffectFamily) => ["case", quiet, FAMILY_LINES[family].width * COMPARED.width, FAMILY_LINES[family].width] as never;
  const casings = families.map(
    (family): LayerSpecification => ({
      id: `o-nuclear-casing-${family}`,
      type: "line",
      source: NUCLEAR_SOURCE,
      filter: ["all", kind("ring"), ["==", ["get", "family"], family]] as never,
      layout: { "line-cap": family === "radiation" ? "round" : "butt" },
      paint: {
        "line-color": theme.page,
        "line-opacity": ["case", quiet, 0.5, 0.8] as never,
        "line-width": ["case", quiet, FAMILY_LINES[family].width * COMPARED.width + 2, FAMILY_LINES[family].width + 2.4] as never,
      },
    }),
  );
  const rings = families.map(
    (family): LayerSpecification => ({
      id: `o-nuclear-ring-${family}`,
      type: "line",
      source: NUCLEAR_SOURCE,
      filter: ["all", kind("ring"), ["==", ["get", "family"], family]] as never,
      layout: { "line-cap": family === "radiation" ? "round" : "butt" },
      paint: {
        "line-color": hue(family),
        "line-opacity": ["get", "opacity"] as never,
        "line-width": width(family),
        ...(FAMILY_LINES[family].dash ? { "line-dasharray": FAMILY_LINES[family].dash as number[] } : {}),
      },
    }),
  );
  return [
    {
      id: "o-nuclear-plume",
      type: "fill",
      source: NUCLEAR_SOURCE,
      filter: kind("plume") as never,
      paint: { "fill-color": hue("fallout"), "fill-opacity": ["get", "opacity"] as never },
    },
    {
      id: "o-nuclear-plume-casing",
      type: "line",
      source: NUCLEAR_SOURCE,
      filter: kind("plume") as never,
      paint: {
        "line-color": theme.page,
        "line-width": ["case", quiet, 2, 3.4] as never,
        "line-opacity": ["case", quiet, 0.4, 0.7] as never,
      },
    },
    {
      id: "o-nuclear-plume-edge",
      type: "line",
      source: NUCLEAR_SOURCE,
      filter: kind("plume") as never,
      paint: {
        "line-color": hue("fallout"),
        "line-width": ["case", quiet, 1, 1.6] as never,
        "line-opacity": ["case", quiet, 0.55, 1] as never,
        "line-dasharray": [3, 1.5],
      },
    },
    ...zones,
    ...casings,
    ...rings,
    {
      id: "o-nuclear-labels",
      type: "symbol",
      source: NUCLEAR_SOURCE,
      filter: ["in", ["get", "kind"], ["literal", ["ring", "plume"]]] as never,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 320,
        "text-font": [MAP_FONTS.medium] as string[],
        "text-size": 12,
        "text-field": ["get", "label"],
        "text-keep-upright": true,
        "text-max-angle": 40,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.8 },
    },
    {
      id: "o-nuclear-zero",
      type: "circle",
      source: NUCLEAR_SOURCE,
      filter: kind("zero") as never,
      paint: {
        "circle-radius": 9,
        "circle-color": theme.page,
        "circle-stroke-color": ["case", quiet, theme.inkMuted, theme.ink] as never,
        "circle-stroke-width": ["case", quiet, 1.5, 2.5] as never,
      },
    },
    {
      id: "o-nuclear-zero-letter",
      type: "symbol",
      source: NUCLEAR_SOURCE,
      filter: kind("zero") as never,
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-size": 12,
        "text-field": ["get", "label"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": theme.ink },
    },
  ];
}

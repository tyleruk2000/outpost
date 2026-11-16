/**
 * What the nuclear preparedness workspace draws over the map: for each scenario on
 * screen (at most two, "A" and "B"), its rings, its fallout plume and its ground zero.
 *
 * Nothing is told apart by colour alone. Each kind of effect has its own line (blast
 * solid, heat long dashes, initial radiation dots, the fireball and crater thin), every
 * ring carries its scenario's letter, its level and its distance written along it, and
 * the two scenarios' ground zeros are marked with their letters. Scenario B is also
 * drawn in the primary colour, as a second cue.
 */
import { type EffectFamily, type EffectsResult, roundDistance } from "@outpost/shared";
import type { LatLon } from "@/features/maps/lib/geo";
import { MAP_FONTS, type MapTheme } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
import { groundCircle, plumePolygon } from "./geometry";
import { distanceText } from "./words";

export const NUCLEAR_SOURCE = "o-nuclear";

/** The fallout contours drawn: one in two of the book's, so that each can be read. */
export const DRAWN_FALLOUT_RATES = [1000, 100, 10, 1] as const;

export type Letter = "A" | "B";

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

const familyShown = (family: EffectFamily, visible: Visible) =>
  family === "crater" || family === "fireball" ? visible.fireball : visible[family];

export interface Drawn {
  letter: Letter;
  at: LatLon;
  result: EffectsResult;
}

export function nuclearData(drawn: Drawn[], visible: Visible): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  for (const { letter, at, result } of drawn) {
    if (visible.fallout && result.fallout.drawn) {
      const { fromDegrees } = result.fallout;
      const contours = result.fallout.contours.filter((contour) => (DRAWN_FALLOUT_RATES as readonly number[]).includes(contour.rate));
      contours.forEach((contour, index) => {
        features.push({
          type: "Feature",
          properties: {
            kind: "plume",
            scenario: letter,
            // Stronger contours stack darker: each is drawn over the one outside it.
            opacity: 0.07 + index * 0.05,
            label: `${letter} · ${contour.rate.toLocaleString("en-GB")} rads/h at 1 hour (idealised)`,
          },
          geometry: { type: "Polygon", coordinates: [plumePolygon(at, contour, fromDegrees)] },
        });
      });
    }
    for (const ring of result.rings) {
      if (ring.metres === null || !familyShown(ring.family, visible)) continue;
      features.push({
        type: "Feature",
        properties: {
          kind: "ring",
          family: ring.family,
          scenario: letter,
          label: `${letter} · ${ring.label} · ${distanceText(roundDistance(ring.metres))}`,
        },
        geometry: { type: "LineString", coordinates: groundCircle(at, ring.metres) },
      });
    }
    features.push({
      type: "Feature",
      properties: { kind: "zero", scenario: letter, label: letter },
      geometry: { type: "Point", coordinates: [at.lon, at.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function nuclearLayers(theme: MapTheme): LayerSpecification[] {
  const kind = (name: string) => ["==", ["get", "kind"], name];
  const colour = ["case", ["==", ["get", "scenario"], "B"], theme.primary, theme.ink] as never;
  const rings = (Object.keys(FAMILY_LINES) as EffectFamily[]).map(
    (family): LayerSpecification => ({
      id: `o-nuclear-ring-${family}`,
      type: "line",
      source: NUCLEAR_SOURCE,
      filter: ["all", kind("ring"), ["==", ["get", "family"], family]] as never,
      layout: { "line-cap": family === "radiation" ? "round" : "butt" },
      paint: {
        "line-color": colour,
        "line-width": FAMILY_LINES[family].width,
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
      paint: { "fill-color": colour, "fill-opacity": ["get", "opacity"] as never },
    },
    {
      id: "o-nuclear-plume-edge",
      type: "line",
      source: NUCLEAR_SOURCE,
      filter: kind("plume") as never,
      paint: { "line-color": colour, "line-width": 1, "line-opacity": 0.75, "line-dasharray": [3, 1.5] },
    },
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
      paint: { "circle-radius": 9, "circle-color": theme.page, "circle-stroke-color": colour, "circle-stroke-width": 2.5 },
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

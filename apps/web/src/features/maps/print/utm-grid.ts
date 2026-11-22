/**
 * UTM grid lines for a printed map: lines of equal easting and northing in the zone of
 * the middle of the page, every kilometre (or every 10 km, or 100 m, as the scale
 * allows), each with its figure in kilometres. Read with the figures, a point anywhere on
 * the sheet has a UTM position and an MGRS reference without a computer.
 *
 * The lines are not straight on this projection: they are drawn through many points
 * worked out from the grid, so they bend as the grid does. Pure arithmetic.
 */
import { type Bbox, fromUps, fromUtm, toGrid, toUps, toUtm } from "@outpost/shared";
import { MAP_FONTS, type MapTheme } from "../lib/style";
import type { LayerSpecification } from "../lib/style-types";
import type { FeatureCollection } from "../map/overlays";

/** The source the map on screen draws the grid from (lib/use-utm-grid.ts). */
export const UTM_SOURCE = "o-utm";

export interface UtmGrid {
  /** Metres between lines. */
  spacing: number;
  /** "30U", or "UPS N". */
  zone: string;
  lines: FeatureCollection;
  /** Whether the page reaches into another zone, where the lines carry on in this one's grid. */
  crossesZone: boolean;
}

/** Steps a grid may use, metres. */
const SPACINGS = [100, 1000, 10_000, 100_000];

/** The finest spacing at least `minPixels` apart on the map drawn at `zoom`, at a latitude. */
export function utmSpacing(zoom: number, lat: number, minPixels = 90): number {
  const metresPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  return SPACINGS.find((spacing) => spacing / metresPerPixel >= minPixels) ?? SPACINGS[SPACINGS.length - 1]!;
}

/** A figure in kilometres, as printed beside a line: "448", or "448.1" for lines 100 m apart. */
export function gridLabel(metres: number, spacing: number): string {
  return spacing >= 1000 ? String(Math.round(metres / 1000)) : (metres / 1000).toFixed(1);
}

/** The lines for the ground in `bbox`, or null where there is no grid (a box that is not on the Earth). */
export function utmGrid(bbox: Bbox, zoom: number): UtmGrid | null {
  const [west, south, east, north] = bbox;
  const middle = { lat: (south + north) / 2, lon: (west + east) / 2 };
  const at = toGrid(middle.lat, middle.lon);
  if (!at) return null;
  const project =
    at.kind === "utm"
      ? (lat: number, lon: number) => toUtm(lat, lon, { zone: at.zone, hemisphere: at.hemisphere, beyond: true })
      : (lat: number, lon: number) => toUps(lat, lon, true);
  const unproject =
    at.kind === "utm"
      ? (e: number, n: number) => fromUtm(at.zone, at.hemisphere, e, n)
      : (e: number, n: number) => fromUps(at.hemisphere, e, n);

  // The grid's extent over the page, from points round its edge.
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    for (const [lat, lon] of [
      [south, west + f * (east - west)],
      [north, west + f * (east - west)],
      [south + f * (north - south), west],
      [south + f * (north - south), east],
    ] as const) {
      const point = project(lat, lon);
      if (!point) continue;
      minE = Math.min(minE, point.easting);
      maxE = Math.max(maxE, point.easting);
      minN = Math.min(minN, point.northing);
      maxN = Math.max(maxN, point.northing);
    }
  }
  if (!Number.isFinite(minE)) return null;
  let spacing = utmSpacing(zoom, middle.lat);
  // Never more than about 60 lines each way, whatever the zoom says.
  while ((maxE - minE) / spacing > 60 || (maxN - minN) / spacing > 60) spacing *= 10;

  const features: FeatureCollection["features"] = [];
  const along = 24;
  const line = (points: Array<[number, number]>, label: string, axis: "e" | "n") => {
    const coordinates = points
      .map(([e, n]) => unproject(e, n))
      .filter((point): point is { lat: number; lon: number } => point !== null)
      .map((point): [number, number] => [point.lon, point.lat]);
    if (coordinates.length < 2) return;
    features.push({ type: "Feature", properties: { label, axis }, geometry: { type: "LineString", coordinates } });
  };
  for (let e = Math.ceil(minE / spacing) * spacing; e <= maxE; e += spacing) {
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= along; i += 1) points.push([e, minN + ((maxN - minN) * i) / along]);
    line(points, gridLabel(e, spacing), "e");
  }
  for (let n = Math.ceil(minN / spacing) * spacing; n <= maxN; n += spacing) {
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= along; i += 1) points.push([minE + ((maxE - minE) * i) / along, n]);
    line(points, gridLabel(n, spacing), "n");
  }

  const zone = at.kind === "utm" ? `${at.zone}${at.band}` : `UPS ${at.hemisphere}`;
  const corners = [toGrid(south, west), toGrid(south, east), toGrid(north, west), toGrid(north, east)];
  const crossesZone = corners.some(
    (corner) => !corner || corner.kind !== at.kind || (corner.kind === "utm" && at.kind === "utm" && corner.zone !== at.zone),
  );
  return { spacing, zone, lines: { type: "FeatureCollection", features }, crossesZone };
}

/** The sentence under the map about the grid. */
export function utmGridNote(grid: UtmGrid): string {
  const every = grid.spacing >= 1000 ? `${grid.spacing / 1000} km` : `${grid.spacing} m`;
  const name = grid.zone.startsWith("UPS") ? `UPS (${grid.zone === "UPS N" ? "north" : "south"} polar)` : `UTM zone ${grid.zone}`;
  return `The grid is ${name} on WGS 84, a line every ${every}, each marked with its easting or northing in kilometres.${
    grid.crossesZone ? " Part of the page is in the next zone; the lines there carry on in this zone's grid." : ""
  }`;
}

/**
 * In the primary colour, as on paper, so that it is told from the Maidenhead grid (in ink) and the magnetic lines (in
 * blue); thin and see-through, never as strong as a road. The figures follow the lines, haloed in the page colour.
 */
export function utmGridLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-utm-line",
      type: "line",
      source: UTM_SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": theme.primary, "line-width": 1, "line-opacity": 0.6 },
    },
    {
      id: "o-utm-figure",
      type: "symbol",
      source: UTM_SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 260,
        "text-field": ["get", "label"],
        "text-font": [MAP_FONTS.medium] as string[],
        "text-size": 11,
        "text-keep-upright": true,
      },
      paint: { "text-color": theme.primary, "text-halo-color": theme.page, "text-halo-width": 1.6 },
    },
    {
      id: "o-utm-zone",
      type: "symbol",
      source: UTM_SOURCE,
      filter: ["==", ["get", "kind"], "zone"],
      layout: {
        "text-field": ["get", "label"],
        "text-font": [MAP_FONTS.medium] as string[],
        "text-size": 12.5,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": theme.primary, "text-halo-color": theme.page, "text-halo-width": 1.8 },
    },
  ];
}

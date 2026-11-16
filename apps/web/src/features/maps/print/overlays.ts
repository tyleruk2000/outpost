/**
 * What can be put on a printed map, as a list.
 *
 * Each entry is one tick box in "Print or save as PDF": its name, whether it can be
 * drawn on this page and whether it starts ticked, and `apply`, which switches it on in
 * the map that is drawn off screen for the page. That map is built from a style like
 * the one on screen (lib/style.ts), so switching something on means adding to a draft
 * of that style: a flag the style already understands, data for one of the map's own
 * overlay sources, or a source and layers of the entry's own.
 *
 * To add an overlay, add an entry to PRINT_OVERLAYS. It needs:
 *
 * - `id` and `label`;
 * - `initially(context)`: whether it starts ticked, usually whether it is showing on
 *   the map on screen;
 * - `apply(draft, context, parts)`: put its data in `draft.sources` under a name of its
 *   own and push its layers onto `draft.layers` (they are drawn above everything else,
 *   in the order pushed). `context.bbox` and `context.zoom` say what the page shows, and
 *   `context.theme` holds the colours. Sizes are in the map's own pixels, as on screen;
 *   the print draws them larger by itself.
 *
 * and may have `unavailable` (a sentence for when it cannot be drawn here), `hint`,
 * `parts` (things inside it to tick one at a time) and `usesTerrain` (it is drawn from
 * the installed terrain, which the page then credits). Nothing else needs to change:
 * the dialog, the preview and the PDF all work from this list.
 */
import type { Bbox, InstalledRegion, MapSources, MarkerDto, TrackDto, TrackWithGeometryDto } from "@outpost/shared";
import { plural } from "@/lib/utils";
import { CONTOUR_MIN_ZOOM, contourInterval, contourReach } from "../lib/contours";
import { buildStyle, MAP_FONTS, type MapTheme, SOURCE_IDS } from "../lib/style";
import type { LayerSpecification, SourceSpecification, StyleSpecification } from "../lib/style-types";
import { type FeatureCollection, markersData, type OverlaySource, overlayLayers, overlaySources, tracksData } from "../map/overlays";
import { readable } from "./coverage";
import { type Graticule, graticuleLines } from "./graticule";
import { formatScale, latitudeAt, longitudeAt, mercatorX, mercatorY, scaleForZoom } from "./scale";

/** What an overlay may know about the page being made. */
export interface PrintContext {
  /** The ground on the page, and the zoom the map is drawn at for it. */
  bbox: Bbox;
  zoom: number;
  /** The map's colours, as the light theme has them: paper is always light. */
  theme: MapTheme;
  /** What is installed, as the server describes it. */
  sources: MapSources | undefined;
  regions: InstalledRegion[];
  /** Every saved place. */
  markers: MarkerDto[];
  /** Every route, and the lines of those that have been read so far. */
  tracks: TrackDto[];
  geometries: TrackWithGeometryDto[];
  /** The graticule's ticks, as the page's edge prints them. */
  graticule: Graticule;
  /** How the map on screen is set: where the page starts from. */
  live: { hillshade: boolean; contours: boolean; hiddenTracks: readonly string[] };
}

/** The style of the off-screen map before it is built: overlays add to it. */
export interface PrintDraft {
  hillshade: boolean;
  contours: boolean;
  /** Names of places, roads and water on the basemap. */
  names: boolean;
  /** Data for the map's own overlay sources: saved places, routes. */
  data: Partial<Record<OverlaySource, FeatureCollection>>;
  /** Sources and layers of an overlay's own, drawn above everything else in the order added. */
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
}

export interface PrintOverlayPart {
  id: string;
  label: string;
  initially: boolean;
}

export interface PrintOverlay {
  id: string;
  label: string;
  /** A line under the name: what to expect of it on this page. */
  hint?: (context: PrintContext) => string | undefined;
  /** Why it cannot be drawn on this page. The tick box is then shown switched off with this beside it. */
  unavailable?: (context: PrintContext) => string | undefined;
  initially: (context: PrintContext) => boolean;
  /** Things inside it that can be ticked one at a time (each route, say). */
  parts?: (context: PrintContext) => PrintOverlayPart[];
  /** Switches it on in the off-screen map. `parts` holds the ids of the parts that are ticked. */
  apply: (draft: PrintDraft, context: PrintContext, parts: ReadonlySet<string>) => void;
  /** True when it is drawn from the installed terrain, which then has to be credited. */
  usesTerrain?: boolean;
}

const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const inside = (bbox: Bbox, lat: number, lon: number) => lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];

const terrainBoxes = (context: PrintContext) =>
  context.regions.filter((region) => region.tileType === "terrain" && readable(region)).map((region) => region.bounds);

/** Why nothing can be drawn from terrain on this page, if that is so. */
function noTerrain(context: PrintContext): string | undefined {
  const reach = contourReach({ bounds: context.bbox, zoom: Math.max(context.zoom, CONTOUR_MIN_ZOOM) }, terrainBoxes(context));
  if (reach === "no-terrain") return "No terrain is downloaded, so there is nothing to draw this from.";
  if (reach === "no-terrain-here") return "No terrain is downloaded for this area.";
  return undefined;
}

const tracksHere = (context: PrintContext) => context.tracks.filter((track) => track.bounds && overlaps(track.bounds, context.bbox));
const markersHere = (context: PrintContext) => context.markers.filter((marker) => inside(context.bbox, marker.lat, marker.lon));

const GRATICULE_SOURCE = "print-graticule";

export const PRINT_OVERLAYS: PrintOverlay[] = [
  {
    id: "names",
    label: "Names of places, roads and water",
    initially: () => true,
    apply: (draft) => {
      draft.names = true;
    },
  },
  {
    id: "contours",
    label: "Contour lines",
    usesTerrain: true,
    unavailable: (context) => {
      const missing = noTerrain(context);
      if (missing) return missing;
      if (Math.floor(context.zoom) >= CONTOUR_MIN_ZOOM) return undefined;
      const middle = (context.bbox[1] + context.bbox[3]) / 2;
      return `Not drawn at this scale: there would be too many to read. They appear from about ${formatScale(scaleForZoom(CONTOUR_MIN_ZOOM, middle))}.`;
    },
    hint: (context) => {
      const spacing = contourInterval(Math.floor(context.zoom));
      return spacing
        ? `Every ${spacing.interval} m, heavier and with its height every ${spacing.index} m. Drawn wherever terrain is downloaded.`
        : undefined;
    },
    initially: (context) => context.live.contours,
    apply: (draft) => {
      draft.contours = true;
    },
  },
  {
    id: "hillshade",
    label: "Hill shading",
    usesTerrain: true,
    unavailable: noTerrain,
    initially: (context) => context.live.hillshade,
    apply: (draft) => {
      draft.hillshade = true;
    },
  },
  {
    id: "routes",
    label: "Routes and tracks",
    unavailable: (context) =>
      context.tracks.length === 0
        ? "You have no routes yet."
        : tracksHere(context).length === 0
          ? "None of your routes crosses this area."
          : undefined,
    initially: (context) => tracksHere(context).some((track) => !context.live.hiddenTracks.includes(track.id)),
    // The routes showing on the map start ticked; one that is hidden there can still be added to the page.
    parts: (context) =>
      tracksHere(context).map((track) => ({ id: track.id, label: track.name, initially: !context.live.hiddenTracks.includes(track.id) })),
    apply: (draft, context, parts) => {
      const drawn = context.geometries
        .filter((geometry) => parts.has(geometry.id))
        // Name and colour from the list, which is the newer of the two after a rename.
        .map((geometry) => ({ ...geometry, ...(context.tracks.find((track) => track.id === geometry.id) ?? {}) }));
      const data = tracksData(drawn, null);
      draft.data["o-tracks"] = data.lines;
      draft.data["o-track-ends"] = data.ends;
    },
  },
  {
    id: "places",
    label: "Saved places",
    unavailable: (context) =>
      context.markers.length === 0
        ? "You have no saved places yet."
        : markersHere(context).length === 0
          ? "None of your saved places is in this area."
          : undefined,
    hint: (context) => `${plural(markersHere(context).length, "place")} in this area.`,
    initially: () => true,
    apply: (draft, context) => {
      draft.data["o-markers"] = markersData(markersHere(context), null);
    },
  },
  {
    id: "graticule",
    label: "Lines of latitude and longitude",
    hint: () => "Thin lines across the map, joining the figures printed round its edge. The figures are printed either way.",
    initially: () => false,
    apply: (draft, context) => {
      draft.sources[GRATICULE_SOURCE] = { type: "geojson", data: graticuleLines(context.bbox, context.graticule) as never };
      draft.layers.push({
        id: GRATICULE_SOURCE,
        type: "line",
        source: GRATICULE_SOURCE,
        paint: { "line-color": context.theme.ink, "line-width": 0.6, "line-opacity": 0.5 },
      });
    },
  },
];

/** What is ticked: each overlay by id, and under it any parts whose tick differs from how they started. */
export interface PrintSelection {
  overlays: Record<string, boolean>;
  parts: Record<string, Record<string, boolean>>;
}

/** Whether an overlay is on: ticked (or left as it started) and able to be drawn here. */
export function overlayOn(overlay: PrintOverlay, context: PrintContext, selection: PrintSelection): boolean {
  if (overlay.unavailable?.(context)) return false;
  return selection.overlays[overlay.id] ?? overlay.initially(context);
}

/** The parts of an overlay that are ticked. */
export function partsOn(overlay: PrintOverlay, context: PrintContext, selection: PrintSelection): Set<string> {
  const chosen = selection.parts[overlay.id] ?? {};
  return new Set((overlay.parts?.(context) ?? []).filter((part) => chosen[part.id] ?? part.initially).map((part) => part.id));
}

const EDGE_SOURCE = "print-edge";

/**
 * Keeps names whole. MapLibre will happily draw a name that runs off the edge of the
 * picture, and on paper that is a word cut in half at the border. So the border is
 * lined, just outside the map, with a row of invisible marks that are placed before
 * anything else: a name that would cross the border collides with them and is left
 * out, as it would be if another name were in its way. Only the outside of the page is
 * lined, never the joins between pieces.
 */
function edgeGuard(bbox: Bbox, zoom: number): { source: SourceSpecification; layer: LayerSpecification } {
  const world = 512 * 2 ** zoom;
  const left = mercatorX(bbox[0]) * world;
  const right = mercatorX(bbox[2]) * world;
  const top = mercatorY(bbox[3]) * world;
  const bottom = mercatorY(bbox[1]) * world;
  // Each mark keeps clear a box about 24 px wide and 33 px high around itself; set this far out, the box
  // reaches a pixel or two inside the border and no further.
  const [aside, above, apart] = [11, 15, 12];
  const points: Array<[number, number]> = [];
  for (let x = left - aside; x <= right + aside + apart; x += apart) points.push([x, top - above], [x, bottom + above]);
  for (let y = top; y <= bottom + apart; y += apart) points.push([left - aside, y], [right + aside, y]);
  return {
    source: {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: points.map(([x, y]) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [longitudeAt(x / world), latitudeAt(y / world)] },
        })),
      } as never,
    },
    layer: {
      id: EDGE_SOURCE,
      type: "symbol",
      source: EDGE_SOURCE,
      layout: {
        "text-field": "0",
        "text-font": [MAP_FONTS.regular],
        "text-size": 14,
        "text-padding": 8,
        // Every mark is placed, whatever is near it, and everything placed after it has to keep clear.
        "text-allow-overlap": true,
        "text-ignore-placement": false,
      },
      paint: { "text-opacity": 0 },
    },
  };
}

export interface PrintStyle {
  style: StyleSpecification;
  /** Whether anything on the page is drawn from the installed terrain. */
  usesTerrain: boolean;
}

/**
 * The style of the off-screen map for a page: the light basemap, with whatever is
 * ticked switched on. `origin` and `cacheKey` are the ones the map on screen uses.
 */
export function printStyle(
  context: PrintContext,
  selection: PrintSelection,
  overlays: PrintOverlay[],
  base: { origin: string; cacheKey: string },
): PrintStyle {
  const draft: PrintDraft = { hillshade: false, contours: false, names: false, data: {}, sources: {}, layers: [] };
  let usesTerrain = false;
  for (const overlay of overlays) {
    if (!overlayOn(overlay, context, selection)) continue;
    overlay.apply(draft, context, partsOn(overlay, context, selection));
    if (overlay.usesTerrain) usesTerrain = true;
  }
  const style = buildStyle({
    sources: context.sources,
    flavour: "light",
    theme: context.theme,
    hillshade: draft.hillshade,
    contours: draft.contours,
    origin: base.origin,
    cacheKey: base.cacheKey,
    overlays: {
      // Only saved places and routes are ever given data, so the measuring line, the download box and the rest stay empty.
      sources: { ...overlaySources(draft.data), ...draft.sources },
      layers: [...overlayLayers(context.theme), ...draft.layers],
    },
  });
  if (!draft.names) {
    const named: string[] = [SOURCE_IDS.basemap, SOURCE_IDS.countryLabels];
    style.layers = style.layers.filter((layer) => !(layer.type === "symbol" && named.includes(layer.source)));
  }
  // Last, so above everything: MapLibre places names from the top layer down.
  const edge = edgeGuard(context.bbox, context.zoom);
  style.sources[EDGE_SOURCE] = edge.source;
  style.layers.push(edge.layer);
  return { style, usesTerrain: usesTerrain && Boolean(context.sources?.hasTerrain) };
}

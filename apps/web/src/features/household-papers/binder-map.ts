/**
 * The binder's map page: home and every meeting point, numbered, on the offline map
 * drawn again off screen for paper (the same off-screen map as a printed map page and the
 * nuclear PDF, features/maps/print/export.ts), with a frame, a scale bar, north and the
 * map's credit. The numbers match the list of places with their grid references that
 * follows on the page.
 *
 * Where no offline map covers the area, or this device cannot draw it, the page is made
 * all the same: the places to scale in an empty frame, with a line saying why there is no
 * map and how to get one. Nothing is fetched from anywhere: the map is what is installed.
 */
import type { Bbox, InstalledRegion, MapSources } from "@outpost/shared";
import { FALLBACK_THEME } from "@/features/maps/lib/palette";
import { buildStyle } from "@/features/maps/lib/style";
import type { StyleSpecification } from "@/features/maps/lib/style-types";
import { creditsFor } from "@/features/maps/map-footer";
import { mapCoverage } from "@/features/maps/print/coverage";
import { printedCredits } from "@/features/maps/print/credits";
import { PAPERS, PT_PER_MAP_PX } from "@/features/maps/print/paper";
import type { PdfPicture } from "@/features/maps/print/pdf";
import type { Frame, PixelSize } from "@/features/maps/print/scale";
import { mercatorX, mercatorY } from "@/features/maps/print/scale";
import { INK, type SheetItem } from "@/features/maps/print/sheet";
import { GET_A_MAP, type MapFigure, mapFigureBlock } from "@/features/nuclear/print-figures";
import { frameFor, pictureSize } from "@/features/nuclear/print-frames";
import type { DrawMap } from "@/features/nuclear/print-maps";
import type { Block } from "@/features/propagation/plans/document";
import { errorMessage } from "@/lib/api";
import type { BinderPlace } from "./binder-places";

/** What the map is drawn from: what is installed, as the Maps screen reads it. */
export interface BinderMapInput {
  sources: MapSources | undefined;
  regions: InstalledRegion[];
  cacheKey: string;
  origin: string;
}

export interface BinderMap {
  block: Block;
  pictures: Map<string, PdfPicture>;
  /** Why there is no map under the places, when there is none. */
  missing: string | null;
}

/** About a kilometre each way: the least the map shows round a single place. */
const LEAST_SPAN_DEGREES = 0.01;
const MAX_HEIGHT = 420;
const PAGE_MARGIN = 42;
const PRINT_DPI = 150;

/** The ground the page shows: every place, with a margin, and never less than about two kilometres across. */
export function placesBbox(places: readonly BinderPlace[]): Bbox {
  const lats = places.map((place) => place.lat);
  const lons = places.map((place) => place.lon);
  let [west, east, south, north] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const padLat = Math.max((north - south) * 0.15, LEAST_SPAN_DEGREES);
  const padLon = Math.max((east - west) * 0.15, LEAST_SPAN_DEGREES / Math.max(0.2, Math.cos((((north + south) / 2) * Math.PI) / 180)));
  [west, east, south, north] = [west - padLon, east + padLon, Math.max(-85, south - padLat), Math.min(85, north + padLat)];
  return [west, south, east, north];
}

/** The map's style: the light basemap, since paper is light, and nothing over it; the places are lettered on the page. */
function placesStyle(input: BinderMapInput): StyleSpecification {
  return buildStyle({
    sources: input.sources,
    flavour: "light",
    theme: FALLBACK_THEME.light,
    hillshade: false,
    contours: false,
    origin: input.origin,
    cacheKey: input.cacheKey,
  });
}

const drawWithMapLibre: DrawMap = async (style, frame, pixels, signal) => {
  const { deviceLimits, drawPage, PrintMap } = await import("@/features/maps/print/export");
  const drawn = await drawPage(
    (first, maxSide) => PrintMap.create(style, first, maxSide),
    frame,
    pixels,
    PRINT_DPI,
    deviceLimits(),
    undefined,
    signal,
  );
  const pieces = [];
  for (const picture of drawn.pictures) pieces.push({ ...picture, jpeg: new Uint8Array(await picture.blob.arrayBuffer()) });
  return { pieces, reduced: drawn.plan.reduced };
};

/** Each place as a numbered disc where it lies in the frame. */
function marks(places: readonly BinderPlace[], frame: Frame, size: { width: number; height: number }, x: number, y: number): SheetItem[] {
  const world = 512 * 2 ** frame.zoom * PT_PER_MAP_PX;
  const items: SheetItem[] = [];
  for (const place of places) {
    const px = x + size.width / 2 + (mercatorX(place.lon) - mercatorX(frame.center.lon)) * world;
    const py = y + size.height / 2 + (mercatorY(place.lat) - mercatorY(frame.center.lat)) * world;
    items.push(
      {
        kind: "rect",
        x: px - 6.5,
        y: py - 6.5,
        width: 13,
        height: 13,
        fill: place.role === "Home" ? INK : [1, 1, 1],
        stroke: INK,
        lineWidth: 1.2,
      },
      {
        kind: "text",
        x: px,
        y: py + 3,
        text: String(place.number),
        size: 7.5,
        bold: true,
        color: place.role === "Home" ? [1, 1, 1] : INK,
        anchor: "middle",
      },
    );
  }
  return items;
}

/**
 * The map block for the places, and the pictures it needs. `draw` is the off-screen map
 * in the browser; tests give their own.
 */
export async function binderMap(
  places: readonly BinderPlace[],
  input: BinderMapInput,
  paper: "a4" | "letter",
  options: { draw?: DrawMap; signal?: AbortSignal } = {},
): Promise<BinderMap | null> {
  if (places.length === 0) return null;
  const inner = PAPERS[paper].width - 2 * PAGE_MARGIN;
  const bbox = placesBbox(places);
  const size = pictureSize(bbox, inner, MAX_HEIGHT);
  const frame = frameFor(bbox, size.pixels as PixelSize);
  const attributions = input.sources?.attributions ?? [];
  const hasTiles = input.sources?.hasTiles ?? false;
  const covered = mapCoverage(bbox, input.regions, frame.zoom);
  const pictures = new Map<string, PdfPicture>();
  const figure: MapFigure = { part: "overview", width: size.width, height: size.height, frame, pieces: [], captions: [] };
  let missing: string | null = null;

  if (!hasTiles || covered.none > 0.995) missing = `No map under the places: no offline map region covers this area. ${GET_A_MAP}`;
  else {
    try {
      const drawn = await (options.draw ?? drawWithMapLibre)(placesStyle(input), frame, size.pixels, options.signal);
      const scale = size.width / size.pixels.width;
      drawn.pieces.forEach((piece, index) => {
        const id = `binder-map-${index + 1}`;
        pictures.set(id, { jpeg: piece.jpeg, width: piece.pixels.width, height: piece.pixels.height });
        figure.pieces.push({ id, x: piece.x * scale, y: piece.y * scale, width: piece.width * scale, height: piece.height * scale });
      });
      figure.captions.push(printedCredits(creditsFor(attributions, { hasTiles, terrain: false }), attributions));
      if (covered.none >= 0.02)
        figure.captions.push(
          `About ${Math.max(1, Math.round(covered.none * 100))}% of this map's area has no offline map installed and shows only coastlines and borders.`,
        );
    } catch (error) {
      if (options.signal?.aborted) throw error;
      missing = `No map under the places: this device could not draw it (${errorMessage(error).replace(/\.$/, "")}). Made on a computer, the binder may have it.`;
    }
  }
  figure.captions.push(missing ? `${missing} The places are drawn to scale without one.` : "Numbers as in the list below.");
  const block = mapFigureBlock(figure, inner);
  if (block.kind !== "drawing") return { block, pictures, missing };
  return {
    block: {
      ...block,
      words: `${block.words ?? ""} ${places.map((place) => `${place.number}: ${place.role}, ${place.name}.`).join(" ")}`.trim(),
      draw: (x, y, width) => [...block.draw(x, y, width), ...marks(places, frame, size, x, y)],
    },
    pictures,
    missing,
  };
}

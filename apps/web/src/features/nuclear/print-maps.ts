/**
 * Draws the maps of a scenario's PDF and puts the file together. Loaded only when a PDF
 * with maps is asked for, since it brings the map library with it.
 *
 * Each picture is the offline map drawn again off screen for paper, by the same
 * off-screen map as a printed map page and the HF coverage PDF (features/maps/print/
 * export.ts): the light basemap, since paper is light, and over it only what the
 * workspace draws for the scenario (its rings, its fallout pattern, its ground zero and
 * letter, in the light theme's effect hues, casings and dashes) and, only if the person
 * ticked it, their saved places.
 *
 * The reference layers are never drawn here. They are not joined to scenarios anywhere
 * in the module, and a page of rings over named facilities is the picture the module's
 * rules exist to prevent (docs/nuclear-preparedness.md). The style is built from the
 * nuclear layers and the places' layers alone, so nothing else can be in it.
 *
 * Where a map cannot be drawn (no offline region covers the area, or the device cannot
 * draw it), the PDF is made all the same: the rings to scale with no map under them, and
 * a line saying why there is no map and how to get one.
 */
import type { Bbox, InstalledRegion, MapSources, MarkerDto, ScenarioLetter } from "@outpost/shared";
import { FALLBACK_THEME } from "@/features/maps/lib/palette";
import { buildStyle } from "@/features/maps/lib/style";
import type { StyleSpecification } from "@/features/maps/lib/style-types";
import { type FeatureCollection, markersData, overlayLayers } from "@/features/maps/map/overlays";
import { creditsFor } from "@/features/maps/map-footer";
import { mapCoverage, readable } from "@/features/maps/print/coverage";
import { printedCredits } from "@/features/maps/print/credits";
import type { PdfPicture } from "@/features/maps/print/pdf";
import type { RasterLimits } from "@/features/maps/print/pieces";
import type { Frame, PixelSize } from "@/features/maps/print/scale";
import type { Block } from "@/features/propagation/plans/document";
import { errorMessage } from "@/lib/api";
import { appLocale } from "@/lib/region";
import { type ScenarioFigures, scenarioPdf, type Written } from "./document";
import { ALL_VISIBLE, NUCLEAR_SOURCE, nuclearData, nuclearLayers } from "./layers";
import { diagramBlock, GET_A_MAP, type MapFigure, mapCaptions, mapFigureBlock } from "./print-figures";
import {
  frameFor,
  MAX_OVERVIEW_HEIGHT,
  MAX_PICTURE_HEIGHT,
  overviewFrame,
  type PrintFrame,
  pictureSize,
  scenarioFrames,
} from "./print-frames";

/** The margin `toSheets` leaves on each side of the page, in points. */
const PAGE_MARGIN = 42;
const PAPER_WIDTH = { a4: 595.28, letter: 612 } as const;
/** Device pixels to the inch: the coverage PDF's. The map's own lines and names are drawn at 1.25 device pixels to each of its pixels. */
export const PRINT_DPI = 150;
const MARKERS_SOURCE = "o-markers";

/** One piece of a drawn map: where it goes in the map's own pixels, and the JPEG. */
export interface DrawnPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: PixelSize;
  jpeg: Uint8Array;
}
export interface DrawnMap {
  pieces: DrawnPiece[];
  /** Whether the device could draw it only at a lower resolution than asked. */
  reduced: boolean;
}
/** Draws one map. The PDF's own uses the off-screen map; tests give their own. */
export type DrawMap = (style: StyleSpecification, frame: Frame, pixels: PixelSize, signal?: AbortSignal) => Promise<DrawnMap>;

/** The off-screen map, loaded when it is first needed. */
const drawWithMapLibre =
  (limits?: RasterLimits): DrawMap =>
  async (style, frame, pixels, signal) => {
    const { deviceLimits, drawPage, PrintMap } = await import("@/features/maps/print/export");
    const drawn = await drawPage(
      (first, maxSide) => PrintMap.create(style, first, maxSide),
      frame,
      pixels,
      PRINT_DPI,
      limits ?? deviceLimits(),
      undefined,
      signal,
    );
    const pieces: DrawnPiece[] = [];
    for (const picture of drawn.pictures) pieces.push({ ...picture, jpeg: new Uint8Array(await picture.blob.arrayBuffer()) });
    return { pieces, reduced: drawn.plan.reduced };
  };

/** The style a map of the PDF is drawn with: the light basemap, the scenario's drawing, and the saved places only if asked for. */
export function printMapStyle(input: {
  sources: MapSources | undefined;
  origin: string;
  cacheKey: string;
  nuclear: FeatureCollection;
  places: MarkerDto[] | null;
}): StyleSpecification {
  const theme = FALLBACK_THEME.light;
  const geojson = (data: FeatureCollection) => ({ type: "geojson" as const, data: data as never });
  return buildStyle({
    sources: input.sources,
    flavour: "light",
    theme,
    hillshade: false,
    contours: false,
    origin: input.origin,
    cacheKey: input.cacheKey,
    overlays: {
      sources: {
        [NUCLEAR_SOURCE]: geojson(input.nuclear),
        ...(input.places ? { [MARKERS_SOURCE]: geojson(markersData(input.places, null)) } : {}),
      },
      layers: [
        ...nuclearLayers(theme),
        ...(input.places ? overlayLayers(theme).filter((layer) => "source" in layer && layer.source === MARKERS_SOURCE) : []),
      ],
    },
  });
}

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The days the installed map's data was built on, for the regions that reach a box: "3 March 2026". Null where none says. */
export function mapDataDate(bbox: Bbox, regions: InstalledRegion[]): string | null {
  const days = new Set<string>();
  for (const region of regions) {
    if (region.tileType !== "vector" || !readable(region) || !region.sourceBuild || !/^\d{8}$/.test(region.sourceBuild)) continue;
    const [west, south, east, north] = region.bounds;
    if (west >= bbox[2] || east <= bbox[0] || south >= bbox[3] || north <= bbox[1]) continue;
    const day = region.sourceBuild;
    days.add(longDate.format(new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8))))));
  }
  return days.size === 0 ? null : [...days].join(" and ");
}

export interface ScenarioPdfInput {
  /** The scenarios shown on the map, hidden ones already left out. */
  written: Written[];
  dated: number;
  paper: "a4" | "letter";
  sources: MapSources | undefined;
  regions: InstalledRegion[];
  cacheKey: string;
  origin: string;
  /** The saved places to draw, or null when the person did not choose to show them. */
  places: MarkerDto[] | null;
  signal?: AbortSignal;
  /** Told in words what is being drawn ("Drawing the map for A"), and which map of how many it is. */
  onProgress?: (words: string, step: number, of: number) => void;
  draw?: DrawMap;
  limits?: RasterLimits;
}

export interface ScenarioPdfFile {
  bytes: Uint8Array;
  pages: number;
  /** How many maps were drawn, and in how many pieces. */
  maps: number;
  pieces: number;
  /** Whether any map was drawn at a lower resolution than asked. */
  reduced: boolean;
  /** One sentence for each map that could not be drawn, as the page says it. */
  missing: string[];
  /** The blocks the pages were made from, for tests. */
  figures: ScenarioFigures;
}

/** What the page says in place of a map, and why. */
type Missing = { why: "no-region" } | { why: "device"; message: string };

function missingLine(missing: Missing, what: string): string {
  return missing.why === "no-region"
    ? `No map of ${what}: no offline map region covers this area. ${GET_A_MAP}`
    : `No map of ${what}: this device could not draw it (${missing.message.replace(/\.$/, "")}). Made on a computer, or with maps for fewer scenarios at once, the PDF may have it.`;
}

export async function makeScenarioPdf(input: ScenarioPdfInput): Promise<ScenarioPdfFile> {
  const { written, signal } = input;
  const draw = input.draw ?? drawWithMapLibre(input.limits);
  const inner = PAPER_WIDTH[input.paper] - 2 * PAGE_MARGIN;
  const attributions = input.sources?.attributions ?? [];
  const hasTiles = input.sources?.hasTiles ?? false;
  const credits = printedCredits(creditsFor(attributions, { hasTiles, terrain: false }), attributions);
  const pictures = new Map<string, PdfPicture>();
  const missing: string[] = [];
  let maps = 0;
  let pieces = 0;
  let reduced = false;

  /** Draws one frame, or says why it cannot be. */
  const drawFrame = async (
    tag: string,
    frame: PrintFrame,
    nuclear: FeatureCollection,
    maxHeight: number,
    caption: (coverage: string | null, dataDate: string | null) => string[],
  ): Promise<MapFigure | Missing> => {
    const size = pictureSize(frame.bbox, inner, maxHeight);
    const view = frameFor(frame.bbox, size.pixels);
    const covered = mapCoverage(frame.bbox, input.regions, view.zoom);
    if (!hasTiles || covered.none > 0.995) return { why: "no-region" };
    try {
      const style = printMapStyle({
        sources: input.sources,
        origin: input.origin,
        cacheKey: input.cacheKey,
        nuclear,
        places: input.places,
      });
      const drawn = await draw(style, view, size.pixels, signal);
      const scale = size.width / size.pixels.width;
      const figure: MapFigure = {
        part: frame.part,
        width: size.width,
        height: size.height,
        frame: view,
        pieces: [],
        captions: caption(
          covered.none >= 0.02
            ? `About ${Math.max(1, Math.round(covered.none * 100))}% of this map's area has no offline map installed and shows only coastlines and borders. ${GET_A_MAP}`
            : null,
          mapDataDate(frame.bbox, input.regions),
        ),
      };
      drawn.pieces.forEach((piece, index) => {
        const id = `${tag}-${index + 1}`;
        pictures.set(id, { jpeg: piece.jpeg, width: piece.pixels.width, height: piece.pixels.height });
        figure.pieces.push({ id, x: piece.x * scale, y: piece.y * scale, width: piece.width * scale, height: piece.height * scale });
      });
      maps += 1;
      pieces += drawn.pieces.length;
      reduced ||= drawn.reduced;
      return figure;
    } catch (error) {
      if (signal?.aborted) throw error;
      return { why: "device", message: errorMessage(error) };
    }
  };
  const isMissing = (value: MapFigure | Missing): value is Missing => "why" in value;

  const figures: ScenarioFigures = { overview: [], maps: {} };
  const letters = written.map((item) => item.letter);
  const framesOf = new Map(written.map((item) => [item.letter, scenarioFrames(item.result, item.scenario)]));
  const total = (written.length > 1 ? 1 : 0) + [...framesOf.values()].reduce((sum, frames) => sum + frames.length, 0);
  let step = 0;
  const progress = (words: string) => {
    step += 1;
    input.onProgress?.(words, step, total);
  };
  const placesOn = input.places !== null && input.places.length > 0;

  if (written.length > 1) {
    progress("Drawing the map of all the scenarios");
    // Every scenario at full strength and none filled, so that where two overlap nothing is shaded as if they were one.
    const together = nuclearData(
      written.map((item) => ({ letter: item.letter, at: item.scenario, result: item.result, selected: true })),
      ALL_VISIBLE,
    );
    together.features = together.features.filter((feature) => feature.properties.kind !== "zone");
    const frame = overviewFrame(written.map((item) => ({ result: item.result, at: item.scenario })));
    const drawn = await drawFrame("overview", frame, together, MAX_OVERVIEW_HEIGHT, (coverage, dataDate) =>
      mapCaptions({
        part: "overview",
        letters,
        reachesRate: null,
        pattern: written.some((item) => item.result.fallout.drawn),
        patternRunsOn: false,
        places: placesOn,
        credits,
        dataDate,
        coverage,
      }),
    );
    if (isMissing(drawn)) {
      const line = missingLine(drawn, "all the scenarios together");
      missing.push(line);
      figures.overview.push({ kind: "para", text: `${line} Each scenario has its own map, or its rings drawn to scale, below.` });
    } else figures.overview.push(mapFigureBlock(drawn, inner));
  }

  for (const item of written) {
    const own = nuclearData([{ letter: item.letter, at: item.scenario, result: item.result, selected: true }], ALL_VISIBLE);
    const frames = framesOf.get(item.letter)!;
    const blocks: Block[] = [];
    for (const [index, frame] of frames.entries()) {
      progress(frame.part === "pattern" ? `Drawing the map of ${item.letter}'s fallout pattern` : `Drawing the map for ${item.letter}`);
      const drawn = await drawFrame(`${item.letter}-${frame.part}`, frame, own, MAX_PICTURE_HEIGHT, (coverage, dataDate) =>
        mapCaptions({
          part: frame.part,
          letters: [item.letter as ScenarioLetter],
          reachesRate: frame.reachesRate,
          pattern: item.result.fallout.drawn,
          patternRunsOn: frame.part === "rings" && frames.length > 1,
          places: placesOn,
          credits,
          dataDate,
          coverage,
        }),
      );
      if (!isMissing(drawn)) {
        blocks.push(mapFigureBlock(drawn, inner));
        continue;
      }
      if (index === 0) {
        // No map at all for this scenario: its rings to scale in the map's place, and the reason.
        const line = missingLine(drawn, item.letter);
        missing.push(line);
        blocks.push(
          { kind: "para", text: `${line} The rings are drawn to scale without a map instead.` },
          diagramBlock(item.letter, item.result),
        );
        break;
      }
      const line = missingLine(drawn, `${item.letter}'s fallout pattern`);
      missing.push(line);
      blocks.push({ kind: "para", text: `${line} The table below gives how far each contour reaches.` });
    }
    figures.maps[item.letter] = blocks;
  }

  if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
  input.onProgress?.("Putting the PDF together", total, total);
  const file = scenarioPdf(written, input.dated, input.paper, figures, pictures);
  return { bytes: file.bytes, pages: file.pages, maps, pieces, reduced, missing, figures };
}

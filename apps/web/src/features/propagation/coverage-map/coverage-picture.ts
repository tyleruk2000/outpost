/**
 * Draws the coverage map for its PDF and puts the file together. Loaded when a PDF is
 * first asked for, since it brings the map library with it.
 *
 * The picture is the map the screen shows, drawn again off screen for paper: the light
 * basemap, the cells in the light theme's shades, the edge of the area and the
 * transmitter. It is drawn by the same off-screen map as a printed map page
 * (features/maps/print/export.ts), which waits until every tile and name is in and says
 * so when a device cannot draw it.
 */
import type { CoverageQuantity, CoverageResult, MapSources } from "@outpost/shared";
import { FALLBACK_THEME } from "@/features/maps/lib/palette";
import { buildStyle } from "@/features/maps/lib/style";
import { overlayLayers, overlaySources } from "@/features/maps/map/overlays";
import { deviceLimits, drawPage, PrintMap } from "@/features/maps/print/export";
import { MAP_PX_STEP, PAPERS, PT_PER_MAP_PX } from "@/features/maps/print/paper";
import { type PdfPicture, writePdfPages } from "@/features/maps/print/pdf";
import { frameOfBox } from "@/features/maps/print/scale";
import { errorMessage } from "@/lib/api";
import { coverageFeatures, PROPAGATION_SOURCE } from "../map/layers";
import { toSheets } from "../plans/document";
import type { PredictionPaper } from "../prediction-document";
import { coverageDocument, coverageFooter, coverageTitle, gridBox, type MapPictureBox, mapBox, PAPER_SHADES } from "./coverage-document";

/** The margin `toSheets` leaves on each side of the page, in points. */
const PAGE_MARGIN = 42;

export interface CoveragePdf {
  bytes: Uint8Array;
  pages: number;
  /** Why the page has no picture of the map, when it has none. The grid in figures is there all the same. */
  pictureProblem: string | null;
}

export async function makeCoveragePdf(input: {
  result: CoverageResult;
  quantity: CoverageQuantity;
  utcHour: number;
  paper: PredictionPaper;
  /** What is installed, and the key that changes when it does: the same as the map on screen is given. */
  sources: MapSources | undefined;
  cacheKey: string;
  signal?: AbortSignal;
}): Promise<CoveragePdf> {
  const { result, quantity, utcHour, paper } = input;
  const box = mapBox(result, PAPERS[paper].width - 2 * PAGE_MARGIN);
  const held = new Map<string, PdfPicture>();
  let picture: MapPictureBox | null = null;
  let pictureProblem: string | null = null;
  try {
    // The map's own pixels, in the whole steps the off-screen map draws without losing a row.
    const whole = (points: number) => Math.max(MAP_PX_STEP, Math.round(points / PT_PER_MAP_PX / MAP_PX_STEP) * MAP_PX_STEP);
    const pixels = { width: whole(box.width), height: whole(box.height) };
    const frame = frameOfBox(gridBox(result), pixels);
    const theme = FALLBACK_THEME.light;
    const style = buildStyle({
      sources: input.sources,
      flavour: "light",
      theme,
      hillshade: false,
      contours: false,
      origin: window.location.origin,
      cacheKey: input.cacheKey,
      overlays: {
        sources: overlaySources({
          [PROPAGATION_SOURCE]: coverageFeatures(result, { quantity, utcHour, shades: [...PAPER_SHADES], selected: null }),
        }),
        layers: overlayLayers(theme),
      },
    });
    const drawn = await drawPage(
      (first, maxSide) => PrintMap.create(style, first, maxSide),
      frame,
      pixels,
      150,
      deviceLimits(),
      undefined,
      input.signal,
    );
    const scale = { x: box.width / pixels.width, y: box.height / pixels.height };
    picture = { ...box, pieces: [] };
    for (const piece of drawn.pictures) {
      held.set(piece.id, { jpeg: new Uint8Array(await piece.blob.arrayBuffer()), width: piece.pixels.width, height: piece.pixels.height });
      picture.pieces.push({
        id: piece.id,
        x: piece.x * scale.x,
        y: piece.y * scale.y,
        width: piece.width * scale.x,
        height: piece.height * scale.y,
      });
    }
  } catch (error) {
    if (input.signal?.aborted) throw error;
    // A page without its picture is still every figure of the map; it says why the picture is missing.
    picture = null;
    held.clear();
    pictureProblem = errorMessage(error);
  }
  const pages = toSheets(coverageDocument(result, quantity, utcHour, picture), coverageFooter(result), paper);
  return {
    // Dated by when the engine answered, as the prediction's pages are.
    bytes: writePdfPages({ pages, pictures: held, title: coverageTitle(result, quantity, utcHour), created: new Date(result.computedAt) }),
    pages: pages.length,
    pictureProblem,
  };
}

/**
 * Makes the page: draws the map off screen at the resolution paper needs, piece by
 * piece where it has to, and puts the pictures and the lettering into a PDF.
 *
 * Everything happens in this browser, from the map already installed. Nothing is sent
 * to the server and nothing is fetched from anywhere else; the file exists only as
 * bytes in the page until the person saves or shares it.
 */
import { PrintMap, PrintMapError, type PrintView } from "../map/print-map";
import { encodeWinAnsi } from "./helvetica";
import { PT_PER_INCH } from "./paper";
import { type PdfPicture, writePdf } from "./pdf";
import {
  type Piece,
  planRaster,
  type RasterLimits,
  type RasterPlan,
  type Resolution,
  SAFE_CANVAS_AREA,
  SAFE_CANVAS_SIDE,
  SMALL_DEVICE_CANVAS_AREA,
} from "./pieces";
import { type Frame, latitudeAt, longitudeAt, mercatorX, mercatorY, type PixelSize } from "./scale";
import type { Sheet, SheetItem, SheetText } from "./sheet";

/** JPEG quality for the map: high enough that at 300 to the inch the compression does not show, and far smaller than the same picture kept exactly. */
const JPEG_QUALITY = 0.92;

/**
 * What this device can draw at once. The longest side comes from the graphics hardware
 * and is never taken above 4,096; the area is the old iOS limit, or about a quarter of
 * it on a phone or tablet. See pieces.ts for where the figures come from.
 */
export function deviceLimits(): RasterLimits {
  let maxSide = SAFE_CANVAS_SIDE;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null;
      maxSide = Math.min(maxSide, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
      if (viewport) maxSide = Math.min(maxSide, viewport[0]!, viewport[1]!);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // Asked only to be careful; the limits below are safe without the answer.
  }
  // A finger as the main pointer: a phone or a tablet.
  const small = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return { maxSide, maxArea: small ? SMALL_DEVICE_CANVAS_AREA : SAFE_CANVAS_AREA };
}

/** The view that draws one piece of a frame: the piece with its bleed, centred where it lies on the ground. */
export function pieceView(frame: Frame, pixels: PixelSize, piece: Piece, pixelRatio: number): PrintView {
  const world = 512 * 2 ** frame.zoom;
  const left = mercatorX(frame.center.lon) * world - pixels.width / 2;
  const top = mercatorY(frame.center.lat) * world - pixels.height / 2;
  const width = piece.width + piece.bleed.left + piece.bleed.right;
  const height = piece.height + piece.bleed.top + piece.bleed.bottom;
  return {
    center: {
      lon: longitudeAt((left + piece.x - piece.bleed.left + width / 2) / world),
      lat: latitudeAt((top + piece.y - piece.bleed.top + height / 2) / world),
    },
    zoom: frame.zoom,
    width,
    height,
    pixelRatio,
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PrintMapError("too-large", "This device could not make a picture of the page."))),
      type,
      quality,
    );
  });
}

/**
 * The part of a drawn canvas that a piece keeps, as a JPEG. A canvas that is too large
 * for the device does not fail: it comes back transparent. That is checked for here, so
 * that a blank page is never made silently.
 */
async function capture(canvas: HTMLCanvasElement, crop: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const cut = document.createElement("canvas");
  cut.width = crop.width;
  cut.height = crop.height;
  const context = cut.getContext("2d", { alpha: true });
  if (!context) throw new PrintMapError("too-large", "This device could not make a picture of the page.");
  try {
    context.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    // The map paints every pixel, so one that is still transparent means nothing was drawn at all.
    const probes = [
      [0.5, 0.5],
      [0.1, 0.1],
      [0.9, 0.1],
      [0.1, 0.9],
      [0.9, 0.9],
    ] as const;
    const drawn = probes.some(([x, y]) => context.getImageData(Math.floor(crop.width * x), Math.floor(crop.height * y), 1, 1).data[3]! > 0);
    if (!drawn) throw new PrintMapError("too-large", "The page came out blank: it is larger than this device can draw.");
    return await toBlob(cut, "image/jpeg", JPEG_QUALITY);
  } finally {
    // Given back at once; phones count the memory of every canvas on a page together.
    cut.width = 0;
    cut.height = 0;
  }
}

export interface MapPicture {
  id: string;
  /** Where it goes in the map, in the map's own pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its size in device pixels, and the JPEG itself. */
  pixels: PixelSize;
  blob: Blob;
  /** The names written on this piece of the map, for the words that go into the file beside the picture (map-words.ts). */
  names: string[];
}

/** Draws every piece of a plan. `onPiece` is told as each is finished, for a progress bar that shows real progress. */
export async function drawPieces(
  map: PrintMap,
  frame: Frame,
  pixels: PixelSize,
  plan: Pick<RasterPlan, "pieces" | "pixelRatio">,
  onPiece?: (done: number, of: number) => void,
  signal?: AbortSignal,
): Promise<MapPicture[]> {
  const pictures: MapPicture[] = [];
  for (const [index, piece] of plan.pieces.entries()) {
    const canvas = await map.draw(pieceView(frame, pixels, piece, plan.pixelRatio), signal);
    const size = { width: piece.width * plan.pixelRatio, height: piece.height * plan.pixelRatio };
    const blob = await capture(canvas, { x: piece.bleed.left * plan.pixelRatio, y: piece.bleed.top * plan.pixelRatio, ...size });
    // Asked for while this piece is still what the map shows; the next one draws over it.
    const names = map.names();
    pictures.push({ id: `map-${index + 1}`, x: piece.x, y: piece.y, width: piece.width, height: piece.height, pixels: size, blob, names });
    onPiece?.(index + 1, plan.pieces.length);
  }
  return pictures;
}

/** The whole map as one small picture, one device pixel to each of the map's: what the preview shows. */
export const PREVIEW_PLAN = (pixels: PixelSize): Pick<RasterPlan, "pieces" | "pixelRatio"> => ({
  pixelRatio: 1,
  pieces: [{ x: 0, y: 0, width: pixels.width, height: pixels.height, bleed: { left: 0, top: 0, right: 0, bottom: 0 } }],
});

export interface DrawnPage {
  plan: RasterPlan;
  pictures: MapPicture[];
}

/**
 * Draws the map for the page at the resolution asked for. If the device turns out not
 * to manage that (it loses its graphics context, or hands back a blank or smaller
 * canvas), the next lower resolution is tried with a fresh map, and the plan returned
 * says so. `openMap` makes that map; the one it returns is closed again here.
 */
export async function drawPage(
  openMap: (first: PrintView, maxSide: number) => Promise<PrintMap>,
  frame: Frame,
  pixels: PixelSize,
  asked: Resolution,
  limits: RasterLimits,
  onPiece?: (done: number, of: number) => void,
  signal?: AbortSignal,
): Promise<DrawnPage> {
  let budget = limits;
  let failure: unknown;
  // Each attempt halves what is asked of the device.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const plan = planRaster(pixels, asked, budget);
    if (!plan) break;
    const map = await openMap(pieceView(frame, pixels, plan.pieces[0]!, plan.pixelRatio), limits.maxSide);
    try {
      const pictures = await drawPieces(map, frame, pixels, plan, onPiece, signal);
      return { plan: { ...plan, reduced: plan.dpi !== asked }, pictures };
    } catch (error) {
      failure = error;
      if (!(error instanceof PrintMapError) || (error.failure !== "context-lost" && error.failure !== "too-large")) throw error;
      const largest = Math.max(
        ...plan.pieces.map(
          (piece) => (piece.width + piece.bleed.left + piece.bleed.right) * (piece.height + piece.bleed.top + piece.bleed.bottom),
        ),
      );
      budget = { maxSide: budget.maxSide, maxArea: Math.floor((largest * plan.pixelRatio * plan.pixelRatio) / 2) };
    } finally {
      map.destroy();
    }
  }
  throw failure instanceof Error
    ? failure
    : new PrintMapError("too-large", "This device cannot draw a page of this size. Try a smaller paper size or the lower print quality.");
}

/** Lettering the PDF's typeface cannot write (see helvetica.ts), drawn as a small picture in the system's own type. */
async function letteringPicture(item: SheetText, id: string): Promise<{ item: SheetItem; picture: PdfPicture }> {
  const density = 300 / PT_PER_INCH;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not draw the title.");
  const font = `${item.bold ? "700" : "400"} ${item.size * density}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  context.font = font;
  const width = Math.max(1, Math.ceil(context.measureText(item.text).width));
  const height = Math.ceil(item.size * density * 1.5);
  const baseline = Math.round(item.size * density * 1.1);
  canvas.width = width;
  canvas.height = height;
  // The page is white, and a JPEG has no transparency.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.font = font;
  context.fillStyle = `rgb(${item.color.map((part) => Math.round(part * 255)).join(" ")})`;
  context.fillText(item.text, 0, baseline);
  const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.95)).arrayBuffer());
  canvas.width = 0;
  const points = { width: width / density, height: height / density };
  const x = item.anchor === "end" ? item.x - points.width : item.anchor === "middle" ? item.x - points.width / 2 : item.x;
  return {
    item: { kind: "image", id, x, y: item.y - baseline / density, ...points },
    picture: { jpeg, width, height },
  };
}

export interface PdfFile {
  blob: Blob;
  /** Lines of lettering that had to be drawn as pictures because the PDF's typeface lacks their characters. */
  drawnAsPictures: number;
}

/** Puts a sheet and the pictures of its map together as a PDF file. */
export async function assemblePdf(sheet: Sheet, pictures: MapPicture[], title: string, created: Date): Promise<PdfFile> {
  const held = new Map<string, PdfPicture>();
  for (const picture of pictures) {
    held.set(picture.id, {
      jpeg: new Uint8Array(await picture.blob.arrayBuffer()),
      width: picture.pixels.width,
      height: picture.pixels.height,
    });
  }
  const items: SheetItem[] = [];
  let drawnAsPictures = 0;
  for (const item of sheet.items) {
    // Upright lettering only: the figures down the side of the map are always plain.
    if (item.kind !== "text" || item.upward || encodeWinAnsi(item.text)) {
      items.push(item);
      continue;
    }
    drawnAsPictures += 1;
    const drawn = await letteringPicture(item, `lettering-${drawnAsPictures}`);
    held.set(`lettering-${drawnAsPictures}`, drawn.picture);
    items.push(drawn.item);
  }
  const bytes = writePdf({ sheet: { ...sheet, items }, pictures: held, title, created });
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), drawnAsPictures };
}

export { PrintMap, PrintMapError };

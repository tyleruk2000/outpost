/**
 * Turns a page of a PDF into a greyscale picture an OCR engine can read, without a
 * canvas and without native code.
 *
 * A scanned page is one or more pictures placed on the page: a photograph of the sheet,
 * strips of one, or a background with the ink laid over it as a one-bit mask. PDF.js
 * (through unpdf, which the text extractor already uses) decodes those pictures to raw
 * pixels and says where each one goes. This file does the rest: it follows the page's
 * drawing instructions far enough to know each picture's position, turn and order, and
 * paints them onto a white page of its own.
 *
 * Only pictures are painted. Text drawn as outlines, and anything else made of lines
 * and curves, is not: reading that would need a full PDF renderer.
 *
 * Runs only inside the OCR worker thread.
 */

import { getDocumentProxy, getResolvedPDFJS, registerImageDecoders } from "unpdf";
import { readRegularFile } from "../../core/fs-safe.ts";
import { MAX_PAGE_DPI, MAX_PAGE_PIXELS, MAX_SOURCE_PIXELS, OcrError } from "./types.ts";

/** A 2D transform as PDF writes it: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Applies `inner` first, then `outer`. */
function multiply(outer: Matrix, inner: ArrayLike<number>): Matrix {
  const [a, b, c, d, e, f] = outer;
  const a2 = inner[0] ?? 1;
  const b2 = inner[1] ?? 0;
  const c2 = inner[2] ?? 0;
  const d2 = inner[3] ?? 1;
  const e2 = inner[4] ?? 0;
  const f2 = inner[5] ?? 0;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}

const determinant = (m: Matrix) => m[0] * m[3] - m[1] * m[2];

/** Pixels as PDF.js hands them over. `kind` is one of its `ImageKind` values. */
interface DecodedImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}

interface Paint {
  image: DecodedImage;
  /** Maps the unit square the picture is drawn into onto the page, in points. */
  matrix: Matrix;
  /** A one-bit stencil: the fill colour goes wherever the stencil says. */
  mask: boolean;
  /** Greyscale value of the fill colour, for a mask. */
  ink: number;
}

interface GraphicsState {
  matrix: Matrix;
  ink: number;
}

/** PDF.js writes its image kinds as small integers; these are the three it produces. */
const KIND_GREY_1BPP = 1;
const KIND_RGB = 2;
const KIND_RGBA = 3;

const luminance = (r: number, g: number, b: number) => (r * 77 + g * 150 + b * 29) >> 8;

/** The fill colour as PDF.js records it: "#rrggbb", or three numbers from 0 to 255. */
function inkOf(args: unknown[]): number {
  const [first, second, third] = args;
  if (typeof first === "string" && /^#[0-9a-f]{6}$/i.test(first)) {
    const value = Number.parseInt(first.slice(1), 16);
    return luminance(value >> 16, (value >> 8) & 255, value & 255);
  }
  if (typeof first === "number" && typeof second === "number" && typeof third === "number") return luminance(first, second, third);
  return 0;
}

interface ObjectStore {
  get(id: string, callback: (value: unknown) => void): void;
}

interface PageLike {
  objs: ObjectStore;
  commonObjs: ObjectStore;
}

/** Longest wait for one picture to be decoded before the page goes on without it. */
const DECODE_TIMEOUT_MS = 120_000;

/**
 * A decoded picture by its id. PDF.js decodes pictures in the background and may hand
 * over the drawing instructions first, so this waits for it. It resolves to undefined
 * for a picture PDF.js could not decode.
 */
function lookUp(page: PageLike, id: string): Promise<DecodedImage | undefined> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), DECODE_TIMEOUT_MS);
    try {
      store.get(id, (value) => {
        clearTimeout(timer);
        resolve((value as DecodedImage | null) ?? undefined);
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

function usable(image: DecodedImage | undefined): image is DecodedImage & { data: Uint8Array | Uint8ClampedArray } {
  return Boolean(image?.data && image.width > 0 && image.height > 0 && image.width * image.height <= MAX_SOURCE_PIXELS);
}

/** Follows a page's drawing instructions and lists the pictures it paints, in order. */
async function collectPaints(
  page: PageLike,
  operators: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
  ops: Record<string, number>,
): Promise<Paint[]> {
  const paints: Paint[] = [];
  const stack: GraphicsState[] = [];
  let state: GraphicsState = { matrix: IDENTITY, ink: 0 };
  // The content of a soft mask only shapes transparency; it is not something to read.
  const softMasks: boolean[] = [];

  const add = (image: DecodedImage | undefined, matrix: Matrix, mask: boolean) => {
    if (usable(image)) paints.push({ image, matrix, mask, ink: state.ink });
  };
  /** A picture is named by id, or (small and inline ones) is the value itself. */
  const resolve = async (value: unknown): Promise<DecodedImage | undefined> => {
    if (typeof value === "string") return lookUp(page, value);
    const direct = value as (Omit<DecodedImage, "data"> & { data?: unknown }) | null | undefined;
    if (typeof direct?.data === "string") return lookUp(page, direct.data);
    return (direct as DecodedImage | null | undefined) ?? undefined;
  };

  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const fn = operators.fnArray[index];
    const args = (operators.argsArray[index] ?? []) as unknown[];
    if (fn === ops.save) stack.push(state);
    else if (fn === ops.restore || fn === ops.paintFormXObjectEnd) state = stack.pop() ?? state;
    else if (fn === ops.transform) state = { ...state, matrix: multiply(state.matrix, args as number[]) };
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(state);
      const formMatrix = args[0] as ArrayLike<number> | null | undefined;
      if (formMatrix) state = { ...state, matrix: multiply(state.matrix, formMatrix) };
    } else if (fn === ops.setFillRGBColor) state = { ...state, ink: inkOf(args) };
    else if (fn === ops.beginGroup) softMasks.push(Boolean((args[0] as { smask?: unknown } | undefined)?.smask));
    else if (fn === ops.endGroup) softMasks.pop();

    if (softMasks.includes(true)) continue;

    if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
      add(await resolve(args[0]), state.matrix, false);
    } else if (fn === ops.paintImageMaskXObject) {
      add(await resolve(args[0]), state.matrix, true);
    } else if (fn === ops.paintImageMaskXObjectGroup) {
      for (const entry of (args[0] as Array<{ transform: number[] }>) ?? []) {
        add(await resolve(entry), multiply(state.matrix, entry.transform), true);
      }
    } else if (fn === ops.paintImageXObjectRepeat) {
      const [id, scaleX, scaleY, positions] = args as [string, number, number, ArrayLike<number>];
      const image = await resolve(id);
      for (let at = 0; at + 1 < positions.length; at += 2) {
        add(image, multiply(state.matrix, [scaleX, 0, 0, scaleY, positions[at] ?? 0, positions[at + 1] ?? 0]), false);
      }
    }
  }
  return paints;
}

/**
 * Paints one picture onto the page. For each page pixel inside the picture's outline,
 * the matching source pixel is found by running the placement backwards; where the scan
 * is finer than the page, several source pixels are averaged so thin strokes survive.
 */
function paint(page: Uint8Array, pageWidth: number, pageHeight: number, toPage: Matrix, { image, mask, ink }: Paint): void {
  const det = determinant(toPage);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return;
  const { width, height } = image;
  const data = image.data as Uint8Array | Uint8ClampedArray;
  const kind = mask ? KIND_GREY_1BPP : image.kind;
  if (kind !== KIND_GREY_1BPP && kind !== KIND_RGB && kind !== KIND_RGBA) return;
  const rowBytes = (width + 7) >> 3;
  const needed = kind === KIND_GREY_1BPP ? rowBytes * height : width * height * (kind === KIND_RGB ? 3 : 4);
  if (data.length < needed) return;

  // Page pixel → position in the unit square.
  const [a, b, c, d, e, f] = toPage;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  const ie = (c * f - d * e) / det;
  const iff = (b * e - a * f) / det;

  const xs = [e, a + e, c + e, a + c + e];
  const ys = [f, b + f, d + f, b + d + f];
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(pageWidth, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(pageHeight, Math.ceil(Math.max(...ys)));
  if (x0 >= x1 || y0 >= y1) return;

  // Source pixels per page pixel, along one side.
  const density = Math.sqrt((width * height) / Math.abs(det));
  const taps = Math.max(1, Math.min(4, Math.round(density)));
  const step = 1 / taps;
  const weight = 1 / (taps * taps);

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      let grey = 0;
      let cover = 0;
      for (let ty = 0; ty < taps; ty += 1) {
        const py = y + (ty + 0.5) * step;
        for (let tx = 0; tx < taps; tx += 1) {
          const px = x + (tx + 0.5) * step;
          const s = ia * px + ic * py + ie;
          const t = ib * px + id * py + iff;
          if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
          const u = Math.min(width - 1, Math.floor(s * width));
          // A PDF picture's first row is the top of the unit square.
          const v = Math.min(height - 1, Math.floor((1 - t) * height));
          if (kind === KIND_GREY_1BPP) {
            const bit = ((data[v * rowBytes + (u >> 3)] ?? 0) >> (7 - (u & 7))) & 1;
            if (mask) {
              // A stencil paints the fill colour where its bit is clear.
              if (bit === 0) {
                grey += ink;
                cover += 1;
              }
            } else {
              grey += bit ? 255 : 0;
              cover += 1;
            }
          } else if (kind === KIND_RGB) {
            const at = (v * width + u) * 3;
            grey += luminance(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0);
            cover += 1;
          } else {
            const at = (v * width + u) * 4;
            const alpha = (data[at + 3] ?? 255) / 255;
            grey += luminance(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0) * alpha;
            cover += alpha;
          }
        }
      }
      if (cover === 0) continue;
      const at = y * pageWidth + x;
      const share = cover * weight;
      page[at] = Math.round((page[at] ?? 255) * (1 - share) + grey * weight);
    }
  }
}

export interface GreyPage {
  width: number;
  height: number;
  pixels: Uint8Array;
  dpi: number;
}

export interface ScannedPdf {
  pageCount: number;
  /** The page as a picture, or null when it has no pictures on it to read. */
  render(pageNumber: number): Promise<GreyPage | null>;
  close(): Promise<void>;
}

export async function openScannedPdf(file: string): Promise<ScannedPdf> {
  // The decoders for fax, JBIG2 and JPEG 2000 pictures, which most scanners produce.
  registerImageDecoders();
  const data = new Uint8Array(await readRegularFile(file));
  const pdf = await getDocumentProxy(data, {
    verbosity: 0,
    // Pictures must arrive as plain pixels, not as browser bitmaps.
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    // PDF.js leaves out any picture larger than this instead of decoding it.
    maxImageSize: MAX_SOURCE_PIXELS,
  }).catch((error: unknown) => {
    if ((error as { name?: string } | null)?.name === "PasswordException") {
      throw new OcrError("This PDF is protected with a password, so its pages cannot be read.");
    }
    throw new OcrError("This file could not be read as a PDF. It may be damaged or incomplete.");
  });
  const { OPS } = await getResolvedPDFJS();
  const ops = OPS as unknown as Record<string, number>;

  return {
    pageCount: pdf.numPages,

    async render(pageNumber) {
      const page = await pdf.getPage(pageNumber);
      try {
        const operators = await page.getOperatorList();
        const paints = await collectPaints(page as unknown as PageLike, operators, ops);
        if (paints.length === 0) return null;

        // At scale 1 a page pixel is one point (1/72 inch); the viewport also applies
        // the page's own rotation and flips the y axis to run downwards.
        const base = page.getViewport({ scale: 1 });
        const baseMatrix = base.transform as Matrix;
        const pageArea = base.width * base.height;
        if (!(pageArea > 0)) return null;

        // Draw at the resolution of the scan itself, within the limits.
        let scale = 0;
        for (const { image, matrix } of paints) {
          const area = Math.abs(determinant(multiply(baseMatrix, matrix)));
          // A small picture (a stamp, a logo) does not set the resolution of the page.
          if (area < pageArea * 0.02) continue;
          scale = Math.max(scale, Math.sqrt((image.width * image.height) / area));
        }
        if (scale === 0) scale = 150 / 72;
        scale = Math.min(Math.max(scale, 0.5), MAX_PAGE_DPI / 72, Math.sqrt(MAX_PAGE_PIXELS / pageArea));

        const width = Math.max(1, Math.round(base.width * scale));
        const height = Math.max(1, Math.round(base.height * scale));
        const pixels = new Uint8Array(width * height).fill(255);
        const toPixels = multiply([scale, 0, 0, scale, 0, 0], baseMatrix);
        for (const entry of paints) paint(pixels, width, height, multiply(toPixels, entry.matrix), entry);
        return { width, height, pixels, dpi: Math.round(scale * 72) };
      } finally {
        // Frees the page's decoded pictures; without it memory grows with every page.
        page.cleanup();
      }
    },

    async close() {
      await pdf.loadingTask.destroy().catch(() => undefined);
    },
  };
}

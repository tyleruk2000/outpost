/**
 * Reading text from pictures of text (OCR): the contract between the document library,
 * the worker thread that does the reading, and whichever engine does the recognising.
 *
 * Kept free of imports so the server thread and the worker can both load it cheaply.
 *
 * To add another engine: write a provider (see `tesseract.ts`), add it to
 * `providers.ts`, and describe what it needs in its own `*-assets.ts`. Nothing else in
 * the server knows which engine is in use.
 */

/** One picture handed to an engine. */
export type OcrImage =
  /** A whole image file as it is on disk: PNG, JPEG, GIF or WebP. */
  | { kind: "file"; bytes: Uint8Array }
  /** Raw 8-bit greyscale pixels, row by row from the top; 0 is black. */
  | { kind: "grey"; width: number; height: number; pixels: Uint8Array; dpi?: number };

export interface OcrResult {
  text: string;
  /** How sure the engine was of what it read, 0 to 100. */
  confidence: number;
}

/** A loaded engine. Lives inside the worker thread, for one document. */
export interface OcrEngine {
  /** `onProgress` is called with 0 to 1 while one picture is read. */
  recognise(image: OcrImage, onProgress?: (fraction: number) => void): Promise<OcrResult>;
  close(): void;
}

/** One file of language data an engine has been given. */
export interface OcrLanguageFile {
  /** Language code as the engine knows it, such as "eng". */
  code: string;
  /** Absolute path of the data file on this machine. */
  path: string;
}

export interface OcrEngineOptions {
  languages: OcrLanguageFile[];
}

/**
 * An OCR engine. `open` runs inside the worker thread; it must not reach the network,
 * and must read language data only from the files it is given.
 */
export interface OcrProvider {
  id: string;
  open(options: OcrEngineOptions): Promise<OcrEngine>;
}

/** The engine in use. `providers.ts` maps the id to its code, inside the worker. */
export const DEFAULT_PROVIDER = "tesseract";

// ── Between the server thread and the worker ──

export interface OcrRequest {
  provider: string;
  languages: OcrLanguageFile[];
  filePath: string;
  kind: "pdf" | "image";
  /** 1-based PDF pages to read, in order. Ignored for an image. */
  pages: number[];
}

export interface OcrPage {
  /** 1-based page number; null for an image. */
  page: number | null;
  /** Empty when nothing was found, or nothing the engine was sure enough of. */
  text: string;
  confidence: number;
  /** Set when the page could not be attempted at all; says why, for people. */
  skipped?: string;
}

export type OcrWorkerMessage =
  /** `fraction` is how far through the current page the engine is, 0 to 1. */
  | { kind: "progress"; index: number; fraction: number }
  | { kind: "page"; index: number; result: OcrPage }
  | { kind: "done" }
  /** `friendly` messages were written for people; others are raw engine errors. */
  | { kind: "error"; message: string; friendly: boolean };

/** A failure whose message can be shown to a person as it is. */
export class OcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrError";
  }
}

// ── Limits ──

/**
 * Largest picture, in pixels, that is decoded at all: an A4 page scanned at 600 dpi
 * is about 35 million. Larger ones are skipped rather than risk running out of memory.
 */
export const MAX_SOURCE_PIXELS = 40_000_000;
/**
 * Largest picture handed to the engine. A PDF page is drawn no larger than this
 * (A4 at 300 dpi is 8.7 million pixels); time and memory grow with it.
 */
export const MAX_PAGE_PIXELS = 12_000_000;
/** Resolution a PDF page is drawn at when its scan is finer than this. */
export const MAX_PAGE_DPI = 300;
/** Image files larger than this are not read. */
export const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
/** PDFs larger than this are not read: the whole file is held in memory. */
export const MAX_PDF_BYTES = 512 * 1024 * 1024;
/** Most pages of one PDF that OCR is run on. */
export const MAX_OCR_PAGES = 1000;
/**
 * Below this confidence a page's result is thrown away. The engine usually returns
 * nothing at all for a picture with no writing in it; what this catches is what comes
 * back as scraps of "words": marks laid out like writing (rows of squiggles scored 24
 * when tried) and text no way up of which could be read (33 to 44). Real text scored 73
 * or more, down to a poor 100 dpi scan.
 */
export const MIN_CONFIDENCE = 50;

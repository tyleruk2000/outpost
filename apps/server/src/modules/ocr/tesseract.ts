/**
 * Tesseract, compiled to WebAssembly (the `tesseract.js-core` package), as an OCR
 * provider.
 *
 * The engine is called directly rather than through the `tesseract.js` wrapper. The
 * wrapper downloads language data from a CDN unless told otherwise, writes a cache
 * file into the working directory and starts a worker of its own; the core does none
 * of that. Loaded this way there is no code path that can open a connection: the
 * engine is a WebAssembly module embedded in a JavaScript file, and it sees only the
 * language files copied into its in-memory file system here.
 *
 * Runs only inside the OCR worker thread.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import type { TessBaseAPI, TesseractModule } from "tesseract.js-core/*";
import { type OcrEngine, type OcrEngineOptions, OcrError, type OcrImage, type OcrProvider, type OcrResult } from "./types.ts";

/** A tiny WebAssembly module that uses one SIMD instruction; it only validates where SIMD is supported. */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

/** Tesseract's neural-network recogniser only: the one the bundled language data is made for. */
const ENGINE_LSTM_ONLY = 1;
/** Find the columns and blocks of a page automatically, without guessing which way up it is. */
const PAGE_SEGMENTATION_AUTO = "3";

/** EXIF orientation values, which is how the engine is told to turn a picture before reading it. */
const UPRIGHT = 1;
/** A quarter turn clockwise, a half turn, a quarter turn anticlockwise. */
const OTHER_WAYS_UP = [6, 3, 8];
/**
 * A reading scoring below this is suspected of being the wrong way up. When tried, text
 * read the wrong way up scored 33 to 44, and the same text the right way up 73 to 95.
 */
const TURN_BELOW = 60;
/** How much better another way up must score before it is believed. */
const TURN_MARGIN = 15;

const DATA_DIR = "/tessdata";
const INPUT = "/input";

/** Node's types describe WebAssembly's shapes but not the global itself. */
const { WebAssembly: wasm } = globalThis as unknown as { WebAssembly: { validate(bytes: Uint8Array): boolean } };

async function loadCore() {
  // The SIMD build is about three times as fast; the plain one runs on anything.
  const core = wasm.validate(SIMD_PROBE)
    ? await import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js")
    : await import("tesseract.js-core/tesseract-core-lstm.wasm.js");
  return core.default;
}

/**
 * Which way up a JPEG says it is (EXIF orientation, 1 to 8). Phone cameras record a
 * sideways photo this way instead of turning the pixels. 1 means "as stored".
 */
export function exifOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    const length = view.getUint16(at + 2);
    // Start of scan: the metadata is over.
    if (marker === 0xda) break;
    if (marker === 0xe1 && at + 10 <= bytes.length && view.getUint32(at + 4) === 0x45786966) {
      const tiff = at + 10;
      if (tiff + 8 > bytes.length) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const directory = tiff + view.getUint32(tiff + 4, little);
      if (directory + 2 > bytes.length) return 1;
      const entries = view.getUint16(directory, little);
      for (let entry = 0; entry < entries; entry += 1) {
        const field = directory + 2 + entry * 12;
        if (field + 12 > bytes.length) return 1;
        if (view.getUint16(field, little) === 0x0112) {
          const value = view.getUint16(field + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    at += 2 + length;
  }
  return 1;
}

/** A greyscale picture as a PGM file, the simplest format the engine's image reader takes. */
function pgm(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`, "latin1");
  const file = new Uint8Array(header.length + pixels.length);
  file.set(header);
  file.set(pixels, header.length);
  return file;
}

class TesseractEngine implements OcrEngine {
  private readonly core: TesseractModule;
  private readonly api: TessBaseAPI;
  private readonly progress: { report?: (fraction: number) => void };

  constructor(core: TesseractModule, api: TessBaseAPI, progress: { report?: (fraction: number) => void }) {
    this.core = core;
    this.api = api;
    this.progress = progress;
  }

  async recognise(image: OcrImage, onProgress?: (fraction: number) => void) {
    const { core } = this;
    core.FS.writeFile(INPUT, image.kind === "file" ? image.bytes : pgm(image.width, image.height, image.pixels));
    this.progress.report = onProgress;
    const dpi = image.kind === "grey" ? image.dpi : undefined;
    try {
      const own = image.kind === "file" ? exifOrientation(image.bytes) : UPRIGHT;
      let best = this.read(own, dpi);
      // A page scanned upside down or on its side comes back as confident-looking
      // nonsense at a low score. When the camera has not said which way up the picture
      // is, the other ways are tried and the clearly better reading is kept.
      if (own === UPRIGHT && best.text.trim() && best.confidence < TURN_BELOW) {
        for (const turn of OTHER_WAYS_UP) {
          const turned = this.read(turn, dpi);
          if (turned.text.trim() && turned.confidence >= best.confidence + TURN_MARGIN) best = turned;
          if (best.confidence >= TURN_BELOW) break;
        }
      }
      return best;
    } finally {
      this.progress.report = undefined;
      core.FS.unlink(INPUT);
    }
  }

  /** One reading of the picture at `/input`, turned as an EXIF orientation value says. */
  private read(orientation: number, dpi: number | undefined): OcrResult {
    const { api } = this;
    try {
      if (api.SetImageFile(orientation, 0) === 1) {
        throw new OcrError("The picture could not be read. It may be damaged, or in a form the OCR engine does not understand.");
      }
      if (dpi) api.SetSourceResolution(dpi);
      if (api.Recognize(null) !== 0) throw new OcrError("The OCR engine could not read this picture.");
      return { text: api.GetUTF8Text() ?? "", confidence: api.MeanTextConf() };
    } finally {
      // Lets go of the picture and everything worked out about it.
      api.Clear();
    }
  }

  close() {
    this.api.End();
  }
}

export const tesseract: OcrProvider = {
  id: "tesseract",

  async open(options: OcrEngineOptions) {
    if (options.languages.length === 0) throw new OcrError("No language data for OCR is installed.");
    const progress: { report?: (fraction: number) => void } = {};
    const createCore = await loadCore();
    const core = await createCore({
      TesseractProgress: (percent) => progress.report?.(Math.max(0, Math.min(1, percent / 100))),
      // The engine's own chatter ("Estimating resolution as …") is not for the server log.
      print: () => undefined,
      printErr: () => undefined,
    });

    core.FS.mkdir(DATA_DIR);
    for (const language of options.languages) {
      let data: Uint8Array = await fs.promises.readFile(language.path);
      if (data[0] === 0x1f && data[1] === 0x8b) data = zlib.gunzipSync(data);
      core.FS.writeFile(`${DATA_DIR}/${language.code}.traineddata`, data);
    }

    const api = new core.TessBaseAPI();
    const codes = options.languages.map((language) => language.code).join("+");
    if (api.Init(DATA_DIR, codes, ENGINE_LSTM_ONLY) !== 0) {
      throw new OcrError(
        `The OCR language data (${codes}) could not be loaded. A language file may be damaged, or made for a different version of Tesseract.`,
      );
    }
    api.SetVariable("tessedit_pageseg_mode", PAGE_SEGMENTATION_AUTO);
    return new TesseractEngine(core, api, progress);
  },
};

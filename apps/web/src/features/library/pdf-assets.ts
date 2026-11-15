/**
 * Where pdf.js finds its own parts. Outpost works with no internet, so everything is
 * served by Outpost itself: the worker as a bundled asset, and the character maps,
 * standard fonts, colour profiles and image decoders under /pdfjs/ (see the
 * `pdfjsAssets` plugin in vite.config.ts).
 */
import { GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const base = `${import.meta.env.BASE_URL}pdfjs/`;

/** Options for `getDocument` that every PDF is opened with. */
export const pdfOptions = {
  cMapUrl: `${base}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${base}standard_fonts/`,
  wasmUrl: `${base}wasm/`,
  iccUrl: `${base}iccs/`,
  // Forms that carry their own layout engine are not rendered; the plain page is.
  enableXfa: false,
  // Fetch the parts of the file the pages on screen need, by byte range, and nothing else.
  // Without these pdf.js quietly downloads the whole file in the background.
  disableAutoFetch: true,
  disableStream: true,
} as const;

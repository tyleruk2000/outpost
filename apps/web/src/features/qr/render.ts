/**
 * A code as pictures: SVG for the screen and to save, PNG to save or copy, and the
 * squares of a printed sheet. Black on white whatever the screen's theme: readers
 * expect dark modules on a light ground, and some do not read a code the other way round.
 */
import type { QrCode } from "./encoder";

/** The light margin all round that the standard asks for, in modules (ISO/IEC 18004, 6.3.8). */
export const QUIET_ZONE = 4;

export interface Run {
  row: number;
  column: number;
  length: number;
}

/** Dark modules joined into horizontal runs, so a picture of the code is a few hundred shapes rather than thousands. */
export function darkRuns(code: QrCode): Run[] {
  const runs: Run[] = [];
  code.modules.forEach((row, r) => {
    let start = -1;
    for (let c = 0; c <= row.length; c += 1) {
      const dark = c < row.length && row[c];
      if (dark && start < 0) start = c;
      if (!dark && start >= 0) {
        runs.push({ row: r, column: start, length: c - start });
        start = -1;
      }
    }
  });
  return runs;
}

/** The path of every dark module, in modules, offset by the quiet zone. */
export function modulePath(code: QrCode): string {
  return darkRuns(code)
    .map((run) => `M${run.column + QUIET_ZONE} ${run.row + QUIET_ZONE}h${run.length}v1h-${run.length}z`)
    .join("");
}

/** The extent of the picture in modules, quiet zone included. */
export const extentOf = (code: QrCode) => code.size + QUIET_ZONE * 2;

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A standalone SVG file of the code, `pixelsPerModule` pixels to a module as its nominal size. */
export function svgFile(code: QrCode, title: string, pixelsPerModule = 10): string {
  const extent = extentOf(code);
  const side = extent * pixelsPerModule;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect width="${extent}" height="${extent}" fill="#fff"/>`,
    `<path d="${modulePath(code)}" fill="#000"/>`,
    "</svg>",
    "",
  ].join("\n");
}

/** The code drawn on a canvas, whole pixels to a module so that every edge is sharp. */
export function pngBlob(code: QrCode, pixelsPerModule = 12): Promise<Blob> {
  const extent = extentOf(code);
  const canvas = document.createElement("canvas");
  canvas.width = extent * pixelsPerModule;
  canvas.height = extent * pixelsPerModule;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("This browser would not draw the picture."));
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  for (const run of darkRuns(code)) {
    context.fillRect(
      (run.column + QUIET_ZONE) * pixelsPerModule,
      (run.row + QUIET_ZONE) * pixelsPerModule,
      run.length * pixelsPerModule,
      pixelsPerModule,
    );
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("This browser would not make the picture."))), "image/png"),
  );
}

/** A file name from what the code is: "wi-fi-code-for-hut.png", letters of any script kept, accents dropped. */
export function codeFileName(title: string, extension: string): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "qr-code";
  return `${base}.${extension}`;
}

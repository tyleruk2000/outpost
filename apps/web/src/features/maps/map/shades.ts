/**
 * Shading drawn in the page and laid over the map as a picture: the ground in sight of an aerial, the ground a walk
 * reaches. A picture, not shapes, so that it is one smooth layer with no seams between pieces, however broken the
 * ground it shows.
 *
 * A picture is painted pixel by pixel on the map's own projection (Web Mercator), so that it lies exactly where it
 * should when the map stretches it between its corners. It is handed to MapLibre through a protocol of Outpost's own
 * (`outpost-shade://`), never fetched: the bytes stay in the page.
 */
import { UNDER_LABELS } from "../lib/style";
import type { LayerSpecification, SourceSpecification } from "../lib/style-types";

export const SHADE_PROTOCOL = "outpost-shade";

/** The kinds of shading, each replaced as a whole. */
export type ShadeGroup = "range" | "relay" | "walk";

export interface Shade {
  /** `outpost-shade://…`, from `keepShade`. */
  url: string;
  /** Corners, top left first and clockwise, as [longitude, latitude]. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  opacity: number;
}

const kept = new Map<string, ArrayBuffer>();
let next = 0;

/** Keeps a picture's bytes for the map to load, under a name of its own. */
export function keepShade(png: ArrayBuffer): string {
  next += 1;
  const url = `${SHADE_PROTOCOL}://shade/${next}.png`;
  kept.set(url, png);
  return url;
}

/** Lets a picture go once nothing shows it. */
export function releaseShade(url: string): void {
  kept.delete(url);
}

export async function loadShade(request: { url: string }): Promise<{ data: ArrayBuffer }> {
  const png = kept.get(request.url);
  if (!png) throw new Error("This shading is no longer shown.");
  // A copy: the map may hand the buffer it is given to a worker.
  return { data: png.slice(0) };
}

/** The sources and layers for every shade shown, under the map's names so that they stay readable. */
export function shadeStyle(groups: Partial<Record<ShadeGroup, Shade[]>>): {
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
} {
  const sources: Record<string, SourceSpecification> = {};
  const layers: LayerSpecification[] = [];
  for (const [group, shades] of Object.entries(groups)) {
    shades?.forEach((shade, index) => {
      const id = `o-shade-${group}-${index}`;
      sources[id] = { type: "image", url: shade.url, coordinates: shade.coordinates };
      layers.push({
        id,
        type: "raster",
        source: id,
        metadata: UNDER_LABELS,
        paint: { "raster-opacity": shade.opacity, "raster-resampling": "linear", "raster-fade-duration": 0 },
      });
    });
  }
  return { sources, layers };
}

// ── Painting ────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
const latitudeOf = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG;

export interface ShadePicture {
  width: number;
  height: number;
  /** RGBA, row by row from the top. */
  pixels: Uint8ClampedArray;
  coordinates: Shade["coordinates"];
  /** How much of the group's opacity it is drawn with: less than 1 for a picture shown faded. 1 when not said. */
  fade?: number;
}

/**
 * Paints a picture over a box, `paint` asked once for each pixel's centre to write its four bytes at `offset`. The
 * box's longer side gets `pixels` pixels, or fewer where each would be finer than `finestMeters`.
 */
export function paintShade(
  box: { west: number; south: number; east: number; north: number },
  options: { pixels: number; finestMeters: number },
  paint: (lat: number, lon: number, out: Uint8ClampedArray, offset: number) => void,
): ShadePicture {
  const top = mercatorY(box.north);
  const bottom = mercatorY(box.south);
  const spanX = (box.east - box.west) * DEG;
  const spanY = top - bottom;
  // Metres per unit of the projection, at the middle of the box.
  const metersPerUnit = 6_371_008.8 * Math.cos(((box.north + box.south) / 2) * DEG);
  const longest = Math.max(spanX, spanY) * metersPerUnit;
  const across = Math.max(16, Math.min(options.pixels, Math.ceil(longest / options.finestMeters)));
  const width = Math.max(1, Math.round(spanX >= spanY ? across : (across * spanX) / spanY));
  const height = Math.max(1, Math.round(spanY >= spanX ? across : (across * spanY) / spanX));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const lons = new Float64Array(width);
  for (let x = 0; x < width; x += 1) lons[x] = box.west + ((x + 0.5) / width) * (box.east - box.west);
  for (let y = 0; y < height; y += 1) {
    const lat = latitudeOf(top - ((y + 0.5) / height) * spanY);
    for (let x = 0; x < width; x += 1) paint(lat, lons[x]!, pixels, (y * width + x) * 4);
  }
  return {
    width,
    height,
    pixels,
    coordinates: [
      [box.west, box.north],
      [box.east, box.north],
      [box.east, box.south],
      [box.west, box.south],
    ],
  };
}

/**
 * Whether this page can draw a picture to lay over the map. Every browser the map runs in can; the page the tests
 * run in (jsdom) has a canvas that draws nothing, so nothing is painted there for it.
 */
export function canShade(): boolean {
  return typeof document !== "undefined" && typeof navigator !== "undefined" && !/\bjsdom\b/i.test(navigator.userAgent);
}

/** The picture as PNG bytes, or null where the browser cannot draw one (as in the tests' page). */
export async function encodeShade(picture: ShadePicture): Promise<ArrayBuffer | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = picture.width;
  canvas.height = picture.height;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!context) return null;
  context.putImageData(new ImageData(picture.pixels as Uint8ClampedArray<ArrayBuffer>, picture.width, picture.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  // Given back at once; phones count the memory of every canvas on a page together.
  canvas.width = 0;
  canvas.height = 0;
  return blob ? blob.arrayBuffer() : null;
}

/** A colour as hex made into its three bytes. */
export function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return Number.isNaN(value) ? [0, 0, 0] : [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

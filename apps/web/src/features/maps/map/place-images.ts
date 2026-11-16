/**
 * The pictures the map draws for saved places that have an icon.
 *
 * MapLibre draws an icon from a picture it has been given a name for. The basemap's own
 * come from the sprite sheet under /map-assets; these are made here, in the browser, from
 * the strokes in `lib/place-icons.ts`, so nothing is fetched and nothing is added to what
 * Outpost ships. They are made when the map first asks for one: a style that names a
 * picture the map does not have asks the map's resolver for it before it lays the place
 * out, and the picture is drawn and handed over there and then. (The `styleimagemissing`
 * event comes too late for that in this version of MapLibre: by then the place has been
 * laid out without its picture.) A map of places that are all plain pins never draws one,
 * and one with thousands of places draws at most one per icon and colour in use.
 *
 * A picture is the whole marker: the ring in the page colour, the disc in the place's
 * colour and the icon on it, so that where two markers overlap each is drawn whole, one
 * over the other.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { MARKER_HEX } from "../lib/palette";
import { BADGE, GLYPH_ON, PLACE_GLYPHS, parsePlaceImageId } from "../lib/place-icons";

/** The side of a picture in the map's own pixels: the disc, its ring, and a pixel to spare so the edge is never clipped. */
export const PLACE_IMAGE_SIZE = (BADGE.radius + BADGE.ring + 1) * 2;

/** Draws one marker at `ratio` device pixels to each of the map's. Null where the browser gives no canvas to draw on. */
export function drawPlaceImage(id: string, ratio: number): ImageData | null {
  const spec = parsePlaceImageId(id);
  if (!spec) return null;
  const side = Math.round(PLACE_IMAGE_SIZE * ratio);
  const canvas = typeof OffscreenCanvas === "undefined" ? document.createElement("canvas") : new OffscreenCanvas(side, side);
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;

  context.scale(ratio, ratio);
  const middle = PLACE_IMAGE_SIZE / 2;
  context.beginPath();
  context.arc(middle, middle, BADGE.radius + BADGE.ring, 0, Math.PI * 2);
  context.fillStyle = spec.page;
  context.fill();
  context.beginPath();
  context.arc(middle, middle, BADGE.radius, 0, Math.PI * 2);
  context.fillStyle = MARKER_HEX[spec.color];
  context.fill();

  // The strokes are on a 24 × 24 grid; here that grid is `BADGE.glyph` pixels across, in the middle of the disc.
  const scale = BADGE.glyph / 24;
  context.translate(middle - BADGE.glyph / 2, middle - BADGE.glyph / 2);
  context.scale(scale, scale);
  const glyph = PLACE_GLYPHS[spec.icon];
  context.strokeStyle = GLYPH_ON[spec.color];
  context.fillStyle = GLYPH_ON[spec.color];
  context.lineWidth = BADGE.strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const path of glyph.strokes) context.stroke(new Path2D(path));
  for (const path of glyph.fills ?? []) context.fill(new Path2D(path));

  return context.getImageData(0, 0, side, side);
}

/**
 * Gives a map the pictures of places as it asks for them. `ratio` is how sharply they are
 * drawn: at least 2, so they hold on any phone, and more for the map a printed page is
 * drawn from.
 */
export function providePlaceImages(map: MapLibreMap, ratio = Math.max(2, Math.ceil(window.devicePixelRatio || 1))): void {
  map.setMissingStyleImageResolver((id) => {
    // Anything that is not a place's picture is left as it was: missing.
    if (map.hasImage(id)) return;
    const image = drawPlaceImage(id, ratio);
    if (image) map.addImage(id, image, { pixelRatio: ratio });
  });
}

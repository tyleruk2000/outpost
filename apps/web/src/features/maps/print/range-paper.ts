/**
 * The estimated range's shading for a printed page, painted again in the page's own colours rather than taken from the
 * map on screen: that picture is in the colours of the theme and style on screen (the dark theme's light green, the
 * night style's red), and paper is always the light map. Painted from the same answer as on screen, so the shape is the
 * same; kept for each answer, so ticking boxes in the print dialog does not paint it again.
 */
import type { SightRange } from "@outpost/shared";
import { RANGE_SHADE_OPACITY, rangeShade } from "@/features/repeaters/map/range";
import { canShade, keepShade, releaseShade, type Shade, type ShadePicture } from "../map/shades";

const painted = new WeakMap<SightRange, { colour: string; shade: Shade | null }>();

/** PNG bytes from a picture at once (the print style is built in one go), or null where the page cannot draw one. */
export function encodeShadeNow(picture: ShadePicture): ArrayBuffer | null {
  if (!canShade()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = picture.width;
  canvas.height = picture.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.putImageData(new ImageData(picture.pixels as Uint8ClampedArray<ArrayBuffer>, picture.width, picture.height), 0, 0);
    const url = canvas.toDataURL("image/png");
    const text = atob(url.slice(url.indexOf(",") + 1));
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
    return bytes.buffer;
  } catch {
    return null;
  } finally {
    // Given back at once, as on screen: phones count the memory of every canvas on a page together.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** The shading of each range in `colour`, at the opacity the light map uses, ready for the print style. */
export function paperShades(ranges: ReadonlyArray<{ range: SightRange }>, colour: string, paint = rangeShade): Shade[] {
  return ranges.flatMap(({ range }) => {
    const known = painted.get(range);
    if (known && known.colour === colour) return known.shade ? [known.shade] : [];
    if (known?.shade) releaseShade(known.shade.url);
    const picture = paint(range, colour, 1536);
    const png = picture ? encodeShadeNow(picture) : null;
    const shade = picture && png ? { url: keepShade(png), coordinates: picture.coordinates, opacity: RANGE_SHADE_OPACITY } : null;
    painted.set(range, { colour, shade });
    return shade ? [shade] : [];
  });
}

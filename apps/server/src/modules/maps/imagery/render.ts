/**
 * Pictures in memory, and making a pyramid of map tiles from them.
 *
 * A picture is RGBA, 8 bits a channel, rows top to bottom. A coarser zoom is made from
 * the one below it by averaging each square of four pixels, weighted by how opaque each
 * is, so a pixel half inside an area and half outside is not darkened by the outside.
 * Nothing is sharpened and nothing is invented: every map pixel is an average of the
 * picture's own values.
 */
import { yieldToEventLoop } from "../../../core/event-loop.ts";
import { TILE_SIZE } from "./projection.ts";
import { encodeWebp } from "./webp.ts";

export interface Picture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function blank(width: number, height: number): Picture {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Half the size, each pixel the alpha-weighted average of four. Width and height must be even. */
export function halve(picture: Picture): Picture {
  const width = picture.width >> 1;
  const height = picture.height >> 1;
  const out = blank(width, height);
  const source = picture.data;
  const target = out.data;
  const rowLength = picture.width * 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = (y * 2 * picture.width + x * 2) * 4;
      let alpha = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < 4; k += 1) {
        const at = a + (k & 1) * 4 + (k >> 1) * rowLength;
        const weight = source[at + 3]!;
        alpha += weight;
        r += source[at]! * weight;
        g += source[at + 1]! * weight;
        b += source[at + 2]! * weight;
      }
      const t = (y * width + x) * 4;
      if (alpha === 0) continue;
      target[t] = Math.round(r / alpha);
      target[t + 1] = Math.round(g / alpha);
      target[t + 2] = Math.round(b / alpha);
      target[t + 3] = Math.round(alpha / 4);
    }
  }
  return out;
}

/** One 256-pixel tile cut from a picture, at tile column `column` and row `row` of it. */
export function cut(picture: Picture, column: number, row: number): Picture {
  const out = blank(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y += 1) {
    const from = ((row * TILE_SIZE + y) * picture.width + column * TILE_SIZE) * 4;
    out.data.set(picture.data.subarray(from, from + TILE_SIZE * 4), y * TILE_SIZE * 4);
  }
  return out;
}

/** Four tiles side by side (any may be missing) made into the one tile above them. */
export function parentOf(children: Array<Picture | undefined>): Picture {
  const joined = blank(TILE_SIZE * 2, TILE_SIZE * 2);
  children.forEach((child, index) => {
    if (!child) return;
    const ox = (index % 2) * TILE_SIZE;
    const oy = Math.floor(index / 2) * TILE_SIZE;
    for (let y = 0; y < TILE_SIZE; y += 1) {
      joined.data.set(child.data.subarray(y * TILE_SIZE * 4, (y + 1) * TILE_SIZE * 4), ((oy + y) * TILE_SIZE * 2 + ox) * 4);
    }
  });
  return halve(joined);
}

/** True when no pixel of the picture is drawn. */
export function isEmpty(picture: Picture): boolean {
  for (let i = 3; i < picture.data.length; i += 4) if (picture.data[i] !== 0) return false;
  return true;
}

/** Encodes a tile, giving way to the server between tiles. */
export async function encodeTile(picture: Picture): Promise<Uint8Array> {
  const bytes = await encodeWebp(picture.data, picture.width, picture.height);
  await yieldToEventLoop();
  return bytes;
}

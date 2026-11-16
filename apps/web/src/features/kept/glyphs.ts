/**
 * Working out which lettering a kept map area needs.
 *
 * The map's fonts are served in ranges of 256 characters, about 20 MB for all of them.
 * A kept area needs only the ranges its own names use, so each map tile is read for the
 * text it carries as it is stored, and the ranges of those characters are fetched once
 * at the end. Every text value in a tile is counted, which is a little more than the
 * names that are drawn: too much lettering is harmless, a missing range is a blank label.
 */

/** Reads one varint, returning [value, next position]. Values past 2^53 do not occur in the fields read here. */
function varint(bytes: Uint8Array, at: number): [number, number] {
  let value = 0;
  let shift = 1;
  let position = at;
  for (;;) {
    const byte = bytes[position];
    if (byte === undefined) throw new RangeError("The tile ends in the middle of a number.");
    position += 1;
    value += (byte & 0x7f) * shift;
    if (byte < 0x80) return [value, position];
    shift *= 128;
  }
}

/** Calls `visit` for every length-delimited field of a message, and steps over the rest. */
function fields(bytes: Uint8Array, visit: (field: number, body: Uint8Array) => void): void {
  let position = 0;
  while (position < bytes.length) {
    const [tag, afterTag] = varint(bytes, position);
    const wire = tag & 7;
    position = afterTag;
    if (wire === 0) [, position] = varint(bytes, position);
    else if (wire === 1) position += 8;
    else if (wire === 5) position += 4;
    else if (wire === 2) {
      const [length, start] = varint(bytes, position);
      position = start + length;
      if (position > bytes.length) throw new RangeError("The tile ends in the middle of a field.");
      visit(Math.floor(tag / 8), bytes.subarray(start, position));
    } else throw new RangeError("The tile holds a field of a kind vector tiles do not use.");
  }
}

const decoder = new TextDecoder();

/**
 * Adds to `ranges` the glyph range (the code point divided by 256) of every character in
 * every text value of a vector tile. A tile that cannot be read adds nothing.
 */
export function collectGlyphRanges(tile: Uint8Array, ranges: Set<number>): void {
  try {
    // Tile → layers (field 3) → values (field 4) → string_value (field 1).
    fields(tile, (field, layer) => {
      if (field !== 3) return;
      fields(layer, (layerField, value) => {
        if (layerField !== 4) return;
        fields(value, (valueField, text) => {
          if (valueField !== 1) return;
          for (const character of decoder.decode(text)) ranges.add(Math.floor(character.codePointAt(0)! / 256));
        });
      });
    });
  } catch {
    // Not a vector tile this reader understands: its lettering is simply not counted.
  }
}

/** The fonts the map style names; see `MAP_FONTS` and scripts/fetch-map-assets.mjs. */
export const GLYPH_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic", "Noto Sans Devanagari Regular v1"];

/** Ranges every map needs whatever its tiles say: Latin, and the punctuation the style itself writes. */
export const BASE_GLYPH_RANGES = [0, 1, 32];

/** The address of one range of one font, as the map asks for it. */
export function glyphPath(font: string, range: number): string {
  return `/map-assets/fonts/${encodeURIComponent(font)}/${range * 256}-${range * 256 + 255}.pbf`;
}

/** The map's icons, in both themes and both pixel densities. */
export function spritePaths(sprites: Record<string, string>): string[] {
  const paths: string[] = [];
  for (const flavour of ["light", "dark"]) {
    const base = sprites[flavour];
    if (!base) continue;
    for (const density of ["", "@2x"]) for (const extension of ["json", "png"]) paths.push(`${base}${density}.${extension}`);
  }
  return paths;
}

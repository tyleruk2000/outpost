/**
 * Maidenhead locators: the grid radio amateurs give positions in ("IO83QM").
 *
 * A locator is pairs of characters, each pair dividing the cell before it: a field (20°
 * of longitude by 10° of latitude, letters A to R), a square (2° by 1°, digits), a
 * subsquare (5′ by 2.5′, letters A to X) and an extended square (30″ by 15″, digits).
 * Longitude comes first in each pair, counted eastwards from 180° W; latitude
 * northwards from the South Pole. A locator names a cell, not a point.
 */

/** How many characters of locator: a field, a square, a subsquare or an extended square. */
export type LocatorLength = 2 | 4 | 6 | 8;

/** The width and height in degrees of the cell each length of locator names. */
export const LOCATOR_CELLS: Record<LocatorLength, { lon: number; lat: number }> = {
  2: { lon: 20, lat: 10 },
  4: { lon: 2, lat: 1 },
  6: { lon: 1 / 12, lat: 1 / 24 },
  8: { lon: 1 / 120, lat: 1 / 240 },
};

/** What the cell each length of locator names is called. */
export const LOCATOR_CELL_NAMES: Record<LocatorLength, string> = { 2: "field", 4: "square", 6: "subsquare", 8: "extended square" };

/** Extended squares to a degree of longitude, and to a degree of latitude: the units the sums are done in. */
const LON_UNITS = 120;
const LAT_UNITS = 240;
/** How many extended squares each pair's cell spans, along either axis. */
const SPAN: Record<LocatorLength, number> = { 2: 2400, 4: 240, 6: 10, 8: 1 };

const A = 65;
const letter = (index: number) => String.fromCharCode(A + index);

/**
 * The locator of a position, in upper case ("IO83QM"). Positions on a line between two
 * cells belong to the cell to the east and north, and the North Pole to the last row.
 * Null for a position that is nowhere on Earth.
 */
export function toMaidenhead(lat: number, lon: number, length: LocatorLength = 6): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const wrapped = (((lon + 180) % 360) + 360) % 360;
  const x = Math.min(360 * LON_UNITS - 1, Math.floor(wrapped * LON_UNITS));
  const y = Math.min(180 * LAT_UNITS - 1, Math.floor((lat + 90) * LAT_UNITS));
  let text = letter(Math.floor(x / 2400)) + letter(Math.floor(y / 2400));
  if (length >= 4) text += `${Math.floor((x % 2400) / 240)}${Math.floor((y % 2400) / 240)}`;
  if (length >= 6) text += letter(Math.floor((x % 240) / 10)) + letter(Math.floor((y % 240) / 10));
  if (length >= 8) text += `${x % 10}${y % 10}`;
  return text;
}

export interface LocatorSquare {
  /** The locator in upper case, without spaces. */
  locator: string;
  /** The middle of the cell. */
  lat: number;
  lon: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Reads a locator of 2, 4, 6 or 8 characters, in either case, with or without spaces
 * between the pairs. Null for anything else.
 */
export function parseMaidenhead(input: string): LocatorSquare | null {
  const text = input.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-R]{2}(?:\d{2}(?:[A-X]{2}(?:\d{2})?)?)?$/.test(text)) return null;
  const length = text.length as LocatorLength;
  const value = (index: number) => {
    const code = text.charCodeAt(index);
    return code >= A ? code - A : code - 48;
  };
  let x = value(0) * 2400;
  let y = value(1) * 2400;
  if (length >= 4) {
    x += value(2) * 240;
    y += value(3) * 240;
  }
  if (length >= 6) {
    x += value(4) * 10;
    y += value(5) * 10;
  }
  if (length >= 8) {
    x += value(6);
    y += value(7);
  }
  const span = SPAN[length];
  const west = x / LON_UNITS - 180;
  const south = y / LAT_UNITS - 90;
  const east = (x + span) / LON_UNITS - 180;
  const north = (y + span) / LAT_UNITS - 90;
  return { locator: text, lat: (south + north) / 2, lon: (west + east) / 2, west, south, east, north };
}

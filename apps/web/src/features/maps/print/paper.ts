/**
 * Paper, and where things go on it. Everything here is in PDF points (1/72 inch)
 * measured from the top-left corner of the page, and is plain arithmetic.
 *
 * A page is one map with a strip of furniture underneath: title, date, scale, north
 * and the credits. The strip has a fixed height, so the shape of the map is known as
 * soon as the paper is chosen and never changes with what is ticked afterwards.
 */

export const PT_PER_INCH = 72;
export const PT_PER_MM = PT_PER_INCH / 25.4;

/**
 * How many of the map's own pixels are drawn to an inch of paper. The map is laid out
 * in these pixels exactly as it is on screen (a 12.5 px label, a 3 px route line) and
 * then drawn with more device pixels to each, so the print reads like the screen. At
 * 120 to the inch a 12.5 px label is 7.5 point type, about the size of the names on a
 * printed walking map; at a screen's nominal 96 it would be 9.4 point, and far fewer
 * names would fit on the sheet.
 */
export const MAP_PX_PER_INCH = 120;
export const PT_PER_MAP_PX = PT_PER_INCH / MAP_PX_PER_INCH;

/**
 * The map's width and height are whole multiples of this many pixels, so that at both
 * resolutions offered (2.5 and 1.25 device pixels to each) the picture is a whole
 * number of device pixels and no row is lost to rounding.
 */
export const MAP_PX_STEP = 4;

export const PAPER_IDS = ["a4", "a3", "letter"] as const;
export type PaperId = (typeof PAPER_IDS)[number];
export type Orientation = "portrait" | "landscape";

/** Upright sizes in points, to the two decimals a PDF's page box is written with. */
export const PAPERS: Record<PaperId, { label: string; width: number; height: number; millimetres: string }> = {
  a4: { label: "A4", width: 595.28, height: 841.89, millimetres: "210 × 297 mm" },
  a3: { label: "A3", width: 841.89, height: 1190.55, millimetres: "297 × 420 mm" },
  letter: { label: "US Letter", width: 612, height: 792, millimetres: "8½ × 11 in" },
};

export const isPaperId = (value: unknown): value is PaperId => (PAPER_IDS as readonly unknown[]).includes(value);
export const isOrientation = (value: unknown): value is Orientation => value === "portrait" || value === "landscape";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Blank paper on every side: 10 mm, inside what desktop printers can reach (they stop 3 to 6.5 mm short of the edge). */
export const MARGIN = 10 * PT_PER_MM;
/** The furniture strip under the map, and the space between the two. */
export const STRIP_HEIGHT = 64;
export const STRIP_GAP = 7;

export interface PageGeometry {
  paper: PaperId;
  orientation: Orientation;
  /** The page. */
  width: number;
  height: number;
  /** Where the map is drawn. */
  map: Rect;
  /** The map's size in its own pixels (see MAP_PX_PER_INCH). */
  mapPixels: { width: number; height: number };
  /** Where the title, scale and credits go. */
  strip: Rect;
}

export function pageGeometry(paper: PaperId, orientation: Orientation): PageGeometry {
  const upright = PAPERS[paper];
  const width = orientation === "portrait" ? upright.width : upright.height;
  const height = orientation === "portrait" ? upright.height : upright.width;
  const roomWide = width - 2 * MARGIN;
  const roomHigh = height - 2 * MARGIN - STRIP_HEIGHT - STRIP_GAP;
  const whole = (points: number) => Math.floor(points / PT_PER_MAP_PX / MAP_PX_STEP) * MAP_PX_STEP;
  const mapPixels = { width: whole(roomWide), height: whole(roomHigh) };
  const map: Rect = {
    // Centred in the room there is: the rounding above leaves at most a millimetre over.
    x: MARGIN + (roomWide - mapPixels.width * PT_PER_MAP_PX) / 2,
    y: MARGIN,
    width: mapPixels.width * PT_PER_MAP_PX,
    height: mapPixels.height * PT_PER_MAP_PX,
  };
  return {
    paper,
    orientation,
    width,
    height,
    map,
    mapPixels,
    strip: { x: map.x, y: map.y + map.height + STRIP_GAP, width: map.width, height: STRIP_HEIGHT },
  };
}

/** "A4 portrait" */
export function paperName(paper: PaperId, orientation: Orientation): string {
  return `${PAPERS[paper].label} ${orientation}`;
}

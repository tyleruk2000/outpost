/**
 * What each map in a scenario's PDF shows, worked out before anything is drawn: the
 * ground it covers, the size of its picture on the page and the zoom it is drawn at.
 *
 * One picture cannot show a ring of a kilometre and a fallout pattern of a hundred, so a
 * scenario with a pattern has two: the rings, framed as the screen frames them
 * (`fitArea`, rings only), and the pattern out to the contour the screen fits to when it
 * is first drawn, 100 rads per hour. Where that contour hardly reaches past the rings, the
 * second map takes in the whole drawn pattern instead; where even that hardly does, one
 * map shows everything. With several scenarios, an overview takes them all in first.
 *
 * Pure arithmetic in the map's own Web Mercator, so that it can be checked by hand.
 */
import type { Bbox, EffectsResult } from "@outpost/shared";
import type { LatLon } from "@/features/maps/lib/geo";
import { MAP_PX_STEP, PT_PER_MAP_PX } from "@/features/maps/print/paper";
import { type Frame, latitudeAt, mercatorX, mercatorY, type PixelSize } from "@/features/maps/print/scale";
import { fitArea } from "./fallout";

/** The contour the screen first fits a pattern to, and the outermost one it draws. */
export const FIRST_FIT_RATE = 100;
export const OUTERMOST_RATE = 1;
/**
 * A second map is worth its room only when it shows this much more ground across than
 * the first, along its longer side. Below it, the pattern is shown on the first map.
 */
export const WORTH_A_SECOND_MAP = 1.6;

/** The tallest a map is drawn on the page, in points: two fit on an A4 page with their captions. */
export const MAX_PICTURE_HEIGHT = 300;
/** The overview may be a little taller: it has the first page to itself. */
export const MAX_OVERVIEW_HEIGHT = 380;

export type MapPart = "overview" | "rings" | "pattern";

export interface PrintFrame {
  part: MapPart;
  /** The ground it shows, [west, south, east, north]; west or east may run past ±180° across the antimeridian. */
  bbox: Bbox;
  /** For the pattern's map: the contour the frame reaches, in rads per hour at one hour. Null on the others. */
  reachesRate: number | null;
}

/** The size of a box on the Web Mercator map, as fractions of the world's width and height. */
function mercatorSize(bbox: Bbox): { width: number; height: number } {
  const [west, south, east, north] = bbox;
  return { width: Math.max(1e-12, mercatorX(east) - mercatorX(west)), height: Math.max(1e-12, mercatorY(south) - mercatorY(north)) };
}

/** How much larger one box is than another along the longer side of the larger. */
function across(outer: Bbox, inner: Bbox): number {
  const a = mercatorSize(outer);
  const b = mercatorSize(inner);
  return Math.max(a.width / b.width, a.height / b.height);
}

/** The maps of one scenario, in the order they are printed. */
export function scenarioFrames(result: EffectsResult, at: LatLon): PrintFrame[] {
  const rings = fitArea(result, at, Number.POSITIVE_INFINITY);
  if (!result.fallout.drawn) return [{ part: "rings", bbox: rings, reachesRate: null }];
  const first = fitArea(result, at, FIRST_FIT_RATE);
  if (across(first, rings) >= WORTH_A_SECOND_MAP)
    return [
      { part: "rings", bbox: rings, reachesRate: null },
      { part: "pattern", bbox: first, reachesRate: FIRST_FIT_RATE },
    ];
  const whole = fitArea(result, at, OUTERMOST_RATE);
  if (across(whole, rings) >= WORTH_A_SECOND_MAP)
    return [
      { part: "rings", bbox: rings, reachesRate: null },
      { part: "pattern", bbox: whole, reachesRate: OUTERMOST_RATE },
    ];
  // The whole pattern lies close round the rings: one map shows both.
  return [{ part: "rings", bbox: whole, reachesRate: OUTERMOST_RATE }];
}

/**
 * The box that takes in several boxes, the narrowest way round the world: two scenarios
 * either side of the antimeridian are joined across it, not across the rest of the world.
 */
export function unionArea(boxes: Bbox[]): Bbox {
  if (boxes.length === 0) throw new Error("No area to take in.");
  let best: Bbox | null = null;
  for (const anchor of boxes) {
    const middle = (anchor[0] + anchor[2]) / 2;
    let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const box of boxes) {
      let shift = 0;
      const centre = (box[0] + box[2]) / 2;
      while (centre + shift - middle > 180) shift -= 360;
      while (middle - (centre + shift) > 180) shift += 360;
      west = Math.min(west, box[0] + shift);
      east = Math.max(east, box[2] + shift);
      south = Math.min(south, box[1]);
      north = Math.max(north, box[3]);
    }
    if (!best || east - west < best[2] - best[0]) best = [west, south, east, north];
  }
  // Brought back so that its middle is a longitude the map knows.
  const middle = (best![0] + best![2]) / 2;
  const shift = middle > 180 ? -360 : middle < -180 ? 360 : 0;
  return [best![0] + shift, best![1], best![2] + shift, best![3]];
}

/** The overview of several scenarios: each as the screen fits it, all together. */
export function overviewFrame(scenarios: Array<{ result: EffectsResult; at: LatLon }>): PrintFrame {
  return { part: "overview", bbox: unionArea(scenarios.map(({ result, at }) => fitArea(result, at, FIRST_FIT_RATE))), reachesRate: null };
}

export interface PictureSize {
  /** On the page, in points. */
  width: number;
  height: number;
  /** In the map's own pixels (120 to the inch), whole steps of `MAP_PX_STEP`. */
  pixels: PixelSize;
}

/**
 * The size of a map's picture on the page: the shape its ground has on the map, as wide
 * as the text unless that would make it taller than `maxHeight`, and never narrower or
 * lower than a third of the text: a pattern running straight along a meridian or a
 * parallel is shown with more ground beside it rather than as a sliver. Whole pixels of
 * the map, so its scale is exact.
 */
export function pictureSize(bbox: Bbox, innerWidth: number, maxHeight: number): PictureSize {
  const { width, height } = mercatorSize(bbox);
  const aspect = width / height;
  const tall = Math.max(innerWidth / 3, Math.min(maxHeight, innerWidth / aspect));
  const wide = Math.max(innerWidth / 3, Math.min(innerWidth, tall * aspect));
  const whole = (points: number) => Math.max(MAP_PX_STEP, Math.floor(points / PT_PER_MAP_PX / MAP_PX_STEP) * MAP_PX_STEP);
  const pixels = { width: whole(wide), height: whole(tall) };
  return { width: pixels.width * PT_PER_MAP_PX, height: pixels.height * PT_PER_MAP_PX, pixels };
}

/** The deepest zoom a page is drawn at: past it, the basemap only magnifies, and a ring of a few metres is better told in words. */
export const DEEPEST_PRINT_ZOOM = 18;

/**
 * The view that shows the whole of a box in a picture of `pixels`: centred on the box as
 * the map draws it, at the zoom that fits both its width and its height.
 */
export function frameFor(bbox: Bbox, pixels: PixelSize): Frame {
  const { width, height } = mercatorSize(bbox);
  const zoom = Math.min(Math.log2(pixels.width / (width * 512)), Math.log2(pixels.height / (height * 512)), DEEPEST_PRINT_ZOOM);
  let lon = (bbox[0] + bbox[2]) / 2;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { center: { lon, lat: latitudeAt((mercatorY(bbox[1]) + mercatorY(bbox[3])) / 2) }, zoom: Math.max(0, zoom) };
}

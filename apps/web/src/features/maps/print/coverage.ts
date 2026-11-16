/**
 * How much of the area on the page the installed maps cover at the detail the page
 * needs. A sheet at 1:25,000 is drawn from zoom 13 tiles; where only a country-wide
 * region to zoom 10 is installed, the map is still drawn, but from coarser data
 * stretched to fit, and where nothing is installed only the outline of the world is.
 * Neither should come out of a printer as a surprise, so the preview says so first.
 *
 * Worked out from the boxes of the installed regions, with nothing fetched.
 */
import type { Bbox, InstalledRegion } from "@outpost/shared";
import { mercatorX, mercatorY } from "./scale";

/** Tiles are never made past this zoom at the source; closer in, the map magnifies them. */
export const DEEPEST_TILE_ZOOM = 15;

export interface Coverage {
  /** The zoom of the tiles this page is drawn from. */
  neededZoom: number;
  /** Fractions of the page's area: at the needed detail, from coarser tiles, and with no tiles at all. They sum to 1. */
  full: number;
  coarser: number;
  none: number;
  /** The deepest zoom installed anywhere in the coarser part, when there is one. */
  coarserZoom: number | null;
}

type Region = Pick<InstalledRegion, "bounds" | "maxZoom" | "tileType" | "available" | "status">;

/** The regions whose tiles can be read right now. */
export const readable = (region: Region) => region.available && (region.status === "installed" || region.status === "moving");

/** The whole zoom whose tiles the map asks for at a camera zoom. */
export const tileZoomFor = (zoom: number) => Math.max(0, Math.min(DEEPEST_TILE_ZOOM, Math.floor(zoom)));

export function mapCoverage(bbox: Bbox, regions: Region[], zoom: number, tileType: Region["tileType"] = "vector"): Coverage {
  const neededZoom = tileZoomFor(zoom);
  const page = { left: mercatorX(bbox[0]), right: mercatorX(bbox[2]), top: mercatorY(bbox[3]), bottom: mercatorY(bbox[1]) };
  const boxes = regions
    .filter((region) => region.tileType === tileType && readable(region))
    .map((region) => ({
      left: Math.max(page.left, mercatorX(region.bounds[0])),
      right: Math.min(page.right, mercatorX(region.bounds[2])),
      top: Math.max(page.top, mercatorY(region.bounds[3])),
      bottom: Math.min(page.bottom, mercatorY(region.bounds[1])),
      maxZoom: region.maxZoom,
    }))
    .filter((box) => box.left < box.right && box.top < box.bottom);

  // The edges of every region cut the page into cells; each cell lies wholly inside or outside each region.
  const xs = [...new Set([page.left, page.right, ...boxes.flatMap((box) => [box.left, box.right])])].sort((a, b) => a - b);
  const ys = [...new Set([page.top, page.bottom, ...boxes.flatMap((box) => [box.top, box.bottom])])].sort((a, b) => a - b);
  const total = (page.right - page.left) * (page.bottom - page.top);
  let full = 0;
  let coarser = 0;
  let coarserZoom: number | null = null;
  for (let column = 0; column < xs.length - 1; column += 1) {
    for (let row = 0; row < ys.length - 1; row += 1) {
      const x = (xs[column]! + xs[column + 1]!) / 2;
      const y = (ys[row]! + ys[row + 1]!) / 2;
      const area = (xs[column + 1]! - xs[column]!) * (ys[row + 1]! - ys[row]!);
      let deepest = -1;
      for (const box of boxes) {
        if (x > box.left && x < box.right && y > box.top && y < box.bottom) deepest = Math.max(deepest, box.maxZoom);
      }
      if (deepest >= neededZoom) full += area;
      else if (deepest >= 0) {
        coarser += area;
        coarserZoom = Math.max(coarserZoom ?? -1, deepest);
      }
    }
  }
  if (!(total > 0)) return { neededZoom, full: 0, coarser: 0, none: 1, coarserZoom: null };
  return { neededZoom, full: full / total, coarser: coarser / total, none: Math.max(0, 1 - (full + coarser) / total), coarserZoom };
}

/** A part too small to see on the page (a sliver along an edge) is not worth a warning. */
const WORTH_SAYING = 0.02;

/**
 * The sentence for the preview, or null when the whole page is covered at the detail it
 * needs. `hasTiles` is whether any detailed map is installed anywhere.
 */
export function coverageWarning(coverage: Coverage, hasTiles: boolean): { title: string; detail: string } | null {
  const share = (fraction: number) => (fraction > 0.995 ? "all" : `about ${Math.max(1, Math.round(fraction * 100))}%`);
  const fix = "Download the area under Offline maps for a detailed print.";
  if (!hasTiles || coverage.none > 0.995) {
    return {
      title: "No detailed map is installed for this area",
      detail: `The page would show only the outline of the world that comes with Outpost. ${fix}`,
    };
  }
  const parts: string[] = [];
  if (coverage.none >= WORTH_SAYING)
    parts.push(`${share(coverage.none)} of this area has no detailed map installed and will show only an outline`);
  if (coverage.coarser >= WORTH_SAYING) {
    parts.push(
      `${share(coverage.coarser)} of ${parts.length ? "it" : "this area"} is installed only to zoom ${coverage.coarserZoom}, where this scale needs zoom ${coverage.neededZoom}, and will be drawn with less detail than the rest`,
    );
  }
  if (parts.length === 0) return null;
  const sentence = `${parts.join("; ")}.`;
  return { title: "Part of this page will not be sharp", detail: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} ${fix}` };
}

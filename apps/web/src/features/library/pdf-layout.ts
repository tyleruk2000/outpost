/**
 * The arithmetic of a column of PDF pages: where each page sits, which ones are on
 * screen, and which one is "the page being read". Kept free of the DOM so a
 * thousand-page document never needs measuring, and so it can be tested.
 */

/** A page's size in CSS pixels at 100% zoom. */
export interface PageSize {
  width: number;
  height: number;
}

export interface PageLayout {
  /** Distance from the top of the scrolling content to the top of each page. */
  tops: number[];
  heights: number[];
  widths: number[];
  /** Full height of the content, padding included. */
  height: number;
  /** Width of the widest page. */
  width: number;
}

/** Space between pages, and around the column. */
export const PAGE_GAP = 12;
export const PAGE_PADDING = 16;

/** PDF units are 1/72 inch; CSS pixels are 1/96. At this scale 100% zoom is the page's real size. */
export const CSS_UNITS = 96 / 72;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** Fit-width stops growing here: a page stretched across a very wide window is harder to read, not easier. */
export const MAX_FIT_ZOOM = 1.75;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export function layoutPages(sizes: readonly PageSize[], zoom: number, gap = PAGE_GAP, padding = PAGE_PADDING): PageLayout {
  const tops: number[] = [];
  const heights: number[] = [];
  const widths: number[] = [];
  let y = padding;
  let width = 0;
  for (const size of sizes) {
    const pageHeight = Math.floor(size.height * zoom);
    const pageWidth = Math.floor(size.width * zoom);
    tops.push(y);
    heights.push(pageHeight);
    widths.push(pageWidth);
    width = Math.max(width, pageWidth);
    y += pageHeight + gap;
  }
  return { tops, heights, widths, width, height: sizes.length > 0 ? y - gap + padding : padding * 2 };
}

/** Index of the page at vertical position `y`: the last page that starts at or above it. */
export function pageAt(layout: PageLayout, y: number): number {
  let low = 0;
  let high = layout.tops.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (layout.tops[middle]! <= y) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, low);
}

/** First and last page index within `margin` pixels of the viewport. */
export function pagesNear(layout: PageLayout, scrollTop: number, viewportHeight: number, margin: number): [first: number, last: number] {
  if (layout.tops.length === 0) return [0, -1];
  return [pageAt(layout, scrollTop - margin), pageAt(layout, scrollTop + viewportHeight + margin)];
}

/**
 * The page being read: the one showing the largest share of itself. When several are
 * fully in view (zoomed out), the first of them.
 */
export function pageInView(layout: PageLayout, scrollTop: number, viewportHeight: number): number {
  const [first, last] = pagesNear(layout, scrollTop, viewportHeight, 0);
  let best = first;
  let bestShare = -1;
  for (let index = first; index <= last; index++) {
    const top = layout.tops[index]!;
    const height = layout.heights[index]!;
    const visible = Math.min(top + height, scrollTop + viewportHeight) - Math.max(top, scrollTop);
    const share = height > 0 ? Math.max(0, visible) / height : 0;
    if (share > bestShare + 0.001) {
      best = index;
      bestShare = share;
    }
  }
  return best;
}

/** The zoom at which a page of `pageWidth` fills a viewport of `viewportWidth`, within sensible limits. */
export function fitWidthZoom(pageWidth: number, viewportWidth: number, padding = PAGE_PADDING): number {
  if (pageWidth <= 0 || viewportWidth <= 0) return 1;
  const zoom = (viewportWidth - padding * 2) / pageWidth;
  return Math.min(MAX_FIT_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The next stop up or down from `zoom`, which may itself sit between stops (fit-width usually does). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const tolerance = 0.005;
  if (direction === 1) return ZOOM_STEPS.find((step) => step > zoom + tolerance) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - tolerance) ?? MIN_ZOOM;
}

/** A position that survives a change of layout: a page, and how far down it the viewport's top edge is. */
export interface ScrollAnchor {
  page: number;
  /** Offset from the page's top as a share of its height. Negative inside the gap above it. */
  share: number;
}

export function anchorAt(layout: PageLayout, scrollTop: number): ScrollAnchor {
  const page = pageAt(layout, scrollTop);
  const height = layout.heights[page] ?? 0;
  return { page, share: height > 0 ? (scrollTop - (layout.tops[page] ?? 0)) / height : 0 };
}

export function scrollTopFor(layout: PageLayout, anchor: ScrollAnchor): number {
  const page = Math.min(Math.max(anchor.page, 0), layout.tops.length - 1);
  if (page < 0) return 0;
  return Math.max(0, Math.round(layout.tops[page]! + anchor.share * layout.heights[page]!));
}

/** Where to scroll so that page `index` starts just under the top edge. */
export function scrollTopOfPage(layout: PageLayout, index: number): number {
  return Math.max(0, (layout.tops[index] ?? 0) - PAGE_GAP / 2);
}

import { describe, expect, it } from "vitest";
import {
  anchorAt,
  fitWidthZoom,
  layoutPages,
  MAX_FIT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  pageAt,
  pageInView,
  pagesNear,
  scrollTopFor,
  scrollTopOfPage,
  stepZoom,
} from "./pdf-layout";

const a4 = { width: 800, height: 1000 };
const pages = (count: number) => Array.from({ length: count }, () => a4);

describe("PDF page layout", () => {
  it("stacks pages with a gap, inside padding", () => {
    const layout = layoutPages(pages(3), 1, 10, 20);
    expect(layout.tops).toEqual([20, 1030, 2040]);
    expect(layout.height).toBe(20 + 3 * 1000 + 2 * 10 + 20);
    expect(layout.width).toBe(800);
  });

  it("scales sizes with the zoom, in whole pixels", () => {
    const layout = layoutPages([{ width: 793.7, height: 1122.5 }], 0.5, 10, 20);
    expect(layout.widths).toEqual([396]);
    expect(layout.heights).toEqual([561]);
  });

  it("finds the page at a position, including in the gaps and beyond the ends", () => {
    const layout = layoutPages(pages(3), 1, 10, 20);
    expect(pageAt(layout, 0)).toBe(0);
    expect(pageAt(layout, 1025)).toBe(0);
    expect(pageAt(layout, 1030)).toBe(1);
    expect(pageAt(layout, 99_999)).toBe(2);
  });

  it("lists only the pages near the viewport of a long document", () => {
    const layout = layoutPages(pages(1000), 1, 10, 20);
    const [first, last] = pagesNear(layout, layout.tops[499]!, 800, 800);
    expect(first).toBe(498);
    expect(last).toBe(500);
  });

  it("calls the page showing most of itself the page being read", () => {
    const layout = layoutPages(pages(3), 1, 10, 20);
    // The tail of page 1 and most of the viewport on page 2.
    expect(pageInView(layout, 900, 800)).toBe(1);
    // Mostly still page 1.
    expect(pageInView(layout, 300, 800)).toBe(0);
  });

  it("prefers the first page when several are fully in view", () => {
    const layout = layoutPages(pages(5), 0.2, 10, 20);
    expect(pageInView(layout, 0, 900)).toBe(0);
  });

  it("keeps the reading position through a change of zoom", () => {
    const before = layoutPages(pages(10), 1);
    const anchor = anchorAt(before, before.tops[6]! + 250);
    expect(anchor).toEqual({ page: 6, share: 0.25 });
    const after = layoutPages(pages(10), 2);
    expect(scrollTopFor(after, anchor)).toBe(after.tops[6]! + 500);
  });

  it("scrolls a page to just under the top edge", () => {
    const layout = layoutPages(pages(3), 1, 12, 16);
    expect(scrollTopOfPage(layout, 0)).toBe(10);
    expect(scrollTopOfPage(layout, 1)).toBe(layout.tops[1]! - 6);
  });

  it("fits the page to the width, within limits", () => {
    expect(fitWidthZoom(800, 432, 16)).toBe(0.5);
    expect(fitWidthZoom(800, 5000)).toBe(MAX_FIT_ZOOM);
    expect(fitWidthZoom(800, 0)).toBe(1);
  });

  it("steps to the next zoom stop from anywhere, and stops at the ends", () => {
    expect(stepZoom(0.95, 1)).toBe(1);
    expect(stepZoom(0.95, -1)).toBe(0.9);
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

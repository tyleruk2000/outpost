import { describe, expect, it } from "vitest";
import { pageGeometry } from "./paper";
import { BLEED, pieceCanvas, planNote, planRaster, SAFE_CANVAS_AREA, SAFE_CANVAS_SIDE, SMALL_DEVICE_CANVAS_AREA } from "./pieces";

const desktop = { maxSide: SAFE_CANVAS_SIDE, maxArea: SAFE_CANVAS_AREA };
const phone = { maxSide: SAFE_CANVAS_SIDE, maxArea: SMALL_DEVICE_CANVAS_AREA };
const a4 = pageGeometry("a4", "portrait").mapPixels;
const a3 = pageGeometry("a3", "portrait").mapPixels;

describe("drawing the map within what a canvas can hold", () => {
  it("draws A4 at 300 dots per inch in one go where 4,096 × 4,096 is allowed", () => {
    const plan = planRaster(a4, 300, desktop)!;
    // 896 × 1,188 map pixels at 2.5 device pixels each.
    expect(plan).toMatchObject({ dpi: 300, pixelRatio: 2.5, columns: 1, rows: 1, width: 2240, height: 2970, reduced: false });
    expect(plan.pieces).toEqual([{ x: 0, y: 0, width: 896, height: 1188, bleed: { left: 0, top: 0, right: 0, bottom: 0 } }]);
    expect(planNote(plan, 300)).toBe("");
  });

  it("draws A3 at 300 in two pieces, because it is taller than 4,096 pixels", () => {
    // 1,308 × 1,768 map pixels: 3,270 × 4,420 device pixels.
    expect(a3).toEqual({ width: 1308, height: 1768 });
    const plan = planRaster(a3, 300, desktop)!;
    expect(plan).toMatchObject({ dpi: 300, columns: 1, rows: 2, reduced: false });
    expect(plan.pieces).toHaveLength(2);
    expect(planNote(plan, 300)).toMatch(/drawn in 2 pieces/);
  });

  it("keeps every piece, bleed included, within the limits, on whole device pixels", () => {
    for (const limits of [desktop, phone, { maxSide: 2048, maxArea: 2048 * 2048 }]) {
      for (const pixels of [a4, a3, pageGeometry("letter", "landscape").mapPixels]) {
        for (const asked of [300, 150] as const) {
          const plan = planRaster(pixels, asked, limits)!;
          for (const piece of plan.pieces) {
            const canvas = pieceCanvas(piece, plan.pixelRatio);
            expect(canvas.width).toBeLessThanOrEqual(limits.maxSide);
            expect(canvas.height).toBeLessThanOrEqual(limits.maxSide);
            expect(canvas.width * canvas.height).toBeLessThanOrEqual(limits.maxArea);
            expect(canvas.width % 1).toBe(0);
            expect(canvas.height % 1).toBe(0);
            expect((piece.x * plan.pixelRatio) % 1).toBe(0);
            expect((piece.y * plan.pixelRatio) % 1).toBe(0);
          }
        }
      }
    }
  });

  it("covers the whole map exactly once, and bleeds only where two pieces meet", () => {
    const plan = planRaster(a3, 300, phone)!;
    expect(plan.pieces.length).toBeGreaterThan(2);
    let area = 0;
    for (const piece of plan.pieces) {
      area += piece.width * piece.height;
      expect(piece.bleed.left).toBe(piece.x === 0 ? 0 : BLEED);
      expect(piece.bleed.top).toBe(piece.y === 0 ? 0 : BLEED);
      expect(piece.bleed.right).toBe(piece.x + piece.width === a3.width ? 0 : BLEED);
      expect(piece.bleed.bottom).toBe(piece.y + piece.height === a3.height ? 0 : BLEED);
    }
    expect(area).toBe(a3.width * a3.height);
    const rows = [...new Set(plan.pieces.map((piece) => piece.y))];
    const columns = [...new Set(plan.pieces.map((piece) => piece.x))];
    expect(rows.length * columns.length).toBe(plan.pieces.length);
  });

  it("draws A4 in two pieces on a phone, at the resolution asked for", () => {
    const plan = planRaster(a4, 300, phone)!;
    // One piece would be 2,240 × 2,970 = 6.65 million pixels. Cut at 596 of the map's 1,188 pixels (a whole step), the
    // upper piece with its bleed is 2,240 × (596 + 128) × 2.5 = 2,240 × 1,810 = 4.05 million.
    expect(plan).toMatchObject({ dpi: 300, columns: 1, rows: 2, reduced: false });
    expect(pieceCanvas(plan.pieces[0]!, plan.pixelRatio)).toEqual({ width: 2240, height: 1810 });
  });

  it("lowers the resolution only when no grid of pieces fits, and says so", () => {
    const tiny = { maxSide: 1024, maxArea: 1024 * 512 };
    const plan = planRaster(a4, 300, tiny)!;
    expect(plan.reduced).toBe(true);
    expect(plan.dpi).toBeLessThan(300);
    expect(planNote(plan, 300)).toMatch(/cannot draw the page at 300 dots per inch, so it is drawn at \d+/);
    expect(planRaster(a4, 300, { maxSide: 64, maxArea: 64 * 64 })).toBeNull();
  });
});

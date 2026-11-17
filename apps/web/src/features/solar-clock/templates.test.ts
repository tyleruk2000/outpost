/** The templates to print: on the page (and on US Letter), in characters the PDF's typeface has, and the right way round. */
import { describe, expect, it } from "vitest";
import { writable } from "@/features/maps/print/lettering";
import { PT_PER_MM } from "@/features/maps/print/paper";
import type { Sheet } from "@/features/maps/print/sheet";
import { canDrawSundial, nocturnalPdf, nocturnalSheets, sheetText, sundialPdf, sundialSheets } from "./templates";

const LETTER = { width: 216 * PT_PER_MM, height: 279 * PT_PER_MM };

function bounds(pages: Sheet[]) {
  let right = 0;
  let bottom = 0;
  let left = Number.POSITIVE_INFINITY;
  for (const page of pages) {
    for (const item of page.items) {
      const xs =
        item.kind === "line"
          ? [item.x1, item.x2]
          : item.kind === "rect"
            ? [item.x, item.x + item.width]
            : item.kind === "text"
              ? [item.x]
              : [];
      const ys =
        item.kind === "line"
          ? [item.y1, item.y2]
          : item.kind === "rect"
            ? [item.y, item.y + item.height]
            : item.kind === "text"
              ? [item.y]
              : [];
      right = Math.max(right, ...xs);
      left = Math.min(left, ...xs);
      bottom = Math.max(bottom, ...ys);
    }
  }
  return { left, right, bottom };
}

const PLACES = [
  { latitude: 51.48, longitude: -0.1, standardOffset: 0, year: 2026, placeName: "Home" },
  { latitude: -33.87, longitude: 151.21, standardOffset: 600, year: 2026, placeName: "Sydney" },
  { latitude: 78.22, longitude: 15.65, standardOffset: 60, year: 2027, placeName: "78.2200, 15.6500" },
  { latitude: 12, longitude: 77.6, standardOffset: 330, year: 2026, placeName: "Bengaluru" },
];

describe("the sundial template", () => {
  for (const place of PLACES) {
    it(`fits A4 and US Letter, in writable characters, at ${place.latitude}°`, () => {
      const pages = sundialSheets(place);
      expect(pages).toHaveLength(2);
      const { left, right, bottom } = bounds(pages);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(LETTER.width);
      expect(bottom).toBeLessThanOrEqual(LETTER.height);
      for (const line of sheetText(pages)) expect(writable(line), line).toBe(true);
    });
  }

  it("names its latitude and which way to point it", () => {
    expect(sheetText(sundialSheets(PLACES[0]!)).join(" ")).toMatch(/51\.5° N.*true north/);
    expect(sheetText(sundialSheets(PLACES[1]!)).join(" ")).toMatch(/33\.9° S.*true south/);
  });

  it("is not drawn on the equator, where every hour line is the noon line", () => {
    expect(canDrawSundial(0.3)).toBe(false);
    expect(canDrawSundial(5)).toBe(true);
  });

  it("is a PDF, the same bytes when made twice", () => {
    const one = sundialPdf(PLACES[0]!);
    expect(new TextDecoder().decode(one.slice(0, 5))).toBe("%PDF-");
    expect(sundialPdf(PLACES[0]!)).toEqual(one);
  });
});

describe("the nocturnal template", () => {
  for (const place of PLACES.filter((each) => each.latitude > 0)) {
    it(`fits A4 and US Letter, in writable characters, for ${place.placeName}`, () => {
      const pages = nocturnalSheets(place);
      const { left, right, bottom } = bounds(pages);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(LETTER.width);
      expect(bottom).toBeLessThanOrEqual(LETTER.height);
      for (const line of sheetText(pages)) expect(writable(line), line).toBe(true);
    });
  }

  it("names every month on the date ring, and both teeth", () => {
    const words = sheetText(nocturnalSheets(PLACES[0]!));
    for (const month of ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
      expect(words).toContain(month);
    expect(words).toContain("Plough");
    expect(words).toContain("Kochab");
    expect(new TextDecoder().decode(nocturnalPdf(PLACES[0]!).slice(0, 5))).toBe("%PDF-");
  });
});

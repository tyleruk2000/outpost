import { MARKER_COLORS, MARKER_ICONS, type MarkerDto } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { MARKER_HEX } from "./palette";
import {
  BADGE,
  contrast,
  GLYPH_ON,
  iconOf,
  isDrawn,
  PLACE_GLYPHS,
  PLACE_ICON_NAMES,
  pageKey,
  parsePlaceImageId,
  pinGlyphOf,
  placeImageId,
} from "./place-icons";

/** Every number in a path, in order, whether it is a coordinate or part of an arc. */
const numbersIn = (path: string) => (path.match(/-?\d*\.?\d+/g) ?? []).map(Number);

describe("the icons a saved place can carry", () => {
  it("are sixteen, the plain pin first, each with a name of its own for the editor and a screen reader", () => {
    expect(MARKER_ICONS).toHaveLength(16);
    expect(MARKER_ICONS[0]).toBe("pin");
    expect(Object.keys(PLACE_ICON_NAMES).sort()).toEqual([...MARKER_ICONS].sort());
    const names = Object.values(PLACE_ICON_NAMES);
    expect(new Set(names).size).toBe(16);
    for (const name of names) {
      // Sentence case, a word or three.
      expect(name).toMatch(/^[A-Z][a-z]+( [a-z]+){0,2}$/);
    }
    expect(PLACE_ICON_NAMES).toMatchObject({ pin: "Pin", shelter: "Shelter or hut", parking: "Car park", "first-aid": "First aid" });
  });

  it("each have a drawing, except the pin, which is the dot every place had before", () => {
    expect(Object.keys(PLACE_GLYPHS).sort()).toEqual(MARKER_ICONS.filter((icon) => icon !== "pin").sort());
    expect(isDrawn("pin")).toBe(false);
    for (const icon of MARKER_ICONS) if (icon !== "pin") expect(isDrawn(icon), icon).toBe(true);
  });

  it("are drawn with a few strokes that keep inside the grid, so none is clipped by the disc it sits on", () => {
    for (const [icon, glyph] of Object.entries(PLACE_GLYPHS)) {
      const paths = [...glyph.strokes, ...(glyph.fills ?? [])];
      expect(paths.length, icon).toBeGreaterThanOrEqual(1);
      // Simple enough to read at the size of a marker.
      expect(paths.length, icon).toBeLessThanOrEqual(5);
      for (const path of paths) {
        // Path data and nothing else: it is handed to SVG and to a canvas as it is.
        expect(path, icon).toMatch(/^M[\dMLHVCSQAZmlhvcsqaz .,-]+$/);
        // Where each path starts is on the grid, inside the margin the round ends of a stroke need.
        const [x, y] = numbersIn(path) as [number, number];
        expect(x, `${icon}: ${path}`).toBeGreaterThanOrEqual(2);
        expect(x, `${icon}: ${path}`).toBeLessThanOrEqual(22);
        expect(y, `${icon}: ${path}`).toBeGreaterThanOrEqual(2);
        expect(y, `${icon}: ${path}`).toBeLessThanOrEqual(22);
      }
    }
    // No two icons are the same drawing.
    const drawings = Object.values(PLACE_GLYPHS).map((glyph) => JSON.stringify(glyph));
    expect(new Set(drawings).size).toBe(drawings.length);
  });

  it("are drawn in a colour that holds against every marker colour: white, or near-black on amber", () => {
    for (const color of MARKER_COLORS) {
      expect(contrast(GLYPH_ON[color], MARKER_HEX[color]), color).toBeGreaterThanOrEqual(3);
      // White wherever white reaches 3:1, so the set looks like one set.
      if (contrast("#ffffff", MARKER_HEX[color]) >= 3) expect(GLYPH_ON[color], color).toBe("#ffffff");
    }
    expect(GLYPH_ON.amber).not.toBe("#ffffff");
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("fit the disc they are drawn on, corners and all", () => {
    // The icon's box, less the grid's margin, has to lie inside the disc.
    const half = (BADGE.glyph * (20 / 24)) / 2;
    expect(Math.hypot(half, half)).toBeLessThanOrEqual(BADGE.radius);
  });
});

describe("a place's icon, whatever it was given as", () => {
  const place = (icon: unknown) => ({ icon }) as unknown as Pick<MarkerDto, "icon">;

  it("is the icon when it is one of the set", () => {
    for (const icon of MARKER_ICONS) expect(iconOf(place(icon))).toBe(icon);
  });

  it("is the plain pin for a place kept before there were icons, or with a name this Outpost does not draw", () => {
    expect(iconOf({})).toBe("pin");
    expect(iconOf(place(null))).toBe("pin");
    expect(iconOf(place("lighthouse"))).toBe("pin");
    expect(iconOf(place("toString"))).toBe("pin");
    expect(iconOf(place(""))).toBe("pin");
  });
});

describe("the names of the pictures the map draws for places", () => {
  it("say the icon, the colour and the page colour, and are read back the same", () => {
    expect(placeImageId("tent", "teal", "#ffffff")).toBe("place-tent-teal-ffffff");
    expect(placeImageId("first-aid", "amber", "#141A1C")).toBe("place-first-aid-amber-141a1c");
    for (const icon of MARKER_ICONS) {
      if (!isDrawn(icon)) continue;
      for (const color of MARKER_COLORS) {
        expect(parsePlaceImageId(placeImageId(icon, color, "#141a1c"))).toEqual({ icon, color, page: "#141a1c" });
      }
    }
  });

  it("take a page colour that is not six hex digits as white, never as part of the name", () => {
    expect(pageKey("#fff")).toBe("ffffff");
    expect(pageKey("oklch(1 0 0)")).toBe("ffffff");
    expect(pageKey("#ABCDEF")).toBe("abcdef");
  });

  it("are not mistaken for anything else the map may ask for", () => {
    for (const id of [
      "",
      "townspot",
      "place",
      "place-pin-teal-ffffff",
      "place-tent-pink-ffffff",
      "place-tent-teal",
      "place-tent-teal-fff",
      "place-tent-teal-ffffff-extra",
      "place-toString-teal-ffffff",
      "place-tent-constructor-ffffff",
      "place-__proto__-teal-ffffff",
      "Place-tent-teal-ffffff",
    ]) {
      expect(parsePlaceImageId(id), id).toBeNull();
    }
  });
});

describe("the icon in the head of the pin, while a place is edited or moved", () => {
  it("is the place's own, in the colour that holds against the pin's, and nothing for a plain pin", () => {
    expect(pinGlyphOf("pin", "teal")).toBeUndefined();
    expect(pinGlyphOf("tent", "teal")).toEqual({ id: "tent-teal", ...PLACE_GLYPHS.tent, color: "#ffffff" });
    expect(pinGlyphOf("tent", "amber")?.color).toBe(GLYPH_ON.amber);
    expect(pinGlyphOf("tent", "amber")?.id).not.toBe(pinGlyphOf("tent", "teal")?.id);
  });
});

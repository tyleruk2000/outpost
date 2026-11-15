import type { Bbox } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  BOX_HANDLES,
  boxHandleName,
  boxHandlePosition,
  edgeHandleFits,
  edgeValue,
  isCornerHandle,
  middleLatitude,
  moveBoxHandle,
} from "./box-handles";
import { boxFromCorners } from "./geo";
import { arrowNudge, NUDGE_PIXELS, NUDGE_PIXELS_LARGE } from "./nudge";

/** [west, south, east, north]: the Lake District, roughly. */
const box: Bbox = [-3.4, 54.3, -2.8, 54.7];
const bboxOf = (result: ReturnType<typeof moveBoxHandle>) => {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.bbox;
};

describe("the handles of the download box", () => {
  it("are four edges and four corners, each with a name", () => {
    expect(BOX_HANDLES).toHaveLength(8);
    expect(BOX_HANDLES.filter(isCornerHandle)).toEqual(["nw", "ne", "se", "sw"]);
    expect(BOX_HANDLES.map(boxHandleName)).toEqual([
      "North edge",
      "East edge",
      "South edge",
      "West edge",
      "North-west corner",
      "North-east corner",
      "South-east corner",
      "South-west corner",
    ]);
  });

  it("sit on the corners and in the middle of the edges", () => {
    expect(boxHandlePosition(box, "nw")).toEqual({ lat: 54.7, lon: -3.4 });
    expect(boxHandlePosition(box, "se")).toEqual({ lat: 54.3, lon: -2.8 });
    expect(boxHandlePosition(box, "n").lat).toBe(54.7);
    expect(boxHandlePosition(box, "n").lon).toBeCloseTo(-3.1, 10);
    expect(boxHandlePosition(box, "w").lon).toBe(-3.4);
    expect(boxHandlePosition(box, "w").lat).toBeCloseTo(54.5, 2);
    expect(boxHandlePosition(box, "e").lat).toBe(boxHandlePosition(box, "w").lat);
  });

  it("put a side handle half-way up the box as the map draws it, not half-way in degrees", () => {
    // Mercator stretches towards the pole: the drawn middle of a tall box is north of the average.
    expect(middleLatitude(0, 80)).toBeGreaterThan(50);
    expect(middleLatitude(-40, 40)).toBeCloseTo(0, 10);
    expect(middleLatitude(54.3, 54.7)).toBeCloseTo(54.5, 2);
  });
});

describe("moving a handle", () => {
  it("moves one edge and leaves the other three where they are", () => {
    expect(bboxOf(moveBoxHandle(box, "n", { lat: 54.9, lon: 12 }))).toEqual([-3.4, 54.3, -2.8, 54.9]);
    expect(bboxOf(moveBoxHandle(box, "s", { lat: 54.1, lon: 12 }))).toEqual([-3.4, 54.1, -2.8, 54.7]);
    expect(bboxOf(moveBoxHandle(box, "e", { lat: 10, lon: -2.5 }))).toEqual([-3.4, 54.3, -2.5, 54.7]);
    expect(bboxOf(moveBoxHandle(box, "w", { lat: 10, lon: -3.9 }))).toEqual([-3.9, 54.3, -2.8, 54.7]);
  });

  it("moves two edges from a corner, exactly as dragging a corner always has", () => {
    const to = { lat: 54.85, lon: -3.75 };
    expect(moveBoxHandle(box, "nw", to)).toEqual(boxFromCorners(to, { lat: 54.3, lon: -2.8 }));
    expect(bboxOf(moveBoxHandle(box, "nw", to))).toEqual([-3.75, 54.3, -2.8, 54.85]);
    expect(bboxOf(moveBoxHandle(box, "ne", { lat: 54.8, lon: -2.6 }))).toEqual([-3.4, 54.3, -2.6, 54.8]);
    expect(bboxOf(moveBoxHandle(box, "se", { lat: 54.2, lon: -2.6 }))).toEqual([-3.4, 54.2, -2.6, 54.7]);
    expect(bboxOf(moveBoxHandle(box, "sw", { lat: 54.2, lon: -3.6 }))).toEqual([-3.6, 54.2, -2.8, 54.7]);
  });

  it("turns the box inside out when a handle is taken past the opposite side", () => {
    expect(bboxOf(moveBoxHandle(box, "n", { lat: 54.1, lon: 0 }))).toEqual([-3.4, 54.1, -2.8, 54.3]);
    expect(bboxOf(moveBoxHandle(box, "w", { lat: 0, lon: -2.2 }))).toEqual([-2.8, 54.3, -2.2, 54.7]);
  });

  it("keeps the limits a drawn box has", () => {
    expect(moveBoxHandle(box, "n", { lat: 54.3001, lon: 0 })).toEqual({ ok: false, reason: "too-small" });
    expect(moveBoxHandle(box, "e", { lat: 0, lon: -3.4 })).toEqual({ ok: false, reason: "too-small" });
    expect(bboxOf(moveBoxHandle(box, "n", { lat: 89.9, lon: 0 }))[3]).toBe(85.0511);
    const pacific: Bbox = [170, -20, 179, -10];
    expect(moveBoxHandle(pacific, "e", { lat: 0, lon: 185 })).toEqual({ ok: false, reason: "antimeridian" });
  });
});

describe("what an edge handle tells assistive technology", () => {
  it("is the latitude or longitude of its edge, in words", () => {
    expect(edgeValue(box, "n")).toMatchObject({ now: 54.7, text: "54.7000° north" });
    expect(edgeValue(box, "s")).toMatchObject({ now: 54.3, text: "54.3000° north", min: -85.0511, max: 85.0511 });
    expect(edgeValue(box, "w")).toMatchObject({ now: -3.4, text: "3.4000° west", min: -180, max: 180 });
    expect(edgeValue([10, -20, 12, -10], "e").text).toBe("12.0000° east");
    expect(edgeValue([10, -20, 12, -10], "s").text).toBe("20.0000° south");
  });
});

describe("room for a handle on an edge", () => {
  it("needs the edge to clear the 44 px targets of the corners at either end", () => {
    expect(edgeHandleFits(87)).toBe(false);
    expect(edgeHandleFits(88)).toBe(true);
    expect(edgeHandleFits(400)).toBe(true);
  });
});

describe("arrow keys", () => {
  it("step a few pixels, and further with Shift", () => {
    expect(arrowNudge("ArrowUp", false)).toEqual({ x: 0, y: -NUDGE_PIXELS });
    expect(arrowNudge("ArrowDown", false)).toEqual({ x: 0, y: NUDGE_PIXELS });
    expect(arrowNudge("ArrowLeft", false)).toEqual({ x: -NUDGE_PIXELS, y: 0 });
    expect(arrowNudge("ArrowRight", true)).toEqual({ x: NUDGE_PIXELS_LARGE, y: 0 });
    expect(NUDGE_PIXELS_LARGE).toBeGreaterThan(NUDGE_PIXELS);
  });

  it("leave every other key alone", () => {
    for (const key of ["Enter", "Escape", "Tab", " ", "a", "Home", "PageUp"]) expect(arrowNudge(key, false)).toBeNull();
  });
});

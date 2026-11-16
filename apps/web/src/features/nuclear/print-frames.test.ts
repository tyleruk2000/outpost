import { type Bbox, computeEffects, type EffectsInput, type EffectsResult } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { frameBox, mercatorX, mercatorY } from "@/features/maps/print/scale";
import { fitArea } from "./fallout";
import { destination, plumePolygon } from "./geometry";
import {
  FIRST_FIT_RATE,
  frameFor,
  MAX_PICTURE_HEIGHT,
  OUTERMOST_RATE,
  overviewFrame,
  pictureSize,
  scenarioFrames,
  unionArea,
} from "./print-frames";

const work = (effects: EffectsInput): EffectsResult => {
  const answer = computeEffects(effects);
  if (!answer.ok) throw new Error(answer.problems.join(" "));
  return answer.result;
};
const A4_INNER = 595.28 - 84;

/** Longitude kept within half a world of a reference, as the boxes keep it across the antimeridian. */
const near = (lon: number, to: number) => {
  let value = lon;
  while (value - to > 180) value -= 360;
  while (to - value > 180) value += 360;
  return value;
};
const inside = (box: Bbox, [lon, lat]: [number, number], slack = 1e-9) => {
  const x = near(lon, (box[0] + box[2]) / 2);
  return x >= box[0] - slack && x <= box[2] + slack && lat >= box[1] - slack && lat <= box[3] + slack;
};
/** The ground a frame shows, given the box it was made for, with the same longitudes. */
const shown = (box: Bbox) => {
  const size = pictureSize(box, A4_INNER, MAX_PICTURE_HEIGHT);
  const frame = frameFor(box, size.pixels);
  const ground = frameBox(frame, size.pixels);
  const shift = near(ground[0], box[0]) - ground[0];
  return { size, frame, ground: [ground[0] + shift, ground[1], ground[2] + shift, ground[3]] as Bbox };
};
/** The frame shows the whole box, and is not much more than it along at least one side. */
const fits = (box: Bbox) => {
  const { ground } = shown(box);
  expect(ground[0]).toBeLessThanOrEqual(box[0] + 1e-9);
  expect(ground[2]).toBeGreaterThanOrEqual(box[2] - 1e-9);
  expect(ground[1]).toBeLessThanOrEqual(box[1] + 1e-9);
  expect(ground[3]).toBeGreaterThanOrEqual(box[3] - 1e-9);
  const wide = (mercatorX(ground[2]) - mercatorX(ground[0])) / (mercatorX(box[2]) - mercatorX(box[0]));
  const high = (mercatorY(ground[1]) - mercatorY(ground[3])) / (mercatorY(box[1]) - mercatorY(box[3]));
  // Whole pixels cost a little: within 3% along the side that decides the zoom.
  expect(Math.min(wide, high)).toBeLessThan(1.03);
};

describe("the frames of a scenario's PDF", () => {
  it("frames rings alone so that the widest ring fills the picture", () => {
    const at = { lat: 51.5, lon: -0.12 };
    const result = work({ yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: null });
    const frames = scenarioFrames(result, at);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ part: "rings", reachesRate: null });
    const widest = Math.max(...result.rings.map((ring) => ring.metres ?? 0));
    for (const bearing of [0, 90, 180, 270]) {
      const edge = destination(at, bearing, widest);
      expect(inside(frames[0]!.bbox, [edge.lon, edge.lat])).toBe(true);
    }
    fits(frames[0]!.bbox);
    // A ring is a circle on the ground, so the picture of it is near enough square.
    const { size } = shown(frames[0]!.bbox);
    expect(size.width / size.height).toBeGreaterThan(0.9);
    expect(size.width / size.height).toBeLessThan(1.1);
    expect(size.height).toBeLessThanOrEqual(MAX_PICTURE_HEIGHT);
  });

  it("gives a scenario with a fallout pattern a second map that reaches the 100 rads per hour contour, the outer ones running past", () => {
    const at = { lat: 51.5, lon: -0.12 };
    const result = work({ yieldKt: 1000, burst: { kind: "surface" }, wind: { fromDegrees: 250, kmh: 40 } });
    if (!result.fallout.drawn) throw new Error("expected a pattern");
    const frames = scenarioFrames(result, at);
    expect(frames.map((frame) => frame.part)).toEqual(["rings", "pattern"]);
    expect(frames[1]!.reachesRate).toBe(FIRST_FIT_RATE);
    const contour = (rate: number) => result.fallout.drawn && result.fallout.contours.find((each) => each.rate === rate)!;
    const hundred = plumePolygon(at, contour(100) as never, result.fallout.fromDegrees, 48);
    for (const point of hundred) expect(inside(frames[1]!.bbox, point, 1e-6)).toBe(true);
    // The 1 rads per hour contour runs on past the frame: one picture cannot show both.
    const one = plumePolygon(at, contour(1) as never, result.fallout.fromDegrees, 48);
    expect(one.some((point) => !inside(frames[1]!.bbox, point))).toBe(true);
    // The first map is the rings only, much closer in.
    expect(frames[0]!.bbox[2] - frames[0]!.bbox[0]).toBeLessThan((frames[1]!.bbox[2] - frames[1]!.bbox[0]) / 1.6);
    fits(frames[0]!.bbox);
    fits(frames[1]!.bbox);
  });

  it("takes in the whole pattern when the 100 rads per hour contour hardly reaches past the rings", () => {
    const at = { lat: 51.5, lon: -0.12 };
    const result = work({ yieldKt: 1, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } });
    const frames = scenarioFrames(result, at);
    const last = frames.at(-1)!;
    // Whichever way it falls, the last map says the contour it reaches, and that contour is inside it.
    expect(last.reachesRate === OUTERMOST_RATE || last.reachesRate === FIRST_FIT_RATE).toBe(true);
    expect(last.bbox).toEqual(fitArea(result, at, last.reachesRate!));
  });

  it("frames an overview of far-apart scenarios that takes them all in", () => {
    const london = { lat: 51.5, lon: -0.12 };
    const york = { lat: 40.7, lon: -74 };
    const tokyo = { lat: 35.7, lon: 139.7 };
    const result = work({ yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: null });
    const frame = overviewFrame([london, york, tokyo].map((at) => ({ result, at })));
    expect(frame.part).toBe("overview");
    for (const at of [london, york, tokyo]) expect(inside(frame.bbox, [at.lon, at.lat])).toBe(true);
    fits(frame.bbox);
    // The narrower way round: London to Tokyo westward across America is longer than eastward across Asia.
    expect(frame.bbox[2] - frame.bbox[0]).toBeLessThan(360);
  });

  it("frames a scenario at high latitude: the box is wider in degrees, the picture still square", () => {
    const at = { lat: 70, lon: 23.7 };
    const result = work({ yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: null });
    const [box] = scenarioFrames(result, at);
    const degreesWide = box!.bbox[2] - box!.bbox[0];
    const degreesHigh = box!.bbox[3] - box!.bbox[1];
    // About 1/cos(70°) = 2.9 times as many degrees across as up and down.
    expect(degreesWide / degreesHigh).toBeGreaterThan(2.6);
    expect(degreesWide / degreesHigh).toBeLessThan(3.2);
    const { size } = shown(box!.bbox);
    expect(size.width / size.height).toBeGreaterThan(0.9);
    expect(size.width / size.height).toBeLessThan(1.1);
    fits(box!.bbox);
  });

  it("frames a scenario across the antimeridian as the small box round it, not the whole world", () => {
    const at = { lat: -16.5, lon: 179.95 };
    const result = work({ yieldKt: 100, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 30 } });
    const frames = scenarioFrames(result, at);
    for (const frame of frames) {
      expect(frame.bbox[0]).toBeLessThan(180);
      expect(frame.bbox[2]).toBeGreaterThan(180);
      expect(frame.bbox[2] - frame.bbox[0]).toBeLessThan(10);
      fits(frame.bbox);
      // The view is centred on a longitude the map knows.
      const { frame: view } = shown(frame.bbox);
      expect(Math.abs(view.center.lon)).toBeLessThanOrEqual(180);
    }
    // Two scenarios either side of it are joined across it.
    const other = { lat: -16.6, lon: -179.9 };
    const overview = overviewFrame([at, other].map((place) => ({ result, at: place })));
    expect(overview.bbox[2] - overview.bbox[0]).toBeLessThan(10);
    expect(inside(overview.bbox, [at.lon, at.lat])).toBe(true);
    expect(inside(overview.bbox, [other.lon, other.lat])).toBe(true);
  });

  it("joins boxes the narrower way round the world", () => {
    expect(unionArea([[170, 0, 175, 5]])).toEqual([170, 0, 175, 5]);
    const joined = unionArea([
      [170, 0, 175, 5],
      [-175, -2, -170, 3],
    ]);
    expect(joined[2] - joined[0]).toBeCloseTo(20);
    expect(joined[1]).toBe(-2);
    expect(joined[3]).toBe(5);
    expect(
      unionArea([
        [-10, 0, -5, 5],
        [5, 0, 10, 5],
      ]),
    ).toEqual([-10, 0, 10, 5]);
  });

  it("keeps a picture no narrower or lower than a third of the text, whatever the shape of its ground", () => {
    const long: Bbox = [0, 50, 4, 50.05];
    const tall: Bbox = [0, 50, 0.05, 52];
    for (const box of [long, tall]) {
      const size = pictureSize(box, A4_INNER, MAX_PICTURE_HEIGHT);
      expect(size.width).toBeGreaterThanOrEqual(A4_INNER / 3 - 4);
      expect(size.height).toBeGreaterThanOrEqual(A4_INNER / 3 - 4);
      expect(size.width).toBeLessThanOrEqual(A4_INNER);
      expect(size.pixels.width % 4).toBe(0);
      fits(box);
    }
  });
});

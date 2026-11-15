import { describe, expect, it } from "vitest";
import { buildProfile, profileGeometry, sampleAt, trackEnds, trackLines } from "./profile";

const collection = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });
const line = (coordinates: number[][]) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } });

const climb = collection([
  { type: "Feature", properties: { name: "Car park" }, geometry: { type: "Point", coordinates: [-2.962, 54.432, 55] } },
  line([
    [-2.962, 54.432, 55],
    [-2.962, 54.442, 180],
    [-2.962, 54.452, 150],
    [-2.962, 54.462, 400],
  ]),
]);

describe("trackLines", () => {
  it("takes lines and multi-lines, and leaves waypoints out", () => {
    const lines = trackLines(
      collection([
        ...climb.features,
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [0, 0],
                [1, 1],
              ],
              [[2, 2]],
              [
                [3, 3],
                [4, 4],
              ],
            ],
          },
        },
        null,
        { type: "Feature", properties: {} },
      ]),
    );
    // The one-point segment cannot be drawn and is dropped.
    expect(lines.map((item) => item.length)).toEqual([4, 2, 2]);
  });

  it("finds where a track starts and ends", () => {
    expect(trackEnds(trackLines(climb))).toEqual({ start: [-2.962, 54.432, 55], end: [-2.962, 54.462, 400] });
    expect(trackEnds([])).toBeNull();
  });
});

describe("buildProfile", () => {
  it("samples height against distance along the track", () => {
    const profile = buildProfile(climb)!;
    expect(profile.samples).toHaveLength(4);
    expect(profile.samples[0]).toMatchObject({ distance: 0, elevation: 55, lat: 54.432, lon: -2.962 });
    // Each step is 0.01° of latitude: about 1.11 km.
    expect(profile.samples[1]!.distance).toBeCloseTo(1112, 0);
    expect(profile.totalMeters).toBeCloseTo(3336, 0);
    expect(profile.minElevation).toBe(55);
    expect(profile.maxElevation).toBe(400);
  });

  it("is null when the file carried no heights", () => {
    expect(
      buildProfile(
        collection([
          line([
            [0, 0],
            [0, 1],
            [0, 2],
          ]),
        ]),
      ),
    ).toBeNull();
    expect(buildProfile(collection([]))).toBeNull();
  });

  it("skips points without a height but still counts their distance", () => {
    const profile = buildProfile(
      collection([
        line([
          [0, 0, 10],
          [0, 0.01],
          [0, 0.02, 30],
        ]),
      ]),
    )!;
    expect(profile.samples).toHaveLength(2);
    expect(profile.samples[1]!.distance).toBeCloseTo(2224, 0);
  });

  it("does not count the gap between two segments as distance travelled", () => {
    const profile = buildProfile(
      collection([
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [0, 0, 10],
                [0, 0.01, 20],
              ],
              [
                [0, 1, 30],
                [0, 1.01, 40],
              ],
            ],
          },
        },
      ]),
    )!;
    expect(profile.totalMeters).toBeCloseTo(2224, 0);
  });

  it("thins long recordings and keeps the highest and lowest points", () => {
    const coordinates = Array.from({ length: 5000 }, (_, index) => [
      0,
      index * 0.0001,
      index === 1234 ? 999 : index === 4321 ? -5 : 100 + (index % 7),
    ]);
    const profile = buildProfile(collection([line(coordinates)]), 200)!;
    expect(profile.samples.length).toBeLessThanOrEqual(202);
    expect(profile.maxElevation).toBe(999);
    expect(profile.minElevation).toBe(-5);
    expect(profile.samples.some((sample) => sample.elevation === 999)).toBe(true);
    expect(profile.samples.some((sample) => sample.elevation === -5)).toBe(true);
    expect(profile.samples.every((sample, index, all) => index === 0 || sample.distance >= all[index - 1]!.distance)).toBe(true);
  });
});

describe("profileGeometry", () => {
  const pad = { top: 10, right: 10, bottom: 20, left: 10 };

  it("maps distance to x and height to y inside the padding", () => {
    const profile = buildProfile(climb)!;
    const geometry = profileGeometry(profile, 320, 130, pad);
    expect(geometry.x(0)).toBe(10);
    expect(geometry.x(profile.totalMeters)).toBe(310);
    expect(geometry.y(400)).toBe(10);
    expect(geometry.y(55)).toBe(110);
    expect(geometry.line.startsWith("M10.0,110.0L")).toBe(true);
    expect(geometry.line.endsWith("310.0,10.0")).toBe(true);
    expect(geometry.area.endsWith("L310.0,110.0L10.0,110.0Z")).toBe(true);
  });

  it("draws a flat track mid-height instead of dividing by zero", () => {
    const profile = buildProfile(
      collection([
        line([
          [0, 0, 50],
          [0, 0.01, 50],
        ]),
      ]),
    )!;
    expect(profileGeometry(profile, 320, 130, pad).y(50)).toBe(60);
  });
});

describe("sampleAt", () => {
  it("finds the nearest sample to a distance", () => {
    const profile = buildProfile(climb)!;
    expect(sampleAt(profile, 0).elevation).toBe(55);
    expect(sampleAt(profile, 1000).elevation).toBe(180);
    expect(sampleAt(profile, 1800).elevation).toBe(150);
    expect(sampleAt(profile, 99_999).elevation).toBe(400);
    expect(sampleAt(profile, -5).elevation).toBe(55);
  });
});

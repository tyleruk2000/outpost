import { analyseSight, type SightInput, sightSamples, type TerrainProfile } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  BANDS,
  columnAt,
  DEFAULT_SIGHT_SETTINGS,
  describeGaps,
  describeSample,
  describeTerrain,
  formatFrequency,
  formatMeters,
  frequencyOf,
  isSightSettings,
  readSight,
  sightChartGeometry,
} from "./sight";

/** 20 km sampled every 10 m: level ground at `base`, plus whatever `shape` adds. */
function ground(base: number, shape: (meters: number) => number = () => 0): Array<number | null> {
  return Array.from({ length: 2001 }, (_, index) => base + shape(index * 10));
}
const ridge = (height: number) => (meters: number) => Math.max(0, height * (1 - Math.abs(meters - 10_000) / 500));

function profileOf(heights: Array<number | null>): TerrainProfile {
  const gaps: TerrainProfile["gaps"] = [];
  for (let index = 0; index < heights.length; index += 1) {
    if (heights[index] !== null) continue;
    const start = index;
    while (index + 1 < heights.length && heights[index + 1] === null) index += 1;
    gaps.push({ startMeters: start * 10, endMeters: index * 10 });
  }
  const known = heights.filter((height) => height !== null).length;
  return {
    from: { lat: 53, lon: -4.1 },
    to: { lat: 53, lon: -3.8 },
    distanceMeters: 20_000,
    stepMeters: 10,
    heights,
    coverage: known === 0 ? "none" : known === heights.length ? "terrain" : "partial",
    gaps,
    terrain: known === 0 ? null : { finestCellMeters: 11.5, coarsestCellMeters: 11.5, installedMaxZoom: 12 },
  };
}
const inputOf = (profile: TerrainProfile, antenna = 10, frequencyMHz = 145): SightInput => ({
  distanceMeters: profile.distanceMeters,
  heights: profile.heights,
  antennaFromMeters: antenna,
  antennaToMeters: antenna,
  frequencyMHz,
});
const read = (heights: Array<number | null>, antenna = 10, frequencyMHz = 145) => {
  const profile = profileOf(heights);
  return readSight(profile, analyseSight(inputOf(profile, antenna, frequencyMHz)));
};

describe("what the line-of-sight tool asks", () => {
  it("offers bands by name with the frequency each stands for, and remembers only what it can use", () => {
    expect(BANDS.map((band) => band.name)).toEqual(["10 m", "6 m", "4 m", "2 m", "70 cm", "PMR446", "23 cm", "13 cm"]);
    expect(frequencyOf(DEFAULT_SIGHT_SETTINGS)).toBe(145);
    expect(frequencyOf({ ...DEFAULT_SIGHT_SETTINGS, band: "70cm" })).toBe(435);
    expect(frequencyOf({ ...DEFAULT_SIGHT_SETTINGS, band: "other", otherMHz: 222.1 })).toBe(222.1);
    expect(isSightSettings(DEFAULT_SIGHT_SETTINGS)).toBe(true);
    for (const broken of [
      null,
      {},
      { ...DEFAULT_SIGHT_SETTINGS, antennaFrom: -1 },
      { ...DEFAULT_SIGHT_SETTINGS, band: "11m" },
      { ...DEFAULT_SIGHT_SETTINGS, otherMHz: 0 },
    ]) {
      expect(isSightSettings(broken)).toBe(false);
    }
    expect(formatFrequency(145)).toBe("145 MHz");
    expect(formatFrequency(70.25)).toBe("70.25 MHz");
    expect(formatFrequency(2320)).toBe("2.32 GHz");
    expect(formatMeters(4.114)).toBe("4.1 m");
    expect(formatMeters(-45.886)).toBe("46 m");
    expect(formatMeters(1085.4)).toBe("1,085 m");
  });
});

describe("the answer in words", () => {
  it("says what is in the way, by how much and how far along", () => {
    const reading = read(ground(100, ridge(50)));
    expect(reading.tone).toBe("danger");
    expect(reading.title).toBe("Blocked");
    expect(reading.sentences[0]).toBe(
      "Ground stands in the way. At its worst, 10.0 km from A, it is 46 m above the straight line between the antennas.",
    );
    expect(reading.sentences[1]).toBe("It is above the line for 910 m of the path, between 9.55 km and 10.4 km from A.");
    expect(reading.sentences).toHaveLength(2);
    expect(reading.mark).toEqual({ distanceMeters: 10_000, label: "46 m in the way" });
  });

  it("says how much of the first Fresnel zone is clear, against the 60% guide", () => {
    const low = read(ground(100));
    expect(low.tone).toBe("warning");
    expect(low.title).toBe("In sight, with the Fresnel zone partly blocked");
    expect(low.sentences.join(" ")).toContain("10.0 km from A, where the ray passes 4.1 m above the ground and the zone's radius is 102 m");
    expect(low.sentences.join(" ")).toContain("That is 4% of the radius clear, where the usual guide asks for 60%.");
    expect(low.mark).toEqual({ distanceMeters: 10_000, label: "4% clear" });

    const valley = ground(100);
    valley[0] = 500;
    valley[2000] = 500;
    const high = read(valley, 10, 435);
    expect(high.tone).toBe("success");
    expect(high.title).toBe("Clear");
    expect(high.sentences.join(" ")).toContain("where the ray passes 404 m above the ground and the zone's radius is 59 m");
    expect(high.sentences.join(" ")).toContain("That is 6.9 times the radius; the usual guide asks for 60% of it.");
    expect(high.mark?.label).toBe("Tightest");

    // Clear, with less than the whole radius to spare.
    const near = read(ground(100), 60, 435);
    expect(near.title).toBe("Clear");
    expect(near.sentences.join(" ")).toMatch(/That is 9\d% of the radius clear; the usual guide asks for 60%\./);
  });

  it("does not call a path clear when part of it has no terrain, and says which part", () => {
    const valley = ground(100);
    valley[0] = 500;
    valley[2000] = 500;
    for (let index = 800; index <= 1200; index += 1) valley[index] = null;
    const reading = read(valley, 10, 435);
    expect(reading.tone).toBe("warning");
    expect(reading.title).toBe("Not known");
    expect(reading.sentences[0]).toBe(
      "No terrain is installed from 8.00 km to 12.0 km from A. That is 20% of the path, and a hill there would not be seen.",
    );
    expect(reading.sentences[1]).toMatch(/^Nothing is in the way along the rest of it\./);
    expect(reading.mark).toBeNull();

    // Blocked is blocked, whatever the gap hides; the gap is still named.
    const ridged = ground(100, ridge(50));
    for (let index = 200; index <= 400; index += 1) ridged[index] = null;
    const blocked = read(ridged);
    expect(blocked.title).toBe("Blocked");
    expect(blocked.sentences.at(-1)).toBe(
      "No terrain is installed from 2.00 km to 4.00 km from A. That does not change the answer: the ground that is known is already in the way.",
    );
  });

  it("says when there is no ground to stand an antenna on, and when there is no terrain at all", () => {
    const noEnd = read([null, ...ground(100).slice(1)]);
    expect(noEnd.title).toBe("Not known");
    expect(noEnd.sentences[0]).toMatch(/^No terrain is installed under A, so there is no ground to stand that antenna on/);
    expect(read([...ground(100).slice(0, -1), null]).sentences[0]).toMatch(/under B/);
    const none = read([null, null]);
    expect(none.tone).toBe("info");
    expect(none.title).toBe("No terrain here");
    expect(none.sentences[0]).toMatch(/^No terrain is installed along this path/);
  });

  it("names gaps one by one, up to three, and says how fine the terrain is", () => {
    const heights = ground(100);
    for (const [start, end] of [
      [100, 200],
      [500, 500],
      [900, 1000],
      [1500, 1600],
      [1800, 1900],
    ] as const) {
      for (let index = start; index <= end; index += 1) heights[index] = null;
    }
    const profile = profileOf(heights);
    expect(describeGaps(profile)).toBe("from 1.00 km to 2.00 km, around 5.00 km and from 9.00 km to 10.0 km, and in 2 more places");
    expect(describeGaps(profileOf([...ground(100).slice(0, 1990), ...Array.from({ length: 11 }, () => null)]))).toBe(
      "from 19.9 km to 20.0 km",
    );

    expect(describeTerrain(profile)).toBe("Ground read every 10 m from installed terrain whose cells are about 12 m wide here.");
    expect(
      describeTerrain({ ...profile, stepMeters: 73.5, terrain: { finestCellMeters: 46, coarsestCellMeters: 92, installedMaxZoom: 12 } }),
    ).toBe(
      "Ground read every 74 m from installed terrain whose cells are 46 m to 92 m wide here. On a path this long each height stands for a wider piece of ground, so a narrow ridge reads lower than it is.",
    );
    expect(describeTerrain(profileOf([null, null]))).toBe("");
  });
});

describe("the path drawn from the side", () => {
  const pad = { top: 12, right: 12, bottom: 20, left: 12 };

  it("keeps a ridge that is narrower than a pixel", () => {
    // A ridge 40 m wide in 20 km, drawn 300 pixels wide: 67 m to a pixel.
    const spike = ground(100, (meters) => (Math.abs(meters - 12_340) <= 20 ? 300 : 0));
    const samples = sightSamples(inputOf(profileOf(spike)))!;
    const geometry = sightChartGeometry(samples, 324, 176, pad);
    expect(geometry.columns).toHaveLength(300);
    const highest = geometry.columns.reduce((best, column) => (column.drawnGround! > best.drawnGround! ? column : best));
    expect(Math.abs(highest.distanceMeters - 12_340)).toBeLessThanOrEqual(20);
    expect(highest.drawnGround).toBeGreaterThan(400);
    // The scale holds the ridge, the ray and the whole Fresnel zone, with a little air.
    expect(geometry.ceiling).toBeGreaterThan(400);
    expect(geometry.floor).toBeLessThan(100);
    expect(geometry.y(geometry.ceiling)).toBeCloseTo(pad.top, 6);
    expect(geometry.y(geometry.floor)).toBeCloseTo(176 - pad.bottom, 6);
    expect(geometry.x(0)).toBe(pad.left);
    expect(geometry.x(20_000)).toBe(324 - pad.right);
    expect(columnAt(geometry.columns, 12_340).drawnGround).toBeGreaterThan(400);
  });

  it("draws the ray straight, the ground lifted by the curve, and leaves gaps as gaps", () => {
    const heights = ground(100);
    for (let index = 600; index <= 900; index += 1) heights[index] = null;
    const samples = sightSamples(inputOf(profileOf(heights)))!;
    const geometry = sightChartGeometry(samples, 424, 176, pad);
    // One straight line from the top of one mast to the top of the other.
    expect(geometry.ray).toBe(
      `M${geometry.x(0).toFixed(1)},${geometry.y(110).toFixed(1)}L${geometry.x(20_000).toFixed(1)},${geometry.y(110).toFixed(1)}`,
    );
    // Level ground is drawn as a hump: 5.9 m higher at the middle than at the ends.
    const middle = columnAt(geometry.columns, 10_000);
    expect(middle.drawnGround).toBeCloseTo(105.886, 2);
    expect(geometry.columns[0]!.drawnGround).toBe(100);
    // Two runs of ground with the gap between them, from the last known column to the next.
    expect(geometry.ground).toHaveLength(2);
    expect(geometry.gaps).toHaveLength(1);
    expect(geometry.gaps[0]!.x1).toBeLessThanOrEqual(geometry.x(6_000));
    expect(geometry.gaps[0]!.x2).toBeGreaterThanOrEqual(geometry.x(9_000));
    expect(geometry.gaps[0]!.x2 - geometry.gaps[0]!.x1).toBeLessThan(geometry.x(3_000) - geometry.x(0) + 4);
    expect(columnAt(geometry.columns, 7_500).drawnGround).toBeNull();
    // Sea level is far below this chart, so it is not drawn; over the sea it is the ground itself.
    expect(geometry.seaLevel).toBeNull();
    const sea = sightSamples({ ...inputOf(profileOf(ground(0))), antennaFromMeters: 3, antennaToMeters: 3 })!;
    expect(sightChartGeometry(sea, 424, 176, pad).seaLevel).toMatch(/^M/);
  });

  it("reads one place on the path out in words", () => {
    const samples = sightSamples(inputOf(profileOf(ground(100, ridge(50)))))!;
    expect(describeSample(samples[1000]!)).toBe("10.0 km from A: ground 150 m, 46 m above the ray");
    expect(describeSample(samples[200]!)).toBe("2.00 km from A: ground 100 m, ray 7.9 m above it, Fresnel radius 61 m");
    expect(describeSample(samples[0]!)).toBe("0 m from A: ground 100 m, ray 10 m above it");
    const holed = ground(100);
    holed[300] = null;
    expect(describeSample(sightSamples(inputOf(profileOf(holed)))![300]!)).toBe("3.00 km from A: no terrain installed here");
  });
});

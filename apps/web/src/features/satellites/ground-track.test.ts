import { describe, expect, it } from "vitest";
import { predictPasses } from "./engine";
import {
  around,
  boxOf,
  horizonRing,
  isStationary,
  overlaps,
  placeLabels,
  sampleTrack,
  splitAtDateLine,
  stationary,
  ticksOf,
  trackFigure,
  trackRuns,
  trackWords,
  upSpans,
} from "./ground-track";
import { ESHAIL, FUNCUBE, ISS_ORBIT } from "./test-orbits";

const LONDON = { lat: 51.5074, lon: -0.1278 };

describe("the ground track's geometry", () => {
  it("cuts a line at the date line, each piece reaching the edge at the latitude found along the line", () => {
    expect(
      splitAtDateLine([
        [170, 10],
        [-170, 12],
      ]),
    ).toEqual([
      [
        [170, 10],
        [180, 11],
      ],
      [
        [-180, 11],
        [-170, 12],
      ],
    ]);
    // Westward, and twice round.
    const pieces = splitAtDateLine([
      [-170, 0],
      [170, 0],
      [10, 0],
      [-150, 0],
      [170, 0],
    ]);
    expect(pieces.map((piece) => [piece[0]![0], piece.at(-1)![0]])).toEqual([
      [-170, -180],
      [180, -180],
      [180, 170],
    ]);
    // A line that never crosses is one piece.
    expect(
      splitAtDateLine([
        [0, 0],
        [10, 5],
        [20, 10],
      ]),
    ).toHaveLength(1);
  });

  it("draws two turns of FUNcube-1 in runs that never cross the map, heavy where it is above London", () => {
    const from = new Date(Date.parse("2026-11-24T04:52:00Z"));
    const to = new Date(from.getTime() + 2 * (1440 / 15.11455703) * 60_000);
    const samples = sampleTrack(FUNCUBE, LONDON, from, to);
    const runs = trackRuns(samples, from);
    for (const run of runs) {
      for (const [lon] of run.points) expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      for (let index = 1; index < run.points.length; index += 1)
        expect(Math.abs(run.points[index]![0] - run.points[index - 1]![0])).toBeLessThan(30);
    }
    const passes = predictPasses(FUNCUBE, LONDON, from, (to.getTime() - from.getTime()) / 3_600_000, 8);
    const spans = upSpans(samples);
    expect(spans).toHaveLength(passes.length);
    expect(passes.length).toBeGreaterThan(0);
    spans.forEach((span, index) => {
      expect(Math.abs(span.from.getTime() - passes[index]!.aos.getTime())).toBeLessThan(5_000);
      expect(Math.abs(span.to.getTime() - passes[index]!.los.getTime())).toBeLessThan(5_000);
    });
    expect(runs.some((run) => run.up)).toBe(true);
    // A tick each whole 10 minutes of UTC.
    const ticks = ticksOf(samples);
    expect(ticks.length).toBeGreaterThanOrEqual(18);
    for (const tick of ticks) expect(tick.at.getUTCMinutes() % 10).toBe(0);
  });

  it("tells a geostationary satellite from one that moves, and keeps it over one longitude", () => {
    expect(stationary(ESHAIL)).toBe(true);
    expect(stationary(ISS_ORBIT)).toBe(false);
    expect(isStationary(1.0027, 0.1)).toBe(true);
    expect(isStationary(1.0027, 8)).toBe(false);
    const from = new Date(Date.parse("2026-11-24T00:00:00Z"));
    const day = sampleTrack(ESHAIL, LONDON, from, new Date(from.getTime() + 86_400_000), 1800);
    const lons = day.map((sample) => sample.lon);
    expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(0.5);
    expect(lons[0]).toBeCloseTo(25.8, 0);
    // Up all day from London: one span open at both ends.
    expect(upSpans(day)).toEqual([expect.objectContaining({ openStart: true, openEnd: true })]);
  });

  it("keeps labels clear of each other and of Home, and leaves out one with no room", () => {
    const box = boxOf(360);
    const home = around([100, 50], 14);
    const placed = placeLabels(
      [
        { at: [96, 50], text: "06:20" },
        { at: [100, 56], text: "06:30" },
        { at: [102, 52], text: "06:40" },
        { at: [355, 2], text: "06:50" },
      ],
      [home],
      box,
      11,
    );
    const boxes = placed.filter((item) => item !== null).map((item) => item.box);
    for (const rect of boxes) {
      expect(overlaps(rect, home)).toBe(false);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.width);
      expect(rect.y).toBeGreaterThanOrEqual(0);
    }
    for (let a = 0; a < boxes.length; a += 1)
      for (let b = a + 1; b < boxes.length; b += 1) expect(overlaps(boxes[a]!, boxes[b]!)).toBe(false);
    // In the corner a label goes in from the edge.
    expect(placed[3]?.anchor).toBe("end");
    // Crowded together, one of three is left out rather than written over another.
    const crowded = placeLabels(
      Array.from({ length: 12 }, (_, index) => ({ at: [50 + (index % 3), 50 + Math.floor(index / 3)] as [number, number], text: "06:00" })),
      [],
      box,
      11,
    );
    expect(crowded.filter((item) => item === null).length).toBeGreaterThan(0);
  });

  it("lays out a whole drawing with no label over another, over Home or over now", () => {
    const from = new Date(Date.parse("2026-11-24T04:52:00Z"));
    const samples = sampleTrack(FUNCUBE, LONDON, from, new Date(from.getTime() + 190 * 60_000));
    const figure = trackFigure({
      width: 358,
      samples,
      land: null,
      nightAt: from.getTime(),
      home: LONDON,
      now: samples[0]!,
      ringAltitudeKm: samples[0]!.altitudeKm,
      labelSize: 11,
    });
    expect(figure.box.height).toBe(167);
    expect(figure.night).toMatch(/^M/);
    expect(figure.ring.length).toBeGreaterThanOrEqual(1);
    const labels = figure.ticks.flatMap((tick) => (tick.label ? [tick.label.box] : []));
    expect(labels.length).toBeGreaterThanOrEqual(4);
    for (const rect of labels) {
      expect(overlaps(rect, around(figure.home!, 14))).toBe(false);
      expect(overlaps(rect, around(figure.now!, 16))).toBe(false);
    }
    for (let a = 0; a < labels.length; a += 1)
      for (let b = a + 1; b < labels.length; b += 1) expect(overlaps(labels[a]!, labels[b]!)).toBe(false);
  });

  it("draws the ring round a place in pieces cut at the date line", () => {
    const pieces = horizonRing({ lat: -40, lon: 175 }, 500);
    // From where it starts, over the line and back: three pieces, two reaching each edge.
    expect(pieces).toHaveLength(3);
    expect(pieces.filter((piece) => piece.some(([lon]) => lon === 180))).toHaveLength(2);
    expect(pieces.filter((piece) => piece.some(([lon]) => lon === -180))).toHaveLength(1);
    for (const piece of pieces) for (const [lon] of piece) expect(Math.abs(lon)).toBeLessThanOrEqual(180);
  });

  it("says it in words", () => {
    const now = { at: new Date(0), lat: -7.61, lon: -16.08, altitudeKm: 600, azimuthDeg: 0, elevationDeg: -20 };
    const span = {
      from: new Date(Date.parse("2026-11-24T06:14:10Z")),
      to: new Date(Date.parse("2026-11-24T06:24:20Z")),
      fromAzimuthDeg: 359,
      toAzimuthDeg: 247,
      openStart: false,
      openEnd: false,
    };
    expect(trackWords({ now, spans: [span], placeName: "Home", next: null, stretch: "these two turns" })).toBe(
      "Now over 7.6° S, 16.1° W. Above Home 06:14 to 06:24 UTC, N to WSW.",
    );
    expect(trackWords({ now: null, spans: [], placeName: "Home", next: span.from, stretch: "this turn" })).toBe(
      "Not above Home in this turn; next up at 06:14 UTC.",
    );
    expect(
      trackWords({ now: null, spans: [{ ...span, openStart: true, openEnd: true }], placeName: "Home", next: null, stretch: "this turn" }),
    ).toBe("Above Home all through this turn.");
  });
});

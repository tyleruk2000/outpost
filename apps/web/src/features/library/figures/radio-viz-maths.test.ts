/**
 * The maths of the signal figures. Ported with the code from LogBook73
 * (packages/domain/src/radioViz.test.ts, copyright (c) 2026 Tyler Allen, MIT licence).
 *
 * These assert the shape a reader is meant to take away, not the exact numbers: a
 * low-pass that passes what is below the cutoff, a dipole with nulls off the ends,
 * noise that is identical every time it is drawn.
 */
import { describe, expect, it } from "vitest";

import { CONSTELLATION_PRESETS, mulberry32, polarRadius, responseShape, sampleTrace } from "./radio-viz-maths";

describe("sampleTrace", () => {
  it("returns explicit points untouched", () => {
    const points: [number, number][] = [
      [0, 0],
      [0.5, 1],
      [1, -1],
    ];
    expect(sampleTrace({ kind: "points", points })).toBe(points);
  });

  it("samples a sine across the full width, within amplitude", () => {
    const pts = sampleTrace({ kind: "sine", freq: 2 }, 100);
    expect(pts).toHaveLength(101);
    expect(pts[0]?.[0]).toBe(0);
    expect(pts.at(-1)?.[0]).toBe(1);
    for (const [, y] of pts) expect(Math.abs(y)).toBeLessThanOrEqual(1.0001);
  });

  it("scales by amp and shifts by phase", () => {
    const half = sampleTrace({ kind: "sine", freq: 1, amp: 0.5 }, 100);
    for (const [, y] of half) expect(Math.abs(y)).toBeLessThanOrEqual(0.5001);
    // 90° of phase turns a sine into a cosine: it starts at its peak.
    const shifted = sampleTrace({ kind: "sine", freq: 1, phase: 90 }, 100);
    expect(shifted[0]?.[1]).toBeCloseTo(1, 5);
  });

  it("keys CW on and off in the given pattern", () => {
    // [3,1,1,1,3]: on for the first 3/9 of the width, off for the next 1/9.
    const pts = sampleTrace({ kind: "cw", pattern: [3, 1, 1, 1, 3] }, 900);
    const at = (x: number) => pts.find((p) => p[0] >= x)?.[1] ?? 0;
    const loud = pts.filter((p) => p[0] > 0.02 && p[0] < 0.3).some(([, y]) => Math.abs(y) > 0.5);
    expect(loud).toBe(true);
    // Dead centre of the first gap must be silent.
    expect(Math.abs(at(3.5 / 9))).toBeLessThan(1e-9);
  });

  it("gives an AM envelope that never inverts", () => {
    // The envelope is a magnitude, so it stays on one side of zero.
    for (const [, y] of sampleTrace({ kind: "envelope", depth: 0.7 }, 200)) {
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  it("draws identical noise every time", () => {
    // A figure that speckled differently on each render — or differed between
    // a phone and a laptop — would read as a rendering bug.
    const a = sampleTrace({ kind: "noise" }, 50);
    const b = sampleTrace({ kind: "noise" }, 50);
    expect(a).toEqual(b);
  });

  it("gives an unknown kind a flat line rather than throwing", () => {
    const pts = sampleTrace({ kind: "nonsense" as never }, 10);
    expect(pts.every(([, y]) => y === 0)).toBe(true);
  });
});

describe("responseShape", () => {
  it("passes everything below the cutoff on a low-pass, and rolls off above", () => {
    const y = responseShape({ preset: "lowpass", f0: 50 });
    expect(y(10)).toBe(0); // 0 = full signal
    expect(y(49)).toBe(0);
    expect(y(80)).toBeGreaterThan(0.5);
    expect(y(100)).toBeGreaterThan(y(70)); // monotonic roll-off
  });

  it("mirrors that for a high-pass", () => {
    const y = responseShape({ preset: "highpass", f0: 50 });
    expect(y(90)).toBe(0);
    expect(y(20)).toBeGreaterThan(0.5);
  });

  it("peaks a band-pass at its centre and a notch at its edges", () => {
    const bp = responseShape({ preset: "bandpass", f0: 50, bw: 20 });
    expect(bp(50)).toBeCloseTo(0, 5);
    expect(bp(10)).toBeGreaterThan(0.9);
    const notch = responseShape({ preset: "notch", f0: 50, bw: 20 });
    expect(notch(50)).toBeCloseTo(1, 5);
    expect(notch(10)).toBeLessThan(0.1);
  });

  it("dips SWR at resonance — 1 is the bottom of the plot, where 1:1 sits", () => {
    const swr = responseShape({ preset: "swr", f0: 50, bw: 24 });
    expect(swr(50)).toBeCloseTo(1, 5);
    // Away from resonance the curve climbs back toward the top (high SWR).
    expect(swr(5)).toBeLessThan(swr(40));
    expect(swr(5)).toBeLessThan(0.2);
  });

  it("stays inside 0–1 across the whole axis for every preset", () => {
    const presets = ["lowpass", "highpass", "bandpass", "notch", "swr", "resonance"] as const;
    for (const preset of presets) {
      const y = responseShape({ preset });
      for (let f = 0; f <= 100; f += 0.5) {
        const v = y(f);
        expect(Number.isFinite(v), `${preset} @ ${f}`).toBe(true);
        expect(v, `${preset} @ ${f}`).toBeGreaterThanOrEqual(-0.001);
        expect(v, `${preset} @ ${f}`).toBeLessThanOrEqual(1.001);
      }
    }
  });
});

describe("polarRadius", () => {
  it("nulls a dipole off its ends and peaks broadside", () => {
    const r = polarRadius("dipole");
    expect(r(0)).toBeCloseTo(0, 5);
    expect(r(Math.PI)).toBeCloseTo(0, 5);
    expect(r(Math.PI / 2)).toBeCloseTo(1, 5);
  });

  it("keeps an omni circular", () => {
    const r = polarRadius("omni");
    expect(r(0)).toBe(r(Math.PI / 3));
  });

  it("gives a yagi far more forward than backward, with a real back lobe", () => {
    const r = polarRadius("yagi");
    expect(r(0)).toBeGreaterThan(r(Math.PI) * 3);
    expect(r(Math.PI)).toBeGreaterThan(0); // never a perfect null
  });

  it("stays within the unit circle for every pattern", () => {
    for (const p of ["dipole", "omni", "yagi", "cardioid"] as const) {
      const r = polarRadius(p);
      for (let th = 0; th < Math.PI * 2; th += 0.05) {
        expect(r(th), `${p} @ ${th}`).toBeGreaterThanOrEqual(0);
        expect(r(th), `${p} @ ${th}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("constellation presets", () => {
  it("has the right number of symbols and keeps them inside the unit circle", () => {
    expect(CONSTELLATION_PRESETS.bpsk).toHaveLength(2);
    expect(CONSTELLATION_PRESETS.qpsk).toHaveLength(4);
    expect(CONSTELLATION_PRESETS.qam16).toHaveLength(16);
    for (const [name, pts] of Object.entries(CONSTELLATION_PRESETS)) {
      // Square constellations put their corners outside the unit circle by
      // design — bound each axis, not the radius.
      for (const [i, q] of pts) {
        expect(Math.abs(i), name).toBeLessThanOrEqual(1);
        expect(Math.abs(q), name).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("mulberry32", () => {
  it("is deterministic and stays in [0,1)", () => {
    const a = Array.from({ length: 20 }, mulberry32(7));
    expect(Array.from({ length: 20 }, mulberry32(7))).toEqual(a);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

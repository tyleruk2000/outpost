/**
 * The nuclear effects model against the worked examples and statements of its own
 * source, Glasstone and Dolan, The Effects of Nuclear Weapons (1977). Each test names
 * the section it checks and the tolerance, and why that tolerance: the model's
 * figures were read off scans of the printed curves, so a few per cent is the read-off
 * error, and where the book itself rounds ("about 7 miles") the tolerance is wider.
 */
import {
  blastRange1kt,
  computeEffects,
  drawnTip,
  type EffectsInput,
  effectsProblems,
  FOOT,
  falloutContours,
  initialDose,
  initialDoseParts,
  MILE,
  roundDistance,
  thermalPartition,
  thermalSlantMiles,
  windFactor,
  YARD,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

const within = (actual: number, expected: number, tolerance: number) => {
  expect(Math.abs(actual - expected) / expected, `${actual} against ${expected}`).toBeLessThanOrEqual(tolerance);
};

const ok = (input: EffectsInput) => {
  const answer = computeEffects(input);
  if (!answer.ok) throw new Error(answer.problems.join(" "));
  return answer.result;
};
const ring = (input: EffectsInput, id: string) => ok(input).rings.find((item) => item.id === id)!;

describe("blast (Figs. 3.73b and c, cube-root scaling)", () => {
  it("gives the farthest reach of 4 psi for 125 kilotons as Fig. 3.73c's example does: 13,000 feet at about 5,500 feet (within 5%)", () => {
    const tip = drawnTip(4);
    const cube = 125 ** (1 / 3);
    within(tip.d * cube, 13_000, 0.05);
    within(tip.h * cube, 5_500, 0.05);
  });

  it("puts 1 psi at about 10 miles from a 1-megaton burst at 6,500 feet (§ 2.35, 'roughly'; within 10%)", () => {
    const result = ring({ yieldKt: 1000, burst: { kind: "height", metres: 6500 * FOOT }, wind: null }, "blast-1");
    within(result.metres! / MILE, 10, 0.1);
  });

  it("reads the same surface distance for 10 psi from Figs. 3.73b and 3.73c within 4% (the book's two figures overlap there)", () => {
    within(blastRange1kt(10, 0).feet!, 1062, 0.04);
  });

  it("scales a surface burst's distances by the cube root of the yield (eq. 3.62.1)", () => {
    const one = ring({ yieldKt: 1, burst: { kind: "surface" }, wind: null }, "blast-5").metres!;
    for (const yieldKt of [8, 1000]) {
      const scaled = ring({ yieldKt, burst: { kind: "surface" }, wind: null }, "blast-5").metres!;
      within(scaled, one * yieldKt ** (1 / 3), 1e-9);
    }
  });

  it("puts 5 psi between 4 and 6 psi at every height both reach, and says why when only 4 psi does", () => {
    for (const h of [0, 300, 800, 1000]) {
      const five = blastRange1kt(5, h).feet!;
      expect(five).toBeLessThan(blastRange1kt(1, h).feet!);
      expect(five).toBeGreaterThan(blastRange1kt(10, h).feet!);
    }
    const between = blastRange1kt(5, 1800);
    expect(between.feet).toBeNull();
    expect(between.why).toMatch(/draws no 5 psi curve/);
  });

  it("says 20 psi does not reach the ground from a scaled height above its curve's top (925 feet)", () => {
    expect(blastRange1kt(20, 1000).feet).toBeNull();
    expect(blastRange1kt(20, 900).feet).not.toBeNull();
  });

  it("orders the rings outward by falling overpressure for surface and air bursts across the yield range", () => {
    for (const yieldKt of [1, 15, 300, 10_000]) {
      for (const burst of [{ kind: "surface" } as const, { kind: "optimum", psi: 5 } as const]) {
        const result = ok({ yieldKt, burst, wind: null });
        const blast = result.rings.filter((item) => item.family === "blast" && item.metres !== null).map((item) => item.metres!);
        expect(blast).toEqual([...blast].sort((a, b) => a - b));
      }
    }
  });
});

describe("heat (Figs. 7.42 and 12.65, Table 7.101)", () => {
  it("gives newspaper's 8 cal/cm² at about 7 miles from a 1-megaton air burst, the example of § 7.43 (within 6%)", () => {
    within(thermalSlantMiles(8, 1000)!, 7, 0.06);
  });

  it("gives 4.5 to 6 cal/cm² for 1 megaton at 8 to 9.5 miles; § 12.66 reads the same figure as 9 to 10 miles, so the book's own reading is up to 10% farther", () => {
    const near = thermalSlantMiles(6, 1000)!;
    const far = thermalSlantMiles(4.5, 1000)!;
    expect(near).toBeGreaterThan(8);
    expect(far).toBeLessThan(9.5);
    within(far, 9.5, 0.1);
  });

  it("refuses exposures outside the 3 to 50 cal/cm² the figure draws", () => {
    expect(thermalSlantMiles(2.5, 100)).toBeNull();
    expect(thermalSlantMiles(60, 100)).toBeNull();
  });

  it("takes the effective partition from Table 7.101: 0.18 at the surface, 0.25 at 200 feet for 10 kilotons, 0.35 well above", () => {
    expect(thermalPartition(0, 50)).toBeCloseTo(0.18, 5);
    expect(thermalPartition(200, 10)).toBeCloseTo(0.25, 5);
    expect(thermalPartition(10_000, 10)).toBe(0.35);
  });

  it("gives a surface burst a shorter burn distance than the same yield's air burst", () => {
    const surface = ring({ yieldKt: 100, burst: { kind: "surface" }, wind: null }, "thermal-second").metres!;
    const air = ring({ yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: null }, "thermal-second").metres!;
    expect(surface).toBeLessThan(air);
  });

  it("gives no thermal distance above 15,000 feet, with the reason", () => {
    const result = ok({ yieldKt: 5000, burst: { kind: "height", metres: 6000 }, wind: null });
    const third = result.rings.find((item) => item.id === "thermal-third")!;
    expect(third.metres).toBeNull();
    expect(third.why).toMatch(/15,000 feet/);
    expect(result.notes.join(" ")).toMatch(/15,000 feet/);
  });
});

describe("initial radiation (Figs. 8.33a/b and 8.64a/b)", () => {
  it("gives the gamma dose at 2,000 yards from a 50-kiloton fission air burst as § 8.34 does, 'about 250 rads' (within 15%)", () => {
    within(initialDoseParts(50, 2000 * YARD).gamma, 250, 0.15);
  });

  it("falls with distance and rises with yield", () => {
    expect(initialDose(10, 1000, 1000)).toBeGreaterThan(initialDose(10, 1000, 1500));
    expect(initialDose(1000, 3000, 2000)).toBeGreaterThan(initialDose(100, 3000, 2000));
  });

  it("halves the neutron dose and scales the gamma dose by Table 8.37 for a contact surface burst", () => {
    expect(initialDose(5000, 0, 3000)).toBeGreaterThan(initialDose(5000, 1000, 3000));
    expect(initialDose(10, 0, 1500)).toBeLessThan(initialDose(10, 1000, 1500));
  });
});

describe("fallout (Table 9.93, § 9.97)", () => {
  it("reproduces the downwind distances of the book's fallout example: 10 megatons, 30 mph, 75, 142 and 355 miles (within 1%)", () => {
    expect(windFactor(30)).toBeCloseTo(1.25, 6);
    const contours = falloutContours(10_000, 30);
    const at = (rate: number) => contours.find((item) => item.rate === rate)!.downwindM / MILE;
    within(at(3000), 75, 0.01);
    within(at(1000), 142, 0.01);
    within(at(300), 355, 0.01);
  });

  it("is drawn only for a surface burst with a wind, and never as a circle", () => {
    const air = ok({ yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: { fromDegrees: 270, kmh: 24 } });
    expect(air.fallout.drawn).toBe(false);
    const calm = ok({ yieldKt: 100, burst: { kind: "surface" }, wind: null });
    expect(calm.fallout.drawn).toBe(false);
    const surface = ok({ yieldKt: 100, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } });
    if (!surface.fallout.drawn) throw new Error("expected fallout");
    for (const contour of surface.fallout.contours) expect(contour.downwindM).toBeGreaterThan(contour.upwindM * 2);
  });

  it("says when an air burst is low enough for local fallout (eq. 2.128.1: about 2,900 feet for 1 megaton)", () => {
    const low = ok({ yieldKt: 1000, burst: { kind: "height", metres: 2000 * FOOT }, wind: null });
    expect(low.notes.join(" ")).toMatch(/local fallout is likely/);
    const high = ok({ yieldKt: 1000, burst: { kind: "height", metres: 4000 * FOOT }, wind: null });
    expect(high.notes.join(" ")).not.toMatch(/local fallout/);
  });
});

describe("what the model refuses", () => {
  it("refuses yields outside 1 kiloton to 10 megatons, with the reason", () => {
    for (const yieldKt of [0.5, 20_000, Number.NaN])
      expect(effectsProblems({ yieldKt, burst: { kind: "surface" }, wind: null })[0]).toMatch(/1 kiloton to 10 megatons/);
  });

  it("refuses a height above 40,000 feet and one above the blast figure's scaled 5,000 feet", () => {
    expect(effectsProblems({ yieldKt: 1000, burst: { kind: "height", metres: 13_000 }, wind: null })[0]).toMatch(/40,000 feet/);
    expect(effectsProblems({ yieldKt: 1, burst: { kind: "height", metres: 2000 }, wind: null })[0]).toMatch(/scaled height of 5,000 feet/);
  });

  it("refuses winds outside 8 to 45 miles per hour", () => {
    expect(effectsProblems({ yieldKt: 10, burst: { kind: "surface" }, wind: { fromDegrees: 90, kmh: 5 } })[0]).toMatch(
      /8 to 45 miles per hour/,
    );
    expect(effectsProblems({ yieldKt: 10, burst: { kind: "surface" }, wind: { fromDegrees: 90, kmh: 100 } })[0]).toMatch(/8 to 45/);
    expect(effectsProblems({ yieldKt: 10, burst: { kind: "surface" }, wind: { fromDegrees: 360, kmh: 20 } })[0]).toMatch(/0 to 359/);
  });

  it("accepts the optimum height for 1 psi at 10 megatons, which is under 40,000 feet", () => {
    const result = ok({ yieldKt: 10_000, burst: { kind: "optimum", psi: 1 }, wind: null });
    expect(result.heightM).toBeLessThan(40_000 * FOOT);
  });
});

describe("rounding", () => {
  it("rounds to two significant figures", () => {
    expect(roundDistance(1234)).toBe(1200);
    expect(roundDistance(98_765)).toBe(99_000);
    expect(roundDistance(87.4)).toBe(87);
  });
});

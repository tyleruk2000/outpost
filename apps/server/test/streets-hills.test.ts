/** A walk or a ride on streets re-timed over terrain (streets/hills.ts), on made-up lines and ground. */
import { cycleGradeFactor, type StreetDirections, toblerKmh, walkGradeFactor } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { alongLine, retime } from "../src/modules/streets/hills.ts";

const M_PER_DEG_LAT = (6_371_008.8 * Math.PI) / 180;

/** A line due north from 53° N, 4° W, `km` long, and the height `rule` gives at each distance along it. */
function northward(km: number) {
  return [
    [-4, 53],
    [-4, 53 + (km * 1000) / M_PER_DEG_LAT],
  ] as Array<[number, number]>;
}
const heightsBy = (rule: (metres: number) => number | null) => async (points: Array<[number, number]>) =>
  points.map(([, lat]) => rule((lat - 53) * M_PER_DEG_LAT));

/** Two lines of directions, each `km` long, timed as the streets service does on the flat (5.1 km/h on foot). */
function directions(kmEach: number, kmh = 5.1): StreetDirections {
  const durationS = Math.round((kmEach / kmh) * 3600);
  const line = (text: string) => ({
    kind: "continue" as const,
    text,
    distanceM: kmEach * 1000,
    durationS,
    distanceText: "",
    at: [0, 0] as [number, number],
  });
  return {
    lines: [line("Up the hill"), line("Along the top")],
    distanceM: kmEach * 2000,
    durationS: durationS * 2,
    geometry: { type: "LineString", coordinates: [] },
  };
}

describe("the pace rules", () => {
  it("are Tobler's as published, and Valhalla's bicycle table", () => {
    // 6 exp(-3.5 |S + 0.05|): 5.04 km/h on the flat, 6 km/h at the gentle descent of 5%, 3.55 km/h up 10%.
    expect(toblerKmh(0)).toBeCloseTo(5.037, 3);
    expect(toblerKmh(-0.05)).toBe(6);
    expect(toblerKmh(0.1)).toBeCloseTo(3.549, 3);
    expect(walkGradeFactor(0)).toBe(1);
    expect(walkGradeFactor(0.1)).toBeCloseTo(0.7047, 3);
    // Valhalla's kGradeBasedSpeedFactor: half speed up 10%, 2.2 times down 10% or steeper, 0.3 up 15% or steeper.
    expect(cycleGradeFactor(0)).toBe(1);
    expect(cycleGradeFactor(0.1)).toBe(0.5);
    expect(cycleGradeFactor(-0.2)).toBe(2.2);
    expect(cycleGradeFactor(0.3)).toBe(0.3);
    // Between two grades, along the line between them: 4% is half way from 3% (0.85) to 5% (0.75).
    expect(cycleGradeFactor(0.04)).toBeCloseTo(0.8, 6);
  });
});

describe("re-timing a route over terrain", () => {
  it("reads the line every 25 m", () => {
    const { points, at } = alongLine(northward(1), 25);
    expect(points).toHaveLength(41);
    expect(at[1]).toBe(25);
    expect(at.at(-1)).toBeCloseTo(1000, 0);
  });

  it("slows a walk up a 10% slope by Tobler's rule and leaves the flat as it was", async () => {
    // A kilometre up 100 m, then a kilometre on the flat at 100 m.
    const rule = (m: number) => (m <= 1000 ? m / 10 : 100);
    const flat = directions(1);
    const { directions: walk, hills } = await retime(flat, northward(2), heightsBy(rule), "walk", "Test hills");
    expect(hills).not.toBeNull();
    expect(hills!.coverage).toBe("terrain");
    expect(hills!.climbM).toBeGreaterThanOrEqual(98);
    expect(hills!.climbM).toBeLessThanOrEqual(100);
    expect(hills!.descentM).toBe(0);
    expect(hills!.highestM).toBe(100);
    expect(hills!.lowestM).toBe(0);
    expect(hills!.flatDurationS).toBe(flat.durationS);
    expect(hills!.terrain).toBe("Test hills");
    // Up the hill: the flat time over Tobler's share at 10% (0.705), give or take the smoothing at the top.
    const up = flat.lines[0]!.durationS / walkGradeFactor(0.1);
    expect(Math.abs(walk.lines[0]!.durationS - up) / up).toBeLessThan(0.03);
    // Along the top: as it was, but for the smoothing's 50 m over the brow.
    expect(Math.abs(walk.lines[1]!.durationS - flat.lines[1]!.durationS) / flat.lines[1]!.durationS).toBeLessThan(0.02);
    expect(walk.durationS).toBe(walk.lines[0]!.durationS + walk.lines[1]!.durationS);
    // The steepest 250 m is the 10% climb, on the first line.
    expect(hills!.steepest).toMatchObject({ gradePercent: 10, lineIndex: 0 });
    expect(hills!.steepest!.lengthM).toBeCloseTo(250, -1);
    expect(hills!.profile.length).toBeGreaterThan(50);
    expect(hills!.profile.length).toBeLessThanOrEqual(201);
    expect(hills!.profile[0]).toEqual([0, expect.any(Number)]);
  });

  it("times a ride by the bicycle table: twice as long up 10%, faster down", async () => {
    const flat = directions(1, 18);
    const up = await retime(
      flat,
      northward(2),
      heightsBy((m) => (m <= 1000 ? m / 10 : 100)),
      "cycle",
      null,
    );
    expect(Math.abs(up.directions.lines[0]!.durationS / flat.lines[0]!.durationS - 2)).toBeLessThan(0.08);
    const down = await retime(
      flat,
      northward(2),
      heightsBy((m) => (m <= 1000 ? 100 - m / 10 : 0)),
      "cycle",
      null,
    );
    // Down 10%: 2.2 times the speed on the flat.
    expect(down.directions.lines[0]!.durationS / flat.lines[0]!.durationS).toBeCloseTo(1 / 2.2, 1);
    expect(down.hills!.steepest!.gradePercent).toBe(-10);
    expect(down.hills!.descentM).toBeGreaterThanOrEqual(98);
  });

  it("gives the route back unchanged where no terrain covers it, and says where it runs out", async () => {
    const flat = directions(1);
    const none = await retime(
      flat,
      northward(2),
      heightsBy(() => null),
      "walk",
      null,
    );
    expect(none.hills).toBeNull();
    expect(none.directions).toBe(flat);
    // Terrain for the first kilometre only: partial, and the second line keeps its flat time.
    const part = await retime(
      flat,
      northward(2),
      heightsBy((m) => (m < 1000 ? m / 10 : null)),
      "walk",
      null,
    );
    expect(part.hills!.coverage).toBe("partial");
    expect(part.directions.lines[1]!.durationS).toBe(flat.lines[1]!.durationS);
  });

  it("does not count the terrain's noise as climbing", async () => {
    // Flat ground at 50 m with a metre of noise up and down every 25 m.
    const noisy = (m: number) => 50 + (Math.round(m / 25) % 2 === 0 ? 1 : -1);
    const { hills } = await retime(directions(1), northward(2), heightsBy(noisy), "walk", null);
    expect(hills!.climbM).toBeLessThan(25);
    expect(hills!.steepest).toBeNull();
  });
});

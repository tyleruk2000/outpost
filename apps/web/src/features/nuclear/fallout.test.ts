import { computeEffects } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { COMPASS_POINTS, falloutState, fitArea, fromTowards, pointOf } from "./fallout";
import { checkForm, EMPTY_FORM, type ScenarioForm } from "./form";

const state = (over: Partial<ScenarioForm>) => {
  const form = { ...EMPTY_FORM, where: "54, -3", ...over };
  const checked = checkForm(form);
  const answer = checked.effects ? computeEffects(checked.effects) : null;
  return falloutState(form, answer?.ok ? answer.result : null, answer && !answer.ok ? answer.problems : checked.refused);
};

describe("the line under the wind field", () => {
  it("says what is missing, why nothing is drawn, or what is drawn", () => {
    expect(state({})).toEqual({ drawn: false, text: expect.stringMatching(/give the direction the wind blows from and its speed/) });
    expect(state({ windFrom: "270" }).text).toMatch(/give the wind's speed, in km\/h, as well as its direction/);
    expect(state({ windSpeed: "24" }).text).toMatch(/give the direction the wind blows from as well as its speed/);
    expect(state({ windFrom: "270", windSpeed: "5" }).text).toMatch(/13 to 72 km\/h/);
    expect(state({ windFrom: "270", windSpeed: "24", burst: "height" }).text).toMatch(
      /the burst is at a height.*only for a burst on the surface/,
    );
    expect(state({ windFrom: "270", windSpeed: "24", burst: "optimum" }).drawn).toBe(false);
    expect(state({ windFrom: "270", windSpeed: "24" })).toEqual({
      drawn: true,
      text: "Drawn: wind from the west, so the pattern runs east, at 24 km/h.",
    });
    expect(state({ windFrom: "west", windSpeed: "24" }).text).toMatch(/as numbers/);
  });
});

describe("compass points", () => {
  it("go to degrees and back, said with from and towards", () => {
    for (const point of COMPASS_POINTS) expect(pointOf(point.degrees)).toBe(point);
    expect(pointOf(360)?.label).toBe("N");
    expect(pointOf(250)).toBeNull();
    expect(fromTowards(270)).toBe("from the west, so the pattern runs east");
    expect(fromTowards(45)).toBe("from the north-east, so the pattern runs south-west");
    expect(fromTowards(180)).toBe("from the south, so the pattern runs north");
  });
});

describe("fitting the map", () => {
  const answer = computeEffects({ yieldKt: 15, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } });
  if (!answer.ok) throw new Error("expected an answer");
  const at = { lat: 54, lon: -3 };
  it("takes in the 100 rads per hour contour when a pattern is first drawn, and the whole pattern on request", () => {
    const hundred = answer.result.fallout.drawn ? answer.result.fallout.contours.find((contour) => contour.rate === 100)!.downwindM : 0;
    const box = fitArea(answer.result, at, 100);
    // Downwind is east: the box reaches at least the contour's length east of ground zero.
    const eastMetres = (box[2] - at.lon) * 111_320 * Math.cos((at.lat * Math.PI) / 180);
    expect(eastMetres).toBeGreaterThanOrEqual(hundred);
    const whole = fitArea(answer.result, at, 1);
    expect(whole[2]).toBeGreaterThan(box[2]);
    // With no pattern, the rings alone.
    const air = computeEffects({ yieldKt: 15, burst: { kind: "optimum", psi: 5 }, wind: null });
    if (!air.ok) throw new Error("expected an answer");
    const rings = fitArea(air.result, at, 1);
    expect(rings[0]).toBeLessThan(at.lon);
    expect(rings[2]).toBeGreaterThan(at.lon);
  });
});

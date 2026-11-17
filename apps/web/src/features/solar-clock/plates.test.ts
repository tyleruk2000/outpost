/**
 * The figures the solar clock's pictures are drawn from: each held to the answer the
 * screen gives for the same reading, or to a known geometry, in both hemispheres.
 */
import { describe, expect, it } from "vitest";
import { angleFromPolaris, STARS } from "@/features/maps/lib/sky";
import { sunAt, sunDay } from "@/features/maps/lib/sun";
import { timeFromPointer } from "./nocturnal";
import { equalShadows, noonWord, northSky, separation, shadowTip, shortestShadow, sunThroughDay } from "./plates";
import { noonByEqualShadows } from "./recovery";
import { dialDrawing, hourLineAngle } from "./sundial";

const greenwich = { lat: 51.4779, lon: -0.0015 };
const sydney = { lat: -33.8568, lon: 151.2153 };
const DATE = "2026-11-17";

describe("the shadow's tip", () => {
  it("points true north at noon at Greenwich, as long as the stick over the tangent of the sun's height", () => {
    const noon = sunDay(greenwich.lat, greenwich.lon, DATE).noon;
    const tip = shadowTip(greenwich, noon, 1)!;
    expect(Math.abs(((tip.bearing + 180) % 360) - 180)).toBeLessThan(0.5);
    const apparent = sunAt(noon, greenwich.lat, greenwich.lon).apparentAltitude;
    expect(tip.length).toBeCloseTo(1 / Math.tan((apparent * Math.PI) / 180), 6);
    expect(tip.north).toBeGreaterThan(2.7);
    expect(noonWord(tip.bearing)).toBe("true north");
  });

  it("points true south at noon in Sydney in November, the sun being to the north", () => {
    const noon = sunDay(sydney.lat, sydney.lon, DATE).noon;
    const tip = shadowTip(sydney, noon, 1)!;
    expect(Math.abs(tip.bearing - 180)).toBeLessThan(0.5);
    expect(tip.north).toBeLessThan(0);
    expect(noonWord(tip.bearing)).toBe("true south");
  });

  it("is not drawn with the sun below 4°", () => {
    const day = sunDay(greenwich.lat, greenwich.lon, DATE);
    expect(shadowTip(greenwich, day.noon - 12 * 3_600_000, 1)).toBeNull();
  });
});

describe("two equal shadows, as drawn", () => {
  it("has its halfway moment where the screen's answer is, and both marks on the circle", () => {
    for (const place of [greenwich, sydney]) {
      const drawn = equalShadows(place, DATE, 1, 4)!;
      const answer = noonByEqualShadows(place, DATE, 1, 4, 0.005);
      expect(answer.ok).toBe(true);
      if (!answer.ok) continue;
      expect(Math.abs(drawn.halfway - answer.estimate.at)).toBeLessThan(1000);
      expect(drawn.before.length).toBeCloseTo(4, 2);
      expect(drawn.after.length).toBeCloseTo(4, 2);
      // The morning mark is to the west of the stick in both hemispheres.
      expect(drawn.before.east).toBeLessThan(0);
      expect(drawn.after.east).toBeGreaterThan(0);
    }
  });

  it("is not drawn when the circle is inside the noon shadow, as the screen refuses it", () => {
    expect(equalShadows(greenwich, DATE, 1, 2)).toBeNull();
  });
});

describe("the shortest shadow, as drawn", () => {
  it("has the noon peg nearest the stick", () => {
    const drawn = shortestShadow(greenwich, DATE, 1)!;
    expect(drawn.marks.length).toBe(17);
    for (const mark of drawn.marks) expect(mark.length).toBeGreaterThanOrEqual(drawn.noon.length - 1e-9);
  });
});

describe("the sun through a day", () => {
  it("runs on smoothly through north in the southern hemisphere, with no jump of 360°", () => {
    const day = sunDay(sydney.lat, sydney.lon, DATE);
    const points = sunThroughDay(sydney, day.noon - 5 * 3_600_000, day.noon + 5 * 3_600_000, "bearing");
    for (let i = 1; i < points.length; i += 1) expect(Math.abs(points[i]!.value - points[i - 1]!.value)).toBeLessThan(20);
  });
});

describe("the northern sky", () => {
  it("puts Dubhe where the star clock's own arithmetic does, and the pointers in line with Polaris", () => {
    const outcome = timeFromPointer(greenwich, DATE, "dubhe", 2);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const sky = northSky(greenwich, outcome.estimate.at);
    expect(sky.dubhe.angle).toBeCloseTo(angleFromPolaris(STARS.dubhe, outcome.estimate.at, greenwich.lat, greenwich.lon), 9);
    // A reading of 2 o'clock is 60° clockwise from straight up, give or take the half-hour the reading allows.
    expect(Math.abs(sky.dubhe.angle - 60)).toBeLessThan(1);
    const merak = sky.plough[1]!;
    expect(Math.abs(merak.angle - sky.dubhe.angle)).toBeLessThan(3);
    expect(merak.distance).toBeGreaterThan(sky.dubhe.distance);
    // Dubhe is about 28.4° from Polaris (its declination of 61.6° and Polaris's of 89.4°, 7.97 h apart in right ascension).
    expect(sky.dubhe.distance).toBeGreaterThan(28);
    expect(sky.dubhe.distance).toBeLessThan(29.5);
  });

  it("puts the north horizon straight below Polaris by the latitude, give or take Polaris's 0.6° from the pole", () => {
    const sky = northSky(greenwich, Date.UTC(2026, 10, 17, 22));
    const north = sky.horizon[Math.floor(sky.horizon.length / 2)]!;
    expect(Math.abs(north.angle - 180)).toBeLessThan(1);
    expect(Math.abs(north.distance - greenwich.lat)).toBeLessThan(0.7);
  });

  it("measures separation on the sphere", () => {
    expect(separation({ ra: 0, dec: 90 }, { ra: 5, dec: 60 })).toBeCloseTo(30, 9);
  });
});

describe("the dial plate, as drawn", () => {
  const box = { left: 0, top: 0, right: 178, bottom: 184 };
  it("lays each hour line at the angle the table gives, afternoon to the east (right) with north up", () => {
    const dial = dialDrawing(51.5, box, 9, 5);
    for (const line of dial.hours) expect(line.paper).toBeCloseTo(hourLineAngle(51.5, line.fromNoon), 9);
    expect(dial.hours.find((line) => line.fromNoon === 3)!.end[0]).toBeGreaterThan(dial.root[0]);
  });

  it("mirrors the dial south of the equator, where it is drawn with south up", () => {
    const dial = dialDrawing(-33.9, box, 9, 5);
    const three = dial.hours.find((line) => line.fromNoon === 3)!;
    expect(three.paper).toBeCloseTo(-hourLineAngle(-33.9, 3), 9);
    expect(three.end[0]).toBeLessThan(dial.root[0]);
  });
});

/**
 * The moon's phase held to published values.
 *
 * Every reference value below was read from the US Naval Observatory's Astronomical
 * Applications Department (aa.usno.navy.mil) on 16 November 2026 and is copied as
 * published:
 *
 * - "Fraction of the Moon Illuminated", `/calculated/moon/fraction?year=2026&task=00&tz=0`:
 *   the lit fraction at midnight Universal Time, to two places.
 * - "Dates of Primary Phases of the Moon", `/api/moon/phases/year?year=2026`: the instant
 *   of each new moon, first quarter, full moon and last quarter, in Universal Time.
 * - "Complete Sun and Moon Data for One Day", `/api/rstt/oneday`: the phase by name and
 *   the lit percentage "at noon in the local time zone on the date requested".
 */
import { describe, expect, it } from "vitest";
import { moonPhase } from "./moon";

describe("how much of the moon is lit, against the US Naval Observatory", () => {
  // Fraction illuminated at 0h UT, 2026.
  const fractions: Array<[date: string, fraction: number]> = [
    ["2026-01-10", 0.57],
    ["2026-02-17", 0.0],
    ["2026-03-21", 0.05],
    ["2026-06-21", 0.41],
    ["2026-07-16", 0.04],
    ["2026-08-10", 0.1],
    ["2026-09-01", 0.84],
    ["2026-10-29", 0.89],
    ["2026-11-17", 0.45],
    ["2026-12-24", 1.0],
  ];
  for (const [date, fraction] of fractions) {
    it(`${date}: ${fraction.toFixed(2)}`, () => {
      // Published to two places, so a right answer is within half of the last one; a little more is allowed.
      expect(Math.abs(moonPhase(Date.parse(`${date}T00:00:00Z`)).illuminated - fraction)).toBeLessThan(0.008);
    });
  }
});

describe("the primary phases, against the US Naval Observatory", () => {
  // Instants of primary phases in 2026, Universal Time.
  const phases: Array<[instant: string, age: number]> = [
    ["2026-01-03T10:03Z", 180],
    ["2026-01-10T15:48Z", 270],
    ["2026-01-18T19:52Z", 0],
    ["2026-01-26T04:47Z", 90],
    ["2026-06-21T21:55Z", 90],
    ["2026-06-29T23:56Z", 180],
    ["2026-11-09T07:02Z", 0],
    ["2026-11-17T11:48Z", 90],
    ["2026-11-24T14:53Z", 180],
    ["2026-12-01T06:08Z", 270],
    ["2026-12-30T18:59Z", 270],
  ];
  const NAMES: Record<number, string> = { 0: "New moon", 90: "First quarter", 180: "Full moon", 270: "Last quarter" };

  for (const [instant, age] of phases) {
    it(`${NAMES[age]} at ${instant}`, () => {
      const phase = moonPhase(Date.parse(instant));
      // The moon gains half a degree on the sun in an hour: within half a degree is within the hour.
      const off = Math.abs(((phase.age - age + 540) % 360) - 180);
      expect(off, `${off.toFixed(2)}° from ${age}°`).toBeLessThan(0.5);
      expect(phase.name).toBe(NAMES[age]);
    });
  }

  it("keeps the phase's own name for about half a day either side of it, and no longer", () => {
    const full = Date.parse("2026-11-24T14:53Z");
    expect(moonPhase(full - 9 * 3_600_000).name).toBe("Full moon");
    expect(moonPhase(full + 9 * 3_600_000).name).toBe("Full moon");
    expect(moonPhase(full - 16 * 3_600_000).name).toBe("Waxing gibbous");
    expect(moonPhase(full + 16 * 3_600_000).name).toBe("Waning gibbous");
  });
});

describe("the phase by name on an ordinary day, against the US Naval Observatory", () => {
  // One-day data: the phase and the percentage at noon in the zone asked for.
  const days: Array<[noon: string, name: string, percent: number]> = [
    ["2026-03-20T12:00:00Z", "Waxing crescent", 3], // Greenwich, tz 0
    ["2026-09-23T17:00:00Z", "Waxing gibbous", 90], // Quito, tz -5
    ["2026-12-21T02:00:00Z", "Waxing gibbous", 87], // Sydney, tz +10
    ["2026-12-21T12:00:00Z", "Waxing gibbous", 90], // Reykjavik, tz 0
    ["2026-03-20T00:00:00Z", "Waxing crescent", 1], // Suva, tz +12
    ["2024-02-29T17:00:00Z", "Waning gibbous", 78], // New York, tz -5
  ];
  for (const [noon, name, percent] of days) {
    it(`${noon}: ${name.toLowerCase()}, ${percent}%`, () => {
      const phase = moonPhase(Date.parse(noon));
      expect(phase.name).toBe(name);
      expect(Math.abs(phase.illuminated * 100 - percent)).toBeLessThan(1);
    });
  }
});

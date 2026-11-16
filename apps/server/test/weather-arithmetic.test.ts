/**
 * The arithmetic of Weather and hazards: how old a copy may be and what is said about it
 * at every age, and the barometer's sums against the published figures they come from.
 */
import {
  ageWords,
  FRESH_FOR,
  freshness,
  HPA_PER_INHG,
  pressureTendency,
  seaLevelPressure,
  tendencyWords,
  toHpa,
  warningState,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const fetchedAt = Date.UTC(2026, 10, 16, 9, 0);

describe("how old a copy is", () => {
  const forecast = { kind: "forecast" as const, fetchedAt, validUntil: fetchedAt + 7 * DAY };

  it("is fresh when just fetched, and says so plainly", () => {
    expect(freshness(forecast, fetchedAt)).toMatchObject({ state: "fresh", age: "just now", sentence: "Fetched just now." });
    expect(freshness(forecast, fetchedAt + 30 * 60_000)).toMatchObject({ state: "fresh", sentence: "Fetched 30 minutes ago." });
  });

  it("calls a forecast old from six hours, while its hours are still ahead", () => {
    expect(freshness(forecast, fetchedAt + FRESH_FOR.forecast - 1).state).toBe("fresh");
    const old = freshness(forecast, fetchedAt + FRESH_FOR.forecast);
    expect(old.state).toBe("old");
    expect(old.sentence).toBe(
      "Fetched 6 hours ago: this forecast is old, and a newer forecast will have been made since, and the nearer hours of this one may have changed.",
    );
    expect(freshness(forecast, fetchedAt + 3 * DAY).sentence).toMatch(/^Fetched 3 days ago: this forecast is old/);
  });

  it("says a forecast has run out once its last hour has passed, at any age", () => {
    expect(freshness(forecast, fetchedAt + 7 * DAY - 1).state).toBe("old");
    const out = freshness(forecast, fetchedAt + 7 * DAY);
    expect(out.state).toBe("ran-out");
    expect(out.sentence).toBe("Fetched 7 days ago: this forecast has run out. Update it to see what is expected now.");
    // Even a forecast fetched a moment ago, if it covered nothing ahead.
    expect(freshness({ kind: "forecast", fetchedAt, validUntil: fetchedAt }, fetchedAt).state).toBe("ran-out");
    expect(freshness({ kind: "forecast", fetchedAt, validUntil: fetchedAt + 3 * DAY }, fetchedAt + 400 * DAY).sentence).toMatch(
      /^Fetched 400 days ago: this forecast has run out/,
    );
  });

  it("calls warnings old after three hours and flood readings after one", () => {
    const warnings = { kind: "warnings" as const, fetchedAt, validUntil: null };
    expect(freshness(warnings, fetchedAt + 3 * HOUR - 1).state).toBe("fresh");
    expect(freshness(warnings, fetchedAt + 3 * HOUR).sentence).toBe(
      "Fetched 3 hours ago: this list of warnings is old, and warnings may have been issued, changed or ended since.",
    );
    const flood = { kind: "flood" as const, fetchedAt, validUntil: null };
    expect(freshness(flood, fetchedAt + HOUR - 1).state).toBe("fresh");
    expect(freshness(flood, fetchedAt + HOUR).state).toBe("old");
  });

  it("never calls averages old, and says they are not a forecast", () => {
    expect(freshness({ kind: "climate", fetchedAt, validUntil: null }, fetchedAt + 900 * DAY)).toMatchObject({
      state: "averages",
      sentence: "Fetched 900 days ago. These are averages over many years, not a forecast.",
    });
  });

  it("does not let a clock that is behind make a copy younger than new", () => {
    expect(freshness(forecast, fetchedAt - HOUR)).toMatchObject({ state: "fresh", ageMs: 0 });
  });

  it("writes ages in whole units", () => {
    expect(ageWords(59_000)).toBe("less than a minute");
    expect(ageWords(60_000)).toBe("1 minute");
    expect(ageWords(HOUR)).toBe("1 hour");
    expect(ageWords(47 * HOUR)).toBe("47 hours");
    expect(ageWords(2 * DAY)).toBe("2 days");
  });

  it("says whether a warning's own period has begun or ended", () => {
    const item = { validFrom: fetchedAt + HOUR, validUntil: fetchedAt + 5 * HOUR };
    expect(warningState(item, fetchedAt)).toBe("ahead");
    expect(warningState(item, fetchedAt + HOUR)).toBe("in-force");
    expect(warningState(item, fetchedAt + 5 * HOUR)).toBe("ended");
    expect(warningState({ validFrom: null, validUntil: null }, fetchedAt)).toBe("unknown");
  });
});

describe("the barometer", () => {
  it("converts inches of mercury to hectopascals", () => {
    expect(HPA_PER_INHG).toBe(33.8639);
    expect(toHpa(29.92, "inHg")).toBeCloseTo(1013.21, 2);
    expect(toHpa(1013, "hPa")).toBe(1013);
  });

  it("reduces to sea level by the standard atmosphere's formula", () => {
    // At sea level nothing changes.
    expect(seaLevelPressure(1013.25, 0)).toBe(1013.25);
    // The standard atmosphere's own pressure 1000 m up (898.76 hPa) comes back to 1013.25 hPa at sea level.
    expect(seaLevelPressure(898.76, 1000)).toBeCloseTo(1013.25, 1);
    // 1000 hPa read 100 m up: about 12 hPa more at sea level (the rule of about 1 hPa for every 8 m).
    expect(seaLevelPressure(1000, 100)).toBeCloseTo(1011.94, 2);
    // Below sea level the figure goes down.
    expect(seaLevelPressure(1013.25, -50)).toBeLessThan(1013.25);
  });

  it("uses the Met Office's words at each of its thresholds", () => {
    // Met Office glossary: slowly 0.1 to 1.5 hPa, plain 1.6 to 3.5, quickly 3.6 to 6.0, very rapidly more than 6.0, in three hours.
    expect(tendencyWords(0.04).words).toBe("steady");
    expect(tendencyWords(0.1).words).toBe("rising slowly");
    expect(tendencyWords(-1.5).words).toBe("falling slowly");
    expect(tendencyWords(1.6).words).toBe("rising");
    expect(tendencyWords(-3.5).words).toBe("falling");
    expect(tendencyWords(3.6).words).toBe("rising quickly");
    expect(tendencyWords(-6.0).words).toBe("falling quickly");
    expect(tendencyWords(6.1).words).toBe("rising very rapidly");
    expect(tendencyWords(-12).words).toBe("falling very rapidly");
    // Rounded to a tenth first, as the thresholds are written: 1.54 is 1.5.
    expect(tendencyWords(1.54).words).toBe("rising slowly");
    expect(tendencyWords(1.56).words).toBe("rising");
  });

  const at = (hours: number, hpa: number) => ({ takenAt: fetchedAt + hours * HOUR, seaLevelHpa: hpa });

  it("works out the tendency over the three hours before the latest reading", () => {
    const result = pressureTendency([at(0, 1012.0), at(1.5, 1010.5), at(3, 1008.2)]);
    expect(result.ok && result.tendency).toMatchObject({ words: "falling quickly", rounded: -3.8, turned: false });
  });

  it("works out the value three hours back between two readings either side of it", () => {
    const result = pressureTendency([at(-1, 1010), at(1, 1012), at(5, 1013)]);
    // Three hours before 5 is 2: not near a reading, and the readings either side (1 and 5) are four hours apart.
    expect(result.ok).toBe(false);
    const close = pressureTendency([at(1.5, 1012), at(2.5, 1013), at(5, 1014)]);
    expect(close.ok && close.tendency.from).toEqual({ takenAt: fetchedAt + 2 * HOUR, hpa: 1012.5, interpolated: true });
    expect(close.ok && close.tendency.words).toBe("rising slowly");
  });

  it("says when the pressure has turned within the three hours", () => {
    const result = pressureTendency([at(0, 1010), at(1.5, 1007), at(3, 1011)]);
    expect(result.ok && result.tendency.words).toBe("now rising");
  });

  it("says why there is no tendency when the readings cannot give one", () => {
    expect(pressureTendency([at(0, 1010)])).toEqual({ ok: false, reason: "A tendency needs two readings about three hours apart." });
    const far = pressureTendency([at(0, 1010), at(1, 1011)]);
    expect(far.ok).toBe(false);
  });
});

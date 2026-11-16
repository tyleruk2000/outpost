import { describe, expect, it } from "vitest";
import {
  agoLabel,
  aheadLabel,
  atClock,
  clockAt,
  clockTicks,
  clockTime,
  clockTimeWithSeconds,
  durationStep,
  durationTicks,
} from "./time-axis";

describe("ticks on an axis that counts from now", () => {
  it("uses steps a person reads at a glance", () => {
    expect(durationStep(634, 6)).toBe(120);
    expect(durationStep(4200, 6)).toBe(900);
    expect(durationStep(4200, 3)).toBe(1800);
    expect(durationStep(40, 4)).toBe(10);
    expect(durationStep(3 * 86_400, 4)).toBe(86_400);
  });

  it("starts at now and stops inside the span", () => {
    expect(durationTicks(634, 6)).toEqual([0, 120, 240, 360, 480, 600]);
    expect(durationTicks(3600, 4)).toEqual([0, 900, 1800, 2700, 3600]);
    expect(durationTicks(0, 5)).toEqual([0]);
  });

  it("never asks for more ticks than fit, however long the queue", () => {
    for (const span of [45, 600, 5000, 90_000, 2_000_000, 40_000_000]) {
      expect(durationTicks(span, 5).length).toBeLessThanOrEqual(6);
    }
  });

  it("labels them as offsets from now", () => {
    expect(aheadLabel(0)).toBe("now");
    expect(aheadLabel(30)).toBe("+30 s");
    expect(aheadLabel(600)).toBe("+10 min");
    expect(aheadLabel(3600)).toBe("+1 h");
    expect(aheadLabel(5400)).toBe("+1 h 30 min");
    expect(aheadLabel(2 * 86_400)).toBe("+2 d");
    expect(aheadLabel(86_400 + 6 * 3600)).toBe("+1 d 6 h");
  });

  it("labels the past the same way", () => {
    expect(agoLabel(0)).toBe("now");
    expect(agoLabel(15)).toBe("15 s ago");
    expect(agoLabel(60)).toBe("1 min ago");
    expect(agoLabel(90)).toBe("1 min 30 s ago");
    expect(agoLabel(300)).toBe("5 min ago");
  });
});

describe("clock times", () => {
  const at = (day: number, hour: number, minute: number, second = 0) => new Date(2026, 10, day, hour, minute, second).getTime();

  it("writes the 24-hour clock, with seconds when asked", () => {
    expect(clockTime(at(15, 14, 32))).toBe("14:32");
    expect(clockTime(at(15, 9, 5))).toBe("09:05");
    expect(clockTimeWithSeconds(at(15, 9, 5, 7))).toBe("09:05:07");
  });

  it("says the day only when it is not today", () => {
    const now = at(15, 14, 0);
    expect(clockAt(at(15, 15, 10), now)).toBe("15:10");
    expect(clockAt(at(16, 2, 10), now)).toBe("tomorrow at 02:10");
    expect(clockAt(at(14, 23, 50), now)).toBe("yesterday at 23:50");
    expect(clockAt(at(17, 2, 10), now)).toBe("Tue 17 Nov at 02:10");
    // As the end of a sentence it never doubles the "at".
    expect(atClock(at(15, 15, 10), now)).toBe("at 15:10");
    expect(atClock(at(16, 2, 10), now)).toBe("tomorrow at 02:10");
    expect(atClock(at(17, 2, 10), now)).toBe("on Tue 17 Nov at 02:10");
  });

  it("puts ticks on round clock times", () => {
    const ticks = clockTicks(at(15, 18, 43, 22), at(15, 18, 48, 33), 4);
    expect(ticks.map((tick) => tick.label)).toEqual(["18:44", "18:46", "18:48"]);
    expect(ticks[0]!.at).toBe(at(15, 18, 44));
  });

  it("shows seconds when the whole axis is under a couple of minutes", () => {
    const ticks = clockTicks(at(15, 18, 43, 22), at(15, 18, 44, 5), 4);
    expect(ticks.map((tick) => tick.label)).toEqual(["18:43:30", "18:43:45", "18:44:00"]);
    expect(clockTicks(5, 5, 4)).toEqual([]);
  });
});

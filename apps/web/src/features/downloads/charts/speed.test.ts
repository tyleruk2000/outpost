import { describe, expect, it } from "vitest";
import { formatMegabits, formatRate, formatSpeed, limitAsTyped, limitLabel, limitWithMegabits, parseLimit, speedTicks } from "./speed";

describe("speeds", () => {
  it("writes a measured speed to three figures", () => {
    expect(formatSpeed(2_100_000)).toBe("2.10 MB/s");
    expect(formatSpeed(498_300)).toBe("498 kB/s");
    expect(formatSpeed(12_340)).toBe("12.3 kB/s");
    expect(formatSpeed(640)).toBe("640 B/s");
    expect(formatSpeed(0)).toBe("0 B/s");
    expect(formatSpeed(1_250_000_000)).toBe("1.25 GB/s");
    expect(formatSpeed(null)).toBe("unknown speed");
  });

  it("writes a chosen speed without padding zeros", () => {
    expect(formatRate(500_000)).toBe("500 kB/s");
    expect(formatRate(1_000_000)).toBe("1 MB/s");
    expect(formatRate(2_500_000)).toBe("2.5 MB/s");
    expect(formatRate(250_000)).toBe("250 kB/s");
    expect(formatRate(0)).toBe("0");
  });

  it("gives the same speed in megabits, as connections are sold", () => {
    expect(formatMegabits(1_000_000)).toBe("8 Mbit/s");
    expect(formatMegabits(250_000)).toBe("2 Mbit/s");
    expect(formatMegabits(500_000)).toBe("4 Mbit/s");
    expect(formatMegabits(10_000_000)).toBe("80 Mbit/s");
    expect(formatMegabits(187_500)).toBe("1.5 Mbit/s");
    expect(formatMegabits(5_000)).toBe("40 kbit/s");
    expect(formatMegabits(250_000_000)).toBe("2 Gbit/s");
  });

  it("makes a round axis, and a frame to draw on when nothing has been measured", () => {
    expect(speedTicks(520_000).ticks).toEqual([0, 200_000, 400_000, 600_000]);
    expect(speedTicks(0)).toEqual({ ticks: [0, 25_000, 50_000, 75_000, 100_000], max: 100_000 });
  });
});

describe("the speed limit", () => {
  it("names the setting", () => {
    expect(limitLabel(0)).toBe("No limit");
    expect(limitLabel(500)).toBe("500 kB/s");
    expect(limitLabel(1000)).toBe("1 MB/s");
    expect(limitWithMegabits(1000)).toBe("1 MB/s, 8 Mbit/s");
    expect(limitWithMegabits(0)).toBe("No limit");
  });

  it("turns a typed value into whole kilobytes per second", () => {
    expect(parseLimit("750", "kB/s")).toEqual({ kbps: 750 });
    expect(parseLimit("1.5", "MB/s")).toEqual({ kbps: 1500 });
    expect(parseLimit(" 2,5 ", "MB/s")).toEqual({ kbps: 2500 });
  });

  it("says why a typed value cannot be used", () => {
    expect(parseLimit("", "kB/s")).toEqual({ problem: "Type a speed." });
    expect(parseLimit("fast", "kB/s")).toHaveProperty("problem");
    expect(parseLimit("0", "MB/s")).toHaveProperty("problem");
    expect(parseLimit("-4", "MB/s")).toHaveProperty("problem");
    expect(parseLimit("0.2", "kB/s")).toEqual({ problem: "The lowest limit is 1 kB/s." });
    expect(parseLimit("99999999", "MB/s")).toHaveProperty("problem");
  });

  it("shows an existing limit in the unit a person would type it in", () => {
    expect(limitAsTyped(750)).toEqual({ text: "750", unit: "kB/s" });
    expect(limitAsTyped(1500)).toEqual({ text: "1.5", unit: "MB/s" });
    expect(limitAsTyped(0)).toEqual({ text: "", unit: "kB/s" });
  });
});

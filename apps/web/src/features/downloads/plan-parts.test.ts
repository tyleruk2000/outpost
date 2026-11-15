import { describe, expect, it } from "vitest";
import { driveParts } from "./plan-storage";
import { recentWindow } from "./plan-throughput";
import { planLocation } from "./test-support";

describe("where the queue will land", () => {
  it("splits a drive into used now, arriving and free afterwards", () => {
    const parts = driveParts(planLocation());
    expect(parts?.map((part) => [part.key, part.bytes])).toEqual([
      ["used", 440_000_000_000],
      ["arriving", 4_200_000_000],
      ["free", 55_800_000_000],
    ]);
    expect(parts?.reduce((sum, part) => sum + part.bytes, 0)).toBe(500_000_000_000);
  });

  it("never draws more arriving than the drive has room for", () => {
    const parts = driveParts(planLocation({ freeBytes: 1_000_000_000, pendingBytes: 4_200_000_000 }));
    expect(parts?.map((part) => part.bytes)).toEqual([499_000_000_000, 1_000_000_000, 0]);
  });

  it("draws nothing when the drive's size is not known", () => {
    expect(driveParts(planLocation({ totalBytes: null }))).toBeNull();
    expect(driveParts(planLocation({ freeBytes: null }))).toBeNull();
  });
});

describe("the window of the live speed chart", () => {
  const now = 1_794_000_000_000;

  it("starts at one minute and grows with what has been collected", () => {
    expect(recentWindow(undefined, now).seconds).toBe(60);
    expect(recentWindow(now - 20_000, now).seconds).toBe(60);
    expect(recentWindow(now - 90_000, now).seconds).toBe(120);
    expect(recentWindow(now - 200_000, now).seconds).toBe(300);
    expect(recentWindow(now - 900_000, now).seconds).toBe(300);
  });

  it("keeps its ticks at fixed distances from now", () => {
    expect(recentWindow(now - 20_000, now).ticks.map((tick) => tick.label)).toEqual([
      "1 min ago",
      "45 s ago",
      "30 s ago",
      "15 s ago",
      "now",
    ]);
    const five = recentWindow(now - 250_000, now).ticks;
    expect(five.map((tick) => tick.label)).toEqual(["5 min ago", "4 min ago", "3 min ago", "2 min ago", "1 min ago", "now"]);
    expect(five[0]!.at).toBe(now - 300_000);
    expect(five.at(-1)!.at).toBe(now);
  });
});

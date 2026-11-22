import { describe, expect, it } from "vitest";
import { nearlyFull } from "./storage-page";

const GB = 1_000_000_000;

describe("a location that is almost full", () => {
  it("is said when under 2 GB is left, or under 2% of the drive", () => {
    expect(nearlyFull({ freeBytes: 12_000_000, totalBytes: 494 * GB })).toBe(true);
    expect(nearlyFull({ freeBytes: 1.5 * GB, totalBytes: 32 * GB })).toBe(true);
    expect(nearlyFull({ freeBytes: 30 * GB, totalBytes: 2000 * GB })).toBe(true);
  });

  it("is not said with room to spare, or when the size is not known", () => {
    expect(nearlyFull({ freeBytes: 144 * GB, totalBytes: 494 * GB })).toBe(false);
    expect(nearlyFull({ freeBytes: 3 * GB, totalBytes: 64 * GB })).toBe(false);
    expect(nearlyFull({ freeBytes: null, totalBytes: null })).toBe(false);
  });
});

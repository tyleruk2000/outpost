/** The shared way of saying how long something takes (packages/shared/src/common.ts), as the screens use it. */
import { formatDuration } from "@outpost/shared";
import { describe, expect, it } from "vitest";

describe("how long something takes", () => {
  it("says one second, one minute and one hour in the singular", () => {
    expect(formatDuration(1)).toBe("1 second");
    expect(formatDuration(0.4)).toBe("1 second");
    expect(formatDuration(60)).toBe("1 minute");
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(3660)).toBe("1 hour 1 minute");
  });

  it("says more than one in the plural", () => {
    expect(formatDuration(2)).toBe("2 seconds");
    expect(formatDuration(59)).toBe("59 seconds");
    expect(formatDuration(150)).toBe("3 minutes");
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe("2 hours 5 minutes");
  });

  it("rounds before it chooses the unit: never 60 seconds or 60 minutes", () => {
    expect(formatDuration(59.6)).toBe("1 minute");
    expect(formatDuration(3599)).toBe("1 hour");
  });

  it("says nothing of a time it does not know", () => {
    expect(formatDuration(Number.NaN)).toBe("");
    expect(formatDuration(-1)).toBe("");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("");
  });
});

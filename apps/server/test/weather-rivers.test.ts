/**
 * River and sea levels: the rules Outpost applies to the Environment Agency's figures,
 * on worked cases. Whether a level is within its typical range is the Agency's range;
 * rising, steady or falling is Outpost's rule (`TREND_RULE`), stated in docs/weather.md.
 */
import {
  datumOf,
  distanceWords,
  freshness,
  levelTrend,
  rangeState,
  STATION_QUIET_MS,
  stationLiveUrl,
  stoppedReporting,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

const MIN = 60_000;
const at = Date.UTC(2026, 10, 17, 12, 0);
/** Readings every `step` minutes, ending at `at`, from the levels given oldest first. */
const series = (levels: number[], step = 15) => levels.map((v, index) => ({ t: at - (levels.length - 1 - index) * step * MIN, v }));

describe("rising, steady or falling (Outpost's rule)", () => {
  it("compares the latest reading with the earliest held in the three hours before it", () => {
    // 13 readings, 15 minutes apart: exactly three hours, from 1.000 to 1.050 m.
    const rising = levelTrend(series(Array.from({ length: 13 }, (_, i) => 1 + (i * 0.05) / 12)));
    expect(rising).toMatchObject({ ok: true, direction: "rising", change: 0.05 });
    // Readings older than three hours are not used: 0.5 m four hours ago does not count.
    const old = series([0.5, 0.5, 0.5, 0.5, ...Array.from({ length: 13 }, () => 1)]);
    expect(levelTrend(old)).toMatchObject({ ok: true, direction: "steady", change: 0 });
  });

  it("calls a change under 2 cm steady, after rounding to the millimetre", () => {
    expect(levelTrend(series([1.0, 1.019], 60))).toMatchObject({ direction: "steady", change: 0.019 });
    expect(levelTrend(series([1.0, 1.0194], 60))).toMatchObject({ direction: "steady", change: 0.019 });
    expect(levelTrend(series([1.0, 1.0196], 60))).toMatchObject({ direction: "rising", change: 0.02 });
    expect(levelTrend(series([1.0, 0.98], 60))).toMatchObject({ direction: "falling", change: -0.02 });
  });

  it("needs two readings at least 45 minutes apart", () => {
    expect(levelTrend([])).toMatchObject({ ok: false });
    expect(levelTrend(series([1]))).toMatchObject({ ok: false });
    expect(levelTrend(series([1, 1.2, 1.4], 15))).toMatchObject({ ok: false, reason: expect.stringMatching(/span long enough/) });
    expect(levelTrend(series([1, 1.1, 1.2, 1.3], 15))).toMatchObject({ ok: true, direction: "rising", change: 0.3 });
  });

  it("gives the same answer for readings out of order, and counts a repeated time once", () => {
    const ordered = series([1.2, 1.15, 1.1, 1.05, 1.0]);
    const shuffled = [ordered[3]!, ordered[0]!, ordered[4]!, ordered[2]!, ordered[1]!, ordered[0]!];
    expect(levelTrend(shuffled)).toEqual(levelTrend(ordered));
    expect(levelTrend(ordered)).toMatchObject({ direction: "falling", change: -0.2 });
  });
});

describe("against the Agency's typical range", () => {
  const river = { tidal: false, typicalLow: 0.15, typicalHigh: 0.292 };
  it("is within at either end, and above or below outside it", () => {
    expect(rangeState(river, 0.15)).toBe("within");
    expect(rangeState(river, 0.292)).toBe("within");
    expect(rangeState(river, 0.293)).toBe("above");
    expect(rangeState(river, 0.149)).toBe("below");
  });
  it("does not judge a tidal level, or a station with no published range", () => {
    expect(rangeState({ ...river, tidal: true }, 9)).toBe("tidal");
    expect(rangeState({ tidal: false, typicalLow: null, typicalHigh: 0.3 }, 0.2)).toBe("no-range");
  });
});

describe("what a station's figures are measured from, and when it has stopped", () => {
  it("reads the datum from the Agency's unit", () => {
    expect(datumOf("mAOD")).toBe("AOD");
    expect(datumOf("mASD")).toBe("ASD");
    expect(datumOf("m")).toBe("unstated");
  });
  it("says a station has stopped reporting when its latest reading is over two days older than the fetch", () => {
    const readings = [{ t: at, v: 1 }];
    expect(stoppedReporting(readings, at + STATION_QUIET_MS)).toBe(false);
    expect(stoppedReporting(readings, at + STATION_QUIET_MS + 1)).toBe(true);
    expect(stoppedReporting([], at)).toBe(true);
  });
  it("calls a copy of levels old after an hour", () => {
    const copy = { kind: "rivers" as const, fetchedAt: at, validUntil: null };
    expect(freshness(copy, at + 59 * MIN).state).toBe("fresh");
    expect(freshness(copy, at + 14 * 60 * MIN)).toMatchObject({ state: "old", age: "14 hours ago" });
    expect(freshness(copy, at + 14 * 60 * MIN).sentence).toMatch(/levels may have changed since/);
  });
  it("links a station's live page only by its RLOI number, and gives distances in miles too", () => {
    expect(stationLiveUrl("6269")).toBe("https://check-for-flooding.service.gov.uk/station/6269");
    expect(stationLiveUrl(null)).toBeNull();
    expect(stationLiveUrl("../x")).toBeNull();
    expect(distanceWords(8)).toBe("8 km (5 miles)");
    expect(distanceWords(3)).toBe("3 km (2 miles)");
  });
});

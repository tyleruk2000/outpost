/**
 * The filter and the totals, against numbers worked out by hand.
 *
 * Distances here run north along a meridian, where they are easy to check: the Earth
 * radius the app uses is 6,371,008.8 m, so one degree of latitude is
 * 6,371,008.8 × π / 180 = 111,195.08 m, and 0.0001° is 11.1195 m.
 */
import { RECORDING_ID_PATTERN } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { buildRecordingGpx, escapeXml, gpxFileName, gpxTime } from "./gpx";
import {
  addPoint,
  DisplayLine,
  emptyTally,
  type Fix,
  fixTime,
  formatDuration,
  formatSpan,
  judgeFix,
  MAX_ACCURACY_METERS,
  MIN_MOVE_METERS,
  newRecordingId,
  type RecordedPoint,
  tallyOf,
} from "./track-log";

const T0 = Date.UTC(2026, 10, 16, 10, 0, 0);
const STEP = 11.1195; // metres in 0.0001° of latitude

const fix = (lat: number, seconds: number, extra: Partial<Fix> = {}): Fix => ({
  lat,
  lon: -3.09,
  accuracy: 4,
  altitude: null,
  altitudeAccuracy: null,
  time: T0 + seconds * 1000,
  ...extra,
});

const point = (lat: number, seconds: number, ele: number | null = null, segment = 0): RecordedPoint => ({
  segment,
  time: T0 + seconds * 1000,
  lat,
  lon: -3.09,
  ele,
  accuracy: 4,
});

const kept = (verdict: ReturnType<typeof judgeFix>) => {
  if (!verdict.keep) throw new Error(`expected the fix to be kept, but it was refused as ${verdict.reason}`);
  return verdict.point;
};

describe("which fixes are kept", () => {
  it("states its thresholds", () => {
    expect(MAX_ACCURACY_METERS).toBe(30);
    expect(MIN_MOVE_METERS).toBe(5);
  });

  it("keeps the first good fix, with its position to six places and its radius to a tenth", () => {
    const first = kept(judgeFix(fix(54.4600004, 0, { lon: -3.0899996, accuracy: 12.34 }), null, 0));
    expect(first).toEqual({ segment: 0, time: T0, lat: 54.46, lon: -3.09, ele: null, accuracy: 12.3 });
  });

  it("ignores a fix the device says is good to worse than 30 m, and keeps one that is good to exactly 30 m", () => {
    expect(judgeFix(fix(54.46, 0, { accuracy: 30.1 }), null, 0)).toEqual({ keep: false, reason: "inaccurate" });
    expect(judgeFix(fix(54.46, 0, { accuracy: 250 }), null, 0)).toEqual({ keep: false, reason: "inaccurate" });
    expect(judgeFix(fix(54.46, 0, { accuracy: 30 }), null, 0).keep).toBe(true);
  });

  it("needs 5 m of movement from the last kept point", () => {
    const last = point(54.46, 0);
    // 0.00004° north is 4.45 m: not enough. 0.00005° is 5.56 m: enough.
    expect(judgeFix(fix(54.46004, 5), last, 0)).toEqual({ keep: false, reason: "too-close" });
    expect(kept(judgeFix(fix(54.46005, 5), last, 0)).lat).toBe(54.46005);
    // The same place again, however long after, is not a move.
    expect(judgeFix(fix(54.46, 600), last, 0)).toEqual({ keep: false, reason: "too-close" });
  });

  it("needs the move to be at least the fix's own radius, when that is more than 5 m", () => {
    const last = point(54.46, 0);
    // Good to 10 m: 0.00008° (8.90 m) is inside the uncertainty, 0.00009° (10.01 m) is outside it.
    expect(judgeFix(fix(54.46008, 5, { accuracy: 10 }), last, 0)).toEqual({ keep: false, reason: "too-close" });
    expect(judgeFix(fix(54.46009, 5, { accuracy: 10 }), last, 0).keep).toBe(true);
    // Good to 30 m: 0.00026° (28.9 m) is not a move, 0.00028° (31.1 m) is.
    expect(judgeFix(fix(54.46026, 5, { accuracy: 30 }), last, 0)).toEqual({ keep: false, reason: "too-close" });
    expect(judgeFix(fix(54.46028, 5, { accuracy: 30 }), last, 0).keep).toBe(true);
  });

  it("so a device standing still adds no points and no distance, whatever its position does within its radius", () => {
    // Twenty minutes on a wall, the reported position wandering up to 4 m either way.
    let tally = addPoint(emptyTally(), kept(judgeFix(fix(54.46, 0), null, 0)));
    const wander = [0.00003, -0.00002, 0.000035, -0.00003, 0.00001, 0.00002, -0.000035];
    wander.forEach((offset, index) => {
      const verdict = judgeFix(fix(54.46 + offset, (index + 1) * 170), tally.last, 0);
      expect(verdict).toEqual({ keep: false, reason: "too-close" });
    });
    expect(tally.points).toBe(1);
    expect(tally.distanceMeters).toBe(0);
    tally = addPoint(tally, kept(judgeFix(fix(54.4601, 1300), tally.last, 0)));
    expect(tally.distanceMeters).toBeCloseTo(STEP, 1);
  });

  it("keeps the first fix of a new stretch even where the last stretch ended", () => {
    const last = point(54.46, 0, null, 0);
    expect(judgeFix(fix(54.46, 60), last, 0)).toEqual({ keep: false, reason: "too-close" });
    expect(kept(judgeFix(fix(54.46, 60), last, 1)).segment).toBe(1);
  });

  it("drops a fix that is not later than the last kept point", () => {
    const last = point(54.46, 10);
    expect(judgeFix(fix(54.461, 10), last, 0)).toEqual({ keep: false, reason: "out-of-order" });
    expect(judgeFix(fix(54.461, 4), last, 0)).toEqual({ keep: false, reason: "out-of-order" });
    // In a new stretch too: time does not run backwards across a pause.
    expect(judgeFix(fix(54.461, 4), last, 1)).toEqual({ keep: false, reason: "out-of-order" });
  });

  it("drops what is not a position at all", () => {
    for (const broken of [
      fix(Number.NaN, 0),
      fix(91, 0),
      fix(54.46, 0, { lon: 181 }),
      fix(54.46, 0, { accuracy: Number.NaN }),
      fix(54.46, 0, { accuracy: -1 }),
      fix(54.46, 0, { time: Number.NaN }),
    ]) {
      expect(judgeFix(broken, null, 0)).toEqual({ keep: false, reason: "invalid" });
    }
  });

  it("keeps a height to a tenth of a metre, unless the device says it is good to worse than 30 m", () => {
    expect(kept(judgeFix(fix(54.46, 0, { altitude: 123.456, altitudeAccuracy: 8 }), null, 0)).ele).toBe(123.5);
    expect(kept(judgeFix(fix(54.46, 0, { altitude: 123.456, altitudeAccuracy: 30 }), null, 0)).ele).toBe(123.5);
    expect(kept(judgeFix(fix(54.46, 0, { altitude: 123.456, altitudeAccuracy: 31 }), null, 0)).ele).toBeNull();
    // A device that gives a height and no figure for how good it is: the height is kept as given.
    expect(kept(judgeFix(fix(54.46, 0, { altitude: -2.04, altitudeAccuracy: null }), null, 0)).ele).toBe(-2);
    expect(kept(judgeFix(fix(54.46, 0, { altitude: null, altitudeAccuracy: 3 }), null, 0)).ele).toBeNull();
  });

  it("believes a fix's own clock unless it is nowhere near the device's", () => {
    expect(fixTime(T0 - 2000, T0)).toBe(T0 - 2000);
    expect(fixTime(T0 + 0.4, T0)).toBe(T0);
    // A clock counting from some other year, or in other units: the device's own time is used.
    expect(fixTime(T0 - 6 * 60_000, T0)).toBe(T0);
    expect(fixTime(T0 * 1000, T0)).toBe(T0);
    expect(fixTime(Number.NaN, T0)).toBe(T0);
  });
});

describe("what a recording adds up to", () => {
  /**
   * A walk in two stretches, every figure of which can be checked on paper.
   *
   *   stretch 0   t=0     54.46000  100.0 m
   *               t=10    54.46010  102.0 m   11.12 m in 10 s; up 2 m, under the 3 m that counts
   *               t=20    54.46020  104.0 m   11.12 m in 10 s; now 4 m above 100: 4 m of climb
   *               t=620   54.46030  101.0 m   11.12 m in 600 s (a rest): not moving; down 3 m, so climbs count from 101
   *               t=630   54.46050  103.9 m   22.24 m in 10 s; up 2.9 m: not counted
   *   pause
   *   stretch 1   t=1000  54.47000   50.0 m   no distance across the pause; climbs count from 50
   *               t=1030  54.47010   60.0 m   11.12 m in 30 s; 10 m of climb
   *
   * Distance: 6 × 11.1195 = 66.717 m, kept to a tenth: 66.7 m.
   * Moving:   10 + 10 + 10 + 30 = 60 s. The 600 s of rest covered 11 m, which is 0.07 km/h.
   * Climb:    4 + 10 = 14 m.
   */
  const WALK: RecordedPoint[] = [
    point(54.46, 0, 100),
    point(54.4601, 10, 102),
    point(54.4602, 20, 104),
    point(54.4603, 620, 101),
    point(54.4605, 630, 103.9),
    point(54.47, 1000, 50, 1),
    point(54.4701, 1030, 60, 1),
  ];

  it("adds up distance, moving time and climb as worked out by hand", () => {
    const tally = tallyOf(WALK);
    expect(tally.points).toBe(7);
    expect(tally.distanceRaw).toBeCloseTo(6 * STEP, 2);
    expect(tally.distanceMeters).toBe(66.7);
    expect(tally.movingMs).toBe(60_000);
    expect(tally.ascentMeters).toBe(14);
    expect(tally.firstTime).toBe(T0);
    expect(tally.lastTime).toBe(T0 + 1_030_000);
  });

  it("does not count the gap between two stretches as walked, however far apart they are", () => {
    // Stretch 1 starts 0.0095° north of where stretch 0 ended: 1,056 m that were not recorded.
    const together = tallyOf(WALK);
    const joined = tallyOf(WALK.map((item) => ({ ...item, segment: 0 })));
    expect(joined.distanceRaw - together.distanceRaw).toBeCloseTo(95 * STEP, 1);
    expect(together.distanceMeters).toBeLessThan(70);
  });

  it("counts a stretch as moving at 1 km/h and not below it", () => {
    // 11.1195 m in 40 s is 1.0008 km/h; in 41 s it is 0.976 km/h.
    expect(tallyOf([point(54.46, 0), point(54.4601, 40)]).movingMs).toBe(40_000);
    expect(tallyOf([point(54.46, 0), point(54.4601, 41)]).movingMs).toBe(0);
  });

  it("has no climb at all until a point has a height, and skips points without one", () => {
    expect(tallyOf([point(54.46, 0), point(54.4601, 10)]).ascentMeters).toBeNull();
    // 200, (none), 206: 6 m. The point without a height neither adds nor resets anything.
    const mixed = tallyOf([point(54.46, 0, 200), point(54.4601, 10), point(54.4602, 20, 206)]);
    expect(mixed.ascentMeters).toBe(6);
    expect(mixed.distanceMeters).toBe(22.2);
  });

  it("does not let heights that wobble by less than 3 m add up, and does count a wobble of 3 m or more", () => {
    const wobbling = (by: number) =>
      Array.from({ length: 100 }, (_, index) => point(54.46 + index * 0.0001, index * 10, 500 + (index % 2 === 0 ? by : -by)));
    // ±1.4 m around 500 m (2.8 m from top to bottom) for a kilometre of flat ground: nothing.
    expect(tallyOf(wobbling(1.4)).ascentMeters).toBe(0);
    // ±2 m is 4 m from top to bottom, which is over the 3 m that counts: every one of the 49
    // rises is taken for climbing, 196 m of it on flat ground. This is why the app says that
    // a device whose heights wander reads high. The server does the same sum for every track.
    expect(tallyOf(wobbling(2)).ascentMeters).toBe(196);
    // A steady 1 m a point is climbing, and all of it is counted: 99 m, in steps of 3.
    const rising = Array.from({ length: 100 }, (_, index) => point(54.46 + index * 0.0001, index * 10, 500 + index));
    expect(tallyOf(rising).ascentMeters).toBe(99);
  });

  it("gives the same totals one point at a time as all at once", () => {
    let tally = emptyTally();
    for (const item of WALK) tally = addPoint(tally, item);
    expect(tally).toEqual(tallyOf(WALK));
  });
});

describe("the recording as GPX", () => {
  it("writes one track with a segment for each stretch, a time at every point and a height where there is one", () => {
    const built = buildRecordingGpx("Up & over <the> fell", [
      point(54.46, 0, 100),
      point(54.4601, 10),
      point(54.47, 1000, 50.25, 1),
      { ...point(54.4701, 1030, 60, 1), time: T0 + 1_030_500 },
    ]);
    expect(built.points).toBe(4);
    expect(built.segments).toBe(2);
    expect(built.gpx).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">',
        "  <metadata>",
        "    <name>Up &amp; over &lt;the&gt; fell</name>",
        "    <time>2026-11-16T10:00:00Z</time>",
        "  </metadata>",
        "  <trk>",
        "    <name>Up &amp; over &lt;the&gt; fell</name>",
        "    <trkseg>",
        '      <trkpt lat="54.460000" lon="-3.090000"><ele>100.0</ele><time>2026-11-16T10:00:00Z</time></trkpt>',
        '      <trkpt lat="54.460100" lon="-3.090000"><time>2026-11-16T10:00:10Z</time></trkpt>',
        "    </trkseg>",
        "    <trkseg>",
        '      <trkpt lat="54.470000" lon="-3.090000"><ele>50.3</ele><time>2026-11-16T10:16:40Z</time></trkpt>',
        '      <trkpt lat="54.470100" lon="-3.090000"><ele>60.0</ele><time>2026-11-16T10:17:10.500Z</time></trkpt>',
        "    </trkseg>",
        "  </trk>",
        "</gpx>",
        "",
      ].join("\n"),
    );
  });

  it("leaves out a stretch of one point, which is not a line", () => {
    const built = buildRecordingGpx("Short", [point(54.46, 0), point(54.4601, 10), point(54.47, 100, null, 1)]);
    expect(built.points).toBe(2);
    expect(built.segments).toBe(1);
    expect(built.gpx.match(/<trkseg>/g)).toHaveLength(1);
    // Nothing that joins into a line: a file with no track in it.
    const nothing = buildRecordingGpx("Nothing", [point(54.46, 0)]);
    expect(nothing.points).toBe(0);
    expect(nothing.gpx).not.toContain("<trk>");
  });

  it("writes very small coordinates as plain decimals, never with an exponent", () => {
    const built = buildRecordingGpx("Null island", [
      { ...point(0.000001, 0), lon: -0.000001 },
      { ...point(0.0001, 10), lon: 0 },
    ]);
    expect(built.gpx).toContain('<trkpt lat="0.000001" lon="-0.000001">');
    expect(built.gpx).not.toMatch(/\de-\d/);
  });

  it("makes text safe for XML and names safe for files", () => {
    expect(escapeXml("a\u0000b \"c\" 'd'")).toBe("ab &quot;c&quot; &apos;d&apos;");
    expect(gpxTime(T0)).toBe("2026-11-16T10:00:00Z");
    expect(gpxFileName("Helvellyn: by Striding Edge / 16.11")).toBe("Helvellyn by Striding Edge 16.11.gpx");
    expect(gpxFileName("///")).toBe("recording.gpx");
  });
});

describe("the line drawn while recording", () => {
  const along = (count: number, segment = 0, from = 0) =>
    Array.from({ length: count }, (_, index) => ({ segment, lat: 54 + (from + index) * 0.0001, lon: -3 }));
  const lats = (line: DisplayLine) => line.coordinates().map((stretch) => stretch.map(([, lat]) => Math.round((lat - 54) * 10_000)));

  it("is every point while there are few", () => {
    const line = new DisplayLine(8);
    for (const item of along(8)) line.add(item);
    expect(lats(line)).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]]);
    expect(line.head()).toEqual([-3, 54.0007]);
  });

  it("keeps every second point once it is over its limit, then every fourth, and always reaches the newest point", () => {
    const line = new DisplayLine(4);
    const points = along(10);
    for (const item of points.slice(0, 5)) line.add(item);
    // The fifth point took it over four: every second one is kept.
    expect(lats(line)).toEqual([[0, 2, 4]]);
    line.add(points[5]!);
    // Not due to be a vertex, but the line still ends where the walker is.
    expect(lats(line)).toEqual([[0, 2, 4, 5]]);
    line.add(points[6]!);
    expect(lats(line)).toEqual([[0, 2, 4, 6]]);
    line.add(points[7]!);
    line.add(points[8]!);
    // Over four again: every fourth.
    expect(lats(line)).toEqual([[0, 4, 8]]);
    line.add(points[9]!);
    expect(lats(line)).toEqual([[0, 4, 8, 9]]);
    expect(line.head()).toEqual([-3, 54.0009]);
  });

  it("never joins two stretches, and ends each where it really ended", () => {
    const line = new DisplayLine(4);
    for (const item of along(6)) line.add(item);
    expect(lats(line)).toEqual([[0, 2, 4, 5]]);
    for (const item of along(2, 1, 100)) line.add(item);
    expect(lats(line).at(-1)?.[0]).toBe(100);
    // The first stretch still ends at its own last point.
    expect(lats(line)[0]?.at(-1)).toBe(5);
    expect(lats(line)).toHaveLength(2);
  });
});

describe("small things", () => {
  it("writes durations as a stopwatch does", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(59_999)).toBe("0:59");
    expect(formatDuration(245_000)).toBe("4:05");
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(2 * 3_600_000 + 31 * 60_000 + 7000)).toBe("2:31:07");
    expect(formatDuration(-5)).toBe("0:00");
  });

  it("says a stretch of time in words", () => {
    expect(formatSpan(75_000)).toBe("75 seconds");
    expect(formatSpan(1_000)).toBe("1 second");
    expect(formatSpan(4 * 60_000 + 10_000)).toBe("4 minutes");
    expect(formatSpan(89 * 60_000)).toBe("89 minutes");
    expect(formatSpan(2 * 3_600_000)).toBe("2 hours");
    expect(formatSpan(3_600_000 + 35 * 60_000)).toBe("1 hour 35 min");
  });

  it("makes ids the server accepts, in time order", () => {
    const bytes = (count: number) => Uint8Array.from({ length: count }, (_, index) => index * 37);
    const earlier = newRecordingId(T0, bytes);
    const later = newRecordingId(T0 + 1, bytes);
    expect(earlier).toMatch(RECORDING_ID_PATTERN);
    expect(earlier).toHaveLength(26);
    expect(earlier < later).toBe(true);
    // The first ten characters are the time, and nothing else.
    expect(newRecordingId(T0, () => new Uint8Array(16)).slice(0, 10)).toBe(earlier.slice(0, 10));
  });
});

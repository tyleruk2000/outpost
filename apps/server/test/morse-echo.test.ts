import {
  AdaptiveDecoder,
  analyzeKeying,
  applyEchoResult,
  charStatsFromSessions,
  charTries,
  echoTarget,
  echoTiming,
  encodeChar,
  farnsworthTiming,
  gradeEcho,
  INITIAL_SPEED_STATE,
  type KeyedMark,
  kochUnlock,
  kochWeights,
  lessonCharset,
  type MorseTiming,
  newestKochChar,
  nextEchoSpeed,
  randomExchange,
  replyComplete,
  seededRandom,
  standardTiming,
  textToTimeline,
  timelineTracks,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

/** Key `text` with given unit multipliers (dah, intra, letter, word) at a dit of `u` ms. */
function keyText(
  text: string,
  u: number,
  shape: { dah?: number; intra?: number; letter?: number; word?: number; dit?: number } = {},
): KeyedMark[] {
  const { dah = 3, intra = 1, letter = 3, word = 7, dit = 1 } = shape;
  const marks: KeyedMark[] = [];
  let t = 1000;
  const words = text.split(" ");
  words.forEach((w, wi) => {
    if (wi > 0) t += (word - letter) * u;
    [...w].forEach((ch, ci) => {
      if (ci > 0 || wi > 0) t += letter * u;
      const code = encodeChar(ch)!;
      [...code].forEach((el, ei) => {
        if (ei > 0) t += intra * u;
        const len = (el === "." ? dit : dah) * u;
        marks.push({ downAt: t, upAt: t + len, element: el === "." ? "dit" : "dah" });
        t += len;
      });
    });
  });
  return marks;
}

describe("AdaptiveDecoder marks", () => {
  it("records every keyed mark with its timestamps, and reset clears them", () => {
    const d = new AdaptiveDecoder({ initialDitMs: 60 });
    d.keyDown(0);
    d.keyUp(60);
    d.keyDown(120);
    d.keyUp(300);
    expect(d.marks).toEqual([
      { downAt: 0, upAt: 60, element: "dit" },
      { downAt: 120, upAt: 300, element: "dah" },
    ]);
    d.reset(100);
    expect(d.marks).toEqual([]);
    expect(d.ditEstimateMs).toBe(100);
  });
});

describe("charTries / charStatsFromSessions", () => {
  it("counts each non-space character of a target", () => {
    expect(charTries("KMK MU")).toEqual({ K: 2, M: 2, U: 1 });
  });

  it("keeps only the last N tries per character, newest first", () => {
    const stats = charStatsFromSessions(
      [
        { tries: { K: 15 }, misses: { K: 0 } },
        { tries: { K: 10, M: 4 }, misses: { K: 10, M: 1 } },
      ],
      20,
    );
    // 15 clean, then only 5 of the older 10 (all misses) fit in the window
    expect(stats.K).toEqual({ tries: 20, misses: 5 });
    expect(stats.M).toEqual({ tries: 4, misses: 1 });
  });

  it("ignores legacy sessions that recorded misses but no tries", () => {
    expect(charStatsFromSessions([{ misses: { K: 3 } }])).toEqual({});
  });
});

describe("kochWeights", () => {
  it("puts the newest character in about one place in three while it is new", () => {
    const charset = lessonCharset(5); // K M U R E S
    const w = kochWeights(charset, {}, "S");
    const total = w.reduce((a, b) => a + b, 0);
    expect(w[charset.indexOf("S")]! / total).toBeCloseTo(1 / 3, 2);
  });

  it("tapers the newest character back to its normal share over its first 20 tries", () => {
    const charset = lessonCharset(5);
    const settled = Object.fromEntries(charset.map((c) => [c, { tries: 20, misses: 0 }]));
    const share = (tries: number) => {
      const w = kochWeights(charset, { ...settled, S: { tries, misses: 0 } }, "S");
      return w[charset.indexOf("S")]! / w.reduce((a, b) => a + b, 0);
    };
    expect(share(10)).toBeLessThan(share(0));
    expect(share(10)).toBeGreaterThan(share(20));
    expect(share(20)).toBeCloseTo(1 / charset.length, 2);
  });

  it("weights weak and little-tried characters up", () => {
    const charset = ["K", "M", "U"];
    const w = kochWeights(charset, { K: { tries: 20, misses: 0 }, M: { tries: 20, misses: 10 }, U: { tries: 1, misses: 0 } }, null);
    expect(w[1]!).toBeGreaterThan(w[0]!);
    expect(w[2]!).toBeGreaterThan(w[0]!);
  });
});

describe("kochUnlock", () => {
  const charset = lessonCharset(3); // K M U R
  it("is not ready until the newest character has enough tries", () => {
    const stats = {
      K: { tries: 20, misses: 0 },
      M: { tries: 20, misses: 0 },
      R: { tries: 3, misses: 0 },
    };
    const r = kochUnlock(charset, stats, "R");
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/R/);
  });

  it("unlocks at 90% over the window", () => {
    const ok = Object.fromEntries(charset.map((c) => [c, { tries: 20, misses: 2 }]));
    expect(kochUnlock(charset, ok, "R").ready).toBe(true);
    const weak = { ...ok, M: { tries: 20, misses: 8 } };
    const r = kochUnlock(charset, weak, "R");
    expect(r.ready).toBe(false);
    expect(r.accuracy).toBeLessThan(0.9);
  });
});

describe("nextEchoSpeed", () => {
  it("steps up after a clean streak and says why", () => {
    let s = { ...INITIAL_SPEED_STATE, wpm: 15 };
    let change = null;
    for (let i = 0; i < 3; i++) ({ state: s, change } = nextEchoSpeed(s, 1));
    expect(s.wpm).toBe(16);
    expect(change?.reason).toMatch(/3 clean/);
    expect(s.cleanStreak).toBe(0);
  });

  it("steps down after consecutive misses and holds at the bounds", () => {
    let s = { ...INITIAL_SPEED_STATE, wpm: 6 };
    ({ state: s } = nextEchoSpeed(s, 0.5, { min: 5 }));
    expect(s.wpm).toBe(6);
    const r = nextEchoSpeed(s, 0.4, { min: 5 });
    expect(r.state.wpm).toBe(5);
    expect(r.change?.reason).toMatch(/2 misses/);
    let t = r.state;
    t = nextEchoSpeed(t, 0.4, { min: 5 }).state;
    expect(nextEchoSpeed(t, 0.4, { min: 5 }).state.wpm).toBe(5);
  });

  it("a miss breaks the clean streak", () => {
    let s = { ...INITIAL_SPEED_STATE, wpm: 15 };
    s = nextEchoSpeed(s, 1).state;
    s = nextEchoSpeed(s, 1).state;
    s = nextEchoSpeed(s, 0.5).state;
    s = nextEchoSpeed(s, 1).state;
    expect(s.wpm).toBe(15);
  });
});

describe("analyzeKeying", () => {
  const timing = standardTiming(20); // 60 ms dit

  it("scores perfect keying as perfect with an encouraging tip", () => {
    const a = analyzeKeying(keyText("PARIS PARIS", 60), timing, { target: "PARIS PARIS" });
    expect(a.score).toBeGreaterThan(0.97);
    expect(a.metrics.find((m) => m.id === "ratio")!.keyedUnits).toBeCloseTo(3, 5);
    expect(a.tips).toHaveLength(1);
  });

  it("flags short dahs in plain language", () => {
    const a = analyzeKeying(keyText("MAN", 60, { dah: 2.4 }), timing, { target: "MAN" });
    const ratio = a.metrics.find((m) => m.id === "ratio")!;
    expect(ratio.keyedUnits).toBeCloseTo(2.4, 1);
    expect(a.tips[0]).toBe("Your dahs average 2.4 dits, aim for 3.");
  });

  it("flags crowded letter gaps and stretched word gaps", () => {
    const a = analyzeKeying(keyText("TEST ME", 60, { letter: 1.6, word: 11 }), timing, {
      target: "TEST ME",
    });
    const letter = a.metrics.find((m) => m.id === "letter")!;
    const word = a.metrics.find((m) => m.id === "word")!;
    expect(letter.keyedUnits).toBeCloseTo(1.6, 1);
    expect(word.keyedUnits).toBeCloseTo(11, 1);
    expect(a.tips.length).toBeLessThanOrEqual(2);
    expect(a.tips.join(" ")).toMatch(/letter gaps|word gaps/);
  });

  it("skips the dit/dah ratio when an automatic keyer timed the elements", () => {
    const a = analyzeKeying(keyText("MAN", 60, { dah: 2.4 }), timing, {
      target: "MAN",
      keyerTimed: true,
    });
    expect(a.metrics.find((m) => m.id === "ratio")!.score).toBeNull();
    expect(a.tips.join(" ")).not.toMatch(/dahs/);
  });

  it("falls back to threshold gap classification when element counts differ", () => {
    const a = analyzeKeying(keyText("TE", 60), timing, { target: "KMU" });
    expect(a.metrics.find((m) => m.id === "letter")!.count).toBe(1);
  });

  it("copes with nothing keyed", () => {
    const a = analyzeKeying([], timing, { target: "K" });
    expect(a.score).toBe(0);
    expect(a.tips[0]).toMatch(/Nothing/);
  });
});

describe("timelineTracks", () => {
  it("aligns played and keyed marks from zero on one ms axis", () => {
    const timing = standardTiming(20);
    const t = timelineTracks("K", timing, keyText("K", 66));
    expect(t.played.map((s) => s.end - s.start)).toEqual([180, 60, 180]);
    expect(t.keyed[0]!.start).toBe(0);
    expect(t.keyed).toHaveLength(3);
    expect(t.totalMs).toBeGreaterThanOrEqual(t.keyed[2]!.end);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0]).toMatchObject({ playedElement: "dah", keyedElement: "dah", playedMs: 180 });
  });
});

describe("gradeEcho", () => {
  it("grades copy and timing together and reports per-character tries and misses", () => {
    const timing = standardTiming(20);
    const g = gradeEcho("KM", "KR", keyText("KR", 60), timing);
    expect(g.copy.accuracy).toBeLessThan(1);
    expect(g.tries).toEqual({ K: 1, M: 1 });
    expect(g.misses).toEqual({ M: 1 });
    expect(g.clean).toBe(false);
    const ok = gradeEcho("KM", "KM", keyText("KM", 60), timing);
    expect(ok.clean).toBe(true);
  });
});

describe("replyComplete", () => {
  const timing = standardTiming(20);
  it("waits for keying, then ends after the configured number of word spaces", () => {
    expect(replyComplete(null, 99_999, timing, 2)).toBe(false);
    expect(replyComplete(1000, 1000 + 2 * 420 - 1, timing, 2)).toBe(false);
    expect(replyComplete(1000, 1000 + 2 * 420, timing, 2)).toBe(true);
  });
});

describe("echo content", () => {
  it("draws Koch groups from the lesson with the newest character tapered in", () => {
    const t = echoTarget("koch", { seed: 7, lesson: 5, groupSize: 5, stats: {} });
    expect(t).toMatch(/^[KMURES]{5}$/);
  });

  it("builds callsign, abbreviation and exchange targets from the shared generators", () => {
    expect(echoTarget("callsigns", { seed: 1, lesson: 1 })).toMatch(/^[A-Z0-9/]+$/);
    expect(echoTarget("abbrev", { seed: 1, lesson: 1 }).split(" ")).toHaveLength(2);
    const ex = randomExchange({ seed: 3 });
    expect(ex).toMatch(/RST|UR|NAME|QTH|5NN|TU/);
    expect(ex.split(" ").length).toBeLessThanOrEqual(4);
    expect(echoTarget("exchange", { seed: 3, lesson: 1 })).toBe(ex);
  });

  it("is reproducible for a seed", () => {
    const rnd = seededRandom(1);
    const seed = Math.floor(rnd() * 1e9);
    expect(echoTarget("koch", { seed, lesson: 10 })).toBe(echoTarget("koch", { seed, lesson: 10 }));
  });
});

describe("echoTiming", () => {
  it("plays standard timing, or Farnsworth gaps at a faster character speed", () => {
    expect(echoTiming(12, { farnsworth: false }).ditMs).toBe(100);
    const f = echoTiming(8, { farnsworth: true, charWpm: 18 });
    expect(f.ditMs).toBeCloseTo(1200 / 18, 5);
    expect(f.interCharMs).toBeGreaterThan(3 * f.ditMs);
    // Farnsworth never slows characters below the effective rate
    expect(echoTiming(20, { farnsworth: true, charWpm: 18 }).ditMs).toBe(60);
  });
});

/** Marks exactly as `text` sounds at `timing` (reviewer probe, lb-w5fh). */
function marksAt(text: string, timing: MorseTiming): KeyedMark[] {
  const out: KeyedMark[] = [];
  let now = 0;
  for (const seg of textToTimeline(text, timing).segments) {
    if (seg.on) {
      out.push({
        downAt: now,
        upAt: now + seg.ms,
        element: seg.ms > 2 * timing.ditMs ? "dah" : "dit",
      });
    }
    now += seg.ms;
  }
  return out;
}

describe("review regressions (lb-w5fh)", () => {
  it("lesson 1 does not unlock after a single reply", () => {
    const stats = charStatsFromSessions([{ tries: { K: 2, M: 2 }, misses: {} }]);
    const r = kochUnlock(lessonCharset(1), stats, newestKochChar(1));
    expect(r.ready).toBe(false);
    const enough = { K: { tries: 10, misses: 0 }, M: { tries: 10, misses: 1 } };
    expect(kochUnlock(lessonCharset(1), enough, null).ready).toBe(true);
  });

  it("judges well-proportioned keying at a different speed only on speed", () => {
    const a = analyzeKeying(marksAt("PARIS PARIS", standardTiming(10)), standardTiming(15), {
      target: "PARIS PARIS",
    });
    for (const m of a.metrics) expect(m.score).toBeCloseTo(1, 5);
    expect(a.tips).toEqual(["You keyed at about 10 wpm against 15 played; match the speed you heard."]);
  });

  it("keeps the speed tip even when spacing tips are worse", () => {
    const marks = keyText("TEST ME", 120, { letter: 1.2, word: 2.5 });
    const a = analyzeKeying(marks, standardTiming(20), { target: "TEST ME" });
    expect(a.tips[0]).toMatch(/You keyed at about 10 wpm/);
  });

  it("with Farnsworth, judges letter and word gaps at standard spacing", () => {
    const a = analyzeKeying(marksAt("KMR KMR", standardTiming(20)), farnsworthTiming(20, 12), {
      target: "KMR KMR",
    });
    expect(a.metrics.find((m) => m.id === "letter")!.expectedUnits).toBe(3);
    expect(a.metrics.find((m) => m.id === "word")!.expectedUnits).toBe(7);
    expect(a.score).toBeGreaterThan(0.97);
  });

  it("takes dit and dah from what was keyed, not from the target", () => {
    const t = standardTiming(15);
    const c = analyzeKeying(marksAt("N", t), t, { target: "A" });
    expect(c.metrics[0]!.keyedUnits).toBeCloseTo(3, 5);
    expect(c.keyedWpm).toBe(15);
    expect(c.tips.join(" ")).not.toMatch(/0\.3/);
  });
});

describe("speed tip wording", () => {
  it("does not mention what was heard when nothing was played", () => {
    const a = analyzeKeying(keyText("PARIS", 120), standardTiming(20), {
      target: "PARIS",
      heard: false,
    });
    expect(a.tips[0]).toBe("You keyed at about 10 wpm against the 20 wpm set; keep to the speed you chose.");
  });
});

describe("applyEchoResult", () => {
  const timing = standardTiming(20);
  const base = {
    target: "KM",
    decodedText: "KM",
    marks: keyText("KM", 60),
    timing,
    speed: { wpm: 20, cleanStreak: 2, missStreak: 0 },
    adaptive: true,
    echoWpm: 20,
    content: "koch" as const,
    lesson: 1,
    priorOutcomes: [],
  };

  it("grades, steps speed, and builds the session to record", () => {
    const r = applyEchoResult(base);
    expect(r.grade.clean).toBe(true);
    expect(r.speed.wpm).toBe(21);
    expect(r.speedChange?.direction).toBe("up");
    expect(r.session).toMatchObject({ kind: "echo", accuracy: 1, charWpm: 20, lesson: 1 });
    expect(r.outcome).toEqual({ tries: { K: 1, M: 1 }, misses: {} });
    expect(r.tracks.keyed).toHaveLength(5); // -.- --
    expect(r.unlock).toBeNull();
  });

  it("unlocks the next lesson once the window is earned, and holds speed when not adaptive", () => {
    const prior = [{ tries: { K: 9, M: 9 }, misses: {} }];
    const r = applyEchoResult({ ...base, adaptive: false, priorOutcomes: prior });
    expect(r.unlock).toEqual({ lesson: 2, chars: ["U"] });
    expect(r.speed).toEqual(base.speed);
    expect(r.speedChange).toBeNull();
    expect(applyEchoResult({ ...base, content: "callsigns", priorOutcomes: prior }).unlock).toBeNull();
  });
});

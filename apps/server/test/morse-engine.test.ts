import {
  AdaptiveDecoder,
  ALL_CHARS,
  BugKeyer,
  callsignCharset,
  DEFAULT_PROFILE,
  decodeElements,
  ditMs,
  drillCharset,
  effectiveWpm,
  encodeChar,
  encodeProsign,
  farnsworthTiming,
  gradeCopy,
  gradeSending,
  IambicKeyer,
  type KeyEvent,
  type KeyerProfile,
  KOCH_LESSON_COUNT,
  KOCH_ORDER,
  keyerTimings,
  lessonCharset,
  lessonNewChars,
  MORSE_MAP,
  RADIO_PRESETS,
  randomCallsigns,
  randomGroups,
  randomQsoPhrase,
  randomWords,
  rhythmScore,
  StraightKey,
  seededRandom,
  standardTiming,
  textToTimeline,
  textUnits,
  toAscii,
  toDisplay,
  tokenize,
  wordPool,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// table
// ---------------------------------------------------------------------------

describe("morse table", () => {
  it("normalises display glyphs to ascii and back", () => {
    expect(toAscii("·−")).toBe(".-");
    expect(toDisplay(".-")).toBe("·−");
  });

  it("encodes every letter, digit and punctuation mark", () => {
    expect(encodeChar("A")).toBe(".-");
    expect(encodeChar("a")).toBe(".-");
    expect(encodeChar("0")).toBe("-----");
    expect(encodeChar("?")).toBe("..--..");
    expect(ALL_CHARS.length).toBe(26 + 10 + 7);
    for (const ch of ALL_CHARS) expect(encodeChar(ch)).toBeTruthy();
  });

  it("round-trips every character through decode", () => {
    for (const [char, code] of MORSE_MAP) {
      expect(decodeElements(code)).toBe(char);
    }
  });

  it("handles prosigns, preferring plain chars on pattern collisions", () => {
    expect(encodeProsign("AR")).toBe(".-.-.");
    expect(encodeProsign("<SK>")).toBe("...-.-");
    expect(decodeElements("...-.-")).toBe("<SK>");
    // '.-.-.' is both '+' and <AR>; the plain character wins
    expect(decodeElements(".-.-.")).toBe("+");
  });

  it("tokenizes text with prosigns and collapsing whitespace", () => {
    const tokens = tokenize("cq  de <SK> !");
    expect(tokens).toEqual([
      { kind: "char", char: "C", code: "-.-." },
      { kind: "char", char: "Q", code: "--.-" },
      { kind: "space" },
      { kind: "char", char: "D", code: "-.." },
      { kind: "char", char: "E", code: "." },
      { kind: "space" },
      { kind: "prosign", sign: "SK", code: "...-.-" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// timing
// ---------------------------------------------------------------------------

describe("timing", () => {
  it("ditMs follows PARIS: 1200/wpm", () => {
    expect(ditMs(20)).toBe(60);
    expect(ditMs(12)).toBe(100);
    expect(() => ditMs(0)).toThrow();
  });

  it("standard timing has 1/3/1/3/7 unit structure", () => {
    const t = standardTiming(20);
    expect(t.ditMs).toBe(60);
    expect(t.dahMs).toBe(180);
    expect(t.intraCharMs).toBe(60);
    expect(t.interCharMs).toBe(180);
    expect(t.interWordMs).toBe(420);
  });

  it("farnsworth collapses to standard when effective >= char speed", () => {
    expect(farnsworthTiming(18, 18)).toEqual(standardTiming(18));
    expect(farnsworthTiming(18, 25)).toEqual(standardTiming(18));
  });

  it("farnsworth 18/5 stretches spacing to hit the effective rate (LCWO model)", () => {
    const t = farnsworthTiming(18, 5);
    // spacing unit: (60/5 - 37.2/18)/19 s
    const spacingUnitMs = ((60 / 5 - 37.2 / 18) / 19) * 1000;
    expect(t.interCharMs).toBeCloseTo(3 * spacingUnitMs, 6);
    expect(t.interWordMs).toBeCloseTo(7 * spacingUnitMs, 6);
    expect(t.ditMs).toBeCloseTo(1200 / 18, 6);
    // and the implied effective speed is 5 wpm
    expect(effectiveWpm(t)).toBeCloseTo(5, 6);
  });

  it("effectiveWpm inverts standard timing", () => {
    expect(effectiveWpm(standardTiming(20))).toBeCloseTo(20, 6);
  });
});

// ---------------------------------------------------------------------------
// encode
// ---------------------------------------------------------------------------

describe("encode", () => {
  it("PARIS is 43 units as a word (50 with its trailing word gap)", () => {
    expect(textUnits("PARIS")).toBe(43);
    expect(textUnits("PARIS PARIS")).toBe(43 + 7 + 43);
  });

  it('timeline for "PARIS" at 20 wpm lasts 43 units of 60 ms', () => {
    const enc = textToTimeline("PARIS", standardTiming(20));
    expect(enc.totalMs).toBeCloseTo(43 * 60, 6);
    // starts keyed, ends keyed
    expect(enc.segments[0]!.on).toBe(true);
    expect(enc.segments[enc.segments.length - 1]!.on).toBe(true);
  });

  it('timeline of "E" is a single dit', () => {
    const enc = textToTimeline("E", standardTiming(20));
    expect(enc.segments).toEqual([{ on: true, ms: 60, tokenIndex: 0 }]);
  });

  it("word gaps are 7 units", () => {
    const enc = textToTimeline("E E", standardTiming(20));
    const off = enc.segments.filter((s) => !s.on).reduce((a, s) => a + s.ms, 0);
    expect(off).toBeCloseTo(7 * 60, 6);
  });

  it("prosigns run with no inter-letter gap", () => {
    // <AR> = .-.-.  → 5 marks 4 intra gaps = 1+1+3+1+1+1+3+1+1 = 13 units... wait
    // .(1) gap(1) -(3) gap(1) .(1) gap(1) -(3) gap(1) .(1) = 13? sum marks 1+3+1+3+1=9 + 4 gaps = 13
    const enc = textToTimeline("<AR>", standardTiming(20));
    expect(enc.totalMs).toBeCloseTo(13 * 60, 6);
    // AR as two letters: A=5u + 3u letter gap + R=7u = 15u
    const two = textToTimeline("AR", standardTiming(20));
    expect(two.totalMs).toBeCloseTo(15 * 60, 6);
  });
});

// ---------------------------------------------------------------------------
// koch
// ---------------------------------------------------------------------------

describe("koch", () => {
  it("has the LCWO 41-char order and 40 lessons", () => {
    expect(KOCH_ORDER.length).toBe(41);
    expect(KOCH_LESSON_COUNT).toBe(40);
    expect(new Set(KOCH_ORDER).size).toBe(41);
    expect(KOCH_ORDER[0]).toBe("K");
    expect(KOCH_ORDER[1]).toBe("M");
  });

  it("lesson 1 has two chars, each later lesson adds one", () => {
    expect(lessonCharset(1)).toEqual(["K", "M"]);
    expect(lessonCharset(2)).toEqual(["K", "M", "U"]);
    expect(lessonCharset(40).length).toBe(41);
    expect(lessonNewChars(1)).toEqual(["K", "M"]);
    expect(lessonNewChars(3)).toEqual(["R"]);
  });

  it("clamps out-of-range lessons", () => {
    expect(lessonCharset(0)).toEqual(["K", "M"]);
    expect(lessonCharset(999).length).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// drills
// ---------------------------------------------------------------------------

describe("drills", () => {
  it("seeded RNG is reproducible", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("random groups use only the charset and honour sizes", () => {
    const text = randomGroups(["K", "M"], { groups: 4, groupSize: 5, seed: 7 });
    const words = text.split(" ");
    expect(words.length).toBe(4);
    for (const w of words) {
      expect(w.length).toBe(5);
      expect([...w].every((c) => c === "K" || c === "M")).toBe(true);
    }
    expect(randomGroups(["K", "M"], { groups: 4, seed: 7 })).toBe(text);
  });

  it("weights bias character selection", () => {
    const text = randomGroups(["A", "B"], {
      groups: 40,
      groupSize: 5,
      seed: 1,
      weights: [0.0001, 1],
    });
    const bCount = [...text].filter((c) => c === "B").length;
    expect(bCount).toBeGreaterThan(180); // ~all of 200
  });

  it("callsigns look like callsigns", () => {
    const calls = randomCallsigns({ count: 20, seed: 3 }).split(" ");
    expect(calls.length).toBe(20);
    for (const c of calls) expect(c).toMatch(/^[A-Z0-9]{3,8}$/);
  });

  it("simple callsigns are short single-letter-prefix calls; complex may carry /P", () => {
    const simple = randomCallsigns({ count: 40, seed: 5, tier: "simple" }).split(" ");
    for (const c of simple) expect(c).toMatch(/^[A-Z]\d[A-Z]{2,3}$/);
    const complex = randomCallsigns({ count: 200, seed: 5, tier: "complex" }).split(" ");
    expect(complex.some((c) => c.includes("/"))).toBe(true);
    for (const c of complex) expect(c).toMatch(/^[A-Z0-9]{3,8}(\/(P|M|QRP|MM))?$/);
  });

  it("word tiers change the pool and drills draw only from it", () => {
    expect(wordPool("simple").every((w) => w.length <= 5)).toBe(true);
    expect(wordPool("complex").some((w) => w.length > 5)).toBe(true);
    const words = randomWords({ count: 30, seed: 2, tier: "complex" }).split(" ");
    for (const w of words) expect(wordPool("complex")).toContain(w);
  });

  it("drill charsets list distinct characters, letters then digits then punctuation", () => {
    expect(drillCharset(["CQ", "DE", "599", "HW?"])).toEqual(["C", "D", "E", "H", "Q", "W", "5", "9", "?"]);
    expect(callsignCharset("simple")).not.toContain("/");
    expect(callsignCharset("complex")).toContain("/");
    expect(callsignCharset("complex").at(0)).toBe("A");
  });

  it("word and phrase drills are reproducible", () => {
    expect(randomWords({ count: 5, seed: 9 })).toBe(randomWords({ count: 5, seed: 9 }));
    expect(randomQsoPhrase({ seed: 4 })).toBe(randomQsoPhrase({ seed: 4 }));
  });
});

// ---------------------------------------------------------------------------
// keyer
// ---------------------------------------------------------------------------

/** Run a scripted paddle timeline and return the emitted envelope. */
function runKeyer(keyer: IambicKeyer, script: { at: number; side: "dit" | "dah"; pressed: boolean }[], untilMs: number): KeyEvent[] {
  const events: KeyEvent[] = [];
  let now = 0;
  const sorted = [...script].sort((a, b) => a.at - b.at);
  for (const step of sorted) {
    // pump ticks up to the event time in small steps (like rAF would)
    while (now < step.at) {
      now = Math.min(now + 5, step.at);
      events.push(...keyer.tick(now));
    }
    events.push(...keyer.setPaddle(step.side, step.pressed, step.at));
  }
  while (now < untilMs) {
    now = Math.min(now + 5, untilMs);
    events.push(...keyer.tick(now));
  }
  return events;
}

/** Collapse an envelope into element durations: [{element, ms}] */
function elementsOf(events: KeyEvent[]): { element: string; ms: number }[] {
  const out: { element: string; ms: number }[] = [];
  let downAt: number | null = null;
  let el = "";
  for (const e of events) {
    if (e.type === "down") {
      downAt = e.at;
      el = e.element ?? "?";
    } else if (downAt !== null) {
      out.push({ element: el, ms: e.at - downAt });
      downAt = null;
    }
  }
  return out;
}

const profile = (over: Partial<KeyerProfile>): KeyerProfile => ({ ...DEFAULT_PROFILE, ...over });

describe("iambic keyer", () => {
  // at 20 wpm: dit mark 60, dah mark 180, space 60
  it("sends repeated dits while the dit paddle is held", () => {
    const k = new IambicKeyer(20, profile({ mode: "A" }));
    const ev = runKeyer(
      k,
      [
        { at: 0, side: "dit", pressed: true },
        { at: 500, side: "dit", pressed: false },
      ],
      800,
    );
    const els = elementsOf(ev);
    // 0-60 dit, 120-180 dit, 240-300 dit, 360-420 dit, 480-540 dit (held at 480 boundary)
    expect(els.length).toBe(5);
    for (const e of els) {
      expect(e.element).toBe("dit");
      expect(e.ms).toBeCloseTo(60, 6);
    }
  });

  it("a squeeze alternates dit-dah", () => {
    const k = new IambicKeyer(20, profile({ mode: "B" }));
    const ev = runKeyer(
      k,
      [
        { at: 0, side: "dit", pressed: true },
        { at: 10, side: "dah", pressed: true },
        { at: 1000, side: "dit", pressed: false },
        { at: 1000, side: "dah", pressed: false },
      ],
      1600,
    );
    const els = elementsOf(ev);
    const kinds = els.map((e) => e.element);
    // alternation: dit dah dit dah ...
    for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
    expect(kinds[0]).toBe("dit");
  });

  it("mode A stops with the current element on full release; mode B adds one alternate", () => {
    const script = [
      { at: 0, side: "dit" as const, pressed: true },
      { at: 10, side: "dah" as const, pressed: true },
      // release both mid-way through the FIRST dit (which ends at 60)
      { at: 40, side: "dit" as const, pressed: false },
      { at: 45, side: "dah" as const, pressed: false },
    ];
    const a = elementsOf(runKeyer(new IambicKeyer(20, profile({ mode: "A" })), script, 800));
    const b = elementsOf(runKeyer(new IambicKeyer(20, profile({ mode: "B" })), script, 800));
    expect(a.map((e) => e.element)).toEqual(["dit"]);
    expect(b.map((e) => e.element)).toEqual(["dit", "dah"]);
  });

  it("dit/dah memory inserts a tapped element at the next boundary", () => {
    // hold dah; tap dit briefly during the first dah; keep holding dah
    const k = new IambicKeyer(20, profile({ mode: "A", ditDahMemory: true }));
    const ev = runKeyer(
      k,
      [
        { at: 0, side: "dah", pressed: true },
        { at: 50, side: "dit", pressed: true },
        { at: 90, side: "dit", pressed: false },
        { at: 700, side: "dah", pressed: false },
      ],
      1000,
    );
    const kinds = elementsOf(ev).map((e) => e.element);
    expect(kinds[0]).toBe("dah");
    expect(kinds[1]).toBe("dit"); // the memorised tap
    expect(kinds[2]).toBe("dah"); // back to the held paddle
  });

  it("without memory a tap inside an element is ignored", () => {
    const k = new IambicKeyer(20, profile({ mode: "A", ditDahMemory: false }));
    const ev = runKeyer(
      k,
      [
        { at: 0, side: "dah", pressed: true },
        { at: 50, side: "dit", pressed: true },
        { at: 90, side: "dit", pressed: false },
        { at: 700, side: "dah", pressed: false },
      ],
      1000,
    );
    const kinds = elementsOf(ev).map((e) => e.element);
    expect(kinds.every((x) => x === "dah")).toBe(true);
  });

  it("ultimatic: last paddle pressed wins while both are held", () => {
    const k = new IambicKeyer(20, profile({ mode: "ultimatic" }));
    const ev = runKeyer(
      k,
      [
        { at: 0, side: "dit", pressed: true },
        { at: 100, side: "dah", pressed: true }, // both held; dah pressed last
        { at: 900, side: "dit", pressed: false },
        { at: 900, side: "dah", pressed: false },
      ],
      1400,
    );
    const kinds = elementsOf(ev).map((e) => e.element);
    // after the initial dit(s) and the one memorised dah, dahs repeat (no alternation)
    const tail = kinds.slice(2);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((x) => x === "dah")).toBe(true);
  });

  it("weighting stretches marks at a constant element rate", () => {
    const t60 = keyerTimings(20, profile({ weightPct: 60 }));
    expect(t60.ditMarkMs).toBeCloseTo(72, 6);
    expect(t60.spaceMs).toBeCloseTo(48, 6);
    expect(t60.ditMarkMs + t60.spaceMs).toBeCloseTo(120, 6); // dit cycle unchanged
    const t50 = keyerTimings(20, profile({ weightPct: 50 }));
    expect(t50.ditMarkMs).toBe(60);
    expect(t50.dahMarkMs).toBe(180);
  });

  it("keys a clean letter C with a squeeze (dah-first)", () => {
    // C = -.-. : hold both starting with dah, release after 4 elements
    const k = new IambicKeyer(20, profile({ mode: "B" }));
    const ev = runKeyer(
      k,
      [
        { at: 0, side: "dah", pressed: true },
        { at: 10, side: "dit", pressed: true },
        // elements: dah 0-180, dit 240-300, dah 360-540, dit 600-660
        { at: 550, side: "dah", pressed: false },
        { at: 550, side: "dit", pressed: false },
      ],
      1000,
    );
    const decoder = new AdaptiveDecoder({ initialDitMs: 60 });
    for (const e of ev) {
      if (e.type === "down") decoder.keyDown(e.at);
      else decoder.keyUp(e.at);
    }
    decoder.flush(2000);
    expect(decoder.text).toBe("C");
  });
});

describe("bug + straight key", () => {
  it("bug auto-repeats dits and passes dahs through manually", () => {
    const k = new BugKeyer(20);
    const ev: KeyEvent[] = [];
    ev.push(...k.setPaddle("dit", true, 0));
    for (let t = 5; t <= 250; t += 5) ev.push(...k.tick(t));
    ev.push(...k.setPaddle("dit", false, 250));
    for (let t = 255; t <= 400; t += 5) ev.push(...k.tick(t));
    ev.push(...k.setPaddle("dah", true, 400));
    ev.push(...k.setPaddle("dah", false, 650)); // manual 250 ms dah
    const els = elementsOf(ev);
    expect(els.slice(0, 3).map((e) => e.ms)).toEqual([60, 60, 60]);
    expect(els[els.length - 1]).toEqual({ element: "dah", ms: 250 });
  });

  it("bug says it is keying only while an automatic dit or its space is under way", () => {
    // The screen pumps frames only while this is true.
    const k = new BugKeyer(20);
    expect(k.isKeying).toBe(false);
    k.setPaddle("dit", true, 0);
    expect(k.isKeying).toBe(true);
    k.setPaddle("dit", false, 10);
    k.tick(119);
    expect(k.isKeying).toBe(true);
    k.tick(120);
    expect(k.isKeying).toBe(false);
    k.setPaddle("dah", true, 200);
    expect(k.isKeying).toBe(false);
  });

  it("straight key timestamps the lever verbatim", () => {
    const k = new StraightKey();
    expect(k.set(true, 100)).toEqual([{ type: "down", at: 100 }]);
    expect(k.set(true, 120)).toEqual([]);
    expect(k.set(false, 190)).toEqual([{ type: "up", at: 190 }]);
  });
});

describe("radio presets", () => {
  it("all presets have sane profiles", () => {
    expect(RADIO_PRESETS.length).toBeGreaterThanOrEqual(8);
    for (const p of RADIO_PRESETS) {
      expect(["A", "B", "ultimatic"]).toContain(p.profile.mode);
      expect(p.profile.weightPct).toBeGreaterThan(20);
      expect(p.profile.weightPct).toBeLessThan(80);
      expect(p.profile.dahRatio).toBeGreaterThanOrEqual(2);
      expect(p.profile.dahRatio).toBeLessThanOrEqual(4);
    }
    // A vs B presets must actually differ
    const a = RADIO_PRESETS.find((p) => p.id === "generic-a");
    const b = RADIO_PRESETS.find((p) => p.id === "generic-b");
    expect(a?.profile.mode).toBe("A");
    expect(b?.profile.mode).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// decoder
// ---------------------------------------------------------------------------

/** Feed a perfect machine-sent timeline into a decoder. */
function decodeTimeline(text: string, wpm: number, decoder?: AdaptiveDecoder): AdaptiveDecoder {
  const d = decoder ?? new AdaptiveDecoder({ initialDitMs: 1200 / wpm });
  const enc = textToTimeline(text, standardTiming(wpm));
  let t = 0;
  for (const seg of enc.segments) {
    if (seg.on) {
      d.keyDown(t);
      d.keyUp(t + seg.ms);
    }
    t += seg.ms;
  }
  d.flush(t + 10_000);
  return d;
}

describe("adaptive decoder", () => {
  it("decodes clean machine sending", () => {
    const d = decodeTimeline("CQ CQ DE Q7XYZ", 20);
    expect(d.text).toBe("CQ CQ DE Q7XYZ");
  });

  it("decodes every single character", () => {
    for (const ch of ALL_CHARS) {
      const d = decodeTimeline(ch, 20);
      expect(d.text).toBe(ch);
    }
  });

  it("tracks the sender speed estimate", () => {
    const d = decodeTimeline("PARIS PARIS", 25);
    expect(d.wpm).toBeCloseTo(25, 0);
  });

  it("adapts to a sender drifting faster", () => {
    const d = new AdaptiveDecoder({ initialDitMs: 1200 / 15 });
    decodeTimeline("QRQ QRQ", 15, d);
    // same decoder, sender speeds up to 22 wpm
    const enc = textToTimeline(" TEST TEST", standardTiming(22));
    let t = 100_000;
    for (const seg of enc.segments) {
      if (seg.on) {
        d.keyDown(t);
        d.keyUp(t + seg.ms);
      }
      t += seg.ms;
    }
    d.flush(t + 10_000);
    expect(d.text.trim().endsWith("TEST TEST")).toBe(true);
    expect(d.wpm).toBeGreaterThan(19);
  });

  it("survives human jitter (±15% element timing)", () => {
    const rnd = seededRandom(11);
    const d = new AdaptiveDecoder({ initialDitMs: 60 });
    const enc = textToTimeline("HELLO WORLD", standardTiming(20));
    let t = 0;
    for (const seg of enc.segments) {
      const ms = seg.ms * (0.85 + 0.3 * rnd());
      if (seg.on) {
        d.keyDown(t);
        d.keyUp(t + ms);
      }
      t += ms;
    }
    d.flush(t + 10_000);
    expect(d.text).toBe("HELLO WORLD");
  });

  it("emits unknown patterns as ?", () => {
    const d = new AdaptiveDecoder({ initialDitMs: 60 });
    // 9 dits is not a character
    let t = 0;
    for (let i = 0; i < 9; i++) {
      d.keyDown(t);
      d.keyUp(t + 60);
      t += 120;
    }
    d.flush(t + 10_000);
    expect(d.text).toBe("?");
  });
});

// ---------------------------------------------------------------------------
// grading
// ---------------------------------------------------------------------------

describe("grading", () => {
  it("perfect copy grades 100%", () => {
    const g = gradeCopy("KMKMK MKMKM", "KMKMK MKMKM");
    expect(g.accuracy).toBe(1);
    expect(g.misses).toEqual([]);
    expect(g.correct).toBe(g.total);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(gradeCopy("CQ DE Q7XYZ", " cq  de q7xyz ").accuracy).toBe(1);
  });

  it("reports missed characters for weak-char stats", () => {
    const g = gradeCopy("KMRKM", "KMKM"); // dropped the R
    expect(g.misses).toEqual(["R"]);
    expect(g.correct).toBe(4);
    expect(g.total).toBe(5);
    expect(g.accuracy).toBeLessThan(1);
  });

  it("grades sending: perfect machine keying scores ~1.0 rhythm", () => {
    const d = decodeTimeline("TEST", 20);
    const g = gradeSending("TEST", d);
    expect(g.accuracy).toBe(1);
    expect(g.rhythm).toBeGreaterThan(0.95);
    expect(g.wpm).toBeCloseTo(20, 0);
  });

  it("ragged keying scores a lower rhythm", () => {
    expect(rhythmScore([60, 60, 60, 60], [180, 180])).toBe(1);
    const ragged = rhythmScore([40, 80, 55, 95, 30], [140, 240]);
    expect(ragged).toBeLessThan(0.7);
  });
});

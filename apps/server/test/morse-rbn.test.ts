import {
  analyzeKeying,
  baseCall,
  encodeChar,
  isPlausibleCallsign,
  type KeyedMark,
  matchesOwnCall,
  RBN_MESSAGE_KINDS,
  RBN_ON_AIR_CHECKLIST,
  rbnMessage,
  skimmerChecks,
  standardTiming,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

/** Clean keying of `text` at a 60 ms dit. */
function keyText(text: string, u = 60, letter = 3): KeyedMark[] {
  const marks: KeyedMark[] = [];
  let t = 0;
  text.split(" ").forEach((w, wi) => {
    if (wi > 0) t += (7 - letter) * u;
    [...w].forEach((ch, ci) => {
      if (ci > 0 || wi > 0) t += letter * u;
      [...encodeChar(ch)!].forEach((el, ei) => {
        if (ei > 0) t += u;
        const len = el === "." ? u : 3 * u;
        marks.push({ downAt: t, upAt: t + len, element: el === "." ? "dit" : "dah" });
        t += len;
      });
    });
  });
  return marks;
}

describe("rbnMessage", () => {
  it("builds each call from the operator callsign with every part explained", () => {
    for (const kind of RBN_MESSAGE_KINDS) {
      const m = rbnMessage(kind, "q7xya");
      expect(m.text).toMatch(/Q7XYA Q7XYA/);
      expect(m.parts.map((p) => p.text).join(" ")).toBe(m.text);
      for (const p of m.parts) expect(p.why.length).toBeGreaterThan(10);
    }
    expect(rbnMessage("cq", "Q4ABC").text).toBe("CQ CQ DE Q4ABC Q4ABC K");
    expect(rbnMessage("test", "Q4ABC").text).toBe("TEST Q4ABC Q4ABC");
    expect(rbnMessage("test-de", "Q4ABC").text).toBe("TEST DE Q4ABC Q4ABC");
  });

  it("can send the call three times for new or uncommon prefixes", () => {
    expect(rbnMessage("cq", "Q7XYA", { repeats: 3 }).text).toBe("CQ CQ DE Q7XYA Q7XYA Q7XYA K");
    expect(rbnMessage("test", "Q7XYA", { repeats: 3 }).parts).toHaveLength(4);
  });

  it("points everyday testing at CQ rather than the contest keyword", () => {
    expect(rbnMessage("test", "Q4ABC").blurb).toMatch(/call CQ/);
    expect(rbnMessage("test-de", "Q4ABC").blurb).toMatch(/call CQ/);
  });
});

describe("isPlausibleCallsign", () => {
  it("accepts real-looking calls and rejects junk", () => {
    expect(isPlausibleCallsign("Q7XYA")).toBe(true);
    expect(isPlausibleCallsign("2Q0ABC")).toBe(true);
    expect(isPlausibleCallsign("Q4ABC/P")).toBe(true);
    expect(isPlausibleCallsign("GB100RSGB")).toBe(true);
    expect(isPlausibleCallsign("EA8/Q7XYA")).toBe(true);
    expect(isPlausibleCallsign("")).toBe(false);
    expect(isPlausibleCallsign("HELLO")).toBe(false);
    expect(isPlausibleCallsign("N0CALL")).toBe(false);
  });
});

describe("matchesOwnCall", () => {
  it("matches the call itself and portable forms, not other calls containing it", () => {
    expect(matchesOwnCall("Q7XYA", "q7xya")).toBe(true);
    expect(matchesOwnCall("Q7XYA/P", "Q7XYA")).toBe(true);
    expect(matchesOwnCall("EA8/Q7XYA", "Q7XYA")).toBe(true);
    expect(matchesOwnCall("2Q7XYA", "Q7XYA")).toBe(false);
    expect(matchesOwnCall("Q7XYAB", "Q7XYA")).toBe(false);
    // a portable call typed in still matches the home call
    expect(matchesOwnCall("Q0OPS", "Q0OPS/P")).toBe(true);
    expect(matchesOwnCall("EA8/Q0OPS", "Q0OPS/P")).toBe(true);
    expect(baseCall("EA8/Q7XYA")).toBe("Q7XYA");
  });
});

describe("skimmerChecks", () => {
  const timing = standardTiming(20);
  const target = "TEST Q4ABC Q4ABC";

  it("passes clean keying of a well-formed call", () => {
    const marks = keyText(target);
    const checks = skimmerChecks({
      call: "Q4ABC",
      decoded: target,
      analysis: analyzeKeying(marks, timing, { target }),
      marks,
    });
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.id)).toEqual(["keyword", "repeats", "separated", "steady"]);
  });

  it("flags a missing keyword, too few clean repeats and a call run into the word before", () => {
    const decoded = "TESTQ4ABC Q4ABX";
    const marks = keyText(decoded);
    const checks = skimmerChecks({
      call: "Q4ABC",
      decoded,
      analysis: analyzeKeying(marks, timing, { target }),
      marks,
    });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId.keyword!.ok).toBe(false);
    expect(byId.repeats!.ok).toBe(false);
    expect(byId.repeats!.detail).toMatch(/0 of 2/);
    expect(byId.separated!.ok).toBe(false);
  });

  it("flags a speed that wanders through the message", () => {
    const fast = keyText("TEST Q4ABC", 50);
    const slowStart = fast.at(-1)!.upAt + 7 * 50;
    const slow = keyText("Q4ABC", 110).map((m) => ({
      ...m,
      downAt: m.downAt + slowStart,
      upAt: m.upAt + slowStart,
    }));
    const marks = [...fast, ...slow];
    const checks = skimmerChecks({
      call: "Q4ABC",
      decoded: target,
      analysis: analyzeKeying(marks, timing, { target }),
      marks,
    });
    expect(checks.find((c) => c.id === "steady")!.ok).toBe(false);
  });
});

describe("RBN_ON_AIR_CHECKLIST", () => {
  it("covers licence, band plan, listening, QRL?, identifying and re-spotting", () => {
    const titles = RBN_ON_AIR_CHECKLIST.map((i) => i.title);
    expect(titles).toEqual([
      "Your licence covers it",
      "Stay in the CW part of the band",
      "Listen first",
      "Ask QRL?",
      "Always identify",
      "Call, then listen",
      "Testing again?",
    ]);
    for (const item of RBN_ON_AIR_CHECKLIST) expect(item.body.length).toBeGreaterThan(20);
  });
});

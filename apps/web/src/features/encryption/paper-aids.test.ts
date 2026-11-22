/**
 * The paper aids' words and paper. Their PDF, laid out with the print kit, is tested in
 * kit-aids.test.ts.
 */
import { describe, expect, it } from "vitest";
import { likelyPaper, lineNumber, makePads, padHeading, padHolder, padLines } from "./paper-aids";

describe("one-time pads", () => {
  it("are made from the random source: different each time", () => {
    const made = makePads(2, 100);
    expect(made[0]!.letters).toMatch(/^[A-Z]{100}$/);
    expect(made[0]!.letters).not.toBe(made[1]!.letters);
    expect(made[0]!.serial).toMatch(/^[A-Z]{3}-[A-Z]{3}$/);
  });

  it("are written fifty letters to a line, in groups of five, with their numbers and headings", () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(4).slice(0, 60);
    expect(padLines(letters)).toEqual(["ABCDE FGHIJ KLMNO PQRST UVWXY ZABCD EFGHI JKLMN OPQRS TUVWX", "YZABC DEFGH"]);
    expect(lineNumber(0)).toBe("01");
    expect(padHeading({ serial: "AAA-BBB", letters }, 2)).toBe("One-time pad AAA-BBB, copy 2 of 2");
    expect([padHolder(1), padHolder(2)]).toEqual(["For the sender", "For the receiver"]);
  });
});

describe("which paper to start with", () => {
  it("is US Letter where that is the paper, and A4 elsewhere", () => {
    expect(likelyPaper("en-US")).toBe("letter");
    expect(likelyPaper("fr-CA")).toBe("letter");
    expect(likelyPaper("en-GB")).toBe("a4");
    expect(likelyPaper("de")).toBe("a4");
    expect(likelyPaper(undefined)).toBe("a4");
  });
});

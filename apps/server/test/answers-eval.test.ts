/**
 * The answers evaluation (test/eval) needs a real language model and is run by hand.
 * These tests keep its fixed parts honest without one: every question points at a
 * passage that exists and holds what a right answer must say, and the judge gives the
 * verdicts its table reports.
 */
import { describe, expect, it } from "vitest";
import { chunkSections } from "../src/modules/search/chunker.ts";
import { type EvalReply, type GivenPassage, isRefusal, judge, markersIn } from "./eval/judge.ts";
import { LIBRARY } from "./eval/library.ts";
import { QUESTIONS } from "./eval/questions.ts";

const question = (id: string) => QUESTIONS.find((entry) => entry.id === id)!;
const given = (...passages: Array<[number, string, string, string?]>): GivenPassage[] =>
  passages.map(([marker, document, heading, quote]) => ({ marker, document, heading, quote: quote ?? "" }));
const reply = (text: string, passages: GivenPassage[], over: Partial<EvalReply> = {}): EvalReply => ({
  outcome: "answered",
  text,
  given: passages,
  cutShort: false,
  failure: null,
  ...over,
});

describe("the evaluation set", () => {
  it("has about thirty questions the library answers and some it does not, each with an id of its own", () => {
    expect(new Set(QUESTIONS.map((entry) => entry.id)).size).toBe(QUESTIONS.length);
    expect(QUESTIONS.filter((entry) => entry.answeredBy).length).toBeGreaterThanOrEqual(25);
    expect(QUESTIONS.filter((entry) => !entry.answeredBy).length).toBeGreaterThanOrEqual(8);
    for (const entry of QUESTIONS.filter((item) => !item.answeredBy)) expect(entry.why, entry.id).toBeTruthy();
  });

  it("names, for every question the library answers, exactly one passage, and that passage holds the fact", () => {
    for (const entry of QUESTIONS) {
      if (!entry.answeredBy) continue;
      const document = LIBRARY.find((item) => item.id === entry.answeredBy!.document);
      expect(document, entry.id).toBeDefined();
      // Cut as the index cuts it, with the settings a new Outpost has.
      const passages = chunkSections(document!.sections, { size: 1200, overlap: 150 }).filter(
        (passage) =>
          passage.heading === entry.answeredBy!.heading && (!entry.answeredBy!.holds || entry.answeredBy!.holds.test(passage.text)),
      );
      expect(passages.length, `${entry.id}: passages that answer`).toBe(1);
      for (const pattern of entry.says ?? []) {
        expect(new RegExp(pattern.source, "i").test(passages[0]!.text), `${entry.id}: the passage should hold ${pattern}`).toBe(true);
      }
    }
  });

  it("does not hold the subjects of the questions marked as unanswered, nor a figure for the ones that ask for one", () => {
    const everything = LIBRARY.flatMap((document) => document.sections.map((section) => section.text)).join("\n");
    expect(everything).not.toMatch(/countryside code|sourdough|spark plug|iodine|nosebleed|paracetamol|apple|world cup/i);
    const sentencesAbout = (subject: RegExp) => everything.split(/(?<=[.!?])\s+/).filter((sentence) => subject.test(sentence));
    expect(sentencesAbout(/nitrate/i).some((sentence) => /\d/.test(sentence))).toBe(false);
    expect(sentencesAbout(/stove|flue/i).some((sentence) => /\b\d+\s*(kg|kilograms?)\b|diameter/i.test(sentence))).toBe(false);
  });
});

describe("judging an answer", () => {
  const boiling = given([1, "water", "Boiling"], [2, "kit", "Stove"], [3, "pantry", "Dried beans"]);

  it("reads markers and refusals the way the table counts them", () => {
    expect(markersIn("Boil it [1]. Cool it [2, 3]. See [1994 edition].")).toEqual([1, 2, 3]);
    expect(isRefusal({ outcome: "answered", text: "The sources do not answer this. They cover knots." })).toBe(true);
    expect(isRefusal({ outcome: "answered", text: "There is no information about pools in the provided sources." })).toBe(true);
    expect(isRefusal({ outcome: "nothing-found", text: "" })).toBe(true);
    expect(isRefusal({ outcome: "answered", text: "Boil the water for one minute [1]." })).toBe(false);
  });

  it("calls an answer right only when the fact is there, and counts whether the right passage is cited", () => {
    expect(judge(question("boil-time"), reply("Boil it for one minute [1].", boiling)).verdict).toBe("correct");
    expect(judge(question("boil-time"), reply("Boil it for 1 minute [2].", boiling)).verdict).toBe("correct-uncited");
    expect(judge(question("boil-time"), reply("Boil it for four minutes [2].", boiling)).verdict).toBe("wrong");
    expect(judge(question("boil-time"), reply("The sources do not answer this.", boiling)).verdict).toBe("missed");
    const without = given([1, "kit", "Stove"]);
    expect(judge(question("boil-time"), reply("The sources do not say how long.", without))).toMatchObject({
      verdict: "not-retrieved",
      retrieved: false,
    });
  });

  it("tells one passage of a long section from another by what it holds", () => {
    const first = given([1, "stove", "Clearances and hearth", "Keep at least 400 mm between the sides"]);
    const second = given([1, "stove", "Clearances and hearth", "Logs stacked against a hot stove"]);
    expect(judge(question("stove-clearance"), reply("At least 400 mm [1].", first)).retrieved).toBe(true);
    expect(judge(question("stove-clearance"), reply("At least 400 mm [1].", second))).toMatchObject({
      retrieved: false,
      verdict: "correct-uncited",
    });
  });

  it("wants a question the library does not answer to be declined, and nothing from memory added", () => {
    const some = given([1, "radio", "The family net"], [2, "pantry", "Rice and dry goods"]);
    expect(judge(question("no-world-cup"), reply("The sources do not answer this.", some)).verdict).toBe("refused");
    expect(judge(question("no-world-cup"), reply("England won it [1].", some)).verdict).toBe("made-up");
    expect(judge(question("no-world-cup"), reply("The sources do not say, but it was England.", some)).verdict).toBe("made-up");
    // Nothing found, so the model was not asked: declined, and no citation fault can be counted against it.
    expect(judge(question("no-sourdough"), reply("", [], { outcome: "nothing-found" }))).toMatchObject({
      verdict: "refused",
      asked: false,
    });
  });

  it("counts the four citation faults", () => {
    const faults = (text: string) => judge(question("boil-time"), reply(text, boiling)).faults;
    expect(faults("One minute [1].")).toEqual({ invented: false, everything: false, afterRefusal: false, none: false });
    expect(faults("One minute [7].")).toMatchObject({ invented: true, none: true });
    expect(faults("One minute [1][2][3].")).toMatchObject({ everything: true });
    expect(faults("The sources do not answer this [1].")).toMatchObject({ afterRefusal: true, none: false });
    expect(faults("One minute.")).toMatchObject({ none: true });
  });

  it("reports a failure of the model server as a failure, not as a wrong answer", () => {
    expect(judge(question("boil-time"), reply("", boiling, { failure: "unreachable" })).verdict).toBe("failed");
  });
});

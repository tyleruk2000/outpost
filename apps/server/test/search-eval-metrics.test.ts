/**
 * How the search evaluation grades a reference article (scripts/search-eval/metrics.mjs).
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain JavaScript module shared with scripts/search-eval.mjs
import { gradeByPattern, titleOnly } from "../../../scripts/search-eval/metrics.mjs";

const query = { q: "what to do for a burn", pi: ["burn|scald", "cool|running water|first aid|treat"] };
const hit = (title: string, snippet = "") => ({ title, passages: snippet ? [{ segments: [{ text: snippet }] }] : [] });

describe("grading a title-only reference hit", () => {
  it("tells a hit that shows only its title from one with text", () => {
    expect(titleOnly(hit("Burn"))).toBe(true);
    expect(titleOnly({ title: "Burn", passages: [{ segments: [{ text: "  " }] }] })).toBe(true);
    expect(titleOnly(hit("Burn", "A burn is an injury."))).toBe(false);
  });

  it("grades the subject's own article 2 when its text is not seen, and other titles holding the word 1", () => {
    expect(gradeByPattern(query, hit("Burn"))).toBe(2);
    expect(gradeByPattern(query, hit("Burns"))).toBe(2);
    expect(gradeByPattern(query, hit("Ken Burns"))).toBe(1);
    expect(gradeByPattern(query, hit("Burn Away"))).toBe(1);
    // With text, the text decides, as before.
    expect(gradeByPattern(query, hit("Burn", "A burn is an injury to the skin."))).toBe(1);
    expect(gradeByPattern(query, hit("Burn", "Cool the burn under running water."))).toBe(2);
    expect(gradeByPattern(query, hit("Treating a burn"))).toBe(3);
    // Another sense, or a title the question needs and lacks, as before.
    expect(gradeByPattern({ ...query, not: "^burn$" }, hit("Burn"))).toBe(0);
    expect(gradeByPattern({ ...query, titleNeeds: "scald" }, hit("Burn"))).toBe(1);
  });
});

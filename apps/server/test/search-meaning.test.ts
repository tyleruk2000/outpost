/** How meaning is put on the one scale of the results list (service.ts, `blendMeaning`). */
import { describe, expect, it } from "vitest";
import {
  blendMeaning,
  MEANING_CEILING,
  MEANING_LIFT,
  meaningScore,
  resultKey,
  SAME_MEANING,
  type SearchResult,
} from "../src/modules/search/service.ts";

const result = (entityId: string, score: number, sources = ["keyword"], why = "All 3 words"): SearchResult => ({
  kind: "note",
  entityId,
  title: entityId,
  titleSegments: [{ text: entityId, hit: false }],
  subtitle: null,
  collection: null,
  url: `/notes/${entityId}`,
  tags: [],
  score,
  why,
  passages: [],
  sources,
});
/** A result found by meaning: its score is the similarity of its nearest passage. */
const near = (entityId: string, similarity: number) => result(entityId, similarity, ["semantic"], "");
const weights = { keywordWeight: 1, semanticWeight: 1 };
const held = (everyWord: string[], trusted: string[] = []) => ({
  everyWord: new Set(everyWord.map((id) => resultKey({ kind: "note", entityId: id }))),
  trusted: new Set(trusted.map((id) => resultKey({ kind: "note", entityId: id }))),
});

describe("meaning in the list of results", () => {
  it("lifts a result the words found by half its meaning score", () => {
    const [both] = blendMeaning([result("a", 0.6)], [near("a", 0.7)], weights, held(["a"]));
    expect(both!.score).toBeCloseTo(1 - 0.4 * (1 - MEANING_CEILING * MEANING_LIFT), 3);
    expect(both!.why).toBe("All 3 words, and by meaning");
    expect(both!.sources).toEqual(["keyword", "semantic"]);
  });

  it("never puts a result found by meaning alone above one holding every word, and says what it is", () => {
    // Close in meaning (it would score 0.6) against a result holding every word that scores only 0.45.
    const list = blendMeaning(
      [result("words", 0.45), result("some", 0.3, ["keyword"], "2 of 3 words")],
      [near("meaning", 0.9)],
      weights,
      held(["words"]),
    );
    expect(list.map((item) => item.entityId)).toEqual(["words", "meaning", "some"]);
    expect(list[1]).toMatchObject({ why: "Similar in meaning" });
    expect(list[1]!.score).toBeLessThan(0.45);
  });

  it("fills the list by meaning when the words find nothing, but not with what is far behind the nearest", () => {
    const list = blendMeaning([], [near("close", 0.62), near("also", 0.5), near("far", 0.41)], weights);
    expect(list.map((item) => [item.entityId, item.score])).toEqual([
      ["close", Math.round(meaningScore(0.62) * 1000) / 1000],
      ["also", Math.round(meaningScore(0.5) * 1000) / 1000],
    ]);
  });

  it("puts a trusted source holding every word that means the same first, and only then", () => {
    // The forum post's title is the question; the first aid manual's page says the same thing.
    const forum = result("forum", 0.95, ["keyword"], "All 3 words in the title");
    const manual = result("manual", 0.75, ["keyword"], "All 3 words, close together; favoured: first aid source");
    const list = blendMeaning(
      [forum, manual],
      [near("forum", 0.75), near("manual", SAME_MEANING + 0.05)],
      weights,
      held(["forum", "manual"], ["manual"]),
    );
    expect(list.map((item) => item.entityId)).toEqual(["manual", "forum"]);
    expect(list[0]!.why).toBe("All 3 words, close together; favoured: first aid source, and means the same");
    // Not near enough in meaning, or not holding every word: the order is the scores'.
    const loose = blendMeaning(
      [forum, manual],
      [near("forum", 0.75), near("manual", SAME_MEANING - 0.05)],
      weights,
      held(["forum", "manual"], ["manual"]),
    );
    expect(loose.map((item) => item.entityId)).toEqual(["forum", "manual"]);
    const partly = blendMeaning([forum, manual], [near("forum", 0.75), near("manual", 0.7)], weights, held(["forum"], ["manual"]));
    expect(partly.map((item) => item.entityId)).toEqual(["forum", "manual"]);
  });
});

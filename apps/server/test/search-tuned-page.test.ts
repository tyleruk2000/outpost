/**
 * The worked examples on "How search was tuned" (apps/web/src/features/how-search-tuned)
 * are the server's own arithmetic: if the scorer, the priors or the blending of meaning
 * change, the page's numbers must change with them.
 */
import { describe, expect, it } from "vitest";
import * as page from "../../web/src/features/how-search-tuned/data.ts";
import { adjusted, MOST_FAVOUR, OTHER_SENSE } from "../src/modules/search/intent.ts";
import { expandQuery, parseQuery } from "../src/modules/search/query.ts";
import { FORM_CREDIT, inverseFrequency, SCORE_WEIGHTS, scoreFields, scoringTerms } from "../src/modules/search/score.ts";
import { MEANING_CEILING, MEANING_LIFT, meaningScore, SIMILARITY_FLOOR, SIMILARITY_WINDOW } from "../src/modules/search/service.ts";
import { stem } from "../src/modules/search/stem.ts";
import { BY_SPELLING_ONLY, SYNONYM_ENTRIES } from "../src/modules/search/synonyms.ts";

describe("How search was tuned", () => {
  it("shows the scorer's weights", () => {
    for (const part of page.WEIGHTS) expect(SCORE_WEIGHTS[part.key as keyof typeof SCORE_WEIGHTS]).toBe(part.weight);
    expect(page.WEIGHTS.reduce((sum, part) => sum + part.weight, 0)).toBeCloseTo(1, 10);
    expect(FORM_CREDIT).toEqual({ inflected: 0.92, synonym: 0.85, prefix: 0.6 });
  });

  it("scores its example passage as the scorer does", () => {
    const { parsed } = expandQuery(parseQuery("How to change car battery"));
    expect(parsed.required).toEqual(["change", "car", "battery"]);
    expect(parsed.alternatives?.[0]).toEqual(["replace", "fit"]);
    const counts: Record<string, number> = { change: 3000, car: 1500, battery: 600 };
    const terms = scoringTerms(parsed, (term) => inverseFrequency(59_351, counts[term]!));
    const parts = scoreFields(terms, page.SCORED_EXAMPLE);
    expect(parts.score).toBe(page.SCORED_EXAMPLE.score);
    for (const [key, value] of Object.entries(page.SCORED_EXAMPLE.parts)) {
      expect(parts[key as keyof typeof parts] as number).toBeCloseTo(value, 3);
    }
  });

  it("adjusts and blends as the search service does", () => {
    expect(MOST_FAVOUR).toBe(1.3);
    expect(OTHER_SENSE).toBe(0.75);
    for (const [score, factor] of [
      [0.4, 1.25],
      [0.9, 1.25],
      [0.6, 0.75],
    ] as const) {
      expect(page.favoured(score, factor)).toBe(adjusted(score, factor));
    }
    expect(page.MEANING_CEILING).toBe(MEANING_CEILING);
    expect(page.MEANING_LIFT).toBe(MEANING_LIFT);
    for (const similarity of [0.1, 0.19, 0.45, 0.55, 0.9]) expect(page.meaningScore(similarity)).toBe(meaningScore(similarity));
    expect(SIMILARITY_WINDOW).toBe(0.2);
    expect(SIMILARITY_FLOOR).toBe(0.3);
  });

  it("stems and widens words as it says", () => {
    expect(["tyre", "tyres", "tire", "tires", "tired", "battery", "batteries"].map(stem)).toEqual([
      "tyre",
      "tyre",
      "tire",
      "tire",
      "tire",
      "batteri",
      "batteri",
    ]);
    expect([...BY_SPELLING_ONLY].sort()).toEqual(["canned", "cot", "tinned", "tire", "tyre"]);
    expect(SYNONYM_ENTRIES).toBe(251);
  });
});

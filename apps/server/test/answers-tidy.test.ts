/**
 * What is done to a model's reply before it is shown as settled. Every reply quoted here
 * as "seen" was written by llama3.2:3b or llama3.2:1b during the evaluation (docs/ai.md).
 */
import { describe, expect, it } from "vitest";
import { saysNotAnswered, tidyReply } from "../src/modules/answers/tidy.ts";

const passages = [
  {
    marker: 1,
    quote:
      "Bring clear water to a rolling boil and keep it there for one minute. Above 2,000 metres, boil it for three minutes. Do not cool it with ice from a source you have not treated.",
  },
  { marker: 2, quote: "The small gas stove boils a litre of water in four minutes with the windshield on." },
  { marker: 3, quote: "Red kidney beans must be boiled hard for ten minutes before they are simmered, to destroy a natural toxin." },
];

describe("a reply that says the passages do not answer", () => {
  it("is recognised in the ways small models say it", () => {
    for (const seen of [
      "The sources do not answer this.",
      "The sources do not answer this. They cover composting and garden maintenance.",
      "There is no information about the World Cup in 1966 in the provided sources. [1][2]",
      "There is no mention of a controller of the family net in the provided sources. [1]",
      "[1] The sources do not answer this. Red kidney beans must be boiled hard for ten minutes. [1]",
      "The Countryside Code is not mentioned in the provided sources.",
      "I cannot find anything about paracetamol in the passages.",
      "The provided passages don't mention sourdough bread.",
    ]) {
      expect(saysNotAnswered(seen), seen).toBe(true);
    }
  });

  it("is not seen in an answer, nor in a caveat that follows one or comes before one", () => {
    for (const answer of [
      "Boil the water for one minute [1].",
      "To make water safe to drink, it should be boiled for one minute [1]. The sources do not say what to do with cloudy water.",
      "Bring clear water to a rolling boil and keep it there for one minute. [1] The sources do not answer this.",
      "Do not use ice, butter or toothpaste [2].",
      "No. Do not charge it when it is colder than 0 °C [1].",
      "There is no need to soak them for longer than a night [3].",
      "The sources do not say exactly how long, but boiling for one minute is enough [1].",
    ]) {
      expect(saysNotAnswered(answer), answer).toBe(false);
    }
  });

  it("is reported as the library not covering the question, with every marker taken out", () => {
    const tidied = tidyReply("There is no information about the World Cup in 1966 in the provided sources. [1][2]", passages);
    expect(tidied).toMatchObject({ outcome: "not-covered", used: [], unsupported: [], repointed: [], citesAll: false });
    expect(tidied.text).toBe("There is no information about the World Cup in 1966 in the provided sources.");
    // A run of passages, as one model wrote it, and numbers that were never given.
    expect(tidyReply("There is no information about that in the sources provided. [1-8]", passages)).toMatchObject({
      outcome: "not-covered",
      text: "There is no information about that in the sources provided.",
      unsupported: [4, 5, 6, 7, 8],
    });
    // What it says the passages do cover keeps its words and loses its marker.
    expect(tidyReply("The sources do not answer this. They cover boiling beans [3].", passages).text).toBe(
      "The sources do not answer this. They cover boiling beans.",
    );
  });

  it("shows nothing of the model's when all it wrote was the sentence it was told to", () => {
    expect(tidyReply("The sources do not answer this.", passages).text).toBe("");
    expect(tidyReply(" The sources do not answer this [1]. ", passages)).toMatchObject({ outcome: "not-covered", text: "" });
    // Anything more it said is kept, as its own words.
    expect(tidyReply("The sources do not answer this. They cover boiling water and beans.", passages).text).toBe(
      "The sources do not answer this. They cover boiling water and beans.",
    );
  });
});

describe("a marker for a number that was never given", () => {
  it("is removed, and the sentence stands without a source", () => {
    const tidied = tidyReply("Boil it [1]. It is widely known that this works every time [9].", passages);
    expect(tidied).toMatchObject({ outcome: "answered", used: [1], unsupported: [9], repointed: [] });
    expect(tidied.text).toBe("Boil it [1]. It is widely known that this works every time.");
    // Among real ones, only the stray number goes, and nothing is re-pointed: the real one says where it rests.
    expect(tidyReply("Boil it for one minute [1, 7].", passages)).toMatchObject({ text: "Boil it for one minute [1].", repointed: [] });
  });

  it("is pointed at the one passage whose own whole sentence it stands on, and the change is listed", () => {
    const tidied = tidyReply("Above 2,000 metres, boil it for three minutes [7].", passages);
    expect(tidied).toMatchObject({ outcome: "answered", used: [1], unsupported: [7], repointed: [{ from: 7, to: 1 }] });
    expect(tidied.text).toBe("Above 2,000 metres, boil it for three minutes [1].");
    // The marker after the full stop belongs to the sentence before it; case and punctuation do not count.
    expect(tidyReply("Yes. the small gas stove boils a litre of water in four minutes with the windshield on. [8]", passages).text).toBe(
      "Yes. the small gas stove boils a litre of water in four minutes with the windshield on. [2]",
    );
    // Two whole sentences in a row are still the passage's own words.
    expect(
      tidyReply(
        "Bring clear water to a rolling boil and keep it there for one minute. Above 2,000 metres, boil it for three minutes. [6]",
        passages,
      ).repointed,
    ).toEqual([{ from: 6, to: 1 }]);
  });

  it("is pointed at the passage a model copied out under it, as llama3.2:1b does", () => {
    const copied = [
      "[1] Bring clear water to a rolling boil and keep it there for one minute.",
      "",
      "[4] Red kidney beans must be boiled hard for ten minutes before they are simmered, to destroy a natural toxin.",
    ].join("\n");
    const tidied = tidyReply(copied, passages);
    expect(tidied.repointed).toEqual([{ from: 4, to: 3 }]);
    expect(tidied.text).toContain("[3] Red kidney beans");
  });

  it("is not pointed anywhere unless the words are a passage's own whole sentences", () => {
    for (const reworded of [
      // Its own wording.
      "You should heat the water for sixty seconds [7].",
      // Part of a sentence that drops the "Do not" in front of it: most of the words, the opposite meaning.
      "Cool it with ice from a source you have not treated [7].",
      // One figure changed.
      "Above 2,000 metres, boil it for five minutes [7].",
      // A passage's sentence with a claim of the model's own added to it.
      "The small gas stove boils a litre of water in four minutes with the windshield on, and faster without it [7].",
      // Too short to say anything about which passage it came from.
      "Boil it [7].",
    ]) {
      const tidied = tidyReply(reworded, passages);
      expect(tidied, reworded).toMatchObject({ used: [], unsupported: [7], repointed: [] });
      expect(tidied.text, reworded).not.toContain("[");
    }
  });

  it("is not pointed anywhere when more than one passage holds those words", () => {
    const twice = [...passages, { marker: 4, quote: passages[1]!.quote }];
    const tidied = tidyReply("The small gas stove boils a litre of water in four minutes with the windshield on [9].", twice);
    expect(tidied).toMatchObject({ used: [], unsupported: [9], repointed: [] });
    expect(tidied.text).toBe("The small gas stove boils a litre of water in four minutes with the windshield on.");
  });
});

describe("an ordinary answer", () => {
  it("is left exactly as written", () => {
    const answer = "Boil the water for **one minute** [1].\n\nAbove 2,000 metres, boil it for three minutes [1][3].";
    expect(tidyReply(answer, passages)).toEqual({
      outcome: "answered",
      text: answer,
      used: [1, 3],
      unsupported: [],
      repointed: [],
      citesAll: false,
    });
    expect(tidyReply("See the [1994 edition] [see 2].", passages)).toMatchObject({ text: "See the [1994 edition] [see 2].", used: [] });
  });

  it("is reported when it cites every passage it was given, three or more", () => {
    expect(tidyReply("Boil it for one minute [1][2][3].", passages).citesAll).toBe(true);
    expect(tidyReply("Boil it for one minute [1-3].", passages)).toMatchObject({
      citesAll: true,
      text: "Boil it for one minute [1][2][3].",
    });
    expect(tidyReply("Boil it [1][2].", passages.slice(0, 2)).citesAll).toBe(false);
  });
});

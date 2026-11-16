import type { PopulationSumResponse } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { FALLOUT_NO_COUNT, ringPeople, whoseEstimate } from "./population-words";

const answer = (over: Partial<PopulationSumResponse>): PopulationSumResponse => ({
  people: 220_000,
  covered: 1,
  sets: [{ country: "Luxembourg", product: "Population counts, 1 km, unconstrained, UN-adjusted", year: 2020 }],
  note: "",
  cellKm2: 0.6,
  ...over,
});

// Words that would turn a count of who lives somewhere into a prediction of harm.
const HARM = /casualt|fatalit|dead|death|die|kill|injur|victim|harmed|affected/i;

describe("people inside a ring", () => {
  it("is a rounded count from a named grid and year, said as who lives there and not a prediction of harm", () => {
    const words = ringPeople(10_000, answer({}));
    expect(words).toEqual({
      kind: "count",
      text: "About 220,000 people live inside this ring, by WorldPop's 2020 estimate. This is who lives there, not a prediction of harm.",
    });
    expect(words.text.replace("prediction of harm", "")).not.toMatch(HARM);
  });

  it("gives the server's rounding as it is (two significant figures) and never more", () => {
    expect(ringPeople(5_000, answer({ people: 1_500 })).text).toMatch(/^About 1,500 people/);
    expect(ringPeople(5_000, answer({ people: 1 })).text).toMatch(/^About 1 person lives/);
    expect(ringPeople(5_000, answer({ people: 0 })).text).toMatch(/counts no one living inside this ring/);
  });

  it("says a ring crossing the edge of the installed grid is counted only in part, or not at all", () => {
    const part = ringPeople(10_000, answer({ people: 80_000, covered: 0.64 }));
    expect(part.kind).toBe("partial");
    expect(part.text).toMatch(
      /About 80,000 people live in the 64% of this ring that the installed grid covers.*the rest of the ring is not counted/,
    );
    const little = ringPeople(10_000, answer({ people: 3_000, covered: 0.3 }));
    expect(little.kind).toBe("none");
    expect(little.text).toMatch(/covers only 30% of this ring, too little to give a count/);
    expect(little.text).not.toMatch(/3,000/);
  });

  it("gives no count for a ring smaller than a few of the grid's cells, or wider than the sum is made over", () => {
    expect(ringPeople(400, answer({ people: 40, cellKm2: 0.6 }))).toEqual({
      kind: "none",
      text: expect.stringMatching(/smaller than a few of the population grid's cells \(each about 0\.6 km² here\)/),
    });
    expect(ringPeople(400_000, answer({})).kind).toBe("none");
  });

  it("passes on why there is no count when the server has none", () => {
    expect(ringPeople(10_000, answer({ people: null, note: "No population grid installed covers this circle." })).text).toBe(
      "No population grid installed covers this circle.",
    );
  });

  it("names both countries' estimates when two grids are counted", () => {
    expect(
      whoseEstimate([
        { country: "Luxembourg", product: "p", year: 2020 },
        { country: "Belgium", product: "p", year: 2020 },
      ]),
    ).toBe("WorldPop's 2020 estimates for Luxembourg and Belgium");
  });

  it("gives no count for the fallout pattern, and says why", () => {
    expect(FALLOUT_NO_COUNT).toMatch(/No count is given for the fallout pattern\. It is an idealised shape/);
  });
});

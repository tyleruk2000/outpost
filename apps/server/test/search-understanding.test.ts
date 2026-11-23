/**
 * Query understanding (docs/search.md): the last word as a prefix only when the word
 * itself finds too little, other spellings and ways of saying a word (synonyms.ts), and
 * "Did you mean" from the words the library holds.
 */
import { afterEach, describe, expect, it } from "vitest";
import { alternateQuery, expandQuery, parseQuery, plainQuery, toFtsQuery } from "../src/modules/search/query.ts";
import { FORM_CREDIT, scoreFields, scoringTerms } from "../src/modules/search/score.ts";
import { editDistance } from "../src/modules/search/suggest.ts";
import { findExpansions, SYNONYM_ENTRIES, spellingsOf } from "../src/modules/search/synonyms.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { startSlowKiwix, uuidFor, writeArchives } from "./slow-kiwix.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function app(): Promise<TestApp> {
  const made = await createTestApp();
  cleanups.push(() => made.close());
  return made;
}

const note = (test: TestApp, entityId: string, title: string, text: string) =>
  test.ctx.services.search.upsert({ kind: "note", entityId, title, url: `/notes/${entityId}`, sections: [{ text }] });

type Result = { entityId: string; title: string; score: number; why?: string };
const ids = (body: { results: Result[] }) => body.results.map((result) => result.entityId);
const search = async (test: TestApp, q: string, extra = "") =>
  (await test.api("GET", `/api/search?q=${encodeURIComponent(q)}&reference=later${extra}`)).body;

describe("the last word", () => {
  it("is looked for as typed, and as the start of a longer word only when that finds too little", async () => {
    const test = await app();
    note(test, "pot", "Cooking pot", "A heavy pot for the stove.");
    note(test, "potatoes", "Potatoes", "Potatoes keep in the dark.");
    note(test, "batteries", "Batteries", "Lithium cells last longest.");
    // "pot" is in one item: fewer than five, so items holding a word it begins follow, after it.
    expect(ids(await search(test, "pot"))).toEqual(["pot", "potatoes"]);
    // Still being typed: "batt" is found as the start of "batteries".
    expect(ids(await search(test, "batt"))).toEqual(["batteries"]);
  });

  it("is not widened to longer words once the word itself finds enough", async () => {
    const test = await app();
    for (let index = 0; index < 5; index += 1) note(test, `pot-${index}`, `Pot ${index}`, "A heavy pot.");
    note(test, "potatoes", "Potatoes", "Potatoes keep in the dark.");
    expect(ids(await search(test, "pot"))).not.toContain("potatoes");
  });

  it("is asked of the index exactly, or as a prefix when asked for", () => {
    const parsed = parseQuery("water purif");
    expect(toFtsQuery(parsed, "all", undefined, false)).toBe('("water" AND "purif")');
    expect(toFtsQuery(parsed)).toBe('("water" AND "purif"*)');
  });
});

describe("other ways of saying a word", () => {
  it("has a table of at least 150 entries", () => {
    expect(SYNONYM_ENTRIES).toBeGreaterThanOrEqual(150);
  });

  it("widens British and American words both ways, and household names for the same thing", () => {
    expect(expandQuery(parseQuery("tyre pressure ")).also).toEqual(["tire"]);
    expect(expandQuery(parseQuery("tire pressure ")).also).toEqual(["tyre"]);
    expect(expandQuery(parseQuery("petrol ")).also).toEqual(["gasoline"]);
    expect(expandQuery(parseQuery("torch ")).also).toEqual(["flashlight"]);
    expect(expandQuery(parseQuery("nappy ")).also).toEqual(["diaper"]);
    expect(expandQuery(parseQuery("paracetamol ")).also).toEqual(["acetaminophen"]);
    expect(expandQuery(parseQuery("aluminium ")).also).toEqual(["aluminum"]);
    expect(expandQuery(parseQuery("CPR ")).also).toContain("resuscitation");
    expect(expandQuery(parseQuery("burns ")).also).toEqual(["scald"]);
  });

  it("carries a spelling's ending over, and leaves other words alone", () => {
    expect(spellingsOf("colours")).toEqual(["colors"]);
    expect(spellingsOf("sterilising")).toEqual(["sterilizing"]);
    expect(spellingsOf("sterilization")).toEqual(["sterilisation"]);
    expect(spellingsOf("centres")).toEqual(["centers"]);
    expect(spellingsOf("diarrhoea")).toEqual(["diarrhea"]);
    expect(spellingsOf("haemorrhage")).toEqual(["hemorrhage"]);
    expect(spellingsOf("travelled")).toEqual(["traveled"]);
    expect(spellingsOf("travel")).toEqual([]);
    expect(spellingsOf("colorado")).toEqual([]);
    expect(spellingsOf("organism")).toEqual([]);
  });

  it("does not take a word for another that shares its stem", () => {
    // "tired" stems to "tire", but is not a tyre.
    expect(expandQuery(parseQuery("tired driving ")).also).toEqual([]);
  });

  it("joins the words of a phrase that has other names, and asks for them near each other", () => {
    const { parsed, also } = expandQuery(parseQuery("what to do in a power cut"));
    expect(parsed.required).toEqual(["power cut"]);
    expect(parsed.joined).toEqual([true]);
    expect(also).toEqual(["power outage", "blackout", "power failure"]);
    expect(toFtsQuery(parsed)).toBe('(NEAR("power" "cut", 4) OR "power outage" OR "blackout" OR "power failure")');
    // kiwix-serve is asked the plain words, and once more the first other way of saying them.
    expect(plainQuery(parsed)).toBe("power cut");
    expect(alternateQuery(parsed)).toBe('"power outage"');
  });

  it("widens some words only beside others: a part is changed or replaced", () => {
    expect(expandQuery(parseQuery("change car battery ")).also).toEqual(["replace", "fit"]);
    expect(expandQuery(parseQuery("change of plan ")).also).toEqual([]);
    expect(expandQuery(parseQuery("treat water ")).also).toEqual(["purify", "disinfect"]);
    expect(expandQuery(parseQuery("treat a burn ")).also).toEqual(["scald"]);
  });

  it("never widens a word in quotes", () => {
    expect(expandQuery(parseQuery('"tyre" pressure ')).also).toEqual([]);
    expect(findExpansions(["tyre", "pressure"], [true, false])).toEqual([]);
  });

  it("counts a word as typed a little more than another way of saying it", () => {
    const { parsed } = expandQuery(parseQuery("tyre pressure "));
    const terms = scoringTerms(parsed, () => 1);
    const typed = scoreFields(terms, { title: "Notes", text: "Check tyre pressure monthly." });
    const other = scoreFields(terms, { title: "Notes", text: "Check tire pressure monthly." });
    expect(other.found).toBe(2);
    expect(typed.score).toBeGreaterThan(other.score);
    expect(other.coverage).toBeCloseTo((1 + FORM_CREDIT.synonym) / 2);
    // "tired" shares the stem of "tire" but is another word: it counts for less than "tyre" said as "tire".
    const tire = scoringTerms(expandQuery(parseQuery("tire ")).parsed, () => 1);
    expect(scoreFields(tire, { title: "Notes", text: "Tired drivers." }).coverage).toBeLessThan(
      scoreFields(tire, { title: "Notes", text: "Tyre care." }).coverage,
    );
  });

  it("finds what is said another way, says so, and can search only what was typed", async () => {
    const test = await app();
    note(test, "uk", "Car tyre pressures", "Check tyre pressure monthly, with tyres cold.");
    note(test, "us", "Tire care", "Check tire pressure once a month.");
    note(test, "outage", "Power outage plan", "Keep the freezer closed.");
    note(test, "cut", "Notes from the storm", "The power was cut at nine.");

    const tyre = await search(test, "tyre pressure");
    expect(ids(tyre)).toEqual(["uk", "us"]);
    expect(tyre.alsoSearched).toEqual(["tire"]);
    expect(tyre.results[1].why).toBe("All 2 words, side by side, one said another way");

    const asTyped = await search(test, "tyre pressure", "&exact=1");
    expect(ids(asTyped)).toEqual(["uk"]);
    expect(asTyped.alsoSearched).toEqual([]);

    // "The power was cut": the words near each other, and the other name for it.
    expect(ids(await search(test, "power cut")).sort()).toEqual(["cut", "outage"]);
  });

  it("asks each reference collection once more for the other spelling, and no more", async () => {
    const kiwix = await startSlowKiwix({
      books: [
        {
          uuid: uuidFor(1),
          name: "qa",
          title: "Motoring Q&A",
          delayMs: 0,
          articles: [],
          hits: [
            { title: "What tire pressure for winter?", path: "q/1", snippet: "...tire pressure drops in the cold..." },
            { title: "Tyre pressure on a caravan", path: "q/2", snippet: "...tyre pressure when towing..." },
          ],
        },
      ],
    });
    cleanups.push(() => kiwix.close());
    const test = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url });
    cleanups.push(() => test.close());
    const location = test.ctx.services.storage.getDefault();
    const [relPath] = writeArchives(location.path, kiwix.books);
    await test.api("POST", "/api/kiwix/import", { locationId: location.id, relPath, title: "Motoring Q&A" });

    const { body } = await test.api("GET", `/api/search?q=${encodeURIComponent("tyre pressure")}`);
    expect(kiwix.started.sort()).toEqual(["qa: tire pressure", "qa: tyre pressure"]);
    expect(body.results.map((result: Result) => result.title)).toEqual(["Tyre pressure on a caravan", "What tire pressure for winter?"]);

    kiwix.started.length = 0;
    await test.api("GET", `/api/search?q=${encodeURIComponent("caravan pressure")}`);
    expect(kiwix.started).toEqual(["qa: caravan pressure"]);
  });
});

describe("did you mean", () => {
  it("measures edits, a swap of two letters counting as one", () => {
    expect(editDistance("purifiy", "purify")).toBe(1);
    expect(editDistance("hypothermai", "hypothermia")).toBe(1);
    expect(editDistance("water", "wtaer")).toBe(1);
    expect(editDistance("stove", "radio")).toBe(3);
  });

  it("offers the nearest word the library holds, and never searches for it instead", async () => {
    const test = await app();
    note(test, "a", "Water treatment", "To purify water, boil it for a minute. Purify cloudy water after filtering.");
    note(test, "b", "Purifying tablets", "Purify a litre with one tablet.");
    note(test, "c", "Sand filters", "A sand filter clears cloudy water.");

    const typo = await search(test, "purifiy water");
    expect(typo.didYouMean).toEqual({ query: "purify water", words: ["purify"] });
    // The typed words are what was searched: nothing holds "purifiy", so nothing holds every word.
    expect(typo.everyWord).toBe(0);

    // A rare word that is spelt right ("sand", one item) is not taken for a common small one ("and").
    expect((await search(test, "filter water with sand")).didYouMean).toBeNull();
    // A word nothing near: no suggestion.
    expect((await search(test, "zzqx flurble")).didYouMean).toBeNull();
    // Found plenty: nothing to suggest.
    expect((await search(test, "water")).didYouMean).toBeNull();
  });

  it("prefers a word with the same first letter, then the commoner", async () => {
    const test = await app();
    note(test, "a", "Kettle", "Boil the kettle. Boil again. The boil is quick.");
    note(test, "b", "More", "Boil water. A coil of rope.");
    note(test, "c", "Rope", "A coil of rope, and a soil sample.");
    // "boyl" is one edit from "boil" and two from "coil": the nearest wins, whatever its first letter.
    expect((await search(test, "boyl")).didYouMean?.query).toBe("boil");
  });

  it("follows the library as passages change", async () => {
    const test = await app();
    note(test, "a", "Compass", "Read the compass bearing. Set the compass on the map.");
    note(test, "b", "Map", "A compass and a map.");
    expect((await search(test, "compss")).didYouMean?.query).toBe("compass");
    test.ctx.services.search.remove("note", "a");
    test.ctx.services.search.remove("note", "b");
    expect((await search(test, "compss")).didYouMean).toBeNull();
    note(test, "c", "Bearings", "Take a bearing with a compass. Walk on the compass needle.");
    note(test, "d", "Again", "The compass again.");
    expect((await search(test, "compss")).didYouMean?.query).toBe("compass");
  });
});

/**
 * Search package 4: the mild priors for the kind of question and the other meanings of
 * a word, what "why this result" says, one row for one title, answer cards, a typing
 * slip sent to the reference collections as the near word, emergency plans and supplies
 * in search by household, and what is kept in memory to make searching fast.
 */
import { type EmergencyPlanInput, emptyPlanBody, type PlanBody } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { collapseSameTitles, sameTitleKey } from "../src/modules/search/cards.ts";
import { adjusted, adjustFor, intentOf, MOST_FAVOUR, OTHER_SENSE } from "../src/modules/search/intent.ts";
import { createOwners } from "../src/modules/search/owners.ts";
import { expandQuery, parseQuery } from "../src/modules/search/query.ts";
import { reasonFor, scoreFields, scoringTerms } from "../src/modules/search/score.ts";
import { intentFor, placeCard, type SearchResult } from "../src/modules/search/service.ts";
import { createFlatVectorIndex } from "../src/modules/semantic/vector-index.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { type SlowKiwix, startSlowKiwix, uuidFor, writeArchives } from "./slow-kiwix.ts";

const intent = (q: string) => intentFor(expandQuery(parseQuery(q)).parsed);

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function app(env: Record<string, string> = {}): Promise<TestApp> {
  const made = await createTestApp(env, undefined, { voacapData: false });
  cleanups.push(() => made.close());
  return made;
}
// biome-ignore lint/suspicious/noExplicitAny: answers are checked by the assertions
type Body = any;
async function ok(test: TestApp, method: string, url: string, body?: unknown): Promise<Body> {
  const response = await test.api(method, url, body);
  expect(response.status, `${method} ${url} ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
}
const search = async (test: TestApp, q: string, extra = ""): Promise<Body> =>
  ok(test, "GET", `/api/search?q=${encodeURIComponent(q)}&reference=later${extra}`);

describe("the kind of question", () => {
  it("favours medical and first aid sources for a first aid question, and says so", () => {
    const question = intent("rescue breaths for a child");
    expect(question.medical).toBe(true);
    const wikimed = adjustFor(question, { title: "Rescue breaths", collection: "WikiMed Medical Encyclopedia", tags: [], article: true });
    expect(wikimed.factor).toBe(1.25);
    expect(wikimed.notes).toEqual(["favoured: medical source"]);
    // One of the person's own, by the words of its title that are not the question's.
    const manual = adjustFor(question, { title: "First aid manual", collection: null, tags: [] });
    expect(manual.notes).toEqual(["favoured: first aid source"]);
    const forum = adjustFor(question, { title: "Rescue breaths?", collection: "The Great Outdoors Q&A", tags: [], article: true });
    expect(forum.factor).toBe(1);
  });

  it("does not count the question's own words in a title as the kind of source", () => {
    // "car" is the question's word: a chemistry page is not a vehicle source for saying it.
    const chemistry = adjustFor(intent("car battery"), { title: "Electric car battery chemistry", collection: null, tags: [] });
    expect(chemistry.factor).toBe(1);
    const garage = adjustFor(intent("car battery"), {
      title: "Car battery",
      collection: "Motor Vehicle Mechanics Q&A",
      tags: [],
      article: true,
    });
    expect(garage.notes).toEqual(["favoured: vehicle source"]);
  });

  it("favours how-to sources for how-to questions, safety guidance for using a generator safely, and caps the two together", () => {
    const question = intent("how to use a generator safely");
    expect(question.howTo).toBe(true);
    expect(question.safety).toBe(true);
    const both = adjustFor(question, { title: "Generators", collection: "Fire safety guides", tags: [], article: true });
    expect(both.factor).toBe(MOST_FAVOUR);
    expect(both.notes).toEqual(["favoured: safety guidance"]);
    // Fuel is not a car: storing petrol is a question for the shed.
    expect(intent("store petrol safely").vehicle).toBe(false);
  });

  it("lowers a result plainly in another meaning of a word, unless the question asks for that meaning", () => {
    const railway = {
      title: "Canadian Pacific Railway",
      collection: "Best of Wikipedia",
      tags: [],
      text: "The CPR built a railway.",
      article: true,
    };
    const cpr = adjustFor(intent("cpr on a child"), railway);
    expect(cpr.factor).toBe(OTHER_SENSE);
    expect(cpr.notes).toEqual(["another meaning of “cpr”"]);
    expect(adjustFor(intent("cpr railway history"), railway).factor).toBe(1);
    const signals = {
      title: "PWM signal generator",
      collection: "Arduino Q&A",
      tags: [],
      text: "A function generator for PWM.",
      article: true,
    };
    expect(adjustFor(intent("how to use a generator safely"), signals).notes).toContain("another meaning of “generator”");
    // Without a word that says which generator, none is assumed.
    expect(intentOf({ words: ["generator"], ignored: [] }).senses).toEqual([]);
  });

  it("raises a score by at most the factor and never to full marks", () => {
    expect(adjusted(0.4, 1.25)).toBe(0.5);
    expect(adjusted(0.9, 1.25)).toBe(0.92);
    expect(adjusted(0.99, 1.3)).toBeLessThan(1);
    expect(adjusted(0.8, OTHER_SENSE)).toBe(0.6);
  });

  it("puts a first aid manual above a hiking forum that uses the same words", async () => {
    const test = await app();
    const { search: index } = test.ctx.services;
    index.upsert({
      kind: "note",
      entityId: "forum",
      title: "Rescue breaths for a child at camp",
      url: "/notes/forum",
      sections: [{ text: "Someone asked about rescue breaths for a child on a hike." }],
    });
    index.upsert({
      kind: "document",
      entityId: "manual",
      title: "Rescue breaths for a child",
      collection: "First aid",
      url: "/library/documents/manual",
      sections: [{ text: "Give five rescue breaths to a child who is not breathing." }],
    });
    const body = await search(test, "rescue breaths for a child");
    expect(body.results[0].entityId).toBe("manual");
    expect(body.results[0].why).toContain("favoured: first aid source");
    expect(body.results[0].score).toBeLessThan(1);
  });
});

describe("why this result", () => {
  const terms = (q: string) => scoringTerms(expandQuery(parseQuery(q)).parsed, () => 1);

  it("names a word that is missing, and the other way of saying a word that was found", () => {
    expect(reasonFor(scoreFields(terms("filter water sand"), { title: "Water filters", text: "A filter for water." }))).toBe(
      "2 of 3 words, not “sand”",
    );
    expect(reasonFor(scoreFields(terms("tyre pressure"), { title: "Tire pressure", text: "" }))).toBe(
      "All 2 words in the title; also matched tire",
    );
  });

  it("is said for every result of a search", async () => {
    const test = await app();
    const { search: index } = test.ctx.services;
    index.upsert({ kind: "note", entityId: "a", title: "Tire pressure", url: "/notes/a", sections: [{ text: "Check it monthly." }] });
    index.upsert({ kind: "note", entityId: "b", title: "Tyre care", url: "/notes/b", sections: [{ text: "Pressure matters." }] });
    index.upsert({ kind: "note", entityId: "c", title: "Pressure cooker", url: "/notes/c", sections: [{ text: "Not a tyre." }] });
    const body = await search(test, "tyre pressure");
    expect(body.results.length).toBeGreaterThan(1);
    for (const result of body.results) expect(result.why).toMatch(/\w/);
  });
});

describe("one row for one title", () => {
  const result = (kind: string, title: string, collection: string | null = null) =>
    ({ kind, entityId: `${kind}:${title}`, title, collection, subtitle: null, url: `/${kind}` }) as unknown as SearchResult;

  it("keeps the first of a title and names the others under it, leaving reference articles alone", () => {
    const { results, collapsed } = collapseSameTitles([
      result("collection", "Wikimed medical encyclopedia"),
      result("reference", "Burn", "WikiMed"),
      result("reference", "Burn", "Best of Wikipedia"),
      result("document", "WikiMed Medical Encyclopedia", "Collections"),
      result("catalog", "WikiMed: Medical Encyclopedia"),
    ]);
    expect(collapsed).toBe(2);
    expect(results.map((each) => each.title)).toEqual(["Wikimed medical encyclopedia", "Burn", "Burn"]);
    expect(results[0]!.alsoIn?.map((each) => each.kind)).toEqual(["document", "catalog"]);
    expect(sameTitleKey("Quick reference card")).toBe(sameTitleKey("Quick Reference Card."));
  });

  it("shows repeated quick reference cards once in a search", async () => {
    const test = await app();
    for (const radio of ["UV-5R", "FT-60", "IC-705"]) {
      test.ctx.services.search.upsert({
        kind: "document",
        entityId: radio,
        title: "Quick reference card",
        collection: `${radio} manuals`,
        url: `/library/documents/${radio}`,
        sections: [{ text: `Keys of the ${radio} radio at a glance.` }],
      });
    }
    const body = await search(test, "quick reference card");
    expect(body.results).toHaveLength(1);
    expect(body.results[0].alsoIn).toHaveLength(2);
    expect(body.total).toBe(1);
  });
});

const planInput = (name: string, kind: EmergencyPlanInput["kind"], body: Partial<PlanBody> = {}): EmergencyPlanInput => ({
  name,
  kind,
  kindText: "",
  templateId: null,
  emergencyNumber: "999",
  reviewEveryDays: null,
  body: { ...emptyPlanBody(), ...body },
});

describe("answer cards", () => {
  it("offers Tools: Water for making water safe, and nothing for water alone", async () => {
    const test = await app();
    expect((await search(test, "purify water")).card).toMatchObject({ kind: "tool", url: "/tools/water" });
    expect((await search(test, "how do I boil water")).card?.url).toBe("/tools/water");
    expect((await search(test, "water")).card).toBeNull();
    // Only on the first page, and not on a tab of one kind.
    expect((await search(test, "purify water", "&offset=20")).card).toBeNull();
    expect((await search(test, "purify water", "&kinds=note")).card).toBeNull();
  });

  it("offers the current household's power cut plan for a power cut, and only that household's", async () => {
    const test = await app();
    expect((await search(test, "power cut")).card).toBeNull();
    const { plan } = await ok(test, "POST", "/api/emergency-plans", planInput("When the lights go out", "power-cut"));
    const card = (await search(test, "what to do in a power cut")).card;
    expect(card).toMatchObject({ kind: "plan", title: "When the lights go out", url: `/prepare/plans/${plan.id}` });
    expect((await search(test, "blackout")).card?.url).toBe(`/prepare/plans/${plan.id}`);
    const { household } = await ok(test, "POST", "/api/households", { name: "Cabin" });
    await ok(test, "PUT", "/api/households/current", { id: household.id });
    expect((await search(test, "power cut")).card).toBeNull();
  });

  it("offers the map for the exact name of one place, when the library says little of it", () => {
    const place = { kind: "map-feature", title: "Waterfields", subtitle: "Village, GB", url: "/maps?feature=1" } as SearchResult;
    expect(placeCard("waterfields", [place], 0)).toMatchObject({ kind: "place", url: "/maps?feature=1" });
    expect(placeCard("waterfields", [place], 9)).toBeNull();
    expect(placeCard("water", [place], 0)).toBeNull();
    expect(placeCard("waterfields", [place, { ...place, url: "/maps?feature=2" }], 0)).toBeNull();
  });
});

describe("emergency plans and supplies in search", () => {
  it("finds the current household's plans and supplies, never a person's medical notes, and says whose they are", async () => {
    const test = await app();
    await ok(
      test,
      "POST",
      "/api/emergency-plans",
      planInput("Flood plan", "flooding", {
        steps: [{ id: "s1", phase: "during", text: "Move the sandbags to the back door.", origin: null }],
        people: [{ id: "p1", name: "Gran", remember: "Spare glasses", medical: "Takes warfarin", contactId: null }],
      }),
    );
    await ok(test, "POST", "/api/supplies/items", { name: "Sandbags", category: "equipment", quantity: 12, location: "Garage" });

    const found = await search(test, "sandbags");
    expect(found.householdShown).toBeNull();
    expect(found.results.map((result: Body) => result.kind).sort()).toEqual(["plan", "supply"]);
    const plan = found.results.find((result: Body) => result.kind === "plan");
    expect(plan.url).toMatch(/^\/prepare\/plans\//);
    expect(plan.passages[0].heading).toBe("During");
    expect((await search(test, "warfarin")).total).toBe(0);
    expect((await search(test, "spare glasses")).total).toBe(1);

    // Another household's are not this one's.
    const { household } = await ok(test, "POST", "/api/households", { name: "Cabin" });
    await ok(test, "PUT", "/api/households/current", { id: household.id });
    expect((await search(test, "sandbags")).total).toBe(0);
    await ok(test, "PUT", "/api/households/current", { id: "household" });
    const again = await search(test, "sandbags");
    expect(again.total).toBe(2);
    // With two households, a result says whose it is.
    expect(again.results.find((result: Body) => result.kind === "supply").subtitle).toContain("for ");
    expect(again.householdShown).toMatch(/\w/);

    // Removed, it is gone from search.
    const item = again.results.find((result: Body) => result.kind === "supply");
    expect((await test.api("DELETE", `/api/supplies/items/${item.entityId}`)).status).toBe(200);
    expect((await search(test, "sandbags")).total).toBe(1);
  });
});

describe("a typing slip sent to the reference collections", () => {
  let kiwix: SlowKiwix | undefined;
  afterEach(async () => {
    await kiwix?.close();
    kiwix = undefined;
  });

  it("asks them for the near word as well, and says so", async () => {
    const books = [
      {
        uuid: uuidFor(1),
        name: "water-book",
        title: "Water treatment library",
        delayMs: 0,
        articles: [],
        hits: [{ title: "How to purify water", path: "purify", snippet: "Boil water to purify it." }],
      },
    ];
    kiwix = await startSlowKiwix({ books });
    const test = await app({ OUTPOST_KIWIX_URL: kiwix.url });
    const location = test.ctx.services.storage.getDefault();
    for (const [index, relPath] of writeArchives(location.path, books).entries()) {
      await ok(test, "POST", "/api/kiwix/import", { locationId: location.id, relPath, title: books[index]!.title });
    }
    for (const id of ["one", "two"]) {
      test.ctx.services.search.upsert({
        kind: "note",
        entityId: id,
        title: "Water",
        url: `/notes/${id}`,
        sections: [{ text: "Purify water by boiling." }],
      });
    }
    const base = await test.app.listen({ port: 0, host: "127.0.0.1" });
    const text = await (await fetch(`${base}/api/search/reference?q=${encodeURIComponent("purifiy water")}`)).text();
    const lines = text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(lines[0]).toMatchObject({ type: "start", instead: { query: "purify water", words: ["purify"] } });
    expect(kiwix.started.some((asked) => asked.includes("purify water"))).toBe(true);
    const found = lines.filter((line) => line.type === "collection").flatMap((line) => line.results);
    expect(found.map((result: Body) => result.title)).toContain("How to purify water");
    // A word the library holds is asked as typed only.
    const plain = await (await fetch(`${base}/api/search/reference?q=${encodeURIComponent("purify water")}`)).text();
    expect(JSON.parse(plain.split("\n")[0]!).instead).toBeUndefined();
  });
});

describe("snippets", () => {
  it("marks the words in every result shown, among many passages holding them", async () => {
    const test = await app();
    for (let index = 0; index < 40; index += 1) {
      test.ctx.services.search.upsert({
        kind: "note",
        entityId: `n${index}`,
        title: `Note ${index}`,
        url: `/notes/n${index}`,
        sections: [{ text: index % 3 === 0 ? `Boil water ${index} for a minute.` : `Water ${index} in the tank.` }],
      });
    }
    const body = await search(test, "boil water");
    expect(body.results.length).toBeGreaterThan(10);
    for (const result of body.results) {
      expect(result.passages.length, result.title).toBeGreaterThan(0);
      const marked = result.passages[0].segments.filter((segment: Body) => segment.hit).map((segment: Body) => segment.text.toLowerCase());
      expect(marked, result.title).toContain("water");
      // Each result's own passage, not another's.
      expect(result.passages[0].segments.map((segment: Body) => segment.text).join("")).toContain(result.title.replace("Note ", ""));
    }
  });
});

describe("what is kept in memory", () => {
  it("knows the owner of every passage, those written before it started included", async () => {
    const test = await app();
    test.ctx.services.search.upsert({ kind: "note", entityId: "x", title: "X", url: "/notes/x", sections: [{ text: "Something." }] });
    const owners = createOwners(test.ctx.sqlite);
    owners.reload();
    const row = test.ctx.sqlite.prepare("SELECT c.id AS chunk, c.entity_row_id AS item FROM chunks c").get() as {
      chunk: number;
      item: number;
    };
    expect(owners.ownerOf(row.chunk)).toBe(row.item);
    expect(owners.item(row.item)).toEqual({ kind: "note", household: null });
    expect(owners.ownerOf(row.chunk + 10_000)).toBe(0);
  });

  it("keeps the vectors in step: new ones are found, and removed ones are not", async () => {
    const test = await app();
    const { sqlite } = test.ctx;
    const { search: index } = test.ctx.services;
    for (const id of ["a", "b", "c"])
      index.upsert({ kind: "note", entityId: id, title: id, url: `/notes/${id}`, sections: [{ text: `Text ${id}.` }] });
    sqlite.prepare("INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES ('t', 'test', 't', 2, 0)").run();
    const chunk = (id: string) =>
      (
        sqlite.prepare("SELECT c.id FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id WHERE e.entity_id = ?").get(id) as {
          id: number;
        }
      ).id;
    const vectors = createFlatVectorIndex(sqlite);
    vectors.upsert("t", [
      { chunkId: chunk("a"), contentHash: "", vector: Float32Array.from([1, 0]) },
      { chunkId: chunk("b"), contentHash: "", vector: Float32Array.from([0, 1]) },
    ]);
    expect(vectors.query("t", Float32Array.from([1, 0]), 1)[0]?.chunkId).toBe(chunk("a"));
    vectors.upsert("t", [{ chunkId: chunk("c"), contentHash: "", vector: Float32Array.from([0.8, 0.6]) }]);
    expect(vectors.query("t", Float32Array.from([0.8, 0.6]), 1)[0]?.chunkId).toBe(chunk("c"));
    // Replaced in place.
    vectors.upsert("t", [{ chunkId: chunk("c"), contentHash: "", vector: Float32Array.from([-1, 0]) }]);
    expect(vectors.query("t", Float32Array.from([1, 0]), 3).map((hit) => hit.chunkId)).toEqual([chunk("a"), chunk("b"), chunk("c")]);
    // Its passage removed, a vector goes with it.
    const gone = chunk("a");
    index.remove("note", "a");
    expect(vectors.query("t", Float32Array.from([1, 0]), 3).map((hit) => hit.chunkId)).not.toContain(gone);
  });
});

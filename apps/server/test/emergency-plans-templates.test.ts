/**
 * The templates and the supplies comparison of emergency plans (packages/shared).
 *
 * Every step, supply and "where things are" line of a template names a source that is
 * listed, with the words of that source it paraphrases; every source has its address,
 * the date the page gives itself and the day it was read. The comparison of a plan's
 * supplies with the inventory is checked against cases worked by hand.
 */
import {
  attributionsFor,
  compareSupplies,
  EMERGENCY_NUMBERS,
  type HeldRow,
  neededOf,
  PLAN_KIND_IDS,
  PLAN_SOURCES,
  PLAN_TEMPLATES,
  type PlanSupply,
  planFromTemplate,
  SOURCE_TERMS,
  sameThing,
  sourceById,
  stepStanding,
  stepsTakenOut,
  termsOf,
  thingOf,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

describe("the templates", () => {
  const sourceIds = new Set(PLAN_SOURCES.map((source) => source.id));

  it("cover each known kind but 'something else', which starts from blank", () => {
    const kinds = new Set(PLAN_TEMPLATES.map((template) => template.kind));
    for (const kind of PLAN_KIND_IDS.filter((each) => each !== "other" && each !== "evacuate")) expect(kinds).toContain(kind);
    expect(kinds).not.toContain("other");
  });

  it("trace every step, supply and 'where things are' line to a quoted source that exists", () => {
    for (const template of PLAN_TEMPLATES) {
      expect(template.steps.length, template.id).toBeGreaterThan(0);
      for (const line of [...template.steps, ...template.supplies, ...template.where]) {
        expect(sourceIds.has(line.source), `${line.id}: ${line.source}`).toBe(true);
        if ("pointer" in line && line.pointer) continue;
        // A checklist on a page can be a single item ("a torch"), quoted as it stands.
        expect(line.quote.trim().length, line.id).toBeGreaterThan(3);
      }
      if (template.days) expect(sourceIds.has(template.days.source)).toBe(true);
    }
  });

  it("quote only publishers whose own terms allow their words to be shipped, as those terms allow", () => {
    for (const source of PLAN_SOURCES) expect(termsOf(source), `${source.id}: terms ${source.terms}`).toBeDefined();
    for (const template of PLAN_TEMPLATES) {
      for (const line of [...template.steps, ...template.supplies, ...template.where]) {
        const terms = termsOf(sourceById(line.source))!;
        if ("pointer" in line && line.pointer) {
          // A pointer names a page and quotes nothing.
          expect(line.quote, line.id).toBe("");
          continue;
        }
        expect(terms.cleared, `${line.id} quotes ${line.source}, whose terms (${terms.id}) are not cleared`).toBe(true);
        expect(terms.attribution, `${line.id}: ${terms.id} has no attribution to show`).toBeTruthy();
        // A publisher that allows only exact copies: the step is its words, unchanged.
        if (!terms.adapt && "phase" in line) expect(line.text, line.id).toBe(line.quote);
      }
      if (template.days) expect(termsOf(sourceById(template.days.source))!.cleared, template.id).toBe(true);
    }
    // A number is a fact and is cited; a source's words go with it only where its terms allow.
    for (const entry of EMERGENCY_NUMBERS)
      if (entry.quote) expect(termsOf(sourceById(entry.source))!.cleared, `${entry.number}: ${entry.source}`).toBe(true);
    // The publishers read and found not cleared are named, with the words that decided it.
    const refused = SOURCE_TERMS.filter((terms) => !terms.cleared).map((terms) => terms.id);
    expect(refused).toEqual(expect.arrayContaining(["british-red-cross", "ready-gov", "nz-police"]));
    for (const terms of SOURCE_TERMS) {
      expect(terms.url, terms.id).toMatch(/^https:\/\//);
      expect(terms.quote.length, terms.id).toBeGreaterThan(40);
    }
  });

  it("say which licences a plan's words come under, once each, and nothing for a pointer", () => {
    const template = PLAN_TEMPLATES.find((each) => each.id === "comms-failure")!;
    const all = attributionsFor([...template.steps, ...template.supplies].map((line) => line.id));
    expect(all).toContain("Contains public sector information licensed under the Open Government Licence v3.0.");
    expect(all.some((line) => line.startsWith("Ofcom copyright"))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    const pointers = PLAN_TEMPLATES.flatMap((each) => each.steps.filter((step) => step.pointer));
    expect(pointers.length).toBeGreaterThan(0);
    expect(attributionsFor(pointers.map((step) => step.id))).toEqual([]);
    expect(attributionsFor([null, "no-such-line"])).toEqual([]);
  });

  it("give every line an id of its own, across all templates", () => {
    const ids = PLAN_TEMPLATES.flatMap((template) => [
      ...template.steps.map((step) => step.id),
      ...template.supplies.map((supply) => supply.id),
      ...template.where.map((where) => where.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PLAN_TEMPLATES.map((template) => template.id)).size).toBe(PLAN_TEMPLATES.length);
  });

  it("name every source with its address, its own date and the day it was read", () => {
    expect(new Set(PLAN_SOURCES.map((source) => source.id)).size).toBe(PLAN_SOURCES.length);
    for (const source of PLAN_SOURCES) {
      expect(source.url, source.id).toMatch(/^https:\/\//);
      expect(source.pageDate.trim(), source.id).not.toBe("");
      expect(source.checked, source.id).toMatch(/\d{4}/);
      expect(source.publisher.trim(), source.id).not.toBe("");
    }
    // Every source listed is used by something.
    const used = new Set([
      ...PLAN_TEMPLATES.flatMap((template) => [
        ...template.steps.map((step) => step.source),
        ...template.supplies.map((supply) => supply.source),
        ...template.where.map((where) => where.source),
        ...(template.days ? [template.days.source] : []),
      ]),
      ...EMERGENCY_NUMBERS.map((entry) => entry.source),
    ]);
    for (const source of PLAN_SOURCES) expect(used.has(source.id), source.id).toBe(true);
  });

  it("give each emergency number a source", () => {
    expect(EMERGENCY_NUMBERS.find((entry) => entry.regions.includes("GB"))?.number).toBe("999");
    for (const entry of EMERGENCY_NUMBERS) expect(sourceIds.has(entry.source), entry.number).toBe(true);
  });

  it("tell the source's words from words changed, from the household's own, and list what was taken out", () => {
    const template = PLAN_TEMPLATES[0]!;
    let n = 0;
    const plan = planFromTemplate(template, () => `s${++n}`);
    const [first, second, ...rest] = plan.body.steps;
    expect(stepStanding(first!).kind).toBe("official");
    expect(stepStanding({ ...second!, text: `${second!.text} Twice.` }).kind).toBe("changed");
    expect(stepStanding({ text: "Ring Gran", origin: null }).kind).toBe("own");
    expect(stepsTakenOut(template.id, [first!, ...rest]).map((step) => step.id)).toEqual([second!.origin]);
  });
});

const supply = (over: Partial<PlanSupply>): PlanSupply => ({
  id: over.name ?? "x",
  name: "x",
  quantity: null,
  unit: "",
  perPerson: false,
  perDay: false,
  category: null,
  origin: null,
  ...over,
});
const row = (over: Partial<HeldRow>): HeldRow => ({ name: "x", category: "other", quantity: 1, unit: "", ...over });

describe("a plan's supplies against the inventory, worked by hand", () => {
  it("works out what is needed for the household and the days", () => {
    // 2 litres each a day, 3 people, 4 days: 2 × 3 × 4 = 24.
    expect(neededOf({ quantity: 2, perPerson: true, perDay: true }, 3, 4)).toBe(24);
    // One torch each: 3.
    expect(neededOf({ quantity: 1, perPerson: true, perDay: false }, 3, 4)).toBe(3);
    // A day's figure with no days set cannot be said.
    expect(neededOf({ quantity: 2, perPerson: false, perDay: true }, 3, null)).toBeNull();
    expect(neededOf({ quantity: null, perPerson: true, perDay: true }, 3, 4)).toBeNull();
  });

  it("says in stock, low, missing, or check", () => {
    const wanted = [
      supply({ name: "Torch", quantity: 1, unit: "", perPerson: true }),
      supply({ name: "AA batteries", quantity: 8, unit: "battery" }),
      supply({ name: "Bottled water", quantity: 2, unit: "litre", perPerson: true, perDay: true, category: "water" }),
      supply({ name: "Wind-up radio" }),
      supply({ name: "Candles", quantity: 6, unit: "candle" }),
    ];
    const held = [
      row({ name: "LED torch", category: "equipment", quantity: 2 }),
      row({ name: "Head torch", category: "equipment", quantity: 1 }),
      row({ name: "AA Batteries (Duracell)", category: "batteries", quantity: 4, unit: "batteries" }),
      // Water is held in bottles, not litres: compared by hand.
      row({ name: "Bottled water still", category: "water", quantity: 12, unit: "bottle" }),
      // Bottled water outside the water category does not count for a line that names the category.
      row({ name: "Bottled water", category: "other", quantity: 99, unit: "litre" }),
      // Past its use-by, so not counted.
      row({ name: "Candles", category: "equipment", quantity: 10, unit: "candles", expired: true }),
    ];
    const checks = compareSupplies(wanted, held, 3, 3);
    // Torches: 2 + 1 = 3 held, 1 each for 3 people = 3 needed.
    expect(checks[0]).toMatchObject({ standing: "in-stock", needed: 3, held: 3, rows: 2, short: null });
    // Batteries: 4 held of 8 ("batteries" is "battery" in the plural): 4 short.
    expect(checks[1]).toMatchObject({ standing: "low", needed: 8, held: 4, short: 4 });
    // Water: 2 × 3 × 3 = 18 litres wanted; held only in bottles.
    expect(checks[2]).toMatchObject({ standing: "check", needed: 18, held: 0, otherUnits: ["bottle"], short: null });
    // A radio with no quantity and none held.
    expect(checks[3]).toMatchObject({ standing: "missing", needed: null, short: null });
    // Candles past their use-by: missing, all 6 to buy.
    expect(checks[4]).toMatchObject({ standing: "missing", needed: 6, short: 6 });
  });

  it("looks for the thing a line names, not the rest of its words", () => {
    expect(thingOf("Torch (battery or wind-up) and spare batteries")).toBe("Torch");
    expect(thingOf("Non-perishable food that needs no cooking")).toBe("Non-perishable food");
    expect(thingOf("Blankets, warm clothing and extra layers")).toBe("Blankets");
    expect(thingOf("Bottled water")).toBe("Bottled water");
    const [torch] = compareSupplies(
      [supply({ name: "Torch (battery or wind-up) and spare batteries" })],
      [row({ name: "LED torch", quantity: 2 })],
      1,
      null,
    );
    expect(torch!.standing).toBe("in-stock");
  });

  it("matches by every word of the plan's name, and nothing less", () => {
    expect(sameThing("torch", "LED Torch")).toBe(true);
    expect(sameThing("first aid kit", "First-aid kit (car)")).toBe(true);
    expect(sameThing("wind-up radio", "Radio")).toBe(false);
    expect(sameThing("", "Anything")).toBe(false);
  });

  it("counts anything held, with no quantity asked, and nothing of a row with none left", () => {
    const [kept, gone] = compareSupplies(
      [supply({ name: "Whistle" }), supply({ name: "Matches" })],
      [row({ name: "Whistle", quantity: 1 }), row({ name: "Matches", quantity: 0 })],
      2,
      null,
    );
    expect(kept!.standing).toBe("in-stock");
    expect(gone!.standing).toBe("missing");
  });
});

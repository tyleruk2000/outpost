import { computeEffects } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { scenarioDocument, scenarioMarkdown } from "./document";
import { checkForm, EMPTY_FORM, formOf } from "./form";

const filled = { ...EMPTY_FORM, name: "Quarry", where: "54.46, -3.09" };

describe("the scenario form", () => {
  it("reads a full entry into the simulator's input, in kilotons and metres", () => {
    const checked = checkForm({
      ...filled,
      yieldValue: "1.5",
      yieldUnit: "Mt",
      burst: "height",
      heightValue: "3000",
      heightUnit: "ft",
      windFrom: "250",
      windSpeed: "15",
      windUnit: "mph",
    });
    expect(checked.input).not.toBeNull();
    expect(checked.input!.effects.yieldKt).toBe(1500);
    expect(checked.input!.effects.burst).toEqual({ kind: "height", metres: 3000 * 0.3048 });
    expect(checked.input!.effects.wind!.kmh).toBeCloseTo(24.14, 2);
  });

  it("refuses what the model refuses, with the model's reason", () => {
    const checked = checkForm({ ...filled, yieldValue: "20", yieldUnit: "Mt" });
    expect(checked.input).toBeNull();
    expect(checked.refused[0]).toMatch(/1 kiloton to 10 megatons/);
    expect(checkForm({ ...filled, yieldValue: "0.2" }).refused[0]).toMatch(/1 kiloton/);
    expect(checkForm({ ...filled, windFrom: "90", windSpeed: "3" }).refused[0]).toMatch(/8 to 45/);
  });

  it("leaves an unfinished or refused wind out of what is drawn, without losing the rest, and does not save it", () => {
    for (const wind of [
      { windFrom: "90" },
      { windSpeed: "24" },
      { windFrom: "west", windSpeed: "24" },
      { windFrom: "90", windSpeed: "3" },
    ]) {
      const checked = checkForm({ ...filled, windFrom: "", windSpeed: "", ...wind });
      expect(checked.effects, JSON.stringify(wind)).toMatchObject({ yieldKt: expect.any(Number), wind: null });
      expect(checked.input, JSON.stringify(wind)).toBeNull();
      expect(checked.problems.wind ?? checked.refused[0], JSON.stringify(wind)).toMatch(/wind/i);
    }
    // A refusal that is not about the wind still stops everything.
    expect(checkForm({ ...filled, yieldValue: "20", yieldUnit: "Mt", windFrom: "90" }).effects).toBeNull();
  });

  it("reads a wind from 360 degrees as from the north, as the field's own hint allows", () => {
    const checked = checkForm({ ...filled, windFrom: "360", windSpeed: "24" });
    expect(checked.refused).toEqual([]);
    expect(checked.input!.effects.wind).toEqual({ fromDegrees: 0, kmh: 24 });
  });

  it("says what is missing or cannot be read", () => {
    expect(checkForm({ ...filled, where: "" }).problems.where).toMatch(/Choose ground zero/);
    expect(checkForm({ ...filled, where: "somewhere" }).problems.where).toMatch(/not a position/);
    expect(checkForm({ ...filled, yieldValue: "lots" }).problems.yield).toMatch(/number/);
    expect(checkForm({ ...filled, windFrom: "90" }).problems.wind).toMatch(/both/);
    expect(checkForm({ ...filled, name: " " }).problems.name).toMatch(/name/);
  });

  it("gives the effects even before the scenario has a name, so the map can show them", () => {
    const checked = checkForm({ ...filled, name: "" });
    expect(checked.input).toBeNull();
    expect(checked.effects).not.toBeNull();
  });

  it("reads a saved scenario back", () => {
    const input = checkForm({ ...filled, burst: "optimum", psi: "2", windFrom: "90", windSpeed: "30" }).input!;
    const form = formOf({ ...input, id: "x", createdAt: 1, updatedAt: 2 });
    expect(checkForm(form).input).toEqual(input);
  });
});

describe("the scenario written out", () => {
  it("carries every figure, the caveat, assumptions, limitations and the source", () => {
    const input = checkForm({ ...filled, windFrom: "270", windSpeed: "24" }).input!;
    const answer = computeEffects(input.effects);
    if (!answer.ok) throw new Error("expected an answer");
    const markdown = scenarioMarkdown([{ letter: "A", scenario: input, result: answer.result }]);
    expect(markdown).toMatch(/educational estimate/);
    expect(markdown).toMatch(/not a forecast and not instructions/);
    expect(markdown).toMatch(/Assumptions/);
    expect(markdown).toMatch(/Limitations/);
    expect(markdown).toMatch(/Glasstone and Philip J\. Dolan/);
    expect(markdown).toMatch(/5 psi/);
    expect(markdown).toMatch(/Idealised fallout pattern/);
    expect(markdown).toMatch(/No casualty figures are given/);
  });

  it("labels two scenarios A and B", () => {
    const input = checkForm(filled).input!;
    const answer = computeEffects(input.effects);
    if (!answer.ok) throw new Error("expected an answer");
    const blocks = scenarioDocument([
      { letter: "A", scenario: input, result: answer.result },
      { letter: "B", scenario: { ...input, name: "Other" }, result: answer.result },
    ]);
    const headings = blocks.filter((block) => block.kind === "heading").map((block) => (block as { text: string }).text);
    expect(headings).toContain("A: Quarry");
    expect(headings).toContain("B: Other");
  });
});

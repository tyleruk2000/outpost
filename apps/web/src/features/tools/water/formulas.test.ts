import { describe, expect, it } from "vitest";
import { boilAdvice, filterLife, rainYieldLitres, storageLitres } from "./formulas";
import { BLEACH_TABLES, METHODS, PLANNING_FIGURES, startingFigure, startingHint } from "./guidance";

describe("water to store", () => {
  it("is people × days × litres a day", () => {
    expect(storageLitres(2, 3, 3)).toBe(18);
  });

  it("uses each body's own figure: UK 3 litres for drinking, CDC and FEMA a US gallon, WHO 2.5 to 3 and 7.5 to 15", () => {
    const figure = (id: string) => PLANNING_FIGURES.find((item) => item.id === id)!.litres;
    expect(figure("uk")).toEqual([3, 3]);
    expect(figure("cdc")[0]).toBeCloseTo(3.785, 3);
    expect(figure("fema")[0]).toBeCloseTo(3.785, 3);
    expect(figure("who-survival")).toEqual([2.5, 3]);
    expect(figure("who-basic")).toEqual([7.5, 15]);
  });
});

describe("the planning figure to start on", () => {
  it("is FEMA's in the United States, and the UK government's everywhere else, as before, said plainly", () => {
    expect(startingFigure("GB")).toBe("uk");
    expect(startingFigure("JE")).toBe("uk");
    expect(startingFigure("US")).toBe("fema");
    expect(startingFigure("PR")).toBe("fema");
    expect(startingFigure("DE")).toBe("uk");
    expect(startingFigure(null)).toBe("uk");
    expect(startingHint("US", "United States")).toBe("Starts on FEMA's figure (Ready.gov), for the United States.");
    expect(startingHint("GB", "United Kingdom")).toBe("Starts on the UK government's figure, for the United Kingdom.");
    expect(startingHint("DE", "Germany")).toBe(
      "Starts on the UK government's figure: it is UK guidance, and Outpost has none from Germany's government. Choose another if it does not fit.",
    );
    expect(startingHint(null, null)).toMatch(
      /^Starts on the UK government's figure: it is UK guidance, and Outpost has none from your country's government/,
    );
    for (const region of ["GB", "US", "DE"]) expect(PLANNING_FIGURES.some((figure) => figure.id === startingFigure(region))).toBe(true);
  });
});

describe("rain from a roof", () => {
  it("is area × rainfall × run-off × filter efficiency, a litre for each millimetre on each square metre", () => {
    expect(rainYieldLitres(1, 1, 1, 1)).toBe(1);
    expect(rainYieldLitres(50, 10, 0.8, 0.9)).toBeCloseTo(360, 9);
  });
});

describe("filter life", () => {
  it("runs to the rated volume, or the label's time limit if that comes first", () => {
    expect(filterLife(1000, 200, 8, null)).toEqual({ daysByVolume: 100, daysByTime: null, days: 100, limit: "volume" });
    expect(filterLife(1000, 0, 8, 60)).toMatchObject({ days: 60, limit: "time" });
    expect(filterLife(1000, 1200, 8, null).days).toBe(0);
  });
});

describe("boiling time", () => {
  it("is one minute low down, three above the EPA's 5,000 ft and the CDC's 6,500 ft", () => {
    expect(boilAdvice(0).minutes).toBe(1);
    expect(boilAdvice(1500).minutes).toBe(1);
    expect(boilAdvice(1600).minutes).toBe(3);
    expect(boilAdvice(1600).why).toContain("EPA");
    expect(boilAdvice(2500).why).toContain("both");
  });
});

describe("the quoted guidance", () => {
  it("keeps the EPA's bleach table exactly as published", () => {
    const six = BLEACH_TABLES.find((table) => table.id === "epa-6")!;
    expect(six.rows.map((row) => `${row.water}: ${row.dose}`)).toEqual([
      "1 quart/liter: 2 drops",
      "1 gallon: 8 drops",
      "2 gallons: 16 drops (1/4 tsp)",
      "4 gallons: 1/3 teaspoon",
      "8 gallons: 2/3 teaspoon",
    ]);
  });

  it("says, cell for cell, that a filter does not remove viruses and chlorine does not kill Cryptosporidium (CDC chart)", () => {
    const method = (id: string) => METHODS.find((item) => item.id === id)!;
    expect(method("filter").viruses).toBe("Not effective");
    expect(method("chlorine").cryptosporidium).toBe("Not effective");
    expect(method("iodine").cryptosporidium).toBe("Not effective");
    expect(method("boil")).toMatchObject({
      bacteria: "Effective",
      viruses: "Effective",
      giardia: "Effective",
      cryptosporidium: "Effective",
    });
  });
});

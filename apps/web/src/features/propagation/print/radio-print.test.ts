/**
 * The radio papers on the print kit: the drawings say what their sources say, the chart
 * draws only the engine's figures, the coverage grid and the list of frequencies carry
 * their words, and each made PDF holds them as text a reader finds.
 *
 * Set OUTPOST_PRINT_SAMPLES to a folder to have each paper written there, to look at.
 */
import fs from "node:fs";
import path from "node:path";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { describe, expect, it } from "vitest";
import { frequenciesPrint } from "@/features/frequencies/print";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { comparisonOf, dayOfPrediction, mapOf, matrixOf, planOf } from "../print-fixtures";
import { comparisonPrint } from "./comparison-print";
import { coveragePrint, gridDrawing } from "./coverage-print";
import { kitUnwritable, kitWritable } from "./glyphs";
import { planPrint } from "./plan-print";
import { predictionPrint } from "./prediction-print";
import { greatCircle, greyLineSketch, nvisDiagram, pathSection, REGIONS, skyWaveDiagram } from "./radio-diagrams";
import { darkSpans, shareLevel, usableFrequencyChart } from "./radio-parts";
import { readPdf } from "./read-pdf";

const words = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]).join(" | ");
const land = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../../../public/world/land.json"), "utf8"));

describe("the drawings of how HF travels", () => {
  it("puts the regions at the Bureau of Meteorology's heights", () => {
    expect(REGIONS.map((region) => [region.id, region.from, region.to])).toEqual([
      ["D", 50, 90],
      ["E", 90, 140],
      ["F1", 140, 210],
      ["F2", 210, 400],
    ]);
    const sky = words(skyWaveDiagram(500).svg);
    for (const label of [
      "D, 50 to 90 km: absorbs, by day only",
      "F2, over 210 km: day and night",
      "skip zone",
      "ground wave",
      "second hop",
    ])
      expect(sky).toContain(label);
    expect(words(nvisDiagram(240).svg)).toContain("comes down all round: no skip zone");
  });

  it("draws the engine's own path: its hops, its virtual height and its take-off angle", () => {
    const { drawing, stretch } = pathSection(500, {
      distanceKm: 2400,
      hops: 2,
      virtualHeightKm: 310,
      takeoffDeg: 9,
      layer: "F2",
      from: "London",
      to: "Lisbon",
    });
    const said = words(drawing.svg);
    expect(said).toContain("F2 at 310 km (virtual height)");
    expect(said).toContain("9° up");
    expect(said).toContain("2400 km, 2 hops of 1200 km");
    // Heights are stretched against distances, and the caption gives by how much.
    expect(stretch).toBeGreaterThan(1);
  });

  it("draws the world with day, night, the Sun and the path", () => {
    const sketch = greyLineSketch(
      500,
      Date.UTC(2026, 10, 16, 13),
      [
        { name: "London", lat: 51.5, lon: -0.13 },
        { name: "Tokyo", lat: 35.7, lon: 139.7 },
      ],
      land,
    );
    expect(words(sketch.svg)).toBe("London | Tokyo");
    // The great circle from London to Tokyo runs north of Moscow's latitude.
    expect(
      Math.max(...greatCircle({ name: "a", lat: 51.5, lon: -0.13 }, { name: "b", lat: 35.7, lon: 139.7 }).map(([, lat]) => lat)),
    ).toBeGreaterThan(60);
  });
});

describe("the usable frequencies chart", () => {
  it("draws the engine's MUF, FOT and LUF, the frequency asked about, and the dark hours mid-path", () => {
    const result = dayOfPrediction();
    const said = words(usableFrequencyChart(result, 500).svg);
    for (const label of ["MUF: open half the days", "FOT: 9 days in 10", "LUF", "14.18 MHz asked", "Sun down mid-path"])
      expect(said).toContain(label);
    // In London in November the Sun is down at midnight and up at noon.
    const dark = darkSpans("2026-11-16", { lat: 53.7, lon: -1.6 });
    expect(dark.some((span) => span.from <= 24 && span.to >= 24)).toBe(true);
    expect(dark.some((span) => span.from <= 12 && span.to >= 12)).toBe(false);
  });

  it("puts a share of days in the coverage map's classes", () => {
    expect([null, 0.05, 0.1, 0.35, 0.55, 0.75, 0.95].map(shareLevel)).toEqual([null, 0, 1, 2, 3, 4, 5]);
  });
});

describe("the radio papers", () => {
  it("print a place in another script as ? and say which letters", () => {
    expect(kitUnwritable(["Łódź", "Москва"]).sort()).toEqual(["М", "а", "в", "к", "о", "с"].sort());
    expect(kitWritable("Ærøskøbing → Москва")).toBe("Ærøskøbing to ??????");
  });

  it("lay the coverage grid out cell by cell, with each cell's class written in it", () => {
    const said = words(gridDrawing(mapOf(), "reliability", 12, 500).svg);
    // Drawn from the south row up (it is placed at the bottom): 55% (class 3) and 5% (class 0), then no answer and no path.
    expect(said).toBe("51.50 | 3 | 0 | 56.50 | x | -");
    const text = contentText(coveragePrint({ result: mapOf(), quantity: "reliability", utcHour: 12, paper: "a4", picture: null }).content);
    expect(text).toContain("London, 7.10 MHz (40 m)");
    expect(text).toContain("The same grid, cell by cell");
    expect(text).toContain("What this map rests on");
  });

  it("set the list of frequencies out on the ITU's dial, kind by kind", () => {
    const entries = RADIO_FREQUENCIES.slice(0, 14);
    const doc = frequenciesPrint({ entries, chosen: "United Kingdom", today: "2026-11-22", written: new Date(Date.UTC(2026, 10, 22)) });
    const text = contentText(doc.content);
    for (const label of [
      "Where they are on the dial",
      "LF",
      "MF",
      "HF",
      "VHF",
      "UHF",
      "Time signals",
      "setting a clock by it",
      "Where each came from",
    ])
      expect(text).toContain(label);
  });

  it("are PDFs whose words a reader finds", async () => {
    const at = new Date(Date.UTC(2026, 10, 16));
    const made = {
      "hf-prediction": await renderPdf(predictionPrint(dayOfPrediction(), "a4", { land })),
      "hf-comparison": await renderPdf(comparisonPrint(dayOfPrediction(), comparisonOf(), "a4")),
      "communication-plan": await renderPdf(planPrint(planOf(), matrixOf(), at, { land })),
      "hf-coverage": await renderPdf(coveragePrint({ result: mapOf(), quantity: "reliability", utcHour: 12, paper: "a4", picture: null })),
      frequencies: await renderPdf(
        frequenciesPrint({ entries: RADIO_FREQUENCIES.slice(0, 14), chosen: "United Kingdom", today: "2026-11-22", written: at }),
      ),
    };
    for (const [name, printed] of Object.entries(made)) writeSample(`${name}-after`, printed.bytes);
    const found = {
      prediction: (await readPdf(made["hf-prediction"].bytes)).text,
      coverage: (await readPdf(made["hf-coverage"].bytes)).text,
      frequencies: (await readPdf(made.frequencies.bytes)).text,
    };
    expect(found.prediction).toContain("Usable frequencies through the day");
    expect(found.prediction).toContain("skip zone");
    expect(found.coverage).toContain("The same grid, cell by cell");
    expect(found.frequencies).toContain("Where they are on the dial");
  });
});

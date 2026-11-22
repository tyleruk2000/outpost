import { computeEffects, type EffectsInput } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { writePdfPages } from "@/features/maps/print/pdf";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { toSheets } from "@/features/propagation/plans/document";
import { scenarioDocument, scenarioTitle, type Written } from "./document";
import { scenarioPrint } from "./print";

const scenario = (letter: Written["letter"], lat: number, lon: number, effects: EffectsInput): Written => {
  const answer = computeEffects(effects);
  if (!answer.ok) throw new Error(answer.problems.join(" "));
  return { letter, scenario: { name: `Scenario ${letter}`, notes: "", lat, lon, effects }, result: answer.result };
};
const plume = scenario("A", 51.5, -0.12, { yieldKt: 300, burst: { kind: "surface" }, wind: { fromDegrees: 250, kmh: 30 } });
const rings = scenario("B", 51.45, -0.3, { yieldKt: 15, burst: { kind: "optimum", psi: 5 }, wind: null });
const dated = Date.UTC(2026, 10, 16);

async function textOf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  let words = "";
  for (let number = 1; number <= pdf.numPages; number += 1)
    words += `${(await (await pdf.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
  return words.replace(/\s+/g, " ");
}

describe("a scenario on paper, laid out with the print kit", () => {
  it("has every figure, the caveat, the reach and decay of the fallout, and where to shelter in UKHSA's words", () => {
    const text = contentText(scenarioPrint({ written: [plume], dated, paper: "a4" }).content);
    expect(text).toContain("An educational estimate from a published model for an idealised case");
    expect(text).toContain("How far each contour reaches");
    for (const contour of plume.result.fallout.drawn ? plume.result.fallout.contours : [])
      expect(text).toContain(`${contour.rate.toLocaleString("en-GB")} rads/h`);
    expect(text).toContain("fall roughly tenfold for every sevenfold increase in time");
    expect(text).toContain("about a tenth");
    expect(text).toContain("Vehicles and tents do not provide sufficient shelter from significant radiation.");
    expect(text).toContain("being inside any building is better than being outside");
    expect(text).toContain("The best protection");
    expect(text).toContain("No casualty figures are given.");
    // No figure the workspace does not cite: no protection factor, no arrival time.
    expect(text).not.toMatch(/protection factor|arriv/i);
  });

  it("gives several scenarios each a section under its letter, and says nothing is added up", () => {
    const text = contentText(scenarioPrint({ written: [plume, rings], dated, paper: "letter" }).content);
    expect(text).toContain("Nothing is added up across them");
    expect(text).toContain("Scenario A");
    expect(text).toContain("Scenario B");
    expect(text).not.toMatch(/total|combined|altogether|casualt(?!y figures are given)/i);
  });

  it("is a PDF a reader can search, the same each time it is made", async () => {
    for (const [name, written, paper] of [
      ["nuclear-one", [plume], "a4"],
      ["nuclear-two", [plume, rings], "letter"],
    ] as const) {
      const printed = await renderPdf(scenarioPrint({ written: [...written], dated, paper }));
      const again = await renderPdf(scenarioPrint({ written: [...written], dated, paper }));
      expect(Buffer.from(again.bytes).equals(Buffer.from(printed.bytes))).toBe(true);
      const words = await textOf(printed.bytes);
      expect(words).toContain(scenarioTitle([...written]).slice(0, 30));
      expect(words).toContain("Where to shelter");
      writeSample(name, printed.bytes);
    }
    // The paper as it was before the kit, for comparison.
    if (process.env.OUTPOST_PRINT_SAMPLES)
      writeSample(
        "nuclear-before",
        writePdfPages({
          pages: toSheets(scenarioDocument([plume]), scenarioTitle([plume]), "a4"),
          title: "before",
          created: new Date(dated),
        }),
      );
  }, 60_000);
});

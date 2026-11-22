import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { workedExample } from "./form";
import { formDocument } from "./print";

describe("the printed sight form", () => {
  it("has every step to fill in, the formulas, and the example plotted with its own figures", () => {
    const text = contentText(formDocument("a4").content);
    for (const words of ["Sextant altitude Hs", "Observed altitude Ho", "Intercept Ho − Hc (towards +, away −)", "Sin Hc = sin lat"])
      expect(text).toContain(words);
    expect(text).toContain("Not for navigating a vessel");
    const { reduction } = workedExample();
    expect(text).toContain(`Intercept ${Math.abs(reduction.intercept).toFixed(1)} miles towards`);
    expect(text).toContain(`along Zn ${reduction.zn.toFixed(1)}°`);
    expect(text).toContain("Line of position");
    expect(text).toContain("Where the observer was");
    // The typeface has no minute mark: none is left to print as a gap.
    expect(text).not.toMatch(/[′″]/);
  });

  it("is a PDF a reader can search, the same each time it is made", async () => {
    for (const paper of ["a4", "letter"] as const) {
      const printed = await renderPdf(formDocument(paper));
      const again = await renderPdf(formDocument(paper));
      expect(Buffer.from(again.bytes).equals(Buffer.from(printed.bytes))).toBe(true);
      const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
      let words = "";
      for (let number = 1; number <= pdf.numPages; number += 1)
        words += `${(await (await pdf.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
      expect(words).toContain("Sextant altitude Hs");
      expect(words).toContain("Line of position");
      writeSample(`celnav-${paper}`, printed.bytes);
    }
  }, 60_000);
});

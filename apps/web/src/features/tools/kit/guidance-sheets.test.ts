import { personNeed, type RationPerson, shareByNeed } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { safetyDocument } from "../cooking/safety-sheet";
import { rationDocument } from "../rations/sheet";
import { purificationDocument } from "../water/purification-sheet";

/** Makes the sheet twice on both papers: the same bytes each time, and its words found in the PDF. Answers the A4 one's words. */
async function made(name: string, make: (paper: "a4" | "letter") => TDocumentDefinitions, expected: string[]): Promise<string> {
  let first = "";
  for (const paper of ["a4", "letter"] as const) {
    const printed = await renderPdf(make(paper));
    const again = await renderPdf(make(paper));
    expect(Buffer.from(again.bytes).equals(Buffer.from(printed.bytes))).toBe(true);
    const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
    expect(pdf.numPages).toBe(printed.pages);
    let words = "";
    for (let number = 1; number <= pdf.numPages; number += 1)
      words += `${(await (await pdf.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
    for (const expectedWords of expected) expect(words.replace(/\s+/g, " ")).toContain(expectedWords);
    writeSample(`${name}-${paper}`, printed.bytes);
    if (!first) first = words;
  }
  return first;
}

describe("the water sheet", () => {
  it("quotes the guidance, the CDC chart cell for cell, and draws the boiling", () => {
    const text = contentText(purificationDocument("a4").content);
    expect(text).toContain("What none of these makes safe");
    expect(text).toContain("You cannot make water containing fuel, toxic chemicals, or radioactive materials safe");
    expect(text).toContain("Chlorine (bleach or tablets) Effective Effective Somewhat effective Not effective");
    expect(text).toContain("1 Rolling boil");
    expect(text).toContain("16 drops (1/4 tsp)");
    expect(text).toContain("Double the amount of bleach if the water is cloudy, colored, or very cold.");
    expect(text).toContain("https://www.epa.gov/ground-water-and-drinking-water/emergency-disinfection-drinking-water");
  });

  it("is a PDF a reader can search", async () => {
    await made("water", purificationDocument, ["Making water safe to drink", "Cryptosporidium", "rolling boil"]);
  }, 60_000);
});

describe("the cooking sheet", () => {
  it("quotes the FSA and FSS and draws their temperatures on one scale", () => {
    const text = contentText(safetyDocument("a4").content);
    expect(text).toContain("The Danger Zone: between 8 - 63°C (FSA)");
    expect(text).toContain("75°C or above in the thickest part of a bird (FSS)");
    for (const words of ["60°C for 45 minutes", "70°C for 2 minutes", "80°C for 6 seconds"]) expect(text).toContain(words);
    expect(text).toContain("Burgers shouldn't be served rare or pink at home.");
    expect(text).toContain("The cooking guidelines above are only estimates");
    expect(text).toContain("Moderately hot");
  });

  it("is a PDF a reader can search", async () => {
    await made("cooking", safetyDocument, ["Safe cooking temperatures", "The Danger Zone", "Gas mark"]);
  }, 60_000);
});

const person = (over: Partial<RationPerson>): RationPerson => ({
  id: over.name ?? "x",
  name: "",
  age: 40,
  sex: "female",
  pregnant: false,
  breastfeeding: false,
  ill: false,
  ownKcal: null,
  ...over,
});

const household = [
  person({ name: "Sam", age: 42, sex: "male" }),
  person({ name: "Alex", age: 39, pregnant: true }),
  person({ name: "Robin", age: 8 }),
  person({ name: "Gran", age: 78 }),
].map((one) => personNeed(one, "uk", null));

const rations = (storeKcal: number) => (paper: "a4" | "letter") =>
  rationDocument({
    title: "Rations: sharing 80,000 kcal over 10 days",
    needs: household,
    shared: shareByNeed(storeKcal, 10, household),
    whoNot:
      "Children, older people, women who are pregnant or breastfeeding, and anyone who is ill should not be put on a reduced ration by a calculator.",
    days: 10,
    storeKcal,
    made: new Date("2026-11-21T00:00:00Z"),
    paper,
  });

describe("the rations sheet", () => {
  it("draws each share against its need, and says who is kept on full", () => {
    const text = contentText(rations(80000)("a4").content);
    expect(text).toContain("Who must not be put on a reduced ration by a calculator");
    expect(text).toContain("kept on full");
    expect(text).toMatch(/Sam .*of their need/);
    expect(text).toContain("Less than their need");
    expect(text).toContain("8,000 kcal a day from it");
    // Enough for everyone: no warning.
    expect(contentText(rations(400000)("a4").content)).toContain("The stock gives everyone their whole need");
  });

  it("is a PDF a reader can search", async () => {
    await made("rations", rations(80000), ["Rations: sharing", "Gran", "of their need"]);
  }, 60_000);
});

import { newPowerPlan, type PowerPlanInput } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { workOut } from "./calc/plan";
import { planDocument } from "./document";

/** A plan with every part: solar, a charger, DC, USB and AC loads, a cable rating. */
function fullPlan(): PowerPlanInput {
  const plan = newPowerPlan("Shack");
  return {
    ...plan,
    notes: "Check the fuses each spring.",
    battery: { ...plan.battery, ampHours: 200, maxDischargeA: 100, maxChargeA: 50 },
    loads: [
      { id: "pi", kind: "device", name: "Raspberry Pi", supply: "dc", quantity: 1, startHour: 0, watts: 15, hoursPerDay: 24 },
      {
        id: "hf",
        kind: "radio",
        name: "HF radio",
        supply: "dc",
        quantity: 1,
        startHour: 18,
        transmitW: 100,
        receiveW: 4,
        standbyW: 1,
        onAirHours: 2,
        standbyHours: 4,
        transmitShare: 0.5,
        modeFactor: 0.2,
        mode: "ssb",
      },
      {
        id: "phone",
        kind: "charge",
        name: "Phone",
        supply: "usb",
        quantity: 2,
        startHour: 20,
        wattHours: 15,
        chargesPerDay: 1,
        chargeEfficiency: 0.8,
        chargeHours: 2,
      },
      { id: "fridge", kind: "device", name: "Fridge", supply: "ac", quantity: 1, startHour: 0, watts: 60, hoursPerDay: 8 },
    ],
    solar: {
      ...plan.solar,
      arrayWatts: 400,
      sunHours: [0.8, 1.5, 2.6, 3.9, 4.8, 5.1, 5, 4.2, 3, 1.8, 1, 0.6],
      sunHoursSource: null,
    },
    charger: { enabled: true, name: "Generator", watts: 300, hoursPerDay: 2, startHour: 18 },
    cableRatingA: 80,
  };
}

const written = new Date(Date.UTC(2026, 10, 16));

const documentOf = (plan: PowerPlanInput, paper: "a4" | "letter" = "a4") => planDocument({ plan, answers: workOut(plan), written, paper });

describe("the power plan PDF", () => {
  it("draws the plan's own parts wired, with a fuse at the battery end of each cable and its current", () => {
    const text = contentText(documentOf(fullPlan()).content);
    for (const words of [
      "Solar panels",
      "400 W",
      "Charge controller",
      "MPPT, 95%",
      "Generator",
      "Battery",
      "12.8 V, 200 Ah",
      "LiFePO4",
      "DC loads",
      "USB converter",
      "Inverter",
      "AC loads",
      "Fridge",
    ])
      expect(text).toContain(words);
    expect(text).toContain("Fuse or breaker, at the battery end");
    // 400 W through a 95% controller at 12.8 V.
    expect(text).toContain("29.7 A");
    expect(text).toContain("33 CFR 183.455");
    // The cable typed in as 80 A, under 50 V: 150% of it.
    expect(text).toContain("at most 120 A");
  });

  it("leaves out what the plan does not have", () => {
    const plan = {
      ...fullPlan(),
      loads: fullPlan().loads.filter((load) => load.supply === "dc"),
      charger: { ...fullPlan().charger, enabled: false },
    };
    const text = contentText(documentOf(plan).content);
    expect(text).not.toContain("Inverter");
    expect(text).not.toContain("USB converter");
    expect(text).not.toContain("Generator");
  });

  it("has the answers, the charts, every assumption and the estimate warning", () => {
    const text = contentText(documentOf(fullPlan()).content);
    expect(text).toContain("Power plan: Shack");
    expect(text).toContain("Real batteries deliver less when cold");
    expect(text).toContain("A day in December, hour by hour");
    expect(text).toContain("Taken by the loads");
    expect(text).toContain("Usable limit 20%");
    expect(text).toContain("Assumptions");
    expect(text).toContain("HF radio: 100 W transmitting");
    expect(text).toContain("Check the fuses each spring.");
    expect(text).toContain("Over a limit");
  });

  it("is a PDF a reader can search, the same each time it is made", async () => {
    for (const paper of ["a4", "letter"] as const) {
      const printed = await renderPdf(documentOf(fullPlan(), paper));
      const again = await renderPdf(documentOf(fullPlan(), paper));
      expect(Buffer.from(again.bytes).equals(Buffer.from(printed.bytes))).toBe(true);
      const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
      expect(pdf.numPages).toBe(printed.pages);
      let words = "";
      for (let number = 1; number <= pdf.numPages; number += 1)
        words += `${(await (await pdf.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
      expect(words).toContain("Power plan: Shack");
      expect(words).toContain("Charge controller");
      writeSample(`power-plan-${paper}`, printed.bytes);
    }
  }, 60_000);
});

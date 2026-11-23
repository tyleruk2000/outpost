import { newPowerPlan } from "@outpost/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bankDrawing, bankLayout } from "./bank-diagram";
import { BankDiagram } from "./bank-diagram-view";

describe("the battery bank drawn", () => {
  it("1S1P: one battery, its terminals the bank's", () => {
    const layout = bankLayout(12.8, 100, 1, 1);
    expect(layout.summary).toBe("1 battery: 12.8 V, 100 Ah, 1.28 kWh");
    expect(layout.alt).toBe(
      "Battery bank, 1 battery: 12.8 V, 100 Ah, 1.28 kWh. One battery, 12.8 V, 100 Ah; its terminals are the bank's.",
    );
    expect(layout.cells).toHaveLength(1);
    expect(layout.wires.filter((wire) => wire.pole === "+")).toHaveLength(1);
  });

  it("4S1P: one string, + to − between each pair", () => {
    const layout = bankLayout(12, 100, 4, 1);
    expect(layout.summary).toBe("4 in series: 48 V, 100 Ah, 4.8 kWh");
    expect(layout.alt).toContain("4 batteries, each 12 V, 100 Ah, joined in one string, the + of each to the − of the next");
    expect(layout.cells).toHaveLength(4);
    // Three links within the string, and one wire to each bank terminal.
    expect(layout.wires).toHaveLength(5);
  });

  it("1S2P: two batteries side by side, + to + and − to −", () => {
    const layout = bankLayout(12.8, 100, 1, 2);
    expect(layout.summary).toBe("2 in parallel: 12.8 V, 200 Ah, 2.56 kWh");
    expect(layout.alt).toContain("2 batteries, each 12.8 V, 100 Ah, joined + to + and − to −");
    expect(layout.cells).toHaveLength(2);
    expect(layout.wires.filter((wire) => wire.pole === "-")).toHaveLength(2);
  });

  it("2S2P: two strings of two", () => {
    const layout = bankLayout(12, 100, 2, 2);
    expect(layout.summary).toBe("2 in series × 2 in parallel: 24 V, 200 Ah, 4.8 kWh");
    expect(layout.alt).toContain("2 strings of 2 batteries, 4 in all");
    expect(layout.cells).toHaveLength(4);
    expect(layout.compact).toBe(false);
  });

  it("draws a big bank as one box named for its shape, with a note", () => {
    const layout = bankLayout(3.2, 280, 16, 2);
    expect(layout.compact).toBe(true);
    expect(layout.cells).toHaveLength(1);
    expect(layout.cells[0]!.lines[0]).toBe("16S2P");
    expect(layout.note).toMatch(/^16S2P: too many to draw one by one/);
    expect(layout.summary).toBe("16 in series × 2 in parallel: 51.2 V, 560 Ah, 28.67 kWh");
  });

  it("is an image whose text alternative says the whole bank, on the screen and for print", () => {
    render(<BankDiagram volts={12} ampHours={100} series={2} parallel={2} />);
    const image = screen.getByRole("img");
    expect(image).toHaveAccessibleName(/^Battery bank, 2 in series × 2 in parallel: 24 V, 200 Ah, 4.8 kWh\. 2 strings of 2 batteries/);
    expect(screen.getByText("2 in series × 2 in parallel: 24 V, 200 Ah, 4.8 kWh.")).toBeInTheDocument();
    const printed = bankDrawing(12, 100, 2, 2);
    expect(printed.svg).toContain("Bank +");
    expect(printed.svg.match(/<rect [^>]*rx="4"/g)).toHaveLength(4);
  });
});

describe("a new power plan", () => {
  it("starts with no charging source: no panels, no sun hours, no generator, no loads", () => {
    const plan = newPowerPlan("New");
    expect(plan.solar.arrayWatts).toBe(0);
    expect(plan.solar.sunHours).toEqual(Array.from({ length: 12 }, () => null));
    expect(plan.solar.sunHoursSource).toBeNull();
    expect(plan.charger).toMatchObject({ enabled: false, watts: 0, hoursPerDay: 0 });
    expect(plan.loads).toEqual([]);
    // What is not a source keeps a starting figure.
    expect(plan.battery).toMatchObject({ chemistry: "lifepo4", volts: 12.8, series: 1, parallel: 1 });
  });
});

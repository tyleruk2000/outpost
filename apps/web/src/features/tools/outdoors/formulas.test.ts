import { describe, expect, it } from "vitest";
import { gradient, heatIndexCategory, heatIndexF, kcalFromMet, naismithMinutes, windChill } from "./formulas";
import { windChillRisk } from "./sources";
import { tranterMinutes } from "./tranter";

describe("Naismith's rule", () => {
  it("is 5 km an hour and a minute for every 10 m climbed (Adventure Activities Licensing Regulations 2004, reg. 2)", () => {
    expect(naismithMinutes(5000, 0).total).toBeCloseTo(60, 9);
    expect(naismithMinutes(0, 600).total).toBeCloseTo(60, 9);
    expect(naismithMinutes(12_000, 600).total).toBeCloseTo(144 + 60, 9);
  });

  it("takes Langmuir's corrections for descent: −10 minutes a 300 m gentle, +10 a 300 m steep", () => {
    const time = naismithMinutes(10_000, 600, 300, 600);
    expect(time.descent).toBeCloseTo(-10 + 20, 9);
    expect(time.total).toBeCloseTo(120 + 60 + 10, 9);
  });
});

describe("Tranter's corrections", () => {
  it("read the table's own example: 9 hours by Naismith at a fitness of 25 minutes is 11.5 hours", () => {
    expect(tranterMinutes(9 * 60, "25")).toEqual({ ok: true, minutes: 11.5 * 60 });
  });

  it("read between columns on a straight line", () => {
    // Fitness 15: 2 h gives 1 h, 3 h gives 1.5 h.
    expect(tranterMinutes(150, "15")).toEqual({ ok: true, minutes: 75 });
  });

  it("refuse below the table's first column and beyond the last figure of a row", () => {
    expect(tranterMinutes(90, "25").ok).toBe(false);
    expect(tranterMinutes(10 * 60, "50").ok).toBe(false);
  });
});

describe("gradient", () => {
  it("is rise over horizontal distance", () => {
    const g = gradient(150, 1000);
    expect(g.percent).toBeCloseTo(15, 9);
    expect(g.degrees).toBeCloseTo(8.531, 3);
    expect(g.oneIn).toBeCloseTo(6.667, 3);
    expect(gradient(0, 100).oneIn).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("wind chill", () => {
  it("matches Environment Canada's worked examples", () => {
    const chill = (t: number, v: number) => {
      const result = windChill(t, v);
      return result.ok ? Math.round(result.value) : null;
    };
    expect(chill(-15, 20)).toBe(-24);
    expect(chill(-20, 30)).toBe(-33);
    expect(chill(-30, 40)).toBe(-48);
  });

  it("matches the NWS's: 0 °F in a 15 mph wind is −19 °F", () => {
    const result = windChill(((0 - 32) * 5) / 9, 15 * 1.609344);
    expect(result.ok && Math.round((result.value * 9) / 5 + 32)).toBe(-19);
  });

  it("refuses outside the NWS's range", () => {
    expect(windChill(12, 20).ok).toBe(false);
    expect(windChill(-5, 3).ok).toBe(false);
  });

  it("gives Environment Canada's words for each band", () => {
    expect(windChillRisk(3)).toBeNull();
    expect(windChillRisk(-24)).toBe("risk of hypothermia and frostbite if outdoors for long periods");
    expect(windChillRisk(-33)).toBe("any exposed skin can freeze in 10 to 30 minutes");
    expect(windChillRisk(-60)).toContain("less than 2 minutes");
  });
});

describe("heat index", () => {
  it("gives the NWS chart's values", () => {
    const at = (t: number, rh: number) => {
      const result = heatIndexF(t, rh);
      return result.ok ? Math.round(result.value) : null;
    };
    expect(at(90, 60)).toBe(100);
    expect(at(90, 70)).toBe(106);
    expect(at(100, 40)).toBe(109);
  });

  it("applies the NWS's adjustments for very dry and very humid air", () => {
    const dry = heatIndexF(100, 10);
    const humid = heatIndexF(82, 95);
    expect(dry.ok && humid.ok).toBe(true);
    // The adjustment for dry air is subtracted, for humid air added.
    expect(dry.ok && dry.value).toBeLessThan(96);
  });

  it("refuses outside 80 °F to 110 °F", () => {
    expect(heatIndexF(75, 50).ok).toBe(false);
    expect(heatIndexF(115, 50).ok).toBe(false);
  });

  it("names the NWS's categories", () => {
    expect(heatIndexCategory(85)).toBe("Caution");
    expect(heatIndexCategory(100)).toBe("Extreme caution");
    expect(heatIndexCategory(110)).toBe("Danger");
    expect(heatIndexCategory(130)).toBe("Extreme danger");
  });
});

describe("energy", () => {
  it("is MET × kg × hours", () => {
    expect(kcalFromMet(6, 75, 4)).toBe(1800);
  });
});

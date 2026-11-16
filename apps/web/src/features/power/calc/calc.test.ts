/**
 * Each formula against a worked example from its source, or one worked by hand from the
 * formula the source gives (the arithmetic is written in the test).
 */
import { newPowerPlan, type PowerPlanInput, PVWATTS_LOSSES, RADIO_MODES } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  decodeBands,
  E24,
  encodeBands,
  ledResistor,
  ohmsLaw,
  parallelResistance,
  preferredValue,
  seriesResistance,
  voltageDivider,
} from "./electrical";
import {
  bank,
  chargeTime,
  combinedLoss,
  controllerFactor,
  fuelCurve,
  litresPerHourAt,
  oneWay,
  runtime,
  solarDailyWh,
  temperatureFactor,
} from "./energy";
import { assumptions, demandByHour, loadDailyWh, radioDuty, SUN_SHAPE, simulate, workOut } from "./plan";
import { areaForDrop, awgAreaMm2, awgDiameterMm, cfrLimit, copperResistivity, gaugeForArea, nextSizes, voltageDrop } from "./wire";

describe("Ohm's law", () => {
  it("gives all four from any two", () => {
    expect(ohmsLaw({ volts: 12, amps: 2, ohms: null, watts: null })).toEqual({ volts: 12, amps: 2, ohms: 6, watts: 24 });
    expect(ohmsLaw({ volts: null, amps: null, ohms: 6, watts: 24 })).toEqual({ volts: 12, amps: 2, ohms: 6, watts: 24 });
    expect(ohmsLaw({ volts: 12, amps: null, ohms: null, watts: 24 })).toMatchObject({ amps: 2, ohms: 6 });
    expect(ohmsLaw({ volts: 12, amps: null, ohms: null, watts: null })).toBeNull();
    expect(ohmsLaw({ volts: 12, amps: null, ohms: 0, watts: null })).toBeNull();
  });
});

describe("resistor colour code (IEC 60062)", () => {
  it("reads four and five bands", () => {
    // Yellow, violet, red, gold: 47 × 10² Ω, ±5%.
    expect(decodeBands(["yellow", "violet"], "red", "gold")).toEqual({ ohms: 4700, tolerance: 5 });
    // Brown, black, black, brown, brown: 100 × 10¹ Ω, ±1%.
    expect(decodeBands(["brown", "black", "black"], "brown", "brown")).toEqual({ ohms: 1000, tolerance: 1 });
    // Gold as a multiplier: 4.7 Ω.
    expect(decodeBands(["yellow", "violet"], "gold", "gold")?.ohms).toBe(4.7);
  });
  it("writes a value as bands", () => {
    expect(encodeBands(4700, 2)).toEqual({ digits: ["yellow", "violet"], multiplier: "red" });
    expect(encodeBands(1000, 3)).toEqual({ digits: ["brown", "black", "black"], multiplier: "brown" });
    expect(encodeBands(0.47, 2)).toEqual({ digits: ["yellow", "violet"], multiplier: "silver" });
    expect(encodeBands(-1, 2)).toBeNull();
  });
  it("finds the preferred value (IEC 60063)", () => {
    expect(preferredValue(455, E24, "up")).toBe(470);
    expect(preferredValue(500, E24, "up")).toBe(510);
    expect(preferredValue(470, E24, "up")).toBe(470);
    expect(preferredValue(95, E24, "up")).toBe(100);
    expect(preferredValue(500, E24, "down")).toBe(470);
  });
});

describe("resistor circuits", () => {
  it("adds in series and in parallel", () => {
    expect(seriesResistance([100, 220, 330])).toBe(650);
    expect(parallelResistance([100, 100])).toBe(50);
    expect(parallelResistance([1000, 1000, 1000])).toBeCloseTo(333.33, 2);
    expect(parallelResistance([])).toBeNull();
  });
  it("sizes an LED's resistor", () => {
    // (12 − 2) V ÷ 20 mA = 500 Ω; the next E24 value up is 510 Ω, giving 19.6 mA and 0.196 W.
    const led = ledResistor(12, 2, 1, 0.02)!;
    expect(led.exactOhms).toBeCloseTo(500, 6);
    expect(led.chosenOhms).toBe(510);
    expect(led.chosenAmps).toBeCloseTo(0.01961, 5);
    expect(led.watts).toBeCloseTo(0.1961, 4);
    expect(ledResistor(5, 3, 2, 0.02)).toBeNull();
  });
  it("divides a voltage, with and without a load", () => {
    expect(voltageDivider(12, 10_000, 10_000)).toEqual({ vout: 6, amps: 0.0006 });
    // A 10 kΩ load across the lower 10 kΩ makes it 5 kΩ: 12 × 5 / 15 = 4 V.
    expect(voltageDivider(12, 10_000, 10_000, 10_000)!.vout).toBeCloseTo(4, 9);
  });
});

describe("cable (IEC 60028, ASTM B258, 33 CFR 183.425)", () => {
  it("gives gauge sizes as ASTM B258 tabulates them", () => {
    expect(awgDiameterMm(10)).toBeCloseTo(2.588, 3);
    expect(awgAreaMm2(10)).toBeCloseTo(5.261, 3);
    expect(awgDiameterMm(-3)).toBeCloseTo(11.684, 3);
    expect(awgAreaMm2(-3)).toBeCloseTo(107.2, 1);
    expect(awgAreaMm2(14)).toBeCloseTo(2.081, 3);
  });
  it("gives copper's resistance at 20 °C and when warm", () => {
    // 10 AWG at 20 °C: 0.017241 / 5.261 = 3.277 Ω per km, as gauge tables give.
    expect((copperResistivity(20) / awgAreaMm2(10)) * 1000).toBeCloseTo(3.277, 3);
    expect(copperResistivity(70)).toBeCloseTo(0.017241 * (1 + 0.00393 * 50), 6);
  });
  it("works out the drop over a run, out and back", () => {
    // 5 m each way of 2.5 mm² at 20 °C: 0.017241 × 10 / 2.5 = 0.06897 Ω; 10 A loses 0.690 V, 5.75% of 12 V.
    const drop = voltageDrop(12, 10, 5, 2.5)!;
    expect(drop.ohms).toBeCloseTo(0.06897, 5);
    expect(drop.volts).toBeCloseTo(0.6897, 4);
    expect(drop.percent).toBeCloseTo(5.747, 3);
    expect(drop.watts).toBeCloseTo(6.897, 3);
    // The area that keeps it to 3%: 0.017241 × 10 × 10 / 0.36 = 4.789 mm², so 6 mm² or 10 AWG.
    expect(areaForDrop(12, 10, 5, 3)).toBeCloseTo(4.789, 3);
    expect(nextSizes(4.789)).toMatchObject({ metric: 6, awg: { label: "10 AWG" } });
  });
  it("reads table 5 of 33 CFR 183.425 with its notes", () => {
    expect(cfrLimit(10, 105, { engineSpace: false, bundled: 1 })?.amps).toBe(60);
    expect(cfrLimit(10, 105, { engineSpace: true, bundled: 1 })?.amps).toBeCloseTo(51, 6);
    expect(cfrLimit(10, 105, { engineSpace: true, bundled: 3 })?.amps).toBeCloseTo(35.7, 6);
    expect(cfrLimit(-3, 60, { engineSpace: false, bundled: 30 })?.amps).toBe(120);
    expect(cfrLimit(20, 60, { engineSpace: false, bundled: 1 })).toBeNull();
  });
  it("reads a metric cable as the largest gauge with no more copper than it", () => {
    expect(gaugeForArea(2.5)?.label).toBe("14 AWG");
    expect(gaugeForArea(6)?.label).toBe("10 AWG");
    expect(gaugeForArea(0.5)).toBeNull();
  });
});

describe("batteries", () => {
  it("adds voltage in series and capacity in parallel", () => {
    expect(bank(3.2, 100, 4, 1)).toEqual({ volts: 12.8, ampHours: 100, wattHours: 1280, batteries: 4 });
    expect(bank(12.8, 100, 2, 2)).toEqual({ volts: 25.6, ampHours: 200, wattHours: 5120, batteries: 4 });
  });
  it("gives the runtime of a steady load", () => {
    // 1280 Wh × 80% = 1024 Wh; at 50 W, 20.48 h; 50 W ÷ 12.8 V = 3.9 A, 0.039 C.
    const run = runtime(1280, 12.8, 50, 0.8, 1)!;
    expect(run.hours).toBeCloseTo(20.48, 6);
    expect(run.amps).toBeCloseTo(3.906, 3);
    expect(run.cRate).toBeCloseTo(0.0391, 4);
  });
  it("splits a round trip evenly, as HOMER's worked example does", () => {
    // HOMER: at 80% round trip, 100 kWh put in raises the store by 89.4 kWh and gives 80 kWh back.
    expect(100 * oneWay(0.8)).toBeCloseTo(89.4, 1);
    expect(100 * oneWay(0.8) * oneWay(0.8)).toBeCloseTo(80, 9);
  });
});

describe("solar (PVWatts)", () => {
  it("combines PVWatts' default losses into 14.08%", () => {
    expect(combinedLoss(Object.values(PVWATTS_LOSSES)) * 100).toBeCloseTo(14.08, 2);
  });
  it("gives a day's output and a time to charge", () => {
    // 100 W × 2 h × (1 − 0.1408) × 0.95 = 163.2 Wh.
    expect(solarDailyWh(100, 2, 0.1408, 0.95)).toBeCloseTo(163.25, 2);
    expect(temperatureFactor(45)).toBeCloseTo(0.906, 6);
    expect(controllerFactor("pwm", 0.95, 13.6, 18)).toBeCloseTo(0.7556, 4);
    expect(controllerFactor("mppt", 0.95, 13.6, 18)).toBe(0.95);
    // 512 Wh to put back at 81% round trip needs 512 / 0.9 = 568.9 Wh: at 200 Wh a day, 2.84 days.
    const time = chargeTime(512, 200, 0.81);
    expect(time.neededWh).toBeCloseTo(568.9, 1);
    expect(time.days).toBeCloseTo(2.844, 3);
    expect(chargeTime(512, 200, 0.81, 250).days).toBeNull();
  });
});

describe("generator fuel (HOMER's fuel curve)", () => {
  it("draws the line through two figures, matching HOMER's worked example", () => {
    // HOMER: 50 kW; 8.48 L/h at 25 kW and 15.3 L/h at 50 kW; slope 0.273 L/h per kW, intercept 0.033 L/h per kW rated.
    const curve = fuelCurve({ load: 1, litresPerHour: 15.3 }, { load: 0.5, litresPerHour: 8.48 })!;
    expect(curve.basis).toBe("two-points");
    expect(curve.slope / 50).toBeCloseTo(0.273, 3);
    expect(curve.intercept / 50).toBeCloseTo(0.033, 3);
  });
  it("estimates from one figure with the example's shape, and says so", () => {
    const curve = fuelCurve({ load: 1, litresPerHour: 1 }, null)!;
    expect(curve.basis).toBe("estimated");
    expect(litresPerHourAt(curve, 1)).toBeCloseTo(1, 9);
    expect(litresPerHourAt(curve, 0.5)).toBeCloseTo(8.48 / 15.3, 3);
  });
});

describe("a power plan", () => {
  const plan = (): PowerPlanInput => ({
    ...newPowerPlan("Test"),
    loads: [
      { id: "pi", kind: "device", name: "Raspberry Pi", supply: "dc", quantity: 1, startHour: 0, watts: 15.3, hoursPerDay: 24 },
      {
        id: "hf",
        kind: "radio",
        name: "HF",
        supply: "dc",
        quantity: 1,
        startHour: 18,
        transmitW: 20,
        receiveW: 4,
        standbyW: 1,
        onAirHours: 2,
        standbyHours: 4,
        transmitShare: 0.5,
        modeFactor: 0.2,
        mode: "ssb",
      },
    ],
  });

  it("works out a radio's duty cycle from the mode's starting points", () => {
    expect(radioDuty(RADIO_MODES.find((mode) => mode.id === "ft8")!)).toBeCloseTo(0.4213, 4);
    // 0.1 × 20 W + 0.9 × 4 W = 5.6 W for 2 h, and 1 W for 4 h: 15.2 Wh.
    expect(loadDailyWh(plan().loads[1]!)).toBeCloseTo(15.2, 9);
  });

  it("gives the day's use, the runtime and the days of autonomy", () => {
    const answers = workOut(plan());
    // 15.3 × 24 + 15.2 = 382.4 Wh. 1280 Wh × 0.8 × √0.92 = 982.19 Wh delivered.
    expect(answers.dailyUseWh).toBeCloseTo(382.4, 6);
    expect(answers.bank.deliveredWh).toBeCloseTo(982.19, 2);
    expect(answers.daysOfAutonomy).toBeCloseTo(2.5685, 3);
    expect(answers.runtimeHours).toBeCloseTo(61.64, 2);
    expect(answers.worstMonth).toBeNull();
    // Peak: 15.3 + 20 W at 12.8 V = 2.76 A; no limit given, so nothing is checked.
    expect(answers.peak.dischargeA).toBeCloseTo(2.758, 3);
    expect(answers.peak.battery).toEqual({ limit: null, over: null });
  });

  it("counts the inverter's losses and its idle draw for AC loads", () => {
    const withAc: PowerPlanInput = {
      ...plan(),
      loads: [{ id: "laptop", kind: "device", name: "Laptop", supply: "ac", quantity: 1, startHour: 9, watts: 44, hoursPerDay: 2 }],
      inverter: { efficiency: 0.88, idleW: 8, hoursOn: 3 },
    };
    const answers = workOut(withAc);
    // 88 Wh ÷ 0.88 = 100 Wh, and 8 W × 3 h = 24 Wh.
    expect(answers.acWh).toBeCloseTo(100, 9);
    expect(answers.inverterIdleWh).toBe(24);
    expect(answers.dailyUseWh).toBeCloseTo(124, 9);
    expect(demandByHour(withAc).reduce((sum, value) => sum + value, 0)).toBeCloseTo(124, 9);
  });

  it("finds the worst month, the solar to break even, and when the battery runs down", () => {
    const sunny: PowerPlanInput = {
      ...plan(),
      solar: { ...plan().solar, arrayWatts: 200, sunHours: [0.6, 1.2, 2.2, 3.4, 4.3, 4.6, 4.5, 3.8, 2.7, 1.6, 0.8, 0.5] },
    };
    const answers = workOut(sunny);
    expect(answers.worstMonth).toBe(11);
    // 382.4 ÷ (1 W × 0.5 h × (1 − 0.1408) × 0.95 × 0.92) = 1018.5 W.
    expect(answers.breakEvenArrayW).toBeCloseTo(382.4 / (0.5 * (1 - combinedLoss(Object.values(PVWATTS_LOSSES))) * 0.95 * 0.92), 6);
    expect(answers.months[11]!.emptyOnDay).not.toBeNull();
    expect(answers.months[5]!.emptyOnDay).toBeNull();
    expect(answers.months[5]!.solarWh).toBeCloseTo(200 * 4.6 * (1 - answers.loss) * 0.95, 6);
  });

  it("runs the battery down hour by hour and stops at its usable limit", () => {
    const run = simulate(plan(), null, 4);
    expect(run.soc).toHaveLength(96);
    expect(run.soc[0]).toBeLessThan(1);
    expect(Math.min(...run.soc)).toBeCloseTo(0.2, 9);
    expect(run.shortWh).toBeGreaterThan(0);
    expect(SUN_SHAPE.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it("checks the peak current against the limits typed in", () => {
    const limited: PowerPlanInput = { ...plan(), cableRatingA: 2, battery: { ...plan().battery, maxDischargeA: 100 } };
    const answers = workOut(limited);
    expect(answers.peak.cable).toEqual({ limit: 2, over: true });
    expect(answers.peak.battery).toEqual({ limit: 100, over: false });
  });

  it("lists every assumption, and says real batteries give less", () => {
    const lines = assumptions(plan(), workOut(plan()));
    expect(lines.join(" ")).toContain("cold");
    expect(lines.some((line) => line.startsWith("HF:") && line.includes("Duty cycle 10.0%"))).toBe(true);
  });
});

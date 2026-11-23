/**
 * The library of common devices, checked as data: every figure has a source with a URL
 * and the date it was read, the quantity as published turns into the figure used
 * (watts = volts × amps, watt-hours = mAh × volts ÷ 1000), and the numbers are in the
 * publisher's words. Then the arithmetic for a mix of devices against the worked
 * example in docs/tools-power.md ("A battery against a mix of devices").
 */
import {
  CHARGING_SAFETY,
  COMMON_DEVICES,
  type CommonDevice,
  convertedValue,
  DEVICE_GROUPS,
  newPowerPlan,
  type PublishedFigure,
  USB_CHARGING,
  USB_CONVERTER,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  BANK_ENTRIES,
  batteryFromEntry,
  changedSince,
  figureKind,
  loadFromEntry,
  type MixSetting,
  withLowerOutput,
  withState,
  withTransmit,
  workOutMix,
} from "./devices";
import { loadDailyWh } from "./plan";

function figuresOf(entry: CommonDevice): PublishedFigure[] {
  if (entry.kind === "run") return entry.states.map((state) => state.figure);
  if (entry.kind === "charge") return [entry.battery];
  if (entry.kind === "radio")
    return [entry.receive, ...(entry.standby ? [entry.standby] : []), ...entry.transmit.map((point) => point.figure)];
  return [];
}

/** The numbers in some words, read the way they are printed: "1,400" is 1400, "13,2" is 13.2, "0,5W" is 0.5. */
function numbersIn(text: string): number[] {
  const plain = text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d)/g, "$1.$2");
  return [...plain.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/** Each number of the published quantity, in the forms a publisher might print it (A or mA; kW or W). */
function forms(as: PublishedFigure["as"]): Array<{ what: string; values: number[] }> {
  if ("amps" in as)
    return [
      { what: "current", values: [as.amps, as.amps * 1000] },
      { what: "volts", values: [as.volts] },
    ];
  if ("milliampHours" in as)
    return [
      { what: "capacity", values: [as.milliampHours, as.milliampHours / 1000] },
      { what: "volts", values: [as.volts] },
    ];
  if ("watts" in as) return [{ what: "watts", values: [as.watts, as.watts / 1000] }];
  if ("wattHoursPer" in as) return [{ what: "energy", values: [as.wattHoursPer] }];
  return [{ what: "energy", values: [as.wattHours] }];
}

describe("the library of common devices", () => {
  it("has entries in every group, each id once", () => {
    const ids = COMMON_DEVICES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of DEVICE_GROUPS) expect(COMMON_DEVICES.some((entry) => entry.group === group.id)).toBe(true);
    for (const entry of COMMON_DEVICES) expect(DEVICE_GROUPS.map((group) => group.id)).toContain(entry.group);
  });

  it("gives every entry with a figure, and every guide, a source with a URL and the date it was read", () => {
    for (const entry of COMMON_DEVICES) {
      if (entry.kind === "label") continue;
      expect(entry.sources.length, entry.id).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(source.url, entry.id).toMatch(/^https:\/\/[^\s]+$/);
        expect(source.read, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(source.publisher.trim(), entry.id).not.toBe("");
        expect(source.document.trim(), entry.id).not.toBe("");
      }
    }
  });

  it("has a figure for every entry that is not a label to read or a maker's guide", () => {
    for (const entry of COMMON_DEVICES) {
      if (entry.kind === "label" || entry.kind === "guide") {
        expect(figuresOf(entry)).toEqual([]);
        continue;
      }
      const figures = figuresOf(entry);
      expect(figures.length, entry.id).toBeGreaterThan(0);
      for (const figure of figures) expect(figure.value, entry.id).toBeGreaterThan(0);
      if (entry.kind === "radio") expect(entry.transmit.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("turns each quantity as published into the figure used: watts are volts × amps, watt-hours mAh × volts ÷ 1000", () => {
    for (const entry of COMMON_DEVICES)
      for (const figure of figuresOf(entry))
        expect(near(figure.value, convertedValue(figure.as)), `${entry.id}: ${figure.quote}`).toBe(true);
    const pi5 = COMMON_DEVICES.find((entry) => entry.id === "raspberry-pi-5")!;
    // 800 mA at 5.1 V.
    expect(figuresOf(pi5)[0]).toMatchObject({ value: 4.08, as: { amps: 0.8, volts: 5.1 }, basis: "typical" });
    const ft65 = COMMON_DEVICES.find((entry) => entry.id === "pack-yaesu-sbr-25li")!;
    // 1,950 mAh at 7.4 V = 14.43 Wh.
    expect(figuresOf(ft65)[0]!.value).toBeCloseTo(14.43, 6);
  });

  it("finds the published numbers in the publisher's words, or the voltage's source in the note", () => {
    for (const entry of COMMON_DEVICES)
      for (const figure of figuresOf(entry)) {
        expect(figure.quote.trim(), entry.id).not.toBe("");
        expect(entry.sources[figure.source], `${entry.id}: source ${figure.source}`).toBeDefined();
        const inQuote = numbersIn(figure.quote);
        const inNote = numbersIn(figure.note ?? "");
        for (const { what, values } of forms(figure.as)) {
          const found = values.some((value) => [...inQuote, ...(what === "volts" ? inNote : [])].some((n) => near(n, value)));
          expect(found, `${entry.id}: the ${what} (${values[0]}) in “${figure.quote}”${figure.note ? ` / ${figure.note}` : ""}`).toBe(true);
        }
      }
  });

  it("says “at most” for a maker's maximum and never presents one as typical", () => {
    for (const entry of COMMON_DEVICES)
      for (const figure of figuresOf(entry))
        if (/less than|@ ?max|\bmax\b(?!\. audio)|worst case|<|or less|recommended psu|output power \(w\)/i.test(figure.quote))
          expect(figure.basis, `${entry.id}: ${figure.quote}`).toBe("at-most");
  });

  it("says where the charging figures come from, and that the USB one is an assumption", () => {
    expect(USB_CHARGING).toMatchObject({ share: 0.8, assumption: true });
    expect(USB_CHARGING.basis).toMatch(/Outpost's assumption/);
    expect(USB_CONVERTER).toMatchObject({ share: 0.71, assumption: false });
    expect(USB_CONVERTER.basis).toMatch(/MEAN WELL, SD-25A-5/);
    for (const item of CHARGING_SAFETY)
      expect(item.url).toMatch(/^https:\/\/www\.(gov\.uk|london-fire\.gov\.uk|electricalsafetyfirst\.org\.uk)\//);
  });

  it("gives a battery bank only to batteries and power stations, whose pack figures agree with their watt-hours", () => {
    expect(BANK_ENTRIES.length).toBeGreaterThan(5);
    for (const item of BANK_ENTRIES) {
      expect(item.group, item.id).toBe("batteries");
      if (item.bank.volts && item.bank.ampHours) expect(item.bank.volts * item.bank.ampHours, item.id).toBeCloseTo(item.battery.value, 6);
    }
  });
});

describe("a battery or power station as a plan's battery bank", () => {
  const start = newPowerPlan("x").battery;
  const station = (id: string) => BANK_ENTRIES.find((item) => item.id === id)!;

  it("takes the maker's pack volts and amp-hours where given", () => {
    const battery = batteryFromEntry(station("anker-solix-c2000-gen2"), { ...start, series: 2, parallel: 3, maxDischargeA: 50 });
    expect(battery).toMatchObject({ chemistry: "lifepo4", volts: 51.2, ampHours: 40, series: 1, parallel: 1, maxDischargeA: 50 });
  });

  it("otherwise keeps the chemistry's volts and works the amp-hours out from the maker's watt-hours", () => {
    const battery = batteryFromEntry(station("ecoflow-river-2"), start);
    expect(battery.volts).toBe(12.8);
    expect(battery.volts * battery.ampHours).toBeCloseTo(256, 1);
  });

  it("keeps the plan's chemistry where the maker names none", () => {
    const battery = batteryFromEntry(station("anker-solix-c1000-gen2"), { ...start, chemistry: "agm", volts: 12, usableDod: 0.5 });
    expect(battery).toMatchObject({ chemistry: "agm", volts: 12, usableDod: 0.5 });
    expect(battery.volts * battery.ampHours).toBeCloseTo(1024, 1);
  });
});

// ── The worked example in docs/tools-power.md ───────────────────────────────

const entry = (id: string) => COMMON_DEVICES.find((item) => item.id === id)!;
const setting: MixSetting = { wattHours: 1280, volts: 12.8, usable: 0.8, inverter: 0.88, usb: 0.71, days: 3 };

describe("a battery against a mix of devices", () => {
  const pi = loadFromEntry(entry("raspberry-pi-5"), "pi")!;
  const phones = { ...loadFromEntry(entry("iphone-16"), "phones")!, quantity: 2 };
  const radio = loadFromEntry(entry("yaesu-ft-65"), "radio")!;

  it("makes loads from entries with their figures and a record of where they came from", () => {
    expect(pi).toMatchObject({
      kind: "device",
      watts: 4.08,
      hoursPerDay: 24,
      supply: "usb",
      origin: { id: "raspberry-pi-5", state: "typical" },
    });
    // 3,561 mAh × 3.6 V = 12.8196 Wh.
    expect(phones).toMatchObject({ kind: "charge", chargesPerDay: 1, chargeEfficiency: 0.8 });
    expect((phones as { wattHours: number }).wattHours).toBeCloseTo(12.8196, 6);
    expect(radio).toMatchObject({ kind: "radio", transmitW: 11.1, receiveW: 1.517, mode: "fm", origin: { state: "144-5w" } });
    // FM: half the time on the air transmitting at full output; 0.5 × 11.1 + 0.5 × 1.517 = 6.3085 W for 4 hours.
    expect(loadDailyWh(radio)).toBeCloseTo(25.234, 6);
  });

  it("works out the worked example", () => {
    const answers = workOutMix([pi, phones, radio], setting);
    // 1,280 Wh × 80% = 1,024 Wh can be taken out.
    expect(answers.deliveredWh).toBe(1024);
    // Pi: 4.08 W × 24 h ÷ 71% = 137.915 Wh; radio 25.234 Wh. Phones: 12.8196 ÷ 80% ÷ 71% = 22.5697 Wh a charge, two a day.
    expect(answers.runWh).toBeCloseTo(163.1495, 3);
    expect(answers.chargeWh).toBeCloseTo(45.1394, 3);
    expect(answers.charges[0]!.perChargeWh).toBeCloseTo(22.5697, 3);
    // What runs: 1,024 ÷ 163.15 = 6.28 days. Charges instead: 1,024 ÷ 22.57 = 45.4; besides 3 days: (1,024 − 3 × 163.15) ÷ 22.57 = 23.7.
    expect(answers.plan.runDays).toBeCloseTo(6.2765, 3);
    expect(answers.charges[0]!.instead).toBeCloseTo(45.3705, 3);
    expect(answers.charges[0]!.besides).toBeCloseTo(23.6845, 3);
    // Everything as set: 1,024 ÷ 208.29 = 4.92 days. For 3 days: 534.55 Wh left ÷ (45.14 × 3) = 3.95 times the charging set.
    expect(answers.daysAll).toBeCloseTo(4.9162, 3);
    expect(answers.plan.chargeScale).toBeCloseTo(3.9474, 3);
    // Battery for 3 days: 208.29 × 3 ÷ 80% = 781.1 Wh, 61.0 Ah at 12.8 V.
    expect(answers.needWh).toBeCloseTo(781.083, 2);
    expect(answers.needAh).toBeCloseTo(61.022, 2);
    expect(answers.ranked.map((item) => item.load.id)).toEqual(["pi", "phones", "radio"]);
    expect(answers.atLeast).toBe(false);
  });

  it("is at least as long when any figure is a maker's maximum", () => {
    const supply = withState(pi, (entry("raspberry-pi-5") as Extract<CommonDevice, { kind: "run" }>).states.at(-1)!);
    expect(supply).toMatchObject({ watts: 25.5, origin: { state: "supply" } });
    expect(figureKind(supply)).toBe("at-most");
    expect(workOutMix([supply, phones], setting).atLeast).toBe(true);
  });

  it("says when a figure has been changed by hand, and treats it as the person's own", () => {
    const changed = { ...pi, watts: 5 };
    expect(changedSince(changed)).toBe(true);
    expect(figureKind(changed)).toBe("own");
    expect(changedSince(pi)).toBe(false);
  });

  it("estimates the transmit draw at a lower output than the maker gives, and says so", () => {
    const radioEntry = entry("yaesu-ft-2980") as Extract<CommonDevice, { kind: "radio" }>;
    const mobile = loadFromEntry(radioEntry, "mobile")!;
    expect(mobile).toMatchObject({ transmitW: 207 });
    expect(withTransmit(mobile, radioEntry, "10w")).toMatchObject({ transmitW: 69 });
    const lower = withLowerOutput(mobile, 2);
    expect(lower).toMatchObject({ transmitW: 4, origin: { state: "estimate:2" } });
    expect(figureKind(lower)).toBe("estimate");
    expect(workOutMix([lower], setting).estimated).toBe(true);
  });

  it("says that nothing fits when what runs uses more than the battery holds for the days", () => {
    const answers = workOutMix([{ ...pi, quantity: 10 }, phones], setting);
    expect(answers.plan.runsFit).toBe(false);
    expect(answers.charges[0]!.besides).toBe(0);
  });
});

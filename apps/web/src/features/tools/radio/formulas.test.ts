import { maxSightDistanceMeters, sMeter } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { CABLES } from "./coax-data";
import {
  antennaLengths,
  averageCurrent,
  batteryHours,
  cableLoss,
  dbmFromSUnits,
  dbmToWatts,
  freeSpaceLossDb,
  lossPer100m,
  radioHorizonMeters,
  sMeterReading,
  wattsToDbm,
} from "./formulas";

describe("antenna lengths", () => {
  it("give 142.4 ÷ f metres for a half wave at the usual factor, close to the ARRL's 468 ÷ f feet and the RSGB's 143 ÷ f metres", () => {
    const dipole = antennaLengths("dipole", 7.1);
    expect(dipole.total).toBeCloseTo(142.4 / 7.1, 2);
    expect(dipole.leg).toBeCloseTo(dipole.total / 2, 9);
    // ARRL, "Single band dipoles": length (feet) = 468 / MHz.
    expect(dipole.total / 0.3048).toBeCloseTo(468 / 7.1, 0);
    // RSGB: length (metres) = 143 / f.
    expect(Math.abs(dipole.total - 143 / 7.1)).toBeLessThan(0.1);
  });

  it("make an end-fed half-wave for 40 m about 66 feet, as the ARRL's kit article says", () => {
    expect(antennaLengths("efhw", 7.1).total / 0.3048).toBeCloseTo(66, -0.5);
    expect(antennaLengths("efhw", 7.1).leg).toBeNull();
  });

  it("make a quarter wave half a half wave, and follow the factor", () => {
    expect(antennaLengths("quarter", 145, 0.95).total).toBeCloseTo(antennaLengths("dipole", 145, 0.95).total / 2, 9);
    expect(antennaLengths("dipole", 14.2, 1).wavelength).toBeCloseTo(299.792458 / 14.2, 9);
  });
});

describe("free-space path loss", () => {
  it("agrees with ITU-R P.525 equation 6, L = 32.4 + 20 log f + 20 log d, within its rounding", () => {
    for (const [f, d] of [
      [145, 10],
      [7.1, 1000],
      [2400, 0.5],
    ] as const) {
      expect(Math.abs(freeSpaceLossDb(f, d) - (32.4 + 20 * Math.log10(f) + 20 * Math.log10(d)))).toBeLessThan(0.05);
    }
  });
});

describe("the radio horizon", () => {
  it("is about 4.12 √h km, as k = 4/3 (ITU-R P.834) gives", () => {
    expect(radioHorizonMeters(10) / 1000).toBeCloseTo(4.12 * Math.sqrt(10), 1);
    expect(radioHorizonMeters(10) + radioHorizonMeters(2)).toBeCloseTo(maxSightDistanceMeters(10, 2), 6);
    expect(radioHorizonMeters(-1)).toBe(0);
  });
});

describe("levels", () => {
  it("convert watts and dBm", () => {
    expect(wattsToDbm(1)).toBeCloseTo(30, 9);
    expect(wattsToDbm(100)).toBeCloseTo(50, 9);
    expect(dbmToWatts(-73)).toBeCloseTo(5.01e-11, 12);
  });

  it("put S9 at −73 dBm below 30 MHz and −93 dBm above, 6 dB a unit (IARU Region 1 R.1)", () => {
    expect(sMeterReading(-73, "hf")).toBe("S9");
    expect(sMeterReading(-79, "hf")).toBe("S8");
    expect(sMeterReading(-53, "hf")).toBe("S9 + 20 dB");
    expect(sMeterReading(-93, "vhf")).toBe("S9");
    expect(sMeterReading(-141, "vhf")).toBe("S1");
    expect(sMeterReading(-150, "vhf")).toBe("below S1");
    expect(dbmFromSUnits(9, "hf")).toBe(-73);
    expect(dbmFromSUnits(9, "hf", 10)).toBe(-63);
    expect(dbmFromSUnits(1, "vhf")).toBe(-141);
  });

  it("read HF the same as the S-meter helper Outpost's propagation tools already use", () => {
    for (const dbm of [-120, -100, -85, -73, -60, -40]) expect(sMeterReading(dbm, "hf")).toBe(sMeter(dbm - 30));
  });
});

describe("cable loss", () => {
  const lmr400 = CABLES.find((cable) => cable.id === "lmr400")!;

  it("gives the published figure at a published frequency", () => {
    expect(lossPer100m(lmr400.table, 450)).toBe(8.9);
  });

  it("reads between published figures close to the maker's own formula", () => {
    // Times Microwave: attenuation (dB/100 ft) = 0.12229 √f + 0.00026 f.
    const formula = (0.12229 * Math.sqrt(146) + 0.00026 * 146) * 3.280839895;
    expect(Math.abs(lossPer100m(lmr400.table, 146)! - formula) / formula).toBeLessThan(0.03);
  });

  it("does not guess outside the published frequencies", () => {
    expect(lossPer100m(lmr400.table, 10)).toBeNull();
    expect(lossPer100m(lmr400.table, 10_000)).toBeNull();
  });

  it("works out the power that arrives", () => {
    const loss = cableLoss(10, 30);
    expect(loss.lossDb).toBe(3);
    expect(loss.delivered).toBeCloseTo(0.501, 3);
  });

  it("lists every cable's frequencies in rising order", () => {
    for (const cable of CABLES) {
      const frequencies = cable.table.map(([mhz]) => mhz);
      expect(frequencies).toEqual([...frequencies].sort((a, b) => a - b));
    }
  });
});

describe("battery life", () => {
  it("is usable capacity over the average current of the duty cycle", () => {
    const average = averageCurrent({ transmit: 1500, receive: 150, standby: 50 }, { transmitPercent: 5, receivePercent: 5, standbyPercent: 90 });
    expect(average).toBeCloseTo(75 + 7.5 + 45, 9);
    expect(batteryHours(2000, 80, average)).toBeCloseTo(1600 / 127.5, 9);
  });
});

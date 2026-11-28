/**
 * Which country a road route's point is in (modules/roads/countries.ts): the same
 * outlines as the rest of the server (layers/borders.ts), so a town a few kilometres from
 * a border is not given the neighbour, and a sea crossing is still seen as water.
 */
import { describe, expect, it } from "vitest";
import { countriesInBoxes, countryOfPoint, inNorthernIreland, reachesNorthernIreland } from "../src/modules/roads/countries.ts";
import { coverageOf, samplesAlong } from "../src/modules/roads/coverage.ts";
import { networkName, networkReachesNorthernIreland } from "../src/modules/roads/service.ts";

const places: Array<[string, number, number, string]> = [
  ["Freilassing", 47.8406, 12.9775, "DE"],
  ["Vancouver", 49.2827, -123.1207, "CA"],
  ["Maseru (Lesotho, inside South Africa)", -29.3151, 27.4869, "LS"],
  ["Salzburg", 47.8095, 13.055, "AT"],
  ["London", 51.5074, -0.1278, "GB"],
  ["Calais", 50.9513, 1.8587, "FR"],
  ["Chamonix", 45.9237, 6.8694, "FR"],
  ["Belfast", 54.5973, -5.9301, "GB"],
  ["Dundalk", 54.0, -6.4167, "IE"],
];

describe("the country a road route's point is in", () => {
  it.each(places)("%s", (_name, lat, lon, code) => {
    expect(countryOfPoint(lat, lon)).toBe(code);
  });

  it("is none far out at sea", () => {
    expect(countryOfPoint(40, -40)).toBeNull();
  });

  it("still sees the Channel between Dover and Calais as water", () => {
    const { seaCrossing } = samplesAlong([
      { lat: 51.1279, lon: 1.3134 },
      { lat: 50.9513, lon: 1.8587 },
    ]);
    expect(seaCrossing).toBe(true);
  });

  it("names the countries some boxes cover", () => {
    expect(new Set(countriesInBoxes([[12.9, 47.8, 13.1, 47.86]]))).toEqual(new Set(["DE", "AT"]));
  });
});

describe("the United Kingdom's roads, when they are Great Britain's", () => {
  const BELFAST = { lat: 54.5973, lon: -5.9301 };
  const LONDON = { lat: 51.5074, lon: -0.1278 };
  const DUBLIN = { lat: 53.3498, lon: -6.2603 };
  const gbBox: [number, number, number, number] = [-7.6, 49.9, 1.76, 60.8];
  const greatBritain = {
    name: "Great Britain",
    country: "GB",
    bbox: gbBox,
    available: true,
    dataDate: "2026-11-20",
    northernIreland: false,
  };
  const ireland = {
    name: "Ireland and Northern Ireland",
    country: "IE",
    bbox: [-10.6, 51.4, -5.4, 55.4] as [number, number, number, number],
    available: true,
    dataDate: "2026-11-20",
    northernIreland: true,
  };

  it("knows Northern Ireland from the rest", () => {
    expect(inNorthernIreland(BELFAST.lat, BELFAST.lon)).toBe(true);
    expect(inNorthernIreland(54.1751, -6.3402)).toBe(true); // Newry
    expect(inNorthernIreland(LONDON.lat, LONDON.lon)).toBe(false);
    expect(inNorthernIreland(DUBLIN.lat, DUBLIN.lon)).toBe(false);
    expect(inNorthernIreland(54.0, -6.4167)).toBe(false); // Dundalk
    expect(inNorthernIreland(55.31, -5.64)).toBe(false); // Southend, Kintyre
    expect(inNorthernIreland(54.85, -5.1)).toBe(false); // Stranraer
    const e7 = (points: Array<{ lat: number; lon: number }>) => ({
      lat: points.map((p) => Math.round(p.lat * 1e7)),
      lon: points.map((p) => Math.round(p.lon * 1e7)),
    });
    const britain = e7([LONDON, { lat: 54.85, lon: -5.1 }, { lat: 55.31, lon: -5.64 }]);
    expect(reachesNorthernIreland(britain.lat, britain.lon)).toBe(false);
    const ulster = e7(Array.from({ length: 6 }, (_, i) => ({ lat: 54.5 + i * 0.02, lon: -6.0 })));
    expect(reachesNorthernIreland(ulster.lat, ulster.lon)).toBe(true);
  });

  it("names Great Britain's roads Great Britain, and does not take Belfast as covered by them", () => {
    const london = coverageOf([LONDON], [greatBritain], [], () => "united-kingdom");
    expect(london.countries.map((c) => [c.code, c.name, c.state])).toEqual([["GB", "Great Britain", "ready"]]);
    const belfast = coverageOf([LONDON, BELFAST], [greatBritain], [], () => "united-kingdom");
    expect(belfast.countries.map((c) => [c.code, c.name, c.state, c.parts])).toEqual([["GB", "United Kingdom", "part", ["Great Britain"]]]);
    // Northern Ireland's roads from Ireland's network: Belfast is covered, and the country is the United Kingdom again.
    const both = coverageOf([LONDON, BELFAST], [greatBritain, ireland], [], () => "united-kingdom");
    expect(both.countries.find((c) => c.code === "GB")).toMatchObject({ name: "United Kingdom", state: "ready" });
  });

  it("names a United Kingdom network by what its roads reach, never by its region", () => {
    const row = { name: "United Kingdom", country: "GB", bbox: gbBox, stats: { northernIreland: true } };
    expect(networkName(row)).toBe("United Kingdom");
    expect(networkName({ ...row, stats: { northernIreland: false } })).toBe("Great Britain");
    // Not yet worked out: by its box, which reaches Northern Ireland, so nothing is taken away.
    expect(networkReachesNorthernIreland({ bbox: gbBox, stats: {} })).toBe(true);
    expect(networkReachesNorthernIreland({ bbox: [-1, 50, 1.5, 52], stats: null })).toBe(false);
    expect(networkName({ ...row, name: "Kent", stats: { northernIreland: false } })).toBe("Kent");
  });
});

/**
 * Which country a road route's point is in (modules/roads/countries.ts): the same
 * outlines as the rest of the server (layers/borders.ts), so a town a few kilometres from
 * a border is not given the neighbour, and a sea crossing is still seen as water.
 */
import { describe, expect, it } from "vitest";
import { countriesInBoxes, countryOfPoint } from "../src/modules/roads/countries.ts";
import { samplesAlong } from "../src/modules/roads/coverage.ts";

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

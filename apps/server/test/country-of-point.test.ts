/**
 * Which country a point is in, from the bundled outlines (modules/layers/borders.ts), for
 * the places the boxes got wrong (Rosenheim and Munich in Austria, Boston, Chicago and
 * Seattle in Canada) and for towns a few kilometres from a border.
 */
import { describe, expect, it } from "vitest";
import { countryFound, countryOfPoint } from "../src/modules/layers/borders.ts";

const places: Array<[string, number, number, string]> = [
  ["Rosenheim", 47.8561, 12.1225, "DE"],
  ["Munich", 48.137, 11.575, "DE"],
  ["Freilassing", 47.8406, 12.9775, "DE"],
  ["Salzburg", 47.8095, 13.055, "AT"],
  ["Kufstein", 47.5833, 12.1667, "AT"],
  ["Boston", 42.3601, -71.0589, "US"],
  ["Chicago", 41.8781, -87.6298, "US"],
  ["Seattle", 47.6062, -122.3321, "US"],
  ["Detroit", 42.3314, -83.0458, "US"],
  ["Buffalo", 42.8864, -78.8784, "US"],
  ["Toronto", 43.6532, -79.3832, "CA"],
  ["Ottawa", 45.4215, -75.6972, "CA"],
  ["Windsor, Ontario", 42.3149, -83.0364, "CA"],
  ["Vancouver", 49.2827, -123.1207, "CA"],
  ["Strasbourg", 48.5734, 7.7521, "FR"],
  ["Kehl", 48.5724, 7.8156, "DE"],
  ["Lille", 50.6292, 3.0573, "FR"],
  ["Maastricht", 50.8514, 5.691, "NL"],
  ["Basel", 47.5596, 7.5886, "CH"],
  ["Geneva", 46.2044, 6.1432, "CH"],
  ["London", 51.5074, -0.1278, "GB"],
  ["Brighton, on the coast", 50.8198, -0.1372, "GB"],
  ["Dublin", 53.3498, -6.2603, "IE"],
  ["Belfast", 54.5973, -5.9301, "GB"],
  ["Newry", 54.1751, -6.3402, "GB"],
  ["Dundalk", 54.0, -6.4167, "IE"],
  ["Maseru (Lesotho, inside South Africa)", -29.3151, 27.4869, "LS"],
  ["Bloemfontein", -29.0852, 26.1596, "ZA"],
  ["Auckland", -36.8485, 174.7633, "NZ"],
  ["Sydney", -33.8688, 151.2093, "AU"],
  ["Paris", 48.8566, 2.3522, "FR"],
  ["Oslo", 59.9139, 10.7522, "NO"],
];

describe("the country a point is in", () => {
  it.each(places)("%s", (_name, lat, lon, code) => {
    expect(countryOfPoint(lat, lon)).toBe(code);
  });

  it("is none far out at sea, and says when another country is a few kilometres off", () => {
    expect(countryOfPoint(40, -40)).toBeNull();
    expect(countryOfPoint(Number.NaN, 0)).toBeNull();
    // Kehl is across the Rhine from Strasbourg.
    expect(countryFound(48.5724, 7.8156)?.near).toContain("FR");
    expect(countryFound(51.5074, -0.1278)?.near).toEqual([]);
  });
});

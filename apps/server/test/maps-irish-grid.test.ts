import {
  formatIrishGridRef,
  formatItm,
  fromIrishGrid,
  fromItm,
  haversineMeters,
  irishGridProjection,
  parseCoordinateReadings,
  parseCoordinates,
  parseIrishGridRef,
  toIrishGrid,
  toItm,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

const dms = (degrees: number, minutes: number, seconds: number) => degrees + minutes / 60 + seconds / 3600;

describe("the Irish Grid", () => {
  it("projects as OSi's worked examples do (The Irish Grid, 2000, section 6.1)", () => {
    // OSO (Phoenix Park) and Howth, in TM75 latitude and longitude, to the millimetre.
    const oso = irishGridProjection(dms(53, 21, 50.5441), -dms(6, 20, 52.9181));
    expect(oso.easting).toBeCloseTo(309_958.2645, 2);
    expect(oso.northing).toBeCloseTo(236_141.9291, 2);
    const howth = irishGridProjection(dms(53, 22, 23.1566), -dms(6, 4, 6.0065));
    expect(howth.easting).toBeCloseTo(328_546.3442, 2);
    expect(howth.northing).toBeCloseTo(237_617.1863, 2);
  });

  it("names the square as NISRA's example does: Belfast City Hall, 333831 E 374015 N, is J 338 740", () => {
    const hall = fromIrishGrid(333_831, 374_015)!;
    expect(formatIrishGridRef(hall.lat, hall.lon, 6)).toBe("J 338 740");
    expect(formatIrishGridRef(hall.lat, hall.lon, 4)).toBe("J 33 74");
    // Where Belfast City Hall is, to within the metre the shift from WGS84 is good to (and a few for the building).
    expect(haversineMeters(hall.lat, hall.lon, 54.5966, -5.9301)).toBeLessThan(30);
  });

  it("goes there and back to well under a metre", () => {
    for (const [lat, lon] of [
      [53.3498, -6.2603],
      [51.8985, -8.4756],
      [55.2, -7.5],
      [54.0, -10.0],
    ] as const) {
      const grid = toIrishGrid(lat, lon)!;
      const back = fromIrishGrid(grid.easting, grid.northing)!;
      expect(haversineMeters(lat, lon, back.lat, back.lon)).toBeLessThan(0.05);
      const reference = formatIrishGridRef(lat, lon, 10)!;
      const parsed = parseIrishGridRef(reference)!;
      expect(haversineMeters(lat, lon, parsed.lat, parsed.lon)).toBeLessThan(2);
    }
  });

  it("reads references in the usual spellings and gives the size of the square", () => {
    for (const text of ["O 159 346", "o159346", "O159 346", "O 1590 3467"]) {
      const reading = parseCoordinates(text);
      expect(reading?.format, text).toBe("irish");
    }
    expect(parseCoordinates("O 159 346")!.precisionMeters).toBe(100);
    expect(parseCoordinates("O 15")!.precisionMeters).toBe(10_000);
    expect(parseCoordinates("O 159 34")).toBeNull();
    // A two-letter reference is still Britain's.
    expect(parseCoordinates("NY 215 072")?.format).toBe("osgb");
    expect(parseCoordinateReadings("J 338 740")).toHaveLength(1);
  });

  it("has nothing to say far from Ireland", () => {
    expect(toIrishGrid(48.85, 2.35)).toBeNull();
    expect(formatIrishGridRef(51.5, -0.12)).toBeNull();
  });
});

describe("Irish Transverse Mercator", () => {
  it("gives Dublin's Spire where PROJ puts it (EPSG:2157)", () => {
    const spire = toItm(53.3498, -6.2603)!;
    expect(spire.easting).toBeCloseTo(715_826.5, 0);
    expect(spire.northing).toBeCloseTo(734_697.6, 0);
    expect(formatItm(53.3498, -6.2603)).toBe("ITM 715826 734697");
    expect(formatItm(53.3498, -6.2603, 100)).toBe("ITM 715800 734600");
    const back = fromItm(spire.easting, spire.northing)!;
    expect(haversineMeters(53.3498, -6.2603, back.lat, back.lon)).toBeLessThan(0.01);
    expect(toItm(40, -74)).toBeNull();
  });
});

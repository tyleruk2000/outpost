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
  parseItm,
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

// OSi's active GPS stations, as OSi published them: ETRS89 latitude and longitude, and ITM easting and northing
// ("Active Stations", GPS-STATION-COORDINATES.pdf, osi.ie, 2012, read 2026-11-22 from the Internet Archive's copy).
const OSI_STATIONS = [
  { name: "Athlone", lat: dms(53, 25, 55.81991), lon: -dms(7, 54, 27.4616), e: 606_138.377, n: 742_456.436 },
  { name: "Fingal CC", lat: dms(53, 27, 32.59727), lon: -dms(6, 13, 8.51778), e: 718_270.316, n: 746_920.838 },
  { name: "Cork I.T", lat: dms(51, 53, 5.56759), lon: -dms(8, 31, 58.76032), e: 563_308.284, n: 570_435.33 },
  { name: "Kilrea", lat: dms(54, 57, 53.77044), lon: -dms(6, 37, 4.92271), e: 688_495.96, n: 913_905.63 },
  { name: "Tralee", lat: dms(52, 17, 12.39119), lon: -dms(9, 40, 23.21814), e: 485_854.024, n: 616_330.095 },
] as const;

describe("ITM against OSi's published station coordinates", () => {
  it("projects each station to its published easting and northing, to the centimetre", () => {
    for (const station of OSI_STATIONS) {
      const grid = toItm(station.lat, station.lon)!;
      expect(Math.abs(grid.easting - station.e), station.name).toBeLessThan(0.01);
      expect(Math.abs(grid.northing - station.n), station.name).toBeLessThan(0.01);
    }
  });

  it("reads each station's figures typed with ITM before them back to where the station is", () => {
    for (const station of OSI_STATIONS) {
      const reading = parseCoordinates(`ITM ${station.e} ${station.n}`)!;
      expect(reading.format, station.name).toBe("itm");
      expect(haversineMeters(reading.lat, reading.lon, station.lat, station.lon), station.name).toBeLessThan(0.01);
    }
  });
});

describe("typed ITM coordinates", () => {
  it("are read with ITM before or after them, in any case and the usual spellings", () => {
    for (const text of [
      "ITM 715830 734697",
      "itm 715830 734697",
      "Itm: 715830, 734697",
      "ITM E 715830 N 734697",
      "ITM 715830E 734697N",
      "ITM715830 734697",
      "715830 734697 ITM",
      "  ITM   715830.5   734697.25 ",
    ]) {
      const reading = parseCoordinates(text);
      expect(reading?.format, text).toBe("itm");
      expect(haversineMeters(reading!.lat, reading!.lon, 53.3498, -6.2603), text).toBeLessThan(10);
    }
    expect(parseItm("itm 715830, 734697")?.reference).toBe("ITM 715830 734697");
  });

  it("leaves bare six-figure pairs to the British grid, as they always were", () => {
    expect(parseCoordinates("321540 507210")?.format).toBe("osgb");
    expect(parseCoordinateReadings("ITM 715830 734697")).toHaveLength(1);
  });

  it("refuses what is not ITM, or is not in Ireland", () => {
    for (const text of ["ITM 71583 734697", "ITM 715830", "ITM 715830 734697 1", "ITEM 715830 734697", "ITM 100000 100000"]) {
      expect(parseItm(text), text).toBeNull();
    }
  });
});

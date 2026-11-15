import {
  formatDdm,
  formatDecimal,
  formatDms,
  formatOsGridRef,
  fromOsGrid,
  haversineMeters,
  parseCoordinates,
  parseOsGridRef,
  toOsGrid,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

/** Scafell Pike summit, England's highest point: NY 21548 07214. */
const SCAFELL_PIKE = { lat: 54.4542, lon: -3.2116 };

function expectNear(actual: { lat: number; lon: number } | null, expected: { lat: number; lon: number }, meters: number): void {
  expect(actual).not.toBeNull();
  expect(haversineMeters(actual!.lat, actual!.lon, expected.lat, expected.lon)).toBeLessThan(meters);
}

describe("parsing typed coordinates", () => {
  it("reads decimal degrees in the usual spellings", () => {
    const expected = { lat: 54.4609, lon: -3.0886 };
    for (const text of [
      "54.4609, -3.0886",
      "54.4609 -3.0886",
      "54.4609,-3.0886",
      "  54.4609 ;  -3.0886 ",
      "54.4609° N, 3.0886° W",
      "54.4609N 3.0886W",
      "N 54.4609 W 3.0886",
      "N54.4609, W3.0886",
      "3.0886W 54.4609N",
      "+54.4609 −3.0886",
    ]) {
      const parsed = parseCoordinates(text);
      expect(parsed, text).toMatchObject({ format: "decimal" });
      expect(parsed!.lat, text).toBeCloseTo(expected.lat, 6);
      expect(parsed!.lon, text).toBeCloseTo(expected.lon, 6);
    }
    expect(parseCoordinates("-33.8568 151.2153")).toMatchObject({ lat: -33.8568, lon: 151.2153 });
    expect(parseCoordinates("33.8568S 151.2153E")).toMatchObject({ lat: -33.8568, lon: 151.2153 });
    expect(parseCoordinates("54, -3")).toMatchObject({ lat: 54, lon: -3, format: "decimal" });
  });

  it("reads degrees, minutes and seconds", () => {
    // 54°27'39"N 3°05'19"W
    const expected = { lat: 54 + 27 / 60 + 39 / 3600, lon: -(3 + 5 / 60 + 19 / 3600) };
    for (const text of [
      `54°27'39"N 3°05'19"W`,
      "54°27′39″N 3°05′19″W",
      `54° 27' 39" N, 3° 05' 19" W`,
      "54 27 39 N 3 5 19 W",
      `N 54°27'39" W 3°05'19"`,
      "54°27'39''N 3°05'19''W",
      `3°05'19"W 54°27'39"N`,
      "54 27 39, -3 5 19",
    ]) {
      const parsed = parseCoordinates(text);
      expect(parsed, text).toMatchObject({ format: "dms" });
      expect(parsed!.lat, text).toBeCloseTo(expected.lat, 6);
      expect(parsed!.lon, text).toBeCloseTo(expected.lon, 6);
    }
    expect(parseCoordinates(`54°27'39.6"N 3°05'19.2"W`)!.lat).toBeCloseTo(54 + 27 / 60 + 39.6 / 3600, 7);
  });

  it("reads degrees and decimal minutes", () => {
    for (const text of ["54°27.654'N 3°5.316'W", "54 27.654 N 3 5.316 W", "N 54° 27.654 W 003° 05.316", "54 27.654, -3 5.316"]) {
      const parsed = parseCoordinates(text);
      expect(parsed, text).toMatchObject({ format: "ddm" });
      expect(parsed!.lat, text).toBeCloseTo(54 + 27.654 / 60, 6);
      expect(parsed!.lon, text).toBeCloseTo(-(3 + 5.316 / 60), 6);
    }
  });

  it("reads geo: links", () => {
    expect(parseCoordinates("geo:54.4609,-3.0886")).toEqual({ lat: 54.4609, lon: -3.0886, format: "geo" });
    expect(parseCoordinates("geo:54.4609,-3.0886,978;u=10")).toMatchObject({ lat: 54.4609, lon: -3.0886 });
    expect(parseCoordinates("geo:48.2010,16.3695?z=19")).toMatchObject({ lat: 48.201, lon: 16.3695 });
    expect(parseCoordinates("GEO:91,0")).toBeNull();
  });

  it("reads British National Grid references at every precision", () => {
    // The known point: Scafell Pike's summit, within about 50 m for an 8-figure reference.
    expectNear(parseCoordinates("NY 2154 0721"), SCAFELL_PIKE, 50);
    expectNear(parseCoordinates("NY21540721"), SCAFELL_PIKE, 50);
    expectNear(parseCoordinates("ny 2154 0721"), SCAFELL_PIKE, 50);
    expectNear(parseCoordinates("NY 21548 07214"), SCAFELL_PIKE, 15);
    expectNear(parseCoordinates("NY 215 072"), SCAFELL_PIKE, 120);
    expectNear(parseCoordinates("NY 21 07"), SCAFELL_PIKE, 1000);
    expectNear(parseCoordinates("321548 507214"), SCAFELL_PIKE, 15);

    expect(parseCoordinates("NY 2154 0721")).toMatchObject({ format: "osgb", precisionMeters: 10 });
    expect(parseCoordinates("NY 215 072")).toMatchObject({ format: "osgb", precisionMeters: 100 });
    expect(parseCoordinates("NY 21548 07214")).toMatchObject({ precisionMeters: 1 });

    // Other well-known points, to be sure the letters are decoded right across the grid.
    expectNear(parseOsGridRef("NN 16671 71284"), { lat: 56.7969, lon: -5.0036 }, 30); // Ben Nevis
    expectNear(parseOsGridRef("SH 60986 54375"), { lat: 53.0685, lon: -4.0763 }, 30); // Yr Wyddfa
    expectNear(parseOsGridRef("TQ 3888 7732"), { lat: 51.4779, lon: -0.0015 }, 40); // Royal Observatory, Greenwich
    expectNear(parseOsGridRef("HU 46 41"), { lat: 60.155, lon: -1.145 }, 1500); // Lerwick
    expectNear(parseOsGridRef("SV 91 10"), { lat: 49.915, lon: -6.31 }, 1500); // St Mary's, Scilly
  });

  it("rejects things that only look like grid references", () => {
    expect(parseOsGridRef("NY 215 0721")).toBeNull(); // uneven halves
    expect(parseOsGridRef("NY 2154 072")).toBeNull();
    expect(parseOsGridRef("NI 2154 0721")).toBeNull(); // I is not a grid letter
    expect(parseOsGridRef("AA 2154 0721")).toBeNull(); // far outside the grid
    expect(parseOsGridRef("NY")).toBeNull();
  });

  it("leaves place names and nonsense alone", () => {
    for (const text of [
      "Ambleside",
      "Scafell Pike",
      "N",
      "Sens",
      "W 3",
      "54.4609",
      "91, 0",
      "0, 181",
      "54 61 0 N 3 0 0 W",
      "54.5 30 N 3 W",
      "1 2 3",
      "12 Station Road",
      "A591",
      "",
    ]) {
      expect(parseCoordinates(text), text).toBeNull();
    }
  });
});

describe("National Grid conversion", () => {
  it("round-trips between WGS84 and the grid", () => {
    for (const [lat, lon] of [
      [54.4542, -3.2116],
      [50.1, -5.5],
      [58.6, -3.1],
      [51.5, 0.0],
      [52.9, 1.2],
      [60.4, -1.2],
    ] as const) {
      const grid = toOsGrid(lat, lon);
      expect(grid).not.toBeNull();
      const back = fromOsGrid(grid!.easting, grid!.northing)!;
      expect(haversineMeters(lat, lon, back.lat, back.lon)).toBeLessThan(0.05);
    }
  });

  it("puts Scafell Pike where the Ordnance Survey does", () => {
    const grid = toOsGrid(54.454222, -3.211528)!;
    expect(Math.abs(grid.easting - 321548)).toBeLessThan(15);
    expect(Math.abs(grid.northing - 507214)).toBeLessThan(15);
  });

  it("is null outside Great Britain", () => {
    expect(toOsGrid(48.85, 2.35)).toBeNull();
    expect(toOsGrid(40.7, -74)).toBeNull();
    expect(fromOsGrid(-1, 100)).toBeNull();
    expect(formatOsGridRef(48.85, 2.35)).toBeNull();
  });
});

describe("formatting coordinates", () => {
  it("writes decimal, DMS and decimal-minute forms", () => {
    expect(formatDecimal(54.4609, -3.0886)).toBe("54.46090, -3.08860");
    expect(formatDecimal(54.4609, -3.0886, 3)).toBe("54.461, -3.089");
    expect(formatDms(54.460833, -3.088611)).toBe("54°27′39″N 3°05′19″W");
    expect(formatDms(-33.8568, 151.2153)).toBe("33°51′24″S 151°12′55″E");
    expect(formatDms(54.460833, -3.088611, 1)).toBe("54°27′39.0″N 3°05′19.0″W");
    expect(formatDdm(54.4609, -3.0886)).toBe("54°27.654′N 3°05.316′W");
  });

  it("never shows sixty seconds or sixty minutes", () => {
    expect(formatDms(53.9999999, -0.9999999)).toBe("54°00′00″N 1°00′00″W");
    expect(formatDdm(53.9999999, -0.9999999)).toBe("54°00.000′N 1°00.000′W");
  });

  it("writes grid references that parse back to the same square", () => {
    expect(formatOsGridRef(SCAFELL_PIKE.lat, SCAFELL_PIKE.lon, 6)).toBe("NY 215 072");
    expect(formatOsGridRef(SCAFELL_PIKE.lat, SCAFELL_PIKE.lon, 8)).toMatch(/^NY 215\d 072\d$/);
    expect(formatOsGridRef(56.7969, -5.0036, 4)).toBe("NN 16 71");
    for (const [lat, lon] of [
      [54.4542, -3.2116],
      [51.5045, -0.1245],
      [57.1, -2.1],
    ] as const) {
      const reference = formatOsGridRef(lat, lon, 10)!;
      expectNear(parseCoordinates(reference), { lat, lon }, 3);
    }
  });

  it("formats and parses its own output", () => {
    const lat = 46.5584;
    const lon = 8.5612;
    expect(parseCoordinates(formatDecimal(lat, lon))).toMatchObject({ lat, lon });
    const dms = parseCoordinates(formatDms(lat, lon, 2))!;
    expect(haversineMeters(lat, lon, dms.lat, dms.lon)).toBeLessThan(1);
    const ddm = parseCoordinates(formatDdm(lat, lon, 4))!;
    expect(haversineMeters(lat, lon, ddm.lat, ddm.lon)).toBeLessThan(1);
  });
});

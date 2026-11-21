/**
 * UTM, UPS and MGRS (packages/shared/src/utm.ts) against published worked examples, all
 * read on 2026-11-21:
 *
 * - NGA.SIG.0012_2.0.0_UTMUPS, "The Universal Grids and the Transverse Mercator and Polar
 *   Stereographic Map Projections" (NGA, 2014), §3.4, §3.6, §7.2, §7.3, §7.5, §10.2,
 *   §10.3, §11 and §12 (the archived copy of the official PDF).
 * - DMA TM 8358.2, "The Universal Grids: UTM and UPS" (1989), §3-7: UPS on WGS 84.
 * - NOAA NGS datasheets for survey marks, each printing a position (NAD 83, on GRS 80,
 *   whose figures differ from WGS 84's by far less than a millimetre in the grid) with
 *   its UTM coordinates, convergence and USNG reference.
 * - FGDC-STD-011-2001, the United States National Grid, §3.3.3 (truncation).
 * - GeographicLib's GeoConvert manual (Karney), a secondary source, for the only polar
 *   MGRS reference found in print.
 */
import {
  formatMgrs,
  fromUps,
  fromUtm,
  haversineMeters,
  parseCoordinateReadings,
  parseMgrs,
  parseUtmReadings,
  toMgrs,
  toUps,
  toUtm,
  transverseMercatorForward,
  transverseMercatorInverse,
  utmConvergence,
  utmZone,
} from "@outpost/shared";
import { describe, expect, it } from "vitest";

const dms = (d: number, m: number, s: number, negative = false) => (negative ? -1 : 1) * (d + m / 60 + s / 3600);

describe("the Transverse Mercator projection (NGA.SIG.0012 §3.4, §3.6)", () => {
  it("projects and inverts the basic form to the nanometre", () => {
    const forward = transverseMercatorForward(3, -10, 1);
    expect(forward.x).toBeCloseTo(-1_117_373.87527102, 6);
    expect(forward.y).toBeCloseTo(336_868.939627688, 6);
    const inverse = transverseMercatorInverse(400_000, 7_000_000, 1);
    expect(inverse.dLon).toBeCloseTo(7.877180802069133, 10);
    expect(inverse.lat).toBeCloseTo(62.88414191006411, 10);
  });
});

describe("UTM (NGA.SIG.0012 §7.2, §7.3)", () => {
  // Lon, lat, easting, northing and convergence from §7.2, all in zone 43 (central meridian 75° E).
  const forward: Array<[number, number, number, number, number]> = [
    [74, 3, 388_870.867643, 331_643.938073, -0.052341],
    [75, 3, 500_000, 331_593.179548, 0],
    [76, 3, 611_129.132357, 331_643.938073, 0.052341],
    [74, -3, 388_870.867643, 9_668_356.061927, 0.052341],
    [76, -3, 611_129.132357, 9_668_356.061927, -0.052341],
  ];
  it("gives the published eastings, northings and convergence", () => {
    for (const [lon, lat, easting, northing, convergence] of forward) {
      const utm = toUtm(lat, lon)!;
      expect(utm.zone).toBe(43);
      expect(utm.easting, `${lat} ${lon}`).toBeCloseTo(easting, 5);
      expect(utm.northing, `${lat} ${lon}`).toBeCloseTo(northing, 5);
      expect(utmConvergence(lat, lon)!).toBeCloseTo(convergence, 5);
    }
    // Example 1 is the same point forced into zone 43 though it lies in 41: the series still hold there.
    expect(toUtm(3, 65, { zone: 43 })!.easting).toBeCloseTo(-616_926.925721, 4);
  });

  it("inverts the published table", () => {
    const inverse: Array<[number, number, number, number]> = [
      [600_000, 0, 75.8986376602, 0],
      [500_000, 2_000_000, 75, 18.0887089431],
      [600_000, 4_000_000, 76.1114780322, 36.1395604499],
      [1_000_000, 6_000_000, 82.6176089075, 53.9061008395],
      [600_000, 8_000_000, 77.9124923218, 72.077536527],
    ];
    for (const [easting, northing, lon, lat] of inverse) {
      const position = fromUtm(43, "N", easting, northing)!;
      expect(position.lon).toBeCloseTo(lon, 9);
      expect(position.lat).toBeCloseTo(lat, 9);
    }
  });

  it("follows the zone rules, Norway and Svalbard included (§7.4, §7.5)", () => {
    expect(utmZone(50, -180)).toBe(1);
    expect(utmZone(50, 180)).toBe(1);
    expect(utmZone(50, 6)).toBe(32); // a zone owns its western edge
    expect(utmZone(60, 3)).toBe(32);
    expect(utmZone(60, 2.99)).toBe(31);
    expect(utmZone(64, 5)).toBe(31);
    expect(utmZone(75, 8.9)).toBe(31);
    expect(utmZone(75, 9)).toBe(33);
    expect(utmZone(75, 20.9)).toBe(33);
    expect(utmZone(75, 21)).toBe(35);
    expect(utmZone(75, 33)).toBe(37);
    expect(utmZone(75, 42)).toBe(38);
    expect(toUtm(84, 0)).toBeNull();
    expect(toUtm(-80.0001, 0)).toBeNull();
  });

  it("matches NGS datasheets for survey marks in four zones, both hemispheres", () => {
    const marks = [
      // HV4442, Washington Monument
      {
        lat: dms(38, 53, 22.08257),
        lon: dms(77, 2, 6.86428, true),
        zone: 18,
        e: 323_483.18,
        n: 4_306_479.506,
        conv: dms(1, 16, 41.1, true),
        usng: "18SUJ2348306479",
      },
      // UW5293, Alaska's North Slope
      {
        lat: dms(71, 15, 38.55451),
        lon: dms(156, 51, 25.87506, true),
        zone: 4,
        e: 576_819.031,
        n: 7_907_834.584,
        conv: dms(2, 1, 45.6),
        usng: "04WEE7681907834",
      }, // NGS prints "4WEE…"
      // AI9478, American Samoa, south of the equator
      {
        lat: dms(14, 14, 59.81407, true),
        lon: dms(170, 40, 16.04304, true),
        zone: 2,
        e: 535_477.126,
        n: 8_424_605.297,
        conv: dms(0, 4, 51.4),
        usng: "02LNK3547724605",
      }, // NGS prints "2LNK…"
      // TW0515, Guam
      {
        lat: dms(13, 28, 2.16837),
        lon: dms(144, 45, 6.54545),
        zone: 55,
        e: 256_612.205,
        n: 1_489_922.657,
        conv: dms(0, 31, 25.8, true),
        usng: "55PBQ5661289922",
      },
    ];
    for (const mark of marks) {
      const utm = toUtm(mark.lat, mark.lon)!;
      expect(utm.zone).toBe(mark.zone);
      expect(utm.easting).toBeCloseTo(mark.e, 2);
      expect(utm.northing).toBeCloseTo(mark.n, 2);
      // Printed to a tenth of a second of arc. South of the equator the datasheet's sign is the other way round from
      // NGA's (§7.2, whose southern rows are tested above, and which Outpost follows): compared by size there.
      const convergence = utmConvergence(mark.lat, mark.lon)!;
      expect(Math.abs((mark.lat < 0 ? Math.abs(convergence) : convergence) - mark.conv)).toBeLessThan(0.1 / 3600);
      expect(formatMgrs(mark.lat, mark.lon, 5, false)).toBe(mark.usng);
      // And read back to the middle of its square.
      const read = parseMgrs(mark.usng)!;
      expect(haversineMeters(read.lat, read.lon, mark.lat, mark.lon)).toBeLessThan(1);
    }
  });
});

describe("UPS (NGA.SIG.0012 §10; DMA TM 8358.2 §3-7)", () => {
  it("projects the published north-zone points", () => {
    const rows: Array<[number, number, number, number]> = [
      [-179, 89, 1_998_062.320046, 2_111_009.610243],
      [-90, 88, 1_777_930.731071, 2_000_000],
      [-1, 87, 1_994_185.827038, 1_666_906.254073],
      [1, 85, 2_009_694.068153, 1_444_627.207468],
      [89, 84, 2_666_626.157825, 1_988_363.997132],
      [179, 81, 2_017_473.190606, 3_001_038.419357],
    ];
    for (const [lon, lat, easting, northing] of rows) {
      const ups = toUps(lat, lon, true)!;
      expect(ups.easting).toBeCloseTo(easting, 5);
      expect(ups.northing).toBeCloseTo(northing, 5);
    }
    expect(toUps(90, 0)).toMatchObject({ easting: 2_000_000, northing: 2_000_000 });
  });

  it("inverts the published south-zone points", () => {
    const rows: Array<[number, number, number, number]> = [
      [1_000_000, 1_000_000, -135, -77.3120791908],
      [2_000_000, 1_000_000, 180, -81.0106632645],
      [3_000_000, 3_000_000, 45, -77.3120791908],
      [1_000_000, 4_000_000, -26.5650511771, -70.0552944014],
    ];
    for (const [easting, northing, lon, lat] of rows) {
      const position = fromUps("S", easting, northing)!;
      expect(Math.abs(((position.lon - lon + 540) % 360) - 180)).toBeLessThan(1e-9);
      expect(position.lat).toBeCloseTo(lat, 9);
    }
    expect(fromUps("S", 2_000_000, 2_000_000)!.lat).toBeCloseTo(-90, 12);
  });

  it("gives TM 8358.2's WGS 84 examples to the centimetre", () => {
    const one = toUps(dms(84, 17, 14.042), dms(132, 14, 52.761, true))!;
    expect(one.northing).toBeCloseTo(2_426_773.6, 1);
    expect(one.easting).toBeCloseTo(1_530_125.78, 1);
    const three = toUps(dms(87, 17, 14.4, true), dms(132, 14, 52.303))!;
    expect(three.northing).toBeCloseTo(1_797_474.9, 1);
    expect(three.easting).toBeCloseTo(2_222_979.47, 1);
    const six = fromUps("S", 2_500_000, 1_500_000)!;
    expect(six.lat).toBeCloseTo(dms(83, 38, 14.343, true), 6);
    expect(six.lon).toBeCloseTo(135, 9);
  });
});

describe("MGRS (NGA.SIG.0012 §11, §12; FGDC-STD-011-2001)", () => {
  it("reads NGA's references to the grid figures they name", () => {
    const tb = parseMgrs("06STB1980012345")!;
    const tbGrid = toUtm(tb.lat, tb.lon)!;
    // The middle of the 1 m square whose corner is x = 219 800, y = 3 612 345 in zone 6.
    expect(tbGrid.zone).toBe(6);
    expect(tbGrid.easting).toBeCloseTo(219_800.5, 3);
    expect(tbGrid.northing).toBeCloseTo(3_612_345.5, 3);
    expect(tb.lon).toBeCloseTo(-149.98596, 4);
    expect(tb.lat).toBeCloseTo(32.6132, 4);
    const fr = toUtm(...(Object.values(parseMgrs("31SFR1500042887")!).slice(0, 2) as [number, number]))!;
    expect(fr.easting).toBeCloseTo(615_000.5, 3);
    expect(fr.northing).toBeCloseTo(3_542_887.5, 3);
  });

  it("accepts a zone without its leading zero, and writes it with one, as §11.1 asks", () => {
    expect(parseMgrs("4WEE7681907834")!.text).toBe("04W EE 76819 07834");
    expect(parseMgrs("04WEE7681907834")!.text).toBe("04W EE 76819 07834");
  });

  it("cuts figures rather than rounding them (FGDC §3.3.3)", () => {
    const mark = { lat: dms(38, 53, 22.08257), lon: dms(77, 2, 6.86428, true) };
    expect(formatMgrs(mark.lat, mark.lon, 1, false)).toBe("18SUJ20");
    expect(formatMgrs(mark.lat, mark.lon, 2, false)).toBe("18SUJ2306");
    expect(formatMgrs(mark.lat, mark.lon, 3, false)).toBe("18SUJ234064");
    expect(formatMgrs(mark.lat, mark.lon, 4, false)).toBe("18SUJ23480647");
    expect(formatMgrs(mark.lat, mark.lon, 5)).toBe("18S UJ 23483 06479");
  });

  it("takes the band from the latitude where a band edge crosses a square (§11.8)", () => {
    // x, y = 649 661, 6 208 679 is just north of 56° N, in band V; 10 m east, the parallel has dropped below it.
    const start = fromUtm(13, "N", 649_661, 6_208_679)!;
    expect(formatMgrs(start.lat, start.lon, 5, false)).toBe("13VFC4966108679");
    const moved = fromUtm(13, "N", 649_671, 6_208_679)!;
    expect(formatMgrs(moved.lat, moved.lon, 5, false)).toBe("13UFC4967108679");
    // The invalid 13VFC4967108679 is read as NGA's §12.9 says many programs do, to the same place.
    expect(haversineMeters(parseMgrs("13VFC4967108679")!.lat, parseMgrs("13VFC4967108679")!.lon, moved.lat, moved.lon)).toBeLessThan(1);
  });

  it("names the poles' squares, and reads GeographicLib's polar example", () => {
    expect(toMgrs(90, 0)).toEqual({ zone: "Z", square: "AH", easting: "00000", northing: "00000" });
    expect(toMgrs(-90, 0)).toEqual({ zone: "B", square: "AN", easting: "00000", northing: "00000" });
    // GeoConvert: 79.9° S 6.1° E is 32CMS4324728161 in its own zone, and BBZ1945517770 in UPS.
    expect(formatMgrs(-79.9, 6.1, 5, false)).toBe("32CMS4324728161");
    const polar = parseMgrs("BBZ1945517770")!;
    expect(haversineMeters(polar.lat, polar.lon, -79.9, 6.1)).toBeLessThan(2);
  });

  it("refuses a square that is not in its zone and band", () => {
    expect(parseMgrs("18SUJ")).not.toBeNull();
    expect(parseMgrs("18SIJ2348306479")).toBeNull();
    expect(parseMgrs("61SUJ2348306479")).toBeNull();
    // Band X ends at 84° N: row letters that would put the point near the pole are not in it.
    expect(parseMgrs("33XWV0000000000")).toBeNull();
    expect(parseMgrs("18SUJ234830647")).toBeNull(); // odd number of figures
  });
});

describe("typed UTM coordinates", () => {
  it("reads the usual spellings", () => {
    for (const text of [
      "18S 323483 4306479",
      "18S 323483E 4306479N",
      "UTM 18S 323483 4306479",
      "18 N 323483 4306479",
      "zone 18 north 323483 4306479",
      "18n 323483m 4306479m",
    ]) {
      const [first] = parseUtmReadings(text);
      expect(first, text).toBeDefined();
      expect(haversineMeters(first!.lat, first!.lon, 38.8895, -77.0352), text).toBeLessThan(30);
    }
  });

  it("offers both meanings of S, and neither when the figures fit no band", () => {
    const both = parseUtmReadings("33S 500000 3800000");
    expect(both).toHaveLength(2);
    expect(both[0]!.lat).toBeGreaterThan(32);
    expect(both[1]!.lat).toBeLessThan(0);
    // Northing 7 000 000 is far north of band S (32° to 40° N); only the southern hemisphere fits.
    expect(parseUtmReadings("33S 500000 7000000").map((reading) => Math.round(reading.lat))).toEqual([-27]);
    expect(parseUtmReadings("33U 50000 5000000")).toEqual([]);
  });

  it("is found by the one parser every screen uses, before the other formats", () => {
    expect(parseCoordinateReadings("18SUJ2348306479")[0]).toMatchObject({ format: "mgrs", reference: "18S UJ 23483 06479" });
    expect(parseCoordinateReadings("UPS N 2000000 2000000")[0]).toMatchObject({ format: "utm", reference: "UPS N 2000000 2000000" });
    // Unchanged: a British grid reference and a locator.
    expect(parseCoordinateReadings("NY 215 072")[0]).toMatchObject({ format: "osgb" });
    expect(parseCoordinateReadings("IO83QM")[0]).toMatchObject({ format: "maidenhead" });
  });
});

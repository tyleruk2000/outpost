/** UTM and MGRS in the readout, the search list and the printed grid. The grid's arithmetic is tested on the server (maps-utm.test.ts). */
import { parseCoordinateReadings } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { gridLabel, utmGrid, utmGridNote, utmSpacing } from "../print/utm-grid";
import { formatPosition, isReadoutFormat, READOUT_FORMATS, READOUT_LABELS } from "./coords";
import { buildSearchResults } from "./search";

describe("the Irish readouts", () => {
  it("gives an Irish Grid reference and ITM in Ireland, at the precision the view can tell apart", () => {
    expect(READOUT_LABELS.irish).toBe("Irish Grid");
    expect(isReadoutFormat("itm")).toBe(true);
    // Dublin's Spire.
    expect(formatPosition(53.3498, -6.2603, "irish")).toEqual({ text: "O 1590 3467", format: "irish" });
    expect(formatPosition(53.3498, -6.2603, "irish", 9).text).toBe("O 159 346");
    expect(formatPosition(53.3498, -6.2603, "itm")).toEqual({ text: "ITM 715826 734697", format: "itm" });
    expect(formatPosition(53.3498, -6.2603, "itm", 9).text).toBe("ITM 715800 734600");
  });

  it("falls back to decimal degrees away from Ireland", () => {
    expect(formatPosition(48.85, 2.35, "irish").format).toBe("decimal");
    expect(formatPosition(48.85, 2.35, "itm").format).toBe("decimal");
  });

  it("lists a typed Irish Grid reference as one, with the size of its square", () => {
    const [reading] = parseCoordinateReadings("O 159 346");
    const [result] = buildSearchResults({ query: "O 159 346", coordinate: reading!, places: [], markers: [], tracks: [], center: null });
    expect(result!.title).toBe("O 159 346");
    expect(result!.detail).toMatch(/^Irish Grid reference, the middle of a 100 m square · 53\.349/);
  });
});

describe("the readout", () => {
  it("offers UTM and MGRS beside the other formats", () => {
    expect(READOUT_FORMATS).toEqual(expect.arrayContaining(["utm", "mgrs"]));
    expect(isReadoutFormat("mgrs")).toBe(true);
    expect(READOUT_LABELS.utm).toBe("UTM");
  });

  it("writes them anywhere on Earth, at a precision the view can tell apart", () => {
    // Sydney Opera House, zoomed right in, then from much further out.
    expect(formatPosition(-33.8568, 151.2153, "utm", 18)).toEqual({ text: expect.stringMatching(/^56H \d{6} \d{7}$/), format: "utm" });
    expect(formatPosition(-33.8568, 151.2153, "mgrs", 18).text).toMatch(/^56H LH \d{5} \d{5}$/);
    expect(formatPosition(-33.8568, 151.2153, "mgrs", 10).text).toMatch(/^56H LH \d{3} \d{3}$/);
    expect(formatPosition(-33.8568, 151.2153, "mgrs", 5).text).toMatch(/^56H LH \d{2} \d{2}$/);
    // At low zoom the UTM figures are rounded to the kilometre.
    expect(formatPosition(-33.8568, 151.2153, "utm", 5).text).toMatch(/^56H \d{3}000 \d{4}000$/);
    // A stored position is shown in full.
    expect(formatPosition(-33.8568, 151.2153, "mgrs").text).toMatch(/^56H LH \d{5} \d{5}$/);
  });

  it("goes over to UPS at the poles", () => {
    expect(formatPosition(90, 0, "mgrs").text).toBe("Z AH 00000 00000");
    expect(formatPosition(-90, 0, "mgrs").text).toBe("B AN 00000 00000");
    expect(formatPosition(-85, 45, "utm").text).toMatch(/^UPS S \d{7} \d{7}$/);
  });
});

describe("search", () => {
  const list = (query: string) => {
    const [coordinate, ...otherReadings] = parseCoordinateReadings(query);
    return buildSearchResults({ query, coordinate: coordinate ?? null, otherReadings, places: [], markers: [], tracks: [], center: null });
  };

  it("finds a typed MGRS reference, saying how big its square is", () => {
    const [result] = list("18SUJ2348706483");
    expect(result).toMatchObject({ kind: "coordinate", title: "18S UJ 23487 06483" });
    expect(result!.detail).toMatch(/^MGRS reference · 38\.889\d\d, -77\.035\d\d$/);
    expect(list("4QFJ1234")[0]!.detail).toMatch(/^MGRS reference, the middle of a 1 km square · /);
  });

  it("finds UTM coordinates, and offers both readings of a zone letter S", () => {
    expect(list("30U 448251 5411932")[0]).toMatchObject({ kind: "coordinate", title: "30U 448251 5411932" });
    const both = list("33S 500000 3800000");
    expect(both.map((result) => result.detail)).toEqual([
      expect.stringMatching(/^UTM coordinates, north of the equator · 34\.34/),
      expect.stringMatching(/^UTM coordinates, south of the equator · -55\.94/),
    ]);
  });
});

describe("the printed UTM grid", () => {
  it("spaces its lines for the scale and labels them in kilometres", () => {
    expect(utmSpacing(15, 54.5)).toBe(1000);
    expect(utmSpacing(11, 54.5)).toBe(10_000);
    expect(gridLabel(448_000, 1000)).toBe("448");
    expect(gridLabel(448_100, 100)).toBe("448.1");
  });

  it("draws lines of the middle's zone across the page and says which", () => {
    const grid = utmGrid([-3.2, 54.4, -3.0, 54.55], 13)!;
    expect(grid.zone).toBe("30U");
    expect(grid.spacing).toBe(1000);
    const eastings = grid.lines.features.filter((feature) => feature.properties.axis === "e");
    const northings = grid.lines.features.filter((feature) => feature.properties.axis === "n");
    // About 13 km across and 17 km down.
    expect(eastings.length).toBeGreaterThanOrEqual(12);
    expect(eastings.length).toBeLessThanOrEqual(15);
    expect(northings.length).toBeGreaterThanOrEqual(16);
    expect(grid.crossesZone).toBe(false);
    expect(utmGridNote(grid)).toBe(
      "The grid is UTM zone 30U on WGS 84, a line every 1 km, each marked with its easting or northing in kilometres.",
    );
    // Across 6° W, the line between zones 29 and 30.
    expect(utmGrid([-6.2, 54.4, -5.7, 54.6], 11)!.crossesZone).toBe(true);
  });
});

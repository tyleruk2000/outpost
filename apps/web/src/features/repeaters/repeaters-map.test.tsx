/** The repeaters' map marks, the printed sheet, distances in the chosen units, and the screen's state kept in its address. */
import type { RepeaterDto, RepeaterListDto } from "@outpost/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { fakeApi, renderScreen } from "../manage/test-support";
import { bandShape, drawRepeaterImage, repeaterImageId } from "./map/band-shapes";
import { repeatersData } from "./map/layers";
import { repeatersDocument } from "./print";
import RepeatersPage from "./repeaters-page";
import { distanceText, withinOptions, withinText } from "./units";

const repeater = (over: Partial<RepeaterDto>): RepeaterDto =>
  ({
    id: "r1",
    callsign: "QZ3AB",
    outputHz: 145_662_500,
    inputHz: 145_062_500,
    band: "2m",
    modes: ["fm"],
    ctcssHz: 94.8,
    dcsCode: null,
    dmrColourCode: null,
    talkgroups: "",
    accessNote: "",
    channel: "",
    place: "THORNWICK",
    region: "",
    country: "",
    lat: 54.521,
    lon: -3.123,
    locator: "IO84KM",
    positionPrecisionMeters: null,
    antennaMeters: null,
    keeper: "",
    status: "operational",
    statusText: "",
    notes: "",
    listId: "l1",
    edited: false,
    ...over,
  }) as unknown as RepeaterDto;

const list = { id: "l1", name: "North list", source: "A made-up society", dataDate: Date.UTC(2026, 9, 1) } as RepeaterListDto;

describe("the marks on the repeaters' map", () => {
  it("draws each band by its shape, hollow when listed as not operational", () => {
    expect(["2m", "70cm", "6m", "10m", "23cm", "13cm", "4m", "other"].map((band) => bandShape(band as RepeaterDto["band"]))).toEqual([
      "circle",
      "square",
      "triangle",
      "triangle",
      "diamond",
      "diamond",
      "other",
      "other",
    ]);
    const data = repeatersData(
      {
        total: 2,
        cells: [],
        points: [
          { id: "a", callsign: "A", lat: 54, lon: -3, outputHz: 430_000_000, band: "70cm", status: "off-air" },
          { id: "b", callsign: "B", lat: 54, lon: -3, outputHz: 145_000_000, band: "2m", status: "operational" },
        ],
      },
      null,
      { centre: { lat: 54, lon: -3 }, meters: 25_000 },
    );
    expect(data.features.map((feature) => [feature.properties.kind, feature.properties.shape, feature.properties.offAir])).toEqual([
      ["within", undefined, undefined],
      ["point", "square", true],
      ["point", "circle", false],
    ]);
    expect(data.features[0]!.geometry.type).toBe("LineString");
    // Names that are not a repeater's mark are left to the map's other pictures.
    expect(drawRepeaterImage("place-home-teal", 2)).toBeNull();
    expect(repeaterImageId("square", "#111111", "#111111", "#ffffff")).toBe("repeater-square|#111111|#111111|#ffffff");
  });

  it("writes distances in miles where heights are in feet, and offers the within distances in the same units", () => {
    expect(distanceText(9290, "m")).toBe("9.29 km");
    expect(distanceText(9290, "ft")).toBe("5.77 mi");
    expect(withinOptions("ft").map((option) => option.label)).toEqual(["5 mi", "10 mi", "25 mi", "50 mi", "100 mi", "200 mi"]);
    expect(withinText(40.2336, "ft")).toBe("25 mi");
    expect(withinText(25, "m")).toBe("25 km");
  });
});

describe("the printed list", () => {
  it("gives each repeater's callsign, frequency, shift, tone, place, distance and bearing, and where it came from", async () => {
    const document = repeatersDocument({
      repeaters: [repeater({ distanceMeters: 9290, bearingDegrees: 179 }), repeater({ id: "r2", callsign: "QZ7CD", lat: null, lon: null })],
      lists: new Map([["l1", list]]),
      order: "nearest to Home first",
      from: "Home",
      filters: ["2 m"],
      total: 2,
      distance: (meters) => distanceText(meters, "m"),
      made: new Date(Date.UTC(2026, 10, 24)),
      paper: "a4",
    });
    const text = contentText(document.content);
    for (const words of ["QZ3AB", "145.6625", "-0.6 MHz", "CTCSS 94.8 Hz", "THORNWICK", "9.29 km, 179° S", "Distance, bearing (true)"])
      expect(text).toContain(words);
    expect(text).toContain("2 repeaters, nearest to Home first. Filters: 2 m.");
    expect(text).toContain("no position");
    expect(text).toContain("A made-up society, data of 1 Oct 2026");
    expect((await renderPdf(document)).pages).toBe(1);
  });
});

describe("the repeaters screen", () => {
  it("reads its filters and place from the address, and says what matched nothing in words", async () => {
    fakeApi({
      "GET /api/maps/markers": { markers: [] },
      "GET /api/repeaters/overview": {
        total: 6,
        withPosition: 6,
        ownCount: 0,
        lists: [],
        bands: { "2m": 2, "70cm": 4 },
        modes: { fm: 6 },
      },
      "GET /api/repeaters": { total: 0, withoutPosition: 0, repeaters: [] },
      "GET /api/repeaters/sources": { regions: [], sources: [], problems: [] },
      "GET /api/repeaters/overlay": { total: 0, points: [], cells: [] },
      "GET /api/maps/sources": { hasTiles: false, attributions: [], imagery: [] },
      "GET /api/maps/overview": { regions: [] },
    });
    renderScreen(<RepeatersPage />, "/radio/repeaters?q=zzzz&band=2m&within=25&from=point:54.45,-2.95");
    expect(await screen.findByText("Nothing matches “zzzz”.")).toBeInTheDocument();
    expect(screen.getByText(/Filters on: 2 m; within 25 km of a point on the map \(54\.45, -2\.95\)\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear the filters" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Measure from" })).toHaveTextContent("A point on the map (54.45, -2.95)");
    expect(screen.getByRole("searchbox", { name: "Find" })).toHaveValue("zzzz");
  });
});

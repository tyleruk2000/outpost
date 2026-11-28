import { describe, expect, it } from "vitest";
import { item } from "./test-data";
import { askedLine, layersText, notKeptLine, overAYearOld, readyFacts, stateLine, statusSentence } from "./words";

describe("the words of Map data", () => {
  it("says what is here: what it holds, its size, where and the day its data is from", () => {
    expect(readyFacts(item(), "Everything, to zoom 15").slice(0, 3)).toEqual(["Everything, to zoom 15", "3.00 GB", "Internal storage"]);
    expect(readyFacts(item({ kind: "names", count: 2_956_719, sizeBytes: 103_000_000 }))).toContain("2,956,719 names");
    const places = readyFacts(item({ kind: "places", layers: ["hospitals", "shelters", "food", "emergency"], count: 89_326 }));
    expect(places[0]).toMatch(/^Hospitals, .+ and 1 more$/);
    expect(places).toContain("89,326 places");
    expect(readyFacts(item({ kind: "roads", locationName: null, sizeBytes: 30_000_000 })).at(-1)).toMatch(/^roads from /);
  });

  it("says where something under way stands, in the person's words", () => {
    expect(stateLine(item({ state: "waiting", ahead: 2 }))).toBe("Waiting behind 2 downloads");
    const behind = "Starts once the walking and cycling build under way (Kent) has finished.";
    expect(
      stateLine(
        item({ kind: "streets", state: "waiting", progress: { current: 0, total: null, unit: null, message: behind, step: null } }),
      ),
    ).toBe(behind);
    expect(
      stateLine(
        item({
          kind: "roads",
          state: "processing",
          progress: { current: 1, total: 2, unit: null, message: "Reading the main roads", step: { at: 2, of: 2 } },
        }),
      ),
    ).toBe("Reading the main roads (step 2 of 2). You can leave this screen.");
    expect(stateLine(item({ state: "failed", reason: "The download stopped: no connection." }))).toBe(
      "The download stopped: no connection.",
    );
    expect(stateLine(item({ state: "missing", reason: null }))).toBe("Its file is missing. Download it again.");
    expect(stateLine(item({ state: "moving", progress: { current: 40, total: 100, unit: null, message: null, step: null } }))).toBe(
      "Being moved, 40%",
    );
    expect(stateLine(item())).toBeNull();
  });

  it("says a country file was read and deleted, with its size", () => {
    const line = notKeptLine({
      regionId: "united-kingdom",
      name: "United Kingdom",
      fileName: "united-kingdom-261116.osm.pbf",
      bytes: 2_290_000_000,
      dataDate: "2026-11-16",
      readAt: Date.UTC(2026, 10, 17, 12),
      kept: false,
    });
    expect(line).toMatch(/^Not kept: read and deleted .+ \(2\.29 GB\)$/);
    expect(notKeptLine(null)).toBe("Not kept. Routes and nearby places are read from it.");
  });

  it("says how much there is and where in one sentence", () => {
    expect(statusSentence({ totalBytes: 0, locations: [] })).toBe("No map data yet.");
    expect(
      statusSentence({ totalBytes: 11_900_000_000, locations: [{ name: "Internal storage", bytes: 11_900_000_000, available: true }] }),
    ).toBe("11.9 GB of map data, all on Internal storage.");
    expect(
      statusSentence({
        totalBytes: 5_200_000_000,
        locations: [
          { name: "Internal storage", bytes: 3_000_000_000, available: true },
          { name: "NAS", bytes: 2_200_000_000, available: true },
        ],
      }),
    ).toBe("5.20 GB of map data, on Internal storage (3.00 GB) and NAS (2.20 GB).");
  });

  it("names who Check sizes asks before it is pressed", () => {
    expect(askedLine(["the map source", null, "Geofabrik (download.geofabrik.de)"])).toBe(
      "The map source and Geofabrik (download.geofabrik.de) are asked how large each is. Nothing is downloaded until you press Download.",
    );
    expect(askedLine(["the map source"])).toMatch(/^The map source is asked how large it is\./);
  });

  it("marks data over a year old, and nothing younger", () => {
    const now = Date.UTC(2026, 10, 23);
    expect(overAYearOld("2025-11-01", now)).toBe(true);
    expect(overAYearOld("2026-01-01", now)).toBe(false);
    expect(overAYearOld(null, now)).toBe(false);
    expect(layersText([])).toBe("");
  });
});

/** The estimated range as GPX and KML for other map apps: well-formed, closed, longitude and latitude the right way round. */
import { haversineMeters } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { rangeFixture } from "@/features/repeaters/map/range-fixture";
import { rangeFileName, rangeGpx, rangeKml, rangeShapes } from "./range-files";

// Far from the equator and west of Greenwich, so a swapped pair would be off Africa's coast, not a rounding away.
const AT = { lat: 57, lon: -3.4 };
const input = (range = rangeFixture("terrain"), name = "Estimated range") => ({
  range,
  name,
  aerialMeters: range.aerialMeters,
  station: "handheld, 1.5 m",
});

function parse(text: string): Document {
  const document = new DOMParser().parseFromString(text, "application/xml");
  expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
  return document;
}

/** [lon, lat] pairs from a KML coordinates element. */
const kmlPairs = (element: Element) =>
  element
    .textContent!.trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number) as [number, number]);

describe("the range outline as files", () => {
  it("follows the furthest ground in sight on each bearing, one corner each, closed", () => {
    // In sight to 18 km to the north half, 6 km to the south.
    const range = rangeFixture("terrain", { seen: (bearing, meters) => meters <= (bearing < 90 || bearing >= 270 ? 18_000 : 6_000) });
    const shapes = rangeShapes(range)!;
    expect(shapes.outline).toHaveLength(range.bearings.length + 1);
    expect(shapes.outline.at(-1)).toEqual(shapes.outline[0]);
    const north = shapes.outline[0]!;
    const south = shapes.outline[range.bearings.length / 2]!;
    expect(haversineMeters(AT.lat, AT.lon, north[1], north[0])).toBeCloseTo(range.bearings[0]!.furthestMeters, -2);
    expect(north[1]).toBeGreaterThan(AT.lat);
    expect(south[1]).toBeLessThan(AT.lat);
    expect(haversineMeters(AT.lat, AT.lon, south[1], south[0])).toBeLessThan(7_000);
    expect(shapes.typical!.ring.at(-1)).toEqual(shapes.typical!.ring[0]);
  });

  it("writes GPX 1.1 that parses, with the point, and each ring a closed track with latitude and longitude in their own attributes", () => {
    const gpx = parse(rangeGpx(input(rangeFixture("terrain"), "Hill <top> & mast"))!);
    expect(gpx.documentElement.namespaceURI).toBe("http://www.topografix.com/GPX/1/1");
    const point = gpx.getElementsByTagName("wpt")[0]!;
    expect(Number(point.getAttribute("lat"))).toBe(AT.lat);
    expect(Number(point.getAttribute("lon"))).toBe(AT.lon);
    expect(point.getElementsByTagName("name")[0]!.textContent).toBe("Hill <top> & mast");
    const tracks = [...gpx.getElementsByTagName("trk")];
    expect(tracks.map((track) => track.getElementsByTagName("name")[0]!.textContent)).toEqual([
      "Furthest ground in sight",
      expect.stringMatching(/^Typical range, /),
    ]);
    for (const track of tracks) {
      const points = [...track.getElementsByTagName("trkpt")].map((trkpt) => [
        Number(trkpt.getAttribute("lat")),
        Number(trkpt.getAttribute("lon")),
      ]);
      expect(points.length).toBeGreaterThan(3);
      expect(points.at(-1)).toEqual(points[0]);
      for (const [lat, lon] of points) {
        expect(Math.abs(lat! - AT.lat)).toBeLessThan(0.5);
        expect(Math.abs(lon! - AT.lon)).toBeLessThan(0.5);
      }
    }
    expect(gpx.getElementsByTagName("desc")[0]!.textContent).toMatch(/line of sight only.*can still be hidden by nearer ground/i);
  });

  it("writes KML 2.2 that parses, the outline a closed polygon with longitude before latitude", () => {
    const kml = parse(rangeKml(input())!);
    expect(kml.documentElement.namespaceURI).toBe("http://www.opengis.net/kml/2.2");
    const [lon, lat] = kmlPairs(kml.querySelector("Point > coordinates")!)[0]!;
    expect([lon, lat]).toEqual([AT.lon, AT.lat]);
    const ring = kmlPairs(kml.querySelector("Polygon outerBoundaryIs LinearRing coordinates")!);
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring.at(-1)).toEqual(ring[0]);
    for (const [x, y] of ring) {
      expect(Math.abs(x - AT.lon)).toBeLessThan(0.5);
      expect(Math.abs(y - AT.lat)).toBeLessThan(0.5);
    }
    const typical = kmlPairs(kml.querySelector("LineString > coordinates")!);
    expect(typical.at(-1)).toEqual(typical[0]);
  });

  it("with no terrain, is the smooth-Earth horizon as a plain circle and says so", () => {
    const range = rangeFixture("none");
    const kml = rangeKml(input(range))!;
    expect(kml).toContain("<name>Smooth-Earth radio horizon</name>");
    expect(kml).toContain("No terrain was held here");
    const ring = kmlPairs(parse(kml).querySelector("LinearRing > coordinates")!);
    expect(ring.at(-1)).toEqual(ring[0]);
    for (const [x, y] of ring.slice(0, -1)) expect(haversineMeters(AT.lat, AT.lon, y, x)).toBeCloseTo(range.horizonMeters, -1);
    expect(parse(rangeGpx(input(range))!).getElementsByTagName("trk")).toHaveLength(1);
  });

  it("has nothing to give when no ground is in sight", () => {
    const range = rangeFixture("terrain", { seen: () => false });
    expect(rangeShapes(range)).toBeNull();
    expect(rangeGpx(input(range))).toBeNull();
    expect(rangeKml(input(range))).toBeNull();
  });

  it("is named for the range", () => {
    expect(rangeFileName("Estimated range", "kml")).toBe("Estimated range.kml");
    expect(rangeFileName("Cairn / mast?", "gpx")).toBe("Cairn mast.gpx");
    expect(rangeFileName("???", "gpx")).toBe("Estimated range.gpx");
  });
});

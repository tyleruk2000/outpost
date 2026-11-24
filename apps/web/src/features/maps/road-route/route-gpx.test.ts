import type { StreetsRouteResult } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { streetsRouteData } from "./layers";
import { buildRouteGpx, routeGpxFileName } from "./route-gpx";
import { CHANNEL_TRIP } from "./test-route";
import { DOOR_TRIP, WALK, WALK_STREETS } from "./test-streets";

const GPX_NS = "http://www.topografix.com/GPX/1/1";

function parse(gpx: string): Document {
  const doc = new DOMParser().parseFromString(gpx, "application/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  expect(doc.documentElement.namespaceURI).toBe(GPX_NS);
  expect(doc.documentElement.getAttribute("version")).toBe("1.1");
  return doc;
}

const all = (doc: Document, tag: string) => Array.from(doc.getElementsByTagNameNS(GPX_NS, tag));
const names = (doc: Document, tag: string) => all(doc, tag).map((el) => el.getElementsByTagNameNS(GPX_NS, "name")[0]?.textContent);

describe("a planned route as GPX", () => {
  it("writes a walk with its via point: the line, the ends and every turn by its instruction", () => {
    const via: StreetsRouteResult = {
      ...WALK,
      request: {
        ...WALK.request,
        points: [WALK.request.points[0]!, { lat: 51.29, lon: -0.325, name: "Mickleham & Co" }, WALK.request.points[1]!],
      },
    };
    const built = buildRouteGpx(via, "Box Hill <walk>");
    const doc = parse(built.gpx);
    expect(names(doc, "wpt")).toEqual(["Start: Leatherhead", "Via 1: Mickleham & Co", "End: Box Hill"]);
    expect(names(doc, "rtept")).toEqual(WALK_STREETS.lines.map((line) => line.text));
    expect(all(doc, "rtept")[1]!.getElementsByTagNameNS(GPX_NS, "desc")[0]!.textContent).toBe(
      "Turn left onto Church Street (B2450), then 600 m",
    );
    expect(all(doc, "trkpt")).toHaveLength(WALK_STREETS.geometry.coordinates.length);
    expect(built).toMatchObject({ waypoints: 3, routePoints: 4, trackPoints: 4 });
    const metadata = all(doc, "metadata")[0]!;
    expect(metadata.getElementsByTagNameNS(GPX_NS, "name")[0]!.textContent).toBe("Box Hill <walk>");
    expect(metadata.getElementsByTagNameNS(GPX_NS, "desc")[0]!.textContent).toContain("routed by Valhalla (MIT licence)");
    expect(metadata.getElementsByTagNameNS(GPX_NS, "time")[0]!.textContent).toBe("2026-11-23T10:00:00Z");
    // GPX 1.1 order inside metadata: name, desc, time, bounds.
    expect(Array.from(metadata.children).map((el) => el.localName)).toEqual(["name", "desc", "time", "bounds"]);
    const first = all(doc, "trkpt")[0]!;
    expect([first.getAttribute("lat"), first.getAttribute("lon")]).toEqual(["51.296500", "-0.330300"]);
  });

  it("writes a drive by its road lines, and a door-to-door drive with the turns at each door", () => {
    const drive = parse(buildRouteGpx(CHANNEL_TRIP, "Alps").gpx);
    expect(names(drive, "rtept")).toEqual(CHANNEL_TRIP.legs.map((leg) => leg.title));
    expect(all(drive, "wpt")).toHaveLength(CHANNEL_TRIP.snapped.length);
    expect(all(drive, "trkseg")).toHaveLength(CHANNEL_TRIP.geometry.coordinates.filter((line) => line.length >= 2).length);
    expect(all(drive, "metadata")[0]!.textContent).toContain(CHANNEL_TRIP.credit.line);

    const door = parse(buildRouteGpx(DOOR_TRIP, "Door to door").gpx);
    const turns = names(door, "rtept");
    expect(turns[0]).toBe("Drive north-east on Bell Lane");
    expect(turns).toContain(CHANNEL_TRIP.legs[0]!.title);
    expect(turns.at(-1)).toBe("Arrive at the end, on the left");
    // The ends are the doors, not where the drive met the main roads.
    const start = all(door, "wpt")[0]!;
    expect([start.getAttribute("lat"), start.getAttribute("lon")]).toEqual(["51.290500", "-0.355500"]);
  });

  it("carries the ferry warning in the track, and draws the ferry dashed on the map", () => {
    const ferry = {
      from: "Lombard Road",
      to: "Cadogan Pier",
      name: "RB6",
      distanceM: 2000,
      coordinates: [
        [-0.18, 51.46],
        [-0.17, 51.48],
      ] as Array<[number, number]>,
    };
    const route: StreetsRouteResult = {
      ...WALK,
      streets: { ...WALK_STREETS, ferries: [ferry] },
      warnings: ["This walk takes a ferry (RB6) from Lombard Road to Cadogan Pier, 2 km on the water."],
    };
    const doc = parse(buildRouteGpx(route, "Olney").gpx);
    expect(all(doc, "trk")[0]!.getElementsByTagNameNS(GPX_NS, "desc")[0]!.textContent).toMatch(/takes a ferry \(RB6\)/);
    const dashed = streetsRouteData(route, null).features.filter((f) => f.properties?.kind === "crossing");
    expect(dashed.map((f) => f.geometry)).toEqual([{ type: "LineString", coordinates: ferry.coordinates }]);
  });

  it("names the file after the route", () => {
    expect(routeGpxFileName("Home to Olney / walk")).toBe("Home to Olney walk.gpx");
    expect(routeGpxFileName("  ")).toBe("Route.gpx");
  });
});

import { haversineMeters } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { drawData, middleMinZoom } from "../map/overlays";
import { hasUnsavedWork, heightsNote, type RouteDraft, terrainCover } from "../panels/route-editor";
import { formatDistance } from "./geo";
import { buildProfile, routeOrigin } from "./profile";
import { addPoint, movePoint, startEdit } from "./route-edit";
import { trackFacts } from "./tracks";

const a = { lat: 53.085, lon: -4.1 };
const b = { lat: 53.0685, lon: -4.0763 };
const c = { lat: 53.06, lon: -4.05 };

/** A drawn route as the server stores it: its points, and the line sampled between them with heights. */
const drawn = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature",
      properties: {
        _gpxType: "trk",
        _drawn: true,
        _elevation: "terrain",
        _profile: [
          [a.lon, a.lat, 437],
          [-4.09, 53.078, 700],
          [-4.083, 53.0733, 960],
          [b.lon, b.lat, 1081],
          [-4.063, 53.064, 820],
          [c.lon, c.lat, 665],
        ],
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lon, a.lat, 437],
          [b.lon, b.lat, 1081],
          [c.lon, c.lat, 665],
        ],
      },
    },
  ],
};

const recorded = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature",
      properties: { _gpxType: "trk", coordinateProperties: { times: ["2026-05-01T08:00:00Z", "2026-05-01T08:30:00Z"] } },
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lon, a.lat, 400],
          [b.lon, b.lat, 1085],
        ],
      },
    },
  ],
};

describe("a drawn route's elevation profile", () => {
  it("is read from the line sampled between the points, not just the points", () => {
    const profile = buildProfile(drawn)!;
    expect(profile.samples).toHaveLength(6);
    expect(profile.maxElevation).toBe(1081);
    expect(profile.minElevation).toBe(437);
    // The samples in between are on the way from one point to the next, in order.
    const distances = profile.samples.map((sample) => sample.distance);
    expect([...distances].sort((x, y) => x - y)).toEqual(distances);
    expect(profile.samples[2]).toMatchObject({ elevation: 960, lat: 53.0733, lon: -4.083 });
  });

  it("skips samples with no height where terrain covers only part of the line", () => {
    const partial = structuredClone(drawn);
    const properties = partial.features[0]!.properties;
    properties._elevation = "partial";
    properties._profile = [...properties._profile.slice(0, 4), [-4.063, 53.064], [c.lon, c.lat]];
    const profile = buildProfile(partial)!;
    expect(profile.samples).toHaveLength(4);
    // Distance still runs to the end of the line, so the chart's axis stays true.
    expect(profile.totalMeters).toBeGreaterThan(profile.samples.at(-1)!.distance);
  });

  it("has none when no terrain was installed", () => {
    const flat = structuredClone(drawn);
    flat.features[0]!.properties = { _gpxType: "trk", _drawn: true, _elevation: "none" } as never;
    flat.features[0]!.geometry.coordinates = flat.features[0]!.geometry.coordinates.map(([lon, lat]) => [lon!, lat!]);
    expect(buildProfile(flat)).toBeNull();
  });

  it("leaves a recording's profile to its own points", () => {
    expect(buildProfile(recorded)!.samples.map((sample) => sample.elevation)).toEqual([400, 1085]);
  });
});

describe("telling how a route came to be", () => {
  it("knows a drawn line and where its heights came from", () => {
    expect(routeOrigin(drawn)).toEqual({ drawn: true, elevation: "terrain", timed: false, recorded: false });
  });

  it("knows a recording, and whether it carries times", () => {
    expect(routeOrigin(recorded)).toEqual({ drawn: false, elevation: null, timed: true, recorded: false });
    const untimed = structuredClone(recorded);
    untimed.features[0]!.properties = { _gpxType: "trk" } as never;
    expect(routeOrigin(untimed)).toEqual({ drawn: false, elevation: null, timed: false, recorded: false });
  });

  it("tells a track recorded on the map from one imported from a file, until its shape is redrawn by hand", () => {
    const onTheMap = structuredClone(recorded);
    onTheMap.features[0]!.properties = { ...onTheMap.features[0]!.properties, _recorded: true } as never;
    expect(routeOrigin(onTheMap)).toEqual({ drawn: false, elevation: null, timed: true, recorded: true });
    const track = { distanceMeters: 3420, ascentMeters: null, pointCount: 3 };
    expect(trackFacts(track, { recorded: true })[1]).toEqual({ label: "Ascent", value: "No heights from the device that recorded it" });
    // A line drawn over it afterwards is a drawn line: nothing of the recording is left in it.
    expect(routeOrigin(drawn).recorded).toBe(false);
  });

  it("says why a drawn route has no ascent, in other words than for a file", () => {
    const track = { distanceMeters: 3420, ascentMeters: null, pointCount: 3 };
    expect(trackFacts(track)[1]).toEqual({ label: "Ascent", value: "No heights in this file" });
    expect(trackFacts(track, { drawn: true })[1]).toEqual({ label: "Ascent", value: "Not known: no terrain installed here" });
    expect(trackFacts({ ...track, ascentMeters: 644 }, { drawn: true })[1]).toEqual({ label: "Ascent", value: "644 m" });
  });
});

describe("what is drawn on the map while drawing", () => {
  const kinds = (data: ReturnType<typeof drawData>) => data.features.map((feature) => feature.properties.kind);

  it("is nothing until there is a point, then a point, then a line with a handle in each leg", () => {
    expect(drawData(null).features).toEqual([]);
    expect(drawData({ points: [], color: "#1f8a8c", selected: null }).features).toEqual([]);
    expect(kinds(drawData({ points: [a], color: "#1f8a8c", selected: null }))).toEqual(["point"]);
    expect(kinds(drawData({ points: [a, b, c], color: "#1f8a8c", selected: null }))).toEqual([
      "line",
      "middle",
      "middle",
      "point",
      "point",
      "point",
    ]);
  });

  it("numbers points and handles so that a press can be traced back to them", () => {
    const data = drawData({ points: [a, b, c], color: "#8d62cc", selected: 1 });
    const points = data.features.filter((feature) => feature.properties.kind === "point");
    expect(points.map((feature) => feature.properties.index)).toEqual([0, 1, 2]);
    expect(points.map((feature) => feature.properties.first)).toEqual([true, false, false]);
    expect(points.map((feature) => feature.properties.selected)).toEqual([false, true, false]);
    // A handle's number is the place a point added there would take.
    expect(data.features.filter((feature) => feature.properties.kind === "middle").map((feature) => feature.properties.index)).toEqual([
      1, 2,
    ]);
    expect(data.features.every((feature) => feature.properties.color === "#8d62cc")).toBe(true);
    // The length so far is written at the last point only.
    const length = haversineMeters(a.lat, a.lon, b.lat, b.lon) + haversineMeters(b.lat, b.lon, c.lat, c.lon);
    expect(length).toBeCloseTo(4418, -1);
    expect(points.map((feature) => feature.properties.label)).toEqual([undefined, undefined, formatDistance(length)]);
    expect(formatDistance(length)).toBe("4.42 km");
  });

  it("keeps handles and crowded points out of the way until there is room for them", () => {
    // A leg of about 2.4 km needs zoom 10 to be 44 px long at this latitude; 24 m needs far more.
    expect(middleMinZoom(a, b)).toBe(10);
    const close = { lat: a.lat + 0.0002, lon: a.lon };
    expect(middleMinZoom(a, close)).toBeGreaterThan(15);
    const data = drawData({ points: [a, close, b, c], color: "#1f8a8c", selected: null });
    const [first, second, third, last] = data.features.filter((feature) => feature.properties.kind === "point");
    // The ends are always drawn whole; a point crowded by a neighbour only once zoomed in.
    expect(first!.properties.minZoom).toBe(0);
    expect(last!.properties.minZoom).toBe(0);
    expect(second!.properties.minZoom).toBeGreaterThan(14);
    expect(third!.properties.minZoom).toBeLessThan(10);
    // The chosen point is drawn whole wherever it is.
    const chosen = drawData({ points: [a, close, b, c], color: "#1f8a8c", selected: 1 });
    expect(chosen.features.filter((feature) => feature.properties.kind === "point")[1]!.properties.minZoom).toBe(0);
  });
});

describe("what the drawing panel says and asks", () => {
  const terrain: [number, number, number, number] = [-4.15, 53.02, -3.98, 53.12];
  const draft = (overrides: Partial<RouteDraft>): RouteDraft => ({
    name: "",
    color: "teal",
    edit: startEdit(),
    selected: null,
    ...overrides,
  });

  it("says before saving whether the route will get heights", () => {
    expect(terrainCover([a, b, c], terrain)).toBe("all");
    expect(terrainCover([a, { lat: 53.2, lon: -3.8 }], terrain)).toBe("some");
    expect(terrainCover([{ lat: 54, lon: -3 }], terrain)).toBe("none");
    expect(terrainCover([a, b], null)).toBe("none");
    expect(heightsNote([a, b], terrain)).toMatch(/^Heights are read from the terrain installed here when you save/);
    expect(heightsNote([a, { lat: 53.2, lon: -3.8 }], terrain)).toMatch(/only part of this line/);
    expect(
      heightsNote(
        [
          { lat: 54, lon: -3 },
          { lat: 54.1, lon: -3 },
        ],
        terrain,
      ),
    ).toMatch(/^No terrain is installed where this line runs/);
    expect(heightsNote([a, b], null)).toMatch(/^No terrain is installed, so .* Terrain can be downloaded with a map region/);
  });

  it("asks before closing a new route once it has a point, and a saved one once it has changed", () => {
    expect(hasUnsavedWork(draft({}))).toBe(false);
    expect(hasUnsavedWork(draft({ name: "Named but empty" }))).toBe(false);
    expect(hasUnsavedWork(draft({ edit: addPoint(startEdit(), a) }))).toBe(true);
    // A copy of a recording starts with points that exist nowhere else yet.
    expect(hasUnsavedWork(draft({ edit: startEdit([a, b]) }))).toBe(true);

    const opened = startEdit([a, b, c]);
    expect(hasUnsavedWork(draft({ trackId: "t1", edit: opened }))).toBe(false);
    expect(hasUnsavedWork(draft({ trackId: "t1", edit: movePoint(opened, 1, c) }))).toBe(true);
    expect(hasUnsavedWork(draft({ trackId: "t1", edit: movePoint(movePoint(opened, 1, c), 1, b) }))).toBe(false);
  });
});

import { computeEffects, type FalloutContour } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  bearing,
  destination,
  EARTH_RADIUS_M,
  groundCircle,
  groundDistance,
  insidePlume,
  placeAgainst,
  plumeHalfWidth,
  plumePolygon,
} from "./geometry";
import { nuclearData } from "./layers";

describe("a ring is a circle on the ground", () => {
  for (const lat of [0, 51.5, 70, -45]) {
    it(`has every point the stated ground distance from its centre at latitude ${lat}`, () => {
      const centre = { lat, lon: 10 };
      for (const metres of [500, 12_000, 150_000]) {
        for (const [lon, pointLat] of groundCircle(centre, metres)) {
          expect(Math.abs(groundDistance(centre, { lat: pointLat, lon }) - metres)).toBeLessThan(metres * 1e-6 + 0.01);
        }
      }
    });
  }

  it("spans more degrees of longitude than of latitude away from the equator, by 1 / cos(latitude), where a circle drawn on the map would span the same", () => {
    const metres = 10_000;
    for (const lat of [0, 51.5, 70]) {
      const ring = groundCircle({ lat, lon: 0 }, metres);
      const lats = ring.map((point) => point[1]);
      const lons = ring.map((point) => point[0]);
      const latSpan = Math.max(...lats) - Math.min(...lats);
      const lonSpan = Math.max(...lons) - Math.min(...lons);
      expect(latSpan).toBeCloseTo((2 * metres) / EARTH_RADIUS_M / (Math.PI / 180), 4);
      expect(lonSpan / latSpan).toBeCloseTo(1 / Math.cos((lat * Math.PI) / 180), 2);
    }
  });

  it("stays whole across the antimeridian", () => {
    const ring = groundCircle({ lat: 10, lon: 179.95 }, 20_000);
    const steps = ring.slice(1).map((point, index) => Math.abs(point[0] - ring[index]![0]));
    expect(Math.max(...steps)).toBeLessThan(1);
  });

  it("puts a point due north at the right distance and bearing", () => {
    const from = { lat: 51.5, lon: -0.1 };
    const to = destination(from, 0, 1000);
    expect(groundDistance(from, to)).toBeCloseTo(1000, 3);
    expect(((bearing(from, to) + 180) % 360) - 180).toBeCloseTo(0, 3);
  });
});

describe("the fallout plume", () => {
  const contour: FalloutContour = { rate: 100, downwindM: 40_000, maxWidthM: 4_000, groundZeroWidthM: 2_000, upwindM: 1_000 };

  it("has the book's dimensions: the width at ground zero, the greatest width, the downwind and upwind reach", () => {
    expect(plumeHalfWidth(contour, 0)).toBeCloseTo(1000, 6);
    expect(plumeHalfWidth(contour, (2 / 3) * 40_000)).toBeCloseTo(2000, 6);
    expect(plumeHalfWidth(contour, 40_000)).toBeCloseTo(0, 6);
    expect(plumeHalfWidth(contour, -1000)).toBeCloseTo(0, 6);
    expect(plumeHalfWidth(contour, 41_000)).toBe(0);
  });

  it("lies downwind: a west wind carries it east", () => {
    const centre = { lat: 54, lon: -3 };
    const polygon = plumePolygon(centre, contour, 270);
    const far = polygon.reduce((best, point) => (point[0] > best[0] ? point : best));
    expect(far[0]).toBeGreaterThan(centre.lon);
    expect(Math.abs(far[1] - centre.lat)).toBeLessThan(0.05);
    expect(insidePlume(centre, destination(centre, 90, 20_000), contour, 270)).toBe(true);
    expect(insidePlume(centre, destination(centre, 270, 20_000), contour, 270)).toBe(false);
    expect(insidePlume(centre, destination(centre, 0, 20_000), contour, 270)).toBe(false);
  });

  it("is drawn as polygons, never a circle, and only for a surface burst with a wind", () => {
    const surface = computeEffects({ yieldKt: 100, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } });
    const air = computeEffects({ yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: { fromDegrees: 270, kmh: 24 } });
    if (!surface.ok || !air.ok) throw new Error("expected answers");
    const visible = { blast: true, thermal: true, radiation: true, fireball: true, fallout: true };
    const kinds = (result: typeof surface.result) =>
      nuclearData([{ letter: "A", selected: true, at: { lat: 54, lon: -3 }, result }], visible).features.map(
        (feature) => feature.properties.kind,
      );
    expect(kinds(surface.result).filter((kind) => kind === "plume")).toHaveLength(4);
    expect(kinds(air.result)).not.toContain("plume");
  });
});

describe("two scenarios on the map", () => {
  it("are told apart by the letter written on every ring and at each ground zero, not by colour alone", () => {
    const a = computeEffects({ yieldKt: 15, burst: { kind: "surface" }, wind: null });
    const b = computeEffects({ yieldKt: 1000, burst: { kind: "optimum", psi: 5 }, wind: null });
    if (!a.ok || !b.ok) throw new Error("expected answers");
    const data = nuclearData(
      [
        { letter: "A", selected: true, at: { lat: 54, lon: -3 }, result: a.result },
        { letter: "B", selected: false, at: { lat: 54.5, lon: -2.5 }, result: b.result },
      ],
      { blast: true, thermal: true, radiation: true, fireball: true, fallout: true },
    );
    for (const feature of data.features.filter((each) => each.properties.kind !== "zone"))
      expect(String(feature.properties.label)).toMatch(new RegExp(`^${feature.properties.scenario}`));
    // The selected scenario is drawn last, over the other.
    expect(data.features.filter((feature) => feature.properties.kind === "zero").map((feature) => feature.properties.label)).toEqual([
      "B",
      "A",
    ]);
  });
});

describe("saved places against a scenario", () => {
  it("are inside the rings whose distance is beyond them and nowhere else", () => {
    const answer = computeEffects({ yieldKt: 15, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } });
    if (!answer.ok) throw new Error("expected an answer");
    const centre = { lat: 54, lon: -3 };
    const five = answer.result.rings.find((ring) => ring.id === "blast-5")!.metres!;
    const one = answer.result.rings.find((ring) => ring.id === "blast-1")!.metres!;
    const place = destination(centre, 180, (five + one) / 2);
    const against = placeAgainst(centre, place, answer.result);
    expect(against.rings.map((ring) => ring.id)).toContain("blast-1");
    expect(against.rings.map((ring) => ring.id)).not.toContain("blast-5");
    // Well upwind of a west wind's plume, no contour reaches; well downwind, some do.
    expect(placeAgainst(centre, destination(centre, 270, 10_000), answer.result).contours).toEqual([]);
    expect(placeAgainst(centre, destination(centre, 90, 20_000), answer.result).contours.length).toBeGreaterThan(0);
  });
});

import { haversineMeters, northsAt, transverseMercatorForward } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { angleOfCut, errorPerDegree, resect } from "./resection";

const DEG = Math.PI / 180;

/**
 * The true bearing from one point to another on the WGS 84 ellipsoid, from a Transverse
 * Mercator plane whose central meridian runs through the first point: there grid north is
 * true north, and the plane is conformal, so the grid bearing is the azimuth to well under
 * a hundredth of a degree over these distances. A different plane from the one resect uses.
 */
function bearing(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const a = transverseMercatorForward(from.lat, 0, 1);
  const b = transverseMercatorForward(to.lat, to.lon - from.lon, 1);
  return (((Math.atan2(b.x - a.x, b.y - a.y) / DEG) % 360) + 360) % 360;
}

const near = (a: { lat: number; lon: number } | null, b: { lat: number; lon: number }) =>
  a ? haversineMeters(a.lat, a.lon, b.lat, b.lon) : Infinity;

// Standing near Scafell Pike, with three summits in view.
const here = { lat: 54.4542, lon: -3.2116 };
const landmarks = [
  { lat: 54.5274, lon: -3.0164 }, // Helvellyn, to the north-east
  { lat: 54.4819, lon: -3.2196 }, // Great Gable, to the north
  { lat: 54.3699, lon: -3.1207 }, // Coniston Old Man, to the south-east
];
const date = Date.UTC(2026, 10, 21);

describe("resection", () => {
  it("finds where you are from true bearings, every line through it", () => {
    const result = resect(
      landmarks.map((position) => ({ position, bearing: bearing(here, position) })),
      "true",
      date,
    );
    expect(result.declination).toBe(0);
    expect(near(result.fix, here)).toBeLessThan(2);
    expect(result.triangleMeters!).toBeLessThan(3);
    for (const crossing of result.crossings) expect(near(crossing.position, here)).toBeLessThan(3);
  });

  it("adds the declination at the place to compass bearings first", () => {
    const declination = northsAt(here.lat, here.lon, date).declination;
    const result = resect(
      landmarks.map((position) => ({ position, bearing: bearing(here, position) - declination })),
      "magnetic",
      date,
    );
    expect(result.declination).toBeCloseTo(declination, 2);
    expect(near(result.fix, here)).toBeLessThan(2);
    // Left as true bearings, the point would be wrong by the declination's swing.
    const uncorrected = resect(
      landmarks.map((position) => ({ position, bearing: bearing(here, position) - declination })),
      "true",
      date,
    );
    expect(near(uncorrected.fix, here)).toBeGreaterThan(near(result.fix, here));
  });

  it("is exact along a meridian: a landmark due north and one due west", () => {
    const north = { lat: 54.5, lon: -3.2 };
    const start = { lat: 54.45, lon: -3.2 };
    const result = resect(
      [
        { position: north, bearing: 0 },
        { position: { lat: 54.45, lon: -3.3 }, bearing: bearing(start, { lat: 54.45, lon: -3.3 }) },
      ],
      "true",
      date,
    );
    expect(near(result.fix, start)).toBeLessThan(2);
    expect(result.triangle).toBeNull();
  });

  it("makes a triangle of error from bearings a few degrees out", () => {
    const result = resect(
      landmarks.map((position, index) => ({ position, bearing: bearing(here, position) + [2, -2, 1][index]! })),
      "true",
      date,
    );
    expect(result.triangle).not.toBeNull();
    expect(result.triangleMeters!).toBeGreaterThan(50);
    // Within about what 2° makes at 15 km, the furthest landmark.
    expect(near(result.fix, here)).toBeLessThan(15_000 * 2 * DEG * 1.2);
  });

  it("says when two lines cannot both be right, and how sharply they cross", () => {
    // Both landmarks said to be to the north, while one is to the south: the lines meet behind it.
    const result = resect(
      [
        { position: landmarks[1]!, bearing: 0 },
        { position: landmarks[2]!, bearing: 350 },
      ],
      "true",
      date,
    );
    expect(result.crossings[0]!.position).toBeNull();
    expect(result.fix).toBeNull();
    expect(angleOfCut(10, 350)).toBe(20);
    expect(angleOfCut(90, 270)).toBe(0);
    expect(angleOfCut(45, 135)).toBe(90);
    // At 3 km, a degree out with a 30° cut moves the crossing about 105 m.
    expect(errorPerDegree(3000, 30)).toBeCloseTo(104.7, 0);
  });
});

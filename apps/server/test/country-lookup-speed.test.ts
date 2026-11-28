/**
 * Country lookups stay quick: a route's coverage samples a point every 5 km, a map's
 * country is looked at on a grid of 289 points, and both run on a Raspberry Pi. The
 * limits leave wide headroom over what this machine takes; they catch a slow path.
 */
import { describe, expect, it } from "vitest";
import { countryOfPoint } from "../src/modules/layers/borders.ts";
import { countryOfArea } from "../src/modules/maps/map-data.ts";
import { coverageOf } from "../src/modules/roads/coverage.ts";

/** A spread of points over Europe, none repeated, so no answer is remembered. */
function points(count: number): Array<{ lat: number; lon: number }> {
  return Array.from({ length: count }, (_, i) => ({ lat: 36 + ((i * 7919) % 2400) / 100, lon: -9 + ((i * 104729) % 3700) / 100 }));
}

const timed = (work: () => void) => {
  const start = performance.now();
  work();
  return performance.now() - start;
};

describe("how long country lookups take", () => {
  it("2,000 points", () => {
    countryOfPoint(51.5, -0.12); // the outlines decoded once
    const all = points(2000);
    const ms = timed(() => {
      for (const p of all) countryOfPoint(p.lat, p.lon);
    });
    console.info(`2,000 country lookups: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(250);
  });

  it("a long route's coverage, and a map's country", () => {
    const ms = timed(() => {
      coverageOf(
        [
          { lat: 51.5074, lon: -0.1278 },
          { lat: 41.9028, lon: 12.4964 },
          { lat: 59.3293, lon: 18.0686 },
        ],
        [],
        [],
        () => null,
      );
    });
    console.info(`coverage London–Rome–Stockholm: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(150);
    const area = timed(() => {
      countryOfArea([5.71, 45.13, 6.47, 45.6], null);
    });
    console.info(`one map's country (289 points): ${area.toFixed(1)} ms`);
    expect(area).toBeLessThan(60);
  });
});

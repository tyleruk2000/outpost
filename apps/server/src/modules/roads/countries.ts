/**
 * Which country a point is in, for road routes: a point no installed network reaches
 * ("No road network is installed for France"), and the countries a leg runs through.
 * The outlines are the server's own (layers/borders.ts, Natural Earth 1:10m simplified to
 * about a kilometre), so a town by a border (Freilassing, Vancouver) or an enclave
 * (Lesotho) is in the right country. A point just off a coast takes the nearest outline
 * within 15 km (COAST_KM); further out it is sea, which is how a crossing is seen.
 */
import { countryFound } from "../layers/borders.ts";

/** ISO alpha-2 of the country whose outline holds the point; else the nearest coast's within 15 km; else null. */
export function countryOfPoint(lat: number, lon: number): string | null {
  return countryFound(lat, lon)?.code ?? null;
}

/** A box wider or taller than this (a world overview) says nothing about where a person drives: it is passed over. */
const WIDEST_BOX_DEG = 40;
const TALLEST_BOX_DEG = 25;

/**
 * The countries some boxes cover, most covered first: each box is looked at on a grid of
 * about 17 by 17 points (never closer than a tenth of a degree), and a country counts by
 * the points that fall in it. A world-sized box is passed over.
 */
export function countriesInBoxes(boxes: ReadonlyArray<readonly [number, number, number, number]>): string[] {
  const hits = new Map<string, number>();
  for (const [west, south, east, north] of boxes) {
    const width = east - west;
    const height = north - south;
    if (!(width >= 0 && height >= 0) || width > WIDEST_BOX_DEG || height > TALLEST_BOX_DEG) continue;
    const stepLon = Math.max(width / 16, 0.1);
    const stepLat = Math.max(height / 16, 0.1);
    for (let lat = south; lat <= north + 1e-9; lat += stepLat) {
      for (let lon = west; lon <= east + 1e-9; lon += stepLon) {
        const code = countryOfPoint(lat, lon);
        if (code) hits.set(code, (hits.get(code) ?? 0) + 1);
      }
    }
  }
  return [...hits.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code);
}

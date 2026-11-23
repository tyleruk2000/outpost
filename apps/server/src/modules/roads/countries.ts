/**
 * Which country a point is in, from Natural Earth's outlines (country-outlines.json,
 * public domain, simplified to about 3 km by scripts/write-country-outlines.mjs). Used
 * where the road data cannot say: a point no installed network reaches ("No road
 * network is installed for France"), and the countries a leg runs through.
 *
 * Near a border or a coast the outline is a few kilometres out; there the country of
 * the network the road came from is taken instead (the hint), and a point just off a
 * coast takes the nearest outline within about 10 km.
 */
import table from "./country-outlines.json" with { type: "json" };

interface Outline {
  code: string;
  ring: Int16Array | Int32Array;
  box: [number, number, number, number];
}

let outlines: Outline[] | null = null;
function load(): Outline[] {
  if (outlines) return outlines;
  outlines = [];
  for (const [code, rings] of Object.entries((table as unknown as { countries: Record<string, number[][]> }).countries)) {
    for (const flat of rings) {
      const ring = Int32Array.from(flat);
      let west = Infinity;
      let south = Infinity;
      let east = -Infinity;
      let north = -Infinity;
      for (let i = 0; i < ring.length; i += 2) {
        west = Math.min(west, ring[i]!);
        east = Math.max(east, ring[i]!);
        south = Math.min(south, ring[i + 1]!);
        north = Math.max(north, ring[i + 1]!);
      }
      outlines.push({ code, ring, box: [west, south, east, north] });
    }
  }
  return outlines;
}

function inside(ring: Int16Array | Int32Array, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!;
    const yi = ring[i + 1]!;
    const xj = ring[j]!;
    const yj = ring[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Hundredths of a degree a point off a coast may be from an outline and still be taken as that country's. */
const COAST = 10;

/** ISO alpha-2 of the country whose outline holds the point; else the nearest within about 10 km; else null. */
export function countryOfPoint(lat: number, lon: number): string | null {
  const x = lon * 100;
  const y = lat * 100;
  const all = load();
  for (const o of all) {
    const [w, s, e, n] = o.box;
    if (x < w || x > e || y < s || y > n) continue;
    if (inside(o.ring, x, y)) return o.code;
  }
  // Just off a coast, or in a gap the simplifying left: the nearest outline point near enough.
  let best: string | null = null;
  let bestD = COAST * COAST;
  for (const o of all) {
    const [w, s, e, n] = o.box;
    if (x < w - COAST || x > e + COAST || y < s - COAST || y > n + COAST) continue;
    for (let i = 0; i < o.ring.length; i += 2) {
      const d = (o.ring[i]! - x) ** 2 + (o.ring[i + 1]! - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o.code;
      }
    }
  }
  return best;
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

/**
 * Which country a point is in, for road routes: a point no installed network reaches
 * ("No road network is installed for France"), and the countries a leg runs through.
 * The outlines are the server's own (layers/borders.ts, Natural Earth 1:10m simplified to
 * about a kilometre), so a town by a border (Freilassing, Vancouver) or an enclave
 * (Lesotho) is in the right country. A point just off a coast takes the nearest outline
 * within 15 km (COAST_KM); further out it is sea, which is how a crossing is seen.
 */
import { countryFound, countryOfPoint as countryOfPointQuick, outlineOf } from "../layers/borders.ts";

/** ISO alpha-2 of the country whose outline holds the point; else the nearest coast's within 15 km; else null. */
export function countryOfPoint(lat: number, lon: number): string | null {
  return countryOfPointQuick(lat, lon);
}

/**
 * Northern Ireland. Geofabrik's Great Britain holds England, Scotland and Wales only; its
 * United Kingdom holds Northern Ireland too. So each network is asked, by its junctions,
 * at its build whether its roads reach Northern Ireland, and a point there is not taken as
 * covered by one whose roads do not. The outline is the United Kingdom's ring on the
 * island of Ireland in the bundled borders.
 */
const NI_BOX: readonly [number, number, number, number] = [-8.3, 53.9, -5.3, 55.4];
let niRing: Float64Array | null | undefined;
function northernIrelandRing(): Float64Array | null {
  if (niRing !== undefined) return niRing;
  let best: Float64Array | null = null;
  for (const ring of outlineOf("GB")?.rings ?? []) {
    let fits = ring.length >= 6;
    for (let i = 0; fits && i < ring.length; i += 2) {
      if (ring[i]! < NI_BOX[0] || ring[i]! > NI_BOX[2] || ring[i + 1]! < NI_BOX[1] || ring[i + 1]! > NI_BOX[3]) fits = false;
    }
    if (fits && (!best || ring.length > best.length)) best = ring;
  }
  niRing = best;
  return niRing;
}

function inRing(ring: Float64Array, lon: number, lat: number): boolean {
  let odd = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!;
    const yi = ring[i + 1]!;
    const xj = ring[j]!;
    const yj = ring[j + 1]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
}

/** Squared distance, in degrees of latitude, from a point to a ring's edges (longitude scaled by `k`). */
function ringDistance(ring: Float64Array, lon: number, lat: number, k: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const ax = (ring[j]! - lon) * k;
    const ay = ring[j + 1]! - lat;
    const dx = (ring[i]! - lon) * k - ax;
    const dy = ring[i + 1]! - lat - ay;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
    const px = ax + t * dx;
    const py = ay + t * dy;
    if (px * px + py * py < best) best = px * px + py * py;
  }
  return best;
}

/**
 * True for a point in Northern Ireland: inside its outline, or, where the simplified coast
 * leaves a harbour or a lough offshore (Portrush, Larne, Belfast Lough), a point the
 * outlines give the United Kingdom whose nearest United Kingdom coast is Northern Ireland's.
 */
export function inNorthernIreland(lat: number, lon: number): boolean {
  if (lon < NI_BOX[0] || lon > NI_BOX[2] || lat < NI_BOX[1] || lat > NI_BOX[3]) return false;
  const ring = northernIrelandRing();
  if (!ring) return false;
  if (inRing(ring, lon, lat)) return true;
  const found = countryFound(lat, lon);
  if (found?.code !== "GB" || !found.offshore) return false;
  const k = Math.cos((lat * Math.PI) / 180);
  const toUlster = ringDistance(ring, lon, lat, k);
  for (const other of outlineOf("GB")?.rings ?? []) {
    if (other !== ring && ringDistance(other, lon, lat, k) < toUlster) return false;
  }
  return true;
}

/**
 * Junctions in Northern Ireland a network needs before its roads are said to reach it: one
 * is not enough (Great Britain's may hold the Larne end of the ferry from Cairnryan), two
 * are a road. Only junctions and road ends are nodes, so a road through Belfast is two.
 */
const NI_ENOUGH = 2;

/** Whether a network's junctions (in 1e-7 degrees, as built) reach Northern Ireland. */
export function reachesNorthernIreland(nodeLat: ArrayLike<number>, nodeLon: ArrayLike<number>): boolean {
  let found = 0;
  for (let i = 0; i < nodeLat.length; i += 1) {
    if (inNorthernIreland(nodeLat[i]! * 1e-7, nodeLon[i]! * 1e-7)) found += 1;
    if (found >= NI_ENOUGH) return true;
  }
  return false;
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

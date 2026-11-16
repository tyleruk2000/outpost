/**
 * The arithmetic of putting a satellite picture on the map.
 *
 * The map is Web Mercator, in 256-pixel tiles. Blue Marble is in plain latitude and
 * longitude (equirectangular). Sentinel-2 scenes are each in one zone of the Universal
 * Transverse Mercator projection on WGS 84 (EPSG 32601–32660 north, 32701–32760 south).
 * Every pixel of a map tile is taken back to latitude and longitude, and from there into
 * the picture's own grid, where its value is read: the picture is never warped forwards.
 */

export const TILE_SIZE = 256;
const EARTH_RADIUS = 6378137;

/** Longitude and latitude of a point given in pixels of the whole world at zoom `z`. */
export function worldPixelToLonLat(px: number, py: number, z: number): [number, number] {
  const size = TILE_SIZE * 2 ** z;
  const lon = (px / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * py) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lon, lat];
}

/** Pixels of the whole world at zoom `z` of a longitude and latitude. */
export function lonLatToWorldPixel(lon: number, lat: number, z: number): [number, number] {
  const size = TILE_SIZE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = ((lon + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return [x, y];
}

/** Metres on the ground of one map pixel at zoom `z` and latitude `lat`. */
export function groundResolution(z: number, lat: number): number {
  return (2 * Math.PI * EARTH_RADIUS * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** z);
}

/**
 * The deepest zoom worth making from a picture of `metres` per pixel at latitude `lat`:
 * the first zoom whose map pixels are as fine as the picture's, and no deeper. Beyond it
 * each picture pixel would be spread over more than two map pixels, which shows nothing
 * new; the map enlarges the last zoom by itself when someone zooms in further.
 */
export function honestMaxZoom(metres: number, lat: number): number {
  for (let z = 0; z <= 22; z += 1) if (groundResolution(z, lat) <= metres) return z;
  return 22;
}

// ── Universal Transverse Mercator on WGS 84 ──────────────────────────────────

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const N = F / (2 - F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
/** Rectifying radius. */
const RECTIFYING = (A / (1 + N)) * (1 + N2 / 4 + N4 / 64);
/** Krüger's series to the fourth order: well under a millimetre within a zone. */
const ALPHA = [
  N / 2 - (2 / 3) * N2 + (5 / 16) * N3 + (41 / 180) * N4,
  (13 / 48) * N2 - (3 / 5) * N3 + (557 / 1440) * N4,
  (61 / 240) * N3 - (103 / 140) * N4,
  (49561 / 161280) * N4,
];
const E = Math.sqrt(F * (2 - F));

/** The UTM zone and hemisphere of an EPSG code, or undefined if it is not a WGS 84 UTM code. */
export function utmZoneOf(epsg: number): { zone: number; south: boolean } | undefined {
  if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, south: false };
  if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, south: true };
  return undefined;
}

/** Easting and northing, in metres, of a longitude and latitude in a UTM zone. */
export function lonLatToUtm(lon: number, lat: number, zone: number, south: boolean): [number, number] {
  const lambda0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180 - lambda0;
  const sinPhi = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sinPhi) - E * Math.atanh(E * sinPhi));
  const xiPrime = Math.atan2(t, Math.cos(lambda));
  const etaPrime = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let xi = xiPrime;
  let eta = etaPrime;
  for (let j = 1; j <= 4; j += 1) {
    const alpha = ALPHA[j - 1]!;
    xi += alpha * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    eta += alpha * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }
  const easting = 500000 + K0 * RECTIFYING * eta;
  const northing = (south ? 10000000 : 0) + K0 * RECTIFYING * xi;
  return [easting, northing];
}

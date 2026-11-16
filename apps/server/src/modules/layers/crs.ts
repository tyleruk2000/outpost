/**
 * Coordinate reference systems: every position Outpost keeps is WGS 84 latitude and
 * longitude in degrees. A file in another system is converted if it is one of the two
 * met most often (Web Mercator, and the British National Grid that British councils
 * publish in) and refused with a plain message otherwise. Nothing is placed by guessing.
 *
 * The Swiss grids (LV95, EPSG:2056, and the older LV03, EPSG:21781), in which Swiss
 * federal and cantonal geodata are published, are converted with swisstopo's published
 * approximate formulas ("Approximate formulas for the transformation between Swiss
 * projection coordinates and WGS84"), which swisstopo gives as good to about a metre.
 *
 * The British National Grid is converted with the published Helmert transformation from
 * OSGB36 to WGS 84 (Ordnance Survey, "A guide to coordinate systems in Great Britain",
 * section 6.6). Ordnance Survey gives its accuracy as about 5 metres; the exact
 * transformation (OSTN15) needs a grid file that is not shipped.
 */

export class CrsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrsError";
  }
}

export type Converter = (x: number, y: number) => [lon: number, lat: number];

/** What a converter adds to a feature's stated accuracy. */
export interface Crs {
  name: string;
  convert: Converter | null;
  /** Metres of error the conversion itself may add. */
  errorMeters: number;
}

const WGS84: Crs = { name: "WGS 84", convert: null, errorMeters: 0 };

const webMercator: Converter = (x, y) => {
  const lon = (x / 6378137) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
};

/** British National Grid easting and northing to OSGB36 latitude and longitude, in radians (the guide's section C.2). */
export function nationalGridToOsgb36(easting: number, northing: number): [phi: number, lambda: number] {
  // Airy 1830 ellipsoid and the National Grid's projection.
  const a = 6377563.396;
  const b = 6356256.909;
  const F0 = 0.9996012717;
  const lat0 = (49 * Math.PI) / 180;
  const lon0 = (-2 * Math.PI) / 180;
  const N0 = -100000;
  const E0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  let lat = lat0;
  let M = 0;
  do {
    lat = (northing - N0 - M) / (a * F0) + lat;
    const Ma = (1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * (lat - lat0);
    const Mb = (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
    const Mc = ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
    const Md = (35 / 24) * n ** 3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
    M = b * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(northing - N0 - M) >= 0.00001);
  const sinLat = Math.sin(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * F0 * (1 - e2)) / (1 - e2 * sinLat * sinLat) ** 1.5;
  const eta2 = nu / rho - 1;
  const tanLat = Math.tan(lat);
  const secLat = 1 / Math.cos(lat);
  const VII = tanLat / (2 * rho * nu);
  const VIII = (tanLat / (24 * rho * nu ** 3)) * (5 + 3 * tanLat ** 2 + eta2 - 9 * tanLat ** 2 * eta2);
  const IX = (tanLat / (720 * rho * nu ** 5)) * (61 + 90 * tanLat ** 2 + 45 * tanLat ** 4);
  const X = secLat / nu;
  const XI = (secLat / (6 * nu ** 3)) * (nu / rho + 2 * tanLat ** 2);
  const XII = (secLat / (120 * nu ** 5)) * (5 + 28 * tanLat ** 2 + 24 * tanLat ** 4);
  const XIIA = (secLat / (5040 * nu ** 7)) * (61 + 662 * tanLat ** 2 + 1320 * tanLat ** 4 + 720 * tanLat ** 6);
  const dE = easting - E0;
  const phi = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
  const lambda = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;
  return [phi, lambda];
}

/** British National Grid easting and northing to WGS 84, through OSGB36 and a Helmert transformation. */
export const britishNationalGrid: Converter = (easting, northing) => {
  const [phi, lambda] = nationalGridToOsgb36(easting, northing);
  const a = 6377563.396;
  const b = 6356256.909;
  const e2 = 1 - (b * b) / (a * a);
  // OSGB36 latitude and longitude to Cartesian, Helmert to WGS 84, and back.
  const sinPhi = Math.sin(phi);
  const nuA = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const x1 = nuA * Math.cos(phi) * Math.cos(lambda);
  const y1 = nuA * Math.cos(phi) * Math.sin(lambda);
  const z1 = (1 - e2) * nuA * sinPhi;
  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = 20.4894e-6;
  const rx = ((0.1502 / 3600) * Math.PI) / 180;
  const ry = ((0.247 / 3600) * Math.PI) / 180;
  const rz = ((0.8421 / 3600) * Math.PI) / 180;
  const x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1;
  const y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1;
  const z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1;
  const aW = 6378137;
  const bW = 6356752.3142;
  const e2W = 1 - (bW * bW) / (aW * aW);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let latW = Math.atan2(z2, p * (1 - e2W));
  for (let i = 0; i < 10; i += 1) {
    const nuW = aW / Math.sqrt(1 - e2W * Math.sin(latW) ** 2);
    latW = Math.atan2(z2 + e2W * nuW * Math.sin(latW), p);
  }
  const lonW = Math.atan2(y2, x2);
  return [(lonW * 180) / Math.PI, (latW * 180) / Math.PI];
};

/** Swiss LV95 (offset 2,600,000 / 1,200,000) or LV03 (600,000 / 200,000) to WGS 84, by swisstopo's approximate formulas. */
export function swissGrid(eastOffset: number, northOffset: number): Converter {
  return (easting, northing) => {
    const y = (easting - eastOffset) / 1e6;
    const x = (northing - northOffset) / 1e6;
    const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
    const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x ** 3;
    return [(lon * 100) / 36, (lat * 100) / 36];
  };
}

const KNOWN: Array<{ pattern: RegExp; crs: Crs }> = [
  { pattern: /^(?:urn:ogc:def:crs:)?(?:OGC:(?:1\.3:)?)?CRS84$/i, crs: WGS84 },
  { pattern: /^(?:urn:ogc:def:crs:)?EPSG:{1,2}4326$/i, crs: WGS84 },
  { pattern: /^(?:urn:ogc:def:crs:)?EPSG:{1,2}(?:3857|900913|3785)$/i, crs: { name: "Web Mercator (EPSG:3857)", convert: webMercator, errorMeters: 0 } },
  { pattern: /^(?:urn:ogc:def:crs:)?EPSG:{1,2}2056$/i, crs: { name: "Swiss LV95 (EPSG:2056)", convert: swissGrid(2_600_000, 1_200_000), errorMeters: 1 } },
  { pattern: /^(?:urn:ogc:def:crs:)?EPSG:{1,2}21781$/i, crs: { name: "Swiss LV03 (EPSG:21781)", convert: swissGrid(600_000, 200_000), errorMeters: 1 } },
  {
    pattern: /^(?:urn:ogc:def:crs:)?EPSG:{1,2}27700$/i,
    crs: { name: "British National Grid (EPSG:27700)", convert: britishNationalGrid, errorMeters: 5 },
  },
];

/** The system a CRS name (as GeoJSON's old `crs` member or a form field gives it) stands for. */
export function crsFromName(name: string | null | undefined): Crs {
  if (!name) return WGS84;
  const trimmed = name.trim().replace(/^http:\/\/www\.opengis\.net\/def\/crs\/EPSG\/0\//i, "EPSG:");
  if (/^\d+$/.test(trimmed)) return crsFromName(`EPSG:${trimmed}`);
  for (const known of KNOWN) if (known.pattern.test(trimmed)) return known.crs;
  throw new CrsError(
    `This file's coordinates are in ${trimmed}, which Outpost does not convert. Save it again in WGS 84 (EPSG:4326), for example with QGIS ("Export, Save features as", CRS EPSG:4326), and import that.`,
  );
}

/** The `crs` member of a GeoJSON object, if it has one (it was dropped from the format in RFC 7946, but files still carry it). */
export function geoJsonCrs(object: unknown): Crs {
  if (typeof object !== "object" || object === null) return WGS84;
  const member = (object as { crs?: { properties?: { name?: unknown; code?: unknown } } }).crs;
  if (!member) return WGS84;
  const name = member.properties?.name ?? member.properties?.code;
  return crsFromName(typeof name === "string" || typeof name === "number" ? String(name) : null);
}

/**
 * Checks a WGS 84 position. A value out of range is reported in words that say what
 * is likely wrong: projected metres, or latitude and longitude the wrong way round.
 */
export function checkDegrees(lon: number, lat: number): string | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return "it has no usable position";
  if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return null;
  if (Math.abs(lon) <= 90 && Math.abs(lat) <= 180) return "its latitude and longitude look the wrong way round";
  return "its coordinates are not degrees (they look like metres in a projected system)";
}

/** Converts a position given in `crs` to WGS 84 and checks it. */
export function toWgs84(crs: Crs, x: number, y: number): [number, number] {
  const [lon, lat] = crs.convert ? crs.convert(x, y) : [x, y];
  const problem = checkDegrees(lon, lat);
  if (problem) throw new CrsError(`A position could not be used: ${problem}.`);
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

/** Applies `fn` to every position of a GeoJSON geometry's coordinates, returning new coordinates. */
export function mapCoordinates(coordinates: unknown, fn: (x: number, y: number) => [number, number], depth = 0): unknown {
  if (depth > 6 || !Array.isArray(coordinates)) throw new CrsError("A shape in the file is not made of positions.");
  if (typeof coordinates[0] === "number") {
    const [x, y] = coordinates as number[];
    if (typeof x !== "number" || typeof y !== "number") throw new CrsError("A position in the file is not two numbers.");
    return fn(x, y);
  }
  return coordinates.map((child) => mapCoordinates(child, fn, depth + 1));
}

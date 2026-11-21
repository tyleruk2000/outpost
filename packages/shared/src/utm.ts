/**
 * UTM, UPS and MGRS: the grids most of the world's topographic maps, GPS receivers and
 * search and rescue teams give positions in.
 *
 * - UTM (Universal Transverse Mercator) divides the Earth from 80° S to 84° N into sixty
 *   zones 6° of longitude wide, each a Transverse Mercator projection of the WGS 84
 *   ellipsoid with a scale of 0.9996 on its central meridian, eastings from 500 000 m
 *   there and northings from the equator (10 000 000 m at the equator for the south).
 *   South-west Norway (zone 32V) and Svalbard (31X to 37X) have zones of other widths.
 * - UPS (Universal Polar Stereographic) covers the two caps the zones leave: north of
 *   84° N and south of 80° S, a polar stereographic projection with a scale of 0.994 at
 *   the pole and both false origins 2 000 000 m.
 * - MGRS (the Military Grid Reference System, and the US National Grid, which is the same
 *   thing written with spaces) names the 100 km square a point is in by two letters, after
 *   the zone and its 8° band of latitude, then gives the easting and northing inside it,
 *   cut (not rounded) to the precision wanted: "18S UJ 23483 06479".
 *
 * The projection is Krüger's series to the sixth order in the third flattening (n), and
 * agrees with the worked examples of NGA.SIG.0012_2.0.0 ("The Universal Grids and the
 * Transverse Mercator and Polar Stereographic Map Projections", 2014) to the micrometre
 * (apps/server/test/maps-utm.test.ts). Zones, bands and letters follow the same document
 * (§7, §10, §11). WGS 84 only: MGRS on older ellipsoids used other letters ("AL"), which
 * are not read here.
 */

export interface Spheroid {
  /** Semi-major axis, metres. */
  a: number;
  /** Flattening. */
  f: number;
}

export const WGS84_SPHEROID: Spheroid = { a: 6_378_137, f: 1 / 298.257223563 };

const DEG = Math.PI / 180;
const UTM_K0 = 0.9996;
const UPS_K0 = 0.994;
const FALSE_EASTING = 500_000;
const SOUTH_FALSE_NORTHING = 10_000_000;
const UPS_FALSE = 2_000_000;

/** The 8° bands of latitude, C at 80° S to X, which is 12° deep and ends at 84° N. */
const BANDS = "CDEFGHJKLMNPQRSTUVWX";

/** Krüger's coefficients for one ellipsoid. */
interface Series {
  A: number;
  alpha: number[];
  beta: number[];
  e: number;
}

const seriesCache = new Map<string, Series>();

function seriesFor(spheroid: Spheroid): Series {
  const key = `${spheroid.a}/${spheroid.f}`;
  const cached = seriesCache.get(key);
  if (cached) return cached;
  const { a, f } = spheroid;
  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const n5 = n4 * n;
  const n6 = n5 * n;
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
  // Krüger's series: α for the forward projection, β for the inverse.
  const alpha = [
    n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4 - (127 / 288) * n5 + (7891 / 37800) * n6,
    (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4 + (281 / 630) * n5 - (1983433 / 1935360) * n6,
    (61 / 240) * n3 - (103 / 140) * n4 + (15061 / 26880) * n5 + (167603 / 181440) * n6,
    (49561 / 161280) * n4 - (179 / 168) * n5 + (6601661 / 7257600) * n6,
    (34729 / 80640) * n5 - (3418889 / 1995840) * n6,
    (212378941 / 319334400) * n6,
  ];
  const beta = [
    n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4 - (81 / 512) * n5 + (96199 / 604800) * n6,
    (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4 + (46 / 105) * n5 - (1118711 / 3870720) * n6,
    (17 / 480) * n3 - (37 / 840) * n4 - (209 / 4480) * n5 + (5569 / 90720) * n6,
    (4397 / 161280) * n4 - (11 / 504) * n5 - (830251 / 7257600) * n6,
    (4583 / 161280) * n5 - (108847 / 3991680) * n6,
    (20648693 / 638668800) * n6,
  ];
  const series = { A, alpha, beta, e: Math.sqrt(f * (2 - f)) };
  seriesCache.set(key, series);
  return series;
}

/** The conformal latitude's tangent, τ′, from the latitude's, τ. */
function conformalTan(tau: number, e: number): number {
  const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
  return tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
}

/** The latitude's tangent from the conformal latitude's, by Newton's method. */
function geographicTan(tauPrime: number, e: number): number {
  const e2 = e * e;
  let tau = tauPrime;
  for (let i = 0; i < 10; i += 1) {
    const prime = conformalTan(tau, e);
    const step = ((tauPrime - prime) / Math.sqrt(1 + prime * prime)) * ((1 + (1 - e2) * tau * tau) / ((1 - e2) * Math.sqrt(1 + tau * tau)));
    tau += step;
    if (Math.abs(step) < 1e-14) break;
  }
  return tau;
}

/**
 * Transverse Mercator easting and northing, before the false origin, of a position
 * `dLon` degrees from the central meridian. `k0` is the scale on the central meridian.
 */
export function transverseMercatorForward(
  lat: number,
  dLon: number,
  k0: number,
  spheroid: Spheroid = WGS84_SPHEROID,
): { x: number; y: number } {
  const { A, alpha, e } = seriesFor(spheroid);
  const phi = lat * DEG;
  const lambda = dLon * DEG;
  // At a pole τ is infinite; the series still give the right answer from a very large one.
  const tau = Math.abs(lat) >= 90 ? Math.sign(lat) * 1e15 : Math.tan(phi);
  const tauPrime = conformalTan(tau, e);
  const cosL = Math.cos(lambda);
  const xiPrime = Math.atan2(tauPrime, cosL);
  const etaPrime = Math.asinh(Math.sin(lambda) / Math.hypot(tauPrime, cosL));
  let xi = xiPrime;
  let eta = etaPrime;
  for (let j = 1; j <= 6; j += 1) {
    const c = alpha[j - 1]!;
    xi += c * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    eta += c * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }
  return { x: k0 * A * eta, y: k0 * A * xi };
}

/** The inverse of `transverseMercatorForward`: latitude and the longitude from the central meridian, degrees. */
export function transverseMercatorInverse(
  x: number,
  y: number,
  k0: number,
  spheroid: Spheroid = WGS84_SPHEROID,
): { lat: number; dLon: number } {
  const { A, beta, e } = seriesFor(spheroid);
  const xi = y / (k0 * A);
  const eta = x / (k0 * A);
  let xiPrime = xi;
  let etaPrime = eta;
  for (let j = 1; j <= 6; j += 1) {
    const c = beta[j - 1]!;
    xiPrime -= c * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= c * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const sinhEta = Math.sinh(etaPrime);
  const sinXi = Math.sin(xiPrime);
  const cosXi = Math.cos(xiPrime);
  const tauPrime = sinXi / Math.hypot(sinhEta, cosXi);
  const tau = geographicTan(tauPrime, e);
  return { lat: Math.atan(tau) / DEG, dLon: Math.atan2(sinhEta, cosXi) / DEG };
}

// ── Zones ───────────────────────────────────────────────────────────────────

export type Hemisphere = "N" | "S";

export interface UtmPosition {
  kind: "utm";
  zone: number;
  /** The 8° band of latitude, C to X. */
  band: string;
  hemisphere: Hemisphere;
  easting: number;
  northing: number;
}

export interface UpsPosition {
  kind: "ups";
  hemisphere: Hemisphere;
  easting: number;
  northing: number;
}

export type GridPosition = UtmPosition | UpsPosition;

/** The band letter of a latitude between 80° S and 84° N, or null outside UTM. */
export function utmBand(lat: number): string | null {
  if (!(lat >= -80 && lat < 84)) return null;
  return BANDS[Math.min(19, Math.floor((lat + 80) / 8))]!;
}

/** The zone a position belongs to, with the exceptions for south-west Norway and Svalbard. */
export function utmZone(lat: number, lon: number): number {
  const lonNorm = lon >= 180 ? lon - 360 : lon;
  let zone = Math.floor((lonNorm + 180) / 6) + 1;
  if (zone > 60) zone = 60;
  if (lat >= 56 && lat < 64 && lonNorm >= 3 && lonNorm < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if (lonNorm >= 0 && lonNorm < 9) zone = 31;
    else if (lonNorm >= 9 && lonNorm < 21) zone = 33;
    else if (lonNorm >= 21 && lonNorm < 33) zone = 35;
    else if (lonNorm >= 33 && lonNorm < 42) zone = 37;
  }
  return zone;
}

/** The longitude of a zone's central meridian. */
export const centralMeridian = (zone: number) => (zone - 1) * 6 - 180 + 3;

const finite = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/**
 * UTM coordinates of a WGS 84 position, in its own zone or in `zone` if given (to work
 * near a zone's edge in the next one). Null outside 80° S to 84° N, where UPS is used.
 * `hemisphere` forces the northing's origin, for a point a little across the equator.
 */
export function toUtm(
  lat: number,
  lon: number,
  options: { zone?: number; hemisphere?: Hemisphere /** Past 80° S or 84° N, for working near the edge. */; beyond?: boolean } = {},
): UtmPosition | null {
  if (!finite(lat, lon)) return null;
  const band = utmBand(lat) ?? (options.beyond ? (lat < 0 ? "C" : "X") : null);
  if (!band) return null;
  const zone = options.zone ?? utmZone(lat, lon);
  let dLon = lon - centralMeridian(zone);
  dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
  const { x, y } = transverseMercatorForward(lat, dLon, UTM_K0);
  const hemisphere = options.hemisphere ?? (lat < 0 ? "S" : "N");
  return {
    kind: "utm",
    zone,
    band,
    hemisphere,
    easting: FALSE_EASTING + x,
    northing: (hemisphere === "S" ? SOUTH_FALSE_NORTHING : 0) + y,
  };
}

/** WGS 84 position of UTM coordinates. Null for coordinates that are not on the Earth. */
export function fromUtm(zone: number, hemisphere: Hemisphere, easting: number, northing: number): { lat: number; lon: number } | null {
  if (!Number.isInteger(zone) || zone < 1 || zone > 60 || !Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  const x = easting - FALSE_EASTING;
  const y = northing - (hemisphere === "S" ? SOUTH_FALSE_NORTHING : 0);
  // A zone is about 670 km wide at the equator; well past that the series are no longer sound.
  if (Math.abs(x) > 1_000_000 || Math.abs(y) > 10_000_000) return null;
  const { lat, dLon } = transverseMercatorInverse(x, y, UTM_K0);
  let lon = centralMeridian(zone) + dLon;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return finite(lat, lon) ? { lat, lon } : null;
}

/** The factor polar stereographic needs, √((1+e)^(1+e) (1−e)^(1−e)). */
const polarFactor = (e: number) => Math.sqrt((1 + e) ** (1 + e) * (1 - e) ** (1 - e));

/** UPS coordinates of a position: north of 84° N or south of 80° S, unless `force` asks for it anywhere in that hemisphere. */
export function toUps(lat: number, lon: number, force = false): UpsPosition | null {
  if (!finite(lat, lon)) return null;
  if (!force && lat < 84 && lat >= -80) return null;
  const { a } = WGS84_SPHEROID;
  const { e } = seriesFor(WGS84_SPHEROID);
  const north = lat >= 0;
  const phi = (north ? lat : -lat) * DEG;
  const lambda = lon * DEG;
  const sin = Math.sin(phi);
  const t = Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * sin) / (1 + e * sin)) ** (e / 2);
  const rho = (2 * a * UPS_K0 * t) / polarFactor(e);
  return {
    kind: "ups",
    hemisphere: north ? "N" : "S",
    easting: UPS_FALSE + rho * Math.sin(lambda),
    northing: north ? UPS_FALSE - rho * Math.cos(lambda) : UPS_FALSE + rho * Math.cos(lambda),
  };
}

/** WGS 84 position of UPS coordinates. */
export function fromUps(hemisphere: Hemisphere, easting: number, northing: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  const { a } = WGS84_SPHEROID;
  const { e } = seriesFor(WGS84_SPHEROID);
  const dx = easting - UPS_FALSE;
  const dy = northing - UPS_FALSE;
  const rho = Math.hypot(dx, dy);
  // NGA's tables go out to the corners of a 4 000 km square round the pole; past that is no longer near it.
  if (rho > 3_000_000) return null;
  const t = (rho * polarFactor(e)) / (2 * a * UPS_K0);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 20; i += 1) {
    const sin = Math.sin(phi);
    const next = Math.PI / 2 - 2 * Math.atan(t * ((1 - e * sin) / (1 + e * sin)) ** (e / 2));
    if (Math.abs(next - phi) < 1e-14) {
      phi = next;
      break;
    }
    phi = next;
  }
  const north = hemisphere === "N";
  const lon = rho === 0 ? 0 : Math.atan2(dx, north ? -dy : dy) / DEG;
  return { lat: (north ? phi : -phi) / DEG, lon };
}

/** UTM where there is UTM, UPS over the poles: the grid position NGA's system gives a point. */
export function toGrid(lat: number, lon: number): GridPosition | null {
  return toUtm(lat, lon) ?? toUps(lat, lon);
}

/**
 * Grid convergence of UTM or UPS at a place: the angle of grid north from true north,
 * degrees, positive when grid north is east of true north. Worked from the projection
 * itself, in the place's own zone, from two points a little north and south of it.
 */
export function utmConvergence(lat: number, lon: number): number | null {
  const at = toGrid(lat, lon);
  if (!at) return null;
  // At the poles every direction is south (or north): grid north is not defined from true north there.
  if (Math.abs(lat) > 89.999) return null;
  const project =
    at.kind === "utm"
      ? (la: number, lo: number) => toUtm(la, lo, { zone: at.zone, hemisphere: at.hemisphere, beyond: true })
      : (la: number, lo: number) => toUps(la, lo, true);
  const step = 1e-4;
  const n = project(lat + step, lon);
  const s = project(lat - step, lon);
  if (!n || !s) return null;
  return -Math.atan2(n.easting - s.easting, n.northing - s.northing) / DEG;
}

// ── Writing UTM and UPS ─────────────────────────────────────────────────────

/** Metres to the step asked for, rounded, as whole numbers. */
const toStep = (value: number, step: number) => Math.round(value / step) * step;

/**
 * "30U 448251 5411932": zone, band, easting and northing in whole metres, rounded to
 * `step` metres (1, 10, 100 or 1000). Over the poles, "UPS N 2000000 2000000".
 */
export function formatUtm(lat: number, lon: number, step = 1): string | null {
  const grid = toGrid(lat, lon);
  if (!grid) return null;
  const e = toStep(grid.easting, step);
  const n = toStep(grid.northing, step);
  if (grid.kind === "ups") return `UPS ${grid.hemisphere} ${e} ${n}`;
  return `${grid.zone}${grid.band} ${e} ${n}`;
}

// ── MGRS ────────────────────────────────────────────────────────────────────

/** The column letters of the three sets of zones, for 100 km squares 1 to 8 east of a zone's western edge. */
const COLUMN_SETS = ["STUVWXYZ", "ABCDEFGH", "JKLMNPQR"];
/** The twenty row letters; even zones start five letters on. */
const ROWS = "ABCDEFGHJKLMNPQRSTUV";

/** The 100 km square letters in the polar zones A, B, Y and Z (NGA.SIG.0012 §11.10, §11.11). */
const UPS_COLUMNS: Record<string, string> = { A: "JKLPQRSTUXYZ", B: "ABCFGHJKLPQR", Y: "RSTUXYZ", Z: "ABCFGHJ" };
const UPS_ROWS: Record<Hemisphere, string> = { S: "ABCDEFGHJKLMNPQRSTUVWXYZ", N: "ABCDEFGHJKLMNP" };
/** The first 100 km column and row index each polar zone's letters start from. */
const UPS_FIRST: Record<Hemisphere, number> = { S: 8, N: 13 };

export type MgrsDigits = 0 | 1 | 2 | 3 | 4 | 5;

export interface MgrsReference {
  /** "33U", or for the poles "A", "B", "Y" or "Z". */
  zone: string;
  /** The two letters of the 100 km square. */
  square: string;
  /** The easting and northing inside the square, cut to the digits asked for. */
  easting: string;
  northing: string;
}

const cut = (value: number, digits: MgrsDigits) =>
  digits === 0
    ? ""
    : Math.floor((((value % 100_000) + 100_000) % 100_000) / 10 ** (5 - digits))
        .toString()
        .padStart(digits, "0");

/** The MGRS reference of a position, its figures cut to `digits` each way (5 is a metre, 1 is 10 km). */
export function toMgrs(lat: number, lon: number, digits: MgrsDigits = 5): MgrsReference | null {
  const grid = toGrid(lat, lon);
  if (!grid) return null;
  // Rounded to a tenth of a millimetre before the figures are cut, so that a point exactly on a metre line,
  // which the arithmetic gives as a hair under it, stays on that line's side.
  const e = Math.round(grid.easting * 1e4) / 1e4;
  const n = Math.round(grid.northing * 1e4) / 1e4;
  const column = Math.floor(e / 100_000);
  const row = Math.floor(n / 100_000);
  if (grid.kind === "utm") {
    const columns = COLUMN_SETS[grid.zone % 3]!;
    const columnLetter = columns[column - 1];
    const rowLetter = ROWS[(row + (grid.zone % 2 === 0 ? 5 : 0)) % 20];
    if (!columnLetter || !rowLetter) return null;
    // Two figures for the zone, as NGA.SIG.0012 §11.1 asks ("05N", not "5N").
    return {
      zone: `${String(grid.zone).padStart(2, "0")}${grid.band}`,
      square: columnLetter + rowLetter,
      easting: cut(e, digits),
      northing: cut(n, digits),
    };
  }
  const east = e >= UPS_FALSE;
  const zone = grid.hemisphere === "N" ? (east ? "Z" : "Y") : east ? "B" : "A";
  const first = UPS_FIRST[grid.hemisphere];
  const columnLetter = UPS_COLUMNS[zone]![column - (east ? 20 : first)];
  const rowLetter = UPS_ROWS[grid.hemisphere][row - first];
  if (!columnLetter || !rowLetter) return null;
  return { zone, square: columnLetter + rowLetter, easting: cut(e, digits), northing: cut(n, digits) };
}

/** "18S UJ 23483 06479", or with `spaced` false "18SUJ2348306479". */
export function formatMgrs(lat: number, lon: number, digits: MgrsDigits = 5, spaced = true): string | null {
  const reference = toMgrs(lat, lon, digits);
  if (!reference) return null;
  const parts = [reference.zone, reference.square, reference.easting, reference.northing].filter(Boolean);
  return spaced ? parts.join(" ") : parts.join("");
}

export interface ReadGridReference {
  lat: number;
  lon: number;
  /** For MGRS: the side of the square the reference names, metres. The position is its middle. */
  precisionMeters?: number;
  /** The reference written out in the usual way, upper case and spaced. */
  text: string;
  /** "utm" or "ups" for coordinates, "mgrs" for a reference. */
  system: "utm" | "ups" | "mgrs";
}

/** Whether a latitude found from a reference is in the band its letter says, with a little room at the edges. */
function inBand(lat: number, band: string): boolean {
  const index = BANDS.indexOf(band);
  if (index < 0) return false;
  const south = -80 + index * 8;
  const north = band === "X" ? 84 : south + 8;
  return lat >= south - 0.5 && lat < north + 0.5;
}

/**
 * Reads an MGRS or USNG reference: "18SUJ2348306479", "18S UJ 23483 06479", "4QFJ12345678",
 * a polar one ("ZAH 00000 00000"), or just a 100 km square ("33UXP"). Null for anything
 * else, including a square that does not exist in that zone and band.
 */
export function parseMgrs(input: string): ReadGridReference | null {
  const text = input
    .trim()
    .toUpperCase()
    .replace(/^MGRS\s+|^USNG\s+/, "");
  const utm = /^(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])([A-HJ-NP-V])\s*((?:\d\s*){0,10})$/.exec(text);
  const polar = utm ? null : /^([ABYZ])\s*([A-HJ-NP-Z])([A-HJ-NP-Z])\s*((?:\d\s*){0,10})$/.exec(text);
  const figures = (utm ? utm[5] : polar?.[4]) ?? "";
  if (!utm && !polar) return null;
  const parts = figures.trim() ? figures.trim().split(/\s+/) : [];
  const digits = parts.join("");
  if (digits.length % 2 !== 0) return null;
  if (parts.length > 2 || (parts.length === 2 && parts[0]!.length !== parts[1]!.length)) return null;
  const half = digits.length / 2;
  const precision = 10 ** (5 - half);
  const within = (value: string) => (half === 0 ? 0 : Number(value) * precision) + precision / 2;
  const eIn = within(digits.slice(0, half));
  const nIn = within(digits.slice(half));
  const spaced = (zone: string, square: string) => [zone, square, digits.slice(0, half), digits.slice(half)].filter(Boolean).join(" ");

  if (utm) {
    const zone = Number(utm[1]);
    const band = utm[2]!;
    if (zone < 1 || zone > 60) return null;
    const column = COLUMN_SETS[zone % 3]!.indexOf(utm[3]!);
    const rowIndex = ROWS.indexOf(utm[4]!);
    if (column < 0 || rowIndex < 0) return null;
    const easting = (column + 1) * 100_000 + eIn;
    const row = (rowIndex - (zone % 2 === 0 ? 5 : 0) + 20) % 20;
    const hemisphere: Hemisphere = band >= "N" ? "N" : "S";
    // The row letters repeat every 2 000 km: find the repeat that puts the point in its band.
    const bandSouth = -80 + BANDS.indexOf(band) * 8;
    const bottom = toUtm(bandSouth, centralMeridian(zone), { zone, hemisphere });
    if (!bottom) return null;
    const lowest = Math.floor(bottom.northing / 100_000) * 100_000;
    let northing = row * 100_000 + nIn;
    while (northing < lowest) northing += 2_000_000;
    const position = fromUtm(zone, hemisphere, easting, northing);
    if (!position || !inBand(position.lat, band)) return null;
    return {
      ...position,
      precisionMeters: precision,
      text: spaced(`${String(zone).padStart(2, "0")}${band}`, utm[3]! + utm[4]!),
      system: "mgrs",
    };
  }

  const zone = polar![1]!;
  const hemisphere: Hemisphere = zone === "Y" || zone === "Z" ? "N" : "S";
  const east = zone === "B" || zone === "Z";
  const first = UPS_FIRST[hemisphere];
  const column = UPS_COLUMNS[zone]!.indexOf(polar![2]!);
  const row = UPS_ROWS[hemisphere].indexOf(polar![3]!);
  if (column < 0 || row < 0) return null;
  const easting = (column + (east ? 20 : first)) * 100_000 + eIn;
  const northing = (row + first) * 100_000 + nIn;
  const position = fromUps(hemisphere, easting, northing);
  if (!position) return null;
  // A polar reference names a point in the cap: north of 84° N, or south of 80° S, give or take its square.
  if (hemisphere === "N" ? position.lat < 83.5 : position.lat > -79.5) return null;
  return { ...position, precisionMeters: precision, text: spaced(zone, polar![2]! + polar![3]!), system: "mgrs" };
}

/**
 * Reads UTM or UPS coordinates: "30U 448251 5411932", "30U 448251E 5411932N", "UTM 30N
 * 448251 5411932", "zone 30 north 448251 5411932", "UPS N 2000000 2000000". The letter
 * after the zone may be a band or N or S for the hemisphere. "S" is both band S (32° to
 * 40° N) and the southern hemisphere: each reading that is on the Earth is returned,
 * the band first, as GPS receivers write the band.
 */
export function parseUtmReadings(input: string): ReadGridReference[] {
  const text = input.trim().toUpperCase().replace(/[,;]/g, " ").replace(/\s+/g, " ");
  const number = String.raw`(\d{1,7}(?:\.\d+)?)\s*(?:M\b)?\s*`;
  const ups = new RegExp(String.raw`^UPS\s*(N|S|NORTH|SOUTH)\s+${number}E?\s+${number}N?$`).exec(text);
  if (ups) {
    const hemisphere: Hemisphere = ups[1]!.startsWith("N") ? "N" : "S";
    const easting = Number(ups[2]);
    const northing = Number(ups[3]);
    const position = fromUps(hemisphere, easting, northing);
    if (!position || (hemisphere === "N" ? position.lat < 83.5 : position.lat > -79.5)) return [];
    return [{ ...position, text: `UPS ${hemisphere} ${easting} ${northing}`, system: "ups" }];
  }
  const match = new RegExp(
    String.raw`^(?:UTM\s*)?(?:ZONE\s*)?(\d{1,2})\s*(NORTH|SOUTH|[C-HJ-NP-X])\s+(?:ZONE\s+)?${number}(E?)\s+${number}(N?)$`,
  ).exec(text);
  if (!match) return [];
  const zone = Number(match[1]);
  if (zone < 1 || zone > 60) return [];
  const letter = match[2]!;
  const easting = Number(match[3]);
  const northing = Number(match[5]);
  // Eastings in a zone run from about 160 000 to 840 000 m at the equator; anything far outside is not UTM.
  if (easting < 100_000 || easting > 900_000 || northing > 10_000_000) return [];
  const readings: ReadGridReference[] = [];
  const add = (hemisphere: Hemisphere, band: string | null) => {
    const position = fromUtm(zone, hemisphere, easting, northing);
    if (!position || position.lat < -80.5 || position.lat > 84.5) return;
    if (band && !inBand(position.lat, band)) return;
    if (!band && (hemisphere === "N" ? position.lat < -0.5 : position.lat > 0.5)) return;
    const shown = band ?? utmBand(position.lat) ?? hemisphere;
    if (readings.some((reading) => Math.abs(reading.lat - position.lat) < 1e-9 && Math.abs(reading.lon - position.lon) < 1e-9)) return;
    readings.push({ ...position, text: `${zone}${shown} ${easting} ${northing}`, system: "utm" });
  };
  if (letter === "NORTH") add("N", null);
  else if (letter === "SOUTH") add("S", null);
  else {
    if (letter >= "N") add("N", letter);
    else add("S", letter);
    // N and S may also mean the hemisphere. For N that is the same place whenever band N fits; for S it is another.
    if (letter === "N") add("N", null);
    if (letter === "S") add("S", null);
  }
  return readings;
}

/**
 * The frame the sky is worked out in: time scales, sidereal time, precession, nutation
 * and aberration. Pure.
 *
 * - Sidereal time: the US Naval Observatory's approximate formula ("Computing Approximate
 *   Sidereal Time", aa.usno.navy.mil/faq/GAST), good to about 0.1 second of time, with the
 *   equation of the equinoxes (nutation in longitude times the cosine of the obliquity).
 * - Precession: the IAU 2006 angles ζA, zA, θA in the three-angle form, and the mean
 *   obliquity, as G. H. Kaplan gives them in USNO Circular 179 (2005), equations 5.11 and
 *   5.12.
 * - Nutation: the largest thirteen terms of the IAU 2000A series as Circular 179 lists it
 *   (its terms 1 to 13), which leave out terms of no more than about 0.01 second of arc.
 * - Aberration: the first-order shift v/c of the direction of a star or planet for the
 *   Earth's velocity, the velocity taken from the sun's motion (bodies.ts).
 * - TT − UT (ΔT): 69.2 seconds, the US Naval Observatory's figure for 1 October 2026
 *   (maia.usno.navy.mil/ser7/deltat.data, read 21 November 2026). It drifts by about a
 *   second in ten years; a second of it moves the Moon by half a second of arc.
 */

export const DEG = Math.PI / 180;
export const ARCSEC = DEG / 3600;
export const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/** TT − UT, seconds. */
export const DELTA_T_SECONDS = 69.2;

/** The speed of light in astronomical units a day (Circular 179's constants: c and the astronomical unit). */
export const LIGHT_AU_PER_DAY = 173.144_632_7;

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const norm360 = (degrees: number): number => ((degrees % 360) + 360) % 360;
/** An angle folded into −180 to 180 degrees. */
export const norm180 = (degrees: number): number => norm360(degrees + 180) - 180;

/** Days of Terrestrial Time from noon on 1 January 2000 (J2000.0), for an instant given in UT milliseconds. */
export function ttDaysFromJ2000(ms: number): number {
  return (ms - J2000_MS) / DAY_MS + DELTA_T_SECONDS / 86_400;
}

/** Julian centuries of TT from J2000.0. */
export const ttCenturies = (ms: number): number => ttDaysFromJ2000(ms) / 36_525;

export function unitVector(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** Right ascension (0 to 360) and declination, degrees, of a vector. */
export function toRaDec(v: Vec3): { ra: number; dec: number } {
  const r = Math.hypot(v[0], v[1], v[2]);
  return { ra: norm360(Math.atan2(v[1], v[0]) / DEG), dec: Math.asin(v[2] / r) / DEG };
}

export function multiply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function product(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2],
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

/** The standard rotations of Circular 179 ("Abbreviations and Symbols"), angle in radians. */
function r1(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [1, 0, 0],
    [0, c, s],
    [0, -s, c],
  ];
}
function r2(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, -s],
    [0, 1, 0],
    [s, 0, c],
  ];
}
function r3(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
}

/** Mean obliquity of the ecliptic, degrees (Circular 179, eq. 5.12). */
export function meanObliquity(t: number): number {
  const arcsec = 84_381.406 + t * (-46.836769 + t * (-0.0001831 + t * (0.0020034 + t * (-0.000000576 - t * 0.0000000434))));
  return arcsec / 3600;
}

/** Precession from J2000 to the mean equator and equinox of date (Circular 179, eq. 5.11). */
export function precessionMatrix(t: number): Mat3 {
  const zeta = 2.650545 + t * (2306.083227 + t * (0.2988499 + t * (0.01801828 + t * (-0.000005971 - t * 0.0000003173))));
  const z = -2.650545 + t * (2306.077181 + t * (1.0927348 + t * (0.01826837 + t * (-0.000028596 - t * 0.0000002904))));
  const theta = t * (2004.191903 + t * (-0.4294934 + t * (-0.04182264 + t * (-0.000007089 - t * 0.0000001274))));
  return product(r3(-z * ARCSEC), product(r2(theta * ARCSEC), r3(-zeta * ARCSEC)));
}

/** Terms 1 to 13 of the IAU 2000A series: multipliers of l, l′, F, D, Ω, then S, Ṡ, C′ (Δψ) and C, Ċ, S′ (Δε), arcseconds. */
const NUTATION: ReadonlyArray<readonly [number, number, number, number, number, number, number, number, number, number, number]> = [
  [0, 0, 0, 0, 1, -17.2064161, -0.0174666, 0.0033386, 9.2052331, 0.0009086, 0.0015377],
  [0, 0, 2, -2, 2, -1.3170906, -0.0001675, -0.0013696, 0.5730336, -0.0003015, -0.0004587],
  [0, 0, 2, 0, 2, -0.2276413, -0.0000234, 0.0002796, 0.0978459, -0.0000485, 0.0001374],
  [0, 0, 0, 0, 2, 0.2074554, 0.0000207, -0.0000698, -0.0897492, 0.000047, -0.0000291],
  [0, 1, 0, 0, 0, 0.1475877, -0.0003633, 0.0011817, 0.0073871, -0.0000184, -0.0001924],
  [0, 1, 2, -2, 2, -0.0516821, 0.0001226, -0.0000524, 0.0224386, -0.0000677, -0.0000174],
  [1, 0, 0, 0, 0, 0.0711159, 0.0000073, -0.0000872, -0.000675, 0, 0.0000358],
  [0, 0, 2, 0, 1, -0.0387298, -0.0000367, 0.000038, 0.0200728, 0.0000018, 0.0000318],
  [1, 0, 2, 0, 2, -0.0301461, -0.0000036, 0.0000816, 0.0129025, -0.0000063, 0.0000367],
  [0, -1, 2, -2, 2, 0.0215829, -0.0000494, 0.0000111, -0.0095929, 0.0000299, 0.0000132],
  [0, 0, 2, -2, 1, 0.0128227, 0.0000137, 0.0000181, -0.0068982, -0.0000009, 0.0000039],
  [-1, 0, 2, 0, 2, 0.0123457, 0.0000011, 0.0000019, -0.0053311, 0.0000032, -0.0000004],
  [-1, 0, 0, 2, 0, 0.0156994, 0.000001, -0.0000168, -0.0001235, 0, 0.0000082],
];

/** Nutation in longitude and in obliquity, degrees. */
export function nutation(t: number): { dpsi: number; deps: number } {
  // The fundamental arguments l, l′, F, D, Ω (Circular 179, eq. 5.19), arcseconds.
  const args = [
    485_868.249036 + t * (1_717_915_923.2178 + t * (31.8792 + t * (0.051635 - t * 0.0002447))),
    1_287_104.79305 + t * (129_596_581.0481 + t * (-0.5532 + t * (0.000136 - t * 0.00001149))),
    335_779.526232 + t * (1_739_527_262.8478 + t * (-12.7512 + t * (-0.001037 + t * 0.00000417))),
    1_072_260.70369 + t * (1_602_961_601.209 + t * (-6.3706 + t * (0.006593 - t * 0.00003169))),
    450_160.398036 + t * (-6_962_890.5431 + t * (7.4722 + t * (0.007702 - t * 0.00005939))),
  ].map((arcsec) => (arcsec % 1_296_000) * ARCSEC);
  let dpsi = 0;
  let deps = 0;
  for (let i = NUTATION.length - 1; i >= 0; i--) {
    const [ml, mlp, mf, md, mo, s, sd, cp, c, cd, sp] = NUTATION[i]!;
    const [l, lp, f, d, om] = args as [number, number, number, number, number];
    const phi = ml * l + mlp * lp + mf * f + md * d + mo * om;
    dpsi += (s + sd * t) * Math.sin(phi) + cp * Math.cos(phi);
    deps += (c + cd * t) * Math.cos(phi) + sp * Math.sin(phi);
  }
  return { dpsi: dpsi / 3600, deps: deps / 3600 };
}

/** Nutation, mean equator and equinox of date to true (Circular 179, N = R1(−ε′) R3(−Δψ) R1(ε)). */
export function nutationMatrix(t: number): Mat3 {
  const eps = meanObliquity(t);
  const { dpsi, deps } = nutation(t);
  return product(r1(-(eps + deps) * DEG), product(r3(-dpsi * DEG), r1(eps * DEG)));
}

/** Greenwich mean sidereal time, degrees (USNO's approximate formula, in UT). */
export function gmstDegrees(ms: number): number {
  const days = (ms - J2000_MS) / DAY_MS;
  return norm360((18.697375 + 24.065709824279 * days) * 15);
}

/** Greenwich apparent sidereal time, degrees: the Greenwich hour angle of Aries, the true equinox. */
export function ghaAries(ms: number): number {
  const t = ttCenturies(ms);
  const { dpsi, deps } = nutation(t);
  return norm360(gmstDegrees(ms) + dpsi * Math.cos((meanObliquity(t) + deps) * DEG));
}

/** The first-order shift of a direction for the observer's velocity (AU a day, same frame as the direction). */
export function aberrate(direction: Vec3, velocity: Vec3): Vec3 {
  const r = Math.hypot(direction[0], direction[1], direction[2]);
  const u: Vec3 = [direction[0] / r, direction[1] / r, direction[2] / r];
  const shifted: Vec3 = [
    u[0] + velocity[0] / LIGHT_AU_PER_DAY,
    u[1] + velocity[1] / LIGHT_AU_PER_DAY,
    u[2] + velocity[2] / LIGHT_AU_PER_DAY,
  ];
  const s = Math.hypot(shifted[0], shifted[1], shifted[2]);
  return [shifted[0] / s, shifted[1] / s, shifted[2] / s];
}

/** Ecliptic (longitude, latitude, degrees) to equatorial rectangular, for an obliquity. */
export function eclipticToEquatorial(x: number, y: number, z: number, obliquity: number): Vec3 {
  const c = Math.cos(obliquity * DEG);
  const s = Math.sin(obliquity * DEG);
  return [x, y * c - z * s, y * s + z * c];
}

export interface HorizonPlace {
  /** Degrees above the horizon, geometric (no refraction). */
  altitude: number;
  /** Degrees clockwise from true north. */
  azimuth: number;
}

/**
 * Altitude and azimuth from a Greenwich hour angle and declination at a place: the
 * navigational triangle (Bowditch, American Practical Navigator, 2019, appendix B,
 * article 5), the azimuth by the time azimuth formula with atan2.
 */
export function horizonFrom(gha: number, dec: number, latitude: number, longitude: number): HorizonPlace {
  const lha = (gha + longitude) * DEG;
  const lat = Math.max(-89.9999, Math.min(89.9999, latitude)) * DEG;
  const d = dec * DEG;
  const sinH = Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(lha);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinH))) / DEG;
  const fromSouth = Math.atan2(Math.sin(lha), Math.cos(lha) * Math.sin(lat) - Math.tan(d) * Math.cos(lat)) / DEG;
  return { altitude, azimuth: norm360(fromSouth + 180) };
}

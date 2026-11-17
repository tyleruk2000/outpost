/**
 * The Earth's magnetic field at a place and date, from the World Magnetic Model: the
 * declination a compass needs (the angle from true north to magnetic north), with the
 * inclination, the field's strength and how each is changing.
 *
 * The model is a spherical-harmonic expansion of the field's potential to degree and
 * order 12, with each coefficient changing in a straight line over the model's five
 * years. The steps are those of section 1.2 of its technical report: Chulliat, A. et al.
 * (2025), "The US/UK World Magnetic Model for 2025-2030: Technical Report", NOAA NCEI,
 * https://doi.org/10.25923/prbc-s316:
 *
 *   1. geodetic latitude and height on WGS 84 to geocentric latitude φ′ and radius r;
 *   2. the Gauss coefficients for the date, g(t) = g + (t − t0)·ġ;
 *   3. the field in geocentric components X′, Y′, Z′ from Schmidt semi-normalised
 *      associated Legendre functions of sin φ′;
 *   4. rotated by φ′ − φ into the ellipsoid's north, east and down, X, Y, Z;
 *   5. H, F, inclination I and declination D from those, and their rates of change.
 *
 * Checked against every row of NOAA's published test values (apps/server/test/wmm.test.ts).
 * Outside the model's years it still answers, from the same straight lines, but says how
 * far outside it is; it never extrapolates without saying so.
 */
import { WMM_COF } from "./wmm-coefficients.ts";

const DEG = Math.PI / 180;
/** WGS 84, as the report gives it. */
const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
/** The geomagnetic reference radius, metres. */
const REFERENCE_RADIUS = 6_371_200;

interface Model {
  name: string;
  epoch: number;
  /** The first year the model is not for: epoch + 5. */
  end: number;
  degree: number;
  /** Indexed [n][m]. */
  g: number[][];
  h: number[][];
  gDot: number[][];
  hDot: number[][];
}

function square(size: number): number[][] {
  return Array.from({ length: size + 1 }, () => new Array<number>(size + 1).fill(0));
}

function parseCof(text: string): Model {
  const [header, ...rows] = text.split("\n");
  const [epochText, nameText] = header!.trim().split(/\s+/);
  const epoch = Number(epochText);
  const degree = 12;
  const g = square(degree);
  const h = square(degree);
  const gDot = square(degree);
  const hDot = square(degree);
  for (const row of rows) {
    const [n, m, gnm, hnm, gd, hd] = row.trim().split(/\s+/).map(Number) as [number, number, number, number, number, number];
    g[n]![m] = gnm;
    h[n]![m] = hnm;
    gDot[n]![m] = gd;
    hDot[n]![m] = hd;
  }
  return { name: nameText!.replace("-", ""), epoch, end: epoch + 5, degree, g, h, gDot, hDot };
}

let model: Model | null = null;
/** Read once, the first time a field is asked for. */
const wmm = (): Model => {
  model ??= parseCof(WMM_COF);
  return model;
};

/** The model's name and the years it is for. */
export function magneticModelInfo(): { name: string; epoch: number; end: number } {
  const { name, epoch, end } = wmm();
  return { name, epoch, end };
}

export interface MagneticField {
  /** Degrees east of true north; negative is west. */
  declination: number;
  /** Degrees below the horizontal; negative points up (the southern hemisphere). */
  inclination: number;
  /** nT. */
  north: number;
  east: number;
  down: number;
  horizontal: number;
  total: number;
  /** Changes a year: degrees for the angles, nT for the rest. */
  declinationPerYear: number;
  inclinationPerYear: number;
  northPerYear: number;
  eastPerYear: number;
  downPerYear: number;
  horizontalPerYear: number;
  totalPerYear: number;
  /** The model's name, "WMM2025". */
  model: string;
  /**
   * Set when the date is outside the years the model is for: how many years before its
   * start (negative) or after its end (positive). The figures are then the model's straight
   * lines carried on, which the model's makers do not stand behind.
   */
  outsideYears: number | null;
  /**
   * Near the magnetic poles a compass cannot be trusted. NOAA's "blackout zone" is where
   * the horizontal field is under 2,000 nT; its "caution zone" under 6,000 nT
   * (technical report, section 1.8).
   */
  zone: "blackout" | "caution" | null;
  /**
   * How far the declination may be out from the model alone, in degrees: the report's
   * error model, √(0.26² + (5417 / H)²) (section 3.4). Local magnetic rocks and iron are
   * not in it.
   */
  declinationUncertainty: number;
}

/** A date as a decimal year, the way the model counts time: 2026.5 is about 2 July 2026. */
export function decimalYear(date: Date | number): number {
  const time = typeof date === "number" ? date : date.getTime();
  const year = new Date(time).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const next = Date.UTC(year + 1, 0, 1);
  return year + (time - start) / (next - start);
}

/**
 * The field at a place. `lat` and `lon` are WGS 84 degrees, `heightKm` the height above
 * the ellipsoid in kilometres (sea level is within about 50 m of it in Britain, which
 * makes no difference a compass could show), `year` a decimal year.
 */
export function magneticField(lat: number, lon: number, year: number, heightKm = 0): MagneticField {
  const m = wmm();
  const N = m.degree;
  // Exactly at a pole the east direction is not defined; a millionth of a degree from it the figures are the limit.
  const phi = Math.max(-89.999999, Math.min(89.999999, lat)) * DEG;
  const lambda = lon * DEG;
  const height = heightKm * 1000;

  // Step 1: geodetic to geocentric.
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const rc = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const p = (rc + height) * cosPhi;
  const z = (rc * (1 - WGS84_E2) + height) * sinPhi;
  const r = Math.hypot(p, z);
  const phiPrime = Math.asin(z / r);

  // Step 2: the coefficients for the date.
  const dt = year - m.epoch;

  // Step 3: Schmidt semi-normalised Legendre functions of sin φ′ and their derivatives with
  // respect to φ′, by the usual recursions on the unnormalised (Gauss) functions, scaled.
  const x = Math.sin(phiPrime);
  const s = Math.cos(phiPrime);
  const P = square(N);
  const dP = square(N);
  P[0]![0] = 1;
  for (let n = 1; n <= N; n += 1) {
    for (let k = 0; k <= n; k += 1) {
      if (n === k) {
        P[n]![k] = s * P[n - 1]![k - 1]!;
        dP[n]![k] = s * dP[n - 1]![k - 1]! + x * P[n - 1]![k - 1]!;
      } else if (n === 1) {
        P[n]![k] = x * P[n - 1]![k]!;
        dP[n]![k] = x * dP[n - 1]![k]! - s * P[n - 1]![k]!;
      } else {
        const K = ((n - 1) ** 2 - k * k) / ((2 * n - 1) * (2 * n - 3));
        P[n]![k] = x * P[n - 1]![k]! - K * P[n - 2]![k]!;
        dP[n]![k] = x * dP[n - 1]![k]! - s * P[n - 1]![k]! - K * dP[n - 2]![k]!;
      }
    }
  }
  // Gauss to Schmidt: S(n,0) = S(n−1,0)(2n−1)/n; S(n,m) = S(n,m−1)√((n−m+1)(δ(m,1)+1)/(n+m)).
  for (let n = 1; n <= N; n += 1) {
    let factor = 1;
    for (let k = 1; k <= n; k += 1) factor *= (2 * k - 1) / k;
    // factor is now S(n,0).
    let scale = factor;
    for (let k = 0; k <= n; k += 1) {
      if (k > 0) scale *= Math.sqrt(((n - k + 1) * (k === 1 ? 2 : 1)) / (n + k));
      P[n]![k] = P[n]![k]! * scale;
      // dP above is with respect to colatitude θ: d/dφ′ = −d/dθ.
      dP[n]![k] = -dP[n]![k]! * scale;
    }
  }

  let xp = 0;
  let yp = 0;
  let zp = 0;
  let xpDot = 0;
  let ypDot = 0;
  let zpDot = 0;
  const ratio = REFERENCE_RADIUS / r;
  let radial = ratio * ratio; // (a/r)^(n+2) with n = 0; multiplied by a/r before use
  for (let n = 1; n <= N; n += 1) {
    radial *= ratio;
    for (let k = 0; k <= n; k += 1) {
      const cos = Math.cos(k * lambda);
      const sin = Math.sin(k * lambda);
      const gt = m.g[n]![k]! + dt * m.gDot[n]![k]!;
      const ht = m.h[n]![k]! + dt * m.hDot[n]![k]!;
      const gd = m.gDot[n]![k]!;
      const hd = m.hDot[n]![k]!;
      const pnm = P[n]![k]!;
      const dpnm = dP[n]![k]!;
      xp += -radial * (gt * cos + ht * sin) * dpnm;
      yp += radial * k * (gt * sin - ht * cos) * pnm;
      zp += -(n + 1) * radial * (gt * cos + ht * sin) * pnm;
      xpDot += -radial * (gd * cos + hd * sin) * dpnm;
      ypDot += radial * k * (gd * sin - hd * cos) * pnm;
      zpDot += -(n + 1) * radial * (gd * cos + hd * sin) * pnm;
    }
  }
  yp /= s;
  ypDot /= s;

  // Step 4: from geocentric to the ellipsoid's own north and down.
  const tilt = phiPrime - phi;
  const north = xp * Math.cos(tilt) - zp * Math.sin(tilt);
  const down = xp * Math.sin(tilt) + zp * Math.cos(tilt);
  const northDot = xpDot * Math.cos(tilt) - zpDot * Math.sin(tilt);
  const downDot = xpDot * Math.sin(tilt) + zpDot * Math.cos(tilt);
  const east = yp;
  const eastDot = ypDot;

  // Step 5: the elements.
  const horizontal = Math.hypot(north, east);
  const total = Math.hypot(horizontal, down);
  const horizontalDot = (north * northDot + east * eastDot) / horizontal;
  const totalDot = (north * northDot + east * eastDot + down * downDot) / total;
  const declination = Math.atan2(east, north) / DEG;
  const inclination = Math.atan2(down, horizontal) / DEG;
  const declinationDot = (north * eastDot - east * northDot) / (horizontal * horizontal) / DEG;
  const inclinationDot = (horizontal * downDot - down * horizontalDot) / (total * total) / DEG;

  const outsideYears = year < m.epoch ? year - m.epoch : year >= m.end ? year - m.end : null;
  return {
    declination,
    inclination,
    north,
    east,
    down,
    horizontal,
    total,
    declinationPerYear: declinationDot,
    inclinationPerYear: inclinationDot,
    northPerYear: northDot,
    eastPerYear: eastDot,
    downPerYear: downDot,
    horizontalPerYear: horizontalDot,
    totalPerYear: totalDot,
    model: m.name,
    outsideYears,
    zone: horizontal < 2000 ? "blackout" : horizontal < 6000 ? "caution" : null,
    declinationUncertainty: Math.sqrt(0.26 ** 2 + (5417 / horizontal) ** 2),
  };
}

/** The geocentric latitude (radians) and radius (metres) of a geodetic position, step 1 of the model. Exported for its test. */
export function geocentricOf(latDeg: number, heightKm: number): { phiPrime: number; r: number } {
  const phi = latDeg * DEG;
  const rc = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) ** 2);
  const p = (rc + heightKm * 1000) * Math.cos(phi);
  const z = (rc * (1 - WGS84_E2) + heightKm * 1000) * Math.sin(phi);
  const r = Math.hypot(p, z);
  return { phiPrime: Math.asin(z / r), r };
}

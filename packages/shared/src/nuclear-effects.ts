/**
 * The nuclear effects simulator's model: what a burst of a stated energy and height
 * does at a distance on flat ground, from Glasstone and Dolan, *The Effects of Nuclear
 * Weapons* (1977), as numbers in `nuclear-effects-data.ts`. Used by the web app to draw
 * a scenario and by the server to refuse one the model cannot answer.
 *
 * Educational estimates for an idealised case, not forecasts or instructions. Every
 * output is either a figure from a named curve or table of that book, or null with the
 * reason it is not given. Nothing is extrapolated beyond what the book draws, and every
 * distance a person sees is rounded to two significant figures (`roundDistance`).
 *
 * Units: the book works in feet, yards, statute miles and kilotons; the answer is in
 * metres.
 */
import {
  BURN_50_PERCENT,
  CRATER_1KT_FEET,
  FALLOUT_CONTOURS,
  GAMMA_FISSION_YARDS,
  GAMMA_THERMONUCLEAR_YARDS,
  MAX_SCALED_HEIGHT_FT,
  NEUTRON_FISSION_YARDS,
  NEUTRON_THERMONUCLEAR_YARDS,
  OVERPRESSURE_CONTOURS_1KT,
  RADIATION_DOSES_RAD,
  SURFACE_GAMMA_FACTOR_FISSION,
  SURFACE_GAMMA_FACTOR_THERMONUCLEAR,
  SURFACE_NEUTRON_FACTOR,
  SURFACE_PARTITION,
  SURFACE_PARTITION_YIELDS,
  THERMAL_EXPOSURES_CAL,
  THERMAL_PARTITION_AIR,
  THERMAL_SLANT_MILES,
} from "./nuclear-effects-data.ts";

export const FOOT = 0.3048;
export const YARD = 0.9144;
export const MILE = 1609.344;
const MPH = 1.609344; // km/h

/** The yields every part of the model is drawn for: Fig. 7.42 and Fig. 12.65 stop at 10 megatons. */
export const MIN_YIELD_KT = 1;
export const MAX_YIELD_KT = 10_000;
/** Above about 40,000 feet "an allowance must be made for changes in the explosion energy partition" (§ 3.65). */
export const MAX_HEIGHT_M = 40_000 * FOOT;
/** Fig. 7.42 holds for air bursts "at altitudes up to about 15,000 feet" (§ 7.42). */
export const MAX_THERMAL_HEIGHT_M = 15_000 * FOOT;
/** The idealised fallout contours are for effective winds "between about 8 and 45 miles per hour" (§ 9.97). */
export const MIN_WIND_KMH = 8 * MPH;
export const MAX_WIND_KMH = 45 * MPH;

export type BlastLevel = 20 | 10 | 5 | 2 | 1;
export const BLAST_LEVELS: readonly BlastLevel[] = [20, 10, 5, 2, 1];

export type BurstHeight =
  | { kind: "surface" }
  | { kind: "height"; metres: number }
  /** The height at which the chosen overpressure reaches farthest (the tip of its curve in Fig. 3.73b or c). */
  | { kind: "optimum"; psi: BlastLevel };

export interface EffectsInput {
  yieldKt: number;
  burst: BurstHeight;
  /** For fallout: the direction the wind blows from, degrees clockwise from north, and its speed. Null leaves fallout out. */
  wind: { fromDegrees: number; kmh: number } | null;
}

export type EffectFamily = "fireball" | "crater" | "blast" | "thermal" | "radiation";

export interface EffectRing {
  id: string;
  family: EffectFamily;
  /** "5 psi", "Second-degree burns", "600 rads". */
  label: string;
  /** Distance on the ground from ground zero, in metres, before rounding; null when not given (see `why`). */
  metres: number | null;
  /** Why there is no distance, when there is none. */
  why?: string;
  /** What the level means, in the source's words or close to them. */
  meaning: string;
  /** Where the figure comes from: section, figure, table. */
  source: string;
}

export interface FalloutContour {
  /** Dose rate one hour after the burst, rads per hour, on smooth open ground. */
  rate: number;
  downwindM: number;
  maxWidthM: number;
  groundZeroWidthM: number;
  upwindM: number;
}

export type FalloutAnswer =
  | { drawn: true; fromDegrees: number; kmh: number; factor: number; contours: FalloutContour[] }
  | { drawn: false; why: string };

export interface EffectsResult {
  yieldKt: number;
  /** The height of burst used, metres; 0 for a surface burst. */
  heightM: number;
  /** Height of burst over the cube root of the yield, feet: what Figs. 3.73a-c are read at. */
  scaledHeightFt: number;
  surface: boolean;
  rings: EffectRing[];
  fallout: FalloutAnswer;
  /** Notes that belong to this scenario (low burst with fallout likely, thermal not given above 15,000 feet). */
  notes: string[];
}

export type EffectsAnswer = { ok: true; result: EffectsResult } | { ok: false; problems: string[] };

// ── Small numerical helpers ─────────────────────────────────────────────────

const log = Math.log10;

/** Linear interpolation of y against x in a sorted table; null outside it. */
function interp(table: ReadonlyArray<readonly [number, number]>, x: number, logX = false): number | null {
  const fx = (value: number) => (logX ? log(value) : value);
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i]!;
    const [x1, y1] = table[i + 1]!;
    if (x >= x0 && x <= x1) {
      const t = x1 === x0 ? 0 : (fx(x) - fx(x0)) / (fx(x1) - fx(x0));
      return y0 + t * (y1 - y0);
    }
  }
  return null;
}

/** A row of a yield table at any yield, interpolating every column against log yield; the end rows extend the line through the last two (the figures' edges are a fraction of a decade beyond the first and last rows read). */
function rowAt(rows: ReadonlyArray<readonly [number, readonly number[]]>, yieldKt: number, logY = true): number[] {
  let i = rows.findIndex((_row, index) => index < rows.length - 1 && yieldKt <= rows[index + 1]![0]);
  if (i < 0) i = rows.length - 2;
  const [w0, a] = rows[i]!;
  const [w1, b] = rows[i + 1]!;
  const t = (log(yieldKt) - log(w0)) / (log(w1) - log(w0));
  return a.map((value, column) => {
    const other = b[column]!;
    return logY ? 10 ** (log(value) + t * (log(other) - log(value))) : value + t * (other - value);
  });
}

/** Two significant figures: what a distance is shown as, so that it claims no more than the curves it was read from. */
export function roundDistance(metres: number): number {
  if (!(metres > 0)) return 0;
  const magnitude = 10 ** (Math.floor(log(metres)) - 1);
  return Math.round(metres / magnitude) * magnitude;
}

// ── Blast (Figs. 3.73b and c) ───────────────────────────────────────────────

type Contour = ReadonlyArray<readonly [number, number]>;

/** The farthest point at which a contour crosses the height `h` (feet, 1 kiloton); null when it does not reach that height. */
function outerCrossing(contour: Contour, h: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < contour.length - 1; i++) {
    const [d0, h0] = contour[i]!;
    const [d1, h1] = contour[i + 1]!;
    if (h < Math.min(h0, h1) || h > Math.max(h0, h1)) continue;
    const d = h1 === h0 ? Math.max(d0, d1) : d0 + ((h - h0) / (h1 - h0)) * (d1 - d0);
    if (best === null || d > best) best = d;
  }
  return best;
}

/** The farthest reach of a contour and the height it is reached at, feet for 1 kiloton. */
function tip(contour: Contour): { d: number; h: number } {
  let best = contour[0]!;
  for (const point of contour) if (point[0] > best[0]) best = point;
  return { d: best[0], h: best[1] };
}

const DRAWN: Record<Exclude<BlastLevel, 5>, Contour> = {
  20: OVERPRESSURE_CONTOURS_1KT[20],
  10: OVERPRESSURE_CONTOURS_1KT[10],
  2: OVERPRESSURE_CONTOURS_1KT[2],
  1: OVERPRESSURE_CONTOURS_1KT[1],
};

/** Where 5 psi lies between the 4 and 6 psi curves, which the figure draws and 5 it does not: a fraction along log pressure. */
const FIVE = log(5 / 4) / log(6 / 4);

/** The farthest ground distance (feet, 1 kiloton) of an overpressure at a scaled height; null with a reason when not given. */
export function blastRange1kt(psi: BlastLevel, scaledHeightFt: number): { feet: number | null; why?: string } {
  if (psi !== 5) {
    const feet = outerCrossing(DRAWN[psi], scaledHeightFt);
    return feet === null ? { feet: null, why: `${psi} psi does not reach the ground from this height.` } : { feet };
  }
  const four = outerCrossing(OVERPRESSURE_CONTOURS_1KT[4], scaledHeightFt);
  const six = outerCrossing(OVERPRESSURE_CONTOURS_1KT[6], scaledHeightFt);
  if (four === null) return { feet: null, why: "5 psi does not reach the ground from this height." };
  if (six === null)
    return {
      feet: null,
      why: "At this height 4 psi reaches the ground and 6 psi does not. The book draws no 5 psi curve, so this model does not say where it reaches.",
    };
  return { feet: 10 ** (log(four) + FIVE * (log(six) - log(four))) };
}

/** The farthest reach of any curve the book draws (1, 2, 4, 6, 10 or 20 psi), feet for 1 kiloton. */
export function drawnTip(psi: keyof typeof OVERPRESSURE_CONTOURS_1KT): { d: number; h: number } {
  return tip(OVERPRESSURE_CONTOURS_1KT[psi]);
}

/** The scaled height (feet, 1 kiloton) at which an overpressure reaches farthest, and how far. */
export function optimumHeight1kt(psi: BlastLevel): { d: number; h: number } {
  if (psi !== 5) return tip(DRAWN[psi]);
  const four = tip(OVERPRESSURE_CONTOURS_1KT[4]);
  const six = tip(OVERPRESSURE_CONTOURS_1KT[6]);
  return { d: 10 ** (log(four.d) + FIVE * (log(six.d) - log(four.d))), h: four.h + FIVE * (six.h - four.h) };
}

const BLAST_MEANING: Record<BlastLevel, string> = {
  20: "Glasstone's tentative criteria for direct blast injury put severe lung damage at 25 (20 to 30) psi and eardrum rupture in half of adults at 15 to 20 psi (Table 12.38). Inside this ring, the overpressure is at least 20 psi.",
  10: "Above the threshold for lung damage, 12 psi (8 to 15) (Table 12.38). Ten psi is the level Glasstone gives for light damage to a blast-resistant reinforced concrete building (§ 5.143).",
  5: "A wood-frame house tested at 'close to 5 pounds per square inch' was 'almost completely destroyed' (§ 5.56), and a brick house at 5 psi was 'damaged beyond repair' (§ 5.67). Eardrum rupture begins at about 5 psi (Table 12.38).",
  2: "Wood siding panels of standard house construction fail at 1 to 2 psi, 'allowing a whole panel to be blown in' (Table 5.145). A test house at 1.7 psi 'was badly damaged both internally and externally, but it remained standing' (§ 5.59).",
  1: "Glass windows shatter at 0.5 to 1 psi (Table 5.145). 'Light damage to all targets except blast-resistant structures and bridges can be expected at the range at which the overpressure is 1 pound per square inch' (§ 5.143).",
};

// ── Thermal (Figs. 7.42 and 12.65, Tables 7.88 and 7.101) ───────────────────

/** Effective thermal partition at a height of burst (feet) and yield (kilotons), from Table 7.101; 0.35 above it (Table 7.88). */
export function thermalPartition(heightFt: number, yieldKt: number): number {
  const lastRow = SURFACE_PARTITION.at(-1)![0];
  if (heightFt >= lastRow) return THERMAL_PARTITION_AIR;
  const at = (row: ReadonlyArray<number | null>) => {
    const cells: Array<[number, number]> = SURFACE_PARTITION_YIELDS.map((w, i) => [w, row[i] ?? THERMAL_PARTITION_AIR]);
    return interp(cells, Math.min(Math.max(yieldKt, 1), 10_000), true)!;
  };
  for (let i = 0; i < SURFACE_PARTITION.length - 1; i++) {
    const [h0, r0] = SURFACE_PARTITION[i]!;
    const [h1, r1] = SURFACE_PARTITION[i + 1]!;
    if (heightFt >= h0 && heightFt <= h1) {
      const t = (heightFt - h0) / (h1 - h0);
      return at(r0) + t * (at(r1) - at(r0));
    }
  }
  return THERMAL_PARTITION_AIR;
}

/** Radiant exposure (cal/cm²) for a 50 per cent chance of a burn of the stated degree (Fig. 12.65). */
export function burnExposure(degree: "second" | "third", yieldKt: number): number {
  const line = BURN_50_PERCENT[degree];
  return line.at1kt + line.perDecade * log(yieldKt);
}

/** The slant range (miles) at which an air burst gives the radiant exposure `cal`; null outside the 3 to 50 cal/cm² Fig. 7.42 draws. */
export function thermalSlantMiles(cal: number, yieldKt: number): number | null {
  const exposures = THERMAL_EXPOSURES_CAL as readonly number[];
  if (cal < exposures[0]! || cal > exposures.at(-1)!) return null;
  const row = rowAt(THERMAL_SLANT_MILES, yieldKt);
  const points: Array<[number, number]> = exposures.map((q, i) => [log(q), log(row[i]!)]);
  return 10 ** interp(points, log(cal))!;
}

// ── Initial radiation (Figs. 8.33a/b and 8.64a/b, Table 8.37) ──────────────

/** Dose (rads) at a slant range in yards from one of the figures, interpolating log dose against range between its curves. */
function doseFrom(rows: ReadonlyArray<readonly [number, readonly number[]]>, yieldKt: number, yards: number): number {
  const ranges = rowAt(rows, yieldKt, false); // falling with dose: 30 rads farthest
  const doses = RADIATION_DOSES_RAD as readonly number[];
  // Find the segment; beyond either end, carry on the end segment's slope (a few hundred yards at most in use).
  let i = ranges.findIndex((range, index) => index < ranges.length - 1 && yards <= range && yards >= ranges[index + 1]!);
  if (i < 0) i = yards > ranges[0]! ? 0 : ranges.length - 2;
  const r0 = ranges[i]!;
  const r1 = ranges[i + 1]!;
  const t = (yards - r0) / (r1 - r0);
  return 10 ** (log(doses[i]!) + t * (log(doses[i + 1]!) - log(doses[i]!)));
}

const factorAt = (table: ReadonlyArray<readonly [number, number]>, yieldKt: number) =>
  interp(table, Math.min(Math.max(yieldKt, table[0]![0]), table.at(-1)![0]), true)!;

/** The gamma and neutron doses (rads) of an air burst at a slant range in metres, as the figures give them. */
export function initialDoseParts(yieldKt: number, slantM: number): { gamma: number; neutron: number } {
  const yards = slantM / YARD;
  const fission = yieldKt < 100;
  return {
    gamma: doseFrom(fission ? GAMMA_FISSION_YARDS : GAMMA_THERMONUCLEAR_YARDS, yieldKt, yards),
    neutron: doseFrom(fission ? NEUTRON_FISSION_YARDS : NEUTRON_THERMONUCLEAR_YARDS, yieldKt, yards),
  };
}

/** Total initial dose (gamma plus neutron, rads) at a slant range in metres, for a burst at `heightFt`. */
export function initialDose(yieldKt: number, heightFt: number, slantM: number): number {
  const fission = yieldKt < 100;
  const { gamma, neutron } = initialDoseParts(yieldKt, slantM);
  // Below about 300 feet, interpolate between the contact-burst factor and 1 (§§ 8.37, 8.66).
  const toward = Math.min(Math.max(heightFt / 300, 0), 1);
  const gammaFactor = factorAt(fission ? SURFACE_GAMMA_FACTOR_FISSION : SURFACE_GAMMA_FACTOR_THERMONUCLEAR, yieldKt);
  const g = gammaFactor + (1 - gammaFactor) * toward;
  const n = SURFACE_NEUTRON_FACTOR + (1 - SURFACE_NEUTRON_FACTOR) * toward;
  return gamma * g + neutron * n;
}

/** The slant range (metres) at which the total initial dose falls to `rads`. */
export function initialDoseRange(yieldKt: number, heightFt: number, rads: number): number {
  let near = 50;
  let far = 20_000;
  for (let step = 0; step < 60; step++) {
    const mid = (near + far) / 2;
    if (initialDose(yieldKt, heightFt, mid) > rads) near = mid;
    else far = mid;
  }
  return (near + far) / 2;
}

// ── Fallout (Table 9.93, § 9.97) ────────────────────────────────────────────

/** The downwind scaling factor for an effective wind of `mph` (§ 9.97). */
export function windFactor(mph: number): number {
  return mph >= 15 ? 1 + (mph - 15) / 60 : 1 + (mph - 15) / 30;
}

/** The idealised unit-time reference dose-rate contours for a surface burst of `yieldKt` in a wind of `mph`, in metres. */
export function falloutContours(yieldKt: number, mph: number): FalloutContour[] {
  const factor = windFactor(mph);
  return FALLOUT_CONTOURS.map((row) => {
    const miles = ([a, b]: readonly [number, number]) => a * yieldKt ** b;
    const groundZeroWidthM = miles(row.groundZeroWidth) * MILE;
    return {
      rate: row.rate,
      // Wind scaling is applied to the downwind distance only; the book says the widths and the upwind distance may be left as they are (§ 9.98).
      downwindM: miles(row.downwind) * factor * MILE,
      maxWidthM: miles(row.maxWidth) * MILE,
      groundZeroWidthM,
      // "The upwind distance ... is estimated to be approximately one-half the ground-zero width" (§ 9.93).
      upwindM: groundZeroWidthM / 2,
    };
  });
}

// ── The whole answer ────────────────────────────────────────────────────────

/** The reasons a scenario cannot be worked out, in words; empty when it can. */
export function effectsProblems(input: EffectsInput): string[] {
  const problems: string[] = [];
  const { yieldKt, burst, wind } = input;
  if (!Number.isFinite(yieldKt) || yieldKt < MIN_YIELD_KT || yieldKt > MAX_YIELD_KT)
    problems.push(
      "The yield must be from 1 kiloton to 10 megatons. The thermal curves this model uses (Glasstone and Dolan, Figs. 7.42 and 12.65) are drawn for that range only.",
    );
  if (burst.kind === "height") {
    if (!Number.isFinite(burst.metres) || burst.metres <= 0)
      problems.push("Give a height of burst above the ground, or choose a surface burst.");
    else if (burst.metres > MAX_HEIGHT_M)
      problems.push(
        "The height of burst must be at most 12,000 metres (40,000 feet): above that, the share of the energy that goes into blast and heat changes and this model does not allow for it (§ 3.65).",
      );
    else if (problems.length === 0 && burst.metres / FOOT / yieldKt ** (1 / 3) > MAX_SCALED_HEIGHT_FT) {
      const most = MAX_SCALED_HEIGHT_FT * yieldKt ** (1 / 3) * FOOT;
      problems.push(
        `For this yield the height of burst must be at most ${formatMetres(roundDistance(most))}: the blast curves (Fig. 3.73c) are drawn up to a scaled height of 5,000 feet.`,
      );
    }
  }
  if (wind) {
    if (!Number.isFinite(wind.fromDegrees) || wind.fromDegrees < 0 || wind.fromDegrees >= 360)
      problems.push("The wind direction must be from 0 to 359 degrees.");
    if (!Number.isFinite(wind.kmh) || wind.kmh < MIN_WIND_KMH - 0.05 || wind.kmh > MAX_WIND_KMH + 0.05)
      problems.push(
        "The wind speed must be from 13 to 72 km/h (8 to 45 miles per hour): the idealised fallout pattern holds only for winds in that range (§ 9.97).",
      );
  }
  return problems;
}

function formatMetres(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toLocaleString("en-GB")} km` : `${metres.toLocaleString("en-GB")} m`;
}

export function computeEffects(input: EffectsInput): EffectsAnswer {
  const problems = effectsProblems(input);
  if (problems.length > 0) return { ok: false, problems };
  const { yieldKt, burst, wind } = input;
  const cube = yieldKt ** (1 / 3);
  const heightFt = burst.kind === "surface" ? 0 : burst.kind === "height" ? burst.metres / FOOT : optimumHeight1kt(burst.psi).h * cube;
  const heightM = heightFt * FOOT;
  if (heightM > MAX_HEIGHT_M)
    return {
      ok: false,
      problems: [
        "For this yield the height that carries that overpressure farthest is above 12,000 metres (40,000 feet), where this model does not hold (§ 3.65). Choose a lower overpressure or a height.",
      ],
    };
  const surface = heightFt === 0;
  const scaledHeightFt = heightFt / cube;
  const notes: string[] = [];
  const rings: EffectRing[] = [];
  const ground = (slantM: number | null) => (slantM === null || slantM <= heightM ? null : Math.sqrt(slantM ** 2 - heightM ** 2));

  // Fireball: radius at breakaway (§ 2.127). Shown for what it is, a size, not a damage line.
  const fireballFt = (surface ? 145 : 110) * yieldKt ** 0.4;
  rings.push({
    id: "fireball",
    family: "fireball",
    label: "Fireball",
    metres: fireballFt * FOOT,
    meaning: surface
      ? "The radius of the fireball of a contact surface burst at breakaway, 145 W^0.4 feet (eq. 2.127.2). Its largest size is roughly twice this (§ 2.127)."
      : "The radius of the fireball of an air burst at breakaway, 110 W^0.4 feet (eq. 2.127.1). Its largest size is roughly twice this (§ 2.127).",
    source: "Glasstone and Dolan § 2.127",
  });

  if (surface) {
    const scale = yieldKt ** 0.3;
    const radii = CRATER_1KT_FEET.map((row) => row.radius * scale * FOOT);
    const depths = CRATER_1KT_FEET.map((row) => row.depth * scale * FOOT);
    rings.push({
      id: "crater",
      family: "crater",
      label: "Crater",
      metres: Math.max(...radii),
      meaning: `The apparent crater of a contact surface burst: a radius of ${formatMetres(roundDistance(Math.min(...radii)))} (dry hard rock) to ${formatMetres(roundDistance(Math.max(...radii)))} (wet soil), and a depth of ${formatMetres(roundDistance(Math.min(...depths)))} to ${formatMetres(roundDistance(Math.max(...depths)))}. The ring is drawn at the larger radius.`,
      source: "Glasstone and Dolan Figs. 6.72a and b, scaled by W^0.3 (§ 6.72)",
    });
  }

  for (const psi of BLAST_LEVELS) {
    const { feet, why } = blastRange1kt(psi, scaledHeightFt);
    rings.push({
      id: `blast-${psi}`,
      family: "blast",
      label: `${psi} psi`,
      metres: feet === null ? null : feet * cube * FOOT,
      ...(why ? { why } : {}),
      meaning: BLAST_MEANING[psi],
      source:
        psi === 5
          ? "Glasstone and Dolan Fig. 3.73c, between its 4 and 6 psi curves, scaled by the cube root of the yield (eq. 3.62.1)"
          : `Glasstone and Dolan Fig. 3.73${psi >= 10 ? "b" : "c"}, scaled by the cube root of the yield (eq. 3.62.1)`,
    });
  }

  if (heightM > MAX_THERMAL_HEIGHT_M) {
    notes.push(
      "Thermal distances are not given for a burst above 4,600 metres (15,000 feet): the curves used (Fig. 7.42) hold only below that height, and the book's method for higher bursts is not built here.",
    );
  }
  const partition = thermalPartition(heightFt, yieldKt);
  for (const degree of ["third", "second"] as const) {
    const exposure = burnExposure(degree, yieldKt);
    // Fig. 7.42 is for an air burst (partition 0.35); a lower partition needs the exposure of an air burst that would give the same (§ 7.101).
    const asAir = exposure * (THERMAL_PARTITION_AIR / partition);
    const slant = heightM > MAX_THERMAL_HEIGHT_M ? null : thermalSlantMiles(asAir, yieldKt);
    const metres = ground(slant === null ? null : slant * MILE);
    const name = degree === "third" ? "Third-degree burns" : "Second-degree burns";
    rings.push({
      id: `thermal-${degree}`,
      family: "thermal",
      label: name,
      metres,
      ...(metres === null
        ? {
            why:
              heightM > MAX_THERMAL_HEIGHT_M
                ? "Not given for a burst above 15,000 feet."
                : slant === null
                  ? "Outside the exposures Fig. 7.42 draws."
                  : "Does not reach the ground from this height.",
          }
        : {}),
      meaning: `Where about half of an average population in the open, unshielded and taking no evasive action, would receive ${degree === "third" ? "third" : "second"}-degree burns to exposed skin: a radiant exposure of about ${exposure.toFixed(1)} cal/cm² for this yield (Fig. 12.65). Clear air with 12-mile (19 km) visibility; haze, cloud or smoke between shorten it, and cloud above or snow lengthen it (§ 7.43).`,
      source: `Glasstone and Dolan Figs. 7.42 and 12.65${partition < THERMAL_PARTITION_AIR ? `; thermal partition ${partition.toFixed(2)} for a burst this low (Table 7.101)` : ""}`,
    });
  }

  const fission = yieldKt < 100;
  for (const rads of [600, 100]) {
    const slant = initialDoseRange(yieldKt, heightFt, rads);
    const metres = ground(slant);
    rings.push({
      id: `radiation-${rads}`,
      family: "radiation",
      label: `${rads} rads`,
      metres,
      ...(metres === null ? { why: "Does not reach the ground from this height." } : {}),
      meaning:
        rads === 600
          ? "Initial nuclear radiation (gamma rays and neutrons in the first minute) of 600 rads. Glasstone's summary of acute whole-body doses puts the incidence of death at 90 to 100 per cent from 600 to 1,000 rems (Table 12.108)."
          : "Initial nuclear radiation of 100 rads. From 100 to 200 rems Glasstone gives vomiting as infrequent at 100, clinical surveillance, and no deaths (Table 12.108).",
      source: `Glasstone and Dolan Figs. ${fission ? "8.33a and 8.64a (fission weapons, 1 to 100 kilotons; reliable within a factor of 0.5 to 2)" : "8.33b and 8.64b (thermonuclear weapons with half the yield from fission, 100 kilotons to 20 megatons; reliable within a factor of 0.25 to 1.5)"}${heightFt < 300 ? ", with the contact surface burst factors of Table 8.37 and § 8.66" : ""}`,
    });
  }

  let fallout: FalloutAnswer;
  if (!surface) {
    const fallsOut = 180 * yieldKt ** 0.4;
    if (heightFt < fallsOut)
      notes.push(
        `Below about ${formatMetres(roundDistance(fallsOut * FOOT))} for this yield, appreciable local fallout is likely (eq. 2.128.1, ±30 per cent). This model draws the idealised fallout pattern only for a surface burst.`,
      );
    fallout = {
      drawn: false,
      why: "Fallout is drawn only for a surface burst: the idealised pattern (Table 9.93) is for a contact surface burst.",
    };
  } else if (!wind) {
    fallout = { drawn: false, why: "Give a wind direction and speed to draw the idealised fallout pattern." };
  } else {
    const mph = wind.kmh / MPH;
    fallout = {
      drawn: true,
      fromDegrees: wind.fromDegrees,
      kmh: wind.kmh,
      factor: windFactor(mph),
      contours: falloutContours(yieldKt, mph),
    };
  }

  return { ok: true, result: { yieldKt, heightM, scaledHeightFt, surface, rings, fallout, notes } };
}

/**
 * What every result says, wherever it is shown: what the model is and is not. The
 * screen, the Markdown and the PDF all print these.
 */
export const EFFECTS_CAVEAT =
  "An educational estimate from a published model for an idealised case: flat ground at sea level, a standard atmosphere, clear air, and no buildings or hills. It is not a forecast and not instructions. Distances are rounded to two significant figures because the model is no more precise than that.";

export const EFFECTS_ASSUMPTIONS: readonly string[] = [
  "Flat, open ground at sea level; a standard sea-level atmosphere; no buildings, trees or hills to shield, reflect or channel anything.",
  "Blast: peak overpressure from Glasstone and Dolan Figs. 3.73b and c for 1 kiloton, scaled by the cube root of the yield, read for 'nearly ideal surface conditions' (§ 3.73).",
  "Heat: clear air with a visibility of 12 miles (19 km) (Fig. 7.42); people in the open, unshielded and taking no evasive action (Fig. 12.65).",
  "Initial radiation: average air density on the path of 0.9 of sea level (§ 8.33). The book gives fission-weapon curves up to 100 kilotons and curves for thermonuclear weapons with half their yield from fission from 100 kilotons; this model uses the first below 100 kilotons and the second from 100 kilotons. That choice is the model's, not a statement about any real weapon.",
  "Fallout: the book's idealised pattern for a contact surface burst in a steady effective wind with little shear, with all of the yield from fission (Table 9.93). Dose rates are those one hour after the burst on smooth open ground.",
];

export const EFFECTS_LIMITATIONS: readonly string[] = [
  "The curves were read off scans of the printed figures; read-off error is a few per cent, and the book's own figures differ from one another by a few per cent where they overlap.",
  "Real ground is not flat, cities are not empty, and the weather is never standard: real effects differ, often by a large factor.",
  "No casualty figures are given. The descriptions of each level are the book's, for the conditions it states.",
  "The initial radiation curves are reliable only within a factor of 0.5 to 2 (fission) or 0.25 to 1.5 (thermonuclear) (§ 8.33). Neutrons may do more harm than the same number of rads of gamma rays (§ 8.65).",
  "Fallout: 'Although they will undoubtedly underestimate the fallout in some locations and overestimate it in others, the evaluation of the gross fallout problem over the whole area affected should not be greatly in error' (§ 9.83). Real winds change with height and time; real fallout has hot spots, gaps and the effect of rain, none of which this pattern shows (§§ 9.99 to 9.102). The dose rate falls with time: roughly tenfold for every sevenfold increase in time after the burst (§ 9.16).",
  "Where the book draws no curve (5 psi between 4 and 6 psi at some heights, first-degree burns below 3 cal/cm²), the model gives nothing rather than guess.",
];

export const EFFECTS_SOURCE =
  "Samuel Glasstone and Philip J. Dolan (eds), The Effects of Nuclear Weapons, third edition, United States Department of Defense and Energy Research and Development Administration, 1977.";

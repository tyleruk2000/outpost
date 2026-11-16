/**
 * Ohm's law, resistors and the small circuits built from them. Pure functions; the
 * screen says each formula beside its answer.
 *
 * Sources: Ohm's law and the power law (any electrical textbook); the resistor colour
 * code and the E series of preferred values are IEC 60062 and IEC 60063.
 */

export interface OhmValues {
  volts: number | null;
  amps: number | null;
  ohms: number | null;
  watts: number | null;
}

/**
 * From any two of volts, amps, ohms and watts, all four. Null when fewer than two are
 * given, or when the two given cannot belong together (a negative resistance, a power
 * with no current).
 */
export function ohmsLaw(given: OhmValues): OhmValues | null {
  const { volts: v, amps: i, ohms: r, watts: p } = given;
  const known = [v, i, r, p].filter((value) => value !== null).length;
  if (known < 2) return null;
  let result: OhmValues | null = null;
  if (v !== null && i !== null) result = { volts: v, amps: i, ohms: i === 0 ? null : v / i, watts: v * i };
  else if (v !== null && r !== null) result = r === 0 ? null : { volts: v, amps: v / r, ohms: r, watts: (v * v) / r };
  else if (v !== null && p !== null) result = v === 0 ? null : { volts: v, amps: p / v, ohms: p === 0 ? null : (v * v) / p, watts: p };
  else if (i !== null && r !== null) result = { volts: i * r, amps: i, ohms: r, watts: i * i * r };
  else if (i !== null && p !== null) result = i === 0 ? null : { volts: p / i, amps: i, ohms: p / (i * i), watts: p };
  else if (r !== null && p !== null)
    result = r <= 0 || p < 0 ? null : { volts: Math.sqrt(p * r), amps: Math.sqrt(p / r), ohms: r, watts: p };
  if (!result) return null;
  if ((result.ohms !== null && result.ohms < 0) || Object.values(result).some((value) => value !== null && !Number.isFinite(value)))
    return null;
  return result;
}

// ── Colour code (IEC 60062) ─────────────────────────────────────────────────

export type BandColour =
  | "black"
  | "brown"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "violet"
  | "grey"
  | "white"
  | "gold"
  | "silver"
  | "pink"
  | "none";

export const DIGIT_COLOURS: BandColour[] = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white"];

/** The multiplier band: a power of ten. */
export const MULTIPLIERS: Array<{ colour: BandColour; power: number }> = [
  { colour: "pink", power: -3 },
  { colour: "silver", power: -2 },
  { colour: "gold", power: -1 },
  ...DIGIT_COLOURS.map((colour, power) => ({ colour, power })),
];

/** The tolerance band, ± per cent. */
export const TOLERANCES: Array<{ colour: BandColour; percent: number }> = [
  { colour: "brown", percent: 1 },
  { colour: "red", percent: 2 },
  { colour: "green", percent: 0.5 },
  { colour: "blue", percent: 0.25 },
  { colour: "violet", percent: 0.1 },
  { colour: "grey", percent: 0.05 },
  { colour: "gold", percent: 5 },
  { colour: "silver", percent: 10 },
  { colour: "none", percent: 20 },
];

/** A resistor's value from its bands: two or three digits, a multiplier, a tolerance. */
export function decodeBands(
  digits: BandColour[],
  multiplier: BandColour,
  tolerance: BandColour,
): { ohms: number; tolerance: number } | null {
  if (digits.length < 2 || digits.length > 3) return null;
  let significant = 0;
  for (const colour of digits) {
    const digit = DIGIT_COLOURS.indexOf(colour);
    if (digit < 0) return null;
    significant = significant * 10 + digit;
  }
  const power = MULTIPLIERS.find((item) => item.colour === multiplier)?.power;
  const percent = TOLERANCES.find((item) => item.colour === tolerance)?.percent;
  if (power === undefined || percent === undefined) return null;
  return { ohms: roundSignificant(significant * 10 ** power, 6), tolerance: percent };
}

/** The bands for a value: its first two (or three) significant figures and a multiplier. Null when it cannot be written so. */
export function encodeBands(ohms: number, figures: 2 | 3): { digits: BandColour[]; multiplier: BandColour } | null {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return null;
  const power = Math.floor(Math.log10(ohms)) - (figures - 1);
  const significant = Math.round(ohms / 10 ** power);
  // Rounding can carry into another figure (9.99 → 10.0).
  const [value, at] = significant >= 10 ** figures ? [significant / 10, power + 1] : [significant, power];
  const multiplier = MULTIPLIERS.find((item) => item.power === at)?.colour;
  if (!multiplier) return null;
  const digits = String(Math.round(value))
    .padStart(figures, "0")
    .split("")
    .map((digit) => DIGIT_COLOURS[Number(digit)]!);
  return { digits, multiplier };
}

// ── Preferred values (IEC 60063) ────────────────────────────────────────────

export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
export const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];

/** The nearest value of a series at or above `ohms` (`"up"`), or at or below it (`"down"`). */
export function preferredValue(ohms: number, series: number[], direction: "up" | "down"): number | null {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return null;
  const decade = 10 ** (Math.floor(Math.log10(ohms)) - 1);
  const candidates = [-1, 0, 1].flatMap((shift) => series.map((value) => roundSignificant(value * decade * 10 ** shift, 6)));
  const tolerance = ohms * 1e-9;
  const fitting = candidates.filter((value) => (direction === "up" ? value >= ohms - tolerance : value <= ohms + tolerance));
  if (fitting.length === 0) return null;
  return direction === "up" ? Math.min(...fitting) : Math.max(...fitting);
}

export function roundSignificant(value: number, figures: number): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  return Number(value.toPrecision(figures));
}

// ── Combinations ────────────────────────────────────────────────────────────

export const seriesResistance = (values: number[]): number => values.reduce((sum, value) => sum + value, 0);

/** 1 / Σ(1/R). Zero if any is zero (a short); null with none. */
export function parallelResistance(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.some((value) => value === 0)) return 0;
  return 1 / values.reduce((sum, value) => sum + 1 / value, 0);
}

// ── An LED's series resistor ────────────────────────────────────────────────

export interface LedResistor {
  /** R = (Vs − n·Vf) / I */
  exactOhms: number;
  /** The next E-series value up, and the current and power with it. */
  chosenOhms: number;
  chosenAmps: number;
  /** Power in the resistor, watts. */
  watts: number;
}

/** The series resistor for `count` LEDs in series. Null when the supply is not above the LEDs' forward voltage. */
export function ledResistor(supplyV: number, forwardV: number, count: number, amps: number, series: number[] = E24): LedResistor | null {
  const headroom = supplyV - forwardV * count;
  if (!(headroom > 0) || !(amps > 0)) return null;
  const exactOhms = headroom / amps;
  const chosenOhms = preferredValue(exactOhms, series, "up") ?? exactOhms;
  const chosenAmps = headroom / chosenOhms;
  return { exactOhms, chosenOhms, chosenAmps, watts: chosenAmps * chosenAmps * chosenOhms };
}

// ── Voltage divider ─────────────────────────────────────────────────────────

/** Vout = Vin · R2' / (R1 + R2'), where R2' is R2 in parallel with the load when there is one. */
export function voltageDivider(vin: number, r1: number, r2: number, load: number | null = null): { vout: number; amps: number } | null {
  const lower = load !== null ? parallelResistance([r2, load]) : r2;
  if (lower === null || r1 + lower <= 0) return null;
  return { vout: (vin * lower) / (r1 + lower), amps: vin / (r1 + lower) };
}

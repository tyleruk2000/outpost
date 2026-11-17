/**
 * Copper cable: its resistance, the voltage it loses, and what one published rule says
 * about how much current it may carry.
 *
 * Sources:
 * - Resistivity of annealed copper at 20 °C, 1/58 Ω·mm²/m, and its temperature
 *   coefficient, 0.00393 per °C: the International Annealed Copper Standard, IEC 60028.
 * - Wire gauge: d = 0.127 mm × 92^((36 − n)/39), ASTM B258.
 * - Current: 33 CFR 183.425, table 5 (United States Coast Guard rules for the wiring of
 *   boats under 50 V), with its notes 1 and 2. It is a rule for one kind of wiring and is
 *   given as guidance. It is not BS 7671 and is no substitute for the regulations that
 *   apply to an installation or for a qualified electrician.
 */

export const COPPER_RESISTIVITY_20C = 1 / 58; // Ω·mm²/m
export const COPPER_TEMPERATURE_COEFFICIENT = 0.00393; // per °C, at 20 °C

/** Resistivity of copper at a temperature, Ω·mm²/m: ρ₂₀ × (1 + α(T − 20)). */
export const copperResistivity = (celsius: number): number =>
  COPPER_RESISTIVITY_20C * (1 + COPPER_TEMPERATURE_COEFFICIENT * (celsius - 20));

/** Gauges as written, with the number the ASTM formula uses: 0 is 1/0, −1 is 2/0 and so on. */
export const AWG_SIZES: Array<{ label: string; n: number }> = [
  ...[18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1].map((n) => ({ label: `${n} AWG`, n })),
  { label: "1/0 AWG", n: 0 },
  { label: "2/0 AWG", n: -1 },
  { label: "3/0 AWG", n: -2 },
  { label: "4/0 AWG", n: -3 },
];

export const awgDiameterMm = (n: number): number => 0.127 * 92 ** ((36 - n) / 39);
export const awgAreaMm2 = (n: number): number => (Math.PI * awgDiameterMm(n) ** 2) / 4;

/** Metric cable sizes commonly sold, mm². */
export const METRIC_SIZES = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

export interface VoltageDrop {
  /** Resistance of the whole loop, out and back, ohms. */
  ohms: number;
  volts: number;
  /** Of the supply voltage, per cent. */
  percent: number;
  /** Lost as heat in the cable, watts. */
  watts: number;
  /** What reaches the load, volts. */
  atLoad: number;
}

/**
 * The drop over a run of `oneWayMetres` out and the same back, carrying `amps`. Takes the
 * conductor at `celsius`; solid copper of the stated area. Stranded cable of the same
 * nominal size can be a few per cent higher (IEC 60228 gives the maximum for each class).
 */
export function voltageDrop(supplyV: number, amps: number, oneWayMetres: number, areaMm2: number, celsius = 20): VoltageDrop | null {
  if (!(areaMm2 > 0) || !(supplyV > 0) || amps < 0 || oneWayMetres < 0) return null;
  const ohms = (copperResistivity(celsius) * 2 * oneWayMetres) / areaMm2;
  const volts = amps * ohms;
  return { ohms, volts, percent: (volts / supplyV) * 100, watts: amps * amps * ohms, atLoad: supplyV - volts };
}

/** The smallest area that keeps the drop to `percent` of the supply, mm². */
export function areaForDrop(supplyV: number, amps: number, oneWayMetres: number, percent: number, celsius = 20): number | null {
  if (!(percent > 0) || !(supplyV > 0) || !(amps > 0) || !(oneWayMetres > 0)) return null;
  return (copperResistivity(celsius) * 2 * oneWayMetres * amps) / (supplyV * (percent / 100));
}

/** The smallest common size at or above an area: metric, and gauge. */
export function nextSizes(areaMm2: number): { metric: number | null; awg: { label: string; n: number } | null } {
  const metric = METRIC_SIZES.find((size) => size >= areaMm2) ?? null;
  const awg = [...AWG_SIZES].sort((a, b) => awgAreaMm2(a.n) - awgAreaMm2(b.n)).find((size) => awgAreaMm2(size.n) >= areaMm2) ?? null;
  return { metric, awg };
}

/**
 * Percentages of voltage drop people work to, each with whose it is. These are
 * conventions for how well things work, not safety limits.
 */
export const DROP_CONVENTIONS = [
  { percent: 3, rule: "BS 7671 Appendix 4: 3% for lighting circuits supplied from the public network" },
  { percent: 5, rule: "BS 7671 Appendix 4: 5% for other uses supplied from the public network" },
  { percent: 3, rule: "ABYC E-11 (boats): 3% for circuits that matter, such as navigation lights and electronics" },
  { percent: 10, rule: "ABYC E-11 (boats): 10% for circuits that tolerate it, such as cabin lighting" },
];

// ── 33 CFR 183.425, table 5 ─────────────────────────────────────────────────

/** Insulation temperature ratings, the columns of the table. */
export const INSULATION_RATINGS = [60, 75, 80, 90, 105, 125, 200] as const;
export type InsulationRating = (typeof INSULATION_RATINGS)[number];

/** Allowable amperes by gauge (rows, as `AWG_SIZES` numbers them) and insulation rating (columns). */
const TABLE_5: Record<number, number[]> = {
  18: [10, 10, 15, 20, 20, 25, 25],
  16: [15, 15, 20, 25, 25, 30, 35],
  14: [20, 20, 25, 30, 35, 40, 45],
  12: [25, 25, 35, 40, 45, 50, 55],
  10: [40, 40, 50, 55, 60, 70, 70],
  8: [55, 65, 70, 70, 80, 90, 100],
  6: [80, 95, 100, 100, 120, 125, 135],
  4: [105, 125, 130, 135, 160, 170, 180],
  3: [120, 145, 150, 155, 180, 195, 210],
  2: [140, 170, 175, 180, 210, 225, 240],
  1: [165, 195, 210, 210, 245, 265, 280],
  0: [195, 230, 245, 245, 285, 305, 325],
  [-1]: [225, 265, 285, 285, 330, 355, 370],
  [-2]: [260, 310, 330, 330, 385, 410, 430],
  [-3]: [300, 360, 385, 385, 445, 475, 510],
};

/** Note 1: in an engine space, by insulation rating. */
const ENGINE_SPACE: Record<InsulationRating, number> = { 60: 0.58, 75: 0.75, 80: 0.78, 90: 0.82, 105: 0.85, 125: 0.89, 200: 1 };

/** Note 2: by the number of current-carrying conductors bundled together. */
export function bundleFactor(conductors: number): number {
  if (conductors >= 25) return 0.4;
  if (conductors >= 7) return 0.5;
  if (conductors >= 4) return 0.6;
  if (conductors >= 3) return 0.7;
  return 1;
}

export interface CableLimit {
  /** The gauge whose row was read: the cable's own, or for a metric cable the largest gauge no bigger than it. */
  gauge: { label: string; n: number };
  tableAmps: number;
  factor: number;
  amps: number;
}

/** The table's figure for a gauge, with its two notes applied. Null for a gauge the table does not list. */
export function cfrLimit(n: number, rating: InsulationRating, options: { engineSpace: boolean; bundled: number }): CableLimit | null {
  const row = TABLE_5[n];
  const gauge = AWG_SIZES.find((size) => size.n === n);
  if (!row || !gauge) return null;
  const tableAmps = row[INSULATION_RATINGS.indexOf(rating)]!;
  const factor = (options.engineSpace ? ENGINE_SPACE[rating] : 1) * bundleFactor(options.bundled);
  return { gauge, tableAmps, factor, amps: tableAmps * factor };
}

/**
 * The gauge whose row stands for a metric cable: the largest gauge with no more copper
 * than it, so that the table is never read for a bigger conductor than the one there.
 * Null when the cable is smaller than 18 AWG.
 */
export function gaugeForArea(areaMm2: number): { label: string; n: number } | null {
  const fitting = AWG_SIZES.filter((size) => awgAreaMm2(size.n) <= areaMm2 * (1 + 1e-9));
  return fitting.sort((a, b) => awgAreaMm2(b.n) - awgAreaMm2(a.n))[0] ?? null;
}

export const FEET_PER_METRE = 1 / 0.3048;

/**
 * Units the calculators offer, each defined by how it turns into the base unit of its
 * quantity. The imperial and US figures are the legal definitions: the yard and pound of
 * the international agreement of 1959 (0.9144 m, 0.45359237 kg), the UK gallon of the
 * Weights and Measures Act 1985 (4.54609 litres), and the US gallon of 231 cubic inches
 * (3.785411784 litres; NIST Handbook 44, appendix C).
 *
 * A calculator lists the units that make sense for one input, metric first.
 */

export interface Unit {
  id: string;
  /** As it is written after a figure: "m", "ft", "litres". */
  symbol: string;
  /** Its name, where a symbol alone would be unclear: "UK gallons". */
  name: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

function linear(id: string, symbol: string, name: string, size: number): Unit {
  return { id, symbol, name, toBase: (value) => value * size, fromBase: (value) => value / size };
}

// ── Length, in metres ────────────────────────────────────────────────────────
export const mm = linear("mm", "mm", "millimetres", 0.001);
export const cm = linear("cm", "cm", "centimetres", 0.01);
export const m = linear("m", "m", "metres", 1);
export const km = linear("km", "km", "kilometres", 1000);
export const inch = linear("in", "in", "inches", 0.0254);
export const ft = linear("ft", "ft", "feet", 0.3048);
export const yd = linear("yd", "yd", "yards", 0.9144);
export const mile = linear("mi", "miles", "miles", 1609.344);

// ── Area, in square metres ───────────────────────────────────────────────────
export const m2 = linear("m2", "m²", "square metres", 1);
export const ft2 = linear("ft2", "sq ft", "square feet", 0.3048 ** 2);

// ── Volume, in litres ────────────────────────────────────────────────────────
export const ml = linear("ml", "ml", "millilitres", 0.001);
export const litre = linear("l", "litres", "litres", 1);
export const m3 = linear("m3", "m³", "cubic metres", 1000);
export const ukGallon = linear("ukgal", "UK gal", "UK gallons", 4.54609);
export const usGallon = linear("usgal", "US gal", "US gallons", 3.785411784);
export const ukPint = linear("ukpt", "UK pints", "UK pints", 0.56826125);
export const ukFlOz = linear("ukfloz", "UK fl oz", "UK fluid ounces", 0.0284130625);
export const usFlOz = linear("usfloz", "US fl oz", "US fluid ounces", 0.0295735295625);
/** The US customary cup, half a US pint. (Nutrition labels in the US use 240 ml.) */
export const usCup = linear("uscup", "US cups", "US cups", 0.2365882365);
/** The metric tablespoon and teaspoon used in UK recipes: 15 ml and 5 ml. */
export const tbsp = linear("tbsp", "tbsp", "tablespoons (15 ml)", 0.015);
export const tsp = linear("tsp", "tsp", "teaspoons (5 ml)", 0.005);

// ── Mass, in kilograms ───────────────────────────────────────────────────────
export const g = linear("g", "g", "grams", 0.001);
export const kg = linear("kg", "kg", "kilograms", 1);
export const tonne = linear("t", "t", "tonnes", 1000);
export const oz = linear("oz", "oz", "ounces", 0.028349523125);
export const lb = linear("lb", "lb", "pounds", 0.45359237);
export const stone = linear("st", "st", "stone", 6.35029318);

// ── Temperature, in degrees Celsius ──────────────────────────────────────────
export const celsius: Unit = { id: "c", symbol: "°C", name: "degrees Celsius", toBase: (v) => v, fromBase: (v) => v };
export const fahrenheit: Unit = {
  id: "f",
  symbol: "°F",
  name: "degrees Fahrenheit",
  toBase: (v) => ((v - 32) * 5) / 9,
  fromBase: (v) => (v * 9) / 5 + 32,
};

// ── Speed, in kilometres an hour ─────────────────────────────────────────────
export const kmh = linear("kmh", "km/h", "kilometres an hour", 1);
export const mph = linear("mph", "mph", "miles an hour", 1.609344);
export const ms = linear("ms", "m/s", "metres a second", 3.6);
export const knot = linear("kn", "knots", "knots", 1.852);

// ── Frequency, in megahertz ──────────────────────────────────────────────────
export const khz = linear("khz", "kHz", "kilohertz", 0.001);
export const mhz = linear("mhz", "MHz", "megahertz", 1);
export const ghz = linear("ghz", "GHz", "gigahertz", 1000);

// ── Power, in watts ──────────────────────────────────────────────────────────
export const mw = linear("mw", "mW", "milliwatts", 0.001);
export const watt = linear("w", "W", "watts", 1);
export const kw = linear("kw", "kW", "kilowatts", 1000);

/** Sets of units offered together for one kind of input. */
export const units = {
  shortLength: [m, cm, mm, ft, inch],
  length: [m, ft],
  building: [m, mm, ft, inch],
  distance: [km, mile],
  height: [m, ft],
  area: [m2, ft2],
  rainfall: [mm, inch],
  water: [litre, ukGallon, usGallon],
  bodyMass: [kg, lb, stone],
  temperature: [celsius, fahrenheit],
  wind: [kmh, mph, ms, knot],
  frequency: [mhz, khz, ghz],
  power: [watt, mw, kw],
} as const;

/** A value given in one unit, in another of the same quantity. */
export function convert(value: number, from: Unit, to: Unit): number {
  return to.fromBase(from.toBase(value));
}

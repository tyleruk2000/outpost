/**
 * The sums behind the outdoors calculators. Each names its source; docs/tools.md has the
 * links. Temperatures are in °C, speeds in km/h, distances in metres unless a name says
 * otherwise.
 */

// ── Walking time ────────────────────────────────────────────────────────────

/**
 * Naismith's rule in the metric form taught in Britain: 5 km an hour on the flat, and an
 * extra minute for every 10 m climbed. (Naismith's own words, in 1892, were an hour for
 * every three miles and an hour for every 2,000 feet of ascent.)
 */
export const NAISMITH = { kmPerHour: 5, minutesPer10mAscent: 1 } as const;

/** Langmuir's corrections for descent: minutes per 300 m of descent, by its steepness. */
export const LANGMUIR = { gentleMinutesPer300m: -10, steepMinutesPer300m: 10 } as const;

export interface WalkTime {
  /** Minutes for the distance on the flat. */
  flat: number;
  /** Minutes added for the climbing. */
  ascent: number;
  /** Minutes added (positive) or taken off (negative) for descent, by Langmuir. 0 when not asked for. */
  descent: number;
  total: number;
}

/**
 * Naismith's time for a walk, with Langmuir's descent corrections where the descent is
 * given: gentle descent (5° to 12°) takes 10 minutes off for every 300 m, steep descent
 * (over 12°) adds 10 minutes for every 300 m.
 */
export function naismithMinutes(distanceMeters: number, ascentMeters: number, gentleDescentMeters = 0, steepDescentMeters = 0): WalkTime {
  const flat = (distanceMeters / 1000 / NAISMITH.kmPerHour) * 60;
  const ascent = (ascentMeters / 10) * NAISMITH.minutesPer10mAscent;
  const descent = (gentleDescentMeters / 300) * LANGMUIR.gentleMinutesPer300m + (steepDescentMeters / 300) * LANGMUIR.steepMinutesPer300m;
  return { flat, ascent, descent, total: flat + ascent + descent };
}

// ── Gradient ────────────────────────────────────────────────────────────────

export interface Gradient {
  percent: number;
  degrees: number;
  /** "1 in n": horizontal distance for each unit of rise. Infinity on the flat. */
  oneIn: number;
}

/** The gradient of a rise over a horizontal distance (as measured on a map). */
export function gradient(rise: number, horizontal: number): Gradient {
  const r = Math.abs(rise);
  return {
    percent: (r / horizontal) * 100,
    degrees: (Math.atan2(r, horizontal) * 180) / Math.PI,
    oneIn: r === 0 ? Number.POSITIVE_INFINITY : horizontal / r,
  };
}

// ── Wind chill ──────────────────────────────────────────────────────────────

/**
 * The wind chill index of 2001, adopted by the US National Weather Service and
 * Environment and Climate Change Canada, in its metric form (°C, wind in km/h at 10 m):
 * 13.12 + 0.6215·T − 11.37·V^0.16 + 0.3965·T·V^0.16. Defined for air at or below 10 °C
 * and wind of at least 4.8 km/h (the NWS: 50 °F and 3 mph).
 */
export const WIND_CHILL_LIMITS = { maxC: 10, minKmh: 4.8 } as const;

export type Defined = { ok: true; value: number } | { ok: false; reason: string };

export function windChill(airC: number, windKmh: number): Defined {
  if (airC > WIND_CHILL_LIMITS.maxC) return { ok: false, reason: "Wind chill is defined only for air at 10 °C (50 °F) or colder." };
  if (windKmh < WIND_CHILL_LIMITS.minKmh) {
    return {
      ok: false,
      reason: "Wind chill is defined only for wind of 4.8 km/h (3 mph) or more. In stiller air it is the air temperature.",
    };
  }
  const v = windKmh ** 0.16;
  return { ok: true, value: 13.12 + 0.6215 * airC - 11.37 * v + 0.3965 * airC * v };
}

// ── Heat index ──────────────────────────────────────────────────────────────

/** The heat index as the NWS works it out, in °F. Defined from 80 °F; the NWS's own chart runs to 110 °F. */
export const HEAT_INDEX_LIMITS = { minF: 80, maxF: 110 } as const;

/**
 * The US National Weather Service's heat index: Steadman's simple formula first; where
 * that and the temperature average 80 °F or more, the Rothfusz regression with the NWS's
 * two adjustments for very dry and very humid air. Temperatures in °F, humidity in per cent.
 */
export function heatIndexF(t: number, rh: number): Defined {
  if (t < HEAT_INDEX_LIMITS.minF) return { ok: false, reason: "The heat index is worked out only for air at 80 °F (27 °C) or warmer." };
  if (t > HEAT_INDEX_LIMITS.maxF) {
    return {
      ok: false,
      reason: "Above 110 °F (43 °C) this is beyond the range the heat index formula was fitted to. Treat any such heat as dangerous.",
    };
  }
  if (rh < 0 || rh > 100) return { ok: false, reason: "Relative humidity runs from 0 to 100%." };
  const simple = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);
  if ((simple + t) / 2 < 80) return { ok: true, value: simple };
  let hi =
    -42.379 +
    2.04901523 * t +
    10.14333127 * rh -
    0.22475541 * t * rh -
    0.00683783 * t * t -
    0.05481717 * rh * rh +
    0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;
  if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5);
  return { ok: true, value: hi };
}

export const toF = (c: number) => (c * 9) / 5 + 32;
export const toC = (f: number) => ((f - 32) * 5) / 9;

/** The NWS's words for a heat index, by its value in °F. */
export function heatIndexCategory(hiF: number): string | null {
  if (hiF >= 125) return "Extreme danger";
  if (hiF >= 103) return "Danger";
  if (hiF >= 90) return "Extreme caution";
  if (hiF >= 80) return "Caution";
  return null;
}

// ── Energy and water on a walk ──────────────────────────────────────────────

/**
 * Energy used, in kilocalories, from a MET value of the Compendium of Physical
 * Activities, with one MET taken as 1 kcal for each kilogram of body mass each hour (the usual approximation).
 */
export function kcalFromMet(met: number, bodyKg: number, hours: number): number {
  return met * bodyKg * hours;
}

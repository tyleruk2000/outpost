/**
 * Morse timing math (PARIS standard).
 *
 * One "unit" is a dit. PARIS = 50 units, so at `wpm` words per minute a dit
 * lasts 1200/wpm ms. Element lengths: dit 1u, dah 3u; gaps: intra-character
 * 1u, inter-character 3u, inter-word 7u.
 *
 * Farnsworth spacing (ARRL / KE3Z model): characters are formed at
 * `charWpm` but the inter-character and inter-word gaps are stretched so the
 * overall rate matches `effectiveWpm`. PARIS spends 31 units on elements +
 * intra-character gaps and 19 units on spacing (4 letter gaps + 1 word gap),
 * so the stretched spacing unit comes from distributing the leftover time
 * across those 19 units.
 */

export interface MorseTiming {
  /** ms of one dit (and one intra-character gap) */
  ditMs: number;
  /** ms of one dah (3 dit units) */
  dahMs: number;
  /** ms gap between elements inside a character */
  intraCharMs: number;
  /** ms gap between characters */
  interCharMs: number;
  /** ms gap between words */
  interWordMs: number;
}

export function ditMs(wpm: number): number {
  if (!Number.isFinite(wpm) || wpm <= 0) throw new Error("wpm must be > 0");
  return 1200 / wpm;
}

export function standardTiming(wpm: number): MorseTiming {
  const u = ditMs(wpm);
  return { ditMs: u, dahMs: 3 * u, intraCharMs: u, interCharMs: 3 * u, interWordMs: 7 * u };
}

/**
 * Farnsworth timing: elements at `charWpm`, spacing stretched to hit
 * `effectiveWpm`. When `effectiveWpm >= charWpm` this collapses to
 * `standardTiming(charWpm)`.
 */
export function farnsworthTiming(charWpm: number, effectiveWpm: number): MorseTiming {
  if (!Number.isFinite(effectiveWpm) || effectiveWpm <= 0) {
    throw new Error("effectiveWpm must be > 0");
  }
  const base = standardTiming(charWpm);
  if (effectiveWpm >= charWpm) return base;
  // seconds: total word time at effective speed minus element time at char speed,
  // spread across PARIS's 19 spacing units.
  const spacingUnitSec = (60 / effectiveWpm - 37.2 / charWpm) / 19;
  const spacingUnitMs = spacingUnitSec * 1000;
  return {
    ...base,
    interCharMs: 3 * spacingUnitMs,
    interWordMs: 7 * spacingUnitMs,
  };
}

/** Effective wpm implied by a timing (inverse of farnsworthTiming, for display). */
export function effectiveWpm(t: MorseTiming): number {
  // one PARIS word: 31 element units at char speed + 4 letter gaps + 1 word gap
  const wordMs = 31 * t.ditMs + 4 * t.interCharMs + t.interWordMs;
  return 60_000 / wordMs;
}

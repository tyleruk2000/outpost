/**
 * Random numbers for the games: a small seeded generator (mulberry32), so that a deal or
 * a puzzle made from a seed is the same every time and can be tested, and a seed made
 * from `Math.random` for play. Nothing here needs a secure page.
 */

/** A function returning numbers in [0, 1), the same sequence for the same seed. */
export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a new game: a whole number from 1 to 2³² − 1. */
export function newSeed(): number {
  return 1 + Math.floor(Math.random() * 0xfffffffe);
}

/** A whole number from 0 to `below` − 1. */
export function randomInt(rng: Rng, below: number): number {
  return Math.floor(rng() * below);
}

/** A shuffled copy (Fisher and Yates). */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = randomInt(rng, index + 1);
    [out[index], out[other]] = [out[other]!, out[index]!];
  }
  return out;
}

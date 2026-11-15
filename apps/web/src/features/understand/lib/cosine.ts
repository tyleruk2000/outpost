/** Cosine similarity: how nearly two vectors point the same way, from 1 (same) through 0 (unrelated) to −1 (opposite). */

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Cosine of the angle between two arrows, with the tiny floating-point leftovers at 90° and 180° removed. */
export function cosineOfAngle(degrees: number): number {
  const value = Math.cos(toRadians(degrees));
  return Math.abs(value) < 1e-12 ? 0 : Math.round(value * 1e12) / 1e12;
}

/** The tip of a unit arrow at `degrees`, measured anticlockwise from pointing right, in screen coordinates (y grows downward). */
export function arrowTip(degrees: number, length = 1): { x: number; y: number } {
  const radians = toRadians(degrees);
  return { x: Math.cos(radians) * length, y: -Math.sin(radians) * length };
}

/** The angle, 0 to 180, between the fixed arrow (pointing right) and a pointer at (dx, dy) in screen coordinates. */
export function angleFromPointer(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const degrees = Math.abs((Math.atan2(-dy, dx) * 180) / Math.PI);
  return Math.round(Math.min(180, degrees));
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) sum += a[index]! * b[index]!;
  return sum;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  const size = Math.sqrt(dot(a, a) * dot(b, b));
  return size === 0 ? 0 : dot(a, b) / size;
}

/** What a cosine means, in words. */
export function describeCosine(value: number): string {
  if (value >= 0.95) return "pointing the same way: as alike as two texts can be";
  if (value >= 0.6) return "pointing nearly the same way: strongly related";
  if (value >= 0.25) return "leaning the same way: somewhat related";
  if (value > -0.25) return "at right angles, or close to it: unrelated";
  if (value > -0.95) return "leaning apart";
  return "pointing in opposite directions";
}

/**
 * Where two vectors agree. For each position, the product of the two numbers: positive
 * when both are non-zero with the same sign. Summed over every position of two unit
 * vectors, these products are the cosine similarity.
 */
export function agreement(a: readonly number[], b: readonly number[]): { products: number[]; sum: number; agreeing: number } {
  const length = Math.min(a.length, b.length);
  const products: number[] = [];
  let sum = 0;
  let agreeing = 0;
  for (let index = 0; index < length; index += 1) {
    const product = a[index]! * b[index]!;
    products.push(product);
    sum += product;
    if (product > 0) agreeing += 1;
  }
  return { products, sum, agreeing };
}

/** The largest absolute value in a vector, used to scale a row of bars to its own size. */
export const peak = (values: readonly number[]) => values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

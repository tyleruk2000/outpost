/**
 * The sums behind the cooking calculators. Food-safety figures are not worked out here:
 * they are quoted, in `safety.ts`, from the food-safety bodies that set them.
 */

// ── Boiling point at altitude ───────────────────────────────────────────────

/**
 * Air pressure at a height in the International Standard Atmosphere (ISO 2533), in
 * pascals: 101 325 × (1 − 2.25577 × 10⁻⁵ × h)^5.25588. Real pressure differs from it with
 * the weather by a few per cent.
 */
export function standardPressurePa(heightMeters: number): number {
  return 101_325 * (1 - 2.25577e-5 * heightMeters) ** 5.25588;
}

/**
 * The temperature at which water boils at a pressure, in °C, from the Antoine equation
 * with the coefficients NIST gives for water between 344 and 373 K (Stull, 1947):
 * log10(P / bar) = 5.08354 − 1663.125 / (T − 45.622).
 */
export function boilingPointAtPressure(pa: number): number {
  const bar = pa / 100_000;
  return 1663.125 / (5.08354 - Math.log10(bar)) + 45.622 - 273.15;
}

/** Highest height the boiling-point sum is offered for: the Antoine fit holds down to 344 K (71 °C), reached a little above 8,500 m. */
export const BOILING_MAX_HEIGHT_M = 8000;

export const boilingPointAtHeight = (heightMeters: number): number => boilingPointAtPressure(standardPressurePa(heightMeters));

// ── Scaling a recipe ────────────────────────────────────────────────────────

const VULGAR: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

/** A quantity as recipes write it ("2", "1.5", "1/2", "1 1/2", "1½", "½") read as a number, or null. */
export function readQuantity(text: string): number | null {
  const tidy = text.trim();
  let match = /^(\d+)\s*([¼½¾⅓⅔⅛])$/.exec(tidy);
  if (match) return Number(match[1]) + VULGAR[match[2]!]!;
  if (VULGAR[tidy] !== undefined) return VULGAR[tidy]!;
  match = /^(\d+)\s+(\d+)\/(\d+)$/.exec(tidy);
  if (match) return Number(match[1]) + Number(match[2]) / Number(match[3]);
  match = /^(\d+)\/(\d+)$/.exec(tidy);
  if (match) return Number(match[1]) / Number(match[2]);
  if (/^\d+(\.\d+)?$/.test(tidy)) return Number(tidy);
  return null;
}

/** A scaled quantity written for a cook: whole numbers stay whole, small ones keep a decimal or two. */
export function writeQuantity(value: number): string {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10);
  return String(Math.round(value * 100) / 100);
}

const LEADING = /^(\s*[-•*]?\s*)(\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛]|[¼½¾⅓⅔⅛]|\d+\/\d+|\d+(?:\.\d+)?)(.*)$/;

/**
 * Each line of a recipe's ingredients with the quantity at its start multiplied by
 * `factor`. A line with no quantity at its start is left as it is, and said to be.
 */
export function scaleRecipe(text: string, factor: number): Array<{ line: string; scaled: boolean }> {
  return text.split("\n").map((line) => {
    const match = LEADING.exec(line);
    const value = match ? readQuantity(match[2]!) : null;
    if (!match || value === null) return { line, scaled: false };
    return { line: `${match[1]}${writeQuantity(value * factor)}${match[3]}`, scaled: true };
  });
}

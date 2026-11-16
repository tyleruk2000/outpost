/**
 * Reading a figure a person typed, and saying plainly what is wrong with it. Limits are
 * given in the base unit of the quantity and said back in the unit the person chose.
 */
import { formatFigure } from "./format";
import type { Unit } from "./units";

export interface NumberLimits {
  /** Smallest allowed, inclusive, in the base unit. */
  min?: number;
  /** Must be more than this, in the base unit. */
  above?: number;
  /** Largest allowed, inclusive, in the base unit. */
  max?: number;
  /** Only whole numbers. */
  integer?: boolean;
  /** Said after a limit is broken, to say why it is there: "the formula is defined only up to 10 °C". */
  reason?: string;
}

export type Reading = { ok: true; value: number } | { ok: false; error: string };

export function readNumber(text: string, limits: NumberLimits = {}, unit?: Unit): Reading {
  const tidy = text.trim().replace(/\s+/g, "").replace(/^\+/, "").replace(/−/g, "-");
  if (tidy === "") return { ok: false, error: "Type a figure." };
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(tidy)) return readNumber(tidy.replace(/,/g, ""), limits, unit);
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(tidy)) {
    return { ok: false, error: tidy.includes(",") ? "Use a point for decimals, such as 12.5." : "Type a figure in numbers, such as 12.5." };
  }
  const shown = Number(tidy);
  if (!Number.isFinite(shown)) return { ok: false, error: "That figure is too large." };
  if (limits.integer && !Number.isInteger(shown)) return { ok: false, error: "Type a whole number." };
  const value = unit ? unit.toBase(shown) : shown;
  const say = (base: number) => {
    const inUnit = unit ? unit.fromBase(base) : base;
    return `${formatFigure(inUnit, { decimals: 3, significant: 4 })}${unit ? ` ${unit.symbol}` : ""}`;
  };
  const why = limits.reason ? `: ${limits.reason}` : "";
  // A small allowance, so that a limit said back in another unit and typed in again is accepted.
  const slack = 1e-9 * Math.max(1, Math.abs(value));
  if (limits.above !== undefined && !(value > limits.above)) {
    return { ok: false, error: limits.above === 0 ? `Must be more than 0${why}.` : `Must be more than ${say(limits.above)}${why}.` };
  }
  if (limits.min !== undefined && value < limits.min - slack) return { ok: false, error: `Must be at least ${say(limits.min)}${why}.` };
  if (limits.max !== undefined && value > limits.max + slack) return { ok: false, error: `Must be no more than ${say(limits.max)}${why}.` };
  return { ok: true, value };
}

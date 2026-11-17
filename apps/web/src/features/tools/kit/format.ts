/**
 * Numbers as the calculators write them: British grouping ("12,400"), never more figures
 * than the sum deserves. A calculator says how precise its answer is by the options it
 * passes, so that a figure is not given more precisely than its source gives it.
 */

export interface FigureOptions {
  /** At most this many digits after the point. Default 1. */
  decimals?: number;
  /** At most this many significant figures, where that is fewer than `decimals` allows. */
  significant?: number;
}

/** A number rounded to so many significant figures (3 → 1234 becomes 1230). */
export function roundSignificant(value: number, figures: number): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  const scale = 10 ** (figures - Math.ceil(Math.log10(Math.abs(value))));
  return Math.round(value * scale) / scale;
}

/** "1,234.5", "0.25", "12": a figure for reading, with no trailing zeros. */
export function formatFigure(value: number, { decimals = 1, significant }: FigureOptions = {}): string {
  if (!Number.isFinite(value)) return "–";
  const rounded = significant ? roundSignificant(value, significant) : value;
  const text = new Intl.NumberFormat("en-GB", { maximumFractionDigits: decimals }).format(rounded);
  // "-0" is not a figure anyone writes.
  return text === "-0" ? "0" : text;
}

/**
 * A time worked out from rough figures (a walking pace taken as 5 km an hour, a battery's
 * usable share, the share of time a radio transmits), rounded to about two significant
 * figures so that it claims no more than they support: to 5 minutes under 2 hours, to the
 * quarter hour under 12 hours, to the hour under 4 days, and to 6 hours beyond. Shown with
 * `ROUGH_MINUTES_WORDS` beside it.
 */
export function roughMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return minutes;
  const step = minutes < 120 ? 5 : minutes < 12 * 60 ? 15 : minutes < 4 * 24 * 60 ? 60 : 6 * 60;
  return Math.round(minutes / step) * step;
}

/** What `roughMinutes` does, said on the screen under a time it rounded. */
export const ROUGH_MINUTES_WORDS =
  "Rounded to 5 minutes under 2 hours, the quarter hour under 12 hours and the hour beyond, because the figures it comes from are estimates.";

/** A length of time in minutes as people say it: "2 hours 35 minutes", "45 minutes", "1 hour". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return "–";
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  const mins = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins || parts.length === 0) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

/** "a range of 2.5 to 3 litres": two ends of a range, collapsed when they are the same. */
export function formatRange(low: number, high: number, unit: string, options?: FigureOptions): string {
  const a = formatFigure(low, options);
  const b = formatFigure(high, options);
  return a === b ? `${a} ${unit}` : `${a} to ${b} ${unit}`;
}

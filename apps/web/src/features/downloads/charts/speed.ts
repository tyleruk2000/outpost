/** Transfer speeds and speed limits in the units people know them by. Pure. */
import { niceTicks } from "./scale";

const trim = (value: number, digits: number) => String(Number(value.toFixed(digits)));

function scaled(bytesPerSecond: number): { value: number; unit: string } {
  if (bytesPerSecond < 1000) return { value: bytesPerSecond, unit: "B/s" };
  if (bytesPerSecond < 1_000_000) return { value: bytesPerSecond / 1000, unit: "kB/s" };
  if (bytesPerSecond < 1_000_000_000) return { value: bytesPerSecond / 1_000_000, unit: "MB/s" };
  return { value: bytesPerSecond / 1_000_000_000, unit: "GB/s" };
}

/**
 * A measured speed: "480 kB/s", "2.10 MB/s". Three significant figures, kept even when
 * they are zeros, so a figure that updates twice a second does not change width.
 */
export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined || !Number.isFinite(bytesPerSecond) || bytesPerSecond < 0)
    return "unknown speed";
  const { value, unit } = scaled(bytesPerSecond);
  if (unit === "B/s") return `${Math.round(value)} B/s`;
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${unit}`;
}

/** A chosen speed, such as a limit or an axis tick: "500 kB/s", "1 MB/s", "2.5 MB/s". No padding zeros. */
export function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0";
  const { value, unit } = scaled(bytesPerSecond);
  return `${trim(value, value >= 100 ? 0 : 2)} ${unit}`;
}

/** The same speed as a connection is sold: megabits per second. 1 MB/s is 8 Mbit/s. */
export function formatMegabits(bytesPerSecond: number): string {
  const megabits = (bytesPerSecond * 8) / 1_000_000;
  if (megabits >= 1000) return `${trim(megabits / 1000, 2)} Gbit/s`;
  if (megabits >= 0.1) return `${trim(megabits, megabits >= 10 ? 0 : 1)} Mbit/s`;
  return `${trim(megabits * 1000, 0)} kbit/s`;
}

/** Round values for a speed axis that starts at zero and reaches at least `maxBytesPerSecond`. */
export function speedTicks(maxBytesPerSecond: number, maxTicks = 4): { ticks: number[]; max: number } {
  // With nothing measured, a 100 kB/s axis is a frame to draw on rather than a claim.
  return niceTicks(maxBytesPerSecond > 0 ? maxBytesPerSecond : 100_000, maxTicks);
}

// ── The speed limit setting ─────────────────────────────────────────────────
// Stored by the server as whole kilobytes per second; 0 means no limit.

export const LIMIT_PRESETS_KBPS = [0, 250, 500, 1000, 2000, 5000, 10_000] as const;
/** The most the server accepts. */
export const LIMIT_MAX_KBPS = 10_000_000;

export type LimitUnit = "kB/s" | "MB/s";

/** "No limit", "500 kB/s", "1 MB/s". */
export function limitLabel(kbps: number): string {
  return kbps > 0 ? formatRate(kbps * 1000) : "No limit";
}

/** "1 MB/s, 8 Mbit/s": the limit, then how a connection would be described. */
export function limitWithMegabits(kbps: number): string {
  return kbps > 0 ? `${formatRate(kbps * 1000)}, ${formatMegabits(kbps * 1000)}` : "No limit";
}

/**
 * Turns what a person typed into the setting. Returns the whole number of kB/s, or a
 * sentence saying why it cannot be used.
 */
export function parseLimit(text: string, unit: LimitUnit): { kbps: number } | { problem: string } {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "") return { problem: "Type a speed." };
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return { problem: "Type a number above zero, or choose “No limit”." };
  const kbps = Math.round(unit === "MB/s" ? value * 1000 : value);
  if (kbps < 1) return { problem: "The lowest limit is 1 kB/s." };
  if (kbps > LIMIT_MAX_KBPS) return { problem: `The highest limit is ${formatRate(LIMIT_MAX_KBPS * 1000)}.` };
  return { kbps };
}

/** A limit as the typed-value form would show it: 1500 → 1.5 MB/s, 750 → 750 kB/s. */
export function limitAsTyped(kbps: number): { text: string; unit: LimitUnit } {
  if (kbps >= 1000) return { text: trim(kbps / 1000, 3), unit: "MB/s" };
  return { text: kbps > 0 ? String(kbps) : "", unit: "kB/s" };
}

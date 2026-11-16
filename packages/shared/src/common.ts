/** Error body returned by every failing API call. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type JobState = "queued" | "running" | "paused" | "succeeded" | "failed" | "cancelled";

export interface JobDto {
  id: string;
  type: string;
  queue: string;
  state: JobState;
  title: string;
  subject: string | null;
  progress: { current: number; total: number | null; message: string | null };
  error: string | null;
  errorKind: string | null;
  attempts: number;
  maxAttempts: number;
  result: Record<string, unknown> | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  updatedAt: number;
}

const units = ["bytes", "kB", "MB", "GB", "TB", "PB"] as const;

/**
 * Human-readable size using decimal units (1 GB = 1,000,000,000 bytes), the convention
 * drive makers and download sites use, so numbers match what people see elsewhere.
 */
export function formatBytes(bytes: number | null | undefined, fractionDigits?: number): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "unknown size";
  if (bytes < 1000) return `${Math.round(bytes)} ${bytes === 1 ? "byte" : "bytes"}`;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = fractionDigits ?? (value >= 100 ? 0 : value >= 10 ? 1 : 2);
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** "1 second", "3 minutes", "2 hours 5 minutes" — for remaining-time estimates. Never less than a second. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  // Rounded first, so that 59.6 seconds is "1 minute" and not "60 seconds".
  const whole = Math.max(1, Math.round(seconds));
  if (whole < 60) return `${whole} second${whole === 1 ? "" : "s"}`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest === 0 ? h : `${h} ${rest} minute${rest === 1 ? "" : "s"}`;
}

/**
 * What a table holds under a key, and nothing else. `table[key]` on a plain object also
 * finds what every object inherits ("constructor", "__proto__", "toString"), so a key
 * that came from a file or from a person is looked up with this.
 */
export function ownValue<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

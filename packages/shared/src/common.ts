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

/**
 * Which rule made Outpost take a request as coming from the computer it runs on, so a
 * screen that says "you are at the computer Outpost runs on" can say why, and a wrong
 * answer is seen: the loopback address, one of the computer's own network addresses,
 * or Outpost not being open to the network at all.
 */
export type LocalBy = { rule: "loopback" | "own-address"; address: string } | { rule: "not-on-network"; address: null };

/**
 * Why a screen takes this device for the computer Outpost runs on, to follow "Offered
 * here because": "this is the computer Outpost runs on: you are connected from its own
 * address 192.168.1.232". Without a rule (an older server), the plain claim.
 */
export function localByReason(by: LocalBy | undefined): string {
  if (!by) return "you are at the computer Outpost runs on";
  if (by.rule === "loopback") return `this is the computer Outpost runs on: you are connected from its loopback address ${by.address}`;
  if (by.rule === "own-address") return `this is the computer Outpost runs on: you are connected from its own address ${by.address}`;
  return "this is the computer Outpost runs on: Outpost is not open to the network, so nothing else can reach it";
}

/** The start-up option that lets the settings held to the computer Outpost runs on be changed from every device. */
export const REMOTE_SETTINGS_OPTION = "OUTPOST_ALLOW_REMOTE_SETTINGS";

/**
 * Whether this request may change a setting held to the computer Outpost runs on, because
 * it opens a port or a device there or lets other programs read what Outpost holds (the
 * mesh radio set-up, the switch for other programs' tools), and why, so that a screen
 * never shows a control disabled without saying why and what to do:
 *
 *  - "local": the request comes from that computer (`localBy` says by which rule).
 *  - "option": Outpost was started with `option`=true (or, for the mesh radio, the older
 *    OUTPOST_ALLOW_REMOTE_ERASE, named in `option` then).
 *  - "remote": refused; `option` is the line to add to allow it from every device.
 *
 * `inContainer`: Outpost runs in a container, where no request looks as if it comes from
 * the computer itself, so the option is the only way from a browser, even on that computer.
 */
export interface SettingRight {
  allowed: boolean;
  reason: "local" | "option" | "remote";
  option: string;
  localBy?: LocalBy;
  inContainer: boolean;
}

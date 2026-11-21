/**
 * The device Outpost runs on: how it is doing (the status screen), and its clock.
 */

/** How one thing on the status screen stands. `unknown`: the system does not say, which is not a fault. */
export type DeviceCheckState = "good" | "attention" | "problem" | "unknown";

export type DeviceCheckGroup = "storage" | "data" | "device" | "work";

/** One line of the status screen, in plain words, with what to do about it when there is something to do. */
export interface DeviceCheck {
  id: string;
  group: DeviceCheckGroup;
  /** What it is: "Internal storage", "Last backup", "Temperature". */
  title: string;
  state: DeviceCheckState;
  /** What is true now, in one sentence or a few figures. */
  summary: string;
  /** What to do about it, when anything; null when nothing needs doing. */
  advice: string | null;
  /** A screen in Outpost where it is put right. */
  link: { to: string; label: string } | null;
}

/** How long the server's one thread was held up, lately. */
export interface EventLoopDelay {
  /** Whether it is being measured now: it is only while the server has work (a request lately, or a job running). */
  measuring: boolean;
  /** The worst hold-up in each of the last minutes it was measured, newest last, in milliseconds. */
  minutes: Array<{ at: number; worstMs: number; meanMs: number }>;
  /** The worst since the server started, and when. Null until anything has been measured. */
  worst: { at: number; ms: number } | null;
}

export interface DeviceStatus {
  checkedAt: number;
  checks: DeviceCheck[];
  eventLoop: EventLoopDelay;
}

/**
 * Whether the server's clock can be set from a browser, and if not, why not, in words.
 * `how`: `helper` is a small service on the computer Outpost's container runs on, put there
 * by deploy/pi/install.sh; `direct` is Outpost setting it itself (it runs with the right).
 */
export interface ClockSetting {
  possible: boolean;
  how: "helper" | "direct" | null;
  /** Possible, and this request may do it. */
  allowed: boolean;
  /** When not possible or not allowed: why, and exactly what to do, in words. */
  reason: string | null;
  /** The start-up option that lets other devices set it. */
  option: string;
}

export interface ServerClock {
  /** The server's clock, in milliseconds since 1970, when the answer was written. */
  now: number;
  /** The server's time zone, as the system names it. */
  timeZone: string;
  setting: ClockSetting;
}

export interface SetClockRequest {
  /** This device's clock, in milliseconds since 1970, as the request is sent. */
  deviceNow: number;
}

export interface SetClockResult {
  /** The server's clock after it was set. */
  now: number;
  /** How far it was moved, in milliseconds: positive is forward. */
  movedMs: number;
}

/** A clock more than this far from the browser's is said to be wrong. */
export const CLOCK_TOLERANCE_MS = 60_000;

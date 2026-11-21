/**
 * Who may change things: the household PIN. With no PIN (the default) every device that
 * can reach Outpost may read, change and delete, as before. With a PIN, every device may
 * still read; a device changes or deletes only once someone has entered the PIN on it.
 * Until then it is a guest, and reads only.
 */

/** The error code of a change refused because this device has not been unlocked with the PIN. */
export const LOCKED_CODE = "locked";

/** PINs are digits only, so that they can be typed on any phone's number pad. */
export const PIN_MIN_DIGITS = 4;
export const PIN_MAX_DIGITS = 12;
export const PIN_PATTERN = /^\d{4,12}$/;

export interface AccessState {
  /** "open": no PIN, every device changes things. "pin": changing needs the PIN on each device. */
  mode: "open" | "pin";
  /** Whether this device may change things now: always in "open" mode, once unlocked in "pin" mode. */
  canChange: boolean;
  /** When the PIN was set, or null. */
  pinSetAt: number | null;
  /** How many devices are unlocked with the PIN now. */
  unlockedDevices: number;
  /** When this device was unlocked, or null. */
  unlockedAt: number | null;
}

export interface AccessResponse {
  access: AccessState;
}

/** POST /api/access/pin: set a PIN (no PIN yet), or change it (`current` is the one in use). */
export interface SetPinBody {
  pin: string;
  current?: string;
}

/** POST /api/access/unlock */
export interface UnlockBody {
  pin: string;
}

/** POST /api/access/remove: back to no PIN. */
export interface RemovePinBody {
  current: string;
}

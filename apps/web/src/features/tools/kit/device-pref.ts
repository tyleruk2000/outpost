/**
 * What a calculator remembers on this device: the unit chosen for an input and the last
 * figure typed into it. A preference of the device, like the theme; nothing here is sent
 * to the server. Storage can be missing or refused (a private window, a full disk), so
 * every read and write is guarded and the calculator works without it.
 */
import { useCallback, useState } from "react";

const PREFIX = "outpost.tools.";

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not remembered on this device; the calculator still works.
  }
}

/** A string kept for this device under `key`, starting from `initial` the first time. */
export function useDevicePref<T extends string>(key: string, initial: T, isValid: (value: string) => value is T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = readPref(key);
    return stored !== null && isValid(stored) ? stored : initial;
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      writePref(key, next);
    },
    [key],
  );
  return [value, set];
}

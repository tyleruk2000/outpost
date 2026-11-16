/**
 * Private keys that have been unlocked, held in this tab's memory for a short while so
 * that a passphrase is not asked for at every step.
 *
 * A key is forgotten five minutes after it was last used, when the person presses
 * "Lock", when they leave the Encryption screen or an encrypted page, and when the tab
 * is hidden for good (closed, or navigated away). Nothing here is written anywhere.
 *
 * Reading or typing on a page that was opened with a key counts as use of that key
 * (`keepUnlocked`): the page must encrypt and check every save with it, so the key may
 * not be forgotten under a page that someone is still working on.
 *
 * "Forgotten" means the library is told to wipe the key's secret numbers and every
 * reference Outpost holds is dropped. A browser gives a page no way to be sure that
 * memory is erased, and a passphrase typed into a field is a string the page cannot
 * overwrite at all; the docs say so.
 */
import type { UnlockedKey } from "./engine";

/** How long an unlocked key is kept after its last use. */
export const UNLOCK_IDLE_MS = 5 * 60_000;

interface Held {
  key: UnlockedKey;
  timer: ReturnType<typeof setTimeout>;
  until: number;
}

const held = new Map<string, Held>();
const listeners = new Set<() => void>();
let snapshot = new Map<string, number>();

function changed(): void {
  snapshot = new Map([...held].map(([fingerprint, entry]) => [fingerprint, entry.until]));
  for (const listener of listeners) listener();
}

function drop(fingerprint: string): void {
  const entry = held.get(fingerprint);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.key.forget();
  held.delete(fingerprint);
}

/** Keeps an unlocked key for the idle time, replacing any earlier one for the same key. */
export function holdUnlocked(key: UnlockedKey, idleMs = UNLOCK_IDLE_MS): void {
  const fingerprint = key.fingerprint.toLowerCase();
  const before = held.get(fingerprint);
  if (before && before.key !== key) drop(fingerprint);
  else if (before) clearTimeout(before.timer);
  held.set(fingerprint, { key, until: Date.now() + idleMs, timer: setTimeout(() => lock(fingerprint), idleMs) });
  changed();
}

/** The unlocked key, if it is still held. Using it counts as use: the idle time starts again. */
export function unlockedKey(fingerprint: string, idleMs = UNLOCK_IDLE_MS): UnlockedKey | null {
  const entry = held.get(fingerprint.toLowerCase());
  if (!entry) return null;
  holdUnlocked(entry.key, idleMs);
  return entry.key;
}

/**
 * Counts as use of a key without handing it over: the idle time starts again. False
 * when the key is no longer held.
 *
 * Listeners are not told, because which keys are unlocked has not changed. An open page
 * calls this at every key and pointer press, and nothing should be drawn again for that.
 */
export function keepUnlocked(fingerprint: string, idleMs = UNLOCK_IDLE_MS): boolean {
  const id = fingerprint.toLowerCase();
  const entry = held.get(id);
  if (!entry) return false;
  clearTimeout(entry.timer);
  entry.until = Date.now() + idleMs;
  entry.timer = setTimeout(() => lock(id), idleMs);
  snapshot.set(id, entry.until);
  return true;
}

export function lock(fingerprint: string): void {
  if (!held.has(fingerprint.toLowerCase())) return;
  drop(fingerprint.toLowerCase());
  changed();
}

export function lockAll(): void {
  if (held.size === 0) return;
  for (const fingerprint of [...held.keys()]) drop(fingerprint);
  changed();
}

/** For `useSyncExternalStore`: fingerprints of the keys unlocked now, with the time each will be forgotten. */
export const unlockedSnapshot = (): ReadonlyMap<string, number> => snapshot;
export function subscribeUnlocked(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  // A tab being closed or sent to another address. (Switching to another tab and back is not this.)
  window.addEventListener("pagehide", lockAll);
}

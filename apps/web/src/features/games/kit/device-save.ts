/**
 * An unfinished game, kept in this browser only. Two people playing at once on two
 * devices must not overwrite each other's board, so a game in progress of Solitaire,
 * Peg solitaire, Sudoku, Draughts or Pairs is never sent to the server; only its result is, when it
 * ends (`useRecordResult`). Every read and write is inside try/catch: a private window,
 * blocked site data or a full store leaves the game working, only not kept.
 */
import { useEffect, useRef } from "react";

const PREFIX = "outpost.games.";

/**
 * The game kept under `key`, or null when there is none, it cannot be read, or `accept`
 * refuses it (an older shape, a damaged copy). `accept` must check every field it uses.
 */
export function readDeviceSave<T>(key: string, accept: (value: unknown) => value is T): T | null {
  try {
    const text = localStorage.getItem(PREFIX + key);
    if (!text) return null;
    const value: unknown = JSON.parse(text);
    return accept(value) ? value : null;
  } catch {
    return null;
  }
}

/** Keeps the game; says whether it could. */
export function writeDeviceSave(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceSave(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing kept, or nothing that can be reached: either way there is nothing to clear.
  }
}

/** How long after the last change the game is written: a burst of moves is one write. */
export const SAVE_AFTER_MS = 400;

/**
 * Keeps `value` under `key` while a game is played: `SAVE_AFTER_MS` after it last changed,
 * and at once when the page is hidden, left or closed. `toKeep` gives what is written (the
 * time played so far added in, say), or null to clear the key. A write that would put back
 * exactly what is there already is skipped.
 */
export function useDeviceSave<T>(key: string, value: T, toKeep: (value: T) => unknown = (same) => same): void {
  const latest = useRef({ key, value, toKeep });
  latest.current = { key, value, toKeep };
  const written = useRef<string | null>(null);
  const flush = useRef(() => {
    const { key, value, toKeep } = latest.current;
    const kept = toKeep(value);
    const text = kept === null ? "" : JSON.stringify(kept);
    if (text === written.current) return;
    written.current = text;
    if (kept === null) clearDeviceSave(key);
    else writeDeviceSave(key, kept);
  }).current;

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      // Leaving the screen keeps the game as it is.
      flush();
    };
  }, [flush]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: written again when the game changes, and only then
  useEffect(() => {
    const timer = window.setTimeout(flush, SAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [value, flush]);
}

/**
 * An unfinished game, kept in this browser only. Two people playing at once on two
 * devices must not overwrite each other's board, so a game in progress of Solitaire,
 * Peg solitaire, Sudoku, Draughts or Pairs is never sent to the server; only its result is, when it
 * ends (`useRecordResult`). Every read and write is inside try/catch: a private window,
 * blocked site data or a full store leaves the game working, only not kept.
 */

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

/**
 * Where each audiobook was left, on this device only.
 *
 * Kept in the browser's own storage, like the place in an EPUB: nothing is sent to the
 * server, so listening writes nothing there, and another device keeps its own place.
 * Saved on pause, on a change of chapter, when the page is hidden, and at most every few
 * seconds while playing (see `player.ts`). Up to 200 books are remembered; the oldest
 * is forgotten first. Storage that refuses (a private window) only means the place is
 * not remembered.
 */

const KEY = "outpost.audiobooks.places";
const SPEED_KEY = "outpost.audiobooks.speed";
const MOST = 200;

export interface Place {
  documentId: string;
  seconds: number;
  at: number;
}

function readAll(): Record<string, Place> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Place>) : {};
  } catch {
    return {};
  }
}

function writeAll(places: Record<string, Place>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    // Storage is full or refused; the place is simply not kept.
  }
}

export function readPlace(bookId: string): Place | undefined {
  const place = readAll()[bookId];
  return place && typeof place.documentId === "string" && Number.isFinite(place.seconds) ? place : undefined;
}

export function savePlace(bookId: string, documentId: string, seconds: number): void {
  const places = readAll();
  places[bookId] = { documentId, seconds: Math.max(0, Math.round(seconds * 10) / 10), at: Date.now() };
  const ids = Object.keys(places);
  if (ids.length > MOST) {
    for (const id of ids.sort((a, b) => places[a]!.at - places[b]!.at).slice(0, ids.length - MOST)) delete places[id];
  }
  writeAll(places);
}

export function forgetPlace(bookId: string): void {
  const places = readAll();
  if (!(bookId in places)) return;
  delete places[bookId];
  writeAll(places);
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function readSpeed(): number {
  try {
    const value = Number(window.localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

export function saveSpeed(speed: number): void {
  try {
    window.localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // Not kept; the next book starts at the usual speed.
  }
}

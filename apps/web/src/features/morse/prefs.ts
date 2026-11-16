/**
 * The Morse trainer's settings on this device: speeds, the tone, the key type and its
 * bindings, the echo options and the callsign. Kept in the browser so that keying
 * starts at once with no wait for the server, and mirrored to the server's record
 * (`data.ts`) so that another device starts from them. Storage can be missing or
 * refused (a private window), so every read and write is guarded and the trainer
 * works without it.
 *
 * Key bindings are `KeyboardEvent.code` values ("KeyZ", "Space", "ControlLeft"), so a
 * USB paddle interface that types keys works whatever the keyboard layout.
 */
import type { MorseEchoContent, MorseKeyType, MorseSettings } from "@outpost/shared";
import { useSyncExternalStore } from "react";

export type KeyType = MorseKeyType;
export type EchoContent = MorseEchoContent;

/** The settings, and the Koch lesson reached as this device last knew it (the server's record wins when it is ahead). */
export interface MorsePrefs extends MorseSettings {
  kochLesson?: number;
}

export type ResolvedMorsePrefs = Required<MorsePrefs>;

export const DEFAULT_MORSE_PREFS: ResolvedMorsePrefs = {
  charWpm: 18,
  effWpm: 10,
  toneHz: 600,
  volume: 0.7,
  keyerWpm: 15,
  keyType: "paddle",
  presetId: "generic-b",
  keyDit: "ControlLeft",
  keyDah: "ControlRight",
  keyStraight: "Space",
  swapPaddles: false,
  kochLesson: 1,
  groupCount: 10,
  groupSize: 5,
  echoWpm: 12,
  echoAdaptive: true,
  echoFarnsworth: false,
  echoSilenceWords: 2,
  echoContent: "koch",
  echoGroupSize: 3,
  callsign: "",
};

const KEY = "outpost.morse.prefs";

/** Whether this device has settings of its own (if not, the server's seed it). */
export function hasLocalMorsePrefs(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

function readLocal(): MorsePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as MorsePrefs) : {};
  } catch {
    return {};
  }
}

const resolve = (prefs: MorsePrefs): ResolvedMorsePrefs => ({ ...DEFAULT_MORSE_PREFS, ...prefs });

let memory: MorsePrefs = readLocal();
let snapshot: ResolvedMorsePrefs = resolve(memory);
const listeners = new Set<() => void>();

export function getMorsePrefs(): ResolvedMorsePrefs {
  return snapshot;
}

export function useMorsePrefs(): ResolvedMorsePrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

/** Merges a change into this device's settings and tells every screen that shows them. */
export function applyMorsePrefs(patch: MorsePrefs): void {
  memory = { ...memory, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Not kept in this browser; the change still holds until the page is closed.
  }
  snapshot = resolve(memory);
  for (const listener of listeners) listener();
}

/** Forgets this device's settings ("Start again" on the Progress tab). */
export function resetMorsePrefs(): void {
  memory = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
  snapshot = resolve(memory);
  for (const listener of listeners) listener();
}

/** The settings to mirror to the server: everything but the lesson, which has its own field. */
export function settingsOf(prefs: ResolvedMorsePrefs): MorseSettings {
  const { kochLesson: _lesson, ...settings } = prefs;
  return settings;
}

/** A key binding in words: "Z", "Space", "Left Ctrl". */
export function keyCodeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const names: Record<string, string> = {
    Space: "Space",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    MetaLeft: "Left Cmd",
    MetaRight: "Right Cmd",
    Period: ".",
    Comma: ",",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    ArrowLeft: "Left arrow",
    ArrowRight: "Right arrow",
    ArrowUp: "Up arrow",
    ArrowDown: "Down arrow",
  };
  return names[code] ?? code;
}

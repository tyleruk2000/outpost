/**
 * The Morse trainer (Radio → Morse trainer): what the server keeps for it. Outpost has
 * no accounts, so there is one record of progress and one list of practice sessions
 * for the whole copy, shared by everyone who uses it. The trainer's settings live in
 * each browser for speed and are mirrored into the same record, so a new device starts
 * from them. The engine itself is pure and lives in `./morse/`.
 */

/** "echo": the trainer plays hidden Morse and you key it back. */
export const MORSE_SESSION_KINDS = ["receive", "send", "qso", "echo"] as const;
export type MorseSessionKind = (typeof MORSE_SESSION_KINDS)[number];

export type MorseKeyType = "straight" | "paddle" | "single" | "bug";
export type MorseEchoContent = "koch" | "callsigns" | "abbrev" | "exchange";

/** The trainer's settings. Every field is optional, so a change can send only what changed. */
export interface MorseSettings {
  /** Receive: character speed (the speed of each character's elements). */
  charWpm?: number;
  /** Receive: effective (Farnsworth) speed. */
  effWpm?: number;
  toneHz?: number;
  volume?: number;
  /** Send: the keyer's speed. */
  keyerWpm?: number;
  keyType?: MorseKeyType;
  /** A keyer preset's id (RADIO_PRESETS). */
  presetId?: string;
  /** Key bindings, as `KeyboardEvent.code` values ("KeyZ", "Space", "ControlLeft"). */
  keyDit?: string;
  keyDah?: string;
  keyStraight?: string;
  swapPaddles?: boolean;
  groupCount?: number;
  groupSize?: number;
  echoWpm?: number;
  echoAdaptive?: boolean;
  echoFarnsworth?: boolean;
  /** Silence, in played word spaces, that ends a reply. */
  echoSilenceWords?: number;
  echoContent?: MorseEchoContent;
  echoGroupSize?: number;
  /** The callsign On the air, QSO practice and CQ conversations start from. "" for none. */
  callsign?: string;
}

export interface MorseProgress {
  kochLesson: number;
  bestCharWpm: number | null;
  bestEffWpm: number | null;
  settings: MorseSettings;
  /** Milliseconds; 0 while nothing has been kept. */
  updatedAt: number;
}

export interface MorseSession {
  id: string;
  kind: MorseSessionKind;
  /** When it finished, milliseconds. */
  at: number;
  /** 0 to 1. */
  accuracy: number;
  charWpm: number | null;
  effWpm: number | null;
  /** 0 to 1: steadiness of keying (send, echo and QSO). */
  rhythm: number | null;
  lesson: number | null;
  /** Character → times missed. */
  misses: Record<string, number>;
  /** Character → times it was in the drill. Empty for none. */
  tries: Record<string, number>;
}

/** `GET /api/morse` */
export interface MorseResponse {
  progress: MorseProgress;
  /** The most recent sessions, newest first (at most `MORSE_RECENT_SESSIONS`). */
  sessions: MorseSession[];
  /** How many sessions are kept in all. */
  sessionCount: number;
  /** Missed characters counted across every kept session. */
  weakChars: Record<string, number>;
  /**
   * A callsign to start from when the trainer has none: the station's own call in the
   * latest entry of the contact log, if there is one. Null otherwise.
   */
  suggestedCallsign: string | null;
}

/** `PUT /api/morse/progress`: every field optional; the server merges. Bests only ever go up. */
export interface MorseProgressInput {
  kochLesson?: number;
  bestCharWpm?: number;
  bestEffWpm?: number;
  settings?: MorseSettings;
}

/** `POST /api/morse/sessions`: one finished drill or exercise. */
export interface MorseSessionInput {
  kind: MorseSessionKind;
  accuracy: number;
  charWpm?: number;
  effWpm?: number;
  rhythm?: number;
  lesson?: number;
  misses?: Record<string, number>;
  tries?: Record<string, number>;
}

/** Sessions sent back with the progress. */
export const MORSE_RECENT_SESSIONS = 200;
/** Sessions kept in all; the oldest go first beyond this. */
export const MORSE_MAX_SESSIONS = 5000;

/** What erasing everything takes of the trainer, and what the Storage screen counts. */
export interface MorseKept {
  /** Practice sessions. */
  sessions: number;
  /** 1 when there is a record of progress and settings, otherwise 0. */
  progress: number;
}

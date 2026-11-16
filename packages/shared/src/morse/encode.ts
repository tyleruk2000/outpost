/**
 * Text → element sequence → key-envelope timeline.
 *
 * A timeline is a list of `{ on, ms }` segments the audio scheduler (or a
 * visual playhead) walks through in order. `on` means the key is down.
 */
import { DIT, type MorseToken, tokenize } from "./table.ts";
import type { MorseTiming } from "./timing.ts";

export interface TimelineSegment {
  on: boolean;
  ms: number;
  /** index into the token list this segment belongs to (spaces included) */
  tokenIndex: number;
}

export interface EncodedText {
  tokens: MorseToken[];
  segments: TimelineSegment[];
  totalMs: number;
}

/** Elements ('.'/'-' string) for one token run — prosigns are a single run. */
export function textToElements(text: string): { token: MorseToken; code: string | null }[] {
  return tokenize(text).map((token) => ({
    token,
    code: token.kind === "space" ? null : token.code,
  }));
}

export function textToTimeline(text: string, timing: MorseTiming): EncodedText {
  const tokens = tokenize(text);
  const segments: TimelineSegment[] = [];
  const push = (on: boolean, ms: number, tokenIndex: number) => {
    if (ms <= 0) return;
    const last = segments[segments.length - 1];
    if (last && last.on === on && last.tokenIndex === tokenIndex) last.ms += ms;
    else segments.push({ on, ms, tokenIndex });
  };

  tokens.forEach((token, ti) => {
    if (token.kind === "space") {
      // replace the previous inter-char gap with a word gap
      const last = segments[segments.length - 1];
      if (last && !last.on) last.ms = timing.interWordMs - timing.interCharMs;
      push(false, timing.interCharMs, ti);
      return;
    }
    for (let i = 0; i < token.code.length; i++) {
      if (i > 0) push(false, timing.intraCharMs, ti);
      push(true, token.code[i]! === DIT ? timing.ditMs : timing.dahMs, ti);
    }
    push(false, timing.interCharMs, ti);
  });

  // trailing gap is not part of the sound
  while (segments.length > 0 && !segments[segments.length - 1]!.on) segments.pop();

  const totalMs = segments.reduce((sum, s) => sum + s.ms, 0);
  return { tokens, segments, totalMs };
}

/** Total units (PARIS accounting) for a piece of text — used in tests. */
export function textUnits(text: string): number {
  const tokens = tokenize(text);
  let units = 0;
  tokens.forEach((token, i) => {
    if (token.kind === "space") {
      units += 7 - 3; // upgrade the previous 3u inter-char gap to 7u
      return;
    }
    for (let j = 0; j < token.code.length; j++) {
      if (j > 0) units += 1;
      units += token.code[j]! === DIT ? 1 : 3;
    }
    if (i < tokens.length - 1) units += 3;
  });
  return units;
}

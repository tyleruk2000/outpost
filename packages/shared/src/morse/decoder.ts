/**
 * Adaptive Morse decoder + copy/sending graders.
 *
 * The decoder consumes key-envelope events (down/up timestamps), estimates the
 * sender's dit length with an EMA so it follows speed drift, and emits decoded
 * characters. Gap classification: < 2u intra-character, 2–5u inter-character,
 * ≥ 5u word gap. Mark classification: dah when > 2 × ditEstimate.
 */
import { DAH, DIT, decodeElements } from "./table.ts";

export interface DecodedItem {
  text: string; // decoded char, '<AR>' style prosign, '?' for unknown, or ' '
  at: number;
  /** raw element pattern, e.g. '.-' */
  pattern: string;
}

/** One keyed mark (key-down → key-up), for timing analysis (echo coaching). */
export interface KeyedMark {
  downAt: number;
  upAt: number;
  element: "dit" | "dah";
}

export interface DecoderOptions {
  /** initial guess for dit length, ms (from the UI wpm setting) */
  initialDitMs?: number;
  /** EMA factor for dit estimate updates (0–1, higher adapts faster) */
  alpha?: number;
}

export class AdaptiveDecoder {
  private ditEst: number;
  private readonly alpha: number;
  private pattern = "";
  private lastDownAt: number | null = null;
  private lastUpAt: number | null = null;
  private out: DecodedItem[] = [];
  /** dit mark lengths seen, for rhythm scoring */
  readonly ditMarks: number[] = [];
  readonly dahMarks: number[] = [];
  /** every keyed mark with its timestamps (gaps are the space between them) */
  readonly marks: KeyedMark[] = [];

  constructor(opts: DecoderOptions = {}) {
    this.ditEst = opts.initialDitMs ?? 1200 / 20;
    this.alpha = opts.alpha ?? 0.25;
  }

  /** Current speed estimate in wpm. */
  get wpm(): number {
    return 1200 / this.ditEst;
  }

  get ditEstimateMs(): number {
    return this.ditEst;
  }

  /** Elements captured for the in-progress (not yet emitted) character. */
  get pendingPattern(): string {
    return this.pattern;
  }

  keyDown(at: number): DecodedItem[] {
    const emitted: DecodedItem[] = [];
    if (this.lastUpAt !== null) {
      const gap = at - this.lastUpAt;
      if (gap >= 2 * this.ditEst) {
        emitted.push(...this.emitChar(at));
        if (gap >= 5 * this.ditEst) {
          const space = { text: " ", at, pattern: "" };
          this.out.push(space);
          emitted.push(space);
        }
      }
    }
    this.lastDownAt = at;
    return emitted;
  }

  keyUp(at: number): void {
    if (this.lastDownAt === null) return;
    const mark = at - this.lastDownAt;
    if (mark <= 0) return;
    const isDah = mark > 2 * this.ditEst;
    this.pattern += isDah ? DAH : DIT;
    (isDah ? this.dahMarks : this.ditMarks).push(mark);
    this.marks.push({ downAt: this.lastDownAt, upAt: at, element: isDah ? "dah" : "dit" });
    // follow the sender's speed
    const impliedDit = isDah ? mark / 3 : mark;
    this.ditEst = this.ditEst + this.alpha * (impliedDit - this.ditEst);
    this.lastUpAt = at;
    this.lastDownAt = null;
  }

  /** Force out the pending character (call after ~5u of silence). */
  flush(at: number): DecodedItem[] {
    return this.emitChar(at);
  }

  /** ms of silence after which the caller should flush. */
  get flushAfterMs(): number {
    return 5 * this.ditEst;
  }

  get decoded(): readonly DecodedItem[] {
    return this.out;
  }

  get text(): string {
    return this.out.map((d) => d.text).join("");
  }

  /** Clear everything; `initialDitMs` also re-seeds the speed estimate (echo
   * mode starts each reply at the played speed). */
  reset(initialDitMs?: number): void {
    if (initialDitMs !== undefined && initialDitMs > 0) this.ditEst = initialDitMs;
    this.pattern = "";
    this.lastDownAt = null;
    this.lastUpAt = null;
    this.out = [];
    this.ditMarks.length = 0;
    this.dahMarks.length = 0;
    this.marks.length = 0;
  }

  private emitChar(at: number): DecodedItem[] {
    if (this.pattern === "") return [];
    const item: DecodedItem = {
      text: decodeElements(this.pattern) ?? "?",
      at,
      pattern: this.pattern,
    };
    this.pattern = "";
    this.out.push(item);
    return [item];
  }
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface CopyGrade {
  /** 0–1 per-character accuracy (Levenshtein similarity) */
  accuracy: number;
  correct: number;
  total: number;
  /** chars the user missed or got wrong, for weak-character stats */
  misses: string[];
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}

/**
 * LCS alignment of the sent text against the copy, per sent character:
 * `ok` marks characters the user got. Drives both the diff view and the
 * weak-character stats. Inputs should be normalised.
 */
export function copyDiff(sent: string, typed: string): { char: string; ok: boolean }[] {
  const m = sent.length;
  const n = typed.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = sent[i] === typed[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: { char: string; ok: boolean }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (sent[i] === typed[j]) {
      out.push({ char: sent[i]!, ok: true });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ char: sent[i]!, ok: false });
      i++;
    } else {
      j++;
    }
  }
  while (i < m) {
    out.push({ char: sent[i]!, ok: false });
    i++;
  }
  return out;
}

/** Which sent chars were copied wrong (spaces excluded). */
function missedChars(sent: string, typed: string): string[] {
  return copyDiff(sent, typed)
    .filter((d) => !d.ok && d.char !== " ")
    .map((d) => d.char);
}

/** Grade a receive (copy) attempt: what was sent vs what the user typed. */
export function gradeCopy(sent: string, typed: string): CopyGrade {
  const s = normalize(sent);
  const t = normalize(typed);
  const total = s.replace(/ /g, "").length;
  if (total === 0) return { accuracy: 1, correct: 0, total: 0, misses: [] };
  const dist = levenshtein(s, t);
  const accuracy = Math.max(0, 1 - dist / Math.max(s.length, t.length));
  const misses = missedChars(s, t);
  const correct = Math.max(0, total - misses.length);
  return { accuracy, correct, total, misses };
}

export interface SendingGrade extends CopyGrade {
  /** 0–1: how consistent the dit lengths were (1 = machine-perfect) */
  rhythm: number;
  /** decoder's speed estimate at the end, wpm */
  wpm: number;
}

/** Grade a sending attempt: target text vs what the decoder heard. */
export function gradeSending(target: string, decoder: AdaptiveDecoder): SendingGrade {
  const copy = gradeCopy(target, decoder.text);
  const rhythm = rhythmScore(decoder.ditMarks, decoder.dahMarks);
  return { ...copy, rhythm, wpm: decoder.wpm };
}

/** Coefficient-of-variation based consistency score, 0–1. */
export function rhythmScore(ditMarks: readonly number[], dahMarks: readonly number[]): number {
  const cv = (xs: readonly number[]): number | null => {
    if (xs.length < 2) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    if (mean <= 0) return null;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    return Math.sqrt(variance) / mean;
  };
  const cvs = [cv(ditMarks), cv(dahMarks)].filter((x): x is number => x !== null);
  if (cvs.length === 0) return 1;
  const avg = cvs.reduce((a, b) => a + b, 0) / cvs.length;
  // cv of 0 → 1.0; cv of 0.5 (very ragged) → 0
  return Math.max(0, Math.min(1, 1 - avg * 2));
}

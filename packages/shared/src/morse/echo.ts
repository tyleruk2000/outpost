/**
 * Echo mode engine: the trainer plays Morse with the text hidden,
 * the operator keys it back, and this module grades the reply.
 *
 * Everything here is pure and clock-free:
 *  - per-character stats over the last N tries, built from synced sessions
 *    (copy AND send/echo results feed the same window)
 *  - adaptive Koch weighting: weak and little-tried characters come up more,
 *    the newest character comes up in about one place in three while new and
 *    tapers to its normal share over its first 20 tries
 *  - the unlock rule (90 % over the window) for the next Koch character
 *  - an adaptive speed controller with bounds and a plain-language reason
 *  - timing analysis of the keyed marks against the played timing: dit/dah
 *    ratio, element, letter and word spacing, a played-vs-keyed timeline and
 *    one or two coaching tips
 *  - content beyond Koch groups (callsigns, abbreviations/Q-codes, short
 *    exchanges) from the shared drill generators
 */
import { type CopyGrade, gradeCopy, type KeyedMark } from "./decoder.ts";
import {
  CW_ABBREVIATIONS,
  QSO_NAMES,
  QSO_QTHS,
  QSO_RST_REPORTS,
  randomCallsigns,
  randomGroups,
  randomWords,
  seededRandom,
} from "./drills.ts";
import { textToTimeline } from "./encode.ts";
import { KOCH_ORDER, lessonCharset } from "./koch.ts";
import { tokenize } from "./table.ts";
import { farnsworthTiming, type MorseTiming, standardTiming } from "./timing.ts";

// ---------------------------------------------------------------------------
// Per-character stats
// ---------------------------------------------------------------------------

/** Tries kept per character for weighting and unlocking. */
export const CHAR_STATS_WINDOW = 20;

export interface CharStat {
  tries: number;
  misses: number;
}
export type CharStats = Record<string, CharStat>;

/** A session's per-character outcome, as stored with each synced session. */
export interface CharOutcome {
  tries?: Record<string, number>;
  misses: Record<string, number>;
}

/** How many times each character appears in a target (spaces excluded). */
export function charTries(target: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of target.toUpperCase()) {
    if (/\s/.test(ch)) continue;
    out[ch] = (out[ch] ?? 0) + 1;
  }
  return out;
}

/**
 * Fold sessions (NEWEST FIRST) into per-character stats over the last
 * `window` tries of each character. Within one session the order of tries is
 * unknown, so a session that straddles the window edge contributes its
 * misses pro rata. Sessions recorded before tries were stored (misses only)
 * cannot give a success rate and are skipped.
 */
export function charStatsFromSessions(sessions: readonly CharOutcome[], window = CHAR_STATS_WINDOW): CharStats {
  const out: CharStats = {};
  for (const s of sessions) {
    if (!s.tries) continue;
    for (const [ch, n] of Object.entries(s.tries)) {
      if (!(n > 0)) continue;
      out[ch] ??= { tries: 0, misses: 0 };
      const acc = out[ch];
      const room = window - acc.tries;
      if (room <= 0) continue;
      const take = Math.min(room, n);
      const missed = Math.min(n, Math.max(0, s.misses[ch] ?? 0));
      acc.tries += take;
      acc.misses += Math.round((missed * take) / n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adaptive Koch weighting + unlock
// ---------------------------------------------------------------------------

/** Share of places the newest character takes while it is brand new. */
export const NEW_CHAR_SHARE = 1 / 3;
/** Below this many tries a character counts as little-tried. */
const LITTLE_TRIED = 5;

/** The character a Koch lesson introduces, or null for lesson 1 (two at once). */
export function newestKochChar(lesson: number): string | null {
  const n = Math.trunc(lesson);
  if (n <= 1) return null;
  return KOCH_ORDER[Math.min(n, KOCH_ORDER.length - 1)] ?? null;
}

/**
 * Selection weights (same order as `charset`). Error rate over the window
 * weighs a character up (a 50 % miss rate → 2.5×), as does being little
 * tried. The newest character is then lifted to `NEW_CHAR_SHARE` of the
 * draw when untried, tapering linearly to its natural share by `window` tries.
 */
export function kochWeights(
  charset: readonly string[],
  stats: CharStats,
  newest: string | null,
  opts: { window?: number; newShare?: number } = {},
): number[] {
  const window = opts.window ?? CHAR_STATS_WINDOW;
  const newShare = opts.newShare ?? NEW_CHAR_SHARE;
  const weights = charset.map((c) => {
    const s = stats[c];
    const tries = s?.tries ?? 0;
    const err = tries > 0 ? Math.min(1, s!.misses / tries) : 0;
    const little = Math.max(0, 1 - tries / LITTLE_TRIED);
    return 1 + 3 * err + little;
  });
  const idx = newest === null ? -1 : charset.indexOf(newest);
  if (idx === -1 || charset.length < 2) return weights;
  const total = weights.reduce((a, b) => a + b, 0);
  const others = total - weights[idx]!;
  const natural = weights[idx]! / total;
  if (newShare <= natural) return weights;
  const tries = stats[newest!]?.tries ?? 0;
  const taper = Math.max(0, 1 - tries / window);
  const share = natural + (newShare - natural) * taper;
  weights[idx] = (share * others) / (1 - share);
  return weights;
}

export interface UnlockCheck {
  ready: boolean;
  /** 0–1 accuracy over the window across the lesson's characters (null = no data) */
  accuracy: number | null;
  /** plain-language status for the UI */
  reason: string;
}

/**
 * The next Koch character unlocks when copy and keying over the window are at
 * `threshold` (90 %) across the lesson's characters, and the newest one has
 * enough tries of its own to judge (and is itself at the threshold). With no
 * single newest character (lesson 1), every lesson character is gated so.
 */
export function kochUnlock(
  charset: readonly string[],
  stats: CharStats,
  newest: string | null,
  opts: { threshold?: number; minNewestTries?: number } = {},
): UnlockCheck {
  const threshold = opts.threshold ?? 0.9;
  const minNewest = opts.minNewestTries ?? 10;
  let tries = 0;
  let hits = 0;
  for (const c of charset) {
    const s = stats[c];
    if (!s) continue;
    tries += s.tries;
    hits += s.tries - s.misses;
  }
  const accuracy = tries > 0 ? hits / tries : null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  // The newest character must have enough tries of its own to judge. Lesson 1
  // introduces two characters at once (no single newest), so both must.
  const gated = newest ? [newest] : [...charset];
  for (const c of gated) {
    const s = stats[c];
    const n = s?.tries ?? 0;
    if (n < minNewest) {
      const more = minNewest - n;
      return {
        ready: false,
        accuracy,
        reason: `${more} more ${more === 1 ? "try" : "tries"} of ${c} before the next character can unlock.`,
      };
    }
    if ((n - s!.misses) / n + 1e-9 < threshold) {
      return {
        ready: false,
        accuracy,
        reason: `${c} is at ${pct((n - s!.misses) / n)}; ${pct(threshold)} unlocks the next character.`,
      };
    }
  }
  if (accuracy === null) {
    return { ready: false, accuracy, reason: "No tries yet for this lesson." };
  }
  if (accuracy + 1e-9 < threshold) {
    return {
      ready: false,
      accuracy,
      reason: `${pct(accuracy)} over your recent tries; ${pct(threshold)} unlocks the next character.`,
    };
  }
  return {
    ready: true,
    accuracy,
    reason: `${pct(accuracy)} over your last ${CHAR_STATS_WINDOW} tries of each character.`,
  };
}

// ---------------------------------------------------------------------------
// Adaptive speed
// ---------------------------------------------------------------------------

export interface EchoSpeedState {
  wpm: number;
  cleanStreak: number;
  missStreak: number;
}

export const INITIAL_SPEED_STATE: EchoSpeedState = { wpm: 15, cleanStreak: 0, missStreak: 0 };

export interface EchoSpeedConfig {
  min?: number;
  max?: number;
  step?: number;
  /** clean replies in a row before stepping up */
  cleanToStepUp?: number;
  /** misses in a row before stepping down */
  missesToStepDown?: number;
  /** accuracy at or above this is a clean reply */
  cleanAt?: number;
}

export interface EchoSpeedChange {
  from: number;
  to: number;
  direction: "up" | "down" | "hold";
  reason: string;
}

export const ECHO_WPM_MIN = 5;
export const ECHO_WPM_MAX = 40;

/** Feed one reply's accuracy; returns the next state and any speed change. */
export function nextEchoSpeed(
  state: EchoSpeedState,
  accuracy: number,
  cfg: EchoSpeedConfig = {},
): { state: EchoSpeedState; change: EchoSpeedChange | null } {
  const min = cfg.min ?? ECHO_WPM_MIN;
  const max = cfg.max ?? ECHO_WPM_MAX;
  const step = cfg.step ?? 1;
  const upAfter = cfg.cleanToStepUp ?? 3;
  const downAfter = cfg.missesToStepDown ?? 2;
  const cleanAt = cfg.cleanAt ?? 0.9;
  const wpm = Math.min(max, Math.max(min, state.wpm));

  if (accuracy >= cleanAt) {
    const cleanStreak = state.cleanStreak + 1;
    if (cleanStreak < upAfter) return { state: { wpm, cleanStreak, missStreak: 0 }, change: null };
    const to = Math.min(max, wpm + step);
    const lead = `${upAfter} clean replies in a row`;
    return {
      state: { wpm: to, cleanStreak: 0, missStreak: 0 },
      change:
        to === wpm
          ? {
              from: wpm,
              to,
              direction: "hold",
              reason: `${lead}, holding at the ${max} wpm maximum.`,
            }
          : { from: wpm, to, direction: "up", reason: `${lead}: up to ${to} wpm.` },
    };
  }
  const missStreak = state.missStreak + 1;
  if (missStreak < downAfter) return { state: { wpm, cleanStreak: 0, missStreak }, change: null };
  const to = Math.max(min, wpm - step);
  const lead = `${downAfter} misses in a row`;
  return {
    state: { wpm: to, cleanStreak: 0, missStreak: 0 },
    change:
      to === wpm
        ? {
            from: wpm,
            to,
            direction: "hold",
            reason: `${lead}, holding at the ${min} wpm minimum.`,
          }
        : { from: wpm, to, direction: "down", reason: `${lead}: down to ${to} wpm.` },
  };
}

/**
 * Played timing for an echo speed. Farnsworth (for beginners) forms the
 * characters at `charWpm` and stretches the gaps to the echo speed; it never
 * slows characters below the echo speed itself.
 */
export function echoTiming(wpm: number, opts: { farnsworth: boolean; charWpm?: number }): MorseTiming {
  if (!opts.farnsworth) return standardTiming(wpm);
  return farnsworthTiming(Math.max(opts.charWpm ?? 18, wpm), wpm);
}

/** True once the reply has gone quiet for `wordSpaces` played word gaps. */
export function replyComplete(lastUpAt: number | null, now: number, timing: MorseTiming, wordSpaces: number): boolean {
  if (lastUpAt === null) return false;
  return now - lastUpAt >= wordSpaces * timing.interWordMs;
}

// ---------------------------------------------------------------------------
// Timing analysis
// ---------------------------------------------------------------------------

export type GapKind = "element" | "letter" | "word";
export type TimingMetricId = "ratio" | GapKind;

export interface TimingMetric {
  id: TimingMetricId;
  label: string;
  /** standard proportion to aim for, in dits */
  expectedUnits: number;
  /** what you keyed on average, in your own dit (the keyer's for automatic
   * keyers); null = none keyed */
  keyedUnits: number | null;
  /** samples behind the average */
  count: number;
  /** 0–1, null when not scored (none keyed, or an automatic keyer timed it) */
  score: number | null;
}

export interface KeyingAnalysis {
  metrics: TimingMetric[];
  /** 0–1 mean of the scored metrics */
  score: number;
  /** your keying speed from mark lengths (null for automatic keyers) */
  keyedWpm: number | null;
  playedWpm: number;
  /** one or two plain-language coaching tips */
  tips: string[];
}

interface ExpectedShape {
  elements: ("dit" | "dah")[];
  /** gap kind before element i (length elements.length - 1, for i >= 1) */
  gaps: GapKind[];
}

function expectedShape(target: string): ExpectedShape {
  const elements: ("dit" | "dah")[] = [];
  const gaps: GapKind[] = [];
  let pendingWord = false;
  for (const token of tokenize(target)) {
    if (token.kind === "space") {
      pendingWord = true;
      continue;
    }
    [...token.code].forEach((el, i) => {
      if (elements.length > 0) gaps.push(i > 0 ? "element" : pendingWord ? "word" : "letter");
      elements.push(el === "." ? "dit" : "dah");
    });
    pendingWord = false;
  }
  return { elements, gaps };
}

const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** 1 decimal, without a trailing ".0". */
function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function metricScore(keyed: number | null, expected: number): number | null {
  if (keyed === null || expected <= 0) return null;
  return Math.max(0, Math.min(1, 1 - (2 * Math.abs(keyed - expected)) / expected));
}

function tipFor(m: TimingMetric): string {
  const k = fmt(m.keyedUnits!);
  const e = fmt(m.expectedUnits);
  const short = m.keyedUnits! < m.expectedUnits;
  switch (m.id) {
    case "ratio":
      return `Your dahs average ${k} dits, aim for ${e}.`;
    case "element":
      return `The gaps inside your letters average ${k} dits, aim for ${e}.`;
    case "letter":
      return short
        ? `Your letter gaps average ${k} dits, aim for ${e} so letters don't run together.`
        : `Your letter gaps average ${k} dits, aim for ${e} so letters don't split apart.`;
    case "word":
      return short
        ? `Your word gaps average ${k} dits, aim for ${e} so words don't run together.`
        : `Your word gaps average ${k} dits, aim for ${e}.`;
  }
}

/** Standard sending proportions, in dits: what the operator should key. */
const STANDARD_UNITS = { ratio: 3, element: 1, letter: 3, word: 7 } as const;

/**
 * Score keyed marks against standard sending proportions (dah 3, gaps 1/3/7
 * dits). Farnsworth only slows what you hear: your letter and word gaps are
 * still judged at standard spacing.
 *
 * Gaps are measured in YOUR keyed dit (the mean of your dits and dahs / 3),
 * so steady keying at a different speed is not mistaken for bad spacing; the
 * speed difference is reported once, by the speed check, and that tip is
 * always kept. With an automatic keyer (iambic / single lever) the keyer sets
 * the elements at the played character speed, so gaps use that dit and the
 * ratio and speed check are skipped.
 *
 * Dit/dah always come from what you keyed (the decoder's call), never from
 * the target. The target's shape only classifies gaps, and only when your
 * dit/dah sequence matches it exactly; otherwise gaps are classified by
 * thresholds midway between the standard gaps (2 and 5 dits).
 */
export function analyzeKeying(
  marks: readonly KeyedMark[],
  timing: MorseTiming,
  opts: { target?: string; keyerTimed?: boolean; heard?: boolean } = {},
): KeyingAnalysis {
  const u = timing.ditMs;
  const playedWpm = Math.round(1200 / u);
  const expected = STANDARD_UNITS;
  const labels: Record<TimingMetricId, string> = {
    ratio: "Dah length (dit/dah ratio)",
    element: "Gaps inside letters",
    letter: "Gaps between letters",
    word: "Gaps between words",
  };
  const ids: TimingMetricId[] = ["ratio", "element", "letter", "word"];

  if (marks.length === 0) {
    return {
      metrics: ids.map((id) => ({
        id,
        label: labels[id],
        expectedUnits: expected[id],
        keyedUnits: null,
        count: 0,
        score: null,
      })),
      score: 0,
      keyedWpm: null,
      playedWpm,
      tips: ["Nothing was keyed. Key your reply after the playback ends."],
    };
  }

  const dits: number[] = [];
  const dahs: number[] = [];
  for (const m of marks) (m.element === "dit" ? dits : dahs).push(m.upAt - m.downAt);
  // Your keyed unit: every dit, and every dah as three units.
  const ownUnit = mean([...dits, ...dahs.map((d) => d / 3)]);
  const gapUnit = opts.keyerTimed || !ownUnit || ownUnit <= 0 ? u : ownUnit;

  const shape = opts.target ? expectedShape(opts.target) : null;
  const aligned = shape !== null && shape.elements.length === marks.length && shape.elements.every((el, i) => el === marks[i]!.element);
  const gapKind = (i: number, ms: number): GapKind => {
    if (aligned) return shape.gaps[i - 1]!;
    const units = ms / gapUnit;
    if (units < (expected.element + expected.letter) / 2) return "element";
    if (units < (expected.letter + expected.word) / 2) return "letter";
    return "word";
  };

  const gaps: Record<GapKind, number[]> = { element: [], letter: [], word: [] };
  for (let i = 1; i < marks.length; i++) {
    const ms = marks[i]!.downAt - marks[i - 1]!.upAt;
    gaps[gapKind(i, ms)].push(ms);
  }

  const ditMean = mean(dits);
  const dahMean = mean(dahs);
  const inUnits = (xs: number[]) => (xs.length ? mean(xs)! / gapUnit : null);
  const keyed: Record<TimingMetricId, number | null> = {
    ratio: ditMean !== null && dahMean !== null && ditMean > 0 ? dahMean / ditMean : null,
    element: inUnits(gaps.element),
    letter: inUnits(gaps.letter),
    word: inUnits(gaps.word),
  };
  const counts: Record<TimingMetricId, number> = {
    ratio: Math.min(dits.length, dahs.length),
    element: gaps.element.length,
    letter: gaps.letter.length,
    word: gaps.word.length,
  };
  const metrics: TimingMetric[] = ids.map((id) => ({
    id,
    label: labels[id],
    expectedUnits: expected[id],
    keyedUnits: keyed[id],
    count: counts[id],
    score: id === "ratio" && opts.keyerTimed ? null : metricScore(keyed[id], expected[id]),
  }));

  const scored = metrics.filter((m) => m.score !== null).map((m) => m.score!);
  const score = scored.length > 0 ? mean(scored)! : 1;

  const keyedWpm = !opts.keyerTimed && ownUnit && ownUnit > 0 ? Math.round(1200 / ownUnit) : null;
  let speedTip: string | null = null;
  if (keyedWpm !== null && Math.abs(keyedWpm - playedWpm) / playedWpm > 0.2) {
    speedTip =
      opts.heard === false
        ? `You keyed at about ${keyedWpm} wpm against the ${playedWpm} wpm set; keep to the speed you chose.`
        : `You keyed at about ${keyedWpm} wpm against ${playedWpm} played; match the speed you heard.`;
  }

  const others = metrics
    .filter((m) => m.score !== null && m.score < 0.85)
    .sort((a, b) => a.score! - b.score!)
    .map(tipFor);
  const all = speedTip ? [speedTip, ...others] : others;
  const tips = all.length > 0 ? all.slice(0, 2) : ["Your timing matches the played rhythm closely. Keep it there."];

  return { metrics, score, keyedWpm, playedWpm, tips };
}

// ---------------------------------------------------------------------------
// Played-vs-keyed timeline
// ---------------------------------------------------------------------------

export interface TimelineSpan {
  start: number;
  end: number;
  element: "dit" | "dah";
}

export interface TimelineRow {
  index: number;
  playedElement: "dit" | "dah" | null;
  playedMs: number | null;
  /** gap after this played mark (null for the last) */
  playedGapMs: number | null;
  keyedElement: "dit" | "dah" | null;
  keyedMs: number | null;
  keyedGapMs: number | null;
}

export interface TimelineTracks {
  played: TimelineSpan[];
  keyed: TimelineSpan[];
  totalMs: number;
  /** the same data as a table, element by element */
  rows: TimelineRow[];
}

/** Two aligned tracks (played, keyed) on one ms axis from zero, plus a table. */
export function timelineTracks(target: string, timing: MorseTiming, marks: readonly KeyedMark[]): TimelineTracks {
  const played: TimelineSpan[] = [];
  let t = 0;
  for (const seg of textToTimeline(target, timing).segments) {
    if (seg.on) {
      played.push({
        start: t,
        end: t + seg.ms,
        element: seg.ms > 2 * timing.ditMs ? "dah" : "dit",
      });
    }
    t += seg.ms;
  }
  const t0 = marks[0]?.downAt ?? 0;
  const keyed: TimelineSpan[] = marks.map((m) => ({
    start: m.downAt - t0,
    end: m.upAt - t0,
    element: m.element,
  }));
  const totalMs = Math.max(played.at(-1)?.end ?? 0, keyed.at(-1)?.end ?? 0);
  const rows: TimelineRow[] = [];
  for (let i = 0; i < Math.max(played.length, keyed.length); i++) {
    const p = played[i];
    const k = keyed[i];
    rows.push({
      index: i + 1,
      playedElement: p?.element ?? null,
      playedMs: p ? Math.round(p.end - p.start) : null,
      playedGapMs: p && played[i + 1] ? Math.round(played[i + 1]!.start - p.end) : null,
      keyedElement: k?.element ?? null,
      keyedMs: k ? Math.round(k.end - k.start) : null,
      keyedGapMs: k && keyed[i + 1] ? Math.round(keyed[i + 1]!.start - k.end) : null,
    });
  }
  return { played, keyed, totalMs, rows };
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

export interface EchoGrade {
  copy: CopyGrade;
  timing: KeyingAnalysis;
  /** characters in the target → count (for the stats window) */
  tries: Record<string, number>;
  /** characters you got wrong → count */
  misses: Record<string, number>;
  /** at or above 90 %: counts toward the speed step-up streak */
  clean: boolean;
}

/** Grade one echo reply: what was played vs what the decoder heard, plus timing. */
export function gradeEcho(
  target: string,
  decodedText: string,
  marks: readonly KeyedMark[],
  timing: MorseTiming,
  /** `heard: false` when nothing was played first (speed tip wording) */
  opts: { keyerTimed?: boolean; heard?: boolean } = {},
): EchoGrade {
  const copy = gradeCopy(target, decodedText);
  const misses: Record<string, number> = {};
  for (const ch of copy.misses) misses[ch] = (misses[ch] ?? 0) + 1;
  return {
    copy,
    timing: analyzeKeying(marks, timing, {
      target,
      keyerTimed: opts.keyerTimed,
      heard: opts.heard,
    }),
    tries: charTries(target),
    misses,
    clean: copy.accuracy >= 0.9,
  };
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export type EchoContentKind = "koch" | "callsigns" | "abbrev" | "exchange";

/** A short exchange (RST, name, QTH) of at most four words. */
export function randomExchange(opts: { seed: number }): string {
  const rnd = seededRandom(opts.seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const rst = pick(QSO_RST_REPORTS);
  const name = pick(QSO_NAMES);
  const qth = pick(QSO_QTHS);
  const templates = [
    `UR RST ${rst}`,
    `RST ${rst} ${rst}`,
    `NAME ${name}`,
    `QTH ${qth}`,
    `UR ${rst} TU`,
    `NAME ${name} QTH ${qth}`,
    `5NN TU`,
    `TNX ${name} TU`,
  ];
  return pick(templates);
}

export interface EchoTargetOptions {
  seed: number;
  /** Koch lesson (drives the Koch charset) */
  lesson: number;
  /** characters in a Koch group */
  groupSize?: number;
  /** per-character stats over the window (Koch weighting) */
  stats?: CharStats;
}

/** One echo target of the given kind. */
export function echoTarget(kind: EchoContentKind, opts: EchoTargetOptions): string {
  const { seed } = opts;
  switch (kind) {
    case "koch": {
      const charset = lessonCharset(opts.lesson);
      const weights = kochWeights(charset, opts.stats ?? {}, newestKochChar(opts.lesson));
      return randomGroups(charset, { groups: 1, groupSize: opts.groupSize ?? 4, seed, weights });
    }
    case "callsigns":
      return randomCallsigns({ count: 1, seed, tier: "simple" });
    case "abbrev":
      return randomWords({ count: 2, seed, pool: CW_ABBREVIATIONS });
    case "exchange":
      return randomExchange({ seed });
  }
}

// ---------------------------------------------------------------------------
// One finished reply, end to end (shared by web and mobile)
// ---------------------------------------------------------------------------

export interface EchoResultInput {
  target: string;
  decodedText: string;
  marks: readonly KeyedMark[];
  timing: MorseTiming;
  keyerTimed?: boolean;
  /** speed controller state before this reply */
  speed: EchoSpeedState;
  adaptive: boolean;
  /** the echo speed setting the reply was played at */
  echoWpm: number;
  content: EchoContentKind;
  lesson: number;
  /** per-character outcomes counted so far, newest first */
  priorOutcomes: readonly CharOutcome[];
}

export interface EchoResult {
  grade: EchoGrade;
  tracks: TimelineTracks;
  /** next speed controller state (unchanged when adaptive is off) */
  speed: EchoSpeedState;
  speedChange: EchoSpeedChange | null;
  /** set when this reply unlocked the next Koch lesson */
  unlock: { lesson: number; chars: string[] } | null;
  outcome: CharOutcome;
  /** the synced session to record (POST /morse/sessions) */
  session: {
    kind: "echo";
    accuracy: number;
    rhythm: number;
    charWpm: number;
    effWpm: number;
    lesson?: number;
    misses: Record<string, number>;
    tries: Record<string, number>;
  };
}

const clampWpm = (n: number) => Math.min(100, Math.max(1, Math.round(n)));

/** Grade a reply and work out everything that follows from it. */
export function applyEchoResult(input: EchoResultInput): EchoResult {
  const grade = gradeEcho(input.target, input.decodedText, input.marks, input.timing, {
    keyerTimed: input.keyerTimed,
  });
  const tracks = timelineTracks(input.target, input.timing, input.marks);
  const next = input.adaptive ? nextEchoSpeed(input.speed, grade.copy.accuracy) : { state: input.speed, change: null };
  const outcome: CharOutcome = { tries: grade.tries, misses: grade.misses };
  let unlock: EchoResult["unlock"] = null;
  if (input.content === "koch" && input.lesson < KOCH_ORDER.length - 1) {
    const stats = charStatsFromSessions([outcome, ...input.priorOutcomes]);
    const check = kochUnlock(lessonCharset(input.lesson), stats, newestKochChar(input.lesson));
    if (check.ready) {
      const lesson = input.lesson + 1;
      unlock = { lesson, chars: [KOCH_ORDER[lesson]!] };
    }
  }
  return {
    grade,
    tracks,
    speed: next.state,
    speedChange: next.change,
    unlock,
    outcome,
    session: {
      kind: "echo",
      accuracy: grade.copy.accuracy,
      rhythm: grade.timing.score,
      charWpm: clampWpm(1200 / input.timing.ditMs),
      effWpm: clampWpm(input.echoWpm),
      ...(input.content === "koch" ? { lesson: input.lesson } : {}),
      misses: grade.misses,
      tries: grade.tries,
    },
  };
}

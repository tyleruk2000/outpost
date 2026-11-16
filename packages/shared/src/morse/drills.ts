/**
 * Drill generators — seeded so tests (and "play that again") are reproducible.
 */

/** mulberry32 — tiny, good-enough seeded PRNG. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

/**
 * Random character groups from a charset, e.g. "KMKUR MRUKM …".
 * `weights` (same order as charset) biases selection toward weak characters.
 */
export function randomGroups(
  charset: readonly string[],
  opts: { groups: number; groupSize?: number; seed: number; weights?: readonly number[] },
): string {
  if (charset.length === 0) throw new Error("charset must not be empty");
  const { groups, groupSize = 5, seed, weights } = opts;
  const rnd = seededRandom(seed);
  const cumulative: number[] = [];
  if (weights && weights.length === charset.length) {
    let sum = 0;
    for (const w of weights) {
      sum += Math.max(w, 0.0001);
      cumulative.push(sum);
    }
  }
  const drawChar = () => {
    if (cumulative.length === 0) return pick(rnd, charset);
    const r = rnd() * cumulative[cumulative.length - 1]!;
    const idx = cumulative.findIndex((c) => r < c);
    return charset[idx === -1 ? charset.length - 1 : idx]!;
  };
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    let word = "";
    for (let i = 0; i < groupSize; i++) word += drawChar();
    out.push(word);
  }
  return out.join(" ");
}

const CALL_PREFIXES = [
  "G",
  "M",
  "2E0",
  "2M0",
  "GM",
  "GW",
  "EI",
  "K",
  "W",
  "N",
  "KD",
  "VE",
  "VK",
  "ZL",
  "JA",
  "DL",
  "F",
  "EA",
  "I",
  "SM",
  "OH",
  "PA",
  "ON",
  "OZ",
  "SP",
  "OK",
  "HB9",
  "9A",
  "LZ",
  "UR",
];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/** Difficulty tier for word and callsign drills. */
export type DrillTier = "simple" | "complex";

/** Simple tier: single-letter prefixes with a plain 2–3 letter suffix. */
const SIMPLE_CALL_PREFIXES = CALL_PREFIXES.filter((p) => p.length === 1);

/** Complex tier adds portable / mobile suffixes and prefix-slashed calls. */
const CALL_MODIFIERS = ["/P", "/M", "/QRP", "/MM"];

/**
 * Made-up callsigns of a plausible shape: a real country prefix, a digit and random
 * letters. They are random, so one can happen to be a real station's call.
 * `tier` = 'simple' keeps to short single-letter-prefix calls; 'complex'
 * mixes longer prefixes and occasional /P-style suffixes.
 */
export function randomCallsigns(opts: { count: number; seed: number; tier?: DrillTier }): string {
  const rnd = seededRandom(opts.seed);
  const complex = opts.tier === "complex";
  const prefixes = opts.tier === "simple" ? SIMPLE_CALL_PREFIXES : CALL_PREFIXES;
  const calls: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const prefix = pick(rnd, prefixes);
    const digit = /\d$/.test(prefix) ? "" : pick(rnd, [...DIGITS]);
    const suffixLen = opts.tier === "simple" ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);
    let suffix = "";
    for (let j = 0; j < suffixLen; j++) suffix += pick(rnd, [...LETTERS]);
    const modifier = complex && rnd() < 0.3 ? pick(rnd, CALL_MODIFIERS) : "";
    calls.push(prefix + digit + suffix + modifier);
  }
  return calls.join(" ");
}

/** Every distinct character (letters, digits, prosign punctuation) a drill pool
 * can emit, sorted letters → digits → punctuation. Drives the "tap to hear"
 * chips shown for non-Koch drills. */
export function drillCharset(pool: readonly string[]): string[] {
  const set = new Set<string>();
  for (const word of pool) for (const ch of word.toUpperCase()) if (ch !== " ") set.add(ch);
  const rank = (c: string) => (/[A-Z]/.test(c) ? 0 : /[0-9]/.test(c) ? 1 : 2);
  return [...set].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Characters the callsign drill can produce, per tier. */
export function callsignCharset(tier: DrillTier = "simple"): string[] {
  const prefixes = tier === "simple" ? SIMPLE_CALL_PREFIXES : CALL_PREFIXES;
  return drillCharset([...prefixes, LETTERS, DIGITS, ...(tier === "complex" ? CALL_MODIFIERS : [])]);
}

/** Short, common English words for the word drill. */
export const COMMON_WORDS: readonly string[] = [
  "THE",
  "AND",
  "OF",
  "TO",
  "IN",
  "IS",
  "IT",
  "YOU",
  "THAT",
  "HE",
  "WAS",
  "FOR",
  "ON",
  "ARE",
  "AS",
  "WITH",
  "HIS",
  "THEY",
  "AT",
  "BE",
  "THIS",
  "HAVE",
  "FROM",
  "OR",
  "ONE",
  "HAD",
  "BY",
  "WORD",
  "BUT",
  "NOT",
  "WHAT",
  "ALL",
  "WERE",
  "WE",
  "WHEN",
  "YOUR",
  "CAN",
  "SAID",
  "THERE",
  "USE",
  "AN",
  "EACH",
  "WHICH",
  "SHE",
  "DO",
  "HOW",
  "THEIR",
  "IF",
  "WILL",
  "UP",
];

export const CW_ABBREVIATIONS: readonly string[] = [
  "CQ",
  "DE",
  "UR",
  "RST",
  "599",
  "5NN",
  "QTH",
  "NAME",
  "HW",
  "BK",
  "FB",
  "TNX",
  "TU",
  "73",
  "88",
  "OM",
  "YL",
  "RIG",
  "ANT",
  "WX",
  "HR",
  "ES",
  "AGN",
  "PSE",
  "QRS",
  "QRQ",
  "QRM",
  "QRN",
  "QSB",
  "QSY",
];

/** Longer / mixed-length words for the complex tier of the word drill. */
export const COMPLEX_WORDS: readonly string[] = [
  "ABOUT",
  "AFTER",
  "AGAIN",
  "BECAUSE",
  "BEFORE",
  "BETWEEN",
  "CHANGE",
  "DIFFERENT",
  "ENOUGH",
  "EVERY",
  "FOLLOW",
  "FRIEND",
  "GROUND",
  "HOUSE",
  "IMPORTANT",
  "LARGE",
  "LETTER",
  "MORNING",
  "NIGHT",
  "NUMBER",
  "OTHER",
  "PEOPLE",
  "PLACE",
  "QUESTION",
  "QUICKLY",
  "RIGHT",
  "SCHOOL",
  "SHOULD",
  "SIGNAL",
  "SMALL",
  "SOMETHING",
  "STATION",
  "STILL",
  "STRONG",
  "THOUGHT",
  "THROUGH",
  "TOGETHER",
  "WEATHER",
  "WITHOUT",
  "WORLD",
];

/** Word pool for a tier: short common words, or the longer mixed set plus
 * the common ones so rhythm still varies. */
export function wordPool(tier: DrillTier = "simple"): readonly string[] {
  return tier === "complex" ? [...COMPLEX_WORDS, ...COMMON_WORDS] : COMMON_WORDS;
}

export function randomWords(opts: { count: number; seed: number; pool?: readonly string[]; tier?: DrillTier }): string {
  const rnd = seededRandom(opts.seed);
  const pool = opts.pool ?? wordPool(opts.tier);
  const out: string[] = [];
  for (let i = 0; i < opts.count; i++) out.push(pick(rnd, pool));
  return out.join(" ");
}

/** Signal reports, operator names and QTHs used by the QSO phrase and
 * exchange generators. */
export const QSO_RST_REPORTS: readonly string[] = ["599", "579", "559", "5NN", "449"];
export const QSO_NAMES: readonly string[] = ["TOM", "ANNA", "JOHN", "KATE", "MIKE", "SUE", "DAVE", "JAN"];
export const QSO_QTHS: readonly string[] = ["LONDON", "LEEDS", "YORK", "OSLO", "PARIS", "BERLIN", "MADRID"];

/** A short plausible QSO exchange, for phrase copy practice. */
export function randomQsoPhrase(opts: { seed: number }): string {
  const rnd = seededRandom(opts.seed);
  const call1 = randomCallsigns({ count: 1, seed: Math.floor(rnd() * 1e9) });
  const call2 = randomCallsigns({ count: 1, seed: Math.floor(rnd() * 1e9) });
  const rst = pick(rnd, QSO_RST_REPORTS);
  const name = pick(rnd, QSO_NAMES);
  const qth = pick(rnd, QSO_QTHS);
  const templates = [
    `CQ CQ CQ DE ${call1} ${call1} K`,
    `${call1} DE ${call2} UR RST ${rst} ${rst} BT`,
    `TNX FB QSO UR RST ${rst} = NAME ${name} QTH ${qth} BT`,
    `R R ${call1} DE ${call2} TNX ${name} 73 <SK>`,
    `${call2} DE ${call1} GM UR ${rst} IN ${qth} HW? BK`,
  ];
  return pick(rnd, templates);
}

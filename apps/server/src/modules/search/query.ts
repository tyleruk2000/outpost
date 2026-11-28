/**
 * Turns what a person typed into an FTS5 query. User text is never passed to MATCH
 * directly: FTS5 has its own syntax and stray punctuation would be a syntax error (or,
 * worse, a column filter the person did not intend).
 *
 * Supported: plain words (all must match), "quoted phrases", -excluded words, and
 * prefix matching on the word still being typed. `expandQuery` adds other ways of
 * saying a word (synonyms.ts); a word in quotes is searched only as typed.
 *
 * Words that only shape a question ("how", "to", "the", "what") are left out of what
 * must match and of the ranking: "how to change car battery" looks for "change", "car"
 * and "battery". They stay inside quoted phrases, and a query made of nothing else
 * ("to be or not to be") keeps them all.
 */

import { STOP_WORDS } from "./stop-words.ts";
import { findExpansions } from "./synonyms.ts";

export interface ParsedQuery {
  /** Terms that must appear. Phrases keep their spaces. */
  required: string[];
  excluded: string[];
  /** The last word is still being typed, so it matches as a prefix. */
  prefixLast: boolean;
  /** Question and function words that were typed and left out of `required`. */
  ignored?: string[];
  /** For each required term: typed in quotes, so searched exactly as typed and never widened. */
  quoted?: boolean[];
  /** For each required term: other ways of saying it, any of which satisfies it (`expandQuery`). */
  alternatives?: string[][];
  /**
   * For each required term: several typed words joined because together they mean one
   * thing ("power cut"). Their words must be near each other, in any order.
   */
  joined?: boolean[];
}

export { STOP_WORDS };

/**
 * "Won't" and the like typed without the apostrophe, as a thumb types them, are read as
 * written with it: "bleeding wont stop" found a forum's "brakes wont bleed" by its "wont",
 * and offered "Did you mean bleeding want stop?". They are kept, not dropped: "car won't
 * start" is not about starting a car.
 */
const CONTRACTIONS: ReadonlyMap<string, string> = new Map(
  "won't don't can't isn't doesn't didn't wouldn't couldn't shouldn't aren't wasn't weren't hasn't haven't"
    .split(" ")
    .map((word) => [word.replace("'", ""), word]),
);

const TOKEN = /-?"[^"]*"?|[^\s]+/g;

function clean(term: string): string {
  // Keep letters, numbers and inner apostrophes/hyphens; everything else is a separator.
  return term
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s'’_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseQuery(input: string): ParsedQuery {
  const typed: Array<{ term: string; quoted: boolean }> = [];
  const excluded: string[] = [];
  const text = input.slice(0, 500);
  for (const match of text.matchAll(TOKEN)) {
    let token = match[0];
    const negative = token.startsWith("-") && token.length > 1;
    if (negative) token = token.slice(1);
    const term = clean(token.replace(/"/g, ""));
    if (!term || /^[-'’_]+$/.test(term)) continue;
    if (negative) excluded.push(term);
    else {
      const quoted = token.includes('"') || term.includes(" ");
      typed.push({ term: quoted ? term : (CONTRACTIONS.get(term.toLowerCase()) ?? term), quoted });
    }
  }
  const endsOpen = /[\p{L}\p{N}]$/u.test(text) && !text.trimEnd().endsWith('"');
  const isStop = (item: { term: string; quoted: boolean }) => !item.quoted && STOP_WORDS.has(item.term.toLowerCase());
  // A query of nothing but small words keeps them: they are all there is to look for.
  const keepAll = typed.every(isStop);
  const kept = typed.filter((item) => keepAll || !isStop(item));
  const ignored = typed.filter((item) => !kept.includes(item)).map((item) => item.term);
  const required = kept.map((item) => item.term);
  // The prefix belongs to the word still being typed. If that was a small word and left out, no word is open.
  const lastKept = typed.length > 0 && kept.at(-1) === typed.at(-1);
  return { required, excluded, prefixLast: endsOpen && lastKept, ignored, quoted: kept.map((item) => item.quoted) };
}

/**
 * Adds other ways of saying the words that matter (synonyms.ts): "tyre" is also "tire",
 * "power cut" also "power outage" and "blackout". Words in quotes stay as typed. Also
 * returns what was added, as words to show the person.
 */
export function expandQuery(parsed: ParsedQuery): { parsed: ParsedQuery; also: string[] } {
  const expansions = findExpansions(parsed.required, parsed.quoted ?? []);
  if (expansions.length === 0) return { parsed, also: [] };
  const required: string[] = [];
  const quoted: boolean[] = [];
  const alternatives: string[][] = [];
  const joined: boolean[] = [];
  let prefixLast = parsed.prefixLast;
  let index = 0;
  for (const expansion of expansions) {
    for (; index < expansion.start; index += 1) {
      required.push(parsed.required[index]!);
      quoted.push(parsed.quoted?.[index] ?? false);
      alternatives.push([]);
      joined.push(false);
    }
    required.push(parsed.required.slice(expansion.start, expansion.start + expansion.length).join(" "));
    quoted.push(false);
    alternatives.push(expansion.alternatives);
    joined.push(expansion.length > 1);
    // A recognised word is a whole word: it is not still being typed.
    if (expansion.start + expansion.length === parsed.required.length) prefixLast = false;
    index = expansion.start + expansion.length;
  }
  for (; index < parsed.required.length; index += 1) {
    required.push(parsed.required[index]!);
    quoted.push(parsed.quoted?.[index] ?? false);
    alternatives.push([]);
    joined.push(false);
  }
  const also = [...new Set(alternatives.flat())];
  return { parsed: { ...parsed, required, quoted, alternatives, joined, prefixLast }, also };
}

const quote = (term: string) => `"${term.replace(/"/g, '""')}"`;

/** One term as the index is asked for it: a prefix if it is still being typed. */
export function termExpression(term: string, prefix: boolean): string {
  return prefix ? `${quote(term)}*` : quote(term);
}

/** How far apart, in words, the words of a joined term ("power cut") may be: "the power was cut" holds it. */
export const JOINED_DISTANCE = 4;

/**
 * One required term as the index is asked for it: the term (a prefix if still being
 * typed; its words near each other if joined), or any of its other ways of being said.
 */
export function groupExpression(parsed: ParsedQuery, index: number, prefix: boolean): string {
  const term = parsed.required[index]!;
  const base = parsed.joined?.[index] ? `NEAR(${term.split(" ").map(quote).join(" ")}, ${JOINED_DISTANCE})` : termExpression(term, prefix);
  const alternatives = parsed.alternatives?.[index] ?? [];
  return alternatives.length > 0 ? `(${[base, ...alternatives.map(quote)].join(" OR ")})` : base;
}

/**
 * Builds the MATCH expression. `mode` "all" requires every term; "any" is the relaxed
 * fallback used when "all" finds too little. `prefix` says whether the last word is
 * matched as the start of a word too: by default when it may still be being typed.
 */
export function toFtsQuery(parsed: ParsedQuery, mode: "all" | "any" = "all", column?: string, prefix = parsed.prefixLast): string | null {
  if (parsed.required.length === 0) return null;
  // A prefix applies to the final word of the final term only.
  const terms = parsed.required.map((_, index) => groupExpression(parsed, index, prefix && index === parsed.required.length - 1));
  let expression = terms.join(mode === "all" ? " AND " : " OR ");
  if (terms.length > 1) expression = `(${expression})`;
  if (column) expression = `{${column}}: ${expression}`;
  for (const term of parsed.excluded) expression += ` NOT ${quote(term)}`;
  return expression;
}

/**
 * What to ask a full-text engine that is not Outpost's own (kiwix-serve): the words
 * that matter, phrases in quotes, without the small words that would make every
 * article match.
 */
export function plainQuery(parsed: ParsedQuery): string {
  return parsed.required.map((term, index) => (term.includes(" ") && !parsed.joined?.[index] ? quote(term) : term)).join(" ");
}

/**
 * The same, said the other way, for an engine that knows nothing of synonyms: each
 * widened term replaced by its first other way of being said ("tire pressure" for "tyre
 * pressure"). Null when nothing was widened.
 */
export function alternateQuery(parsed: ParsedQuery): string | null {
  if (!parsed.alternatives?.some((list) => list.length > 0)) return null;
  const alternate = plainQuery({
    ...parsed,
    required: parsed.required.map((term, index) => parsed.alternatives?.[index]?.[0] ?? term),
    joined: parsed.required.map((_, index) => (parsed.alternatives?.[index]?.[0] ? false : (parsed.joined?.[index] ?? false))),
  });
  return alternate && alternate !== plainQuery(parsed) ? alternate : null;
}

/**
 * Words that say what to do or how, not what about: "treat", "store", "safely". The
 * rest of a question's words ("burn", "petrol") are what a page would be titled, so they
 * are what a search of titles asks for (kiwix-serve's title search) and what a title
 * that is the answer ("Burn" for "treat a burn") is made of.
 */
export const ACTION_WORDS: ReadonlySet<string> = new Set(
  (
    "treat treating treatment fix fixing make making change changing store storing stop stopping start starting purify " +
    "filter tie tying charge charging check checking replace replacing repair repairing use using build building cook " +
    "grow growing clean cleaning remove find get keep cure prevent read boil put last tell need want best good " +
    "signs sign symptoms way ways much many long term without per day safely safe quickly properly easily correctly " +
    // "Can I take paracetamol and ibuprofen together" is about paracetamol and ibuprofen: a title holds those.
    "take taking together"
  ).split(" "),
);

/** The words of a question a title would hold: those that matter, without the action words. All of them if none is left. */
export function titleWords(parsed: ParsedQuery): string[] {
  const words = parsed.required.flatMap((term, index) => (parsed.quoted?.[index] ? [term] : term.split(" ")));
  const nouns = words.filter((word) => !ACTION_WORDS.has(word.toLowerCase()));
  return nouns.length > 0 ? nouns : words;
}

export interface Segment {
  text: string;
  hit: boolean;
}

export const HIT_OPEN = "\u0002";
export const HIT_CLOSE = "\u0003";

/** Converts FTS5 highlight output (using control-character markers) into safe segments. */
export function toSegments(marked: string): Segment[] {
  const segments: Segment[] = [];
  let rest = marked;
  while (rest.length > 0) {
    const open = rest.indexOf(HIT_OPEN);
    if (open === -1) {
      segments.push({ text: rest, hit: false });
      break;
    }
    if (open > 0) segments.push({ text: rest.slice(0, open), hit: false });
    const close = rest.indexOf(HIT_CLOSE, open);
    if (close === -1) {
      segments.push({ text: rest.slice(open + 1), hit: true });
      break;
    }
    segments.push({ text: rest.slice(open + 1, close), hit: true });
    rest = rest.slice(close + 1);
  }
  return segments.filter((segment) => segment.text.length > 0);
}

/**
 * One scale for every result, whichever source found it.
 *
 * The full-text index (BM25), kiwix-serve and the module tables each rank in their own
 * way, and their numbers cannot be compared. So every candidate is scored again here,
 * from what it shows (title, heading, tags, text or snippet), against the words that
 * matter in the query (query.ts leaves out "how", "to", "the"…). The score is 0 to 1
 * and means the same thing for a document page, a note and a reference article:
 *
 *   coverage   0.50  how much of the query it holds, each word weighed by how rare it is
 *   title      0.20  how much of it is in the title (tags and headings count for less)
 *   closeness  0.15  how near together the words are
 *   phrase     0.05  the words side by side, in the order typed
 *   frequency  0.10  how often they occur, with diminishing returns
 *
 * Coverage carries half, so an item with every word beats one missing a word unless
 * the missing word says little (is common in the library).
 */
import { type ParsedQuery, STOP_WORDS } from "./query.ts";
import { stem } from "./stem.ts";

export const SCORE_WEIGHTS = { coverage: 0.5, title: 0.2, closeness: 0.15, phrase: 0.05, frequency: 0.1 } as const;

export interface ScoringTerm {
  term: string;
  /** Each way of writing it, as stemmed word sequences: the term itself, and any alternatives a caller adds. */
  forms: string[][];
  /** The term's last word is still being typed and matches as a beginning. */
  prefix: boolean;
  /** How much the word says: rare words weigh more. */
  weight: number;
}

export interface ScoreFields {
  title: string;
  heading?: string | null;
  tags?: string | null;
  text?: string | null;
}

export interface ScoreParts {
  score: number;
  coverage: number;
  title: number;
  closeness: number;
  phrase: number;
  frequency: number;
  /** How many of the query's terms it holds, and of how many. */
  found: number;
  of: number;
}

interface Token {
  raw: string;
  stem: string;
}

/** Words as the index sees them: accents and case gone, split at anything not a letter or digit, stemmed. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const raw of text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw) tokens.push({ raw, stem: stem(raw) });
  }
  return tokens;
}

/** The query's terms, ready to score with. `weightOf` says how much a term says (its inverse document frequency). */
export function scoringTerms(parsed: ParsedQuery, weightOf: (term: string, index: number) => number): ScoringTerm[] {
  return parsed.required.map((term, index) => ({
    term,
    forms: [term].map((form) => tokenize(form).map((token) => token.stem)),
    prefix: parsed.prefixLast && index === parsed.required.length - 1,
    weight: Math.max(0.05, weightOf(term, index)),
  }));
}

/** Where each term occurs in `tokens` (start positions), and how long each occurrence is. */
function occurrences(term: ScoringTerm, tokens: Token[]): Array<{ at: number; length: number }> {
  const found: Array<{ at: number; length: number }> = [];
  term.forms.forEach((form, formIndex) => {
    if (form.length === 0) return;
    const prefixForm = term.prefix && formIndex === 0;
    for (let at = 0; at + form.length <= tokens.length; at += 1) {
      let match = true;
      for (let offset = 0; offset < form.length && match; offset += 1) {
        const token = tokens[at + offset]!;
        const wanted = form[offset]!;
        const last = offset === form.length - 1;
        match =
          token.stem === wanted ||
          (prefixForm && last && (token.raw.startsWith(wanted) || token.stem.startsWith(wanted) || token.raw.startsWith(term.term.toLowerCase().split(" ").at(-1)!)));
      }
      if (match) found.push({ at, length: form.length });
    }
  });
  return found;
}

/** The tokens without the small words, so that "replace a car battery" has its words side by side. */
function contentTokens(tokens: Token[]): Token[] {
  return tokens.filter((token) => !STOP_WORDS.has(token.raw));
}

/** The shortest stretch of `tokens` holding an occurrence of each present term, in tokens. */
function shortestSpan(lists: Array<Array<{ at: number; length: number }>>): number {
  const events = lists.flatMap((list, term) => list.map((hit) => ({ ...hit, term }))).sort((a, b) => a.at - b.at);
  const need = lists.length;
  const counts = new Map<number, number>();
  let best = Number.POSITIVE_INFINITY;
  let start = 0;
  for (let end = 0; end < events.length; end += 1) {
    counts.set(events[end]!.term, (counts.get(events[end]!.term) ?? 0) + 1);
    while (counts.size === need) {
      const first = events[start]!;
      const span = Math.max(...events.slice(start, end + 1).map((hit) => hit.at + hit.length)) - first.at;
      best = Math.min(best, span);
      const left = (counts.get(first.term) ?? 0) - 1;
      if (left === 0) counts.delete(first.term);
      else counts.set(first.term, left);
      start += 1;
    }
  }
  return best;
}

/** Closeness and phrase for one stretch of text: 0 to 1 each. */
function nearness(terms: ScoringTerm[], tokens: Token[]): { closeness: number; phrase: number } {
  const lists = terms.map((term) => occurrences(term, tokens));
  const present = lists.filter((list) => list.length > 0);
  if (terms.length === 1) return present.length === 1 ? { closeness: 1, phrase: 1 } : { closeness: 0, phrase: 0 };
  if (present.length < 2) return { closeness: 0, phrase: 0 };
  const words = present.reduce((sum, list) => sum + Math.min(...list.map((hit) => hit.length)), 0);
  const span = Math.min(shortestSpan(present), 10_000);
  // 1 when the words are side by side; halves as the stretch grows to twice as long, and so on. Scaled by how many are there.
  const closeness = (words / Math.max(span, words)) * ((present.length - 1) / (terms.length - 1));
  let phrase = 0;
  if (present.length === terms.length) {
    // Every term in the order typed, each starting where the one before ended.
    const starts = new Set(lists[0]!.map((hit) => hit.at));
    for (const at of starts) {
      let position = at;
      let whole = true;
      for (const list of lists) {
        const hit = list.find((candidate) => candidate.at === position);
        if (!hit) {
          whole = false;
          break;
        }
        position += hit.length;
      }
      if (whole) {
        phrase = 1;
        break;
      }
    }
  }
  return { closeness, phrase };
}

export function scoreFields(terms: ScoringTerm[], fields: ScoreFields): ScoreParts {
  const of = terms.length;
  if (of === 0) return { score: 0, coverage: 0, title: 0, closeness: 0, phrase: 0, frequency: 0, found: 0, of };
  const title = contentTokens(tokenize(fields.title));
  const heading = contentTokens(tokenize(fields.heading ?? ""));
  const tags = contentTokens(tokenize(fields.tags ?? ""));
  const body = contentTokens(tokenize(fields.text ?? ""));
  const total = terms.reduce((sum, term) => sum + term.weight, 0);
  let covered = 0;
  let titled = 0;
  let frequent = 0;
  let found = 0;
  for (const term of terms) {
    const inTitle = occurrences(term, title).length > 0;
    const inHeading = occurrences(term, heading).length > 0;
    const inTags = occurrences(term, tags).length > 0;
    const inBody = occurrences(term, body).length;
    if (inTitle || inHeading || inTags || inBody > 0) {
      covered += term.weight;
      found += 1;
    }
    titled += term.weight * Math.max(inTitle ? 1 : 0, inTags ? 0.75 : 0, inHeading ? 0.6 : 0);
    frequent += term.weight * (inBody / (inBody + 1));
  }
  const near = [nearness(terms, title), nearness(terms, [...heading, ...body])];
  const parts = {
    coverage: covered / total,
    title: titled / total,
    closeness: Math.max(...near.map((part) => part.closeness)),
    phrase: Math.max(...near.map((part) => part.phrase)),
    frequency: frequent / total,
  };
  const score =
    SCORE_WEIGHTS.coverage * parts.coverage +
    SCORE_WEIGHTS.title * parts.title +
    SCORE_WEIGHTS.closeness * parts.closeness +
    SCORE_WEIGHTS.phrase * parts.phrase +
    SCORE_WEIGHTS.frequency * parts.frequency;
  return { score: Math.round(score * 1000) / 1000, ...parts, found, of };
}

/** Why a result is where it is, in a few words for the list: "All 3 words, side by side", "2 of 3 words". */
export function reasonFor(parts: ScoreParts): string {
  if (parts.of === 0 || parts.found === 0) return "";
  if (parts.found < parts.of) return `${parts.found} of ${parts.of} words`;
  if (parts.of === 1) return parts.title >= 0.999 ? "In the title" : parts.title > 0 ? "In a heading or tag" : "In the text";
  const all = `All ${parts.of} words`;
  if (parts.title >= 0.999) return `${all} in the title`;
  if (parts.phrase === 1) return `${all}, side by side`;
  if (parts.closeness >= 0.5) return `${all}, close together`;
  return all;
}

/** True when any of the excluded words is in the fields: for sources that could not leave them out themselves. */
export function holdsExcluded(excluded: string[], fields: ScoreFields): boolean {
  if (excluded.length === 0) return false;
  const terms = scoringTerms({ required: excluded, excluded: [], prefixLast: false }, () => 1);
  return scoreFields(terms, fields).found > 0;
}

/**
 * How much a word says, from how many of the index's rows hold it (BM25's inverse
 * document frequency, as SQLite works it out). A word no row holds counts as one held
 * by a single row: as much as a word can say.
 */
export function inverseFrequency(rows: number, containing: number): number {
  const n = Math.max(containing, 1);
  return Math.max(0.05, Math.log((rows - n + 0.5) / (n + 0.5)));
}

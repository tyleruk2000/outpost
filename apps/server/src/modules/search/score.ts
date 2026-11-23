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
 *                     (found only in another form, or said another way, a word counts a little less)
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
import { BY_SPELLING_ONLY } from "./synonyms.ts";

export const SCORE_WEIGHTS = { coverage: 0.5, title: 0.2, closeness: 0.15, phrase: 0.05, frequency: 0.1 } as const;

/**
 * How much a word counts when it is found in a form other than the one typed. The word
 * as typed (or its plural) counts in full; another form of it ("boiling" for "boil")
 * a little less; another way of saying it ("tire" for "tyre") less again; and a longer
 * word it only begins ("battery" for "batt") least.
 */
export const FORM_CREDIT = { inflected: 0.92, synonym: 0.85, prefix: 0.6 } as const;

export interface ScoringForm {
  /** Its words, stemmed as the index stems them. */
  stems: string[];
  /** Its words as written, to tell the word typed from another form of it. */
  raws: string[];
  /** 1 for what was typed; less for another way of saying it. */
  credit: number;
  /** Its words must be near each other in any order, not side by side ("power cut": "the power was cut"). */
  near: boolean;
}

export interface ScoringTerm {
  term: string;
  /** Each way of writing it: the term itself first, then any alternatives (synonyms.ts). */
  forms: ScoringForm[];
  /** The term's last word is still being typed and matches as a beginning. */
  prefix: boolean;
  /** How much the word says: rare words weigh more. */
  weight: number;
  /** How many typed words it stands for: more than one when joined ("power cut"). */
  size: number;
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
  /** How many of the terms are in the title. */
  inTitle: number;
  /** How many of the terms were found only as another way of saying them ("tire" for "tyre"). */
  saidOtherwise: number;
  /** Those other ways, as written ("tire"), in the order of the terms. */
  matchedAs?: string[];
  /** The terms it does not hold, as typed. */
  missing?: string[];
}

interface Token {
  raw: string;
  stem: string;
}

/** Words as the index sees them: accents and case gone, split at anything not a letter or digit, stemmed. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const raw of text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)) {
    if (raw) tokens.push({ raw, stem: stem(raw) });
  }
  return tokens;
}

/** How far apart, in words that matter, a joined term's words may be. */
const NEAR_WINDOW = 4;

function formOf(text: string, credit: number, near: boolean): ScoringForm {
  const tokens = tokenize(text);
  return { stems: tokens.map((token) => token.stem), raws: tokens.map((token) => token.raw), credit, near };
}

/** The query's terms, ready to score with. `weightOf` says how much a term says (its inverse document frequency). */
export function scoringTerms(parsed: ParsedQuery, weightOf: (term: string, index: number) => number): ScoringTerm[] {
  return parsed.required.map((term, index) => ({
    term,
    forms: [
      formOf(term, 1, parsed.joined?.[index] ?? false),
      ...(parsed.alternatives?.[index] ?? []).map((alternative) => formOf(alternative, FORM_CREDIT.synonym, false)),
    ],
    prefix: parsed.prefixLast && index === parsed.required.length - 1,
    weight: Math.max(0.05, weightOf(term, index)),
    size: parsed.joined?.[index] ? term.split(" ").length : 1,
  }));
}

/** The word as written, or its plural. */
function sameWord(token: Token, raw: string): boolean {
  const word = token.raw;
  return word === raw || word === `${raw}s` || word === `${raw}es` || (raw.endsWith("y") && word === `${raw.slice(0, -1)}ies`);
}

interface Occurrence {
  at: number;
  length: number;
  /** How much this occurrence counts: 1 for the word as typed (FORM_CREDIT). */
  credit: number;
  /** A form of the word typed, not another way of saying it. */
  typed: boolean;
  /** Which of the term's forms it is (0: as typed). */
  form: number;
}

/** Where each term occurs in `tokens` (start positions), how long each occurrence is, and how much it counts. */
function occurrences(term: ScoringTerm, tokens: Token[]): Occurrence[] {
  const found: Occurrence[] = [];
  term.forms.forEach((form, formIndex) => {
    if (form.stems.length === 0) return;
    const prefixForm = term.prefix && formIndex === 0 && !form.near;
    if (form.near && form.stems.length > 1) {
      // Every word within a few words of the first, in any order.
      for (let at = 0; at < tokens.length; at += 1) {
        if (tokens[at]!.stem !== form.stems[0]) continue;
        let low = at;
        let high = at;
        let exact = sameWord(tokens[at]!, form.raws[0]!);
        const whole = form.stems.slice(1).every((wanted, offset) => {
          for (let near = Math.max(0, at - NEAR_WINDOW); near <= Math.min(tokens.length - 1, at + NEAR_WINDOW); near += 1) {
            if (near !== at && tokens[near]!.stem === wanted) {
              low = Math.min(low, near);
              high = Math.max(high, near);
              exact &&= sameWord(tokens[near]!, form.raws[offset + 1]!);
              return true;
            }
          }
          return false;
        });
        if (whole) {
          found.push({
            at: low,
            length: high - low + 1,
            credit: form.credit * (exact ? 1 : FORM_CREDIT.inflected),
            typed: formIndex === 0,
            form: formIndex,
          });
        }
      }
      return;
    }
    for (let at = 0; at + form.stems.length <= tokens.length; at += 1) {
      let match = true;
      let credit = form.credit;
      for (let offset = 0; offset < form.stems.length && match; offset += 1) {
        const token = tokens[at + offset]!;
        const wanted = form.stems[offset]!;
        const last = offset === form.stems.length - 1;
        if (token.stem === wanted) {
          if (!sameWord(token, form.raws[offset]!)) {
            // "tired" for "tire" is another word that happens to share the stem.
            const other = BY_SPELLING_ONLY.has(form.raws[offset]!) ? FORM_CREDIT.prefix : FORM_CREDIT.inflected;
            credit = Math.min(credit, form.credit * other);
          }
        } else if (
          prefixForm &&
          last &&
          (token.raw.startsWith(wanted) || token.stem.startsWith(wanted) || token.raw.startsWith(form.raws[offset] ?? wanted))
        ) {
          credit = Math.min(credit, FORM_CREDIT.prefix);
        } else {
          match = false;
        }
      }
      if (match) found.push({ at, length: form.stems.length, credit, typed: formIndex === 0, form: formIndex });
    }
  });
  return found;
}

/** The most any occurrence counts, or 0 when there is none. */
const best = (list: Occurrence[]) => list.reduce((most, hit) => Math.max(most, hit.credit), 0);

/** The tokens without the small words, so that "replace a car battery" has its words side by side. */
function contentTokens(tokens: Token[]): Token[] {
  return tokens.filter((token) => !STOP_WORDS.has(token.raw));
}

/** The shortest stretch of `tokens` holding an occurrence of each present term, in tokens. */
function shortestSpan(lists: Occurrence[][]): number {
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
  const of = terms.reduce((sum, term) => sum + term.size, 0);
  if (of === 0)
    return {
      score: 0,
      coverage: 0,
      title: 0,
      closeness: 0,
      phrase: 0,
      frequency: 0,
      found: 0,
      of,
      inTitle: 0,
      saidOtherwise: 0,
      matchedAs: [],
      missing: [],
    };
  const title = contentTokens(tokenize(fields.title));
  const heading = contentTokens(tokenize(fields.heading ?? ""));
  const tags = contentTokens(tokenize(fields.tags ?? ""));
  const body = contentTokens(tokenize(fields.text ?? ""));
  const total = terms.reduce((sum, term) => sum + term.weight, 0);
  let covered = 0;
  let titled = 0;
  let frequent = 0;
  let found = 0;
  let wholeInTitle = 0;
  let saidOtherwise = 0;
  const matchedAs: string[] = [];
  const missing: string[] = [];
  for (const term of terms) {
    const titleHits = occurrences(term, title);
    const headingHits = occurrences(term, heading);
    const tagHits = occurrences(term, tags);
    const bodyHits = occurrences(term, body);
    const inTitle = best(titleHits);
    const inHeading = best(headingHits);
    const inTags = best(tagHits);
    const inBody = best(bodyHits);
    const all = [...titleHits, ...headingHits, ...tagHits, ...bodyHits];
    if (all.length > 0 && !all.some((hit) => hit.typed)) {
      saidOtherwise += 1;
      const form = term.forms[all.reduce((most, hit) => (hit.credit > most.credit ? hit : most)).form];
      if (form) matchedAs.push(form.raws.join(" "));
    }
    if (all.length === 0) missing.push(term.term);
    const credit = Math.max(inTitle, inHeading, inTags, inBody);
    if (credit > 0) {
      covered += term.weight * credit;
      found += term.size;
    }
    if (inTitle > 0) wholeInTitle += term.size;
    titled += term.weight * Math.max(inTitle, inTags * 0.75, inHeading * 0.6);
    frequent += term.weight * inBody * (bodyHits.length / (bodyHits.length + 1));
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
  return { score: Math.round(score * 1000) / 1000, ...parts, found, of, inTitle: wholeInTitle, saidOtherwise, matchedAs, missing };
}

/**
 * Why a result is where it is, in a few words for the list: "All 3 words, side by side",
 * "2 of 3 words, not “sand”", "All 2 words in the title; also matched tire".
 */
export function reasonFor(parts: ScoreParts): string {
  const reason = wordsReason(parts);
  if (!reason || parts.saidOtherwise === 0) return reason;
  // "Tire care" for "tyre pressure": say which other way of saying a word it holds.
  const named = [...new Set(parts.matchedAs ?? [])];
  return named.length > 0 ? `${reason}; also matched ${named.join(", ")}` : `${reason}, said another way`;
}

function wordsReason(parts: ScoreParts): string {
  if (parts.of === 0 || parts.found === 0) return "";
  if (parts.found < parts.of) {
    const missing = parts.missing ?? [];
    return missing.length === 1 ? `${parts.found} of ${parts.of} words, not “${missing[0]}”` : `${parts.found} of ${parts.of} words`;
  }
  if (parts.of === 1) return parts.inTitle === 1 ? "In the title" : parts.title > 0 ? "In a heading or tag" : "In the text";
  const all = `All ${parts.of} words`;
  if (parts.inTitle === parts.of) return `${all} in the title`;
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

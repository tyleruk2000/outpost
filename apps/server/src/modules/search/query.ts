/**
 * Turns what a person typed into an FTS5 query. User text is never passed to MATCH
 * directly: FTS5 has its own syntax and stray punctuation would be a syntax error (or,
 * worse, a column filter the person did not intend).
 *
 * Supported: plain words (all must match), "quoted phrases", -excluded words, and
 * prefix matching on the word still being typed.
 *
 * Words that only shape a question ("how", "to", "the", "what") are left out of what
 * must match and of the ranking: "how to change car battery" looks for "change", "car"
 * and "battery". They stay inside quoted phrases, and a query made of nothing else
 * ("to be or not to be") keeps them all.
 */

export interface ParsedQuery {
  /** Terms that must appear. Phrases keep their spaces. */
  required: string[];
  excluded: string[];
  /** The last word is still being typed, so it matches as a prefix. */
  prefixLast: boolean;
  /** Question and function words that were typed and left out of `required`. */
  ignored?: string[];
}

/**
 * Words that shape a question and say nothing about its subject. Kept short on
 * purpose: "not", "without", "off" and "no" change what is meant and are never dropped.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    "a an the and or of to in on at by for from with into onto as about " +
    "how what when where why which who whom whose " +
    "do does did doing done is are was were be been being am " +
    "can could should would will shall may might must " +
    "i me my mine we us our you your he him his she her it its they them their there " +
    "this that these those if so than then also just please"
  ).split(" "),
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
    else typed.push({ term, quoted: token.includes('"') || term.includes(" ") });
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
  return { required, excluded, prefixLast: endsOpen && lastKept, ignored };
}

const quote = (term: string) => `"${term.replace(/"/g, '""')}"`;

/** One term as the index is asked for it: a prefix if it is still being typed. */
export function termExpression(term: string, prefix: boolean): string {
  return prefix ? `${quote(term)}*` : quote(term);
}

/**
 * Builds the MATCH expression. `mode` "all" requires every term; "any" is the relaxed
 * fallback used when "all" finds too little.
 */
export function toFtsQuery(parsed: ParsedQuery, mode: "all" | "any" = "all", column?: string): string | null {
  if (parsed.required.length === 0) return null;
  // A prefix applies to the final word of the final term only.
  const terms = parsed.required.map((term, index) => termExpression(term, parsed.prefixLast && index === parsed.required.length - 1));
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
  return parsed.required.map((term) => (term.includes(" ") ? quote(term) : term)).join(" ");
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

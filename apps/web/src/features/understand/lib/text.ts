/** Small text helpers: example questions from the reader's own library, citation markers, context budgets. */

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();
const words = (text: string) => tidy(text).split(" ").filter(Boolean);

/** A heading or title reads as something to search for when it is a few real words, not a number or a sentence. */
function searchable(text: string): boolean {
  const count = words(text).length;
  return count >= 1 && count <= 6 && text.length >= 4 && text.length <= 60 && /\p{L}{3}/u.test(text);
}

/** A title without a file-like ending: "weather.pdf" is "weather". */
const withoutEnding = (text: string) => tidy(text.replace(/\.(pdf|md|txt|epub|docx?|html?)$/i, ""));

/** Strips the punctuation that the search box would treat as syntax. */
function asQuery(text: string): string {
  return tidy(text.replace(/["“”()[\]{}:;,.!?*]/g, " ").replace(/(^|\s)-+/g, " "));
}

/** A thing to try: shown as the library writes it, searched for without the punctuation the box reads as syntax. */
export interface Example {
  label: string;
  query: string;
}

/**
 * Things to try, taken from what is really in the library: headings inside the
 * document on show, then titles of other documents and pages. Nothing is invented, and
 * nothing is reworded into a question: they are shown as the headings and titles they are.
 */
export function buildExamples(titles: readonly string[], headings: ReadonlyArray<string | null>, limit = 4): Example[] {
  const seen = new Set<string>();
  const take = (source: readonly string[], most: number) => {
    const picked: Example[] = [];
    for (const raw of source) {
      if (picked.length >= most) break;
      if (!searchable(raw)) continue;
      const label = withoutEnding(raw);
      const query = asQuery(label);
      if (!query || seen.has(query.toLowerCase())) continue;
      seen.add(query.toLowerCase());
      picked.push({ label, query });
    }
    return picked;
  };
  const distinctHeadings = [...new Set(headings.filter((heading): heading is string => Boolean(heading)).map(tidy))];
  // Skip the first heading: it is usually the document's own title again.
  const fromHeadings = take(distinctHeadings.slice(1), Math.ceil(limit / 2));
  const fromTitles = take(titles.map(tidy), limit - fromHeadings.length);
  const more =
    fromHeadings.length + fromTitles.length < limit ? take(distinctHeadings, limit - fromHeadings.length - fromTitles.length) : [];
  return [...fromHeadings, ...fromTitles, ...more];
}

/** "[2]", and "[1, 3]" as some models write it. The same rule as the server's `checkCitations`. */
const MARKER = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;
const numbersIn = (list: string) => list.split(/[,;]/).map(Number);

/**
 * Which citation markers an answer uses, and which of them point at no source that was
 * supplied. The same check the server runs on every answer (`checkCitations`), for any
 * text the reader pastes in.
 */
export function checkMarkers(answer: string, known: readonly number[]): { used: number[]; unsupported: number[] } {
  const supplied = new Set(known);
  const found = new Set<number>();
  for (const match of answer.matchAll(MARKER)) for (const marker of numbersIn(match[1]!)) found.add(marker);
  const all = [...found].sort((a, b) => a - b);
  return { used: all.filter((marker) => supplied.has(marker)), unsupported: all.filter((marker) => !supplied.has(marker)) };
}

/** Splits an answer into plain text and its `[n]` markers, so each marker can be shown as supported or not. */
export function splitMarkers(answer: string): Array<{ text: string; marker: number | null }> {
  const parts: Array<{ text: string; marker: number | null }> = [];
  let last = 0;
  for (const match of answer.matchAll(MARKER)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: answer.slice(last, at), marker: null });
    // A list such as "[1, 3]" is shown as its separate markers.
    for (const marker of numbersIn(match[1]!)) parts.push({ text: `[${marker}]`, marker });
    last = at + match[0].length;
  }
  if (last < answer.length) parts.push({ text: answer.slice(last), marker: null });
  return parts;
}

export interface BudgetSegment {
  marker: number;
  characters: number;
  /** Position and width as fractions of the scale, 0 to 1. */
  start: number;
  width: number;
}

/**
 * The context budget as a bar: each source a segment sized by its quoted characters,
 * on a scale that reaches whichever is larger, the budget or what was used. (The first
 * passage is always included, so a single long one can exceed the budget.)
 */
export function layoutBudget(
  sources: ReadonlyArray<{ marker: number; characters: number }>,
  budget: number,
): { segments: BudgetSegment[]; used: number; scaleMax: number; budgetAt: number } {
  const used = sources.reduce((sum, source) => sum + source.characters, 0);
  const scaleMax = Math.max(budget, used, 1);
  let cursor = 0;
  const segments = sources.map((source) => {
    const segment = { marker: source.marker, characters: source.characters, start: cursor / scaleMax, width: source.characters / scaleMax };
    cursor += source.characters;
    return segment;
  });
  return { segments, used, scaleMax, budgetAt: budget / scaleMax };
}

/** A rough token count: characters ÷ 4, the same estimate the server uses. */
export const approxTokens = (characters: number) => Math.ceil(characters / 4);

/** Reads a histogram of passage lengths: where most passages fall relative to the target size. */
export function readLengths(
  buckets: ReadonlyArray<{ from: number; to: number; count: number }>,
  target: number,
): { total: number; nearTarget: number; short: number; over: number; peak: { from: number; to: number; count: number } | null } {
  let total = 0;
  let nearTarget = 0;
  let short = 0;
  let over = 0;
  let peak: { from: number; to: number; count: number } | null = null;
  for (const bucket of buckets) {
    total += bucket.count;
    if (!peak || bucket.count > peak.count) peak = bucket;
    if (bucket.from >= target) over += bucket.count;
    else if (bucket.to > target * 0.6) nearTarget += bucket.count;
    else short += bucket.count;
  }
  return { total, nearTarget, short, over, peak };
}

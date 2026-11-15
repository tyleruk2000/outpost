/**
 * Turns what a person typed into an FTS5 query. User text is never passed to MATCH
 * directly: FTS5 has its own syntax and stray punctuation would be a syntax error (or,
 * worse, a column filter the person did not intend).
 *
 * Supported: plain words (all must match), "quoted phrases", -excluded words, and
 * prefix matching on the word still being typed.
 */

export interface ParsedQuery {
  /** Terms that must appear. Phrases keep their spaces. */
  required: string[];
  excluded: string[];
  /** The last word is still being typed, so it matches as a prefix. */
  prefixLast: boolean;
}

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
  const required: string[] = [];
  const excluded: string[] = [];
  const text = input.slice(0, 500);
  for (const match of text.matchAll(TOKEN)) {
    let token = match[0];
    const negative = token.startsWith("-") && token.length > 1;
    if (negative) token = token.slice(1);
    const term = clean(token.replace(/"/g, ""));
    if (!term || /^[-'’_]+$/.test(term)) continue;
    (negative ? excluded : required).push(term);
  }
  const endsOpen = /[\p{L}\p{N}]$/u.test(text) && !text.trimEnd().endsWith('"');
  return { required, excluded, prefixLast: endsOpen };
}

const quote = (term: string) => `"${term.replace(/"/g, '""')}"`;

/**
 * Builds the MATCH expression. `mode` "all" requires every term; "any" is the relaxed
 * fallback used when "all" finds nothing.
 */
export function toFtsQuery(parsed: ParsedQuery, mode: "all" | "any" = "all", column?: string): string | null {
  if (parsed.required.length === 0) return null;
  const terms = parsed.required.map((term, index) => {
    const last = index === parsed.required.length - 1;
    // A prefix applies to the final word of the final term only.
    return last && parsed.prefixLast ? `${quote(term)}*` : quote(term);
  });
  let expression = terms.join(mode === "all" ? " AND " : " OR ");
  if (terms.length > 1) expression = `(${expression})`;
  if (column) expression = `{${column}}: ${expression}`;
  for (const term of parsed.excluded) expression += ` NOT ${quote(term)}`;
  return expression;
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

/**
 * "Did you mean": when a word typed is in no passage, or in almost none, the nearest
 * word the library does hold often is what was meant ("purifiy" → "purify"). Words are
 * looked up as written (the `chunks_words` index, kept in step with the passages), so a
 * suggestion is always a real word, never a stem. Nothing is replaced: the screen offers
 * the suggestion as a link and the search stays as typed.
 *
 * The nearest word is the one fewest edits away (a letter added, dropped, changed, or two
 * side by side swapped), at most two (one for a word of four letters or fewer). Among
 * equally near words, one starting with the same letter comes first, then the one more
 * passages hold. A word must be in at least `MIN_PASSAGES` passages to be offered.
 */
import type Database from "better-sqlite3";
import { type ParsedQuery, STOP_WORDS } from "./query.ts";
import { stem } from "./stem.ts";

/** A word held by fewer passages than this is too rare to suggest (it may be a typing slip itself). */
export const MIN_PASSAGES = 2;
/** A word typed that this few passages hold is checked too, but only a much commoner word one edit away is offered. */
export const RARE_PASSAGES = 2;
/** How much commoner than a rare word typed a suggestion must be. */
const COMMONER = 20;

export interface Suggestion {
  /** The whole query with the suggested words in place of the typed ones. */
  query: string;
  /** The suggested words, to show in bold. */
  words: string[];
}

/** Damerau–Levenshtein distance (with adjacent swaps), giving up beyond `limit`. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) {
    rows.push(new Array<number>(b.length + 1).fill(0));
    rows[i]![0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let smallest = Number.POSITIVE_INFINITY;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = value;
      smallest = Math.min(smallest, value);
    }
    if (smallest > limit) return limit + 1;
  }
  return rows[a.length]![b.length]!;
}

const normalise = (word: string) => word.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

const nextLetter = (letter: string) => String.fromCodePoint(letter.codePointAt(0)! + 1);

export function createSuggester(sqlite: Database.Database) {
  let vocabulary: Database.Statement | null = null;
  const words = () => {
    if (!vocabulary) {
      // A view of the index's own word list. Temporary: it belongs to this connection and is never stored.
      sqlite.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.chunks_words_vocab USING fts5vocab(main, chunks_words, row)");
      vocabulary = sqlite.prepare("SELECT term, doc FROM temp.chunks_words_vocab WHERE term >= ? AND term < ?");
    }
    return vocabulary;
  };

  /** The nearest word the library holds to `typed`, or null. `held` is how many passages hold `typed` itself. */
  function nearest(typed: string, held: number): string | null {
    const word = normalise(typed);
    if (word.length < 3 || !/^\p{L}+$/u.test(word)) return null;
    const limit = word.length <= 4 ? 1 : 2;
    const own = stem(word);
    let best: { term: string; distance: number; doc: number; sameStart: boolean } | null = null;
    // Words with the same first letter, then (for a slip at the start: "rpurify", "uprify") the second.
    for (const letter of [...new Set([word[0]!, word[1]!])]) {
      for (const row of words().iterate(letter, nextLetter(letter)) as Iterable<{ term: string; doc: number }>) {
        if (row.doc < MIN_PASSAGES || Math.abs(row.term.length - word.length) > limit || row.term === word) continue;
        // A small word ("and" for "sand") says nothing about what was looked for.
        if (row.term.length < 3 || STOP_WORDS.has(row.term)) continue;
        if (stem(row.term) === own) continue;
        const distance = editDistance(word, row.term, limit);
        if (distance > limit) continue;
        if (held > 0 && (distance > 1 || row.doc < Math.max(10, held * COMMONER))) continue;
        const sameStart = row.term[0] === word[0];
        if (
          !best ||
          distance < best.distance ||
          (distance === best.distance && sameStart && !best.sameStart) ||
          (distance === best.distance && sameStart === best.sameStart && row.doc > best.doc)
        ) {
          best = { term: row.term, distance, doc: row.doc, sameStart };
        }
      }
      if (best?.sameStart) break;
    }
    return best?.term ?? null;
  }

  /**
   * A suggestion for the query `q`, or null. `parsed` is the query as searched and
   * `counts` how many passages hold each of its terms. A word no passage holds is
   * always checked. A word that a few passages hold is checked only when `nothingFound`
   * (no item holds every word), and then only a much commoner word one edit away is
   * offered: a rare word is usually meant ("bowline" is not "bowling").
   */
  function suggest(q: string, parsed: ParsedQuery, counts: number[], nothingFound: boolean): Suggestion | null {
    const changes: Array<{ typed: string; word: string }> = [];
    parsed.required.forEach((term, index) => {
      if (parsed.quoted?.[index] || parsed.joined?.[index] || term.includes(" ") || STOP_WORDS.has(term.toLowerCase())) return;
      const held = counts[index] ?? 0;
      if (held > 0 && !(nothingFound && held <= RARE_PASSAGES)) return;
      const word = nearest(term, held);
      if (word) changes.push({ typed: term, word });
    });
    if (changes.length === 0) return null;
    let query = q;
    for (const change of changes) {
      const escaped = change.typed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query = query.replace(
        new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu"),
        (_, before: string) => before + change.word,
      );
    }
    return query === q ? null : { query, words: changes.map((change) => change.word) };
  }

  return { suggest, nearest };
}

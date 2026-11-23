/**
 * Keyword search of Outpost's own index, item by item.
 *
 * 1. **Find.** One pass over the full-text index finds every passage holding every word
 *    that matters (query.ts), with its BM25 rank. Passages are grouped into their items
 *    here, so every matching item is counted and can be paged to, however many passages
 *    a long book contributes.
 * 2. **Choose candidates.** Items in BM25 order of their best passage; the first
 *    `RESCORE_POOL` (or more, for a later page) go on.
 * 3. **Score.** Each candidate's best few passages are scored again on the shared scale
 *    (score.ts) and the item takes its best. Snippets are made only for what is shown.
 *    The last word is looked for as typed; only when that finds fewer than `FEW` items
 *    are words it begins added ("batt" while "battery" is being typed), after them.
 * 4. **Relax.** When fewer than `FEW` items hold every word, items holding at least
 *    `RELAXED_COVERAGE` of what the query is about (rare words weighing more) are added
 *    after them, and the answer says so.
 */
import type Database from "better-sqlite3";
import type { Owners } from "./owners.ts";
import { groupExpression, HIT_CLOSE, HIT_OPEN, type ParsedQuery, toFtsQuery } from "./query.ts";
import { inverseFrequency, type ScoreParts, type ScoringTerm, scoreFields, scoringTerms } from "./score.ts";

/** How many items, at least, are scored again: enough that BM25's order only decides what is looked at. */
export const RESCORE_POOL = 200;
/** Passages of one item scored again. */
const PASSAGES_SCORED = 4;
/** Candidates, at least, whose further passages are scored after their first (`score` in `rankKeyword`). */
const REFINED = 60;
/** Fewer items than this holding every word, and items holding most of them are added. */
export const FEW = 5;
/** The share of the query (weighed by rarity) an item must hold to be added when relaxing. */
export const RELAXED_COVERAGE = 0.5;

export interface RankedPassage {
  chunkId: number;
  page: number | null;
  heading: string;
  parts: ScoreParts;
}

export interface RankedItem {
  entityRowId: number;
  kind: string;
  /** The best passage first, then the others that matched, best first. */
  passages: RankedPassage[];
  parts: ScoreParts;
  /** Holds every word of the query. */
  everyWord: boolean;
  /** Holds the last word only as the start of a longer one ("battery" for "batt"). */
  prefixOnly?: boolean;
}

export interface KeywordRanking {
  items: RankedItem[];
  /** Items that hold every word, of the kinds asked for. */
  everyWord: number;
  relaxed: boolean;
  facets: Record<string, number>;
  total: number;
  terms: ScoringTerm[];
  /** Some items hold the last word only as the start of a longer one: their snippets must mark it so. */
  prefixUsed: boolean;
}

interface Hit {
  chunkId: number;
  entityRowId: number;
  kind: string;
  rank: number;
}

/**
 * How many passages hold each term, as the index finds it: the word itself (or any of
 * its other ways of being said), and only when that finds nothing, a word it begins.
 */
export function countTerms(sqlite: Database.Database, parsed: ParsedQuery): number[] {
  const count = sqlite.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?");
  return parsed.required.map((_, index) => {
    const exact = (count.get(groupExpression(parsed, index, false)) as { n: number }).n;
    if (exact > 0 || !(parsed.prefixLast && index === parsed.required.length - 1)) return exact;
    return (count.get(groupExpression(parsed, index, true)) as { n: number }).n;
  });
}

/** How long the number of passages is trusted without counting again, when nothing in this process changed them. */
const COUNT_TRUSTED_MS = 30_000;
const passageCounts = new WeakMap<Database.Database, { n: number; at: number }>();

/**
 * How many passages the index holds, for weighing words. Counting reads the whole index
 * (tens of milliseconds for 60,000 passages on a Raspberry Pi), so the number is kept:
 * until the search service changes passages (`forgetPassageCount`), or for half a
 * minute, for passages removed some other way. Weights move by a hair for a few
 * passages more or less.
 */
export function passageCount(sqlite: Database.Database): number {
  const kept = passageCounts.get(sqlite);
  if (kept && Date.now() - kept.at < COUNT_TRUSTED_MS) return kept.n;
  const n = (sqlite.prepare("SELECT count(*) AS n FROM chunks").get() as { n: number }).n;
  passageCounts.set(sqlite, { n, at: Date.now() });
  return n;
}

export function forgetPassageCount(sqlite: Database.Database): void {
  passageCounts.delete(sqlite);
}

/** The weight of each term: how rare it is in the index. `counts` when already known (`countTerms`). */
export function weighTerms(sqlite: Database.Database, parsed: ParsedQuery, counts?: number[]): ScoringTerm[] {
  if (parsed.required.length < 2) return scoringTerms(parsed, () => 1);
  const rows = passageCount(sqlite);
  const held = counts ?? countTerms(sqlite, parsed);
  return scoringTerms(parsed, (_, index) => inverseFrequency(rows, held[index]!));
}

export function rankKeyword(
  sqlite: Database.Database,
  parsed: ParsedQuery,
  options: {
    kinds?: string[];
    tag?: string;
    window: number;
    toDownload: string;
    counts?: number[];
    owners: Owners;
    /** The current household: items kept per household are found only in their own. */
    household: string;
  },
): KeywordRanking {
  const terms = weighTerms(sqlite, parsed, options.counts);
  // The last word as typed first; as the start of a longer word only when that finds too little.
  const strictMatch = toFtsQuery(parsed, "all", undefined, false);
  if (!strictMatch) return { items: [], everyWord: 0, relaxed: false, facets: {}, total: 0, terms, prefixUsed: false };
  const tagClause = options.tag ? ` AND {tags}: "${options.tag.replace(/"/g, '""')}"` : "";
  const wanted = (kind: string) => !options.kinds?.length || options.kinds.includes(kind);

  // Passage numbers and ranks alone: which item each belongs to is known in memory (owners.ts).
  const find = sqlite.prepare("SELECT rowid, bm25(chunks_fts, 8.0, 3.0, 1.0, 4.0) FROM chunks_fts WHERE chunks_fts MATCH ?").raw();
  const { owners } = options;
  /** Every matching item, with its best passages first, and items in order of their best passage (on this device first). */
  const group = (match: string) => {
    if (!owners.loaded()) owners.reload();
    const rows = find.all(match) as Array<[number, number]>;
    if (rows.some(([chunkId]) => owners.ownerOf(chunkId) === 0)) owners.reload();
    const byItem = new Map<number, { entityRowId: number; kind: string; hits: Hit[] }>();
    for (const [chunkId, rank] of rows) {
      const entityRowId = owners.ownerOf(chunkId);
      let item = byItem.get(entityRowId);
      if (!item) {
        const facts = owners.item(entityRowId);
        // Another household's plans and supplies are not this one's to find.
        if (!facts || (facts.household !== null && facts.household !== options.household)) continue;
        item = { entityRowId, kind: facts.kind, hits: [] };
        byItem.set(entityRowId, item);
      }
      // Only the best few passages of an item are ever scored: keep those, best first.
      const hits = item.hits;
      if (hits.length === PASSAGES_SCORED && rank >= hits[hits.length - 1]!.rank) continue;
      let at = hits.length;
      while (at > 0 && hits[at - 1]!.rank > rank) at -= 1;
      hits.splice(at, 0, { chunkId, entityRowId, kind: item.kind, rank });
      if (hits.length > PASSAGES_SCORED) hits.pop();
    }
    const items = [...byItem.values()];
    items.sort(
      (a, b) => Number(a.kind === options.toDownload) - Number(b.kind === options.toDownload) || a.hits[0]!.rank - b.hits[0]!.rank,
    );
    return items;
  };

  const passageText = (ids: number[]) => {
    const texts = new Map<number, { title: string; heading: string; tags: string; text: string; page: number | null }>();
    for (let start = 0; start < ids.length; start += 500) {
      const slice = ids.slice(start, start + 500);
      const rows = sqlite
        .prepare(`SELECT id, title, heading, tags, text, page FROM chunks WHERE id IN (${slice.map(() => "?").join(",")})`)
        .all(...slice) as Array<{ id: number; title: string; heading: string; tags: string; text: string; page: number | null }>;
      for (const row of rows) texts.set(row.id, row);
    }
    return texts;
  };

  const scorePassages = (hits: Hit[]): RankedPassage[] => {
    const texts = passageText(hits.map((hit) => hit.chunkId));
    return hits.flatMap((hit) => {
      const row = texts.get(hit.chunkId);
      if (!row) return [];
      return [{ chunkId: hit.chunkId, page: row.page, heading: row.heading, parts: scoreFields(terms, row) }];
    });
  };
  /**
   * Each candidate is scored by its best passage in BM25's order first; then those that
   * could be on the page asked for (`REFINED`, or more for a later page) have their next
   * few passages scored too, and take the best. Scoring a passage reads all its words,
   * and passages further down the list cannot reach the page.
   */
  const score = (candidates: Array<{ entityRowId: number; kind: string; hits: Hit[] }>, everyWord: boolean): RankedItem[] => {
    const first = new Map(scorePassages(candidates.map((item) => item.hits[0]!)).map((passage) => [passage.chunkId, passage]));
    const ranked = candidates.flatMap((item) => {
      const best = first.get(item.hits[0]!.chunkId);
      return best
        ? [{ entityRowId: item.entityRowId, kind: item.kind, passages: [best], parts: best.parts, everyWord, hits: item.hits }]
        : [];
    });
    ranked.sort((a, b) => b.parts.score - a.parts.score);
    const refined = ranked.slice(0, Math.max(REFINED, options.window + FEW));
    const more = new Map(
      scorePassages(refined.flatMap((item) => item.hits.slice(1, PASSAGES_SCORED))).map((passage) => [passage.chunkId, passage]),
    );
    for (const item of refined) {
      for (const hit of item.hits.slice(1, PASSAGES_SCORED)) {
        const passage = more.get(hit.chunkId);
        if (passage) item.passages.push(passage);
      }
      item.passages.sort((a, b) => b.parts.score - a.parts.score);
      item.parts = item.passages[0]!.parts;
    }
    return ranked.map(({ hits: _hits, ...item }) => item);
  };
  /** Items that hold the last word only as the start of a longer one. */
  const begun = new Set<number>();
  const byScore = (a: RankedItem, b: RankedItem) =>
    Number(a.kind === options.toDownload) - Number(b.kind === options.toDownload) ||
    Number(begun.has(a.entityRowId)) - Number(begun.has(b.entityRowId)) ||
    b.parts.score - a.parts.score;

  let strictAll = group(strictMatch + tagClause);
  if (parsed.prefixLast && strictAll.filter((item) => wanted(item.kind)).length < FEW) {
    // "batt" while it is being typed: items holding a word it begins follow those holding the word itself.
    const held = new Set(strictAll.map((item) => item.entityRowId));
    const more = group(toFtsQuery(parsed, "all", undefined, true)! + tagClause).filter((item) => !held.has(item.entityRowId));
    for (const item of more) begun.add(item.entityRowId);
    strictAll = [...strictAll, ...more];
  }
  const strict = strictAll.filter((item) => wanted(item.kind));
  // The pool grows with the page asked for, so that every match can be paged to.
  const items = score(strict.slice(0, Math.max(RESCORE_POOL, options.window)), true).sort(byScore);
  for (const item of items) if (begun.has(item.entityRowId)) item.prefixOnly = true;
  const facets: Record<string, number> = {};
  for (const item of strictAll) facets[item.kind] = (facets[item.kind] ?? 0) + 1;

  let relaxed = false;
  let added = 0;
  if (strict.length < FEW && parsed.required.length > 1) {
    // Words as typed: any one of them matched as a beginning would read every passage of every word
    // it begins ("sand*" with "water": tens of thousands), for items that hold too little anyway.
    const anyMatch = toFtsQuery(parsed, "any", undefined, false)!;
    const held = new Set(strictAll.map((item) => item.entityRowId));
    const others = group(anyMatch + tagClause).filter((item) => !held.has(item.entityRowId));
    const kept = score(others.slice(0, RESCORE_POOL), false).filter((item) => item.parts.coverage >= RELAXED_COVERAGE);
    for (const item of kept) facets[item.kind] = (facets[item.kind] ?? 0) + 1;
    const shown = kept.filter((item) => wanted(item.kind)).sort(byScore);
    if (shown.length > 0) {
      relaxed = true;
      added = shown.length;
      items.push(...shown);
    }
  }
  return { items, everyWord: strict.length, relaxed, facets, total: strict.length + added, terms, prefixUsed: begun.size > 0 };
}

/** Snippets and the marked title for the passages that will be shown. */
export function markPassages(
  sqlite: Database.Database,
  match: string,
  chunkIds: number[],
): Map<number, { snippet: string; titleMarked: string }> {
  const marked = new Map<number, { snippet: string; titleMarked: string }>();
  if (chunkIds.length === 0) return marked;
  // One passage at a time, its number cast to an integer. Given `rowid IN (?, ?…)` or `rowid = ?`
  // with the numbers bound as they come, the full-text index does not narrow its search to them:
  // it answers with every passage the words match, each with its snippet made, and SQLite keeps
  // them all (250 ms for "water" in a library of 57,000 passages; the snippets of the wrong
  // passages were then simply not used). Cast, it goes straight to the passage.
  const one = sqlite.prepare(
    `SELECT rowid AS chunkId, snippet(chunks_fts, 2, '${HIT_OPEN}', '${HIT_CLOSE}', '…', 32) AS snippet,
            highlight(chunks_fts, 0, '${HIT_OPEN}', '${HIT_CLOSE}') AS titleMarked
     FROM chunks_fts WHERE chunks_fts MATCH ? AND rowid = CAST(? AS INTEGER)`,
  );
  for (const chunkId of new Set(chunkIds)) {
    for (const row of one.all(match, chunkId) as Array<{ chunkId: number; snippet: string; titleMarked: string }>) {
      if (row.chunkId === chunkId) marked.set(chunkId, row);
    }
  }
  return marked;
}

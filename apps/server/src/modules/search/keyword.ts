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
 * 4. **Relax.** When fewer than `FEW` items hold every word, items holding at least
 *    `RELAXED_COVERAGE` of what the query is about (rare words weighing more) are added
 *    after them, and the answer says so.
 */
import type Database from "better-sqlite3";
import { HIT_CLOSE, HIT_OPEN, type ParsedQuery, termExpression, toFtsQuery } from "./query.ts";
import { inverseFrequency, type ScoreParts, type ScoringTerm, scoreFields, scoringTerms } from "./score.ts";

/** How many items, at least, are scored again: enough that BM25's order only decides what is looked at. */
export const RESCORE_POOL = 200;
/** Passages of one item scored again. */
const PASSAGES_SCORED = 4;
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
}

export interface KeywordRanking {
  items: RankedItem[];
  /** Items that hold every word, of the kinds asked for. */
  everyWord: number;
  relaxed: boolean;
  facets: Record<string, number>;
  total: number;
  terms: ScoringTerm[];
}

interface Hit {
  chunkId: number;
  entityRowId: number;
  kind: string;
  rank: number;
}

/** The weight of each term: how rare it is in the index. */
export function weighTerms(sqlite: Database.Database, parsed: ParsedQuery): ScoringTerm[] {
  if (parsed.required.length < 2) return scoringTerms(parsed, () => 1);
  const rows = (sqlite.prepare("SELECT count(*) AS n FROM chunks_fts").get() as { n: number }).n;
  const count = sqlite.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?");
  return scoringTerms(parsed, (term, index) => {
    const expression = termExpression(term, parsed.prefixLast && index === parsed.required.length - 1);
    return inverseFrequency(rows, (count.get(expression) as { n: number }).n);
  });
}

export function rankKeyword(
  sqlite: Database.Database,
  parsed: ParsedQuery,
  options: { kinds?: string[]; tag?: string; window: number; toDownload: string },
): KeywordRanking {
  const terms = weighTerms(sqlite, parsed);
  const strictMatch = toFtsQuery(parsed, "all");
  if (!strictMatch) return { items: [], everyWord: 0, relaxed: false, facets: {}, total: 0, terms };
  const tagClause = options.tag ? ` AND {tags}: "${options.tag.replace(/"/g, '""')}"` : "";
  const wanted = (kind: string) => !options.kinds?.length || options.kinds.includes(kind);

  const find = sqlite.prepare(
    `SELECT c.id AS chunkId, c.entity_row_id AS entityRowId, e.kind AS kind, bm25(chunks_fts, 8.0, 3.0, 1.0, 4.0) AS rank
     FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN search_entities e ON e.id = c.entity_row_id
     WHERE chunks_fts MATCH ?`,
  );
  /** Every matching item, with its passages best first, and items in order of their best passage (on this device first). */
  const group = (match: string) => {
    const byItem = new Map<number, { entityRowId: number; kind: string; hits: Hit[] }>();
    for (const hit of find.all(match) as Hit[]) {
      let item = byItem.get(hit.entityRowId);
      if (!item) {
        item = { entityRowId: hit.entityRowId, kind: hit.kind, hits: [] };
        byItem.set(hit.entityRowId, item);
      }
      item.hits.push(hit);
    }
    const items = [...byItem.values()];
    for (const item of items) item.hits.sort((a, b) => a.rank - b.rank);
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

  const score = (candidates: Array<{ entityRowId: number; kind: string; hits: Hit[] }>, everyWord: boolean): RankedItem[] => {
    const ids = candidates.flatMap((item) => item.hits.slice(0, PASSAGES_SCORED).map((hit) => hit.chunkId));
    const texts = passageText(ids);
    return candidates.map((item) => {
      const passages = item.hits.slice(0, PASSAGES_SCORED).flatMap((hit) => {
        const row = texts.get(hit.chunkId);
        if (!row) return [];
        return [{ chunkId: hit.chunkId, page: row.page, heading: row.heading, parts: scoreFields(terms, row) }];
      });
      passages.sort((a, b) => b.parts.score - a.parts.score);
      return { entityRowId: item.entityRowId, kind: item.kind, passages, parts: passages[0]!.parts, everyWord };
    });
  };
  const byScore = (a: RankedItem, b: RankedItem) =>
    Number(a.kind === options.toDownload) - Number(b.kind === options.toDownload) || b.parts.score - a.parts.score;

  const strictAll = group(strictMatch + tagClause);
  const strict = strictAll.filter((item) => wanted(item.kind));
  // The pool grows with the page asked for, so that every match can be paged to.
  const items = score(strict.slice(0, Math.max(RESCORE_POOL, options.window)), true).sort(byScore);
  const facets: Record<string, number> = {};
  for (const item of strictAll) facets[item.kind] = (facets[item.kind] ?? 0) + 1;

  let relaxed = false;
  let added = 0;
  if (strict.length < FEW && parsed.required.length > 1) {
    const anyMatch = toFtsQuery(parsed, "any")!;
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
  return { items, everyWord: strict.length, relaxed, facets, total: strict.length + added, terms };
}

/** Snippets and the marked title for the passages that will be shown. */
export function markPassages(
  sqlite: Database.Database,
  match: string,
  chunkIds: number[],
): Map<number, { snippet: string; titleMarked: string }> {
  const marked = new Map<number, { snippet: string; titleMarked: string }>();
  if (chunkIds.length === 0) return marked;
  const rows = sqlite
    .prepare(
      `SELECT rowid AS chunkId, snippet(chunks_fts, 2, '${HIT_OPEN}', '${HIT_CLOSE}', '…', 32) AS snippet,
              highlight(chunks_fts, 0, '${HIT_OPEN}', '${HIT_CLOSE}') AS titleMarked
       FROM chunks_fts WHERE chunks_fts MATCH ? AND rowid IN (${chunkIds.map(() => "?").join(",")})`,
    )
    .all(match, ...chunkIds) as Array<{ chunkId: number; snippet: string; titleMarked: string }>;
  for (const row of rows) marked.set(row.chunkId, row);
  return marked;
}

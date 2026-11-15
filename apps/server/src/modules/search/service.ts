/**
 * The search index and unified search.
 *
 * Owning modules (documents, notes, collections, maps) describe what they hold with
 * `upsert` and `remove`; they do not know how search works. Search does not know their
 * tables either: a result carries a title, passages and the in-app URL that opens it.
 *
 * Three layers share this entry point:
 *  - keyword: SQLite FTS5 with BM25 ranking, always available;
 *  - additional sources (semantic similarity, reference collections served by Kiwix)
 *    plug in through `addSource`;
 *  - hybrid: every source's ranked list fused with reciprocal rank fusion.
 */
import { and, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { chunks, searchEntities } from "../../db/schema.ts";
import { type ChunkOptions, chunkSections, type Section } from "./chunker.ts";
import { reciprocalRankFusion } from "./fusion.ts";
import { HIT_CLOSE, HIT_OPEN, parseQuery, type Segment, toFtsQuery, toSegments } from "./query.ts";

/** Bumped when chunking or indexing rules change in a way that needs a rebuild. */
export const INDEX_VERSION = 1;

export interface IndexEntity {
  kind: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  collection?: string | null;
  url: string;
  sourcePath?: string | null;
  tags?: string[];
  meta?: Record<string, unknown>;
  sections: Section[];
}

export interface ResultPassage {
  chunkId: number | null;
  segments: Segment[];
  page: number | null;
  heading: string | null;
}

export interface SearchResult {
  kind: string;
  entityId: string;
  title: string;
  titleSegments: Segment[];
  subtitle: string | null;
  collection: string | null;
  /** In-app route that opens the source, at the matching page when there is one. */
  url: string;
  tags: string[];
  /** 0–1, relative to the best result of this search. */
  score: number;
  passages: ResultPassage[];
  /** Which layers found this result. */
  sources: string[];
}

export interface SearchParams {
  q: string;
  kinds?: string[];
  tag?: string;
  limit?: number;
  offset?: number;
  mode?: "keyword" | "semantic" | "hybrid";
  signal?: AbortSignal;
}

export interface SearchResponse {
  query: string;
  mode: "keyword" | "semantic" | "hybrid";
  /** True when no result had every word and the search fell back to matching any word. */
  relaxed: boolean;
  total: number;
  results: SearchResult[];
  facets: Record<string, number>;
  /** Sources that could not answer, with a reason a person can read. */
  warnings: Array<{ source: string; message: string }>;
  tookMs: number;
}

export interface SearchSource {
  id: string;
  /** "semantic" sources run in semantic and hybrid modes; "reference" ones in keyword and hybrid. */
  layer: "semantic" | "reference";
  isAvailable(): boolean;
  weight(): number;
  search(params: { q: string; kinds?: string[]; limit: number; signal?: AbortSignal }): Promise<SearchResult[]>;
}

export interface ChunkRecord {
  chunkId: number;
  kind: string;
  entityId: string;
  title: string;
  url: string;
  sourcePath: string | null;
  collection: string | null;
  ordinal: number;
  heading: string;
  text: string;
  page: number | null;
  charStart: number | null;
  charEnd: number | null;
  contentHash: string;
  indexVersion: number;
}

export interface SearchService {
  upsert(entity: IndexEntity): { chunks: number; changed: boolean };
  remove(kind: string, entityId: string): void;
  search(params: SearchParams): Promise<SearchResponse>;
  addSource(source: SearchSource): void;
  getChunks(chunkIds: number[]): ChunkRecord[];
  stats(): { entities: Record<string, number>; chunks: number };
  /** Called after an entity's passages change, so vectors can follow. */
  onChunksChanged(listener: (entityRowId: number) => void): void;
}

declare module "../../core/context.ts" {
  interface Services {
    search: SearchService;
  }
}

const TAG_SEPARATOR = " , ";

interface KeywordRow {
  chunkId: number;
  entityRowId: number;
  rank: number;
  snippet: string;
  titleMarked: string;
  page: number | null;
  heading: string;
  kind: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  collection: string | null;
  url: string;
  tags: string;
}

/** Appends the page to a document URL so the viewer opens where the match is. */
function withPage(url: string, page: number | null): string {
  if (page === null) return url;
  return `${url}${url.includes("?") ? "&" : "?"}page=${page}`;
}

export function createSearchService(ctx: AppContext): SearchService {
  const { db, sqlite } = ctx;
  const sources: SearchSource[] = [];
  const chunkListeners: Array<(entityRowId: number) => void> = [];

  const chunkOptions = (): ChunkOptions => ({
    size: ctx.services.settings.get("indexing.chunkSize"),
    overlap: ctx.services.settings.get("indexing.chunkOverlap"),
  });

  const insertChunk = sqlite.prepare(
    `INSERT INTO chunks (entity_row_id, ordinal, title, tags, heading, text, page, char_start, char_end, content_hash, index_version)
     VALUES (@entityRowId, @ordinal, @title, @tags, @heading, @text, @page, @charStart, @charEnd, @contentHash, @indexVersion)`,
  );

  const upsert = sqlite.transaction((entity: IndexEntity) => {
    const now = Date.now();
    const tags = (entity.tags ?? []).join(TAG_SEPARATOR);
    const existing = db
      .select()
      .from(searchEntities)
      .where(and(eq(searchEntities.kind, entity.kind), eq(searchEntities.entityId, entity.entityId)))
      .get();

    const values = {
      kind: entity.kind,
      entityId: entity.entityId,
      title: entity.title,
      subtitle: entity.subtitle ?? null,
      collection: entity.collection ?? null,
      url: entity.url,
      sourcePath: entity.sourcePath ?? null,
      meta: { ...entity.meta, tags: entity.tags ?? [] },
      updatedAt: now,
    };
    let rowId: number;
    if (existing) {
      rowId = existing.id;
      db.update(searchEntities).set(values).where(eq(searchEntities.id, rowId)).run();
    } else {
      rowId = Number(db.insert(searchEntities).values(values).run().lastInsertRowid);
    }

    let passages = chunkSections(entity.sections, chunkOptions());
    if (passages.length === 0) {
      // Keep the entity findable by title and tags even when it has no body text.
      passages = [{ ordinal: 0, text: "", heading: "", page: null, charStart: 0, charEnd: 0, contentHash: "" }];
    }

    const current = existing
      ? db
          .select({
            ordinal: chunks.ordinal,
            contentHash: chunks.contentHash,
            indexVersion: chunks.indexVersion,
            heading: chunks.heading,
            page: chunks.page,
          })
          .from(chunks)
          .where(eq(chunks.entityRowId, rowId))
          .orderBy(chunks.ordinal)
          .all()
      : [];
    const sameContent =
      current.length === passages.length &&
      current.every((row, index) => {
        const passage = passages[index]!;
        return (
          row.contentHash === passage.contentHash &&
          row.indexVersion === INDEX_VERSION &&
          row.heading === passage.heading &&
          row.page === passage.page
        );
      });

    if (sameContent) {
      // Text is unchanged: refresh the denormalised columns and keep chunk ids, so any
      // vectors attached to them stay valid.
      db.update(chunks).set({ title: entity.title, tags }).where(eq(chunks.entityRowId, rowId)).run();
      return { chunks: passages.length, changed: false, rowId };
    }

    db.delete(chunks).where(eq(chunks.entityRowId, rowId)).run();
    for (const passage of passages) {
      insertChunk.run({
        entityRowId: rowId,
        ordinal: passage.ordinal,
        title: entity.title,
        tags,
        heading: passage.heading,
        text: passage.text,
        page: passage.page,
        charStart: passage.charStart,
        charEnd: passage.charEnd,
        contentHash: passage.contentHash,
        indexVersion: INDEX_VERSION,
      });
    }
    return { chunks: passages.length, changed: true, rowId };
  });

  function keywordRows(match: string, params: SearchParams, limit: number): KeywordRow[] {
    const kinds = params.kinds?.length ? params.kinds : undefined;
    const kindFilter = kinds ? `AND e.kind IN (${kinds.map(() => "?").join(",")})` : "";
    // Column weights follow the FTS table's column order: title, heading, text, tags.
    const statement = sqlite.prepare(
      `SELECT c.id AS chunkId, c.entity_row_id AS entityRowId,
              bm25(chunks_fts, 8.0, 3.0, 1.0, 4.0) AS rank,
              snippet(chunks_fts, 2, '${HIT_OPEN}', '${HIT_CLOSE}', '…', 32) AS snippet,
              highlight(chunks_fts, 0, '${HIT_OPEN}', '${HIT_CLOSE}') AS titleMarked,
              c.page AS page, c.heading AS heading,
              e.kind AS kind, e.entity_id AS entityId, e.title AS title, e.subtitle AS subtitle,
              e.collection AS collection, e.url AS url, c.tags AS tags
       FROM chunks_fts
       JOIN chunks c ON c.id = chunks_fts.rowid
       JOIN search_entities e ON e.id = c.entity_row_id
       WHERE chunks_fts MATCH ? ${kindFilter}
       ORDER BY rank
       LIMIT ?`,
    );
    return statement.all(match, ...(kinds ?? []), limit) as KeywordRow[];
  }

  function keywordSearch(
    params: SearchParams,
    limit: number,
  ): { results: SearchResult[]; relaxed: boolean; facets: Record<string, number> } {
    const parsed = parseQuery(params.q);
    const tagClause = params.tag ? ` AND {tags}: "${params.tag.replace(/"/g, '""')}"` : "";
    let match = toFtsQuery(parsed, "all");
    if (!match) return { results: [], relaxed: false, facets: {} };

    // Fetch more passages than results wanted: several can belong to one entity.
    let rows = keywordRows(match + tagClause, params, limit * 6);
    let relaxed = false;
    if (rows.length === 0 && parsed.required.length > 1) {
      match = toFtsQuery(parsed, "any")!;
      rows = keywordRows(match + tagClause, params, limit * 6);
      relaxed = rows.length > 0;
    }

    const byEntity = new Map<number, SearchResult & { best: number }>();
    for (const row of rows) {
      let result = byEntity.get(row.entityRowId);
      if (!result) {
        result = {
          kind: row.kind,
          entityId: row.entityId,
          title: row.title,
          titleSegments: toSegments(row.titleMarked),
          subtitle: row.subtitle,
          collection: row.collection,
          url: withPage(row.url, row.page),
          tags: row.tags ? row.tags.split(TAG_SEPARATOR) : [],
          score: 0,
          passages: [],
          sources: ["keyword"],
          best: -row.rank,
        };
        byEntity.set(row.entityRowId, result);
      }
      if (result.passages.length < 3 && row.snippet.trim()) {
        result.passages.push({
          chunkId: row.chunkId,
          segments: toSegments(row.snippet),
          page: row.page,
          heading: row.heading || null,
        });
      }
    }
    const results = [...byEntity.values()].sort((a, b) => b.best - a.best);
    const top = results[0]?.best ?? 1;
    for (const result of results) result.score = top > 0 ? Math.max(0, Math.min(1, result.best / top)) : 0;

    const facetRows = sqlite
      .prepare(
        `SELECT e.kind AS kind, count(DISTINCT e.id) AS n
         FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN search_entities e ON e.id = c.entity_row_id
         WHERE chunks_fts MATCH ? GROUP BY e.kind`,
      )
      .all(match + tagClause) as Array<{ kind: string; n: number }>;
    const facets: Record<string, number> = {};
    for (const row of facetRows) facets[row.kind] = row.n;

    return { results: results.map(({ best: _best, ...result }) => result), relaxed, facets };
  }

  const service: SearchService = {
    upsert(entity) {
      const { rowId, ...outcome } = upsert(entity);
      if (outcome.changed) for (const listener of chunkListeners) listener(rowId);
      return outcome;
    },

    remove(kind, entityId) {
      db.delete(searchEntities)
        .where(and(eq(searchEntities.kind, kind), eq(searchEntities.entityId, entityId)))
        .run();
    },

    async search(params) {
      const started = performance.now();
      const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
      const offset = Math.max(params.offset ?? 0, 0);
      const window = limit + offset;
      const q = params.q.trim();
      const warnings: SearchResponse["warnings"] = [];

      const semanticReady = sources.some((source) => source.layer === "semantic" && source.isAvailable());
      let mode = params.mode ?? (semanticReady ? "hybrid" : "keyword");
      if (mode !== "keyword" && !semanticReady) {
        warnings.push({ source: "semantic", message: "Semantic search is not set up, so this is a keyword search." });
        mode = "keyword";
      }

      if (!q) {
        return { query: q, mode, relaxed: false, total: 0, results: [], facets: {}, warnings, tookMs: 0 };
      }

      const keyword = mode === "semantic" ? { results: [], relaxed: false, facets: {} } : keywordSearch(params, window);
      const lists =
        mode === "semantic" ? [] : [{ weight: ctx.services.settings.get("search.hybrid.keywordWeight"), items: keyword.results }];

      const active = sources.filter((source) => {
        if (!source.isAvailable()) return false;
        if (source.layer === "semantic") return mode !== "keyword";
        if (params.kinds?.length && !params.kinds.includes("reference")) return false;
        return mode !== "semantic" && ctx.services.settings.get("search.includeReference");
      });
      const answers = await Promise.allSettled(
        active.map((source) => source.search({ q, kinds: params.kinds, limit: window, signal: params.signal })),
      );
      answers.forEach((answer, index) => {
        const source = active[index]!;
        if (answer.status === "fulfilled") {
          lists.push({ weight: source.weight(), items: answer.value });
          if (source.layer === "reference" && answer.value.length > 0) {
            keyword.facets.reference = (keyword.facets.reference ?? 0) + answer.value.length;
          }
        } else {
          warnings.push({ source: source.id, message: answer.reason instanceof Error ? answer.reason.message : String(answer.reason) });
        }
      });

      let results: SearchResult[];
      if (lists.length === 1) {
        results = lists[0]!.items;
      } else {
        const fused = reciprocalRankFusion(
          lists,
          (item) => `${item.kind}:${item.entityId}`,
          ctx.services.settings.get("search.hybrid.rrfK"),
        );
        const top = fused[0]?.score ?? 1;
        results = fused.map(({ item, score }) => {
          const all = lists.flatMap((list) => list.items.filter((other) => other.kind === item.kind && other.entityId === item.entityId));
          return {
            ...item,
            score: score / top,
            sources: [...new Set(all.flatMap((other) => other.sources))],
            passages: item.passages.length > 0 ? item.passages : (all.find((other) => other.passages.length > 0)?.passages ?? []),
          };
        });
      }

      return {
        query: q,
        mode,
        relaxed: keyword.relaxed,
        total: results.length,
        results: results.slice(offset, offset + limit),
        facets: keyword.facets,
        warnings,
        tookMs: Math.round(performance.now() - started),
      };
    },

    addSource(source) {
      sources.push(source);
    },

    getChunks(chunkIds) {
      if (chunkIds.length === 0) return [];
      const rows = sqlite
        .prepare(
          `SELECT c.id AS chunkId, e.kind AS kind, e.entity_id AS entityId, e.title AS title, e.url AS url,
                  e.source_path AS sourcePath, e.collection AS collection, c.ordinal AS ordinal, c.heading AS heading,
                  c.text AS text, c.page AS page, c.char_start AS charStart, c.char_end AS charEnd,
                  c.content_hash AS contentHash, c.index_version AS indexVersion
           FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id
           WHERE c.id IN (${chunkIds.map(() => "?").join(",")})`,
        )
        .all(...chunkIds) as ChunkRecord[];
      const order = new Map(chunkIds.map((id, index) => [id, index]));
      return rows.sort((a, b) => (order.get(a.chunkId) ?? 0) - (order.get(b.chunkId) ?? 0));
    },

    stats() {
      const entities: Record<string, number> = {};
      for (const row of db
        .select({ kind: searchEntities.kind, n: sql<number>`count(*)` })
        .from(searchEntities)
        .groupBy(searchEntities.kind)
        .all()) {
        entities[row.kind] = row.n;
      }
      const total = db.select({ n: sql<number>`count(*)` }).from(chunks).get()?.n ?? 0;
      return { entities, chunks: total };
    },

    onChunksChanged(listener) {
      chunkListeners.push(listener);
    },
  };

  return service;
}

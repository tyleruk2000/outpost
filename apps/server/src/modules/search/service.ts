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
  /**
   * "later" leaves reference collections out of the answer, for a caller that asks for
   * them separately (`searchReference`) so that nothing waits on them.
   */
  reference?: "include" | "later";
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
  /**
   * Only when asked with `reference: "later"`: true when there are reference collections
   * to search for this, so asking `searchReference` is worth it.
   */
  referenceToCome?: boolean;
  tookMs: number;
}

export interface SearchSource {
  id: string;
  /**
   * "semantic" sources run in semantic and hybrid modes; "reference" ones in keyword and
   * hybrid. A "local" source is a module's own table of one kind of thing, too many to
   * index as passages (repeaters); it runs in keyword and hybrid modes whenever a search
   * is not narrowed to other kinds or to a tag.
   */
  layer: "semantic" | "reference" | "local";
  /** For a local source: the kind of thing it finds, which is also its line among the facets. */
  kind?: string;
  isAvailable(): boolean;
  weight(): number;
  search(params: { q: string; kinds?: string[]; limit: number; signal?: AbortSignal }): Promise<SearchResult[]>;
  /**
   * For a source made of collections that answer at different times: the same search,
   * handing over each collection's results as soon as that collection has answered.
   */
  searchInParts?(params: ReferenceSearchParams): Promise<ReferenceOutcome>;
}

/** What one reference collection found. */
export interface ReferencePart {
  collectionId: string;
  title: string;
  /** Its best matches, best first. Empty when it has none. */
  results: SearchResult[];
}

export interface ReferenceSearchParams {
  q: string;
  /** Fires when whoever asked has gone: nothing more is wanted. */
  signal?: AbortSignal;
  /** How long to go on waiting for collections. Those that have not answered by then are reported as missing. */
  budgetMs: number;
  /** Called once, first, with the number of collections that will be searched. */
  onStart?(collections: number): void;
  /** Called once for each collection that answers, in the order they answer. */
  onPart(part: ReferencePart): void;
}

export interface ReferenceOutcome {
  /** How many collections there were to search. */
  collections: number;
  /** How many answered. */
  searched: number;
  /** The ones that did not, by name. */
  missing: Array<{ collectionId: string; title: string; reason: "slow" | "failed" }>;
  /** Why none could be searched at all, in words for a person; null when they could. */
  message: string | null;
}

/** How long a search waits for reference collections altogether. Tests shorten these; nothing else changes them. */
export const referenceBudgets = {
  /** A search that answers in one part holds everything back while it waits, so it waits less. */
  onePartMs: 10_000,
  /** A search of reference collections on their own, which sends each collection's results as they come. */
  inPartsMs: 30_000,
};

/** Each collection ranks its own articles; take them in turn so one large collection does not crowd out the rest. */
export function inTurn(parts: ReferencePart[]): SearchResult[] {
  const results: SearchResult[] = [];
  const depth = Math.max(0, ...parts.map((part) => part.results.length));
  for (let rank = 0; rank < depth; rank += 1) {
    for (const part of parts) {
      const hit = part.results[rank];
      if (hit) results.push(hit);
    }
  }
  return results;
}

/** Names the collections missing from a search, as a sentence. Null when none is. */
export function missingMessage(missing: ReferenceOutcome["missing"]): string | null {
  if (missing.length === 0) return null;
  const names = (reason: "slow" | "failed") =>
    missing
      .filter((item) => item.reason === reason)
      .map((item) => `“${item.title}”`)
      .join(", ");
  const slow = names("slow");
  const failed = names("failed");
  return [
    slow ? `Not searched in time, so missing from these results: ${slow}.` : "",
    failed ? `Could not be searched, so missing from these results: ${failed}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Runs a search in parts to its end and gives the whole of it, in a settled order. */
export async function gatherParts(
  source: SearchSource,
  params: Omit<ReferenceSearchParams, "onPart" | "onStart">,
): Promise<{ results: SearchResult[]; outcome: ReferenceOutcome }> {
  const parts: ReferencePart[] = [];
  const outcome = await source.searchInParts!({ ...params, onPart: (part) => parts.push(part) });
  // The order collections answered in is chance; their names are not.
  parts.sort((a, b) => a.title.localeCompare(b.title) || a.collectionId.localeCompare(b.collectionId));
  return { results: inTurn(parts), outcome };
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
  /**
   * Searches reference collections on their own, a collection at a time. This is the
   * second part of a search asked with `reference: "later"`.
   */
  searchReference(params: Omit<ReferenceSearchParams, "budgetMs">): Promise<ReferenceOutcome>;
  addSource(source: SearchSource): void;
  getChunks(chunkIds: number[]): ChunkRecord[];
  stats(): { entities: Record<string, number>; chunks: number };
  /** Called after an entity's passages change, so vectors can follow. */
  onChunksChanged(listener: (entityRowId: number) => void): void;
  /**
   * Runs `work` so that whatever it deletes or replaces is erased rather than only
   * unlinked: freed database pages are overwritten with zeros, deleted passages are
   * taken out of the full-text index instead of being marked as gone, and afterwards the
   * write-ahead log, which still holds the old pages, is folded into the database and
   * emptied. For the save that replaces a page's text with an encrypted copy.
   *
   * It reaches what `work` itself removes. Text freed by earlier changes may still lie
   * in unused space until the database is compacted, and the disk underneath is not
   * touched at all.
   */
  scrubbing<T>(work: () => T): T;
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

    scrubbing(work) {
      const secureDeleteWas = Number(sqlite.pragma("secure_delete", { simple: true }));
      // Written out, not bound: the index only takes this setting as a whole number, and a bound number arrives as a real.
      const indexSecureDelete = (on: boolean) =>
        sqlite.exec(`INSERT INTO chunks_fts(chunks_fts, rank) VALUES('secure-delete', ${on ? 1 : 0})`);
      sqlite.pragma("secure_delete = ON");
      indexSecureDelete(true);
      try {
        return work();
      } finally {
        // Both are put back: erasing costs more than unlinking, and ordinary edits do not need it.
        indexSecureDelete(false);
        sqlite.pragma(`secure_delete = ${secureDeleteWas === 1 ? "ON" : "OFF"}`);
        try {
          sqlite.pragma("wal_checkpoint(TRUNCATE)");
        } catch (error) {
          // Something else is reading. The log is folded in at the next ordinary checkpoint instead.
          ctx.log.warn({ err: error }, "could not empty the write-ahead log after a scrubbing save");
        }
      }
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

      // Whatever kinds were asked for: the caller shows reference results beside any of them.
      const later =
        params.reference === "later"
          ? {
              referenceToCome:
                Boolean(q) &&
                mode !== "semantic" &&
                ctx.services.settings.get("search.includeReference") &&
                sources.some((source) => source.layer === "reference" && source.isAvailable()),
            }
          : {};

      if (!q) {
        return { query: q, mode, relaxed: false, total: 0, results: [], facets: {}, warnings, ...later, tookMs: 0 };
      }

      const keyword = mode === "semantic" ? { results: [], relaxed: false, facets: {} } : keywordSearch(params, window);
      const lists =
        mode === "semantic" ? [] : [{ weight: ctx.services.settings.get("search.hybrid.keywordWeight"), items: keyword.results }];

      const active = sources.filter((source) => {
        if (!source.isAvailable()) return false;
        if (source.layer === "semantic") return mode !== "keyword";
        // A module answering from its own table is one of Outpost's own results: it does not wait with the archives.
        if (source.layer === "local") {
          return mode !== "semantic" && !params.tag && (!params.kinds?.length || params.kinds.includes(source.kind ?? source.id));
        }
        if (params.reference === "later") return false;
        if (params.kinds?.length && !params.kinds.includes("reference")) return false;
        return mode !== "semantic" && ctx.services.settings.get("search.includeReference");
      });
      const answers = await Promise.allSettled(
        active.map(async (source) => {
          if (!source.searchInParts) return source.search({ q, kinds: params.kinds, limit: window, signal: params.signal });
          // Every collection's best matches, however far down the list this page is, so
          // that the count and the pages do not change from one page to the next.
          const { results, outcome } = await gatherParts(source, { q, signal: params.signal, budgetMs: referenceBudgets.onePartMs });
          const problem = outcome.message ?? missingMessage(outcome.missing);
          if (problem) warnings.push({ source: source.id, message: problem });
          return results;
        }),
      );
      answers.forEach((answer, index) => {
        const source = active[index]!;
        if (answer.status === "fulfilled") {
          lists.push({ weight: source.weight(), items: answer.value });
          if (source.layer === "reference" && answer.value.length > 0) {
            keyword.facets.reference = (keyword.facets.reference ?? 0) + answer.value.length;
          }
          if (source.layer === "local" && answer.value.length > 0) keyword.facets[source.kind ?? source.id] = answer.value.length;
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
        ...later,
        tookMs: Math.round(performance.now() - started),
      };
    },

    async searchReference(params) {
      const q = params.q.trim();
      const source = sources.find((candidate) => candidate.layer === "reference" && candidate.searchInParts && candidate.isAvailable());
      if (!q || !source || !ctx.services.settings.get("search.includeReference")) {
        params.onStart?.(0);
        return { collections: 0, searched: 0, missing: [], message: null };
      }
      return source.searchInParts!({ ...params, q, budgetMs: referenceBudgets.inPartsMs });
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

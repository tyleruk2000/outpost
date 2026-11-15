/**
 * "How search works": the same retrieval the rest of Outpost uses, run one stage at a
 * time with the intermediate results kept, so that the web app can show them.
 *
 * Nothing here is a simulation. The keyword scores are the full-text index's own BM25
 * values, the similarities are real cosines between real vectors, and the fusion is the
 * same reciprocal rank fusion as everywhere else, applied passage by passage.
 *
 * When no embedding model is set up, the vector stages still run, on demonstration
 * vectors made from word counts. Every answer says which kind it used.
 */
import type {
  ExplainChunk,
  ExplainEntity,
  ExplainFusionRow,
  ExplainKeywordHit,
  ExplainOverview,
  ExplainResponse,
  ExplainSemanticHit,
  ExplainVectorSource,
  ProjectionPoint,
  ProjectionResponse,
  SearchSegment,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { reciprocalRankFusion } from "../search/fusion.ts";
import { HIT_CLOSE, HIT_OPEN, parseQuery, toFtsQuery, toSegments } from "../search/query.ts";
import { demoProvider, demoTerms, type EmbeddingProvider } from "../semantic/providers.ts";
import { contextAssembler } from "./index.ts";
import type { RetrievedPassage } from "./types.ts";

/** How many numbers of a vector are sent to be drawn. Enough to see a pattern, not the whole thing. */
const VECTOR_PREVIEW = 64;
/** Most passages embedded on the spot when demonstration vectors are in use. */
const DEMO_POOL = 3000;

interface ChunkRow {
  chunkId: number;
  kind: string;
  entityId: string;
  title: string;
  url: string;
  page: number | null;
  heading: string;
  text: string;
  tags: string;
  collection: string | null;
  sourcePath: string | null;
  charStart: number | null;
  charEnd: number | null;
  contentHash: string;
  indexVersion: number;
}

const CHUNK_COLUMNS = `c.id AS chunkId, e.kind AS kind, e.entity_id AS entityId, e.title AS title, e.url AS url, c.page AS page,
  c.heading AS heading, c.text AS text, c.tags AS tags, e.collection AS collection, e.source_path AS sourcePath,
  c.char_start AS charStart, c.char_end AS charEnd, c.content_hash AS contentHash, c.index_version AS indexVersion`;

const withPage = (url: string, page: number | null) => (page === null ? url : `${url}${url.includes("?") ? "&" : "?"}page=${page}`);
const excerpt = (text: string, length = 280) => (text.length > length ? `${text.slice(0, length).trimEnd()}…` : text);
const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index]! * b[index]!;
  return sum;
};
const preview = (vector: Float32Array) => Array.from(vector.subarray(0, VECTOR_PREVIEW), (value) => Math.round(value * 1000) / 1000);

/**
 * The first two principal components of a set of vectors, found by power iteration.
 * Returns each vector's coordinates on them and the share of variance each keeps.
 */
export function projectTo2d(vectors: Float32Array[]): { points: Array<[number, number]>; explained: [number, number] } {
  const count = vectors.length;
  if (count === 0) return { points: [], explained: [0, 0] };
  const size = vectors[0]!.length;
  const mean = new Float64Array(size);
  for (const vector of vectors) for (let d = 0; d < size; d += 1) mean[d] = mean[d]! + vector[d]! / count;
  const centred = vectors.map((vector) => Float64Array.from(vector, (value, d) => value - mean[d]!));
  let total = 0;
  for (const row of centred) for (const value of row) total += value * value;

  const components: Float64Array[] = [];
  const variances: number[] = [];
  for (let component = 0; component < 2; component += 1) {
    // A fixed, non-degenerate start keeps the picture the same from one request to the next.
    let axis = Float64Array.from({ length: size }, (_, d) => Math.sin(d * 12.9898 + component * 78.233) + 0.01);
    let variance = 0;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const next = new Float64Array(size);
      for (const row of centred) {
        let projection = 0;
        for (let d = 0; d < size; d += 1) projection += row[d]! * axis[d]!;
        for (let d = 0; d < size; d += 1) next[d] = next[d]! + projection * row[d]!;
      }
      // Remove what earlier components already explain.
      for (const earlier of components) {
        let overlap = 0;
        for (let d = 0; d < size; d += 1) overlap += next[d]! * earlier[d]!;
        for (let d = 0; d < size; d += 1) next[d] = next[d]! - overlap * earlier[d]!;
      }
      let norm = 0;
      for (const value of next) norm += value * value;
      norm = Math.sqrt(norm);
      if (norm < 1e-12) break;
      variance = norm;
      for (let d = 0; d < size; d += 1) next[d] = next[d]! / norm;
      axis = next;
    }
    components.push(axis);
    variances.push(variance);
  }
  const points = centred.map((row): [number, number] => {
    const coordinates = components.map((axis) => {
      let projection = 0;
      for (let d = 0; d < size; d += 1) projection += row[d]! * axis[d]!;
      return projection;
    });
    return [coordinates[0] ?? 0, coordinates[1] ?? 0];
  });
  return { points, explained: [total > 0 ? variances[0]! / total : 0, total > 0 ? variances[1]! / total : 0] };
}

export function registerExplain(app: FastifyInstance, ctx: AppContext): void {
  const { sqlite } = ctx;
  const { settings, semantic, search } = ctx.services;
  const demo = demoProvider();

  /** Which vectors a request will use, and why if it is not the configured model. */
  async function vectorSource(): Promise<{ info: ExplainVectorSource; provider: EmbeddingProvider; stored: boolean }> {
    const configured = semantic.provider();
    const status = await semantic.status();
    if (configured && status.ready && status.embeddedChunks > 0) {
      return {
        info: { source: "model", modelId: configured.modelId, dimensions: status.dimensions, reason: null },
        provider: configured,
        stored: true,
      };
    }
    const reason = !status.enabled
      ? "Search by meaning is turned off in Settings, so word-count vectors are used here to show how it works."
      : !configured || !status.ready
        ? `The embedding model is not answering (${status.reason ?? "not set up"}), so word-count vectors are used here instead.`
        : "The model is set up but no passages have vectors yet. Build the index in Settings to see the real thing; word-count vectors are used here meanwhile.";
    return { info: { source: "demonstration", modelId: demo.modelId, dimensions: 256, reason }, provider: demo, stored: false };
  }

  const countChunks = () => (sqlite.prepare("SELECT count(*) AS n FROM chunks WHERE text <> ''").get() as { n: number }).n;

  /** Passages to compare against when vectors are made on the spot: an even sample when there are too many. */
  function demoPool(always: number[] = []): ChunkRow[] {
    const total = countChunks();
    const step = Math.max(1, Math.ceil(total / DEMO_POOL));
    const rows = sqlite
      .prepare(
        `SELECT ${CHUNK_COLUMNS} FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id WHERE c.text <> '' AND (c.id % ? = 0 OR c.id IN (${always.map(() => "?").join(",") || "NULL"}))`,
      )
      .all(step, ...always) as ChunkRow[];
    return rows;
  }

  function chunkRows(ids: number[]): Map<number, ChunkRow> {
    if (ids.length === 0) return new Map();
    const rows = sqlite
      .prepare(
        `SELECT ${CHUNK_COLUMNS} FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id WHERE c.id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids) as ChunkRow[];
    return new Map(rows.map((row) => [row.chunkId, row]));
  }

  // ── Overview ──
  app.get("/api/retrieval/overview", async (): Promise<ExplainOverview> => {
    const stats = search.stats();
    const lengths = sqlite.prepare("SELECT length(text) AS n FROM chunks WHERE text <> ''").all() as Array<{ n: number }>;
    const chunkSize = settings.get("indexing.chunkSize");
    const bucket = Math.max(100, Math.ceil(chunkSize / 8 / 50) * 50);
    const buckets = new Map<number, number>();
    for (const { n } of lengths) {
      const from = Math.floor(n / bucket) * bucket;
      buckets.set(from, (buckets.get(from) ?? 0) + 1);
    }
    const source = await vectorSource();
    const status = await semantic.status();
    return {
      entities: stats.entities,
      chunks: lengths.length,
      chunkLengths: [...buckets].sort((a, b) => a[0] - b[0]).map(([from, count]) => ({ from, to: from + bucket, count })),
      settings: {
        chunkSize,
        chunkOverlap: settings.get("indexing.chunkOverlap"),
        rrfK: settings.get("search.hybrid.rrfK"),
        keywordWeight: settings.get("search.hybrid.keywordWeight"),
        semanticWeight: settings.get("search.hybrid.semanticWeight"),
      },
      vectors: { ...source.info, embedded: source.stored ? status.embeddedChunks : 0, total: lengths.length },
    };
  });

  // ── Something to look at: indexed things and their passages ──
  app.get<{ Querystring: { q?: string } }>("/api/retrieval/entities", async (request): Promise<{ entities: ExplainEntity[] }> => {
    const q = (request.query.q ?? "").trim().slice(0, 100);
    const rows = sqlite
      .prepare(
        `SELECT e.kind AS kind, e.entity_id AS entityId, e.title AS title, e.url AS url, count(c.id) AS chunks
         FROM search_entities e JOIN chunks c ON c.entity_row_id = e.id AND c.text <> ''
         WHERE e.kind IN ('document', 'note') AND e.title LIKE ? ESCAPE '\\'
         GROUP BY e.id ORDER BY chunks DESC, e.updated_at DESC LIMIT 30`,
      )
      .all(`%${q.replace(/[\\%_]/g, "\\$&")}%`) as ExplainEntity[];
    return { entities: rows };
  });

  app.get<{ Querystring: { kind?: string; entityId?: string } }>(
    "/api/retrieval/chunks",
    async (request): Promise<{ entity: ExplainEntity; chunks: ExplainChunk[]; chunkSize: number; chunkOverlap: number }> => {
      const { kind = "", entityId = "" } = request.query;
      const entity = sqlite
        .prepare("SELECT id, kind, entity_id AS entityId, title, url FROM search_entities WHERE kind = ? AND entity_id = ?")
        .get(kind, entityId) as (ExplainEntity & { id: number }) | undefined;
      if (!entity) throw notFound("That document or page");
      const modelId = semantic.provider()?.modelId ?? "";
      const rows = sqlite
        .prepare(
          `SELECT c.id AS chunkId, c.ordinal AS ordinal, c.heading AS heading, c.page AS page, c.text AS text, c.char_start AS charStart, c.char_end AS charEnd,
                c.content_hash AS contentHash, EXISTS (SELECT 1 FROM embeddings m WHERE m.chunk_id = c.id AND m.model_id = ?) AS hasVector
         FROM chunks c WHERE c.entity_row_id = ? AND c.text <> '' ORDER BY c.ordinal LIMIT 400`,
        )
        .all(modelId, entity.id) as Array<
        Omit<ExplainChunk, "overlapWithPrevious" | "hasVector" | "heading"> & { heading: string; hasVector: number }
      >;
      const chunks: ExplainChunk[] = rows.map((row, index) => {
        const previous = rows[index - 1];
        const overlap = previous && previous.charEnd !== null && row.charStart !== null ? Math.max(0, previous.charEnd - row.charStart) : 0;
        return { ...row, heading: row.heading || null, hasVector: Boolean(row.hasVector), overlapWithPrevious: overlap };
      });
      return {
        entity: { kind: entity.kind, entityId: entity.entityId, title: entity.title, url: entity.url, chunks: chunks.length },
        chunks,
        chunkSize: settings.get("indexing.chunkSize"),
        chunkOverlap: settings.get("indexing.chunkOverlap"),
      };
    },
  );

  // ── One query, every stage ──
  const explainBody = z.object({ query: z.string().trim().min(1).max(500), limit: z.number().int().min(3).max(20).default(8) });

  app.post("/api/retrieval/explain", async (request): Promise<ExplainResponse> => {
    const { query, limit } = explainBody.parse(request.body);
    const started = performance.now();
    const totalChunks = countChunks();

    // 1. Words
    const parsed = parseQuery(query);
    let expression = toFtsQuery(parsed, "all");
    const terms = parsed.required.map((term, index) => {
      const single = toFtsQuery({ required: [term], excluded: [], prefixLast: parsed.prefixLast && index === parsed.required.length - 1 });
      const containing = single
        ? (sqlite.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?").get(single) as { n: number }).n
        : 0;
      // The inverse document frequency used by BM25: rare words score high, common words near zero.
      return { term, chunksContaining: containing, idf: Math.log((totalChunks - containing + 0.5) / (containing + 0.5) + 1) };
    });

    // 2. Keyword search, passage by passage
    const keywordStarted = performance.now();
    const keywordSql = sqlite.prepare(
      `SELECT ${CHUNK_COLUMNS}, bm25(chunks_fts, 8.0, 3.0, 1.0, 4.0) AS bm25,
              snippet(chunks_fts, 2, '${HIT_OPEN}', '${HIT_CLOSE}', '…', 48) AS snippet,
              highlight(chunks_fts, 0, '${HIT_OPEN}', '${HIT_CLOSE}') AS titleMarked,
              highlight(chunks_fts, 1, '${HIT_OPEN}', '${HIT_CLOSE}') AS headingMarked,
              highlight(chunks_fts, 3, '${HIT_OPEN}', '${HIT_CLOSE}') AS tagsMarked
       FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN search_entities e ON e.id = c.entity_row_id
       WHERE chunks_fts MATCH ? AND c.text <> '' ORDER BY bm25 LIMIT ?`,
    );
    type KeywordRow = ChunkRow & { bm25: number; snippet: string; titleMarked: string; headingMarked: string; tagsMarked: string };
    let keywordRows = expression ? (keywordSql.all(expression, limit * 2) as KeywordRow[]) : [];
    let relaxed = false;
    if (keywordRows.length === 0 && parsed.required.length > 1) {
      expression = toFtsQuery(parsed, "any");
      keywordRows = keywordSql.all(expression, limit * 2) as KeywordRow[];
      relaxed = keywordRows.length > 0;
    }
    const keywordHits: ExplainKeywordHit[] = keywordRows.map((row, index) => ({
      rank: index + 1,
      chunkId: row.chunkId,
      kind: row.kind,
      entityId: row.entityId,
      title: row.title,
      url: withPage(row.url, row.page),
      page: row.page,
      heading: row.heading || null,
      segments: toSegments(row.snippet),
      length: row.text.length,
      score: -row.bm25,
      fields: {
        title: row.titleMarked.includes(HIT_OPEN),
        heading: row.headingMarked.includes(HIT_OPEN),
        text: row.snippet.includes(HIT_OPEN),
        tags: row.tagsMarked.includes(HIT_OPEN),
      },
    }));
    const keywordMs = performance.now() - keywordStarted;

    // 3. Search by meaning
    const semanticStarted = performance.now();
    const source = await vectorSource();
    const [queryVector] = await source.provider.embed([query], "query");
    let semanticHits: ExplainSemanticHit[] = [];
    let compared = 0;
    const toSemanticHit = (row: ChunkRow, similarity: number, vector: Float32Array, rank: number): ExplainSemanticHit => ({
      rank,
      chunkId: row.chunkId,
      kind: row.kind,
      entityId: row.entityId,
      title: row.title,
      url: withPage(row.url, row.page),
      page: row.page,
      heading: row.heading || null,
      segments: [{ text: excerpt(row.text), hit: false } satisfies SearchSegment],
      length: row.text.length,
      similarity,
      vector: preview(vector),
    });
    if (source.stored) {
      const hits = semantic.index.query(source.provider.modelId, queryVector!, limit * 2, ["document", "note"]);
      compared = semantic.index.count(source.provider.modelId);
      const rows = chunkRows(hits.map((hit) => hit.chunkId));
      const stored = new Map(
        (
          sqlite
            .prepare(
              `SELECT chunk_id AS chunkId, vector FROM embeddings WHERE model_id = ? AND chunk_id IN (${hits.map(() => "?").join(",") || "NULL"})`,
            )
            .all(source.provider.modelId, ...hits.map((hit) => hit.chunkId)) as Array<{ chunkId: number; vector: Buffer }>
        ).map((row) => [
          row.chunkId,
          new Float32Array(row.vector.buffer.slice(row.vector.byteOffset, row.vector.byteOffset + row.vector.byteLength)),
        ]),
      );
      semanticHits = hits.flatMap((hit, index) => {
        const row = rows.get(hit.chunkId);
        const vector = stored.get(hit.chunkId);
        return row && vector ? [toSemanticHit(row, hit.score, vector, index + 1)] : [];
      });
    } else {
      const pool = demoPool(keywordRows.map((row) => row.chunkId));
      compared = pool.length;
      const vectors = await source.provider.embed(
        pool.map((row) => [row.title, row.heading, row.text].filter(Boolean).join("\n")),
        "passage",
      );
      const scored = pool.map((row, index) => ({ row, vector: vectors[index]!, similarity: dot(queryVector!, vectors[index]!) }));
      scored.sort((a, b) => b.similarity - a.similarity);
      semanticHits = scored
        .slice(0, limit * 2)
        .filter((item) => item.similarity > 0)
        .map((item, index) => toSemanticHit(item.row, item.similarity, item.vector, index + 1));
    }
    const semanticMs = performance.now() - semanticStarted;

    // 4. Fusion
    const fusionStarted = performance.now();
    const k = settings.get("search.hybrid.rrfK");
    const keywordWeight = settings.get("search.hybrid.keywordWeight");
    const semanticWeight = settings.get("search.hybrid.semanticWeight");
    const fused = reciprocalRankFusion(
      [
        { weight: keywordWeight, items: keywordHits.map((hit) => hit.chunkId) },
        { weight: semanticWeight, items: semanticHits.map((hit) => hit.chunkId) },
      ],
      (chunkId) => String(chunkId),
      k,
    );
    const known = new Map<number, ExplainKeywordHit | ExplainSemanticHit>(
      [...semanticHits, ...keywordHits].map((hit) => [hit.chunkId, hit]),
    );
    const fusionRows: ExplainFusionRow[] = fused.slice(0, limit * 2).map((entry, index) => {
      const hit = known.get(entry.item)!;
      const [keywordRank, semanticRank] = entry.ranks as [number | null, number | null];
      return {
        chunkId: entry.item,
        title: hit.title,
        heading: hit.heading,
        page: hit.page,
        url: hit.url,
        keywordRank,
        semanticRank,
        keywordPart: keywordRank === null ? 0 : keywordWeight / (k + keywordRank),
        semanticPart: semanticRank === null ? 0 : semanticWeight / (k + semanticRank),
        score: entry.score,
        rank: index + 1,
      };
    });
    const fusionMs = performance.now() - fusionStarted;

    // 5. Context for a model
    const contextStarted = performance.now();
    const best = fusionRows.slice(0, limit);
    const rows = chunkRows(best.map((row) => row.chunkId));
    const passages: RetrievedPassage[] = best.flatMap((row) => {
      const chunk = rows.get(row.chunkId);
      if (!chunk) return [];
      return [
        {
          chunkId: chunk.chunkId,
          kind: chunk.kind,
          entityId: chunk.entityId,
          title: chunk.title,
          collection: chunk.collection,
          sourcePath: chunk.sourcePath,
          url: withPage(chunk.url, chunk.page),
          page: chunk.page,
          heading: chunk.heading || null,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          text: chunk.text,
          contentHash: chunk.contentHash,
          indexVersion: chunk.indexVersion,
          score: row.score,
          retrievedBy: [row.keywordRank !== null ? "keyword" : null, row.semanticRank !== null ? "semantic" : null].filter(
            (value): value is string => value !== null,
          ),
        },
      ];
    });
    const assembled = contextAssembler.assemble(query, passages, { maxChars: 6000, maxPassages: limit });
    const system = [
      "Answer the question using only the numbered sources below.",
      "After each statement, cite the source it came from as [n].",
      "If the sources do not contain the answer, say so plainly instead of guessing.",
      ...(assembled.safetyCritical
        ? [
            "These sources concern health, safety or food preservation. Quote the source's own wording for any instruction, dose, time or temperature.",
          ]
        : []),
    ].join(" ");
    const user = `Sources:\n\n${assembled.text}\n\nQuestion: ${query}`;
    const contextMs = performance.now() - contextStarted;

    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      query,
      parse: { words: parsed.required, excluded: parsed.excluded, prefixLast: parsed.prefixLast, expression, relaxed, terms, totalChunks },
      keyword: { tookMs: round(keywordMs), hits: keywordHits.slice(0, limit * 2) },
      semantic: {
        ...source.info,
        dimensions: queryVector!.length,
        tookMs: round(semanticMs),
        compared,
        queryVector: preview(queryVector!),
        queryTerms: source.info.source === "demonstration" ? [...new Set(demoTerms(query))] : [],
        hits: semanticHits,
      },
      fusion: { k, keywordWeight, semanticWeight, rows: fusionRows },
      context: {
        text: assembled.text,
        citations: assembled.citations.map(({ marker, chunkId, title, heading, page, url, quote }) => ({
          marker,
          chunkId,
          title,
          heading,
          page,
          url,
          quote,
        })),
        omitted: assembled.omitted,
        safetyCritical: assembled.safetyCritical,
        characters: assembled.text.length,
        approxTokens: Math.ceil(assembled.text.length / 4),
      },
      prompt: { system, user, approxTokens: Math.ceil((system.length + user.length) / 4) },
      timings: {
        keywordMs: round(keywordMs),
        semanticMs: round(semanticMs),
        fusionMs: round(fusionMs),
        contextMs: round(contextMs),
        totalMs: round(performance.now() - started),
      },
    };
  });

  // ── A map of the vectors ──
  const projectionBody = z.object({ query: z.string().trim().max(500).optional(), limit: z.number().int().min(20).max(800).default(300) });

  app.post("/api/retrieval/projection", async (request): Promise<ProjectionResponse> => {
    const { query, limit } = projectionBody.parse(request.body ?? {});
    const source = await vectorSource();
    let rows: ChunkRow[];
    let vectors: Float32Array[];
    let total: number;

    if (source.stored) {
      total = semantic.index.count(source.provider.modelId);
      const step = Math.max(1, Math.ceil(total / limit));
      const stored = sqlite
        .prepare("SELECT chunk_id AS chunkId, vector FROM embeddings WHERE model_id = ? AND chunk_id % ? = 0 ORDER BY chunk_id LIMIT ?")
        .all(source.provider.modelId, step, limit) as Array<{ chunkId: number; vector: Buffer }>;
      const found = chunkRows(stored.map((row) => row.chunkId));
      rows = [];
      vectors = [];
      for (const item of stored) {
        const row = found.get(item.chunkId);
        if (!row) continue;
        rows.push(row);
        vectors.push(new Float32Array(item.vector.buffer.slice(item.vector.byteOffset, item.vector.byteOffset + item.vector.byteLength)));
      }
    } else {
      total = countChunks();
      const step = Math.max(1, Math.ceil(total / limit));
      rows = (
        sqlite
          .prepare(
            `SELECT ${CHUNK_COLUMNS} FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id WHERE c.text <> '' AND c.id % ? = 0 ORDER BY c.id LIMIT ?`,
          )
          .all(step, limit) as ChunkRow[]
      ).slice(0, limit);
      vectors = await source.provider.embed(
        rows.map((row) => [row.title, row.heading, row.text].filter(Boolean).join("\n")),
        "passage",
      );
    }

    const queryVector = query ? (await source.provider.embed([query], "query"))[0]! : undefined;
    const usable = queryVector ? vectors.every((vector) => vector.length === queryVector.length) : true;
    const all = queryVector && usable ? [...vectors, queryVector] : vectors;
    const { points, explained } = projectTo2d(all);
    const similarities = queryVector && usable ? vectors.map((vector) => dot(queryVector, vector)) : undefined;
    const nearest = new Set(
      similarities
        ? similarities
            .map((similarity, index) => ({ similarity, index }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 8)
            .filter((item) => item.similarity > 0)
            .map((item) => item.index)
        : [],
    );
    const round = (value: number) => Math.round(value * 10000) / 10000;
    const projected: ProjectionPoint[] = rows.map((row, index) => ({
      chunkId: row.chunkId,
      x: round(points[index]![0]),
      y: round(points[index]![1]),
      kind: row.kind,
      title: row.title,
      excerpt: excerpt(row.text, 160),
      similarity: similarities ? round(similarities[index]!) : null,
      nearest: nearest.has(index),
    }));
    const queryPoint = queryVector && usable ? points[points.length - 1]! : undefined;
    return {
      ...source.info,
      dimensions: vectors[0]?.length ?? source.info.dimensions,
      explained: [round(explained[0]), round(explained[1])],
      points: projected,
      query: queryPoint ? { x: round(queryPoint[0]), y: round(queryPoint[1]) } : null,
      shown: projected.length,
      total,
    };
  });
}

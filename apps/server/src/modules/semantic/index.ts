/**
 * Semantic search: optional vectors alongside the keyword index.
 *
 * Turning it on is a setting plus a provider (see providers.ts). Building the index is
 * a background job that embeds every passage that has no vector yet for the current
 * model; it can be stopped and resumed at any point because it only ever looks for
 * what is missing. Vectors can be exported and imported, so a fast machine can build
 * the index for a Raspberry Pi holding the same library.
 */
import { createGunzip, createGzip } from "node:zlib";
import { Readable } from "node:stream";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import type { SearchResult, SearchSource } from "../search/service.ts";
import { type EmbeddingProvider, providerFromSettings } from "./providers.ts";
import { blobToVector, createFlatVectorIndex, type VectorIndex } from "./vector-index.ts";

export interface SemanticStatus {
  enabled: boolean;
  provider: string;
  model: string;
  modelId: string | null;
  /** Whether the provider answered a test request, and why not if it did not. */
  ready: boolean;
  reason: string | null;
  dimensions: number | null;
  totalChunks: number;
  embeddedChunks: number;
  /** Other models that still have vectors stored. */
  otherModels: Array<{ modelId: string; dimensions: number; vectors: number }>;
  indexing: boolean;
}

export interface SemanticService {
  status(): Promise<SemanticStatus>;
  /** Queues an index build for the current model unless one is already waiting or running. */
  requestIndexing(): void;
  index: VectorIndex;
  /** Test seam: replace the provider that settings would select. */
  overrideProvider(provider: EmbeddingProvider | undefined): void;
}

declare module "../../core/context.ts" {
  interface Services {
    semantic: SemanticService;
  }
}

const EXPORT_FORMAT = "outpost-embeddings";

export async function registerSemantic(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { sqlite, jobs } = ctx;
  const { settings, search, auth } = ctx.services;
  const index = createFlatVectorIndex(sqlite);
  const modelsDir = path.join(ctx.config.dataDir, "models");

  let override: EmbeddingProvider | undefined | null = null;
  let cached: { key: string; provider: EmbeddingProvider | undefined } | undefined;
  let health: { modelId: string; at: number; result: Awaited<ReturnType<EmbeddingProvider["check"]>> } | undefined;

  function currentProvider(): EmbeddingProvider | undefined {
    if (override !== null) return override;
    const all = settings.all();
    if (!all["search.semantic.enabled"]) return undefined;
    const key = `${all["search.semantic.provider"]}|${all["search.semantic.model"]}|${all["search.semantic.endpoint"]}`;
    if (cached?.key !== key) cached = { key, provider: providerFromSettings(all, modelsDir) };
    return cached.provider;
  }

  async function checkProvider(provider: EmbeddingProvider, maxAgeMs = 60_000) {
    if (health && health.modelId === provider.modelId && Date.now() - health.at < maxAgeMs) return health.result;
    const result = await provider.check();
    health = { modelId: provider.modelId, at: Date.now(), result };
    if (result.ok) rememberModel(provider, result.dimensions);
    return result;
  }

  function rememberModel(provider: EmbeddingProvider, dimensions: number): void {
    sqlite
      .prepare("INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET dimensions = excluded.dimensions")
      .run(provider.modelId, provider.provider, provider.model, dimensions, Date.now());
  }

  const countChunks = () => (sqlite.prepare("SELECT count(*) AS n FROM chunks WHERE text <> ''").get() as { n: number }).n;
  const isIndexing = () => jobs.list({ states: ["queued", "running"] }).some((job) => job.type === "semantic.index");

  // ── Index build ──
  jobs.register<{ modelId: string }>("semantic.index", {
    queue: "index",
    async run({ payload, signal, progress }) {
      const provider = currentProvider();
      if (!provider || provider.modelId !== payload.modelId) {
        throw new PermanentJobError("The search model changed before this index build started. Start it again from Settings.");
      }
      const check = await checkProvider(provider, 0);
      if (!check.ok) throw new PermanentJobError(check.reason);

      const batchSize = settings.get("search.semantic.batchSize");
      // Passages for this model that have no vector, or whose text changed since.
      const missing = sqlite.prepare(
        `SELECT c.id AS chunkId, c.title AS title, c.heading AS heading, c.text AS text, c.content_hash AS contentHash
         FROM chunks c
         LEFT JOIN embeddings m ON m.chunk_id = c.id AND m.model_id = ?
         WHERE c.text <> '' AND (m.chunk_id IS NULL OR m.content_hash <> c.content_hash)
         ORDER BY c.id LIMIT ?`,
      );
      const total = (
        sqlite
          .prepare(
            `SELECT count(*) AS n FROM chunks c LEFT JOIN embeddings m ON m.chunk_id = c.id AND m.model_id = ?
             WHERE c.text <> '' AND (m.chunk_id IS NULL OR m.content_hash <> c.content_hash)`,
          )
          .get(provider.modelId) as { n: number }
      ).n;
      let done = 0;
      progress({ current: 0, total, message: "Reading passages" });
      for (;;) {
        signal.throwIfAborted();
        const rows = missing.all(provider.modelId, batchSize) as Array<{ chunkId: number; title: string; heading: string; text: string; contentHash: string }>;
        if (rows.length === 0) break;
        // A passage is embedded with its title and heading: short passages mean little without them.
        const inputs = rows.map((row) => [row.title, row.heading, row.text].filter(Boolean).join("\n"));
        const vectors = await provider.embed(inputs, "passage", signal);
        index.upsert(
          provider.modelId,
          rows.map((row, position) => ({ chunkId: row.chunkId, contentHash: row.contentHash, vector: vectors[position]! })),
        );
        done += rows.length;
        progress({ current: done, total: Math.max(total, done), message: `${done} of ${Math.max(total, done)} passages` });
        // Give requests a turn between batches.
        await new Promise((resolve) => setImmediate(resolve));
      }
      ctx.events.publish({ type: "semantic.changed" });
      return { embedded: done, modelId: provider.modelId };
    },
  });

  function requestIndexing(): void {
    const provider = currentProvider();
    if (!provider || isIndexing()) return;
    jobs.enqueue("semantic.index", { modelId: provider.modelId }, { title: "Build semantic search index", subject: `semantic:${provider.modelId}`, maxAttempts: 3 });
  }

  // New or changed passages get vectors without anyone asking, a little after the
  // burst of indexing that produced them has settled.
  let debounce: NodeJS.Timeout | undefined;
  search.onChunksChanged(() => {
    if (!currentProvider()) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(requestIndexing, 5_000);
    debounce.unref();
  });
  ctx.onClose.push(() => debounce && clearTimeout(debounce));

  // ── Search source ──
  const source: SearchSource = {
    id: "semantic",
    layer: "semantic",
    isAvailable: () => {
      const provider = currentProvider();
      return Boolean(provider && index.count(provider.modelId) > 0);
    },
    weight: () => settings.get("search.hybrid.semanticWeight"),
    async search({ q, kinds, limit, signal }) {
      const provider = currentProvider();
      if (!provider) return [];
      const [vector] = await provider.embed([q], "query", signal);
      // Several passages can belong to one entity; fetch extra so `limit` entities survive grouping.
      const hits = index.query(provider.modelId, vector!, limit * 4, kinds);
      const records = new Map(search.getChunks(hits.map((hit) => hit.chunkId)).map((record) => [record.chunkId, record]));
      const byEntity = new Map<string, SearchResult>();
      for (const hit of hits) {
        const record = records.get(hit.chunkId);
        if (!record) continue;
        const key = `${record.kind}:${record.entityId}`;
        let result = byEntity.get(key);
        if (!result) {
          if (byEntity.size >= limit) continue;
          result = {
            kind: record.kind,
            entityId: record.entityId,
            title: record.title,
            titleSegments: [{ text: record.title, hit: false }],
            subtitle: null,
            collection: record.collection,
            url: record.page === null ? record.url : `${record.url}${record.url.includes("?") ? "&" : "?"}page=${record.page}`,
            tags: [],
            score: Math.max(0, hit.score),
            passages: [],
            sources: ["semantic"],
          };
          byEntity.set(key, result);
        }
        if (result.passages.length < 2) {
          const excerpt = record.text.length > 320 ? `${record.text.slice(0, 320).trimEnd()}…` : record.text;
          result.passages.push({ chunkId: record.chunkId, segments: [{ text: excerpt, hit: false }], page: record.page, heading: record.heading || null });
        }
      }
      return [...byEntity.values()];
    },
  };
  search.addSource(source);

  async function status(): Promise<SemanticStatus> {
    const all = settings.all();
    const provider = currentProvider();
    const check = provider ? await checkProvider(provider) : undefined;
    const models = sqlite
      .prepare(
        `SELECT em.id AS modelId, em.dimensions AS dimensions, count(m.chunk_id) AS vectors
         FROM embedding_models em LEFT JOIN embeddings m ON m.model_id = em.id GROUP BY em.id`,
      )
      .all() as Array<{ modelId: string; dimensions: number; vectors: number }>;
    return {
      enabled: all["search.semantic.enabled"],
      provider: all["search.semantic.provider"],
      model: all["search.semantic.model"],
      modelId: provider?.modelId ?? null,
      ready: Boolean(check?.ok),
      reason: !all["search.semantic.enabled"]
        ? "Semantic search is turned off."
        : !provider
          ? "Choose how passages are turned into vectors: a local model or a local embedding server."
          : check && !check.ok
            ? check.reason
            : null,
      dimensions: check?.ok ? check.dimensions : null,
      totalChunks: countChunks(),
      embeddedChunks: provider ? index.count(provider.modelId) : 0,
      otherModels: models.filter((model) => model.modelId !== provider?.modelId && model.vectors > 0),
      indexing: isIndexing(),
    };
  }

  ctx.services.semantic = {
    status,
    requestIndexing,
    index,
    overrideProvider(provider) {
      override = provider === undefined ? undefined : provider;
      health = undefined;
    },
  };

  // The health check result depends on settings; forget it when they change.
  settings.onChange(() => {
    health = undefined;
  });

  // ── Routes ──
  app.get("/api/semantic/status", async () => status());

  app.post("/api/semantic/index", async (request) => {
    auth.requireAdmin(request);
    const provider = currentProvider();
    if (!provider) throw new AppError("conflict", "Turn semantic search on and choose a model first.");
    const check = await checkProvider(provider, 0);
    if (!check.ok) throw new AppError("conflict", check.reason);
    requestIndexing();
    return status();
  });

  app.delete<{ Params: { modelId: string } }>("/api/semantic/models/:modelId", async (request) => {
    auth.requireAdmin(request);
    const removed = index.removeModel(request.params.modelId);
    ctx.events.publish({ type: "semantic.changed" });
    return { removed };
  });

  /**
   * Export: gzip-compressed JSON lines. The first line describes the file; every other
   * line is one vector keyed by the hash of the passage text it was made from. Because
   * the key is the text, the file fits any Outpost that holds the same passages,
   * whatever ids its database gave them.
   */
  app.get<{ Querystring: { model?: string } }>("/api/semantic/export", async (request, reply) => {
    auth.requireAdmin(request);
    const modelId = request.query.model ?? currentProvider()?.modelId;
    if (!modelId) throw badRequest("Say which model to export with ?model=.");
    const model = sqlite.prepare("SELECT id, provider, model, dimensions FROM embedding_models WHERE id = ?").get(modelId) as
      | { id: string; provider: string; model: string; dimensions: number }
      | undefined;
    if (!model) throw new AppError("not_found", "There are no vectors for that model.");
    const rows = sqlite
      .prepare("SELECT content_hash AS h, vector AS v FROM embeddings WHERE model_id = ? GROUP BY content_hash")
      .iterate(modelId) as IterableIterator<{ h: string; v: Buffer }>;
    function* lines() {
      yield `${JSON.stringify({ format: EXPORT_FORMAT, version: 1, modelId: model!.id, provider: model!.provider, model: model!.model, dimensions: model!.dimensions, exportedAt: new Date().toISOString() })}\n`;
      for (const row of rows) yield `${JSON.stringify({ h: row.h, v: row.v.toString("base64") })}\n`;
    }
    const safeName = model.id.replace(/[^a-z0-9._-]+/gi, "_");
    reply.header("Content-Type", "application/gzip").header("Content-Disposition", `attachment; filename="outpost-embeddings-${safeName}.jsonl.gz"`);
    return reply.send(Readable.from(lines()).pipe(createGzip()));
  });

  // Import accepts the exported file as the raw request body.
  app.addContentTypeParser(["application/gzip", "application/x-gzip", "application/octet-stream"], (_request, payload, done) => done(null, payload));
  app.post("/api/semantic/import", { bodyLimit: 8 * 1024 * 1024 * 1024 }, async (request) => {
    auth.requireAdmin(request);
    const body = request.body as Readable | undefined;
    if (!body || typeof body.pipe !== "function") throw badRequest("Send the exported .jsonl.gz file as the request body.");
    const gunzip = createGunzip();
    body.on("error", (error) => gunzip.destroy(error));
    body.pipe(gunzip);
    // Lines can be split across chunks, and a multi-byte character across two chunks.
    async function* readLines(): AsyncGenerator<string> {
      const decoder = new TextDecoder();
      let rest = "";
      for await (const chunk of gunzip) {
        rest += decoder.decode(chunk as Buffer, { stream: true });
        let newline = rest.indexOf("\n");
        while (newline !== -1) {
          yield rest.slice(0, newline);
          rest = rest.slice(newline + 1);
          newline = rest.indexOf("\n");
        }
      }
      rest += decoder.decode();
      if (rest) yield rest;
    }

    const findChunks = sqlite.prepare(
      "SELECT c.id AS chunkId FROM chunks c LEFT JOIN embeddings m ON m.chunk_id = c.id AND m.model_id = ? WHERE c.content_hash = ? AND m.chunk_id IS NULL",
    );
    let header: { modelId: string; provider: string; model: string; dimensions: number } | undefined;
    let vectors = 0;
    let applied = 0;
    let unmatched = 0;
    let batch: Array<{ chunkId: number; contentHash: string; vector: Float32Array }> = [];
    const flush = () => {
      if (batch.length && header) index.upsert(header.modelId, batch);
      batch = [];
    };
    try {
      for await (const line of readLines()) {
        if (!line.trim()) continue;
        const record = JSON.parse(line) as Record<string, unknown>;
        if (!header) {
          if (record.format !== EXPORT_FORMAT || record.version !== 1 || typeof record.modelId !== "string" || typeof record.dimensions !== "number") {
            throw badRequest("That file is not an Outpost embeddings export.");
          }
          header = { modelId: record.modelId, provider: String(record.provider), model: String(record.model), dimensions: record.dimensions };
          sqlite
            .prepare("INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING")
            .run(header.modelId, header.provider, header.model, header.dimensions, Date.now());
          continue;
        }
        if (typeof record.h !== "string" || typeof record.v !== "string") continue;
        const vector = blobToVector(Buffer.from(record.v, "base64"));
        if (vector.length !== header.dimensions) throw badRequest("The file contains a vector of the wrong size for its model.");
        vectors += 1;
        const targets = findChunks.all(header.modelId, record.h) as Array<{ chunkId: number }>;
        if (targets.length === 0) unmatched += 1;
        for (const target of targets) {
          batch.push({ chunkId: target.chunkId, contentHash: record.h, vector });
          applied += 1;
        }
        if (batch.length >= 500) flush();
      }
      flush();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw badRequest(`The file could not be read: ${error instanceof Error ? error.message : error}`);
    }
    if (!header) throw badRequest("That file is empty.");
    ctx.events.publish({ type: "semantic.changed" });
    return { modelId: header.modelId, vectorsInFile: vectors, passagesUpdated: applied, vectorsWithoutPassage: unmatched };
  });

  app.post("/api/semantic/test", async (request) => {
    auth.requireAdmin(request);
    const body = z.object({ text: z.string().min(1).max(2000) }).parse(request.body);
    const provider = currentProvider();
    if (!provider) throw new AppError("conflict", "Turn semantic search on and choose a model first.");
    const started = performance.now();
    const [vector] = await provider.embed([body.text], "query");
    return { modelId: provider.modelId, dimensions: vector!.length, tookMs: Math.round(performance.now() - started) };
  });

}

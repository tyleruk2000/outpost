/**
 * Semantic search: optional vectors alongside the keyword index.
 *
 * Turning it on is one setting. The model that ships with Outpost is used unless a
 * person chose another provider (see providers.ts), and the index is built without
 * being asked for: switching on starts the build, and new passages are added to it as
 * they arrive. Building is a background job that embeds every passage that has no
 * vector yet for the current model; it can be stopped and resumed at any point because
 * it only ever looks for what is missing. Switching off pauses a build and keeps what
 * was built. Vectors can be exported and imported, so a fast machine can build the
 * index for a Raspberry Pi holding the same library.
 */

import { pipeline, Readable } from "node:stream";
import { createGunzip, createGzip } from "node:zlib";
import { secondsLeft } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { type JobDto, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import type { SearchResult, SearchSource } from "../search/service.ts";
import { type BuiltInEmbedder, type BuiltInOptions, createBuiltInEmbedder } from "./built-in.ts";
import { BUILT_IN_MODEL } from "./built-in-model.ts";
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
  /** The latest index build for the current model, in whatever state it is. */
  build: JobDto | null;
  /** Seconds the running build still needs at the speed it is going. Null when none is running or it is too early to say. */
  secondsLeft: number | null;
  /** Passages already embedded for the model that switching on would use, counted whether it is on or not. */
  keptChunks: number;
  /** The model that ships with Outpost, whether or not it is the one in use. */
  builtIn: {
    installed: boolean;
    reason: string | null;
    name: string;
    licence: string;
    madeBy: string;
    languages: string;
    dimensions: number;
    bytes: number;
    threads: number;
  };
}

export interface SemanticService {
  status(fresh?: boolean): Promise<SemanticStatus>;
  /**
   * Starts or continues the index build for the current model, unless one is already
   * waiting or running. Pass false when nobody asked: then nothing happens while search
   * by meaning is switched off and has never been built, or after a person paused or
   * stopped a build.
   */
  requestIndexing(byPerson?: boolean): void;
  /** Resolves when a build that switching on (or changing the model) set going has been started or given up on. For tests. */
  settled(): Promise<void>;
  index: VectorIndex;
  /** The provider semantic search is using now, if one is configured. */
  provider(): EmbeddingProvider | undefined;
  /** Test seam: replace the provider that settings would select. */
  overrideProvider(provider: EmbeddingProvider | undefined): void;
  /** Test seam: make the built-in provider afresh, for example looking for its model somewhere else. */
  replaceBuiltIn(options: BuiltInOptions): Promise<void>;
}

declare module "../../core/context.ts" {
  interface Services {
    semantic: SemanticService;
  }
}

const EXPORT_FORMAT = "outpost-embeddings";
const PASSAGES_FORMAT = "outpost-passages";

/** What the model reads for a passage: its title and heading with it, since short passages mean little without them. */
export function passageInput(passage: { title: string; heading: string; text: string }): string {
  return [passage.title, passage.heading, passage.text].filter(Boolean).join("\n");
}
/** The longest line an import may have: a vector of 8192 dimensions, in base64 and JSON, is about 44 000 characters. */
const MAX_IMPORT_LINE_CHARS = 1024 * 1024;

export async function registerSemantic(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { sqlite, jobs } = ctx;
  const { settings, search } = ctx.services;
  const index = createFlatVectorIndex(sqlite);
  // One built-in embedder for the server: it owns the worker thread the model runs in.
  let builtIn: BuiltInEmbedder = createBuiltInEmbedder();
  ctx.onClose.push(() => builtIn.close());

  let override: EmbeddingProvider | undefined | null = null;
  let cached: { key: string; provider: EmbeddingProvider | undefined } | undefined;
  let health: { modelId: string; at: number; result: Awaited<ReturnType<EmbeddingProvider["check"]>> } | undefined;

  /** What the settings choose between: a change to any of these is a change of model, or of whether one is used. */
  const choiceOf = (all: ReturnType<typeof settings.all>) =>
    `${all["search.semantic.provider"]}|${all["search.semantic.model"]}|${all["search.semantic.endpoint"]}`;

  /** The provider the settings name, whether or not search by meaning is switched on. */
  function chosenProvider(): EmbeddingProvider | undefined {
    const all = settings.all();
    const key = choiceOf(all);
    if (cached?.key !== key)
      cached = { key, provider: providerFromSettings(all, builtIn, { allowRemote: ctx.config.allowRemoteModelServer }) };
    return cached.provider;
  }

  function currentProvider(): EmbeddingProvider | undefined {
    if (override !== null) return override;
    if (!settings.get("search.semantic.enabled")) return undefined;
    return chosenProvider();
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
      .prepare(
        "INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET dimensions = excluded.dimensions",
      )
      .run(provider.modelId, provider.provider, provider.model, dimensions, Date.now());
  }

  const countChunks = () => (sqlite.prepare("SELECT count(*) AS n FROM chunks WHERE text <> ''").get() as { n: number }).n;
  const buildsUnderWay = () => jobs.list({ states: ["queued", "running"], types: ["semantic.index"] });
  const isIndexing = () => buildsUnderWay().length > 0;
  /** Where the running build stood when it last started, to judge its speed by. */
  let pace: { modelId: string; first: { at: number; done: number }; done: number; total: number } | undefined;

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
      progress({ current: 0, total, message: "Reading passages", unit: "passages" });
      pace = { modelId: provider.modelId, first: { at: Date.now(), done: 0 }, done: 0, total };
      for (;;) {
        signal.throwIfAborted();
        const rows = missing.all(provider.modelId, batchSize) as Array<{
          chunkId: number;
          title: string;
          heading: string;
          text: string;
          contentHash: string;
        }>;
        if (rows.length === 0) break;
        const inputs = rows.map(passageInput);
        const vectors = await provider.embed(inputs, "passage", signal);
        index.upsert(
          provider.modelId,
          rows.map((row, position) => ({ chunkId: row.chunkId, contentHash: row.contentHash, vector: vectors[position]! })),
        );
        done += rows.length;
        pace.done = done;
        pace.total = Math.max(total, done);
        progress({ current: done, total: Math.max(total, done), message: `${done} of ${Math.max(total, done)} passages` });
        // Give requests a turn between batches.
        await new Promise((resolve) => setImmediate(resolve));
      }
      ctx.events.publish({ type: "semantic.changed" });
      return { embedded: done, modelId: provider.modelId };
    },
  });

  /**
   * Starts or continues the build for the current model. `byPerson` is false when the
   * library changed and Outpost is keeping the index up to date by itself. Switching
   * search by meaning on is what asks for that, so it happens whenever the switch is on
   * (or an index exists already), except that it never undoes a person's pausing or
   * stopping a build, and does not start one for a model that has just said it cannot run.
   */
  function requestIndexing(byPerson = true): void {
    const provider = currentProvider();
    if (!provider || isIndexing()) return;
    // Nothing can be written while space is being reclaimed: asked by itself, it asks again later.
    if (!byPerson && ctx.services.database?.busy()) {
      laterIndexing();
      return;
    }
    const subject = `semantic:${provider.modelId}`;
    const last = jobs.findBySubject(subject).at(-1);
    if (!byPerson) {
      const asked = settings.get("search.semantic.enabled") || last !== undefined || index.has(provider.modelId);
      if (!asked || last?.state === "paused" || last?.state === "cancelled") return;
      if (health && health.modelId === provider.modelId && !health.result.ok && Date.now() - health.at < 60_000) return;
    }
    if (last?.state === "paused") {
      jobs.resume(last.id);
      return;
    }
    jobs.enqueue("semantic.index", { modelId: provider.modelId }, { title: "Build semantic search index", subject, maxAttempts: 3 });
  }

  /**
   * What switching on, or choosing another model while on, sets going: the model is
   * asked whether it can run, and if it can the index is built without anyone pressing
   * anything more. A model that cannot run starts nothing; the status says why.
   */
  let starting: Promise<void> = Promise.resolve();
  function startByItself(): void {
    starting = starting
      .then(async () => {
        const provider = currentProvider();
        if (!provider) return;
        const check = await checkProvider(provider, 0);
        // The settings may have changed again while the model was being asked.
        if (check.ok && currentProvider() === provider) requestIndexing(true);
      })
      .catch((error) => ctx.log.warn({ err: error }, "search by meaning could not start its index build"))
      .finally(() => ctx.events.publish({ type: "semantic.changed" }));
  }

  /** Pauses a build that is for a model no longer in use, or for any model once search by meaning is off. What it built is kept. */
  function pauseBuildsNotWanted(): void {
    const wanted = currentProvider()?.modelId;
    for (const job of buildsUnderWay()) {
      if (job.subject !== `semantic:${wanted}`) jobs.pause(job.id);
    }
  }

  // New or changed passages get vectors without anyone asking, a little after the
  // burst of indexing that produced them has settled.
  let debounce: NodeJS.Timeout | undefined;
  function laterIndexing(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        requestIndexing(false);
      } catch (error) {
        ctx.log.warn({ err: error }, "the semantic index could not be brought up to date");
      }
    }, 5_000);
    debounce.unref();
  }
  search.onChunksChanged(() => {
    if (!currentProvider()) return;
    laterIndexing();
  });
  // Passages given new numbers carry their vectors with them; the matrix in memory still has the old numbers.
  search.onChunksRenumbered(() => index.forget());
  ctx.onClose.push(() => debounce && clearTimeout(debounce));

  // ── Search source ──
  // A question's vector, kept for the next time it is asked: the quick search and the search
  // screen ask the same words one after the other, and the model takes tens of milliseconds a time.
  const queryVectors = new Map<string, Float32Array>();
  async function queryVector(provider: { modelId: string; embed: EmbeddingProvider["embed"] }, q: string, signal?: AbortSignal) {
    const key = `${provider.modelId}\n${q}`;
    const kept = queryVectors.get(key);
    if (kept) {
      queryVectors.delete(key);
      queryVectors.set(key, kept);
      return kept;
    }
    const [vector] = await provider.embed([q], "query", signal);
    queryVectors.set(key, vector!);
    if (queryVectors.size > 200) queryVectors.delete(queryVectors.keys().next().value!);
    return vector!;
  }

  const source: SearchSource = {
    id: "semantic",
    layer: "semantic",
    isAvailable: () => {
      const provider = currentProvider();
      return Boolean(provider && index.has(provider.modelId));
    },
    weight: () => settings.get("search.hybrid.semanticWeight"),
    async searchPassages({ q, kinds, limit, within, signal }) {
      const provider = currentProvider();
      if (!provider) return [];
      const vector = await queryVector(provider, q, signal);
      return index.query(provider.modelId, vector, limit, kinds, within).map((hit) => ({ chunkId: hit.chunkId, similarity: hit.score }));
    },
    async search({ q, kinds, limit, signal }) {
      const provider = currentProvider();
      if (!provider) return [];
      const vector = await queryVector(provider, q, signal);
      // Several passages can belong to one entity; fetch extra so `limit` entities survive grouping.
      const hits = index.query(provider.modelId, vector, limit * 4, kinds);
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
          result.passages.push({
            chunkId: record.chunkId,
            segments: [{ text: excerpt, hit: false }],
            page: record.page,
            heading: record.heading || null,
          });
        }
      }
      return [...byEntity.values()];
    },
  };
  search.addSource(source);

  /** `fresh` asks the provider again now, instead of trusting an answer from the last minute. */
  async function status(fresh = false): Promise<SemanticStatus> {
    const all = settings.all();
    const provider = currentProvider();
    const check = provider ? await checkProvider(provider, fresh ? 0 : undefined) : undefined;
    const indexing = isIndexing();
    const chosen = provider ?? chosenProvider();
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
          ? all["search.semantic.provider"] === "openai-compatible"
            ? "Give the name of the model your embedding server offers."
            : "Choose where the model runs: built in, or a local embedding server."
          : check && !check.ok
            ? check.reason
            : null,
      dimensions: check?.ok ? check.dimensions : null,
      totalChunks: countChunks(),
      embeddedChunks: provider ? index.count(provider.modelId) : 0,
      otherModels: models.filter((model) => model.modelId !== provider?.modelId && model.vectors > 0),
      indexing,
      build: provider ? latestBuild(provider.modelId) : null,
      secondsLeft:
        indexing && provider && pace?.modelId === provider.modelId
          ? secondsLeft(pace.first, { at: Date.now(), done: pace.done }, pace.total)
          : null,
      keptChunks: chosen ? index.count(chosen.modelId) : 0,
      builtIn: describeBuiltIn(),
    };
  }

  /** The newest index build for a model. Builds are found by their subject, which names the model. */
  function latestBuild(modelId: string): JobDto | null {
    const build = jobs.findBySubject(`semantic:${modelId}`).at(-1);
    return build ? toJobDto(build) : null;
  }

  function describeBuiltIn(): SemanticStatus["builtIn"] {
    const found = builtIn.installation();
    return {
      installed: found.installed,
      reason: found.installed ? null : found.reason,
      name: BUILT_IN_MODEL.name,
      licence: BUILT_IN_MODEL.licence,
      madeBy: BUILT_IN_MODEL.madeBy,
      languages: BUILT_IN_MODEL.languages,
      dimensions: BUILT_IN_MODEL.dimensions,
      bytes: Object.values(BUILT_IN_MODEL.files).reduce((sum, file) => sum + file.bytes, 0),
      threads: builtIn.threads,
    };
  }

  ctx.services.semantic = {
    status,
    requestIndexing,
    index,
    provider: currentProvider,
    settled: () => starting,
    overrideProvider(provider) {
      override = provider === undefined ? undefined : provider;
      health = undefined;
    },
    async replaceBuiltIn(options) {
      await builtIn.close();
      builtIn = createBuiltInEmbedder(options);
      cached = undefined;
      health = undefined;
    },
  };

  // The health check result depends on settings; forget it when they change. And a
  // change that switches search by meaning on, or names another model while it is on,
  // is a person asking for an index: the build starts without a second press. Other
  // settings changing (they all arrive here) start nothing.
  const stateOf = (all: ReturnType<typeof settings.all>) => (all["search.semantic.enabled"] ? choiceOf(all) : null);
  let before = stateOf(settings.all());
  settings.onChange((all) => {
    health = undefined;
    const now = stateOf(all);
    if (now === before) return;
    before = now;
    pauseBuildsNotWanted();
    if (now !== null) startByItself();
    else ctx.events.publish({ type: "semantic.changed" });
  });

  // ── Routes ──
  app.get("/api/semantic/status", async (request) => {
    const query = z.object({ fresh: z.enum(["1"]).optional() }).parse(request.query);
    return status(query.fresh === "1");
  });

  app.post("/api/semantic/index", async () => {
    const provider = currentProvider();
    if (!provider) throw new AppError("conflict", "Turn semantic search on and choose a model first.");
    const check = await checkProvider(provider, 0);
    if (!check.ok) throw new AppError("conflict", check.reason);
    requestIndexing();
    return status();
  });

  /**
   * The repair for a set-up that cannot work, in one request: search by meaning is
   * switched on with the model that ships with Outpost, whatever it was pointed at
   * before, and its index starts building. The address and model name of a server of
   * the person's own stay in the settings, so choosing it again loses nothing.
   */
  app.post("/api/semantic/use-built-in", async () => {
    const found = builtIn.installation();
    if (!found.installed) throw new AppError("conflict", found.reason);
    const all = settings.all();
    if (all["search.semantic.enabled"] && all["search.semantic.provider"] === "built-in") {
      // Already so: carry on with the build if one is wanted.
      const provider = currentProvider();
      const check = provider ? await checkProvider(provider, 0) : undefined;
      if (check?.ok) requestIndexing();
    } else {
      settings.update({ "search.semantic.provider": "built-in", "search.semantic.enabled": true });
      await starting;
    }
    return status();
  });

  app.delete<{ Params: { modelId: string } }>("/api/semantic/models/:modelId", async (request) => {
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
  app.get("/api/semantic/export", async (request, reply) => {
    const modelId = z.object({ model: z.string().max(300).optional() }).parse(request.query).model ?? currentProvider()?.modelId;
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
    reply
      .header("Content-Type", "application/gzip")
      .header("Content-Disposition", `attachment; filename="outpost-embeddings-${safeName}.jsonl.gz"`);
    // pipeline(), not pipe(): an error reading the index destroys the reply instead of
    // being emitted with no listener, which would end the process.
    return reply.send(pipeline(Readable.from(lines()), createGzip(), () => undefined));
  });

  /**
   * The passages that have no vector yet for a model, as the model would read them, for a
   * faster computer to embed (scripts/build-vectors.mjs) and send back as an embeddings
   * export. Gzip-compressed JSON lines: a line describing the file, then one per passage
   * text, keyed by its hash as the export is. `?all=1` gives every passage.
   */
  app.get("/api/semantic/passages", async (request, reply) => {
    const query = z.object({ model: z.string().max(300).optional(), all: z.enum(["1"]).optional() }).parse(request.query);
    const modelId = query.model ?? currentProvider()?.modelId ?? chosenProvider()?.modelId;
    if (!modelId) throw badRequest("Say which model the vectors are for with ?model=.");
    const rows = sqlite
      .prepare(
        `SELECT c.content_hash AS h, c.title AS title, c.heading AS heading, c.text AS text
         FROM chunks c LEFT JOIN embeddings m ON m.chunk_id = c.id AND m.model_id = ?
         WHERE c.text <> '' AND (? OR m.chunk_id IS NULL OR m.content_hash <> c.content_hash)
         GROUP BY c.content_hash`,
      )
      .iterate(modelId, query.all ? 1 : 0) as IterableIterator<{ h: string; title: string; heading: string; text: string }>;
    const total = (
      sqlite
        .prepare(
          `SELECT count(DISTINCT c.content_hash) AS n FROM chunks c LEFT JOIN embeddings m ON m.chunk_id = c.id AND m.model_id = ?
           WHERE c.text <> '' AND (? OR m.chunk_id IS NULL OR m.content_hash <> c.content_hash)`,
        )
        .get(modelId, query.all ? 1 : 0) as { n: number }
    ).n;
    function* lines() {
      yield `${JSON.stringify({ format: PASSAGES_FORMAT, version: 1, modelId, passages: total, exportedAt: new Date().toISOString() })}\n`;
      for (const row of rows) yield `${JSON.stringify({ h: row.h, t: passageInput(row) })}\n`;
    }
    reply.header("Content-Type", "application/gzip").header("Content-Disposition", 'attachment; filename="outpost-passages.jsonl.gz"');
    return reply.send(pipeline(Readable.from(lines()), createGzip(), () => undefined));
  });

  const typeBeforeBody = async (request: import("fastify").FastifyRequest) => {
    // Checked before the body is read: a large upload is only accepted as one of the streamed types.
    if (!/^application\/(gzip|x-gzip|octet-stream)\b/i.test(request.headers["content-type"] ?? "")) {
      throw new AppError("unsupported", "Send the exported .jsonl.gz file with Content-Type application/gzip.");
    }
  };
  // In a context of its own, so that the raw-file body types are taken by this route and no other.
  await app.register(async (scoped) => {
    // Import accepts the exported file as the raw request body.
    scoped.addContentTypeParser(["application/gzip", "application/x-gzip", "application/octet-stream"], (_request, payload, done) =>
      done(null, payload),
    );
    scoped.post("/api/semantic/import", { bodyLimit: 8 * 1024 * 1024 * 1024, onRequest: typeBeforeBody }, importVectors);
  });
  async function importVectors(request: import("fastify").FastifyRequest) {
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
        // A real line is one vector, tens of kilobytes. Without a limit a small gzip file
        // that unpacks to one endless line would be held in memory and searched again
        // on every chunk.
        if (rest.length > MAX_IMPORT_LINE_CHARS) {
          throw badRequest("The file has a line far longer than any in an embeddings export, so it was not read.");
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
          if (
            record.format !== EXPORT_FORMAT ||
            record.version !== 1 ||
            typeof record.modelId !== "string" ||
            typeof record.dimensions !== "number"
          ) {
            throw badRequest("That file is not an Outpost embeddings export.");
          }
          header = {
            modelId: record.modelId,
            provider: String(record.provider),
            model: String(record.model),
            dimensions: record.dimensions,
          };
          // Vectors of another size for a model already held would be compared with the ones there, and match nothing.
          const held = sqlite.prepare("SELECT dimensions FROM embedding_models WHERE id = ?").pluck().get(header.modelId) as
            | number
            | undefined;
          if (held !== undefined && held !== header.dimensions) {
            throw badRequest(
              `The file's vectors for “${header.modelId}” have ${header.dimensions} numbers each, but this Outpost already holds vectors of ${held} numbers for that model. Nothing was imported. Remove that model's vectors in Settings first, then import again.`,
            );
          }
          sqlite
            .prepare(
              "INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
            )
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
  }

  app.post("/api/semantic/test", async (request) => {
    const body = z.object({ text: z.string().min(1).max(2000) }).parse(request.body);
    const provider = currentProvider();
    if (!provider) throw new AppError("conflict", "Turn semantic search on and choose a model first.");
    const started = performance.now();
    const [vector] = await provider.embed([body.text], "query");
    return { modelId: provider.modelId, dimensions: vector!.length, tookMs: Math.round(performance.now() - started) };
  });
}

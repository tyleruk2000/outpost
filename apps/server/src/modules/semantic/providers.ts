/**
 * Embedding providers turn text into vectors. Outpost never requires one: keyword
 * search works without any of this. When a provider is configured, semantic and hybrid
 * search become available.
 *
 * A provider is identified by a model id such as "transformers:Xenova/all-MiniLM-L6-v2".
 * Vectors are stored per model id, so switching models never mixes incompatible
 * vectors, and an index can be rebuilt for a new model while the old one still serves.
 */
import path from "node:path";
import { AppError } from "../../core/errors.ts";
import type { Settings } from "../settings/service.ts";

export interface EmbeddingProvider {
  /** Stable id of provider + model; the key vectors are stored under. */
  readonly modelId: string;
  readonly provider: string;
  readonly model: string;
  /**
   * Embeds a batch. `kind` lets models that distinguish queries from passages do so.
   * Returned vectors are L2-normalised, so a dot product is the cosine similarity.
   */
  embed(texts: string[], kind: "passage" | "query", signal?: AbortSignal): Promise<Float32Array[]>;
  /** Cheap check that the provider can run, with a reason a person can act on if not. */
  check(): Promise<{ ok: true; dimensions: number } | { ok: false; reason: string }>;
}

export function normalise(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum);
  if (length > 0) for (let index = 0; index < vector.length; index += 1) vector[index] = vector[index]! / length;
  return vector;
}

/**
 * Any server that speaks the OpenAI embeddings API: Ollama, llama.cpp's server,
 * LocalAI, text-embeddings-inference. The address is whatever the administrator set,
 * normally on this machine or the local network; nothing is sent anywhere else.
 */
export function openAiCompatibleProvider(endpoint: string, model: string): EmbeddingProvider {
  const base = endpoint.replace(/\/+$/, "");
  async function call(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    let response: Response;
    try {
      response = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
        signal: signal ?? AbortSignal.timeout(120_000),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AppError("upstream", `The embedding server at ${base} is not reachable. Check that it is running.`);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new AppError("upstream", `The embedding server answered ${response.status}. ${detail}`);
    }
    const body = (await response.json()) as { data?: Array<{ index?: number; embedding: number[] }> };
    if (!Array.isArray(body.data) || body.data.length !== texts.length) {
      throw new AppError("upstream", "The embedding server returned an unexpected response.");
    }
    return [...body.data]
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => normalise(Float32Array.from(item.embedding)));
  }
  return {
    modelId: `openai-compatible:${model}`,
    provider: "openai-compatible",
    model,
    embed: (texts, _kind, signal) => call(texts, signal),
    async check() {
      try {
        const [vector] = await call(["outpost"]);
        return { ok: true, dimensions: vector!.length };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * A model run inside the Outpost process with ONNX Runtime, through the optional
 * `@huggingface/transformers` package. Model files are read only from the models
 * folder in the data directory; the library is told never to fetch anything.
 */
export function transformersProvider(modelsDir: string, model: string): EmbeddingProvider {
  type Extractor = (texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ dims: number[]; data: Float32Array }>;
  let extractor: Promise<Extractor> | undefined;

  async function load(): Promise<Extractor> {
    // The package is optional and may be absent, so it is neither a typed nor a static import.
    let library: {
      env: { allowRemoteModels: boolean; allowLocalModels: boolean; localModelPath: string };
      pipeline(task: string, model: string, options: Record<string, unknown>): Promise<unknown>;
    };
    try {
      const packageName = "@huggingface/transformers";
      library = await import(packageName);
    } catch {
      throw new AppError(
        "unsupported",
        "Running a model inside Outpost needs the optional @huggingface/transformers package, which is not part of this installation. Use a local embedding server instead, or install the package (see docs/search.md).",
      );
    }
    library.env.allowRemoteModels = false;
    library.env.allowLocalModels = true;
    library.env.localModelPath = modelsDir.endsWith(path.sep) ? modelsDir : `${modelsDir}${path.sep}`;
    try {
      return (await library.pipeline("feature-extraction", model, { dtype: "q8" })) as unknown as Extractor;
    } catch (error) {
      throw new AppError(
        "not_found",
        `The model "${model}" is not in the models folder (${modelsDir}). Download it from Settings, or copy its files there. (${error instanceof Error ? error.message : error})`,
      );
    }
  }

  async function run(texts: string[]): Promise<Float32Array[]> {
    extractor ??= load();
    let instance: Extractor;
    try {
      instance = await extractor;
    } catch (error) {
      extractor = undefined;
      throw error;
    }
    const output = await instance(texts, { pooling: "mean", normalize: true });
    const dimensions = output.dims.at(-1)!;
    return texts.map((_, index) => output.data.slice(index * dimensions, (index + 1) * dimensions));
  }

  return {
    modelId: `transformers:${model}`,
    provider: "transformers",
    model,
    embed: (texts) => run(texts),
    async check() {
      try {
        const [vector] = await run(["outpost"]);
        return { ok: true, dimensions: vector!.length };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function providerFromSettings(settings: Settings, modelsDir: string): EmbeddingProvider | undefined {
  const model = settings["search.semantic.model"].trim();
  if (!model) return undefined;
  switch (settings["search.semantic.provider"]) {
    case "transformers":
      return transformersProvider(modelsDir, model);
    case "openai-compatible":
      return openAiCompatibleProvider(settings["search.semantic.endpoint"], model);
    default:
      return undefined;
  }
}

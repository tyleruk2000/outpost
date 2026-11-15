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
        `The model "${model}" is not in the models folder (${modelsDir}). Copy the model's files there (see docs/search.md). (${error instanceof Error ? error.message : error})`,
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

const stopwords = new Set(
  "a an and are as at be but by for from has have he her his i if in into is it its of on or she that the their them they this to was were which will with you your not no do does did so than then there these those what when where who how why can could should would may might must about over under up down out off again more most some any each other such only own same too very just also".split(
    " ",
  ),
);

/** A very small stemmer: enough to make "boiling", "boiled" and "boils" meet. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export const DEMO_DIMENSIONS = 256;

/** The words a text contributes to its demonstration vector, after stop words and stemming. */
export function demoTerms(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 1 && !stopwords.has(word)).map(stem);
}

/**
 * Demonstration vectors made from word counts, with nothing to install.
 *
 * Each distinct word is assigned a position in the vector by hashing, and a text's
 * vector is the (dampened) count of its words at those positions. Two texts that share
 * words point in similar directions. This shows every mechanical step of vector search
 * honestly, but it is not a language model: it cannot know that "purify" and "boil"
 * are related unless the texts share words. It exists so that the pipeline can be seen
 * working before a real model is set up, and results from it should be read that way.
 */
export function demoProvider(): EmbeddingProvider {
  const embedOne = (text: string): Float32Array => {
    const vector = new Float32Array(DEMO_DIMENSIONS);
    const counts = new Map<string, number>();
    for (const term of demoTerms(text)) counts.set(term, (counts.get(term) ?? 0) + 1);
    for (const [term, count] of counts) {
      const value = hash(term);
      // The sign comes from another bit of the hash, so unrelated words that collide tend to cancel.
      vector[value % DEMO_DIMENSIONS] = vector[value % DEMO_DIMENSIONS]! + (value & 0x80000000 ? -1 : 1) * (1 + Math.log(count));
    }
    return normalise(vector);
  };
  return {
    modelId: "demo:word-counts",
    provider: "demo",
    model: "word-counts",
    embed: async (texts) => texts.map(embedOne),
    check: async () => ({ ok: true, dimensions: DEMO_DIMENSIONS }),
  };
}

export function providerFromSettings(settings: Settings, modelsDir: string): EmbeddingProvider | undefined {
  const model = settings["search.semantic.model"].trim();
  if (settings["search.semantic.provider"] === "demo") return demoProvider();
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

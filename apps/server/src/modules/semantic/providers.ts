/**
 * Embedding providers turn text into vectors. Outpost never requires one: keyword
 * search works without any of this. When a provider is configured, semantic and hybrid
 * search become available.
 *
 * A provider is identified by a model id such as "openai-compatible:nomic-embed-text".
 * Vectors are stored per model id, so switching models never mixes incompatible
 * vectors, and an index can be rebuilt for a new model while the old one still serves.
 *
 * Three providers exist: the model that ships with Outpost (`built-in.ts`), any local
 * server that speaks the OpenAI embeddings format, and word-count vectors for
 * demonstration.
 */
import { AppError } from "../../core/errors.ts";
import { assertOwnNetwork, parseModelServerAddress } from "../answers/address.ts";
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
 * LocalAI, text-embeddings-inference. The address is a setting; the caller's `guard`
 * holds it to this machine or a private network, and nothing is sent anywhere else.
 */
export function openAiCompatibleProvider(
  endpoint: string,
  model: string,
  /** Run before every request; throws when the address may not be contacted. */
  guard: () => Promise<void> = async () => {},
): EmbeddingProvider {
  const base = endpoint.replace(/\/+$/, "");
  async function call(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    let response: Response;
    try {
      await guard();
      response = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
        // The caller's signal (a search request's) and a limit of our own: a server that never answers must not hold the search.
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        // Passages go to the server that was named, and to no other.
        redirect: "error",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      // Refused before anything was sent: say why, not that the server did not answer.
      if (error instanceof AppError) throw error;
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
    return [...body.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item) => normalise(Float32Array.from(item.embedding)));
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

/**
 * The provider the settings ask for. `builtIn` is the one built-in embedder of this
 * server: it owns a worker thread, so it is made once and handed in.
 */
export function providerFromSettings(
  settings: Settings,
  builtIn: EmbeddingProvider,
  options: { allowRemote: boolean } = { allowRemote: false },
): EmbeddingProvider | undefined {
  switch (settings["search.semantic.provider"]) {
    case "built-in":
      return builtIn;
    case "demo":
      return demoProvider();
    case "openai-compatible": {
      const model = settings["search.semantic.model"].trim();
      if (!model) return undefined;
      const endpoint = settings["search.semantic.endpoint"];
      // The same rule as the server that writes answers: every passage in the library is
      // sent here, so it must be on this computer or a private network unless whoever
      // started Outpost allowed otherwise. See answers/address.ts.
      return openAiCompatibleProvider(endpoint, model, async () =>
        assertOwnNetwork(parseModelServerAddress(endpoint), options.allowRemote),
      );
    }
    default:
      return undefined;
  }
}

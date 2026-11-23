/**
 * The embedding provider that ships with Outpost: a small sentence-embedding model run
 * in a worker thread (see `embed.worker.ts`), with nothing to install and nothing to
 * download.
 *
 * This file is the server-thread half. It starts the worker the first time a vector is
 * asked for, keeps it while it is in use, and ends it after a few idle minutes so that
 * the memory the model takes (several hundred megabytes) is given back. Ending the
 * worker is always safe: it holds nothing that is not on disk.
 */
import os from "node:os";
import { Worker } from "node:worker_threads";
import { AppError } from "../../core/errors.ts";
import {
  BUILT_IN_MODEL,
  BUILT_IN_MODEL_ID,
  BUILT_IN_MODEL_NAME,
  BUILT_IN_PROVIDER,
  builtInInstallation,
  defaultModelDir,
  embedThreads,
  embedWorkerUrl,
  runtimeFiles,
} from "./built-in-model.ts";
import type { EmbedReply, EmbedRequest, EmbedWorkerData } from "./embed-types.ts";
import type { EmbeddingProvider } from "./providers.ts";

/** How long the worker is kept with nothing to do. A search after that waits for the model to load again. */
const IDLE_MS = 5 * 60_000;
/**
 * Longest silence from the worker, while it owes an answer, before it is taken to be
 * stuck. One passage is seconds of work even on a small computer.
 */
const STALL_MS = 5 * 60_000;
/** JavaScript heap the worker may use. The model itself lives outside that heap. */
const WORKER_HEAP_MB = 512;

export interface BuiltInEmbedder extends EmbeddingProvider {
  /** Whether the model and its runtime are part of this installation. */
  installation(): ReturnType<typeof builtInInstallation>;
  /** Processor threads the model is given on this computer. */
  readonly threads: number;
  /** True while the model is loaded in memory. */
  loaded(): boolean;
  /** Ends the worker. It starts again when next needed. */
  close(): Promise<void>;
}

export interface BuiltInOptions {
  /** Folder holding the model's files; this installation's own by default. */
  modelDir?: string;
  idleMs?: number;
  stallMs?: number;
}

interface Waiting {
  resolve(vectors: Float32Array[]): void;
  reject(error: unknown): void;
  count: number;
  detach(): void;
}

interface Slot {
  embed(texts: string[], kind: "passage" | "query", signal?: AbortSignal): Promise<Float32Array[]>;
  loaded(): boolean;
  /** True while it owes passages: a question sent to it would wait for the passage it is on. */
  owesPassages(): boolean;
  drop(error: AppError | undefined): Promise<unknown>;
}

/** One worker thread running the model, started when first needed and ended when idle. */
function createSlot(
  modelDir: string,
  threads: number,
  options: BuiltInOptions,
  installation: () => ReturnType<typeof builtInInstallation>,
): Slot {
  const waiting = new Map<number, Waiting & { passages: boolean }>();
  let worker: Worker | undefined;
  let nextId = 1;
  let idleTimer: NodeJS.Timeout | undefined;
  let stallTimer: NodeJS.Timeout | undefined;

  /** Ends the worker and fails whatever it still owed. */
  function drop(error: AppError | undefined): Promise<unknown> {
    clearTimeout(idleTimer);
    clearTimeout(stallTimer);
    const ended = worker;
    worker = undefined;
    for (const [id, entry] of [...waiting]) {
      waiting.delete(id);
      entry.detach();
      entry.reject(error ?? new AppError("internal", "The built-in model was stopped before it answered."));
    }
    if (!ended) return Promise.resolve();
    ended.removeAllListeners();
    return ended.terminate();
  }

  /** Restarts the clocks: one for a worker that has gone quiet while it owes an answer, one for a worker nobody needs. */
  function watch(): void {
    clearTimeout(idleTimer);
    clearTimeout(stallTimer);
    if (!worker) return;
    // A worker that owes an answer keeps the process alive; an idle one never does.
    if (waiting.size > 0) worker.ref();
    else worker.unref();
    if (waiting.size > 0) {
      stallTimer = setTimeout(
        () => void drop(new AppError("internal", "The built-in model took too long to answer and was stopped. Try again.")),
        options.stallMs ?? STALL_MS,
      );
      stallTimer.unref();
    } else {
      idleTimer = setTimeout(() => void drop(undefined), options.idleMs ?? IDLE_MS);
      idleTimer.unref();
    }
  }

  function start(): Worker {
    if (worker) return worker;
    const found = installation();
    const runtime = runtimeFiles();
    if (!found.installed) throw new AppError("unsupported", found.reason);
    if (!runtime) throw new AppError("unsupported", "The program that runs the built-in model is missing from this installation.");
    const data: EmbedWorkerData = { model: BUILT_IN_MODEL, modelDir, runtime, threads };
    const started = new Worker(embedWorkerUrl(), { workerData: data, resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB } });
    worker = started;
    started.on("message", (message: EmbedReply) => {
      if (worker !== started) return;
      if (message.kind === "fatal") {
        void drop(
          new AppError("internal", message.friendly ? message.message : `The built-in model could not be loaded: ${message.message}`),
        );
        return;
      }
      if (message.kind === "vectors" || message.kind === "failed") {
        const entry = waiting.get(message.id);
        if (entry) {
          waiting.delete(message.id);
          entry.detach();
          if (message.kind === "failed") {
            entry.reject(new AppError("internal", `The built-in model could not read a text: ${message.message}`));
          } else {
            const { data: vectors, dimensions } = message;
            entry.resolve(
              Array.from({ length: entry.count }, (_, index) => vectors.subarray(index * dimensions, (index + 1) * dimensions)),
            );
          }
        }
      }
      watch();
    });
    started.on("error", (error: NodeJS.ErrnoException) => {
      if (worker !== started) return;
      void drop(
        new AppError(
          "internal",
          error.code === "ERR_WORKER_OUT_OF_MEMORY"
            ? "The built-in model needed more memory than Outpost allows, so it was stopped."
            : `The built-in model stopped unexpectedly: ${error.message}`,
        ),
      );
    });
    started.on("exit", () => {
      if (worker !== started) return;
      void drop(new AppError("internal", "The built-in model stopped unexpectedly. Try again."));
    });
    return started;
  }

  function embed(texts: string[], kind: "passage" | "query", signal?: AbortSignal): Promise<Float32Array[]> {
    if (texts.length === 0) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Stopped."));
        return;
      }
      let running: Worker;
      try {
        running = start();
      } catch (error) {
        reject(error);
        return;
      }
      const id = nextId;
      nextId += 1;
      const onAbort = () => {
        if (!waiting.delete(id)) return;
        // The worker drops what is left of the request after the text it is on.
        if (worker === running) running.postMessage({ kind: "cancel", id } satisfies EmbedRequest);
        watch();
        reject(signal?.reason ?? new Error("Stopped."));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiting.set(id, {
        resolve,
        reject,
        count: texts.length,
        passages: kind === "passage",
        detach: () => signal?.removeEventListener("abort", onAbort),
      });
      running.postMessage({ kind: "embed", id, texts, urgent: kind === "query" } satisfies EmbedRequest);
      // Only an idle worker's clock is restarted: one that already owes an answer keeps its deadline.
      if (waiting.size === 1) watch();
    });
  }

  return {
    embed,
    loaded: () => worker !== undefined,
    owesPassages: () => [...waiting.values()].some((entry) => entry.passages),
    drop,
  };
}

export function createBuiltInEmbedder(options: BuiltInOptions = {}): BuiltInEmbedder {
  const modelDir = options.modelDir ?? defaultModelDir();
  const threads = embedThreads(os.availableParallelism());
  const installation = () => builtInInstallation(modelDir);
  const main = createSlot(modelDir, threads, options, installation);
  // While passages are being read, a question would wait for the passage the model is on: on a
  // Raspberry Pi a few hundred milliseconds. So questions asked then go to a second copy of the
  // model, on one thread of its own, loaded only while a build runs and searches come.
  const quick = createSlot(modelDir, 1, options, installation);
  const embed = (texts: string[], kind: "passage" | "query", signal?: AbortSignal) =>
    kind === "query" && main.owesPassages() ? quick.embed(texts, kind, signal) : main.embed(texts, kind, signal);

  return {
    modelId: BUILT_IN_MODEL_ID,
    provider: BUILT_IN_PROVIDER,
    model: BUILT_IN_MODEL_NAME,
    threads,
    installation,
    loaded: () => main.loaded() || quick.loaded(),
    embed,
    async check() {
      const found = installation();
      if (!found.installed) return { ok: false, reason: found.reason };
      try {
        // A real run, ahead of any indexing: "ready" means the model loaded and answered.
        const [vector] = await embed(["outpost"], "query");
        return { ok: true, dimensions: vector!.length };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
    async close() {
      await Promise.all([main.drop(undefined), quick.drop(undefined)]);
    },
  };
}

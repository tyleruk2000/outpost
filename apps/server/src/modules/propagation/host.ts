/**
 * The server's side of the propagation worker: starts it when a prediction is first
 * asked for, sends it one question at a time, and ends it after five idle minutes or
 * when whoever asked gives up.
 */
import { Worker } from "node:worker_threads";
import type { EngineDescription, IonosphereHour } from "@outpost/shared";
import { workerUrl } from "../../core/paths.ts";
import { type CircuitRequest, type CircuitResult, EngineUnavailable, type IonosphereRequest } from "./engine.ts";
import { EngineDataMissing } from "./voacap/coefficients.ts";
import type { VoacapPaths } from "./voacap/files.ts";

export type WorkerRequest =
  | { id: number; op: "describe" }
  | { id: number; op: "circuit"; request: CircuitRequest }
  | { id: number; op: "ionosphere"; request: IonosphereRequest }
  | { id: number; op: "listing"; request: CircuitRequest };

export type WorkerReply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string; kind: "unavailable" | "data-missing" | "engine" | "other" };

/** The engine answered that it cannot work the question out, in its own words. */
export class EngineRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineRefused";
  }
}

const IDLE_MS = 5 * 60_000;
/** One question is milliseconds of work; this long with no answer means the worker is stuck. */
const STALL_MS = 60_000;
/** The engine's own memory is outside this heap and is a few megabytes. */
const WORKER_HEAP_MB = 256;

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal;
  onAbort?: () => void;
}

type Question =
  | { op: "describe" }
  | { op: "circuit"; request: CircuitRequest }
  | { op: "ionosphere"; request: IonosphereRequest }
  | { op: "listing"; request: CircuitRequest };

export interface EngineHost {
  describe(): Promise<{ description: EngineDescription; datasets: Array<{ id: string; version: string }> }>;
  circuit(request: CircuitRequest, signal?: AbortSignal): Promise<CircuitResult>;
  ionosphere(request: IonosphereRequest, signal?: AbortSignal): Promise<IonosphereHour[]>;
  listing(request: CircuitRequest): Promise<string>;
  /** Whether a worker is loaded at this moment. */
  readonly loaded: boolean;
  /** Ends a loaded worker, so that the next question loads the engine and its data afresh. */
  reset(reason: string): Promise<void>;
  close(): Promise<void>;
}

export interface EngineHostOptions {
  idleMs?: number;
  /**
   * Asked before a worker is started, in this thread: throws when the engine cannot run
   * for a reason known without loading it (its data is not here), so that no thread is
   * started to say so.
   */
  ready?: () => void;
}

export function createEngineHost(paths: VoacapPaths, options: EngineHostOptions = {}): EngineHost {
  let worker: Worker | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const settle = (id: number): Pending | undefined => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (entry.onAbort) entry.signal?.removeEventListener("abort", entry.onAbort);
    return entry;
  };

  /** Ends the worker and fails everything waiting on it. */
  const stop = (reason: Error) => {
    const ending = worker;
    worker = undefined;
    clearTimeout(idleTimer);
    for (const id of [...pending.keys()]) settle(id)?.reject(reason);
    return ending ? ending.terminate().then(() => undefined) : Promise.resolve();
  };

  const restIfIdle = () => {
    clearTimeout(idleTimer);
    if (pending.size > 0 || !worker) return;
    idleTimer = setTimeout(() => void stop(new Error("The propagation engine was put away.")), options.idleMs ?? IDLE_MS);
    idleTimer.unref();
  };

  const start = (): Worker => {
    const started = new Worker(workerUrl(new URL("./propagation.worker.ts", import.meta.url), "propagation"), {
      workerData: paths,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    started.on("message", (reply: WorkerReply) => {
      const entry = settle(reply.id);
      if (entry) {
        if (reply.ok) entry.resolve(reply.value);
        else if (reply.kind === "data-missing") entry.reject(new EngineDataMissing(reply.message));
        else if (reply.kind === "unavailable") entry.reject(new EngineUnavailable(reply.message));
        else if (reply.kind === "engine") entry.reject(new EngineRefused(reply.message));
        else entry.reject(new Error(reply.message));
      }
      restIfIdle();
    });
    started.on("error", (error) => {
      if (worker === started) void stop(new EngineUnavailable(`The propagation engine could not be run: ${error.message}`));
    });
    started.on("exit", () => {
      if (worker === started) void stop(new EngineUnavailable("The propagation engine stopped unexpectedly. Try again."));
    });
    return started;
  };

  function ask<T>(question: Question, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("The prediction was stopped."));
        return;
      }
      if (!worker && options.ready) {
        try {
          options.ready();
        } catch (error) {
          reject(error as Error);
          return;
        }
      }
      worker ??= start();
      clearTimeout(idleTimer);
      const id = nextId++;
      const entry: Pending = {
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
        timer: setTimeout(
          () => void stop(new EngineUnavailable("The propagation engine took too long to answer and was stopped. Try again.")),
          STALL_MS,
        ),
      };
      if (signal) {
        // The only way to interrupt the engine is to end its thread. Whatever else was
        // waiting is failed with it; a job that is still wanted is simply run again.
        entry.onAbort = () => void stop(new Error("The prediction was stopped."));
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      pending.set(id, entry);
      worker.postMessage({ id, ...question } satisfies WorkerRequest);
    });
  }

  return {
    describe: () => ask({ op: "describe" }),
    circuit: (request, signal) => ask({ op: "circuit", request }, signal),
    ionosphere: (request, signal) => ask({ op: "ionosphere", request }, signal),
    listing: (request) => ask({ op: "listing", request }),
    get loaded() {
      return worker !== undefined;
    },
    reset: (reason) => stop(new EngineUnavailable(reason)),
    close: () => stop(new Error("Outpost is shutting down.")),
  };
}

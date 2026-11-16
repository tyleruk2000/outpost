/**
 * The server's side of the P.533 worker: started on the first question, sent one
 * question at a time, ended after five idle minutes, when a question takes too long,
 * or when whoever asked gives up. The same shape as VOACAP's (`../host.ts`), kept
 * apart so that the two engines share no thread and no state.
 */
import { Worker } from "node:worker_threads";
import type { EngineDescription } from "@outpost/shared";
import { workerUrl } from "../../../core/paths.ts";
import { type CircuitRequest, EngineUnavailable } from "../engine.ts";
import { EngineRefused } from "../host.ts";
import type { P533Circuit, P533EngineOptions } from "./engine.ts";

export type P533WorkerRequest = { id: number; where: P533EngineOptions } & (
  | { op: "describe" }
  | { op: "circuit"; request: CircuitRequest }
  | { op: "listing"; request: CircuitRequest }
);

export type P533WorkerReply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string; kind: "unavailable" | "engine" | "other" };

const IDLE_MS = 5 * 60_000;
/** A day of 32 frequencies is a quarter of a second here; this long means the worker is stuck. */
const STALL_MS = 60_000;
/** The program's own memory is outside this heap and is capped at 128 MB when it is built. */
const WORKER_HEAP_MB = 256;

export interface P533Host {
  describe(where: P533EngineOptions): Promise<{ description: EngineDescription; datasets: Array<{ id: string; version: string }> }>;
  circuit(where: P533EngineOptions, request: CircuitRequest, signal?: AbortSignal): Promise<P533Circuit>;
  listing(where: P533EngineOptions, request: CircuitRequest): Promise<string>;
  readonly loaded: boolean;
  close(): Promise<void>;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal;
  onAbort?: () => void;
}

type Question = { op: "describe" } | { op: "circuit"; request: CircuitRequest } | { op: "listing"; request: CircuitRequest };

export function createP533Host(options: { idleMs?: number; stallMs?: number } = {}): P533Host {
  let worker: Worker | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const settle = (id: number) => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (entry.onAbort) entry.signal?.removeEventListener("abort", entry.onAbort);
    return entry;
  };

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
    idleTimer = setTimeout(() => void stop(new Error("The P.533 engine was put away.")), options.idleMs ?? IDLE_MS);
    idleTimer.unref();
  };

  const start = () => {
    const started = new Worker(workerUrl(new URL("./p533.worker.ts", import.meta.url), "p533"), {
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    started.on("message", (reply: P533WorkerReply) => {
      const entry = settle(reply.id);
      if (entry) {
        if (reply.ok) entry.resolve(reply.value);
        else if (reply.kind === "unavailable") entry.reject(new EngineUnavailable(reply.message));
        else if (reply.kind === "engine") entry.reject(new EngineRefused(reply.message));
        else entry.reject(new Error(reply.message));
      }
      restIfIdle();
    });
    started.on("error", (error) => {
      if (worker === started) void stop(new EngineUnavailable(`The P.533 engine could not be run: ${error.message}`));
    });
    started.on("exit", () => {
      if (worker === started) void stop(new EngineUnavailable("The P.533 engine stopped unexpectedly. Try again."));
    });
    return started;
  };

  function ask<T>(where: P533EngineOptions, question: Question, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("The comparison was stopped."));
        return;
      }
      worker ??= start();
      clearTimeout(idleTimer);
      const id = nextId++;
      const entry: Pending = {
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
        timer: setTimeout(
          () => void stop(new EngineUnavailable("The P.533 engine took too long to answer and was stopped. Try again.")),
          options.stallMs ?? STALL_MS,
        ),
      };
      if (signal) {
        entry.onAbort = () => void stop(new Error("The comparison was stopped."));
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      pending.set(id, entry);
      worker.postMessage({ id, where, ...question } as P533WorkerRequest);
    });
  }

  return {
    describe: (where) => ask(where, { op: "describe" }),
    circuit: (where, request, signal) => ask(where, { op: "circuit", request }, signal),
    listing: (where, request) => ask(where, { op: "listing", request }),
    get loaded() {
      return worker !== undefined;
    },
    close: () => stop(new Error("Outpost is shutting down.")),
  };
}

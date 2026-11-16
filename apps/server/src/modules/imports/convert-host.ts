/**
 * Converts imported files to pages in a worker thread.
 *
 * What converting a file costs depends on what is in it, not on its size: the Markdown
 * parser takes fourteen seconds over 120 kB of `*x*` written forty thousand times, and
 * an ordinary HTML file of a few megabytes takes a few seconds however well it is
 * written. On the server's own thread either would stop every other request being
 * answered for that long. In a worker they hold up nothing, and a file that takes too
 * long is stopped and reported, as a file that cannot be read is.
 *
 * One worker is kept while an import is using it, because starting one costs more than
 * converting a small file and an import is hundreds of small files. It is ended when
 * nothing has been asked of it for a while, when a file runs out of time, and when the
 * job that is waiting is stopped. Ending it is always safe: it holds nothing but the
 * text it was given.
 */
import { Worker } from "node:worker_threads";
import type { ImportConstructKind, ImportItemFormat } from "@outpost/shared";
import { AppError, type ErrorCode } from "../../core/errors.ts";
import { workerUrl } from "../../core/paths.ts";
import type { InAppTarget } from "../notes/content/index.ts";
import type { ConvertedPage } from "./convert.ts";

export type PageFormat = Exclude<ImportItemFormat, "csv" | "folder">;

export interface ConvertRequest {
  id: number;
  format: PageFormat;
  raw: string;
  /** What each address in the file points to inside Outpost, for the ones that point to anything. */
  links?: Record<string, InAppTarget>;
  /** Also count what the source holds that a page cannot (`scanConstructs`). */
  scan: boolean;
}

export type Constructs = Partial<Record<ImportConstructKind, number>>;

export type ConvertAnswer =
  | { id: number; ok: true; page: ConvertedPage; constructs: Constructs }
  | { id: number; ok: false; code: ErrorCode; message: string };

export interface ConvertOptions {
  links?: Record<string, InAppTarget>;
  scan?: boolean;
  /** Stops waiting, and stops the worker, when the job is paused, cancelled or shut down. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Longest one file may take. The largest file an import reads (4 MB) takes a few seconds
 * on a desktop computer; this leaves room for a Raspberry Pi and still ends a file that
 * would never finish.
 */
export const CONVERT_TIMEOUT_MS = 60_000;
/** How long the worker is kept after the last file, so that the next one need not start it again. */
const IDLE_MS = 10_000;
/** JavaScript heap the worker may use. A source file is at most 4 MB and a page at most 5 MB; this is a last line behind those. */
const WORKER_HEAP_MB = 1024;

const TOO_SLOW = "This file took too long to convert, so Outpost stopped.";
const STOPPED = "Converting this file stopped unexpectedly.";
const TOO_MUCH_MEMORY = "Converting this file needed more memory than Outpost allows.";

interface Waiting {
  resolve(answer: Extract<ConvertAnswer, { ok: true }>): void;
  reject(error: unknown): void;
}

let worker: Worker | undefined;
let nextId = 1;
let idle: NodeJS.Timeout | undefined;
/** The file the worker is on. Files are converted one at a time, in the order they were asked for. */
let current: { id: number; waiting: Waiting } | undefined;
let line: Promise<unknown> = Promise.resolve();

/** Whether a worker is running, for tests. */
export const convertWorkerRunning = () => worker !== undefined;

function end(): void {
  clearTimeout(idle);
  idle = undefined;
  const ending = worker;
  worker = undefined;
  if (ending) {
    ending.removeAllListeners();
    void ending.terminate();
  }
}

/** Ends the worker and tells whoever is waiting on it why. */
function fail(error: unknown): void {
  const waiting = current?.waiting;
  current = undefined;
  end();
  waiting?.reject(error);
}

function start(): Worker {
  const started = new Worker(workerUrl(new URL("./convert.worker.ts", import.meta.url), "convert"), {
    resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
  });
  // The worker never keeps the server from stopping.
  started.unref();
  started.on("message", (answer: ConvertAnswer) => {
    if (!current || answer.id !== current.id) return;
    const { waiting } = current;
    current = undefined;
    if (answer.ok) waiting.resolve(answer);
    else waiting.reject(new AppError(answer.code, answer.message));
  });
  started.on("error", (error: NodeJS.ErrnoException) => {
    fail(new AppError("unsupported", error.code === "ERR_WORKER_OUT_OF_MEMORY" ? TOO_MUCH_MEMORY : STOPPED));
  });
  started.on("exit", () => fail(new AppError("unsupported", STOPPED)));
  return started;
}

function convertNow(format: PageFormat, raw: string, options: ConvertOptions): Promise<Extract<ConvertAnswer, { ok: true }>> {
  const { signal } = options;
  return new Promise((resolve, reject) => {
    const stoppedBy = () => (signal?.reason instanceof Error ? signal.reason : new Error("Stopped"));
    if (signal?.aborted) {
      reject(stoppedBy());
      return;
    }
    clearTimeout(idle);
    idle = undefined;
    worker ??= start();
    const id = nextId++;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (worker) {
        idle = setTimeout(end, IDLE_MS);
        idle.unref();
      }
    };
    current = {
      id,
      waiting: {
        resolve(answer) {
          done();
          resolve(answer);
        },
        reject(error) {
          done();
          reject(error);
        },
      },
    };
    const onAbort = () => fail(stoppedBy());
    const timer = setTimeout(() => fail(new AppError("unsupported", TOO_SLOW)), options.timeoutMs ?? CONVERT_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ id, format, raw, links: options.links, scan: options.scan === true } satisfies ConvertRequest);
  });
}

/**
 * Converts one file off the server's thread, in its turn. Rejects with an `AppError`
 * that says why in a sentence, or with the signal's reason when stopped.
 */
export function convertPageInWorker(
  format: PageFormat,
  raw: string,
  options: ConvertOptions = {},
): Promise<{ page: ConvertedPage; constructs: Constructs }> {
  const turn = line.then(() => convertNow(format, raw, options));
  line = turn.catch(() => {});
  return turn.then(({ page, constructs }) => ({ page, constructs }));
}

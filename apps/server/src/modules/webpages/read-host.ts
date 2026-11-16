/**
 * Runs the reading of one page in a worker thread and waits for its answer.
 *
 * The worker is ended when the person stops waiting, and when it has taken too long.
 * Ending it is always safe: it holds nothing but the bytes it was given.
 */
import { Worker } from "node:worker_threads";
import { AppError, type ErrorCode } from "../../core/errors.ts";
import { workerUrl } from "../../core/paths.ts";
import type { PageRead } from "./read-page.ts";

export interface ReadRequest {
  bytes: Uint8Array;
  contentType: string | null;
  /** The address the bytes came from, which links and pictures are completed against. */
  url: string;
}

export type ReadAnswer = { ok: true; read: PageRead } | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

/** Longest a page may take to read. A long article takes about a second. */
const READ_TIMEOUT_MS = 20_000;
/**
 * JavaScript heap the worker may use. What actually bounds memory is the limit on a
 * page's size and on its elements (`read-page.ts`); this is a last line behind them.
 */
const WORKER_HEAP_MB = 768;

const TOO_SLOW = "This page took too long to read, so Outpost stopped. It was not saved.";
const STOPPED = "Reading the page stopped unexpectedly. Try again.";

export function readPageInWorker(request: ReadRequest, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<PageRead> {
  const { signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("Stopped"));
      return;
    }
    const worker = new Worker(workerUrl(new URL("./webpage.worker.ts", import.meta.url), "webpage"), {
      workerData: request,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      void worker.terminate();
      finish();
    };
    const onAbort = () => settle(() => reject(signal?.reason instanceof Error ? signal.reason : new Error("Stopped")));
    const timer = setTimeout(() => settle(() => reject(new AppError("unsupported", TOO_SLOW))), options.timeoutMs ?? READ_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.on("message", (answer: ReadAnswer) => {
      settle(() => (answer.ok ? resolve(answer.read) : reject(new AppError(answer.code, answer.message, answer.details))));
    });
    worker.on("error", (error: NodeJS.ErrnoException) => {
      settle(() =>
        reject(
          new AppError(
            "unsupported",
            error.code === "ERR_WORKER_OUT_OF_MEMORY"
              ? "Reading this page needed more memory than Outpost allows, so it was stopped. It was not saved."
              : STOPPED,
          ),
        ),
      );
    });
    worker.on("exit", () => settle(() => reject(new AppError("unsupported", STOPPED))));
  });
}

/**
 * Runs one extraction in a worker thread and waits for its answer.
 *
 * The worker is terminated when the job is paused or cancelled, when the server shuts
 * down, when it stops reporting progress for a long time, or when it has simply run
 * too long. Terminating is always safe: the worker only reads the original file.
 */
import { Worker } from "node:worker_threads";
import { workerUrl } from "../../core/paths.ts";
import type { Extracted, ExtractProgress, ExtractRequest, WorkerMessage } from "./extract-types.ts";

/** Longest silence from a worker before it is assumed to be stuck. */
const STALL_TIMEOUT_MS = 5 * 60_000;
/** Longest a single file may take in total, however much progress it reports. */
const TOTAL_TIMEOUT_MS = 60 * 60_000;
/** JavaScript heap a worker may use. Past this it is stopped instead of the server. */
const WORKER_HEAP_MB = 1024;

/** An extraction that did not produce text. The message is written for people. */
export class ExtractionFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionFailure";
  }
}

export interface RunOptions {
  signal: AbortSignal;
  onProgress?: (progress: ExtractProgress) => void;
  stallTimeoutMs?: number;
  totalTimeoutMs?: number;
}

const TOO_SLOW =
  "Reading the text of this file took too long and was stopped. The file is stored and can still be opened, but its contents are not searchable.";

export function runExtraction(request: ExtractRequest, options: RunOptions): Promise<Extracted> {
  const { signal } = options;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ExtractionFailure("Reading the text was stopped."));
      return;
    }
    const worker = new Worker(workerUrl(new URL("./extract.worker.ts", import.meta.url), "extract"), {
      workerData: request,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });

    let settled = false;
    let stallTimer: NodeJS.Timeout | undefined;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      clearTimeout(totalTimer);
      signal.removeEventListener("abort", onAbort);
      void worker.terminate();
      finish();
    };
    const fail = (message: string) => settle(() => reject(new ExtractionFailure(message)));
    const onAbort = () => fail("Reading the text was stopped.");
    const watchForStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => fail(TOO_SLOW), options.stallTimeoutMs ?? STALL_TIMEOUT_MS);
    };
    const totalTimer = setTimeout(() => fail(TOO_SLOW), options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS);

    signal.addEventListener("abort", onAbort, { once: true });
    watchForStall();

    worker.on("message", (message: WorkerMessage) => {
      // terminate() is not immediate: a message already sent can still arrive after the end.
      if (settled) return;
      if (message.kind === "progress") {
        watchForStall();
        options.onProgress?.(message.progress);
      } else if (message.kind === "done") {
        settle(() => resolve(message.result));
      } else {
        fail(message.friendly ? message.message : `This file could not be read: ${message.message}`);
      }
    });
    worker.on("error", (error: NodeJS.ErrnoException) => {
      fail(
        error.code === "ERR_WORKER_OUT_OF_MEMORY"
          ? "Reading the text of this file needed more memory than Outpost allows, so it was stopped. The file is stored and can still be opened, but its contents are not searchable."
          : `This file could not be read: ${error.message}`,
      );
    });
    worker.on("exit", () => fail("Reading the text stopped unexpectedly. Try reading the text again."));
  });
}

/**
 * Runs OCR on one document in a worker thread and reports each page as it is read.
 *
 * The worker is ended when the job is paused or cancelled, when the server shuts down,
 * or when it has said nothing for a long time. Ending it is always safe: it only reads
 * the original file, and every page it finished has already been handed over.
 */
import { Worker } from "node:worker_threads";
import { workerUrl } from "../../core/paths.ts";
import type { OcrPage, OcrRequest, OcrWorkerMessage } from "./types.ts";

/**
 * Longest silence from the worker before it is assumed to be stuck. The engine reports
 * as it works through a page, so this is far longer than any real pause, even on a
 * small computer.
 */
const STALL_TIMEOUT_MS = 10 * 60_000;
/**
 * JavaScript heap the worker may use. The decoded pictures and the engine's own memory
 * are outside this heap; the limits in `types.ts` are what keep those in check.
 */
const WORKER_HEAP_MB = 1024;

/** OCR that did not finish. The message is written for people. */
export class OcrFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrFailure";
  }
}

export interface OcrRunOptions {
  signal: AbortSignal;
  /** Called once per page (or once for an image), in the order asked for. */
  onPage(index: number, page: OcrPage): void;
  /** How far through page `index` the engine is, 0 to 1. */
  onProgress?(index: number, fraction: number): void;
  stallTimeoutMs?: number;
}

const STUCK = "Reading the text took too long and was stopped. The pages read before that are kept.";

export function runOcr(request: OcrRequest, options: OcrRunOptions): Promise<void> {
  const { signal } = options;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new OcrFailure("Reading the text was stopped."));
      return;
    }
    const worker = new Worker(workerUrl(new URL("./ocr.worker.ts", import.meta.url), "ocr"), {
      workerData: request,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });

    let settled = false;
    let stallTimer: NodeJS.Timeout | undefined;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      signal.removeEventListener("abort", onAbort);
      void worker.terminate();
      finish();
    };
    const fail = (message: string) => settle(() => reject(new OcrFailure(message)));
    const onAbort = () => fail("Reading the text was stopped.");
    const watchForStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => fail(STUCK), options.stallTimeoutMs ?? STALL_TIMEOUT_MS);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    watchForStall();

    worker.on("message", (message: OcrWorkerMessage) => {
      if (settled) return;
      watchForStall();
      if (message.kind === "progress") options.onProgress?.(message.index, message.fraction);
      else if (message.kind === "page") options.onPage(message.index, message.result);
      else if (message.kind === "done") settle(resolve);
      else fail(message.friendly ? message.message : `OCR could not be run: ${message.message}`);
    });
    worker.on("error", (error: NodeJS.ErrnoException) => {
      fail(
        error.code === "ERR_WORKER_OUT_OF_MEMORY"
          ? "Reading the text needed more memory than Outpost allows, so it was stopped. The pages read before that are kept."
          : `OCR could not be run: ${error.message}`,
      );
    });
    worker.on("exit", () =>
      fail("Reading the text stopped unexpectedly. The pages read before that are kept; try again to read the rest."),
    );
  });
}

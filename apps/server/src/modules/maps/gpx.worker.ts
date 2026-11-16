/**
 * Parses one GPX file away from the server's own thread.
 *
 * Reading a large file takes a moment, and the server should go on answering while it
 * happens. The reader keeps its own count of what a file holds and refuses one that
 * holds too much (`GPX_LIMITS`), so this worker's memory ceiling is not what stops a
 * hostile file; it is there in case the reader is ever wrong.
 */
import v8 from "node:v8";
import { parentPort, workerData } from "node:worker_threads";
import { AppError } from "../../core/errors.ts";
import { parseGpx } from "./gpx.ts";

const started = performance.now();
const usage = () => ({ heapBytes: v8.getHeapStatistics().total_heap_size, milliseconds: Math.round(performance.now() - started) });

try {
  const parsed = parseGpx((workerData as { source: string }).source);
  parentPort?.postMessage({ ok: true, parsed, usage: usage() });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    code: error instanceof AppError ? error.code : "bad_request",
    message: error instanceof AppError ? error.message : "That file could not be read as GPX.",
    usage: usage(),
  });
}

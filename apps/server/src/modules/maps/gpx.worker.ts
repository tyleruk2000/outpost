/**
 * Parses one GPX file away from the server's own thread and memory.
 *
 * An XML document can be small on disk and enormous once parsed. Here the parser has a
 * memory ceiling of its own: a file that would exhaust it stops this worker, and the
 * person is told the file is too complex, instead of the server stopping for everyone.
 */
import { parentPort, workerData } from "node:worker_threads";
import { AppError } from "../../core/errors.ts";
import { parseGpx } from "./gpx.ts";

try {
  parentPort?.postMessage({ ok: true, parsed: parseGpx((workerData as { source: string }).source) });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    code: error instanceof AppError ? error.code : "bad_request",
    message: error instanceof AppError ? error.message : "That file could not be read as GPX.",
  });
}

/**
 * Worker-thread entry point for reading a fetched page. One worker reads one page and
 * exits. Somebody else's HTML is parsed here so that a page built to be slow or huge
 * holds up this thread, which can be stopped, and not the one that answers requests.
 */
import { parentPort, workerData } from "node:worker_threads";
import { AppError } from "../../core/errors.ts";
import type { ReadAnswer, ReadRequest } from "./read-host.ts";
import { readPage } from "./read-page.ts";

const request = workerData as ReadRequest;
let answer: ReadAnswer;
try {
  answer = { ok: true, read: readPage(Buffer.from(request.bytes), request.contentType, request.url) };
} catch (error) {
  answer =
    error instanceof AppError
      ? { ok: false, code: error.code, message: error.message, details: error.details }
      : { ok: false, code: "unsupported", message: "This page could not be read." };
}
parentPort?.postMessage(answer);

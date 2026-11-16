/**
 * Worker-thread entry point for converting imported files to pages. One worker converts
 * one file at a time for as long as an import keeps it busy (`convert-host.ts`).
 * Somebody else's Markdown and HTML is parsed here so that a file built to be slow, or
 * simply a very large one, holds up this thread, which can be stopped, and not the one
 * that answers requests.
 */
import { parentPort } from "node:worker_threads";
import { AppError } from "../../core/errors.ts";
import { convertPage, scanConstructs } from "./convert.ts";
import type { ConvertAnswer, ConvertRequest } from "./convert-host.ts";

parentPort?.on("message", (request: ConvertRequest) => {
  let answer: ConvertAnswer;
  try {
    const links = request.links;
    const page = convertPage(request.format, request.raw, links ? (href) => (Object.hasOwn(links, href) ? links[href]! : null) : undefined);
    answer = { id: request.id, ok: true, page, constructs: request.scan ? scanConstructs(request.format, request.raw) : {} };
  } catch (error) {
    answer =
      error instanceof AppError
        ? { id: request.id, ok: false, code: error.code, message: error.message }
        : { id: request.id, ok: false, code: "unsupported", message: "The file could not be read as a page." };
  }
  parentPort?.postMessage(answer);
});

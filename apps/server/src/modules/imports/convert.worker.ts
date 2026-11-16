/**
 * Entry point of the process that converts imported files to pages (`convert-host.ts`).
 * It is named and bundled as the worker threads are, and run as a process of its own.
 * Somebody else's Markdown and HTML is parsed here so that a file built to be slow, or to
 * need more memory than there is, or simply a very large one, costs this process, which
 * can be ended, and not the one that answers requests.
 */
import { AppError } from "../../core/errors.ts";
import { convertPage, scanConstructs } from "./convert.ts";
import type { ConvertAnswer, ConvertRequest } from "./convert-host.ts";

process.on("message", (request: ConvertRequest) => {
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
  process.send?.(answer);
});
// The server has gone, or has let go: there is nobody to convert for.
process.on("disconnect", () => process.exit(0));

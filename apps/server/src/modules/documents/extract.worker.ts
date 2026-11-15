/**
 * Worker-thread entry point for text extraction. One worker reads one file and exits.
 *
 * Parsing happens here rather than in the server's own thread for two reasons: a large
 * PDF or book is seconds to minutes of uninterruptible work, and a file crafted to make
 * a parser run away can be stopped by terminating the worker without taking the server
 * down with it.
 *
 * Parsers are imported on demand so that reading a text file does not pay for loading
 * the PDF library.
 */
import { parentPort, workerData } from "node:worker_threads";
import { type Extracted, type ExtractProgress, type ExtractRequest, ExtractionError, type WorkerMessage } from "./extract-types.ts";

const send = (message: WorkerMessage) => parentPort?.postMessage(message);
const onProgress = (progress: ExtractProgress) => send({ kind: "progress", progress });

async function extract(request: ExtractRequest): Promise<Extracted> {
  switch (request.kind) {
    case "pdf":
      return (await import("./extract-pdf.ts")).extractPdf(request.filePath, request.maxPdfPages, onProgress);
    case "epub":
      return (await import("./extract-epub.ts")).extractEpub(request.filePath, onProgress);
    case "markdown":
      return (await import("./extract-text.ts")).extractMarkdown(request.filePath);
    case "html":
      return (await import("./extract-text.ts")).extractHtml(request.filePath);
    case "text":
      return (await import("./extract-text.ts")).extractPlainText(request.filePath);
  }
}

try {
  send({ kind: "done", result: await extract(workerData as ExtractRequest) });
} catch (error) {
  send({
    kind: "error",
    message: error instanceof Error ? error.message : String(error),
    friendly: error instanceof ExtractionError,
  });
}

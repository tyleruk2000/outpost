/**
 * Worker-thread entry point for OCR. One worker reads one document and exits.
 *
 * Recognising a page is seconds of uninterruptible work, and decoding a scan can use
 * hundreds of megabytes, so none of it happens in the server's own thread. Each page
 * is posted back as soon as it is read: the server keeps what has been done so far, and
 * can stop the work at any moment by ending this thread, which only ever reads the
 * original file.
 */
import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { imageSize } from "./image-size.ts";
import { loadProvider } from "./providers.ts";
import {
  MAX_IMAGE_BYTES,
  MAX_SOURCE_PIXELS,
  MIN_CONFIDENCE,
  type OcrEngine,
  OcrError,
  type OcrImage,
  type OcrPage,
  type OcrRequest,
  type OcrWorkerMessage,
} from "./types.ts";

const send = (message: OcrWorkerMessage) => parentPort?.postMessage(message);

async function read(engine: OcrEngine, image: OcrImage, index: number, page: number | null): Promise<OcrPage> {
  const result = await engine.recognise(image, (fraction) => send({ kind: "progress", index, fraction }));
  const text = result.text.trim();
  // Marks that are not writing come back as low-confidence scraps; they are not text.
  const sure = result.confidence >= MIN_CONFIDENCE;
  return { page, text: sure ? text : "", confidence: result.confidence };
}

async function readImage(engine: OcrEngine, request: OcrRequest): Promise<void> {
  const megabytes = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
  const megapixels = Math.round(MAX_SOURCE_PIXELS / 1_000_000);
  if ((await fs.promises.stat(request.filePath)).size > MAX_IMAGE_BYTES) {
    throw new OcrError(`This image is larger than ${megabytes} MB, which is more than OCR will read.`);
  }
  const bytes = new Uint8Array(await fs.promises.readFile(request.filePath));
  const size = imageSize(bytes);
  if (size && size.width * size.height > MAX_SOURCE_PIXELS) {
    throw new OcrError(
      `This image is ${size.width.toLocaleString("en")} by ${size.height.toLocaleString("en")} pixels, which is more than OCR will read (${megapixels} million pixels at most). A smaller copy can be read.`,
    );
  }
  send({ kind: "page", index: 0, result: await read(engine, { kind: "file", bytes }, 0, null) });
}

async function readPdf(engine: OcrEngine, request: OcrRequest): Promise<void> {
  // Imported here so that reading an image does not pay for loading the PDF library.
  const { openScannedPdf } = await import("./pdf-pages.ts");
  const pdf = await openScannedPdf(request.filePath);
  try {
    for (const [index, number] of request.pages.entries()) {
      let result: OcrPage;
      try {
        if (number < 1 || number > pdf.pageCount) {
          result = { page: number, text: "", confidence: 0, skipped: "The page is not in the file." };
        } else {
          const picture = await pdf.render(number);
          result = picture
            ? await read(engine, { kind: "grey", ...picture }, index, number)
            : { page: number, text: "", confidence: 0, skipped: "There is no picture on the page to read." };
        }
      } catch (error) {
        // One page that cannot be drawn or read should not cost the rest of the document.
        result = { page: number, text: "", confidence: 0, skipped: error instanceof Error ? error.message : String(error) };
      }
      send({ kind: "page", index, result });
    }
  } finally {
    await pdf.close();
  }
}

try {
  const request = workerData as OcrRequest;
  const provider = await loadProvider(request.provider);
  const engine = await provider.open({ languages: request.languages });
  try {
    if (request.kind === "image") await readImage(engine, request);
    else await readPdf(engine, request);
  } finally {
    engine.close();
  }
  send({ kind: "done" });
} catch (error) {
  send({
    kind: "error",
    message: error instanceof Error ? error.message : String(error),
    friendly: error instanceof OcrError,
  });
}

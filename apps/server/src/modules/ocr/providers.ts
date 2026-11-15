/**
 * The OCR engines Outpost knows. One today; another would be one more line here plus
 * its own file. Engines are loaded on demand, inside the worker thread only, so the
 * server itself never pays for an engine's code. For the same reason the server thread
 * must not import this file: it names the engine by id (`DEFAULT_PROVIDER`).
 */
import type { OcrProvider } from "./types.ts";

const loaders: Record<string, () => Promise<OcrProvider>> = {
  tesseract: async () => (await import("./tesseract.ts")).tesseract,
};

export async function loadProvider(id: string): Promise<OcrProvider> {
  const load = loaders[id];
  if (!load) throw new Error(`There is no OCR engine called "${id}".`);
  return load();
}

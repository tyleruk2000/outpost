/**
 * The page's side of contour lines: hands each tile the map asks for to the worker and
 * passes the answer back. The worker is started the first time a tile is wanted, so a
 * map without contour lines never pays for it.
 */
import type { ContourWorkerRequest, ContourWorkerResponse } from "./contour.worker";

interface Waiting {
  resolve: (tile: { data: ArrayBuffer }) => void;
  reject: (error: Error) => void;
}

let worker: Worker | undefined;
let nextId = 1;
const waiting = new Map<number, Waiting>();

function failAll(message: string): void {
  for (const request of waiting.values()) request.reject(new Error(message));
  waiting.clear();
}

function startWorker(): Worker {
  // Built by Vite into a file of its own under /assets, on Outpost's origin.
  const created = new Worker(new URL("./contour.worker.ts", import.meta.url), { type: "module", name: "outpost-contours" });
  created.onmessage = (event: MessageEvent<ContourWorkerResponse>) => {
    const response = event.data;
    const request = waiting.get(response.id);
    if (!request) return;
    waiting.delete(response.id);
    if ("data" in response) request.resolve({ data: response.data });
    else request.reject(new Error(response.error));
  };
  created.onerror = () => {
    // The worker itself broke (its file could not be loaded, say). Let the next tile try again with a new one.
    failAll("Contour lines could not be drawn: the part of Outpost that traces them did not start.");
    created.terminate();
    if (worker === created) worker = undefined;
  };
  return created;
}

/** The loader behind the contour protocol, in the shape MapLibre's `addProtocol` wants. */
export function loadContourTile(request: { url: string }, abort: AbortController): Promise<{ data: ArrayBuffer }> {
  worker ??= startWorker();
  const target = worker;
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    abort.signal.addEventListener(
      "abort",
      () => {
        if (!waiting.delete(id)) return;
        target.postMessage({ type: "cancel", id } satisfies ContourWorkerRequest);
        const error = new Error("The contour tile is no longer wanted.");
        error.name = "AbortError";
        reject(error);
      },
      { once: true },
    );
    target.postMessage({ type: "tile", id, url: request.url } satisfies ContourWorkerRequest);
  });
}

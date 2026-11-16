/**
 * Worker-thread entry point for the propagation engine.
 *
 * The engine is WebAssembly and a prediction is a few milliseconds of uninterruptible
 * work; a sweep of a whole day across every band is many of them, and a coverage map
 * will be thousands. None of it happens in the server's own thread. The worker stays
 * loaded while it is in use and is ended by the server when it has been idle, or when
 * a job using it is cancelled: ending it is always safe, because the engine only reads.
 */
import { parentPort, workerData } from "node:worker_threads";
import { EngineUnavailable, type PropagationEngine } from "./engine.ts";
import type { WorkerReply, WorkerRequest } from "./host.ts";
import { EngineDataMissing } from "./voacap/coefficients.ts";
import { createVoacapEngine } from "./voacap/engine.ts";
import type { VoacapPaths } from "./voacap/files.ts";
import { EngineError } from "./voacap/instance.ts";

const paths = workerData as VoacapPaths;
let engine: PropagationEngine | undefined;

function answer(request: WorkerRequest): unknown {
  // Made on first use, and again after a failure to load: the files may have been put back.
  engine ??= createVoacapEngine(paths);
  switch (request.op) {
    case "describe":
      return { description: engine.describe(), datasets: engine.datasets() };
    case "circuit":
      return engine.circuit(request.request);
    case "ionosphere":
      return engine.ionosphere(request.request);
    case "listing":
      return engine.listing(request.request);
  }
}

parentPort?.on("message", (request: WorkerRequest) => {
  let reply: WorkerReply;
  try {
    reply = { id: request.id, ok: true, value: answer(request) };
  } catch (error) {
    reply = {
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      kind:
        error instanceof EngineDataMissing
          ? "data-missing"
          : error instanceof EngineUnavailable
            ? "unavailable"
            : error instanceof EngineError
              ? "engine"
              : "other",
    };
  }
  parentPort?.postMessage(reply);
});

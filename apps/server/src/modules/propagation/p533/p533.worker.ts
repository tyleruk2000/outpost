/**
 * Worker-thread entry point for the second model, the ITU's P.533.
 *
 * Its own thread, apart from VOACAP's: one run of the program is a tenth of a second
 * of uninterruptible work, and neither engine waits for the other. Each question says
 * where the engine file and the maps are, because the maps can be moved or removed
 * while the server runs; the loaded engine is kept while they stay the same.
 */
import { parentPort } from "node:worker_threads";
import { EngineUnavailable } from "../engine.ts";
import { createP533Engine, EngineQuestionError, type P533Engine } from "./engine.ts";
import type { P533WorkerReply, P533WorkerRequest } from "./host.ts";
import { ProgramFailed } from "./program.ts";

let engine: { at: string; engine: P533Engine } | undefined;

function engineFor(request: P533WorkerRequest): P533Engine {
  const at = JSON.stringify([request.where.dataDir, request.where.mapsFile, request.where.maps.sha256]);
  if (engine?.at !== at) engine = { at, engine: createP533Engine(request.where) };
  return engine.engine;
}

function answer(request: P533WorkerRequest): unknown {
  const loaded = engineFor(request);
  switch (request.op) {
    case "describe":
      return { description: loaded.describe(), datasets: loaded.datasets() };
    case "circuit":
      return loaded.circuit(request.request);
    case "listing":
      return loaded.listing(request.request);
  }
}

parentPort?.on("message", (request: P533WorkerRequest) => {
  let reply: P533WorkerReply;
  try {
    reply = { id: request.id, ok: true, value: answer(request) };
  } catch (error) {
    // A failed load is not kept: the files may be put right before the next question.
    if (error instanceof EngineUnavailable) engine = undefined;
    reply = {
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      kind:
        error instanceof EngineUnavailable || error instanceof ProgramFailed
          ? "unavailable"
          : error instanceof EngineQuestionError || error instanceof RangeError
            ? "engine"
            : "other",
    };
    if (error instanceof ProgramFailed) engine = undefined;
  }
  parentPort?.postMessage(reply);
});

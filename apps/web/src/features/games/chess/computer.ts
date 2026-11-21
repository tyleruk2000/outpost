/**
 * The page's side of the computer, as for Draughts: a worker is started for each move the
 * computer makes and ended as soon as it has answered or the move is no longer wanted.
 * Where there is no Worker (or it will not start) the same search runs on the page one
 * step at a time between tasks. Either way it plays the same move for the same position,
 * seed and level.
 */
import { seededRng } from "../kit/rng";
import { createSearch, type Level } from "./ai";
import { moveCode, type Position } from "./engine";
import type { ComputerRequest, ComputerResponse } from "./worker";

function searchInSlices(position: Position, seed: number, level: Level, cancelled: () => boolean): Promise<string | null> {
  const search = createSearch(position, { level, rng: seededRng(seed) });
  return new Promise((resolve) => {
    const slice = () => {
      if (cancelled()) return resolve(null);
      if (search.step()) return resolve(moveCode(search.best()));
      setTimeout(slice, 0);
    };
    setTimeout(slice, 0);
  });
}

function searchInWorker(position: Position, seed: number, level: Level, ended: { stop?: () => void }): Promise<string | null> {
  if (typeof Worker === "undefined") return Promise.resolve(null);
  let worker: Worker;
  try {
    // Built by Vite into a file of its own, on Outpost's origin.
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "outpost-chess" });
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const finish = (code: string | null) => {
      worker.terminate();
      ended.stop = undefined;
      resolve(code);
    };
    ended.stop = () => finish(null);
    worker.onmessage = (event: MessageEvent<ComputerResponse>) => finish("code" in event.data ? event.data.code : null);
    worker.onerror = () => finish(null);
    worker.postMessage({ id: 1, position, seed, level } satisfies ComputerRequest);
  });
}

export interface Thinking {
  /** The computer's move in its long form, or null if it was cancelled. */
  move: Promise<string | null>;
  cancel(): void;
}

export function think(position: Position, seed: number, level: Level): Thinking {
  let cancelled = false;
  const worker: { stop?: () => void } = {};
  const move = searchInWorker(position, seed, level, worker).then((code) => {
    if (cancelled) return null;
    // A worker that would not start or broke: the page searches instead.
    return code ?? searchInSlices(position, seed, level, () => cancelled);
  });
  return {
    move,
    cancel: () => {
      cancelled = true;
      worker.stop?.();
    },
  };
}

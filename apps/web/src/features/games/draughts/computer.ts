/**
 * The page's side of the computer: a worker is started for each move the computer makes
 * and ended as soon as it has answered or the move is no longer wanted, so nothing is left
 * running between moves. Where there is no Worker (or it will not start) the same search
 * runs on the page one step at a time between tasks, so that the page still answers taps
 * while it thinks. Either way it plays the same move for the same position and seed.
 */
import { seededRng } from "../kit/rng";
import { createSearch } from "./ai";
import type { Position } from "./engine";
import type { ComputerRequest, ComputerResponse } from "./worker";

/** The search on the page, one move at the top of the tree per task. */
function searchInSlices(position: Position, seed: number, cancelled: () => boolean): Promise<number[] | null> {
  const search = createSearch(position, { rng: seededRng(seed) });
  return new Promise((resolve) => {
    const slice = () => {
      if (cancelled()) return resolve(null);
      if (search.step()) return resolve(search.best().path);
      setTimeout(slice, 0);
    };
    setTimeout(slice, 0);
  });
}

/** Asks a worker of its own for the move; null when there is no worker or it failed. */
function searchInWorker(position: Position, seed: number, ended: { stop?: () => void }): Promise<number[] | null> {
  if (typeof Worker === "undefined") return Promise.resolve(null);
  let worker: Worker;
  try {
    // Built by Vite into a file of its own, on Outpost's origin.
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "outpost-draughts" });
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const finish = (path: number[] | null) => {
      worker.terminate();
      ended.stop = undefined;
      resolve(path);
    };
    ended.stop = () => finish(null);
    worker.onmessage = (event: MessageEvent<ComputerResponse>) => finish("path" in event.data ? event.data.path : null);
    worker.onerror = () => finish(null);
    worker.postMessage({ id: 1, position, seed } satisfies ComputerRequest);
  });
}

export interface Thinking {
  /** The squares of the computer's move, or null if it was cancelled. */
  move: Promise<number[] | null>;
  /** Stops the search and ends its worker. */
  cancel(): void;
}

export function think(position: Position, seed: number): Thinking {
  let cancelled = false;
  const worker: { stop?: () => void } = {};
  const move = searchInWorker(position, seed, worker).then((path) => {
    if (cancelled) return null;
    // A worker that would not start or broke: the page searches instead.
    return path ?? searchInSlices(position, seed, () => cancelled);
  });
  return {
    move,
    cancel: () => {
      cancelled = true;
      worker.stop?.();
    },
  };
}

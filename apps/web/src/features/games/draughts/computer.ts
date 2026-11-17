/**
 * The page's side of the computer: asks the worker for a move, or, where there is no
 * Worker (or it would not start), runs the same search on the page one step at a time
 * between tasks, so that the page still answers taps while it thinks. Either way it
 * plays the same move for the same position and seed.
 */
import { seededRng } from "../kit/rng";
import { createSearch } from "./ai";
import type { Position } from "./engine";
import type { ComputerRequest, ComputerResponse } from "./worker";

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (path: number[] | null) => void>();

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    // Built by Vite into a file of its own, on Outpost's origin.
    const created = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "outpost-draughts" });
    created.onmessage = (event: MessageEvent<ComputerResponse>) => {
      const answer = waiting.get(event.data.id);
      if (!answer) return;
      waiting.delete(event.data.id);
      answer("path" in event.data ? event.data.path : null);
    };
    created.onerror = () => {
      // The worker could not start or broke: everything waiting on it is searched on the page instead.
      created.terminate();
      worker = null;
      for (const answer of waiting.values()) answer(null);
      waiting.clear();
    };
    return created;
  } catch {
    return null;
  }
}

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

export interface Thinking {
  /** The squares of the computer's move, or null if it was cancelled. */
  move: Promise<number[] | null>;
  cancel(): void;
}

export function think(position: Position, seed: number): Thinking {
  let cancelled = false;
  if (worker === undefined) worker = startWorker();
  const target = worker;
  const onPage = () => searchInSlices(position, seed, () => cancelled);
  if (!target) return { move: onPage(), cancel: () => (cancelled = true) };
  const id = nextId;
  nextId += 1;
  const fromWorker = new Promise<number[] | null>((resolve) => waiting.set(id, resolve));
  target.postMessage({ id, position, seed } satisfies ComputerRequest);
  return {
    move: fromWorker.then((path) => (cancelled ? null : (path ?? onPage()))),
    cancel: () => {
      cancelled = true;
      waiting.get(id)?.(null);
      waiting.delete(id);
    },
  };
}

/**
 * The computer thinks here, off the page, so that a search never holds up a tap or a
 * scroll on a slow phone or a Raspberry Pi's browser. One request at a time: a position
 * and a seed in, the squares of the chosen move out.
 */
import { chooseMove } from "./ai";
import type { Position } from "./engine";

export interface ComputerRequest {
  id: number;
  position: Position;
  seed: number;
}
export type ComputerResponse = { id: number; path: number[] } | { id: number; error: string };

self.onmessage = (event: MessageEvent<ComputerRequest>) => {
  const { id, position, seed } = event.data;
  try {
    self.postMessage({ id, path: chooseMove(position, seed).path } satisfies ComputerResponse);
  } catch (error) {
    self.postMessage({ id, error: String(error) } satisfies ComputerResponse);
  }
};

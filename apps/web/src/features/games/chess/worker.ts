/**
 * The computer thinks here, off the page, so that a search never holds up a tap or a
 * scroll on a slow phone or a Raspberry Pi's browser. One request at a time: a position,
 * a seed and a level in, the chosen move out in its long form ("e2e4").
 */
import { chooseMove, type Level } from "./ai";
import { moveCode, type Position } from "./engine";

export interface ComputerRequest {
  id: number;
  position: Position;
  seed: number;
  level: Level;
}
export type ComputerResponse = { id: number; code: string } | { id: number; error: string };

self.onmessage = (event: MessageEvent<ComputerRequest>) => {
  const { id, position, seed, level } = event.data;
  try {
    self.postMessage({ id, code: moveCode(chooseMove(position, seed, level)) } satisfies ComputerResponse);
  } catch (error) {
    self.postMessage({ id, error: String(error) } satisfies ComputerResponse);
  }
};

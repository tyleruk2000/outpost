/**
 * Peg solitaire (Games → Peg solitaire): its engine, pure, used by the web app to play
 * and tested with the server's tests. There is no randomness in it: every game starts
 * from the same board.
 */
export const PEG_SOLITAIRE_HOLES = 33;

export * from "./engine.ts";

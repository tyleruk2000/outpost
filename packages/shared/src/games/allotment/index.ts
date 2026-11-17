/**
 * The allotment (Games → Allotment): its engine, pure and shared by the server, which
 * applies every action with its own clock, and the web app, which draws the plot and
 * shows growth moving between fetches.
 */
export const ALLOTMENT_ENGINE_VERSION = 2;

export * from "./engine.ts";
export * from "./notes.ts";
export * from "./numbers.ts";

/**
 * The allotment's routes: the plot as it is now, and each action, applied with the
 * server's own clock. Filled in by the allotment's builder.
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import type { GameSaves } from "./index.ts";

export async function registerAllotment(_app: FastifyInstance, _ctx: AppContext, _saves: GameSaves): Promise<void> {}

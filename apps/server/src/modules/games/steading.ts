/**
 * The Steading's routes: the household's one settlement as it is now, and each action,
 * applied with the server's own clock so that devices with wrong clocks agree. The engine
 * is pure and shared (`packages/shared/src/games/steading`); this file only reads and
 * writes the settlement's row of `game_saves`.
 *
 * A GET never writes: it answers the stored settlement worked out to now, or a new one
 * that is not kept until its first action. A stored settlement that fails the engine's
 * check is never silently replaced; it is answered with an error saying so, and Start
 * again (`DELETE /api/games/steading`) is the way out.
 */
import {
  advance,
  applyAction,
  CONTRACT_IDS,
  GOOD_IDS,
  KIND_IDS,
  MODE_IDS,
  newSteading,
  readSteading,
  type SteadingAction,
  SteadingRefusal,
  type SteadingResponse,
  type SteadingState,
  VALLEY_HEIGHT,
  VALLEY_WIDTH,
} from "@outpost/shared/games/steading";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../core/errors.ts";
import type { GameSaves } from "./index.ts";

const id = z.number().int().min(1).max(1_000_000_000);
const good = z.enum(GOOD_IDS);
const mode = z.enum(MODE_IDS);
const count = z.number().int().min(1).max(100_000);

export const steadingActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("build"),
      kind: z.enum(KIND_IDS),
      x: z
        .number()
        .int()
        .min(0)
        .max(VALLEY_WIDTH - 1),
      y: z
        .number()
        .int()
        .min(0)
        .max(VALLEY_HEIGHT - 1),
    })
    .strict(),
  z.object({ type: z.literal("remove"), id }).strict(),
  z.object({ type: z.literal("route"), from: id, to: id, good, mode }).strict(),
  z.object({ type: z.literal("changeRoute"), id, mode }).strict(),
  z.object({ type: z.literal("removeRoute"), id }).strict(),
  z.object({ type: z.literal("routeFirst"), id }).strict(),
  z.object({ type: z.literal("pause"), id, paused: z.boolean() }).strict(),
  z.object({ type: z.literal("contract"), id, contract: z.enum(CONTRACT_IDS).nullable() }).strict(),
  z.object({ type: z.literal("clearYard"), id }).strict(),
  z.object({ type: z.literal("sell"), good, count }).strict(),
  z.object({ type: z.literal("buy"), good, count }).strict(),
]);

const damaged = () =>
  new AppError(
    "conflict",
    "The settlement kept on this Outpost could not be read: it may have been damaged. Start again to found a new one; the old one cannot be recovered here.",
    { damaged: true },
  );

function stored(state: Record<string, unknown>): SteadingState {
  const settlement = readSteading(state);
  if (!settlement) throw damaged();
  return settlement;
}

export async function registerSteading(app: FastifyInstance, saves: GameSaves): Promise<void> {
  app.get("/api/games/steading", async (): Promise<SteadingResponse> => {
    const row = saves.read("steading");
    const now = Date.now();
    const settlement = row ? advance(stored(row.state), now) : newSteading(now);
    return { settlement, now: Math.max(now, settlement.clock), started: row !== null };
  });

  app.post("/api/games/steading/actions", async (request): Promise<SteadingResponse> => {
    const action = steadingActionSchema.parse(request.body) as SteadingAction;
    return saves.update("steading", (row) => {
      const now = Date.now();
      const settlement = row ? stored(row.state) : newSteading(now);
      // The settlement's clock never runs backwards, whatever the server's clock does.
      const at = Math.max(now, settlement.clock);
      let next: SteadingState;
      try {
        next = applyAction(settlement, action, at);
      } catch (error) {
        if (error instanceof SteadingRefusal) throw new AppError("conflict", error.message);
        throw error;
      }
      return { state: next as unknown as Record<string, unknown>, result: { settlement: next, now: next.clock, started: true } };
    });
  });
}

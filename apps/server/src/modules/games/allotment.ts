/**
 * The allotment's routes: the household's one plot as it is now, and each action,
 * applied with the server's own clock so that devices with wrong clocks agree. The
 * engine is pure and shared (`packages/shared/src/games/allotment`); this file only
 * reads and writes the plot's row of `game_saves` and decides the hemisphere.
 *
 * A GET never writes: it answers the stored plot advanced to now, or a new plot that is
 * not kept until its first action. A stored plot that fails the engine's check is never
 * silently replaced; it is answered with an error saying so, and Start again (the
 * existing `DELETE /api/games/allotment`) is the way out.
 */
import {
  type AllotmentAction,
  AllotmentRefusal,
  type AllotmentResponse,
  type AllotmentState,
  advance,
  applyAction,
  BASKET_CAP,
  CROP_IDS,
  HEMISPHERE_SETTINGS,
  ITEM_IDS,
  MAX_BED_INDEX,
  newAllotment,
  PRODUCERS,
  readAllotment,
  resolveHemisphere,
  seasonAt,
  THING_IDS,
} from "@outpost/shared/games/allotment";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import type { GameSaves } from "./index.ts";

const bed = z.number().int().min(0).max(MAX_BED_INDEX);

export const allotmentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sow"), bed, crop: z.enum(CROP_IDS) }).strict(),
  z.object({ type: z.literal("water"), bed }).strict(),
  z.object({ type: z.literal("harvest"), bed }).strict(),
  z.object({ type: z.literal("harvestAll") }).strict(),
  z.object({ type: z.literal("collect"), thing: z.enum(PRODUCERS).optional() }).strict(),
  z
    .object({
      type: z.literal("sell"),
      item: z.enum(ITEM_IDS),
      count: z.union([z.number().int().min(1).max(BASKET_CAP), z.literal("all")]),
    })
    .strict(),
  z.object({ type: z.literal("sellAll") }).strict(),
  z.object({ type: z.literal("buyBed") }).strict(),
  z.object({ type: z.literal("buy"), thing: z.enum(THING_IDS) }).strict(),
  z.object({ type: z.literal("setHemisphere"), hemisphere: z.enum(HEMISPHERE_SETTINGS) }).strict(),
]);

const damaged = () =>
  new AppError(
    "conflict",
    "The allotment kept on this Outpost could not be read: it may have been damaged. Start again to dig a new plot; the old one cannot be recovered here.",
    { damaged: true },
  );

export async function registerAllotment(app: FastifyInstance, ctx: AppContext, saves: GameSaves): Promise<void> {
  /** The latitude of the first household's home (the game is one plot for the whole Outpost), or null. */
  function homeLatitude(): number | null {
    const households = ctx.services.households;
    return households.home(households.first().id)?.lat ?? null;
  }

  function answer(plot: AllotmentState, now: number, started: boolean): AllotmentResponse {
    const { hemisphere, from } = resolveHemisphere(plot.hemisphere, homeLatitude());
    const shown = advance(plot, now, hemisphere);
    return {
      plot: shown,
      now: shown.clock,
      hemisphere,
      hemisphereFrom: from,
      season: seasonAt(shown.clock, hemisphere),
      awayMs: started ? Math.max(0, shown.clock - shown.lastActionAt) : 0,
      started,
    };
  }

  function stored(state: Record<string, unknown>): AllotmentState {
    const plot = readAllotment(state);
    if (!plot) throw damaged();
    return plot;
  }

  app.get("/api/games/allotment", async () => {
    const row = saves.read("allotment");
    const now = Date.now();
    return row ? answer(stored(row.state), now, true) : answer(newAllotment(now), now, false);
  });

  app.post("/api/games/allotment/actions", async (request) => {
    const action = allotmentActionSchema.parse(request.body) as AllotmentAction;
    return saves.update("allotment", (row) => {
      const now = Date.now();
      const plot = row ? stored(row.state) : newAllotment(now);
      // The plot's clock never runs backwards, whatever the server's clock does.
      const at = Math.max(now, plot.clock);
      const { hemisphere } = resolveHemisphere(plot.hemisphere, homeLatitude());
      let next: AllotmentState;
      try {
        next = applyAction(plot, action, at, hemisphere);
      } catch (error) {
        if (error instanceof AllotmentRefusal) throw new AppError("conflict", error.message);
        throw error;
      }
      return { state: next as unknown as Record<string, unknown>, result: answer(next, at, true) };
    });
  });
}

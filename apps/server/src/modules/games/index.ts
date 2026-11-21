/**
 * Games (the Games section): what the server keeps for them, in `game_saves`, one row
 * per game. The games themselves run in the browser.
 *
 * - The allotment's row holds the household's one plot. Every change to it is an action
 *   the server applies with its own clock (`./allotment.ts`), so devices with wrong
 *   clocks agree.
 * - Solitaire, Peg solitaire, Sudoku, Draughts and Pairs keep a tally there: games played and won, and
 *   the best time or fewest moves, for each way of playing. An unfinished game of them
 *   stays in the browser it is being played in.
 *
 * Outpost has no accounts, so all of it is the household's. It is a person's own data:
 * counted and erased with the rest of it (`ctx.services.games.kept`, used by
 * modules/manage), counted on the Storage screen, and in the database a backup copies.
 */
import {
  GAME_COUNT_CAP,
  GAME_IDS,
  GAME_VARIANTS,
  type GameId,
  type GameResultInput,
  type GamesKept,
  type GamesResponse,
  type GameTally,
  type GameTallyEntry,
  TALLY_GAME_IDS,
  type TallyGameId,
} from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { gameSaves } from "../../db/schema.ts";
import { registerAllotment } from "./allotment.ts";
import { registerSteading } from "./steading.ts";

/** The most a row's state may be, written out as JSON. The allotment's is a few kilobytes. */
export const GAME_SAVE_MAX_BYTES = 64 * 1024;

/** One game's row, read and written with its version. */
export interface GameSaveRow {
  state: Record<string, unknown>;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface GameSaves {
  read(id: GameId): GameSaveRow | null;
  /**
   * Reads the row, lets `change` make the next state from it, and writes that, all in one
   * transaction, so that two changes at once are applied one after the other.
   */
  update<T>(id: GameId, change: (row: GameSaveRow | null) => { state: Record<string, unknown>; result: T }): T;
  remove(id: GameId): boolean;
}

export interface GamesService {
  get(): GamesResponse;
  recordResult(game: TallyGameId, input: GameResultInput): GameTally;
  /** Forgets one game's tally, or the allotment's plot. */
  clear(game: GameId): boolean;
  saves: GameSaves;
  /** The person's own: counted for "what is stored", and erased with everything else. */
  kept: { count(): GamesKept; eraseAll(): GamesKept };
}

declare module "../../core/context.ts" {
  interface Services {
    games: GamesService;
  }
}

const cap = (value: number) => Math.min(GAME_COUNT_CAP, Math.max(0, Math.floor(value)));

/** A tally as read back from the database: anything that is not a sound entry counts for nothing. */
function readTally(state: Record<string, unknown> | undefined): GameTally {
  const tally: GameTally = {};
  for (const [variant, raw] of Object.entries(state ?? {})) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<GameTallyEntry>;
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? cap(value) : null);
    tally[variant] = {
      played: number(entry.played) ?? 0,
      won: number(entry.won) ?? 0,
      bestSeconds: number(entry.bestSeconds),
      fewestMoves: number(entry.fewestMoves),
      fewestLeft: number(entry.fewestLeft),
      lastAt: number(entry.lastAt),
    };
  }
  return tally;
}

const resultInput = (game: TallyGameId) =>
  z
    .object({
      variant: z.enum(GAME_VARIANTS[game] as unknown as [string, ...string[]]),
      won: z.boolean(),
      // A day is longer than any game of these is played for in one sitting.
      seconds: z.number().int().min(0).max(86_400).optional(),
      moves: z.number().int().min(0).max(100_000).optional(),
      left: z.number().int().min(0).max(100).optional(),
    })
    .strict();

const tallyGame = z.enum(TALLY_GAME_IDS);
const anyGame = z.enum(GAME_IDS);

export async function registerGames(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, sqlite } = ctx;
  const changed = (game: GameId) => ctx.events.publish({ type: "games.changed", id: game });

  const saves: GameSaves = {
    read(id) {
      const row = db.select().from(gameSaves).where(eq(gameSaves.id, id)).get();
      return row ? { state: row.state, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt } : null;
    },
    update(id, change) {
      const result = sqlite.transaction(() => {
        const existing = saves.read(id);
        const next = change(existing);
        const text = JSON.stringify(next.state);
        if (Buffer.byteLength(text) > GAME_SAVE_MAX_BYTES)
          throw new AppError("too_large", `The ${id} save would be larger than ${GAME_SAVE_MAX_BYTES / 1024} KB, so it was not kept.`);
        const now = Date.now();
        if (existing) {
          db.update(gameSaves)
            .set({ state: next.state, version: existing.version + 1, updatedAt: now })
            .where(eq(gameSaves.id, id))
            .run();
        } else {
          db.insert(gameSaves).values({ id, state: next.state, version: 1, createdAt: now, updatedAt: now }).run();
        }
        return next.result;
      })();
      changed(id);
      return result;
    },
    remove(id) {
      const removed = db.delete(gameSaves).where(eq(gameSaves.id, id)).run().changes > 0;
      if (removed) changed(id);
      return removed;
    },
  };

  const kept: GamesService["kept"] = {
    count: () => ({ saves: (sqlite.prepare("SELECT count(*) AS n FROM game_saves").get() as { n: number }).n }),
    eraseAll() {
      const had = kept.count();
      sqlite.prepare("DELETE FROM game_saves").run();
      ctx.events.publish({ type: "games.changed" });
      return had;
    },
  };

  const service: GamesService = {
    get() {
      const tallies = Object.fromEntries(TALLY_GAME_IDS.map((game) => [game, readTally(saves.read(game)?.state)])) as Record<
        TallyGameId,
        GameTally
      >;
      return { tallies, allotmentStarted: saves.read("allotment") !== null };
    },
    recordResult(game, input) {
      return saves.update(game, (row) => {
        const tally = readTally(row?.state);
        const had = tally[input.variant] ?? { played: 0, won: 0, bestSeconds: null, fewestMoves: null, fewestLeft: null, lastAt: null };
        const better = (next: number | undefined, best: number | null) =>
          input.won && next !== undefined ? (best === null ? cap(next) : Math.min(best, cap(next))) : best;
        const entry: GameTallyEntry = {
          played: cap(had.played + 1),
          won: cap(had.won + (input.won ? 1 : 0)),
          bestSeconds: better(input.seconds, had.bestSeconds),
          fewestMoves: better(input.moves, had.fewestMoves),
          // What was left counts whether the game was won or not: fewer is better either way.
          fewestLeft:
            input.left === undefined
              ? (had.fewestLeft ?? null)
              : had.fewestLeft == null
                ? cap(input.left)
                : Math.min(had.fewestLeft, cap(input.left)),
          lastAt: Date.now(),
        };
        const next = { ...tally, [input.variant]: entry };
        return { state: next as Record<string, unknown>, result: next };
      });
    },
    clear: (game) => saves.remove(game),
    saves,
    kept,
  };
  ctx.services.games = service;

  app.get("/api/games", async () => service.get());
  app.post("/api/games/:game/results", async (request) => {
    const game = tallyGame.parse((request.params as { game: string }).game);
    return { tally: service.recordResult(game, resultInput(game).parse(request.body)) };
  });
  app.delete("/api/games/:game", async (request) => {
    const game = anyGame.parse((request.params as { game: string }).game);
    return { removed: service.clear(game) };
  });

  await registerAllotment(app, ctx, saves);
  await registerSteading(app, saves);
}

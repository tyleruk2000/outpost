/**
 * The Morse trainer (Radio → Morse trainer): what it keeps on the server. The trainer
 * itself runs in the browser (the engine is in @outpost/shared); the server keeps its
 * progress, the practice sessions behind the Progress tab and the adaptive weighting,
 * and a copy of its settings so that another device starts from them.
 *
 * Outpost has no accounts, so there is one record of progress and one list of
 * sessions for the whole copy. They are a person's own data: counted and erased with
 * the rest of it (`ctx.services.morse.kept`, used by modules/manage), counted on the
 * Storage screen, and in the database a backup copies.
 */
import {
  KOCH_LESSON_COUNT,
  MORSE_MAX_SESSIONS,
  MORSE_RECENT_SESSIONS,
  MORSE_SESSION_KINDS,
  type MorseKept,
  type MorseProgress,
  type MorseProgressInput,
  type MorseResponse,
  type MorseSession,
  type MorseSessionInput,
  type MorseSettings,
} from "@outpost/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { newId } from "../../core/ids.ts";
import { morseProgress, morseSessions } from "../../db/schema.ts";

export interface MorseService {
  get(): MorseResponse;
  updateProgress(patch: MorseProgressInput): MorseProgress;
  addSession(input: MorseSessionInput): MorseSession;
  /** Forgets the progress, the settings and every session ("Start again" on the Progress tab). */
  clear(): MorseKept;
  /** The person's own: counted for "what is stored", and erased with everything else. */
  kept: { count(): MorseKept; eraseAll(): MorseKept };
}

declare module "../../core/context.ts" {
  interface Services {
    morse: MorseService;
  }
}

/** The one row of progress. */
const ROW = "household";

const wpm = z.number().min(1).max(100);
const keyCode = z.string().min(1).max(40);

const settingsInput = z
  .object({
    charWpm: z.number().min(5).max(60),
    effWpm: z.number().min(2).max(60),
    toneHz: z.number().min(200).max(1500),
    volume: z.number().min(0).max(1),
    keyerWpm: z.number().min(5).max(60),
    keyType: z.enum(["straight", "paddle", "single", "bug"]),
    presetId: z.string().max(40),
    keyDit: keyCode,
    keyDah: keyCode,
    keyStraight: keyCode,
    swapPaddles: z.boolean(),
    groupCount: z.number().int().min(1).max(50),
    groupSize: z.number().int().min(1).max(10),
    echoWpm: z.number().min(5).max(40),
    echoAdaptive: z.boolean(),
    echoFarnsworth: z.boolean(),
    echoSilenceWords: z.number().int().min(1).max(4),
    echoContent: z.enum(["koch", "callsigns", "abbrev", "exchange"]),
    echoGroupSize: z.number().int().min(1).max(8),
    callsign: z
      .string()
      .trim()
      .max(20)
      .regex(/^[A-Za-z0-9/]*$/, "A callsign is letters, digits and /."),
  })
  .partial()
  .strict();

const lesson = z.number().int().min(1).max(KOCH_LESSON_COUNT);

const progressInput = z
  .object({ kochLesson: lesson.optional(), bestCharWpm: wpm.optional(), bestEffWpm: wpm.optional(), settings: settingsInput.optional() })
  .strict();

/** Character → count, bounded: a drill uses at most a few dozen characters, and up to 200 sessions come back with the progress. */
const charCounts = z
  .record(z.string().min(1).max(8), z.number().int().min(0).max(1000))
  .refine((counts) => Object.keys(counts).length <= 64, { message: "At most 64 characters." });

const sessionInput = z
  .object({
    kind: z.enum(MORSE_SESSION_KINDS),
    accuracy: z.number().min(0).max(1),
    charWpm: wpm.optional(),
    effWpm: wpm.optional(),
    rhythm: z.number().min(0).max(1).optional(),
    lesson: lesson.optional(),
    misses: charCounts.optional(),
    tries: charCounts.optional(),
  })
  .strict();

type SessionRow = typeof morseSessions.$inferSelect;

const toSession = (row: SessionRow): MorseSession => ({
  id: row.id,
  kind: row.kind as MorseSession["kind"],
  at: row.at,
  accuracy: row.accuracy,
  charWpm: row.charWpm,
  effWpm: row.effWpm,
  rhythm: row.rhythm,
  lesson: row.lesson,
  misses: row.misses ?? {},
  tries: row.tries ?? {},
});

export async function registerMorse(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { db, sqlite } = ctx;
  const changed = () => ctx.events.publish({ type: "morse.changed" });
  const count = (statement: string) => (sqlite.prepare(statement).get() as { n: number }).n;

  const readProgress = (): MorseProgress => {
    const row = db.select().from(morseProgress).where(eq(morseProgress.id, ROW)).get();
    return {
      kochLesson: row?.kochLesson ?? 1,
      bestCharWpm: row?.bestCharWpm ?? null,
      bestEffWpm: row?.bestEffWpm ?? null,
      settings: (row?.settings ?? {}) as MorseSettings,
      updatedAt: row?.updatedAt ?? 0,
    };
  };

  /** The station's own call in the latest entry of the contact log: the first end for a contact or a failed call, the second for one heard. */
  const suggestedCallsign = (): string | null => {
    const row = sqlite
      .prepare(
        `SELECT CASE WHEN outcome = 'heard' THEN rx_call ELSE tx_call END AS call FROM radio_observations
         WHERE (CASE WHEN outcome = 'heard' THEN rx_call ELSE tx_call END) <> '' ORDER BY at DESC LIMIT 1`,
      )
      .get() as { call: string } | undefined;
    return row ? row.call.trim().toUpperCase() : null;
  };

  const kept: MorseService["kept"] = {
    count: () => ({
      sessions: count("SELECT count(*) AS n FROM morse_sessions"),
      progress: count("SELECT count(*) AS n FROM morse_progress"),
    }),
    eraseAll() {
      const had = kept.count();
      sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM morse_sessions").run();
        sqlite.prepare("DELETE FROM morse_progress").run();
      })();
      changed();
      return had;
    },
  };

  const service: MorseService = {
    get() {
      const sessions = db.select().from(morseSessions).orderBy(desc(morseSessions.at)).limit(MORSE_RECENT_SESSIONS).all().map(toSession);
      const weakChars: Record<string, number> = {};
      for (const row of sqlite.prepare("SELECT misses FROM morse_sessions").all() as Array<{ misses: string }>) {
        let misses: Record<string, unknown> = {};
        try {
          misses = JSON.parse(row.misses) as Record<string, unknown>;
        } catch {
          // A row that cannot be read counts for nothing.
        }
        for (const [char, n] of Object.entries(misses)) if (typeof n === "number") weakChars[char] = (weakChars[char] ?? 0) + n;
      }
      return {
        progress: readProgress(),
        sessions,
        sessionCount: count("SELECT count(*) AS n FROM morse_sessions"),
        weakChars,
        suggestedCallsign: suggestedCallsign(),
      };
    },

    updateProgress(patch) {
      const existing = db.select().from(morseProgress).where(eq(morseProgress.id, ROW)).get();
      const now = Date.now();
      // Bests only ever go up.
      const best = (next: number | undefined, had: number | null | undefined) =>
        next === undefined ? (had ?? null) : Math.max(next, had ?? 0);
      const values = {
        kochLesson: patch.kochLesson ?? existing?.kochLesson ?? 1,
        bestCharWpm: best(patch.bestCharWpm, existing?.bestCharWpm),
        bestEffWpm: best(patch.bestEffWpm, existing?.bestEffWpm),
        settings: { ...(existing?.settings ?? {}), ...(patch.settings ?? {}) },
        updatedAt: now,
      };
      if (existing) db.update(morseProgress).set(values).where(eq(morseProgress.id, ROW)).run();
      else
        db.insert(morseProgress)
          .values({ id: ROW, ...values, createdAt: now })
          .run();
      changed();
      return readProgress();
    },

    addSession(input) {
      const row = {
        id: newId(),
        kind: input.kind,
        at: Date.now(),
        accuracy: input.accuracy,
        charWpm: input.charWpm ?? null,
        effWpm: input.effWpm ?? null,
        rhythm: input.rhythm ?? null,
        lesson: input.lesson ?? null,
        misses: input.misses ?? {},
        tries: input.tries ?? {},
      };
      sqlite.transaction(() => {
        db.insert(morseSessions).values(row).run();
        // The oldest go first beyond the limit, so that the list cannot grow without end.
        sqlite
          .prepare("DELETE FROM morse_sessions WHERE id IN (SELECT id FROM morse_sessions ORDER BY at DESC, id DESC LIMIT -1 OFFSET ?)")
          .run(MORSE_MAX_SESSIONS);
      })();
      // Passing a receive drill at a speed raises the bests.
      if (input.kind === "receive" && input.accuracy >= 0.9 && input.charWpm) {
        service.updateProgress({ bestCharWpm: input.charWpm, ...(input.effWpm ? { bestEffWpm: input.effWpm } : {}) });
      } else changed();
      return toSession(row);
    },

    clear: () => kept.eraseAll(),
    kept,
  };
  ctx.services.morse = service;

  app.get("/api/morse", async () => service.get());
  app.put("/api/morse/progress", async (request) => ({ progress: service.updateProgress(progressInput.parse(request.body)) }));
  app.post("/api/morse/sessions", async (request) => ({ session: service.addSession(sessionInput.parse(request.body)) }));
  app.delete("/api/morse", async () => ({ removed: service.clear() }));
}

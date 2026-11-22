/**
 * The household book: the wizard's answers, kept as a draft so that the questions can be
 * left and taken up again on any device, and the record of the last book made, with the
 * short summary the next book compares itself with ("what changed since").
 *
 * The book itself is made in the browser. What it reads from the reference layers, the
 * climate kept for home and the installed terrain is answered by `facts.ts`.
 */
import {
  BOOK_HAZARD_IDS,
  BOOK_LIMITS,
  BOOK_SECTION_IDS,
  BOOK_SOURCE_IDS,
  type BookAnswers,
  type BookInput,
  type BookMade,
  type BookMadeInput,
  type BookResponse,
  type BookSource,
  DEFAULT_BOOK_ANSWERS,
} from "@outpost/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { conflict } from "../../core/errors.ts";
import { householdBook } from "../../db/schema.ts";
import type { Fingerprints, SourceId } from "./fingerprints.ts";

/** What each thing the book is made from reads; its answers are fingerprinted by when they were saved. */
const BOOK_READS: Record<Exclude<BookSource, "answers">, SourceId[]> = {
  plans: ["plans"],
  contacts: ["contacts"],
  places: ["places"],
  medical: ["medical", "people"],
  comms: ["comms"],
  supplies: ["supplies", "people"],
};

const L = BOOK_LIMITS;
const ROW = "household";
const itemId = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max).default("");
const unique = (list: Array<{ id: string }>) => new Set(list.map((item) => item.id)).size === list.length;

export const bookSchema = z
  .object({
    householdName: text(L.short),
    people: z
      .array(z.object({ memberId: itemId, needs: text(L.text), carries: text(L.text), childCard: z.boolean().default(false) }).strict())
      .max(L.people)
      .default([]),
    emergencyNumber: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9 +#*]*$/, "Give the emergency number in figures: 999, 112, 911.")
      .default(""),
    meetingPoints: z
      .array(z.object({ id: itemId, markerId: itemId, role: z.enum(["near", "away"]), note: text(L.text) }).strict())
      .max(L.places)
      .refine(unique, "Two meeting points have the same id.")
      .default([]),
    destinations: z
      .array(
        z
          .object({
            id: itemId,
            name: z.string().trim().min(1, "Name the place: “Grandma's”.").max(L.short),
            markerId: itemId.nullable().default(null),
            contactId: itemId.nullable().default(null),
            note: text(L.text),
          })
          .strict(),
      )
      .max(L.places)
      .refine(unique, "Two places have the same id.")
      .default([]),
    vehicles: z
      .array(
        z
          .object({
            id: itemId,
            name: z.string().trim().min(1, "Name the vehicle: “The blue car”.").max(L.short),
            rangeKm: z.number().min(1).max(5000).nullable().default(null),
            seats: z.number().int().min(1).max(100).nullable().default(null),
            note: text(L.text),
          })
          .strict(),
      )
      .max(L.vehicles)
      .refine(unique, "Two vehicles have the same id.")
      .default([]),
    days: z.number().int().min(1).max(L.days).default(DEFAULT_BOOK_ANSWERS.days),
    hazards: z.array(z.enum(BOOK_HAZARD_IDS)).max(BOOK_HAZARD_IDS.length).default([]),
    receivers: z.array(z.string().min(1).max(40)).max(20).default([]),
    walkHoursPerDay: z.number().min(1).max(14).default(DEFAULT_BOOK_ANSWERS.walkHoursPerDay),
    paper: z.enum(["a4", "letter"]).default("a4"),
    sections: z
      .array(z.enum(BOOK_SECTION_IDS))
      .max(BOOK_SECTION_IDS.length)
      .default([...BOOK_SECTION_IDS]),
    notesPages: z.number().int().min(0).max(L.notesPages).default(DEFAULT_BOOK_ANSWERS.notesPages),
    medicalInFull: z.boolean().default(false),
    planChoice: z.enum(["all", "some"]).default("all"),
    planIds: z.array(itemId).max(200).default([]),
    baseAnswersAt: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const bookMadeSchema = z
  .object({
    pages: z.number().int().min(1).max(5000),
    sections: z.array(z.enum(BOOK_SECTION_IDS)).max(BOOK_SECTION_IDS.length),
    summary: z.record(z.string().max(60), z.array(z.string().max(400)).max(200)),
    /** The fingerprints of the answer the book was made from; left out, the server's own now are recorded. */
    fingerprints: z.partialRecord(z.enum(BOOK_SOURCE_IDS), z.string().max(64)).optional(),
  })
  .strict()
  .refine((made) => Object.keys(made.summary).length <= 40, "The summary has too many sections.");

export interface BookService {
  get(): BookResponse;
  save(input: BookInput): BookResponse;
  made(input: BookMadeInput): BookResponse;
  answers(): BookAnswers;
  count(): number;
  eraseAll(): number;
}

/** Answers kept by an older version may lack a field a newer one added: the default stands in for it. */
function withDefaults(stored: unknown): BookAnswers {
  const parsed = bookSchema.safeParse({ ...(stored as object) });
  if (!parsed.success) return { ...DEFAULT_BOOK_ANSWERS };
  const { baseAnswersAt: _base, ...answers } = parsed.data;
  return answers;
}

export function createBookService(ctx: AppContext, fingerprints: Fingerprints, changed: () => void): BookService {
  const { db } = ctx;
  const row = () => db.select().from(householdBook).where(eq(householdBook.id, ROW)).get();
  const now = (answersAt: number | null): Record<BookSource, string> => ({
    answers: String(answersAt ?? 0),
    ...(Object.fromEntries(Object.entries(BOOK_READS).map(([id, reads]) => [id, fingerprints.of(reads)])) as Record<
      Exclude<BookSource, "answers">,
      string
    >),
  });
  const staleOf = (made: BookMade | null, at: Record<BookSource, string>): BookSource[] =>
    made?.fingerprints ? BOOK_SOURCE_IDS.filter((id) => made.fingerprints![id] !== undefined && made.fingerprints![id] !== at[id]) : [];

  const service: BookService = {
    get() {
      const stored = row();
      if (!stored) return { answers: { ...DEFAULT_BOOK_ANSWERS }, answersAt: null, made: null, fingerprints: now(null), stale: [] };
      const made = (stored.made as BookMade | null) ?? null;
      const at = now(stored.answersAt);
      return { answers: withDefaults(stored.answers), answersAt: stored.answersAt, made, fingerprints: at, stale: staleOf(made, at) };
    },
    answers: () => service.get().answers,
    save(input) {
      const before = row();
      const at = before?.answersAt ?? null;
      if (input.baseAnswersAt !== undefined && at !== null && (input.baseAnswersAt === null || at > input.baseAnswersAt))
        throw conflict(
          "The book's answers were changed somewhere else after you opened them. Your changes were not saved over them; reload to see the newer answers.",
          { current: { updatedAt: at, name: "The household book" } },
        );
      const { baseAnswersAt: _base, ...answers } = input;
      const answersAt = Math.max(Date.now(), (at ?? 0) + 1);
      db.insert(householdBook)
        .values({ id: ROW, answers, answersAt, made: before?.made ?? null })
        .onConflictDoUpdate({ target: householdBook.id, set: { answers, answersAt } })
        .run();
      changed();
      return service.get();
    },
    made(input) {
      const before = row();
      const made: BookMade = {
        ...input,
        fingerprints: { ...now(before?.answersAt ?? null), ...(input.fingerprints ?? {}) },
        madeAt: Date.now(),
      };
      db.insert(householdBook)
        .values({ id: ROW, answers: before?.answers ?? DEFAULT_BOOK_ANSWERS, answersAt: before?.answersAt ?? null, made })
        .onConflictDoUpdate({ target: householdBook.id, set: { made } })
        .run();
      changed();
      return service.get();
    },
    count: () => (row() ? 1 : 0),
    eraseAll() {
      const had = service.count();
      db.delete(householdBook).run();
      changed();
      return had;
    },
  };
  return service;
}

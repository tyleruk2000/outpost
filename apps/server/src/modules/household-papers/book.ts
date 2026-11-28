/**
 * The household book: the wizard's answers, kept as a draft so that the questions can be
 * left and taken up again on any device, and the record of the last book made, with the
 * short summary the next book compares itself with ("what changed since").
 *
 * The book itself is made in the browser. What it reads from the reference layers, the
 * climate kept for home and the installed terrain is answered by `facts.ts`.
 */
import {
  BINDER_PART_SOURCES,
  type BinderStatus,
  BOOK_HAZARD_IDS,
  BOOK_LIMITS,
  BOOK_SECTION_IDS,
  BOOK_SOURCE_IDS,
  type BookAnswers,
  type BookInput,
  type BookMade,
  type BookMadeInput,
  type BookResponse,
  type BookSectionId,
  type BookSource,
  DEFAULT_BOOK_ANSWERS,
  REPEATER_MAP_CHOICES,
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
  radio: ["radioPlans"],
  repeaters: ["repeaters"],
  supplies: ["supplies", "people"],
};

/**
 * Sources only one section reads: a book made without that section is not old when they change. Repeaters are
 * everyone's and change with every list brought in, so a book with no radio frequencies is not called old by them.
 */
const ONLY_IN_SECTION: Partial<Record<BookSource, BookSectionId>> = { repeaters: "frequencies" };

const L = BOOK_LIMITS;
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
    grabCardSize: z.enum(["wallet", "a6"]).default("wallet"),
    planIds: z.array(itemId).max(200).default([]),
    radioPlanChoice: z.enum(["all", "some"]).default("all"),
    radioPlanIds: z.array(itemId).max(200).default([]),
    repeaterMapMost: z
      .union([z.literal(REPEATER_MAP_CHOICES[0]), z.literal(REPEATER_MAP_CHOICES[1]), z.literal(REPEATER_MAP_CHOICES[2])])
      .nullable()
      .default(null),
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
  const kept = { ...(stored as object) } as Record<string, unknown>;
  // A number of repeaters a map is limited to that is not one of the choices (kept by hand, or by an older version) reads as all.
  if (!REPEATER_MAP_CHOICES.includes(kept.repeaterMapMost as never)) kept.repeaterMapMost = null;
  const parsed = bookSchema.safeParse(kept);
  if (!parsed.success) return { ...DEFAULT_BOOK_ANSWERS };
  const { baseAnswersAt: _base, ...answers } = parsed.data;
  // Answers saved before the binder became part of the book (they have no `planChoice`) chose from fewer sections:
  // the binder's are added, so that a book made from them has everything the binder had.
  if (stored && typeof stored === "object" && !("planChoice" in stored)) {
    const sections = new Set([...answers.sections, ...SECTIONS_FROM_BINDER]);
    answers.sections = BOOK_SECTION_IDS.filter((id) => sections.has(id));
  }
  // Answers saved before radio plans went in the book (they have no `radioPlanChoice`) take the new section too.
  if (stored && typeof stored === "object" && !("radioPlanChoice" in stored) && !answers.sections.includes("radio-plans")) {
    const sections = new Set<BookSectionId>([...answers.sections, "radio-plans"]);
    answers.sections = BOOK_SECTION_IDS.filter((id) => sections.has(id));
  }
  return answers;
}

/** The sections the household binder brought into the book. */
const SECTIONS_FROM_BINDER: BookSectionId[] = ["fridge-sheets", "places", "frequencies", "supplies", "grab-cards"];

export function createBookService(
  ctx: AppContext,
  fingerprints: Fingerprints,
  changed: () => void,
  /** The old household binder's record, which stands in for the book until a book is made. */
  binder: () => BinderStatus = () => ({
    made: null,
    changedAt: {} as BinderStatus["changedAt"],
    fingerprints: {} as BinderStatus["fingerprints"],
    stale: [],
  }),
): BookService {
  const { db } = ctx;
  // One book for each household, keyed by its id; every call is for the current household.
  const rowId = () => ctx.services.households.currentId();
  const row = () => db.select().from(householdBook).where(eq(householdBook.id, rowId())).get();
  const now = (answersAt: number | null): Record<BookSource, string> => ({
    answers: String(answersAt ?? 0),
    ...(Object.fromEntries(Object.entries(BOOK_READS).map(([id, reads]) => [id, fingerprints.of(reads)])) as Record<
      Exclude<BookSource, "answers">,
      string
    >),
  });
  const staleOf = (made: BookMade | null, at: Record<BookSource, string>): BookSource[] =>
    made?.fingerprints
      ? BOOK_SOURCE_IDS.filter((id) => {
          const only = ONLY_IN_SECTION[id];
          return made.fingerprints![id] !== undefined && made.fingerprints![id] !== at[id] && (!only || made.sections.includes(only));
        })
      : [];

  /**
   * The binder is part of the book now. Until a book is made, the last binder made stands
   * in for it: dated as the binder was, and out of date in whatever the binder is.
   */
  const fromBinder = (): { made: BookMade; stale: BookSource[] } | null => {
    const status = binder();
    if (!status.made) return null;
    const stale = new Set<BookSource>(status.stale.flatMap((part) => BINDER_PART_SOURCES[part] ?? []));
    return {
      made: { madeAt: status.made.madeAt, pages: status.made.pages, sections: [], summary: {}, fromBinder: true },
      stale: BOOK_SOURCE_IDS.filter((id) => stale.has(id)),
    };
  };

  const service: BookService = {
    get() {
      const stored = row();
      const made = (stored?.made as BookMade | null | undefined) ?? null;
      const at = now(stored?.answersAt ?? null);
      const binderMade = made ? null : fromBinder();
      return {
        answers: stored ? withDefaults(stored.answers) : { ...DEFAULT_BOOK_ANSWERS },
        answersAt: stored?.answersAt ?? null,
        made: made ?? binderMade?.made ?? null,
        fingerprints: at,
        stale: made ? staleOf(made, at) : (binderMade?.stale ?? []),
      };
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
      ctx.services.households.ensure();
      db.insert(householdBook)
        .values({ id: rowId(), answers, answersAt, made: before?.made ?? null })
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
      ctx.services.households.ensure();
      db.insert(householdBook)
        .values({ id: rowId(), answers: before?.answers ?? DEFAULT_BOOK_ANSWERS, answersAt: before?.answersAt ?? null, made })
        .onConflictDoUpdate({ target: householdBook.id, set: { made } })
        .run();
      changed();
      return service.get();
    },
    /** Books kept, in every household. */
    count: () => db.select({ id: householdBook.id }).from(householdBook).all().length,
    eraseAll() {
      const had = service.count();
      db.delete(householdBook).run();
      changed();
      return had;
    },
  };
  return service;
}

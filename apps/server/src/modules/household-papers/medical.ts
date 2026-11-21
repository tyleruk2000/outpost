/**
 * Medical sheets: one for each person, holding what they typed for a relative or a
 * paramedic. Outpost has no accounts, so anyone who can reach it can read a plain sheet;
 * the screen says so, and offers to keep a sheet encrypted in the browser instead.
 *
 * A plain sheet is left out of search unless `medical.inSearch` is on, and out of the
 * tools a language model may call unless `tools.medical` is on (modules/tools/medical.ts).
 * An encrypted sheet is one armoured message the server cannot read: it is never in
 * search and never given to a tool, whatever the switches say.
 */
import {
  isArmoredMessage,
  MEDICAL_LIMITS,
  type MedicalRecord,
  type MedicalSheet,
  type MedicalSheetInput,
  medicineLeft,
} from "@outpost/shared";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { medicalSheets } from "../../db/schema.ts";

const L = MEDICAL_LIMITS;
const lineId = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max).default("");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the day it was counted as a date.")
  .nullable()
  .default(null);
const care = z
  .object({ contactId: z.string().max(64).nullable().default(null), name: text(L.short), phone: text(L.short) })
  .strict()
  .default({ contactId: null, name: "", phone: "" });

export const recordSchema = z
  .object({
    born: text(L.short),
    bloodGroup: text(20),
    allergies: z
      .array(
        z
          .object({ id: lineId, what: z.string().trim().min(1, "Say what the allergy is to.").max(L.short), reaction: text(L.text) })
          .strict(),
      )
      .max(L.lines)
      .default([]),
    conditions: z
      .array(z.object({ id: lineId, what: z.string().trim().min(1, "Name the condition.").max(L.short), note: text(L.text) }).strict())
      .max(L.lines)
      .default([]),
    medicines: z
      .array(
        z
          .object({
            id: lineId,
            name: z.string().trim().min(1, "Name the medicine.").max(L.short),
            dose: text(L.short),
            when: text(L.short),
            keptWhere: text(L.short),
            held: z.number().finite().min(0).max(L.held).nullable().default(null),
            unit: text(40),
            perDay: z.number().finite().min(0).max(1000).nullable().default(null),
            countedOn: day,
          })
          .strict(),
      )
      .max(L.lines)
      .default([]),
    gp: care,
    pharmacy: care,
    nextOfKin: z
      .array(
        z
          .object({
            id: lineId,
            contactId: z.string().max(64).nullable().default(null),
            name: text(L.short),
            phone: text(L.short),
            relation: text(L.short),
          })
          .strict(),
      )
      .max(L.lines)
      .default([]),
    notes: text(L.notes),
  })
  .strict();

export const sheetSchema = z
  .object({
    memberId: z.string().min(1).max(64).nullable().default(null),
    name: z.string().trim().min(1, "Say whose sheet this is.").max(L.short),
    record: recordSchema.optional(),
    armor: z.string().max(L.armor).optional(),
    baseUpdatedAt: z.number().optional(),
    removeEncryption: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, check) => {
    if ((input.record === undefined) === (input.armor === undefined))
      check.addIssue({ code: "custom", message: "Send the sheet, or its encrypted message, but not both.", path: ["record"] });
    if (input.armor !== undefined && !isArmoredMessage(input.armor))
      check.addIssue({ code: "custom", message: "The encrypted sheet is not an armoured OpenPGP message.", path: ["armor"] });
  });

type Row = typeof medicalSheets.$inferSelect;

export interface MedicalService {
  list(): MedicalSheet[];
  get(id: string): MedicalSheet;
  create(input: MedicalSheetInput): MedicalSheet;
  update(id: string, input: MedicalSheetInput): MedicalSheet;
  remove(id: string): void;
  /** Whether plain sheets are in search now. */
  inSearch(): boolean;
  /** When any sheet last changed; null with none. */
  changedAt(): number | null;
  count(): number;
  eraseAll(): number;
}

const toSheet = (row: Row): MedicalSheet => ({
  id: row.id,
  memberId: row.memberId,
  name: row.name,
  encrypted: row.armor !== null,
  record: row.armor === null ? (row.record as unknown as MedicalRecord) : null,
  armor: row.armor,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The words search holds for a plain sheet. */
function sections(record: MedicalRecord, today: string) {
  const lines = (items: string[]) => items.filter(Boolean).join("\n");
  return [
    {
      heading: "Medicines",
      text: lines(record.medicines.map((line) => [line.name, line.dose, line.when, line.keptWhere].filter(Boolean).join(", "))),
    },
    { heading: "Allergies", text: lines(record.allergies.map((line) => [line.what, line.reaction].filter(Boolean).join(": "))) },
    { heading: "Conditions", text: lines(record.conditions.map((line) => [line.what, line.note].filter(Boolean).join(": "))) },
    {
      heading: "Other",
      text: lines([record.bloodGroup ? `Blood group ${record.bloodGroup}` : "", record.notes]),
    },
    {
      heading: "Running low",
      text: lines(
        record.medicines.map((line) => {
          const left = medicineLeft(line, today);
          return left && left.days < 14 ? `${line.name}: runs out about ${left.runsOut}` : "";
        }),
      ),
    },
  ].filter((section) => section.text.trim());
}

export function createMedicalService(ctx: AppContext, changed: () => void): MedicalService {
  const { db, sqlite } = ctx;
  const search = () => ctx.services.search;
  const inSearch = () => ctx.services.settings.get("medical.inSearch");

  const rowOf = (id: string): Row => {
    const row = db.select().from(medicalSheets).where(eq(medicalSheets.id, id)).get();
    if (!row) throw notFound("That medical sheet is no longer in Outpost.");
    return row;
  };

  const index = (sheet: MedicalSheet) => {
    if (!inSearch() || sheet.encrypted || !sheet.record) {
      search().remove("medical", sheet.id);
      return;
    }
    search().upsert({
      kind: "medical",
      entityId: sheet.id,
      title: `Medical sheet: ${sheet.name}`,
      collection: "Medical sheets",
      url: `/prepare/medical/${sheet.id}`,
      tags: [],
      sections: sections(sheet.record, new Date().toISOString().slice(0, 10)),
    });
  };

  const reindexAll = () => {
    for (const sheet of service.list()) index(sheet);
  };

  let searchWas = inSearch();
  ctx.services.settings.onChange((settings) => {
    if (settings["medical.inSearch"] === searchWas) return;
    searchWas = settings["medical.inSearch"];
    reindexAll();
    changed();
  });

  const columns = (input: MedicalSheetInput) => ({
    memberId: input.memberId,
    name: input.name,
    record: input.record ? (input.record as unknown as Record<string, unknown>) : null,
    armor: input.armor ? input.armor.trim() : null,
  });

  const service: MedicalService = {
    list: () => db.select().from(medicalSheets).orderBy(asc(medicalSheets.name), asc(medicalSheets.createdAt)).all().map(toSheet),
    get: (id) => toSheet(rowOf(id)),
    create(input) {
      if (service.count() >= L.sheets) throw badRequest(`Outpost holds up to ${L.sheets} medical sheets.`);
      const now = Date.now();
      const id = newId();
      db.insert(medicalSheets)
        .values({ id, ...columns(input), createdAt: now, updatedAt: now })
        .run();
      const sheet = service.get(id);
      index(sheet);
      changed();
      return sheet;
    },
    update(id, input) {
      const row = rowOf(id);
      if (input.baseUpdatedAt !== undefined && row.updatedAt > input.baseUpdatedAt)
        throw conflict(
          "This medical sheet was changed somewhere else after you opened it. Your changes were not saved over it; reload to see the newer version.",
          { current: { updatedAt: row.updatedAt, name: row.name } },
        );
      if (row.armor !== null && input.record !== undefined && !input.removeEncryption)
        throw badRequest("This sheet is encrypted. Saving it unencrypted would take the encryption off, so it was not saved.");
      db.update(medicalSheets)
        .set({ ...columns(input), updatedAt: Math.max(Date.now(), row.updatedAt + 1) })
        .where(eq(medicalSheets.id, id))
        .run();
      const sheet = service.get(id);
      index(sheet);
      changed();
      return sheet;
    },
    remove(id) {
      rowOf(id);
      db.delete(medicalSheets).where(eq(medicalSheets.id, id)).run();
      search().remove("medical", id);
      changed();
    },
    inSearch,
    changedAt: () => (sqlite.prepare("SELECT max(updated_at) AS at FROM medical_sheets").get() as { at: number | null }).at,
    count: () => (sqlite.prepare("SELECT count(*) AS n FROM medical_sheets").get() as { n: number }).n,
    eraseAll() {
      const sheets = service.list();
      for (const sheet of sheets) search().remove("medical", sheet.id);
      sqlite.prepare("DELETE FROM medical_sheets").run();
      changed();
      return sheets.length;
    },
  };
  return service;
}

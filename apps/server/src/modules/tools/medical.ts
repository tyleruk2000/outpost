/**
 * Medical sheets: what each person in the household recorded for whoever has to be
 * told, from `ctx.services.householdPapers.medical` (the screen's own). Off until a
 * person turns the area on (`tools.medical`). Encrypted sheets are never read: the server
 * holds them only as messages it cannot open, and the answer says how many there are.
 *
 * Names and numbers of the GP, pharmacy and next of kin are left out, as contacts are
 * never given to a model. The answer is what was typed; it carries the sheet's caveat.
 */
import { MEDICAL_CAVEAT, medicineLeft } from "@outpost/shared";
import { z } from "zod";
import { dayOf, defineTool, type ToolDefinition } from "./types.ts";

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const medicalSheets = defineTool({
  name: "medical_sheets",
  title: "medical sheets",
  area: "medical",
  description:
    "What each person in the household recorded on their medical sheet: medicines with dose and where they are kept, allergies, conditions and blood group. Give person, a name, to read one sheet. Records only, never advice.",
  input: z.object({
    person: z.string().trim().min(1).max(120).optional().describe('A person\'s name, e.g. "Sam". Leave out to list whose sheets are held.'),
  }),
  run({ person }, { ctx, now }) {
    const sheets = ctx.services.householdPapers.medical.list();
    const plain = sheets.filter((sheet) => !sheet.encrypted && sheet.record);
    const locked = sheets.length - plain.length;
    const lockedLine = locked > 0 ? `${locked} sheet${locked === 1 ? " is" : "s are"} encrypted and cannot be read here.` : null;
    if (plain.length === 0) {
      return {
        held: false,
        url: "/prepare/medical",
        text: ["No medical sheet can be read. Sheets are made under Preparedness → Medical sheets.", lockedLine].filter(Boolean).join(" "),
      };
    }
    if (!person) {
      return {
        held: true,
        label: `${plain.length} sheet${plain.length === 1 ? "" : "s"}`,
        url: "/prepare/medical",
        text: [
          "Medical sheets held:",
          ...plain.map((sheet) => `- ${sheet.name}, changed ${dayOf(sheet.updatedAt)}`),
          lockedLine,
          "Ask again with person to read one.",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    const asked = fold(person);
    const sheet = plain.find((entry) => fold(entry.name) === asked) ?? plain.find((entry) => fold(entry.name).includes(asked));
    if (!sheet?.record) {
      return {
        held: false,
        url: "/prepare/medical",
        text: [`No readable medical sheet for "${person}". Readable sheets: ${plain.map((entry) => entry.name).join(", ")}.`, lockedLine]
          .filter(Boolean)
          .join(" "),
      };
    }
    const { record } = sheet;
    const today = new Date(now).toISOString().slice(0, 10);
    const medicines = record.medicines.map((line) => {
      const left = medicineLeft(line, today);
      const lasts = left ? `; about ${Math.floor(left.days)} days left by the count of ${dayOf(Date.parse(line.countedOn ?? today))}` : "";
      return `- ${line.name}${line.dose ? `, ${line.dose}` : ""}${line.when ? `, ${line.when}` : ""}${line.keptWhere ? ` (kept: ${line.keptWhere})` : ""}${lasts}`;
    });
    return {
      held: true,
      label: `${sheet.name}, changed ${dayOf(sheet.updatedAt)}`,
      url: `/prepare/medical/${sheet.id}`,
      text: [
        `Medical sheet: ${sheet.name}, last changed ${dayOf(sheet.updatedAt)}. ${MEDICAL_CAVEAT}`,
        `Blood group: ${record.bloodGroup || "not recorded"}.`,
        record.allergies.length > 0
          ? `Allergies: ${record.allergies.map((line) => (line.reaction ? `${line.what} (${line.reaction})` : line.what)).join("; ")}.`
          : "Allergies: none recorded.",
        record.conditions.length > 0
          ? `Conditions: ${record.conditions.map((line) => (line.note ? `${line.what} (${line.note})` : line.what)).join("; ")}.`
          : "Conditions: none recorded.",
        medicines.length > 0 ? "Medicines:" : "Medicines: none recorded.",
        ...medicines,
        record.notes ? `Notes: ${record.notes.slice(0, 600)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const MEDICAL_TOOLS: ToolDefinition[] = [medicalSheets];

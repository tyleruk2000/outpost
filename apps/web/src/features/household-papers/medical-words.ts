/**
 * A medical sheet in words: on screen, on its printed page, on the grab card and in the
 * binder. Contacts linked from Contacts are named as they are now; one deleted since is
 * named as it was and said to be missing. Nothing here touches the page or the network.
 */
import {
  type CareContact,
  daysWords,
  type KinLine,
  MEDICAL_CAVEAT,
  type MedicalRecord,
  type MedicalSheet,
  type MedicineLine,
  medicineLeft,
  type ResolvedContact,
} from "@outpost/shared";
import type { Block } from "@/features/propagation/plans/document";
import type { OpenedSheet } from "./medical-crypto";

export type ContactsNow = Record<string, ResolvedContact | null | undefined>;

/** The sheet's record as this device can read it: plain, or opened here from the very message stored. */
export function recordOf(sheet: MedicalSheet, opened: ReadonlyMap<string, OpenedSheet>): MedicalRecord | null {
  if (!sheet.encrypted) return sheet.record;
  const held = opened.get(sheet.id);
  return held && held.armor === sheet.armor ? held.record : null;
}

/** Every contact id a record links to. */
export const contactIdsOf = (record: MedicalRecord | null): string[] =>
  record
    ? [record.gp.contactId, record.pharmacy.contactId, ...record.nextOfKin.map((kin) => kin.contactId)].filter((id): id is string => !!id)
    : [];

/** A person or a surgery to reach: name and number, as they are now. */
export function reach(
  entry: Pick<CareContact, "contactId" | "name" | "phone">,
  contacts: ContactsNow,
): { name: string; phone: string; missing: boolean } {
  if (entry.contactId) {
    const now = contacts[entry.contactId];
    if (now) return { name: now.displayName, phone: now.phones[0]?.value ?? "", missing: false };
    return { name: entry.name, phone: "", missing: now === null };
  }
  return { name: entry.name.trim(), phone: entry.phone.trim(), missing: false };
}

export const reachLine = (entry: Pick<CareContact, "contactId" | "name" | "phone">, contacts: ContactsNow, relation = ""): string => {
  const { name, phone, missing } = reach(entry, contacts);
  if (!name && !phone) return "";
  const who = [name, relation ? `(${relation})` : ""].filter(Boolean).join(" ");
  return [who, phone, missing ? "no longer in Contacts" : ""].filter(Boolean).join(", ");
};

/** "500 mg, morning and night, kept in the kitchen cupboard". */
export const medicineText = (line: MedicineLine) =>
  [line.name, line.dose, line.when, line.keptWhere ? `kept: ${line.keptWhere}` : ""].filter((part) => part.trim()).join(", ");

/** "about 9 days left, runs out about 30 Nov 2026", or null when it is not counted. */
export function medicineLeftWords(line: MedicineLine, today: string): string | null {
  const left = medicineLeft(line, today);
  if (!left) return null;
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${left.runsOut}T00:00:00Z`),
  );
  if (left.days <= 0) return "none left by the count";
  return `${daysWords(left.days)} left, runs out about ${day}`;
}

export const kinLines = (kin: KinLine[], contacts: ContactsNow) =>
  kin.map((entry) => reachLine(entry, contacts, entry.relation)).filter(Boolean);

/** One person's sheet as blocks for the PDF writer: a page of its own, in the order a paramedic asks. */
export function medicalBlocks(name: string, record: MedicalRecord, contacts: ContactsNow, today: string, title = true): Block[] {
  const blocks: Block[] = [];
  blocks.push(title ? { kind: "title", text: `Medical sheet: ${name}` } : { kind: "heading", text: `Medical sheet: ${name}` });
  const facts = [record.born ? `Born ${record.born}` : "", `Blood group: ${record.bloodGroup.trim() || "not known"}`].filter(Boolean);
  blocks.push({ kind: "para", text: `${facts.join(". ")}.` });
  blocks.push({ kind: "heading", text: "Allergies" });
  blocks.push(
    record.allergies.length > 0
      ? { kind: "list", items: record.allergies.map((line) => (line.reaction ? `${line.what}: ${line.reaction}` : line.what)) }
      : { kind: "para", text: "None recorded." },
  );
  blocks.push({ kind: "heading", text: "Medicines" });
  blocks.push(
    record.medicines.length > 0
      ? {
          kind: "table",
          head: ["Medicine", "Dose", "When", "Kept", "Left"],
          rows: record.medicines.map((line) => [line.name, line.dose, line.when, line.keptWhere, medicineLeftWords(line, today) ?? ""]),
        }
      : { kind: "para", text: "None recorded." },
  );
  blocks.push({ kind: "heading", text: "Conditions" });
  blocks.push(
    record.conditions.length > 0
      ? { kind: "list", items: record.conditions.map((line) => (line.note ? `${line.what}: ${line.note}` : line.what)) }
      : { kind: "para", text: "None recorded." },
  );
  const care = [
    ["GP", reachLine(record.gp, contacts)],
    ["Pharmacy", reachLine(record.pharmacy, contacts)],
  ].filter(([, text]) => text);
  const kin = kinLines(record.nextOfKin, contacts);
  if (care.length > 0 || kin.length > 0) {
    blocks.push({ kind: "heading", text: "Who to tell" });
    blocks.push({
      kind: "list",
      items: [...care.map(([label, text]) => `${label}: ${text}`), ...kin.map((line) => `Next of kin: ${line}`)],
    });
  }
  if (record.notes.trim()) {
    blocks.push({ kind: "heading", text: "Notes" });
    blocks.push({ kind: "para", text: record.notes.trim() });
  }
  blocks.push({ kind: "para", text: MEDICAL_CAVEAT });
  return blocks;
}

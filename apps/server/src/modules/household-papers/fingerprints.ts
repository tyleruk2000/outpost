/**
 * What the binder and the book are made from, each as one short fingerprint: a hash of
 * every row of what a part reads, as it stands. Recorded when a binder or book is made
 * and compared with the fingerprint now, it changes with any change at all, a deletion
 * included, which a "newest change" time cannot show.
 *
 * The binder and the book are dated by content, so what is hashed is each row's id and
 * the time it last changed, not things that are not content. Each is for the current
 * household: its plans, sheets, plan for keeping in touch, people and supplies.
 */
import crypto from "node:crypto";
import type { BinderPart } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { MEDICAL_SHEETS_OF_HOUSEHOLD, medicalSheetsParams } from "./medical.ts";

export type SourceId = "plans" | "emergencyContacts" | "contacts" | "places" | "medical" | "comms" | "people" | "supplies" | "radioPlans";

/** Which household a fingerprint is for: its id, and the first household's (which keeps the sheets of nobody's household). */
interface Scope {
  household: string;
  first: string;
}

/** A query and its parameters for one household. */
type Query = (scope: Scope) => [string, ...unknown[]];

// Each row's id and when it was last changed: a change, an addition or a deletion each changes the hash. What is
// not content (a plan's ticks, when the shopping list was last worked out) is left out, so it does not call a binder old.
// What is kept for each household is read for the one asked about; contacts and places are everyone's. With one
// household the rows (and so the fingerprints) are what they were before there were several.
const SOURCES: Record<SourceId, Query[]> = {
  plans: [({ household }) => ["SELECT id, updated_at FROM emergency_plans WHERE household_id = ? ORDER BY id", household]],
  emergencyContacts: [() => ["SELECT id, updated_at FROM contacts WHERE is_emergency = 1 ORDER BY id"]],
  contacts: [() => ["SELECT id, updated_at FROM contacts ORDER BY id"]],
  places: [() => ["SELECT id, updated_at FROM markers ORDER BY id"]],
  medical: [
    ({ household, first }) => [
      `SELECT id, updated_at FROM medical_sheets WHERE ${MEDICAL_SHEETS_OF_HOUSEHOLD} ORDER BY id`,
      ...medicalSheetsParams(household, first),
    ],
  ],
  comms: [({ household }) => ["SELECT id, updated_at FROM comms_plans WHERE id = ? ORDER BY id", household]],
  // Radio plans are everyone's; a matrix worked out again changes the plan's result key.
  radioPlans: [() => ["SELECT id, updated_at, result_key FROM communication_plans ORDER BY id"]],
  people: [
    ({ household }) => [
      "SELECT id, updated_at FROM supply_members WHERE id IN (SELECT person_id FROM household_people WHERE household_id = ?) ORDER BY id",
      household,
    ],
  ],
  supplies: [
    ({ household }) => ["SELECT id, updated_at, stock_changed_at FROM supply_household WHERE id = ? ORDER BY id", household],
    ({ household }) => ["SELECT id, updated_at FROM supply_items WHERE household_id = ? ORDER BY id", household],
  ],
};

/** Which sources each part of the binder is made from. */
export const BINDER_SOURCES: Record<BinderPart, SourceId[]> = {
  plans: ["plans"],
  contacts: ["emergencyContacts"],
  comms: ["comms", "contacts", "people"],
  "grab-cards": ["medical", "emergencyContacts", "contacts", "plans", "places", "comms", "people"],
  medical: ["medical", "people", "contacts"],
  frequencies: ["comms"],
  places: ["places", "plans"],
  supplies: ["supplies", "people"],
};

export interface Fingerprints {
  /** One fingerprint for each source named, in the order given, for the current household. */
  of(sources: readonly SourceId[]): string;
  binder(): Record<BinderPart, string>;
}

export function createFingerprints(ctx: AppContext): Fingerprints {
  const scope = (): Scope => ({ household: ctx.services.households.currentId(), first: ctx.services.households.first().id });
  const hashOf = (source: SourceId, hash: crypto.Hash, at: Scope) => {
    hash.update(`${source}\n`);
    for (const query of SOURCES[source]) {
      try {
        const [sql, ...params] = query(at);
        for (const row of ctx.sqlite.prepare(sql).iterate(...params)) hash.update(`${JSON.stringify(row)}\n`);
      } catch {
        // A table this build does not have reads as empty.
      }
    }
  };
  const of = (sources: readonly SourceId[]) => {
    const hash = crypto.createHash("sha256");
    const at = scope();
    for (const source of sources) hashOf(source, hash, at);
    return hash.digest("base64url").slice(0, 22);
  };
  return {
    of,
    binder: () =>
      Object.fromEntries(Object.entries(BINDER_SOURCES).map(([part, sources]) => [part, of(sources)])) as Record<BinderPart, string>,
  };
}

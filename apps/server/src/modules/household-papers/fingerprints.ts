/**
 * What the binder and the book are made from, each as one short fingerprint: a hash of
 * every row of what a part reads, as it stands. Recorded when a binder or book is made
 * and compared with the fingerprint now, it changes with any change at all, a deletion
 * included, which a "newest change" time cannot show.
 *
 * The binder and the book are dated by content, so what is hashed is each row's id and
 * the time it last changed, not things that are not content.
 */
import crypto from "node:crypto";
import type { BinderPart } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";

export type SourceId = "plans" | "emergencyContacts" | "contacts" | "places" | "medical" | "comms" | "people" | "supplies";

// Each row's id and when it was last changed: a change, an addition or a deletion each changes the hash. What is
// not content (a plan's ticks, when the shopping list was last worked out) is left out, so it does not call a binder old.
const SOURCES: Record<SourceId, string[]> = {
  plans: ["SELECT id, updated_at FROM emergency_plans ORDER BY id"],
  emergencyContacts: ["SELECT id, updated_at FROM contacts WHERE is_emergency = 1 ORDER BY id"],
  contacts: ["SELECT id, updated_at FROM contacts ORDER BY id"],
  places: ["SELECT id, updated_at FROM markers ORDER BY id"],
  medical: ["SELECT id, updated_at FROM medical_sheets ORDER BY id"],
  comms: ["SELECT id, updated_at FROM comms_plans ORDER BY id"],
  people: ["SELECT id, updated_at FROM supply_members ORDER BY id"],
  supplies: [
    "SELECT id, updated_at, stock_changed_at FROM supply_household ORDER BY id",
    "SELECT id, updated_at FROM supply_items ORDER BY id",
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
  /** One fingerprint for each source named, in the order given. */
  of(sources: readonly SourceId[]): string;
  binder(): Record<BinderPart, string>;
}

export function createFingerprints(ctx: AppContext): Fingerprints {
  const hashOf = (source: SourceId, hash: crypto.Hash) => {
    hash.update(`${source}\n`);
    for (const query of SOURCES[source]) {
      try {
        for (const row of ctx.sqlite.prepare(query).iterate()) hash.update(`${JSON.stringify(row)}\n`);
      } catch {
        // A table this build does not have reads as empty.
      }
    }
  };
  const of = (sources: readonly SourceId[]) => {
    const hash = crypto.createHash("sha256");
    for (const source of sources) hashOf(source, hash);
    return hash.digest("base64url").slice(0, 22);
  };
  return {
    of,
    binder: () =>
      Object.fromEntries(Object.entries(BINDER_SOURCES).map(([part, sources]) => [part, of(sources)])) as Record<BinderPart, string>,
  };
}

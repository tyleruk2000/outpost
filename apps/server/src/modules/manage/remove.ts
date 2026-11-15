/**
 * Removing one installed thing, by the rules the Library already works to. Every bulk
 * action in this module goes through here, one entry at a time, so there is one set of
 * rules and not a second, looser one for clean-ups:
 *
 *  - the collections and documents services do the removing; nothing here deletes a
 *    file of a person's library itself;
 *  - a catalogue item and its documents go together;
 *  - a file on a location that is not connected cannot be deleted, only forgotten, and
 *    only when the caller said that is wanted;
 *  - anything being moved or checked is refused.
 */
import type { NamedFile } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError, messageOf } from "../../core/errors.ts";
import { type Entry, fileOf, type Inventory } from "./inventory.ts";

export interface RemovePolicy {
  /** "delete" removes the files too; "keep" removes only Outpost's records. */
  files: "delete" | "keep";
  /** What to do with something whose location is not connected. */
  disconnected: "forget" | "leave";
  /**
   * What to do with a file outside the folders Outpost made (an archive of the person's
   * own that Outpost was pointed at). "delete" treats it like any other; "forget" never
   * deletes it.
   */
  outside: "delete" | "forget";
}

export type RemoveOutcome =
  | { outcome: "removed"; bytes: number }
  | { outcome: "forgotten"; bytes: number; file: NamedFile }
  | { outcome: "left"; file: NamedFile; reason: string }
  | { outcome: "failed"; reason: string };

const isNotFound = (error: unknown) => error instanceof AppError && error.code === "not_found";

/** What will happen to an entry under a policy, without doing it. */
export function foresee(ctx: AppContext, entry: Entry, policy: RemovePolicy): "remove" | "forget" | "leave" | "refuse" {
  if (entry.item.busyReason) return "refuse";
  if (policy.files === "keep") return "forget";
  if (!entry.item.inOutpostFolder && policy.outside === "forget") return "forget";
  if (!ctx.services.storage.isAvailable(entry.item.locationId)) return policy.disconnected === "forget" ? "forget" : "leave";
  return "remove";
}

export async function removeEntry(ctx: AppContext, inventory: Inventory, entry: Entry, policy: RemovePolicy): Promise<RemoveOutcome> {
  const { collections, documents, storage } = ctx.services;
  const file = fileOf(ctx, entry);

  // Asked again now, not trusted from when the list was made.
  if (entry.collection && collections.isBusy(entry.collection.id)) {
    return { outcome: "failed", reason: "It is being moved or checked. Wait for that to finish, or cancel it under Downloads." };
  }
  for (const document of entry.documents) {
    const busy = inventory.documentBusy(document.id);
    if (busy) return { outcome: "failed", reason: busy };
  }

  const plan = foresee(ctx, { ...entry, item: { ...entry.item, busyReason: null } }, policy);
  if (plan === "leave") {
    return { outcome: "left", file, reason: `"${entry.item.locationName}" is not connected, so its files cannot be deleted from here.` };
  }
  const deleteFiles = plan === "remove";

  try {
    if (entry.collection && collections.get(entry.collection.id)) {
      // With its files, this also removes a document that is the same file.
      await collections.remove(entry.collection.id, { deleteFiles }).catch((error) => {
        if (!isNotFound(error)) throw error;
      });
    }
    for (const document of entry.documents) {
      // A document can sit on another location than the item it belongs to.
      const forget = !deleteFiles || !storage.isAvailable(document.locationId);
      await documents.remove(document.id, { forget }).catch((error) => {
        if (!isNotFound(error)) throw error;
      });
    }
    // The catalogue's note of a sheet follows its document out; make sure it has gone.
    if (entry.collection && collections.get(entry.collection.id)) {
      await collections.remove(entry.collection.id, { deleteFiles: false }).catch((error) => {
        if (!isNotFound(error)) throw error;
      });
    }
  } catch (error) {
    return { outcome: "failed", reason: messageOf(error) };
  }
  return deleteFiles ? { outcome: "removed", bytes: entry.item.sizeBytes } : { outcome: "forgotten", bytes: entry.item.sizeBytes, file };
}

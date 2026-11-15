/** How installed collections are grouped, named and described. Pure, so the rules can be tested. */
import type { CollectionDto, CollectionKind, CollectionVerifyResult, JobDto } from "@outpost/shared";

export const kindLabels: Record<CollectionKind, string> = {
  zim: "Reference collection",
  map: "Map",
  terrain: "Terrain",
  places: "Place names",
  file: "File",
  model: "Search model",
};

/** The headings of the Collections tab, in the order they are shown. */
export const collectionGroups: Array<{ id: string; title: string; kinds: CollectionKind[] }> = [
  { id: "reference", title: "Reference collections", kinds: ["zim"] },
  { id: "maps", title: "Maps", kinds: ["map", "terrain"] },
  { id: "places", title: "Place names", kinds: ["places"] },
  { id: "files", title: "Files", kinds: ["file"] },
  { id: "models", title: "Search models", kinds: ["model"] },
];

export function groupCollections<T extends Pick<CollectionDto, "kind" | "title">>(
  collections: T[],
): Array<{ id: string; title: string; collections: T[] }> {
  return collectionGroups
    .map((group) => ({
      id: group.id,
      title: group.title,
      collections: collections
        .filter((item) => group.kinds.includes(item.kind))
        .sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true })),
    }))
    .filter((group) => group.collections.length > 0);
}

/**
 * Where a collection is used: the reader for reference collections, the map for maps,
 * and the document viewer for a file that became a document (a PDF from the catalogue,
 * a reference sheet). Its own page only describes and manages it.
 */
export function openTarget(collection: Pick<CollectionDto, "id" | "kind" | "meta">): { to: string; label: string } | null {
  if (collection.kind === "zim") return { to: `/library/read/${collection.id}/`, label: "Read" };
  const documentId = collection.meta?.documentId;
  if (typeof documentId === "string" && documentId) return { to: `/library/documents/${documentId}`, label: "Read" };
  if (collection.kind === "map" || collection.kind === "terrain") return { to: "/maps", label: "Open in Maps" };
  return null;
}

type Standing = Pick<CollectionDto, "locationAvailable" | "locationName" | "status" | "updateAvailable">;

/** The files are where Outpost expects them and can be read right now. A move reads the original until it is done. */
export function filesReachable(collection: Standing): boolean {
  return collection.locationAvailable && (collection.status === "installed" || collection.status === "moving");
}

export interface CollectionNote {
  kind: "disconnected" | "missing" | "damaged" | "moving" | "update";
  tone: "warning" | "danger" | "lamp" | "primary";
  text: string;
}

/** What to say about a collection in a list, or null when it is simply fine. The most pressing thing wins. */
export function collectionNote(collection: Standing): CollectionNote | null {
  if (!collection.locationAvailable)
    return { kind: "disconnected", tone: "warning", text: `Unavailable: “${collection.locationName}” is not connected` };
  if (collection.status === "missing")
    return { kind: "missing", tone: "danger", text: `The file is missing from “${collection.locationName}”` };
  if (collection.status === "damaged") return { kind: "damaged", tone: "danger", text: "The file no longer matches its checksum" };
  if (collection.status === "moving") return { kind: "moving", tone: "lamp", text: "Being moved to another location" };
  if (collection.updateAvailable) return { kind: "update", tone: "primary", text: "A newer version is available" };
  return null;
}

// ── Removing ──

export type RemoveChoice = "delete" | "keep";

/**
 * Which ways of removing are possible. Files on a disconnected location cannot be
 * deleted, so only the record can go, and that choice is then made for the person.
 */
export function removeChoices(collection: Pick<CollectionDto, "locationAvailable">): {
  canDeleteFiles: boolean;
  initial: RemoveChoice | undefined;
} {
  return collection.locationAvailable ? { canDeleteFiles: true, initial: undefined } : { canDeleteFiles: false, initial: "keep" };
}

export function removeLabel(choice: RemoveChoice | undefined): string {
  if (choice === "delete") return "Delete collection and files";
  if (choice === "keep") return "Remove from Outpost";
  return "Remove collection";
}

// ── Checking and moving ──

export const VERIFY_JOB = "collection.verify";
export const MOVE_JOB = "collection.move";

export const isFinished = (job: Pick<JobDto, "state">) => job.state === "succeeded" || job.state === "failed" || job.state === "cancelled";

export interface JobOutcome {
  tone: "success" | "info" | "warning" | "danger";
  title: string;
  body: string | null;
}

/** How a finished check or move turned out, in plain words. */
export function jobOutcome(job: Pick<JobDto, "type" | "state" | "result" | "error">): JobOutcome {
  const move = job.type === MOVE_JOB;
  if (job.state === "cancelled") {
    return move
      ? {
          tone: "info",
          title: "The move was cancelled",
          body: "Nothing was changed. The partial copy was removed and the collection is still where it was.",
        }
      : { tone: "info", title: "The check was cancelled", body: null };
  }
  if (job.state === "failed") {
    return {
      tone: "danger",
      title: move ? "The collection was not moved" : "The files could not be checked",
      body: job.error ?? (move ? "The original is untouched." : null),
    };
  }
  const message = typeof job.result?.message === "string" ? job.result.message : null;
  if (move) {
    return job.result?.originalRemoved === false
      ? { tone: "warning", title: "Moved, but the original is still there", body: message }
      : { tone: "success", title: "The move is complete", body: message };
  }
  switch ((job.result as Partial<CollectionVerifyResult> | null)?.outcome) {
    case "ok":
      return { tone: "success", title: "The files match", body: message };
    case "recorded":
      return { tone: "info", title: "A checksum was recorded for the first time", body: message };
    case "damaged":
      return { tone: "danger", title: "The file is damaged", body: message };
    case "missing":
      return { tone: "warning", title: "The file is missing", body: message };
    default:
      return { tone: "info", title: "The check finished", body: message };
  }
}

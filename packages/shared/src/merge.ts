/**
 * Bringing changes back from a portable drive: the shapes of the preview, the choices
 * and the record of what a merge did. See docs/portable.md.
 */

export type MergeState = "analysing" | "ready" | "merging" | "completed" | "stopped" | "failed" | "discarded";

/**
 * How Outpost could tell what changed where.
 *
 * - `recorded`: the drive carries a record of what everything was when it was written,
 *   so "changed on the drive" and "changed at home" are known exactly.
 * - `dates`: a drive made before that record existed. Content is compared, dates decide
 *   which side changed, and anything that cannot be decided is a conflict.
 * - `other-library`: the drive was made by a different Outpost. Nothing on it is assumed
 *   to be an older copy of something here.
 */
export type MergeBaseline = "recorded" | "dates" | "other-library";

/** One set of notes on a drive: the current one, or one kept from before an update. */
export interface DriveSource {
  /** "data", or "data-before-update-<date>". */
  folder: string;
  current: boolean;
  /** For a kept folder: when the update that set it aside was made (from its name). */
  setAsideAt: string | null;
  databaseBytes: number;
}

export interface DriveInspection {
  path: string;
  /** Null when the folder is not an Outpost drive; `problem` then says why. */
  drive: {
    id: string;
    appVersion: string;
    /** ISO dates from the drive's own description of itself. */
    createdAt: string | null;
    updatedAt: string | null;
    sources: DriveSource[];
  } | null;
  problem: string | null;
}

export type MergeItemKind = "page" | "document" | "place" | "track" | "collection";

/**
 * What happened to a thing.
 *
 * - `added`: made on the drive (or, for a collection, downloaded there).
 * - `edited`: changed on the drive and untouched at home.
 * - `conflict`: changed on both sides, or it cannot be told which side changed.
 * - `deleted`: removed on the drive and still at home.
 * - `moved`: a page put under another page on the drive.
 */
export type MergeChange = "added" | "edited" | "conflict" | "deleted" | "moved";

/**
 * What to do with one item.
 *
 * - `apply`: bring the change home (add it, update the home copy, move it, or, for a
 *   deletion, remove it at home too).
 * - `skip`: leave home as it is; the item is offered again next time.
 * - `both`: keep home's version and add the drive's beside it.
 * - `home`: keep home's version; this version of the drive's is not offered again.
 * - `drive`: replace home's version with the drive's; home's is kept in the record.
 */
export type MergeChoice = "apply" | "skip" | "both" | "home" | "drive";

/** Why a conflict is one. */
export type MergeConflictReason = "both-edited" | "deleted-at-home" | "missing-at-home" | "unsure";

export interface MergeItem {
  /** `<kind>:<id on the drive>`; for a deletion the id is the one the drive had. */
  key: string;
  kind: MergeItemKind;
  change: MergeChange;
  title: string;
  /** Where it is: the pages above a page, a document's file name, a place's coordinates. */
  context: string | null;
  driveItemId: string;
  homeItemId: string | null;
  /** Bytes that would be copied (documents, collections). */
  bytes: number | null;
  /** Last changed on each side, where known. */
  driveUpdatedAt: number | null;
  homeUpdatedAt: number | null;
  conflict: MergeConflictReason | null;
  /** Plain sentences worth knowing before choosing. */
  notes: string[];
  choices: MergeChoice[];
  defaultChoice: MergeChoice;
  /** Set when the item cannot be brought home at all; says why. Its only choice is `skip`. */
  blocked: string | null;
  /** A deleted page: the sub-pages (ids on the drive) that were deleted with it and go, or stay, with it. */
  members?: string[];
  /** Fingerprints the server compares again before it changes anything. */
  driveHash: string | null;
  homeHash: string | null;
}

export interface MergeCounts {
  pages: number;
  documents: number;
  places: number;
  tracks: number;
}

export interface MergeAnalysis {
  baseline: MergeBaseline;
  /** When the data that was read had been written to the drive; null when the drive does not say. */
  driveWrittenAt: number | null;
  driveAppVersion: string;
  items: MergeItem[];
  /** Attachments (pictures and files in pages) that would be copied with the pages. */
  attachments: { count: number; bytes: number };
  /** The same on both sides. */
  unchanged: MergeCounts;
  /** Changed or added at home since the drive was written. Nothing to bring back; updating the drive carries these. */
  homeOnly: MergeCounts;
  /** Dealt with by an earlier merge of this drive. */
  alreadyMerged: number;
  /** Things on the drive that were left out, with the reason. */
  warnings: string[];
}

export type MergeOutcome = "added" | "updated" | "copied" | "trashed" | "removed" | "moved" | "kept" | "already" | "skipped" | "failed";

/** Whether "undo" can put this back. */
export type MergeUndo = "can" | "cannot" | "nothing" | "done" | "left";

export interface MergeActionDto {
  seq: number;
  kind: MergeItemKind | "attachment";
  outcome: MergeOutcome;
  title: string;
  /** A sentence saying what was done, or why it was not. */
  message: string;
  homeItemId: string | null;
  undo: MergeUndo;
  /** After an undo: what happened to this item. */
  undoMessage: string | null;
}

export interface MergeReport {
  actions: MergeActionDto[];
  counts: Record<MergeOutcome, number>;
  /** Documents this merge copied in that an undo could remove if asked. */
  documentsAdded: number;
  /** Actions an undo cannot reverse. */
  cannotUndo: number;
}

export interface MergeDto {
  id: string;
  state: MergeState;
  driveId: string;
  drivePath: string;
  driveLabel: string;
  sourceFolder: string;
  baseline: MergeBaseline | null;
  analysis: MergeAnalysis | null;
  report: MergeReport | null;
  error: string | null;
  job: { id: string; state: string; progress: { current: number; total: number | null; message: string | null } } | null;
  createdAt: number;
  completedAt: number | null;
  undoneAt: number | null;
}

export interface MergeResponse {
  merge: MergeDto;
}

export interface MergeListResponse {
  /** Newest first, without the preview or the record. */
  merges: Array<Omit<MergeDto, "analysis" | "report">>;
}

export interface MergeStartBody {
  path: string;
  /** Which set of notes on the drive to read; the current one when omitted. */
  source?: string;
}

export interface MergeCommitBody {
  /** Choices that differ from each item's default, by item key. */
  choices: Record<string, MergeChoice>;
  /** Required when anything is to be removed at home: the person has seen what goes. */
  deletionsConfirmed?: boolean;
}

export interface MergeUndoBody {
  /** Also remove from the library the documents this merge copied in. */
  removeDocuments?: boolean;
}

/** One side of a comparison, as text. */
export interface MergeSide {
  title: string;
  updatedAt: number | null;
  /** Short facts: tags, category, coordinates. */
  fields: Array<{ label: string; value: string }>;
  /** The content as plain text (pages are shown as Markdown). */
  text: string;
  /** The text was cut at this many characters to keep the comparison readable. */
  truncatedAt: number | null;
}

export interface MergeCompareResponse {
  key: string;
  home: MergeSide | null;
  drive: MergeSide | null;
}

/** What each choice means for an item, as the label of the option. */
export function mergeChoiceLabel(item: Pick<MergeItem, "kind" | "change">, choice: MergeChoice): string {
  if (item.change === "deleted")
    return choice === "apply" ? (item.kind === "page" ? "Move to the trash here too" : "Remove here too") : "Keep";
  if (item.change === "conflict") {
    if (choice === "both") return "Keep both";
    if (choice === "home") return "Keep home’s";
    if (choice === "drive") return "Use the drive’s";
  }
  if (item.change === "added") return choice === "apply" ? (item.kind === "collection" ? "Copy in" : "Add") : "Leave on the drive";
  if (item.change === "moved") return choice === "apply" ? "Move here too" : "Leave where it is";
  return choice === "apply" ? "Update" : "Leave as it is";
}

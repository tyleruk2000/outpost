/** A preview with one of everything, for the tests of the merge screens. */
import type { MergeAnalysis, MergeDto, MergeItem } from "@outpost/shared";

export function item(change: Partial<MergeItem> & Pick<MergeItem, "key" | "kind" | "change" | "title">): MergeItem {
  const choices: MergeItem["choices"] =
    change.change === "conflict"
      ? ["both", "home", "drive"]
      : change.change === "deleted" || change.kind === "collection"
        ? ["skip", "apply"]
        : ["apply", "skip"];
  return {
    context: null,
    driveItemId: change.key.split(":")[1] ?? "x",
    homeItemId: null,
    bytes: null,
    driveUpdatedAt: null,
    homeUpdatedAt: null,
    conflict: change.change === "conflict" ? "both-edited" : null,
    notes: [],
    choices,
    defaultChoice: choices[0]!,
    blocked: null,
    driveHash: "d",
    homeHash: null,
    ...change,
  };
}

export function analysis(change: Partial<MergeAnalysis> = {}): MergeAnalysis {
  return {
    baseline: "recorded",
    driveWrittenAt: Date.UTC(2026, 10, 3),
    driveAppVersion: "0.1.0",
    items: [
      item({ key: "page:trip", kind: "page", change: "added", title: "Trip notes" }),
      item({ key: "page:day2", kind: "page", change: "added", title: "Trip day two", context: "Trip notes" }),
      item({
        key: "document:pilot",
        kind: "document",
        change: "added",
        title: "Pilot notes",
        context: "Pilot notes.txt",
        bytes: 2_400_000,
      }),
      item({ key: "page:kit", kind: "page", change: "edited", title: "Kit list", homeItemId: "kit" }),
      item({ key: "move:tides", kind: "page", change: "moved", title: "Tide notes", context: "Moved to under “Log”", homeItemId: "tides" }),
      item({
        key: "page:anchorages",
        kind: "page",
        change: "conflict",
        title: "Anchorages",
        homeItemId: "anchorages",
        homeUpdatedAt: Date.UTC(2026, 10, 12),
        driveUpdatedAt: Date.UTC(2026, 10, 9),
      }),
      item({
        key: "place:harbour",
        kind: "place",
        change: "conflict",
        title: "Harbour",
        context: "54.1000, -3.2000",
        homeItemId: "harbour",
      }),
      item({
        key: "page:old",
        kind: "page",
        change: "deleted",
        title: "Old plans",
        homeItemId: "old",
        notes: ["1 of its sub-pages was deleted on the drive too."],
      }),
      item({
        key: "document:charts",
        kind: "document",
        change: "deleted",
        title: "Charts",
        homeItemId: "charts",
        bytes: 900,
        notes: ["Removing it here deletes its file from your library for good. That cannot be undone."],
      }),
      item({ key: "collection:knots", kind: "collection", change: "added", title: "Knots", context: "knots.zim", bytes: 1_200_000_000 }),
      item({
        key: "page:huge",
        kind: "page",
        change: "added",
        title: "Enormous",
        blocked: "This page is larger than a page can be (5 MB) or its content could not be read, so it stays on the drive.",
        choices: ["skip"],
        defaultChoice: "skip",
      }),
    ],
    attachments: { count: 2, bytes: 340_000 },
    unchanged: { pages: 40, documents: 12, places: 3, tracks: 1 },
    homeOnly: { pages: 2, documents: 0, places: 0, tracks: 0 },
    alreadyMerged: 0,
    warnings: [],
    ...change,
  };
}

export function merge(plan: MergeAnalysis | null = analysis(), change: Partial<MergeDto> = {}): MergeDto {
  return {
    id: "m1",
    state: "ready",
    driveId: "drive1",
    drivePath: "/Volumes/TRAVEL/Outpost",
    driveLabel: "TRAVEL/Outpost",
    sourceFolder: "data",
    baseline: plan?.baseline ?? null,
    analysis: plan,
    report: null,
    error: null,
    job: null,
    createdAt: Date.UTC(2026, 10, 15, 10),
    completedAt: null,
    undoneAt: null,
    ...change,
  };
}

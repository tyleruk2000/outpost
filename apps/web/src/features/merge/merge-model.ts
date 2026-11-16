/**
 * What the merge screens work out from a preview: how the items group, what the
 * current choices add up to, what the button says, and which lines of two versions
 * differ. Pure functions, so the rules can be tested without a screen.
 */
import type { MergeAnalysis, MergeChoice, MergeCommitBody, MergeCounts, MergeItem, MergeItemKind } from "@outpost/shared";

export type Choices = Record<string, MergeChoice>;

export const choiceOf = (item: MergeItem, choices: Choices): MergeChoice => {
  if (item.blocked) return "skip";
  const chosen = choices[item.key];
  return chosen && item.choices.includes(chosen) ? chosen : item.defaultChoice;
};

const KIND_WORDS: Record<MergeItemKind, [string, string]> = {
  page: ["page", "pages"],
  document: ["document", "documents"],
  place: ["saved place", "saved places"],
  track: ["route or track", "routes and tracks"],
  collection: ["collection", "collections"],
};

export const kindWord = (kind: MergeItemKind, count: number): string => KIND_WORDS[kind][count === 1 ? 0 : 1];
export const countOf = (kind: MergeItemKind, count: number): string => `${count} ${kindWord(kind, count)}`;

const KIND_ORDER: MergeItemKind[] = ["page", "document", "place", "track", "collection"];

/** "2 pages, 1 document and 1 saved place". */
export function listKinds(items: readonly MergeItem[]): string {
  const parts = KIND_ORDER.map((kind) => [kind, items.filter((item) => item.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => countOf(kind, count));
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export type GroupId = "conflicts" | "added" | "edited" | "deleted" | "collections" | "blocked";

export interface Group {
  id: GroupId;
  title: string;
  description: string;
  items: MergeItem[];
}

/** The preview's sections, in the order a person should meet them: what needs deciding first. */
export function groupItems(items: readonly MergeItem[]): Group[] {
  const open = items.filter((item) => !item.blocked);
  const byKind = (list: MergeItem[]) => [...list].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const groups: Group[] = [
    {
      id: "conflicts",
      title: "Changed on both sides",
      description: "Yours to decide. Left as they are, home’s version stays and the drive’s is added beside it.",
      items: byKind(open.filter((item) => item.change === "conflict")),
    },
    {
      id: "added",
      title: "New on the drive",
      description: "Made while you were away. These are added to your library.",
      items: byKind(open.filter((item) => item.change === "added" && item.kind !== "collection")),
    },
    {
      id: "edited",
      title: "Changed on the drive",
      description: "Untouched at home since. Home’s copy is updated; what it was is kept in the record.",
      items: byKind(open.filter((item) => item.change === "edited" || item.change === "moved")),
    },
    {
      id: "deleted",
      title: "Removed on the drive",
      description: "Nothing is removed at home unless you tick it.",
      items: byKind(open.filter((item) => item.change === "deleted")),
    },
    {
      id: "collections",
      title: "Downloaded on the drive",
      description: "Collections and maps that are not here. They are large: none is copied unless you tick it.",
      items: open.filter((item) => item.kind === "collection"),
    },
    {
      id: "blocked",
      title: "Cannot be brought back",
      description: "These stay on the drive. Each says why.",
      items: byKind(items.filter((item) => item.blocked)),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

export interface Tally {
  /** Added to the library: new things, and the drive's side of a conflict kept beside home's. */
  add: MergeItem[];
  update: MergeItem[];
  beside: MergeItem[];
  move: MergeItem[];
  remove: MergeItem[];
  copy: MergeItem[];
  /** Conflicts settled for home, and removals declined: decisions that change nothing here. */
  keep: MergeItem[];
  /** Left on the drive for now; offered again next time. */
  later: MergeItem[];
  /** Bytes of documents and collections that would be copied. */
  bytes: number;
  changes: number;
}

/** What the choices as they stand would do. */
export function tally(items: readonly MergeItem[], choices: Choices): Tally {
  const result: Tally = { add: [], update: [], beside: [], move: [], remove: [], copy: [], keep: [], later: [], bytes: 0, changes: 0 };
  for (const item of items) {
    if (item.blocked) continue;
    const choice = choiceOf(item, choices);
    const brought = item.conflict === "deleted-at-home" || item.conflict === "missing-at-home";
    if (item.kind === "collection") (choice === "apply" ? result.copy : result.later).push(item);
    else if (item.change === "added") (choice === "apply" ? result.add : result.later).push(item);
    else if (item.change === "edited") (choice === "apply" ? result.update : result.later).push(item);
    else if (item.change === "moved") (choice === "apply" ? result.move : result.later).push(item);
    else if (item.change === "deleted") (choice === "apply" ? result.remove : result.keep).push(item);
    else if (choice === "home") result.keep.push(item);
    else if (choice === "drive") result.update.push(item);
    else (brought ? result.add : result.beside).push(item);
  }
  for (const item of [...result.add, ...result.copy]) result.bytes += item.bytes ?? 0;
  result.changes =
    result.add.length + result.update.length + result.beside.length + result.move.length + result.remove.length + result.copy.length;
  return result;
}

/** What the button says: exactly what pressing it does. */
export function actionLabel(result: Tally): string {
  if (result.changes > 0) return `Bring back ${result.changes} ${result.changes === 1 ? "change" : "changes"}`;
  if (result.keep.length > 0) return "Keep home as it is";
  return "Nothing to bring back";
}

/** One sentence per kind of thing that will happen, for the summary beside the button. */
export function describeTally(result: Tally): string[] {
  const lines: string[] = [];
  if (result.add.length > 0) lines.push(`Adds ${listKinds(result.add)}.`);
  if (result.update.length > 0) lines.push(`Updates ${listKinds(result.update)}. What each was is kept in the record.`);
  if (result.beside.length > 0) lines.push(`Keeps both versions of ${listKinds(result.beside)}.`);
  if (result.move.length > 0) lines.push(`Moves ${listKinds(result.move)}.`);
  if (result.copy.length > 0) lines.push(`Copies in ${listKinds(result.copy)}.`);
  if (result.remove.length > 0) lines.push(`Removes ${listKinds(result.remove)} here.`);
  if (result.keep.length > 0) lines.push(`Leaves ${listKinds(result.keep)} as ${result.keep.length === 1 ? "it is" : "they are"} at home.`);
  if (result.later.length > 0) lines.push(`Leaves ${listKinds(result.later)} on the drive for now.`);
  return lines;
}

export function toCommitBody(items: readonly MergeItem[], choices: Choices, deletionsConfirmed: boolean): MergeCommitBody {
  const sent: Choices = {};
  for (const item of items) {
    const choice = choiceOf(item, choices);
    if (choice !== item.defaultChoice) sent[item.key] = choice;
  }
  return { choices: sent, deletionsConfirmed };
}

const total = (counts: MergeCounts) => counts.pages + counts.documents + counts.places + counts.tracks;

/** Plain sentences about what is not in the lists: the same on both sides, changed only at home, dealt with before. */
export function contextLines(analysis: MergeAnalysis): string[] {
  const lines: string[] = [];
  const same = total(analysis.unchanged);
  const home = total(analysis.homeOnly);
  if (same > 0) lines.push(`${same} ${same === 1 ? "thing is" : "things are"} the same on the drive and at home.`);
  if (home > 0)
    lines.push(
      `${home} ${home === 1 ? "thing was" : "things were"} changed or removed only at home. There is nothing to bring back for ${home === 1 ? "it" : "them"}; updating the drive afterwards carries ${home === 1 ? "it" : "them"} over.`,
    );
  if (analysis.alreadyMerged > 0)
    lines.push(
      `${analysis.alreadyMerged} ${analysis.alreadyMerged === 1 ? "change was" : "changes were"} dealt with when this drive was brought back before.`,
    );
  return lines;
}

// ── Comparing two texts ─────────────────────────────────────────────────────

export interface DiffLine {
  text: string;
  /** Not in the other version. */
  differs: boolean;
}

const MAX_CELLS = 4_000_000;

/**
 * Marks the lines of each text that the other does not have, by their longest common
 * run of lines. Texts too long to compare that way come back unmarked, with `marked`
 * false, so the screen can say so rather than show a wrong answer.
 */
export function diffLines(left: string, right: string): { left: DiffLine[]; right: DiffLine[]; marked: boolean } {
  const a = left.split("\n");
  const b = right.split("\n");
  const plain = (lines: string[]): DiffLine[] => lines.map((text) => ({ text, differs: false }));
  if (a.length * b.length > MAX_CELLS) return { left: plain(a), right: plain(b), marked: false };

  // lengths[i][j]: the longest common run of a[i..] and b[j..].
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j] ? lengths[(i + 1) * width + j + 1]! + 1 : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const leftLines: DiffLine[] = [];
  const rightLines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      leftLines.push({ text: a[i]!, differs: false });
      rightLines.push({ text: b[j]!, differs: false });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)) {
      leftLines.push({ text: a[i]!, differs: true });
      i += 1;
    } else {
      rightLines.push({ text: b[j]!, differs: true });
      j += 1;
    }
  }
  return { left: leftLines, right: rightLines, marked: true };
}

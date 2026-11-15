/**
 * Working out what changed on a drive and what changed at home.
 *
 * Three states are compared for every page, document, saved place and track: what it
 * is on the drive, what it is at home, and what it was when the two were last the same
 * (the base). The base comes from, in order:
 *
 * 1. an earlier merge of this same drive, which recorded what it did (`memory`);
 * 2. the record the drive carries of everything it held when it was written;
 * 3. nothing. Then content is compared, dates decide which side changed, and whatever
 *    cannot be decided is a conflict. A conflict costs a person a choice; a wrong guess
 *    costs them their work.
 *
 * This file only compares. It reads no files and changes nothing.
 */
import type {
  MergeAnalysis,
  MergeBaseline,
  MergeChoice,
  MergeConflictReason,
  MergeCounts,
  MergeItem,
  MergeItemKind,
} from "@outpost/shared";
import type { Baseline, BaselineEntry, DocumentState, PageState, PlaceState, Snapshot, TrackState } from "./fingerprint.ts";

/** Stands in for a fingerprint when the drive no longer had the thing. */
export const GONE = "deleted";

/** What an earlier merge of the same drive did with one of the drive's things. */
export interface MemoryEntry {
  homeItemId: string | null;
  /** The drive's version that was dealt with, or `GONE`. */
  driveHash: string | null;
  /** Home's version right afterwards; null when the two sides were left to differ. */
  homeHash: string | null;
}

export interface DiffInput {
  home: Snapshot;
  drive: Snapshot;
  /** The drive's own record; null when it has none, or it was made by another library. */
  baseline: Baseline | null;
  mode: MergeBaseline;
  /** When the drive was written, by the home computer's clock. */
  writtenAt: number | null;
  /** Keyed `<kind>:<id on the drive>`. */
  memory: Map<string, MemoryEntry>;
}

export interface DiffResult {
  mode: MergeBaseline;
  items: MergeItem[];
  unchanged: MergeCounts;
  homeOnly: MergeCounts;
  alreadyMerged: number;
  warnings: string[];
}

const SUPPORTED_COLLECTIONS = new Set(["zim", "map", "terrain"]);
const UNTITLED = "Untitled";

const zero = (): MergeCounts => ({ pages: 0, documents: 0, places: 0, tracks: 0 });
const countKey = { page: "pages", document: "documents", place: "places", track: "tracks" } as const;

function titlePath(pages: Map<string, PageState>, start: string | null): string | null {
  const titles: string[] = [];
  const seen = new Set<string>();
  let current = start;
  while (current && !seen.has(current) && titles.length < 40) {
    seen.add(current);
    const page = pages.get(current);
    if (!page) break;
    titles.unshift(page.title.trim() || UNTITLED);
    current = page.parentId;
  }
  return titles.length > 0 ? titles.join(" / ") : null;
}

const coordinates = (place: PlaceState) => `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
const kilometres = (track: TrackState) => `${(track.distanceMeters / 1000).toFixed(1)} km`;

export function diffLibraries(input: DiffInput): DiffResult {
  const { home, drive, memory } = input;
  let mode = input.mode;
  let baseline = mode === "recorded" ? input.baseline : null;
  if (mode === "recorded" && !baseline) mode = "dates";

  // A drive without a record says nothing about where it came from. If nothing on it is
  // also at home (same id, made at the same moment), it was not made from this library.
  if (mode === "dates") {
    let shared = 0;
    for (const page of drive.pages.values()) if (home.pages.get(page.id)?.createdAt === page.createdAt) shared += 1;
    for (const place of drive.places.values()) if (home.places.get(place.id)?.createdAt === place.createdAt) shared += 1;
    for (const document of drive.documents.values()) if (home.documents.get(document.id)?.createdAt === document.createdAt) shared += 1;
    const driveCount = drive.pages.size + drive.places.size + drive.documents.size;
    const homeCount = home.pages.size + home.places.size + home.documents.size;
    if (shared === 0 && driveCount > 0 && homeCount > 0) mode = "other-library";
  }
  const precise = mode === "recorded";
  const writtenAt = mode === "dates" ? input.writtenAt : null;
  if (!precise) baseline = null;

  /** Things at home that an earlier merge put there, as `<kind>:<id at home>`. */
  const madeByMerge = new Set<string>();
  for (const [key, remembered] of memory) {
    if (remembered.homeItemId) madeByMerge.add(`${key.slice(0, key.indexOf(":"))}:${remembered.homeItemId}`);
  }

  const items: MergeItem[] = [];
  const unchanged = zero();
  const homeOnly = zero();
  const warnings: string[] = [];
  let alreadyMerged = 0;

  const item = (
    kind: MergeItemKind,
    change: MergeItem["change"],
    driveItemId: string,
    fields: Partial<MergeItem> & Pick<MergeItem, "title" | "choices" | "defaultChoice">,
  ): MergeItem => {
    const built: MergeItem = {
      key: `${change === "moved" ? "move" : kind}:${driveItemId}`,
      kind,
      change,
      driveItemId,
      context: null,
      homeItemId: null,
      bytes: null,
      driveUpdatedAt: null,
      homeUpdatedAt: null,
      conflict: null,
      notes: [],
      blocked: null,
      driveHash: null,
      homeHash: null,
      ...fields,
    };
    if (built.blocked) {
      built.choices = ["skip"];
      built.defaultChoice = "skip";
    }
    items.push(built);
    return built;
  };

  const APPLY: MergeChoice[] = ["apply", "skip"];
  const THREE: MergeChoice[] = ["both", "home", "drive"];
  const BRING_BACK: MergeChoice[] = ["both", "home"];
  const DELETE: MergeChoice[] = ["skip", "apply"];

  /** Finds the base for one of the drive's things. `undefined`: there is none, it is new or unknown. */
  function baseOf(
    kind: "page" | "document" | "place" | "track",
    id: string,
    driveHash: string | null,
    gone: boolean,
  ): "already" | { homeId: string | null; driveHash: string | null; homeHash: string | null; entry?: BaselineEntry } | undefined {
    const remembered = memory.get(`${kind}:${id}`);
    if (remembered) {
      if (remembered.driveHash === GONE) {
        if (gone) return "already";
        // It is back on the drive: what was decided about its removal no longer says anything.
      } else {
        if (!gone && driveHash !== null && remembered.driveHash === driveHash) return "already";
        return { homeId: remembered.homeItemId, driveHash: remembered.driveHash, homeHash: remembered.homeHash };
      }
    }
    const entry = baseline?.[countKey[kind]].get(id);
    if (entry) return { homeId: id, driveHash: entry.hash, homeHash: entry.hash, entry };
    return undefined;
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  const homeChildren = new Map<string, string[]>();
  for (const page of home.pages.values()) {
    if (!page.parentId || page.trashedAt !== null) continue;
    const list = homeChildren.get(page.parentId) ?? [];
    list.push(page.id);
    homeChildren.set(page.parentId, list);
  }

  const pageDeletions: Array<{ driveId: string; home: PageState; homeChanged: boolean }> = [];
  let movedOnBoth = 0;

  const blockedPage = (page: PageState): string | null =>
    page.hash === null ? "This page is larger than a page can be (5 MB) or its content could not be read, so it stays on the drive." : null;

  const addPage = (page: PageState, notes: string[] = []) =>
    item("page", "added", page.id, {
      title: page.title.trim() || UNTITLED,
      context: titlePath(drive.pages, page.parentId),
      driveUpdatedAt: page.updatedAt,
      driveHash: page.hash,
      notes: [...(page.isTemplate ? ["A template."] : []), ...notes],
      choices: APPLY,
      defaultChoice: "apply",
      blocked: blockedPage(page),
    });

  const conflictPage = (page: PageState, homePage: PageState | undefined, reason: MergeConflictReason, notes: string[] = []) =>
    item("page", "conflict", page.id, {
      title: (homePage?.title ?? page.title).trim() || UNTITLED,
      context: homePage ? titlePath(home.pages, homePage.parentId) : titlePath(drive.pages, page.parentId),
      homeItemId: homePage?.id ?? null,
      driveUpdatedAt: page.updatedAt,
      homeUpdatedAt: homePage?.updatedAt ?? null,
      driveHash: page.hash,
      homeHash: homePage?.hash ?? null,
      conflict: reason,
      notes,
      choices: reason === "both-edited" || reason === "unsure" ? THREE : BRING_BACK,
      defaultChoice: "both",
      blocked: blockedPage(page),
    });

  const editPage = (page: PageState, homePage: PageState) =>
    item("page", "edited", page.id, {
      title: homePage.title.trim() || UNTITLED,
      context: titlePath(home.pages, homePage.parentId),
      homeItemId: homePage.id,
      driveUpdatedAt: page.updatedAt,
      homeUpdatedAt: homePage.updatedAt,
      driveHash: page.hash,
      homeHash: homePage.hash,
      notes: page.title !== homePage.title ? [`Renamed on the drive to “${page.title.trim() || UNTITLED}”.`] : [],
      choices: APPLY,
      defaultChoice: "apply",
      blocked: blockedPage(page),
    });

  /** The home page a page on the drive stands for, when that is known without guessing. */
  const homePageOf = (driveId: string): string | null => {
    const remembered = memory.get(`page:${driveId}`);
    if (remembered?.homeItemId && remembered.driveHash !== GONE) return remembered.homeItemId;
    if (baseline?.pages.has(driveId)) return home.pages.has(driveId) ? driveId : null;
    const drivePage = drive.pages.get(driveId);
    const homePage = home.pages.get(driveId);
    return !precise && drivePage && homePage && homePage.createdAt === drivePage.createdAt ? driveId : null;
  };

  for (const page of drive.pages.values()) {
    const gone = page.trashedAt !== null;
    const base = baseOf("page", page.id, page.hash, gone);
    if (base === "already") {
      alreadyMerged += 1;
      continue;
    }

    if (base) {
      const homePage = base.homeId ? home.pages.get(base.homeId) : undefined;
      const homeAlive = homePage !== undefined && homePage.trashedAt === null;
      const driveChanged = page.hash === null || page.hash !== base.driveHash;
      const homeChanged = base.homeHash === null || homePage?.hash !== base.homeHash;
      if (gone) {
        if (!base.entry?.trashed && homeAlive) pageDeletions.push({ driveId: page.id, home: homePage, homeChanged });
        continue;
      }
      if (!homeAlive) {
        if (driveChanged) {
          conflictPage(page, undefined, "deleted-at-home", [
            homePage ? "This page is in the trash at home." : "This page was deleted at home.",
            "Keeping both brings the drive’s version back as a page.",
          ]);
        } else homeOnly.pages += 1;
        continue;
      }
      if (!driveChanged) {
        if (homeChanged) homeOnly.pages += 1;
        else unchanged.pages += 1;
      } else if (page.hash !== null && page.hash === homePage.hash) unchanged.pages += 1;
      else if (!homeChanged) editPage(page, homePage);
      else conflictPage(page, homePage, "both-edited");

      // A page put somewhere else on the drive. Only the drive's own record says where it was.
      if (base.entry && !page.isTemplate && page.parentId !== base.entry.parentId) {
        const target = page.parentId === null ? null : homePageOf(page.parentId);
        const targetIsNew = page.parentId !== null && target === null;
        if (homePage.parentId === base.entry.parentId) {
          item("page", "moved", page.id, {
            title: homePage.title.trim() || UNTITLED,
            context: page.parentId === null ? "To the top level" : `To under “${titlePath(drive.pages, page.parentId) ?? UNTITLED}”`,
            homeItemId: homePage.id,
            notes: targetIsNew ? ["The page it was moved under was made on the drive; it is moved only if that page is added."] : [],
            choices: APPLY,
            defaultChoice: "apply",
          });
        } else if (target !== homePage.parentId) movedOnBoth += 1;
      }
      continue;
    }

    if (precise) {
      if (!gone) addPage(page);
      continue;
    }

    // No record: compare by identity (the same id, made at the same moment), content and dates.
    const sameId = home.pages.get(page.id);
    const homePage = sameId && sameId.createdAt === page.createdAt ? sameId : undefined;
    if (!homePage) {
      if (gone) continue;
      if (!sameId && writtenAt !== null && page.createdAt <= writtenAt) {
        conflictPage(page, undefined, "missing-at-home", [
          "This page is older than the drive and is not at home any more. It was probably deleted at home.",
          "Keeping both brings it back as a page.",
        ]);
      } else addPage(page);
      continue;
    }
    if (gone) {
      if (homePage.trashedAt === null && writtenAt !== null && page.trashedAt! > writtenAt) {
        pageDeletions.push({ driveId: page.id, home: homePage, homeChanged: homePage.updatedAt > writtenAt });
      }
      continue;
    }
    const same = page.hash !== null && page.hash === homePage.hash;
    if (homePage.trashedAt !== null) {
      if (same) homeOnly.pages += 1;
      else
        conflictPage(page, undefined, "deleted-at-home", [
          "This page is in the trash at home.",
          "Keeping both brings the drive’s version back as a page.",
        ]);
      continue;
    }
    if (same) {
      unchanged.pages += 1;
      continue;
    }
    const driveNewer = writtenAt !== null && page.updatedAt > writtenAt;
    const homeNewer = writtenAt !== null && homePage.updatedAt > writtenAt;
    if (driveNewer && !homeNewer) editPage(page, homePage);
    else if (homeNewer && !driveNewer) homeOnly.pages += 1;
    else
      conflictPage(page, homePage, driveNewer && homeNewer ? "both-edited" : "unsure", [
        driveNewer && homeNewer ? "" : "The two differ and the dates do not say which side changed.",
      ]);
  }

  // Pages that are no longer on the drive at all.
  const consider = (driveId: string, homeId: string | null, baseHomeHash: string | null) => {
    if (drive.pages.has(driveId)) return;
    const remembered = memory.get(`page:${driveId}`);
    if (remembered?.driveHash === GONE) {
      alreadyMerged += 1;
      return;
    }
    const homePage = homeId ? home.pages.get(homeId) : undefined;
    if (homePage && homePage.trashedAt === null) {
      pageDeletions.push({ driveId, home: homePage, homeChanged: baseHomeHash === null || homePage.hash !== baseHomeHash });
    }
  };
  if (baseline) {
    for (const [id, entry] of baseline.pages) {
      if (entry.trashed) continue;
      const remembered = memory.get(`page:${id}`);
      consider(id, remembered?.homeItemId ?? id, remembered ? remembered.homeHash : entry.hash);
    }
  }
  for (const [key, remembered] of memory) {
    if (!key.startsWith("page:")) continue;
    const id = key.slice(5);
    if (baseline?.pages.has(id) || remembered.driveHash === GONE) continue;
    consider(id, remembered.homeItemId, remembered.homeHash);
  }
  if (!precise && writtenAt !== null) {
    for (const homePage of home.pages.values()) {
      if (drive.pages.has(homePage.id) || homePage.trashedAt !== null || homePage.createdAt > writtenAt) continue;
      // A page an earlier merge made here stands for a page on the drive under another id.
      if (madeByMerge.has(`page:${homePage.id}`)) continue;
      if (memory.get(`page:${homePage.id}`)?.driveHash === GONE) {
        alreadyMerged += 1;
        continue;
      }
      pageDeletions.push({ driveId: homePage.id, home: homePage, homeChanged: homePage.updatedAt > writtenAt });
    }
  }

  // A deleted page takes its sub-pages with it, on the drive and at home. Only the top of
  // each deleted branch is offered; the rest go, or stay, with it.
  const deletedAtHome = new Map(pageDeletions.map((entry) => [entry.home.id, entry]));
  for (const entry of deletedAtHome.values()) {
    if (entry.home.parentId && deletedAtHome.has(entry.home.parentId)) continue;
    const members: string[] = [];
    let alsoDeleted = 0;
    let onlyAtHome = 0;
    let changed = entry.homeChanged;
    const pending = [...(homeChildren.get(entry.home.id) ?? [])];
    const seen = new Set<string>([entry.home.id]);
    while (pending.length > 0 && seen.size < 100_000) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const also = deletedAtHome.get(id);
      if (also) {
        alsoDeleted += 1;
        members.push(also.driveId);
        changed ||= also.homeChanged;
      } else onlyAtHome += 1;
      pending.push(...(homeChildren.get(id) ?? []));
    }
    const notes: string[] = [];
    if (alsoDeleted > 0) notes.push(`${alsoDeleted} of its sub-pages ${alsoDeleted === 1 ? "was" : "were"} deleted on the drive too.`);
    if (onlyAtHome > 0)
      notes.push(
        `${onlyAtHome} sub-page${onlyAtHome === 1 ? "" : "s"} at home ${onlyAtHome === 1 ? "was" : "were"} not deleted on the drive and would go to the trash with it.`,
      );
    if (changed) notes.push("It was changed at home after the drive was written.");
    const built = item("page", "deleted", entry.driveId, {
      title: entry.home.title.trim() || UNTITLED,
      context: titlePath(home.pages, entry.home.parentId),
      homeItemId: entry.home.id,
      homeUpdatedAt: entry.home.updatedAt,
      homeHash: entry.home.hash,
      notes,
      choices: DELETE,
      defaultChoice: "skip",
    });
    if (members.length > 0) built.members = members;
  }
  if (movedOnBoth > 0) {
    warnings.push(
      `${movedOnBoth} page${movedOnBoth === 1 ? " was" : "s were"} moved both on the drive and at home. ${movedOnBoth === 1 ? "It stays" : "They stay"} where home has ${movedOnBoth === 1 ? "it" : "them"}.`,
    );
  }

  // ── Documents ────────────────────────────────────────────────────────────

  const homeBySha = new Map<string, DocumentState>();
  for (const document of home.documents.values()) if (!homeBySha.has(document.sha256)) homeBySha.set(document.sha256, document);

  const documentItem = (
    change: MergeItem["change"],
    document: DocumentState,
    homeDocument: DocumentState | undefined,
    fields: Partial<MergeItem> & Pick<MergeItem, "choices" | "defaultChoice">,
  ) =>
    item("document", change, document.id, {
      title: (homeDocument ?? document).title.trim() || document.originalName,
      context: document.originalName,
      homeItemId: homeDocument?.id ?? null,
      driveUpdatedAt: document.updatedAt,
      homeUpdatedAt: homeDocument?.updatedAt ?? null,
      driveHash: document.hash,
      homeHash: homeDocument?.hash ?? null,
      ...fields,
    });
  const SIDES: MergeChoice[] = ["home", "drive"];

  for (const document of drive.documents.values()) {
    if (drive.chapterDocumentIds.has(document.id)) continue;
    const base = baseOf("document", document.id, document.hash, false);
    if (base === "already") {
      alreadyMerged += 1;
      continue;
    }
    if (base) {
      const homeDocument = base.homeId ? home.documents.get(base.homeId) : undefined;
      const driveChanged = document.hash !== base.driveHash;
      if (!homeDocument) {
        if (driveChanged)
          documentItem("conflict", document, undefined, {
            bytes: document.sizeBytes,
            conflict: "deleted-at-home",
            notes: [
              "This document was removed at home and its details were changed on the drive.",
              "Keeping both adds it to the library again.",
            ],
            choices: BRING_BACK,
            defaultChoice: "both",
          });
        else homeOnly.documents += 1;
        continue;
      }
      const homeChanged = base.homeHash === null || homeDocument.hash !== base.homeHash;
      if (!driveChanged) {
        if (homeChanged) homeOnly.documents += 1;
        else unchanged.documents += 1;
      } else if (document.hash === homeDocument.hash) unchanged.documents += 1;
      else if (!homeChanged)
        documentItem("edited", document, homeDocument, {
          notes: ["Its title, tags or other details were changed on the drive."],
          choices: APPLY,
          defaultChoice: "apply",
        });
      else
        documentItem("conflict", document, homeDocument, {
          conflict: "both-edited",
          notes: ["Its details were changed on both sides. The file itself is the same."],
          choices: SIDES,
          defaultChoice: "home",
        });
      continue;
    }

    const sameId = home.documents.get(document.id);
    const homeDocument =
      (!precise && sameId && sameId.createdAt === document.createdAt ? sameId : undefined) ?? homeBySha.get(document.sha256);
    if (!homeDocument) {
      documentItem("added", document, undefined, { bytes: document.sizeBytes, choices: APPLY, defaultChoice: "apply" });
      continue;
    }
    if (document.hash === homeDocument.hash) {
      unchanged.documents += 1;
      continue;
    }
    const driveNewer = writtenAt !== null && document.updatedAt > writtenAt;
    const homeNewer = writtenAt !== null && homeDocument.updatedAt > writtenAt;
    if (!precise && driveNewer && !homeNewer)
      documentItem("edited", document, homeDocument, {
        notes: ["Its title, tags or other details were changed on the drive."],
        choices: APPLY,
        defaultChoice: "apply",
      });
    else if (!precise && homeNewer && !driveNewer) homeOnly.documents += 1;
    else
      documentItem("conflict", document, homeDocument, {
        conflict: precise ? "both-edited" : "unsure",
        notes: [
          precise
            ? "This file was added on the drive, and the same file is already in your library with different details."
            : "The same file is on both sides with different details, and the dates do not say which side changed.",
        ],
        choices: SIDES,
        defaultChoice: "home",
      });
  }

  const documentGone = (driveId: string, homeId: string | null) => {
    if (drive.documents.has(driveId)) return;
    if (memory.get(`document:${driveId}`)?.driveHash === GONE) {
      alreadyMerged += 1;
      return;
    }
    const homeDocument = homeId ? home.documents.get(homeId) : undefined;
    if (!homeDocument || home.chapterDocumentIds.has(homeDocument.id)) return;
    item("document", "deleted", driveId, {
      title: homeDocument.title.trim() || homeDocument.originalName,
      context: homeDocument.originalName,
      homeItemId: homeDocument.id,
      bytes: homeDocument.sizeBytes,
      homeUpdatedAt: homeDocument.updatedAt,
      homeHash: homeDocument.hash,
      notes: ["Removing it here deletes its file from your library for good. That cannot be undone."],
      choices: DELETE,
      defaultChoice: "skip",
    });
  };
  if (baseline) for (const id of baseline.documents.keys()) documentGone(id, memory.get(`document:${id}`)?.homeItemId ?? id);
  for (const [key, remembered] of memory) {
    if (!key.startsWith("document:")) continue;
    const id = key.slice(9);
    if (!baseline?.documents.has(id) && remembered.driveHash !== GONE) documentGone(id, remembered.homeItemId);
  }

  // ── Saved places and tracks ──────────────────────────────────────────────

  function annotations<T extends PlaceState | TrackState>(
    kind: "place" | "track",
    driveItems: Map<string, T>,
    homeItems: Map<string, T>,
    describe: (entry: T) => string,
  ): void {
    const counter = countKey[kind];
    const blocked = (entry: T): string | null =>
      entry.hash === null ? "This track is larger than a track can be (20 MB), so it stays on the drive." : null;
    const make = (
      change: MergeItem["change"],
      entry: T,
      homeEntry: T | undefined,
      fields: Partial<MergeItem> & Pick<MergeItem, "choices" | "defaultChoice">,
    ) =>
      item(kind, change, entry.id, {
        title: (homeEntry ?? entry).name.trim() || (kind === "place" ? "Saved place" : "Track"),
        context: describe(entry),
        homeItemId: homeEntry?.id ?? null,
        driveUpdatedAt: entry.updatedAt,
        homeUpdatedAt: homeEntry?.updatedAt ?? null,
        driveHash: entry.hash,
        homeHash: homeEntry?.hash ?? null,
        blocked: blocked(entry),
        ...fields,
      });

    for (const entry of driveItems.values()) {
      const base = baseOf(kind, entry.id, entry.hash, false);
      if (base === "already") {
        alreadyMerged += 1;
        continue;
      }
      let homeEntry: T | undefined;
      let driveChanged: boolean;
      let homeChanged: boolean;
      if (base) {
        homeEntry = base.homeId ? homeItems.get(base.homeId) : undefined;
        driveChanged = entry.hash === null || entry.hash !== base.driveHash;
        homeChanged = base.homeHash === null || homeEntry?.hash !== base.homeHash;
        if (!homeEntry) {
          if (driveChanged)
            make("conflict", entry, undefined, {
              conflict: "deleted-at-home",
              notes: ["It was removed at home and changed on the drive.", "Keeping both adds the drive’s version again."],
              choices: BRING_BACK,
              defaultChoice: "both",
            });
          else homeOnly[counter] += 1;
          continue;
        }
      } else {
        const sameId = homeItems.get(entry.id);
        homeEntry = !precise && sameId && sameId.createdAt === entry.createdAt ? sameId : undefined;
        if (!homeEntry) {
          if (!precise && !sameId && writtenAt !== null && entry.createdAt <= writtenAt)
            make("conflict", entry, undefined, {
              conflict: "missing-at-home",
              notes: [
                "It is older than the drive and is not at home any more. It was probably removed at home.",
                "Keeping both adds it again.",
              ],
              choices: BRING_BACK,
              defaultChoice: "both",
            });
          else make("added", entry, undefined, { choices: APPLY, defaultChoice: "apply" });
          continue;
        }
        driveChanged = writtenAt !== null && entry.updatedAt > writtenAt;
        homeChanged = writtenAt !== null && homeEntry.updatedAt > writtenAt;
        if (entry.hash !== null && entry.hash === homeEntry.hash) {
          unchanged[counter] += 1;
          continue;
        }
        if (!driveChanged && !homeChanged) {
          make("conflict", entry, homeEntry, {
            conflict: "unsure",
            notes: ["The two differ and the dates do not say which side changed."],
            choices: THREE,
            defaultChoice: "both",
          });
          continue;
        }
      }
      if (!driveChanged) {
        if (homeChanged) homeOnly[counter] += 1;
        else unchanged[counter] += 1;
      } else if (entry.hash !== null && entry.hash === homeEntry.hash) unchanged[counter] += 1;
      else if (!homeChanged) make("edited", entry, homeEntry, { choices: APPLY, defaultChoice: "apply" });
      else make("conflict", entry, homeEntry, { conflict: "both-edited", choices: THREE, defaultChoice: "both" });
    }

    const gone = (driveId: string, homeId: string | null) => {
      if (driveItems.has(driveId)) return;
      if (memory.get(`${kind}:${driveId}`)?.driveHash === GONE) {
        alreadyMerged += 1;
        return;
      }
      const homeEntry = homeId ? homeItems.get(homeId) : undefined;
      if (!homeEntry) return;
      item(kind, "deleted", driveId, {
        title: homeEntry.name.trim() || (kind === "place" ? "Saved place" : "Track"),
        context: describe(homeEntry),
        homeItemId: homeEntry.id,
        homeUpdatedAt: homeEntry.updatedAt,
        homeHash: homeEntry.hash,
        choices: DELETE,
        defaultChoice: "skip",
      });
    };
    const recorded = baseline?.[counter];
    if (recorded) for (const id of recorded.keys()) gone(id, memory.get(`${kind}:${id}`)?.homeItemId ?? id);
    for (const [key, remembered] of memory) {
      if (!key.startsWith(`${kind}:`)) continue;
      const id = key.slice(kind.length + 1);
      if (!recorded?.has(id) && remembered.driveHash !== GONE) gone(id, remembered.homeItemId);
    }
    if (!precise && writtenAt !== null) {
      for (const homeEntry of homeItems.values()) {
        if (homeEntry.createdAt <= writtenAt && !madeByMerge.has(`${kind}:${homeEntry.id}`)) gone(homeEntry.id, homeEntry.id);
      }
    }
  }
  annotations("place", drive.places, home.places, coordinates);
  annotations("track", drive.tracks, home.tracks, kilometres);

  // ── Collections downloaded on the drive ──────────────────────────────────

  const baseName = (relPath: string) => relPath.split(/[\\/]/).pop() ?? relPath;
  for (const collection of drive.collections) {
    const atHome = home.collections.some(
      (mine) =>
        mine.id === collection.id ||
        (collection.catalogEntryId !== null && mine.catalogEntryId === collection.catalogEntryId) ||
        (collection.sha256 !== null && mine.sha256 === collection.sha256) ||
        (mine.kind === collection.kind &&
          mine.sizeBytes === collection.sizeBytes &&
          baseName(mine.relPath) === baseName(collection.relPath)),
    );
    if (atHome) continue;
    item("collection", "added", collection.id, {
      title: collection.title.trim() || baseName(collection.relPath),
      context: baseName(collection.relPath),
      bytes: collection.sizeBytes,
      choices: ["skip", "apply"],
      defaultChoice: "skip",
      blocked:
        collection.isBook || !SUPPORTED_COLLECTIONS.has(collection.kind)
          ? "A merge copies reference collections and maps only. Add this one at home from Explore."
          : null,
    });
  }

  for (const entry of items) entry.notes = entry.notes.filter(Boolean);
  return { mode, items, unchanged, homeOnly, alreadyMerged, warnings };
}

/** The part of a result that is shown: everything but what the server works out later. */
export function toAnalysis(
  result: DiffResult,
  extra: Pick<MergeAnalysis, "driveWrittenAt" | "driveAppVersion" | "attachments"> & { warnings: string[] },
): MergeAnalysis {
  return {
    baseline: result.mode,
    driveWrittenAt: extra.driveWrittenAt,
    driveAppVersion: extra.driveAppVersion,
    items: result.items,
    attachments: extra.attachments,
    unchanged: result.unchanged,
    homeOnly: result.homeOnly,
    alreadyMerged: result.alreadyMerged,
    warnings: [...result.warnings, ...extra.warnings],
  };
}

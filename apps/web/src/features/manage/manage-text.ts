/**
 * The words of the manage screen, and the small sums behind them. Kept apart from the
 * components so that what the screen says can be read, and tested, in one place.
 */
import {
  type CleanupPlan,
  type CleanupResult,
  formatBytes,
  type GamesKept,
  type LearningKept,
  type LeftoverKind,
  type ManagedItem,
  type ManagedKind,
  type MorseKept,
  type RadioKept,
  type SuppliesKept,
  type Tally,
  type UsageId,
  type UsageResponse,
  type UsageRow,
  type WeatherKept,
} from "@outpost/shared";
import { formatNumber, plural } from "@/lib/utils";

export const kindNames: Record<ManagedKind, { one: string; many: string }> = {
  zim: { one: "Reference archive", many: "Reference archives" },
  map: { one: "Map region", many: "Maps" },
  terrain: { one: "Terrain", many: "Terrain" },
  places: { one: "Place names", many: "Place names" },
  sheet: { one: "Catalogue sheet or book", many: "Catalogue sheets and books" },
  file: { one: "Catalogue file", many: "Other catalogue files" },
  model: { one: "Search model", many: "Search models" },
  dataset: { one: "Radio data", many: "Radio data" },
  document: { one: "Document", many: "Documents" },
};

/** The order kinds are offered in filters and listed in summaries. */
export const kindOrder: ManagedKind[] = ["zim", "map", "terrain", "places", "sheet", "file", "model", "dataset", "document"];

// ── What is taking the space ──

export interface UsageGroup {
  title: string;
  description: string;
  ids: UsageId[];
}

export const usageGroups: UsageGroup[] = [
  {
    title: "Downloaded",
    description: "From the catalogue or the map. All of it can be fetched again.",
    ids: ["zim", "map", "terrain", "places", "sheet", "file", "model", "dataset"],
  },
  { title: "Yours", description: "What you added or wrote. Outpost holds the only copy it knows of.", ids: ["document", "attachments"] },
  {
    title: "Outpost's own",
    description: "What Outpost keeps to do its work. Most of it can be worked out again from the above.",
    ids: ["database", "passages", "vectors", "extracted", "runtimes", "models"],
  },
  {
    title: "Left over",
    description: "Nothing uses these. They are listed one by one under Leftovers.",
    ids: ["unfinished", "untracked", "previous", "other"],
  },
];

export const usageNames: Record<UsageId, string> = {
  zim: kindNames.zim.many,
  map: kindNames.map.many,
  terrain: kindNames.terrain.many,
  places: kindNames.places.many,
  sheet: kindNames.sheet.many,
  file: kindNames.file.many,
  model: kindNames.model.many,
  dataset: kindNames.dataset.many,
  document: "Documents you added",
  attachments: "Pictures and files in notes",
  database: "Database",
  passages: "Search passages",
  vectors: "Semantic vectors",
  extracted: "Text read from documents",
  runtimes: "Programs for portable drives",
  models: "Search model files from an earlier version",
  previous: "Data set aside by a restore",
  unfinished: "Unfinished downloads",
  untracked: "Files no record refers to",
  other: "Other files in Outpost's folder",
};

/** A line under a row's name: how many, and anything a person should know about the figure. */
export function usageNote(row: UsageRow): string {
  const parts: string[] = [];
  if (row.count !== null) {
    const counted: Partial<Record<UsageId, [string, string?]>> = {
      attachments: ["file"],
      passages: ["passage"],
      vectors: ["vector"],
      unfinished: ["download"],
      untracked: ["file"],
      previous: ["copy", "copies"],
    };
    const words = counted[row.id] ?? ["item"];
    if (row.count > 0 || !(row.id in counted)) parts.push(plural(row.count, words[0], words[1]));
  }
  if (row.id === "database") parts.push("Notes, records, place names, the search index and history, in one file");
  if (row.within) parts.push("inside the database");
  if (row.basis === "estimate" && row.bytes !== null) parts.push("an estimate");
  if (row.disconnectedBytes > 0)
    parts.push(`${formatBytes(row.disconnectedBytes)} of it on a location that is not connected, as last known`);
  return parts.join("; ");
}

/**
 * A group's rows in the order they are shown: largest first, each followed by the rows
 * that are a part of it. Rows with nothing in them are left out.
 */
export function groupRows(group: UsageGroup, rows: UsageRow[]): UsageRow[] {
  const mine = rows.filter((row) => group.ids.includes(row.id) && (row.bytes === null || row.bytes > 0 || (row.count ?? 0) > 0));
  const top = mine
    .filter((row) => row.within === null)
    .sort((a, b) => (b.bytes ?? Number.POSITIVE_INFINITY) - (a.bytes ?? Number.POSITIVE_INFINITY));
  return top.flatMap((row) => [row, ...mine.filter((part) => part.within === row.id)]);
}

/** Rows that stand for space on disk in their own right (not a part of another row). */
export const standalone = (rows: UsageRow[]) => rows.filter((row) => row.within === null);

export function usageTotal(usage: UsageResponse): { bytes: number; counting: boolean } {
  const rows = standalone(usage.rows);
  return { bytes: rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0), counting: rows.some((row) => row.bytes === null) };
}

// ── Everything installed ──

export type SortOrder = "largest" | "smallest" | "newest" | "oldest" | "name" | "kind" | "location";

export const sortNames: Record<SortOrder, string> = {
  largest: "Largest first",
  smallest: "Smallest first",
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name, A to Z",
  kind: "By kind",
  location: "By location",
};

export interface ItemFilter {
  text: string;
  kind: ManagedKind | "all";
  locationId: string | "all";
  origin: "all" | "downloaded" | "own";
}

export function filterItems(items: ManagedItem[], filter: ItemFilter): ManagedItem[] {
  const words = filter.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filter.kind !== "all" && item.kind !== filter.kind) return false;
    if (filter.locationId !== "all" && item.locationId !== filter.locationId) return false;
    if (filter.origin !== "all" && item.origin !== filter.origin) return false;
    if (words.length === 0) return true;
    const haystack = `${item.title} ${item.documents.map((document) => document.title).join(" ")}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function sortItems(items: ManagedItem[], order: SortOrder): ManagedItem[] {
  const byName = (a: ManagedItem, b: ManagedItem) => a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true });
  const compare: Record<SortOrder, (a: ManagedItem, b: ManagedItem) => number> = {
    largest: (a, b) => b.sizeBytes - a.sizeBytes || byName(a, b),
    smallest: (a, b) => a.sizeBytes - b.sizeBytes || byName(a, b),
    newest: (a, b) => b.addedAt - a.addedAt || byName(a, b),
    oldest: (a, b) => a.addedAt - b.addedAt || byName(a, b),
    name: byName,
    kind: (a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || byName(a, b),
    location: (a, b) => a.locationName.localeCompare(b.locationName) || byName(a, b),
  };
  return [...items].sort(compare[order]);
}

export function tallyOf(items: ManagedItem[]): Tally {
  return { count: items.length, bytes: items.reduce((sum, item) => sum + item.sizeBytes, 0) };
}

export const tallyText = (tally: Tally, noun = "item") => `${plural(tally.count, noun)}, ${formatBytes(tally.bytes)}`;

/** A word for an item's state when it is anything but in place and ready. */
export function stateOf(item: ManagedItem): { label: string; tone: "warning" | "danger" | "lamp" } | null {
  if (item.state === "busy") return { label: "Being moved or checked", tone: "lamp" };
  if (!item.locationAvailable) return { label: "Not connected", tone: "warning" };
  if (item.state === "missing") return { label: "File missing", tone: "danger" };
  if (item.state === "damaged") return { label: "Damaged", tone: "danger" };
  return null;
}

// ── Summaries and accounts ──

/** What a removal will do, as the sentences shown before it is confirmed. */
export function planSentences(
  plan: CleanupPlan,
  /** `undoSaid`: the screen has already said, more strongly, that this cannot be undone. */
  options: { files: "delete" | "keep"; disconnected: "forget" | "leave"; undoSaid?: boolean },
): string[] {
  const lines: string[] = [];
  const staying = plan.byLocation.reduce((sum, location) => sum + location.stays.count, 0);
  if (options.files === "keep") {
    lines.push(
      `Outpost will forget ${plural(staying, "item")}. No file is deleted: each stays where it is, and can be deleted by hand or added again later.`,
    );
  } else if (plan.remove.count > 0) {
    lines.push(`${plural(plan.remove.count, "item")} will be deleted, files and all: ${formatBytes(plan.remove.bytes)}.`);
  } else {
    lines.push("Nothing will be deleted.");
  }
  if (options.files === "delete" && plan.linkedDocuments > 0) {
    lines.push(
      plan.linkedDocuments === 1
        ? "1 document in the library is the same file as a catalogue item here, and goes with it."
        : `${plural(plan.linkedDocuments, "document")} in the library are the same files as catalogue items here, and go with them.`,
    );
  }
  if (options.files === "delete" && plan.own.count > 0) {
    lines.push(
      `${plural(plan.own.count, "item")} (${formatBytes(plan.own.bytes)}) ${plan.own.count === 1 ? "is" : "are"} your own and cannot be downloaded again.`,
    );
  }
  if (options.files === "delete" && plan.remove.count > 0 && !options.undoSaid) {
    lines.push(
      plan.own.count < plan.remove.count
        ? "Deleting cannot be undone. What came from the catalogue or the map can be downloaded again."
        : "Deleting cannot be undone.",
    );
  }
  if (plan.downloads.count > 0) {
    lines.push(
      `${plural(plan.downloads.count, "unfinished download")} will be cancelled and ${plan.downloads.count === 1 ? "its partial file" : "their partial files"} deleted.`,
    );
  }
  return lines;
}

/** "340 repeaters in 2 lists", or without the lists when every one was entered by hand. */
function repeaterWords(repeaters: number, lists: number): string {
  return `${plural(repeaters, "repeater")}${lists > 0 ? ` in ${plural(lists, "list")}` : ""}`;
}

/** "2 communication plans, 340 logged contacts and 3 equipment profiles", leaving out what there is none of; null when there is nothing. */
function radioWords(radio: RadioKept | undefined): string | null {
  if (!radio) return null;
  const parts = [
    radio.plans > 0 ? plural(radio.plans, "communication plan") : null,
    radio.observations > 0 ? plural(radio.observations, "logged contact") : null,
    radio.equipment > 0 ? plural(radio.equipment, "radio or antenna profile", "radio and antenna profiles") : null,
    radio.saved > 0 ? plural(radio.saved, "saved prediction or coverage map", "saved predictions and coverage maps") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "40 rows of supplies, a household of 3 and a shopping list of 6 lines", leaving out what there is none of; null when there is nothing. */
export function suppliesWords(supplies: SuppliesKept | undefined): string | null {
  if (!supplies) return null;
  const parts = [
    supplies.items > 0 ? plural(supplies.items, "row of supplies", "rows of supplies") : null,
    supplies.members > 0 ? `a household of ${formatNumber(supplies.members)}` : null,
    supplies.shopping > 0 ? `a shopping list of ${plural(supplies.shopping, "line")}` : null,
    supplies.barcodes > 0 ? plural(supplies.barcodes, "remembered barcode") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "120 Morse practice sessions and the trainer's progress", or null when there is nothing. */
export function morseWords(morse: MorseKept | undefined): string | null {
  if (!morse || (morse.sessions === 0 && morse.progress === 0)) return null;
  const progress = morse.progress > 0 ? "the Morse trainer's progress and settings" : null;
  if (morse.sessions === 0) return progress;
  const sessions = plural(morse.sessions, "Morse practice session");
  return progress ? `${sessions} with the trainer's progress and settings` : sessions;
}

/** "3 games kept for the household" (the allotment, and each game's tally), or null when there is nothing. */
export function gamesWords(games: GamesKept | undefined): string | null {
  if (!games || games.saves === 0) return null;
  return plural(games.saves, "game kept for the household", "games kept for the household");
}

/** "the learning progress of 2 learners (140 pages)", or null when there is nothing. */
export function learningWords(learning: LearningKept | undefined): string | null {
  if (!learning || learning.pages === 0) return null;
  return `the learning progress of ${plural(learning.learners, "learner")} (${plural(learning.pages, "page")})`;
}

/** "2 weather places, 140 barometer readings and 6 fetched forecasts and warnings", leaving out what there is none of; null when there is nothing. */
export function weatherWords(weather: WeatherKept | undefined): string | null {
  if (!weather) return null;
  const parts = [
    weather.places > 0 ? plural(weather.places, "weather place") : null,
    weather.readings > 0 ? plural(weather.readings, "barometer reading") : null,
    weather.copies > 0 ? plural(weather.copies, "fetched forecast or warning", "fetched forecasts and warnings") : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** The person's own things that "erase everything" takes besides files, leaving out what there is none of. */
export function personalWords(personal: NonNullable<CleanupPlan["personal"]>): string {
  const parts: string[] = [];
  if (personal.pages > 0) {
    parts.push(
      `${plural(personal.pages, "page")} of notes${personal.attachments.count > 0 ? ` with ${plural(personal.attachments.count, "attachment")} (${formatBytes(personal.attachments.bytes)})` : ""}`,
    );
  }
  if (personal.places > 0) parts.push(plural(personal.places, "saved place"));
  if (personal.routes > 0) parts.push(plural(personal.routes, "route"));
  if (personal.contacts > 0) parts.push(plural(personal.contacts, "contact"));
  if (personal.conversations > 0) parts.push(plural(personal.conversations, "chat conversation"));
  if (personal.repeaters > 0 || personal.repeaterLists > 0) parts.push(repeaterWords(personal.repeaters, personal.repeaterLists));
  const radio = radioWords(personal.radio);
  if (radio) parts.push(radio);
  if ((personal.powerPlans ?? 0) > 0) parts.push(plural(personal.powerPlans ?? 0, "power plan"));
  if ((personal.powerDevices ?? 0) > 0) parts.push(plural(personal.powerDevices ?? 0, "device of your own", "devices of your own"));
  const supplies = suppliesWords(personal.supplies);
  if (supplies) parts.push(supplies);
  if ((personal.nuclearScenarios ?? 0) > 0)
    parts.push(plural(personal.nuclearScenarios!, "saved nuclear effects scenario or set", "saved nuclear effects scenarios and sets"));
  if (personal.networkDevices) parts.push(plural(personal.networkDevices, "device found on the network", "devices found on the network"));
  const weather = weatherWords(personal.weather);
  if (weather) parts.push(weather);
  if ((personal.emergencyPlans ?? 0) > 0) parts.push(plural(personal.emergencyPlans ?? 0, "emergency plan"));
  const morse = morseWords(personal.morse);
  if (morse) parts.push(morse);
  const games = gamesWords(personal.games);
  if (games) parts.push(games);
  const learning = learningWords(personal.learning);
  if (learning) parts.push(learning);
  if ((personal.pgpKeys ?? 0) > 0) parts.push(plural(personal.pgpKeys ?? 0, "PGP key"));
  if ((personal.driveMerges ?? 0) > 0)
    parts.push(plural(personal.driveMerges ?? 0, "record of a merge from a drive", "records of merges from drives"));
  if (personal.settings > 0) parts.push(plural(personal.settings, "changed setting"));
  if (personal.vectors > 0) parts.push(plural(personal.vectors, "semantic vector"));
  parts.push("the history of downloads and other work");
  if (personal.previous.count > 0) {
    parts.push(
      `${plural(personal.previous.count, "copy", "copies")} of earlier data set aside by a restore${personal.previous.bytes > 0 ? ` (${formatBytes(personal.previous.bytes)})` : ""}`,
    );
  }
  return `Also erased: ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " and " : ""}${parts.at(-1)}.`;
}

/** One line for what happened to the things a clean-up did not delete. */
export function resultSentences(result: CleanupResult): string[] {
  const lines: string[] = [];
  if (result.scope === "derived") return (result.steps ?? []).map((step) => step.message);
  if (result.scope === "everything" && result.personal) {
    const {
      pages,
      places,
      routes,
      contacts,
      conversations,
      repeaters,
      repeaterLists,
      radio,
      powerPlans,
      supplies,
      nuclearScenarios,
      attachments,
      settings,
    } = result.personal;
    // Kept apart from the list above, one name to a line, so that a new kind of data adds a line and nothing else.
    const { weather } = result.personal;
    const erased = [
      pages > 0 ? `${plural(pages, "page")} of notes${attachments > 0 ? ` with ${plural(attachments, "attachment")}` : ""}` : null,
      places > 0 ? plural(places, "saved place") : null,
      routes > 0 ? plural(routes, "route") : null,
      contacts > 0 ? plural(contacts, "contact") : null,
      conversations > 0 ? plural(conversations, "chat conversation") : null,
      repeaters > 0 || repeaterLists > 0 ? repeaterWords(repeaters, repeaterLists) : null,
      radioWords(radio),
      (powerPlans ?? 0) > 0 ? plural(powerPlans ?? 0, "power plan") : null,
      (result.personal.powerDevices ?? 0) > 0
        ? plural(result.personal.powerDevices ?? 0, "device of your own", "devices of your own")
        : null,
      suppliesWords(supplies),
      (nuclearScenarios ?? 0) > 0
        ? plural(nuclearScenarios!, "saved nuclear effects scenario or set", "saved nuclear effects scenarios and sets")
        : null,
      weatherWords(weather),
      (result.personal.emergencyPlans ?? 0) > 0 ? plural(result.personal.emergencyPlans ?? 0, "emergency plan") : null,
      morseWords(result.personal.morse),
      gamesWords(result.personal.games),
      learningWords(result.personal.learning),
      (result.personal.pgpKeys ?? 0) > 0 ? plural(result.personal.pgpKeys ?? 0, "PGP key") : null,
      (result.personal.driveMerges ?? 0) > 0
        ? plural(result.personal.driveMerges ?? 0, "record of a merge from a drive", "records of merges from drives")
        : null,
      settings > 0 ? plural(settings, "changed setting") : null,
      "the history",
    ].filter((part): part is string => part !== null);
    lines.push(`Erased ${erased.slice(0, -1).join(", ")}${erased.length > 1 ? " and " : ""}${erased.at(-1)}.`);
  }
  if (result.removed.count > 0) lines.push(`Deleted ${tallyText(result.removed)}.`);
  if (result.forgotten.count > 0) {
    lines.push(
      `Forgot ${plural(result.forgotten.count, "item")} without deleting ${result.forgotten.count === 1 ? "its file" : "their files"} (${formatBytes(result.forgotten.bytes)}).`,
    );
  }
  if (result.left.count > 0) {
    lines.push(
      `Left ${plural(result.left.count, "item")} exactly as ${result.left.count === 1 ? "it was" : "they were"}, on a location that is not connected.`,
    );
  }
  const failed = result.failed.length + result.failedMore;
  if (failed > 0) lines.push(`${plural(failed, "item")} could not be removed and ${failed === 1 ? "was" : "were"} not changed.`);
  if (result.stopped)
    lines.push(`Stopped before reaching ${plural(result.notReached, "more item")}. What was already removed stays removed.`);
  if (lines.length === 0) lines.push("There was nothing to remove.");
  return lines;
}

// ── Leftovers ──

export interface LeftoverWords {
  title: string;
  /** What these are and what clearing one does, in plain words. */
  description: string;
  /** The button, and the verb in the confirmation. */
  action: string;
  /** What the confirmation says will happen. */
  confirm: string;
}

export const leftoverWords: Record<LeftoverKind, LeftoverWords> = {
  download: {
    title: "Downloads that did not finish",
    description:
      "Each stopped part of the way, was cancelled or failed, and the part that arrived is still on disk. Clearing one deletes that partial file and takes the download off the Downloads screen. Starting it again later begins from nothing.",
    action: "Clear",
    confirm:
      "Their partial files are deleted and the downloads are taken off the Downloads screen. Nothing that finished installing is touched.",
  },
  missing: {
    title: "Records whose file has gone",
    description:
      "Outpost has a record of each of these, but the file is no longer on its storage location, which is connected. Forgetting one removes the record and its text from search. Nothing is deleted from disk. Anything from the catalogue can be downloaded again from Explore.",
    action: "Forget",
    confirm: "Outpost's records of them are removed, along with their text in search. There is no file to delete.",
  },
  untracked: {
    title: "Files no record refers to",
    description:
      "These are inside the two folders Outpost makes in a storage location (collections and documents), but nothing in your library refers to them: usually what a removal or a move left behind when it was cut off. Deleting one deletes that file for good. Outpost never looks at, or deletes, anything outside those two folders.",
    action: "Delete",
    confirm: "These files are deleted for good. Outpost has no record of what they were, so it cannot fetch them again.",
  },
  upload: {
    title: "Uploads that did not finish",
    description:
      "Parts of files that were being uploaded more than a day ago and never completed. Deleting them loses nothing: no document came of them.",
    action: "Delete",
    confirm: "The partial files are deleted. No document is affected.",
  },
  history: {
    title: "History",
    description:
      "The lists of finished work and finished downloads shown on the Downloads screen. Clearing them shortens those lists and nothing else: what was installed stays installed.",
    action: "Clear",
    confirm: "The lists are emptied. Nothing installed is removed. A download that failed keeps its entry, so it can still be retried.",
  },
  cache: {
    title: "Things that can be fetched or worked out again",
    description: "Outpost keeps these so it does not have to fetch or work them out twice. Each says what getting it back would take.",
    action: "Clear",
    confirm: "They are deleted. Each comes back the next time it is needed, as described beside it.",
  },
  previous: {
    title: "Data set aside by a restore",
    description:
      "When a backup is restored, the database and attachments it replaced are kept in a folder beside it, in case the restore was a mistake. Deleting a folder means that restore can no longer be undone by hand.",
    action: "Delete",
    confirm: "The copies are deleted for good. The restores they came from can then no longer be undone.",
  },
};

/** What getting a cleared cache back costs. */
export const cacheCost: Record<string, string> = {
  runtimes:
    "Fetched again, about 50 to 100 MB for each kind of computer, the next time a portable drive is written. That needs a connection.",
  weather:
    "Fetched again from the publishers when Update now is pressed on Weather and hazards. That needs a connection; until then there is no forecast or warning to read offline.",
  models: "Left by an earlier version. Nothing uses them now: the model for search by meaning is part of Outpost itself.",
  text: "Belongs to documents that have been removed. Nothing uses it.",
  snapshots: "Left by backups that were interrupted. Nothing uses them.",
};

export const leftoverOrder: LeftoverKind[] = ["download", "missing", "untracked", "upload", "cache", "previous", "history"];

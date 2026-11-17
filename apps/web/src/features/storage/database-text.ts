/** The words the Database section uses, kept apart so they can be tested on their own. */
import type { DatabaseCountId, DatabaseGroupId, DatabaseStatus } from "@outpost/shared";
import { plural } from "@/lib/utils";

/** Each count as the rest of the app names it: singular and plural. */
const COUNT_WORDS: Record<DatabaseCountId, [string, string]> = {
  documents: ["document", "documents"],
  passages: ["passage in the search index", "passages in the search index"],
  vectors: ["passage read for search by meaning", "passages read for search by meaning"],
  pages: ["page of notes", "pages of notes"],
  attachments: ["attachment", "attachments"],
  places: ["saved place", "saved places"],
  routes: ["route", "routes"],
  placeNames: ["place name", "place names"],
  contacts: ["contact", "contacts"],
  conversations: ["chat conversation", "chat conversations"],
  repeaters: ["repeater", "repeaters"],
  plans: ["communication plan", "communication plans"],
  observations: ["logged contact", "logged contacts"],
  equipment: ["radio or antenna profile", "radio and antenna profiles"],
  predictions: ["saved prediction or coverage map", "saved predictions and coverage maps"],
  powerPlans: ["power plan", "power plans"],
  powerDevices: ["device of your own for the battery calculators", "devices of your own for the battery calculators"],
  supplies: ["item of supplies", "items of supplies"],
  scenarios: ["saved nuclear effects scenario or set", "saved nuclear effects scenarios and sets"],
  networkDevices: ["device found on the network", "devices found on the network"],
  pressureReadings: ["barometer reading", "barometer readings"],
  emergencyPlans: ["emergency plan", "emergency plans"],
  morseSessions: ["Morse practice session", "Morse practice sessions"],
  gameSaves: ["game kept for the household", "games kept for the household"],
  boardMessages: ["message on the board", "messages on the board"],
  learningPages: ["page of learning progress", "pages of learning progress"],
  repeaterLists: ["list of repeaters", "lists of repeaters"],
  weatherPlaces: ["weather place", "weather places"],
  pgpKeys: ["PGP key", "PGP keys"],
  referenceRecords: ["record in the map's reference layers", "records in the map's reference layers"],
};

/** "68,600 passages in the search index", for each count above nought. */
export function countWords(counts: Array<{ id: DatabaseCountId; count: number }>): string[] {
  return counts.filter((entry) => entry.count > 0).map((entry) => plural(entry.count, ...COUNT_WORDS[entry.id]));
}

export const GROUP_WORDS: Record<DatabaseGroupId, { label: string; detail: string }> = {
  search: { label: "Search index", detail: "Passages and the index of their words" },
  meaning: { label: "Search by meaning", detail: "A vector for each passage read" },
  library: { label: "Library records", detail: "Documents, collections, downloads" },
  notes: { label: "Notes", detail: "Pages, links, attachment records" },
  maps: { label: "Maps", detail: "Saved places, routes, place names, reference layers, nuclear effects scenarios" },
  radio: { label: "Radio", detail: "Repeaters, plans, the log, predictions, Morse practice" },
  prepare: {
    label: "Preparedness",
    detail: "Emergency plans, supplies and the shopping list, weather places and barometer readings",
  },
  other: {
    label: "Everything else",
    detail:
      "Contacts and PGP keys, chat, power plans, devices on the network, the games, the household board, settings, the history of work",
  },
};

/** "0.4 seconds", "12 seconds", "3 minutes". */
export function duration(milliseconds: number): string {
  if (milliseconds < 100) return "under 0.1 seconds";
  if (milliseconds < 1000) return `${(milliseconds / 1000).toFixed(1)} seconds`;
  if (milliseconds < 60_000) {
    const seconds = milliseconds < 10_000 ? (milliseconds / 1000).toFixed(1) : String(Math.round(milliseconds / 1000));
    return `${seconds} seconds`;
  }
  return plural(Math.round(milliseconds / 60_000), "minute");
}

/** The layout of the tables, in plain words. */
export function schemaWords(schema: DatabaseStatus["schema"]): string {
  if (schema.state === "current")
    return `Up to date: all ${schema.known} changes to its layout that this version of Outpost knows have been made.`;
  if (schema.state === "behind")
    return `${schema.applied} of ${schema.known} changes to its layout have been made. The rest are made the next time Outpost starts.`;
  return `It has ${schema.applied} changes to its layout, more than the ${schema.known} this version of Outpost knows: a newer version made it. Update Outpost before changing anything.`;
}

/** Less unused than this, and reclaiming is not offered: the whole file would be rewritten for almost nothing. */
export const WORTH_RECLAIMING = 1024 * 1024;

/** Why space cannot be reclaimed from here now, or null when it can. */
export function reclaimBlocked(status: DatabaseStatus, formatBytes: (bytes: number | null) => string): string | null {
  const { reclaim, file, disk } = status;
  if (!reclaim.right.allowed) {
    return `This can only be done on the computer Outpost runs on, because nobody can save anything while it runs. Start Outpost with ${reclaim.right.option}=true to allow it from other devices.`;
  }
  if (file.unusedPages === 0) return "There is no unused space to reclaim.";
  if (file.unusedBytes < WORTH_RECLAIMING) return "So little is unused that rewriting the file for it is not worth the wait.";
  if (!reclaim.enoughRoom) {
    if (reclaim.tempNeededBytes !== null && (reclaim.tempFreeBytes ?? 0) < reclaim.tempNeededBytes) {
      return `It needs ${formatBytes(reclaim.tempNeededBytes)} free in the folder for temporary files, and that drive has ${formatBytes(reclaim.tempFreeBytes)}.`;
    }
    return `It needs ${formatBytes(reclaim.neededBytes)} free on this drive, and there is ${formatBytes(disk.freeBytes)}. Free some space first.`;
  }
  if (reclaim.waitingFor.length > 0) return `It can start once this has finished, or been paused: ${reclaim.waitingFor.join("; ")}.`;
  return null;
}

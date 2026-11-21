/**
 * Managing and cleaning up what Outpost stores: what is taking the space, everything
 * installed in one list, leftovers, and the three bulk clean-ups.
 */
import type { BoardKept } from "./board.ts";
import type { JobDto, LocalBy } from "./common.ts";
import type { GamesKept } from "./games.ts";
import type { LearningKept } from "./learning.ts";
import type { MorseKept } from "./morse.ts";
import type { StorageKind } from "./storage.ts";
import type { WeatherKept } from "./weather.ts";

/** The phrase a person types before everything is erased. */
export const ERASE_CONFIRMATION = "erase everything";

// ── Everything installed ────────────────────────────────────────────────────

/**
 * What an installed thing is, as a person would sort them. A "sheet" is a catalogue
 * sheet or book: one item in Explore that is also one or more documents in the library.
 */
/** "layer" is a dataset drawn on the map (reference layers: Natural Earth, airports, OpenStreetMap extracts); "dataset" is the rest. */
export type ManagedKind = "zim" | "map" | "terrain" | "places" | "layer" | "sheet" | "file" | "model" | "dataset" | "document";

/**
 * Where it came from. "downloaded" came from the catalogue or a download and can be
 * fetched again; "own" is something the person added (an upload, an import, an archive
 * of their own that Outpost was pointed at) and cannot.
 */
export type ManagedOrigin = "downloaded" | "own";

export interface ManagedItem {
  /** "collection:<id>" or "document:<id>". */
  key: string;
  type: "collection" | "document";
  id: string;
  title: string;
  kind: ManagedKind;
  origin: ManagedOrigin;
  sizeBytes: number;
  addedAt: number;
  locationId: string;
  locationName: string;
  locationAvailable: boolean;
  relPath: string;
  /** Inside the folders Outpost itself makes in a storage location. */
  inOutpostFolder: boolean;
  state: "ok" | "missing" | "damaged" | "busy";
  /** Why it cannot be removed or moved just now; null when it can. */
  busyReason: string | null;
  /** Documents that are the same file or files as this catalogue item, and go with it. */
  documents: Array<{ id: string; title: string }>;
  catalogEntryId: string | null;
  /** In-app address of its own page. */
  href: string;
  /** What stops working without it, said before it is removed. */
  warning?: string | null;
}

export interface ManagedItemsResponse {
  items: ManagedItem[];
}

// ── Summaries shown before anything happens ─────────────────────────────────

export interface Tally {
  count: number;
  bytes: number;
}

export type CleanupScope = "items" | "downloaded" | "everything";

/** One thing a plan or a result names, with where its file is. */
export interface NamedFile {
  title: string;
  locationName: string;
  /** Absolute path as last known. */
  path: string;
  bytes: number;
}

export interface PlanLocation {
  locationId: string;
  name: string;
  path: string;
  available: boolean;
  /** Deleted from here, files and all. */
  remove: Tally;
  /** Stays here: Outpost can only forget it, or it is outside the folders Outpost made. */
  stays: Tally;
}

export interface CleanupPlan {
  scope: CleanupScope;
  /** How many things carrying this out would change: deleted, or forgotten. */
  changes: number;
  /** Everything that will go, files included. */
  remove: Tally;
  byKind: Array<{ kind: ManagedKind } & Tally>;
  byLocation: PlanLocation[];
  /** Of what will go: the person's own, which cannot be downloaded again. */
  own: Tally;
  /** Documents that go because the catalogue item they belong to goes. */
  linkedDocuments: number;
  /** On a location that is not connected: the files cannot be deleted from here. */
  disconnected: Tally & { files: NamedFile[] };
  /** Outside the folders Outpost made: only ever forgotten, never deleted, by "erase everything". */
  outside: Tally & { files: NamedFile[] };
  /** Being moved or checked, so left alone. */
  refused: Array<{ key: string; title: string; reason: string }>;
  /** Downloads still under way or left unfinished that will be cancelled and cleared. */
  downloads: Tally;
  /** Only for "everything": the person's own things that are not files in a location. */
  personal?: {
    pages: number;
    attachments: Tally;
    places: number;
    routes: number;
    contacts: number;
    /** Chat conversations, each with its messages. */
    conversations: number;
    /** Repeaters in imported lists and ones the person added, and how many lists hold them. */
    repeaters: number;
    repeaterLists: number;
    /** What the HF planner keeps for a person; see `RadioKept`. Absent from a plan made before it was counted. */
    radio?: RadioKept;
    /** Power plans (Tools → Power and batteries). Absent from a plan made before they were counted. */
    powerPlans?: number;
    /** A person's own devices for the battery calculators (Tools → Power and batteries). Absent from a plan made before they were counted. */
    powerDevices?: number;
    /** Supplies and the household they are for; see `SuppliesKept`. Absent from a plan made before it was counted. */
    supplies?: SuppliesKept;
    /** Scenarios saved in the nuclear effects simulator. Absent from a plan made before they were counted. */
    nuclearScenarios?: number;
    /** Devices found on the network, with any names and notes given them. Absent from a plan made before it was counted. */
    networkDevices?: number;
    /** Weather places, barometer readings and the copies fetched for them; see `WeatherKept`. Absent from a plan made before it was counted. */
    weather?: WeatherKept;
    /** Emergency plans (Preparedness). Absent from a plan made before they were counted. */
    emergencyPlans?: number;
    /** Medical sheets, the communication plan and the binder's record (Preparedness). Absent from a plan made before they were counted. */
    householdPapers?: number;
    /** The Morse trainer's practice sessions and its record of progress. Absent from a plan made before it was counted. */
    morse?: MorseKept;
    /** The games: the allotment's plot and each game's tally, one row each. Absent from a plan made before they were counted. */
    games?: GamesKept;
    /** Messages, check-ins and sent files on the household board. Absent from a plan made before they were counted. */
    board?: BoardKept;
    /** Learning progress in reference archives: learners and the pages recorded for them. Absent from a plan made before it was counted. */
    learning?: LearningKept;
    /** Stations, aircraft and ships heard on the radio, with their trails (Heard on the radio). Absent from a plan made before they were counted. */
    heard?: number;
    /** PGP keys kept for contacts, any private key of the person's own among them. Absent from a plan made before they were counted. */
    pgpKeys?: number;
    /** Records of merges from portable drives, which hold earlier versions of pages. Absent from a plan made before they were counted. */
    driveMerges?: number;
    settings: number;
    vectors: number;
    /** Copies of the database and attachments that a restore set aside. */
    previous: Tally;
  };
}

/** The person's own things in the HF planner: all of it goes with "erase everything". */
export interface RadioKept {
  /** Communication plans. */
  plans: number;
  /** Entries of the contact log. */
  observations: number;
  /** Radio and antenna profiles. */
  equipment: number;
  /** Saved predictions and saved coverage maps. */
  saved: number;
}

/** The person's own things under Preparedness, Supplies: all of it goes with "erase everything". */
export interface SuppliesKept {
  /** Rows of stock. */
  items: number;
  /** People and pets of the household. */
  members: number;
  /** Lines of the shopping list. */
  shopping: number;
  /** Barcodes remembered after their items were used up or removed. */
  barcodes: number;
}

// ── What a clean-up did ─────────────────────────────────────────────────────

export interface CleanupResult extends Record<string, unknown> {
  scope: CleanupScope | "derived";
  /** The person stopped it part of the way through. */
  stopped: boolean;
  /** Deleted, files and all. */
  removed: Tally;
  /** Outpost's record removed; the file is still where it was. */
  forgotten: Tally;
  /** Left exactly as it was, record and file, because its location is not connected. */
  left: Tally;
  /** Files Outpost did not delete (forgotten or left), and where they are. */
  leftBehind: NamedFile[];
  /** How many more were left behind than `leftBehind` lists. */
  leftBehindMore: number;
  /** Could not be removed; nothing about them changed. */
  failed: Array<{ title: string; reason: string }>;
  failedMore: number;
  /** Not reached before it was stopped. */
  notReached: number;
  /** One sentence for the job list. */
  message: string;
  /** For "derived": what each step did. */
  steps?: Array<{ step: DerivedStep; message: string }>;
  /** For "everything": the rest of what went. */
  personal?: {
    pages: number;
    attachments: number;
    places: number;
    routes: number;
    contacts: number;
    conversations: number;
    repeaters: number;
    repeaterLists: number;
    radio?: RadioKept;
    powerPlans?: number;
    powerDevices?: number;
    supplies?: SuppliesKept;
    nuclearScenarios?: number;
    networkDevices?: number;
    weather?: WeatherKept;
    emergencyPlans?: number;
    householdPapers?: number;
    morse?: MorseKept;
    games?: GamesKept;
    board?: BoardKept;
    learning?: LearningKept;
    heard?: number;
    pgpKeys?: number;
    driveMerges?: number;
    settings: number;
  };
}

export interface ManageMoveResponse {
  jobs: JobDto[];
  refused: Array<{ key: string; title: string; reason: string }>;
}

// ── What is taking the space ────────────────────────────────────────────────

export type UsageId =
  | "zim"
  | "map"
  | "terrain"
  | "places"
  | "layer"
  | "sheet"
  | "file"
  | "model"
  | "dataset"
  | "document"
  | "attachments"
  /** Files sent on the household board. */
  | "board"
  | "database"
  | "passages"
  | "vectors"
  | "extracted"
  | "runtimes"
  | "models"
  | "previous"
  | "unfinished"
  | "untracked"
  | "other";

export interface UsageRow {
  id: UsageId;
  /** null while it is still being counted. */
  bytes: number | null;
  /** How many things, where that means something. */
  count: number | null;
  /**
   * How the figure was arrived at: "records" is what Outpost wrote down when the thing
   * was installed, "disk" was measured from the files, "estimate" is worked out.
   */
  basis: "records" | "disk" | "estimate";
  /** Part of this figure is on a location that is not connected, as last known. */
  disconnectedBytes: number;
  /** Counted inside another row (passages and vectors are inside the database file). */
  within: UsageId | null;
}

export interface UsageLocation {
  id: string;
  name: string;
  path: string;
  kind: StorageKind;
  isDefault: boolean;
  available: boolean;
  statusDetail: string | null;
  lastSeenAt: number | null;
  /** Capacity and free space; as last known when the location is not connected. */
  totalBytes: number | null;
  freeBytes: number | null;
  /** What Outpost's records say is here. */
  recorded: Tally;
  byKind: Array<{ kind: ManagedKind } & Tally>;
  /** Measured in the folders Outpost made here; null when not connected or not yet counted. */
  measuredBytes: number | null;
}

export interface UsageResponse {
  rows: UsageRow[];
  locations: UsageLocation[];
  /** Outpost's own folder: the database, extracted text, caches. */
  dataDir: { path: string; totalBytes: number | null; freeBytes: number | null; measuredBytes: number | null };
  /** When the figures measured from disk were taken; null until the first count finishes. */
  measuredAt: number | null;
  /** A count is under way; figures marked "disk" may be from the one before. */
  measuring: boolean;
}

// ── Leftovers ───────────────────────────────────────────────────────────────

export type LeftoverKind =
  /** A download that stopped, was cancelled or failed, with the part that arrived. */
  | "download"
  /** A record whose file is no longer on its (connected) location. */
  | "missing"
  /** A file in one of Outpost's folders that no record refers to. */
  | "untracked"
  /** Part of an upload that never finished. */
  | "upload"
  /** Finished work kept as history. */
  | "history"
  /** Something that can be fetched or worked out again. */
  | "cache"
  /** Data set aside by a restore. */
  | "previous"
  /** The household board's messages and sent files: the household's own, listed so that it can be emptied here. */
  | "board";

export interface Leftover {
  /** Opaque; sent back to clear it. */
  id: string;
  kind: LeftoverKind;
  title: string;
  /** A path, or a few words on what it is. */
  detail: string | null;
  bytes: number | null;
  /** How many records or files it stands for, when more than one. */
  count: number | null;
  locationName: string | null;
  /** In-app address where it can be dealt with another way (download again, open it). */
  href: string | null;
  /** More specific than the kind, for the words shown: which cache, which history. */
  what: string | null;
}

export interface LeftoversResponse {
  items: Leftover[];
  /** Per kind, how many more there are than `items` lists. */
  more: Partial<Record<LeftoverKind, Tally>>;
  measuredAt: number | null;
  measuring: boolean;
}

export interface ClearLeftoversResponse {
  cleared: Tally;
  failed: Array<{ id: string; title: string; reason: string }>;
}

// ── The clean-ups ───────────────────────────────────────────────────────────

export type DerivedStep = "vectors" | "text" | "compact";

export interface CleanupStatus {
  /** Whether this request may erase everything, and if not, why. */
  erase: { allowed: boolean; reason: "local" | "option" | "remote"; option: string; localBy?: LocalBy };
  derived: {
    vectors: { count: number; bytes: number };
    documents: { count: number; unreachable: number };
    /** Space inside the database file that compacting would hand back to the disk. */
    reclaimableBytes: number;
    databaseBytes: number;
  };
  /** A clean-up that is waiting or running. */
  active: JobDto | null;
  /** The last one that finished, so its account can still be read. */
  last: JobDto | null;
}

export interface ManageJobResponse {
  job: JobDto;
}

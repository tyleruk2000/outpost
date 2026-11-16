import type { BackupRight } from "./backup.ts";
import type { JobDto } from "./common.ts";

/**
 * The database on the Storage screen: where the one SQLite file is, what is in it, what
 * state it is in, and the two things that can be done to look after it.
 */

/** Things counted inside the database, each named on the screen as the rest of the app names it. */
export type DatabaseCountId =
  | "documents"
  | "passages"
  | "vectors"
  | "pages"
  | "attachments"
  | "places"
  | "routes"
  | "placeNames"
  | "contacts"
  | "conversations"
  | "repeaters"
  | "plans"
  | "observations"
  | "equipment"
  | "predictions";

/** Where the bytes go, in a few plain groups of tables. */
export type DatabaseGroupId = "search" | "meaning" | "library" | "notes" | "maps" | "radio" | "other";

/**
 * What is in the database, worked out on a connection of its own away from the server's
 * thread, and kept until it is asked for again. Costly on a large file, so it carries
 * when it was worked out.
 */
export interface DatabaseContents {
  workedOutAt: number;
  /** How long it took, in milliseconds. */
  milliseconds: number;
  /**
   * `dbstat`: every page of the file was read and attributed to its table with SQLite's
   * dbstat table, so `groups` and `unusedBytes` add up to `fileBytes`. `counts`: this
   * build of SQLite has no dbstat, so only the counts are known and `groups` is null.
   */
  method: "dbstat" | "counts";
  counts: Array<{ id: DatabaseCountId; count: number }>;
  groups: Array<{ id: DatabaseGroupId; bytes: number }> | null;
  /** Pages no table uses, left by things removed: what reclaiming would give back. */
  unusedBytes: number;
  /** The size of the main file when this was worked out (pages × page size). */
  fileBytes: number;
}

/** The result of the last check of the database. */
export interface DatabaseCheck {
  /** `quick`: SQLite's quick_check. `full`: integrity_check, which also matches every index to its table. */
  kind: "quick" | "full";
  at: number;
  milliseconds: number;
  ok: boolean;
  /** SQLite's own first lines about what is wrong, when something is. At most ten. */
  problems: string[];
}

/** The result of the last reclaiming of unused space. */
export interface DatabaseVacuum {
  at: number;
  milliseconds: number;
  beforeBytes: number;
  afterBytes: number;
}

export interface DatabaseStatus {
  file: {
    /** The file's place on the computer Outpost runs on, as the Storage screen shows the folders of its locations. */
    path: string;
    /** The main file. */
    bytes: number;
    /** The write-ahead log beside it: changes not yet folded into the main file. */
    walBytes: number;
    pageSize: number;
    pages: number;
    /** Pages no table uses (`freelist_count`). */
    unusedPages: number;
    unusedBytes: number;
  };
  /** The drive the database is on. Null figures when the system would not say. */
  disk: {
    freeBytes: number | null;
    totalBytes: number | null;
    /** Less free than the reserve Outpost keeps on every storage location. */
    low: boolean;
    reserveBytes: number;
  };
  sqlite: {
    version: string;
    /** `wal` normally: changes go to the write-ahead log first. */
    journalMode: string;
    /** Whether this build of SQLite has the dbstat table, which sizes are measured with. */
    dbstat: boolean;
  };
  /**
   * The layout of the tables. Outpost changes it in numbered steps (migrations) as it is
   * updated; `applied` is how many this database has had, `known` how many this version
   * of Outpost has. `ahead` means a newer Outpost made it.
   */
  schema: {
    applied: number;
    known: number;
    /** When the last step applied was written, from the step itself. */
    lastAppliedAt: number | null;
    state: "current" | "behind" | "ahead";
  };
  backup: {
    /** When the newest backup that passed its check was written to a storage location. Downloads from Settings are not recorded. */
    lastAt: number | null;
    /** How it was started: on the schedule, or with "Back up now". */
    kind: "scheduled" | "manual" | null;
    /** Whether backups are made on a schedule. */
    scheduled: boolean;
  };
  /** Null until it has been worked out once since the server started. */
  contents: DatabaseContents | null;
  /** True while the contents are being worked out. */
  measuring: boolean;
  lastCheck: DatabaseCheck | null;
  lastVacuum: DatabaseVacuum | null;
  /** A check or a reclaim that is queued or running. */
  active: JobDto | null;
  /** What reclaiming unused space would need, and what stands in its way now. */
  reclaim: {
    /**
     * Free space needed on the drive the database is on: room for the rewritten copy and
     * the write-ahead log it passes through, plus the reserve. When SQLite's temporary
     * folder is on another drive, that drive needs room for one copy (`tempFreeBytes`).
     */
    neededBytes: number;
    tempNeededBytes: number | null;
    tempFreeBytes: number | null;
    enoughRoom: boolean;
    /** Titles of work that must finish first (backups, imports, index builds, downloads, anything running). */
    waitingFor: string[];
    right: BackupRight;
  };
}

export interface DatabaseJobResponse {
  job: JobDto;
}

/**
 * What the database worker does, on a connection of its own to the database file.
 *
 * Each of these reads the whole file or rewrites it, which on a database of a few
 * hundred megabytes takes from a fraction of a second to minutes depending on the disk.
 * They run in a worker thread (`database.worker.ts`) so that the server's own thread
 * goes on answering meanwhile; tests call them directly.
 */
import type { DatabaseCheck, DatabaseContents, DatabaseCountId, DatabaseGroupId } from "@outpost/shared";
import Database from "better-sqlite3";

/** The tables of each group. A table not listed here counts as "everything else". */
const GROUPS: Record<Exclude<DatabaseGroupId, "other">, string[]> = {
  search: ["search_entities", "chunks", "chunks_fts", "chunks_fts_config", "chunks_fts_data", "chunks_fts_docsize", "chunks_fts_idx"],
  meaning: ["embeddings", "embedding_models"],
  library: ["documents", "document_tags", "tags", "book_chapters", "collections", "downloads", "catalog_cache"],
  notes: ["notes", "note_tags", "note_links", "attachments", "imports"],
  maps: [
    "places",
    "places_fts",
    "places_fts_config",
    "places_fts_data",
    "places_fts_docsize",
    "places_fts_idx",
    "markers",
    "tracks",
    "nuclear_scenarios",
    "nuclear_scenario_sets",
    // The reference layers (modules/layers): records downloaded or imported, with their indexes.
    "reference_features",
    "reference_features_rtree",
    "reference_features_rtree_node",
    "reference_features_rtree_parent",
    "reference_features_rtree_rowid",
    "reference_features_fts",
    "reference_features_fts_config",
    "reference_features_fts_data",
    "reference_features_fts_docsize",
    "reference_features_fts_idx",
    "historical_records",
    "country_figures",
  ],
  radio: [
    "repeaters",
    "repeater_lists",
    "radio_profiles",
    "antenna_profiles",
    "propagation_results",
    "propagation_saved",
    "communication_plans",
    "observation_imports",
    "radio_observations",
  ],
  prepare: [
    "supply_items",
    "supply_products",
    "supply_household",
    "supply_members",
    "supply_shopping",
    "weather_places",
    "weather_cache",
    "weather_readings",
  ],
};
// Emergency plans (modules/emergency-plans), on a line of their own so that other additions merge cleanly.
GROUPS.prepare.push("emergency_plans");
// The Morse trainer (modules/morse), on a line of its own so that other additions merge cleanly.
GROUPS.radio.push("morse_progress", "morse_sessions");
export const GROUP_ORDER: DatabaseGroupId[] = ["search", "meaning", "library", "notes", "maps", "radio", "prepare", "other"];

/** What each count is, as the services that own the tables count it. */
const COUNTS: Array<{ id: DatabaseCountId; table: string; sql: string }> = [
  { id: "documents", table: "documents", sql: "SELECT count(*) AS n FROM documents" },
  { id: "passages", table: "chunks", sql: "SELECT count(*) AS n FROM chunks" },
  { id: "vectors", table: "embeddings", sql: "SELECT count(*) AS n FROM embeddings" },
  { id: "pages", table: "notes", sql: "SELECT count(*) AS n FROM notes WHERE trashed_at IS NULL AND is_template = 0" },
  { id: "attachments", table: "attachments", sql: "SELECT count(*) AS n FROM attachments" },
  { id: "places", table: "markers", sql: "SELECT count(*) AS n FROM markers" },
  { id: "routes", table: "tracks", sql: "SELECT count(*) AS n FROM tracks" },
  { id: "placeNames", table: "places", sql: "SELECT count(*) AS n FROM places" },
  { id: "contacts", table: "contacts", sql: "SELECT count(*) AS n FROM contacts" },
  { id: "conversations", table: "chat_conversations", sql: "SELECT count(*) AS n FROM chat_conversations" },
  { id: "repeaters", table: "repeaters", sql: "SELECT count(*) AS n FROM repeaters WHERE removed_at IS NULL" },
  { id: "plans", table: "communication_plans", sql: "SELECT count(*) AS n FROM communication_plans" },
  { id: "observations", table: "radio_observations", sql: "SELECT count(*) AS n FROM radio_observations" },
  {
    id: "equipment",
    table: "radio_profiles",
    sql: "SELECT (SELECT count(*) FROM radio_profiles) + (SELECT count(*) FROM antenna_profiles) AS n",
  },
  { id: "predictions", table: "propagation_saved", sql: "SELECT count(*) AS n FROM propagation_saved" },
  { id: "powerPlans", table: "power_plans", sql: "SELECT count(*) AS n FROM power_plans" },
  { id: "powerDevices", table: "power_devices", sql: "SELECT count(*) AS n FROM power_devices" },
  { id: "supplies", table: "supply_items", sql: "SELECT count(*) AS n FROM supply_items" },
  {
    id: "scenarios",
    table: "nuclear_scenarios",
    sql: "SELECT (SELECT count(*) FROM nuclear_scenarios) + (SELECT count(*) FROM nuclear_scenario_sets) AS n",
  },
  { id: "networkDevices", table: "network_devices", sql: "SELECT count(*) AS n FROM network_devices" },
  { id: "pressureReadings", table: "weather_readings", sql: "SELECT count(*) AS n FROM weather_readings" },
  { id: "emergencyPlans", table: "emergency_plans", sql: "SELECT count(*) AS n FROM emergency_plans" },
  { id: "morseSessions", table: "morse_sessions", sql: "SELECT count(*) AS n FROM morse_sessions" },
  { id: "gameSaves", table: "game_saves", sql: "SELECT count(*) AS n FROM game_saves" },
];

function groupOf(table: string): DatabaseGroupId {
  for (const id of GROUP_ORDER) if (id !== "other" && GROUPS[id].includes(table)) return id;
  return "other";
}

function openReadOnly(file: string): Database.Database {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  db.pragma("busy_timeout = 5000");
  return db;
}

export function hasDbstat(db: Database.Database): boolean {
  return (db.prepare("SELECT count(*) AS n FROM pragma_module_list WHERE name = 'dbstat'").get() as { n: number }).n > 0;
}

/**
 * Counts what the database holds, and, where SQLite has the dbstat table, measures how
 * many bytes each group of tables takes by reading every page. Every page belongs to
 * one table or index, or is unused, so the groups and the unused pages add up to the
 * file exactly.
 */
export function measureContents(file: string, now: () => number = Date.now): DatabaseContents {
  const started = performance.now();
  const db = openReadOnly(file);
  try {
    // One read transaction, so that every figure is of the same moment.
    return db.transaction(() => {
      const tables = new Set(
        (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name),
      );
      const counts = COUNTS.filter((entry) => tables.has(entry.table)).map((entry) => ({
        id: entry.id,
        count: (db.prepare(entry.sql).get() as { n: number }).n,
      }));
      const pageSize = db.pragma("page_size", { simple: true }) as number;
      const pages = db.pragma("page_count", { simple: true }) as number;
      const unused = db.pragma("freelist_count", { simple: true }) as number;
      let groups: DatabaseContents["groups"] = null;
      let method: DatabaseContents["method"] = "counts";
      if (hasDbstat(db)) {
        method = "dbstat";
        const owner = new Map(
          (db.prepare("SELECT name, tbl_name AS tbl FROM sqlite_schema").all() as Array<{ name: string; tbl: string }>).map((row) => [
            row.name,
            row.tbl,
          ]),
        );
        const sizes = new Map<DatabaseGroupId, number>(GROUP_ORDER.map((id) => [id, 0]));
        for (const row of db.prepare("SELECT name, sum(pgsize) AS bytes FROM dbstat WHERE aggregate = 1 GROUP BY name").all() as Array<{
          name: string;
          bytes: number;
        }>) {
          const group = groupOf(owner.get(row.name) ?? row.name);
          sizes.set(group, (sizes.get(group) ?? 0) + row.bytes);
        }
        groups = GROUP_ORDER.map((id) => ({ id, bytes: sizes.get(id) ?? 0 }));
      }
      return {
        workedOutAt: now(),
        milliseconds: Math.round(performance.now() - started),
        method,
        counts,
        groups,
        unusedBytes: unused * pageSize,
        fileBytes: pages * pageSize,
      };
    })();
  } finally {
    db.close();
  }
}

/** The most lines of SQLite's own report kept when something is wrong. */
const MAX_PROBLEMS = 10;

/**
 * SQLite's own check of the file. `quick` (quick_check) reads every page and checks that
 * each is well formed; `full` (integrity_check) also checks that every index holds
 * exactly the rows of its table. A file too damaged to open counts as a failed check.
 */
export function checkFile(file: string, kind: "quick" | "full", now: () => number = Date.now): DatabaseCheck {
  const started = performance.now();
  let lines: string[];
  try {
    const db = openReadOnly(file);
    try {
      const pragma = kind === "quick" ? "quick_check" : "integrity_check";
      lines = (db.pragma(`${pragma}(${MAX_PROBLEMS})`) as Array<Record<string, string>>).map((row) => String(Object.values(row)[0]));
    } finally {
      db.close();
    }
  } catch (error) {
    lines = [error instanceof Error ? error.message : String(error)];
  }
  const ok = lines.length === 1 && lines[0] === "ok";
  return { kind, at: now(), milliseconds: Math.round(performance.now() - started), ok, problems: ok ? [] : lines.slice(0, MAX_PROBLEMS) };
}

/**
 * Rewrites the database without its unused pages (VACUUM). It holds the database's
 * write lock from start to finish: reading goes on, nothing can be written. In
 * write-ahead mode the rewritten file passes through the log, which is emptied again
 * afterwards when nothing is reading at that moment.
 */
export function vacuumFile(file: string): { milliseconds: number; beforeBytes: number; afterBytes: number } {
  const started = performance.now();
  const db = new Database(file, { fileMustExist: true });
  try {
    // Waits for a write that is under way to finish, rather than failing at once.
    db.pragma("busy_timeout = 10000");
    const size = () => (db.pragma("page_count", { simple: true }) as number) * (db.pragma("page_size", { simple: true }) as number);
    const beforeBytes = size();
    db.exec("VACUUM");
    const afterBytes = size();
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // A reader kept the log from being emptied; the next checkpoint will.
    }
    return { milliseconds: Math.round(performance.now() - started), beforeBytes, afterBytes };
  } finally {
    db.close();
  }
}

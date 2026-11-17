import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrationsDir } from "../core/paths.ts";
import * as schema from "./schema.ts";

export type Sqlite = InstanceType<typeof Database>;
export type Db = ReturnType<typeof openDatabase>["db"];

/**
 * Opens (creating if needed) the database and brings it up to the current schema.
 *
 * WAL keeps readers and the single writer out of each other's way. It needs a real
 * local filesystem, which is one reason the database stays in the data directory rather
 * than on a network share. `synchronous = NORMAL` is the recommended pairing with WAL:
 * safe against application crashes, and loses at most the last transactions on power cut.
 */
export function openDatabase(file: string) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  // Keep the page cache modest so a Raspberry Pi with 4 GB stays comfortable.
  sqlite.pragma("cache_size = -32000");
  sqlite.pragma("temp_store = MEMORY");
  // After a large write (an import, a restore) the write-ahead log is cut back to this
  // size once it has been copied into the database, rather than kept at its largest.
  sqlite.pragma("journal_size_limit = 67108864");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
  return { sqlite, db };
}

export { schema };

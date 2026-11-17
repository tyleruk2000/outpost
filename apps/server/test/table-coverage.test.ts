/**
 * Every table in the database, against everything that has to know about it: the
 * migrations that build it, "erase everything", the Storage screen's account of the
 * database, a backup and its restore, and a portable drive.
 *
 * One row goes into every table of a real server, then each of those is done for real
 * and every table is looked at afterwards. A table added to schema.ts without a line in
 * TABLES below fails here, so that someone decides, with a reason, whether erasing keeps
 * it, which group the Storage screen counts it in, and whether it goes on a drive.
 */
import path from "node:path";
import type { DatabaseGroupId } from "@outpost/shared";
import Database from "better-sqlite3";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema.ts";
import { groupOf } from "../src/modules/database/inspect.ts";
import { prepareDriveDatabase } from "../src/modules/portable/database.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

interface Decision {
  /** The group of Storage → Database its bytes are counted in. */
  group: DatabaseGroupId;
  /** Why "erase everything" leaves its rows; without one, erasing empties it. */
  keptByErase?: string;
  /** Why a restored backup does not bring its rows back; without one, it does. */
  notRestored?: string;
  /** `true` when it goes on a portable drive, otherwise why it stays at home. */
  drive: true | string;
}

const SAME_AS_HOME: Pick<Decision, "drive"> = { drive: true };

/** Every table, the full-text and spatial indexes included (their own shadow tables follow them). */
const TABLES: Record<string, Decision> = {
  __drizzle_migrations: {
    group: "other",
    keptByErase: "Which layout changes have been applied: the database's own bookkeeping.",
    drive: true,
  },
  settings: { group: "other", ...SAME_AS_HOME },
  storage_locations: {
    group: "other",
    keptByErase: "Storage locations and their marker files are kept (docs/storage.md, erase everything).",
    // Narrowed to one: the drive's own library folder.
    drive: true,
  },
  network_shares: {
    group: "other",
    keptByErase: "Network shares are kept, with any password in the Keychain (docs/storage.md).",
    notRestored: "Another machine's shares; this one would try to connect to them (docs/security.md, backup and restore).",
    drive: "The addresses of network shares are not copied (docs/portable.md).",
  },
  jobs: {
    group: "other",
    keptByErase: "Only the erase's own job is left; every other one goes.",
    notRestored: "Work in progress does not transfer: its queued jobs must not start on this machine.",
    drive: "Background jobs are not copied (docs/portable.md).",
  },
  collections: { group: "library", drive: true },
  downloads: { group: "library", drive: "Download history is not copied (docs/portable.md)." },
  catalog_cache: {
    group: "library",
    keptByErase: "The catalogue's last answers, so that Explore still reads offline (docs/storage.md).",
    drive: true,
  },
  documents: { group: "library", drive: true },
  tags: { group: "library", drive: true },
  document_tags: { group: "library", drive: true },
  book_chapters: { group: "library", drive: true },
  notes: { group: "notes", drive: true },
  note_tags: { group: "notes", drive: true },
  note_links: { group: "notes", drive: true },
  attachments: { group: "notes", drive: true },
  imports: { group: "notes", drive: "The records of past imports are not copied (docs/portable.md)." },
  search_entities: { group: "search", drive: true },
  chunks: { group: "search", drive: true },
  chunks_fts: { group: "search", drive: true },
  embedding_models: { group: "meaning", drive: true },
  embeddings: { group: "meaning", drive: true },
  places: { group: "maps", drive: true },
  places_fts: { group: "maps", drive: true },
  markers: { group: "maps", drive: true },
  tracks: { group: "maps", drive: true },
  contacts: { group: "other", drive: true },
  contact_tags: { group: "other", drive: true },
  contact_pages: { group: "other", drive: true },
  pgp_keys: { group: "other", drive: true },
  library_meta: {
    group: "other",
    keptByErase: "This library's identity and a drive's origin: facts that outlive resetting settings (schema.ts).",
    drive: true,
  },
  drive_baseline: {
    group: "other",
    keptByErase:
      "Empty at home. On a drive (one with a drive.baseline record) erasing empties it and cuts the drive loose from its library (test/manage.test.ts).",
    // Written afresh for the drive.
    drive: true,
  },
  drive_merges: { group: "other", drive: "The records of past merges are not copied (docs/portable.md)." },
  drive_merge_actions: { group: "other", drive: "Part of the records of past merges." },
  chat_conversations: { group: "other", drive: "Conversations from Chat are not copied (docs/portable.md)." },
  chat_messages: { group: "other", drive: "Part of the conversations from Chat." },
  repeater_lists: { group: "radio", drive: true },
  repeaters: { group: "radio", drive: true },
  radio_profiles: { group: "radio", drive: true },
  antenna_profiles: { group: "radio", drive: true },
  propagation_results: { group: "radio", drive: true },
  propagation_saved: { group: "radio", drive: true },
  communication_plans: { group: "radio", drive: true },
  observation_imports: { group: "radio", drive: true },
  radio_observations: { group: "radio", drive: true },
  morse_progress: { group: "radio", drive: true },
  morse_sessions: { group: "radio", drive: true },
  power_plans: { group: "other", drive: true },
  power_devices: { group: "other", drive: true },
  supply_items: { group: "prepare", drive: true },
  supply_products: { group: "prepare", drive: true },
  supply_household: { group: "prepare", drive: true },
  supply_members: { group: "prepare", drive: true },
  supply_shopping: { group: "prepare", drive: true },
  weather_places: { group: "prepare", drive: true },
  weather_cache: { group: "prepare", drive: true },
  weather_readings: { group: "prepare", drive: true },
  emergency_plans: { group: "prepare", drive: true },
  nuclear_scenarios: { group: "maps", drive: true },
  nuclear_scenario_sets: { group: "maps", drive: true },
  reference_features: { group: "maps", drive: true },
  reference_features_fts: { group: "maps", drive: true },
  reference_features_rtree: { group: "maps", drive: true },
  historical_records: { group: "maps", drive: true },
  country_figures: { group: "maps", drive: true },
  network_devices: { group: "other", drive: true },
  network_scans: { group: "other", drive: true },
  game_saves: { group: "other", drive: true },
  board_messages: { group: "other", drive: "The household board stays with the household's Outpost (docs/portable.md)." },
  board_files: {
    group: "other",
    drive: "Part of the household board; the files themselves are in the data folder, which a drive does not carry.",
  },
};

/** A word put in every text column, to look for in the full-text indexes' own storage. */
const WORD = "zqvlantern";
const PLACES_PACK = "places-pack";

const configs = new Map(
  (Object.values(schema) as unknown[])
    .filter((value): value is SQLiteTable => is(value, SQLiteTable))
    .map((table) => [getTableName(table), getTableConfig(table)]),
);

let app: TestApp;
/** How many rows each table had once filled. */
let filled: Map<string, number>;

const countIn = (db: Database.Database, table: string) => (db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;

function liveTables(db: Database.Database): { tables: string[]; virtual: string[]; shadow: Map<string, string> } {
  const rows = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string; sql: string | null }>;
  const virtual = rows.filter((row) => /^CREATE VIRTUAL TABLE/i.test(row.sql ?? "")).map((row) => row.name);
  const shadow = new Map<string, string>();
  for (const { name } of rows) {
    const owner = virtual.find((table) => name.startsWith(`${table}_`));
    if (owner) shadow.set(name, owner);
  }
  return { tables: rows.map((row) => row.name).filter((name) => !shadow.has(name)), virtual, shadow };
}

/** The value a column gets: the same for a column and every column that refers to it. */
function valueFor(table: string, columnName: string): unknown {
  if (table === "storage_locations" && columnName === "id") return app.ctx.services.storage.getDefault().id;
  // Place names belong to a place-names pack (added by fillEveryTable), reference records to a reference pack.
  if (table === "places" && columnName === "collection_id") return PLACES_PACK;
  if (table !== "collections" && columnName === "collection_id") return valueFor("collections", "id");
  if (table === "collections" && columnName === "kind") return "dataset";
  // Kept for a weather place: tidied away at start when there is none.
  if (table === "weather_cache" && columnName === "place_id") return valueFor("weather_places", "id");
  if (table === "collections" && columnName === "meta") return JSON.stringify({ reference: { provider: "import" } });
  const column = configs.get(table)!.columns.find((candidate) => candidate.name === columnName)!;
  const enumValues = (column as { enumValues?: string[] }).enumValues;
  if (enumValues && enumValues.length > 0) return enumValues[0];
  switch (column.getSQLType()) {
    case "text":
      return column.columnType === "SQLiteTextJson" ? "{}" : `${WORD} ${table} ${columnName}`;
    case "real":
      return 1.5;
    case "blob":
      return Buffer.from(WORD);
    default:
      return 1;
  }
}

/** One row in every table of schema.ts, the tables it refers to first. Columns that may be empty are left empty. */
function fillEveryTable(db: Database.Database): void {
  const done = new Set<string>();
  const visit = (name: string) => {
    if (done.has(name)) return;
    done.add(name);
    const config = configs.get(name)!;
    const refs = new Map<string, unknown>();
    for (const fk of config.foreignKeys) {
      const reference = fk.reference();
      const target = getTableName(reference.foreignTable);
      if (target !== name) visit(target);
      for (const [i, column] of reference.columns.entries()) refs.set(column.name, valueFor(target, reference.foreignColumns[i]!.name));
    }
    const columns = config.columns.filter((column) => column.notNull && !column.hasDefault).map((column) => column.name);
    const values = columns.map((column) => (refs.has(column) ? refs.get(column) : valueFor(name, column)));
    db.prepare(
      `INSERT OR IGNORE INTO "${name}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    ).run(...values);
  };
  for (const name of configs.keys()) visit(name);
  const columns = configs.get("collections")!.columns.map((column) => `"${column.name}"`);
  db.prepare(
    `INSERT INTO collections (${columns.join(", ")}) SELECT ${columns.map((column) => (column === '"id"' ? "?" : column === '"kind"' ? "'places'" : column)).join(", ")} FROM collections`,
  ).run(PLACES_PACK);
}

beforeAll(async () => {
  app = await createTestApp();
  fillEveryTable(app.ctx.sqlite);
  filled = new Map(liveTables(app.ctx.sqlite).tables.map((table) => [table, countIn(app.ctx.sqlite, table)]));
});
afterAll(async () => {
  await app?.close();
});

describe("every table", () => {
  it("is built by the migrations exactly as schema.ts describes it", () => {
    const db = app.ctx.sqlite;
    const { tables, virtual } = liveTables(db);
    // Tables drizzle does not model: its own bookkeeping and the hand-written indexes.
    expect(tables.filter((name) => !configs.has(name)).sort()).toEqual(["__drizzle_migrations", ...virtual].sort());
    for (const [name, config] of configs) {
      expect(tables, name).toContain(name);
      const composite = new Set(config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name)));
      const described = config.columns
        .map((column) => ({
          name: column.name,
          type: column.getSQLType().toLowerCase(),
          notNull: column.notNull || column.primary,
          primary: column.primary || composite.has(column.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const built = (db.pragma(`table_info("${name}")`) as Array<{ name: string; type: string; notnull: number; pk: number }>)
        .map((column) => ({
          name: column.name,
          type: column.type.toLowerCase(),
          notNull: column.notnull === 1 || (column.pk > 0 && column.type.toLowerCase() === "integer"),
          primary: column.pk > 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      // SQLite lets a text primary key hold null unless it says NOT NULL; drizzle writes it without.
      for (const column of built) if (column.primary) column.notNull = true;
      expect(built, `${name}: columns`).toEqual(described);

      const indexes = [
        ...config.indexes.map((index) => ({ name: index.config.name, unique: index.config.unique })),
        ...config.columns.filter((column) => column.isUnique).map((column) => ({ name: column.uniqueName!, unique: true })),
      ].sort((a, b) => a.name.localeCompare(b.name));
      const builtIndexes = (db.pragma(`index_list("${name}")`) as Array<{ name: string; unique: number; origin: string }>)
        .filter((index) => index.origin === "c")
        .map((index) => ({ name: index.name, unique: index.unique === 1 }))
        .sort((a, b) => a.name.localeCompare(b.name));
      expect(builtIndexes, `${name}: indexes`).toEqual(indexes);

      const keys = config.foreignKeys
        .map((fk) => {
          const reference = fk.reference();
          return {
            from: reference.columns.map((column) => column.name).join(","),
            table: getTableName(reference.foreignTable),
            to: reference.foreignColumns.map((column) => column.name).join(","),
            onDelete: (fk.onDelete ?? "no action").toUpperCase(),
          };
        })
        .sort((a, b) => a.from.localeCompare(b.from));
      const builtKeys = new Map<number, { from: string[]; table: string; to: string[]; onDelete: string }>();
      for (const row of db.pragma(`foreign_key_list("${name}")`) as Array<{
        id: number;
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }>) {
        const key = builtKeys.get(row.id) ?? { from: [], table: row.table, to: [], onDelete: row.on_delete };
        key.from.push(row.from);
        key.to.push(row.to);
        builtKeys.set(row.id, key);
      }
      expect(
        [...builtKeys.values()]
          .map((key) => ({ from: key.from.join(","), table: key.table, to: key.to.join(","), onDelete: key.onDelete }))
          .sort((a, b) => a.from.localeCompare(b.from)),
        `${name}: foreign keys`,
      ).toEqual(keys);
    }
  });

  it("has a decision for erasing, the Storage screen and portable drives, and was filled for this test", () => {
    const { tables } = liveTables(app.ctx.sqlite);
    expect(Object.keys(TABLES).sort(), "a line in TABLES for each table, and none for a table that is gone").toEqual([...tables].sort());
    for (const name of configs.keys()) expect(filled.get(name), `${name} was filled`).toBeGreaterThan(0);
  });

  it("is counted in its own group of Storage → Database, with the tables that serve it", () => {
    const { tables, shadow } = liveTables(app.ctx.sqlite);
    for (const table of tables) expect(groupOf(table), table).toBe(TABLES[table]!.group);
    for (const [table, owner] of shadow) expect(groupOf(table), `${table} (part of ${owner})`).toBe(TABLES[owner]!.group);
  });

  it("goes into a backup, and comes back from it on restore unless it belongs to the machine that made it", async () => {
    const response = await app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
    expect(response.statusCode).toBe(200);
    const dir = tempDir("outpost-coverage-restore-");
    let target = await createTestApp({}, dir);
    try {
      const staged = await target.app.inject({
        method: "POST",
        url: "/api/backup/restore",
        headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
        payload: response.rawPayload,
      });
      expect(staged.statusCode, staged.body).toBe(200);
      await target.close();
      target = await createTestApp({}, dir);
      const ids = (db: Database.Database, table: string) =>
        (db.prepare(`SELECT id FROM "${table}"`).all() as Array<{ id: string }>).map((row) => row.id);
      for (const [table, rows] of filled) {
        const decision = TABLES[table]!;
        if (decision.notRestored) {
          // The restored machine's own rows may be there (a job it started); none of the backup's are.
          const home = new Set(ids(app.ctx.sqlite, table));
          expect(
            ids(target.ctx.sqlite, table).filter((id) => home.has(id)),
            table,
          ).toEqual([]);
        } else {
          expect(countIn(target.ctx.sqlite, table), table).toBeGreaterThanOrEqual(rows);
        }
      }
    } finally {
      await target.close();
    }
  }, 60_000);

  it("goes on a portable drive unless docs/portable.md says it stays at home", async () => {
    const file = path.join(tempDir("outpost-coverage-drive-"), "outpost.db");
    await app.ctx.sqlite.backup(file);
    prepareDriveDatabase(file, {
      locationId: "drive-location",
      locationName: "This drive",
      locationPath: "/drive/library",
      collectionIds: [valueFor("collections", "id") as string, PLACES_PACK],
      documentIds: [valueFor("documents", "id") as string],
      madeFrom: "home",
    });
    const drive = new Database(file, { readonly: true });
    try {
      for (const [table, rows] of filled) {
        if (rows === 0) continue;
        const decision = TABLES[table]!;
        if (decision.drive === true) expect(countIn(drive, table), `${table} travels`).toBeGreaterThan(0);
        else expect(countIn(drive, table), `${table}: ${decision.drive}`).toBe(0);
      }
    } finally {
      drive.close();
    }
  });

  it("is emptied by erase everything unless kept on purpose, and the words in it leave the search indexes too", async () => {
    const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
    expect(started.status).toBe(200);
    const job = await waitFor(
      () => {
        const row = app.ctx.jobs.get(started.body.job.id);
        return row && ["succeeded", "failed", "cancelled"].includes(row.state) ? row : undefined;
      },
      "the erase to finish",
      30_000,
    );
    expect(job.state).toBe("succeeded");
    expect((job.result as { failed: unknown[] }).failed).toEqual([]);
    const left = [...filled.keys()].filter((table) => countIn(app.ctx.sqlite, table) > 0 && !TABLES[table]!.keptByErase);
    expect(left, "tables erase everything left rows in").toEqual([]);
    // An external-content full-text index keeps a deleted row's words until its segments
    // are merged; the database file is compacted afterwards, but rows are not pages.
    for (const index of ["chunks_fts", "reference_features_fts"]) {
      const found = app.ctx.sqlite
        .prepare(`SELECT count(*) AS n FROM ${index}_data WHERE instr(block, ?) > 0`)
        .get(Buffer.from(WORD.slice(0, 8))) as {
        n: number;
      };
      expect(found.n, `${index} still holds an erased word`).toBe(0);
    }
  }, 60_000);
});

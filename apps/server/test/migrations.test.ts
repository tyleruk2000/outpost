import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrationsDir } from "../src/core/paths.ts";
import { openDatabase } from "../src/db/client.ts";
import { tempDir } from "./temp.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDb(): string {
  const dir = tempDir("outpost-migrate-");
  dirs.push(dir);
  return path.join(dir, "outpost.db");
}

const migrationFiles = () =>
  fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

describe("database migrations", () => {
  it("builds the full schema on a new database", () => {
    const { sqlite } = openDatabase(tempDb());
    try {
      const names = (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger')").all() as Array<{ name: string }>
      ).map((row) => row.name);
      for (const table of [
        "settings",
        "storage_locations",
        "jobs",
        "collections",
        "downloads",
        "documents",
        "tags",
        "notes",
        "note_links",
        "attachments",
        "imports",
        "search_entities",
        "chunks",
        "embeddings",
        "embedding_models",
        "places",
        "markers",
        "tracks",
        "chunks_fts",
        "places_fts",
      ]) {
        expect(names, table).toContain(table);
      }
      for (const trigger of ["chunks_fts_ai", "chunks_fts_ad", "chunks_fts_au", "places_fts_ai", "places_fts_ad"])
        expect(names, trigger).toContain(trigger);
      const applied = sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number };
      expect(applied.n).toBe(migrationFiles().length);
      expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      sqlite.close();
    }
  });

  it("keeps data and applies nothing twice when opened again", () => {
    const file = tempDb();
    const first = openDatabase(file);
    first.sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('probe', '1', 1)").run();
    first.sqlite.close();
    const second = openDatabase(file);
    try {
      expect(second.sqlite.prepare("SELECT value FROM settings WHERE key = 'probe'").get()).toEqual({ value: "1" });
      expect((second.sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n).toBe(
        migrationFiles().length,
      );
    } finally {
      second.sqlite.close();
    }
  });

  it("brings a database made by the first migration alone up to date without losing rows", () => {
    // Simulates upgrading an older installation: apply only 0000 by hand, add a row,
    // then let the migrator take over.
    const file = tempDb();
    const raw = new Database(file);
    const [first] = migrationFiles();
    const journal = JSON.parse(fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const sql = fs.readFileSync(path.join(migrationsDir, first!), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) raw.exec(statement);
    raw.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
    raw
      .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run(createHash("sha256").update(sql).digest("hex"), journal.entries[0]!.when);
    raw.prepare("INSERT INTO markers (id, name, lat, lon, created_at, updated_at) VALUES ('m1', 'Cairn', 54.45, -3.21, 1, 1)").run();
    raw.close();

    const { sqlite } = openDatabase(file);
    try {
      expect(sqlite.prepare("SELECT name FROM markers").get()).toEqual({ name: "Cairn" });
      expect((sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n).toBe(migrationFiles().length);
      // The later migration's full-text table now exists and works.
      sqlite.prepare("INSERT INTO search_entities (kind, entity_id, title, url, updated_at) VALUES ('note', 'n', 'T', '/n', 1)").run();
      sqlite
        .prepare(
          "INSERT INTO chunks (entity_row_id, ordinal, title, text, content_hash, index_version) VALUES (1, 0, 'T', 'granite tor', 'h', 1)",
        )
        .run();
      expect(sqlite.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'granite'").get()).toEqual({ n: 1 });
    } finally {
      sqlite.close();
    }
  });

  it("gives places saved before there were icons the plain pin, and loses none of them", () => {
    // An installation as it was before 0013: every migration before it applied by hand, with places in it.
    const file = tempDb();
    const raw = new Database(file);
    const journal = JSON.parse(fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const before = journal.entries.filter((entry) => entry.tag < "0013_place_icons");
    expect(before).toHaveLength(13);
    expect(journal.entries.map((entry) => entry.tag)).toContain("0013_place_icons");
    raw.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
    for (const entry of before) {
      const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) raw.exec(statement);
      raw
        .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
        .run(createHash("sha256").update(sql).digest("hex"), entry.when);
    }
    const columnsOf = (db: InstanceType<typeof Database>) =>
      (db.prepare("SELECT name FROM pragma_table_info('markers')").all() as Array<{ name: string }>).map((column) => column.name);
    expect(columnsOf(raw)).not.toContain("icon");
    const insert = raw.prepare(
      "INSERT INTO markers (id, name, note, lat, lon, color, is_favorite, note_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run("m1", "Cairn", "On the col", 54.45, -3.21, "amber", 1, null, 10, 20);
    insert.run("m2", "Bothy", "", 57.05, -3.65, "green", 0, null, 30, 40);
    raw.close();

    const { sqlite } = openDatabase(file);
    try {
      expect(columnsOf(sqlite)).toEqual(expect.arrayContaining(["icon", "gpx_sym"]));
      expect(sqlite.prepare("SELECT * FROM markers ORDER BY id").all()).toEqual([
        {
          id: "m1",
          name: "Cairn",
          note: "On the col",
          lat: 54.45,
          lon: -3.21,
          color: "amber",
          is_favorite: 1,
          note_id: null,
          created_at: 10,
          updated_at: 20,
          icon: "pin",
          gpx_sym: null,
        },
        {
          id: "m2",
          name: "Bothy",
          note: "",
          lat: 57.05,
          lon: -3.65,
          color: "green",
          is_favorite: 0,
          note_id: null,
          created_at: 30,
          updated_at: 40,
          icon: "pin",
          gpx_sym: null,
        },
      ]);
      expect((sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n).toBe(migrationFiles().length);
      // A place can be given an icon straight away, and one saved without is a pin.
      sqlite.prepare("UPDATE markers SET icon = 'shelter' WHERE id = 'm2'").run();
      sqlite.prepare("INSERT INTO markers (id, name, lat, lon, created_at, updated_at) VALUES ('m3', 'New', 1, 2, 3, 4)").run();
      expect(sqlite.prepare("SELECT id, icon FROM markers ORDER BY id").all()).toEqual([
        { id: "m1", icon: "pin" },
        { id: "m2", icon: "shelter" },
        { id: "m3", icon: "pin" },
      ]);
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      sqlite.close();
    }
  });
});

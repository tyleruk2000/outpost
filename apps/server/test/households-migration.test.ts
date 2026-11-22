/**
 * The migration that brought in several households, on a database as it was before it
 * (people, home places, supplies, a plan, medical sheets, the one-row tables) and on an
 * empty one: everything lands in the first household, "Home", with the home it had.
 */
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

/** A database with every migration before the households one applied, as an installation had it. */
function databaseBeforeHouseholds(seed: (db: Database.Database) => void): string {
  const dir = tempDir("outpost-households-migrate-");
  dirs.push(dir);
  const file = path.join(dir, "outpost.db");
  const raw = new Database(file);
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8")) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const at = journal.entries.findIndex((entry) => entry.tag.endsWith("_households"));
  expect(at).toBeGreaterThan(0);
  raw.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
  for (const entry of journal.entries.slice(0, at)) {
    const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) raw.exec(statement);
    raw
      .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run(createHash("sha256").update(sql).digest("hex"), entry.when);
  }
  seed(raw);
  raw.close();
  return file;
}

describe("the households migration", () => {
  it("puts what there was in the first household, with the home homePlaceOf took", () => {
    const file = databaseBeforeHouseholds((db) => {
      const marker = db.prepare("INSERT INTO markers (id, name, lat, lon, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      marker.run("m-pin", "Shop", 51, 0, "pin", 1, 1);
      marker.run("m-late", "Second home", 52, 0, "home", 30, 30);
      marker.run("m-b", "Cottage B", 51.5, -0.1, "home", 20, 20);
      marker.run("m-a", "Cottage A", 51.5, -0.1, "home", 20, 20);
      const member = db.prepare(
        "INSERT INTO supply_members (id, position, kind, name, band, sex, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1)",
      );
      member.run("p-cat", 2, "pet", "Tom", null, null);
      member.run("p-ann", 0, "person", "Ann", "19-64", "female");
      member.run("p-bob", 1, "person", "Bob", "65-74", "male");
      db.prepare(
        "INSERT INTO supply_household (id, days_wanted, drinking_litres, all_uses_litres, water_basis, stock_changed_at, updated_at) VALUES ('household', 7, 2, 7.5, 'drinking', 1, 1)",
      ).run();
      db.prepare(
        "INSERT INTO supply_items (id, name, category, quantity, created_at, updated_at) VALUES ('i1', 'Rice', 'food', 2, 1, 1)",
      ).run();
      db.prepare(
        "INSERT INTO supply_shopping (id, position, source, name, reasons, created_at, updated_at) VALUES ('s1', 0, 'own', 'Salt', '[]', 1, 1)",
      ).run();
      db.prepare(
        "INSERT INTO emergency_plans (id, name, kind, body, use, reviewed_at, created_at, updated_at) VALUES ('plan', 'Flood', 'flood', '{}', '{}', 1, 1, 1)",
      ).run();
      db.prepare("INSERT INTO power_plans (id, name, system, created_at, updated_at) VALUES ('pw', 'Bank', '{}', 1, 1)").run();
      const sheet = db.prepare(
        "INSERT INTO medical_sheets (id, member_id, name, record, created_at, updated_at) VALUES (?, ?, ?, '{}', 1, 1)",
      );
      sheet.run("sheet-ann", "p-ann", "Ann");
      sheet.run("sheet-nobody", null, "Visitor");
      sheet.run("sheet-gone", "p-gone", "Someone taken out");
      db.prepare("INSERT INTO comms_plans (id, body, updated_at) VALUES ('household', '{}', 1)").run();
      db.prepare("INSERT INTO household_book (id, answers) VALUES ('household', '{}')").run();
      db.prepare("INSERT INTO garden_settings (id, last_frost, updated_at) VALUES ('household', '05-01', 1)").run();
    });

    const { sqlite } = openDatabase(file);
    try {
      expect(sqlite.prepare("SELECT id, name, position, kind, home_marker_id, country FROM households").all()).toEqual([
        { id: "household", name: "Home", position: 0, kind: "fixed", home_marker_id: "m-a", country: null },
      ]);
      expect(
        sqlite.prepare("SELECT person_id FROM household_people WHERE household_id = 'household' ORDER BY position").pluck().all(),
      ).toEqual(["p-ann", "p-bob", "p-cat"]);
      for (const table of ["supply_items", "supply_shopping", "emergency_plans"])
        expect(sqlite.prepare(`SELECT DISTINCT household_id FROM ${table}`).pluck().all(), table).toEqual(["household"]);
      // A power plan stays shared by every household.
      expect(sqlite.prepare("SELECT household_id FROM power_plans").pluck().all()).toEqual([null]);
      expect(sqlite.prepare("SELECT id, household_id FROM medical_sheets ORDER BY id").all()).toEqual([
        { id: "sheet-ann", household_id: null },
        { id: "sheet-gone", household_id: "household" },
        { id: "sheet-nobody", household_id: "household" },
      ]);
      // The one-row tables were already keyed by the first household's id.
      for (const table of ["supply_household", "comms_plans", "household_book", "garden_settings"])
        expect(sqlite.prepare(`SELECT id FROM ${table}`).pluck().all(), table).toEqual(["household"]);
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      sqlite.close();
    }
  });

  it("makes the first household, with no home and nobody in it, on an empty database", () => {
    const file = databaseBeforeHouseholds(() => {});
    const { sqlite } = openDatabase(file);
    try {
      expect(sqlite.prepare("SELECT id, name, home_marker_id FROM households").all()).toEqual([
        { id: "household", name: "Home", home_marker_id: null },
      ]);
      expect(sqlite.prepare("SELECT count(*) FROM household_people").pluck().get()).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});

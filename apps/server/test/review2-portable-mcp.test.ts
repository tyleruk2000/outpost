/**
 * The MCP switch is changed only at the computer Outpost runs on (docs/mcp.md). A portable
 * drive made while it is on must not start with it on, somewhere nobody switched it on.
 */
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareDriveDatabase } from "../src/modules/portable/database.ts";
import { MCP_SETTING } from "../src/modules/tools/index.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app?.close();
});

describe("a portable drive made while the MCP endpoint is on", () => {
  it("does not carry the switch", async () => {
    app.ctx.sqlite
      .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, 'true', ?) ON CONFLICT (key) DO UPDATE SET value = 'true'")
      .run(MCP_SETTING, Date.now());
    const file = path.join(app.dir, "drive.db");
    await app.ctx.sqlite.backup(file);
    prepareDriveDatabase(file, {
      locationId: "drive-location",
      locationName: "This drive",
      locationPath: "/drive/library",
      collectionIds: [],
      documentIds: [],
      madeFrom: "home",
      contacts: true,
    });
    const db = new Database(file, { readonly: true });
    try {
      expect(db.prepare("SELECT count(*) AS n FROM settings WHERE key = ?").get(MCP_SETTING)).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });
});

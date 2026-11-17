/**
 * The mesh radio link's set-up against a backup's restore and a portable drive.
 *
 * The set-up (`mesh.config`, a settings row) says which serial radio to open, which
 * broker to connect to and whether to open the broker's port. Like the network shares a
 * restore deletes, it belongs to the machine it was made on: carried to another one it
 * would make that one connect out, or open a port, without anyone there setting it up
 * (which only the computer itself may do, docs/security.md, the mesh radio link). Its
 * passwords are in `<data>/mesh/secrets.json`, which neither a backup nor a drive holds.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { settings } from "../src/db/schema.ts";
import { prepareDriveDatabase } from "../src/modules/portable/database.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

/** The one port these tests may listen on. */
const PORT = 9209;

function setMesh(app: TestApp, host: string): void {
  const value = { meshtastic: { mode: "client", client: { host, port: PORT, userName: "radio", rootTopic: "msh/EU_868" } } };
  app.ctx.db
    .insert(settings)
    .values({ key: "mesh.config", value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
    .run();
}

const meshRow = (app: TestApp) => app.ctx.db.select().from(settings).where(eq(settings.key, "mesh.config")).get()?.value as
  | { meshtastic?: { mode?: string; client?: { host?: string } } }
  | undefined;

const opened: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of opened.splice(0).reverse()) await close();
});

async function restoreInto(dir: string, backup: Buffer): Promise<TestApp> {
  let target = await createTestApp({}, dir, { voacapData: false });
  const staged = await target.app.inject({
    method: "POST",
    url: "/api/backup/restore",
    headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
    payload: backup,
  });
  expect(staged.statusCode, staged.body).toBe(200);
  await target.close();
  target = await createTestApp({}, dir, { voacapData: false });
  return target;
}

describe("the mesh set-up and a restore", () => {
  it("does not make another machine connect to the broker its backup names", async () => {
    const connections: string[] = [];
    const listener = net.createServer((socket) => {
      connections.push(socket.remoteAddress ?? "?");
      socket.destroy();
    });
    await new Promise<void>((resolve) => listener.listen(PORT, "127.0.0.1", resolve));
    opened.push(() => new Promise((resolve) => listener.close(() => resolve())));

    const home = await createTestApp({}, undefined, { voacapData: false });
    opened.push(() => home.close());
    // Written straight to the row: the home server is not told, so it connects to nothing itself.
    setMesh(home, "127.0.0.1");
    const backup = await home.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
    expect(backup.statusCode).toBe(200);

    const dir = tempDir("outpost-review2-mesh-restore-");
    const other = await restoreInto(dir, backup.rawPayload);
    opened.push(async () => {
      await other.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(connections).toEqual([]);
    expect(meshRow(other)?.meshtastic?.mode ?? "off").toBe("off");
  }, 60_000);

  it("keeps this machine's own set-up, which its passwords file goes with", async () => {
    const dir = tempDir("outpost-review2-mesh-own-");
    const app = await createTestApp({}, dir, { voacapData: false });
    setMesh(app, "192.0.2.10");
    const backup = await app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
    expect(backup.statusCode).toBe(200);
    // Set up again after the backup: the set-up in use now is the one kept.
    setMesh(app, "192.0.2.20");
    await app.close();
    // Not connected to anything: 192.0.2.0/24 is for documentation, and the row is never applied before the restart.
    const restored = await restoreInto(dir, backup.rawPayload);
    opened.push(async () => {
      await restored.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    expect(meshRow(restored)?.meshtastic?.client?.host).toBe("192.0.2.20");
  }, 60_000);
});

describe("the mesh set-up and a portable drive", () => {
  it("is not copied to a drive, which would open radios and connect from whatever computer it is plugged into", async () => {
    const app = await createTestApp({}, undefined, { voacapData: false });
    opened.push(() => app.close());
    setMesh(app, "192.0.2.10");
    const dir = tempDir("outpost-review2-mesh-drive-");
    opened.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, "outpost.db");
    await app.ctx.sqlite.backup(file);
    prepareDriveDatabase(file, {
      locationId: "drive",
      locationName: "This drive",
      locationPath: dir,
      collectionIds: [],
      documentIds: [],
      madeFrom: "home",
    });
    const db = new Database(file, { readonly: true });
    try {
      expect(db.prepare("SELECT key FROM settings WHERE key LIKE 'mesh.%'").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});

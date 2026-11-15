import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function download(app: TestApp): Promise<Buffer> {
  const response = await app.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } });
  expect(response.statusCode).toBe(200);
  return response.rawPayload;
}

function restore(app: TestApp, payload: Buffer) {
  return app.app.inject({
    method: "POST",
    url: "/api/backup/restore",
    headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
    payload,
  });
}

async function zipOf(entries: Record<string, string | Buffer>): Promise<Buffer> {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "outpost-zip-")), "x.zip");
  const archive = new ZipArchive();
  const done = new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(file);
    out.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(out);
  });
  for (const [name, content] of Object.entries(entries)) archive.append(content, { name });
  await archive.finalize();
  await done;
  return fs.readFileSync(file);
}

describe("backup and restore", () => {
  it("restores settings, search entries and attachments into a fresh installation after a restart", async () => {
    const source = await createTestApp();
    apps.push(source);
    await source.api("PATCH", "/api/settings", { "downloads.concurrency": 5 });
    source.ctx.services.search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Tide tables",
      url: "/notes/n1",
      sections: [{ text: "High water at Dover." }],
    });
    const attachment = path.join(source.ctx.config.dataDir, "attachments", "ab", "photo.txt");
    fs.mkdirSync(path.dirname(attachment), { recursive: true });
    fs.writeFileSync(attachment, "a picture, honest");
    const backup = await download(source);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-restore-"));
    let target = await createTestApp({}, dir);
    await target.api("PATCH", "/api/settings", { "downloads.concurrency": 1 });
    const staged = await restore(target, backup);
    expect(staged.statusCode).toBe(200);
    expect(staged.json()).toMatchObject({ staged: true });
    // Nothing changes until the restart.
    expect((await target.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(1);
    expect((await target.api("GET", "/api/backup/status")).body.restorePending).toBe(true);
    await target.close();

    target = await createTestApp({}, dir);
    apps.push(target);
    expect((await target.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(5);
    expect((await target.api("GET", "/api/search?q=dover ")).body.total).toBe(1);
    expect(fs.readFileSync(path.join(target.ctx.config.dataDir, "attachments", "ab", "photo.txt"), "utf8")).toBe("a picture, honest");
    const status = (await target.api("GET", "/api/backup/status")).body;
    expect(status.restorePending).toBe(false);
    // The data that was replaced is kept, not deleted.
    expect(status.previousData).toHaveLength(1);
    expect(fs.existsSync(path.join(target.ctx.config.dataDir, status.previousData[0], "outpost.db"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses files that are not backups and leaves nothing staged", async () => {
    const app = await createTestApp();
    apps.push(app);
    expect((await restore(app, Buffer.from("definitely not a zip"))).statusCode).toBe(400);
    expect((await restore(app, await zipOf({ "readme.txt": "hello" }))).statusCode).toBe(400);
    const noDatabase = await zipOf({
      "manifest.json": JSON.stringify({
        format: "outpost-backup",
        version: 1,
        appVersion: "0.1.0",
        createdAt: "2026-01-01T00:00:00Z",
        migrations: 1,
      }),
    });
    expect((await restore(app, noDatabase)).statusCode).toBe(400);
    const badDatabase = await zipOf({
      "manifest.json": JSON.stringify({
        format: "outpost-backup",
        version: 1,
        appVersion: "0.1.0",
        createdAt: "2026-01-01T00:00:00Z",
        migrations: 1,
      }),
      "outpost.db": "this is not sqlite",
    });
    expect((await restore(app, badDatabase)).statusCode).toBe(400);
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "restore-pending"))).toBe(false);
  });

  it("cannot be used to write files outside the data directory", async () => {
    const app = await createTestApp();
    apps.push(app);
    const real = await download(app);
    // A hostile archive: a valid backup plus entries aimed elsewhere.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-evil-"));
    fs.writeFileSync(path.join(tmp, "real.zip"), real);
    const hostile = await zipOf({
      "manifest.json": JSON.stringify({
        format: "outpost-backup",
        version: 1,
        appVersion: "0.1.0",
        createdAt: "2026-01-01T00:00:00Z",
        migrations: 1,
      }),
      "secret.key": "overwritten",
      "elsewhere/passwd": "root::0:0",
      "attachments/ok.txt": "fine",
    });
    await restore(app, hostile);
    const pending = path.join(app.ctx.config.dataDir, "restore-pending");
    expect(fs.existsSync(path.join(pending, "secret.key"))).toBe(false);
    expect(fs.existsSync(path.join(pending, "elsewhere"))).toBe(false);
  });

  it("only restarts itself when something will start it again", async () => {
    const app = await createTestApp();
    apps.push(app);
    expect((await app.api("POST", "/api/system/restart")).status).toBe(409);
  });
});

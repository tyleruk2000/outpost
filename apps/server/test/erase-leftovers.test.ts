/**
 * Erase everything against the files other features leave in the data directory: an
 * export kept for downloading (every note, contact and medical sheet in one zip), the
 * scratch copy a test restore left when Outpost stopped half-way, and Geofabrik's list of
 * regions, which is not the person's and stays.
 */
import fs from "node:fs";
import path from "node:path";
import type { JobDto } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

const apps: TestApp[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function erase(app: TestApp) {
  const started = await app.api("POST", "/api/manage/cleanup/everything", { confirm: "erase everything" });
  expect(started.status).toBe(200);
  await app.ctx.jobs.whenIdle();
  const job = app.ctx.jobs.get((started.body.job as JobDto).id);
  expect(job?.state).toBe("succeeded");
}

describe("erase everything and the data directory's other files", () => {
  it("removes an export kept for downloading", async () => {
    const app = await createTestApp({}, undefined, { voacapData: false });
    apps.push(app);
    await app.api("POST", "/api/notes", { title: "Where the spare key is" });
    const made = await app.api("POST", "/api/export-all", { destination: { kind: "download" } });
    expect(made.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const folder = path.join(app.ctx.config.dataDir, "exports");
    expect(fs.readdirSync(folder).filter((name) => name.endsWith(".zip"))).toHaveLength(1);

    await erase(app);
    expect(fs.existsSync(folder) ? fs.readdirSync(folder) : []).toEqual([]);
  });

  it("removes a test restore's scratch copy left behind, and keeps Geofabrik's list of regions", async () => {
    const app = await createTestApp({}, undefined, { voacapData: false });
    apps.push(app);
    const { dataDir } = app.ctx.config;
    // As a test restore leaves it when Outpost stops in the middle: the backup's database, opened.
    const scratch = path.join(dataDir, "restore-test");
    fs.mkdirSync(scratch, { recursive: true });
    fs.writeFileSync(path.join(scratch, "outpost.db"), "a copy of the library");
    const index = path.join(dataDir, "reference", "geofabrik-index.json");
    fs.mkdirSync(path.dirname(index), { recursive: true });
    fs.writeFileSync(index, JSON.stringify({ readAt: 1, source: "x", regions: [] }));

    await erase(app);
    expect(fs.existsSync(scratch)).toBe(false);
    expect(fs.existsSync(index)).toBe(true);
  });
});

describe("a test restore stopped half-way", () => {
  it("does not leave its scratch copy (decrypted, for a protected backup) for the next start", async () => {
    const first = await createTestApp({}, undefined, { voacapData: false });
    const scratch = path.join(first.ctx.config.dataDir, "restore-test");
    await first.close();
    fs.mkdirSync(scratch, { recursive: true });
    fs.writeFileSync(path.join(scratch, "outpost.db"), "a decrypted copy of the library");
    const again = await createTestApp({}, first.dir, { voacapData: false });
    apps.push(again);
    expect(fs.existsSync(scratch)).toBe(false);
  });
});

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("the database", () => {
  it("is opened for one writer and many readers, and waits a while for a lock rather than failing", async () => {
    const app = await createTestApp();
    const pragma = (name: string) => app.ctx.sqlite.pragma(name, { simple: true });
    expect(pragma("journal_mode")).toBe("wal");
    expect(pragma("synchronous")).toBe(1);
    expect(pragma("busy_timeout")).toBe(5000);
    expect(pragma("foreign_keys")).toBe(1);
    expect(pragma("journal_size_limit")).toBe(67_108_864);
    await app.close();
  });

  it("is closed cleanly when the server stops: the write-ahead log is folded in and removed", async () => {
    const dir = tempDir("outpost-db-close-");
    dirs.push(dir);
    const app = await createTestApp({}, dir);
    expect((await app.api("POST", "/api/notes", { title: "Kept" })).status).toBe(200);
    const file = path.join(app.ctx.config.dataDir, "outpost.db");
    expect(fs.existsSync(`${file}-wal`)).toBe(true);
    await app.close();
    expect(app.ctx.sqlite.open).toBe(false);
    expect(fs.existsSync(`${file}-wal`)).toBe(false);
  });
});

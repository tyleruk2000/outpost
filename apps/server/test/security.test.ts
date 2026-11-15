/**
 * Regression tests for defects found by security review. Each one describes the
 * attack it guards against.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { afterEach, describe, expect, it } from "vitest";
import { scanConstructs } from "../src/modules/imports/convert.ts";
import { markdownToDoc } from "../src/modules/notes/content/index.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const raw = (method: string, url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  app!.app.inject({ method: method as "GET", url, headers: { host: "localhost", ...headers }, payload: payload as never });

describe("the request rules cannot be sidestepped by disguising the address", () => {
  it("applies the cross-site checks to disguised addresses too", async () => {
    app = await createTestApp();
    for (const prefix of ["/%61pi", "/a%70i"]) {
      const forged = await raw(
        "PATCH",
        `${prefix}/settings`,
        { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" },
        { "downloads.concurrency": 7 },
      );
      expect(forged.statusCode).toBe(403);
      const noHeader = await raw("PATCH", `${prefix}/settings`, { "content-type": "application/json" }, { "downloads.concurrency": 7 });
      expect(noHeader.statusCode).toBe(403);
    }
    expect((await app.api("GET", "/api/settings")).body.settings["downloads.concurrency"]).toBe(2);
  });
});

describe("smaller hardening", () => {
  it("never lists an unbounded number of jobs", async () => {
    app = await createTestApp();
    for (const limit of ["-1", "0", "abc", "999999"]) {
      const response = await app.api("GET", `/api/jobs?limit=${limit}`);
      expect(response.status).toBe(200);
    }
  });
});

describe("large uploads", () => {
  it("are refused before the body is read unless they are the right kind of file", async () => {
    app = await createTestApp();
    const big = Buffer.alloc(2 * 1024 * 1024, 65);
    for (const url of ["/api/backup/restore", "/api/semantic/import"]) {
      // A type the server would otherwise buffer whole.
      const wrongType = await raw("POST", url, { "x-outpost-request": "1", "content-type": "text/plain" }, big);
      expect(wrongType.statusCode, url).toBe(415);
      // And never from another site, whatever the type.
      const crossSite = await raw("POST", url, { "content-type": "application/zip", origin: "https://evil.example" }, big);
      expect(crossSite.statusCode, url).toBe(403);
    }
  });
});

describe("restoring a backup someone else made", () => {
  it("does not bring their queued work, their network shares or their download hosts", async () => {
    // Someone else's Outpost: a queued job and a manifest of their choosing.
    const theirs = await createTestApp();
    fs.mkdirSync(path.join(theirs.ctx.config.dataDir, "catalog"), { recursive: true });
    fs.writeFileSync(
      path.join(theirs.ctx.config.dataDir, "catalog", "evil.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "evil",
        name: "Evil",
        description: "x",
        maintainers: [],
        downloadHosts: ["evil.example"],
        entries: [],
      }),
    );
    theirs.ctx.sqlite
      .prepare(
        "INSERT INTO jobs (id, type, queue, state, title, payload, created_at, updated_at) VALUES ('j1', 'documents.move', 'transfer', 'queued', 'Planted', '{}', 1, 1)",
      )
      .run();
    // And a network share that their machine reconnects to by itself.
    theirs.ctx.sqlite
      .prepare(
        "INSERT INTO network_shares (id, server, port, share, user_name, password_in_keychain, auto_connect, created_at, updated_at) VALUES ('s1', 'their-nas.local', 445, 'private', 'mallory', 1, 1, 1, 1)",
      )
      .run();
    const backup = (await theirs.app.inject({ method: "GET", url: "/api/backup/download", headers: { host: "localhost" } })).rawPayload;
    await theirs.close();

    // It is restored here.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-restore-sec-"));
    let mine = await createTestApp({}, dir);
    const staged = await mine.app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
      payload: backup,
    });
    expect(staged.statusCode).toBe(200);
    await mine.close();
    mine = await createTestApp({}, dir);
    app = mine;

    expect(mine.ctx.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE id = 'j1'").get()).toEqual({ n: 0 });
    // This machine must not start trying to connect to a file server named in someone else's backup.
    expect(mine.ctx.sqlite.prepare("SELECT count(*) AS n FROM network_shares").get()).toEqual({ n: 0 });
    expect(fs.existsSync(path.join(mine.ctx.config.dataDir, "catalog", "evil.json"))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses an archive that expands far beyond its size", async () => {
    app = await createTestApp();
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "outpost-bomb-")), "bomb.zip");
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const done = new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(file);
      out.on("close", () => resolve());
      archive.on("error", reject);
      archive.pipe(out);
    });
    archive.append(
      JSON.stringify({ format: "outpost-backup", version: 1, appVersion: "0.1.0", createdAt: "2026-01-01T00:00:00Z", migrations: 1 }),
      { name: "manifest.json" },
    );
    archive.append(Buffer.alloc(300 * 1024 * 1024), { name: "attachments/zeros.bin" });
    await archive.finalize();
    await done;
    const payload = fs.readFileSync(file);
    expect(payload.length).toBeLessThan(1024 * 1024);
    const response = await app.app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": "application/zip" },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/expands far more/);
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "restore-pending"))).toBe(false);
  });
});

describe("hostile files cannot freeze or exhaust the server", () => {
  it("scans Markdown made of unclosed code fences in linear time", () => {
    const hostile = "```x\n".repeat(60_000);
    const started = performance.now();
    scanConstructs("markdown", hostile);
    // The old pattern took about nine seconds on a file this size.
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("converts Markdown full of unclosed <summary> tags in linear time", () => {
    const hostile = `<details>${"<summary>".repeat(60_000)}\n\ntext\n\n</details>`;
    const started = performance.now();
    const { doc } = markdownToDoc(hostile);
    expect(doc.type).toBe("doc");
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it("still reads fenced code and summaries correctly", () => {
    expect(scanConstructs("markdown", "text\n```\n$$ not maths $$\n```\nmore")).toEqual(scanConstructs("markdown", "text\nmore"));
    const { doc } = markdownToDoc("<details>\n<summary>Kit <b>list</b></summary>\n\nStove and gas.\n\n</details>");
    expect(JSON.stringify(doc)).toContain("detailsSummary");
    expect(JSON.stringify(doc)).toContain("Stove and gas.");
  });

  it("refuses a GPX file that would balloon in memory, and keeps answering other requests", async () => {
    app = await createTestApp();
    const hostile = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${'<a b="1"/>'.repeat(900_000)}</trkseg></trk></gpx>`;
    const form = new FormData();
    form.set("file", new Blob([hostile], { type: "application/gpx+xml" }), "bomb.gpx");
    const encoded = new Response(form);
    const pending = app.app.inject({
      method: "POST",
      url: "/api/maps/tracks/import",
      headers: { host: "localhost", "x-outpost-request": "1", "content-type": encoded.headers.get("content-type")! },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
    // While that file is being chewed on, the server still answers.
    const started = performance.now();
    expect((await app.api("GET", "/api/health")).status).toBe(200);
    expect(performance.now() - started).toBeLessThan(1000);
    const response = await pending;
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/too complex/);
    expect((await app.api("GET", "/api/maps/tracks")).body.tracks).toEqual([]);
  }, 60_000);
});

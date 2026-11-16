import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpClient } from "../src/core/http.ts";
import { collections, documents } from "../src/db/schema.ts";
import {
  cachePath,
  distFile,
  ensureKiwix,
  ensureRuntime,
  kiwixCachePath,
  kiwixSupports,
  parseShasums,
} from "../src/modules/portable/runtimes.ts";
import { extractOneFromTarGz } from "../src/modules/portable/tar.ts";
import { createTestApp, queueWaitingJobs, type TestApp } from "./helpers.ts";
import { tempDir as sharedTempDir } from "./temp.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A minimal ustar archive with the given files. */
function tar(files: Record<string, Buffer>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    header.write("0000755\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.write("        ", 148);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function tempDir(): string {
  const dir = sharedTempDir("outpost-portable-");
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Stands in for nodejs.org/dist: a checksum list and the runtime files. */
async function distServer(version: string, tamper = false) {
  const fakeNode = Buffer.from("#!/bin/sh\necho fake node\n");
  const archive = gzipSync(
    tar({
      [`node-${version}-linux-x64/README.md`]: Buffer.from("readme"),
      [`node-${version}-linux-x64/bin/node`]: fakeNode,
      [`node-${version}-linux-x64/bin/npm`]: Buffer.from("npm"),
    }),
  );
  const exe = Buffer.from("MZ fake windows node");
  const sha = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
  const sums = `${sha(archive)}  node-${version}-linux-x64.tar.gz\n${sha(exe)}  win-x64/node.exe\n`;
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === `/${version}/SHASUMS256.txt`) return response.end(sums);
    if (request.url === `/${version}/node-${version}-linux-x64.tar.gz`)
      return response.end(tamper ? Buffer.concat([archive, Buffer.from("x")]) : archive);
    if (request.url === `/${version}/win-x64/node.exe`) return response.end(exe);
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, fakeNode, exe, requests };
}

describe("runtime downloads", () => {
  it("extracts exactly one file from a tar.gz stream", async () => {
    const dir = tempDir();
    const archive = path.join(dir, "a.tar.gz");
    const big = Buffer.alloc(70_000, 7);
    fs.writeFileSync(archive, gzipSync(tar({ "pkg/other": Buffer.from("no"), "pkg/bin/node": big, "pkg/after": Buffer.from("later") })));
    const out = path.join(dir, "node");
    expect(await extractOneFromTarGz(fs.createReadStream(archive), (name) => name === "pkg/bin/node", out)).toBe(true);
    expect(fs.readFileSync(out).equals(big)).toBe(true);
    expect(await extractOneFromTarGz(fs.createReadStream(archive), (name) => name === "pkg/missing", path.join(dir, "none"))).toBe(false);
  });

  it("fails, rather than ending the process, when the file it writes cannot be made", async () => {
    const dir = tempDir();
    const archive = path.join(dir, "a.tar.gz");
    fs.writeFileSync(archive, gzipSync(tar({ "pkg/bin/node": Buffer.alloc(70_000, 7) })));
    await expect(
      extractOneFromTarGz(fs.createReadStream(archive), (name) => name === "pkg/bin/node", path.join(dir, "gone", "node")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reads the published checksum list", () => {
    const sums = parseShasums(`${"a".repeat(64)}  node-v24.0.0-linux-x64.tar.gz\n${"b".repeat(64)}  win-x64/node.exe\nnot a line\n`);
    expect(sums.get("win-x64/node.exe")).toBe("b".repeat(64));
    expect(sums.size).toBe(2);
    expect(distFile("v24.0.0", "darwin-arm64")).toBe("node-v24.0.0-darwin-arm64.tar.gz");
    expect(distFile("v24.0.0", "win-arm64")).toBe("win-arm64/node.exe");
  });

  it("downloads, verifies, unpacks and caches a runtime", async () => {
    const dist = await distServer("v99.0.0");
    const dataDir = tempDir();
    const client = createHttpClient({ allowPrivate: true });
    cleanups.push(() => client.close());
    const file = await ensureRuntime({ dataDir, version: "v99.0.0", platform: "linux-x64", http: client, distBase: dist.base });
    expect(file).toBe(cachePath(dataDir, "v99.0.0", "linux-x64"));
    expect(fs.readFileSync(file).equals(dist.fakeNode)).toBe(true);
    const windows = await ensureRuntime({ dataDir, version: "v99.0.0", platform: "win-x64", http: client, distBase: dist.base });
    expect(fs.readFileSync(windows).equals(dist.exe)).toBe(true);
    // The second request for a cached runtime touches the network not at all.
    const before = dist.requests.length;
    await ensureRuntime({ dataDir, version: "v99.0.0", platform: "linux-x64", http: client, distBase: dist.base });
    expect(dist.requests.length).toBe(before);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["node"]);
  });

  it("discards a runtime that does not match its checksum", async () => {
    const dist = await distServer("v99.0.0", true);
    const dataDir = tempDir();
    const client = createHttpClient({ allowPrivate: true });
    cleanups.push(() => client.close());
    await expect(ensureRuntime({ dataDir, version: "v99.0.0", platform: "linux-x64", http: client, distBase: dist.base })).rejects.toThrow(
      /checksum/,
    );
    expect(fs.existsSync(cachePath(dataDir, "v99.0.0", "linux-x64"))).toBe(false);
    await expect(
      ensureRuntime({ dataDir, version: "v99.0.0", platform: "darwin-arm64", http: client, distBase: dist.base }),
    ).rejects.toThrow(/no official build/);
  });
});

describe("the reader for reference collections", () => {
  it("is fetched from the Kiwix project's builds, checked and cached", async () => {
    const binary = Buffer.from("#!/bin/sh\necho kiwix-serve\n");
    const archive = gzipSync(
      tar({ "kiwix-tools_linux-x86_64-3.8.2/kiwix-manage": Buffer.from("manage"), "kiwix-tools_linux-x86_64-3.8.2/kiwix-serve": binary }),
    );
    const md5 = createHash("md5").update(archive).digest("hex");
    let corrupt = false;
    const server = http.createServer((request, response) => {
      if (request.url === "/kiwix-tools_linux-x86_64-3.8.2.tar.gz.md5")
        return response.end(`${md5}  kiwix-tools_linux-x86_64-3.8.2.tar.gz\n`);
      if (request.url === "/kiwix-tools_linux-x86_64-3.8.2.tar.gz")
        return response.end(corrupt ? archive.subarray(0, archive.length - 5) : archive);
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const distBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const client = createHttpClient({ allowPrivate: true });
    cleanups.push(() => client.close());

    const dataDir = tempDir();
    corrupt = true;
    await expect(ensureKiwix({ dataDir, platform: "linux-x64", http: client, distBase })).rejects.toThrow(/checksum/);
    expect(fs.existsSync(kiwixCachePath(dataDir, "linux-x64"))).toBe(false);
    corrupt = false;
    const file = await ensureKiwix({ dataDir, platform: "linux-x64", http: client, distBase });
    expect(fs.readFileSync(file).equals(binary)).toBe(true);
    expect(kiwixSupports("win-x64")).toBe(false);
    await expect(ensureKiwix({ dataDir, platform: "win-x64", http: client, distBase })).rejects.toThrow(/does not publish/);
  });
});

describe("writing a portable drive", () => {
  async function setup() {
    const bundle = tempDir();
    fs.mkdirSync(path.join(bundle, "server"), { recursive: true });
    fs.writeFileSync(path.join(bundle, "server", "outpost.mjs"), "console.log('outpost')\n");
    fs.mkdirSync(path.join(bundle, "web"));
    fs.writeFileSync(path.join(bundle, "web", "index.html"), "<!doctype html>");
    const app: TestApp = await createTestApp({ OUTPOST_APP_DIR: bundle });
    cleanups.push(() => app.close());
    const { ctx } = app;
    const location = ctx.services.storage.getDefault();

    // Runtimes are seeded into the cache so the test never needs the network.
    for (const platform of ["darwin-arm64", "win-x64"] as const) {
      const file = cachePath(ctx.config.dataDir, process.version, platform);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `runtime for ${platform}`);
    }

    const now = Date.now();
    const addCollection = (id: string, title: string, relPath: string, content: string) => {
      const full = path.join(location.path, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      ctx.db
        .insert(collections)
        .values({
          id,
          kind: "zim",
          title,
          locationId: location.id,
          relPath,
          sizeBytes: content.length,
          meta: {},
          installedAt: now,
          updatedAt: now,
        })
        .run();
      ctx.services.search.upsert({ kind: "collection", entityId: id, title, url: `/library/collections/${id}`, sections: [] });
    };
    addCollection("c-knots", "Knots", "collections/zim/knots.zim", "ZIM knots data");
    addCollection("c-wiki", "Whole Wikipedia", "collections/zim/wiki.zim", "ZIM big wikipedia data");

    const addDocument = (id: string, title: string, text: string) => {
      const relPath = `documents/${id}/${title}.txt`;
      const full = path.join(location.path, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
      ctx.db
        .insert(documents)
        .values({
          id,
          title,
          originalName: `${title}.txt`,
          mime: "text/plain",
          ext: "txt",
          sizeBytes: text.length,
          sha256: id,
          locationId: location.id,
          relPath,
          extraction: "done",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      ctx.services.search.upsert({ kind: "document", entityId: id, title, url: `/library/documents/${id}`, sections: [{ text }] });
    };
    addDocument("d-tides", "Tide tables", "High water at Dover is at noon.");
    ctx.services.search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Passage plan",
      url: "/notes/n1",
      sections: [{ text: "Leave on the ebb." }],
    });
    await app.api("PATCH", "/api/settings", { "downloads.concurrency": 4 });

    const drive = path.join(app.dir, "storage", "usb", "Outpost");
    fs.mkdirSync(path.dirname(drive), { recursive: true });
    return { app, drive, location, bundle };
  }

  const request = (drive: string, extra: Record<string, unknown> = {}) => ({
    targetPath: drive,
    platforms: ["darwin-arm64", "win-x64"],
    collectionIds: ["c-knots"],
    documents: "all",
    ...extra,
  });

  it("plans the copy with honest sizes and no surprises", async () => {
    const { app, drive } = await setup();
    const { status, body } = await app.api("POST", "/api/portable/plan", request(drive));
    expect(status).toBe(200);
    expect(body.problems).toEqual([]);
    expect(body.target).toMatchObject({ path: drive, exists: false, isOutpostDrive: false });
    expect(body.app.available).toBe(true);
    expect(body.runtimes).toEqual([
      { platform: "darwin-arm64", label: "Mac (Apple Silicon)", cached: true },
      { platform: "win-x64", label: "Windows (64-bit PC)", cached: true },
    ]);
    expect(body.collections).toEqual([{ id: "c-knots", title: "Knots", kind: "zim", bytes: 14, available: true, alreadyOnDrive: false }]);
    expect(body.documents.count).toBe(1);
    expect(body.needsConnection).toBe(false);
    expect(body.bytesToWrite).toBeGreaterThan(0);
  });

  it("writes a complete drive whose database holds only what was copied", async () => {
    const { app, drive, location } = await setup();
    const started = await app.api("POST", "/api/portable/build", request(drive));
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const job = (await app.api("GET", `/api/jobs/${started.body.job.id}`)).body.job;
    expect(job.error).toBeNull();
    expect(job.state).toBe("succeeded");

    for (const file of [
      "Start Outpost.command",
      "Start Outpost.bat",
      "start-outpost.sh",
      "README.txt",
      "outpost-portable.json",
      "app/server/outpost.mjs",
      "app/web/index.html",
      "runtime/darwin-arm64/node",
      "runtime/win-x64/node.exe",
      "data/outpost.db",
      "library/.outpost-location.json",
      "library/collections/zim/knots.zim",
      "library/documents/d-tides/Tide tables.txt",
    ]) {
      expect(fs.existsSync(path.join(drive, file)), file).toBe(true);
    }
    expect(fs.existsSync(path.join(drive, "library/collections/zim/wiki.zim"))).toBe(false);
    expect(fs.existsSync(path.join(drive, "data/secret.key"))).toBe(false);
    if (process.platform !== "win32") expect(fs.statSync(path.join(drive, "Start Outpost.command")).mode & 0o111).not.toBe(0);
    expect(fs.readFileSync(path.join(drive, "README.txt"), "utf8")).toContain("Mac (Apple Silicon)");

    const manifest = JSON.parse(fs.readFileSync(path.join(drive, "outpost-portable.json"), "utf8"));
    expect(manifest).toMatchObject({
      format: "outpost-portable",
      platforms: ["darwin-arm64", "win-x64"],
      contents: { collections: 1, documents: 1 },
    });

    const db = new Database(path.join(drive, "data/outpost.db"), { readonly: true });
    try {
      const locations = db.prepare("SELECT id, path, is_default FROM storage_locations").all() as Array<{
        id: string;
        path: string;
        is_default: number;
      }>;
      expect(locations).toHaveLength(1);
      expect(locations[0]!.id).toBe(manifest.locationId);
      expect(locations[0]!.id).not.toBe(location.id);
      expect(db.prepare("SELECT id, location_id AS l FROM collections").all()).toEqual([{ id: "c-knots", l: manifest.locationId }]);
      expect(db.prepare("SELECT kind, entity_id AS e FROM search_entities ORDER BY kind, entity_id").all()).toEqual([
        { kind: "collection", e: "c-knots" },
        { kind: "document", e: "d-tides" },
        { kind: "note", e: "n1" },
      ]);
      // The full-text index went with the rows that were removed.
      expect(db.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'wikipedia'").get()).toEqual({ n: 0 });
      expect(db.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'dover'").get()).toEqual({ n: 1 });
      expect(db.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual({ n: 0 });
      // A drive is carried to other networks: it has no business knowing this one's file servers or user names.
      expect(db.prepare("SELECT count(*) AS n FROM network_shares").get()).toEqual({ n: 0 });
      expect(db.prepare("SELECT value FROM settings WHERE key = 'downloads.concurrency'").get()).toEqual({ value: "4" });
    } finally {
      db.close();
    }
  });

  it("refuses a second drive while one is waiting to be written, however much other work has been queued since", async () => {
    const { app, drive } = await setup();
    queueWaitingJobs(app, "portable.build", 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    queueWaitingJobs(app, "test.other", 150);
    const second = await app.api("POST", "/api/portable/build", request(drive));
    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain("A drive is already being written");
  });

  it("starts from the drive as its own installation, wherever the drive is mounted", async () => {
    const { app, drive } = await setup();
    await app.api("POST", "/api/portable/build", request(drive));
    await app.ctx.jobs.whenIdle();

    // Unplug and plug in elsewhere: the folder now has a different path.
    const elsewhere = path.join(tempDir(), "E-drive", "Outpost");
    fs.mkdirSync(path.dirname(elsewhere), { recursive: true });
    fs.renameSync(drive, elsewhere);

    const { buildApp } = await import("../src/app.ts");
    const { loadConfig } = await import("../src/config.ts");
    const portable = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        OUTPOST_PORTABLE: "true",
        OUTPOST_DATA_DIR: path.join(elsewhere, "data"),
        OUTPOST_STORAGE_ROOTS: path.join(elsewhere, "library"),
        OUTPOST_WEB_DIR: path.join(elsewhere, "app/web"),
        OUTPOST_CATALOG_DIR: path.join(elsewhere, "app/catalog"),
      }),
    );
    await portable.app.ready();
    cleanups.push(() => portable.app.close());
    const inject = async (url: string) => (await portable.app.inject({ method: "GET", url, headers: { host: "localhost" } })).json();

    const storage = await inject("/api/storage/locations");
    expect(storage.locations).toHaveLength(1);
    expect(storage.locations[0]).toMatchObject({ status: "available", path: path.join(elsewhere, "library"), isDefault: true });
    expect((await inject("/api/search?q=dover ")).total).toBe(1);
    expect((await inject("/api/search?q=ebb ")).total).toBe(1);
    expect((await inject("/api/system")).portable).toBe(true);
    expect(portable.ctx.services.storage.resolve(storage.locations[0].id, "collections/zim/knots.zim")).toBe(
      path.join(elsewhere, "library/collections/zim/knots.zim"),
    );
  });

  it("updates a drive by copying only what changed, and keeps what the drive held", async () => {
    const { app, drive } = await setup();
    await app.api("POST", "/api/portable/build", request(drive));
    await app.ctx.jobs.whenIdle();
    const copied = path.join(drive, "library/collections/zim/knots.zim");
    const firstWrite = fs.statSync(copied).mtimeMs;

    // Without confirmation an existing drive is not touched.
    const refused = await app.api("POST", "/api/portable/build", request(drive, { collectionIds: ["c-knots", "c-wiki"] }));
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.needsConfirmation).toBe(true);

    const plan = (await app.api("POST", "/api/portable/plan", request(drive, { collectionIds: ["c-knots", "c-wiki"] }))).body;
    expect(plan.target.isOutpostDrive).toBe(true);
    expect(plan.collections.map((item: { id: string; alreadyOnDrive: boolean }) => [item.id, item.alreadyOnDrive])).toEqual([
      ["c-knots", true],
      ["c-wiki", false],
    ]);

    const again = await app.api(
      "POST",
      "/api/portable/build",
      request(drive, { collectionIds: ["c-knots", "c-wiki"], replaceExisting: true }),
    );
    expect(again.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", `/api/jobs/${again.body.job.id}`)).body.job.state).toBe("succeeded");
    expect(fs.statSync(copied).mtimeMs).toBe(firstWrite);
    expect(fs.existsSync(path.join(drive, "library/collections/zim/wiki.zim"))).toBe(true);
    const kept = fs.readdirSync(drive).filter((name) => name.startsWith("data-before-update-"));
    expect(kept).toHaveLength(1);
    expect(fs.existsSync(path.join(drive, kept[0]!, "outpost.db"))).toBe(true);
  });

  it("puts the reader on the drive where one exists, and says where it does not", async () => {
    const { app, drive } = await setup();
    const cached = kiwixCachePath(app.ctx.config.dataDir, "darwin-arm64");
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, "kiwix for mac");
    const plan = (await app.api("POST", "/api/portable/plan", request(drive, { reader: true }))).body;
    expect(plan.reader).toEqual([
      { platform: "darwin-arm64", label: "Mac (Apple Silicon)", supported: true, cached: true },
      { platform: "win-x64", label: "Windows (64-bit PC)", supported: false, cached: false },
    ]);
    expect(plan.warnings.join(" ")).toMatch(/cannot be opened from this drive on Windows/);
    expect(plan.needsConnection).toBe(false);
    await app.api("POST", "/api/portable/build", request(drive, { reader: true }));
    await app.ctx.jobs.whenIdle();
    expect(fs.readFileSync(path.join(drive, "runtime/darwin-arm64/kiwix-serve"), "utf8")).toBe("kiwix for mac");
    expect(fs.existsSync(path.join(drive, "runtime/win-x64/kiwix-serve"))).toBe(false);
    expect(fs.readFileSync(path.join(drive, "README.txt"), "utf8")).toContain("are included and readable");
  });

  it("refuses folders it should not write to", async () => {
    const { app, drive, location } = await setup();
    const outside = await app.api("POST", "/api/portable/plan", request("/etc/outpost-drive"));
    expect(outside.status).toBe(403);
    const insideLocation = await app.api("POST", "/api/portable/plan", request(path.join(location.path, "drive")));
    expect(insideLocation.status).toBe(400);
    // A folder with someone's own files in it is never used.
    fs.mkdirSync(drive, { recursive: true });
    fs.writeFileSync(path.join(drive, "holiday-photos.txt"), "mine");
    const occupied = await app.api("POST", "/api/portable/build", request(drive));
    expect(occupied.status).toBe(409);
    expect(occupied.body.error.message).toMatch(/already has files/);
    expect(fs.readdirSync(drive)).toEqual(["holiday-photos.txt"]);
  });

  it("says plainly when it runs from source and has no packaged app", async () => {
    const app = await createTestApp({ OUTPOST_APP_DIR: path.join(os.tmpdir(), "outpost-no-such-bundle") });
    cleanups.push(() => app.close());
    const drive = path.join(app.dir, "storage", "usb", "Outpost");
    const { body } = await app.api("POST", "/api/portable/plan", {
      targetPath: drive,
      platforms: ["linux-x64"],
      collectionIds: [],
      documents: "none",
    });
    expect(body.app.available).toBe(false);
    expect(body.problems[0]).toMatch(/running from source/);
    expect(body.needsConnection).toBe(true);
  });
});

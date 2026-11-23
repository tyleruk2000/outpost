import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { Writable } from "node:stream";
import type { DownloadDetail } from "@outpost/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storageRead } from "../src/core/storage-read.ts";
import { OFFLINE_MESSAGE } from "../src/modules/downloads/service.ts";
import type { DownloadKind, DownloadRow, Installer, StartDownload } from "../src/modules/downloads/types.ts";
import { type FileServer, partFileHolds, startFileServer, testBytes, unusedPort, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

let app: TestApp | undefined;
const servers: FileServer[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
  for (const server of servers.splice(0)) await server.close();
});

async function fileServer(host?: string): Promise<FileServer> {
  const server = await startFileServer(host);
  servers.push(server);
  return server;
}

function request(server: FileServer, route: string, relPath: string, extra: Partial<StartDownload> = {}): StartDownload {
  return {
    kind: "file",
    title: "Field manual",
    url: server.url(route),
    relPath,
    allowedHosts: [server.host],
    ...extra,
  };
}

const downloads = (target: TestApp) => target.ctx.services.downloads;

function finalPath(target: TestApp, row: DownloadRow): string {
  return target.ctx.services.storage.resolve(row.locationId, row.relPath);
}

async function settled(target: TestApp, id: string, timeoutMs = 15_000): Promise<DownloadRow> {
  return waitFor(
    () => {
      const row = downloads(target).get(id);
      return row && ["completed", "failed", "cancelled"].includes(row.state) ? row : undefined;
    },
    "the download to finish",
    timeoutMs,
  );
}

/** Waits until some, but not all, of the file has arrived. */
async function midway(target: TestApp, id: string): Promise<void> {
  await waitFor(() => {
    const row = downloads(target).get(id)!;
    return row.state === "running" && downloads(target).toDto(row).receivedBytes > 0;
  }, "the first bytes to arrive");
}

/**
 * Bytes are counted as they arrive, a moment before they are written. A test that goes
 * on to measure the partial file waits for the first of them to be on disk.
 */
async function onDisk(target: TestApp, id: string): Promise<void> {
  const part = `${finalPath(target, downloads(target).get(id)!)}.part`;
  await waitFor(() => fs.existsSync(part) && fs.statSync(part).size > 0, "the first bytes to reach the disk");
}

describe("downloading a file", () => {
  it("fetches, verifies the checksum, installs a collection and reports it", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(300_000);
    server.routes.set("/manual.pdf", { body });

    const started = await downloads(app).start(
      request(server, "/manual.pdf", "collections/files/manual.pdf", {
        sha256: sha256(body),
        sizeBytes: body.length,
        meta: { description: "How to purify water", category: "survival", version: "2024-01" },
      }),
    );
    expect(started.state).toBe("queued");
    const row = await settled(app, started.id);

    expect(row.state).toBe("completed");
    expect(row.sha256Actual).toBe(sha256(body));
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
    expect(fs.existsSync(`${finalPath(app, row)}.part`)).toBe(false);

    const collection = app.ctx.services.collections.get(row.collectionId!)!;
    expect(collection).toMatchObject({
      kind: "file",
      title: "Field manual",
      description: "How to purify water",
      category: "survival",
      version: "2024-01",
      sizeBytes: body.length,
      sha256: sha256(body),
      status: "installed",
    });

    const listed = await app.api("GET", "/api/downloads");
    expect(listed.status).toBe(200);
    expect(listed.body.downloads[0]).toMatchObject({
      id: row.id,
      state: "completed",
      receivedBytes: body.length,
      totalBytes: body.length,
      locationName: "Internal storage",
      error: null,
      errorKind: null,
      collectionId: collection.id,
    });
  });

  it("lists newest first and reports speed and time remaining while running", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/a", { body: testBytes(10_000) });
    server.routes.set("/slow", { body: testBytes(1_500_000, 2), chunkBytes: 16_384, delayMs: 20 });
    const first = await downloads(app).start(request(server, "/a", "a.bin"));
    await settled(app, first.id);
    const second = await downloads(app).start(request(server, "/slow", "slow.bin"));

    const running = await waitFor(async () => {
      const { body } = await app!.api("GET", "/api/downloads");
      const dto = body.downloads[0];
      return dto.id === second.id && dto.bytesPerSecond ? body : undefined;
    }, "a speed estimate");
    expect(running.downloads.map((dto: { id: string }) => dto.id)).toEqual([second.id, first.id]);
    expect(running.downloads[0].state).toBe("running");
    expect(running.downloads[0].etaSeconds).toBeGreaterThanOrEqual(0);
    expect(running.downloads[0].totalBytes).toBe(1_500_000);
    downloads(app).cancel(second.id);
    await waitFor(() => app!.ctx.jobs.get(second.jobId!)?.state === "cancelled", "the transfer to stop");
  });

  it("publishes progress to the browser no more than about twice a second", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/slow", { body: testBytes(1_200_000), chunkBytes: 8_192, delayMs: 10 });
    const seen: Array<{ at: number; state: string }> = [];
    app.ctx.events.subscribe((event) => {
      if (event.type === "download.updated") seen.push({ at: Date.now(), state: (event.data as { state: string }).state });
    });
    const started = await downloads(app).start(request(server, "/slow", "slow.bin"));
    const row = await settled(app, started.id);
    expect(row.state).toBe("completed");

    const whileRunning = seen.filter((event) => event.state === "running");
    const seconds = (whileRunning.at(-1)!.at - whileRunning[0]!.at) / 1000;
    // 147 chunks arrived; state changes aside, only the throttled progress events may show.
    expect(whileRunning.length).toBeGreaterThan(2);
    expect(whileRunning.length).toBeLessThanOrEqual(Math.ceil(seconds * 2) + 4);
    expect(seen.at(-1)!.state).toBe("completed");
  });
});

describe("resuming", () => {
  it("continues with a Range request after the server drops the connection mid-file", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(400_000, 7);
    server.routes.set("/big.zim", { body, dropAfterBytes: 150_000, beforeDrop: partFileHolds(app, 150_000), headers: { etag: '"v1"' } });

    const started = await downloads(app).start(
      request(server, "/big.zim", "collections/zim/big.zim", { kind: "zim", sha256: sha256(body) }),
    );
    const row = await settled(app, started.id);

    expect(row.state).toBe("completed");
    expect(row.attempts).toBe(2);
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0]!.range).toBeUndefined();
    expect(server.requests[1]!.range).toBe("bytes=150000-");
    // Same host both times, so the remembered ETag guards against a changed file.
    expect(server.requests[1]!.ifRange).toBe('"v1"');
    expect(sha256(fs.readFileSync(finalPath(app, row)))).toBe(sha256(body));
    expect(row.sha256Actual).toBe(sha256(body));
  });

  it("starts again cleanly when the server ignores the Range request", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(300_000, 3);
    server.routes.set("/norange", { body, ranges: false, dropAfterBytes: 100_000 });

    const started = await downloads(app).start(request(server, "/norange", "norange.bin", { sha256: sha256(body) }));
    const row = await settled(app, started.id);

    // It asks to continue from what reached the disk: all 100,000 bytes, or fewer if the
    // connection went while the last of them were still on their way there.
    const asked = /^bytes=(\d+)-$/.exec(server.requests[1]!.range ?? "");
    expect(Number(asked?.[1])).toBeGreaterThan(0);
    expect(Number(asked?.[1])).toBeLessThanOrEqual(100_000);
    expect(row.state).toBe("completed");
    const file = fs.readFileSync(finalPath(app, row));
    expect(file.length).toBe(body.length);
    expect(sha256(file)).toBe(sha256(body));
  });

  it("starts again when the file changed on the server between attempts", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const first = testBytes(300_000, 20);
    const second = testBytes(310_000, 21);
    server.routes.set("/doc", {
      body: first,
      dropAfterBytes: 120_000,
      beforeDrop: partFileHolds(app, 120_000),
      headers: { etag: '"build-1"' },
    });

    const started = await downloads(app).start(request(server, "/doc", "doc.bin"));
    await waitFor(() => downloads(app!).get(started.id)!.state === "queued" && server.requests.length === 1, "the dropped connection");
    // The publisher replaces the file before the retry.
    server.routes.set("/doc", { body: second, headers: { etag: '"build-2"' } });
    const row = await settled(app, started.id);

    expect(server.requests[1]).toMatchObject({ range: "bytes=120000-", ifRange: '"build-1"' });
    expect(row.state).toBe("completed");
    expect(row.etag).toBe('"build-2"');
    // Not 120 kB of the old file followed by the tail of the new one.
    expect(fs.readFileSync(finalPath(app, row)).equals(second)).toBe(true);
  });

  it("starts again when a server sends the tail of a changed file without honouring If-Range", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const first = testBytes(300_000, 23);
    const second = testBytes(300_000, 24);
    server.routes.set("/extract", {
      body: first,
      dropAfterBytes: 120_000,
      beforeDrop: partFileHolds(app, 120_000),
      headers: { etag: '"day-1"' },
    });

    const started = await downloads(app).start(request(server, "/extract", "extract.bin"));
    await waitFor(() => downloads(app!).get(started.id)!.state === "queued" && server.requests.length === 1, "the dropped connection");
    // Replaced at its source, by a server that sends the tail asked for whatever If-Range says.
    server.routes.set("/extract", { body: second, ifRange: false, headers: { etag: '"day-2"' } });
    const row = await settled(app, started.id);

    expect(server.requests.map((seen) => seen.range ?? "all of it")).toEqual(["all of it", "bytes=120000-", "all of it"]);
    expect(row.state).toBe("completed");
    // Not 120 kB of the old file followed by the tail of the new one, which is the same size.
    expect(fs.readFileSync(finalPath(app, row)).equals(second)).toBe(true);
  });

  it("starts again when the tail is of a file of another size", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const first = testBytes(300_000, 25);
    const second = testBytes(320_000, 26);
    server.routes.set("/extract", { body: first, dropAfterBytes: 120_000, beforeDrop: partFileHolds(app, 120_000) });

    const started = await downloads(app).start(request(server, "/extract", "extract.bin"));
    await waitFor(() => downloads(app!).get(started.id)!.state === "queued" && server.requests.length === 1, "the dropped connection");
    // No validators at all: only the size gives it away.
    server.routes.set("/extract", { body: second });
    const row = await settled(app, started.id);

    expect(server.requests.map((seen) => seen.range ?? "all of it")).toEqual(["all of it", "bytes=120000-", "all of it"]);
    expect(row.state).toBe("completed");
    expect(fs.readFileSync(finalPath(app, row)).equals(second)).toBe(true);
  });

  it("does not rely on ETags across mirrors; the checksum decides", async () => {
    app = await createTestApp();
    const origin = await fileServer();
    const mirror = await fileServer();
    const body = testBytes(300_000, 22);
    // "localhost" is a different host from 127.0.0.1 as far as HTTP is concerned.
    origin.routes.set("/zim/a.zim", { body: Buffer.alloc(0), redirectTo: `http://localhost:${mirror.port}/pub/a.zim` });
    mirror.routes.set("/pub/a.zim", {
      body,
      dropAfterBytes: 100_000,
      beforeDrop: partFileHolds(app, 100_000),
      headers: { etag: '"mirror-specific"' },
    });

    const started = await downloads(app).start(request(origin, "/zim/a.zim", "a.zim", { kind: "zim", sha256: sha256(body) }));
    const row = await settled(app, started.id);

    expect(row.state).toBe("completed");
    expect(origin.requests).toHaveLength(2);
    expect(mirror.requests).toHaveLength(2);
    expect(mirror.requests[1]).toMatchObject({ range: "bytes=100000-", ifRange: undefined });
    expect(row.etag).toBeNull();
    expect(row.sha256Actual).toBe(sha256(body));
  });

  it("finishes without fetching again when the partial file is already complete (416)", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(50_000, 4);
    server.routes.set("/done", { body });
    const location = app.ctx.services.storage.getDefault();
    fs.mkdirSync(path.join(location.path, "x"), { recursive: true });

    // As if the server had stopped just after the last byte arrived, before verifying.
    const started = await downloads(app).start(request(server, "/done", "x/done.bin", { sizeBytes: body.length, sha256: sha256(body) }));
    downloads(app).pause(started.id);
    fs.writeFileSync(path.join(location.path, "x/done.bin.part"), body);
    downloads(app).resume(started.id);
    const row = await settled(app, started.id);

    expect(row.state).toBe("completed");
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.range).toBe(`bytes=${body.length}-`);
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
  });

  it("pauses, keeps the partial file, and continues from it on resume", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(1_000_000, 5);
    server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 15 });

    const started = await downloads(app).start(request(server, "/slow", "slow.bin", { sha256: sha256(body) }));
    await midway(app, started.id);
    await onDisk(app, started.id);
    const paused = await app.api("POST", `/api/downloads/${started.id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.download.state).toBe("paused");

    await waitFor(
      () => app!.ctx.jobs.get(started.jobId ?? downloads(app!).get(started.id)!.jobId!)?.state === "paused",
      "the job to pause",
    );
    const row = downloads(app).get(started.id)!;
    expect(row.state).toBe("paused");
    const partSize = fs.statSync(`${finalPath(app, row)}.part`).size;
    expect(partSize).toBeGreaterThan(0);
    expect(partSize).toBeLessThan(body.length);
    expect(fs.existsSync(finalPath(app, row))).toBe(false);

    const resumed = await app.api("POST", `/api/downloads/${started.id}/resume`);
    expect(resumed.body.download.state).toBe("queued");
    const done = await settled(app, started.id);
    expect(done.state).toBe("completed");
    expect(server.requests.at(-1)!.range).toBe(`bytes=${partSize}-`);
    expect(sha256(fs.readFileSync(finalPath(app, done)))).toBe(sha256(body));
  });

  it("resumes when asked before the pause has finished taking effect", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(600_000, 6);
    server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 10 });
    const started = await downloads(app).start(request(server, "/slow", "slow.bin", { sha256: sha256(body) }));
    await midway(app, started.id);
    downloads(app).pause(started.id);
    downloads(app).resume(started.id);
    expect((await settled(app, started.id)).state).toBe("completed");
  });

  it("picks up from the partial file after the server restarts", async () => {
    const first = await createTestApp();
    const server = await fileServer();
    const body = testBytes(900_000, 8);
    server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 15 });
    try {
      const started = await downloads(first).start(request(server, "/slow", "collections/files/slow.bin", { sha256: sha256(body) }));
      await midway(first, started.id);
      await onDisk(first, started.id);
      const partPath = `${finalPath(first, downloads(first).get(started.id)!)}.part`;
      // Stop the server process mid-download, without removing its directory.
      await first.app.close();
      const partSize = fs.statSync(partPath).size;
      expect(partSize).toBeGreaterThan(0);
      expect(partSize).toBeLessThan(body.length);

      app = await createTestApp({}, first.dir);
      const row = await settled(app, started.id);
      expect(row.state).toBe("completed");
      expect(server.requests.at(-1)!.range).toBe(`bytes=${partSize}-`);
      expect(sha256(fs.readFileSync(finalPath(app, row)))).toBe(sha256(body));
      expect(app.ctx.services.collections.get(row.collectionId!)?.status).toBe("installed");
    } finally {
      await app?.close();
      app = undefined;
      fs.rmSync(first.dir, { recursive: true, force: true });
    }
  });
});

describe("cancelling, retrying and removing", () => {
  it("cancel installs nothing; retry continues from the partial file; remove deletes it", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(800_000, 9);
    server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 15 });

    const started = await downloads(app).start(request(server, "/slow", "slow.bin", { sha256: sha256(body) }));
    await midway(app, started.id);
    await onDisk(app, started.id);
    const cancelled = await app.api("POST", `/api/downloads/${started.id}/cancel`);
    expect(cancelled.body.download.state).toBe("cancelled");
    await app.ctx.jobs.whenIdle();
    await waitFor(() => app!.ctx.jobs.get(downloads(app!).get(started.id)!.jobId!)?.state === "cancelled", "the job to stop");

    const row = downloads(app).get(started.id)!;
    expect(row.state).toBe("cancelled");
    expect(fs.existsSync(finalPath(app, row))).toBe(false);
    expect(app.ctx.services.collections.list()).toHaveLength(0);
    const partSize = fs.statSync(`${finalPath(app, row)}.part`).size;
    expect(partSize).toBeGreaterThan(0);

    // Starting the same file afresh would orphan that partial file, so it is refused.
    await expect(downloads(app).start(request(server, "/slow", "slow.bin"))).rejects.toMatchObject({ code: "conflict" });

    // Cancel again, this time for good.
    const retried = await app.api("POST", `/api/downloads/${started.id}/retry`);
    expect(retried.body.download.state).toBe("queued");
    await waitFor(() => server.requests.length === 2, "the second request");
    expect(server.requests[1]!.range).toBe(`bytes=${partSize}-`);
    downloads(app).cancel(started.id);
    await waitFor(() => app!.ctx.jobs.get(downloads(app!).get(started.id)!.jobId!)?.state === "cancelled", "the job to stop");

    const removed = await app.api("DELETE", `/api/downloads/${started.id}`);
    expect(removed.status).toBe(200);
    expect(fs.existsSync(`${finalPath(app, row)}.part`)).toBe(false);
    expect(downloads(app).get(started.id)).toBeUndefined();
  });

  it("will not remove a download that is still active, and never deletes a completed file", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(700_000, 10);
    server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 10 });
    const started = await downloads(app).start(request(server, "/slow", "keep.bin"));
    await midway(app, started.id);
    expect((await app.api("DELETE", `/api/downloads/${started.id}`)).status).toBe(409);

    const row = await settled(app, started.id);
    expect((await app.api("DELETE", `/api/downloads/${started.id}`)).status).toBe(200);
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
    expect(app.ctx.services.collections.list()).toHaveLength(1);
  });
});

describe("failures", () => {
  it("installs nothing and removes the partial file when the checksum does not match", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(120_000, 11);
    server.routes.set("/bad", { body });

    const started = await downloads(app).start(request(server, "/bad", "bad.bin", { sha256: sha256(Buffer.from("something else")) }));
    const row = await settled(app, started.id);

    expect(row.state).toBe("failed");
    expect(row.errorKind).toBe("checksum_mismatch");
    // What was written read back as it arrived, so the storage is not blamed for it.
    expect(row.error).toMatch(
      /it is the file as it arrived: it was damaged on the way or changed at its source, or had been tampered with/,
    );
    expect(row.error).toMatch(/nothing was installed/);
    expect(row.attempts).toBe(1);
    // Fetched once more from the start before giving up, and never continued from the failed copy.
    const asked = server.requests.filter((seen) => seen.method === "GET");
    expect(asked.map((seen) => seen.range ?? "all of it")).toEqual(["all of it", "all of it"]);
    expect(fs.existsSync(finalPath(app, row))).toBe(false);
    expect(fs.existsSync(`${finalPath(app, row)}.part`)).toBe(false);
    expect(app.ctx.services.collections.list()).toHaveLength(0);
  });

  it("holds a file to the MD5 its publisher gives where that is the checksum there is, and shows it", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(120_000, 12);
    server.routes.set("/md5", { body });
    const md5 = createHash("md5").update(body).digest("hex");

    const started = await downloads(app).start(request(server, "/md5", "md5.bin", { md5: md5.toUpperCase() }));
    const row = await settled(app, started.id);
    expect(row.state).toBe("completed");
    const { integrity } = (await app.api("GET", `/api/downloads/${started.id}`)).body as DownloadDetail;
    expect(integrity).toEqual({ sha256Expected: null, sha256Actual: sha256(body), md5Expected: md5, md5Actual: md5, verified: true });
  });

  it("deletes a file that does not match its publisher's MD5, so that trying again fetches it again", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(120_000, 13);
    // Sent damaged: the right size, a stretch of zeros. (Lost by the storage instead, it is put right: see below.)
    const damaged = Buffer.from(body);
    damaged.fill(0, 65_536, 69_632);
    server.routes.set("/extract", { body: damaged });
    const md5 = createHash("md5").update(body).digest("hex");

    const started = await downloads(app).start(request(server, "/extract", "extract.bin", { md5 }));
    const row = await settled(app, started.id);
    expect(row.state).toBe("failed");
    expect(row.errorKind).toBe("checksum_mismatch");
    expect(row.error).toMatch(/did not match (its published checksum|the MD5 its publisher gives), twice/);
    expect(row.error).toMatch(/it is the file as it arrived/);
    expect(fs.existsSync(`${finalPath(app, row)}.part`)).toBe(false);
    expect(app.ctx.services.collections.list()).toHaveLength(0);
    const failed = ((await app.api("GET", `/api/downloads/${started.id}`)).body as DownloadDetail).integrity;
    expect(failed).toMatchObject({ md5Expected: md5, md5Actual: createHash("md5").update(damaged).digest("hex"), verified: false });

    // The same download, tried again once the file arrives whole: fetched afresh, not the damaged copy checked again.
    server.routes.set("/extract", { body });
    const before = server.requests.length;
    await downloads(app).retry(started.id);
    const again = await settled(app, started.id);
    expect(again.state).toBe("completed");
    expect(server.requests.length).toBeGreaterThan(before);
    expect(fs.readFileSync(finalPath(app, again)).equals(body)).toBe(true);
    expect(((await app.api("GET", `/api/downloads/${started.id}`)).body as DownloadDetail).integrity.verified).toBe(true);
  });

  it("downloads a file that fails its publisher's MD5 once more from the start, and keeps the copy that passes", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(200_000, 14);
    const damaged = Buffer.from(body);
    damaged.fill(0, 131_072, 135_168);
    let sent = 0;
    server.routes.set("/extract", { body, respond: () => (sent++ === 0 ? damaged : body) });
    const md5 = createHash("md5").update(body).digest("hex");
    const read: Buffer[] = [];
    downloads(app).registerInstaller(
      "extract",
      async ({ filePath }) => {
        read.push(fs.readFileSync(filePath));
        return undefined;
      },
      () => true,
    );

    const started = await downloads(app).start(request(server, "/extract", "extract.bin", { kind: "extract", md5 }));
    const row = await settled(app, started.id);
    expect(row.error).toBeNull();
    expect(row.state).toBe("completed");
    expect(row.attempts).toBe(1);
    // The installer (what reads a country file) was given only the copy that passed, once.
    expect(read).toHaveLength(1);
    expect(read[0]!.equals(body)).toBe(true);
    expect(server.requests.filter((seen) => seen.method === "GET").map((seen) => seen.range ?? "all of it")).toEqual([
      "all of it",
      "all of it",
    ]);
    const detail = (await app.api("GET", `/api/downloads/${started.id}`)).body as DownloadDetail;
    expect(detail.events.map((event) => event.state)).toEqual(["queued", "running", "verifying", "running", "verifying", "completed"]);
    expect(detail.events[3]!.detail).toBe(
      "The file did not match the MD5 its publisher gives, so it was deleted and is downloaded again from the start.",
    );
    expect(detail.integrity).toMatchObject({ md5Expected: md5, md5Actual: md5, verified: true });
  });

  it("treats 404 as permanent", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const started = await downloads(app).start(request(server, "/gone", "gone.bin"));
    const row = await settled(app, started.id);

    expect(row.state).toBe("failed");
    expect(row.errorKind).toBe("not_found");
    expect(row.error).toBe("The file is no longer at this address. Refresh the catalogue and try again.");
    expect(row.attempts).toBe(1);
    expect(server.requests).toHaveLength(1);
  });

  it("retries a busy server (503) and then succeeds", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(20_000, 12);
    server.routes.set("/busy", { body: Buffer.alloc(0), status: 503 });
    const started = await downloads(app).start(request(server, "/busy", "busy.bin"));
    const waiting = await waitFor(() => {
      const row = downloads(app!).get(started.id)!;
      return row.state === "queued" && row.error ? row : undefined;
    }, "the first failure");
    expect(waiting.error).toMatch(/HTTP 503/);
    server.routes.set("/busy", { body });
    expect((await settled(app, started.id)).state).toBe("completed");
  });

  it("reports being offline in plain words and keeps trying", async () => {
    app = await createTestApp();
    app.ctx.services.settings.update({ "downloads.maxAttempts": 2 });
    const port = await unusedPort();
    const started = await downloads(app).start({
      kind: "file",
      title: "Unreachable",
      url: `http://127.0.0.1:${port}/file.bin`,
      relPath: "file.bin",
      allowedHosts: ["127.0.0.1"],
    });

    const waiting = await waitFor(() => {
      const row = downloads(app!).get(started.id)!;
      return row.state === "queued" && row.errorKind ? row : undefined;
    }, "the first failed attempt");
    expect(waiting.errorKind).toBe("offline");
    expect(waiting.error).toBe(OFFLINE_MESSAGE);
    const dto = (await app.api("GET", "/api/downloads")).body.downloads[0];
    expect(dto).toMatchObject({ state: "queued", errorKind: "offline", error: OFFLINE_MESSAGE, message: "Waiting for a connection" });

    const row = await settled(app, started.id);
    expect(row.state).toBe("failed");
    expect(row.errorKind).toBe("offline");
    expect(row.error).toMatch(/^No connection\./);
    expect(row.attempts).toBe(2);
  });

  it("reports a full drive as such, keeps the partial file, and does not retry by itself", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(600_000, 23);
    server.routes.set("/big", { body, chunkBytes: 65_536 });

    // The drive fills up after the first few hundred kilobytes.
    const realCreate = fs.createWriteStream;
    let written = 0;
    vi.spyOn(fs, "createWriteStream").mockImplementation(((file: fs.PathLike, options?: unknown) => {
      const stream = realCreate(file, options as never);
      if (String(file).endsWith(".part")) {
        const full = () => Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
        const realWrite = stream._write.bind(stream);
        stream._write = (chunk, encoding, callback) => {
          written += (chunk as Buffer).length;
          if (written > 200_000) callback(full());
          else realWrite(chunk, encoding, callback);
        };
        // Small pieces written close together are handed to the disk in batches.
        const realWritev = stream._writev!.bind(stream);
        stream._writev = (chunks, callback) => {
          for (const item of chunks) written += (item.chunk as Buffer).length;
          if (written > 200_000) callback(full());
          else realWritev(chunks, callback);
        };
      }
      return stream;
    }) as typeof fs.createWriteStream);

    const started = await downloads(app).start(request(server, "/big", "big.bin", { sha256: sha256(body) }));
    const failed = await settled(app, started.id);
    expect(failed.state).toBe("failed");
    expect(failed.errorKind).toBe("insufficient_space");
    expect(failed.error).toMatch(/"Internal storage" is full\. Free some space/);
    expect(failed.attempts).toBe(1);
    expect(fs.statSync(`${finalPath(app, failed)}.part`).size).toBeGreaterThan(0);

    // Space has been freed: retrying continues and completes.
    vi.restoreAllMocks();
    await downloads(app).retry(started.id);
    const row = await settled(app, started.id);
    expect(row.state).toBe("completed");
    expect(server.requests[1]!.range).toMatch(/^bytes=\d+-$/);
    expect(sha256(fs.readFileSync(finalPath(app, row)))).toBe(sha256(body));
  });

  it("refuses before fetching anything when there is not enough free space", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/huge", { body: testBytes(1000) });
    const required = 8e15; // eight petabytes

    const error = await downloads(app)
      .start(request(server, "/huge", "huge.bin", { sizeBytes: required }))
      .catch((caught) => caught);

    expect(error).toMatchObject({ code: "insufficient_space", status: 507 });
    expect(error.details.requiredBytes).toBe(required);
    expect(error.details.freeBytes).toBeGreaterThan(0);
    expect(error.details.freeBytes).toBeLessThan(required);
    expect(server.requests).toHaveLength(0);
    expect(downloads(app).list()).toHaveLength(0);
  });

  it("refuses destinations outside the storage location, and existing files", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/f", { body: testBytes(100) });

    await expect(downloads(app).start(request(server, "/f", "../x"))).rejects.toMatchObject({ code: "bad_request" });
    await expect(downloads(app).start(request(server, "/f", "a/../../../x"))).rejects.toMatchObject({ code: "bad_request" });
    await expect(downloads(app).start(request(server, "/f", "/etc/outpost-test"))).rejects.toMatchObject({ code: "bad_request" });
    await expect(downloads(app).start(request(server, "/f", "."))).rejects.toMatchObject({ code: "bad_request" });

    const location = app.ctx.services.storage.getDefault();
    fs.writeFileSync(path.join(location.path, "mine.txt"), "a person's own file");
    await expect(downloads(app).start(request(server, "/f", "mine.txt"))).rejects.toMatchObject({ code: "conflict" });
    expect(fs.readFileSync(path.join(location.path, "mine.txt"), "utf8")).toBe("a person's own file");

    const first = await downloads(app).start(request(server, "/f", "same.bin"));
    await expect(downloads(app).start(request(server, "/f", "same.bin"))).rejects.toMatchObject({ code: "conflict" });
    await settled(app, first.id);
    expect(server.requests.every((seen) => seen.path === "/f")).toBe(true);
    expect(fs.existsSync(path.join(app.dir, "x"))).toBe(false);
  });

  it("refuses hosts that are not on the allow-list, before and after the first request", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/f", { body: testBytes(100) });
    await expect(
      downloads(app).start({ kind: "file", title: "x", url: server.url("/f"), relPath: "x.bin", allowedHosts: ["download.example.org"] }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(downloads(app).start({ kind: "file", title: "x", url: server.url("/f"), relPath: "x.bin" })).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(server.requests).toHaveLength(0);
  });
});

describe("a storage location that goes away", () => {
  it("keeps the partial file, says the drive was disconnected, and resumes when it returns", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(1_200_000, 13);
    server.routes.set("/slow", { body, chunkBytes: 16_384, delayMs: 15 });
    const { storage } = app.ctx.services;
    const usbPath = path.join(app.dir, "storage", "usb");
    const unplugged = path.join(app.dir, "unplugged");
    const usb = await storage.add({ name: "USB drive", path: usbPath, kind: "external" });

    const started = await downloads(app).start(
      request(server, "/slow", "collections/files/slow.bin", { locationId: usb.id, sha256: sha256(body) }),
    );
    await midway(app, started.id);
    await onDisk(app, started.id);

    // "Unplug" the drive: its folder is no longer under any storage root.
    fs.renameSync(usbPath, unplugged);
    await storage.refresh();
    const failed = await settled(app, started.id);
    expect(failed.state).toBe("failed");
    expect(failed.errorKind).toBe("storage_unavailable");
    expect(failed.error).toMatch(/"USB drive" was disconnected/);
    const partPath = path.join(unplugged, "collections/files/slow.bin.part");
    const partSize = fs.statSync(partPath).size;
    expect(partSize).toBeGreaterThan(0);
    expect(partSize).toBeLessThan(body.length);
    expect((await app.api("POST", `/api/downloads/${started.id}/retry`)).status).toBe(503);

    // Plug it back in. The download carries on by itself, from the partial file.
    fs.renameSync(unplugged, usbPath);
    await storage.refresh();
    await waitFor(() => downloads(app!).get(started.id)!.state === "completed", "the download to resume and finish");
    expect(server.requests.at(-1)!.range).toBe(`bytes=${partSize}-`);
    expect(sha256(fs.readFileSync(path.join(usbPath, "collections/files/slow.bin")))).toBe(sha256(body));
  });
});

/**
 * Registers an installer for a kind no module has claimed. Other modules register
 * theirs at startup (maps takes "map", "terrain" and "places"), and one kind has one installer.
 */
function registerOnFreeKind(target: TestApp, installer: Installer): DownloadKind {
  for (const kind of ["model", "file", "zim"] as const) {
    try {
      downloads(target).registerInstaller(kind, installer);
      return kind;
    } catch {
      // Taken; try the next.
    }
  }
  throw new Error("every download kind already has an installer");
}

describe("extension points", () => {
  it("uses a registered fetcher and installer", async () => {
    app = await createTestApp();
    const body = testBytes(64_000, 14);
    const installed: Array<{ filePath: string; sizeBytes: number; sha256: string; region: unknown }> = [];

    downloads(app).registerFetcher("test-region", async (context) => {
      // Stands in for the maps fetcher, which assembles a file from many range requests.
      context.remember({ meta: { tilesDone: 3 } });
      await fs.promises.writeFile(context.partPath, body);
      context.progress(body.length, body.length, "Extracting tiles");
    });
    const kind = registerOnFreeKind(app, async (context) => {
      installed.push({
        filePath: context.filePath,
        sizeBytes: context.sizeBytes,
        sha256: context.sha256,
        region: context.download.meta.region,
      });
      const collection = await app!.ctx.services.collections.create({
        // A document saved from a link never becomes a collection; every other kind does.
        kind: context.download.kind as Exclude<DownloadKind, "document">,
        title: context.download.title,
        locationId: context.download.locationId,
        relPath: context.download.relPath,
        sha256: context.sha256,
      });
      return { collectionId: collection.id };
    });
    expect(() => downloads(app!).registerInstaller(kind, async () => undefined)).toThrow(/already registered/);
    expect(() => downloads(app!).registerFetcher("test-region", async () => undefined)).toThrow(/already registered/);
    expect(() => downloads(app!).registerFetcher("http", async () => undefined)).toThrow(/already registered/);

    const completed: string[] = [];
    downloads(app).onCompleted((download) => void completed.push(download.id));
    const started = await downloads(app).start({
      kind,
      title: "Alps",
      url: "region:alps",
      relPath: "test-regions/alps.bin",
      fetcher: "test-region",
      meta: { region: "alps" },
    });
    const row = await settled(app, started.id);

    expect(row.state).toBe("completed");
    expect(installed).toEqual([{ filePath: finalPath(app, row), sizeBytes: body.length, sha256: sha256(body), region: "alps" }]);
    expect(row.meta).toMatchObject({ region: "alps", tilesDone: 3 });
    expect(app.ctx.services.collections.get(row.collectionId!)?.kind).toBe(kind);
    expect(completed).toEqual([row.id]);
    await expect(downloads(app).start({ kind, title: "x", url: "x", relPath: "y", fetcher: "nope" })).rejects.toMatchObject({
      code: "bad_request",
    });
  });

  it("gives the file its final name back when installing fails, and installs on retry without fetching again", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(40_000, 15);
    server.routes.set("/model", { body });
    let attempts = 0;
    const kind = registerOnFreeKind(app, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("The index could not be built.");
      return undefined;
    });
    app.ctx.services.settings.update({ "downloads.maxAttempts": 1 });

    const started = await downloads(app).start(request(server, "/model", "models/m.bin", { kind }));
    const failed = await settled(app, started.id);
    expect(failed.state).toBe("failed");
    expect(fs.existsSync(finalPath(app, failed))).toBe(false);
    expect(fs.existsSync(`${finalPath(app, failed)}.part`)).toBe(true);

    await downloads(app).retry(started.id);
    const row = await settled(app, started.id);
    expect(row.state).toBe("completed");
    expect(row.collectionId).toBeNull();
    expect(server.requests).toHaveLength(1);
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
  });
});

describe("private addresses", () => {
  it("refuses a loopback address, a name that resolves to one, and a redirect to one", async () => {
    app = await createTestApp({ OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "false" });
    app.ctx.services.settings.update({ "downloads.maxAttempts": 1 });
    const internal = await fileServer();
    internal.routes.set("/secret", { body: Buffer.from("router admin page") });

    const direct = await downloads(app).start(request(internal, "/secret", "direct.bin"));
    const directRow = await settled(app, direct.id);
    expect(directRow.state).toBe("failed");
    expect(directRow.errorKind).toBe("forbidden");
    expect(directRow.error).toMatch(/not a public address/);

    const byName = await downloads(app).start({
      kind: "file",
      title: "By name",
      url: `http://localhost:${internal.port}/secret`,
      relPath: "name.bin",
      allowedHosts: ["localhost"],
    });
    const byNameRow = await settled(app, byName.id);
    expect(byNameRow.state).toBe("failed");
    expect(byNameRow.error).toMatch(/not a public address/);

    // A redirect can only be reached through a first hop that is public, which no
    // offline test has. So one loopback address (::1) is declared public for this
    // test, standing in for a mirror on the internet; 127.0.0.1 stays private.
    let mirror: FileServer;
    try {
      mirror = await fileServer("::1");
    } catch {
      return; // No IPv6 loopback on this machine; the two cases above still ran.
    }
    const realCheck = net.BlockList.prototype.check;
    vi.spyOn(net.BlockList.prototype, "check").mockImplementation(function (this: net.BlockList, address, family) {
      if (address === "::1") return false;
      return realCheck.call(this, address as string, family as "ipv4");
    });
    mirror.routes.set("/file", { body: Buffer.alloc(0), redirectTo: internal.url("/secret") });
    mirror.routes.set("/ok", { body: Buffer.from("public file") });

    const reachable = await downloads(app).start({
      kind: "file",
      title: "Public",
      url: mirror.url("/ok"),
      relPath: "ok.bin",
      allowedHosts: ["::1"],
    });
    expect((await settled(app, reachable.id)).state).toBe("completed");

    const redirected = await downloads(app).start({
      kind: "file",
      title: "Redirected",
      url: mirror.url("/file"),
      relPath: "redirected.bin",
      allowedHosts: ["::1"],
    });
    const redirectedRow = await settled(app, redirected.id);
    expect(redirectedRow.state).toBe("failed");
    expect(redirectedRow.errorKind).toBe("forbidden");
    expect(redirectedRow.error).toMatch(/127\.0\.0\.1 are blocked because it is not a public address/);
    expect(mirror.requests.map((seen) => seen.path)).toEqual(["/ok", "/file"]);

    expect(internal.requests).toHaveLength(0);
    expect(fs.existsSync(finalPath(app, redirectedRow))).toBe(false);
  });
});

/**
 * Storage that does not keep what is written to it: the first Raspberry Pi's NAS share gave back a 2.3 GB
 * download the right size with one 4 KiB block of zeros in it (18 November 2026). Here the stream the
 * downloader writes through is stood in for by one that zeroes a block on its way to the disk.
 */
describe("storage that loses part of what is written to it", () => {
  const MEGABYTE = 1024 * 1024;
  const LOST = { from: 2 * MEGABYTE + 405_504, bytes: 4096 };

  /** Makes every stream the downloader opens zero the lost block as it passes, for the first `times` streams. */
  function lossyStorage(times: number) {
    const open = fs.createWriteStream;
    let streams = 0;
    return vi.spyOn(fs, "createWriteStream").mockImplementation(((file: fs.PathLike, options?: { flags?: string }) => {
      const real = open(file, options as never);
      if (!String(file).endsWith(".part")) return real;
      streams += 1;
      const lossy = streams <= times;
      let position = options?.flags === "a" && fs.existsSync(file) ? fs.statSync(file).size : 0;
      return new Writable({
        write(chunk: Buffer, _encoding, done) {
          const [start, end] = [position, position + chunk.length];
          position = end;
          if (lossy && start < LOST.from + LOST.bytes && end > LOST.from) {
            chunk = Buffer.from(chunk);
            chunk.fill(0, Math.max(0, LOST.from - start), Math.min(chunk.length, LOST.from + LOST.bytes - start));
          }
          real.write(chunk, done);
        },
        final(done) {
          real.end(done);
        },
      }) as never;
    }) as never);
  }

  afterEach(() => vi.restoreAllMocks());

  it("is caught when the file is checked, and only the part from the damage on is fetched again", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(3 * MEGABYTE + 500_000, 31);
    // No published checksum: nothing but Outpost's own record of what it wrote could tell.
    server.routes.set("/atlas", { body });
    lossyStorage(1);

    const started = await downloads(app).start(request(server, "/atlas", "atlas.bin"));
    const row = await settled(app, started.id);
    expect(row.error).toBeNull();
    expect(row.state).toBe("completed");
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
    expect(row.sha256Actual).toBe(sha256(body));
    // The whole file once, then from the megabyte the lost block is in: not the whole file again.
    const asked = server.requests.filter((seen) => seen.method === "GET").map((seen) => seen.range ?? "all of it");
    expect(asked).toEqual(["all of it", `bytes=${2 * MEGABYTE}-`]);
    const { events } = (await app.api("GET", `/api/downloads/${started.id}`)).body as DownloadDetail;
    expect(events.map((event) => event.state)).toEqual(["queued", "running", "verifying", "running", "verifying", "completed"]);
    expect(events[3]!.detail).toMatch(
      /^What was written to .+ did not read back the same from 2\.10 MB on \(of 3\.65 MB\), so that part is fetched again\.$/,
    );
    expect(app.ctx.services.collections.list()).toHaveLength(1);
  });

  it("is caught before a published checksum would have had the whole file thrown away", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(3 * MEGABYTE, 32);
    server.routes.set("/zim", { body });
    lossyStorage(1);

    const started = await downloads(app).start(request(server, "/zim", "book.bin", { sha256: sha256(body) }));
    const row = await settled(app, started.id);
    expect(row.state).toBe("completed");
    expect(row.attempts).toBe(1);
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
    expect(server.requests.filter((seen) => seen.method === "GET")).toHaveLength(2);
  });

  it("has a file that is filled in by position fetched again whole, as there is no cutting that back", async () => {
    app = await createTestApp();
    const body = testBytes(400_000, 34);
    const found: Array<number | null> = [];
    // As a map region is written: pieces placed where they belong, the head last. The first time, the disk gets a hole.
    downloads(app).registerFetcher("placing", async (context) => {
      found.push(fs.existsSync(context.partPath) ? fs.statSync(context.partPath).size : null);
      const onDisk = Buffer.from(body);
      if (found.length === 1) onDisk.fill(0, 250_000, 254_096);
      fs.writeFileSync(context.partPath, onDisk);
      const tiles = context.written.run();
      tiles.place(100_000, body.subarray(100_000, 300_000));
      tiles.place(300_000, body.subarray(300_000));
      tiles.close();
      const head = context.written.run();
      head.place(0, body.subarray(0, 100_000));
      head.close();
      context.progress(body.length, body.length);
    });

    const started = await downloads(app).start({
      kind: "file",
      title: "A region",
      url: "placing://region",
      relPath: "region.bin",
      fetcher: "placing",
      allowedHosts: ["region"],
    });
    const row = await settled(app, started.id);
    expect(row.error).toBeNull();
    expect(row.state).toBe("completed");
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
    // The second time it found nothing there: the damaged file had been taken away.
    expect(found).toEqual([null, null]);
    const { events } = (await app.api("GET", `/api/downloads/${started.id}`)).body as DownloadDetail;
    expect(events.find((event) => event.state === "running" && event.detail)?.detail).toMatch(
      /did not read back the same, so the file is fetched again\.$/,
    );
  });

  it("is named as the fault when it loses the same file three times, and nothing is installed", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(3 * MEGABYTE, 33);
    server.routes.set("/atlas", { body });
    lossyStorage(Number.POSITIVE_INFINITY);

    const started = await downloads(app).start(request(server, "/atlas", "atlas.bin"));
    const row = await settled(app, started.id);
    expect(row.state).toBe("failed");
    expect(row.errorKind).toBe("storage_damaged");
    expect(row.error).toMatch(
      /is not keeping what is written to it: 3 times part of this file read back differently from what was written/,
    );
    expect(row.error).toMatch(/Nothing was installed and the file was deleted/);
    expect(row.attempts).toBe(1);
    expect(server.requests.filter((seen) => seen.method === "GET")).toHaveLength(3);
    expect(fs.existsSync(finalPath(app, row))).toBe(false);
    expect(fs.existsSync(`${finalPath(app, row)}.part`)).toBe(false);
    expect(app.ctx.services.collections.list()).toHaveLength(0);
  });
});

/**
 * A network share that remembers what was written better than it keeps it: the first Raspberry Pi's NAS share
 * (23 November 2026) gave a 2.29 GB country file back with Geofabrik's MD5 when it was checked, from the device's
 * memory of writing it, while the copy on the NAS was damaged. Here the stream the downloader writes through
 * writes the bytes as sent to the file (what an ordinary read gives) and a damaged copy beside it (what the
 * share holds), and a read from the storage itself is given the damaged copy.
 */
describe("a network share whose copy differs from what the device remembers writing", () => {
  const MEGABYTE = 1024 * 1024;
  const LOST = { from: MEGABYTE + 300_000, bytes: 4096 };
  const onShare = (file: string) => `${file}.on-share`;

  function forgetfulShare(times: number) {
    const open = fs.createWriteStream;
    let streams = 0;
    vi.spyOn(fs, "createWriteStream").mockImplementation(((file: fs.PathLike, options?: { flags?: string }) => {
      const real = open(file, options as never);
      if (!String(file).endsWith(".part")) return real;
      streams += 1;
      const lossy = streams <= times;
      const appending = options?.flags === "a" && fs.existsSync(file);
      let position = appending ? fs.statSync(file).size : 0;
      // The share's copy is cut back with the file when only the rest is fetched again.
      if (appending) fs.truncateSync(onShare(String(file)), position);
      const share = open(onShare(String(file)), { flags: appending ? "a" : "w" });
      return new Writable({
        write(chunk: Buffer, _encoding, done) {
          const [start, end] = [position, position + chunk.length];
          position = end;
          let kept = chunk;
          if (lossy && start < LOST.from + LOST.bytes && end > LOST.from) {
            kept = Buffer.from(chunk);
            kept.fill(0, Math.max(0, LOST.from - start), Math.min(chunk.length, LOST.from + LOST.bytes - start));
          }
          share.write(kept, () => real.write(chunk, done));
        },
        final(done) {
          share.end(() => real.end(done));
        },
      }) as never;
    }) as never);
    vi.spyOn(storageRead, "open").mockImplementation(async (file: string) => {
      const there = file.endsWith(".part") && fs.existsSync(onShare(file)) ? onShare(file) : file;
      return { handle: await fs.promises.open(there, "r"), direct: true };
    });
  }

  it("is checked as the share holds it, and the damaged part is fetched again before anything reads it", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(2 * MEGABYTE + 200_000, 41);
    server.routes.set("/country.osm.pbf", { body });
    const md5 = createHash("md5").update(body).digest("hex");
    forgetfulShare(1);
    const read: Buffer[] = [];
    downloads(app).registerInstaller(
      "extract",
      async ({ filePath }) => {
        read.push(fs.readFileSync(filePath));
        return undefined;
      },
      () => true,
    );

    const started = await downloads(app).start(request(server, "/country.osm.pbf", "country.osm.pbf", { kind: "extract", md5 }));
    const row = await settled(app, started.id);
    expect(row.error).toBeNull();
    expect(row.state).toBe("completed");
    // Caught by the read-back check, from the megabyte the damage is in: not by the MD5, not the whole file again.
    expect(server.requests.filter((seen) => seen.method === "GET").map((seen) => seen.range ?? "all of it")).toEqual([
      "all of it",
      `bytes=${MEGABYTE}-`,
    ]);
    const share = fs.readFileSync(onShare(`${finalPath(app, row)}.part`));
    expect(share.equals(body)).toBe(true);
    expect(read).toHaveLength(1);
    const { events } = (await app.api("GET", `/api/downloads/${started.id}`)).body as DownloadDetail;
    expect(events[3]!.detail).toMatch(/did not read back the same from 1\.05 MB on/);
  });

  it("writes a download to a network location in whole blocks, and carries on after a dropped connection", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(3 * MEGABYTE + 123_456, 43);
    server.routes.set("/country.osm.pbf", { body, dropAfterBytes: 1_500_000 });
    const share = path.join(app.dir, "storage", "nas");
    fs.mkdirSync(share, { recursive: true });
    const nas = await app.ctx.services.storage.add({ name: "NAS", path: share, kind: "network" });
    const ends: number[] = [];
    const write = fs.write;
    vi.spyOn(fs, "write").mockImplementation(((fd: number, buffer: Buffer, ...rest: unknown[]) => {
      ends.push(buffer.length);
      return (write as (...args: unknown[]) => void)(fd, buffer, ...rest);
    }) as never);

    const started = await downloads(app).start(
      request(server, "/country.osm.pbf", "country.osm.pbf", { locationId: nas.id, sha256: sha256(body) }),
    );
    const row = await settled(app, started.id);
    expect(row.error).toBeNull();
    expect(row.state).toBe("completed");
    expect(fs.readFileSync(finalPath(app, row)).equals(body)).toBe(true);
    const asked = server.requests.filter((seen) => seen.method === "GET").map((seen) => seen.range ?? "all of it");
    expect(asked[0]).toBe("all of it");
    // Whatever had arrived when the line was cut was written, and the rest asked for from there.
    expect(asked[1]).toBe("bytes=1500000-");
    // Every write ends on a megabyte boundary but the one at the cut and the last.
    let at = 0;
    const offBoundary: number[] = [];
    for (const size of ends) {
      at += size;
      if (at % MEGABYTE !== 0) offBoundary.push(at);
    }
    expect(offBoundary).toEqual([1_500_000, body.length]);
  });

  it("fails plainly, keeps nothing and reads nothing when the share keeps losing it", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(2 * MEGABYTE, 42);
    server.routes.set("/country.osm.pbf", { body });
    forgetfulShare(Number.POSITIVE_INFINITY);
    let installs = 0;
    downloads(app).registerInstaller(
      "extract",
      async () => {
        installs += 1;
        return undefined;
      },
      () => true,
    );

    const started = await downloads(app).start(request(server, "/country.osm.pbf", "country.osm.pbf", { kind: "extract" }));
    const row = await settled(app, started.id);
    expect(row.state).toBe("failed");
    expect(row.errorKind).toBe("storage_damaged");
    expect(installs).toBe(0);
    expect(fs.existsSync(finalPath(app, row))).toBe(false);
    expect(fs.existsSync(`${finalPath(app, row)}.part`)).toBe(false);
  });
});

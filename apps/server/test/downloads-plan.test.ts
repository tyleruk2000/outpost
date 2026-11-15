import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RateLimiter } from "../src/core/throttle.ts";
import { forecastQueue } from "../src/modules/downloads/plan.ts";
import type { DownloadRow, StartDownload } from "../src/modules/downloads/types.ts";
import { type FileServer, startFileServer, testBytes, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
const servers: FileServer[] = [];
afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const server of servers.splice(0)) await server.close();
});

async function fileServer(): Promise<FileServer> {
  const server = await startFileServer();
  servers.push(server);
  return server;
}
const request = (server: FileServer, route: string, relPath: string, extra: Partial<StartDownload> = {}): StartDownload => ({
  kind: "file",
  title: relPath,
  url: server.url(route),
  relPath,
  allowedHosts: [server.host],
  ...extra,
});

describe("the speed limit", () => {
  it("costs nothing when there is no limit", async () => {
    const limiter = new RateLimiter();
    const started = Date.now();
    for (let index = 0; index < 1000; index += 1) await limiter.take(1_000_000);
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("holds transfers to the configured rate, shared between them", async () => {
    const limiter = new RateLimiter();
    limiter.setLimit(100_000);
    const started = Date.now();
    // Two "transfers" taking turns: 40 kB in total at 100 kB/s is about 0.3 s of waiting
    // (the first chunk goes at once).
    await Promise.all([
      (async () => {
        for (let i = 0; i < 2; i += 1) await limiter.take(10_000);
      })(),
      (async () => {
        for (let i = 0; i < 2; i += 1) await limiter.take(10_000);
      })(),
    ]);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(700);
  });

  it("stops waiting when the transfer is cancelled, and forgets debt when the limit changes", async () => {
    const limiter = new RateLimiter();
    limiter.setLimit(1000);
    await limiter.take(1000);
    const controller = new AbortController();
    const waiting = limiter.take(50_000, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(waiting).rejects.toThrow("cancelled");
    limiter.setLimit(null);
    const started = Date.now();
    await limiter.take(10_000_000);
    expect(Date.now() - started).toBeLessThan(20);
  });

  it("slows a real download to roughly the limit set in Settings", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(600_000);
    server.routes.set("/big.bin", { body, chunkBytes: 16_384 });
    await app.api("PATCH", "/api/settings", { "downloads.rateLimitKbps": 300 });
    const started = Date.now();
    const row = await app.ctx.services.downloads.start(
      request(server, "/big.bin", "files/big.bin", { sha256: createHash("sha256").update(body).digest("hex") }),
    );
    await waitFor(() => app!.ctx.services.downloads.get(row.id)?.state === "completed", "the limited download", 15_000);
    const seconds = (Date.now() - started) / 1000;
    // 600 kB at 300 kB/s is two seconds; allow for the first chunk and for timer slack.
    expect(seconds).toBeGreaterThan(1.4);
    expect(seconds).toBeLessThan(5);
    const detail = (await app.api("GET", `/api/downloads/${row.id}`)).body;
    expect(detail.rateLimitBytesPerSecond).toBe(300_000);
    expect(detail.integrity.verified).toBe(true);
  });

  it("holds a small file to the limit even when the network delivers it in one piece", async () => {
    app = await createTestApp();
    const server = await fileServer();
    // Sent in a single write: on a fast link this reaches the downloader as one or two
    // large chunks, which a limit applied per chunk would let straight through.
    const body = testBytes(300_000, 3);
    server.routes.set("/small.bin", { body });
    await app.api("PATCH", "/api/settings", { "downloads.rateLimitKbps": 100 });
    const started = Date.now();
    const row = await app.ctx.services.downloads.start(
      request(server, "/small.bin", "files/small.bin", { sha256: createHash("sha256").update(body).digest("hex") }),
    );
    await waitFor(() => app!.ctx.services.downloads.get(row.id)?.state === "completed", "the limited small download", 15_000);
    const seconds = (Date.now() - started) / 1000;
    // 300 kB at 100 kB/s is three seconds.
    expect(seconds).toBeGreaterThan(2.4);
    expect(seconds).toBeLessThan(6);
  });
});

describe("forecasting the queue", () => {
  it("shares the speed between running transfers and starts the next when a slot frees", () => {
    const forecast = forecastQueue(
      [
        { id: "a", phase: "active", remainingBytes: 100 },
        { id: "b", phase: "active", remainingBytes: 300 },
        { id: "c", phase: "waiting", remainingBytes: 200 },
      ],
      { concurrency: 2, bytesPerSecond: 100 },
    );
    // a and b get 50/s each: a ends at 2 s. Then b (200 left) and c share: b ends at 6 s, c (0 left of 200 after 4 s at 50/s) at 6 s.
    expect(forecast).toEqual([
      { id: "a", startsInSeconds: 0, finishesInSeconds: 2 },
      { id: "b", startsInSeconds: 0, finishesInSeconds: 6 },
      { id: "c", startsInSeconds: 2, finishesInSeconds: 6 },
    ]);
  });

  it("gives no times when no speed is known, and none after an item of unknown size", () => {
    expect(forecastQueue([{ id: "a", phase: "active", remainingBytes: 100 }], { concurrency: 2, bytesPerSecond: null })).toEqual([
      { id: "a", startsInSeconds: 0, finishesInSeconds: null },
    ]);
    const forecast = forecastQueue(
      [
        { id: "a", phase: "active", remainingBytes: null },
        { id: "b", phase: "waiting", remainingBytes: 100 },
        { id: "c", phase: "waiting", remainingBytes: 100 },
      ],
      { concurrency: 1, bytesPerSecond: 100 },
    );
    expect(forecast.map((item) => item.finishesInSeconds)).toEqual([null, null, null]);
  });
});

describe("download details and the plan", () => {
  it("records what happened to a download, where it came from and how fast", async () => {
    app = await createTestApp();
    const mirror = await fileServer();
    const origin = await fileServer();
    const body = testBytes(400_000);
    mirror.routes.set("/files/manual.pdf", { body, chunkBytes: 20_000, delayMs: 60 });
    origin.routes.set("/manual.pdf", {
      body: Buffer.alloc(0),
      redirectTo: mirror.url("/files/manual.pdf").replace("127.0.0.1", "localhost"),
    });
    const sha = createHash("sha256").update(body).digest("hex");
    const row = await app.ctx.services.downloads.start(
      request(origin, "/manual.pdf", "files/manual.pdf", {
        sha256: sha,
        sizeBytes: body.length,
        title: "Field manual",
        meta: { publisher: "Example Press", license: "CC BY 4.0", version: "2026-01" },
      }),
    );
    // While it runs, speed readings accumulate.
    await waitFor(async () => (await app!.api("GET", `/api/downloads/${row.id}`)).body.speedHistory.length >= 1, "speed readings", 10_000);
    await waitFor(() => app!.ctx.services.downloads.get(row.id)?.state === "completed", "completion", 15_000);

    const { status, body: detail } = await app.api("GET", `/api/downloads/${row.id}`);
    expect(status).toBe(200);
    expect(detail.download).toMatchObject({ id: row.id, state: "completed", title: "Field manual" });
    expect(detail.source).toMatchObject({ requestedHost: "127.0.0.1", servedBy: "localhost", fetcher: "http" });
    expect(detail.integrity).toEqual({ sha256Expected: sha, sha256Actual: sha, verified: true });
    expect(detail.destination).toMatchObject({ locationName: "Internal storage", locationAvailable: true, relPath: "files/manual.pdf" });
    expect(detail.destination.freeBytes).toBeGreaterThan(0);
    expect(detail.about).toMatchObject({ publisher: "Example Press", license: "CC BY 4.0", version: "2026-01" });
    expect(detail.events.map((event: { state: string }) => event.state)).toEqual(["queued", "running", "verifying", "completed"]);
    expect(
      detail.events.every(
        (event: { at: number }, index: number, all: Array<{ at: number }>) => index === 0 || event.at >= all[index - 1]!.at,
      ),
    ).toBe(true);
    expect(detail.attempts).toMatchObject({ made: 1, nextAttemptAt: null });
    expect((await app.api("GET", "/api/downloads/nope")).status).toBe(404);
  });

  it("keeps the reason in the history when a download fails", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/gone.zim", { body: Buffer.alloc(0), status: 404 });
    const row = await app.ctx.services.downloads.start(request(server, "/gone.zim", "files/gone.zim"));
    await waitFor(() => app!.ctx.services.downloads.get(row.id)?.state === "failed", "the failure", 10_000);
    const detail = (await app.api("GET", `/api/downloads/${row.id}`)).body;
    const failed = detail.events.at(-1);
    expect(failed.state).toBe("failed");
    expect(failed.detail).toMatch(/no longer at this address/);
  });

  it("forecasts the queue and what it leaves free, and pauses and resumes everything at once", async () => {
    app = await createTestApp();
    await app.api("PATCH", "/api/settings", { "downloads.concurrency": 1, "downloads.rateLimitKbps": 50 });
    const server = await fileServer();
    for (const name of ["one", "two", "three"])
      server.routes.set(`/${name}.bin`, { body: testBytes(200_000, name.length), chunkBytes: 8_192 });
    const rows: DownloadRow[] = [];
    for (const name of ["one", "two", "three"])
      rows.push(
        await app.ctx.services.downloads.start(request(server, `/${name}.bin`, `files/${name}.bin`, { sizeBytes: 200_000, title: name })),
      );
    await waitFor(() => app!.ctx.services.downloads.get(rows[0]!.id)?.state === "running", "the first to start");

    const plan = (await app.api("GET", "/api/downloads/plan")).body;
    expect(plan).toMatchObject({
      concurrency: 1,
      rateLimitBytesPerSecond: 50_000,
      counts: { active: 1, waiting: 2, paused: 0, failed: 0 },
      unknownSizes: 0,
    });
    expect(plan.queue.map((item: { title: string; phase: string }) => [item.title, item.phase])).toEqual([
      ["one", "active"],
      ["two", "waiting"],
      ["three", "waiting"],
    ]);
    expect(plan.assumedBytesPerSecond).toBeGreaterThan(0);
    // With one slot they run one after another: each starts when the one before finishes.
    const [first, second, third] = plan.queue;
    expect(first.startsInSeconds).toBe(0);
    expect(second.startsInSeconds).toBe(first.finishesInSeconds);
    expect(third.startsInSeconds).toBe(second.finishesInSeconds);
    expect(plan.finishesInSeconds).toBe(third.finishesInSeconds);
    expect(plan.remainingBytes).toBeGreaterThan(400_000);
    const internal = plan.locations.find((location: { name: string }) => location.name === "Internal storage");
    expect(internal.pendingBytes).toBe(plan.remainingBytes);
    expect(internal.freeAfterBytes).toBe(internal.freeBytes - internal.pendingBytes);
    expect(internal.enough).toBe(true);

    const paused = await app.api("POST", "/api/downloads/pause-all");
    expect(paused.body.paused).toBe(3);
    await waitFor(() => rows.every((row) => app!.ctx.services.downloads.get(row.id)?.state === "paused"), "everything to pause");
    expect((await app.api("GET", "/api/downloads/plan")).body.counts).toMatchObject({ active: 0, waiting: 0, paused: 3 });

    await app.api("PATCH", "/api/settings", { "downloads.rateLimitKbps": 0, "downloads.concurrency": 3 });
    expect((await app.api("POST", "/api/downloads/resume-all")).body.resumed).toBe(3);
    await waitFor(
      () => rows.every((row) => app!.ctx.services.downloads.get(row.id)?.state === "completed"),
      "everything to finish",
      20_000,
    );
    expect((await app.api("GET", "/api/downloads/plan")).body.queue).toEqual([]);
  });

  it("warns when the queue will not fit on a location", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/a.bin", { body: testBytes(1000) });
    const location = app.ctx.services.storage.getDefault();
    // A paused download with an impossible size, inserted directly: start() would refuse it for lack of room.
    const { downloads } = await import("../src/db/schema.ts");
    app.ctx.db
      .insert(downloads)
      .values({
        id: "huge",
        kind: "file",
        title: "Everything",
        url: server.url("/a.bin"),
        locationId: location.id,
        relPath: path.join("files", "huge.bin"),
        state: "paused",
        totalBytes: Number.MAX_SAFE_INTEGER,
        receivedBytes: 0,
        meta: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    const plan = (await app.api("GET", "/api/downloads/plan")).body;
    const internal = plan.locations.find((item: { locationId: string }) => item.locationId === location.id);
    expect(internal.enough).toBe(false);
    expect(internal.freeAfterBytes).toBeLessThan(0);
  });
});

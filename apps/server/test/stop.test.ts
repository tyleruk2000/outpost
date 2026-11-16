/**
 * Stopping the server. The real entry point is started as its own process, because what
 * is being tested is whether that process ends: with a browser's live-events stream held
 * open, SIGTERM used to stop the server listening and leave the process up for good.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net, { type AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DRAIN_LIMIT_MS } from "../src/app.ts";
import { EXIT_LIMIT_MS } from "../src/core/stop.ts";
import { type FileServer, startFileServer, testBytes, unusedPort, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const serverDir = path.resolve(import.meta.dirname, "..");
const HEADERS = { "x-outpost-request": "1", "content-type": "application/json" };

interface Running {
  child: ChildProcess;
  origin: string;
  port: number;
  /** Settles when the process ends, with how it ended. */
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

const children: ChildProcess[] = [];
const servers: FileServer[] = [];
const dirs: string[] = [];
let app: TestApp | undefined;

afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await app?.close();
  app = undefined;
  for (const server of servers.splice(0)) await server.close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** The server as a person runs it: `node src/index.ts`, on a directory of its own. */
async function startServer(dir: string, env: Record<string, string> = {}): Promise<Running> {
  const port = await unusedPort();
  const child = spawn(process.execPath, ["src/index.ts"], {
    cwd: serverDir,
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
      OUTPOST_PORT: String(port),
      OUTPOST_HTTPS_PORT: "0",
      OUTPOST_DATA_DIR: path.join(dir, "data"),
      OUTPOST_STORAGE_ROOTS: path.join(dir, "storage"),
      OUTPOST_CATALOG_DIR: path.join(dir, "catalog"),
      OUTPOST_WEB_DIR: path.join(dir, "web"),
      OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "true",
      ...env,
    },
    stdio: "ignore",
  });
  children.push(child);
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const origin = `http://127.0.0.1:${port}`;
  await waitFor(
    async () => {
      if (child.exitCode !== null) throw new Error(`the server exited with ${child.exitCode} before it was ready`);
      return fetch(`${origin}/api/health`).then(
        (response) => response.ok,
        () => false,
      );
    },
    "the server to answer",
    30_000,
  );
  return { child, origin, port, exited };
}

/** What a browser tab does: opens the live-events stream and leaves it open. */
function holdEventsOpen(port: number): Promise<{ text(): string; ended(): boolean; destroy(): void }> {
  return new Promise((resolve, reject) => {
    let text = "";
    let ended = false;
    const request = http.get({ host: "127.0.0.1", port, path: "/api/events", headers: { accept: "text/event-stream" } }, (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        text += chunk;
      });
      response.on("end", () => {
        ended = true;
      });
      response.on("error", () => {});
      resolve({ text: () => text, ended: () => ended, destroy: () => request.destroy() });
    });
    request.on("error", reject);
  });
}

/** Ends the process the way `docker stop` and a stop script do, and says how long it took to go. */
async function stopAndTime(server: Running, send: () => void): Promise<{ code: number | null; signal: NodeJS.Signals | null; ms: number }> {
  const asked = performance.now();
  send();
  const outcome = await Promise.race([
    server.exited,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), EXIT_LIMIT_MS + 7_000).unref()),
  ]);
  if (!outcome) throw new Error(`the server was still running ${EXIT_LIMIT_MS + 7_000} ms after it was asked to stop`);
  return { ...outcome, ms: performance.now() - asked };
}

function partFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (folder: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".part")) found.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found;
}

describe("stopping the server process", () => {
  it("exits promptly on SIGTERM with a live-events stream open, and a download cut off by it resumes on the next start", async () => {
    const dir = tempDir("outpost-stop-");
    dirs.push(dir);
    const files = await startFileServer();
    servers.push(files);
    const body = testBytes(4_000_000, 21);
    files.routes.set("/manual.pdf", { body, chunkBytes: 16_384, delayMs: 25 });
    fs.mkdirSync(path.join(dir, "catalog", "manifests"), { recursive: true });
    fs.mkdirSync(path.join(dir, "storage"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "catalog", "manifests", "stop.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "stop-test",
        name: "Stop test",
        description: "A manifest for the stop test",
        maintainers: ["Tests"],
        downloadHosts: ["127.0.0.1"],
        entries: [
          {
            id: "stop.manual",
            name: "A manual",
            description: "A file that arrives slowly",
            category: "reference",
            publisher: "Test Press",
            language: "en",
            format: "pdf",
            license: "CC BY-SA 4.0",
            attribution: "Test Press contributors",
            lastVerified: "2026-11-15",
            source: { type: "http", url: files.url("/manual.pdf"), sha256: createHash("sha256").update(body).digest("hex") },
          },
        ],
      }),
    );

    // ── First run: a tab is open and a download is part-way through when the stop comes. ──
    const first = await startServer(dir);
    const tab = await holdEventsOpen(first.port);
    const started = await fetch(`${first.origin}/api/catalog/entries/stop.manual/download`, {
      method: "POST",
      headers: HEADERS,
      body: "{}",
    });
    expect(started.status).toBe(200);
    const downloadId = ((await started.json()) as { download: { id: string } }).download.id;
    const part = await waitFor(
      () => partFiles(path.join(dir, "storage")).find((file) => fs.statSync(file).size > 0),
      "the first bytes of the download to reach the disk",
    );

    const stopped = await stopAndTime(first, () => first.child.kill("SIGTERM"));
    expect(stopped).toMatchObject({ code: 0, signal: null });
    // Milliseconds on a quiet machine: the stream is told and ended at once, and the download lets go.
    // The bound is the one that matters, the limit after which the process would be ended uncleanly.
    expect(stopped.ms).toBeLessThan(EXIT_LIMIT_MS);
    expect(tab.text()).toContain("event: server.stopping");
    expect(tab.ended()).toBe(true);

    const partSize = fs.statSync(part).size;
    expect(partSize).toBeGreaterThan(0);
    expect(partSize).toBeLessThan(body.length);

    // ── Second run: the download carries on from the partial file, by itself. ──
    files.routes.set("/manual.pdf", { body });
    const second = await startServer(dir, { OUTPOST_SUPERVISED: "true" });
    const finished = await waitFor(
      async () => {
        const response = await fetch(`${second.origin}/api/downloads/${downloadId}`);
        const detail = (await response.json()) as { download: { state: string; relPath: string }; integrity?: { verified?: boolean } };
        return ["completed", "failed", "cancelled"].includes(detail.download.state) ? detail : undefined;
      },
      "the download to finish after the restart",
      30_000,
    );
    expect(finished.download.state).toBe("completed");
    expect(files.requests.at(-1)!.range).toBe(`bytes=${partSize}-`);
    expect(partFiles(path.join(dir, "storage"))).toEqual([]);

    // ── The server restarting itself goes the same way, with the asking tab's stream still open. ──
    const again = await holdEventsOpen(second.port);
    const restarted = await stopAndTime(second, () => {
      void fetch(`${second.origin}/api/system/restart`, { method: "POST", headers: HEADERS, body: "{}" }).catch(() => {});
    });
    // 75 is what the supervisors (the launcher, the container's restart policy) take as "start me again".
    expect(restarted).toMatchObject({ code: 75, signal: null });
    expect(restarted.ms).toBeLessThan(EXIT_LIMIT_MS);
    expect(again.text()).toContain("event: server.stopping");
  }, 120_000);
});

describe("closing the server with requests in flight", () => {
  it("gives a request that never finishes the limit and no longer, then cuts it", async () => {
    app = await createTestApp();
    await app.app.listen({ host: "127.0.0.1", port: 0 });
    const { port } = app.app.server.address() as AddressInfo;
    // A request whose body never arrives: the server is waiting for it, so the connection is not idle.
    const socket = net.connect(port, "127.0.0.1");
    let closed = false;
    socket.on("close", () => {
      closed = true;
    });
    socket.on("error", () => {});
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write(
      "PATCH /api/settings HTTP/1.1\r\nHost: localhost\r\nX-Outpost-Request: 1\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{",
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    const asked = performance.now();
    await app.app.close();
    const took = performance.now() - asked;
    expect(took).toBeGreaterThanOrEqual(DRAIN_LIMIT_MS - 100);
    expect(took).toBeLessThan(DRAIN_LIMIT_MS + 4_000);
    await waitFor(() => closed, "the unfinished connection to be closed");
    fs.rmSync(app.dir, { recursive: true, force: true });
    app = undefined;
  });

  it("does not wait at all when every request has been answered", async () => {
    app = await createTestApp();
    await app.app.listen({ host: "127.0.0.1", port: 0 });
    const { port } = app.app.server.address() as AddressInfo;
    expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200);
    const asked = performance.now();
    await app.app.close();
    // Had it waited out the limit, it would have taken that long at least.
    expect(performance.now() - asked).toBeLessThan(DRAIN_LIMIT_MS - 500);
    fs.rmSync(app.dir, { recursive: true, force: true });
    app = undefined;
  });
});

/**
 * A file larger than stated. A download says how big its file is (the catalogue's size, or
 * what the server's Content-Length says); a server that sends no length and goes on
 * sending must be stopped near that size, not left to fill the disk until the checksum
 * fails at the end. On every attempt: the first one's answer (no length) must not wipe
 * out what the download stated, or the retry takes whatever the server sends.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
let server: http.Server | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

describe("a server that sends more than the download said, with no length", () => {
  it("is stopped near the stated size on every attempt, and nothing is installed", async () => {
    let requests = 0;
    server = http.createServer((_request, response) => {
      requests += 1;
      // Chunked, no Content-Length, and the Range asked for ignored: 64 KB at a time, up to 8 MB, every time.
      // (The count is each answer's own. Shared, the second answer was only what the first had not
      // got into the socket's buffers, a few MB, and whether that passed the limit was down to timing.)
      let sent = 0;
      response.writeHead(200, { "content-type": "application/octet-stream" });
      const chunk = Buffer.alloc(64 * 1024, 7);
      const more = () => {
        while (sent < 8 * 1024 * 1024) {
          sent += chunk.length;
          if (!response.write(chunk)) return void response.once("drain", more);
        }
        response.end();
      };
      more();
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    app = await createTestApp();
    // Two attempts, so that the test waits for the end of both rather than for a moment in between.
    app.ctx.services.settings.update({ "downloads.maxAttempts": 2 });
    const downloads = app.ctx.services.downloads;
    const started = await downloads.start({
      kind: "file",
      title: "Stated as small",
      url: `http://127.0.0.1:${port}/file.bin`,
      relPath: "small.bin",
      allowedHosts: ["127.0.0.1"],
      sizeBytes: 100_000,
    });
    const row = await waitFor(
      () => {
        const found = downloads.get(started.id);
        return found && ["completed", "failed", "cancelled"].includes(found.state) ? found : undefined;
      },
      "the download to end",
      15_000,
    );
    expect(row).toMatchObject({ state: "failed", attempts: 2 });
    expect(requests).toBe(2);
    const target = app.ctx.services.storage.resolve(row.locationId, row.relPath);
    expect(fs.existsSync(target)).toBe(false);
    const part = `${target}.part`;
    expect(fs.existsSync(part) ? fs.statSync(part).size : 0).toBeLessThan(2 * 1024 * 1024);
  });
});

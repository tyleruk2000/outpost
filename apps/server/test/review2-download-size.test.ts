/**
 * A file larger than stated. A download says how big its file is (the catalogue's size, or
 * what the server's Content-Length says); a server that sends no length and goes on
 * sending must be stopped near that size, not left to fill the disk until the checksum
 * fails at the end.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { DownloadRow } from "../src/modules/downloads/types.ts";
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
  it("is stopped near the stated size, and nothing is installed", async () => {
    let sent = 0;
    server = http.createServer((_request, response) => {
      // Chunked, no Content-Length: 64 KB at a time, up to 8 MB.
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
        return found && (["completed", "failed", "cancelled"].includes(found.state) || found.attempts > 1) ? found : undefined;
      },
      "the download to stop",
      20_000,
    );
    if (row.state !== "completed" && row.state !== "failed") {
      try {
        await downloads.cancel(started.id);
      } catch {
        // Already over.
      }
    }
    const target = app.ctx.services.storage.resolve(row.locationId, row.relPath);
    expect(fs.existsSync(target)).toBe(false);
    expect((row as DownloadRow).state).not.toBe("completed");
    const part = `${target}.part`;
    expect(fs.existsSync(part) ? fs.statSync(part).size : 0).toBeLessThan(2 * 1024 * 1024);
  });
});

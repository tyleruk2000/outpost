import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { type FileServer, startFileServer, testBytes, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
const servers: FileServer[] = [];

afterEach(async () => {
  await app?.close();
  app = undefined;
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("a slow download from a server that hangs up on idle connections", () => {
  it("finishes in one attempt when the server has sent everything long before the limit lets it be read", async () => {
    app = await createTestApp();
    const server = await startFileServer();
    servers.push(server);
    // The server hands the whole file to the network at once and then, as Node's http
    // server does by default, closes a connection that has been idle for five seconds.
    const body = testBytes(3_000_000, 31);
    server.routes.set("/slow.bin", { body });
    await app.api("PATCH", "/api/settings", { "downloads.rateLimitKbps": 250 });
    const row = await app.ctx.services.downloads.start({
      kind: "file",
      title: "Slow",
      url: server.url("/slow.bin"),
      relPath: "files/slow.bin",
      sha256: createHash("sha256").update(body).digest("hex"),
      allowedHosts: [server.host],
    });
    await waitFor(
      () => ["completed", "failed"].includes(app!.ctx.services.downloads.get(row.id)?.state ?? ""),
      "the slow download",
      40_000,
    );
    const detail = (await app.api("GET", `/api/downloads/${row.id}`)).body;
    expect(detail.download.state).toBe("completed");
    expect(detail.integrity.verified).toBe(true);
    // No interruption in its history, and nothing asked for twice.
    expect(detail.events.map((event: { state: string }) => event.state)).toEqual(["queued", "running", "verifying", "completed"]);
    expect(server.requests.filter((seen) => seen.method === "GET").length).toBe(1);
  }, 60_000);
});

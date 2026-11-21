/**
 * Security review of the household board: what removal leaves behind, and how a sent
 * file is served.
 */
import fs from "node:fs";
import path from "node:path";
import type { BoardMessage } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
});
afterAll(async () => {
  await app.close();
});

describe("removing a message", () => {
  it("leaves none of its words in the database file", async () => {
    const secret = "door-code-is-48151623-under-the-pot";
    const posted = await app.api<{ message: BoardMessage }>("POST", "/api/board/messages", { author: "Sam", body: secret });
    expect(posted.status).toBe(200);
    const removed = await app.api("POST", `/api/board/messages/${posted.body.message.id}/remove`, { by: "Sam" });
    expect(removed.status).toBe(200);
    app.ctx.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const dir = app.ctx.config.dataDir;
    for (const name of fs.readdirSync(dir).filter((file) => file.startsWith("outpost.db"))) {
      expect(fs.readFileSync(path.join(dir, name)).includes(Buffer.from(secret)), name).toBe(false);
    }
  });
});

let nextAddress = 50;
function sendFile(name: string, content: Buffer | string, headers: Record<string, string> = {}) {
  const form = multipart({ author: "Sam" }, [{ name, content: Buffer.isBuffer(content) ? content : Buffer.from(content) }]);
  return app.api<{ message: BoardMessage }>("POST", "/api/board/files", undefined, {
    payload: form.payload,
    headers: { ...form.headers, ...headers },
    remoteAddress: `192.168.1.${nextAddress++}`,
  });
}

describe("a sent file", () => {
  it("loses its name when its message is removed, in the answer and in the database", async () => {
    const sent = (await sendFile("divorce-papers-2026.pdf", "%PDF-1.4 nothing")).body.message;
    const removed = await app.api<{ message: BoardMessage }>("POST", `/api/board/messages/${sent.id}/remove`, { by: "Sam" });
    expect(removed.status).toBe(200);
    expect(removed.body.message.file).toMatchObject({ name: "", gone: { reason: "removed" }, url: null });
    app.ctx.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const dir = app.ctx.config.dataDir;
    for (const name of fs.readdirSync(dir).filter((file) => file.startsWith("outpost.db"))) {
      expect(fs.readFileSync(path.join(dir, name)).includes(Buffer.from("divorce-papers-2026")), name).toBe(false);
    }
  });

  it("goes to the library only through the library's own checks, whatever its name claims", async () => {
    const html = "<html><script>fetch('/api/notes')</script></html>";
    for (const name of ["report.pdf", "book.epub", "photo.png", "song.mp3"]) {
      const sent = await sendFile(name, html);
      expect(sent.status, name).toBe(200);
      const added = await app.api("POST", `/api/board/files/${sent.body.message.file!.id}/library`, {});
      expect(added.status, `${name}: ${JSON.stringify(added.body)}`).toBeGreaterThanOrEqual(400);
    }
  });

  it("is answered with the download headers on a HEAD and a 304 as well", async () => {
    const sent = (await sendFile("page.html", "<script>alert(1)</script>")).body.message;
    const url = sent.file!.url!;
    const head = await app.app.inject({ method: "HEAD", url, headers: { host: "localhost" } });
    expect(head.headers["content-security-policy"]).toMatch(/^sandbox/);
    expect(head.headers["content-disposition"]).toMatch(/^attachment;/);
    const etag = String(head.headers.etag);
    const cached = await app.app.inject({ method: "GET", url, headers: { host: "localhost", "if-none-match": etag } });
    expect(cached.statusCode).toBe(304);
    expect(cached.headers["content-security-policy"]).toMatch(/^sandbox/);
  });

  it("from one address is counted as one, whatever X-Forwarded-For says", async () => {
    const from = { remoteAddress: "192.168.1.240" };
    let last = 0;
    for (let i = 0; i < 32; i++) {
      const answer = await app.api(
        "POST",
        "/api/board/messages",
        { author: "Sam", body: `n${i}` },
        {
          ...from,
          headers: { "x-forwarded-for": `10.0.0.${i}` },
        },
      );
      last = answer.status;
    }
    expect(last).toBe(429);
  });
});

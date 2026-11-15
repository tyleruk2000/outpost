import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("moving documents between storage locations", () => {
  let app: TestApp;
  let ssd: { id: string; path: string };
  let first: { id: string; relPath: string; locationId: string };

  async function addDocument(name: string, text: string) {
    const source = path.join(app.dir, name);
    fs.writeFileSync(source, text);
    const result = await app.ctx.services.documents.ingestFile({ sourcePath: source, originalName: name });
    await app.ctx.jobs.whenIdle();
    return result.document!;
  }

  beforeEach(async () => {
    app = await createTestApp();
    first = await addDocument("tides.md", "# Tide tables\n\nHigh water at Dover is at noon.");
    await addDocument("kit.txt", "Stove, gas, lighter.");
    ssd = (
      await app.api("POST", "/api/storage/locations", { name: "Field SSD", path: path.join(app.dir, "storage", "ssd"), kind: "external" })
    ).body.location;
  });
  afterEach(() => app.close());

  it("moves every document, keeps their ids, and removes the originals only after checking the copies", async () => {
    const before = app.ctx.services.documents.absolutePath(first.id);
    const started = await app.api("POST", "/api/documents/move", { locationId: ssd.id });
    expect(started.status).toBe(200);
    expect(started.body.documents).toBe(2);
    await app.ctx.jobs.whenIdle();
    const job = (await app.api("GET", `/api/jobs/${started.body.job.id}`)).body.job;
    expect(job).toMatchObject({ state: "succeeded", result: { moved: 2, left: [] } });

    const moved = (await app.api("GET", `/api/documents/${first.id}`)).body.document;
    expect(moved).toMatchObject({ id: first.id, locationId: ssd.id, relPath: first.relPath });
    expect(fs.existsSync(before)).toBe(false);
    expect(fs.readFileSync(path.join(ssd.path, first.relPath), "utf8")).toContain("Dover");
    // Search and the file itself still work from the new place.
    expect((await app.api("GET", "/api/search?q=dover ")).body.results[0].entityId).toBe(first.id);
    expect((await app.app.inject({ method: "GET", url: moved.fileUrl, headers: { host: "localhost" } })).statusCode).toBe(200);
    // Nothing left to move.
    expect((await app.api("POST", "/api/documents/move", { locationId: ssd.id })).status).toBe(409);
  });

  it("leaves a document whose file has changed exactly where it was, and says so", async () => {
    const original = app.ctx.services.documents.absolutePath(first.id);
    fs.writeFileSync(original, "tampered since it was added");
    const started = await app.api("POST", "/api/documents/move", { locationId: ssd.id });
    await app.ctx.jobs.whenIdle();
    const job = (await app.api("GET", `/api/jobs/${started.body.job.id}`)).body.job;
    expect(job.result.moved).toBe(1);
    expect(job.result.left).toEqual([{ title: expect.any(String), reason: expect.stringMatching(/no longer matches the checksum/) }]);
    expect(fs.readFileSync(original, "utf8")).toBe("tampered since it was added");
    expect(fs.existsSync(path.join(ssd.path, first.relPath))).toBe(false);
    expect(fs.existsSync(`${path.join(ssd.path, first.relPath)}.part`)).toBe(false);
    expect((await app.api("GET", `/api/documents/${first.id}`)).body.document.locationId).toBe(first.locationId);
  });

  it("needs a connected destination, and checks for room", async () => {
    expect((await app.api("POST", "/api/documents/move", { locationId: "nope" })).status).toBe(404);
    fs.renameSync(ssd.path, path.join(app.dir, "unplugged"));
    await app.api("POST", "/api/storage/refresh");
    expect((await app.api("POST", "/api/documents/move", { locationId: ssd.id })).status).toBe(503);
  });
});

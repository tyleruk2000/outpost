/**
 * The downloads list grows by a row with every download ever made. What has not finished
 * is always listed whole; finished downloads (the screen's history) come a page at a time.
 */
import { DOWNLOAD_HISTORY_PAGE, type DownloadHistoryResponse, type DownloadsResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { downloads } from "../src/db/schema.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
  const locationId = app.ctx.services.storage.getDefault().id;
  const row = (n: number, state: "queued" | "failed" | "completed" | "cancelled") => ({
    id: `d${String(n).padStart(3, "0")}`,
    kind: "file" as const,
    title: `Download ${n}`,
    url: "http://127.0.0.1:9/file",
    locationId,
    relPath: `files/${n}.bin`,
    state,
    meta: {},
    createdAt: 1_000 + n,
    updatedAt: 1_000 + n,
    // Finished in the opposite order to the one they were started in.
    finishedAt: state === "completed" || state === "cancelled" ? 10_000 - n : null,
  });
  const rows = [row(0, "queued"), row(1, "failed")];
  for (let n = 2; n < 2 + DOWNLOAD_HISTORY_PAGE + 20; n += 1) rows.push(row(n, n % 5 === 0 ? "cancelled" : "completed"));
  app.ctx.db.insert(downloads).values(rows).run();
});

afterAll(async () => {
  await app.close();
});

describe("the downloads list", () => {
  it("holds everything not finished and the newest page of history, and says how much history there is", async () => {
    const { body } = await app.api<DownloadsResponse>("GET", "/api/downloads");
    expect(body.historyTotal).toBe(DOWNLOAD_HISTORY_PAGE + 20);
    const states = body.downloads.map((download) => download.state);
    expect(states.filter((state) => state === "queued" || state === "failed")).toHaveLength(2);
    const finished = body.downloads.filter((download) => download.state === "completed" || download.state === "cancelled");
    expect(finished).toHaveLength(DOWNLOAD_HISTORY_PAGE);
    // The page is the most recently finished, which here are the first started.
    expect(Math.min(...finished.map((download) => download.finishedAt!))).toBe(10_000 - (2 + DOWNLOAD_HISTORY_PAGE - 1));
    // Newest first, as before.
    const created = body.downloads.map((download) => download.createdAt);
    expect(created).toEqual([...created].sort((a, b) => b - a));
  });

  it("gives older history a page at a time, most recently finished first, each once", async () => {
    const seen: string[] = [];
    for (let offset = 0; ; offset += 30) {
      const { body } = await app.api<DownloadHistoryResponse>("GET", `/api/downloads/history?offset=${offset}&limit=30`);
      expect(body.total).toBe(DOWNLOAD_HISTORY_PAGE + 20);
      expect(body.offset).toBe(offset);
      if (body.downloads.length === 0) break;
      const finishedAt = body.downloads.map((download) => download.finishedAt!);
      expect(finishedAt).toEqual([...finishedAt].sort((a, b) => b - a));
      seen.push(...body.downloads.map((download) => download.id));
    }
    expect(seen).toHaveLength(DOWNLOAD_HISTORY_PAGE + 20);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("refuses a page size it will not give", async () => {
    expect((await app.api("GET", "/api/downloads/history?limit=500")).status).toBe(400);
    expect((await app.api("GET", "/api/downloads/history?offset=-1")).status).toBe(400);
  });
});

/**
 * The built-in fetcher's backstops: a download whose size nobody states has a ceiling,
 * and a download started with `everyHop` hands that to the HTTP client on every request.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HttpClient, SafeFetchOptions } from "../src/core/http.ts";
import { PermanentJobError } from "../src/core/jobs.ts";
import { createHttpFetcher } from "../src/modules/downloads/http-fetcher.ts";
import type { FetchContext } from "../src/modules/downloads/types.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fakeClient(body: () => ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  const asked: SafeFetchOptions[] = [];
  const client: HttpClient = {
    async fetch(url, options = {}) {
      asked.push(options);
      return { response: new Response(body(), { status: 200, headers }), url };
    },
    close: async () => undefined,
  };
  return { client, asked };
}

/** A body that never stops: 64 kB chunks, for ever. */
const endless = () =>
  new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(64 * 1024));
    },
  });

function context(extra: Partial<FetchContext> = {}): FetchContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-fetch-"));
  dirs.push(dir);
  return {
    download: { url: "https://example.org/file", totalBytes: null, etag: null, lastModified: null } as FetchContext["download"],
    partPath: path.join(dir, "file.part"),
    allowedHosts: ["example.org"],
    signal: new AbortController().signal,
    throttle: async () => undefined,
    progress: () => undefined,
    remember: () => undefined,
    written: { cutTo: () => undefined, append: () => undefined, place: () => undefined } as unknown as FetchContext["written"],
    ...extra,
  };
}

describe("a download nobody states the size of", () => {
  it("is stopped for good at the ceiling, not left to fill the storage", async () => {
    const { client } = fakeClient(endless);
    const fetcher = createHttpFetcher(client, { unstatedMaxBytes: 1024 * 1024 });
    const ctx = context();
    const error = await fetcher(ctx).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect(String((error as Error).message)).toMatch(/states no size/);
    expect(fs.statSync(ctx.partPath).size).toBeLessThanOrEqual(1024 * 1024);
  });
});

describe("a download started with every hop held", () => {
  it("asks the HTTP client to hold every redirect to the hosts named", async () => {
    const bytes = new Uint8Array(10);
    const { client, asked } = fakeClient(() => new Response(bytes).body!, { "content-length": "10" });
    await createHttpFetcher(client)(context({ everyHop: true }));
    expect(asked[0]).toMatchObject({ everyHop: true, allowedHosts: ["example.org"] });
  });

  it("and one started without it lets mirrors redirect, as before", async () => {
    const { client, asked } = fakeClient(() => new Response(new Uint8Array(4)).body!, { "content-length": "4" });
    await createHttpFetcher(client)(context());
    expect(asked[0]?.everyHop).toBe(false);
  });
});

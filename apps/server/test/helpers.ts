import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InjectOptions } from "fastify";
import { type BuiltApp, buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";

export interface TestApp extends BuiltApp {
  dir: string;
  /** JSON request with the headers the web app sends. */
  // biome-ignore lint/suspicious/noExplicitAny: tests read response bodies loosely and assert on them
  api<T = any>(
    method: string,
    url: string,
    body?: unknown,
    extra?: Partial<InjectOptions>,
  ): Promise<{ status: number; body: T; headers: Record<string, unknown> }>;
  close(): Promise<void>;
}

/** A complete server on a throwaway data directory. Nothing touches the real one. */
export async function createTestApp(env: Record<string, string> = {}, existingDir?: string): Promise<TestApp> {
  const dir = existingDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "outpost-test-"));
  const config = loadConfig({
    NODE_ENV: "test",
    OUTPOST_DATA_DIR: path.join(dir, "data"),
    OUTPOST_STORAGE_ROOTS: path.join(dir, "storage"),
    OUTPOST_CATALOG_DIR: path.join(dir, "catalog"),
    OUTPOST_WEB_DIR: path.join(dir, "web"),
    OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "true",
    ...env,
  });
  fs.mkdirSync(path.join(dir, "storage"), { recursive: true });
  const built = await buildApp(config);
  await built.app.ready();
  return {
    ...built,
    dir,
    async api(method, url, body, extra = {}) {
      const response = await built.app.inject({
        method: method as "GET",
        url,
        payload: body as never,
        ...extra,
        headers: { host: "localhost", "x-outpost-request": "1", ...(extra.headers as object) },
      });
      let parsed: unknown = response.body;
      try {
        parsed = response.json();
      } catch {
        // Not JSON; leave the raw text.
      }
      return { status: response.statusCode, body: parsed as never, headers: response.headers };
    },
    async close() {
      await built.app.close();
      if (!existingDir) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

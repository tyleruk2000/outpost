import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InjectOptions } from "fastify";
import { type BuiltApp, buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { seedVoacapData } from "./voacap-data.ts";

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

/**
 * A complete server on a throwaway data directory. Nothing touches the real one.
 *
 * VOACAP's coefficients are put in its data directory from the tests' copy, when this
 * computer has one (`voacap-data.ts`); `{ voacapData: false }` starts it without them.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  existingDir?: string,
  options: { voacapData?: boolean } = {},
): Promise<TestApp> {
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
  if (options.voacapData !== false) seedVoacapData(config.dataDir);
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

/**
 * Puts jobs in the queue that are not due for an hour, so nothing runs them: for tests
 * of what a module does while work of some kind is waiting. Each is newer than the last.
 */
export function queueWaitingJobs(app: TestApp, type: string, count: number): string[] {
  const insert = app.ctx.sqlite.prepare(
    "INSERT INTO jobs (id, type, queue, state, title, payload, run_after, created_at, updated_at) VALUES (?, ?, 'test-waiting', 'queued', ?, '{}', ?, ?, ?)",
  );
  const ids: string[] = [];
  const now = Date.now();
  for (let n = 0; n < count; n++) {
    const id = `waiting-${type}-${now}-${n}`;
    insert.run(id, type, `Waiting ${n}`, now + 3_600_000, now + n, now + n);
    ids.push(id);
  }
  return ids;
}

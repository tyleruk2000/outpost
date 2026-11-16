import fs from "node:fs";
import { test as base, expect, type Page, type Request } from "@playwright/test";

export interface OfflineGuard {
  /** Requests the page tried to make to anything other than this Outpost. */
  external: string[];
}

/**
 * Every test runs with the internet cut off: any request that is not to the Outpost
 * under test is aborted and recorded. A test passes only if nothing was attempted, so
 * a stray CDN font or analytics call anywhere in the app fails the suite.
 */
export const test = base.extend<{ sealed: OfflineGuard }>({
  sealed: [
    async ({ page }, use) => {
      const guard: OfflineGuard = { external: [] };
      await page.route("**/*", (route, request: Request) => {
        const url = new URL(request.url());
        const local = ["localhost", "127.0.0.1"].includes(url.hostname) || ["data:", "blob:", "about:"].includes(url.protocol);
        if (local) return route.continue();
        guard.external.push(request.url());
        return route.abort("internetdisconnected");
      });
      await use(guard);
      expect(guard.external, "the app tried to reach the internet").toEqual([]);
      expect(ollamaAttempts(), "the server under test tried to reach the address a real Ollama listens on").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Connections the servers under test tried to make to the port a real Ollama listens on,
 * since this was last asked. They were refused (see tools/no-ollama.mjs); none should be tried.
 */
export function ollamaAttempts(): string[] {
  const file = process.env.OUTPOST_E2E_OLLAMA_ATTEMPTS;
  if (!file || !fs.existsSync(file)) return [];
  const made = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  fs.rmSync(file, { force: true });
  return made;
}

/** Fails the test on any uncaught error or console error in the page. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Calls the API the way the app does. */
// biome-ignore lint/suspicious/noExplicitAny: tests read response bodies loosely and assert on them
export async function api<T = any>(page: Page, method: string, url: string, body?: unknown): Promise<T> {
  const response = await page.request.fetch(url, {
    method,
    headers: { "X-Outpost-Request": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.ok(), `${method} ${url} -> ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

/**
 * Moves every page to the trash. Tests that drag pages about need a short tree: pages
 * left by earlier tests make it long enough to scroll under the pointer, which is not
 * what those tests are about.
 */
export async function clearPages(page: Page): Promise<void> {
  for (const note of (await api(page, "GET", "/api/notes/tree")).notes as Array<{ id: string; parentId: string | null }>) {
    if (note.parentId === null) await api(page, "DELETE", `/api/notes/${note.id}`);
  }
}

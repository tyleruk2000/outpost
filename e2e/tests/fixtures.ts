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
    },
    { auto: true },
  ],
});

export { expect };

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
export async function api<T = any>(page: Page, method: string, url: string, body?: unknown): Promise<T> {
  const response = await page.request.fetch(url, {
    method,
    headers: { "X-Outpost-Request": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.ok(), `${method} ${url} -> ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

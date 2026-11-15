/**
 * End-to-end tests run a real browser against the real server.
 *
 * Two servers are started on throwaway data directories:
 *   - "open": the default single-user setup, bound to localhost with sign-in off;
 *   - "signin": the same app with sign-in required, as on a LAN.
 *
 * By default they run the packaged app (dist/app), so the bundle that ships is the
 * thing under test. Set OUTPOST_E2E_SOURCE=1 to run the server from source instead
 * (the web app must have been built).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const fromSource = process.env.OUTPOST_E2E_SOURCE === "1";
const entry = fromSource ? path.join(root, "apps/server/src/index.ts") : path.join(root, "dist/app/server/outpost.mjs");
if (!fs.existsSync(entry)) {
  throw new Error(`${entry} does not exist. Run \`node scripts/build-app.mjs\` first, or set OUTPOST_E2E_SOURCE=1.`);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-e2e-"));
process.env.OUTPOST_E2E_WORK = work;

function server(name: string, port: number, env: Record<string, string>) {
  const dir = path.join(work, name);
  return {
    command: `node "${entry}"`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NODE_ENV: "production",
      OUTPOST_PORT: String(port),
      OUTPOST_DATA_DIR: path.join(dir, "data"),
      OUTPOST_STORAGE_ROOTS: path.join(dir, "storage"),
      OUTPOST_LOG_LEVEL: "warn",
      ...(fromSource ? { OUTPOST_WEB_DIR: path.join(root, "apps/web/dist") } : {}),
      ...env,
    },
  };
}

export const OPEN_URL = "http://localhost:8471";
export const SIGNIN_URL = "http://localhost:8472";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: OPEN_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `node "${path.join(import.meta.dirname, "tools/fake-dist.mjs")}" 8473`,
      url: "http://127.0.0.1:8473/health",
      reuseExistingServer: false,
    },
    // The open server fetches portable-drive runtimes from the stand-in above, which is on a private address.
    server("open", 8471, { OUTPOST_NODE_DIST_URL: "http://127.0.0.1:8473", OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "true" }),
    server("signin", 8472, { OUTPOST_AUTH: "on" }),
  ],
});

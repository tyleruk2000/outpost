/**
 * End-to-end tests run a real browser against the real server.
 *
 * A server is started on a throwaway data directory, bound to localhost.
 *
 * By default they run the packaged app (dist/app), so the bundle that ships is the
 * thing under test. Set OUTPOST_E2E_SOURCE=1 to run the server from source instead
 * (the web app must have been built).
 */
import { createHash } from "node:crypto";
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

// Two suites on one machine (two checkouts, say) need ports of their own.
const port = Number(process.env.OUTPOST_E2E_PORT ?? 8471);
const filesPort = Number(process.env.OUTPOST_E2E_FILES_PORT ?? 8473);
// The stand-in for a local model server (not a language model; see apps/server/test/model-server.ts).
const modelPort = Number(process.env.OUTPOST_E2E_MODEL_PORT ?? filesPort + 1);
process.env.OUTPOST_E2E_MODEL_URL = `http://127.0.0.1:${modelPort}`;

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

// A catalogue entry of the tests' own, pointing at the stand-in file server, so that a
// download can be followed end to end with the internet cut off.
const fieldManual = Buffer.alloc(300_000, "A field manual for end-to-end tests. ");
const ownCatalog = path.join(work, "open", "data", "catalog");
fs.mkdirSync(ownCatalog, { recursive: true });
fs.writeFileSync(
  path.join(ownCatalog, "e2e.json"),
  JSON.stringify({
    schemaVersion: 1,
    id: "e2e-local",
    name: "End-to-end test files",
    description: "One file served by the test suite itself.",
    maintainers: ["Outpost tests"],
    downloadHosts: ["127.0.0.1"],
    entries: [
      {
        id: "e2e.field-manual",
        name: "Field manual for testing",
        description: "A file the end-to-end tests serve to themselves.",
        category: "reference",
        publisher: "Outpost tests",
        language: "en",
        format: "other",
        license: "Public domain",
        attribution: "Outpost tests",
        lastVerified: "2026-11-15",
        source: {
          type: "http",
          url: `http://127.0.0.1:${filesPort}/files/field-manual.bin`,
          sha256: createHash("sha256").update(fieldManual).digest("hex"),
          sizeBytes: fieldManual.length,
          version: "1",
        },
      },
    ],
  }),
);

export const OPEN_URL = `http://localhost:${port}`;

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
    // The app's service worker keeps a copy of the app for when the server is out of reach, and answers
    // the app's own files from it. That would hide those requests from the tests' guards and stand-ins, and
    // every test would first copy the app again. It is switched on only where it is the thing under test
    // (kept.mobile.spec.ts), which brings a server and a guard of its own.
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `node "${path.join(import.meta.dirname, "tools/fake-dist.mjs")}" ${filesPort}`,
      url: `http://127.0.0.1:${filesPort}/health`,
      reuseExistingServer: false,
    },
    {
      command: `node "${path.join(root, "apps/server/test/model-server.ts")}" ${modelPort}`,
      url: `http://127.0.0.1:${modelPort}/health`,
      reuseExistingServer: false,
      env: { STAND_IN_LONG_DELAY_MS: "40" },
    },
    // The open server fetches portable-drive runtimes from the stand-in above, which is on a private address.
    server("open", port, { OUTPOST_NODE_DIST_URL: `http://127.0.0.1:${filesPort}`, OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "true" }),
  ],
});

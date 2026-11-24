/**
 * The server stopping while a phone has Outpost open (owner's review, 24 Nov 2026): nothing on a phone's screen used to
 * change, and a screen that could not be fetched stayed broken after the server came back until Reload was pressed.
 * Now a line says Outpost cannot be reached within a few seconds, More carries the same mark, and when the server
 * answers again everything comes back by itself.
 *
 * The spec brings a server of its own, killed outright as a server that has lost power would be, and started again.
 */
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { expect, test } from "./fixtures";

const root = path.resolve(import.meta.dirname, "../..");
const fromSource = process.env.OUTPOST_E2E_SOURCE === "1";
const entry = fromSource ? path.join(root, "apps/server/src/index.ts") : path.join(root, "dist/app/server/outpost.mjs");
const port = Number(process.env.OUTPOST_E2E_STOPPED_PORT ?? Number(process.env.OUTPOST_E2E_PORT ?? 8471) + 13);
const work = path.join(process.env.OUTPOST_E2E_WORK!, "stopped");

test.use({ baseURL: `http://localhost:${port}` });

let server: ChildProcess | undefined;

async function answers(): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1_000) })).ok;
  } catch {
    return false;
  }
}

async function startServer(): Promise<void> {
  server = spawn("node", [entry], {
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      OUTPOST_PORT: String(port),
      OUTPOST_DATA_DIR: path.join(work, "data"),
      OUTPOST_STORAGE_ROOTS: path.join(work, "storage"),
      OUTPOST_LOG_LEVEL: "warn",
      NODE_OPTIONS: process.env.OUTPOST_E2E_SERVER_NODE_OPTIONS ?? "",
      ...(fromSource ? { OUTPOST_WEB_DIR: path.join(root, "apps/web/dist") } : {}),
    },
  });
  await expect.poll(answers, { timeout: 30_000, message: "the spec's own server should start" }).toBe(true);
}

async function stopServer(): Promise<void> {
  const running = server;
  server = undefined;
  if (!running || running.exitCode !== null) return;
  const gone = new Promise((resolve) => running.once("exit", resolve));
  running.kill("SIGKILL");
  await gone;
  await expect.poll(answers, { message: "the spec's own server should stop" }).toBe(false);
}

test.afterAll(stopServer);

test("a stopped server is said on a phone within seconds, and the app comes back by itself when it answers", async ({ page }) => {
  test.setTimeout(120_000);
  await startServer();
  await page.goto("/prepare/checks");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const more = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /^More/ });
  await expect(more).toHaveAccessibleName("More");

  await stopServer();
  const line = page.getByRole("status").filter({ hasText: "Can't reach Outpost." });
  await expect(line).toBeVisible({ timeout: 5_000 });
  await expect(line).toBeInViewport({ ratio: 1 });
  await expect(more).toHaveAccessibleName(/^More ?, the server is not responding$/);
  await page.screenshot({ path: test.info().outputPath("stopped.png") });

  // A screen not fetched yet cannot be shown, and says why.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "This screen could not be loaded" })).toBeVisible();
  await expect(page.getByText(/server cannot be reached, so this screen could not be fetched/)).toBeVisible();

  // Back: nothing pressed, and the screen asked for opens.
  await startServer();
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible({ timeout: 15_000 });
  await expect(line).toHaveCount(0);
  await expect(more).toHaveAccessibleName("More");
});

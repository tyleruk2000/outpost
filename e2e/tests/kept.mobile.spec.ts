/**
 * Keeping things on a phone, and the phone then losing the server.
 *
 * This is the one spec that runs with the app's service worker switched on, and the one
 * that takes the server away. It therefore brings a server of its own, started and
 * stopped here: stopping the process is what "out of reach" is, with no stand-in for it.
 * A second build of the web app is made part of the way through, to check that a phone
 * holding the old app moves on to the new one.
 *
 * What it cannot check is a real phone: Safari on an iPhone, the Home Screen, and what
 * iOS does with a site's storage over days. See docs/offline.md for what is known of those.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { api, expect, test } from "./fixtures";

const root = path.resolve(import.meta.dirname, "../..");
const fromSource = process.env.OUTPOST_E2E_SOURCE === "1";
const entry = fromSource ? path.join(root, "apps/server/src/index.ts") : path.join(root, "dist/app/server/outpost.mjs");
const port = Number(process.env.OUTPOST_E2E_KEPT_PORT ?? Number(process.env.OUTPOST_E2E_PORT ?? 8471) + 6);
const origin = `http://localhost:${port}`;
const work = path.join(process.env.OUTPOST_E2E_WORK!, "kept");
const storage = path.join(work, "storage");

test.use({ baseURL: origin, serviceWorkers: "allow" });

let server: ChildProcess | undefined;

async function answers(): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1_000) })).ok;
  } catch {
    return false;
  }
}

async function startServer(webDir?: string): Promise<void> {
  server = spawn("node", [entry], {
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      OUTPOST_PORT: String(port),
      OUTPOST_DATA_DIR: path.join(work, "data"),
      OUTPOST_STORAGE_ROOTS: storage,
      OUTPOST_LOG_LEVEL: "warn",
      // The same guard as the suite's own server: this one may not reach a real Ollama either.
      NODE_OPTIONS: process.env.OUTPOST_E2E_SERVER_NODE_OPTIONS ?? "",
      ...(webDir ? { OUTPOST_WEB_DIR: webDir } : fromSource ? { OUTPOST_WEB_DIR: path.join(root, "apps/web/dist") } : {}),
    },
  });
  await expect.poll(answers, { timeout: 30_000, message: "the spec's own server should start" }).toBe(true);
}

async function stopServer(): Promise<void> {
  const running = server;
  server = undefined;
  if (!running || running.exitCode !== null) return;
  const gone = new Promise((resolve) => running.once("exit", resolve));
  // Killed outright, as a server that has lost power or a phone that has left the house would have it. A polite
  // stop would also wait for this very browser to let go of its live-updates connection before the process ended.
  running.kill("SIGKILL");
  await gone;
  await expect.poll(answers, { message: "the spec's own server should stop" }).toBe(false);
}

test.afterAll(stopServer);

/** The same promise the other specs make, for requests the service worker makes too. */
async function sealContext(context: BrowserContext): Promise<string[]> {
  const external: string[] = [];
  await context.route("**/*", (route, request) => {
    const url = new URL(request.url());
    if (["localhost", "127.0.0.1"].includes(url.hostname) || ["data:", "blob:", "about:"].includes(url.protocol)) return route.fallback();
    external.push(request.url());
    return route.abort("internetdisconnected");
  });
  return external;
}

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...texts: string[]) => ({ type: "doc", content: texts.map(paragraph) });

/** The names of the caches this browser holds for the app. */
const cacheNames = (page: Page) => page.evaluate(() => caches.keys());
const banner = (page: Page) => page.getByRole("status").filter({ hasText: "The server is out of reach" });

test("keeps a page, a route and a map area on a phone, and opens them with the server gone", async ({ page, context }) => {
  test.setTimeout(240_000);
  const external = await sealContext(context);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await startServer();

  // ── At home: something to keep, something left behind, and a map ──
  const plan = (await api(page, "POST", "/api/notes", { title: "Field plan", content: doc("Leave the car at Seathwaite by seven.") })).note;
  const dayTwo = (
    await api(page, "POST", "/api/notes", { parentId: plan.id, title: "Day two", content: doc("Down by the corridor route.") })
  ).note;
  const leftBehind = (await api(page, "POST", "/api/notes", { title: "Left at home", content: doc("Not needed on the hill.") })).note;
  const { track } = await api(page, "POST", "/api/maps/tracks", {
    name: "Seathwaite round",
    points: [
      { lat: 54.5, lon: -3.18 },
      { lat: 54.47, lon: -3.2 },
      { lat: 54.454, lon: -3.211 },
    ],
  });
  await api(page, "POST", "/api/maps/markers", { name: "Styhead Tarn", lat: 54.476, lon: -3.2, note: "Water here." });
  const { locations } = await api(page, "GET", "/api/storage/locations");
  execFileSync("node", [path.join(root, "e2e/tools/small-map.mjs"), path.join(locations[0].path, "imports/small.pmtiles")]);
  await api(page, "POST", "/api/maps/import", { locationId: locations[0].id, relPath: "imports/small.pmtiles", name: "Small map" });

  // ── The app keeps itself ──
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { message: "the service worker should take charge" })
    .toBe(true);
  const firstShell = (await cacheNames(page)).filter((name) => name.startsWith("outpost-shell:"));
  expect(firstShell).toHaveLength(1);

  // The manifest and its icons are the app's own files, and the page names them.
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Outpost", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  // The worker script itself is never served from a cache.
  expect((await page.request.get("/sw.js")).headers()["cache-control"]).toBe("no-cache");

  // ── Keeping a page: the page inside it comes too ──
  await page.goto(`/notes/${plan.id}`);
  await page.getByRole("button", { name: "Page actions" }).click();
  await page.getByRole("menuitem", { name: "Keep on this phone" }).click();
  await expect(page.getByText("“Field plan” and the 1 page inside it are kept on this phone")).toBeVisible();

  // ── Keeping a route and the saved places ──
  await page.goto(`/maps?track=${track.id}`);
  await page.getByRole("button", { name: "Keep on this phone" }).click();
  await expect(page.getByText("“Seathwaite round” is kept on this phone")).toBeVisible();
  await page.getByRole("tab", { name: /Places/ }).click();
  await page.getByRole("button", { name: "Keep on this phone" }).click();
  await expect(page.getByText("1 saved place kept on this phone")).toBeVisible();

  // ── Keeping the part of the map in view: measured first, then fetched ──
  await page.goto("/maps?lat=54.5&lon=-3.1&z=8");
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Offline maps" }).click();
  const areas = page.getByRole("region", { name: "Map areas on this phone" });
  await areas.getByRole("button", { name: "Measure the area in view" }).click();
  await expect(areas.getByText(/^about \d/)).toBeVisible();
  await areas.getByRole("textbox", { name: "A name for this area" }).fill("Borrowdale");
  await areas.getByRole("button", { name: "Keep this area" }).click();
  // Fetching runs in this tab; it says when it has finished.
  await expect(page.getByText("“Borrowdale” is kept on this phone")).toBeVisible({ timeout: 30_000 });

  // ── "On this phone" lists all four, with sizes ──
  await page.goto("/kept");
  await expect(page.getByRole("heading", { name: "On this phone", level: 1 })).toBeVisible();
  for (const name of ["Field plan", "Seathwaite round", "Saved places", "Borrowdale"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText("With the 1 page inside it")).toBeVisible();
  await expect(page.getByText(/zoom 0 to 9, \d+ tiles/)).toBeVisible();
  await expect(page.getByText(/Not finished/)).toBeHidden();
  await expect(page.getByText(/What you have kept takes \d/)).toBeVisible();

  // What was stored for the area: tiles still gzipped, the lettering their names need, and the map's icons.
  const stored = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith("outpost-kept:area:"))!;
    const cache = await caches.open(name);
    const paths = (await cache.keys()).map((request) => new URL(request.url).pathname);
    const tile = await cache.match(paths.find((item) => item.startsWith("/api/maps/tiles/9/"))!);
    return { paths, encoding: tile?.headers.get("X-Outpost-Tile-Encoding") };
  });
  expect(stored.encoding).toBe("gzip");
  expect(stored.paths.filter((item) => item.startsWith("/api/maps/tiles/")).length).toBeGreaterThanOrEqual(10);
  expect(stored.paths).toContain("/map-assets/fonts/Noto%20Sans%20Regular/0-255.pbf");
  // "Łąka" is in the second range of 256 characters; the tiles say so, and that range came too.
  expect(stored.paths).toContain("/map-assets/fonts/Noto%20Sans%20Regular/256-511.pbf");
  expect(stored.paths).toContain("/map-assets/sprites/v4/light.json");
  // Nothing of the API is in the app's own cache.
  const shellPaths = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith("outpost-shell:"))!;
    return (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname);
  });
  expect(shellPaths).toContain("/index.html");
  expect(shellPaths.filter((item) => item.startsWith("/api/") || item.startsWith("/kiwix/"))).toEqual([]);

  // ── Out of reach ──
  await stopServer();
  await page.reload();
  await expect(banner(page)).toBeVisible({ timeout: 20_000 });
  await expect(banner(page)).toContainText("Showing what is kept on this phone");
  await expect(page.getByRole("heading", { name: "On this phone", level: 1 })).toBeVisible();

  // The kept page opens, cannot be written in, and leads to the page inside it.
  await page.getByRole("link", { name: "Field plan", exact: true }).click();
  await expect(page.getByText("Leave the car at Seathwaite by seven.")).toBeVisible();
  await expect(page.getByText(/Kept copy from/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Page content" })).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveJSProperty("readOnly", true);
  await page.getByRole("link", { name: "Day two" }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${dayTwo.id}$`));
  await expect(page.getByText("Down by the corridor route.")).toBeVisible();

  // A page that was not kept says so, at once, instead of loading or failing.
  await page.goto(`/notes/${leftBehind.id}`);
  await expect(page.getByRole("heading", { name: "This page is not kept on this phone" })).toBeVisible();
  await expect(banner(page)).toBeVisible();
  // So does a screen that lives on the server.
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "The library needs the server" })).toBeVisible();

  // The map draws from the kept tiles; the route and the place are on it.
  await page.goto("/maps");
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Panel height/ }).click();
  await expect(page.getByRole("button", { name: /Borrowdale/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Seathwaite round/ })).toBeVisible();
  await page.getByRole("button", { name: /Styhead Tarn/ }).click();
  await expect(page.getByText("Water here.").first()).toBeVisible();
  const tiles = await page.evaluate(async () => {
    const kept = await fetch("/api/maps/tiles/9/251/163.mvt?v=whatever");
    const bytes = new Uint8Array(await kept.arrayBuffer());
    const elsewhere = await fetch("/api/maps/tiles/9/10/10.mvt");
    const api = await fetch("/api/maps/markers").then(
      (response) => response.status,
      () => "failed",
    );
    return { kept: kept.status, firstByte: bytes[0], text: new TextDecoder().decode(bytes), elsewhere: elsewhere.status, api };
  });
  // A kept tile comes back unpacked, as the map expects; outside the kept box there is "no tile here", not an error.
  expect(tiles.kept).toBe(200);
  expect(tiles.firstByte).toBe(0x1a);
  expect(tiles.text).toContain("Łąka 9/251/163");
  expect(tiles.elsewhere).toBe(204);
  // And the worker has not started answering for the API.
  expect(tiles.api).toBe("failed");

  // ── Back in reach: a page changed at home replaces the kept copy ──
  await startServer();
  await api(page, "PATCH", `/api/notes/${plan.id}`, { content: doc("Leave the car at Seatoller instead: the road is closed.") });
  await page.goto("/kept");
  await expect(page.getByRole("heading", { name: "On this phone", level: 1 })).toBeVisible();
  await expect(banner(page)).toBeHidden({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const copy = await (await caches.open(`outpost-kept:note:${id}`)).match(`/api/notes/${id}`);
          return JSON.stringify(await copy?.json());
        }, plan.id),
      { timeout: 20_000, message: "the kept copy should be replaced by the server's version" },
    )
    .toContain("Seatoller");
  await stopServer();
  await page.reload();
  await expect(banner(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Field plan", exact: true }).click();
  await expect(page.getByText("Leave the car at Seatoller instead: the road is closed.")).toBeVisible();

  // ── A new build of Outpost replaces the kept app ──
  const nextWeb = path.join(work, "next-web");
  execFileSync("node", [path.join(root, "e2e/tools/next-build.mjs"), nextWeb], { stdio: "ignore" });
  const nextEntry = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(fs.readFileSync(path.join(nextWeb, "index.html"), "utf8"))![1]!;
  expect(firstShell[0]).not.toContain(nextEntry);
  await startServer(nextWeb);
  // In reach, a page is always asked of the server: the reload gets the new build, whatever the worker holds.
  await page.goto("/kept");
  await expect(page.getByRole("heading", { name: "On this phone", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as { __outpostNextBuild?: boolean }).__outpostNextBuild)).toBe(true);
  expect(await page.evaluate(() => document.querySelector<HTMLScriptElement>('script[type="module"]')?.src)).toContain(nextEntry);
  await expect(page.getByText("Outpost has been updated")).toBeHidden();
  // The new worker takes over from the old one, and the old copy of the app is thrown away.
  await expect
    .poll(async () => (await cacheNames(page)).filter((name) => name.startsWith("outpost-shell:")), {
      timeout: 30_000,
      message: "only the new build's copy of the app should remain",
    })
    .toEqual([expect.stringContaining(nextEntry)]);
  // What was kept on purpose is untouched by the change of build.
  expect((await cacheNames(page)).filter((name) => name.startsWith("outpost-kept:")).length).toBe(4);

  // The server goes while the app is open: the screen that is open stays, and says what will happen next.
  await stopServer();
  await expect(page.getByRole("status").filter({ hasText: "This screen stays as it is" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "On this phone", level: 1 })).toBeVisible();
  // The next screen comes from what is kept, without a reload.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Maps" }).click();
  await expect(banner(page)).toBeVisible();
  await expect(page.locator('.outpost-map[data-map-idle="true"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "On this phone" }).click();
  await expect(page.getByRole("link", { name: "Field plan", exact: true })).toBeVisible();

  // Opened afresh with the server still gone, it is the new app that opens.
  await page.reload();
  await expect(banner(page)).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => (globalThis as { __outpostNextBuild?: boolean }).__outpostNextBuild)).toBe(true);
  await expect(page.getByRole("link", { name: "Field plan", exact: true })).toBeVisible();

  // ── Removing a kept thing removes all of it from the phone ──
  await page.getByRole("button", { name: "Remove Borrowdale from this phone" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove from this phone" }).click();
  await expect(page.getByRole("link", { name: "Borrowdale", exact: true })).toBeHidden();
  expect((await cacheNames(page)).filter((name) => name.startsWith("outpost-kept:area:"))).toEqual([]);

  expect(pageErrors).toEqual([]);
  expect(external, "the app or its service worker tried to reach the internet").toEqual([]);
});

/**
 * What a screen costs while nobody is touching it: the processor time the page and the
 * server use, and what keeps them awake (requests, timers, animation frames, running
 * animations). Outpost is meant to sit open on a low-power machine for days, so an idle
 * screen should cost close to nothing.
 *
 *   cd e2e && node tools/idle-cost.mjs --base http://127.0.0.1:9081 --pid <server pid> /maps /radio/morse
 *
 * Options:
 *   --base <url>      the Outpost to measure (required). Only pages are opened; nothing is pressed.
 *   --pid <n>         the server's process id, to report its processor time over the same window
 *   --seconds <n>     how long each screen is left alone (default 20)
 *   --settle <n>      seconds to wait after loading before measuring (default 5)
 *   --phone           390 x 844 instead of 1280 x 800
 *   --hidden          also measure with the page told it is hidden (a tab in the background)
 *   --dark            dark colour scheme
 *   --json            print JSON instead of a table
 *
 * With no paths, a short default list is measured. Figures are from headless Chromium on
 * this machine: compare a screen with itself before and after a change, and with the
 * others in the same run, rather than reading them as absolute.
 */
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const options = { seconds: 20, settle: 5, phone: false, hidden: false, dark: false, json: false, base: null, pid: null };
const paths = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--base") options.base = args[++i];
  else if (arg === "--pid") options.pid = Number(args[++i]);
  else if (arg === "--seconds") options.seconds = Number(args[++i]);
  else if (arg === "--settle") options.settle = Number(args[++i]);
  else if (arg === "--phone") options.phone = true;
  else if (arg === "--hidden") options.hidden = true;
  else if (arg === "--dark") options.dark = true;
  else if (arg === "--json") options.json = true;
  else if (arg.startsWith("/")) paths.push(arg);
  else throw new Error(`Unknown argument: ${arg}`);
}
if (!options.base) throw new Error("--base <url> is required");
if (paths.length === 0) paths.push("/", "/search", "/library", "/maps", "/notes", "/downloads", "/storage", "/settings");

/** Processor time a process has used so far, in seconds, from `ps` (hundredths of a second). */
function cpuSeconds(pid) {
  if (!pid) return null;
  try {
    const text = execFileSync("ps", ["-o", "cputime=", "-p", String(pid)], { encoding: "utf8" }).trim();
    // [[dd-]hh:]mm:ss[.cc]
    const [rest, days] = text.includes("-") ? text.split("-").reverse() : [text, "0"];
    const parts = rest.split(":").map(Number);
    let seconds = 0;
    for (const part of parts) seconds = seconds * 60 + part;
    return seconds + Number(days) * 86_400;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Counts what wakes the page: runs before any of the page's own code. */
function countWakeups() {
  const counts = { frames: 0, timers: 0 };
  Object.defineProperty(window, "__idle", { value: counts });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      counts.frames += 1;
      callback(time);
    });
  for (const name of ["setTimeout", "setInterval"]) {
    const original = window[name].bind(window);
    window[name] = (callback, delay, ...rest) =>
      original(
        typeof callback === "function"
          ? (...inner) => {
              counts.timers += 1;
              return callback(...inner);
            }
          : callback,
        delay,
        ...rest,
      );
  }
}

async function metrics(client) {
  const { metrics: list } = await client.send("Performance.getMetrics");
  const by = Object.fromEntries(list.map((metric) => [metric.name, metric.value]));
  return { task: by.TaskDuration ?? 0, script: by.ScriptDuration ?? 0, layout: (by.LayoutDuration ?? 0) + (by.RecalcStyleDuration ?? 0) };
}

async function measure(page, client, seconds, pid) {
  const requests = [];
  const onRequest = (request) => requests.push(new URL(request.url()).pathname);
  page.on("request", onRequest);
  const before = await metrics(client);
  const wakeBefore = await page.evaluate(() => ({ ...window.__idle }));
  const serverBefore = cpuSeconds(pid);
  await sleep(seconds * 1000);
  const after = await metrics(client);
  const wakeAfter = await page.evaluate(() => ({ ...window.__idle }));
  const serverAfter = cpuSeconds(pid);
  page.off("request", onRequest);
  const animations = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length);
  const perMinute = (count) => Math.round((count / seconds) * 60);
  const percent = (delta) => Math.round((delta / seconds) * 1000) / 10;
  const tally = {};
  for (const pathname of requests) tally[pathname] = (tally[pathname] ?? 0) + 1;
  return {
    pagePercent: percent(after.task - before.task),
    scriptPercent: percent(after.script - before.script),
    layoutPercent: percent(after.layout - before.layout),
    framesPerMinute: perMinute(wakeAfter.frames - wakeBefore.frames),
    timersPerMinute: perMinute(wakeAfter.timers - wakeBefore.timers),
    requestsPerMinute: perMinute(requests.length),
    animations,
    serverPercent: serverBefore === null || serverAfter === null ? null : percent(serverAfter - serverBefore),
    requests: tally,
  };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: options.phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
  colorScheme: options.dark ? "dark" : "light",
  serviceWorkers: "block",
});
await context.addInitScript(countWakeups);
const results = [];
for (const pathname of paths) {
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Performance.enable");
  const row = { path: pathname };
  try {
    await page.goto(new URL(pathname, options.base).href, { waitUntil: "load" });
    await sleep(options.settle * 1000);
    row.visible = await measure(page, client, options.seconds, options.pid);
    if (options.hidden) {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("blur"));
      });
      await sleep(1000);
      row.hidden = await measure(page, client, options.seconds, options.pid);
    }
  } catch (error) {
    row.error = String(error.message ?? error).split("\n")[0];
  }
  results.push(row);
  await page.close();
}
await browser.close();

if (options.json) {
  console.log(JSON.stringify({ options, results }, null, 2));
} else {
  const line = (label, m) =>
    `${label.padEnd(34)} page ${String(m.pagePercent).padStart(5)}%  script ${String(m.scriptPercent).padStart(5)}%  layout ${String(m.layoutPercent).padStart(5)}%  frames/min ${String(m.framesPerMinute).padStart(5)}  timers/min ${String(m.timersPerMinute).padStart(5)}  requests/min ${String(m.requestsPerMinute).padStart(4)}  animations ${String(m.animations).padStart(2)}${m.serverPercent === null ? "" : `  server ${m.serverPercent}%`}`;
  for (const row of results) {
    if (row.error) {
      console.log(`${row.path.padEnd(34)} ${row.error}`);
      continue;
    }
    console.log(line(row.path, row.visible));
    const asked = Object.entries(row.visible.requests);
    if (asked.length > 0) console.log(`    asked for: ${asked.map(([pathname, count]) => `${pathname} x${count}`).join(", ")}`);
    if (row.hidden) {
      console.log(line("    when hidden", row.hidden));
      const hiddenAsked = Object.entries(row.hidden.requests);
      if (hiddenAsked.length > 0)
        console.log(`    asked for: ${hiddenAsked.map(([pathname, count]) => `${pathname} x${count}`).join(", ")}`);
    }
  }
}

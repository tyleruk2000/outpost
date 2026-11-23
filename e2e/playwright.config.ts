/**
 * End-to-end tests run a real browser against the real server.
 *
 * A server is started on a throwaway data directory, bound to localhost.
 *
 * By default they run the packaged app (dist/app), so the bundle that ships is the
 * thing under test. Set OUTPOST_E2E_SOURCE=1 to run the server from source instead
 * (the web app must have been built).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { standInWorld } from "../apps/server/test/fixtures/maps/imagery-stand-in.ts";
import { standInWorld as standInNetwork } from "../apps/server/test/fixtures/network/stand-in.ts";
import { p533StandInManifest } from "../apps/server/test/fixtures/propagation/p533-maps-stand-in.ts";

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
// The HTTPS listener, which only opens when a test turns HTTPS on in Settings.
const httpsPort = Number(process.env.OUTPOST_E2E_HTTPS_PORT ?? filesPort + 2);
process.env.OUTPOST_E2E_HTTPS_PORT = String(httpsPort);
// The stand-in for kiwix-serve, holding one archive that is a list of documents (apps/server/test/nautilus-archive.ts).
const kiwixPort = Number(process.env.OUTPOST_E2E_KIWIX_PORT ?? filesPort + 5);
process.env.OUTPOST_E2E_KIWIX_URL = `http://127.0.0.1:${kiwixPort}`;
// The stand-in for the optional streets service (Valhalla), answering with replies recorded from a real one
// (apps/server/test/fixtures/streets). The open server asks it only while a test has written the service's
// status.json in its streets folder (tests/streets.ts): otherwise streets are "not installed", as on most installations.
const streetsPort = Number(process.env.OUTPOST_E2E_STREETS_PORT ?? filesPort + 6);

// This file is read by the runner and again by every worker it starts. Only the runner
// makes the folder; the workers find it in the environment they inherit. (Each used to
// make one of its own and none was ever removed: six hundred of them, 19 GB, in a day.)
const inherited = process.env.OUTPOST_E2E_WORK;
const work = inherited && fs.existsSync(inherited) ? inherited : fs.mkdtempSync(path.join(os.tmpdir(), "outpost-e2e-"));
if (work !== inherited) {
  process.env.OUTPOST_E2E_WORK = work;
  // Removed when the runner ends, which is after the servers it started have stopped.
  // Set OUTPOST_E2E_KEEP=1 to look at what a failed run left behind.
  if (process.env.OUTPOST_E2E_KEEP !== "1") {
    process.once("exit", () => {
      try {
        fs.rmSync(work, { recursive: true, force: true });
      } catch {
        // A folder left behind is a nuisance, not a failure of the run.
      }
    });
  }
}

// No server under test may reach a real Ollama on this machine. Each is started with a guard that
// refuses the port Ollama listens on and writes the attempt down (tools/no-ollama.mjs), and is told
// that "where Ollama listens" is a port nothing uses. A test fails if anything was written (fixtures.ts).
process.env.OUTPOST_E2E_OLLAMA_ATTEMPTS = path.join(work, "ollama-attempts.txt");
process.env.OUTPOST_E2E_SERVER_NODE_OPTIONS = `--import=${path.join(import.meta.dirname, "tools/no-ollama.mjs")}`;
process.env.OUTPOST_OLLAMA_ADDRESSES = "http://127.0.0.1:9/v1";

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
      NODE_OPTIONS: process.env.OUTPOST_E2E_SERVER_NODE_OPTIONS!,
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

// A route source of the tests' own, in place of the ones shipped: the stand-in file
// server answers "Find a route" with made-up routes, and no test can reach a real one.
fs.mkdirSync(path.join(ownCatalog, "routes"), { recursive: true });
fs.writeFileSync(
  path.join(ownCatalog, "routes", "route-sources.json"),
  JSON.stringify({
    schemaVersion: 1,
    replaceShipped: true,
    sources: [
      {
        id: "e2e-local",
        name: "End-to-end stand-in",
        type: "overpass",
        endpoint: `http://127.0.0.1:${filesPort}/overpass/api/interpreter`,
        operator: "the Outpost test suite",
        coverage: "A made-up hillside",
        termsUrl: "https://example.org/terms",
        lastVerified: "2026-11-16",
      },
    ],
  }),
);

// Sources of repeater lists of the tests' own, in place of the ones shipped: the stand-in
// file server is the only publisher, so that "Get the list" can be followed end to end
// and no test can ask a real one for anything.
fs.mkdirSync(path.join(ownCatalog, "repeaters"), { recursive: true });
const readTerms = {
  termsUrl: "https://example.org/terms",
  termsNote: "The tests' own publisher: its page says anyone may fetch the file.",
  termsRead: "2026-11-16",
};
fs.writeFileSync(
  path.join(ownCatalog, "repeaters", "repeater-sources.json"),
  JSON.stringify({
    schemaVersion: 1,
    replaceShipped: true,
    regions: [
      { id: "north", name: "The north", bbox: [-4, 54, -2, 56] },
      { id: "world", name: "Worldwide" },
    ],
    sources: [
      {
        ...readTerms,
        id: "e2e-north",
        region: "north",
        publisher: "End-to-end stand-in",
        name: "Stand-in list",
        covers: "Six made-up repeaters on a made-up hillside.",
        pageUrl: "https://example.org/lists",
        kind: "fetch",
        why: "It is the test suite's own file server.",
        fetch: { url: `http://127.0.0.1:${filesPort}/repeater-lists/north.csv`, waitSeconds: 0 },
      },
      {
        ...readTerms,
        id: "e2e-by-hand",
        region: "north",
        publisher: "A careful society",
        name: "Careful list",
        covers: "The same hillside.",
        pageUrl: "https://example.org/careful",
        kind: "link",
        why: "Its terms forbid a program fetching it.",
        steps: ["Open the page in your browser.", "Save the CSV file.", "Come back here and import it."],
      },
      {
        ...readTerms,
        id: "e2e-nothing",
        region: "world",
        publisher: "Nobody",
        name: "A map only",
        covers: "Nowhere.",
        pageUrl: "https://example.org/map",
        kind: "none",
        why: "It offers no file.",
      },
    ],
  }),
);

// VOACAP's coefficients are not in the repository. The suite runs the real engine on the
// tests' copy of them (engines/voacap/.cache): the open server starts with that copy in
// its data directory, put there by the same script a set-up uses, and its Download
// button fetches the same files from the stand-in file server, under Outpost's own list.
const voacapCache = path.join(root, "engines/voacap/.cache");
if (!fs.existsSync(path.join(voacapCache, "coeffs/fof2CCIR.daw"))) {
  throw new Error(
    `VOACAP's coefficients are not in ${voacapCache}, and the suite makes real predictions. Fill it once, with the internet: node scripts/fetch-voacap-data.mjs --cache`,
  );
}
if (work !== inherited) {
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/fetch-voacap-data.mjs"), "--data-dir", path.join(work, "open", "data"), "--from", voacapCache],
    { stdio: "ignore" },
  );
}
const voacapList = JSON.parse(fs.readFileSync(path.join(root, "engines/voacap/coefficients.json"), "utf8"));
const voacapData = path.join(work, "voacap-coefficients.json");
fs.writeFileSync(
  voacapData,
  JSON.stringify({ ...voacapList, source: { ...voacapList.source, baseUrl: `http://127.0.0.1:${filesPort}/voacap/` } }),
);

// Small stand-ins for the ITU's P.533 maps, served by the stand-in file server.
const p533Maps = path.join(work, "p533-maps.json");
fs.writeFileSync(p533Maps, JSON.stringify(p533StandInManifest(`http://127.0.0.1:${filesPort}/p533/`)));

// A made-up home network for "Devices on this network": no test may probe a real one.
// A /28, so that a scan at the real rate of 20 probes a second takes a couple of seconds.
const networkStandIn = path.join(work, "network-stand-in.json");
fs.writeFileSync(
  networkStandIn,
  JSON.stringify(
    standInNetwork({
      interfaces: {
        eth0: [
          {
            address: "192.168.77.5",
            netmask: "255.255.255.240",
            family: "IPv4",
            mac: "02:00:5e:00:00:05",
            internal: false,
            cidr: "192.168.77.5/28",
          },
        ],
      },
    }),
  ),
);

// Playwright empties its output folder when a run starts, so two runs sharing one would delete each
// other's traces and screenshots. A run on ports of its own writes to a folder of its own too:
// test-results-8910 for OUTPOST_E2E_PORT=8910; the usual ports keep test-results. OUTPOST_E2E_OUTPUT names one outright.
const runName = process.env.OUTPOST_E2E_PORT && port !== 8471 ? `-${port}` : "";
const outputDir = process.env.OUTPOST_E2E_OUTPUT ?? `./test-results${runName}`;
const reportDir = `playwright-report${runName}`;

export const OPEN_URL = `http://localhost:${port}`;
// Kept in step with NOT_SECURE_HOST in tests/every-screen.ts and the offline guard in tests/fixtures.ts.
const notSecureHost = "outpost-lan.test";
const NOT_SECURE_URL = `http://${notSecureHost}:${port}`;
const notSecure = { args: [`--host-resolver-rules=MAP ${notSecureHost} 127.0.0.1`] };

export default defineConfig({
  testDir: "./tests",
  outputDir,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: reportDir }]] : "list",
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
    // Times of day are written as the device writes them (apps/web/src/lib/clock.ts). The tests run as a
    // device that uses the 24-hour clock; a test of the 12-hour one asks for another locale itself.
    locale: "en-GB",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } },
      testIgnore: /mobile\.spec\.ts|iphone\.spec\.ts|not-secure\.spec\.ts/,
    },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    // Safari on an iPhone: WebKit, at the room Safari leaves with its bars showing (390 by 664 on an iPhone 13
    // to 15). Only the screens checked there by name. Needs WebKit once: `pnpm exec playwright install webkit`.
    { name: "iphone", use: { ...devices["iPhone 13"] }, testMatch: /iphone\.spec\.ts/ },
    // The walk to every screen again, at an address browsers do not treat as secure, as the server is reached
    // from another device on a home network (http://192.168.1.232:8080). 127.0.0.1 and localhost count as
    // secure, which hid faults such as a call to crypto.randomUUID(), absent on such a page. A made-up name is
    // pointed at 127.0.0.1 inside Chromium, and the open server is told to answer to it (OUTPOST_ALLOWED_HOSTS).
    {
      name: "not-secure desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 }, baseURL: NOT_SECURE_URL, launchOptions: notSecure },
      // And every action that needs a secure page pressed there (not-secure.spec.ts).
      testMatch: /every-screen\.spec\.ts|not-secure\.spec\.ts/,
    },
    {
      name: "not-secure phone",
      use: { ...devices["Pixel 7"], baseURL: NOT_SECURE_URL, launchOptions: notSecure },
      testMatch: /every-screen\.mobile\.spec\.ts/,
    },
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
      // A model the stand-in has not got "in memory" takes it a moment to load, so that the notice that says so can be seen.
      env: { STAND_IN_LONG_DELAY_MS: "40", STAND_IN_LOAD_MS: "700" },
    },
    {
      command: `node "${path.join(root, "apps/server/test/nautilus-archive.ts")}" ${kiwixPort}`,
      url: `http://127.0.0.1:${kiwixPort}/health`,
      reuseExistingServer: false,
    },
    {
      command: `node "${path.join(root, "apps/server/test/fixtures/streets/stand-in-server.ts")}" ${streetsPort}`,
      url: `http://127.0.0.1:${streetsPort}/health`,
      reuseExistingServer: false,
    },
    // The open server fetches portable-drive runtimes from the stand-in above, which is on a private address.
    server("open", port, {
      OUTPOST_NODE_DIST_URL: `http://127.0.0.1:${filesPort}`,
      OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "true",
      OUTPOST_HTTPS_PORT: String(httpsPort),
      OUTPOST_KIWIX_URL: `http://127.0.0.1:${kiwixPort}`,
      OUTPOST_VALHALLA_URL: `http://127.0.0.1:${streetsPort}`,
      OUTPOST_VALHALLA_DIR: path.join(work, "open", "valhalla"),
      OUTPOST_P533_MAPS_MANIFEST: p533Maps,
      OUTPOST_VOACAP_DATA_MANIFEST: voacapData,
      // Satellite imagery's publishers, stood in for by the file server above.
      OUTPOST_IMAGERY_STAC_URL: `http://127.0.0.1:${filesPort}/imagery/v1/search`,
      OUTPOST_IMAGERY_SENTINEL_HOST: "127.0.0.1",
      OUTPOST_IMAGERY_WORLD_URL: `http://127.0.0.1:${filesPort}/imagery/world.tif`,
      OUTPOST_IMAGERY_WORLD_BYTES: String(standInWorld().length),
      OUTPOST_IMAGERY_LINZ_BASE: `http://127.0.0.1:${filesPort}/imagery/linz`,
      OUTPOST_NETWORK_STAND_IN: networkStandIn,
      // Every weather publisher, stood in for by the file server above.
      OUTPOST_WEATHER_STAND_IN: `http://127.0.0.1:${filesPort}/weather`,
      // OurAirports' data repository (airports and their frequencies), stood in for by the file server above.
      OUTPOST_OURAIRPORTS_URL: `http://127.0.0.1:${filesPort}/ourairports/`,
      // download.geofabrik.de (its list of regions and the extracts), stood in for by the file server above.
      OUTPOST_GEOFABRIK_URL: `http://127.0.0.1:${filesPort}/geofabrik`,
      OUTPOST_OS_DOWNLOADS_URL: `http://127.0.0.1:${filesPort}/os-downloads/`,
      // The made-up name the "not secure" projects use; for this test server only.
      OUTPOST_ALLOWED_HOSTS: notSecureHost,
    }),
  ],
});

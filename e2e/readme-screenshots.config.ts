/**
 * Makes the README's pictures again: `pnpm exec playwright test -c readme-screenshots.config.ts`
 * from `e2e/`, after `node scripts/build-app.mjs`. See readme/screenshots.spec.ts for
 * what is photographed and what is filled in first.
 *
 * A server of its own is started from dist/app on an empty data directory, beside the
 * suite's own stand-ins: the file server (tools/fake-dist.mjs), the stand-in model server
 * (apps/server/test/model-server.ts, which is not a language model) and a made-up home
 * network. Nothing here reaches the internet or a real model server, and nothing is read
 * from any other Outpost: every note, place, contact and plan in the pictures is written
 * by the spec for the purpose.
 *
 * Ports: OUTPOST_README_PORT (default 9081) for Outpost, and the two after it for the file
 * server and the model stand-in. OUTPOST_README_WORK names a folder for the data
 * directory (made empty first); without it one is made in the system's temporary folder
 * and removed at the end.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { standInWorld as standInNetwork } from "../apps/server/test/fixtures/network/stand-in.ts";

const root = path.resolve(import.meta.dirname, "..");
const entry = path.join(root, "dist/app/server/outpost.mjs");
if (!fs.existsSync(entry)) throw new Error(`${entry} does not exist. Run \`node scripts/build-app.mjs\` first.`);

const port = Number(process.env.OUTPOST_README_PORT ?? 9081);
const filesPort = port + 1;
const modelPort = port + 2;
process.env.OUTPOST_README_MODEL_URL = `http://127.0.0.1:${modelPort}`;

// The runner reads this file, and so does each worker it starts: only the runner makes the folder.
const inherited = process.env.OUTPOST_README_INHERITED;
let work: string;
if (inherited && fs.existsSync(inherited)) {
  work = inherited;
} else {
  const named = process.env.OUTPOST_README_WORK;
  if (named) {
    fs.rmSync(named, { recursive: true, force: true });
    fs.mkdirSync(named, { recursive: true });
    work = named;
  } else {
    work = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-readme-"));
    process.once("exit", () => fs.rmSync(work, { recursive: true, force: true }));
  }
  process.env.OUTPOST_README_INHERITED = work;
  // The HF planner's data, from the suite's copy (engines/voacap/.cache), by the script a set-up uses.
  const cache = path.join(root, "engines/voacap/.cache");
  if (!fs.existsSync(path.join(cache, "coeffs/fof2CCIR.daw"))) {
    throw new Error(
      `VOACAP's coefficients are not in ${cache}. Fill it once, with the internet: node scripts/fetch-voacap-data.mjs --cache`,
    );
  }
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/fetch-voacap-data.mjs"), "--data-dir", path.join(work, "data"), "--from", cache],
    {
      stdio: "ignore",
    },
  );
}

// The same guard the suite uses: no server here may reach the port a real Ollama listens on.
process.env.OUTPOST_E2E_OLLAMA_ATTEMPTS = path.join(work, "ollama-attempts.txt");

// A made-up home network for "Devices on this network": the stand-in's, never a real one.
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

export const README_URL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./readme",
  outputDir: path.join(work, "test-results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 600_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: README_URL,
    serviceWorkers: "block",
    locale: "en-GB",
    timezoneId: "Europe/London",
  },
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
    },
    {
      command: `node "${entry}"`,
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "production",
        OUTPOST_PORT: String(port),
        OUTPOST_DATA_DIR: path.join(work, "data"),
        OUTPOST_STORAGE_ROOTS: path.join(work, "storage"),
        OUTPOST_LOG_LEVEL: "warn",
        NODE_OPTIONS: `--import=${path.join(import.meta.dirname, "tools/no-ollama.mjs")}`,
        OUTPOST_OLLAMA_ADDRESSES: "http://127.0.0.1:9/v1",
        OUTPOST_NETWORK_STAND_IN: networkStandIn,
        OUTPOST_WEATHER_STAND_IN: `http://127.0.0.1:${filesPort}/weather`,
      },
    },
  ],
});

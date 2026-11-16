#!/usr/bin/env node
/**
 * Fetches the data VOACAP reads that Outpost does not ship: the ionospheric and noise
 * coefficients (CCIR Reports 322 and 340, with NTIA/ITS tables in the same files) and two
 * short-whip patterns, 15 files and 559 kB in all, from the engine's own project at the
 * commit Outpost's engine was built from. Every file is checked against the size and
 * checksum in engines/voacap/coefficients.json before anything is kept.
 *
 * It is the set-up step of the install paths, so that a box prepared once works offline at
 * once, and the way the tests' copy is filled. The app itself never runs it; inside the app
 * the same files are fetched only when a person presses Download on the HF planner.
 *
 *   node scripts/fetch-voacap-data.mjs --data-dir <Outpost's data directory>
 *   node scripts/fetch-voacap-data.mjs --cache        the tests' copy, engines/voacap/.cache/
 *
 *   --from <folder>    take the files from a folder instead of the network (the same
 *                      layout: coeffs/..., antennas/default/...; an old app folder's
 *                      engines/voacap/data/itshfbc works, as does engines/voacap/.cache)
 *   --base-url <url>   fetch from a copy of the same files elsewhere (the checksums do not change)
 *
 * OUTPOST_DATA_DIR stands in for --data-dir. What is already in place and matches is kept,
 * so running it again, or after an interrupted run, fetches only what is missing. It needs
 * nothing but Node 24, and writes nothing outside the folder it is given.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
// The same place relative to this script in a checkout and in the packaged app.
const manifestFile = path.resolve(here, "../engines/voacap/coefficients.json");
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

if (args.includes("-h") || args.includes("--help")) {
  const text = fs.readFileSync(import.meta.filename, "utf8");
  console.log(text.slice(text.indexOf("/**") + 3, text.indexOf("*/")).replace(/^ \* ?/gm, ""));
  process.exit(0);
}

const fail = (message) => {
  console.error(`[voacap data] ${message}`);
  process.exit(1);
};

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const kB = (bytes) => `${Math.round(bytes / 1000)} kB`;

const toCache = args.includes("--cache");
const dataDir = option("--data-dir") ?? process.env.OUTPOST_DATA_DIR;
if (!toCache && !dataDir) fail("Say where to put the files: --data-dir <Outpost's data directory>, or --cache for the tests' copy.");
const target = toCache
  ? path.resolve(here, "../engines/voacap/.cache")
  : path.join(path.resolve(dataDir), "propagation/voacap-coefficients");
const from = option("--from");
const baseUrl = option("--base-url") ?? manifest.source.baseUrl;

for (const file of manifest.files) {
  if (file.path.split("/").some((part) => part === ".." || part === "")) fail(`The list names a file outside its folder (${file.path}).`);
}

/** True when the file at this place is the one listed. */
function matches(file, at) {
  try {
    const bytes = fs.readFileSync(at);
    return bytes.length === file.bytes && sha256(bytes) === file.sha256;
  } catch {
    return false;
  }
}

async function fetchOne(file) {
  const url = new URL(file.path, baseUrl).toString();
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "accept-encoding": "identity" } });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      last = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw last;
}

async function main() {
  if (
    manifest.files.every((file) => matches(file, path.join(target, file.path))) &&
    (toCache || fs.existsSync(path.join(target, "installed.json")))
  ) {
    console.log(`[voacap data] already in place and matching their checksums: ${target}`);
    return;
  }
  console.log(
    `[voacap data] ${manifest.files.length} files, ${kB(manifest.bytes)} (${manifest.bytes} bytes), ${from ? `from ${path.resolve(from)}` : `from ${baseUrl}`}`,
  );
  // Into a folder beside the target first, so that a set that is not whole is never where Outpost looks.
  const partial = toCache ? target : `${target}.partial`;
  for (const file of manifest.files) {
    const at = path.join(partial, file.path);
    if (matches(file, at)) continue;
    const bytes = from ? new Uint8Array(fs.readFileSync(path.join(path.resolve(from), file.path))) : await fetchOne(file);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      fail(`${file.path} is not the file Outpost expects (size or checksum differs), so nothing was installed.`);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, bytes);
    console.log(`[voacap data]   ${file.path} (${file.bytes} bytes) matches`);
  }
  if (!toCache) {
    fs.writeFileSync(
      path.join(partial, "installed.json"),
      `${JSON.stringify(
        {
          id: manifest.id,
          version: manifest.version,
          sha256: manifest.sha256,
          how: "set-up",
          from: from ? path.resolve(from) : baseUrl,
          at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(partial, target);
  }
  console.log(`[voacap data] done: ${target}`);
}

main().catch((error) =>
  fail(`${error instanceof Error ? error.message : String(error)}. Nothing was installed; run it again to continue.`),
);

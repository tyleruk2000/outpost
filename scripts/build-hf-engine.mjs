#!/usr/bin/env node
/**
 * Builds the HF propagation engine: VOACAP, in its Rust translation (the `hfcast`
 * crate), compiled to WebAssembly so that one file runs wherever Node does.
 *
 *   engines/voacap/engine/voacap.wasm        the engine and Outpost's bridge to it
 *   engines/voacap/engine/engine.json        what it was built from, and its checksum
 *   engines/voacap/engine/LICENSE-hfcast.txt, NOTICE-hfcast.txt
 *   engines/voacap/data/itshfbc/             the engine's data: ionospheric and noise
 *                                            coefficients, antenna definitions
 *   engines/voacap/data/dataset.json         every data file with its size and checksum
 *
 * Those files are committed, so running or packaging Outpost needs none of this. Run
 * it only to move to a newer engine or to check that the committed files are what the
 * sources give:
 *
 *   node scripts/build-hf-engine.mjs            build, and replace the committed files
 *   node scripts/build-hf-engine.mjs --check    build, and compare with the committed files
 *
 * Needs git, and a Rust toolchain of exactly the version below with the wasm32-wasip1
 * target (`rustup toolchain install 1.97.1 --profile minimal --target wasm32-wasip1`;
 * set RUSTUP_HOME and CARGO_HOME first to keep it out of your own). The script installs
 * nothing. The engine's source is fetched from its repository at the pinned commit into
 * engines/voacap/.upstream (not committed) and one small patch is applied
 * (engines/voacap/wasm.patch: it lets a test harness that Outpost never calls compile
 * where there are no symbolic links; no arithmetic is touched).
 *
 * Plain Node, no dependencies.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const home = path.join(root, "engines/voacap");
const upstreamDir = path.join(home, ".upstream");
const engineDir = path.join(home, "engine");
const dataDir = path.join(home, "data");
const checkOnly = process.argv.includes("--check");

const UPSTREAM = {
  name: "hfcast",
  repository: "https://github.com/jonathanmcsweet/hfcast-engine",
  commit: "bf34e8f9f375e190ed43fcac19f25d800992e0e6",
  licence: "Apache-2.0",
};
const RUSTC = "1.97.1";
const TARGET = "wasm32-wasip1";

/** The data files, by where they come from; see docs/hf-propagation.md for the terms of each. */
const DATA_GROUPS = [
  {
    id: "coefficients",
    title: "Ionospheric and noise coefficients",
    description:
      "Monthly maps of foF2 and M(3000)F2 (CCIR Report 340), atmospheric radio noise (CCIR Report 322), and the E, F1 and sporadic-E maps, F2 height ratio and prediction-error tables of NTIA/ITS, in the binary form VOACAP reads.",
    match: (rel) => rel.startsWith("coeffs/"),
  },
  {
    id: "antennas",
    title: "Antenna definitions and the version file",
    description: "The antenna definition files of the VOACAP distribution (NTIA/ITS) and its version string.",
    match: (rel) => rel.startsWith("antennas/") || rel.startsWith("database/"),
  },
];

const log = (message) => console.log(`[hf-engine] ${message}`);
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...options });
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

// 1. The toolchain: exactly the pinned compiler, so that the same sources give the same file.
const rustc = run("rustc", ["--version"]).trim();
if (!rustc.startsWith(`rustc ${RUSTC} `)) {
  throw new Error(`This build is pinned to rustc ${RUSTC}; found "${rustc}". Install it with rustup and put it first on PATH.`);
}
const libdir = run("rustc", ["--print", "target-libdir", "--target", TARGET]).trim();
if (!fs.existsSync(libdir)) throw new Error(`The ${TARGET} target is not installed for rustc ${RUSTC} (rustup target add ${TARGET}).`);

// 2. The engine's source at the pinned commit, with the patch.
if (!fs.existsSync(path.join(upstreamDir, ".git"))) {
  log(`fetching ${UPSTREAM.repository}`);
  fs.mkdirSync(upstreamDir, { recursive: true });
  run("git", ["init", "-q"], { cwd: upstreamDir });
  run("git", ["remote", "add", "origin", `${UPSTREAM.repository}.git`], { cwd: upstreamDir });
}
run("git", ["fetch", "-q", "--depth", "1", "origin", UPSTREAM.commit], { cwd: upstreamDir });
run("git", ["checkout", "-q", "--force", UPSTREAM.commit], { cwd: upstreamDir });
run("git", ["clean", "-qfd"], { cwd: upstreamDir });
const head = run("git", ["rev-parse", "HEAD"], { cwd: upstreamDir }).trim();
if (head !== UPSTREAM.commit) throw new Error(`Expected commit ${UPSTREAM.commit}, have ${head}.`);
const commitDate = run("git", ["log", "-1", "--format=%cI"], { cwd: upstreamDir }).trim();
run("git", ["apply", path.join(home, "wasm.patch")], { cwd: upstreamDir });
const crateVersion = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(upstreamDir, "Cargo.toml"), "utf8"))?.[1];
log(`${UPSTREAM.name} ${crateVersion} at ${head.slice(0, 12)} (${commitDate})`);

// 3. Build. Paths are rewritten so that the result does not depend on where this ran.
const targetDir = path.join(upstreamDir, "target-outpost");
const cargoHome = process.env.CARGO_HOME ?? path.join(process.env.HOME ?? "", ".cargo");
log(`building for ${TARGET}`);
execFileSync(
  "cargo",
  [
    "build",
    "--release",
    "--lib",
    "--locked",
    "--target",
    TARGET,
  ],
  {
    cwd: path.join(home, "wrapper"),
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_TARGET_DIR: targetDir,
      RUSTFLAGS: `--remap-path-prefix=${root}=/outpost --remap-path-prefix=${cargoHome}=/cargo`,
    },
  },
);
const built = path.join(targetDir, TARGET, "release/outpost_voacap.wasm");

// 4. The data: the files the engine's repository carries for embedding, laid out as the
// directory VOACAP reads (an "itshfbc" tree).
const embedded = path.join(upstreamDir, "embedded");
// (The folder's own README is the engine project's note to itself, not data.)
const dataFiles = walk(embedded)
  .filter((rel) => rel !== "README.md")
  .map((rel) => ({ rel, bytes: fs.statSync(path.join(embedded, rel)).size, sha256: sha256(path.join(embedded, rel)) }));
const voacapVersion = fs.readFileSync(path.join(embedded, "database/version.w32"), "utf8").trim();

const engine = {
  id: "voacap",
  name: "VOACAP",
  model: `VOACAP ${voacapVersion}`,
  implementation: { name: UPSTREAM.name, version: crateVersion, repository: UPSTREAM.repository, commit: UPSTREAM.commit, committed: commitDate, licence: UPSTREAM.licence },
  build: { rustc: RUSTC, target: TARGET, patch: "engines/voacap/wasm.patch" },
  wasm: { file: "voacap.wasm", bytes: fs.statSync(built).size, sha256: sha256(built) },
};
const dataset = {
  id: "voacap-coefficients",
  version: `${UPSTREAM.name}-${head.slice(0, 12)}`,
  source: { repository: UPSTREAM.repository, commit: UPSTREAM.commit, path: "embedded/", committed: commitDate },
  groups: DATA_GROUPS.map((group) => {
    const files = dataFiles.filter((file) => group.match(file.rel));
    return { id: group.id, title: group.title, description: group.description, bytes: files.reduce((sum, file) => sum + file.bytes, 0), files: files.map((file) => ({ path: file.rel, bytes: file.bytes, sha256: file.sha256 })) };
  }),
};
const unplaced = dataFiles.filter((file) => !DATA_GROUPS.some((group) => group.match(file.rel)));
if (unplaced.length > 0) throw new Error(`Data files with no group: ${unplaced.map((file) => file.rel).join(", ")}`);

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

if (checkOnly) {
  const problems = [];
  const same = (file, text) => fs.existsSync(file) && fs.readFileSync(file, "utf8") === text;
  if (!same(path.join(engineDir, "engine.json"), json(engine))) problems.push("engine/engine.json differs (the WebAssembly file or its sources changed)");
  if (!fs.existsSync(path.join(engineDir, "voacap.wasm")) || sha256(path.join(engineDir, "voacap.wasm")) !== engine.wasm.sha256) problems.push("engine/voacap.wasm is not what this build gives");
  if (!same(path.join(dataDir, "dataset.json"), json(dataset))) problems.push("data/dataset.json differs");
  for (const file of dataFiles) {
    const committed = path.join(dataDir, "itshfbc", file.rel);
    if (!fs.existsSync(committed) || sha256(committed) !== file.sha256) problems.push(`data/itshfbc/${file.rel} differs`);
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[hf-engine] ${problem}`);
    process.exit(1);
  }
  log(`the committed engine and data match this build (voacap.wasm ${engine.wasm.sha256.slice(0, 16)}…)`);
  process.exit(0);
}

fs.mkdirSync(engineDir, { recursive: true });
fs.copyFileSync(built, path.join(engineDir, "voacap.wasm"));
fs.copyFileSync(path.join(upstreamDir, "LICENSE"), path.join(engineDir, "LICENSE-hfcast.txt"));
fs.copyFileSync(path.join(upstreamDir, "NOTICE"), path.join(engineDir, "NOTICE-hfcast.txt"));
fs.writeFileSync(path.join(engineDir, "engine.json"), json(engine));
fs.rmSync(path.join(dataDir, "itshfbc"), { recursive: true, force: true });
for (const file of dataFiles) {
  const to = path.join(dataDir, "itshfbc", file.rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(embedded, file.rel), to);
}
fs.writeFileSync(path.join(dataDir, "dataset.json"), json(dataset));
log(`wrote engine/voacap.wasm (${engine.wasm.bytes} bytes, sha256 ${engine.wasm.sha256.slice(0, 16)}…) and ${dataFiles.length} data files`);

#!/usr/bin/env node
/**
 * Builds the second HF propagation model, the ITU's ITURHFProp (Recommendation ITU-R
 * P.533 with P.372 noise), to WebAssembly on this computer.
 *
 * Nothing of the ITU's is in Outpost's repository: not its source, not the built file,
 * not its maps. This script fetches the source from the ITU's own repository at the
 * commit pinned in apps/server/src/modules/propagation/p533/manifest.json, checks it
 * against the checksums recorded there, and compiles it in a container with a pinned
 * wasi-sdk (engines/p533/build/Dockerfile) and no network. The result must be, byte for
 * byte, the file the manifest records; if it is not, nothing is installed.
 *
 *   node scripts/build-p533-engine.mjs                       build into engines/p533/engine/
 *   node scripts/build-p533-engine.mjs --install <data dir>  also copy it to <data dir>/propagation/p533/
 *   node scripts/build-p533-engine.mjs --maps                also fetch the ITU's maps into
 *                                                            engines/p533/.cache/maps (for the tests;
 *                                                            the app downloads them itself)
 *   node scripts/build-p533-engine.mjs --record              write what this build gave into the manifest
 *                                                            (only when moving to a newer commit or toolchain)
 *   node scripts/build-p533-engine.mjs --remove-image        delete the build image afterwards (about 740 MB)
 *
 * Needs git, Docker and the internet, once. The fetched source stays in
 * engines/p533/.upstream and the built file in engines/p533/engine; neither is
 * committed (see .gitignore and docs/hf-propagation.md, "Licences and attribution").
 *
 * Plain Node, no dependencies.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const home = path.join(root, "engines/p533");
const upstreamDir = path.join(home, ".upstream");
const engineDir = path.join(home, "engine");
const mapsDir = path.join(home, ".cache/maps");
const manifestFile = path.join(root, "apps/server/src/modules/propagation/p533/manifest.json");
const args = process.argv.slice(2);
const record = args.includes("--record");
const installIndex = args.indexOf("--install");
const installTo = installIndex >= 0 ? path.resolve(args[installIndex + 1] ?? "") : null;

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const { source, build } = manifest;
const IMAGE = `outpost-p533-build:wasi-sdk-${build.wasiSdk}`;

/**
 * What is taken from the ITU's repository. The three Src folders are what is compiled;
 * the rest is what the reference test reads (its nine inputs and outputs, and the two
 * antenna files two of them name). Nothing else is fetched.
 */
const SPARSE = [
  "/README.md",
  "/P533/Src/P533/",
  "/P372/Src/P372/",
  "/ITURHFProp/Src/ITURHFProp/",
  "/ITURHFProp/Bin/*.in",
  "/ITURHFProp/Bin/*.out",
  "/ITURHFProp/Bin/dipole_14mhz_10m_aagl.13",
  "/ITURHFProp/Data/Antenna/T13 Files/201-6_0.t13",
];
/** The source files the compiler reads, for the tree checksum. */
const COMPILED = ["P533/Src/P533", "P372/Src/P372", "ITURHFProp/Src/ITURHFProp"];

const log = (message) => console.log(`[p533-engine] ${message}`);
const run = (command, argv, options = {}) =>
  execFileSync(command, argv, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...options });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** One checksum over every .c and .h file compiled: "path sha256" lines, sorted. */
function treeChecksum() {
  const lines = [];
  for (const dir of COMPILED) {
    for (const name of fs.readdirSync(path.join(upstreamDir, dir)).sort()) {
      if (!/\.[ch]$/.test(name)) continue;
      lines.push(`${dir}/${name} ${sha256File(path.join(upstreamDir, dir, name))}`);
    }
  }
  return { sha256: sha256(lines.join("\n")), files: lines.length };
}

// 1. The ITU's source at the pinned commit: only the folders listed above.
if (!fs.existsSync(path.join(upstreamDir, ".git"))) {
  log(`fetching ${source.repository} (source folders only)`);
  fs.mkdirSync(upstreamDir, { recursive: true });
  run("git", ["init", "-q"], { cwd: upstreamDir });
  run("git", ["remote", "add", "origin", `${source.repository}.git`], { cwd: upstreamDir });
}
run("git", ["sparse-checkout", "set", "--no-cone", ...SPARSE], { cwd: upstreamDir });
run("git", ["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", source.commit], { cwd: upstreamDir });
run("git", ["checkout", "-q", "--force", source.commit], { cwd: upstreamDir });
const head = run("git", ["rev-parse", "HEAD"], { cwd: upstreamDir }).trim();
if (head !== source.commit) throw new Error(`Expected commit ${source.commit}, have ${head}.`);
const committedAt = Number(run("git", ["log", "-1", "--format=%ct"], { cwd: upstreamDir }).trim());
const tree = treeChecksum();
if (!record && tree.sha256 !== source.treeSha256) {
  throw new Error(`The fetched source does not match the recorded checksum (${tree.sha256} against ${source.treeSha256}).`);
}
log(`ITU source at ${head.slice(0, 12)}, ${tree.files} files compiled, tree ${tree.sha256.slice(0, 16)}…`);

// 2. The toolchain image, then the build with no network and the source read-only.
log(`building the toolchain image ${IMAGE}`);
execFileSync("docker", ["build", "-q", "-t", IMAGE, path.join(home, "build")], { stdio: ["ignore", "ignore", "inherit"] });
const out = fs.mkdtempSync(path.join(home, ".build-"));
try {
  log("compiling (no network)");
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "-e",
      `SOURCE_DATE_EPOCH=${committedAt}`,
      "-v",
      `${upstreamDir}:/src:ro`,
      "-v",
      `${path.join(home, "glue")}:/glue:ro`,
      "-v",
      `${out}:/out`,
      IMAGE,
    ],
    { stdio: "inherit" },
  );
  const built = path.join(out, "iturhfprop.wasm");
  const wasm = { file: "iturhfprop.wasm", bytes: fs.statSync(built).size, sha256: sha256File(built) };
  const clang = fs.readFileSync(path.join(out, "clang-version.txt"), "utf8").trim();

  // 3. The reference cases' checksums, so a later test knows it is reading the ITU's files.
  const bin = path.join(upstreamDir, "ITURHFProp/Bin");
  const references = fs
    .readdirSync(bin)
    .filter((name) => name.endsWith(".in"))
    .sort()
    .map((name) => {
      const base = name.slice(0, -3);
      return {
        name: base,
        input: { bytes: fs.statSync(path.join(bin, name)).size, sha256: sha256File(path.join(bin, name)) },
        output: { bytes: fs.statSync(path.join(bin, `${base}.out`)).size, sha256: sha256File(path.join(bin, `${base}.out`)) },
      };
    });

  if (record) {
    manifest.source.treeSha256 = tree.sha256;
    manifest.source.files = tree.files;
    manifest.source.committedAt = new Date(committedAt * 1000).toISOString();
    manifest.build.clang = clang;
    manifest.wasm = wasm;
    manifest.references = references;
    fs.writeFileSync(manifestFile, json(manifest));
    log(`recorded iturhfprop.wasm ${wasm.bytes} bytes, sha256 ${wasm.sha256}`);
  } else {
    if (wasm.sha256 !== manifest.wasm.sha256) {
      throw new Error(
        `This build gave ${wasm.sha256} (${wasm.bytes} bytes), not the recorded ${manifest.wasm.sha256}. It was not installed.`,
      );
    }
    for (const ref of references) {
      const known = manifest.references.find((item) => item.name === ref.name);
      if (!known || known.input.sha256 !== ref.input.sha256 || known.output.sha256 !== ref.output.sha256)
        throw new Error(`The reference case ${ref.name} is not the one recorded.`);
    }
    log(`iturhfprop.wasm matches the recorded checksum (${wasm.sha256.slice(0, 16)}…)`);
  }
  fs.mkdirSync(engineDir, { recursive: true });
  fs.copyFileSync(built, path.join(engineDir, wasm.file));
  log(`wrote engines/p533/engine/${wasm.file}`);
  if (installTo) {
    const to = path.join(installTo, "propagation/p533");
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(built, path.join(to, wasm.file));
    log(`installed into ${to}`);
  }
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

// 4. The maps, for the tests that need them. The app fetches them itself, through the
// download manager, when a person asks.
if (args.includes("--maps")) {
  fs.mkdirSync(mapsDir, { recursive: true });
  for (const file of manifest.maps.files) {
    const to = path.join(mapsDir, file.name);
    if (fs.existsSync(to) && sha256File(to) === file.sha256) continue;
    const url = `${manifest.maps.baseUrl}${file.path.split("/").map(encodeURIComponent).join("/")}`;
    log(`fetching ${file.name} (${(file.bytes / 1e6).toFixed(1)} MB)`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== file.sha256) throw new Error(`${file.name} does not match its recorded checksum.`);
    fs.writeFileSync(to, bytes);
  }
  log(`the ${manifest.maps.files.length} map files are in engines/p533/.cache/maps`);
}

if (args.includes("--remove-image")) {
  execFileSync("docker", ["image", "rm", IMAGE], { stdio: "inherit" });
}

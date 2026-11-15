#!/usr/bin/env node
/**
 * Builds the packaged app: a self-contained directory that runs with nothing but a
 * Node 24 binary. The Docker image and portable drives both use it.
 *
 *   dist/app/
 *     server/outpost.mjs        bundled server
 *     server/workers/*.mjs      worker threads (one file each)
 *     server/migrations/        SQL migrations
 *     server/node_modules/      the one native dependency (SQLite), with prebuilt
 *                               binaries for every supported platform
 *     server/ocr/               English language data for OCR (the engine itself is
 *                               WebAssembly inside workers/ocr.mjs)
 *     web/                      built web app, fonts and map assets included
 *     catalog/                  catalogue manifests
 *
 * Usage: node scripts/build-app.mjs [--skip-web] [--out <dir>]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = path.resolve(outIndex >= 0 ? args[outIndex + 1] : path.join(root, "dist/app"));
const serverSrc = path.join(root, "apps/server/src");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

const log = (message) => console.log(`[build-app] ${message}`);

function copyDir(from, to, filter = () => true) {
  fs.cpSync(from, to, { recursive: true, filter: (source) => filter(source) });
}

function findWorkers(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findWorkers(full, found);
    else if (entry.name.endsWith(".worker.ts")) found.push(full);
  }
  return found;
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "server"), { recursive: true });

// ── Web app ────────────────────────────────────────────────────────────────
if (!args.includes("--skip-web")) {
  log("building the web app");
  execFileSync("pnpm", ["--filter", "@outpost/web", "build"], { cwd: root, stdio: "inherit" });
}
const webDist = path.join(root, "apps/web/dist");
if (!fs.existsSync(path.join(webDist, "index.html"))) {
  throw new Error("apps/web/dist is missing. Run without --skip-web.");
}
copyDir(webDist, path.join(out, "web"));
if (!fs.existsSync(path.join(out, "web/map-assets/fonts"))) {
  log("WARNING: map fonts and sprites are missing; maps will render without labels. Run `node scripts/fetch-map-assets.mjs` first.");
}

// ── Server ─────────────────────────────────────────────────────────────────
// Code bundled from CommonJS packages expects require, __dirname and __filename.
const banner = {
  js: [
    'import { createRequire as __outpostCreateRequire } from "node:module";',
    'import { fileURLToPath as __outpostFileURLToPath } from "node:url";',
    'import { dirname as __outpostDirname } from "node:path";',
    "const require = __outpostCreateRequire(import.meta.url);",
    "const __filename = __outpostFileURLToPath(import.meta.url);",
    "const __dirname = __outpostDirname(__filename);",
  ].join("\n"),
};
const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // Native code cannot be bundled; it is copied next to the bundle below.
  external: ["better-sqlite3", "pino-pretty", "onnxruntime-node", "@huggingface/transformers", "sharp"],
  banner,
  legalComments: "none",
  logLevel: "warning",
  define: { "process.env.OUTPOST_BUILD_VERSION": JSON.stringify(version) },
};

log("bundling the server");
await build({
  ...common,
  entryPoints: { outpost: path.join(serverSrc, "index.ts") },
  outdir: path.join(out, "server"),
  outExtension: { ".js": ".mjs" },
  splitting: true,
  // Chunks stay beside the entry so that import.meta.dirname means the same everywhere.
  chunkNames: "[name]-[hash]",
});

const workers = findWorkers(serverSrc);
if (workers.length > 0) {
  log(`bundling ${workers.length} worker${workers.length === 1 ? "" : "s"}`);
  await build({
    ...common,
    entryPoints: Object.fromEntries(workers.map((file) => [path.basename(file, ".worker.ts"), file])),
    outdir: path.join(out, "server/workers"),
    outExtension: { ".js": ".mjs" },
  });
}

copyDir(path.join(serverSrc, "db/migrations"), path.join(out, "server/migrations"));

// SQLite: JavaScript wrapper plus a prebuilt binary per platform. Sources and the
// amalgamation are only needed to compile it, which the packaged app never does.
const sqlite = fs.realpathSync(path.join(root, "apps/server/node_modules/better-sqlite3"));
const sqliteOut = path.join(out, "server/node_modules/better-sqlite3");
fs.mkdirSync(sqliteOut, { recursive: true });
for (const item of ["lib", "prebuilds", "package.json", "LICENSE"]) {
  fs.cpSync(path.join(sqlite, item), path.join(sqliteOut, item), { recursive: true });
}

// OCR. The engine (Tesseract compiled to WebAssembly) is JavaScript with the binary
// inside it, so esbuild has already put it in workers/ocr.mjs; nothing native, and the
// same file runs on every platform. Its language data is a file read at run time, and
// has to travel beside it: see modules/ocr/tesseract-assets.ts for where it is looked for.
const ocrOut = path.join(out, "server/ocr");
const ocrPackage = (name) => fs.realpathSync(path.join(root, "apps/server/node_modules", name));
fs.mkdirSync(ocrOut, { recursive: true });
fs.copyFileSync(
  path.join(ocrPackage("@tesseract.js-data/eng"), "4.0.0_best_int/eng.traineddata.gz"),
  path.join(ocrOut, "eng.traineddata.gz"),
);
fs.copyFileSync(path.join(ocrPackage("tesseract.js-core"), "LICENSE"), path.join(ocrOut, "LICENSE-tesseract.txt"));
fs.writeFileSync(
  path.join(ocrOut, "NOTICE.txt"),
  [
    "OCR in Outpost uses Tesseract (https://github.com/tesseract-ocr/tesseract), compiled to",
    "WebAssembly by the tesseract.js-core project (https://github.com/naptha/tesseract.js-core).",
    "Both are under the Apache License 2.0; see LICENSE-tesseract.txt.",
    "",
    "eng.traineddata.gz is Tesseract's English model: the integer form of",
    "https://github.com/tesseract-ocr/tessdata_best (Apache License 2.0), as packaged by the",
    "tesseract.js project in @tesseract.js-data/eng (https://github.com/naptha/tessdata).",
    "",
  ].join("\n"),
);
if (!fs.existsSync(path.join(out, "server/workers/ocr.mjs"))) {
  throw new Error("The OCR worker was not bundled (server/workers/ocr.mjs is missing).");
}

// ── Everything else ────────────────────────────────────────────────────────
copyDir(path.join(root, "catalog"), path.join(out, "catalog"));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
fs.writeFileSync(path.join(out, "VERSION"), `${version}\n`);

let bytes = 0;
let files = 0;
(function measure(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) measure(full);
    else {
      bytes += fs.statSync(full).size;
      files += 1;
    }
  }
})(out);
log(`done: ${path.relative(root, out)} (${files} files, ${(bytes / 1e6).toFixed(1)} MB)`);

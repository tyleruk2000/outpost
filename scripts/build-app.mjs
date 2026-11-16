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
 *     THIRD-PARTY-LICENSES.txt  the licences of the projects bundled into the app
 *     server/ocr/               English language data for OCR (the engine itself is
 *                               WebAssembly inside workers/ocr.mjs)
 *     server/embed/             the model behind "search by meaning" and the
 *                               WebAssembly runtime that runs it, with their notices
 *     web/                      built web app, fonts and map assets included
 *     catalog/                  catalogue manifests
 *     engines/                  the HF propagation engine (WebAssembly), its data and
 *                               the solar cycle table, with their notices
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
  external: ["better-sqlite3", "pino-pretty", "sharp"],
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

// Search by meaning. The code that drives the model is in workers/embed.mjs. The
// runtime (ONNX Runtime compiled to WebAssembly) is two files that it loads by path, the
// same on every platform, and the model is three more, fetched beforehand by
// scripts/fetch-embedding-model.mjs. See modules/semantic/built-in-model.ts for where
// each is looked for.
const embedOut = path.join(out, "server/embed");
const embedModel = JSON.parse(fs.readFileSync(path.join(serverSrc, "modules/semantic/built-in-model.json"), "utf8"));
const fetchedModels = path.join(root, "apps/server/models");
fs.mkdirSync(embedOut, { recursive: true });
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  fs.copyFileSync(path.join(ocrPackage("onnxruntime-web"), "dist", name), path.join(embedOut, name));
}
if (!fs.existsSync(path.join(out, "server/workers/embed.mjs"))) {
  throw new Error("The embedding worker was not bundled (server/workers/embed.mjs is missing).");
}
const modelFiles = Object.values(embedModel.files);
if (modelFiles.every((file) => fs.existsSync(path.join(fetchedModels, embedModel.name, file.path)))) {
  for (const file of [...modelFiles.map((item) => item.path), "NOTICE.txt"]) {
    const target = path.join(embedOut, embedModel.name, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(fetchedModels, embedModel.name, file), target);
  }
  // The model's licence (Apache-2.0) and the runtime's (MIT, with the notices of what it is built from).
  fs.copyFileSync(
    path.join(ocrPackage("@huggingface/tokenizers"), "LICENSE"),
    path.join(embedOut, embedModel.name, "LICENSE-apache-2.0.txt"),
  );
  fs.copyFileSync(path.join(fetchedModels, "onnxruntime/LICENSE.txt"), path.join(embedOut, "LICENSE-onnxruntime.txt"));
  fs.copyFileSync(path.join(fetchedModels, "onnxruntime/ThirdPartyNotices.txt"), path.join(embedOut, "ThirdPartyNotices-onnxruntime.txt"));
} else {
  log(
    "WARNING: the search-by-meaning model is missing; the built-in option will say it is not installed. Run `node scripts/fetch-embedding-model.mjs` first.",
  );
}

// ── Everything else ────────────────────────────────────────────────────────
copyDir(path.join(root, "catalog"), path.join(out, "catalog"));

// HF propagation. The engine is WebAssembly that the propagation worker loads from a
// file, with the coefficient files it reads and the solar cycle table, all committed
// in engines/ (see scripts/build-hf-engine.mjs). The Rust sources of Outpost's bridge
// and the engine's fetched source are not needed to run it and stay behind.
const enginesOut = path.join(out, "engines");
copyDir(path.join(root, "engines/voacap/engine"), path.join(enginesOut, "voacap/engine"));
copyDir(path.join(root, "engines/voacap/data"), path.join(enginesOut, "voacap/data"));
fs.copyFileSync(path.join(root, "engines/voacap/NOTICE.txt"), path.join(enginesOut, "voacap/NOTICE.txt"));
copyDir(path.join(root, "engines/solar"), path.join(enginesOut, "solar"));
if (!fs.existsSync(path.join(out, "server/workers/propagation.mjs"))) {
  throw new Error("The propagation worker was not bundled (server/workers/propagation.mjs is missing).");
}
fs.copyFileSync(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
fs.writeFileSync(path.join(out, "VERSION"), `${version}\n`);

// ── Other people's licences ────────────────────────────────────────────────
// The bundles above contain other projects' code, and their licences ask that their
// notices travel with it. This lists every package the server and the web app depend on
// when running (a little more than what ends up in the bundles), each with the licence
// text found in the package.
/** Depended on by name, but replaced at build time and never shipped; see apps/web/vite.config.ts. */
const NOT_SHIPPED = new Set(["elkjs"]);
// Found by following "dependencies" from the two apps through node_modules, the way Node
// itself resolves them, so it needs nothing but the installed packages (no package store,
// which the Docker build does not keep).
const packages = new Map();
const visited = new Set();
function follow(dir) {
  const real = fs.realpathSync(dir);
  if (visited.has(real)) return;
  visited.add(real);
  const manifest = JSON.parse(fs.readFileSync(path.join(real, "package.json"), "utf8"));
  if (!manifest.private && !NOT_SHIPPED.has(manifest.name)) {
    const stated = manifest.license ?? manifest.licenses;
    const licence =
      typeof stated === "string" ? stated : Array.isArray(stated) ? stated.map((item) => item.type ?? item).join(" OR ") : stated?.type;
    const author = typeof manifest.author === "string" ? manifest.author : manifest.author?.name;
    const known = packages.get(manifest.name);
    packages.set(manifest.name, {
      name: manifest.name,
      versions: [...new Set([...(known?.versions ?? []), manifest.version])].sort(),
      paths: [...(known?.paths ?? []), real],
      licence: licence ?? "Unknown",
      author,
      homepage: manifest.homepage,
    });
  }
  if (NOT_SHIPPED.has(manifest.name)) return;
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    // Up through the folders above, as Node looks; an optional package for another platform is simply not there.
    for (let from = real; ; from = path.dirname(from)) {
      const candidate = path.join(from, "node_modules", name);
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        follow(candidate);
        break;
      }
      if (path.dirname(from) === from) break;
    }
  }
}
for (const app of ["apps/server", "apps/web"]) follow(path.join(root, app));
const noticeFile = /^(licen[cs]e|copying|notice)(\.|-|$)/i;
const sections = [...packages.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((item) => {
    const dir = item.paths?.[0];
    const texts = [];
    if (dir && fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir).sort()) {
        if (!noticeFile.test(name) || !fs.statSync(path.join(dir, name)).isFile()) continue;
        texts.push(fs.readFileSync(path.join(dir, name), "utf8").trim());
      }
    }
    const heading = `${item.name} ${(item.versions ?? []).join(", ")}`.trim();
    const facts = [`Licence: ${item.licence}`, item.author ? `Author: ${item.author}` : "", item.homepage ? item.homepage : ""].filter(
      Boolean,
    );
    const body =
      texts.length > 0 ? texts.join("\n\n") : "(The package ships no licence file; the licence named above is from its package.json.)";
    return `${"=".repeat(78)}\n${heading}\n${facts.join("\n")}\n${"=".repeat(78)}\n\n${body}\n`;
  });
if (sections.length < 50) throw new Error("The list of third-party licences came out almost empty; refusing to ship without it.");
fs.writeFileSync(
  path.join(out, "THIRD-PARTY-LICENSES.txt"),
  [
    "Outpost includes or depends on the following projects. Each is listed with its licence.",
    "Outpost itself is under the MIT licence in the file LICENSE beside this one.",
    "The OCR engine and its language data have their notices in server/ocr/.",
    "The search-by-meaning model and the runtime that runs it have theirs in server/embed/.",
    "The HF propagation engine (VOACAP) and its data have theirs in engines/voacap/.",
    "Map fonts, icons and data, and the catalogue's content, are credited in the app and in docs/architecture.md.",
    "",
    ...sections,
  ].join("\n"),
);
console.log(`[build-app] third-party licences: ${sections.length} packages`);

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

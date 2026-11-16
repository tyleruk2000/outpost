#!/usr/bin/env node
/**
 * Fetches the small language model behind "search by meaning", so that the packaged
 * app, the Docker image and portable drives carry it and Outpost never has to ask the
 * internet for it:
 *
 *   apps/server/models/<model name>/onnx/model_quantized.onnx   the model (about 23 MB)
 *   apps/server/models/<model name>/tokenizer.json              how text is cut into word pieces
 *   apps/server/models/<model name>/tokenizer_config.json
 *   apps/server/models/<model name>/NOTICE.txt                  where it came from, and its licence
 *   apps/server/models/onnxruntime/LICENSE.txt                  licence of the program that runs it
 *   apps/server/models/onnxruntime/ThirdPartyNotices.txt
 *
 * Which model, at which revision, and the checksum of every file are in
 * apps/server/src/modules/semantic/built-in-model.json; the server reads the same file.
 * A download that does not match its checksum is thrown away. These are build-time
 * downloads and are not committed (the folder is in .gitignore).
 *
 *   node scripts/fetch-embedding-model.mjs            fetch whatever is missing
 *   node scripts/fetch-embedding-model.mjs --force    fetch and overwrite everything
 *   node scripts/fetch-embedding-model.mjs --check    say what is there; fetch nothing
 *
 * Plain Node, no dependencies. Files that are already there and correct are left alone.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/server/src/modules/semantic/built-in-model.json"), "utf8"));
const modelsDir = path.join(root, "apps/server/models");
const modelDir = path.join(modelsDir, manifest.name);
const force = process.argv.includes("--force");
const checkOnly = process.argv.includes("--check");

/**
 * The model runs on ONNX Runtime compiled to WebAssembly (the onnxruntime-web package).
 * That package ships no licence file, so the texts are taken from the project's
 * repository at the commit of the release in use. Change these together with the
 * version of onnxruntime-web in apps/server/package.json.
 */
const RUNTIME = {
  version: "1.31.1",
  /** The commit tagged v1.31.1. */
  commit: "6af1a932e2286d5c58166085d24c68783033edee",
  files: [
    { from: "LICENSE", to: "LICENSE.txt", bytes: 1073, sha256: "2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c" },
    {
      from: "ThirdPartyNotices.txt",
      to: "ThirdPartyNotices.txt",
      bytes: 338088,
      sha256: "143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3",
    },
  ],
};

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** True when the file is there and is exactly the file the checksum names. */
function isCorrect(file, expected) {
  try {
    if (fs.statSync(file).size !== expected.bytes) return false;
    return sha256(fs.readFileSync(file)) === expected.sha256;
  } catch {
    return false;
  }
}

async function download(url, expected) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(
      `${url} is not the file that was expected (${bytes.length} bytes, SHA-256 ${sha256(bytes)}; wanted ${expected.bytes} bytes, ${expected.sha256}). Nothing was kept.`,
    );
  }
  return bytes;
}

/** Fetches one file unless a correct copy is already there. Returns true if it was fetched. */
async function ensure(target, url, expected, label) {
  if (!force && isCorrect(target, expected)) return false;
  if (checkOnly) throw new Error(`${label} is missing or does not match its checksum.`);
  console.log(`embedding-model: fetching ${label} (${megabytes(expected.bytes)}) …`);
  const bytes = await download(url, expected);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Written under another name first, so an interrupted run never leaves half a file under the real one.
  fs.writeFileSync(`${target}.part`, bytes);
  fs.renameSync(`${target}.part`, target);
  return true;
}

async function main() {
  const { source } = manifest;
  let fetched = 0;
  let total = 0;
  for (const file of Object.values(manifest.files)) {
    const url = `https://${source.host}/${source.repository}/resolve/${source.revision}/${file.path}`;
    if (await ensure(path.join(modelDir, file.path), url, file, `${manifest.name}/${file.path}`)) fetched += 1;
    total += file.bytes;
  }

  const installedRuntime = JSON.parse(fs.readFileSync(path.join(root, "apps/server/package.json"), "utf8")).dependencies["onnxruntime-web"];
  if (installedRuntime !== RUNTIME.version) {
    throw new Error(
      `apps/server depends on onnxruntime-web ${installedRuntime}, but this script holds the licence texts of ${RUNTIME.version}. Update RUNTIME in scripts/fetch-embedding-model.mjs.`,
    );
  }
  for (const file of RUNTIME.files) {
    const url = `https://raw.githubusercontent.com/microsoft/onnxruntime/${RUNTIME.commit}/${file.from}`;
    if (await ensure(path.join(modelsDir, "onnxruntime", file.to), url, file, `onnxruntime/${file.to}`)) fetched += 1;
  }

  if (!checkOnly) {
    fs.writeFileSync(
      path.join(modelDir, "NOTICE.txt"),
      [
        `Search by meaning in Outpost uses the sentence-embedding model ${manifest.name}.`,
        "",
        `The model was trained and published by the Sentence Transformers project as`,
        `https://${source.host}/${source.baseModel} under the Apache License 2.0.`,
        `These files are that model converted to ONNX and quantised to 8 bits for the`,
        `Transformers.js project, published as https://${source.host}/${source.repository}`,
        `(Apache License 2.0), at revision ${source.revision}.`,
        "They are unchanged; each was checked against a SHA-256 checksum when it was fetched:",
        "",
        ...Object.values(manifest.files).map((file) => `  ${file.sha256}  ${file.path}`),
        "",
        "The model card lists the public data the model was trained on, which includes",
        "collections with terms of their own (for example MS MARCO and Reddit comments).",
        "The model's publishers release the weights under Apache-2.0 all the same; if that",
        `matters to you, read https://${source.host}/${source.baseModel} before relying on it.`,
        "",
        "The model is run by ONNX Runtime (https://github.com/microsoft/onnxruntime, MIT",
        `licence, © Microsoft Corporation), version ${RUNTIME.version}, compiled to WebAssembly by that`,
        "project and published as the onnxruntime-web package. Text is cut into word pieces by",
        "@huggingface/tokenizers (Apache License 2.0).",
        "",
      ].join("\n"),
    );
  }

  console.log(
    fetched > 0
      ? `embedding-model: fetched ${fetched} files; ${manifest.name} is ready (${megabytes(total)}, ${manifest.licence}).`
      : `embedding-model: ${manifest.name} is already there and matches its checksums (${megabytes(total)}).`,
  );
}

main().catch((error) => {
  console.error(`embedding-model: ${error.message}`);
  process.exitCode = 1;
});

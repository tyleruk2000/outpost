/**
 * Where the VOACAP engine and its data are, and reading them with their checksums
 * checked. Nothing is used that does not match what was recorded when it was built:
 * a damaged coefficient file would give wrong predictions with no other sign.
 *
 *   <app>/engines/voacap/engine/voacap.wasm, engine.json
 *   <app>/engines/voacap/data/dataset.json, itshfbc/...
 *
 * `<app>` is the repository when running from source and the app folder when packaged
 * (`scripts/build-app.mjs` copies both folders). A copy of the data placed in
 * `<data directory>/propagation/voacap-data/` (the same two entries) is used in
 * preference to the included one; that is the seam for supplying the coefficients
 * separately from Outpost.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appRoot } from "../../../core/paths.ts";
import { EngineUnavailable } from "../engine.ts";

export interface EngineManifest {
  id: string;
  name: string;
  model: string;
  implementation: { name: string; version: string; repository: string; commit: string; committed: string; licence: string };
  build: { rustc: string; target: string; patch: string };
  wasm: { file: string; bytes: number; sha256: string };
}

export interface DatasetManifest {
  id: string;
  version: string;
  source: { repository: string; commit: string; path: string; committed: string };
  groups: Array<{
    id: string;
    title: string;
    description: string;
    bytes: number;
    files: Array<{ path: string; bytes: number; sha256: string }>;
  }>;
}

export interface VoacapPaths {
  /** Folder holding voacap.wasm and engine.json. */
  engineDir: string;
  /** Folders that may hold dataset.json and itshfbc/, in order of preference. */
  dataDirs: string[];
}

export function voacapPaths(dataDir: string): VoacapPaths {
  const home = path.join(appRoot, "engines/voacap");
  return { engineDir: path.join(home, "engine"), dataDirs: [path.join(dataDir, "propagation/voacap-data"), path.join(home, "data")] };
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function readJson<T>(file: string, what: string): T {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new EngineUnavailable(`${what} is missing (${file}). The HF propagation engine was not installed with this copy of Outpost.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new EngineUnavailable(`${what} cannot be read (${file}). Reinstall Outpost to put it back.`);
  }
}

export function readEngineManifest(paths: VoacapPaths): EngineManifest {
  return readJson<EngineManifest>(path.join(paths.engineDir, "engine.json"), "The propagation engine's description");
}

export interface LoadedEngineFile {
  manifest: EngineManifest;
  wasm: Uint8Array;
}

export function loadEngineFile(paths: VoacapPaths): LoadedEngineFile {
  const manifest = readEngineManifest(paths);
  const file = path.join(paths.engineDir, manifest.wasm.file);
  let wasm: Uint8Array;
  try {
    wasm = fs.readFileSync(file);
  } catch {
    throw new EngineUnavailable(
      `The propagation engine is missing (${file}). The HF propagation engine was not installed with this copy of Outpost.`,
    );
  }
  if (sha256(wasm) !== manifest.wasm.sha256) {
    throw new EngineUnavailable(
      `The propagation engine file is not the one this copy of Outpost was built with (${file}: its checksum does not match). Reinstall Outpost to put it back.`,
    );
  }
  return { manifest, wasm };
}

/** The first of the folders that holds a dataset, and its manifest. */
export function findDataset(paths: VoacapPaths): { dir: string; manifest: DatasetManifest; included: boolean } {
  for (const [index, dir] of paths.dataDirs.entries()) {
    if (!fs.existsSync(path.join(dir, "dataset.json"))) continue;
    return {
      dir,
      manifest: readJson<DatasetManifest>(path.join(dir, "dataset.json"), "The list of propagation data files"),
      included: index === paths.dataDirs.length - 1,
    };
  }
  throw new EngineUnavailable(
    `The ionospheric and noise coefficients the propagation engine needs are missing (looked in ${paths.dataDirs.join(" and ")}). Without them no prediction can be made.`,
  );
}

export interface LoadedDataset {
  manifest: DatasetManifest;
  dir: string;
  included: boolean;
  files: Array<[string, Uint8Array]>;
  bytes: number;
}

/** Reads every data file, refusing the whole set if any is missing or does not match its checksum. */
export function loadDataset(paths: VoacapPaths): LoadedDataset {
  const { dir, manifest, included } = findDataset(paths);
  const files: Array<[string, Uint8Array]> = [];
  let bytes = 0;
  for (const group of manifest.groups) {
    for (const entry of group.files) {
      // The names come from a manifest, which may be a person's own copy: keep them inside the folder.
      if (entry.path.split("/").some((part) => part === ".." || part === ""))
        throw new EngineUnavailable(`The list of propagation data files names a file outside its folder (${entry.path}).`);
      const file = path.join(dir, "itshfbc", entry.path);
      let content: Uint8Array;
      try {
        content = fs.readFileSync(file);
      } catch {
        throw new EngineUnavailable(
          `A propagation data file is missing: ${entry.path} (${group.title.toLowerCase()}), expected at ${file}. Without it no prediction can be made.`,
        );
      }
      if (sha256(content) !== entry.sha256) {
        throw new EngineUnavailable(
          `A propagation data file is damaged: ${entry.path} (${group.title.toLowerCase()}) does not match its checksum. Predictions are refused rather than made from it; reinstall Outpost, or replace the file at ${file}.`,
        );
      }
      files.push([entry.path, content]);
      bytes += content.length;
    }
  }
  return { manifest, dir, included, files, bytes };
}

/** Checksum of a dataset's manifest, which names every file's own checksum: one value that stands for the whole set. */
export function datasetFingerprint(dir: string): string | null {
  try {
    return sha256(fs.readFileSync(path.join(dir, "dataset.json")));
  } catch {
    return null;
  }
}

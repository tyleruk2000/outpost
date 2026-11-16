/**
 * Where the VOACAP engine and its data are, and reading them with their checksums
 * checked. Nothing is used that does not match what was recorded: a damaged coefficient
 * file would give wrong predictions with no other sign.
 *
 *   <app>/engines/voacap/engine/voacap.wasm, engine.json      shipped
 *   <app>/engines/voacap/data/dataset.json, itshfbc/...        shipped: antennas and version (NTIA/ITS)
 *   <app>/engines/voacap/coefficients.json                     shipped: the list of what is not
 *   <data directory>/propagation/voacap-coefficients/          not shipped: see coefficients.ts
 *
 * `<app>` is the repository when running from source and the app folder when packaged
 * (`scripts/build-app.mjs` copies what is shipped). The engine sees the two sets as one
 * folder, as VOACAP's own `itshfbc` tree.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appRoot } from "../../../core/paths.ts";
import { EngineUnavailable } from "../engine.ts";
import { type CoefficientsManifest, coefficientsManifest, readCoefficients, workingCopyDir } from "./coefficients.ts";

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
  /** Folder holding the shipped dataset.json and itshfbc/. */
  shippedDir: string;
  /** Folder holding the coefficients that are not shipped. */
  coefficientsDir: string;
  /** What those must be. Handed to the worker as it is, so that both threads check against the same list. */
  coefficients: CoefficientsManifest;
}

export function voacapPaths(dataDir: string, options: { coefficientsDir?: string; coefficients?: CoefficientsManifest } = {}): VoacapPaths {
  const home = path.join(appRoot, "engines/voacap");
  return {
    engineDir: path.join(home, "engine"),
    shippedDir: path.join(home, "data"),
    coefficientsDir: options.coefficientsDir ?? workingCopyDir(dataDir),
    coefficients: options.coefficients ?? coefficientsManifest(),
  };
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

export interface LoadedDataset {
  /** The shipped part's list. */
  manifest: DatasetManifest;
  coefficients: CoefficientsManifest;
  files: Array<[string, Uint8Array]>;
  bytes: number;
}

/**
 * Reads every data file, shipped and not, refusing the whole set if any is missing or
 * does not match its checksum. The coefficients are read first: when they are not here,
 * that is what a person is told, with what to press.
 */
export function loadDataset(paths: VoacapPaths): LoadedDataset {
  const coefficients = readCoefficients(paths.coefficientsDir, paths.coefficients);
  const manifest = readJson<DatasetManifest>(path.join(paths.shippedDir, "dataset.json"), "The list of propagation data files");
  const files: Array<[string, Uint8Array]> = [];
  for (const group of manifest.groups) {
    for (const entry of group.files) {
      if (entry.path.split("/").some((part) => part === ".." || part === ""))
        throw new EngineUnavailable(`The list of propagation data files names a file outside its folder (${entry.path}).`);
      const file = path.join(paths.shippedDir, "itshfbc", entry.path);
      let content: Uint8Array;
      try {
        content = fs.readFileSync(file);
      } catch {
        throw new EngineUnavailable(
          `A propagation data file is missing: ${entry.path} (${group.title.toLowerCase()}), expected at ${file}. Reinstall Outpost to put it back.`,
        );
      }
      if (sha256(content) !== entry.sha256) {
        throw new EngineUnavailable(
          `A propagation data file is damaged: ${entry.path} (${group.title.toLowerCase()}) does not match its checksum. Predictions are refused rather than made from it; reinstall Outpost to put it back.`,
        );
      }
      files.push([entry.path, content]);
    }
  }
  files.push(...coefficients);
  return { manifest, coefficients: paths.coefficients, files, bytes: files.reduce((sum, [, bytes]) => sum + bytes.length, 0) };
}

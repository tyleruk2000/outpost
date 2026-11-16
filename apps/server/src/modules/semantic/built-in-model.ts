/**
 * The embedding model that ships with Outpost, and where its files are.
 *
 * `built-in-model.json` names the model, the revision it was fetched at and the
 * checksum of every file; `scripts/fetch-embedding-model.mjs` reads the same file to
 * fetch them. From source the files are in `apps/server/models/`; in the packaged app
 * `scripts/build-app.mjs` copies them to `server/embed/`, beside the WebAssembly
 * runtime that runs them. Nothing here, or anywhere else in the built-in provider,
 * downloads anything.
 *
 * Runs in the server thread; the worker is handed the paths it should read.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRoot, isBundled, workerUrl } from "../../core/paths.ts";
import manifest from "./built-in-model.json" with { type: "json" };

export const BUILT_IN_PROVIDER = "built-in";

export interface ModelFile {
  /** Path inside the model's folder. */
  path: string;
  bytes: number;
  sha256: string;
}

/** Everything the worker needs to load the model and to make vectors the same way every time. */
export interface BuiltInModel {
  name: string;
  /** Numbers in each vector. */
  dimensions: number;
  /**
   * Most the model reads at once, in word pieces, counting the two markers at the ends.
   * A longer text is read in stretches; see `stretches.ts`.
   */
  maxTokens: number;
  licence: string;
  madeBy: string;
  languages: string;
  files: { model: ModelFile; tokenizer: ModelFile; tokenizerConfig: ModelFile };
}

export const BUILT_IN_MODEL: BuiltInModel = manifest;

/**
 * The name vectors are stored under: the model, its variant, and a fingerprint of the
 * exact files and of the settings that decide what a vector comes out as. A different
 * file, a different length limit, a different way of pooling or of reading a long text
 * gives a different name, so vectors made one way are never compared with vectors made
 * another.
 */
export function modelNameFor(model: {
  name: string;
  variant: string;
  maxTokens: number;
  pooling: string;
  longText: string;
  files: Record<"model" | "tokenizer" | "tokenizerConfig", { sha256: string }>;
}): string {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        model.files.model.sha256,
        model.files.tokenizer.sha256,
        model.files.tokenizerConfig.sha256,
        model.maxTokens,
        model.pooling,
        // One text at a time: an 8-bit model's arithmetic depends on what else is in the batch.
        "single",
        // How a text longer than the limit is read. The first built-in model cut it off.
        model.longText,
      ]),
    )
    .digest("hex")
    .slice(0, 8);
  return `${model.name}-${model.variant}-${fingerprint}`;
}

export const BUILT_IN_MODEL_NAME = modelNameFor(manifest);

export const BUILT_IN_MODEL_ID = `${BUILT_IN_PROVIDER}:${BUILT_IN_MODEL_NAME}`;

/** Where this installation keeps the model's files. */
export function defaultModelDir(): string {
  return isBundled ? path.join(appRoot, "server/embed", manifest.name) : path.join(appRoot, "apps/server/models", manifest.name);
}

/** The WebAssembly runtime: a small loader and the binary it loads. */
export interface RuntimeFiles {
  loader: string;
  binary: string;
}

/**
 * Packaged, the runtime's two files sit in `server/embed/` and the code that drives
 * them is part of the worker's bundle. From source they are in the `onnxruntime-web`
 * package.
 */
export function runtimeFiles(): RuntimeFiles | undefined {
  try {
    const files = isBundled
      ? {
          loader: path.join(appRoot, "server/embed/ort-wasm-simd-threaded.mjs"),
          binary: path.join(appRoot, "server/embed/ort-wasm-simd-threaded.wasm"),
        }
      : {
          loader: createRequire(import.meta.url).resolve("onnxruntime-web/ort-wasm-simd-threaded.mjs"),
          binary: createRequire(import.meta.url).resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"),
        };
    if (isBundled && !fs.statSync(fileURLToPath(embedWorkerUrl())).isFile()) return undefined;
    return fs.statSync(files.loader).isFile() && fs.statSync(files.binary).isFile() ? files : undefined;
  } catch {
    return undefined;
  }
}

export const embedWorkerUrl = () => workerUrl(new URL("./embed.worker.ts", import.meta.url), "embed");

const FROM_SOURCE_HINT = "Run `node scripts/fetch-embedding-model.mjs` once to fetch it.";

/**
 * Whether the model and its runtime are part of this installation. Sizes are compared
 * here because that is quick; the worker checks every file against its checksum when it
 * loads the model.
 */
export function builtInInstallation(modelDir: string): { installed: true } | { installed: false; reason: string } {
  for (const file of Object.values(BUILT_IN_MODEL.files)) {
    let size: number;
    try {
      size = fs.statSync(path.join(modelDir, file.path)).size;
    } catch {
      return {
        installed: false,
        reason: isBundled
          ? "The built-in model is not part of this installation: its files are missing from the app folder. Install Outpost again, or use a local embedding server."
          : `The built-in model has not been fetched yet. ${FROM_SOURCE_HINT}`,
      };
    }
    if (size !== file.bytes) {
      return {
        installed: false,
        reason: `The built-in model's file ${file.path} is the wrong size, so it is incomplete or damaged. ${
          isBundled ? "Install Outpost again." : FROM_SOURCE_HINT.replace("once to fetch it", "with --force to fetch it again")
        }`,
      };
    }
  }
  if (!runtimeFiles()) {
    return {
      installed: false,
      reason:
        "The program that runs the built-in model is missing from this installation. Install Outpost again, or use a local embedding server.",
    };
  }
  return { installed: true };
}

/**
 * How many processor threads the model may use: half of them, and never more than
 * four. More than four made no difference when measured, and the other half is left
 * for the server and whatever else the computer is doing.
 */
export function embedThreads(processors: number): number {
  return Math.max(1, Math.min(4, Math.floor(processors / 2)));
}

/**
 * Where the second model's engine and maps are, and reading them with their checksums
 * checked.
 *
 * Neither ships with Outpost. The engine is a WebAssembly file built on the computer
 * that runs Outpost from the ITU's own source (`scripts/build-p533-engine.mjs`); the
 * maps are the ITU's, downloaded when a person asks (`maps.ts`). Both must match the
 * checksums in `manifest.json`, which is Outpost's own record of what they are: a file
 * that does not match is refused and named, never run.
 *
 *   <data directory>/propagation/p533/iturhfprop.wasm   preferred
 *   <app>/engines/p533/engine/iturhfprop.wasm           where the build script puts it
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appRoot } from "../../../core/paths.ts";
import { EngineUnavailable } from "../engine.ts";
import builtIn from "./manifest.json" with { type: "json" };

export interface MapFile {
  /** The name the program asks for, in its data folder. */
  name: string;
  /** Where it is in the ITU's repository. */
  path: string;
  /** Where it starts in the downloaded bundle. */
  offset: number;
  bytes: number;
  sha256: string;
}

export interface MapsManifest {
  /** The files are fetched from here, each at its `path`. */
  baseUrl: string;
  /** Size and checksum of all the files one after another: the downloaded bundle. */
  bytes: number;
  sha256: string;
  files: MapFile[];
}

export interface P533Manifest {
  id: string;
  name: string;
  source: { repository: string; commit: string; committedAt: string; treeSha256: string; files: number };
  model: { p533: string; p372: string; program: string };
  build: { wasiSdk: string; baseImage: string; clang: string; dockerfile: string; glue: string; editsToItuSource: number };
  wasm: { file: string; bytes: number; sha256: string };
  references: Array<{ name: string; input: { bytes: number; sha256: string }; output: { bytes: number; sha256: string } }>;
  maps: MapsManifest;
}

export const P533_MANIFEST = builtIn as P533Manifest;

/** The size of the ITU's maps, for the line that says what to download. */
export const MAPS_BYTES = P533_MANIFEST.maps.bytes;

/**
 * The list of map files: the built-in one, or for testing one named by
 * OUTPOST_P533_MAPS_MANIFEST (a JSON file of the same shape), so that the download path
 * can be tried with small stand-ins from a local server.
 */
export function mapsManifest(overridePath: string | null): MapsManifest {
  if (!overridePath) return P533_MANIFEST.maps;
  try {
    return JSON.parse(fs.readFileSync(overridePath, "utf8")) as MapsManifest;
  } catch (error) {
    throw new EngineUnavailable(`The list of P.533 map files given in OUTPOST_P533_MAPS_MANIFEST cannot be read: ${String(error)}`);
  }
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function enginePaths(dataDir: string): string[] {
  return [
    path.join(dataDir, "propagation/p533", P533_MANIFEST.wasm.file),
    path.join(appRoot, "engines/p533/engine", P533_MANIFEST.wasm.file),
  ];
}

/** How to get the engine, in one sentence. */
export const BUILD_HINT =
  "Build it on this computer with node scripts/build-p533-engine.mjs (it needs Docker and the internet once, and fetches the ITU's source from its own repository).";

export interface FoundEngine {
  file: string;
  sha256: string;
}

/** Finds the engine file without reading it whole: for a status line. */
export function findEngine(dataDir: string): FoundEngine | null {
  for (const file of enginePaths(dataDir)) if (fs.existsSync(file)) return { file, sha256: P533_MANIFEST.wasm.sha256 };
  return null;
}

/** Reads the engine and checks it. Throws `EngineUnavailable`, with what to do, when it cannot be used. */
export function loadEngine(dataDir: string): { file: string; bytes: Uint8Array } {
  const found = findEngine(dataDir);
  if (!found) throw new EngineUnavailable(`The P.533 engine is not built on this computer. ${BUILD_HINT}`);
  const bytes = new Uint8Array(fs.readFileSync(found.file));
  if (sha256(bytes) !== P533_MANIFEST.wasm.sha256) {
    throw new EngineUnavailable(
      `The P.533 engine at ${found.file} is not the file Outpost expects (its checksum differs), so it is not used. Build it again with node scripts/build-p533-engine.mjs.`,
    );
  }
  return { file: found.file, bytes };
}

/**
 * The maps in a downloaded bundle: the files one after another, in the manifest's order.
 * Each is read only when asked for, checked against its own checksum the first time,
 * and kept for the next question.
 */
export class MapsBundle {
  private readonly cache = new Map<string, Uint8Array>();
  readonly file: string;
  readonly manifest: MapsManifest;
  constructor(file: string, manifest: MapsManifest) {
    this.file = file;
    this.manifest = manifest;
  }

  read(name: string): Uint8Array {
    const known = this.cache.get(name);
    if (known) return known;
    const entry = this.manifest.files.find((file) => file.name === name);
    if (!entry) throw new EngineUnavailable(`The P.533 maps have no file named ${name}.`);
    const bytes = new Uint8Array(entry.bytes);
    let fd: number;
    try {
      fd = fs.openSync(this.file, "r");
    } catch {
      throw new EngineUnavailable(`The P.533 maps are not where they were downloaded to (${this.file}). Download them again.`);
    }
    try {
      const read = fs.readSync(fd, bytes, 0, entry.bytes, entry.offset);
      if (read !== entry.bytes)
        throw new EngineUnavailable(`The P.533 maps at ${this.file} are shorter than they should be. Download them again.`);
    } finally {
      fs.closeSync(fd);
    }
    if (sha256(bytes) !== entry.sha256) {
      throw new EngineUnavailable(`${name} in the P.533 maps does not match its checksum, so it is not used. Download the maps again.`);
    }
    // A month's map is 11 MB; two months are kept, and the small tables always.
    const large = [...this.cache.keys()].filter((key) => key.startsWith("ionos"));
    if (name.startsWith("ionos") && large.length >= 2) this.cache.delete(large[0]!);
    this.cache.set(name, bytes);
    return bytes;
  }
}

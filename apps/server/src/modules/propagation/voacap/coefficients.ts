/**
 * The part of VOACAP's data that Outpost does not ship: the ionospheric and noise
 * coefficients, and two short-whip patterns, 15 files and 559 kB.
 *
 * The coefficient files hold the foF2 and M(3000)F2 maps of CCIR Report 340 and the
 * atmospheric noise of CCIR Report 322, with NTIA/ITS tables in the same files. The ITU
 * has not given permission for them to be passed on, so they are fetched from the engine's
 * own project, at the commit the engine was built from, when a person asks
 * (`../engine-data.ts`), or at set-up (`scripts/fetch-voacap-data.mjs`). Either way they
 * end up here, in the data directory, never on a storage location that may be away:
 *
 *   <data directory>/propagation/voacap-coefficients/coeffs/...            the files
 *   <data directory>/propagation/voacap-coefficients/antennas/default/...
 *   <data directory>/propagation/voacap-coefficients/installed.json         how and when
 *
 * `engines/voacap/coefficients.json` is Outpost's record of what they are: every file's
 * size and checksum. A set that is not whole, or a file that does not match, is refused
 * and named, never run. Nothing here reaches the network; this file is also read by the
 * propagation worker.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appRoot } from "../../../core/paths.ts";
import { EngineUnavailable } from "../engine.ts";

export interface CoefficientFile {
  /** Where it goes in the engine's data folder, and where it is under the source's `baseUrl`. */
  path: string;
  /** Where it starts in a downloaded bundle (the files one after another, in this order). */
  offset: number;
  bytes: number;
  sha256: string;
  /** What is in it, in words. */
  holds: string;
}

export interface CoefficientsManifest {
  id: string;
  title: string;
  version: string;
  source: { repository: string; commit: string; committed: string; path: string; baseUrl: string; read: string };
  /** Size and checksum of all the files one after another: the downloaded bundle. */
  bytes: number;
  sha256: string;
  files: CoefficientFile[];
}

/** How the files came to be in the data directory. */
export type CoefficientsOrigin = "downloaded" | "adopted" | "set-up";

export interface InstalledInfo {
  id: string;
  version: string;
  sha256: string;
  how: CoefficientsOrigin;
  /** The address or folder they came from. */
  from: string;
  /** When, as an ISO date and time. */
  at: string;
  /** The collection that stands for them in "Manage and clean up", when they were downloaded in the app. */
  collectionId?: string;
}

/** The engine cannot run because these files are not here: a person can fix that with one press. */
export class EngineDataMissing extends EngineUnavailable {
  constructor(message: string) {
    super(message);
    this.name = "EngineDataMissing";
  }
}

export const COEFFICIENTS_MANIFEST_FILE = path.join(appRoot, "engines/voacap/coefficients.json");
/** The tests' copy, filled by `node scripts/fetch-voacap-data.mjs --cache`. Never shipped, never used by the app. */
export const VOACAP_CACHE_DIR = path.join(appRoot, "engines/voacap/.cache");
/** Where the files of an earlier Outpost, which shipped them, are in its app folder or checkout. */
export const OLD_APP_COPY = path.join(appRoot, "engines/voacap/data/itshfbc");

export const workingCopyDir = (dataDir: string) => path.join(dataDir, "propagation/voacap-coefficients");
const INFO = "installed.json";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * The list of files: Outpost's own, or for testing one named by
 * OUTPOST_VOACAP_DATA_MANIFEST (a JSON file of the same shape), so that the download can be
 * tried against a local server.
 */
export function coefficientsManifest(overridePath: string | null = null): CoefficientsManifest {
  const file = overridePath ?? COEFFICIENTS_MANIFEST_FILE;
  let manifest: CoefficientsManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8")) as CoefficientsManifest;
  } catch (error) {
    throw new EngineUnavailable(
      overridePath
        ? `The list of VOACAP data files given in OUTPOST_VOACAP_DATA_MANIFEST cannot be read: ${String(error)}`
        : `The list of VOACAP data files is missing (${file}). Reinstall Outpost to put it back.`,
    );
  }
  for (const entry of manifest.files) {
    // Names that would leave the folder are refused before anything is read or written.
    if (entry.path.split("/").some((part) => part === ".." || part === "" || part === "."))
      throw new EngineUnavailable(`The list of VOACAP data files names a file outside its folder (${entry.path}).`);
  }
  return manifest;
}

export function readInstalledInfo(dir: string): InstalledInfo | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, INFO), "utf8")) as InstalledInfo;
  } catch {
    return null;
  }
}

/** What to say when the files are not here at all. */
export const missingLine = (manifest: CoefficientsManifest) =>
  `VOACAP's ionospheric and noise maps are not on this computer yet (${manifest.files.length} files, ${Math.round(manifest.bytes / 1000)} kB).`;

/**
 * Reads every file and checks it, refusing the whole set if any is missing or does not
 * match. 559 kB is read and hashed in a few milliseconds, so this is done every time the
 * engine is loaded.
 */
export function readCoefficients(dir: string, manifest: CoefficientsManifest): Array<[string, Uint8Array]> {
  const files: Array<[string, Uint8Array]> = [];
  for (const entry of manifest.files) {
    const file = path.join(dir, entry.path);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(fs.readFileSync(file));
    } catch {
      throw new EngineDataMissing(
        files.length === 0 && !fs.existsSync(dir)
          ? missingLine(manifest)
          : `VOACAP's data on this computer is not complete: ${entry.path} is missing (expected at ${file}), so nothing is predicted from it.`,
      );
    }
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new EngineDataMissing(
        `VOACAP's data on this computer is damaged: ${entry.path} does not match its checksum, so nothing is predicted from it.`,
      );
    }
    files.push([entry.path, bytes]);
  }
  return files;
}

/** The files of a downloaded bundle, each checked. */
export function splitBundle(bundle: Uint8Array, manifest: CoefficientsManifest): Map<string, Uint8Array> {
  if (bundle.length !== manifest.bytes || sha256(bundle) !== manifest.sha256)
    throw new EngineUnavailable("The downloaded VOACAP data is not the set Outpost expects, so it was not used.");
  const files = new Map<string, Uint8Array>();
  for (const entry of manifest.files) {
    const bytes = bundle.subarray(entry.offset, entry.offset + entry.bytes);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256)
      throw new EngineUnavailable(`${entry.path} in the downloaded VOACAP data does not match its checksum, so it was not used.`);
    files.set(entry.path, bytes);
  }
  return files;
}

/**
 * Puts a whole, checked set in the data directory. The files go into a folder beside it
 * first and that folder is renamed into place, so a set that is not whole is never where
 * the engine looks.
 */
export function writeWorkingCopy(
  dataDir: string,
  manifest: CoefficientsManifest,
  read: (entry: CoefficientFile) => Uint8Array,
  info: Omit<InstalledInfo, "id" | "version" | "sha256">,
): InstalledInfo {
  const target = workingCopyDir(dataDir);
  const partial = `${target}.partial`;
  fs.rmSync(partial, { recursive: true, force: true });
  for (const entry of manifest.files) {
    const bytes = read(entry);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256)
      throw new EngineUnavailable(`${entry.path} does not match its checksum, so the VOACAP data was not installed.`);
    fs.mkdirSync(path.dirname(path.join(partial, entry.path)), { recursive: true });
    fs.writeFileSync(path.join(partial, entry.path), bytes);
  }
  const written: InstalledInfo = { id: manifest.id, version: manifest.version, sha256: manifest.sha256, ...info };
  fs.writeFileSync(path.join(partial, INFO), `${JSON.stringify(written, null, 2)}\n`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(partial, target);
  return written;
}

/** Adds what is learned after the files are in place (the collection's id) to their record. */
export function updateInstalledInfo(dataDir: string, patch: Partial<InstalledInfo>): void {
  const dir = workingCopyDir(dataDir);
  const known = readInstalledInfo(dir);
  if (!known) return;
  fs.writeFileSync(path.join(dir, INFO), `${JSON.stringify({ ...known, ...patch }, null, 2)}\n`);
}

export function removeWorkingCopy(dataDir: string): void {
  fs.rmSync(workingCopyDir(dataDir), { recursive: true, force: true });
  fs.rmSync(`${workingCopyDir(dataDir)}.partial`, { recursive: true, force: true });
}

/** True when this folder holds every file, each matching. */
export function holdsVerifiedSet(dir: string, manifest: CoefficientsManifest): boolean {
  try {
    readCoefficients(dir, manifest);
    return true;
  } catch {
    return false;
  }
}

/**
 * An installation from before these files left the repository has them in its app
 * folder (or checkout), which the next deploy replaces. If the data directory does not
 * have them yet and one of these folders holds a whole, matching set, it is copied in, so
 * that nothing has to be downloaded. The folder it came from is left as it is.
 */
export function adoptCoefficients(dataDir: string, manifest: CoefficientsManifest, candidates: string[]): InstalledInfo | null {
  if (holdsVerifiedSet(workingCopyDir(dataDir), manifest)) return null;
  for (const candidate of candidates) {
    if (!holdsVerifiedSet(candidate, manifest)) continue;
    return writeWorkingCopy(dataDir, manifest, (entry) => new Uint8Array(fs.readFileSync(path.join(candidate, entry.path))), {
      how: "adopted",
      from: candidate,
      at: new Date().toISOString(),
    });
  }
  return null;
}

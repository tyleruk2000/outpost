/**
 * VOACAP's coefficients for the tests. They are not in the repository (see
 * engines/voacap/NOTICE.txt); a copy is kept on this computer in engines/voacap/.cache,
 * filled once with
 *
 *   node scripts/fetch-voacap-data.mjs --cache
 *
 * and checked against engines/voacap/coefficients.json before it is used. Every test
 * server is given that copy in its data directory, as a set-up would leave it, unless it
 * asks not to be. Tests that need the real engine use `describeWithVoacapData`: when the
 * copy is not here they are reported as skipped, by name, with what is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { describe } from "vitest";
import {
  coefficientsManifest,
  holdsVerifiedSet,
  VOACAP_CACHE_DIR,
  workingCopyDir,
  writeWorkingCopy,
} from "../src/modules/propagation/voacap/coefficients.ts";

export const VOACAP_CACHE = process.env.OUTPOST_VOACAP_CACHE ?? VOACAP_CACHE_DIR;
const manifest = coefficientsManifest();

/** Why the real data is not here, or null when it is. */
export const voacapDataAbsent: string | null = holdsVerifiedSet(VOACAP_CACHE, manifest)
  ? null
  : `VOACAP's coefficients are not in ${VOACAP_CACHE} (fill it once, with the internet, by: node scripts/fetch-voacap-data.mjs --cache)`;

/** Puts the tests' copy where Outpost keeps its own. False when there is no copy to put. */
export function seedVoacapData(dataDir: string): boolean {
  if (voacapDataAbsent) return false;
  if (holdsVerifiedSet(workingCopyDir(dataDir), manifest)) return true;
  writeWorkingCopy(dataDir, manifest, (entry) => new Uint8Array(fs.readFileSync(path.join(VOACAP_CACHE, entry.path))), {
    how: "set-up",
    from: VOACAP_CACHE,
    at: new Date().toISOString(),
  });
  return true;
}

/** `describe` for tests that need the real engine and its data. */
export function describeWithVoacapData(name: string, body: () => void): void {
  if (voacapDataAbsent) {
    console.warn(`[voacap data] skipped "${name}": ${voacapDataAbsent}`);
    describe.skip(`${name} (skipped: VOACAP's coefficients are not on this computer)`, body);
  } else describe(name, body);
}

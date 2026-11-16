/**
 * The second model held to the ITU's own reference: its nine reference inputs, run
 * through the WebAssembly build exactly as Outpost runs it (the same shim, the same
 * program, a fresh instance each time), must print the ITU's committed outputs.
 *
 * Nothing of the ITU's is in Outpost's repository, so this needs, on this computer:
 *
 *   engines/p533/engine/iturhfprop.wasm   node scripts/build-p533-engine.mjs
 *   engines/p533/.upstream/               fetched by the same script (the nine cases)
 *   engines/p533/.cache/maps/             node scripts/build-p533-engine.mjs --maps
 *
 * Each is checked against the checksums in manifest.json before it is used. When any is
 * missing every case is reported as skipped, by name, with what is missing.
 *
 * Tolerance: none. Every line must be identical, character for character, except
 * line 3 (the date ITURHFProp was compiled) and line 6 (the time the analysis was
 * run), which say when, not what. Those two are checked to be those lines.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appRoot } from "../src/core/paths.ts";
import { P533_MANIFEST } from "../src/modules/propagation/p533/files.ts";
import { compileProgram, runProgram } from "../src/modules/propagation/p533/program.ts";

const home = path.join(appRoot, "engines/p533");
const wasmFile = path.join(home, "engine", P533_MANIFEST.wasm.file);
const bin = path.join(home, ".upstream/ITURHFProp/Bin");
const mapsDir = process.env.OUTPOST_P533_MAPS_DIR ?? path.join(home, ".cache/maps");
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function missing(): string | null {
  if (!fs.existsSync(wasmFile)) return `${wasmFile} is not built (node scripts/build-p533-engine.mjs)`;
  if (sha(wasmFile) !== P533_MANIFEST.wasm.sha256) return `${wasmFile} does not match the recorded checksum`;
  if (!fs.existsSync(bin)) return `the ITU's reference cases are not fetched (${bin})`;
  for (const file of P533_MANIFEST.maps.files) {
    if (!fs.existsSync(path.join(mapsDir, file.name)))
      return `the ITU's maps are not in ${mapsDir} (node scripts/build-p533-engine.mjs --maps)`;
  }
  return null;
}

const absent = missing();
if (absent) console.warn(`[p533 reference] skipped: ${absent}`);

describe("P.533 against the ITU's own reference outputs", () => {
  const program = absent ? null : compileProgram(new Uint8Array(fs.readFileSync(wasmFile)));
  const files = new Map<string, Uint8Array>();
  if (!absent) {
    // Exactly what the inputs ask for: DataFilePath "../Data/" (the shim keeps ".." at the
    // top), and the two antenna files, under the names the inputs give them.
    for (const file of P533_MANIFEST.maps.files)
      files.set(`Data/${file.name}`, new Uint8Array(fs.readFileSync(path.join(mapsDir, file.name))));
    files.set("dipole_14mhz_10m_aagl.13", new Uint8Array(fs.readFileSync(path.join(bin, "dipole_14mhz_10m_aagl.13"))));
    files.set(
      "Data/Antenna/T13 Files/201-6_0.T13",
      new Uint8Array(fs.readFileSync(path.join(home, ".upstream/ITURHFProp/Data/Antenna/T13 Files/201-6_0.t13"))),
    );
  }

  for (const reference of P533_MANIFEST.references) {
    it.skipIf(absent !== null)(`prints what the ITU committed: ${reference.name}`, () => {
      const input = path.join(bin, `${reference.name}.in`);
      const output = path.join(bin, `${reference.name}.out`);
      expect(sha(input)).toBe(reference.input.sha256);
      expect(sha(output)).toBe(reference.output.sha256);
      const run = runProgram(program!, fs.readFileSync(input, "latin1"), files);
      expect(run.code).toBe(0);
      const mine = run.report.split("\n");
      const theirs = fs.readFileSync(output, "latin1").split("\n");
      expect(mine.length).toBe(theirs.length);
      expect(mine[2]).toMatch(/^ {5}ITURHFProp {9}Ver [A-Z][a-z]{2} [ \d]\d \d{4}$/);
      expect(mine[5]).toMatch(/^ {5}Analysis Prepared {2}/);
      for (let i = 0; i < theirs.length; i++) {
        if (i === 2 || i === 5) continue;
        expect(mine[i], `line ${i + 1}`).toBe(theirs[i]);
      }
    });
  }

  it("has all nine reference cases recorded", () => {
    expect(P533_MANIFEST.references.map((item) => item.name)).toHaveLength(9);
  });
});

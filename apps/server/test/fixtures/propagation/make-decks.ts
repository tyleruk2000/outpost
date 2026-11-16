/**
 * Writes, for each reference circuit, what the original Fortran VOACAP needs to answer
 * it: the card deck Outpost's engine states the question as, and the two antenna files.
 *
 *   node apps/server/test/fixtures/propagation/make-decks.ts <folder>
 *
 * gives <folder>/<id>.dat, <id>.tx and <id>.rx (and <id>.outpost.out, what Outpost's own
 * engine prints). `voacapl.Dockerfile` beside this file builds the Fortran and says how to
 * run the decks through it; keep its output here as <id>.voacapl.out.
 */
import fs from "node:fs";
import path from "node:path";
import { antennaFile } from "../../../src/modules/propagation/voacap/antenna-files.ts";
import { VOACAP_CACHE_DIR } from "../../../src/modules/propagation/voacap/coefficients.ts";
import { createVoacapEngine } from "../../../src/modules/propagation/voacap/engine.ts";
import { voacapPaths } from "../../../src/modules/propagation/voacap/files.ts";
import { REFERENCE_CASES } from "./cases.ts";

const out = process.argv[2];
if (!out) throw new Error("Give a folder to write to.");
fs.mkdirSync(out, { recursive: true });
// VOACAP's coefficients from the tests' copy: node scripts/fetch-voacap-data.mjs --cache
const engine = createVoacapEngine(voacapPaths(path.join(out, "no-data-directory"), { coefficientsDir: VOACAP_CACHE_DIR }));
for (const item of REFERENCE_CASES) {
  fs.writeFileSync(path.join(out, `${item.id}.dat`), engine.circuit(item.request).deck);
  fs.writeFileSync(path.join(out, `${item.id}.tx`), antennaFile(item.request.txAntenna));
  fs.writeFileSync(path.join(out, `${item.id}.rx`), antennaFile(item.request.rxAntenna));
  fs.writeFileSync(path.join(out, `${item.id}.outpost.out`), engine.listing(item.request));
}
console.log(`Wrote ${REFERENCE_CASES.length} decks to ${out}`);

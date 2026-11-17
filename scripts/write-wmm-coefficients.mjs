#!/usr/bin/env node
/**
 * Writes packages/shared/src/wmm-coefficients.ts from NOAA's coefficient file, so that a
 * new World Magnetic Model can be put in the same way this one was:
 *
 *   1. Download the coefficients by hand from NOAA NCEI
 *      (https://www.ncei.noaa.gov/products/world-magnetic-model/wmm-coefficients),
 *      unzip it, and find WMM.COF.
 *   2. node scripts/write-wmm-coefficients.mjs path/to/WMM.COF
 *   3. Put the new test values in apps/server/test/fixtures/wmm/ and run
 *      apps/server/test/wmm.test.ts, then update docs/tools-compass.md.
 *
 * The file's lines are kept exactly as NOAA wrote them, so the result can be compared
 * with the original by eye or with diff. Nothing is fetched here.
 */
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/write-wmm-coefficients.mjs path/to/WMM.COF");
  process.exit(1);
}
const lines = fs
  .readFileSync(source, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "" && !/^9{20,}/.test(line.trim()));
const [header, ...rows] = lines;
const match = /^\s*(\d{4}\.\d)\s+(\S+)\s+(\S+)/.exec(header ?? "");
if (!match || rows.length !== 90) {
  console.error(`Not a degree-12 WMM coefficient file: header "${header}", ${rows.length} rows (expected 90).`);
  process.exit(1);
}
const [, epoch, name, released] = match;
const end = (Number(epoch) + 5).toFixed(1);
const out = `/**
 * The coefficients of the World Magnetic Model ${name.replace("-", "")}, exactly as NOAA's coefficient file WMM.COF gives them.
 *
 * Model: World Magnetic Model ${name.replace("WMM-", "")}, epoch ${epoch}, valid from ${epoch} to ${end}
 * (NOAA: "WMM is valid for five years from the Model Epoch"). File dated ${released}.
 * Each row: degree n, order m, g and h (nT) at the epoch, and their rates of change (nT a year).
 *
 * Source: NOAA National Centers for Environmental Information and the British Geological
 * Survey, World Magnetic Model coefficients,
 * https://www.ncei.noaa.gov/products/world-magnetic-model/wmm-coefficients (WMM2025COF.zip),
 * downloaded 2026-11-17. Cite as: NOAA NCEI Geomagnetic Modeling Team; British Geological
 * Survey. 2024: World Magnetic Model 2025. NOAA National Centers for Environmental
 * Information. https://doi.org/10.25921/aqfd-sd83.
 *
 * Not subject to copyright: NOAA states that "The WMM source code is in the public domain
 * and not licensed or under copyright" and "The information and software may be used
 * freely by the public." As 17 U.S.C. 403 asks, this file is U.S. Government material,
 * incorporated unchanged, and is not subject to copyright protection; Outpost's MIT
 * licence does not cover it.
 *
 * Written by scripts/write-wmm-coefficients.mjs from ${path.basename(source)}; do not edit by hand.
 */
export const WMM_COF = \`${[header, ...rows].join("\n")}\`;
`;
const target = path.resolve(import.meta.dirname, "../packages/shared/src/wmm-coefficients.ts");
fs.writeFileSync(target, out);
console.log(`Wrote ${path.relative(process.cwd(), target)}: ${name}, epoch ${epoch}, ${rows.length} rows.`);

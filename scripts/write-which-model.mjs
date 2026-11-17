// Writes docs/which-model.md from the one data file of measured results, so that the
// page in the repository and the "Which model" screen inside Outpost say the same thing.
//
//   node scripts/write-which-model.mjs          write the file
//   node scripts/write-which-model.mjs --check  fail if the file is out of date
//
// The source is packages/shared/src/model-trials.ts.
import fs from "node:fs";
import path from "node:path";
import { whichModelMarkdown } from "../packages/shared/src/model-trials-doc.ts";

const file = path.resolve(import.meta.dirname, "..", "docs", "which-model.md");
const wanted = whichModelMarkdown();
if (process.argv.includes("--check")) {
  const found = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (found !== wanted) {
    console.error("docs/which-model.md is out of date. Run `node scripts/write-which-model.mjs`.");
    process.exit(1);
  }
  console.log("docs/which-model.md is up to date.");
} else {
  fs.writeFileSync(file, wanted);
  console.log(`Wrote ${path.relative(process.cwd(), file)}.`);
}

// Writes docs/setup-guide.md from the guide's one source, so that the page in the
// repository and the page inside Outpost say the same thing in the same order.
//
//   node scripts/write-setup-guide.mjs          write the file
//   node scripts/write-setup-guide.mjs --check  fail if the file is out of date
//
// The source is packages/shared/src/setup-guide.ts (the words) and
// packages/shared/src/recommended-models.ts (the list of models).
import fs from "node:fs";
import path from "node:path";
import { guideMarkdown } from "../packages/shared/src/setup-guide.ts";

const file = path.resolve(import.meta.dirname, "..", "docs", "setup-guide.md");
const wanted = guideMarkdown();
if (process.argv.includes("--check")) {
  const found = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (found !== wanted) {
    console.error("docs/setup-guide.md is out of date. Run `node scripts/write-setup-guide.mjs`.");
    process.exit(1);
  }
  console.log("docs/setup-guide.md is up to date.");
} else {
  fs.writeFileSync(file, wanted);
  console.log(`Wrote ${path.relative(process.cwd(), file)}.`);
}

// Writes docs/radio-licences.md from the statements behind the licence notices, so that the
// page in the repository and the radio screens' one-line notices rest on the same words.
//
//   node scripts/write-radio-licences.mjs          write the file
//   node scripts/write-radio-licences.mjs --check  fail if the file is out of date
//
// The source is packages/shared/src/radio-licence-statements.ts.
import fs from "node:fs";
import path from "node:path";
import { radioLicencesMarkdown } from "../packages/shared/src/radio-licence-doc.ts";

const file = path.resolve(import.meta.dirname, "..", "docs", "radio-licences.md");
const wanted = radioLicencesMarkdown();
if (process.argv.includes("--check")) {
  const found = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (found !== wanted) {
    console.error("docs/radio-licences.md is out of date. Run `node scripts/write-radio-licences.mjs`.");
    process.exit(1);
  }
  console.log("docs/radio-licences.md is up to date.");
} else {
  fs.writeFileSync(file, wanted);
  console.log(`Wrote ${path.relative(process.cwd(), file)}.`);
}

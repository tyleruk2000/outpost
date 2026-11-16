#!/usr/bin/env node
/**
 * Checks that every relative link in README.md leads somewhere: the file exists, and an
 * anchor (#…) names a heading in that file, made into an address the way GitHub makes
 * one. Links to other sites are not fetched.
 *
 *   node scripts/check-readme-links.mjs [file.md ...]
 *
 * Exits 1 and lists what is broken, 0 when nothing is.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = process.argv.length > 2 ? process.argv.slice(2) : ["README.md"];

/** Markdown with fenced code blocks taken out, so that `# comment` in a shell example is not a heading. */
function withoutCode(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
}

/** The anchors GitHub gives the headings of a Markdown file. */
const anchorCache = new Map();
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const seen = new Map();
  const anchors = new Set();
  for (const line of withoutCode(fs.readFileSync(file, "utf8")).split("\n")) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const slug = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  // Explicit anchors: <a id="…"> or name="…".
  for (const match of fs.readFileSync(file, "utf8").matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(match[1]);
  anchorCache.set(file, anchors);
  return anchors;
}

const problems = [];
let checked = 0;
for (const name of files) {
  const file = path.resolve(root, name);
  const text = withoutCode(fs.readFileSync(file, "utf8")).replace(/`[^`\n]*`/g, "");
  const targets = [
    ...[...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/<(?:a|img)\s[^>]*(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
  ];
  for (const target of targets) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // https:, mailto: and the like
    checked += 1;
    const [pathPart, anchor] = target.split("#");
    const linked = pathPart ? path.resolve(path.dirname(file), decodeURIComponent(pathPart)) : file;
    if (!fs.existsSync(linked)) {
      problems.push(`${name}: ${target}: no such file`);
      continue;
    }
    if (anchor !== undefined) {
      if (!linked.endsWith(".md")) {
        problems.push(`${name}: ${target}: an anchor into a file that is not Markdown`);
      } else if (!anchorsOf(linked).has(anchor)) {
        problems.push(`${name}: ${target}: no heading makes #${anchor}`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`${problems.length} of ${checked} relative links are broken.`);
  process.exit(1);
}
console.log(`${checked} relative links checked; all lead somewhere.`);

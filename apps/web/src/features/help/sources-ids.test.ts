/**
 * docs/sources.md numbers each source in its table (C1, C2a, RA4…) and other rows and
 * pages refer to a source by that number, so no number may be given to two rows, in one
 * table or in two (the radio sources are RA, the reference layers RL).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repo = path.resolve(import.meta.dirname, "../../../../..");
const sources = path.join(repo, "docs/sources.md");

/** The numbers given in sources.md: a table row's first cell, or a source named in a note beginning "Also", "the NTI Index (RL10)". */
function given(): Set<string> {
  const ids = new Set<string>();
  for (const line of fs.readFileSync(sources, "utf8").split("\n")) {
    const row = /^\| ([A-Z]*\d+[a-z]?) \|/.exec(line)?.[1];
    if (row) ids.add(row);
    if (line.startsWith("Also")) for (const match of line.matchAll(/\(([A-Z]+\d+[a-z]?)\)/g)) ids.add(match[1]!);
  }
  return ids;
}

function* files(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(md|ts|tsx|json|ya?ml)$/.test(entry.name)) yield full;
  }
}

describe("the numbers of the sources", () => {
  it("are given once in the whole page", () => {
    const repeated: string[] = [];
    const seen = new Set<string>();
    for (const line of fs.readFileSync(sources, "utf8").split("\n")) {
      const id = /^\| ([A-Z]*\d+[a-z]?) \|/.exec(line)?.[1];
      if (!id) continue;
      if (seen.has(id)) repeated.push(id);
      seen.add(id);
    }
    expect(repeated).toEqual([]);
  });

  it("name only sources the page has, wherever docs/, the catalogue and the code refer to one", () => {
    const ids = given();
    // The prefixes only sources.md uses (radio, reference layers, audiobooks): elsewhere "R16" is ComReg's revision 16.
    const reference = /\b(?:RA|RL|AU)\d+[a-z]?\b/g;
    const unknown: string[] = [];
    for (const dir of ["docs", "catalog/manifests", "apps/server/src", "apps/web/src", "packages/shared/src"]) {
      for (const file of files(path.join(repo, dir))) {
        if (file === import.meta.filename) continue;
        for (const [line, words] of fs.readFileSync(file, "utf8").split("\n").entries()) {
          for (const match of words.matchAll(reference)) {
            if (!ids.has(match[0])) unknown.push(`${path.relative(repo, file)}:${line + 1} ${match[0]}`);
          }
        }
      }
    }
    expect(unknown).toEqual([]);
  });
});

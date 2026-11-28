/**
 * docs/sources.md numbers each source in its table (C1, C2a, RA4…) and other rows and
 * pages refer to a source by that number, so no number may be given to two rows, in one
 * table or in two (the radio sources are RA, the reference layers RL).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sources = path.resolve(import.meta.dirname, "../../../../../docs/sources.md");

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
});

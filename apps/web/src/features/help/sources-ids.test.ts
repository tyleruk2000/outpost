/**
 * docs/sources.md numbers each source in its table (C1, C2a, R4…) and other rows and
 * pages refer to a source by that number, so no table may give one number to two rows.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sources = path.resolve(import.meta.dirname, "../../../../../docs/sources.md");

describe("the numbers of the sources", () => {
  it("are given once in each table", () => {
    const repeated: string[] = [];
    let seen = new Set<string>();
    for (const line of fs.readFileSync(sources, "utf8").split("\n")) {
      if (!line.startsWith("|")) {
        seen = new Set();
        continue;
      }
      const id = /^\| ([A-Z]*\d+[a-z]?) \|/.exec(line)?.[1];
      if (!id) continue;
      if (seen.has(id)) repeated.push(id);
      seen.add(id);
    }
    expect(repeated).toEqual([]);
  });
});

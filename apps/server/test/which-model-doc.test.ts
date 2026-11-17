import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { whichModelMarkdown } from "../../../packages/shared/src/model-trials-doc.ts";

describe("which model", () => {
  it("is the same in the documentation as inside Outpost: docs/which-model.md is what its one data file writes", () => {
    const file = path.resolve(import.meta.dirname, "../../../docs/which-model.md");
    // Out of date? Run `node scripts/write-which-model.mjs`.
    expect(fs.readFileSync(file, "utf8")).toBe(whichModelMarkdown());
  });
});

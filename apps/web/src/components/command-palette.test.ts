import { describe, expect, it } from "vitest";
import { matchesWords } from "./command-palette";

describe("matching places and actions in the palette", () => {
  it("matches everything when nothing is typed", () => {
    expect(matchesWords("Settings", "")).toBe(true);
    expect(matchesWords("Settings", "   ")).toBe(true);
  });

  it("matches the start of any word, in any order, ignoring case", () => {
    expect(matchesWords("Settings", "sett")).toBe(true);
    expect(matchesWords("Import pages from Markdown or Notion", "notion imp")).toBe(true);
    expect(matchesWords("See how search works", "SEARCH")).toBe(true);
  });

  it("does not match letters scattered through a label", () => {
    expect(matchesWords("Import pages from Markdown or Notion", "sett")).toBe(false);
    expect(matchesWords("Storage", "sett")).toBe(false);
    expect(matchesWords("Settings", "ettings")).toBe(false);
  });
});

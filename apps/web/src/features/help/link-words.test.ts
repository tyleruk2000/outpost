/**
 * A link from one guide to another reads as the other guide's title under Help, not as the name of its file
 * ("api.md"), which is how the page reads on GitHub (guides-plugin.ts).
 */
import { GUIDE_INDEX, GUIDE_LOADERS } from "virtual:outpost-guides";
import { describe, expect, it } from "vitest";

type Run = { t: string; v?: string; c?: Run[]; [key: string]: unknown };
type Block = { t: string; c?: unknown; items?: Array<{ c: Block[] }>; rows?: Run[][][] };

const words = (runs: Run[] | undefined): string => (runs ?? []).map((run) => run.v ?? words(run.c)).join("");

function chapterLinks(blocks: Block[], found: string[] = []): string[] {
  const visit = (runs: Run[] | undefined) => {
    for (const run of runs ?? []) {
      if (run.t === "chapter") found.push(words(run.c));
      visit(run.c);
    }
  };
  for (const block of blocks) {
    if (block.t === "heading" || block.t === "paragraph") visit(block.c as Run[]);
    else if (block.t === "quote") chapterLinks(block.c as Block[], found);
    else if (block.t === "list") for (const item of block.items ?? []) chapterLinks(item.c, found);
    else if (block.t === "table") for (const row of block.rows ?? []) for (const cell of row) visit(cell);
  }
  return found;
}

describe("links between guides", () => {
  it("read as the guide's title, never as a file's name", async () => {
    const all: string[] = [];
    for (const load of Object.values(GUIDE_LOADERS)) all.push(...chapterLinks((await load()).default as Block[]));
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((text) => /\.md\b/.test(text))).toEqual([]);
    // "api.md" in the search guide is now the API guide's title.
    const search = chapterLinks((await GUIDE_LOADERS.search!()).default as Block[]);
    expect(search.some((text) => text.startsWith(GUIDE_INDEX.api!.title))).toBe(true);
  });
});

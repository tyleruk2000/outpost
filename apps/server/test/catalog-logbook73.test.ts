/**
 * The ham radio books generated from LogBook73 (apps/server/src/cli/import-logbook73.ts),
 * as they are committed in catalog/: every chapter, every link, the packs that offer them.
 */
import fs from "node:fs";
import path from "node:path";
import type { MarkdownBlock, MarkdownInline } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { chaptersOf, loadCatalog } from "../src/modules/catalog/manifest.ts";
import { loadPacks } from "../src/modules/catalog/packs.ts";
import { markdownSections } from "../src/modules/documents/extract-text.ts";
import { markdownBlocks, parseOutpostLink } from "../src/modules/documents/markdown-view.ts";

const repoCatalogDir = path.resolve(import.meta.dirname, "../../../catalog");

/** Every inline run of a tree of blocks, wherever it sits. */
function runsOf(blocks: MarkdownBlock[]): MarkdownInline[] {
  const inlines = (runs: MarkdownInline[]): MarkdownInline[] => runs.flatMap((run) => ("c" in run ? [run, ...inlines(run.c)] : [run]));
  return blocks.flatMap((block) => {
    switch (block.t) {
      case "heading":
      case "paragraph":
        return inlines(block.c);
      case "quote":
        return runsOf(block.c);
      case "list":
        return block.items.flatMap((item) => runsOf(item.c));
      case "table":
        return block.rows.flatMap((row) => row.flatMap(inlines));
      default:
        return [];
    }
  });
}

describe("the books shipped with Outpost", () => {
  const catalog = loadCatalog([path.join(repoCatalogDir, "manifests")]);
  const books = catalog.entries.filter((entry) => entry.source.type === "bundled" && entry.source.book);
  const keysOf = new Map(
    books.map((entry) => [
      entry.id,
      new Set(entry.source.type === "bundled" && entry.source.book ? chaptersOf(entry.source.book).map((chapter) => chapter.key) : []),
    ]),
  );

  it("are the handbook and one guide per radio, each with its review date, licence and an honest note", () => {
    expect(catalog.problems).toEqual([]);
    expect(books.map((entry) => entry.id)).toContain("logbook73.handbook");
    expect(books.filter((entry) => entry.id.startsWith("logbook73.guide.")).length).toBeGreaterThanOrEqual(15);
    for (const entry of books) {
      expect(entry, entry.id).toMatchObject({
        category: "radio",
        publisher: "LogBook73",
        license: "MIT",
        format: "markdown",
        language: "en",
      });
      expect(entry.source.type === "bundled" && entry.source.version, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
      expect(entry.licenseNote, entry.id).toMatch(/Written by Tyler Allen for LogBook73/);
      expect(entry.licenseNote, entry.id).toMatch(/not legal advice/);
      expect(entry.licenseNote, entry.id).toMatch(/Outpost has not checked/);
      // The licence line in Explore reads "not verified" from these words, which would be wrong here: the licence is known.
      expect(entry.licenseNote, entry.id).not.toMatch(/not (?:been )?verified/i);
      expect(entry.attribution, entry.id).toMatch(/Copyright \(c\) 2026 Tyler Allen/);
      expect(catalog.books.get(entry.id)?.chapters.length, entry.id).toBeGreaterThanOrEqual(10);
      // The review date is the guide's own, not the day this copy was made.
      if (entry.id.startsWith("logbook73.guide."))
        expect(entry.licenseNote, entry.id).toMatch(/LogBook73 reviewed it on \d{1,2} \w+ 20\d\d/);
    }
    // No planned, unwritten chapter came across, and the manifest says which commit it was made from.
    const manifest = catalog.manifests.find((item) => item.id === "logbook73");
    expect(manifest?.description).toMatch(/from LogBook73 commit [0-9a-f]{40} \(\d{4}-\d{2}-\d{2}\)/);
    expect(manifest?.downloadHosts).toEqual([]);
  });

  it("end with a chapter that gives the review, what was not carried over, and the licence in full", () => {
    for (const entry of books) {
      const last = catalog.books.get(entry.id)!.chapters.at(-1)!;
      expect(last.key, entry.id).toBe("about-this-book");
      const text = fs.readFileSync(last.path, "utf8");
      expect(text, entry.id).toMatch(/Permission is hereby granted, free of charge/);
      expect(text, entry.id).toMatch(/Copyright \(c\) 2026 Tyler Allen/);
      expect(text, entry.id).toMatch(/Not carried over from LogBook73/);
      expect(text, entry.id).toMatch(/not legal advice/);
      if (entry.id.startsWith("logbook73.guide.")) {
        expect(text, entry.id).toMatch(/## How it was reviewed/);
        expect(text, entry.id).toMatch(/\| Firmware \| .+ \|/);
        expect(text, entry.id).toMatch(/\]\(https:\/\//);
        expect(text, entry.id).toMatch(/Outpost has not checked the guide against those manuals again/);
      }
    }
  });

  it("link only to chapters that exist, to web addresses, or to headings of the same chapter", () => {
    let refs = 0;
    let jumps = 0;
    const resolve = (entryId: string, chapterKey?: string) => {
      refs += 1;
      const keys = keysOf.get(entryId);
      // Every link into Outpost names a book that ships and, in it, a chapter that exists.
      if (!keys || (chapterKey !== undefined && !keys.has(chapterKey)))
        throw new Error(`a chapter links to ${entryId}/${chapterKey}, which does not exist`);
      return { entryId, entryName: entryId, collectionId: "c", documentId: chapterKey ? "d" : undefined };
    };
    for (const entry of books) {
      for (const chapter of catalog.books.get(entry.id)!.chapters) {
        const text = fs.readFileSync(chapter.path, "utf8");
        const where = `${entry.id}/${chapter.fileName}`;
        // LogBook73's site paths are all gone; what is left of them is an outpost: link or plain words.
        expect(text.match(/\]\(\/(?!handbook-figures\/)[^)]*\)/g) ?? [], where).toEqual([]);
        for (const [, url = ""] of text.matchAll(/\]\((outpost:[^)\s]*)\)/g))
          expect(parseOutpostLink(url), `${where}: ${url}`).not.toBeNull();
        const runs = runsOf(markdownBlocks(text, { resolve }));
        jumps += runs.filter((run) => run.t === "jump").length;
        // A link written `](#heading)` survives only when the chapter has that heading.
        expect(runs.filter((run) => run.t === "jump").length, where).toBe((text.match(/\]\(#[^)]+\)/g) ?? []).length);
      }
    }
    expect(refs).toBeGreaterThan(3000);
    expect(jumps).toBeGreaterThan(5);
  });

  it("are searched by their words, with a figure's title and caption but not the source of its drawing", () => {
    const menus = catalog.books.get("logbook73.handbook")!.chapters.find((chapter) => chapter.key === "modulation")!;
    const source = fs.readFileSync(menus.path, "utf8");
    expect(source).toMatch(/```mermaid/);
    expect(source).toMatch(/```viz/);
    const text = markdownSections(source)
      .sections.map((section) => `${section.heading ?? ""}\n${section.text}`)
      .join("\n");
    expect(text).not.toMatch(/flowchart|-->|"type":|"traces"|\{"/);
    const title = /"title":\s*"([^"]+)"/.exec(source)?.[1];
    expect(title).toBeTruthy();
    expect(text).toContain(title);
  });

  it("are in the packs that offer them, and every pack names real entries", () => {
    const { packs, problems } = loadPacks([path.join(repoCatalogDir, "packs.json")], new Set(catalog.entries.map((entry) => entry.id)));
    expect(problems).toEqual([]);
    const guides = packs.find((pack) => pack.id === "radio-guides");
    expect(guides?.entryIds.filter((id) => id.startsWith("logbook73.guide."))).toHaveLength(books.length - 1);
    expect(guides?.entryIds).toContain("logbook73.handbook");
    expect(packs.find((pack) => pack.id === "radio-learning")?.entryIds[0]).toBe("logbook73.handbook");
  });
});

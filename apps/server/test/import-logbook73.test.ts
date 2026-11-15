/**
 * The importer that regenerates the ham radio books from a LogBook73 checkout, run as it
 * is run by hand, against a small checkout made for the test.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCatalog } from "../src/modules/catalog/manifest.ts";

const script = path.resolve(import.meta.dirname, "../src/cli/import-logbook73.ts");
let work: string;
let checkout: string;
let catalog: string;

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true });
  fs.writeFileSync(path.join(checkout, file), text);
};

function commit(message: string, date: string): string {
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  };
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", checkout, "-c", "user.name=Test", "-c", "user.email=test@example.org", "-c", "commit.gpgsign=false", ...args],
      {
        env,
        encoding: "utf8",
      },
    );
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", message);
  return git("rev-parse", "HEAD").trim();
}

function run(...extra: string[]) {
  const result = spawnSync(process.execPath, [script, checkout, "--catalog", catalog, ...extra], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const manifest = () => JSON.parse(fs.readFileSync(path.join(catalog, "manifests", "logbook73.json"), "utf8"));
const chapter = (file: string) => fs.readFileSync(path.join(catalog, "bundled", "logbook73", file), "utf8");
const versionOf = (id: string) => manifest().entries.find((entry: { id: string }) => entry.id === id).source.version;

const GUIDES = (reviewedAt = "17 August 2026") => `
export const GUIDES = [
  {
    slug: 'pocket',
    radio: 'Pocket Radio PR-1',
    tagline: 'A small handheld.',
    blurb: 'The guide it should have shipped with.',
    reviewedAt: '${reviewedAt}',
    reviewBasis: 'Factory documentation and field reports.',
    reviewScope: { models: 'PR-1 only | not the PR-2', regions: 'UK-leaning.', manuals: 'The PR-1 manual.', firmware: 'V1.2.' },
    reviewSources: [{ label: 'Maker manuals', url: 'https://maker.example/manuals', kind: 'manufacturer-manual' }],
    dir: 'pocket',
    pages: [
      { slug: 'overview', section: 'Introduction', number: '00', title: 'Why this guide', summary: 'What it is for.', file: '00-overview.md', status: 'ready' },
      { slug: 'menus', section: 'Menus and controls', number: '2A', title: 'Every menu', summary: 'All of them.', file: '02A-menus.md', status: 'ready' },
      { slug: 'firmware', section: 'Menus and controls', number: '03', title: 'Firmware', summary: 'Not written yet.', file: '03-firmware.md', status: 'planned' },
    ],
  },
];
`;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "outpost-import-"));
  checkout = path.join(work, "LogBook73");
  catalog = path.join(work, "catalog");
  fs.mkdirSync(checkout);
  fs.mkdirSync(catalog);
  execFileSync("git", ["-C", checkout, "init", "-q"]);
  write("LICENSE", "MIT License\n\nCopyright (c) 2026 Tyler Allen\n\nPermission is hereby granted, free of charge, to any person.\n");
  write(
    "packages/content/src/handbook.ts",
    `export interface Chapter { slug: string }
export const HANDBOOK = [
  { title: 'Foundations', chapters: [
    { number: '04', slug: 'decibels', title: 'Decibels (dB)', summary: 'The logarithmic language.', file: '04-decibels.md' },
    { number: '05A', slug: 'rf-power', title: 'RF Power', summary: 'Watts and ERP.', file: '05A-rf-power.md' },
  ] },
];
`,
  );
  write("packages/content/src/guides.ts", GUIDES());
  write(
    "packages/content/chapters/04-decibels.md",
    "A unit for ratios. See [RF Power](/handbook/rf-power) and the [map](/map).\n\n## The 3 dB rule\n\nDouble the power. Jump to [the rule](#the-3-db-rule).\n",
  );
  write(
    "packages/content/chapters/05A-rf-power.md",
    "Watts. Back to [the rule](/handbook/decibels#the-3-db-rule), or [the handbook](/handbook).\n",
  );
  write(
    "packages/content/guides/pocket/00-overview.md",
    [
      "# The Pocket Radio, properly explained",
      "",
      "Start with [the menus](/guides/pocket/menus), theory in [Decibels](/handbook/decibels#the-3-db-rule).",
      "Log it in [the **logbook**](/log) and check [a lost chapter](/handbook/nowhere), [a lost heading](/handbook/decibels#no-such-heading).",
      "",
      "```mermaid",
      "flowchart LR",
      '  A["See [not a link](/handbook/decibels)"] --> B',
      "```",
      "",
      "Code keeps its text: `[x](/handbook/decibels)`. Outside: [Example](https://example.org/).",
      "",
    ].join("\n"),
  );
  write("packages/content/guides/pocket/02A-menus.md", "| Menu | See |\n| --- | --- |\n| SQL | [Overview](/guides/pocket/overview) |\n");
  commit("first", "2026-11-12T16:14:10Z");
});

afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

describe("importing the books from LogBook73", () => {
  it("writes a book per registry entry, with the chapters as written apart from their links", () => {
    const first = run();
    expect(first.code, first.err).toBe(0);

    const { entries, description } = manifest();
    expect(entries.map((entry: { id: string }) => entry.id)).toEqual(["logbook73.handbook", "logbook73.guide.pocket"]);
    expect(description).toMatch(/from LogBook73 commit [0-9a-f]{40} \(2026-11-12\)/);
    const guide = entries[1];
    expect(guide).toMatchObject({
      name: "Pocket Radio PR-1 companion guide",
      description: "A small handheld. The guide it should have shipped with.",
      category: "radio",
      publisher: "LogBook73",
      license: "MIT",
      format: "markdown",
      // The guide's own review date, not the day this copy was made.
      lastVerified: "2026-08-17",
      source: { type: "bundled", version: "2026-11-12", book: { folder: "logbook73/pocket" } },
    });
    expect(guide.licenseNote).toMatch(/LogBook73 reviewed it on 17 August 2026: Factory documentation and field reports\./);
    // A planned page is not written yet, so it is not listed; file names are lower case; every book ends with its last chapter.
    expect(guide.source.book.sections).toEqual([
      {
        title: "Introduction",
        chapters: [{ key: "overview", number: "00", title: "Why this guide", summary: "What it is for.", file: "00-overview.md" }],
      },
      {
        title: "Menus and controls",
        chapters: [{ key: "menus", number: "2A", title: "Every menu", summary: "All of them.", file: "02a-menus.md" }],
      },
      { title: "About this book", chapters: [expect.objectContaining({ key: "about-this-book", file: "about-this-book.md" })] },
    ]);
    expect(fs.readdirSync(path.join(catalog, "bundled", "logbook73", "pocket")).sort()).toEqual([
      "00-overview.md",
      "02a-menus.md",
      "about-this-book.md",
    ]);

    // Links to chapters become links into Outpost; a chapter with no title is given its registry title.
    expect(chapter("handbook/04-decibels.md")).toBe(
      "# Decibels (dB)\n\nA unit for ratios. See [RF Power](outpost:entry/logbook73.handbook/rf-power) and the map.\n\n## The 3 dB rule\n\nDouble the power. Jump to [the rule](#the-3-db-rule).\n",
    );
    expect(chapter("handbook/05a-rf-power.md")).toBe(
      "# RF Power\n\nWatts. Back to [the rule](outpost:entry/logbook73.handbook/decibels#the-3-db-rule), or [the handbook](outpost:entry/logbook73.handbook).\n",
    );
    const overview = chapter("pocket/00-overview.md");
    // A title the author wrote is kept; a screen of LogBook73's own keeps its words and formatting.
    expect(overview).toMatch(/^# The Pocket Radio, properly explained\n/);
    expect(overview).toContain("[the menus](outpost:entry/logbook73.guide.pocket/menus)");
    expect(overview).toContain("[Decibels](outpost:entry/logbook73.handbook/decibels#the-3-db-rule)");
    expect(overview).toContain("Log it in the **logbook** and check a lost chapter,");
    // Text inside a diagram or code is not a link, and is left exactly as it was. So is a web address.
    expect(overview).toContain('A["See [not a link](/handbook/decibels)"] --> B');
    expect(overview).toContain("`[x](/handbook/decibels)`");
    expect(overview).toContain("[Example](https://example.org/)");
    expect(chapter("pocket/02a-menus.md")).toBe(
      "# Every menu\n\n| Menu | See |\n| --- | --- |\n| SQL | [Overview](outpost:entry/logbook73.guide.pocket/overview) |\n",
    );

    // What could not be carried is said, not hidden.
    expect(first.out).toMatch(/2 books, 6 chapters/);
    expect(first.out).toMatch(/links to LogBook73's own screens reduced to their words: .*\/map 1/);
    expect(first.err).toMatch(/guides\/pocket\/00-overview\.md: links to \/handbook\/nowhere, which is not a chapter/);
    expect(first.err).toMatch(/links to the heading #no-such-heading of logbook73\.handbook\/decibels, which that chapter does not have/);

    // The last chapter carries the review, with a bar in the registry's text kept inside its table cell, and the licence.
    const about = chapter("pocket/about-this-book.md");
    expect(about).toMatch(/LogBook73 last reviewed this guide's menu and specification claims on 17 August 2026\./);
    expect(about).toContain("| Models | PR-1 only \\| not the PR-2 |");
    expect(about).toContain("- [Maker manuals](https://maker.example/manuals), the manufacturer's manual");
    expect(about).toMatch(/LogBook73 lists 1 more chapter for this guide that had not been written/);
    expect(about).toMatch(/Copyright \(c\) 2026 Tyler Allen/);

    // The server reads what was written without complaint, and the two packs this script owns are there.
    const loaded = loadCatalog([path.join(catalog, "manifests")]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.books.get("logbook73.guide.pocket")?.chapters).toHaveLength(3);
    const packs = JSON.parse(fs.readFileSync(path.join(catalog, "packs.json"), "utf8")).packs;
    expect(packs.map((pack: { id: string }) => pack.id)).toEqual(["radio-learning", "radio-guides"]);
    expect(packs[1].entries).toEqual(["logbook73.guide.pocket", "logbook73.handbook"]);
  });

  it("writes the same bytes again, and moves a book's version only when the book changes", () => {
    const snapshot = () =>
      Object.fromEntries(
        (fs.readdirSync(catalog, { recursive: true, encoding: "utf8" }) as string[])
          .filter((file) => fs.statSync(path.join(catalog, file)).isFile())
          .map((file) => [file, fs.readFileSync(path.join(catalog, file), "utf8")]),
      );
    const before = snapshot();
    expect(run().code).toBe(0);
    expect(snapshot()).toEqual(before);

    // A pack that someone else keeps in the same file is left alone.
    const packsFile = path.join(catalog, "packs.json");
    const packs = JSON.parse(fs.readFileSync(packsFile, "utf8"));
    packs.packs.unshift({ id: "first-things", name: "First things", description: "Kept by hand.", entries: ["x.y"] });
    fs.writeFileSync(packsFile, JSON.stringify(packs));

    // The same day, the guide changes and the handbook does not: only the guide gets a later version.
    write("packages/content/guides/pocket/02A-menus.md", "| Menu | See |\n| --- | --- |\n| SQL | Squelch |\n");
    commit("second", "2026-11-12T20:00:00Z");
    const second = run();
    expect(second.out).toMatch(/changed\s+logbook73\.guide\.pocket\s+2026-11-12 -> 2026-11-12\.2/);
    expect(versionOf("logbook73.guide.pocket")).toBe("2026-11-12.2");
    expect(versionOf("logbook73.handbook")).toBe("2026-11-12");
    expect(JSON.parse(fs.readFileSync(packsFile, "utf8")).packs.map((pack: { id: string }) => pack.id)).toEqual([
      "first-things",
      "radio-learning",
      "radio-guides",
    ]);

    // A change to the registry alone (a new review date) is a change to the book too.
    write("packages/content/src/guides.ts", GUIDES("2 December 2026"));
    commit("third", "2026-12-03T09:00:00Z");
    expect(run().code).toBe(0);
    expect(versionOf("logbook73.guide.pocket")).toBe("2026-12-03");
    expect(versionOf("logbook73.handbook")).toBe("2026-11-12");
    expect(manifest().entries[1].lastVerified).toBe("2026-12-02");
  });

  it("refuses a checkout with uncommitted changes to the content, unless told to go ahead", () => {
    write("packages/content/chapters/04-decibels.md", "Edited and not committed.\n");
    const refused = run();
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/has changes that are not committed/);
    expect(chapter("handbook/04-decibels.md")).toContain("A unit for ratios");
    expect(run("--allow-dirty").code).toBe(0);
    expect(chapter("handbook/04-decibels.md")).toContain("Edited and not committed.");

    const elsewhere = spawnSync(process.execPath, [script, work, "--catalog", catalog], { encoding: "utf8" });
    expect(elsewhere.status).toBe(1);
    expect(elsewhere.stderr).toMatch(/does not look like LogBook73/);
  });
});

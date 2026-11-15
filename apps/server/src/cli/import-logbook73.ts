/**
 * Regenerates the ham radio books that ship with Outpost from a checkout of LogBook73,
 * the project they were written for.
 *
 *   node apps/server/src/cli/import-logbook73.ts <path-to-LogBook73>
 *   node apps/server/src/cli/import-logbook73.ts <path-to-LogBook73> --allow-dirty
 *   node apps/server/src/cli/import-logbook73.ts <path-to-LogBook73> --catalog <path-to-catalog-folder>
 *
 * It reads LogBook73's two registries (`packages/content/src/handbook.ts` and
 * `guides.ts`: parts, chapter numbers, titles, summaries, review details) and the
 * Markdown they name, and writes:
 *
 *   catalog/bundled/logbook73/<book>/<chapter>.md   one file per chapter
 *   catalog/manifests/logbook73.json                one entry per book
 *   catalog/packs.json                              the two packs this script owns
 *
 * LogBook73 is only needed to run this script. Outpost builds and runs from the files
 * it writes, which are committed.
 *
 * The chapters are the author's text and are not edited. Three things change, because
 * the format needs them to:
 *   - a chapter that does not open with a title is given its registry title as "# Title";
 *   - links to other chapters (`/handbook/<slug>`, `/guides/<guide>/<slug>`) become
 *     `outpost:entry/<entry id>/<chapter key>`, which Outpost's Markdown view turns into a
 *     link to the chapter when its book is in the library;
 *   - links to LogBook73's own screens (its map, logbook, tools) keep their words and
 *     lose the link, since there is nothing in Outpost for them to open.
 * Each book also gains a last chapter, written here from the registry, that says who
 * wrote it, how it was reviewed, and what was not carried over.
 *
 * The output is the same for the same checkout, whenever it is run. An entry's
 * `version` is the date of the LogBook73 commit it was last changed by: it moves only
 * when something in that book differs from what is already here, so people who added
 * a book are offered an update exactly when there is one.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CatalogBookSection, CatalogManifest, CatalogManifestEntry, MarkdownBlock } from "@outpost/shared";
import type { Link, Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { defaultCatalogDir } from "../core/paths.ts";
import { parseManifest } from "../modules/catalog/manifest.ts";
import { compareVersions } from "../modules/catalog/service.ts";
import { markdownBlocks, parseOutpostLink } from "../modules/documents/markdown-view.ts";

// ── What LogBook73's registries hold (see its packages/content/src) ──

interface SourceChapter {
  slug: string;
  number: string;
  title: string;
  summary: string;
  file: string;
}
interface SourcePart {
  title: string;
  chapters: SourceChapter[];
}
interface SourceGuidePage extends SourceChapter {
  section: string;
  status: "ready" | "planned";
}
interface SourceGuide {
  slug: string;
  radio: string;
  tagline: string;
  blurb: string;
  reviewedAt: string;
  reviewBasis: string;
  reviewScope: { models: string; regions: string; manuals: string; firmware: string };
  reviewSources: Array<{ label: string; url: string; kind: string }>;
  dir: string;
  pages: SourceGuidePage[];
}

// ── What this script makes of them ──

const MANIFEST_ID = "logbook73";
const HANDBOOK_ID = "logbook73.handbook";
const guideId = (slug: string) => `logbook73.guide.${slug}`;
const ABOUT_KEY = "about-this-book";
const ABOUT_FILE = "about-this-book.md";
const ABOUT_SECTION = "About this book";

interface Chapter {
  key: string;
  number?: string;
  title: string;
  summary: string;
  /** Name of the file written. */
  file: string;
  /** Where the text comes from; absent for the chapter written here. */
  source?: string;
}

interface Book {
  entryId: string;
  /** Folder inside catalog/bundled. */
  folder: string;
  /** Folder of the Markdown in LogBook73, relative to its packages/content. */
  sourceDir: string;
  name: string;
  description: string;
  tags: string[];
  /** YYYY-MM-DD: when LogBook73 last reviewed or changed it. */
  reviewed: string;
  licenseNote: string;
  sections: Array<{ title: string; chapters: Chapter[] }>;
  about: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "17 August 2026" as 2026-08-17. */
function isoDate(written: string): string {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(written.trim());
  const month = match ? MONTHS.indexOf(match[2]!.toLowerCase()) : -1;
  if (!match || month < 0) throw new Error(`"${written}" is not a date this script can read (expected "17 August 2026").`);
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
}

const SOURCE_KINDS: Record<string, string> = {
  "manufacturer-manual": "the manufacturer's manual",
  "manufacturer-support": "the manufacturer's support pages",
  "firmware-project": "the firmware project",
};

/** A table cell must stay on one line and keep its bars to itself. */
const cell = (value: string) => value.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

const NOT_CARRIED = [
  "- **Self-check quizzes and reading progress.** LogBook73 follows which chapters you have read and offers questions at the end of a part. Outpost does neither.",
  "- **Pop-up definitions.** In LogBook73 a term can be pressed for its definition. Here the handbook's glossary chapter holds most of the same definitions.",
  "- **LogBook73's own screens.** Where a chapter mentions LogBook73's map, logbook, band tools or practice pages, the words are kept and the link is not: there is nothing in Outpost for it to open.",
  "- **Pictures.** Eleven handbook chapters have an illustration or two. The pictures are not included; the description and caption their author wrote for each one are shown in its place. Every diagram and signal figure that is drawn from the text is here.",
];

function aboutChapter(parts: {
  intro: string[];
  reviewed?: { heading: string; body: string[] };
  links: string[];
  licence: string;
}): string {
  return [
    `# ${ABOUT_SECTION}`,
    "",
    ...parts.intro.flatMap((paragraph) => [paragraph, ""]),
    ...(parts.reviewed ? [`## ${parts.reviewed.heading}`, "", ...parts.reviewed.body, ""] : []),
    "## In Outpost",
    "",
    "This copy was made for Outpost from LogBook73's files by a script, so that it can be read with no connection. The chapters are as their author wrote them.",
    "",
    ...parts.links.flatMap((paragraph) => [paragraph, ""]),
    "Not carried over from LogBook73:",
    "",
    ...NOT_CARRIED,
    "",
    "## Licence",
    "",
    "```text",
    parts.licence.trim(),
    "```",
    "",
  ].join("\n");
}

function guideBook(guide: SourceGuide, licence: string): Book {
  const planned = guide.pages.filter((page) => page.status !== "ready");
  const sections: Book["sections"] = [];
  for (const page of guide.pages) {
    if (page.status !== "ready") continue; // Planned pages are not written yet.
    let section = sections.at(-1);
    if (!section || section.title !== page.section) {
      section = { title: page.section, chapters: [] };
      sections.push(section);
    }
    section.chapters.push({
      key: page.slug,
      number: page.number,
      title: page.title,
      summary: page.summary,
      file: page.file.toLowerCase(),
      source: page.file,
    });
  }
  const about = aboutChapter({
    intro: [
      `This guide to the ${guide.radio} was written by Tyler Allen for LogBook73, an amateur radio logbook, and is included with Outpost under LogBook73's MIT licence.`,
      "It is not the manufacturer's manual, and it is not legal advice. What you may transmit, on which frequencies and at what power is set by your own licence and the rules of the country you are in.",
    ],
    reviewed: {
      heading: "How it was reviewed",
      body: [
        `LogBook73 last reviewed this guide's menu and specification claims on ${guide.reviewedAt}.`,
        "",
        guide.reviewBasis,
        "",
        "| Reviewed against | |",
        "| --- | --- |",
        `| Models | ${cell(guide.reviewScope.models)} |`,
        `| Regions | ${cell(guide.reviewScope.regions)} |`,
        `| Manuals | ${cell(guide.reviewScope.manuals)} |`,
        `| Firmware | ${cell(guide.reviewScope.firmware)} |`,
        "",
        "The sources the review started from:",
        "",
        ...guide.reviewSources.map((source) => `- [${source.label}](${source.url}), ${SOURCE_KINDS[source.kind] ?? source.kind}`),
        "",
        "Outpost has not checked the guide against those manuals again. Firmware changes, and a radio sold under the same name can differ from one market to another: where the guide and your radio disagree, believe the radio and its own manual.",
        ...(planned.length > 0
          ? [
              "",
              `LogBook73 lists ${planned.length} more ${planned.length === 1 ? "chapter" : "chapters"} for this guide that had not been written when this copy was made.`,
            ]
          : []),
      ],
    },
    links: [
      "The guide often points to a chapter of the Radio Engineering Handbook for the theory behind a setting. Those links open the chapter when the handbook is in your library; when it is not, they say so and lead to it in Explore.",
    ],
    licence,
  });
  sections.push({
    title: ABOUT_SECTION,
    chapters: [
      {
        key: ABOUT_KEY,
        title: ABOUT_SECTION,
        summary: "Who wrote it, how it was reviewed, and what is different in Outpost.",
        file: ABOUT_FILE,
      },
    ],
  });
  return {
    entryId: guideId(guide.slug),
    folder: `logbook73/${guide.slug}`,
    sourceDir: `guides/${guide.dir}`,
    name: `${guide.radio} companion guide`,
    description: `${guide.tagline} ${guide.blurb}`,
    tags: ["ham radio", "amateur radio", "radio guide", guide.radio],
    reviewed: isoDate(guide.reviewedAt),
    licenseNote: `Written by Tyler Allen for LogBook73 and included under its MIT licence. LogBook73 reviewed it on ${guide.reviewedAt}: ${guide.reviewBasis} It is not the manufacturer's manual and not legal advice, and Outpost has not checked it against the manufacturer's manuals again. The last chapter gives the review in full.`,
    sections,
    about,
  };
}

function handbookBook(parts: SourcePart[], changed: string, licence: string): Book {
  const count = parts.reduce((sum, part) => sum + part.chapters.length, 0);
  const sections: Book["sections"] = parts.map((part) => ({
    title: part.title,
    chapters: part.chapters.map((chapter) => ({
      key: chapter.slug,
      number: chapter.number,
      title: chapter.title,
      summary: chapter.summary,
      file: chapter.file.toLowerCase(),
      source: chapter.file,
    })),
  }));
  const about = aboutChapter({
    intro: [
      "The Radio Engineering Handbook was written by Tyler Allen for LogBook73, an amateur radio logbook, and is included with Outpost under LogBook73's MIT licence.",
      "It is a beginner's course, not an official text and not legal advice. It deliberately leaves out the details of any one country's licence: what you may transmit, on which frequencies and at what power is set by your own licence and the rules of the country you are in.",
      `LogBook73 gives the handbook no review date of its own. Its chapters were last changed there on ${changed}, and Outpost has not checked them against other sources.`,
    ],
    links: [
      "Chapters link to one another, and the companion guides for particular radios link here for the theory behind a setting. A link to a book that is not in your library says so and leads to it in Explore.",
    ],
    licence,
  });
  sections.push({
    title: ABOUT_SECTION,
    chapters: [{ key: ABOUT_KEY, title: ABOUT_SECTION, summary: "Who wrote it, and what is different in Outpost.", file: ABOUT_FILE }],
  });
  return {
    entryId: HANDBOOK_ID,
    folder: "logbook73/handbook",
    sourceDir: "chapters",
    name: "Radio Engineering Handbook",
    // LogBook73's own description of it, with the chapter count filled in.
    description: `A beginner's course in how radio works, from electromagnetic waves to your first station. ${count} chapters, written in order, but each one stands alone.`,
    tags: ["ham radio", "amateur radio", "handbook", "beginners", "antennas", "propagation", "digital modes"],
    reviewed: changed,
    licenseNote: `Written by Tyler Allen for LogBook73 and included under its MIT licence. It is a beginner's course, not an official text and not legal advice. LogBook73 gives it no review date; its chapters were last changed there on ${changed}, and Outpost has not checked them against other sources.`,
    sections,
    about,
  };
}

// ── Links ──

interface LinkReport {
  /** Links to another chapter, rewritten. */
  chapters: number;
  /** Links to a LogBook73 screen, reduced to their words. */
  dropped: Map<string, number>;
  /** Links that name a chapter or heading that does not exist; each is reported. */
  broken: string[];
}

type ChapterIndex = Map<string, { entryId: string; keys: Set<string> }>;

/**
 * Where a LogBook73 site path leads in Outpost: an `outpost:` link, or null when it is
 * one of LogBook73's own screens.
 */
function outpostTarget(
  url: string,
  guides: ChapterIndex,
  handbook: Set<string>,
): { href: string; entryId: string; key?: string } | null | "broken" {
  const [pathname = "", anchor] = url.split("#", 2);
  const tail = anchor ? `#${anchor}` : "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "handbook") {
    if (segments.length === 1) return { href: `outpost:entry/${HANDBOOK_ID}`, entryId: HANDBOOK_ID };
    if (segments.length !== 2 || !handbook.has(segments[1]!)) return "broken";
    return { href: `outpost:entry/${HANDBOOK_ID}/${segments[1]}${tail}`, entryId: HANDBOOK_ID, key: segments[1] };
  }
  if (segments[0] === "guides" && segments.length >= 2) {
    const guide = guides.get(segments[1]!);
    if (!guide) return "broken";
    if (segments.length === 2) return { href: `outpost:entry/${guide.entryId}`, entryId: guide.entryId };
    if (segments.length !== 3 || !guide.keys.has(segments[2]!)) return "broken";
    return { href: `outpost:entry/${guide.entryId}/${segments[2]}${tail}`, entryId: guide.entryId, key: segments[2] };
  }
  return null;
}

function linksIn(node: Nodes, found: Link[] = []): Link[] {
  if (node.type === "link") found.push(node);
  if ("children" in node) for (const child of node.children as Nodes[]) linksIn(child, found);
  return found;
}

/** Rewrites the site links of one chapter. Everything that is not a link is returned byte for byte. */
function rewriteLinks(source: string, where: string, guides: ChapterIndex, handbook: Set<string>, report: LinkReport): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  const links = linksIn(tree)
    .filter((link) => link.url.startsWith("/") && link.position?.start.offset !== undefined && link.position.end.offset !== undefined)
    .sort((a, b) => b.position!.start.offset! - a.position!.start.offset!);
  let out = source;
  for (const link of links) {
    const start = link.position!.start.offset!;
    const end = link.position!.end.offset!;
    const written = out.slice(start, end);
    const close = written.lastIndexOf("](");
    if (!written.startsWith("[") || close < 0 || !written.endsWith(")")) {
      report.broken.push(`${where}: a link to ${link.url} is written in a form this script does not rewrite`);
      continue;
    }
    const label = written.slice(1, close);
    const target = outpostTarget(link.url, guides, handbook);
    if (target === "broken") {
      report.broken.push(`${where}: links to ${link.url}, which is not a chapter in the registries; the words were kept without the link`);
      out = out.slice(0, start) + label + out.slice(end);
    } else if (target === null) {
      const screen = `/${link.url.split(/[/?#]/).filter(Boolean)[0] ?? ""}`;
      report.dropped.set(screen, (report.dropped.get(screen) ?? 0) + 1);
      out = out.slice(0, start) + label + out.slice(end);
    } else {
      report.chapters += 1;
      out = `${out.slice(0, start)}[${label}](${target.href})${out.slice(end)}`;
    }
  }
  return out;
}

const headingIds = (blocks: MarkdownBlock[]): string[] =>
  blocks.flatMap((block) =>
    block.t === "heading" && block.id
      ? [block.id]
      : block.t === "quote"
        ? headingIds(block.c)
        : block.t === "list"
          ? block.items.flatMap((item) => headingIds(item.c))
          : [],
  );

// ── Running ──

/** Dates are read in UTC, so the same commit gives the same day wherever this is run. */
const git = (root: string, args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, TZ: "UTC" } }).trim();
const DAY = ["--format=%cd", "--date=format-local:%Y-%m-%d"];

const sha256 = (parts: Array<string | Buffer>) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
};

/** Everything about a book except its version, so that two editions can be compared. */
function fingerprint(entry: CatalogManifestEntry, files: Map<string, Buffer | string>): string {
  const { version: _version, ...source } = entry.source as { version?: string };
  const names = [...files.keys()].sort();
  return sha256([JSON.stringify({ ...entry, source }), ...names.flatMap((name) => [name, files.get(name)!])]);
}

/** A version later than `previous`: the date, or the date with a counter when the date has been used. */
function nextVersion(date: string, previous: string | undefined): string {
  if (!previous || compareVersions(previous, date) < 0) return date;
  const [, day = previous, count] = /^(.*?)(?:\.(\d+))?$/.exec(previous) ?? [];
  return `${day}.${Number(count ?? 1) + 1}`;
}

interface Packs {
  schemaVersion: 1;
  packs: Array<{ id: string; name: string; description: string; entries: string[] }>;
}

async function main(argv: string[]): Promise<number> {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const catalogIndex = argv.indexOf("--catalog");
  const catalogDir = catalogIndex >= 0 && argv[catalogIndex + 1] ? path.resolve(argv[catalogIndex + 1]!) : defaultCatalogDir;
  const checkout = argv.find((arg, index) => !arg.startsWith("--") && argv[index - 1] !== "--catalog");
  if (!checkout) {
    console.error("Give the path to a LogBook73 checkout: node apps/server/src/cli/import-logbook73.ts <path-to-LogBook73>");
    return 1;
  }
  const root = path.resolve(checkout);
  const content = path.join(root, "packages", "content");
  for (const needed of ["src/handbook.ts", "src/guides.ts", "chapters", "guides"]) {
    if (!fs.existsSync(path.join(content, needed))) {
      console.error(`${root} does not look like LogBook73: packages/content/${needed} is missing.`);
      return 1;
    }
  }
  const dirty = git(root, ["status", "--porcelain", "--", "packages/content", "LICENSE"]);
  if (dirty && !flags.has("--allow-dirty")) {
    console.error(`LogBook73 has changes that are not committed, so the commit recorded here would not describe them:\n${dirty}`);
    console.error("Commit them, or run again with --allow-dirty.");
    return 1;
  }
  const commit = git(root, ["rev-parse", "HEAD"]);
  const committed = git(root, ["log", "-1", ...DAY]);
  const handbookChanged = git(root, ["log", "-1", ...DAY, "--", "packages/content/chapters", "packages/content/src/handbook.ts"]);
  const licence = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
  if (!/^MIT License/.test(licence)) {
    console.error("LogBook73's LICENSE no longer opens with the MIT licence. Read it before bundling anything.");
    return 1;
  }

  // The registries are plain TypeScript with no imports, which Node runs as it is.
  const { GUIDES } = (await import(pathToFileURL(path.join(content, "src", "guides.ts")).href)) as { GUIDES: SourceGuide[] };
  const { HANDBOOK } = (await import(pathToFileURL(path.join(content, "src", "handbook.ts")).href)) as { HANDBOOK: SourcePart[] };

  const books = [handbookBook(HANDBOOK, handbookChanged, licence), ...GUIDES.map((guide) => guideBook(guide, licence))];
  const handbookKeys = new Set(HANDBOOK.flatMap((part) => part.chapters.map((chapter) => chapter.slug)));
  const guideIndex: ChapterIndex = new Map(
    GUIDES.map((guide) => [
      guide.slug,
      { entryId: guideId(guide.slug), keys: new Set(guide.pages.filter((page) => page.status === "ready").map((page) => page.slug)) },
    ]),
  );

  // ── The chapters ──
  const report: LinkReport = { chapters: 0, dropped: new Map(), broken: [] };
  const written = new Map<string, Map<string, string>>();
  for (const book of books) {
    const files = new Map<string, string>();
    for (const chapter of book.sections.flatMap((section) => section.chapters)) {
      if (!chapter.source) {
        files.set(chapter.file, book.about);
        continue;
      }
      const where = `${book.sourceDir}/${chapter.source}`;
      let text = fs.readFileSync(path.join(content, book.sourceDir, chapter.source), "utf8").replace(/\r\n/g, "\n");
      text = rewriteLinks(text, where, guideIndex, handbookKeys, report);
      // LogBook73's page supplies the title; a file read on its own needs to carry it.
      if (!/^# \S/.test(text)) text = `# ${chapter.title}\n\n${text}`;
      if (!text.endsWith("\n")) text += "\n";
      if (files.has(chapter.file)) throw new Error(`${book.folder}: two chapters would be written to ${chapter.file}.`);
      files.set(chapter.file, text);
    }
    written.set(book.entryId, files);
  }

  // Every link to a heading must have a heading to land on, in the file as it is written here.
  const ids = new Map<string, Set<string>>();
  const idsOf = (entryId: string, key: string): Set<string> | undefined => {
    const book = books.find((candidate) => candidate.entryId === entryId);
    const chapter = book?.sections.flatMap((section) => section.chapters).find((candidate) => candidate.key === key);
    if (!book || !chapter) return undefined;
    const name = `${entryId}/${key}`;
    if (!ids.has(name)) ids.set(name, new Set(headingIds(markdownBlocks(written.get(entryId)!.get(chapter.file)!))));
    return ids.get(name);
  };
  let anchors = 0;
  for (const book of books) {
    for (const chapter of book.sections.flatMap((section) => section.chapters)) {
      const text = written.get(book.entryId)!.get(chapter.file)!;
      const tree = unified().use(remarkParse).use(remarkGfm).parse(text) as Root;
      for (const link of linksIn(tree)) {
        const where = `${book.folder}/${chapter.file}`;
        if (link.url.startsWith("#")) {
          anchors += 1;
          if (!idsOf(book.entryId, chapter.key)?.has(decodeURIComponent(link.url.slice(1)))) {
            report.broken.push(`${where}: links to the heading ${link.url}, which this chapter does not have`);
          }
          continue;
        }
        if (!link.url.startsWith("outpost:")) continue;
        const parsed = parseOutpostLink(link.url);
        if (!parsed) {
          report.broken.push(`${where}: ${link.url} is not a link Outpost would follow`);
        } else if (parsed.anchor && parsed.chapterKey) {
          anchors += 1;
          if (!idsOf(parsed.entryId, parsed.chapterKey)?.has(parsed.anchor)) {
            report.broken.push(
              `${where}: links to the heading #${parsed.anchor} of ${parsed.entryId}/${parsed.chapterKey}, which that chapter does not have`,
            );
          }
        }
      }
    }
  }

  // ── The manifest ──
  const manifestFile = path.join(catalogDir, "manifests", `${MANIFEST_ID}.json`);
  const bundledDir = path.join(catalogDir, "bundled", "logbook73");
  const previous = fs.existsSync(manifestFile) ? (JSON.parse(fs.readFileSync(manifestFile, "utf8")) as CatalogManifest) : undefined;

  const entries: CatalogManifestEntry[] = books.map((book) => {
    const files = written.get(book.entryId)!;
    const sections: CatalogBookSection[] = book.sections.map((section) => ({
      title: section.title,
      chapters: section.chapters.map((chapter) => ({
        key: chapter.key,
        ...(chapter.number ? { number: chapter.number } : {}),
        title: chapter.title,
        summary: chapter.summary,
        file: chapter.file,
      })),
    }));
    const entry: CatalogManifestEntry = {
      id: book.entryId,
      name: book.name,
      description: book.description,
      category: "radio",
      publisher: "LogBook73",
      language: "en",
      format: "markdown",
      license: "MIT",
      licenseNote: book.licenseNote,
      attribution:
        "Copyright (c) 2026 Tyler Allen. Written for LogBook73 and included under its MIT licence, which is given in full in the last chapter.",
      lastVerified: book.reviewed,
      tags: book.tags,
      source: { type: "bundled", version: committed, book: { folder: book.folder, sections } },
    };
    // The version moves only when the book does.
    const before = previous?.entries.find((candidate) => candidate.id === book.entryId);
    const beforeVersion = before?.source.type === "bundled" ? before.source.version : undefined;
    if (before && beforeVersion) {
      const old = new Map<string, Buffer>();
      const folder = path.join(catalogDir, "bundled", ...book.folder.split("/"));
      for (const name of fs.existsSync(folder) ? fs.readdirSync(folder) : []) old.set(name, fs.readFileSync(path.join(folder, name)));
      const same = fingerprint(before, old) === fingerprint(entry, new Map([...files].map(([name, text]) => [name, Buffer.from(text)])));
      (entry.source as { version?: string }).version = same ? beforeVersion : nextVersion(committed, beforeVersion);
    }
    return entry;
  });

  const guideCount = GUIDES.length;
  const manifest = {
    $schema: "../schema/manifest.schema.json",
    schemaVersion: 1,
    id: MANIFEST_ID,
    name: "Ham radio books from LogBook73",
    description: `The Radio Engineering Handbook and ${guideCount} companion guides for particular radios, written by Tyler Allen for LogBook73 and shipped with Outpost under its MIT licence. Adding one copies its chapters into the library; nothing is downloaded. This file and catalog/bundled/logbook73 are generated: do not edit them by hand. Generated by apps/server/src/cli/import-logbook73.ts from LogBook73 commit ${commit} (${committed}).`,
    maintainers: ["Outpost maintainers"],
    downloadHosts: [],
    entries,
  };
  const checked = parseManifest(JSON.stringify(manifest));
  if (!checked.manifest) {
    console.error(`The manifest this script made does not follow the format. ${checked.problem}`);
    return 1;
  }

  // Everything under bundled/logbook73 is this script's: it is replaced whole, so a chapter removed upstream goes here too.
  fs.rmSync(bundledDir, { recursive: true, force: true });
  let chapterCount = 0;
  let bytes = 0;
  for (const book of books) {
    const folder = path.join(catalogDir, "bundled", ...book.folder.split("/"));
    fs.mkdirSync(folder, { recursive: true });
    for (const [name, text] of written.get(book.entryId)!) {
      fs.writeFileSync(path.join(folder, name), text);
      chapterCount += 1;
      bytes += Buffer.byteLength(text);
    }
  }
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  // ── The packs this script owns ──
  const packsFile = path.join(catalogDir, "packs.json");
  const packs: Packs = fs.existsSync(packsFile)
    ? (JSON.parse(fs.readFileSync(packsFile, "utf8")) as Packs)
    : { schemaVersion: 1, packs: [] };
  const owned: Packs["packs"] = [
    {
      id: "radio-learning",
      name: "Learning amateur radio",
      description:
        "A beginner's course to read from the start: the Radio Engineering Handbook, with the operating reference and the worldwide band sheet beside it. All of it comes with Outpost, so adding it needs no connection.",
      // The two sheets are Outpost's own (catalog/manifests/outpost-reference.json); the validator says so if one goes.
      entries: [HANDBOOK_ID, "outpost.radio.operating-reference", "outpost.radio.world-amateur-bands"],
    },
    {
      id: "radio-guides",
      name: "Radio companion guides",
      description: `Book-length guides to ${guideCount} particular radios and interfaces, each with its menus explained, ready-made configurations and troubleshooting, and the handbook they lean on for theory. They come with Outpost, so adding them needs no connection. To add only the guide for your own radio, find it under Radio communications.`,
      entries: [...GUIDES.map((guide) => guideId(guide.slug)), HANDBOOK_ID],
    },
  ];
  for (const pack of owned) {
    const at = packs.packs.findIndex((candidate) => candidate.id === pack.id);
    if (at >= 0) packs.packs[at] = pack;
    else {
      // Beside the other radio packs when they are there, otherwise at the end.
      const after = packs.packs.findLastIndex((candidate) => candidate.id.startsWith("radio-"));
      packs.packs.splice(after >= 0 ? after + 1 : packs.packs.length, 0, pack);
    }
  }
  fs.writeFileSync(packsFile, `${JSON.stringify(packs, null, 2)}\n`);

  // The repository keeps its JSON in Biome's layout; leave the files as a later `pnpm format` would.
  const biome = path.resolve(import.meta.dirname, "../../../../node_modules/.bin/biome");
  if (fs.existsSync(biome)) spawnSync(biome, ["format", "--write", manifestFile, packsFile], { stdio: "ignore" });

  console.log(`LogBook73 ${commit.slice(0, 12)} (${committed})`);
  console.log(`${books.length} books, ${chapterCount} chapters, ${(bytes / (1024 * 1024)).toFixed(2)} MB of Markdown in ${bundledDir}`);
  console.log(`${report.chapters} links to other chapters rewritten, ${anchors} of them and of the links within a chapter to a heading.`);
  const dropped = [...report.dropped].sort((a, b) => b[1] - a[1]);
  console.log(
    `${dropped.reduce((sum, [, count]) => sum + count, 0)} links to LogBook73's own screens reduced to their words: ${dropped.map(([screen, count]) => `${screen} ${count}`).join(", ")}`,
  );
  for (const entry of entries) {
    const before = previous?.entries.find((candidate) => candidate.id === entry.id);
    const version = (entry.source as { version?: string }).version;
    const was = before?.source.type === "bundled" ? before.source.version : undefined;
    if (!before) console.log(`  new      ${entry.id}  ${version}`);
    else if (was !== version) console.log(`  changed  ${entry.id}  ${was} -> ${version}`);
  }
  for (const before of previous?.entries ?? []) {
    if (!entries.some((entry) => entry.id === before.id)) console.log(`  removed  ${before.id}`);
  }
  if (report.broken.length > 0) {
    console.error(`\n${report.broken.length} links need attention in LogBook73:`);
    for (const line of report.broken) console.error(`  ${line}`);
  }
  console.log("\nNow run: pnpm catalog:validate");
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);

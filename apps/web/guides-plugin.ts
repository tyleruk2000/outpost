/**
 * The guides under Help, made from the pages in docs/ when the app is built, so that the
 * guide inside Outpost and the page in the repository are the same words: there is no
 * copy to fall behind.
 *
 * Each page is read with the library's own Markdown reader (the server's `markdownBlocks`,
 * which turns a file into plain values and never into HTML) and becomes a module of its
 * own, `virtual:outpost-guide/<slug>`, which the web app loads only when the guide is
 * opened. `virtual:outpost-guides` is the small index: each guide's title, its sections
 * (for the quick search and the list of sections), the day its file last changed, the
 * loaders, and any link that does not lead anywhere.
 *
 * Links are rewritten here, once:
 * - to another page of docs/ that is a guide: a link to that guide (a "chapter" run, the
 *   kind a book's link to another chapter is, numbered by its place in GUIDES), and to the
 *   heading it names;
 * - to any other file of the repository (the catalogue's README, SECURITY.md): a link to
 *   that file on GitHub, which the guide marks as needing the internet;
 * - anything else that leads nowhere is kept as words and listed in `GUIDE_PROBLEMS`,
 *   which `guides.test.ts` expects to be empty.
 *
 * The day a file last changed is its last commit's date, asked of git as the app is
 * built. Where there is no git (a Docker build, which leaves .git out) no day is given,
 * and the guide shows none.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";

const repo = path.resolve(import.meta.dirname, "../..");
const docs = path.join(repo, "docs");

const INDEX = "virtual:outpost-guides";
const GUIDE = "virtual:outpost-guide/";

/** The shapes this file needs from the modules it reads with Node; the real types are in those modules. */
type Inline = { t: string; v?: string; c?: Inline[]; [key: string]: unknown };
type Block = { t: string; depth?: number; id?: string; c?: Inline[] | Block[]; items?: { c: Block[] }[]; rows?: Inline[][][] };
interface GuideEntry {
  slug: string;
  file: string;
  own?: true;
}
interface SetupSection {
  id: string;
  title: string;
  parts?: SetupSection[];
}

/** A heading the guide can be opened at: [id, words, depth]. */
type Section = [string, string, number];

interface Built {
  index: Record<string, { title: string; changed?: string; sections: Section[] }>;
  blocks: Map<string, Block[]>;
  problems: string[];
  files: string[];
}

const words = (runs: Inline[] | undefined): string =>
  (runs ?? []).map((run) => (run.t === "break" ? " " : typeof run.v === "string" ? run.v : words(run.c))).join("");

/** Every page of docs/, relative to it: the top level and development/. */
export function docsPages(): string[] {
  const top = fs.readdirSync(docs).filter((name) => name.endsWith(".md"));
  const development = fs.existsSync(path.join(docs, "development"))
    ? fs
        .readdirSync(path.join(docs, "development"))
        .filter((name) => name.endsWith(".md"))
        .map((name) => `development/${name}`)
    : [];
  return [...top, ...development].sort();
}

/** The day each page of docs/ last changed, from git; empty where git cannot say. */
function changedDays(): Map<string, string> {
  const days = new Map<string, string>();
  try {
    const log = execFileSync("git", ["log", "--format=%x00%cs", "--name-only", "--", "docs"], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    for (const commit of log.split("\0")) {
      const [day = "", ...names] = commit.trim().split("\n");
      for (const name of names) {
        const file = name.trim();
        if (file.startsWith("docs/") && !days.has(file.slice(5))) days.set(file.slice(5), day.trim());
      }
    }
  } catch {
    // No git here: no day is shown rather than a wrong one.
  }
  return days;
}

async function build(): Promise<Built> {
  const load = (file: string) => import(pathToFileURL(path.join(repo, file)).href);
  const { markdownBlocks } = (await load("apps/server/src/modules/documents/markdown-view.ts")) as {
    markdownBlocks(source: string, options: { link?: (url: string, label: Inline[]) => Inline[] | undefined }): Block[];
  };
  const { GUIDES } = (await load("apps/web/src/features/help/guides.ts")) as { GUIDES: GuideEntry[] };
  const { SETUP_GUIDE } = (await load("packages/shared/src/setup-guide.ts")) as { SETUP_GUIDE: { title: string; sections: SetupSection[] } };

  const byFile = new Map(GUIDES.map((guide, index) => [guide.file, { guide, chapter: index + 1 }]));
  const days = changedDays();
  const problems: string[] = [];
  const blocks = new Map<string, Block[]>();
  const index: Built["index"] = {};
  /** For each guide, the ids its headings carry; for an own page, from the page's words to its ids. */
  const anchors = new Map<string, Map<string, string>>();
  /** Links to check once every guide is read: [from, slug, anchor]. */
  const pending: Array<[string, string, string]> = [];

  for (const guide of GUIDES) {
    const source = fs.readFileSync(path.join(docs, guide.file), "utf8");
    const link = (url: string, label: Inline[]): Inline[] | undefined => {
      const [target = "", anchor = ""] = url.split("#");
      if (!target) {
        problems.push(`${guide.file}: "#${anchor}" names no heading on that page`);
        return undefined;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
      const inRepo = path.relative(repo, path.resolve(path.dirname(path.join(docs, guide.file)), decodeURI(target)));
      const asDoc = path.relative(docs, path.join(repo, inRepo)).split(path.sep).join("/");
      const other = byFile.get(asDoc);
      if (other) {
        if (anchor) pending.push([guide.file, other.guide.slug, anchor]);
        return [{ t: "chapter", chapter: other.chapter, ...(anchor ? { anchor } : {}), c: label }];
      }
      if (!inRepo.startsWith("..") && fs.existsSync(path.join(repo, inRepo))) {
        const kind = fs.statSync(path.join(repo, inRepo)).isDirectory() ? "tree" : "blob";
        const href = `https://github.com/tyleruk2000/outpost/${kind}/main/${inRepo.split(path.sep).join("/")}${anchor ? `#${anchor}` : ""}`;
        return [{ t: "link", href, c: label }];
      }
      problems.push(`${guide.file}: "${url}" leads to nothing in the repository`);
      return undefined;
    };
    const parsed = markdownBlocks(source, { link });
    const headings = parsed.filter((block) => block.t === "heading" && block.id);
    const title = guide.own ? SETUP_GUIDE.title : words(headings.find((block) => block.depth === 1)?.c as Inline[]) || guide.slug;
    if (guide.own) {
      // Its page draws the guide from the structured source; the Markdown written from it gives the words of its headings.
      const ids = new Map<string, string>();
      const sections: Section[] = [];
      const walk = (list: SetupSection[], depth: number) => {
        for (const section of list) {
          ids.set(section.title, section.id);
          sections.push([section.id, section.title, depth]);
          walk(section.parts ?? [], depth + 1);
        }
      };
      walk(SETUP_GUIDE.sections, 2);
      const byWords = new Map<string, string>();
      for (const heading of headings) {
        const id = ids.get(words(heading.c as Inline[]));
        if (id) byWords.set(heading.id!, id);
      }
      anchors.set(guide.slug, byWords);
      index[guide.slug] = { title, sections, ...(days.has(guide.file) ? { changed: days.get(guide.file) } : {}) };
    } else {
      anchors.set(guide.slug, new Map(headings.map((heading) => [heading.id!, heading.id!])));
      // The page's own first heading is the screen's title. Under it, "##" is the guide's second level of heading,
      // which the reader draws from depth 1: each heading moves up one, so the page reads h1, h2, h3 as the file does.
      const body = parsed[0]?.t === "heading" && parsed[0].depth === 1 ? parsed.slice(1) : parsed;
      blocks.set(
        guide.slug,
        body.map((block) => (block.t === "heading" ? { ...block, depth: Math.max(1, (block.depth ?? 2) - 1) } : block)),
      );
      index[guide.slug] = {
        title,
        sections: headings
          .filter((heading) => heading.depth === 2 || heading.depth === 3)
          .map((heading) => [heading.id!, words(heading.c as Inline[]), heading.depth!]),
        ...(days.has(guide.file) ? { changed: days.get(guide.file) } : {}),
      };
    }
  }

  for (const [from, slug, anchor] of pending) {
    if (!anchors.get(slug)?.has(anchor)) problems.push(`${from}: no heading "#${anchor}" in the guide ${slug}`);
  }
  // A link to an own page's part carries that page's id for it; elsewhere the id is the heading's.
  for (const list of blocks.values()) {
    const visit = (runs: Inline[] | undefined) => {
      for (const run of runs ?? []) {
        if (run.t === "chapter" && typeof run.anchor === "string") {
          const guide = GUIDES[(run.chapter as number) - 1]!;
          const id = anchors.get(guide.slug)?.get(run.anchor);
          if (id) run.anchor = id;
          else delete run.anchor;
        }
        visit(run.c);
      }
    };
    const walk = (list: Block[]) => {
      for (const block of list) {
        if (block.t === "heading" || block.t === "paragraph") visit(block.c as Inline[]);
        else if (block.t === "quote") walk(block.c as Block[]);
        else if (block.t === "list") for (const item of block.items ?? []) walk(item.c);
        else if (block.t === "table") for (const row of block.rows ?? []) for (const cell of row) visit(cell);
      }
    };
    walk(list);
  }

  return { index, blocks, problems, files: GUIDES.map((guide) => guide.file) };
}

export function guides(): Plugin {
  let built: Promise<Built> | null = null;
  const get = () => {
    built ??= build();
    return built;
  };
  return {
    name: "outpost:guides",
    resolveId(id) {
      if (id === INDEX || id.startsWith(GUIDE)) return `\0${id}`;
      return null;
    },
    async load(id) {
      if (!id.startsWith("\0virtual:outpost-guide")) return null;
      const { index, blocks, problems, files } = await get();
      for (const file of files) this.addWatchFile(path.join(docs, file));
      if (id === `\0${INDEX}`) {
        if (problems.length > 0) this.warn(`Links in docs/ that lead nowhere:\n${problems.join("\n")}`);
        const loaders = [...blocks.keys()].map((slug) => `  ${JSON.stringify(slug)}: () => import(${JSON.stringify(GUIDE + slug)}),`);
        return [
          `export const GUIDE_INDEX = JSON.parse(${JSON.stringify(JSON.stringify(index))});`,
          `export const GUIDE_PROBLEMS = ${JSON.stringify(problems)};`,
          `export const GUIDE_DOCS = ${JSON.stringify(docsPages())};`,
          `export const GUIDE_LOADERS = {\n${loaders.join("\n")}\n};`,
        ].join("\n");
      }
      const slug = id.slice(`\0${GUIDE}`.length);
      const list = blocks.get(slug);
      if (!list) throw new Error(`There is no guide called ${slug}.`);
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(list))});`;
    },
    handleHotUpdate({ file }) {
      if (file.startsWith(docs)) built = null;
    },
  };
}
